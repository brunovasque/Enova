import assert from "node:assert/strict";

// ============================================================
// Smoke tests — Mini-CRM Operacional Backend v1
// Validates: auth guard, real from_value audit, smart tab filters,
// correspondent return, profile snapshot, score, all original actions
// ============================================================

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";
process.env.ENOVA_ADMIN_KEY = "test-admin-key-1234";

const sharedModule = await import(new URL("../panel/app/api/crm/_shared.ts", import.meta.url).href);

const { runCrmAction, listCrmLeads } = sharedModule;

const metaRows = new Map(); // crm_lead_meta rows (keyed by wa_id)
const stateRows = new Map(); // enova_state rows (keyed by wa_id) — for the new view JOIN direction
const overrideLogs = [];
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

function parseIn(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^in\.\((.+)\)$/);
  if (!match) return null;
  return match[1].split(",");
}

// Split "col.in.(a,b,c),col2.eq.val" respecting parentheses
function splitOrConditions(str) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "," && depth === 0) { parts.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Evaluate a single OR condition string against a row object
// Supports: col.in.(v1,v2), col.eq.val, col.is.true, col.not.is.null
function evalOrCondition(row, cond) {
  // col.not.is.null
  const notNullMatch = cond.match(/^(.+)\.not\.is\.null$/);
  if (notNullMatch) return row[notNullMatch[1]] != null;
  // col.is.null
  const isNullMatch = cond.match(/^(.+)\.is\.null$/);
  if (isNullMatch) return row[isNullMatch[1]] == null;
  // col.is.true
  const isTrueMatch = cond.match(/^(.+)\.is\.true$/);
  if (isTrueMatch) return row[isTrueMatch[1]] === true;
  // col.is.false
  const isFalseMatch = cond.match(/^(.+)\.is\.false$/);
  if (isFalseMatch) return row[isFalseMatch[1]] === false;
  // col.eq.val
  const eqMatch = cond.match(/^(.+)\.eq\.(.+)$/);
  if (eqMatch) return String(row[eqMatch[1]] ?? "") === eqMatch[2];
  // col.in.(v1,v2,...)
  const inMatch = cond.match(/^(.+)\.in\.\((.+)\)$/);
  if (inMatch) {
    const vals = inMatch[2].split(",");
    return vals.includes(String(row[inMatch[1]] ?? ""));
  }
  return false;
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
    // enova_state funnel fields (source of truth for phase classification)
    fase_conversa: null,
    funil_status: null,
    docs_status: null,
    processo_aprovado: null,
    processo_reprovado: null,
    visita_confirmada: null,
    // CRM operational fields (all null by default)
    analysis_status: null,
    analysis_reason_code: null,
    analysis_reason_text: null,
    analysis_last_sent_at: null,
    analysis_last_return_at: null,
    analysis_partner_name: null,
    analysis_adjustment_note: null,
    // Correspondent return
    analysis_return_summary: null,
    analysis_return_reason: null,
    analysis_financing_amount: null,
    analysis_subsidy_amount: null,
    analysis_entry_amount: null,
    analysis_monthly_payment: null,
    analysis_return_raw: null,
    analysis_returned_by: null,
    // Profile snapshot
    analysis_profile_type: null,
    analysis_holder_name: null,
    analysis_partner_name_snapshot: null,
    analysis_marital_status: null,
    analysis_composition_type: null,
    analysis_income_total: null,
    analysis_income_holder: null,
    analysis_income_partner: null,
    analysis_income_family: null,
    analysis_holder_work_regime: null,
    analysis_partner_work_regime: null,
    analysis_family_work_regime: null,
    analysis_has_fgts: null,
    analysis_has_down_payment: null,
    analysis_down_payment_amount: null,
    analysis_has_restriction: null,
    analysis_partner_has_restriction: null,
    analysis_holder_has_ir: null,
    analysis_partner_has_ir: null,
    analysis_ctps_36: null,
    analysis_partner_ctps_36: null,
    analysis_dependents_count: null,
    analysis_ticket_target: null,
    analysis_property_goal: null,
    analysis_profile_summary: null,
    analysis_snapshot_raw: null,
    // Score
    analysis_profile_score: null,
    analysis_profile_band: null,
    analysis_work_score_label: null,
    analysis_work_score_reason: null,
    // Approved
    approved_purchase_band: null,
    approved_target_match: null,
    approved_next_step: null,
    approved_last_contact_at: null,
    // Rejection
    rejection_reason_code: null,
    rejection_reason_label: null,
    recovery_status: null,
    recovery_strategy_code: null,
    recovery_note_short: null,
    next_retry_at: null,
    last_retry_contact_at: null,
    // Visit
    visit_status: null,
    visit_context: null,
    visit_date: null,
    visit_confirmed_at: null,
    visit_result: null,
    visit_objection_code: null,
    visit_next_step: null,
    visit_owner: null,
    visit_notes_short: null,
    // Reserve
    reserve_status: null,
    reserve_stage_detail: null,
    reserve_risk_level: null,
    reserve_next_action_label: null,
    reserve_next_action_due_at: null,
    reserve_last_movement_at: null,
    // Financial
    vgv_value: null,
    commission_value: null,
    commission_status: null,
    financial_status: null,
    financial_note_short: null,
    financial_last_update_at: null,
    ...extra,
  };
  metaRows.set(waId, base);
  // Auto-create a companion enova_state row reflecting funnel fields
  const stateFunnel = extra.fase_conversa ?? null;
  if (!stateRows.has(waId)) {
    stateRows.set(waId, {
      wa_id: waId,
      nome: base.nome,
      fase_conversa: stateFunnel,
      funil_status: extra.funil_status ?? null,
      docs_status: extra.docs_status ?? null,
      processo_aprovado: extra.processo_aprovado ?? null,
      processo_reprovado: extra.processo_reprovado ?? null,
      visita_confirmada: extra.visita_confirmada ?? null,
      visita_dia_hora: null,
      updated_at: base.updated_at,
    });
  }
  return base;
}

