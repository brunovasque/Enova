// ============================================================
// Smoke tests — Enova IA G3.3 — Handshake Controlado com Executor Real
//
// Executa os módulos REAIS:
//   - panel/app/lib/enova-ia-execution-handshake.ts (G3.3)
//   - panel/app/lib/enova-ia-preparation.ts         (G2.3 + G2.5 + G2.6 + G3.1 + G3.2 + G3.3)
//   - panel/app/lib/enova-ia-execution-bridge.ts    (G3.2)
//   - panel/app/lib/enova-ia-execution-contract.ts  (G3.1)
//   - panel/app/lib/enova-ia-pre-execution.ts       (G2.5 + G2.6)
//   - panel/app/lib/enova-ia-action-builder.ts      (draft de origem)
//
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Cobre:
//  1.  Exportações G3.3 presentes no módulo execution-handshake
//  2.  HANDSHAKE_SUPPORTED_ACTION_TYPES tem 2 tipos: followup_lote, reativacao_lote
//  3.  HANDSHAKE_GUARDRAILS tem 6 guardrails canônicos
//  4.  Cada guardrail tem id, rule e consequence
//  5.  Guardrail require_bridge_ready presente
//  6.  Guardrail require_supported_action_type_handshake presente
//  7.  Guardrail require_human_authorization presente
//  8.  Guardrail require_minimum_expected_fields presente
//  9.  Guardrail forbid_confusion_with_execution presente
// 10.  Guardrail forbid_silent_delivery presente
// 11.  HANDSHAKE_NOT_EXECUTED_NOTICE menciona "NÃO foi iniciada"
// 12.  HANDSHAKE_READY_LABEL não vazio
// 13.  HANDSHAKE_READY_SUPPORT_TEXT menciona "não iniciada"
// 14.  HANDSHAKE_ACK_NOT_RECEIVED_NOTICE menciona "G4+"
// 15.  HANDSHAKE_OUT_OF_SCOPE_NOTICE menciona "G4+"
// 16.  HANDSHAKE_EXPECTED_ACK_FIELDS tem ao menos 6 campos
// 17.  HANDSHAKE_EXPECTED_ACK_FIELDS contém action_id
// 18.  HANDSHAKE_EXPECTED_ACK_FIELDS contém ack_status
// 19.  HANDSHAKE_EXPECTED_ACK_FIELDS contém execution_started
// 20.  Estado execution_handshake_ready existe na máquina de estados
// 21.  Ação preparar_handshake_controlado existe na máquina de estados
// 22.  Transição canônica: execution_bridge_ready → execution_handshake_ready
// 23.  execution_handshake_ready é estado terminal (nenhuma ação válida)
// 24.  execution_bridge_ready agora tem ação preparar_handshake_controlado (não é mais terminal)
// 25.  Transições inválidas para preparar_handshake_controlado retornam null
// 26.  Labels para execution_handshake_ready presentes
// 27.  Texto de apoio de execution_handshake_ready menciona "não iniciada"
// 28.  buildControlledExecutionHandshake — campos obrigatórios no handshake_request
// 29.  handshake_status sempre "handshake_prepared"
// 30.  real_execution_not_started: true (garantia canônica)
// 31.  requires_executor_confirmation: true (garantia canônica)
// 32.  bridge_status: "integration_prepared" (continuidade bridge)
// 33.  supported_action_type: true para followup_lote
// 34.  supported_action_type: true para reativacao_lote
// 35.  supported_action_type: false para mutirao_docs (via bridge)
// 36.  handshake_ack_model.ack_status: "ack_not_received"
// 37.  handshake_ack_model.real_ack_absent: true
// 38.  handshake_ack_model.action_id referencia o action_id do bridge
// 39.  handshake_guardrails é o array canônico (6 guardrails)
// 40.  expected_ack_fields contém os campos mínimos esperados
// 41.  guardrails_passed_summary é array de strings (rules dos guardrails)
// 42.  bridge_payload_ref referencia o action_id do bridge de origem
// 43.  handshake_prepared_at_local é string ISO não vazia
// 44.  action_id preservado de ponta a ponta desde G2.1
// 45.  out_of_scope_notice menciona "G4+"
// 46.  Função pura: sem side effect, sem mutação
// 47.  Determinismo: campos estruturais iguais em chamadas consecutivas
// 48.  Fluxo completo: draft → ... → bridge → handshake
// 49.  Estados anteriores G2.3–G3.2 não afetados
// 50.  Backward compatibility: execution_bridge_ready perde status terminal (agora tem ação handshake)
// ============================================================

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const handshakePath = resolve(__dirname, "../panel/app/lib/enova-ia-execution-handshake.ts");
const bridgePath    = resolve(__dirname, "../panel/app/lib/enova-ia-execution-bridge.ts");
const contractPath  = resolve(__dirname, "../panel/app/lib/enova-ia-execution-contract.ts");
const prepPath      = resolve(__dirname, "../panel/app/lib/enova-ia-preparation.ts");
const preExecPath   = resolve(__dirname, "../panel/app/lib/enova-ia-pre-execution.ts");
const actionPath    = resolve(__dirname, "../panel/app/lib/enova-ia-action-builder.ts");

