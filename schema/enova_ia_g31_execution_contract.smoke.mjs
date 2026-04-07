// ============================================================
// Smoke tests — Enova IA G3.1 — Executor Real Controlado
// Contrato Local de Execução Futura
//
// Executa os módulos REAIS:
//   - panel/app/lib/enova-ia-execution-contract.ts  (G3.1)
//   - panel/app/lib/enova-ia-preparation.ts          (G2.3 + G2.5 + G2.6 + G3.1)
//   - panel/app/lib/enova-ia-pre-execution.ts        (G2.5 + G2.6)
//   - panel/app/lib/enova-ia-action-builder.ts       (draft de origem)
//
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Cobre:
//  1.  Exportações G3.1 presentes no módulo execution-contract
//  2.  EXECUTION_GUARDRAILS tem 5 guardrails canônicos
//  3.  Cada guardrail tem id, rule e consequence
//  4.  Guardrail require_human_authorization presente
//  5.  Guardrail require_valid_targets presente
//  6.  Guardrail require_supported_action_type presente
//  7.  Guardrail require_proof_definition presente
//  8.  Guardrail forbid_silent_execution presente
//  9.  EXPECTED_PROOFS_BY_STATUS tem 3 provas
// 10.  ROLLBACK_EXPECTATION menciona "G3.2+"
// 11.  EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE menciona "NÃO foi executada"
// 12.  FUTURE_SCOPE_NOTICE menciona "G3.2+"
// 13.  Estado execution_contract_ready existe na máquina de estados
// 14.  Ação preparar_contrato_execucao existe na máquina de estados
// 15.  Transição canônica: authorized_for_controlled_execution → execution_contract_ready
// 16.  execution_contract_ready é estado terminal (nenhuma ação válida)
// 17.  Transições inválidas para preparar_contrato_execucao retornam null
// 18.  Labels para execution_contract_ready presentes
// 19.  Texto de apoio de execution_contract_ready menciona "executado: não"
// 20.  buildExecutionContract — campos obrigatórios presentes
// 21.  execution_status sempre "not_executed"
// 22.  not_yet_executed: true (garantia canônica)
// 23.  ready_for_real_executor: true (garantia canônica)
// 24.  authorization_status: "authorized_for_controlled_execution"
// 25.  execution_guardrails é o array canônico
// 26.  expected_proofs presente e não vazio
// 27.  rollback_expectation não vazio
// 28.  explicit_notice contém texto de não-execução
// 29.  authorization_package_ref referencia o action_id da autorização
// 30.  pre_execution_package_ref referencia a origem
// 31.  contract_prepared_at_local é string ISO não vazia
// 32.  action_id preservado de ponta a ponta
// 33.  action_type preservado de ponta a ponta
// 34.  target_leads_detail preservado no contrato
// 35.  suggested_steps preservados no contrato
// 36.  suggested_approach preservado no contrato
// 37.  Função pura: sem side effect, sem mutação
// 38.  Determinismo: campos estruturais iguais em chamadas consecutivas
// 39.  Fluxo completo: draft → revisar → aprovar → pre_exec → auth → contrato
// 40.  authorized_for_controlled_execution agora tem ação preparar_contrato_execucao
// 41.  Estados anteriores G2.3–G2.6 não afetados
// 42.  Backward compatibility: authorized_for_controlled_execution perde terminal status
// 43.  execution_contract_ready: PREPARATION_VALID_ACTIONS é array vazio
// 44.  EXECUTION_CONTRACT_READY_LABEL não vazio
// ============================================================

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractPath = resolve(__dirname, "../panel/app/lib/enova-ia-execution-contract.ts");
const prepPath     = resolve(__dirname, "../panel/app/lib/enova-ia-preparation.ts");
const preExecPath  = resolve(__dirname, "../panel/app/lib/enova-ia-pre-execution.ts");
const builderPath  = resolve(__dirname, "../panel/app/lib/enova-ia-action-builder.ts");

