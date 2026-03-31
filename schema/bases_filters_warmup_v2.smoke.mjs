/**
 * Smoke tests for bases operational filters + warmup result summary (v2).
 *
 * Tests:
 * - Client-side filter logic (search by name/phone, status, origin, tag)
 * - warmup_dispatch result summary fields (sent_count, total, results)
 * - warmup_base with no eligible leads
 * - warmup_dispatch full success
 * - warmup_dispatch partial failure
 */
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";
process.env.WORKER_BASE_URL = "https://worker.example";
process.env.ENOVA_ADMIN_KEY = "adm-key";

const sharedModule = await import(
  new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href
);
const { runBasesAction, buildWarmupSelection } = sharedModule;

// ─── Mock data ────────────────────────────────────────────────────────────────

const metaRows = new Map();
const logRows = [];
const workerResults = [];

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

globalThis.fetch = async (input, init = {}) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(rawUrl);
  const method = String(init.method || "GET").toUpperCase();

  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/crm_lead_meta"
  ) {
    if (method === "GET") {
      let rows = Array.from(metaRows.values());
      const waId = parseEq(url.searchParams.get("wa_id"));
      const leadPool = parseEq(url.searchParams.get("lead_pool"));
      const isPaused = parseEq(url.searchParams.get("is_paused"));
      const limit = Number(url.searchParams.get("limit") || rows.length);
      if (waId) rows = rows.filter((r) => r.wa_id === waId);
      if (leadPool) rows = rows.filter((r) => r.lead_pool === leadPool);
      if (isPaused !== null) rows = rows.filter((r) => String(r.is_paused) === isPaused);
      rows = rows.slice(0, limit);
      return jsonResponse(rows);
    }
    if (method === "POST") {
      const body = JSON.parse(init.body);
      const saved = Array.isArray(body)
        ? body.map((r) => ({ ...r, created_at: r.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }))
        : [body];
      for (const r of saved) metaRows.set(r.wa_id, { ...metaRows.get(r.wa_id), ...r });
      return jsonResponse(saved);
    }
    if (method === "PATCH") {
      const waId = parseEq(url.searchParams.get("wa_id"));
      const body = JSON.parse(init.body);
      const existing = metaRows.get(waId) ?? {};
      const updated = { ...existing, ...body };
      metaRows.set(waId, updated);
      return jsonResponse([updated]);
    }
  }

  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/enova_log"
  ) {
    const body = JSON.parse(init.body);
    logRows.push(...(Array.isArray(body) ? body : [body]));
    return jsonResponse([]);
  }

  if (
    url.origin === "https://worker.example" &&
    url.pathname === "/__admin__/send"
  ) {
    const next = workerResults.shift();
    if (next) {
      return new Response(JSON.stringify(next.body), { status: next.status });
    }
    return jsonResponse({ ok: true, message_id: "msg-ok" });
  }

  return new Response("not-found", { status: 404 });
};

// ─── Helper: seed leads ───────────────────────────────────────────────────────

function seedLead(overrides = {}) {
  const wa_id = overrides.wa_id ?? `55119999${String(metaRows.size).padStart(4, "0")}`;
  const row = {
    wa_id,
    nome: null,
    telefone: null,
    lead_pool: "COLD_POOL",
    lead_temp: "COLD",
    lead_source: null,
    tags: [],
    obs_curta: null,
    import_ref: null,
    auto_outreach_enabled: true,
    is_paused: false,
    created_at: new Date().toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    ...overrides,
  };
  metaRows.set(wa_id, row);
  return row;
}

