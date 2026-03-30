import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";

const sharedModule = await import(
  new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href
);

const { listLeadsForPanel } = sharedModule;

const storedRows = [
  {
    wa_id: "5511111110001",
    lead_pool: "COLD_POOL",
    lead_temp: "COLD",
    lead_source: "manual",
    tags: ["frio"],
    obs_curta: null,
    import_ref: null,
    auto_outreach_enabled: false,
    is_paused: false,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-02T10:00:00.000Z",
  },
  {
    wa_id: "5511111110002",
    lead_pool: "WARM_POOL",
    lead_temp: "WARM",
    lead_source: "import",
    tags: ["morno"],
    obs_curta: "obs teste",
    import_ref: "import-2026-01",
    auto_outreach_enabled: true,
    is_paused: false,
    created_at: "2026-01-01T11:00:00.000Z",
    updated_at: "2026-01-03T10:00:00.000Z",
  },
  {
    wa_id: "5511111110003",
    lead_pool: "HOT_POOL",
    lead_temp: "HOT",
    lead_source: "import",
    tags: ["quente"],
    obs_curta: null,
    import_ref: "import-2026-01",
    auto_outreach_enabled: true,
    is_paused: true,
    created_at: "2026-01-01T12:00:00.000Z",
    updated_at: "2026-01-04T10:00:00.000Z",
  },
];

const fetchCalls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(rawUrl);
  fetchCalls.push({
    url: url.toString(),
    method: String(init.method || "GET").toUpperCase(),
  });

  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/crm_lead_meta"
  ) {
    const method = String(init.method || "GET").toUpperCase();
    if (method === "GET") {
      let rows = storedRows.slice();

      const leadPool = url.searchParams.get("lead_pool");
      if (leadPool?.startsWith("eq.")) {
        const pool = leadPool.slice(3);
        rows = rows.filter((r) => r.lead_pool === pool);
      }

      const leadTemp = url.searchParams.get("lead_temp");
      if (leadTemp?.startsWith("eq.")) {
        const temp = leadTemp.slice(3);
        rows = rows.filter((r) => r.lead_temp === temp);
      }

      const limit = Number(url.searchParams.get("limit") || rows.length);
      rows = rows.slice(0, limit);

      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  if (url.pathname === "/rest/v1/enova_state") {
    throw new Error("listLeadsForPanel must not touch enova_state");
  }

  throw new Error(`Unexpected fetch: ${url.toString()}`);
};

try {
  // Test 1: list all leads (no filter)
  {
    const rows = await listLeadsForPanel("https://supabase.example", "service-role", {});
    assert.equal(rows.length, 3, "should return all 3 rows without filter");
  }

  // Test 2: filter by lead_pool = COLD_POOL
  {
    const rows = await listLeadsForPanel("https://supabase.example", "service-role", {
      lead_pool: "COLD_POOL",
    });
    assert.equal(rows.length, 1, "should return 1 COLD_POOL row");
    assert.equal(rows[0].wa_id, "5511111110001");
    assert.equal(rows[0].lead_pool, "COLD_POOL");
  }

  // Test 3: filter by lead_pool = WARM_POOL
  {
    const rows = await listLeadsForPanel("https://supabase.example", "service-role", {
      lead_pool: "WARM_POOL",
    });
    assert.equal(rows.length, 1, "should return 1 WARM_POOL row");
    assert.equal(rows[0].lead_pool, "WARM_POOL");
  }

  // Test 4: filter by lead_pool = HOT_POOL
  {
    const rows = await listLeadsForPanel("https://supabase.example", "service-role", {
      lead_pool: "HOT_POOL",
    });
    assert.equal(rows.length, 1, "should return 1 HOT_POOL row");
    assert.equal(rows[0].lead_pool, "HOT_POOL");
    assert.equal(rows[0].is_paused, true);
  }

  // Test 5: limit is respected
  {
    const rows = await listLeadsForPanel("https://supabase.example", "service-role", {
      limit: 1,
    });
    assert.equal(rows.length, 1, "should respect limit=1");
  }

  // Test 6: invalid lead_pool is ignored (not a LEAD_POOLS member)
  {
    const rows = await listLeadsForPanel("https://supabase.example", "service-role", {
      lead_pool: "INVALID_POOL",
    });
    // invalid pool is skipped — no filter applied — all 3 rows returned
    assert.equal(rows.length, 3, "invalid lead_pool should be ignored, all rows returned");
  }

  // Test 7: enova_state must never be touched
  assert.equal(
    fetchCalls.some((c) => c.url.includes("/rest/v1/enova_state")),
    false,
    "listLeadsForPanel must not touch enova_state",
  );

  // Test 8: all fetches use SELECT on crm_lead_meta
  const crmCalls = fetchCalls.filter((c) => c.url.includes("/rest/v1/crm_lead_meta"));
  assert.ok(crmCalls.length > 0, "should have made at least one crm_lead_meta call");
  assert.ok(
    crmCalls.every((c) => c.method === "GET"),
    "all crm_lead_meta calls in listLeadsForPanel should be GET",
  );

  console.log("bases_panel.smoke: ok");
} finally {
  globalThis.fetch = originalFetch;
}
