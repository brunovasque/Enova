// ============================================================
// Smoke tests — Enova IA G3.2 — Executor Real Controlado
// Integração Inicial Controlada (Execution Bridge)
//
// Executa os módulos REAIS:
//   - panel/app/lib/enova-ia-execution-bridge.ts  (G3.2)
//   - panel/app/lib/enova-ia-preparation.ts        (G2.3 + G2.5 + G2.6 + G3.1 + G3.2)
//   - panel/app/lib/enova-ia-execution-contract.ts (G3.1)
//   - panel/app/lib/enova-ia-pre-execution.ts      (G2.5 + G2.6)
//   - panel/app/lib/enova-ia-action-builder.ts     (draft de origem)
//
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Cobre:
//  1.  Exportações G3.2 presentes no módulo execution-bridge
//  2.  BRIDGE_SUPPORTED_ACTION_TYPES tem 2 tipos: followup_lote, reativacao_lote
//  3.  BRIDGE_UNSUPPORTED_ACTION_TYPES tem 4 tipos
//  4.  BRIDGE_UNSUPPORTED_ACTION_TYPES contém mutirao_docs
//  5.  BRIDGE_UNSUPPORTED_ACTION_TYPES contém pre_plantao
//  6.  BRIDGE_UNSUPPORTED_ACTION_TYPES contém intervencao_humana
//  7.  BRIDGE_UNSUPPORTED_ACTION_TYPES contém campanha_sugerida
//  8.  BRIDGE_GUARDRAILS tem 5 guardrails canônicos
//  9.  Cada guardrail tem id, rule e consequence
// 10.  Guardrail require_execution_contract_ready presente
// 11.  Guardrail require_supported_action_type_bridge presente
// 12.  Guardrail require_authorized_contract presente
// 13.  Guardrail require_valid_targets_bridge presente
// 14.  Guardrail forbid_real_execution_in_bridge presente
// 15.  BRIDGE_NOT_EXECUTED_NOTICE menciona "NÃO foi iniciada"
// 16.  BRIDGE_READY_LABEL não vazio
// 17.  BRIDGE_READY_SUPPORT_TEXT menciona "não iniciada"
// 18.  BRIDGE_OUT_OF_SCOPE_NOTICE menciona "G4+"
// 19.  BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE menciona "followup_lote"
// 20.  Estado execution_bridge_ready existe na máquina de estados
// 21.  Ação preparar_bridge_integracao existe na máquina de estados
// 22.  Transição canônica: execution_contract_ready → execution_bridge_ready
// 23.  execution_bridge_ready é estado terminal (nenhuma ação válida)
// 24.  execution_contract_ready agora tem ação preparar_bridge_integracao (não é mais terminal)
// 25.  Transições inválidas para preparar_bridge_integracao retornam null
// 26.  Labels para execution_bridge_ready presentes
// 27.  Texto de apoio de execution_bridge_ready menciona "não iniciada"
// 28.  buildExecutionBridgePayload — campos obrigatórios presentes (tipo suportado)
// 29.  bridge_status sempre "integration_prepared"
// 30.  execution_real_not_started: true (garantia canônica)
// 31.  local_contract_ready: true (garantia canônica)
// 32.  integration_initial_prepared: true (garantia canônica)
// 33.  contract_execution_status: "not_executed"
// 34.  action_type_supported: true para followup_lote
// 35.  action_type_supported: true para reativacao_lote
// 36.  action_type_supported: false para mutirao_docs
// 37.  action_type_supported: false para pre_plantao
// 38.  action_type_supported: false para intervencao_humana
// 39.  action_type_supported: false para campanha_sugerida
// 40.  explicit_notice usa BRIDGE_NOT_EXECUTED_NOTICE quando suportado
// 41.  explicit_notice usa BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE quando não suportado
// 42.  execution_contract_ref referencia o action_id do contrato de origem
// 43.  bridge_prepared_at_local é string ISO não vazia
// 44.  action_id preservado de ponta a ponta desde G2.1
// 45.  action_type preservado de ponta a ponta
// 46.  bridge_guardrails é o array canônico (5 guardrails)
// 47.  supported_action_types é BRIDGE_SUPPORTED_ACTION_TYPES
// 48.  unsupported_action_types é BRIDGE_UNSUPPORTED_ACTION_TYPES
// 49.  Função pura: sem side effect, sem mutação
// 50.  Determinismo: campos estruturais iguais em chamadas consecutivas
// 51.  Fluxo completo: draft → revisar → aprovar → pre_exec → auth → contrato → bridge
// 52.  Estados anteriores G2.3–G3.1 não afetados
// 53.  Backward compatibility: execution_contract_ready perde status terminal (agora tem ação bridge)
// 54.  out_of_scope_notice menciona "G4+"
// 55.  out_of_scope_notice não vazio
// ============================================================

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgePath   = resolve(__dirname, "../panel/app/lib/enova-ia-execution-bridge.ts");
const contractPath = resolve(__dirname, "../panel/app/lib/enova-ia-execution-contract.ts");
const prepPath     = resolve(__dirname, "../panel/app/lib/enova-ia-preparation.ts");
const preExecPath  = resolve(__dirname, "../panel/app/lib/enova-ia-pre-execution.ts");
const builderPath  = resolve(__dirname, "../panel/app/lib/enova-ia-action-builder.ts");

