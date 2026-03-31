import assert from "node:assert/strict";

// ============================================================
// Smoke tests — Mini-CRM Operacional Backend
// Valida: actions, enums, override log, view list, isolation
// ============================================================

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";

const sharedModule = await import(new URL("../panel/app/api/crm/_shared.ts", import.meta.url).href);

const { runCrmAction, listCrmLeads } = sharedModule;

const metaRows = new Map();
const overrideLogs = [];
const viewRows = [];
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

// Seed a base lead in metaRows for testing
function seedLead(waId, extra = {}) {
  const base = {
    wa_id: waId,
    nome: "Lead " + waId,
    telefone: waId,
    lead_pool: "HOT_POOL",
    lead_temp: "HOT",
    lead_source: "manual",
    tags: [],
    obs_curta: null,
    import_ref: null,
    auto_outreach_enabled: true,
    is_paused: false,
    created_at: "2026-03-30T10:00:00.000Z",
    updated_at: "2026-03-30T10:00:00.000Z",
    ultima_acao: null,
    ultimo_contato_at: null,
    status_operacional: null,
    // CRM operational fields (all null by default)
    analysis_status: null,
    analysis_reason_code: null,
    analysis_reason_text: null,
    analysis_last_sent_at: null,
    analysis_last_return_at: null,
    analysis_partner_name: null,
    analysis_adjustment_note: null,
    approved_purchase_band: null,
    approved_target_match: null,
    approved_next_step: null,
    approved_last_contact_at: null,
    rejection_reason_code: null,
    rejection_reason_label: null,
    recovery_status: null,
    recovery_strategy_code: null,
    recovery_note_short: null,
    next_retry_at: null,
    last_retry_contact_at: null,
    visit_status: null,
    visit_context: null,
    visit_date: null,
    visit_confirmed_at: null,
    visit_result: null,
    visit_objection_code: null,
    visit_next_step: null,
    visit_owner: null,
    visit_notes_short: null,
    reserve_status: null,
    reserve_stage_detail: null,
    reserve_risk_level: null,
    reserve_next_action_label: null,
    reserve_next_action_due_at: null,
    reserve_last_movement_at: null,
    vgv_value: null,
    commission_value: null,
    commission_status: null,
    financial_status: null,
    financial_note_short: null,
    financial_last_update_at: null,
    ...extra,
  };
  metaRows.set(waId, base);
  return base;
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

  // crm_lead_meta PATCH
  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_lead_meta") {
    const method = String(init.method || "GET").toUpperCase();

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

    if (method === "GET") {
      let rows = Array.from(metaRows.values());
      const waId = parseEq(url.searchParams.get("wa_id"));
      if (waId) rows = rows.filter((r) => r.wa_id === waId);
      const limit = Number(url.searchParams.get("limit") || rows.length);
      return jsonResponse(rows.slice(0, limit), 200);
    }
  }

  // crm_override_log POST
  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_override_log") {
    const payload = JSON.parse(String(init.body || "{}"));
    overrideLogs.push(payload);
    return new Response("", { status: 201 });
  }

  // crm_leads_v1 GET (view mock)
  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_leads_v1") {
    // Simulate the view by returning meta rows with PT-BR aliases
    let rows = Array.from(metaRows.values()).map((m) => ({
      wa_id: m.wa_id,
      nome: m.nome,
      telefone: m.telefone,
      lead_pool: m.lead_pool,
      lead_temp: m.lead_temp,
      origem: m.lead_source,
      fase_funil: null,
      status_funil: null,
      status_docs_funil: null,
      aprovado_funil: null,
      reprovado_funil: null,
      visita_confirmada_funil: null,
      visita_agendada_funil: null,
      status_analise: m.analysis_status,
      codigo_motivo_analise: m.analysis_reason_code,
      motivo_analise: m.analysis_reason_text,
      data_envio_analise: m.analysis_last_sent_at,
      data_retorno_analise: m.analysis_last_return_at,
      parceiro_analise: m.analysis_partner_name,
      nota_ajuste_analise: m.analysis_adjustment_note,
      faixa_aprovacao: m.approved_purchase_band,
      aderencia_aprovacao: m.approved_target_match,
      proximo_passo_aprovado: m.approved_next_step,
      ultimo_contato_aprovado: m.approved_last_contact_at,
      codigo_motivo_reprovacao: m.rejection_reason_code,
      motivo_reprovacao: m.rejection_reason_label,
      status_recuperacao: m.recovery_status,
      estrategia_recuperacao: m.recovery_strategy_code,
      nota_recuperacao: m.recovery_note_short,
      proxima_tentativa: m.next_retry_at,
      ultimo_contato_recuperacao: m.last_retry_contact_at,
      status_visita: m.visit_status,
      contexto_visita: m.visit_context,
      data_visita: m.visit_date,
      data_confirmacao_visita: m.visit_confirmed_at,
      resultado_visita: m.visit_result,
      codigo_objecao_visita: m.visit_objection_code,
      proximo_passo_visita: m.visit_next_step,
      responsavel_visita: m.visit_owner,
      observacao_visita: m.visit_notes_short,
      status_reserva: m.reserve_status,
      detalhe_etapa_reserva: m.reserve_stage_detail,
      nivel_risco_reserva: m.reserve_risk_level,
      proxima_acao_reserva: m.reserve_next_action_label,
      prazo_proxima_acao_reserva: m.reserve_next_action_due_at,
      ultimo_movimento_reserva: m.reserve_last_movement_at,
      valor_vgv: m.vgv_value,
      valor_comissao: m.commission_value,
      status_comissao: m.commission_status,
      status_financeiro: m.financial_status,
      nota_financeiro: m.financial_note_short,
      ultima_atualizacao_financeiro: m.financial_last_update_at,
      criado_em: m.created_at,
      atualizado_em: m.updated_at,
    }));

    // Tab filters
    const statusAnalise = url.searchParams.get("status_analise");
    if (statusAnalise === "not.is.null") rows = rows.filter((r) => r.status_analise != null);
    const faixaAprovacao = url.searchParams.get("faixa_aprovacao");
    if (faixaAprovacao === "not.is.null") rows = rows.filter((r) => r.faixa_aprovacao != null);
    const codigoReprovacao = url.searchParams.get("codigo_motivo_reprovacao");
    if (codigoReprovacao === "not.is.null") rows = rows.filter((r) => r.codigo_motivo_reprovacao != null);
    const statusVisita = url.searchParams.get("status_visita");
    if (statusVisita === "not.is.null") rows = rows.filter((r) => r.status_visita != null);
    const statusReserva = url.searchParams.get("status_reserva");
    if (statusReserva === "not.is.null") rows = rows.filter((r) => r.status_reserva != null);

    const limit = Number(url.searchParams.get("limit") || rows.length);
    return jsonResponse(rows.slice(0, limit), 200);
  }

  // enova_state must NOT be touched by CRM actions
  if (url.pathname === "/rest/v1/enova_state") {
    throw new Error("CRM flow must not touch enova_state directly");
  }

  throw new Error(`Unexpected fetch: ${url.toString()}`);
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`  ✅ ${name}`); })
    .catch((err) => { failed++; console.error(`  ❌ ${name}: ${err.message}`); });
}