// ── Importar módulos REAIS ────────────────────────────────────────────────

const {
  EXECUTION_GUARDRAILS,
  EXPECTED_PROOFS_BY_STATUS,
  ROLLBACK_EXPECTATION,
  EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE,
  EXECUTION_CONTRACT_READY_LABEL,
  EXECUTION_CONTRACT_READY_SUPPORT_TEXT,
  FUTURE_SCOPE_NOTICE,
  buildExecutionContract,
} = await import(contractPath);

const {
  PREPARATION_STATUS_LABEL,
  PREPARATION_STATUS_SUPPORT_TEXT,
  PREPARATION_VALID_ACTIONS,
  transitionPreparationStatus,
  PREPARATION_INITIAL_STATUS,
} = await import(prepPath);

const {
  buildPreExecutionPackage,
  buildExecutionAuthorizationPackage,
} = await import(preExecPath);

const {
  buildEnovaIaActionDraft,
} = await import(builderPath);

// ── Fixtures ──────────────────────────────────────────────────────────────

/** Resposta mínima de OpenAI que gera um draft acionável com confidence alta. */
const FIXTURE_RESPONSE = {
  mode:                "plano_de_acao",
  answer_title:        "Follow-up em lote — leads ativos",
  answer_summary:      "10 leads precisam de follow-up urgente",
  analysis_points:     ["Alta taxa de não-resposta nos últimos 7 dias"],
  recommended_actions: ["Enviar mensagem de recontato para os 10 leads identificados"],
  relevant_leads:      [
    { name: "Carlos Silva",  reason: "Sem resposta há 7 dias" },
    { name: "Ana Souza",     reason: "Aguardando documentação" },
  ],
  risks:               [],
  confidence:          "alta",
  should_escalate_human: false,
  sugestao:            "",
  notes:               "",
};

// ── Helper: montar a cadeia completa draft → auth → contract ──────────────

function buildFullChain() {
  const draft = buildEnovaIaActionDraft(FIXTURE_RESPONSE, "teste completo G3.1");
  assert.ok(draft, "draft deve ser criado com fixture acionável");
  const preExec  = buildPreExecutionPackage(draft);
  const authPkg  = buildExecutionAuthorizationPackage(preExec);
  const contract = buildExecutionContract(authPkg, draft);
  return { draft, preExec, authPkg, contract };
}

// ── Testes ────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    fail++;
  }
}

console.log("\nG3.1 — Contrato Local de Execução Futura\n");

// 1. Exportações G3.1 presentes
test("1. Exportações G3.1 presentes no módulo execution-contract", () => {
  assert.ok(typeof EXECUTION_GUARDRAILS !== "undefined", "EXECUTION_GUARDRAILS exportado");
  assert.ok(typeof EXPECTED_PROOFS_BY_STATUS !== "undefined", "EXPECTED_PROOFS_BY_STATUS exportado");
  assert.ok(typeof ROLLBACK_EXPECTATION !== "undefined", "ROLLBACK_EXPECTATION exportado");
  assert.ok(typeof EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE !== "undefined", "notice exportado");
  assert.ok(typeof EXECUTION_CONTRACT_READY_LABEL !== "undefined", "label exportado");
  assert.ok(typeof buildExecutionContract !== "undefined", "builder exportado");
});

// 2. EXECUTION_GUARDRAILS tem 5 guardrails
test("2. EXECUTION_GUARDRAILS tem 5 guardrails canônicos", () => {
  assert.equal(EXECUTION_GUARDRAILS.length, 5, "devem ser exatamente 5 guardrails");
});

// 3. Cada guardrail tem id, rule e consequence
test("3. Cada guardrail tem id, rule e consequence", () => {
  for (const g of EXECUTION_GUARDRAILS) {
    assert.ok(g.id && typeof g.id === "string", `guardrail ${g.id} deve ter id`);
    assert.ok(g.rule && typeof g.rule === "string", `guardrail ${g.id} deve ter rule`);
    assert.ok(g.consequence && typeof g.consequence === "string", `guardrail ${g.id} deve ter consequence`);
  }
});