const {
  HANDSHAKE_SUPPORTED_ACTION_TYPES,
  HANDSHAKE_GUARDRAILS,
  HANDSHAKE_NOT_EXECUTED_NOTICE,
  HANDSHAKE_READY_LABEL,
  HANDSHAKE_READY_SUPPORT_TEXT,
  HANDSHAKE_ACK_NOT_RECEIVED_NOTICE,
  HANDSHAKE_OUT_OF_SCOPE_NOTICE,
  HANDSHAKE_EXPECTED_ACK_FIELDS,
  buildControlledExecutionHandshake,
} = await import(handshakePath);

const {
  BRIDGE_SUPPORTED_ACTION_TYPES,
  BRIDGE_UNSUPPORTED_ACTION_TYPES,
  BRIDGE_GUARDRAILS,
  buildExecutionBridgePayload,
} = await import(bridgePath);

const {
  EXECUTION_GUARDRAILS,
  buildExecutionContract,
} = await import(contractPath);

const {
  transitionPreparationStatus,
  PREPARATION_VALID_ACTIONS,
  PREPARATION_STATUS_LABEL,
  PREPARATION_STATUS_SUPPORT_TEXT,
  PREPARATION_INITIAL_STATUS,
} = await import(prepPath);

const {
  buildPreExecutionPackage,
  buildExecutionAuthorizationPackage,
} = await import(preExecPath);

const {
  buildEnovaIaActionDraft,
} = await import(actionPath);

// ── Helpers ───────────────────────────────────────────────────────────────

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

const MOCK_MODE = "ativo";

function makeDraft(actionType = "followup_lote") {
  const fixture = { ...FIXTURE_FOLLOWUP, sugestao: actionType };
  const draft = buildEnovaIaActionDraft(fixture, MOCK_MODE);
  assert.ok(draft, "draft deve ser criado com fixture acionável");
  return { ...draft, action_type: actionType };
}

