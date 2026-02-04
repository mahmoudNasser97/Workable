export default {
  async fetch(request, env) {
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
      // DEBUG – AUTH TEST
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

        return json({
          status: res.status,
          ok: res.ok,
          response: safeJson(await res.text())
        });
      }

      // ======================
      // GET /jobs (PUBLISHED ONLY + CURSOR PAGINATION)
      // ======================
      if (path === "/jobs" && request.method === "GET") {
        // map open -> published (for convenience)
        let state = (url.searchParams.get("state") || "published").toLowerCase();
        if (state === "open") state = "published";

        const limit = Number(url.searchParams.get("limit") || 50);

        // cursor-based paging:
        // - your extension sends page=1,2.. but workable uses cursor
        // We'll translate: page=1 => first page
        // page>1 => walk next links internally (safe for small pages)
        const page = Math.max(1, Number(url.searchParams.get("page") || 1));

        const result = await fetchJobsPageCursor(env, state, page, limit);
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
  try { return JSON.parse(text); }
  catch { return text; }
}

/* =========================
   Workable – JOBS (CURSOR BASED)
   Supports: state=published (open roles)
========================= */

async function fetchJobsPageCursor(env, state, page, limit) {
  // Build first URL
  const base =
    `https://${env.WORKABLE_SUBDOMAIN}.workable.com/spi/v3/jobs?limit=${limit}` +
    (state && state !== "all" ? `&state=${encodeURIComponent(state)}` : "");

  // Workable uses paging.next URL as cursor.
  // If caller asks for page>1, we "advance" by following paging.next N-1 times.
  let apiUrl = base;
  let data = null;

  for (let i = 1; i <= page; i++) {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${env.WORKABLE_TOKEN}` }
    });

    const text = await res.text();
    data = safeJson(text);

    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    if (i < page) {
      const next = data?.paging?.next;
      if (!next) {
        // no more pages
        return {
          page,
          limit,
          hasMore: false,
          jobs: []
        };
      }
      apiUrl = next;
    }
  }

  const nextUrl = data?.paging?.next || null;

  return {
    page,
    limit,
    hasMore: !!nextUrl,
    next: nextUrl, // optional: helpful if you later switch extension to cursor paging
    jobs: data?.jobs || []
  };
}

/* =========================
   Workable – ADD CANDIDATE
========================= */

async function addCandidate(env, body) {
  // Accept both for backward compatibility:
  // - new: jobShortcode
  // - old: jobId
  const {
    firstName,
    lastName,
    email,
    linkedin_url,
    tag,
    jobShortcode,
    jobId
  } = body;

  const job = jobShortcode || jobId;

  if (!job) throw new Error("Missing jobShortcode/jobId");
  if (!email) throw new Error("Missing email");

  const payload = {
    candidate: {
      firstname: (firstName || "").trim(),
      lastname: (lastName || "").trim(),
      email: email.trim(),
      // Keep linkedin_url if your Workable accepts it.
      // Many accounts prefer social_profiles instead; we provide both safely.
      linkedin_url: linkedin_url ? linkedin_url.trim() : undefined,
      social_profiles: linkedin_url
        ? [{ type: "linkedin", url: linkedin_url.trim() }]
        : undefined,
      tags: tag ? [tag] : []
    }
  };

  // Remove undefined fields to keep payload clean
  cleanupUndefined(payload.candidate);

  const res = await fetch(
    `https://${env.WORKABLE_SUBDOMAIN}.workable.com/spi/v3/jobs/${encodeURIComponent(job)}/candidates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WORKABLE_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = safeJson(await res.text());

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

function cleanupUndefined(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === "") {
      // keep empty firstname/lastname? (Workable tolerates, but we can remove empties too)
      if (k === "firstname" || k === "lastname") continue;
      delete obj[k];
    }
  }
}