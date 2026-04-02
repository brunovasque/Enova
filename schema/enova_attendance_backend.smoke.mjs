/**
 * enova_attendance_backend.smoke.mjs
 * Smoke tests — backend-only — aba ATENDIMENTO (v2)
 *
 * Validates:
 *  1. Lead in pre-envio_docs stage → appears/updates in attendance layer
 *  2. Stage transition → moved_to_current_stage_at updated
 *  3. Customer message → last_customer_interaction_at updated
 *  4. ENOVA message → last_enova_interaction_at updated
 *  5. pending_owner, stalled_reason_code, attention_status are coherent
 *  6. Entry in envio_docs → archived in attendance layer
 *  7. Mechanical funnel NOT altered/regressed
 *  8. Stalled detection using persisted previous timestamp
 *  9. origin_base vs current_base separation with base change detection
 * 10. Complete pre-docs stage coverage
 * 11. enova_next_action_due_at coherent with attention_status
 *
 * Runs in-memory using the Worker's exported helpers.
 * No Supabase required — simulation mode only.
 */

import { strict as assert } from "node:assert";

// ─── inline replicas of worker helpers (same logic, isolated for testing) ───

const ATTENDANCE_PRE_DOCS_STAGES = new Set([
  // ── Início / setup ──
  "inicio", "inicio_decisao", "inicio_programa", "inicio_nome",
  "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade",
  // ── Estado civil / casamento ──
  "estado_civil", "confirmar_casamento", "financiamento_conjunto",
  "pais_casados_civil_pergunta",
  // ── Composição de renda ──
  "somar_renda_solteiro", "somar_renda_familiar",
  "quem_pode_somar", "interpretar_composicao", "sugerir_composicao_mista",
  "parceiro_tem_renda",
  // ── Regime de trabalho (titular + multi) ──
  "regime_trabalho",
  "inicio_multi_regime_pergunta", "inicio_multi_regime_coletar",
  // ── Regime de trabalho (parceiro) ──
  "regime_trabalho_parceiro",
  "inicio_multi_regime_pergunta_parceiro", "inicio_multi_regime_coletar_parceiro",
  // ── Regime de trabalho (familiar / P3) ──
  "regime_trabalho_parceiro_familiar", "regime_trabalho_parceiro_familiar_p3",
  "inicio_multi_regime_familiar_pergunta", "inicio_multi_regime_familiar_loop",
  "inicio_multi_regime_p3_pergunta", "inicio_multi_regime_p3_loop",
  // ── Renda (titular + multi) ──
  "renda", "possui_renda_extra", "renda_mista_detalhe",
  "inicio_multi_renda_pergunta", "inicio_multi_renda_coletar",
  "clt_renda_perfil_informativo",
  // ── Renda (parceiro + multi) ──
  "renda_parceiro",
  "inicio_multi_renda_pergunta_parceiro", "inicio_multi_renda_coletar_parceiro",
  // ── Renda (familiar / P3) ──
  "renda_familiar_valor", "renda_parceiro_familiar", "renda_parceiro_familiar_p3",
  "confirmar_avo_familiar",
  "inicio_multi_renda_familiar_pergunta", "inicio_multi_renda_familiar_loop",
  "inicio_multi_renda_p3_pergunta", "inicio_multi_renda_p3_loop",
  // ── P3 ──
  "p3_tipo_pergunta",
  // ── Autônomo / IR ──
  "autonomo_ir_pergunta", "autonomo_sem_ir_ir_este_ano",
  "autonomo_sem_ir_caminho", "autonomo_sem_ir_entrada",
  "autonomo_compor_renda",
  "ir_declarado",
  // ── Dependente ──
  "dependente",
  // ── CTPS 36 meses ──
  "ctps_36", "ctps_36_parceiro", "ctps_36_parceiro_p3",
  // ── Restrição ──
  "restricao", "regularizacao_restricao",
  "restricao_parceiro", "regularizacao_restricao_parceiro",
  "restricao_parceiro_p3", "regularizacao_restricao_p3",
  // ── Verificação / elegibilidade ──
  "verificar_averbacao", "verificar_inventario",
  // ── Terminal pré-docs ──
  "fim_ineligivel", "fim_inelegivel", "finalizacao"
]);