function makeBridgeFromDraft(draft) {
  const preExec  = buildPreExecutionPackage(draft);
  const authPkg  = buildExecutionAuthorizationPackage(preExec);
  const contract = buildExecutionContract(authPkg, draft);
  return buildExecutionBridgePayload(contract);
}

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    results.push(`  ✗ ${name}\n      → ${err.message}`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

// 1. Exportações G3.3 presentes
test("1. Exportações G3.3 presentes no módulo execution-handshake", () => {
  assert.ok(HANDSHAKE_SUPPORTED_ACTION_TYPES !== undefined, "HANDSHAKE_SUPPORTED_ACTION_TYPES ausente");
  assert.ok(HANDSHAKE_GUARDRAILS !== undefined, "HANDSHAKE_GUARDRAILS ausente");
  assert.ok(HANDSHAKE_NOT_EXECUTED_NOTICE !== undefined, "HANDSHAKE_NOT_EXECUTED_NOTICE ausente");
  assert.ok(HANDSHAKE_READY_LABEL !== undefined, "HANDSHAKE_READY_LABEL ausente");
  assert.ok(HANDSHAKE_READY_SUPPORT_TEXT !== undefined, "HANDSHAKE_READY_SUPPORT_TEXT ausente");
  assert.ok(HANDSHAKE_ACK_NOT_RECEIVED_NOTICE !== undefined, "HANDSHAKE_ACK_NOT_RECEIVED_NOTICE ausente");
  assert.ok(HANDSHAKE_OUT_OF_SCOPE_NOTICE !== undefined, "HANDSHAKE_OUT_OF_SCOPE_NOTICE ausente");
  assert.ok(HANDSHAKE_EXPECTED_ACK_FIELDS !== undefined, "HANDSHAKE_EXPECTED_ACK_FIELDS ausente");
  assert.ok(typeof buildControlledExecutionHandshake === "function", "buildControlledExecutionHandshake ausente");
});

// 2. HANDSHAKE_SUPPORTED_ACTION_TYPES tem 2 tipos
test("2. HANDSHAKE_SUPPORTED_ACTION_TYPES tem 2 tipos: followup_lote, reativacao_lote", () => {
  assert.equal(HANDSHAKE_SUPPORTED_ACTION_TYPES.length, 2);
  assert.ok(HANDSHAKE_SUPPORTED_ACTION_TYPES.includes("followup_lote"));
  assert.ok(HANDSHAKE_SUPPORTED_ACTION_TYPES.includes("reativacao_lote"));
});

// 3. HANDSHAKE_GUARDRAILS tem 6 guardrails
test("3. HANDSHAKE_GUARDRAILS tem 6 guardrails canônicos", () => {
  assert.equal(HANDSHAKE_GUARDRAILS.length, 6);
});

// 4. Cada guardrail tem id, rule e consequence
test("4. Cada guardrail tem id, rule e consequence", () => {
  for (const g of HANDSHAKE_GUARDRAILS) {
    assert.ok(typeof g.id === "string" && g.id.length > 0, `guardrail sem id: ${JSON.stringify(g)}`);
    assert.ok(typeof g.rule === "string" && g.rule.length > 0, `guardrail sem rule: ${g.id}`);
    assert.ok(typeof g.consequence === "string" && g.consequence.length > 0, `guardrail sem consequence: ${g.id}`);
  }
});

// 5. Guardrail require_bridge_ready
test("5. Guardrail require_bridge_ready presente", () => {
  assert.ok(HANDSHAKE_GUARDRAILS.some((g) => g.id === "require_bridge_ready"));
});

// 6. Guardrail require_supported_action_type_handshake
test("6. Guardrail require_supported_action_type_handshake presente", () => {
  assert.ok(HANDSHAKE_GUARDRAILS.some((g) => g.id === "require_supported_action_type_handshake"));
});

// 7. Guardrail require_human_authorization
test("7. Guardrail require_human_authorization presente", () => {
  assert.ok(HANDSHAKE_GUARDRAILS.some((g) => g.id === "require_human_authorization"));
});

// 8. Guardrail require_minimum_expected_fields
test("8. Guardrail require_minimum_expected_fields presente", () => {
  assert.ok(HANDSHAKE_GUARDRAILS.some((g) => g.id === "require_minimum_expected_fields"));
});

// 9. Guardrail forbid_confusion_with_execution
test("9. Guardrail forbid_confusion_with_execution presente", () => {
  assert.ok(HANDSHAKE_GUARDRAILS.some((g) => g.id === "forbid_confusion_with_execution"));
});

// 10. Guardrail forbid_silent_delivery
test("10. Guardrail forbid_silent_delivery presente", () => {
  assert.ok(HANDSHAKE_GUARDRAILS.some((g) => g.id === "forbid_silent_delivery"));
});

// 11. HANDSHAKE_NOT_EXECUTED_NOTICE menciona "NÃO foi iniciada"
test("11. HANDSHAKE_NOT_EXECUTED_NOTICE menciona 'NÃO foi iniciada'", () => {
  assert.ok(HANDSHAKE_NOT_EXECUTED_NOTICE.includes("NÃO foi iniciada"), HANDSHAKE_NOT_EXECUTED_NOTICE);
});

// 12. HANDSHAKE_READY_LABEL não vazio
test("12. HANDSHAKE_READY_LABEL não vazio", () => {
  assert.ok(typeof HANDSHAKE_READY_LABEL === "string" && HANDSHAKE_READY_LABEL.length > 0);
});

// 13. HANDSHAKE_READY_SUPPORT_TEXT menciona "não iniciada"
test("13. HANDSHAKE_READY_SUPPORT_TEXT menciona 'não iniciada'", () => {
  assert.ok(HANDSHAKE_READY_SUPPORT_TEXT.toLowerCase().includes("não iniciada"), HANDSHAKE_READY_SUPPORT_TEXT);
});

// 14. HANDSHAKE_ACK_NOT_RECEIVED_NOTICE menciona "G4+"
test("14. HANDSHAKE_ACK_NOT_RECEIVED_NOTICE menciona 'G4+'", () => {
  assert.ok(HANDSHAKE_ACK_NOT_RECEIVED_NOTICE.includes("G4+"), HANDSHAKE_ACK_NOT_RECEIVED_NOTICE);
});

// 15. HANDSHAKE_OUT_OF_SCOPE_NOTICE menciona "G4+"
test("15. HANDSHAKE_OUT_OF_SCOPE_NOTICE menciona 'G4+'", () => {
  assert.ok(HANDSHAKE_OUT_OF_SCOPE_NOTICE.includes("G4+"), HANDSHAKE_OUT_OF_SCOPE_NOTICE);
});

// 16. HANDSHAKE_EXPECTED_ACK_FIELDS tem ao menos 6 campos
test("16. HANDSHAKE_EXPECTED_ACK_FIELDS tem ao menos 6 campos", () => {
  assert.ok(HANDSHAKE_EXPECTED_ACK_FIELDS.length >= 6, `apenas ${HANDSHAKE_EXPECTED_ACK_FIELDS.length} campos`);
});

// 17. HANDSHAKE_EXPECTED_ACK_FIELDS contém action_id
test("17. HANDSHAKE_EXPECTED_ACK_FIELDS contém action_id", () => {
  assert.ok(HANDSHAKE_EXPECTED_ACK_FIELDS.includes("action_id"));
});

// 18. HANDSHAKE_EXPECTED_ACK_FIELDS contém ack_status
test("18. HANDSHAKE_EXPECTED_ACK_FIELDS contém ack_status", () => {
  assert.ok(HANDSHAKE_EXPECTED_ACK_FIELDS.includes("ack_status"));
});

// 19. HANDSHAKE_EXPECTED_ACK_FIELDS contém execution_started
test("19. HANDSHAKE_EXPECTED_ACK_FIELDS contém execution_started", () => {
  assert.ok(HANDSHAKE_EXPECTED_ACK_FIELDS.includes("execution_started"));
});

// 20. Estado execution_handshake_ready existe na máquina de estados
test("20. Estado execution_handshake_ready existe na máquina de estados", () => {
  assert.ok("execution_handshake_ready" in PREPARATION_VALID_ACTIONS);
});

// 21. Ação preparar_handshake_controlado existe
test("21. Ação preparar_handshake_controlado existe na máquina de estados", () => {
  const allActions = Object.values(PREPARATION_VALID_ACTIONS).flat();
  assert.ok(allActions.includes("preparar_handshake_controlado"), "preparar_handshake_controlado não encontrado");
});

// 22. Transição canônica: execution_bridge_ready → execution_handshake_ready
test("22. Transição canônica: execution_bridge_ready → execution_handshake_ready", () => {
  const next = transitionPreparationStatus("execution_bridge_ready", "preparar_handshake_controlado");
  assert.equal(next, "execution_handshake_ready");
});

// 23. execution_handshake_ready é estado terminal
test("23. execution_handshake_ready é estado terminal (nenhuma ação válida)", () => {
  assert.deepEqual(PREPARATION_VALID_ACTIONS["execution_handshake_ready"], []);
});

// 24. execution_bridge_ready agora tem ação preparar_handshake_controlado
test("24. execution_bridge_ready tem ação preparar_handshake_controlado (não é mais terminal)", () => {
  assert.ok(PREPARATION_VALID_ACTIONS["execution_bridge_ready"].includes("preparar_handshake_controlado"));
});

// 25. Transições inválidas para preparar_handshake_controlado retornam null
test("25. Transições inválidas para preparar_handshake_controlado retornam null", () => {
  const invalidStates = ["draft", "review_ready", "approved_for_manual_execution",
    "pre_execution_ready", "authorized_for_controlled_execution",
    "execution_contract_ready", "execution_handshake_ready", "discarded"];
  for (const st of invalidStates) {
    const result = transitionPreparationStatus(st, "preparar_handshake_controlado");
    assert.equal(result, null, `estado '${st}' deveria retornar null mas retornou '${result}'`);
  }
});

// 26. Labels para execution_handshake_ready presentes
test("26. Labels para execution_handshake_ready presentes", () => {
  assert.ok(PREPARATION_STATUS_LABEL["execution_handshake_ready"]);
  assert.ok(PREPARATION_STATUS_LABEL["execution_handshake_ready"].length > 0);
});

// 27. Texto de apoio de execution_handshake_ready menciona "não iniciada"
test("27. Texto de apoio de execution_handshake_ready menciona 'não iniciada'", () => {
  const text = PREPARATION_STATUS_SUPPORT_TEXT["execution_handshake_ready"];
  assert.ok(text && text.toLowerCase().includes("não iniciada"), text);
});

// 28. buildControlledExecutionHandshake — campos obrigatórios no handshake_request
test("28. buildControlledExecutionHandshake — campos obrigatórios presentes", () => {
  const bridge = makeBridgeFromDraft(makeDraft("followup_lote"));
  const hs = buildControlledExecutionHandshake(bridge);
  const req = hs.handshake_request;
  assert.ok(req.action_id, "action_id ausente");
  assert.ok(req.action_type, "action_type ausente");
  assert.equal(req.handshake_status, "handshake_prepared");
  assert.equal(req.bridge_status, "integration_prepared");
  assert.ok(typeof req.supported_action_type === "boolean");
  assert.ok(Array.isArray(req.handshake_supported_action_types));
  assert.ok(Array.isArray(req.guardrails_passed_summary));
  assert.ok(Array.isArray(req.expected_ack_fields));
  assert.ok(req.bridge_payload_ref);
  assert.ok(req.explicit_notice);
  assert.ok(req.real_execution_not_started === true);
  assert.ok(req.requires_executor_confirmation === true);
  assert.ok(typeof req.handshake_prepared_at_local === "string");
});

// 29. handshake_status sempre "handshake_prepared"
test("29. handshake_status sempre 'handshake_prepared'", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.handshake_status, "handshake_prepared");
});

