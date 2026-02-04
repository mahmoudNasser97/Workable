export default {
  async fetch(request, env) {
    // ======================
    // CORS preflight
    // ======================
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {

      // ======================
      // DEBUG – ENV CHECK
      // ======================
      if (path === "/debug/env") {
        return json({
          WORKABLE_TOKEN_EXISTS: !!env.WORKABLE_TOKEN,
          WORKABLE_TOKEN_LENGTH: env.WORKABLE_TOKEN?.length || 0,
          WORKABLE_SUBDOMAIN: env.WORKABLE_SUBDOMAIN || null,
          CF_WORKER: true
        });
      }

      // ======================
      // DEBUG – TEST AUTH
      // ======================
      if (path === "/debug/auth") {
        const res = await fetch(
          `https://${env.WORKABLE_SUBDOMAIN}.workable.com/spi/v3/jobs?limit=1`,
          {
            headers: {
              Authorization: `Bearer ${env.WORKABLE_TOKEN}`
            }
          }
        );

        const text = await res.text();

        return json({
          status: res.status,
          ok: res.ok,
          response: safeJson(text)
        });
      }

      // ======================
      // GET /jobs
      // ======================
      if (path === "/jobs" && request.method === "GET") {
        const state = url.searchParams.get("state") || "open";
        const result = await fetchAllJobs(env, state);
        return json(result);
      }

      // ======================
      // POST /add-candidate
      // ======================
      if (path === "/add-candidate" && request.method === "POST") {
        const body = await request.json();
        const result = await addCandidate(env, body);
        return json({ success: true, result });
      }

      return json({ error: "Not found" }, 404);

    } catch (err) {
      return json({
        error: err.message,
        stack: err.stack || null
      }, 500);
    }
  }
};

/* =========================
   Helpers
========================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/* =========================
   Workable API – JOBS
========================= */

async function fetchAllJobs(env, state) {
  let page = 1;
  let jobs = [];
  let hasMore = true;

  while (hasMore) {
    let apiUrl = `https://${env.WORKABLE_SUBDOMAIN}.workable.com/spi/v3/jobs?limit=50&page=${page}`;
    if (state !== "all") apiUrl += `&state=${state}`;

    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${env.WORKABLE_TOKEN}`
      }
    });

    const text = await res.text();
    const data = safeJson(text);

    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    jobs.push(...(data.jobs || []));
    hasMore = data.paging?.next !== null;
    page++;
  }

  return {
    total: jobs.length,
    state,
    jobs
  };
}

/* =========================
   Workable API – ADD CANDIDATE
========================= */

async function addCandidate(env, body) {
  const {
    firstName,
    lastName,
    email,
    linkedin_url,
    tag,
    jobId
  } = body;

  if (!jobId) throw new Error("Missing jobId");
  if (!email) throw new Error("Missing email");

  const res = await fetch(
    `https://${env.WORKABLE_SUBDOMAIN}.workable.com/spi/v3/jobs/${jobId}/candidates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WORKABLE_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        candidate: {
          firstname: firstName || "",
          lastname: lastName || "",
          email,
          linkedin_url,
          tags: tag ? [tag] : []
        }
      })
    }
  );

  const text = await res.text();
  const data = safeJson(text);

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}