// ─── Test 1: client-side filter — search by name ──────────────────────────────
{
  metaRows.clear();
  const leads = [
    seedLead({ nome: "Maria Silva", telefone: "11999990001", lead_source: "indicacao", tags: ["vip"] }),
    seedLead({ nome: "João Almeida", telefone: "11999990002", lead_source: "manual", tags: ["novo"] }),
    seedLead({ nome: null, telefone: "11999990003", lead_source: "import" }),
  ];

  // Search by name (case-insensitive)
  const q = "maria";
  const filtered = leads.filter((l) => {
    const nameMatch = l.nome?.toLowerCase().includes(q) ?? false;
    const phoneMatch = (l.telefone ?? l.wa_id).toLowerCase().includes(q);
    return nameMatch || phoneMatch;
  });
  assert.equal(filtered.length, 1, "name search: only Maria matches");
  assert.equal(filtered[0].nome, "Maria Silva");
}

// ─── Test 2: client-side filter — search by phone ────────────────────────────
{
  metaRows.clear();
  const leads = [
    seedLead({ nome: "Ana", telefone: "11999990001" }),
    seedLead({ nome: "Carlos", telefone: "11988880002" }),
  ];

  const q = "9999";
  const filtered = leads.filter((l) => {
    const nameMatch = l.nome?.toLowerCase().includes(q) ?? false;
    const phoneMatch = (l.telefone ?? l.wa_id).toLowerCase().includes(q);
    return nameMatch || phoneMatch;
  });
  assert.equal(filtered.length, 1, "phone search: only 11999990001 matches");
  assert.equal(filtered[0].nome, "Ana");
}

// ─── Test 3: client-side filter — status (active/paused) ─────────────────────
{
  metaRows.clear();
  const leads = [
    seedLead({ is_paused: false }),
    seedLead({ is_paused: true }),
    seedLead({ is_paused: false }),
  ];

  const activeOnly = leads.filter((l) => !l.is_paused);
  assert.equal(activeOnly.length, 2, "active filter: 2 active leads");

  const pausedOnly = leads.filter((l) => l.is_paused);
  assert.equal(pausedOnly.length, 1, "paused filter: 1 paused lead");

  const all = leads.filter(() => true);
  assert.equal(all.length, 3, "all filter: 3 total leads");
}

// ─── Test 4: client-side filter — origin ─────────────────────────────────────
{
  metaRows.clear();
  const leads = [
    seedLead({ lead_source: "indicacao" }),
    seedLead({ lead_source: "manual" }),
    seedLead({ lead_source: null }),
  ];

  const byOrigin = leads.filter((l) => l.lead_source === "indicacao");
  assert.equal(byOrigin.length, 1, "origin filter: 1 from indicacao");

  // Null source doesn't crash
  const nullSafe = leads.filter((l) => l.lead_source !== "manual");
  assert.equal(nullSafe.length, 2, "origin filter: null source handled safely");
}

// ─── Test 5: client-side filter — tags ───────────────────────────────────────
{
  metaRows.clear();
  const leads = [
    seedLead({ tags: ["vip", "hot"] }),
    seedLead({ tags: ["novo"] }),
    seedLead({ tags: [] }),
  ];

  const vipOnly = leads.filter((l) => (l.tags ?? []).includes("vip"));
  assert.equal(vipOnly.length, 1, "tag filter: 1 vip lead");

  // Empty tags array is safe
  const emptyTagsFilter = leads.filter((l) => (l.tags ?? []).includes("inexistente"));
  assert.equal(emptyTagsFilter.length, 0, "tag filter: no leads with inexistente tag");
}

// ─── Test 6: allOrigins / allTags derived from leads ─────────────────────────
{
  const leadsForDerived = [
    { nome: "A", lead_source: "manual", tags: ["vip", "novo"] },
    { nome: "B", lead_source: "indicacao", tags: ["novo"] },
    { nome: "C", lead_source: null, tags: [] },
    { nome: "D", lead_source: "manual", tags: ["vip"] },
  ];

  const originsSet = new Set();
  for (const l of leadsForDerived) {
    if (l.lead_source) originsSet.add(l.lead_source);
  }
  const origins = Array.from(originsSet).sort();
  assert.deepEqual(origins, ["indicacao", "manual"], "allOrigins: deduped and sorted");

  const tagsSet = new Set();
  for (const l of leadsForDerived) {
    for (const t of l.tags) tagsSet.add(t);
  }
  const tags = Array.from(tagsSet).sort();
  assert.deepEqual(tags, ["novo", "vip"], "allTags: deduped and sorted");
}

