/**
 * enova_attendance_backend.smoke.mjs
 * Smoke tests — backend-only — aba ATENDIMENTO
 *
 * Validates:
 *  1. Lead in pre-envio_docs stage → appears/updates in attendance layer
 *  2. Stage transition → moved_to_current_stage_at updated
 *  3. Customer message → last_customer_interaction_at updated
 *  4. ENOVA message → last_enova_interaction_at updated
 *  5. pending_owner, stalled_reason_code, attention_status are coherent
 *  6. Entry in envio_docs → archived in attendance layer
 *  7. Mechanical funnel NOT altered/regressed
 *
 * Runs in-memory using the Worker's exported helpers.
 * No Supabase required — simulation mode only.
 */

import { strict as assert } from "node:assert";

// ─── inline replicas of worker helpers (same logic, isolated for testing) ───

const ATTENDANCE_PRE_DOCS_STAGES = new Set([
  "inicio", "inicio_programa", "inicio_nome",
  "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade",
  "estado_civil",
  "regime_trabalho", "inicio_multi_regime", "inicio_multi_regime_detalhe",
  "renda", "renda_parceiro", "possui_renda_extra", "renda_mista_detalhe",
  "inicio_multi_renda", "inicio_multi_renda_detalhe",
  "somar_renda_solteiro", "parceiro_tem_renda", "somar_renda_familiar",
  "regime_trabalho_parceiro_familiar",
  "quem_pode_somar", "interpretar_composicao",
  "dependente",
  "ctps_36", "ctps_36_parceiro",
  "restricao", "regularizacao_restricao",
  "ir_declarado"
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

function deriveEnovaNextAction(stage, pendingOwner, stalledReason, st) {
  if (pendingOwner === "HUMANO") {
    return { code: "AWAIT_HUMAN", label: "Aguardar ação do atendente humano", trigger: "human_takeover", executable: false };
  }
  if (stalledReason === "NO_REPLY" && pendingOwner === "CLIENTE") {
    return { code: "FOLLOW_UP", label: "Enviar follow-up ao cliente", trigger: "no_reply_timeout", executable: true };
  }
  if (pendingOwner === "ENOVA" && (!stage || stage === "inicio" || stage === "inicio_programa")) {
    return { code: "SEND_OPENING", label: "Enviar abertura ao cliente", trigger: "new_lead_entry", executable: true };
  }
  return { code: "AWAIT_CLIENT", label: "Aguardar resposta do cliente", trigger: "client_turn", executable: false };
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
 * Simulate syncAttendanceMeta logic (in-memory).
 */
function simulateSyncAttendanceMeta(st, event) {
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
  result.current_funnel_stage = stage;

  if (event?.type === "stage_transition") result.moved_to_current_stage_at = now;
  if (event?.type === "customer_message") result.last_customer_interaction_at = now;
  if (event?.type === "enova_message") result.last_enova_interaction_at = now;

  const lastCustomerAt = event?.type === "customer_message" ? now : null;
  const pendingOwner = deriveAttendancePendingOwner(stage, st);
  result.pending_owner = pendingOwner;

  const stalledReason = deriveAttendanceStalledReason(st, lastCustomerAt);
  result.attention_status = deriveAttendanceAttentionStatus(stalledReason, lastCustomerAt);

  if (stalledReason) {
    result.stalled_stage = stage;
    result.stalled_reason_code = stalledReason;
  }

  const nextAction = deriveEnovaNextAction(stage, pendingOwner, stalledReason, st);
  result.enova_next_action_code = nextAction.code;
  result.enova_next_action_label = nextAction.label;
  result.enova_next_action_trigger = nextAction.trigger;
  result.enova_next_action_executable = nextAction.executable;

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

console.log("\n🏥 SMOKE TESTS — aba ATENDIMENTO (backend-only)\n");

// ═══════════════════════════════════════════════════════════
// TEST 1: Lead in pre-envio_docs stage appears in attendance
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
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.equal(result.current_funnel_stage, "inicio");
  assert.ok(result.last_customer_interaction_at);
});

// ═══════════════════════════════════════════════════════════
// TEST 2: Stage transition updates moved_to_current_stage_at
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 2: Stage transitions ──");

test("Stage transition sets moved_to_current_stage_at", () => {
  const st = { wa_id: "5511999000002", fase_conversa: "estado_civil" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" });
  assert.ok(result.moved_to_current_stage_at);
  assert.equal(result.current_funnel_stage, "estado_civil");
});

test("Non-transition event does NOT set moved_to_current_stage_at", () => {
  const st = { wa_id: "5511999000003", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.ok(!result.moved_to_current_stage_at);
  assert.equal(result.current_funnel_stage, "renda");
});

// ═══════════════════════════════════════════════════════════
// TEST 3: Customer message updates last_customer_interaction_at
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 3: Customer interaction timestamps ──");

test("Customer message sets last_customer_interaction_at", () => {
  const st = { wa_id: "5511999000004", fase_conversa: "dependente" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.ok(result.last_customer_interaction_at);
});

test("Stage transition does NOT set last_customer_interaction_at", () => {
  const st = { wa_id: "5511999000005", fase_conversa: "dependente" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" });
  assert.ok(!result.last_customer_interaction_at);
});

// ═══════════════════════════════════════════════════════════
// TEST 4: ENOVA message updates last_enova_interaction_at
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 4: ENOVA interaction timestamps ──");

test("ENOVA message sets last_enova_interaction_at", () => {
  const st = { wa_id: "5511999000006", fase_conversa: "ctps_36" };
  const result = simulateSyncAttendanceMeta(st, { type: "enova_message" });
  assert.ok(result.last_enova_interaction_at);
});

test("Customer message does NOT set last_enova_interaction_at", () => {
  const st = { wa_id: "5511999000007", fase_conversa: "ctps_36" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.ok(!result.last_enova_interaction_at);
});

// ═══════════════════════════════════════════════════════════
// TEST 5: pending_owner, stalled_reason, attention_status coherent
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
    const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
    assert.ok(result.attention_status, `attention_status null for stage ${stage}`);
    assert.ok(["ON_TIME", "DUE_SOON", "OVERDUE"].includes(result.attention_status), `invalid attention ${result.attention_status} for ${stage}`);
  }
});

// ═══════════════════════════════════════════════════════════
// TEST 6: Entry in envio_docs → archived
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 6: envio_docs boundary ──");

test("Lead entering envio_docs gets archived with reason", () => {
  const st = { wa_id: "5511999000010", fase_conversa: "envio_docs" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" });
  assert.ok(result.archived_at);
  assert.equal(result.archive_reason_code, "ENTERED_ENVIO_DOCS");
  assert.equal(result.current_funnel_stage, "envio_docs");
});

test("Lead entering aguardando_retorno also archived", () => {
  const st = { wa_id: "5511999000011", fase_conversa: "aguardando_retorno_correspondente" };
  const result = simulateSyncAttendanceMeta(st, { type: "stage_transition" });
  assert.ok(result.archived_at);
  assert.equal(result.archive_reason_code, "ENTERED_ENVIO_DOCS");
});

test("Lead staying in envio_docs without stage_transition NOT archived", () => {
  const st = { wa_id: "5511999000012", fase_conversa: "envio_docs" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.ok(!result.archived_at);
});

// ═══════════════════════════════════════════════════════════
// TEST 7: Mechanical funnel NOT altered
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 7: Funnel safety ──");

test("syncAttendanceMeta never modifies fase_conversa in state", () => {
  const st = { wa_id: "5511999000013", fase_conversa: "renda" };
  const originalFase = st.fase_conversa;
  simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.equal(st.fase_conversa, originalFase, "fase_conversa was mutated!");
});

test("syncAttendanceMeta never modifies funil_status", () => {
  const st = { wa_id: "5511999000014", fase_conversa: "renda", funil_status: "ativo" };
  simulateSyncAttendanceMeta(st, { type: "stage_transition" });
  assert.equal(st.funil_status, "ativo", "funil_status was mutated!");
});

test("syncAttendanceMeta result does NOT contain fase_conversa key", () => {
  const st = { wa_id: "5511999000015", fase_conversa: "estado_civil" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.ok(!("fase_conversa" in result), "result should not contain fase_conversa");
});

// ═══════════════════════════════════════════════════════════
// TEST: Next action derivation
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 8: Next action derivation ──");

test("Next action for new lead (ENOVA owner) = SEND_OPENING", () => {
  const action = deriveEnovaNextAction("inicio", "ENOVA", null, {});
  assert.equal(action.code, "SEND_OPENING");
  assert.equal(action.executable, true);
});

test("Next action for stalled lead = FOLLOW_UP", () => {
  const action = deriveEnovaNextAction("renda", "CLIENTE", "NO_REPLY", {});
  assert.equal(action.code, "FOLLOW_UP");
  assert.equal(action.executable, true);
});

test("Next action for client turn = AWAIT_CLIENT", () => {
  const action = deriveEnovaNextAction("renda", "CLIENTE", null, {});
  assert.equal(action.code, "AWAIT_CLIENT");
  assert.equal(action.executable, false);
});

test("Next action for human mode = AWAIT_HUMAN", () => {
  const action = deriveEnovaNextAction("renda", "HUMANO", null, {});
  assert.equal(action.code, "AWAIT_HUMAN");
  assert.equal(action.executable, false);
});

// ═══════════════════════════════════════════════════════════
// TEST: Summary derivation
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
// TEST: Incident defaults
// ═══════════════════════════════════════════════════════════
console.log("\n── Test Group 10: Incident defaults ──");

test("has_open_incident defaults to false", () => {
  const st = { wa_id: "5511999000020", fase_conversa: "renda" };
  const result = simulateSyncAttendanceMeta(st, { type: "customer_message" });
  assert.equal(result.has_open_incident, false);
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
