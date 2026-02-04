export default {
  async fetch(request, env) {
    // ---- CORS ----
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ===============================
      // GET /jobs?state=open|archived|all
      // ===============================
      if (path === "/jobs") {
        const state = url.searchParams.get("state") || "open";
        const result = await fetchAllJobs(env, state);
        return json(result);
      }

      // ===============================
      // Health check
      // ===============================
      if (path === "/") {
        return json({ status: "ok", service: "workable-proxy" });
      }

      return json({ error: "Not found" }, 404);

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

/* ===============================
   Helpers
================================ */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

/* ===============================
   Workable API Logic
================================ */

async function fetchAllJobs(env, state) {
  let page = 1;
  let jobs = [];
  let hasMore = true;

  while (hasMore) {
    let url = `https://${env.WORKABLE_SUBDOMAIN}.workable.com/spi/v3/jobs?limit=50&page=${page}`;

    // filter by state
    if (state !== "all") {
      url += `&state=${state}`;
    }

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${env.WORKABLE_TOKEN}`
      }
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(error);
    }

    const data = await res.json();

    jobs.push(...data.jobs);

    hasMore = data.paging?.next !== null;
    page++;
  }

  return {
    total: jobs.length,
    state,
    jobs
  };
  if (path === "/debug") {
  return json({
    tokenExists: !!env.WORKABLE_TOKEN,
    tokenLength: env.WORKABLE_TOKEN?.length,
    subdomain: env.WORKABLE_SUBDOMAIN
  });
}