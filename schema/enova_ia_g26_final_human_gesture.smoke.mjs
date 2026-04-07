// ============================================================
// Smoke tests — enova-ia G2.6 — Gesto Final Humano
// Autorização de Execução Controlada Futura
//
// Executa os módulos REAIS:
//   - panel/app/lib/enova-ia-pre-execution.ts  (G2.5 + G2.6)
//   - panel/app/lib/enova-ia-preparation.ts    (G2.3 + G2.5 + G2.6)
//   - panel/app/lib/enova-ia-action-builder.ts (draft de origem)
//
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Cobre:
//   1.  Exportações G2.6 presentes no módulo pre-execution
//   2.  Estado authorized_for_controlled_execution na máquina de estados
//   3.  Ação autorizar_execucao_controlada na máquina de estados
//   4.  Transição canônica: pre_execution_ready → authorized_for_controlled_execution
//   5.  authorized_for_controlled_execution aceita preparar_contrato_execucao (G3.1)
//   6.  Transições inválidas para autorizar_execucao_controlada retornam null
//   7.  Labels para authorized_for_controlled_execution
//   8.  Texto de apoio contém "nenhuma execução"
//   9.  buildExecutionAuthorizationPackage — campos obrigatórios
//  10.  authorized_by_human: true (garantia canônica)
//  11.  not_yet_executed: true (garantia canônica)
//  12.  authorization_status: "authorized_for_controlled_execution" (garantia canônica)
//  13.  readiness_status: "pre_execution_ready" (rastreabilidade de origem)
//  14.  final_human_gesture_required: false (gesto cumprido)
//  15.  explicit_notice não vazio
//  16.  pre_execution_package_ref referencia o action_id correto
//  17.  authorized_at_local é uma string ISO não vazia
//  18.  EXECUTION_AUTHORIZATION_NOTICE contém "NÃO foi executada"
//  19.  Função pura: sem side effect, sem mutação
//  20.  Determinismo: campos estruturais iguais em chamadas consecutivas
//  21.  Fluxo completo: draft → … → pre_execution_ready → authorized_for_controlled_execution
//  22.  Backward compatibility: estados anteriores (G2.3–G2.5) não afetados
//  23.  pre_execution_ready agora aceita autorizar_execucao_controlada [G2.6]
//  24.  PREPARATION_VALID_ACTIONS[authorized] tem preparar_contrato_execucao (G3.1)
//  25.  Estado anterior pre_execution_ready ainda existe e é válido
// ============================================================

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const preExecPath = resolve(__dirname, "../panel/app/lib/enova-ia-pre-execution.ts");
const prepPath    = resolve(__dirname, "../panel/app/lib/enova-ia-preparation.ts");
const builderPath = resolve(__dirname, "../panel/app/lib/enova-ia-action-builder.ts");

// ── Importar módulos REAIS ────────────────────────────────────────────────

const {
  buildPreExecutionPackage,
  buildExecutionAuthorizationPackage,
  EXECUTION_AUTHORIZATION_NOTICE,
  PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE,
} = await import(preExecPath);

const {
  PREPARATION_STATUS_LABEL,
  PREPARATION_STATUS_SUPPORT_TEXT,
  PREPARATION_VALID_ACTIONS,
  transitionPreparationStatus,
  PREPARATION_INITIAL_STATUS,
} = await import(prepPath);

const { buildEnovaIaActionDraft } = await import(builderPath);

// ── Helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Draft de exemplo para testes ─────────────────────────────────────────

const SAMPLE_RESPONSE = {
  mode:                "plano_de_acao",
  confidence:          "alta",
  answer_title:        "Follow-up lead G2.6 test",
  answer_summary:      "Executar follow-up nos leads prioritários",
  analysis_points:     ["Lead A parado há 10 dias"],
  recommended_actions: ["Enviar follow-up direto", "Ligar para confirmar interesse"],
  relevant_leads:      [{ name: "Lead A", reason: "Parado há 10 dias" }],
  risks:               [],
  should_escalate_human: false,
  notes:               "",
};