// 30. real_execution_not_started: true
test("30. real_execution_not_started: true (garantia canônica)", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.real_execution_not_started, true);
});

// 31. requires_executor_confirmation: true
test("31. requires_executor_confirmation: true (garantia canônica)", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.requires_executor_confirmation, true);
});

// 32. bridge_status: "integration_prepared"
test("32. bridge_status: 'integration_prepared' (continuidade bridge)", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.bridge_status, "integration_prepared");
});

// 33. supported_action_type: true para followup_lote
test("33. supported_action_type: true para followup_lote", () => {
  const bridge = makeBridgeFromDraft(makeDraft("followup_lote"));
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.supported_action_type, true);
});

// 34. supported_action_type: true para reativacao_lote
test("34. supported_action_type: true para reativacao_lote", () => {
  const bridge = makeBridgeFromDraft(makeDraft("reativacao_lote"));
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.supported_action_type, true);
});

// 35. supported_action_type: false para mutirao_docs
test("35. supported_action_type: false para mutirao_docs (via bridge)", () => {
  const bridge = makeBridgeFromDraft(makeDraft("mutirao_docs"));
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.supported_action_type, false);
});

// 36. handshake_ack_model.ack_status: "ack_not_received"
test("36. handshake_ack_model.ack_status: 'ack_not_received'", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_ack_model.ack_status, "ack_not_received");
});