// ─── Test 7: warmup_base — no eligible leads ─────────────────────────────────
{
  metaRows.clear();
  seedLead({ is_paused: true, lead_pool: "COLD_POOL" });
  seedLead({ is_paused: true, lead_pool: "COLD_POOL" });

  const result = await runBasesAction({ action: "warmup_base", lead_pool: "COLD_POOL", limit: 10 });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.selected_count, 0, "warmup_base: 0 selected when all paused");
  assert.deepEqual(result.body.leads, [], "warmup_base: empty leads array");
}

// ─── Test 8: warmup_dispatch — full success ───────────────────────────────────
{
  metaRows.clear();
  const l1 = seedLead({ lead_pool: "COLD_POOL" });
  const l2 = seedLead({ lead_pool: "COLD_POOL" });

  // Worker will succeed for both
  workerResults.push(
    { status: 200, body: { ok: true, message_id: "msg-1" } },
    { status: 200, body: { ok: true, message_id: "msg-2" } },
  );

  const result = await runBasesAction({
    action: "warmup_dispatch",
    wa_ids: [l1.wa_id, l2.wa_id],
    text: "Olá, tudo bem?",
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.sent_count, 2, "full success: sent_count = 2");
  assert.equal(result.body.total, 2, "full success: total = 2");

  // Warmup summary: failed = total - sent = 0
  const sentCount = result.body.sent_count;
  const total = result.body.total;
  assert.equal(total - sentCount, 0, "full success: failed = 0");
}

// ─── Test 9: warmup_dispatch — partial failure ────────────────────────────────
{
  metaRows.clear();
  const l1 = seedLead({ lead_pool: "WARM_POOL" });
  const l2 = seedLead({ lead_pool: "WARM_POOL" });
  const l3 = seedLead({ lead_pool: "WARM_POOL" });

  // 2 succeed, 1 fails
  workerResults.push(
    { status: 200, body: { ok: true, message_id: "msg-a" } },
    { status: 500, body: { ok: false, error: "SEND_FAILED" } },
    { status: 200, body: { ok: true, message_id: "msg-c" } },
  );

  const result = await runBasesAction({
    action: "warmup_dispatch",
    wa_ids: [l1.wa_id, l2.wa_id, l3.wa_id],
    text: "Mensagem de teste",
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.sent_count, 2, "partial: sent_count = 2");
  assert.equal(result.body.total, 3, "partial: total = 3");

  const failed = result.body.total - result.body.sent_count;
  assert.equal(failed, 1, "partial: failed = 1");
}

// ─── Test 10: warmupStateLabel logic ─────────────────────────────────────────
{
  function warmupStateLabel(summary) {
    if (summary.selected === 0) return { label: "Nenhuma elegibilidade", color: "#f6a03d" };
    if (summary.sent === 0) return { label: "Falha total", color: "#f66" };
    if (summary.failed === 0) return { label: "Sucesso total", color: "#5ce89c" };
    return { label: "Sucesso parcial", color: "#f6a03d" };
  }

  assert.equal(warmupStateLabel({ selected: 0, sent: 0, failed: 0 }).label, "Nenhuma elegibilidade");
  assert.equal(warmupStateLabel({ selected: 5, sent: 0, failed: 5 }).label, "Falha total");
  assert.equal(warmupStateLabel({ selected: 5, sent: 5, failed: 0 }).label, "Sucesso total");
  assert.equal(warmupStateLabel({ selected: 5, sent: 3, failed: 2 }).label, "Sucesso parcial");
}

console.log("bases_filters_warmup_v2.smoke: ok");