// ── Importar módulos REAIS ────────────────────────────────────────────────

const {
  BRIDGE_SUPPORTED_ACTION_TYPES,
  BRIDGE_UNSUPPORTED_ACTION_TYPES,
  BRIDGE_GUARDRAILS,
  BRIDGE_NOT_EXECUTED_NOTICE,
  BRIDGE_READY_LABEL,
  BRIDGE_READY_SUPPORT_TEXT,
  BRIDGE_OUT_OF_SCOPE_NOTICE,
  BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE,
  buildExecutionBridgePayload,
} = await import(bridgePath);

const {
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

/** Resposta mínima de OpenAI que gera um draft acionável (followup_lote, confidence alta). */
const FIXTURE_FOLLOWUP = {
  mode:                "plano_de_acao",
  answer_title:        "Follow-up em lote — leads ativos",
  answer_summary:      "10 leads precisam de follow-up urgente",
  analysis_points:     ["Alta taxa de não-resposta nos últimos 7 dias"],
  recommended_actions: ["Enviar mensagem de recontato para os 10 leads identificados"],
  relevant_leads:      [
    { name: "Carlos Silva", reason: "Sem resposta há 7 dias" },
    { name: "Ana Souza",    reason: "Aguardando documentação" },
  ],
  risks:               [],
  confidence:          "alta",
  should_escalate_human: false,
  sugestao:            "",
  notes:               "",
};

/** Resposta mínima de OpenAI que gera um draft de mutirao_docs. */
const FIXTURE_MUTIRAO = {
  mode:                "plano_de_acao",
  answer_title:        "Mutirão de documentos",
  answer_summary:      "Docs pendentes para 3 leads",
  analysis_points:     ["Documentação incompleta"],
  recommended_actions: ["Realizar mutirão de documentos"],
  relevant_leads:      [
    { name: "Carlos Lima", reason: "Docs pendentes" },
  ],
  risks:               [],
  confidence:          "alta",
  should_escalate_human: false,
  sugestao:            "mutirao_docs",
  notes:               "",
};

const MOCK_MODE = "ativo";

// Build a full contract from a given response fixture
function buildFullContract(fixture) {
  const draft = buildEnovaIaActionDraft(fixture, MOCK_MODE);
  assert.ok(draft, "draft deve ser criado com fixture acionável");
  const preExec = buildPreExecutionPackage(draft);
  const auth = buildExecutionAuthorizationPackage(preExec);
  return buildExecutionContract(auth, draft);
}

// Build a full contract forcing a specific action_type by patching the draft
function buildContractWithActionType(actionType) {
  const fixture = { ...FIXTURE_FOLLOWUP, sugestao: actionType };
  // Build draft then patch action_type before continuing
  const draft = buildEnovaIaActionDraft(fixture, MOCK_MODE);
  assert.ok(draft, "draft deve ser criado");
  // Patch action_type on the draft object
  const patchedDraft = { ...draft, action_type: actionType };
  const preExec = buildPreExecutionPackage(patchedDraft);
  const auth = buildExecutionAuthorizationPackage(preExec);
  return buildExecutionContract(auth, patchedDraft);
}

const contractFollowup = buildFullContract(FIXTURE_FOLLOWUP);
const contractMutirao  = buildContractWithActionType("mutirao_docs");

// ── Testes ────────────────────────────────────────────────────────────────

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

console.log("\nEnova IA G3.2 — Execution Bridge — Smoke Tests\n");

// ── 1–2: Exportações e BRIDGE_SUPPORTED_ACTION_TYPES ─────────────────────
test("1. Exportações G3.2 presentes no módulo execution-bridge", () => {
  assert.ok(BRIDGE_SUPPORTED_ACTION_TYPES, "BRIDGE_SUPPORTED_ACTION_TYPES");
  assert.ok(BRIDGE_UNSUPPORTED_ACTION_TYPES, "BRIDGE_UNSUPPORTED_ACTION_TYPES");
  assert.ok(BRIDGE_GUARDRAILS, "BRIDGE_GUARDRAILS");
  assert.ok(BRIDGE_NOT_EXECUTED_NOTICE, "BRIDGE_NOT_EXECUTED_NOTICE");
  assert.ok(BRIDGE_READY_LABEL, "BRIDGE_READY_LABEL");
  assert.ok(BRIDGE_READY_SUPPORT_TEXT, "BRIDGE_READY_SUPPORT_TEXT");
  assert.ok(BRIDGE_OUT_OF_SCOPE_NOTICE, "BRIDGE_OUT_OF_SCOPE_NOTICE");
  assert.ok(BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE, "BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE");
  assert.ok(typeof buildExecutionBridgePayload === "function", "buildExecutionBridgePayload");
});

test("2. BRIDGE_SUPPORTED_ACTION_TYPES tem 2 tipos: followup_lote, reativacao_lote", () => {
  assert.equal(BRIDGE_SUPPORTED_ACTION_TYPES.length, 2);
  assert.ok(BRIDGE_SUPPORTED_ACTION_TYPES.includes("followup_lote"));
  assert.ok(BRIDGE_SUPPORTED_ACTION_TYPES.includes("reativacao_lote"));
});

test("3. BRIDGE_UNSUPPORTED_ACTION_TYPES tem 4 tipos", () => {
  assert.equal(BRIDGE_UNSUPPORTED_ACTION_TYPES.length, 4);
});

test("4. BRIDGE_UNSUPPORTED_ACTION_TYPES contém mutirao_docs", () => {
  assert.ok(BRIDGE_UNSUPPORTED_ACTION_TYPES.includes("mutirao_docs"));
});

test("5. BRIDGE_UNSUPPORTED_ACTION_TYPES contém pre_plantao", () => {
  assert.ok(BRIDGE_UNSUPPORTED_ACTION_TYPES.includes("pre_plantao"));
});

test("6. BRIDGE_UNSUPPORTED_ACTION_TYPES contém intervencao_humana", () => {
  assert.ok(BRIDGE_UNSUPPORTED_ACTION_TYPES.includes("intervencao_humana"));
});

test("7. BRIDGE_UNSUPPORTED_ACTION_TYPES contém campanha_sugerida", () => {
  assert.ok(BRIDGE_UNSUPPORTED_ACTION_TYPES.includes("campanha_sugerida"));
});

// ── 8–14: BRIDGE_GUARDRAILS ───────────────────────────────────────────────
test("8. BRIDGE_GUARDRAILS tem 5 guardrails canônicos", () => {
  assert.equal(BRIDGE_GUARDRAILS.length, 5);
});

test("9. Cada guardrail tem id, rule e consequence", () => {
  for (const g of BRIDGE_GUARDRAILS) {
    assert.ok(g.id && typeof g.id === "string", `guardrail ${g.id} sem id`);
    assert.ok(g.rule && typeof g.rule === "string", `guardrail ${g.id} sem rule`);
    assert.ok(g.consequence && typeof g.consequence === "string", `guardrail ${g.id} sem consequence`);
  }
});

test("10. Guardrail require_execution_contract_ready presente", () => {
  assert.ok(BRIDGE_GUARDRAILS.some(g => g.id === "require_execution_contract_ready"));
});

test("11. Guardrail require_supported_action_type_bridge presente", () => {
  assert.ok(BRIDGE_GUARDRAILS.some(g => g.id === "require_supported_action_type_bridge"));
});

test("12. Guardrail require_authorized_contract presente", () => {
  assert.ok(BRIDGE_GUARDRAILS.some(g => g.id === "require_authorized_contract"));
});

test("13. Guardrail require_valid_targets_bridge presente", () => {
  assert.ok(BRIDGE_GUARDRAILS.some(g => g.id === "require_valid_targets_bridge"));
});

test("14. Guardrail forbid_real_execution_in_bridge presente", () => {
  assert.ok(BRIDGE_GUARDRAILS.some(g => g.id === "forbid_real_execution_in_bridge"));
});

// ── 15–19: Textos canônicos ───────────────────────────────────────────────
test("15. BRIDGE_NOT_EXECUTED_NOTICE menciona 'NÃO foi iniciada'", () => {
  assert.ok(BRIDGE_NOT_EXECUTED_NOTICE.includes("NÃO foi iniciada"));
});

test("16. BRIDGE_READY_LABEL não vazio", () => {
  assert.ok(BRIDGE_READY_LABEL.length > 0);
});

test("17. BRIDGE_READY_SUPPORT_TEXT menciona 'não iniciada'", () => {
  assert.ok(BRIDGE_READY_SUPPORT_TEXT.toLowerCase().includes("não iniciada"));
});

test("18. BRIDGE_OUT_OF_SCOPE_NOTICE menciona 'G4+'", () => {
  assert.ok(BRIDGE_OUT_OF_SCOPE_NOTICE.includes("G4+"));
});

test("19. BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE menciona 'followup_lote'", () => {
  assert.ok(BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE.includes("followup_lote"));
});

// ── 20–27: Máquina de estados ────────────────────────────────────────────
test("20. Estado execution_bridge_ready existe na máquina de estados", () => {
  assert.ok("execution_bridge_ready" in PREPARATION_VALID_ACTIONS);
  assert.ok("execution_bridge_ready" in PREPARATION_STATUS_LABEL);
  assert.ok("execution_bridge_ready" in PREPARATION_STATUS_SUPPORT_TEXT);
});

test("21. Ação preparar_bridge_integracao existe na máquina de estados", () => {
  const contractActions = PREPARATION_VALID_ACTIONS["execution_contract_ready"];
  assert.ok(contractActions.includes("preparar_bridge_integracao"));
});

test("22. Transição canônica: execution_contract_ready → execution_bridge_ready", () => {
  const next = transitionPreparationStatus("execution_contract_ready", "preparar_bridge_integracao");
  assert.equal(next, "execution_bridge_ready");
});

test("23. execution_bridge_ready é estado terminal (nenhuma ação válida)", () => {
  const actions = PREPARATION_VALID_ACTIONS["execution_bridge_ready"];
  assert.equal(actions.length, 0);
});

test("24. execution_contract_ready agora tem ação preparar_bridge_integracao (não é mais terminal)", () => {
  const actions = PREPARATION_VALID_ACTIONS["execution_contract_ready"];
  assert.ok(actions.includes("preparar_bridge_integracao"));
  assert.ok(actions.length > 0);
});

test("25. Transições inválidas para preparar_bridge_integracao retornam null", () => {
  const invalidStates = [
    "draft", "review_ready", "approved_for_manual_execution",
    "pre_execution_ready", "authorized_for_controlled_execution",
    "discarded",
  ];
  for (const s of invalidStates) {
    const result = transitionPreparationStatus(s, "preparar_bridge_integracao");
    assert.equal(result, null, `Estado ${s} não deveria aceitar preparar_bridge_integracao`);
  }
});

test("26. Labels para execution_bridge_ready presentes", () => {
  assert.ok(PREPARATION_STATUS_LABEL["execution_bridge_ready"]);
  assert.ok(PREPARATION_STATUS_LABEL["execution_bridge_ready"].length > 0);
});

test("27. Texto de apoio de execution_bridge_ready menciona 'não iniciada'", () => {
  assert.ok(PREPARATION_STATUS_SUPPORT_TEXT["execution_bridge_ready"].toLowerCase().includes("não iniciada"));
});

// ── 28–50: buildExecutionBridgePayload ───────────────────────────────────
test("28. buildExecutionBridgePayload — campos obrigatórios presentes (tipo suportado)", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.ok(bridge.action_id);
  assert.ok(bridge.action_type);
  assert.equal(bridge.bridge_status, "integration_prepared");
  assert.equal(typeof bridge.action_type_supported, "boolean");
  assert.ok(Array.isArray(bridge.supported_action_types));
  assert.ok(Array.isArray(bridge.unsupported_action_types));
  assert.ok(Array.isArray(bridge.bridge_guardrails));
  assert.ok(bridge.execution_contract_ref);
  assert.equal(bridge.contract_execution_status, "not_executed");
  assert.equal(bridge.execution_real_not_started, true);
  assert.equal(bridge.local_contract_ready, true);
  assert.equal(bridge.integration_initial_prepared, true);
  assert.ok(bridge.explicit_notice);
  assert.ok(bridge.out_of_scope_notice);
  assert.ok(bridge.bridge_prepared_at_local);
});