// 37. handshake_ack_model.real_ack_absent: true
test("37. handshake_ack_model.real_ack_absent: true", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_ack_model.real_ack_absent, true);
});

// 38. handshake_ack_model.action_id referencia o action_id do bridge
test("38. handshake_ack_model.action_id referencia o action_id do bridge de origem", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_ack_model.action_id, bridge.action_id);
});

// 39. handshake_guardrails é o array canônico (6 guardrails)
test("39. handshake_guardrails é o array canônico (6 guardrails)", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_guardrails.length, 6);
});

// 40. expected_ack_fields contém os campos mínimos esperados
test("40. expected_ack_fields contém os campos mínimos esperados", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.ok(hs.handshake_request.expected_ack_fields.includes("action_id"));
  assert.ok(hs.handshake_request.expected_ack_fields.includes("ack_status"));
  assert.ok(hs.handshake_request.expected_ack_fields.includes("execution_started"));
});

// 41. guardrails_passed_summary é array de strings
test("41. guardrails_passed_summary é array de strings (rules dos guardrails)", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.ok(Array.isArray(hs.handshake_request.guardrails_passed_summary));
  assert.ok(hs.handshake_request.guardrails_passed_summary.length > 0);
  for (const s of hs.handshake_request.guardrails_passed_summary) {
    assert.ok(typeof s === "string" && s.length > 0);
  }
});

// 42. bridge_payload_ref referencia o action_id do bridge de origem
test("42. bridge_payload_ref referencia o action_id do bridge de origem", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.bridge_payload_ref, bridge.action_id);
});