// 4. Guardrail require_human_authorization presente
test("4. Guardrail require_human_authorization presente", () => {
  const g = EXECUTION_GUARDRAILS.find(x => x.id === "require_human_authorization");
  assert.ok(g, "guardrail require_human_authorization deve existir");
});

// 5. Guardrail require_valid_targets presente
test("5. Guardrail require_valid_targets presente", () => {
  const g = EXECUTION_GUARDRAILS.find(x => x.id === "require_valid_targets");
  assert.ok(g, "guardrail require_valid_targets deve existir");
});

// 6. Guardrail require_supported_action_type presente
test("6. Guardrail require_supported_action_type presente", () => {
  const g = EXECUTION_GUARDRAILS.find(x => x.id === "require_supported_action_type");
  assert.ok(g, "guardrail require_supported_action_type deve existir");
});

// 7. Guardrail require_proof_definition presente
test("7. Guardrail require_proof_definition presente", () => {
  const g = EXECUTION_GUARDRAILS.find(x => x.id === "require_proof_definition");
  assert.ok(g, "guardrail require_proof_definition deve existir");
});

// 8. Guardrail forbid_silent_execution presente
test("8. Guardrail forbid_silent_execution presente", () => {
  const g = EXECUTION_GUARDRAILS.find(x => x.id === "forbid_silent_execution");
  assert.ok(g, "guardrail forbid_silent_execution deve existir");
});

// 9. EXPECTED_PROOFS_BY_STATUS tem 3 provas
test("9. EXPECTED_PROOFS_BY_STATUS tem 3 provas esperadas", () => {
  assert.equal(EXPECTED_PROOFS_BY_STATUS.length, 3, "devem ser 3 provas esperadas");
  for (const p of EXPECTED_PROOFS_BY_STATUS) {
    assert.ok(p.proof_type, "prova deve ter proof_type");
    assert.ok(p.description, "prova deve ter description");
  }
});

// 10. ROLLBACK_EXPECTATION menciona G3.2+
test("10. ROLLBACK_EXPECTATION menciona G3.2+", () => {
  assert.ok(ROLLBACK_EXPECTATION.includes("G3.2+"), "deve mencionar G3.2+");
});

// 11. EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE menciona não execução
test("11. EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE menciona 'NÃO foi executada'", () => {
  assert.ok(
    EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE.includes("NÃO foi executada"),
    "notice deve deixar claro que nada foi executado"
  );
});

// 12. FUTURE_SCOPE_NOTICE menciona G3.2+
test("12. FUTURE_SCOPE_NOTICE menciona G3.2+", () => {
  assert.ok(FUTURE_SCOPE_NOTICE.includes("G3.2+"), "deve mencionar G3.2+");
});

// 13. Estado execution_contract_ready existe na máquina de estados
test("13. Estado execution_contract_ready existe na máquina de estados", () => {
  assert.ok("execution_contract_ready" in PREPARATION_VALID_ACTIONS, "estado deve existir");
  assert.ok("execution_contract_ready" in PREPARATION_STATUS_LABEL, "label deve existir");
  assert.ok("execution_contract_ready" in PREPARATION_STATUS_SUPPORT_TEXT, "support text deve existir");
});

// 14. Ação preparar_contrato_execucao aceita em authorized_for_controlled_execution
test("14. Ação preparar_contrato_execucao aceita em authorized_for_controlled_execution", () => {
  const validActions = PREPARATION_VALID_ACTIONS["authorized_for_controlled_execution"];
  assert.ok(
    validActions.includes("preparar_contrato_execucao"),
    "authorized_for_controlled_execution deve aceitar preparar_contrato_execucao"
  );
});

// 15. Transição canônica: authorized_for_controlled_execution → execution_contract_ready
test("15. Transição: authorized_for_controlled_execution → execution_contract_ready", () => {
  const next = transitionPreparationStatus("authorized_for_controlled_execution", "preparar_contrato_execucao");
  assert.equal(next, "execution_contract_ready");
});