test("29. bridge_status sempre 'integration_prepared'", () => {
  const b1 = buildExecutionBridgePayload(contractFollowup);
  const b2 = buildExecutionBridgePayload(contractMutirao);
  assert.equal(b1.bridge_status, "integration_prepared");
  assert.equal(b2.bridge_status, "integration_prepared");
});

test("30. execution_real_not_started: true (garantia canônica)", () => {
  assert.equal(buildExecutionBridgePayload(contractFollowup).execution_real_not_started, true);
  assert.equal(buildExecutionBridgePayload(contractMutirao).execution_real_not_started, true);
});

test("31. local_contract_ready: true (garantia canônica)", () => {
  assert.equal(buildExecutionBridgePayload(contractFollowup).local_contract_ready, true);
  assert.equal(buildExecutionBridgePayload(contractMutirao).local_contract_ready, true);
});

test("32. integration_initial_prepared: true (garantia canônica)", () => {
  assert.equal(buildExecutionBridgePayload(contractFollowup).integration_initial_prepared, true);
  assert.equal(buildExecutionBridgePayload(contractMutirao).integration_initial_prepared, true);
});

test("33. contract_execution_status: 'not_executed'", () => {
  assert.equal(buildExecutionBridgePayload(contractFollowup).contract_execution_status, "not_executed");
  assert.equal(buildExecutionBridgePayload(contractMutirao).contract_execution_status, "not_executed");
});