const sampleDraft = buildEnovaIaActionDraft(SAMPLE_RESPONSE, "prompt g2.6 test");
assert.ok(sampleDraft, "sampleDraft deve ser válido para continuar os testes");

// ── 1. Exportações G2.6 presentes ─────────────────────────────────────────

console.log("\n── 1. Exportações G2.6 presentes no módulo pre-execution ─────────");

test("buildExecutionAuthorizationPackage é uma função exportada", () => {
  assert.strictEqual(typeof buildExecutionAuthorizationPackage, "function");
});

test("EXECUTION_AUTHORIZATION_NOTICE é uma string exportada", () => {
  assert.strictEqual(typeof EXECUTION_AUTHORIZATION_NOTICE, "string");
  assert.ok(EXECUTION_AUTHORIZATION_NOTICE.length > 0, "não deve ser vazia");
});

// ── 2. Estado authorized_for_controlled_execution na máquina de estados ──

console.log("\n── 2. Estado authorized_for_controlled_execution na máquina ──────");

test("PREPARATION_STATUS_LABEL tem entrada para authorized_for_controlled_execution", () => {
  assert.ok(
    "authorized_for_controlled_execution" in PREPARATION_STATUS_LABEL,
    "deve existir no map de labels",
  );
  assert.ok(
    PREPARATION_STATUS_LABEL["authorized_for_controlled_execution"].length > 0,
    "label não deve ser vazio",
  );
});

test("PREPARATION_STATUS_SUPPORT_TEXT tem entrada para authorized_for_controlled_execution", () => {
  assert.ok(
    "authorized_for_controlled_execution" in PREPARATION_STATUS_SUPPORT_TEXT,
    "deve existir no map de support text",
  );
  assert.ok(
    PREPARATION_STATUS_SUPPORT_TEXT["authorized_for_controlled_execution"].length > 0,
    "support text não deve ser vazio",
  );
});

// ── 3. Ação autorizar_execucao_controlada na máquina de estados ──────────

console.log("\n── 3. Ação autorizar_execucao_controlada na máquina ─────────────");

test("PREPARATION_VALID_ACTIONS[pre_execution_ready] inclui autorizar_execucao_controlada", () => {
  assert.ok(
    PREPARATION_VALID_ACTIONS["pre_execution_ready"].includes("autorizar_execucao_controlada"),
    "pre_execution_ready deve aceitar autorizar_execucao_controlada",
  );
});

// ── 4. Transição canônica ─────────────────────────────────────────────────

console.log("\n── 4. Transição canônica pre_execution_ready → authorized ────────");

test("pre_execution_ready + autorizar_execucao_controlada → authorized_for_controlled_execution", () => {
  const next = transitionPreparationStatus(
    "pre_execution_ready",
    "autorizar_execucao_controlada",
  );
  assert.strictEqual(next, "authorized_for_controlled_execution");
});

// ── 5. authorized_for_controlled_execution é terminal ────────────────────

console.log("\n── 5. authorized_for_controlled_execution é terminal ─────────────");

test("authorized_for_controlled_execution tem 1 ação válida (G3.1: preparar_contrato_execucao)", () => {
  const actions = PREPARATION_VALID_ACTIONS["authorized_for_controlled_execution"];
  assert.ok(Array.isArray(actions), "deve ser array");
  assert.strictEqual(actions.length, 1, "deve ter 1 ação (preparar_contrato_execucao adicionada em G3.1)");
  assert.ok(actions.includes("preparar_contrato_execucao"), "deve incluir preparar_contrato_execucao");
});

test("autorizar_execucao_controlada a partir de authorized retorna null", () => {
  const next = transitionPreparationStatus(
    "authorized_for_controlled_execution",
    "autorizar_execucao_controlada",
  );
  assert.strictEqual(next, null);
});

test("revisar a partir de authorized retorna null", () => {
  const next = transitionPreparationStatus("authorized_for_controlled_execution", "revisar");
  assert.strictEqual(next, null);
});