// 16. execution_contract_ready agora tem ação preparar_bridge_integracao [G3.2]
test("16. execution_contract_ready tem ação preparar_bridge_integracao (G3.2 — não mais terminal)", () => {
  const actions = PREPARATION_VALID_ACTIONS["execution_contract_ready"];
  // G3.2: execution_contract_ready recebeu preparar_bridge_integracao — deixou de ser terminal
  assert.ok(actions.includes("preparar_bridge_integracao"), "execution_contract_ready deve aceitar preparar_bridge_integracao (G3.2)");
});

// 17. Transições inválidas para preparar_contrato_execucao retornam null
test("17. Transições inválidas para preparar_contrato_execucao retornam null", () => {
  const invalidStates = ["draft", "review_ready", "approved_for_manual_execution", "pre_execution_ready", "discarded"];
  for (const state of invalidStates) {
    const result = transitionPreparationStatus(state, "preparar_contrato_execucao");
    assert.equal(result, null, `${state} não deve aceitar preparar_contrato_execucao`);
  }
});

// 18. Labels para execution_contract_ready presentes
test("18. PREPARATION_STATUS_LABEL para execution_contract_ready não vazio", () => {
  assert.ok(
    PREPARATION_STATUS_LABEL["execution_contract_ready"].length > 0,
    "label para execution_contract_ready deve ser não vazio"
  );
});

// 19. Texto de apoio de execution_contract_ready menciona "executado: não"
test("19. Texto de apoio execution_contract_ready menciona 'executado: não'", () => {
  const text = PREPARATION_STATUS_SUPPORT_TEXT["execution_contract_ready"];
  assert.ok(
    text.toLowerCase().includes("executado: não"),
    "support text deve mencionar que não foi executado"
  );
});

// 20. buildExecutionContract — campos obrigatórios presentes
test("20. buildExecutionContract — todos os campos obrigatórios presentes", () => {
  const { contract } = buildFullChain();
  const required = [
    "action_id", "action_type", "authorization_status", "execution_status",
    "target_leads_detail", "suggested_steps", "suggested_approach", "suggested_message",
    "execution_guardrails", "expected_proofs", "rollback_expectation", "explicit_notice",
    "contract_prepared_at_local", "authorization_package_ref", "pre_execution_package_ref",
    "not_yet_executed", "ready_for_real_executor",
  ];
  for (const field of required) {
    assert.ok(field in contract, `campo ${field} deve estar presente no contrato`);
  }
});

// 21. execution_status sempre "not_executed"
test("21. execution_status sempre 'not_executed'", () => {
  const { contract } = buildFullChain();
  assert.equal(contract.execution_status, "not_executed");
});

// 22. not_yet_executed: true
test("22. not_yet_executed: true (garantia canônica)", () => {
  const { contract } = buildFullChain();
  assert.equal(contract.not_yet_executed, true);
});

// 23. ready_for_real_executor: true
test("23. ready_for_real_executor: true (garantia canônica)", () => {
  const { contract } = buildFullChain();
  assert.equal(contract.ready_for_real_executor, true);
});

// 24. authorization_status preservado
test("24. authorization_status: 'authorized_for_controlled_execution'", () => {
  const { contract } = buildFullChain();
  assert.equal(contract.authorization_status, "authorized_for_controlled_execution");
});

// 25. execution_guardrails é o array canônico
test("25. execution_guardrails é o array canônico com 5 itens", () => {
  const { contract } = buildFullChain();
  assert.equal(contract.execution_guardrails.length, 5);
  assert.ok(contract.execution_guardrails.find(g => g.id === "require_human_authorization"));
});

// 26. expected_proofs presente e não vazio
test("26. expected_proofs presente e não vazio", () => {
  const { contract } = buildFullChain();
  assert.ok(Array.isArray(contract.expected_proofs), "expected_proofs deve ser array");
  assert.ok(contract.expected_proofs.length > 0, "expected_proofs não deve ser vazio");
});