test("34. action_type_supported: true para followup_lote", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.equal(bridge.action_type_supported, true);
});

test("35. action_type_supported: true para reativacao_lote", () => {
  const contract = buildContractWithActionType("reativacao_lote");
  const bridge = buildExecutionBridgePayload(contract);
  assert.equal(bridge.action_type_supported, true);
});

test("36. action_type_supported: false para mutirao_docs", () => {
  const bridge = buildExecutionBridgePayload(contractMutirao);
  assert.equal(bridge.action_type_supported, false);
});

test("37. action_type_supported: false para pre_plantao", () => {
  const contract = buildContractWithActionType("pre_plantao");
  const bridge = buildExecutionBridgePayload(contract);
  assert.equal(bridge.action_type_supported, false);
});

test("38. action_type_supported: false para intervencao_humana", () => {
  const contract = buildContractWithActionType("intervencao_humana");
  const bridge = buildExecutionBridgePayload(contract);
  assert.equal(bridge.action_type_supported, false);
});

test("39. action_type_supported: false para campanha_sugerida", () => {
  const contract = buildContractWithActionType("campanha_sugerida");
  const bridge = buildExecutionBridgePayload(contract);
  assert.equal(bridge.action_type_supported, false);
});

test("40. explicit_notice usa BRIDGE_NOT_EXECUTED_NOTICE quando suportado", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.equal(bridge.explicit_notice, BRIDGE_NOT_EXECUTED_NOTICE);
});