test("aprovar a partir de authorized retorna null", () => {
  const next = transitionPreparationStatus("authorized_for_controlled_execution", "aprovar");
  assert.strictEqual(next, null);
});

// ── 6. Transições inválidas para autorizar_execucao_controlada ───────────

console.log("\n── 6. Transições inválidas para autorizar_execucao_controlada ────");

test("draft não aceita autorizar_execucao_controlada", () => {
  const next = transitionPreparationStatus("draft", "autorizar_execucao_controlada");
  assert.strictEqual(next, null);
});

test("review_ready não aceita autorizar_execucao_controlada", () => {
  const next = transitionPreparationStatus("review_ready", "autorizar_execucao_controlada");
  assert.strictEqual(next, null);
});

test("approved_for_manual_execution não aceita autorizar_execucao_controlada", () => {
  const next = transitionPreparationStatus(
    "approved_for_manual_execution",
    "autorizar_execucao_controlada",
  );
  assert.strictEqual(next, null);
});

test("discarded não aceita autorizar_execucao_controlada", () => {
  const next = transitionPreparationStatus("discarded", "autorizar_execucao_controlada");
  assert.strictEqual(next, null);
});

// ── 7. Labels ─────────────────────────────────────────────────────────────

console.log("\n── 7. Labels authorized_for_controlled_execution ────────────────");

test("label contém 'Autorizado' ou 'autorizado'", () => {
  const label = PREPARATION_STATUS_LABEL["authorized_for_controlled_execution"];
  assert.ok(
    label.toLowerCase().includes("autorizado"),
    `label deve conter 'autorizado', recebeu: "${label}"`,
  );
});

// ── 8. Texto de apoio contém referência a não-execução ───────────────────

console.log("\n── 8. Texto de apoio contém referência a não-execução ───────────");

test("support text de authorized contém 'execução' ou 'executada'", () => {
  const text = PREPARATION_STATUS_SUPPORT_TEXT["authorized_for_controlled_execution"];
  const lower = text.toLowerCase();
  assert.ok(
    lower.includes("execu"),
    `support text deve mencionar execução, recebeu: "${text}"`,
  );
});

// ── 9. buildExecutionAuthorizationPackage — campos obrigatórios ──────────

console.log("\n── 9. buildExecutionAuthorizationPackage — campos obrigatórios ──");

const preExecPackage = buildPreExecutionPackage(sampleDraft);
const authPackage = buildExecutionAuthorizationPackage(preExecPackage);

test("retorna objeto não-null", () => {
  assert.ok(authPackage !== null && typeof authPackage === "object");
});

test("action_id está presente", () => {
  assert.ok(typeof authPackage.action_id === "string" && authPackage.action_id.length > 0);
});

// ── 10. authorized_by_human: true ────────────────────────────────────────

console.log("\n── 10. authorized_by_human: true ────────────────────────────────");

test("authorized_by_human é estritamente true", () => {
  assert.strictEqual(authPackage.authorized_by_human, true);
});

// ── 11. not_yet_executed: true ────────────────────────────────────────────

console.log("\n── 11. not_yet_executed: true ───────────────────────────────────");

test("not_yet_executed é estritamente true", () => {
  assert.strictEqual(authPackage.not_yet_executed, true);
});

// ── 12. authorization_status canônico ────────────────────────────────────

console.log("\n── 12. authorization_status canônico ────────────────────────────");

test("authorization_status é 'authorized_for_controlled_execution'", () => {
  assert.strictEqual(authPackage.authorization_status, "authorized_for_controlled_execution");
});

// ── 13. readiness_status de origem ───────────────────────────────────────

console.log("\n── 13. readiness_status de origem ───────────────────────────────");

test("readiness_status é 'pre_execution_ready'", () => {
  assert.strictEqual(authPackage.readiness_status, "pre_execution_ready");
});

// ── 14. final_human_gesture_required: false ───────────────────────────────

console.log("\n── 14. final_human_gesture_required: false ──────────────────────");

test("final_human_gesture_required é estritamente false (gesto cumprido)", () => {
  assert.strictEqual(authPackage.final_human_gesture_required, false);
});