// 27. rollback_expectation não vazio
test("27. rollback_expectation não vazio", () => {
  const { contract } = buildFullChain();
  assert.ok(contract.rollback_expectation.length > 0, "rollback_expectation não deve ser vazio");
});

// 28. explicit_notice contém texto de não-execução
test("28. explicit_notice contém texto de não-execução", () => {
  const { contract } = buildFullChain();
  assert.ok(
    contract.explicit_notice.includes("NÃO foi executada"),
    "explicit_notice deve declarar não-execução"
  );
});

// 29. authorization_package_ref referencia o action_id da autorização
test("29. authorization_package_ref referencia o action_id correto", () => {
  const { authPkg, contract } = buildFullChain();
  assert.equal(contract.authorization_package_ref, authPkg.action_id);
});

// 30. pre_execution_package_ref correto
test("30. pre_execution_package_ref correto", () => {
  const { authPkg, contract } = buildFullChain();
  assert.equal(contract.pre_execution_package_ref, authPkg.pre_execution_package_ref);
});

// 31. contract_prepared_at_local é string ISO não vazia
test("31. contract_prepared_at_local é string ISO não vazia", () => {
  const { contract } = buildFullChain();
  assert.ok(typeof contract.contract_prepared_at_local === "string", "deve ser string");
  assert.ok(contract.contract_prepared_at_local.length > 0, "não deve ser vazio");
  assert.ok(!isNaN(Date.parse(contract.contract_prepared_at_local)), "deve ser ISO válido");
});

// 32. action_id preservado de ponta a ponta
test("32. action_id preservado de ponta a ponta (draft → auth → contract)", () => {
  const { draft, authPkg, contract } = buildFullChain();
  assert.equal(contract.action_id, draft.action_id);
  assert.equal(contract.action_id, authPkg.action_id);
});

// 33. action_type preservado
test("33. action_type preservado de ponta a ponta", () => {
  const { draft, contract } = buildFullChain();
  assert.equal(contract.action_type, draft.action_type);
});

// 34. target_leads_detail preservado
test("34. target_leads_detail preservado no contrato", () => {
  const { draft, contract } = buildFullChain();
  assert.equal(contract.target_leads_detail.length, draft.target_leads_detail.length);
  if (contract.target_leads_detail.length > 0) {
    assert.equal(contract.target_leads_detail[0].name, draft.target_leads_detail[0].name);
  }
});

// 35. suggested_steps preservados
test("35. suggested_steps preservados no contrato", () => {
  const { draft, contract } = buildFullChain();
  assert.deepEqual(contract.suggested_steps, draft.suggested_steps);
});

// 36. suggested_approach preservado
test("36. suggested_approach preservado no contrato", () => {
  const { draft, contract } = buildFullChain();
  assert.equal(contract.suggested_approach, draft.suggested_approach);
});

// 37. Função pura: sem side effect
test("37. buildExecutionContract é função pura (sem mutação de input)", () => {
  const { authPkg, draft } = buildFullChain();
  const authPkgCopy = JSON.parse(JSON.stringify(authPkg));
  const draftCopy   = JSON.parse(JSON.stringify(draft));
  buildExecutionContract(authPkg, draft);
  assert.deepEqual(authPkg.action_id, authPkgCopy.action_id, "authPkg não deve ser mutado");
  assert.deepEqual(draft.action_id, draftCopy.action_id, "draft não deve ser mutado");
});