test("41. explicit_notice usa BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE quando não suportado", () => {
  const bridge = buildExecutionBridgePayload(contractMutirao);
  assert.equal(bridge.explicit_notice, BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE);
});

test("42. execution_contract_ref referencia o action_id do contrato de origem", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.equal(bridge.execution_contract_ref, contractFollowup.action_id);
});

test("43. bridge_prepared_at_local é string ISO não vazia", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.ok(bridge.bridge_prepared_at_local.length > 0);
  assert.ok(!isNaN(Date.parse(bridge.bridge_prepared_at_local)));
});

test("44. action_id preservado de ponta a ponta desde G2.1", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.equal(bridge.action_id, contractFollowup.action_id);
});

test("45. action_type preservado de ponta a ponta", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.equal(bridge.action_type, contractFollowup.action_type);
});

test("46. bridge_guardrails é o array canônico (5 guardrails)", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.equal(bridge.bridge_guardrails.length, 5);
  assert.deepEqual(bridge.bridge_guardrails, BRIDGE_GUARDRAILS);
});

test("47. supported_action_types é BRIDGE_SUPPORTED_ACTION_TYPES", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.deepEqual(bridge.supported_action_types, BRIDGE_SUPPORTED_ACTION_TYPES);
});

test("48. unsupported_action_types é BRIDGE_UNSUPPORTED_ACTION_TYPES", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.deepEqual(bridge.unsupported_action_types, BRIDGE_UNSUPPORTED_ACTION_TYPES);
});