// ── 15. explicit_notice não vazio ─────────────────────────────────────────

console.log("\n── 15. explicit_notice não vazio ────────────────────────────────");

test("explicit_notice é string não vazia", () => {
  assert.strictEqual(typeof authPackage.explicit_notice, "string");
  assert.ok(authPackage.explicit_notice.length > 0);
});

// ── 16. pre_execution_package_ref referencia o action_id correto ─────────

console.log("\n── 16. pre_execution_package_ref referencia action_id correto ───");

test("pre_execution_package_ref igual ao action_id do preExecPackage", () => {
  assert.strictEqual(authPackage.pre_execution_package_ref, preExecPackage.action_id);
});

test("action_id do authPackage igual ao action_id do preExecPackage", () => {
  assert.strictEqual(authPackage.action_id, preExecPackage.action_id);
});

// ── 17. authorized_at_local é ISO string não vazia ───────────────────────

console.log("\n── 17. authorized_at_local é ISO string ─────────────────────────");

test("authorized_at_local é string não vazia", () => {
  assert.strictEqual(typeof authPackage.authorized_at_local, "string");
  assert.ok(authPackage.authorized_at_local.length > 0);
});

test("authorized_at_local parece um timestamp ISO", () => {
  const ts = new Date(authPackage.authorized_at_local);
  assert.ok(!isNaN(ts.getTime()), "deve ser parseable como Date");
});

// ── 18. EXECUTION_AUTHORIZATION_NOTICE menciona não-execução ─────────────

console.log("\n── 18. EXECUTION_AUTHORIZATION_NOTICE menciona não-execução ─────");

test("EXECUTION_AUTHORIZATION_NOTICE menciona 'NÃO' ou 'não' executada", () => {
  const lower = EXECUTION_AUTHORIZATION_NOTICE.toLowerCase();
  assert.ok(
    lower.includes("não foi executada") || lower.includes("nao foi executada"),
    `deve conter referência a não-execução, recebeu: "${EXECUTION_AUTHORIZATION_NOTICE}"`,
  );
});

test("EXECUTION_AUTHORIZATION_NOTICE menciona mensagem disparada", () => {
  const lower = EXECUTION_AUTHORIZATION_NOTICE.toLowerCase();
  assert.ok(
    lower.includes("mensagem"),
    "deve mencionar que nenhuma mensagem foi disparada",
  );
});

// ── 19. Função pura: sem side effect ─────────────────────────────────────

console.log("\n── 19. Função pura: sem side effect ─────────────────────────────");

test("buildExecutionAuthorizationPackage não muta o preExecPackage de entrada", () => {
  const pkg = buildPreExecutionPackage(sampleDraft);
  const actionIdBefore = pkg.action_id;
  buildExecutionAuthorizationPackage(pkg);
  assert.strictEqual(pkg.action_id, actionIdBefore, "action_id não deve ser mutado");
  assert.strictEqual(pkg.readiness_status, "pre_execution_ready", "readiness_status não deve ser mutado");
});

// ── 20. Determinismo ──────────────────────────────────────────────────────

console.log("\n── 20. Determinismo ─────────────────────────────────────────────");

test("duas chamadas consecutivas produzem campos estruturais iguais (exceto timestamp)", () => {
  const pkg2 = buildPreExecutionPackage(sampleDraft);
  const auth1 = buildExecutionAuthorizationPackage(pkg2);
  const auth2 = buildExecutionAuthorizationPackage(pkg2);
  assert.strictEqual(auth1.action_id, auth2.action_id);
  assert.strictEqual(auth1.authorization_status, auth2.authorization_status);
  assert.strictEqual(auth1.authorized_by_human, auth2.authorized_by_human);
  assert.strictEqual(auth1.not_yet_executed, auth2.not_yet_executed);
  assert.strictEqual(auth1.final_human_gesture_required, auth2.final_human_gesture_required);
});

// ── 21. Fluxo completo ────────────────────────────────────────────────────

console.log("\n── 21. Fluxo completo: draft → … → authorized ───────────────────");