// 38. Determinismo: campos estruturais iguais em chamadas consecutivas
test("38. Determinismo: campos estruturais iguais em chamadas consecutivas", () => {
  const { authPkg, draft } = buildFullChain();
  const c1 = buildExecutionContract(authPkg, draft);
  const c2 = buildExecutionContract(authPkg, draft);
  assert.equal(c1.action_id, c2.action_id);
  assert.equal(c1.action_type, c2.action_type);
  assert.equal(c1.execution_status, c2.execution_status);
  assert.equal(c1.authorization_status, c2.authorization_status);
  assert.equal(c1.not_yet_executed, c2.not_yet_executed);
  assert.equal(c1.ready_for_real_executor, c2.ready_for_real_executor);
  assert.equal(c1.execution_guardrails.length, c2.execution_guardrails.length);
});

// 39. Fluxo completo de estados
test("39. Fluxo completo: draft → revisar → aprovar → marcar_pre_exec → autorizar → contrato", () => {
  let s = PREPARATION_INITIAL_STATUS;
  assert.equal(s, "draft");
  s = transitionPreparationStatus(s, "revisar");
  assert.equal(s, "review_ready");
  s = transitionPreparationStatus(s, "aprovar");
  assert.equal(s, "approved_for_manual_execution");
  s = transitionPreparationStatus(s, "marcar_pre_execucao");
  assert.equal(s, "pre_execution_ready");
  s = transitionPreparationStatus(s, "autorizar_execucao_controlada");
  assert.equal(s, "authorized_for_controlled_execution");
  s = transitionPreparationStatus(s, "preparar_contrato_execucao");
  assert.equal(s, "execution_contract_ready");
});

// 40. authorized_for_controlled_execution agora tem preparar_contrato_execucao
test("40. authorized_for_controlled_execution aceita preparar_contrato_execucao (não mais terminal)", () => {
  const actions = PREPARATION_VALID_ACTIONS["authorized_for_controlled_execution"];
  assert.ok(actions.includes("preparar_contrato_execucao"), "deve incluir a nova ação");
  assert.equal(actions.length, 1, "deve ter exatamente 1 ação válida");
});

// 41. Estados anteriores G2.3–G2.6 não afetados
test("41. Transições G2.3–G2.6 anteriores não afetadas", () => {
  assert.equal(transitionPreparationStatus("draft", "revisar"), "review_ready");
  assert.equal(transitionPreparationStatus("review_ready", "aprovar"), "approved_for_manual_execution");
  assert.equal(transitionPreparationStatus("draft", "descartar"), "discarded");
  assert.equal(transitionPreparationStatus("approved_for_manual_execution", "marcar_pre_execucao"), "pre_execution_ready");
  assert.equal(transitionPreparationStatus("pre_execution_ready", "autorizar_execucao_controlada"), "authorized_for_controlled_execution");
});

// 42. Backward compatibility: transições antigas de authorized_for_controlled_execution
test("42. authorized_for_controlled_execution rejeita ações inválidas (null)", () => {
  const invalidActions = ["revisar", "aprovar", "descartar", "marcar_pre_execucao", "autorizar_execucao_controlada"];
  for (const action of invalidActions) {
    const result = transitionPreparationStatus("authorized_for_controlled_execution", action);
    assert.equal(result, null, `${action} não deve ser aceito em authorized_for_controlled_execution`);
  }
});

// 43. execution_contract_ready: PREPARATION_VALID_ACTIONS tem preparar_bridge_integracao (G3.2)
test("43. execution_contract_ready: PREPARATION_VALID_ACTIONS contém preparar_bridge_integracao (G3.2)", () => {
  // G3.2 changed execution_contract_ready from terminal to having preparar_bridge_integracao
  assert.ok(PREPARATION_VALID_ACTIONS["execution_contract_ready"].includes("preparar_bridge_integracao"));
});

// 44. EXECUTION_CONTRACT_READY_LABEL não vazio
test("44. EXECUTION_CONTRACT_READY_LABEL não vazio", () => {
  assert.ok(
    typeof EXECUTION_CONTRACT_READY_LABEL === "string" && EXECUTION_CONTRACT_READY_LABEL.length > 0,
    "label deve ser string não vazia"
  );
});

// ── Resultado ────────────────────────────────────────────────────────────

console.log(`\n  ${pass + fail} testes: ${pass} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