test("49. Função pura: sem side effect, sem mutação", () => {
  const contractBefore = JSON.stringify(contractFollowup);
  buildExecutionBridgePayload(contractFollowup);
  assert.equal(JSON.stringify(contractFollowup), contractBefore);
});

test("50. Determinismo: campos estruturais iguais em chamadas consecutivas", () => {
  const b1 = buildExecutionBridgePayload(contractFollowup);
  const b2 = buildExecutionBridgePayload(contractFollowup);
  assert.equal(b1.action_id, b2.action_id);
  assert.equal(b1.action_type, b2.action_type);
  assert.equal(b1.bridge_status, b2.bridge_status);
  assert.equal(b1.action_type_supported, b2.action_type_supported);
  assert.equal(b1.execution_contract_ref, b2.execution_contract_ref);
  assert.equal(b1.execution_real_not_started, b2.execution_real_not_started);
  assert.equal(b1.local_contract_ready, b2.local_contract_ready);
  assert.equal(b1.integration_initial_prepared, b2.integration_initial_prepared);
  assert.equal(b1.explicit_notice, b2.explicit_notice);
  assert.equal(b1.out_of_scope_notice, b2.out_of_scope_notice);
});

// ── 51–55: Fluxo completo + backward compatibility ────────────────────────
test("51. Fluxo completo: draft → revisar → aprovar → pre_exec → auth → contrato → bridge", () => {
  let s = PREPARATION_INITIAL_STATUS;
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
  s = transitionPreparationStatus(s, "preparar_bridge_integracao");
  assert.equal(s, "execution_bridge_ready");
});

test("52. Estados anteriores G2.3–G3.1 não afetados", () => {
  assert.equal(transitionPreparationStatus("draft", "revisar"), "review_ready");
  assert.equal(transitionPreparationStatus("review_ready", "aprovar"), "approved_for_manual_execution");
  assert.equal(transitionPreparationStatus("approved_for_manual_execution", "marcar_pre_execucao"), "pre_execution_ready");
  assert.equal(transitionPreparationStatus("pre_execution_ready", "autorizar_execucao_controlada"), "authorized_for_controlled_execution");
  assert.equal(transitionPreparationStatus("authorized_for_controlled_execution", "preparar_contrato_execucao"), "execution_contract_ready");
  assert.equal(transitionPreparationStatus("draft", "descartar"), "discarded");
});

test("53. Backward compatibility: execution_contract_ready perde status terminal (agora tem ação bridge)", () => {
  const actions = PREPARATION_VALID_ACTIONS["execution_contract_ready"];
  assert.ok(actions.length > 0, "execution_contract_ready não é mais terminal");
  assert.ok(actions.includes("preparar_bridge_integracao"));
});

test("54. out_of_scope_notice menciona 'G4+'", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.ok(bridge.out_of_scope_notice.includes("G4+"));
});

test("55. out_of_scope_notice não vazio", () => {
  const bridge = buildExecutionBridgePayload(contractFollowup);
  assert.ok(bridge.out_of_scope_notice.length > 0);
});

// ── Resultado final ───────────────────────────────────────────────────────

console.log(`\n${passed + failed} testes executados: ${passed} passaram, ${failed} falharam.\n`);
if (failed > 0) process.exit(1);