test("fluxo completo G2.1→G2.6 passa por todos os estados esperados", () => {
  let s = PREPARATION_INITIAL_STATUS;
  assert.strictEqual(s, "draft");

  s = transitionPreparationStatus(s, "revisar");
  assert.strictEqual(s, "review_ready");

  s = transitionPreparationStatus(s, "aprovar");
  assert.strictEqual(s, "approved_for_manual_execution");

  s = transitionPreparationStatus(s, "marcar_pre_execucao");
  assert.strictEqual(s, "pre_execution_ready");

  s = transitionPreparationStatus(s, "autorizar_execucao_controlada");
  assert.strictEqual(s, "authorized_for_controlled_execution");

  // Estado final — nenhuma transição possível
  const terminal = transitionPreparationStatus(s, "revisar");
  assert.strictEqual(terminal, null);
});

// ── 22. Backward compatibility ───────────────────────────────────────────

console.log("\n── 22. Backward compatibility: estados G2.3–G2.5 ───────────────");

test("draft ainda é o estado inicial canônico", () => {
  assert.strictEqual(PREPARATION_INITIAL_STATUS, "draft");
});

test("draft → review_ready ainda funciona", () => {
  assert.strictEqual(transitionPreparationStatus("draft", "revisar"), "review_ready");
});

test("review_ready → approved_for_manual_execution ainda funciona", () => {
  assert.strictEqual(transitionPreparationStatus("review_ready", "aprovar"), "approved_for_manual_execution");
});

test("approved_for_manual_execution → pre_execution_ready ainda funciona", () => {
  assert.strictEqual(
    transitionPreparationStatus("approved_for_manual_execution", "marcar_pre_execucao"),
    "pre_execution_ready",
  );
});

test("draft → discarded ainda funciona", () => {
  assert.strictEqual(transitionPreparationStatus("draft", "descartar"), "discarded");
});

test("review_ready → discarded ainda funciona", () => {
  assert.strictEqual(transitionPreparationStatus("review_ready", "descartar"), "discarded");
});

// ── 23. pre_execution_ready agora aceita autorizar_execucao_controlada ───

console.log("\n── 23. pre_execution_ready aceita autorizar_execucao_controlada ─");

test("pre_execution_ready NÃO é mais terminal — aceita autorizar_execucao_controlada", () => {
  const actions = PREPARATION_VALID_ACTIONS["pre_execution_ready"];
  assert.ok(actions.includes("autorizar_execucao_controlada"), "deve incluir a nova ação G2.6");
});

// ── 24. authorized é terminal ────────────────────────────────────────────

console.log("\n── 24. authorized_for_controlled_execution é terminal ───────────");

test("PREPARATION_VALID_ACTIONS[authorized] tem preparar_contrato_execucao (G3.1)", () => {
  const actions = Array.from(PREPARATION_VALID_ACTIONS["authorized_for_controlled_execution"]);
  assert.ok(actions.includes("preparar_contrato_execucao"), "G3.1 adiciona preparar_contrato_execucao");
  assert.strictEqual(actions.length, 1, "exatamente 1 ação");
});

// ── 25. pre_execution_ready ainda existe ─────────────────────────────────

console.log("\n── 25. pre_execution_ready ainda existe no sistema ──────────────");

test("pre_execution_ready ainda está em PREPARATION_STATUS_LABEL", () => {
  assert.ok("pre_execution_ready" in PREPARATION_STATUS_LABEL);
});

test("pre_execution_ready ainda está em PREPARATION_VALID_ACTIONS", () => {
  assert.ok("pre_execution_ready" in PREPARATION_VALID_ACTIONS);
});

test("PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE ainda é string não vazia", () => {
  assert.strictEqual(typeof PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE, "string");
  assert.ok(PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE.length > 0);
});

// ── Resultado final ────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Smoke tests G2.6 — Resultado: ${passed} passou, ${failed} falhou`);
if (failed > 0) {
  process.exit(1);
}
console.log("✅ Todos os smoke tests G2.6 passaram.\n");
