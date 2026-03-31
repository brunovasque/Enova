import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";
process.env.WORKER_BASE_URL = "https://worker.example";
process.env.ENOVA_ADMIN_KEY = "adm-key";

const sharedModule = await import(new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href);

const { runBasesAction, buildWarmupSelection, assessCallNowEligibility } = sharedModule;

const metaRows = new Map();
const logRows = [];
const workerCalls = [];
const fetchCalls = [];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseEq(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("eq.")) return value;
  return value.slice(3);
}

function sortRows(rows, orderValue) {
  if (!orderValue) return rows;
  const segments = String(orderValue)
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return rows.slice().sort((left, right) => {
    for (const segment of segments) {
      const [field, direction = "asc"] = segment.split(".");
      const leftValue = left[field] ?? null;
      const rightValue = right[field] ?? null;

      if (leftValue === rightValue) continue;
      if (leftValue == null) return direction === "desc" ? 1 : -1;
      if (rightValue == null) return direction === "desc" ? -1 : 1;
      if (leftValue < rightValue) return direction === "desc" ? 1 : -1;
      if (leftValue > rightValue) return direction === "desc" ? -1 : 1;
    }
    return 0;
  });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(rawUrl);
  fetchCalls.push({ url: url.toString(), method: String(init.method || "GET").toUpperCase() });

  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_lead_meta") {
    const method = String(init.method || "GET").toUpperCase();

    if (method === "GET") {
      let rows = Array.from(metaRows.values());
      const waId = parseEq(url.searchParams.get("wa_id"));
      const leadPool = parseEq(url.searchParams.get("lead_pool"));
      const leadTemp = parseEq(url.searchParams.get("lead_temp"));
      const autoOutreach = parseEq(url.searchParams.get("auto_outreach_enabled"));
      const isPaused = parseEq(url.searchParams.get("is_paused"));
      const limit = Number(url.searchParams.get("limit") || rows.length);

      if (waId) rows = rows.filter((row) => row.wa_id === waId);
      if (leadPool) rows = rows.filter((row) => row.lead_pool === leadPool);
      if (leadTemp) rows = rows.filter((row) => row.lead_temp === leadTemp);
      if (autoOutreach) rows = rows.filter((row) => String(row.auto_outreach_enabled) === autoOutreach);
      if (isPaused) rows = rows.filter((row) => String(row.is_paused) === isPaused);

      rows = sortRows(rows, url.searchParams.get("order")).slice(0, limit);
      return jsonResponse(rows, 200);
    }

    if (method === "POST") {
      const payload = JSON.parse(String(init.body || "[]"));
      const rows = Array.isArray(payload) ? payload : [payload];
      const saved = rows.map((row, index) => {
        const existing = metaRows.get(row.wa_id) || null;
        const createdAt = existing?.created_at || `2026-03-30T19:30:${String(index).padStart(2, "0")}.000Z`;
        const next = {
          wa_id: row.wa_id,
          lead_pool: row.lead_pool,
          lead_temp: row.lead_temp,
          lead_source: row.lead_source ?? null,
          tags: Array.isArray(row.tags) ? row.tags : [],
          obs_curta: row.obs_curta ?? null,
          import_ref: row.import_ref ?? null,
          auto_outreach_enabled: Boolean(row.auto_outreach_enabled),
          is_paused: Boolean(row.is_paused),
          created_at: createdAt,
          updated_at: row.updated_at ?? existing?.updated_at ?? createdAt,
        };
        metaRows.set(next.wa_id, next);
        return next;
      });
      return jsonResponse(saved, 201);
    }

    if (method === "PATCH") {
      const waId = parseEq(url.searchParams.get("wa_id"));
      const existing = waId ? metaRows.get(waId) : null;
      if (!existing) {
        return jsonResponse([], 200);
      }
      const patch = JSON.parse(String(init.body || "{}"));
      const next = { ...existing, ...patch };
      metaRows.set(waId, next);
      return jsonResponse([next], 200);
    }
  }

  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/enova_log") {
    const payload = JSON.parse(String(init.body || "[]"));
    const rows = Array.isArray(payload) ? payload : [payload];
    logRows.push(...rows);
    return new Response("", { status: 201 });
  }

  if (url.origin === "https://worker.example" && url.pathname === "/__admin__/send") {
    const payload = JSON.parse(String(init.body || "{}"));
    workerCalls.push(payload);
    return jsonResponse(
      {
        ok: true,
        meta_status: 200,
        message_id: `wamid.mock.${workerCalls.length}`,
      },
      200,
    );
  }

  if (url.pathname === "/rest/v1/enova_state") {
    throw new Error("crm_lead_meta flow must not touch enova_state");
  }

  throw new Error(`Unexpected fetch: ${url.toString()}`);
};