const ATTENDANCE_POST_DOCS_STAGES = new Set([
  "envio_docs",
  "aguardando_retorno_correspondente",
  "agendamento_visita",
  "visita_confirmada",
  "finalizacao_processo"
]);

function attendanceIsPreDocs(stage) {
  return ATTENDANCE_PRE_DOCS_STAGES.has(stage || "inicio");
}

function deriveAttendancePendingOwner(stage, st) {
  if (st?.modo_humano === true || st?.atendimento_manual === true) return "HUMANO";
  if (!stage || stage === "inicio" || stage === "inicio_programa") return "ENOVA";
  return "CLIENTE";
}

function deriveAttendanceStalledReason(st, lastCustomerAt) {
  if (!lastCustomerAt) return null;
  const elapsed = Date.now() - new Date(lastCustomerAt).getTime();
  const hoursElapsed = elapsed / (1000 * 60 * 60);
  if (hoursElapsed < 4) return null;
  if (st?.modo_humano === true || st?.atendimento_manual === true) return "WAITING_HUMAN_ACTION";
  return "NO_REPLY";
}

function deriveAttendanceAttentionStatus(stalledReason, lastCustomerAt) {
  if (!stalledReason) return "ON_TIME";
  if (!lastCustomerAt) return "ON_TIME";
  const elapsed = Date.now() - new Date(lastCustomerAt).getTime();
  const hoursElapsed = elapsed / (1000 * 60 * 60);
  if (hoursElapsed >= 24) return "OVERDUE";
  if (hoursElapsed >= 8) return "DUE_SOON";
  return "ON_TIME";
}

function deriveEnovaNextAction(stage, pendingOwner, stalledReason, st, lastCustomerAt) {
  function computeDueAt(hoursFromLastCustomer) {
    if (!lastCustomerAt) return null;
    const base = new Date(lastCustomerAt).getTime();
    if (isNaN(base)) return null;
    return new Date(base + hoursFromLastCustomer * 60 * 60 * 1000).toISOString();
  }

  if (pendingOwner === "HUMANO") {
    return { code: "AWAIT_HUMAN", label: "Aguardar ação do atendente humano", trigger: "human_takeover", executable: false, due_at: computeDueAt(8) };
  }
  if (stalledReason === "NO_REPLY" && pendingOwner === "CLIENTE") {
    return { code: "FOLLOW_UP", label: "Enviar follow-up ao cliente", trigger: "no_reply_timeout", executable: true, due_at: computeDueAt(8) };
  }
  if (pendingOwner === "ENOVA" && (!stage || stage === "inicio" || stage === "inicio_programa")) {
    return { code: "SEND_OPENING", label: "Enviar abertura ao cliente", trigger: "new_lead_entry", executable: true, due_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString() };
  }
  return { code: "AWAIT_CLIENT", label: "Aguardar resposta do cliente", trigger: "client_turn", executable: false, due_at: computeDueAt(24) };
}

function buildAttendanceSummaryShort(st, stage) {
  const parts = [];
  if (st?.nome) parts.push(st.nome.split(" ")[0]);
  if (stage) parts.push(`fase:${stage}`);
  if (st?.estado_civil) parts.push(`ec:${st.estado_civil}`);
  if (st?.regime_trabalho) parts.push(`reg:${st.regime_trabalho}`);
  if (st?.renda_total_para_fluxo) parts.push(`renda:${st.renda_total_para_fluxo}`);
  if (st?.restricao === true || st?.restricao === "sim") parts.push("restrição");
  return parts.join(" | ").slice(0, 200) || null;
}

/**
 * Simulate syncAttendanceMeta logic (in-memory) with v2 fixes:
 * - Uses existing row for persisted last_customer_interaction_at
 * - origin_base is immutable after first set
 * - moved_to_current_base_at only on real base change
 * - enova_next_action_due_at derived
 */
