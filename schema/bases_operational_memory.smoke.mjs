/**
 * Smoke tests for bases operational memory (panel-only):
 * - ultima_acao written on call_now, warmup_dispatch, pause, resume, move
 * - ultimo_contato_at written on successful call_now / warmup_dispatch
 * - status_operacional set to AGUARDANDO_RETORNO / PAUSADO / restored on resume
 * - update_obs action: saves obs_curta and optional status_operacional
 * - No regression: list still returns new columns, actions unchanged
 */
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";
process.env.WORKER_BASE_URL = "https://worker.example";
process.env.ENOVA_ADMIN_KEY = "adm-key";

const sharedModule = await import(
  new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href
);

const { runBasesAction, listLeadsForPanel } = sharedModule;

// ─── In-memory Supabase mock ─────────────────────────────────────────────────

const metaRows = new Map([
  [
    "5511111110001",
    {
      wa_id: "5511111110001",
      nome: "Ana",
      telefone: "11111110001",
      lead_pool: "COLD_POOL",
      lead_temp: "COLD",
      lead_source: "manual",
      tags: [],
      obs_curta: null,
      import_ref: null,
      auto_outreach_enabled: true,
      is_paused: false,
      created_at: "2026-01-01T10:00:00.000Z",
      updated_at: "2026-01-01T10:00:00.000Z",
      ultima_acao: null,
      ultimo_contato_at: null,
      status_operacional: null,
    },
  ],
  [
    "5511111110002",
    {
      wa_id: "5511111110002",
      nome: "Bruno",
      telefone: "11111110002",
      lead_pool: "WARM_POOL",
      lead_temp: "WARM",
      lead_source: "import",
      tags: [],
      obs_curta: null,
      import_ref: "ref-01",
      auto_outreach_enabled: true,
      is_paused: false,
      created_at: "2026-01-01T11:00:00.000Z",
      updated_at: "2026-01-01T11:00:00.000Z",
      ultima_acao: null,
      ultimo_contato_at: null,
      status_operacional: null,
    },
  ],
]);
const logRows = [];
const workerCalls = [];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(rawUrl);
  const method = String(init.method || "GET").toUpperCase();

  // ── Worker /__admin__/send ─────────────────────────────────────────────
  if (url.origin === "https://worker.example" && url.pathname === "/__admin__/send") {
    const body = JSON.parse(String(init.body || "{}"));
    workerCalls.push(body);
    return jsonResponse({ ok: true, message_id: "msg-" + body.wa_id }, 200);
  }

  // ── Supabase crm_lead_meta ─────────────────────────────────────────────
  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/crm_lead_meta"
  ) {
    if (method === "GET") {
      let rows = Array.from(metaRows.values());

      const waIdParam = url.searchParams.get("wa_id");
      if (waIdParam?.startsWith("eq.")) {
        rows = rows.filter((r) => r.wa_id === waIdParam.slice(3));
      }
      const leadPool = url.searchParams.get("lead_pool");
      if (leadPool?.startsWith("eq.")) {
        rows = rows.filter((r) => r.lead_pool === leadPool.slice(3));
      }
      const isPaused = url.searchParams.get("is_paused");
      if (isPaused === "eq.false") {
        rows = rows.filter((r) => !r.is_paused);
      }
      const limit = Number(url.searchParams.get("limit") || rows.length);
      rows = rows.slice(0, limit);
      return jsonResponse(rows);
    }

    if (method === "POST") {
      const payload = JSON.parse(String(init.body || "[]"));
      const items = Array.isArray(payload) ? payload : [payload];
      const saved = items.map((row) => {
        const existing = metaRows.get(row.wa_id);
        const next = { ...(existing ?? {}), ...row };
        if (!next.created_at) next.created_at = new Date().toISOString();
        metaRows.set(row.wa_id, next);
        return next;
      });
      return jsonResponse(saved, 201);
    }

    if (method === "PATCH") {
      const waIdParam = url.searchParams.get("wa_id");
      const waId = waIdParam?.startsWith("eq.") ? waIdParam.slice(3) : null;
      if (!waId) return jsonResponse({ error: "no wa_id" }, 400);
      const patch = JSON.parse(String(init.body || "{}"));
      const existing = metaRows.get(waId) ?? {};
      const next = { ...existing, ...patch };
      metaRows.set(waId, next);
      return jsonResponse([next]);
    }
  }

  // ── Supabase enova_log ─────────────────────────────────────────────────
  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/enova_log"
  ) {
    const payload = JSON.parse(String(init.body || "[]"));
    logRows.push(...(Array.isArray(payload) ? payload : [payload]));
    return new Response("", { status: 201 });
  }

  throw new Error(`Unexpected fetch: ${url.toString()}`);
};