try {
  {
    const { status, body: data } = await runBasesAction({
      action: "add_lead_manual",
      wa_id: "5511999990001",
      lead_pool: "COLD_POOL",
      tags: ["manual", "frio"],
      obs_curta: "lead manual",
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(metaRows.get("5511999990001")?.lead_temp, "COLD");
    // manual add must enter with auto_outreach_enabled=true (no lock)
    assert.equal(metaRows.get("5511999990001")?.auto_outreach_enabled, true);
    assert.equal(workerCalls.length, 0);
  }

  {
    const { status, body: data } = await runBasesAction({
      action: "import_base",
      import_ref: "import-2026-03-30",
      leads: [
        {
          wa_id: "5511999990002",
          lead_pool: "COLD_POOL",
          tags: ["importado"],
        },
        {
          wa_id: "5511999990003",
          lead_pool: "HOT_POOL",
          lead_temp: "HOT",
        },
      ],
    });
    assert.equal(status, 200);
    assert.equal(data.imported_count, 2);
    assert.equal(workerCalls.length, 0);
    assert.equal(metaRows.get("5511999990002")?.import_ref, "import-2026-03-30");
    // imported leads must enter with auto_outreach_enabled=true (no lock)
    assert.equal(metaRows.get("5511999990002")?.auto_outreach_enabled, true);
    assert.equal(metaRows.get("5511999990003")?.auto_outreach_enabled, true);
  }

  {
    const { status, body: data } = await runBasesAction({
      action: "move_base",
      wa_id: "5511999990001",
      lead_pool: "WARM_POOL",
    });
    assert.equal(status, 200);
    assert.equal(data.lead.lead_pool, "WARM_POOL");
    assert.equal(data.lead.lead_temp, "WARM");
    assert.equal(workerCalls.length, 0);
  }

  {
    const { status, body: data } = await runBasesAction({
      action: "pause_lead",
      wa_id: "5511999990001",
    });
    assert.equal(status, 200);
    assert.equal(data.lead.is_paused, true);
    assert.equal(workerCalls.length, 0);
    assert.deepEqual(assessCallNowEligibility(metaRows.get("5511999990001")), {
      ok: false,
      reason: "LEAD_PAUSED",
    });
  }

  {
    const { status, body: data } = await runBasesAction({
      action: "call_now",
      wa_id: "5511999990001",
      text: "oi agora",
    });
    assert.equal(status, 409);
    assert.equal(data.error, "LEAD_PAUSED");
    assert.equal(workerCalls.length, 0);
  }

  {
    const { status, body: data } = await runBasesAction({
      action: "resume_lead",
      wa_id: "5511999990001",
    });
    assert.equal(status, 200);
    assert.equal(data.lead.is_paused, false);
  }

  {
    const { status, body: data } = await runBasesAction({
      action: "call_now",
      wa_id: "5511999990001",
      text: "oi agora",
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(workerCalls.length, 1);
    assert.deepEqual(workerCalls[0], {
      wa_id: "5511999990001",
      text: "oi agora",
    });
  }

  {
    const { status, body: data } = await runBasesAction({
      action: "warmup_base",
      lead_pool: "COLD_POOL",
      limit: 5,
    });
    assert.equal(status, 200);
    assert.equal(data.dispatch_mode, "selection_only");
    assert.equal(data.selected_count, 1);
    assert.equal(data.leads[0].wa_id, "5511999990002");
    assert.equal(workerCalls.length, 1);
    // warmup must not filter by auto_outreach_enabled — control is is_paused only
    assert.equal(
      fetchCalls.some((c) => c.url.includes("auto_outreach_enabled=eq.")),
      false,
      "warmup must not filter by auto_outreach_enabled",
    );
  }

  const helperSelection = buildWarmupSelection(Array.from(metaRows.values()), {
    lead_pool: "COLD_POOL",
    limit: 10,
  });
  assert.equal(helperSelection.length, 1);
  assert.equal(helperSelection[0].wa_id, "5511999990002");

  assert.equal(
    fetchCalls.some((call) => call.url.includes("/rest/v1/enova_state")),
    false,
    "Bases backend must stay isolated from enova_state",
  );

  const tags = logRows.map((row) => row.tag);
  assert.ok(tags.includes("bases_add_lead_manual"));
  assert.ok(tags.includes("bases_import"));
  assert.ok(tags.includes("bases_move"));
  assert.ok(tags.includes("bases_pause"));
  assert.ok(tags.includes("bases_resume"));
  assert.ok(tags.includes("bases_call_now"));
  assert.ok(tags.includes("bases_warmup"));

  console.log("bases_backend_v0.smoke: ok");
} finally {
  globalThis.fetch = originalFetch;
}