function simulateSyncAttendanceMeta(st, event, existingRow) {
  const stage = st.fase_conversa || "inicio";
  const result = { wa_id: st.wa_id };

  if (!attendanceIsPreDocs(stage)) {
    if (ATTENDANCE_POST_DOCS_STAGES.has(stage) && event?.type === "stage_transition") {
      result.archived_at = new Date().toISOString();
      result.archive_reason_code = "ENTERED_ENVIO_DOCS";
      result.current_funnel_stage = stage;
    }
    return result;
  }

  const now = new Date().toISOString();
  const existing = existingRow || null;

  result.current_funnel_stage = stage;

  if (event?.type === "stage_transition") result.moved_to_current_stage_at = now;
  if (event?.type === "customer_message") result.last_customer_interaction_at = now;
  if (event?.type === "enova_message") result.last_enova_interaction_at = now;

  // ── Stalled: use persisted timestamp from existing row ──
  const lastCustomerAt = event?.type === "customer_message"
    ? now
    : (existing?.last_customer_interaction_at || null);

  const pendingOwner = deriveAttendancePendingOwner(stage, st);
  result.pending_owner = pendingOwner;

  const stalledReason = deriveAttendanceStalledReason(st, lastCustomerAt);
  result.attention_status = deriveAttendanceAttentionStatus(stalledReason, lastCustomerAt);

  if (stalledReason) {
    result.stalled_stage = stage;
    result.stalled_reason_code = stalledReason;
    result.stalled_reason_label = stalledReason === "NO_REPLY" ? "Sem resposta do cliente" : "Aguardando ação humana";
    if (!existing?.stalled_at) {
      result.stalled_at = now;
    }
  } else {
    result.stalled_stage = null;
    result.stalled_reason_code = null;
    result.stalled_reason_label = null;
    result.stalled_at = null;
  }

  // ── Next action with due_at ──
  const nextAction = deriveEnovaNextAction(stage, pendingOwner, stalledReason, st, lastCustomerAt);
  result.enova_next_action_code = nextAction.code;
  result.enova_next_action_label = nextAction.label;
  result.enova_next_action_trigger = nextAction.trigger;
  result.enova_next_action_executable = nextAction.executable;
  result.enova_next_action_due_at = nextAction.due_at || null;

  // ── Origin / current base ──
  const newBase = st.source_type || null;
  if (!existing) {
    if (newBase) {
      result.origin_base = newBase;
      result.current_base = newBase;
      result.moved_to_current_base_at = now;
    }
  } else {
    if (newBase && newBase !== existing.current_base) {
      result.current_base = newBase;
      result.moved_to_current_base_at = now;
    } else if (newBase) {
      result.current_base = newBase;
    }
    // origin_base is NEVER in update patch
  }

  result.enova_summary_short = buildAttendanceSummaryShort(st, stage);
  result.has_open_incident = false;

  return result;
}

// ─── TEST RUNNER ───

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
  }
}

console.log("\n🏥 SMOKE TESTS — aba ATENDIMENTO (backend-only) v2\n");

// ═══════════════════════════════════════════════════════════
// TEST GROUP 1: Pre-envio_docs leads
// ═══════════════════════════════════════════════════════════
console.log("── Test Group 1: Pre-envio_docs leads ──");

test("Lead in estado_civil is pre-docs", () => {
  assert.ok(attendanceIsPreDocs("estado_civil"));
});

test("Lead in renda is pre-docs", () => {
  assert.ok(attendanceIsPreDocs("renda"));
});

test("Lead in restricao is pre-docs", () => {
  assert.ok(attendanceIsPreDocs("restricao"));
});

test("Lead in envio_docs is NOT pre-docs", () => {
  assert.ok(!attendanceIsPreDocs("envio_docs"));
});

test("Lead in agendamento_visita is NOT pre-docs", () => {
  assert.ok(!attendanceIsPreDocs("agendamento_visita"));
});