// ─── Test: listLeadsForPanel returns new columns ─────────────────────────────

{
  const leads = await listLeadsForPanel("https://supabase.example", "service-role", {});
  assert.ok(leads.length > 0, "leads returned");
  const first = leads[0];
  assert.ok("ultima_acao" in first, "ultima_acao present in listed leads");
  assert.ok("ultimo_contato_at" in first, "ultimo_contato_at present in listed leads");
  assert.ok("status_operacional" in first, "status_operacional present in listed leads");
}

// ─── Test: call_now success sets ultima_acao, ultimo_contato_at, status_operacional ─

{
  workerCalls.length = 0;
  logRows.length = 0;

  const result = await runBasesAction({
    action: "call_now",
    wa_id: "5511111110001",
    text: "Oi Ana, tudo bem?",
  });

  assert.equal(result.status, 200, "call_now → 200");
  assert.equal(result.body.ok, true, "call_now ok");
  assert.equal(workerCalls.length, 1, "worker called once");

  const updated = metaRows.get("5511111110001");
  assert.equal(updated.ultima_acao, "CALL_NOW", "ultima_acao = CALL_NOW");
  assert.ok(updated.ultimo_contato_at !== null, "ultimo_contato_at set");
  assert.equal(updated.status_operacional, "AGUARDANDO_RETORNO", "status_operacional = AGUARDANDO_RETORNO");

  const callLog = logRows.find((r) => r.tag === "bases_call_now");
  assert.ok(callLog, "bases_call_now log present");
}

// ─── Test: pause sets ultima_acao=PAUSE and status_operacional=PAUSADO ────────

{
  logRows.length = 0;

  const result = await runBasesAction({ action: "pause_lead", wa_id: "5511111110001" });
  assert.equal(result.status, 200, "pause_lead → 200");

  const updated = metaRows.get("5511111110001");
  assert.equal(updated.ultima_acao, "PAUSE", "ultima_acao = PAUSE after pause");
  assert.equal(updated.status_operacional, "PAUSADO", "status_operacional = PAUSADO after pause");
  assert.equal(updated.is_paused, true, "is_paused = true");
}

// ─── Test: resume after contact sets status_operacional=AGUARDANDO_RETORNO ────

{
  logRows.length = 0;

  const result = await runBasesAction({ action: "resume_lead", wa_id: "5511111110001" });
  assert.equal(result.status, 200, "resume_lead → 200");

  const updated = metaRows.get("5511111110001");
  assert.equal(updated.ultima_acao, "RESUME", "ultima_acao = RESUME after resume");
  // ultimo_contato_at was set → status should be restored to AGUARDANDO_RETORNO
  assert.equal(updated.status_operacional, "AGUARDANDO_RETORNO", "status_operacional = AGUARDANDO_RETORNO after resume (had contact)");
  assert.equal(updated.is_paused, false, "is_paused = false after resume");
}

// ─── Test: pause + resume without prior contact → status_operacional = null ──

{
  // Lead 5511111110002 has never been contacted (ultimo_contato_at = null)
  logRows.length = 0;

  await runBasesAction({ action: "pause_lead", wa_id: "5511111110002" });
  const paused = metaRows.get("5511111110002");
  assert.equal(paused.status_operacional, "PAUSADO", "Bruno paused → PAUSADO");

  await runBasesAction({ action: "resume_lead", wa_id: "5511111110002" });
  const resumed = metaRows.get("5511111110002");
  assert.equal(resumed.ultima_acao, "RESUME", "Bruno resumed → RESUME");
  // No contact history → status_operacional should be null (SEM_CONTATO)
  assert.equal(resumed.status_operacional, null, "Bruno no contact history → null status after resume");
}

// ─── Test: warmup_dispatch success sets ultima_acao=WARMUP ───────────────────