try {
  console.log("\n=== CRM Backend v0 Smoke Tests ===\n");

  // Seed test leads
  seedLead("5511999990001");
  seedLead("5511999990002");
  seedLead("5511999990003");

  // ── 1. update_analysis ──
  console.log("── update_analysis ──");

  await test("update analysis_status = SENT", async () => {
    const { status, body } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990001",
      analysis_status: "SENT",
      analysis_partner_name: "Correspondente X",
      operator: "admin",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(metaRows.get("5511999990001").analysis_status, "SENT");
    assert.equal(metaRows.get("5511999990001").analysis_partner_name, "Correspondente X");
    assert.notEqual(metaRows.get("5511999990001").analysis_last_sent_at, null);
  });

  await test("update analysis_status = APPROVED_HIGH sets return date", async () => {
    const { status, body } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990001",
      analysis_status: "APPROVED_HIGH",
      analysis_reason_code: "RENDA_OK",
      analysis_reason_text: "Renda compatível com faixa alta",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(metaRows.get("5511999990001").analysis_status, "APPROVED_HIGH");
    assert.notEqual(metaRows.get("5511999990001").analysis_last_return_at, null);
  });

  await test("update analysis with invalid status returns 400", async () => {
    const { status, body } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990001",
      analysis_status: "INVALID_STATUS",
    });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
  });

  await test("analysis override log recorded", async () => {
    const analysisLogs = overrideLogs.filter((l) => l.field === "analysis_status");
    assert.ok(analysisLogs.length >= 1, "at least one analysis override log");
    assert.equal(analysisLogs[0].wa_id, "5511999990001");
  });

  // ── 2. update_visit ──
  console.log("── update_visit ──");

  await test("update visit_status = SCHEDULED", async () => {
    const { status, body } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990002",
      visit_status: "SCHEDULED",
      visit_context: "FIRST_ATTENDANCE",
      visit_date: "2026-04-15T10:00:00.000Z",
      visit_owner: "Carlos",
      visit_notes_short: "Primeira visita ao empreendimento",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(metaRows.get("5511999990002").visit_status, "SCHEDULED");
    assert.equal(metaRows.get("5511999990002").visit_context, "FIRST_ATTENDANCE");
    assert.equal(metaRows.get("5511999990002").visit_owner, "Carlos");
  });

  await test("update visit_status = CONFIRMED sets confirmed_at", async () => {
    const { status, body } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990002",
      visit_status: "CONFIRMED",
    });
    assert.equal(status, 200);
    assert.equal(metaRows.get("5511999990002").visit_status, "CONFIRMED");
    assert.notEqual(metaRows.get("5511999990002").visit_confirmed_at, null);
  });

  await test("update visit with result CLOSED_PURCHASE", async () => {
    const { status, body } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990002",
      visit_result: "CLOSED_PURCHASE",
    });
    assert.equal(status, 200);
    assert.equal(metaRows.get("5511999990002").visit_result, "CLOSED_PURCHASE");
  });

  await test("update visit with invalid status returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990002",
      visit_status: "INVALID",
    });
    assert.equal(status, 400);
  });

  await test("update visit with invalid date returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990002",
      visit_date: "not-a-date",
    });
    assert.equal(status, 400);
  });

  await test("visit override log recorded", async () => {
    const visitLogs = overrideLogs.filter((l) => l.field === "visit_status");
    assert.ok(visitLogs.length >= 1, "at least one visit override log");
  });

  // ── 3. update_reserve ──
  console.log("── update_reserve ──");

  await test("update reserve_status = OPEN", async () => {
    const { status, body } = await runCrmAction({
      action: "update_reserve",
      wa_id: "5511999990003",
      reserve_status: "OPEN",
      reserve_next_action_label: "Enviar documentos para análise",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(metaRows.get("5511999990003").reserve_status, "OPEN");
    assert.notEqual(metaRows.get("5511999990003").reserve_last_movement_at, null);
  });

  await test("update reserve_status = UNDER_REVIEW", async () => {
    const { status } = await runCrmAction({
      action: "update_reserve",
      wa_id: "5511999990003",
      reserve_status: "UNDER_REVIEW",
      reserve_risk_level: "MEDIUM",
    });
    assert.equal(status, 200);
    assert.equal(metaRows.get("5511999990003").reserve_status, "UNDER_REVIEW");
    assert.equal(metaRows.get("5511999990003").reserve_risk_level, "MEDIUM");
  });

  await test("update reserve with invalid status returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_reserve",
      wa_id: "5511999990003",
      reserve_status: "INVALID",
    });
    assert.equal(status, 400);
  });

  // ── 4. update_approved ──
  console.log("── update_approved ──");

  await test("update approved fields", async () => {
    const { status, body } = await runCrmAction({
      action: "update_approved",
      wa_id: "5511999990001",
      approved_purchase_band: "HIGH",
      approved_target_match: "FULL",
      approved_next_step: "VISIT",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(metaRows.get("5511999990001").approved_purchase_band, "HIGH");
    assert.equal(metaRows.get("5511999990001").approved_target_match, "FULL");
    assert.equal(metaRows.get("5511999990001").approved_next_step, "VISIT");
    assert.notEqual(metaRows.get("5511999990001").approved_last_contact_at, null);
  });

  await test("update approved with invalid band returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_approved",
      wa_id: "5511999990001",
      approved_purchase_band: "MEDIUM",
    });
    assert.equal(status, 400);
  });

  // ── 5. update_rejection ──
  console.log("── update_rejection ──");

  await test("update rejection/recovery fields", async () => {
    const { status, body } = await runCrmAction({
      action: "update_rejection",
      wa_id: "5511999990002",
      rejection_reason_code: "RENDA_INSUFICIENTE",
      rejection_reason_label: "Renda insuficiente para financiamento",
      recovery_status: "TENTANDO",
      recovery_strategy_code: "COMPOSICAO_RENDA",
      recovery_note_short: "Verificar possibilidade de compor renda",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(metaRows.get("5511999990002").rejection_reason_code, "RENDA_INSUFICIENTE");
    assert.equal(metaRows.get("5511999990002").recovery_status, "TENTANDO");
    assert.notEqual(metaRows.get("5511999990002").last_retry_contact_at, null);
  });

  await test("update rejection with invalid next_retry_at returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_rejection",
      wa_id: "5511999990002",
      next_retry_at: "not-a-date",
    });
    assert.equal(status, 400);
  });

  // ── 6. log_override ──
  console.log("── log_override ──");

  await test("log_override records manual change", async () => {
    const prevCount = overrideLogs.length;
    const { status, body } = await runCrmAction({
      action: "log_override",
      wa_id: "5511999990001",
      field: "analysis_status",
      from_value: "SENT",
      to_value: "APPROVED_HIGH",
      reason_code: "MANUAL_OVERRIDE",
      reason_text: "Correção manual pelo operador",
      operator: "admin@enova.com",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.logged, true);
    assert.equal(overrideLogs.length, prevCount + 1);
    const lastLog = overrideLogs[overrideLogs.length - 1];
    assert.equal(lastLog.wa_id, "5511999990001");
    assert.equal(lastLog.field, "analysis_status");
    assert.equal(lastLog.from_value, "SENT");
    assert.equal(lastLog.to_value, "APPROVED_HIGH");
    assert.equal(lastLog.operator, "admin@enova.com");
  });

  await test("log_override without field returns 400", async () => {
    const { status } = await runCrmAction({
      action: "log_override",
      wa_id: "5511999990001",
    });
    assert.equal(status, 400);
  });

  // ── 7. Validation: missing wa_id ──
  console.log("── Validation ──");

  await test("missing wa_id returns 400", async () => {
    const { status } = await runCrmAction({ action: "update_analysis" });
    assert.equal(status, 400);
  });

  await test("missing action returns 400", async () => {
    const { status } = await runCrmAction({ wa_id: "5511999990001" });
    assert.equal(status, 400);
  });

  await test("unknown action returns 400", async () => {
    const { status } = await runCrmAction({ action: "noop", wa_id: "5511999990001" });
    assert.equal(status, 400);
  });

  await test("missing env returns 500", async () => {
    const { status } = await runCrmAction(
      { action: "update_analysis", wa_id: "5511999990001" },
      {},
    );
    assert.equal(status, 500);
  });

  // ── 8. listCrmLeads (view) ──
  console.log("── listCrmLeads (view) ──");

  await test("listCrmLeads returns all leads", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      {},
    );
    assert.ok(leads.length >= 3, "at least 3 leads");
    // Check PT-BR aliases exist
    assert.ok("status_analise" in leads[0], "status_analise alias exists");
    assert.ok("status_visita" in leads[0], "status_visita alias exists");
    assert.ok("fase_funil" in leads[0], "fase_funil alias exists");
    assert.ok("criado_em" in leads[0], "criado_em alias exists");
  });

  await test("listCrmLeads tab=analise filters by analysis", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "analise" },
    );
    assert.ok(leads.length >= 1, "at least 1 lead in análise");
    for (const l of leads) {
      assert.notEqual(l.status_analise, null, "all leads have status_analise");
    }
  });

  await test("listCrmLeads tab=visita filters by visit", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "visita" },
    );
    assert.ok(leads.length >= 1, "at least 1 lead in visita");
    for (const l of leads) {
      assert.notEqual(l.status_visita, null, "all leads have status_visita");
    }
  });

  await test("listCrmLeads tab=aprovados filters by approved", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "aprovados" },
    );
    assert.ok(leads.length >= 1, "at least 1 approved lead");
  });

  await test("listCrmLeads tab=reprovados filters by rejection", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "reprovados" },
    );
    assert.ok(leads.length >= 1, "at least 1 rejected lead");
  });

  await test("listCrmLeads tab=reserva filters by reserve", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "reserva" },
    );
    assert.ok(leads.length >= 1, "at least 1 lead in reserva");
  });

  // ── 9. Data integrity: existing fields untouched ──
  console.log("── Data Integrity ──");

  await test("existing crm_lead_meta base fields remain intact after CRM updates", async () => {
    const row = metaRows.get("5511999990001");
    assert.equal(row.lead_pool, "HOT_POOL", "lead_pool unchanged");
    assert.equal(row.lead_temp, "HOT", "lead_temp unchanged");
    assert.equal(row.nome, "Lead 5511999990001", "nome unchanged");
  });

  await test("CRM actions never touch enova_state", async () => {
    const enovaStateCalls = fetchCalls.filter((c) =>
      c.url.includes("/rest/v1/enova_state"),
    );
    assert.equal(enovaStateCalls.length, 0, "no calls to enova_state");
  });

  await test("CRM actions never touch fase_conversa", async () => {
    for (const [, row] of metaRows) {
      assert.ok(!("fase_conversa" in row) || row.fase_conversa === undefined,
        "fase_conversa not in crm_lead_meta");
    }
  });

  // ── 10. Override log audit trail complete ──
  console.log("── Override Log Audit ──");

  await test("override logs have complete audit trail", async () => {
    assert.ok(overrideLogs.length >= 3, `at least 3 override logs (got ${overrideLogs.length})`);
    for (const log of overrideLogs) {
      assert.ok(log.wa_id, "log has wa_id");
      assert.ok(log.field, "log has field");
    }
  });

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log("✅ All CRM backend smoke tests passed.\n");
} finally {
  globalThis.fetch = originalFetch;
}