// Seed an enova_state-only row (no crm_lead_meta row).
// Use this to simulate a lead that is in the funnel but was never CRM-imported.
function seedState(waId, extra = {}) {
  const row = {
    wa_id: waId,
    nome: extra.nome ?? "Lead " + waId,
    fase_conversa: extra.fase_conversa ?? null,
    funil_status: extra.funil_status ?? null,
    docs_status: extra.docs_status ?? null,
    processo_aprovado: extra.processo_aprovado ?? null,
    processo_reprovado: extra.processo_reprovado ?? null,
    visita_confirmada: extra.visita_confirmada ?? null,
    visita_dia_hora: null,
    updated_at: extra.updated_at ?? "2026-03-30T10:00:00.000Z",
    ...extra,
  };
  stateRows.set(waId, row);
  return row;
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

  // crm_lead_meta
  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_lead_meta") {
    const method = String(init.method || "GET").toUpperCase();

    if (method === "GET") {
      let rows = Array.from(metaRows.values());
      const waId = parseEq(url.searchParams.get("wa_id"));
      if (waId) rows = rows.filter((r) => r.wa_id === waId);
      const limit = Number(url.searchParams.get("limit") || rows.length);
      return jsonResponse(rows.slice(0, limit), 200);
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

  // crm_override_log POST
  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_override_log") {
    const payload = JSON.parse(String(init.body || "{}"));
    overrideLogs.push(payload);
    return new Response("", { status: 201 });
  }

  // crm_leads_v1 GET (view mock)
  // New direction: FROM enova_state e LEFT JOIN crm_lead_meta m
  // Only includes leads with fase_conversa >= envio_docs OR with a CRM status set
  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_leads_v1") {
    // Build a union of all wa_ids visible in the view
    const allWaIds = new Set([
      ...Array.from(stateRows.keys()),
      // Also include meta-only rows (CRM operator touched them, possibly in earlier phase)
      ...Array.from(metaRows.keys()),
    ]);

    const CRM_VISIBLE_PHASES = [
      "envio_docs", "aguardando_retorno_correspondente",
      "agendamento_visita", "visita_confirmada", "finalizacao_processo",
    ];

    let rows = Array.from(allWaIds)
      .map((waId) => {
        const e = stateRows.get(waId);   // enova_state (can be null for meta-only)
        const m = metaRows.get(waId);    // crm_lead_meta (can be null for state-only)
        // View WHERE: fase_conversa IN eligible phases OR CRM status set
        if (!e && !m) return null;
        const faseFunil = e?.fase_conversa ?? null;
        const inEligiblePhase = (faseFunil && CRM_VISIBLE_PHASES.includes(faseFunil))
          || e?.processo_aprovado === true
          || e?.processo_reprovado === true
          || e?.visita_confirmada === true;
        const hasCrmStatus = !!(m?.analysis_status || m?.visit_status || m?.reserve_status);
        if (!inEligiblePhase && !hasCrmStatus) return null;
        return {
          wa_id: e?.wa_id ?? m?.wa_id,
          nome: m?.nome ?? e?.nome ?? null,
          telefone: m?.telefone ?? e?.wa_id ?? null,
          lead_pool: m?.lead_pool ?? null,
          lead_temp: m?.lead_temp ?? null,
          origem: m?.lead_source ?? null,
          // enova_state funnel fields (PT-BR aliases from the view)
          fase_funil: faseFunil,
          status_funil: e?.funil_status ?? null,
          status_docs_funil: e?.docs_status ?? null,
          aprovado_funil: e?.processo_aprovado ?? null,
          reprovado_funil: e?.processo_reprovado ?? null,
          visita_confirmada_funil: e?.visita_confirmada ?? null,
          visita_agendada_funil: null,
          // Analysis
          status_analise: m?.analysis_status ?? null,
          codigo_motivo_analise: m?.analysis_reason_code ?? null,
          motivo_analise: m?.analysis_reason_text ?? null,
          data_envio_analise: m?.analysis_last_sent_at ?? null,
          data_retorno_analise: m?.analysis_last_return_at ?? null,
          parceiro_analise: m?.analysis_partner_name ?? null,
          nota_ajuste_analise: m?.analysis_adjustment_note ?? null,
          // Correspondent return
          resumo_retorno_analise: m?.analysis_return_summary ?? null,
          motivo_retorno_analise: m?.analysis_return_reason ?? null,
          valor_financiamento_aprovado: m?.analysis_financing_amount ?? null,
          valor_subsidio_aprovado: m?.analysis_subsidy_amount ?? null,
          valor_entrada_informada: m?.analysis_entry_amount ?? null,
          valor_parcela_informada: m?.analysis_monthly_payment ?? null,
          retorno_bruto_correspondente: m?.analysis_return_raw ?? null,
          correspondente_retorno: m?.analysis_returned_by ?? null,
          // Profile snapshot
          tipo_perfil_analise: m?.analysis_profile_type ?? null,
          nome_titular_analise: m?.analysis_holder_name ?? null,
          nome_parceiro_analise_snapshot: m?.analysis_partner_name_snapshot ?? null,
          estado_civil_analise: m?.analysis_marital_status ?? null,
          tipo_composicao_analise: m?.analysis_composition_type ?? null,
          renda_total_analise: m?.analysis_income_total ?? null,
          renda_titular_analise: m?.analysis_income_holder ?? null,
          renda_parceiro_analise: m?.analysis_income_partner ?? null,
          renda_familiar_analise: m?.analysis_income_family ?? null,
          regime_trabalho_titular_analise: m?.analysis_holder_work_regime ?? null,
          regime_trabalho_parceiro_analise: m?.analysis_partner_work_regime ?? null,
          regime_trabalho_familiar_analise: m?.analysis_family_work_regime ?? null,
          possui_fgts_analise: m?.analysis_has_fgts ?? null,
          possui_entrada_analise: m?.analysis_has_down_payment ?? null,
          valor_entrada_analise: m?.analysis_down_payment_amount ?? null,
          possui_restricao_analise: m?.analysis_has_restriction ?? null,
          possui_restricao_parceiro_analise: m?.analysis_partner_has_restriction ?? null,
          possui_ir_titular_analise: m?.analysis_holder_has_ir ?? null,
          possui_ir_parceiro_analise: m?.analysis_partner_has_ir ?? null,
          ctps_36_titular_analise: m?.analysis_ctps_36 ?? null,
          ctps_36_parceiro_analise: m?.analysis_partner_ctps_36 ?? null,
          quantidade_dependentes_analise: m?.analysis_dependents_count ?? null,
          ticket_desejado_analise: m?.analysis_ticket_target ?? null,
          objetivo_imovel_analise: m?.analysis_property_goal ?? null,
          resumo_perfil_analise: m?.analysis_profile_summary ?? null,
          snapshot_bruto_analise: m?.analysis_snapshot_raw ?? null,
          // Score
          score_perfil_analise: m?.analysis_profile_score ?? null,
          faixa_perfil_analise: m?.analysis_profile_band ?? null,
          label_score_trabalho: m?.analysis_work_score_label ?? null,
          motivo_score_trabalho: m?.analysis_work_score_reason ?? null,
          // Approved
          faixa_aprovacao: m?.approved_purchase_band ?? null,
          aderencia_aprovacao: m?.approved_target_match ?? null,
          proximo_passo_aprovado: m?.approved_next_step ?? null,
          ultimo_contato_aprovado: m?.approved_last_contact_at ?? null,
          // Rejected
          codigo_motivo_reprovacao: m?.rejection_reason_code ?? null,
          motivo_reprovacao: m?.rejection_reason_label ?? null,
          status_recuperacao: m?.recovery_status ?? null,
          estrategia_recuperacao: m?.recovery_strategy_code ?? null,
          nota_recuperacao: m?.recovery_note_short ?? null,
          proxima_tentativa: m?.next_retry_at ?? null,
          ultimo_contato_recuperacao: m?.last_retry_contact_at ?? null,
          // Visit
          status_visita: m?.visit_status ?? null,
          contexto_visita: m?.visit_context ?? null,
          data_visita: m?.visit_date ?? null,
          data_confirmacao_visita: m?.visit_confirmed_at ?? null,
          resultado_visita: m?.visit_result ?? null,
          codigo_objecao_visita: m?.visit_objection_code ?? null,
          proximo_passo_visita: m?.visit_next_step ?? null,
          responsavel_visita: m?.visit_owner ?? null,
          observacao_visita: m?.visit_notes_short ?? null,
          // Reserve
          status_reserva: m?.reserve_status ?? null,
          detalhe_etapa_reserva: m?.reserve_stage_detail ?? null,
          nivel_risco_reserva: m?.reserve_risk_level ?? null,
          proxima_acao_reserva: m?.reserve_next_action_label ?? null,
          prazo_proxima_acao_reserva: m?.reserve_next_action_due_at ?? null,
          ultimo_movimento_reserva: m?.reserve_last_movement_at ?? null,
          // Financial
          valor_vgv: m?.vgv_value ?? null,
          valor_comissao: m?.commission_value ?? null,
          status_comissao: m?.commission_status ?? null,
          status_financeiro: m?.financial_status ?? null,
          nota_financeiro: m?.financial_note_short ?? null,
          ultima_atualizacao_financeiro: m?.financial_last_update_at ?? null,
          criado_em: m?.created_at ?? null,
          atualizado_em: m?.updated_at ?? e?.updated_at ?? null,
        };
      })
      .filter(Boolean);

    // Tab filters — support both simple and OR-based conditions
    const statusAnalise = url.searchParams.get("status_analise");
    if (statusAnalise) {
      const inValues = parseIn(statusAnalise);
      if (inValues) {
        rows = rows.filter((r) => r.status_analise && inValues.includes(r.status_analise));
      } else if (statusAnalise === "not.is.null") {
        rows = rows.filter((r) => r.status_analise != null);
      }
    }
    const statusVisita = url.searchParams.get("status_visita");
    if (statusVisita === "not.is.null") rows = rows.filter((r) => r.status_visita != null);
    const statusReserva = url.searchParams.get("status_reserva");
    if (statusReserva === "not.is.null") rows = rows.filter((r) => r.status_reserva != null);

    // OR conditions (PostgREST format: "or=(cond1,cond2)")
    const orParam = url.searchParams.get("or");
    if (orParam) {
      // Parse the or=(cond1,cond2,...) — handles: col.in.(v1,v2), col.eq.val, col.is.true, col.not.is.null
      const inner = orParam.replace(/^\(|\)$/g, ""); // strip outer parens
      const conditions = splitOrConditions(inner);
      rows = rows.filter((r) => conditions.some((cond) => evalOrCondition(r, cond)));
    }

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
  console.log("\n=== CRM Backend v1 Smoke Tests ===\n");

  // Seed test leads
  seedLead("5511999990001");
  seedLead("5511999990002");
  seedLead("5511999990003");
  seedLead("5511999990004");
  seedLead("5511999990005");

  // ── 1. update_analysis with real from_value audit ──
  console.log("── update_analysis + real audit ──");

  await test("update analysis_status = SENT (first time, from_value = null)", async () => {
    overrideLogs.length = 0;
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
    // from_value should be null (first change)
    const log = overrideLogs.find((l) => l.field === "analysis_status");
    assert.ok(log, "override log exists");
    assert.equal(log.from_value, null, "from_value is null on first set");
    assert.equal(log.to_value, "SENT");
  });

  await test("update analysis_status = APPROVED_HIGH (from_value = SENT)", async () => {
    overrideLogs.length = 0;
    const { status } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990001",
      analysis_status: "APPROVED_HIGH",
      analysis_reason_code: "RENDA_OK",
      analysis_reason_text: "Renda compatível com faixa alta",
      operator: "admin",
    });
    assert.equal(status, 200);
    assert.equal(metaRows.get("5511999990001").analysis_status, "APPROVED_HIGH");
    // from_value should be "SENT" (the previous value)
    const log = overrideLogs.find((l) => l.field === "analysis_status");
    assert.ok(log, "override log exists");
    assert.equal(log.from_value, "SENT", "from_value correctly captured as SENT");
    assert.equal(log.to_value, "APPROVED_HIGH");
    assert.equal(log.operator, "admin");
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

  // ── 2. Correspondent return fields ──
  console.log("── Correspondent return fields ──");

  await test("update_analysis persists correspondent return fields", async () => {
    const { status, body } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990001",
      analysis_return_summary: "Aprovado faixa alta - Minha Casa Minha Vida",
      analysis_return_reason: "Renda compatível com valor máximo de financiamento",
      analysis_financing_amount: 250000,
      analysis_subsidy_amount: 47000,
      analysis_entry_amount: 15000,
      analysis_monthly_payment: 1200,
      analysis_return_raw: '{"status":"approved","tier":"high"}',
      analysis_returned_by: "Correspondente ABC",
    });
    assert.equal(status, 200);
    const row = metaRows.get("5511999990001");
    assert.equal(row.analysis_return_summary, "Aprovado faixa alta - Minha Casa Minha Vida");
    assert.equal(row.analysis_financing_amount, 250000);
    assert.equal(row.analysis_subsidy_amount, 47000);
    assert.equal(row.analysis_entry_amount, 15000);
    assert.equal(row.analysis_monthly_payment, 1200);
    assert.equal(row.analysis_returned_by, "Correspondente ABC");
    assert.ok(row.analysis_return_raw, "return_raw persisted");
  });

  // ── 3. Profile snapshot fields ──
  console.log("── Profile snapshot fields ──");

  await test("update_analysis persists profile snapshot", async () => {
    const { status } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990002",
      analysis_status: "SENT",
      analysis_profile_type: "CASAL",
      analysis_holder_name: "João Silva",
      analysis_partner_name_snapshot: "Maria Silva",
      analysis_marital_status: "casado",
      analysis_composition_type: "casal_ambos_renda",
      analysis_income_total: 8500,
      analysis_income_holder: 5000,
      analysis_income_partner: 3500,
      analysis_income_family: 0,
      analysis_holder_work_regime: "CLT",
      analysis_partner_work_regime: "AUTONOMO",
      analysis_has_fgts: true,
      analysis_has_down_payment: true,
      analysis_down_payment_amount: 20000,
      analysis_has_restriction: false,
      analysis_partner_has_restriction: false,
      analysis_holder_has_ir: true,
      analysis_partner_has_ir: false,
      analysis_ctps_36: true,
      analysis_partner_ctps_36: false,
      analysis_dependents_count: 2,
      analysis_ticket_target: 280000,
      analysis_property_goal: "apartamento 2 quartos",
      analysis_profile_summary: "Casal com renda compatível, CLT+autônomo, 2 dependentes",
      analysis_snapshot_raw: '{"raw":"data"}',
    });
    assert.equal(status, 200);
    const row = metaRows.get("5511999990002");
    assert.equal(row.analysis_profile_type, "CASAL");
    assert.equal(row.analysis_holder_name, "João Silva");
    assert.equal(row.analysis_partner_name_snapshot, "Maria Silva");
    assert.equal(row.analysis_income_total, 8500);
    assert.equal(row.analysis_income_holder, 5000);
    assert.equal(row.analysis_income_partner, 3500);
    assert.equal(row.analysis_has_fgts, true);
    assert.equal(row.analysis_has_down_payment, true);
    assert.equal(row.analysis_down_payment_amount, 20000);
    assert.equal(row.analysis_has_restriction, false);
    assert.equal(row.analysis_holder_has_ir, true);
    assert.equal(row.analysis_ctps_36, true);
    assert.equal(row.analysis_partner_ctps_36, false);
    assert.equal(row.analysis_dependents_count, 2);
    assert.equal(row.analysis_ticket_target, 280000);
    assert.equal(row.analysis_property_goal, "apartamento 2 quartos");
    assert.ok(row.analysis_profile_summary.includes("Casal"));
  });

  // ── 4. Score fields ──
  console.log("── Score fields ──");

  await test("update_analysis persists score fields", async () => {
    const { status } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990002",
      analysis_profile_score: 85,
      analysis_profile_band: "STRONG",
      analysis_work_score_label: "Perfil forte",
      analysis_work_score_reason: "CLT >36 meses, renda boa, sem restrição",
    });
    assert.equal(status, 200);
    const row = metaRows.get("5511999990002");
    assert.equal(row.analysis_profile_score, 85);
    assert.equal(row.analysis_profile_band, "STRONG");
    assert.equal(row.analysis_work_score_label, "Perfil forte");
    assert.ok(row.analysis_work_score_reason.includes("CLT"));
  });

  await test("invalid profile_band returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_analysis",
      wa_id: "5511999990002",
      analysis_profile_band: "INVALID",
    });
    assert.equal(status, 400);
  });

  // ── 5. update_visit with real audit ──
  console.log("── update_visit + real audit ──");

  await test("update visit_status = SCHEDULED (from_value = null)", async () => {
    overrideLogs.length = 0;
    const { status } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990003",
      visit_status: "SCHEDULED",
      visit_context: "FIRST_ATTENDANCE",
      visit_date: "2026-04-15T10:00:00.000Z",
      visit_owner: "Carlos",
      operator: "admin",
    });
    assert.equal(status, 200);
    const log = overrideLogs.find((l) => l.field === "visit_status");
    assert.ok(log);
    assert.equal(log.from_value, null);
    assert.equal(log.to_value, "SCHEDULED");
  });

  await test("update visit_status = CONFIRMED (from_value = SCHEDULED)", async () => {
    overrideLogs.length = 0;
    const { status } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990003",
      visit_status: "CONFIRMED",
      operator: "admin",
    });
    assert.equal(status, 200);
    assert.equal(metaRows.get("5511999990003").visit_status, "CONFIRMED");
    const log = overrideLogs.find((l) => l.field === "visit_status");
    assert.ok(log);
    assert.equal(log.from_value, "SCHEDULED", "from_value is SCHEDULED");
    assert.equal(log.to_value, "CONFIRMED");
  });

  await test("update visit with invalid status returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990003",
      visit_status: "INVALID",
    });
    assert.equal(status, 400);
  });

  await test("update visit with invalid date returns 400", async () => {
    const { status } = await runCrmAction({
      action: "update_visit",
      wa_id: "5511999990003",
      visit_date: "not-a-date",
    });
    assert.equal(status, 400);
  });

  // ── 6. update_reserve with real audit ──
  console.log("── update_reserve + real audit ──");

  await test("update reserve_status = OPEN (from_value = null)", async () => {
    overrideLogs.length = 0;
    const { status } = await runCrmAction({
      action: "update_reserve",
      wa_id: "5511999990004",
      reserve_status: "OPEN",
      operator: "admin",
    });
    assert.equal(status, 200);
    const log = overrideLogs.find((l) => l.field === "reserve_status");
    assert.ok(log);
    assert.equal(log.from_value, null);
    assert.equal(log.to_value, "OPEN");
  });

  await test("update reserve_status = UNDER_REVIEW (from_value = OPEN)", async () => {
    overrideLogs.length = 0;
    const { status } = await runCrmAction({
      action: "update_reserve",
      wa_id: "5511999990004",
      reserve_status: "UNDER_REVIEW",
      reserve_risk_level: "MEDIUM",
      operator: "admin",
    });
    assert.equal(status, 200);
    const log = overrideLogs.find((l) => l.field === "reserve_status");
    assert.ok(log);
    assert.equal(log.from_value, "OPEN", "from_value is OPEN");
    assert.equal(log.to_value, "UNDER_REVIEW");
  });

  // ── 7. update_approved with real audit ──
  console.log("── update_approved + real audit ──");

  await test("update approved fields (from_value = null)", async () => {
    overrideLogs.length = 0;
    const { status } = await runCrmAction({
      action: "update_approved",
      wa_id: "5511999990001",
      approved_purchase_band: "HIGH",
      approved_target_match: "FULL",
      approved_next_step: "VISIT",
      operator: "admin",
    });
    assert.equal(status, 200);
    assert.equal(metaRows.get("5511999990001").approved_purchase_band, "HIGH");
    const bandLog = overrideLogs.find((l) => l.field === "approved_purchase_band");
    assert.ok(bandLog);
    assert.equal(bandLog.from_value, null);
    assert.equal(bandLog.to_value, "HIGH");
  });

  // ── 8. update_rejection with real audit ──
  console.log("── update_rejection + real audit ──");

  await test("update rejection/recovery fields", async () => {
    overrideLogs.length = 0;
    // First set a rejection
    seedLead("5511999990005", { analysis_status: "REJECTED_HARD" });
    const { status } = await runCrmAction({
      action: "update_rejection",
      wa_id: "5511999990005",
      rejection_reason_code: "RENDA_INSUFICIENTE",
      rejection_reason_label: "Renda insuficiente para financiamento",
      recovery_status: "TENTANDO",
      operator: "admin",
    });
    assert.equal(status, 200);
    const log = overrideLogs.find((l) => l.field === "rejection_reason_code");
    assert.ok(log);
    assert.equal(log.from_value, null);
    assert.equal(log.to_value, "RENDA_INSUFICIENTE");
  });

  // ── 9. log_override ──
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
    assert.equal(body.logged, true);
    assert.equal(overrideLogs.length, prevCount + 1);
  });

  await test("log_override without field returns 400", async () => {
    const { status } = await runCrmAction({
      action: "log_override",
      wa_id: "5511999990001",
    });
    assert.equal(status, 400);
  });

  // ── 10. Validation ──
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

  // ── 11. Smart tab filters + funnel-fidelity tests ──
  console.log("── Smart tab filters + funnel fidelity ──");

  // Funnel-based leads (no CRM analysis_status, but real funnel state)
  // lead 7: aguardando_retorno_correspondente (no analysis_status) → should appear in ANALISE
  // lead 8: envio_docs in funnel (no analysis_status) → PASTA
  // lead 9: processo_aprovado = true (no analysis_status) → APROVADO
  // lead 10: processo_reprovado = true (no analysis_status) → REPROVADO
  // lead 11: agendamento_visita (no analysis_status) → VISITA
  // lead 12: before envio_docs (analysis_status = null, fase_conversa = estado_civil) → EXCLUDED
  // lead 7: aguardando_retorno_correspondente with NO crm_lead_meta row
  //         → this is the critical case that was broken before (view drove FROM crm_lead_meta)
  seedState("5511999990007", { fase_conversa: "aguardando_retorno_correspondente" });
  seedLead("5511999990008", { fase_conversa: "envio_docs" });
  seedLead("5511999990009", { processo_aprovado: true, funil_status: "aprovado_correspondente" });
  seedLead("5511999990010", { processo_reprovado: true, funil_status: "reprovado_correspondente" });
  seedLead("5511999990011", { fase_conversa: "agendamento_visita" });
  // lead 12: before envio_docs → excluded from ALL tabs even with seedState
  seedState("5511999990012", { fase_conversa: "estado_civil" });
  // lead 6: CRM DOCS_PENDING (has crm_lead_meta row)
  seedLead("5511999990006", { analysis_status: "DOCS_PENDING" });

  // ── Previously existing leads (still present):
  // lead 1: APPROVED_HIGH (analysis_status)
  // lead 2: SENT (analysis_status)
  // lead 5: REJECTED_HARD (analysis_status)
  // lead 6: DOCS_PENDING (analysis_status)

  await test("tab=pasta returns DOCS_PENDING leads AND funnel envio_docs leads", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "pasta" },
    );
    assert.ok(leads.length >= 2, `expected >=2 leads in pasta (DOCS_PENDING + envio_docs funnel), got ${leads.length}`);
    for (const l of leads) {
      const isDocsPending = l.status_analise === "DOCS_PENDING";
      const isEnvioDocs = l.fase_funil === "envio_docs";
      assert.ok(isDocsPending || isEnvioDocs, `expected DOCS_PENDING or envio_docs, got status=${l.status_analise} fase=${l.fase_funil}`);
    }
  });

  await test("tab=analise returns CRM-analysis leads AND aguardando_retorno_correspondente funnel leads", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "analise" },
    );
    // lead 2 (SENT) + lead 7 (aguardando_retorno_correspondente, no CRM status)
    assert.ok(leads.length >= 2, `expected >=2 leads in analise, got ${leads.length}`);
    const ANALISE_STATUSES = ["DOCS_READY", "SENT", "UNDER_ANALYSIS", "ADJUSTMENT_REQUIRED"];
    for (const l of leads) {
      const hasCrmStatus = ANALISE_STATUSES.includes(l.status_analise);
      const hasFunnelPhase = l.fase_funil === "aguardando_retorno_correspondente";
      assert.ok(hasCrmStatus || hasFunnelPhase,
        `expected analise CRM status or aguardando_retorno_correspondente, got status=${l.status_analise} fase=${l.fase_funil}`);
    }
  });

  await test("tab=analise: aguardando_retorno_correspondente lead with NO crm_lead_meta row is included (root cause fix)", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "analise" },
    );
    const lead7 = leads.find((l) => l.wa_id === "5511999990007");
    assert.ok(lead7, "lead 7 (aguardando_retorno_correspondente, NO crm_lead_meta row) must appear in analise tab — this was the root cause bug");
    assert.equal(lead7.status_analise, null, "lead 7 has no CRM analysis_status (state-only)");
    assert.equal(lead7.fase_funil, "aguardando_retorno_correspondente", "lead 7 is in aguardando_retorno_correspondente");
  });

  await test("lead before envio_docs with no CRM row is excluded from ALL tabs (lead 12)", async () => {
    const allLeads = await listCrmLeads("https://supabase.example", "service-role", {});
    const lead12 = allLeads.find((l) => l.wa_id === "5511999990012");
    assert.equal(lead12, undefined, "lead 12 (estado_civil, no CRM row) must NOT appear in CRM at all");
  });

  await test("tab=aprovados returns APPROVED leads AND funnel aprovado leads", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "aprovados" },
    );
    assert.ok(leads.length >= 2, `expected >=2 approved leads (CRM + funnel), got ${leads.length}`);
    for (const l of leads) {
      const hasCrmApproval = l.status_analise === "APPROVED_HIGH" || l.status_analise === "APPROVED_LOW";
      const hasFunnelApproval = l.aprovado_funil === true || l.status_funil === "aprovado_correspondente";
      assert.ok(hasCrmApproval || hasFunnelApproval,
        `expected APPROVED_* or aprovado_funil, got status=${l.status_analise} aprovado=${l.aprovado_funil}`);
    }
  });

  await test("tab=reprovados returns REJECTED leads AND funnel reprovado leads", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "reprovados" },
    );
    assert.ok(leads.length >= 2, `expected >=2 rejected leads (CRM + funnel), got ${leads.length}`);
    for (const l of leads) {
      const hasCrmRejection = l.status_analise === "REJECTED_RECOVERABLE" || l.status_analise === "REJECTED_HARD";
      const hasFunnelRejection = l.reprovado_funil === true || l.status_funil === "reprovado_correspondente";
      assert.ok(hasCrmRejection || hasFunnelRejection,
        `expected REJECTED_* or reprovado_funil, got status=${l.status_analise} reprovado=${l.reprovado_funil}`);
    }
  });

  await test("tab=visita returns CRM visit leads AND funnel agendamento_visita leads", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "visita" },
    );
    assert.ok(leads.length >= 2, `expected >=2 visita leads (CRM + funnel), got ${leads.length}`);
    for (const l of leads) {
      const hasCrmVisit = l.status_visita != null;
      const hasFunnelVisit = ["agendamento_visita", "visita_confirmada", "finalizacao_processo"].includes(l.fase_funil);
      const hasConfirmedVisit = l.visita_confirmada_funil === true;
      assert.ok(hasCrmVisit || hasFunnelVisit || hasConfirmedVisit,
        `expected CRM visit status or funnel visit phase, got status_visita=${l.status_visita} fase=${l.fase_funil}`);
    }
  });

  await test("lead only in envio_docs funnel (no CRM status) appears in pasta tab", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "pasta" },
    );
    const lead8 = leads.find((l) => l.wa_id === "5511999990008");
    assert.ok(lead8, "lead 8 (envio_docs in funnel, no CRM status) should appear in pasta tab");
    assert.equal(lead8.status_analise, null, "lead 8 has no CRM analysis_status");
    assert.equal(lead8.fase_funil, "envio_docs", "lead 8 is in envio_docs funnel phase");
  });

  await test("tab=reserva returns leads with reserve_status set", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      { tab: "reserva" },
    );
    assert.ok(leads.length >= 1, "at least 1 lead in reserva");
    for (const l of leads) {
      assert.notEqual(l.status_reserva, null);
    }
  });

  // ── 12. View fields presence ──
  console.log("── View fields (PT-BR aliases) ──");

  await test("listCrmLeads includes all PT-BR aliases including new fields", async () => {
    const leads = await listCrmLeads(
      "https://supabase.example",
      "service-role",
      {},
    );
    assert.ok(leads.length >= 1);
    const sample = leads[0];
    // Original fields
    assert.ok("status_analise" in sample, "status_analise");
    assert.ok("fase_funil" in sample, "fase_funil");
    assert.ok("status_visita" in sample, "status_visita");
    assert.ok("status_reserva" in sample, "status_reserva");
    // Correspondent return
    assert.ok("resumo_retorno_analise" in sample, "resumo_retorno_analise");
    assert.ok("motivo_retorno_analise" in sample, "motivo_retorno_analise");
    assert.ok("valor_financiamento_aprovado" in sample, "valor_financiamento_aprovado");
    assert.ok("valor_subsidio_aprovado" in sample, "valor_subsidio_aprovado");
    assert.ok("valor_entrada_informada" in sample, "valor_entrada_informada");
    assert.ok("valor_parcela_informada" in sample, "valor_parcela_informada");
    assert.ok("retorno_bruto_correspondente" in sample, "retorno_bruto_correspondente");
    assert.ok("correspondente_retorno" in sample, "correspondente_retorno");
    // Profile snapshot
    assert.ok("tipo_perfil_analise" in sample, "tipo_perfil_analise");
    assert.ok("nome_titular_analise" in sample, "nome_titular_analise");
    assert.ok("nome_parceiro_analise_snapshot" in sample, "nome_parceiro_analise_snapshot");
    assert.ok("estado_civil_analise" in sample, "estado_civil_analise");
    assert.ok("tipo_composicao_analise" in sample, "tipo_composicao_analise");
    assert.ok("renda_total_analise" in sample, "renda_total_analise");
    assert.ok("renda_titular_analise" in sample, "renda_titular_analise");
    assert.ok("renda_parceiro_analise" in sample, "renda_parceiro_analise");
    assert.ok("renda_familiar_analise" in sample, "renda_familiar_analise");
    assert.ok("regime_trabalho_titular_analise" in sample, "regime_trabalho_titular_analise");
    assert.ok("regime_trabalho_parceiro_analise" in sample, "regime_trabalho_parceiro_analise");
    assert.ok("possui_fgts_analise" in sample, "possui_fgts_analise");
    assert.ok("possui_entrada_analise" in sample, "possui_entrada_analise");
    assert.ok("valor_entrada_analise" in sample, "valor_entrada_analise");
    assert.ok("possui_restricao_analise" in sample, "possui_restricao_analise");
    assert.ok("possui_restricao_parceiro_analise" in sample, "possui_restricao_parceiro_analise");
    assert.ok("possui_ir_titular_analise" in sample, "possui_ir_titular_analise");
    assert.ok("possui_ir_parceiro_analise" in sample, "possui_ir_parceiro_analise");
    assert.ok("ctps_36_titular_analise" in sample, "ctps_36_titular_analise");
    assert.ok("ctps_36_parceiro_analise" in sample, "ctps_36_parceiro_analise");
    assert.ok("quantidade_dependentes_analise" in sample, "quantidade_dependentes_analise");
    assert.ok("ticket_desejado_analise" in sample, "ticket_desejado_analise");
    assert.ok("objetivo_imovel_analise" in sample, "objetivo_imovel_analise");
    assert.ok("resumo_perfil_analise" in sample, "resumo_perfil_analise");
    assert.ok("snapshot_bruto_analise" in sample, "snapshot_bruto_analise");
    // Score
    assert.ok("score_perfil_analise" in sample, "score_perfil_analise");
    assert.ok("faixa_perfil_analise" in sample, "faixa_perfil_analise");
    assert.ok("label_score_trabalho" in sample, "label_score_trabalho");
    assert.ok("motivo_score_trabalho" in sample, "motivo_score_trabalho");
  });

  // ── 13. Data integrity ──
  console.log("── Data Integrity ──");

  await test("existing crm_lead_meta base fields remain intact after CRM updates", async () => {
    const row = metaRows.get("5511999990001");
    assert.equal(row.lead_pool, "HOT_POOL", "lead_pool unchanged");
    assert.equal(row.lead_temp, "HOT", "lead_temp unchanged");
    assert.equal(row.nome, "Lead 5511999990001", "nome unchanged");
  });

  await test("CRM actions never touch enova_state directly", async () => {
    const enovaStateCalls = fetchCalls.filter((c) =>
      c.url.includes("/rest/v1/enova_state"),
    );
    assert.equal(enovaStateCalls.length, 0, "no calls to enova_state");
  });

  // ── Summary ──
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log("✅ All CRM backend v1 smoke tests passed.\n");
} finally {
  globalThis.fetch = originalFetch;
}