{
  workerCalls.length = 0;
  logRows.length = 0;

  // Ensure Bruno is not paused
  metaRows.get("5511111110002").is_paused = false;

  const result = await runBasesAction({
    action: "warmup_dispatch",
    wa_ids: ["5511111110002"],
    text: "Oi Bruno, vamos conversar?",
  });

  assert.equal(result.status, 200, "warmup_dispatch → 200");
  assert.equal(result.body.sent_count, 1, "sent_count = 1");

  const updated = metaRows.get("5511111110002");
  assert.equal(updated.ultima_acao, "WARMUP", "ultima_acao = WARMUP after warmup_dispatch");
  assert.ok(updated.ultimo_contato_at !== null, "ultimo_contato_at set after warmup_dispatch");
  assert.equal(updated.status_operacional, "AGUARDANDO_RETORNO", "status_operacional = AGUARDANDO_RETORNO after warmup_dispatch");
}

// ─── Test: move_base sets ultima_acao=MOVE ───────────────────────────────────

{
  logRows.length = 0;

  const result = await runBasesAction({
    action: "move_base",
    wa_id: "5511111110001",
    lead_pool: "HOT_POOL",
    lead_temp: "HOT",
  });

  assert.equal(result.status, 200, "move_base → 200");

  const updated = metaRows.get("5511111110001");
  assert.equal(updated.ultima_acao, "MOVE", "ultima_acao = MOVE after move_base");
  assert.equal(updated.lead_pool, "HOT_POOL", "lead_pool updated");
}

// ─── Test: update_obs saves obs_curta ────────────────────────────────────────

{
  logRows.length = 0;

  const result = await runBasesAction({
    action: "update_obs",
    wa_id: "5511111110001",
    obs_curta: "Ligou ontem, vai ver proposta",
  });

  assert.equal(result.status, 200, "update_obs → 200");
  assert.equal(result.body.ok, true, "update_obs ok");

  const updated = metaRows.get("5511111110001");
  assert.equal(updated.obs_curta, "Ligou ontem, vai ver proposta", "obs_curta saved");

  const obsLog = logRows.find((r) => r.tag === "bases_update_obs");
  assert.ok(obsLog, "bases_update_obs audit log present");
  assert.equal(obsLog.wa_id, "5511111110001");
  assert.equal(obsLog.details.obs_curta, "Ligou ontem, vai ver proposta");
}

// ─── Test: update_obs with status_operacional ─────────────────────────────────

{
  logRows.length = 0;

  const result = await runBasesAction({
    action: "update_obs",
    wa_id: "5511111110001",
    obs_curta: "Aguardando confirmação",
    status_operacional: "AGUARDANDO_RETORNO",
  });

  assert.equal(result.status, 200, "update_obs with status → 200");

  const updated = metaRows.get("5511111110001");
  assert.equal(updated.obs_curta, "Aguardando confirmação", "obs_curta updated");
  assert.equal(updated.status_operacional, "AGUARDANDO_RETORNO", "status_operacional updated to AGUARDANDO_RETORNO");
}

// ─── Test: update_obs rejects invalid status_operacional ─────────────────────

{
  logRows.length = 0;

  const before = { ...metaRows.get("5511111110001") };

  const result = await runBasesAction({
    action: "update_obs",
    wa_id: "5511111110001",
    obs_curta: "Test",
    status_operacional: "INVALID_STATUS",
  });

  assert.equal(result.status, 200, "update_obs with invalid status still succeeds");
  const updated = metaRows.get("5511111110001");
  // status_operacional should NOT be changed to invalid value
  assert.equal(updated.status_operacional, before.status_operacional, "invalid status_operacional ignored");
}

// ─── Test: update_obs missing wa_id → 400 ────────────────────────────────────

{
  const result = await runBasesAction({
    action: "update_obs",
    obs_curta: "some note",
  });
  assert.equal(result.status, 400, "update_obs without wa_id → 400");
  assert.equal(result.body.ok, false);
}

// ─── Test: call_now on non-existent lead still blocks ────────────────────────

{
  const result = await runBasesAction({
    action: "call_now",
    wa_id: "5599999999999",
    text: "Oi",
  });
  assert.equal(result.status, 409, "call_now on unknown lead → 409 LEAD_NOT_FOUND");
}

console.log("bases_operational_memory.smoke: ok");