// 43. handshake_prepared_at_local é string ISO não vazia
test("43. handshake_prepared_at_local é string ISO não vazia", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  const ts = hs.handshake_request.handshake_prepared_at_local;
  assert.ok(typeof ts === "string" && ts.length > 0);
  assert.doesNotThrow(() => new Date(ts));
});

// 44. action_id preservado de ponta a ponta desde G2.1
test("44. action_id preservado de ponta a ponta desde G2.1", () => {
  const draft  = makeDraft("followup_lote");
  const bridge = makeBridgeFromDraft(draft);
  const hs     = buildControlledExecutionHandshake(bridge);
  assert.equal(hs.handshake_request.action_id, draft.action_id);
  assert.equal(hs.handshake_ack_model.action_id, draft.action_id);
  assert.equal(hs.handshake_request.bridge_payload_ref, draft.action_id);
});

// 45. out_of_scope_notice menciona "G4+"
test("45. out_of_scope_notice menciona 'G4+'", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs = buildControlledExecutionHandshake(bridge);
  assert.ok(hs.out_of_scope_notice.includes("G4+"), hs.out_of_scope_notice);
});

// 46. Função pura: sem side effect, sem mutação
test("46. Função pura: bridge de entrada não é mutado", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const beforeActionId = bridge.action_id;
  const beforeStatus   = bridge.bridge_status;
  buildControlledExecutionHandshake(bridge);
  assert.equal(bridge.action_id, beforeActionId);
  assert.equal(bridge.bridge_status, beforeStatus);
});

// 47. Determinismo: campos estruturais iguais em chamadas consecutivas
test("47. Determinismo: campos estruturais iguais em chamadas consecutivas", () => {
  const bridge = makeBridgeFromDraft(makeDraft());
  const hs1 = buildControlledExecutionHandshake(bridge);
  const hs2 = buildControlledExecutionHandshake(bridge);
  assert.equal(hs1.handshake_request.action_id, hs2.handshake_request.action_id);
  assert.equal(hs1.handshake_request.handshake_status, hs2.handshake_request.handshake_status);
  assert.equal(hs1.handshake_request.supported_action_type, hs2.handshake_request.supported_action_type);
  assert.equal(hs1.handshake_ack_model.ack_status, hs2.handshake_ack_model.ack_status);
  assert.equal(hs1.handshake_guardrails.length, hs2.handshake_guardrails.length);
});

// 48. Fluxo completo: draft → revisar → aprovar → pre_exec → auth → contrato → bridge → handshake
test("48. Fluxo completo: draft → ... → bridge → handshake (máquina de estados)", () => {
  let st = PREPARATION_INITIAL_STATUS;
  const transitions = [
    "revisar", "aprovar", "marcar_pre_execucao",
    "autorizar_execucao_controlada", "preparar_contrato_execucao",
    "preparar_bridge_integracao", "preparar_handshake_controlado",
  ];
  for (const action of transitions) {
    const next = transitionPreparationStatus(st, action);
    assert.ok(next !== null, `transição '${action}' de '${st}' retornou null`);
    st = next;
  }
  assert.equal(st, "execution_handshake_ready");
});

// 49. Estados anteriores G2.3–G3.2 não afetados
test("49. Estados anteriores G2.3–G3.2 não afetados pela adição de G3.3", () => {
  // draft → revisar deve continuar funcionando
  assert.equal(transitionPreparationStatus("draft", "revisar"), "review_ready");
  // review_ready → aprovar deve continuar funcionando
  assert.equal(transitionPreparationStatus("review_ready", "aprovar"), "approved_for_manual_execution");
  // execution_contract_ready → preparar_bridge_integracao deve continuar funcionando
  assert.equal(
    transitionPreparationStatus("execution_contract_ready", "preparar_bridge_integracao"),
    "execution_bridge_ready"
  );
  // discarded continua terminal
  assert.deepEqual(PREPARATION_VALID_ACTIONS["discarded"], []);
});

// 50. Backward compatibility: execution_bridge_ready perde status terminal
test("50. Backward compatibility: execution_bridge_ready agora tem 1 ação (preparar_handshake_controlado)", () => {
  assert.equal(PREPARATION_VALID_ACTIONS["execution_bridge_ready"].length, 1);
  assert.equal(PREPARATION_VALID_ACTIONS["execution_bridge_ready"][0], "preparar_handshake_controlado");
});

// ── Report ────────────────────────────────────────────────────────────────

console.log("\nEnova IA G3.3 — Handshake Controlado — Smoke Tests\n");
results.forEach((r) => console.log(r));
console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) process.exit(1);