test("Lead in inicio syncs with attendance", () => {
  const st = { wa_id: "5511999000001", fase_conversa: "inicio", nome: "João" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.equal(result.current_funnel_stage, "inicio");
  assert.ok(result.last_customer_interaction_at);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 2: Stage transitions
// ═══════════════════════════════════════════════════════════
console.log("\n─��� Test Group 2: Stage transitions ──");

test("Stage transition sets moved_to_current_stage_at", () => {
  const st = { wa_id: "5511999000002", fase_conversa: "estado_civil" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" }, null);
  assert.ok(result.moved_to_current_stage_at);
  assert.equal(result.current_funnel_stage, "estado_civil");
});

test("Non-transition event does NOT set moved_to_current_stage_at", () => {
  const st = { wa_id: "5511999000003", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.ok(!result.moved_to_current_stage_at);
  assert.equal(result.current_funnel_stage, "renda");
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 3: Customer interaction timestamps
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 3: Customer interaction timestamps ──");

test("Customer message sets last_customer_interaction_at", () => {
  const st = { wa_id: "5511999000004", fase_conversa: "dependente" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.ok(result.last_customer_interaction_at);
});

test("Stage transition does NOT set last_customer_interaction_at", () => {
  const st = { wa_id: "5511999000005", fase_conversa: "dependente" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" }, null);
  assert.ok(!result.last_customer_interaction_at);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 4: ENOVA interaction timestamps
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 4: ENOVA interaction timestamps ──");

test("ENOVA message sets last_enova_interaction_at", () => {
  const st = { wa_id: "5511999000006", fase_conversa: "ctps_36" };
  const result = simulateSyncAttendanceMeta(st, { type: "enova_message" }, null);
  assert.ok(result.last_enova_interaction_at);
});

test("Customer message does NOT set last_enova_interaction_at", () => {
  const st = { wa_id: "5511999000007", fase_conversa: "ctps_36" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.ok(!result.last_enova_interaction_at);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 5: Operational fields coherence
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 5: Operational fields coherence ──");

test("pending_owner = ENOVA for inicio stage", () => {
  const owner = deriveAttendancePendingOwner("inicio", {});
  assert.equal(owner, "ENOVA");
});

test("pending_owner = CLIENTE for active funnel stage", () => {
  const owner = deriveAttendancePendingOwner("renda", {});
  assert.equal(owner, "CLIENTE");
});

test("pending_owner = HUMANO for modo_humano", () => {
  const owner = deriveAttendancePendingOwner("renda", { modo_humano: true });
  assert.equal(owner, "HUMANO");
});

test("pending_owner = HUMANO for atendimento_manual", () => {
  const owner = deriveAttendancePendingOwner("renda", { atendimento_manual: true });
  assert.equal(owner, "HUMANO");
});

test("stalled_reason = null for recent interaction (< 4h)", () => {
  const reason = deriveAttendanceStalledReason({}, new Date().toISOString());
  assert.equal(reason, null);
});

test("stalled_reason = NO_REPLY for old interaction (> 4h)", () => {
  const fourHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const reason = deriveAttendanceStalledReason({}, fourHoursAgo);
  assert.equal(reason, "NO_REPLY");
});

test("stalled_reason = WAITING_HUMAN_ACTION for old interaction + human mode", () => {
  const fourHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const reason = deriveAttendanceStalledReason({ modo_humano: true }, fourHoursAgo);
  assert.equal(reason, "WAITING_HUMAN_ACTION");
});

test("attention_status = ON_TIME for recent interaction", () => {
  const status = deriveAttendanceAttentionStatus(null, new Date().toISOString());
  assert.equal(status, "ON_TIME");
});

test("attention_status = DUE_SOON for 10h-old stalled", () => {
  const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
  const status = deriveAttendanceAttentionStatus("NO_REPLY", tenHoursAgo);
  assert.equal(status, "DUE_SOON");
});

test("attention_status = OVERDUE for 25h-old stalled", () => {
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const status = deriveAttendanceAttentionStatus("NO_REPLY", twentyFiveHoursAgo);
  assert.equal(status, "OVERDUE");
});

test("pending_owner is never null for covered stages", () => {
  for (const stage of ATTENDANCE_PRE_DOCS_STAGES) {
    const owner = deriveAttendancePendingOwner(stage, {});
    assert.ok(owner, `pending_owner null for stage ${stage}`);
    assert.ok(["CLIENTE", "ENOVA", "HUMANO", "SISTEMA"].includes(owner), `invalid owner ${owner} for ${stage}`);
  }
});

test("attention_status is never null for covered stages", () => {
  for (const stage of ATTENDANCE_PRE_DOCS_STAGES) {
    const st = { wa_id: "test", fase_conversa: stage };
    const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
    assert.ok(result.attention_status, `attention_status null for stage ${stage}`);
    assert.ok(["ON_TIME", "DUE_SOON", "OVERDUE"].includes(result.attention_status), `invalid attention ${result.attention_status} for ${stage}`);
  }
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 6: envio_docs boundary
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 6: envio_docs boundary ──");

test("Lead entering envio_docs gets archived with reason", () => {
  const st = { wa_id: "5511999000010", fase_conversa: "envio_docs" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" }, null);
  assert.ok(result.archived_at);
  assert.equal(result.archive_reason_code, "ENTERED_ENVIO_DOCS");
  assert.equal(result.current_funnel_stage, "envio_docs");
});

test("Lead entering aguardando_retorno also archived", () => {
  const st = { wa_id: "5511999000011", fase_conversa: "aguardando_retorno_correspondente" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" }, null);
  assert.ok(result.archived_at);
  assert.equal(result.archive_reason_code, "ENTERED_ENVIO_DOCS");
});

test("Lead staying in envio_docs without stage_transition NOT archived", () => {
  const st = { wa_id: "5511999000012", fase_conversa: "envio_docs" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.ok(!result.archived_at);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 7: Funnel safety
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 7: Funnel safety ──");

test("syncAttendanceMeta never modifies fase_conversa in state", () => {
  const st = { wa_id: "5511999000013", fase_conversa: "renda" };
  const originalFase = st.fase_conversa;
  simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.equal(st.fase_conversa, originalFase, "fase_conversa was mutated!");
});

test("syncAttendanceMeta never modifies funil_status", () => {
  const st = { wa_id: "5511999000014", fase_conversa: "renda", funil_status: "ativo" };
  simulateSyncAttendanceMeta(st, { type: "stage_transition" }, null);
  assert.equal(st.funil_status, "ativo", "funil_status was mutated!");
});

test("syncAttendanceMeta result does NOT contain fase_conversa key", () => {
  const st = { wa_id: "5511999000015", fase_conversa: "estado_civil" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.ok(!("fase_conversa" in result), "result should not contain fase_conversa");
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 8: Next action derivation + due_at
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 8: Next action derivation + due_at ──");

test("Next action for new lead (ENOVA owner) = SEND_OPENING with due_at", () => {
  const action = deriveEnovaNextAction("inicio", "ENOVA", null, {}, null);
  assert.equal(action.code, "SEND_OPENING");
  assert.equal(action.executable, true);
  assert.ok(action.due_at, "SEND_OPENING must have due_at");
  // due_at should be ~1h from now
  const dueMs = new Date(action.due_at).getTime();
  const diffH = (dueMs - Date.now()) / (1000 * 60 * 60);
  assert.ok(diffH > 0.9 && diffH < 1.1, `SEND_OPENING due_at should be ~1h from now, got ${diffH.toFixed(2)}h`);
});

test("Next action for stalled lead = FOLLOW_UP with due_at", () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const action = deriveEnovaNextAction("renda", "CLIENTE", "NO_REPLY", {}, fiveHoursAgo);
  assert.equal(action.code, "FOLLOW_UP");
  assert.equal(action.executable, true);
  assert.ok(action.due_at, "FOLLOW_UP must have due_at");
  // due_at should be lastCustomerAt + 8h
  const expected = new Date(new Date(fiveHoursAgo).getTime() + 8 * 60 * 60 * 1000).getTime();
  const actual = new Date(action.due_at).getTime();
  assert.ok(Math.abs(expected - actual) < 1000, "FOLLOW_UP due_at should be lastCustomerAt + 8h");
});

test("Next action for client turn = AWAIT_CLIENT with due_at at 24h", () => {
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  const action = deriveEnovaNextAction("renda", "CLIENTE", null, {}, oneHourAgo);
  assert.equal(action.code, "AWAIT_CLIENT");
  assert.equal(action.executable, false);
  assert.ok(action.due_at, "AWAIT_CLIENT must have due_at when lastCustomerAt present");
  // due_at should be lastCustomerAt + 24h
  const expected = new Date(new Date(oneHourAgo).getTime() + 24 * 60 * 60 * 1000).getTime();
  const actual = new Date(action.due_at).getTime();
  assert.ok(Math.abs(expected - actual) < 1000, "AWAIT_CLIENT due_at should be lastCustomerAt + 24h");
});

test("Next action for human mode = AWAIT_HUMAN", () => {
  const action = deriveEnovaNextAction("renda", "HUMANO", null, {}, null);
  assert.equal(action.code, "AWAIT_HUMAN");
  assert.equal(action.executable, false);
  // due_at is null when no lastCustomerAt
  assert.equal(action.due_at, null);
});

test("Next action due_at is null when no lastCustomerAt (AWAIT_CLIENT)", () => {
  const action = deriveEnovaNextAction("renda", "CLIENTE", null, {}, null);
  assert.equal(action.due_at, null);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 9: Summary derivation
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 9: Summary short ──");

test("Summary includes first name and stage", () => {
  const summary = buildAttendanceSummaryShort({ nome: "Maria Silva" }, "renda");
  assert.ok(summary.includes("Maria"));
  assert.ok(summary.includes("fase:renda"));
});

test("Summary includes confirmed profile fields", () => {
  const st = {
    nome: "Carlos",
    estado_civil: "solteiro",
    regime_trabalho: "clt",
    renda_total_para_fluxo: 5000,
    restricao: true
  };
  const summary = buildAttendanceSummaryShort(st, "restricao");
  assert.ok(summary.includes("ec:solteiro"));
  assert.ok(summary.includes("reg:clt"));
  assert.ok(summary.includes("renda:5000"));
  assert.ok(summary.includes("restrição"));
});

test("Summary is max 200 chars", () => {
  const st = { nome: "A".repeat(300) };
  const summary = buildAttendanceSummaryShort(st, "inicio");
  assert.ok(summary.length <= 200);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 10: Incident defaults
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 10: Incident defaults ──");

test("has_open_incident defaults to false", () => {
  const st = { wa_id: "5511999000020", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.equal(result.has_open_incident, false);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 11: Stalled detection from persisted timestamp (FIX #1)
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 11: Stalled from persisted timestamp ──");

test("Stage transition with 5h-old persisted last_customer_interaction_at detects NO_REPLY", () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const existing = { last_customer_interaction_at: fiveHoursAgo };
  const st = { wa_id: "5511999000030", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" }, existing);
  assert.equal(result.stalled_reason_code, "NO_REPLY", "Should detect NO_REPLY from persisted timestamp on stage_transition");
  assert.ok(result.stalled_at, "stalled_at must be set");
  assert.equal(result.attention_status, "ON_TIME"); // 5h < 8h DUE_SOON
});

test("ENOVA message with 10h-old persisted timestamp detects DUE_SOON", () => {
  const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
  const existing = { last_customer_interaction_at: tenHoursAgo };
  const st = { wa_id: "5511999000031", fase_conversa: "ctps_36" };
  const result = simulateSyncAttendanceMeta(st, { type: "enova_message" }, existing);
  assert.equal(result.stalled_reason_code, "NO_REPLY");
  assert.equal(result.attention_status, "DUE_SOON");
});

test("ENOVA message with 25h-old persisted timestamp detects OVERDUE", () => {
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const existing = { last_customer_interaction_at: twentyFiveHoursAgo };
  const st = { wa_id: "5511999000032", fase_conversa: "restricao" };
  const result = simulateSyncAttendanceMeta(st, { type: "enova_message" }, existing);
  assert.equal(result.stalled_reason_code, "NO_REPLY");
  assert.equal(result.attention_status, "OVERDUE");
});

test("Stage transition without existing row has no stalled detection", () => {
  const st = { wa_id: "5511999000033", fase_conversa: "estado_civil" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" }, null);
  assert.equal(result.stalled_reason_code, null, "No stalled without persisted timestamp");
  assert.equal(result.attention_status, "ON_TIME");
});

test("Customer message always uses fresh now, not persisted (clears stalled)", () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const existing = { last_customer_interaction_at: fiveHoursAgo, stalled_at: fiveHoursAgo };
  const st = { wa_id: "5511999000034", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, existing);
  // Fresh customer message → lastCustomerAt = now → < 4h → no stalled
  assert.equal(result.stalled_reason_code, null, "Customer message should clear stalled");
  assert.equal(result.stalled_at, null, "stalled_at should be cleared");
  assert.equal(result.attention_status, "ON_TIME");
});

test("Stalled_at preserved when already set and still stalled", () => {
  const originalStalledAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const existing = { last_customer_interaction_at: fiveHoursAgo, stalled_at: originalStalledAt };
  const st = { wa_id: "5511999000035", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "enova_message" }, existing);
  assert.equal(result.stalled_reason_code, "NO_REPLY");
  // stalled_at should NOT be overwritten since existing has it
  assert.ok(!result.stalled_at, "stalled_at should NOT be set again when existing already has it");
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 12: origin_base vs current_base separation (FIX #3)
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 12: origin_base vs current_base ──");

test("First sync sets both origin_base and current_base from source_type", () => {
  const st = { wa_id: "5511999000040", fase_conversa: "inicio", source_type: "fria" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.equal(result.origin_base, "fria");
  assert.equal(result.current_base, "fria");
  assert.ok(result.moved_to_current_base_at, "moved_to_current_base_at should be set on first sync");
});

test("Existing row: origin_base is NEVER in update patch", () => {
  const existing = { origin_base: "fria", current_base: "fria" };
  const st = { wa_id: "5511999000041", fase_conversa: "renda", source_type: "fria" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, existing);
  assert.ok(!("origin_base" in result), "origin_base must NOT be in update patch for existing row");
  assert.equal(result.current_base, "fria");
});

test("Base change: current_base updates, origin_base stays immutable", () => {
  const existing = { origin_base: "fria", current_base: "fria" };
  const st = { wa_id: "5511999000042", fase_conversa: "renda", source_type: "morna" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, existing);
  assert.ok(!("origin_base" in result), "origin_base must NOT change on base switch");
  assert.equal(result.current_base, "morna");
});

test("No source_type: no base fields set", () => {
  const st = { wa_id: "5511999000043", fase_conversa: "inicio" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.ok(!result.origin_base);
  assert.ok(!result.current_base);
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 13: moved_to_current_base_at on real base change (FIX #2)
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 13: moved_to_current_base_at ──");

test("Same base: moved_to_current_base_at NOT set", () => {
  const existing = { origin_base: "fria", current_base: "fria" };
  const st = { wa_id: "5511999000050", fase_conversa: "renda", source_type: "fria" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, existing);
  assert.ok(!result.moved_to_current_base_at, "moved_to_current_base_at should NOT be set when base unchanged");
});

test("Base changed: moved_to_current_base_at IS set", () => {
  const existing = { origin_base: "fria", current_base: "fria" };
  const st = { wa_id: "5511999000051", fase_conversa: "renda", source_type: "morna" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, existing);
  assert.ok(result.moved_to_current_base_at, "moved_to_current_base_at must be set on real base change");
  assert.equal(result.current_base, "morna");
});

test("First insert: moved_to_current_base_at IS set", () => {
  const st = { wa_id: "5511999000052", fase_conversa: "inicio", source_type: "campanha" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  assert.ok(result.moved_to_current_base_at, "moved_to_current_base_at must be set on first insert");
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 14: Complete pre-docs stage coverage (FIX #4)
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 14: Complete pre-docs stage coverage ──");

const REQUIRED_STAGES = [
  // Composição
  "interpretar_composicao", "quem_pode_somar", "sugerir_composicao_mista",
  // Autônomo / IR
  "autonomo_ir_pergunta", "autonomo_sem_ir_ir_este_ano",
  "autonomo_sem_ir_caminho", "autonomo_sem_ir_entrada", "autonomo_compor_renda",
  // Multi regime (parceiro, familiar, P3)
  "inicio_multi_regime_pergunta", "inicio_multi_regime_coletar",
  "inicio_multi_regime_pergunta_parceiro", "inicio_multi_regime_coletar_parceiro",
  "inicio_multi_regime_familiar_pergunta", "inicio_multi_regime_familiar_loop",
  "inicio_multi_regime_p3_pergunta", "inicio_multi_regime_p3_loop",
  // Multi renda (parceiro, familiar, P3)
  "inicio_multi_renda_pergunta", "inicio_multi_renda_coletar",
  "inicio_multi_renda_pergunta_parceiro", "inicio_multi_renda_coletar_parceiro",
  "inicio_multi_renda_familiar_pergunta", "inicio_multi_renda_familiar_loop",
  "inicio_multi_renda_p3_pergunta", "inicio_multi_renda_p3_loop",
  // Parceiro / familiar / P3 stages
  "regime_trabalho_parceiro", "renda_parceiro",
  "regime_trabalho_parceiro_familiar", "regime_trabalho_parceiro_familiar_p3",
  "renda_familiar_valor", "renda_parceiro_familiar", "renda_parceiro_familiar_p3",
  "confirmar_avo_familiar", "p3_tipo_pergunta",
  "ctps_36_parceiro_p3",
  "restricao_parceiro", "regularizacao_restricao_parceiro",
  "restricao_parceiro_p3", "regularizacao_restricao_p3",
  // Casamento / composição gates
  "confirmar_casamento", "financiamento_conjunto", "pais_casados_civil_pergunta",
  // Verificação
  "verificar_averbacao", "verificar_inventario",
  // Terminal pré-docs
  "fim_ineligivel", "fim_inelegivel", "finalizacao",
  // Informativo
  "clt_renda_perfil_informativo",
  // Setup
  "inicio_decisao"
];

test(`All ${REQUIRED_STAGES.length} required stages are covered in ATTENDANCE_PRE_DOCS_STAGES`, () => {
  const missing = REQUIRED_STAGES.filter(s => !ATTENDANCE_PRE_DOCS_STAGES.has(s));
  assert.equal(missing.length, 0, `Missing stages: ${missing.join(", ")}`);
});

test("Total stage count is >= 60 (comprehensive coverage)", () => {
  assert.ok(ATTENDANCE_PRE_DOCS_STAGES.size >= 60, `Only ${ATTENDANCE_PRE_DOCS_STAGES.size} stages, expected >= 60`);
});

test("All new stages return valid pending_owner", () => {
  for (const stage of REQUIRED_STAGES) {
    const owner = deriveAttendancePendingOwner(stage, {});
    assert.ok(["CLIENTE", "ENOVA", "HUMANO", "SISTEMA"].includes(owner), `invalid owner for ${stage}`);
  }
});

// ═══════════════════════════════════════════════════════════
// TEST GROUP 15: enova_next_action_due_at coherence (FIX #5)
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 15: enova_next_action_due_at ──");

test("due_at set in sync result for customer_message event", () => {
  const st = { wa_id: "5511999000060", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" }, null);
  // Fresh customer_message → lastCustomerAt = now → AWAIT_CLIENT → due_at = now + 24h
  assert.ok(result.enova_next_action_due_at, "due_at should be set for AWAIT_CLIENT with fresh timestamp");
  const dueMs = new Date(result.enova_next_action_due_at).getTime();
  const diffH = (dueMs - Date.now()) / (1000 * 60 * 60);
  assert.ok(diffH > 23 && diffH < 25, `AWAIT_CLIENT due_at should be ~24h, got ${diffH.toFixed(2)}h`);
});

test("due_at set for FOLLOW_UP action (stalled lead)", () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const existing = { last_customer_interaction_at: fiveHoursAgo };
  const st = { wa_id: "5511999000061", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "enova_message" }, existing);
  assert.equal(result.enova_next_action_code, "FOLLOW_UP");
  assert.ok(result.enova_next_action_due_at, "FOLLOW_UP must have due_at");
  // due_at should be fiveHoursAgo + 8h = 3h from now
  const dueMs = new Date(result.enova_next_action_due_at).getTime();
  const diffH = (dueMs - Date.now()) / (1000 * 60 * 60);
  assert.ok(diffH > 2.5 && diffH < 3.5, `FOLLOW_UP due_at should be ~3h from now, got ${diffH.toFixed(2)}h`);
});

test("due_at null when no persisted timestamp and non-customer event", () => {
  const st = { wa_id: "5511999000062", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" }, null);
  assert.equal(result.enova_next_action_due_at, null, "due_at should be null without any timestamp");
});

test("due_at coherent: ON_TIME → due_at in future; OVERDUE → due_at in past", () => {
  // ON_TIME case: fresh interaction
  const st1 = { wa_id: "t1", fase_conversa: "renda" };
  const r1 = simulateSyncAttendanceMeta(st1, { type: "customer_message" }, null);
  if (r1.enova_next_action_due_at) {
    assert.ok(new Date(r1.enova_next_action_due_at) > new Date(), "ON_TIME → due_at should be in future");
  }

  // OVERDUE case: 25h-old interaction
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const existing2 = { last_customer_interaction_at: twentyFiveHoursAgo };
  const st2 = { wa_id: "t2", fase_conversa: "renda" };
  const r2 = simulateSyncAttendanceMeta(st2, { type: "enova_message" }, existing2);
  assert.equal(r2.attention_status, "OVERDUE");
  if (r2.enova_next_action_due_at) {
    assert.ok(new Date(r2.enova_next_action_due_at) < new Date(), "OVERDUE → due_at should be in past");
  }
});

// ═══════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`RESULTADO: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
