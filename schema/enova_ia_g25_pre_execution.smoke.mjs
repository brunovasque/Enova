// ============================================================
// Smoke tests — enova-ia-pre-execution (G2.5)
// Pré-execução Assistida
//
// Executa os módulos REAIS:
//   - panel/app/lib/enova-ia-pre-execution.ts
//   - panel/app/lib/enova-ia-preparation.ts  (extensão G2.5)
//   - panel/app/lib/enova-ia-action-builder.ts (draft de origem)
//
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Cobre:
//   1. Exportações esperadas do módulo pre-execution
//   2. Estado pre_execution_ready na máquina de estados
//   3. Ação marcar_pre_execucao na máquina de estados
//   4. Transição canônica: approved_for_manual_execution → pre_execution_ready
//   5. pre_execution_ready é estado terminal (nenhuma ação válida)
//   6. Transições inválidas para marcar_pre_execucao retornam null
//   7. Labels e textos de apoio para pre_execution_ready
//   8. buildPreExecutionPackage — campos obrigatórios
//   9. not_yet_executed: true (garantia canônica)
//  10. requires_final_human_gesture: true (garantia canônica)
//  11. readiness_status: "pre_execution_ready" (garantia canônica)
//  12. armed_from_status: "approved_for_manual_execution" (rastreabilidade)
//  13. execution_checklist — itens canônicos presentes
//  14. Pacote herda action_id do draft de origem
//  15. Pacote herda target_leads_detail (com fallback para target_leads)
//  16. Fallback para target_leads quando target_leads_detail vazio
//  17. Função pura: sem side effect, sem mutação
//  18. Determinismo: mesmos inputs → mesmo output
//  19. Fluxo completo: draft → review_ready → approved_for_manual_execution → pre_execution_ready
//  20. Backward compatibility: estados anteriores (G2.3) não afetados
//  21. approved_for_manual_execution agora aceita marcar_pre_execucao (G2.5)
//  22. Checklist canônico tem pelo menos 5 itens
//  23. PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE não vazio
//  24. PRE_EXECUTION_READY_LABEL não vazio
//  25. PRE_EXECUTION_READY_SUPPORT_TEXT contém "nenhuma execução"
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
  PRE_EXECUTION_CHECKLIST,
  PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE,
  PRE_EXECUTION_READY_LABEL,
  PRE_EXECUTION_READY_SUPPORT_TEXT,
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

/** Fábrica de resposta OpenAI para testes. */
function makeResponse(overrides = {}) {
  return {
    mode: "plano_de_acao",
    answer_title: "Plano de follow-up para leads mornos",
    answer_summary: "Identificamos 12 leads mornos que podem ser reengajados.",
    analysis_points: ["12 leads sem resposta há 3-5 dias", "Perfil válido para MCMV"],
    recommended_actions: ["Enviar follow-up leve para cada lead", "Priorizar os de renda validada"],
    relevant_leads: [
      { name: "João Silva", reason: "Sem resposta há 4 dias" },
      { name: "Maria Souza", reason: "Renda validada, aguardando retorno" },
    ],
    risks: ["Leads podem não responder", "Volume alto"],
    should_escalate_human: false,
    confidence: "alta",
    answer_title_short: "Follow-up mornos",
    notes: "",
    ...overrides,
  };
}

/** Monta um draft canônico para testes. */
function makeDraft(overrides = {}) {
  const draft = buildEnovaIaActionDraft(makeResponse(overrides), "prompt de teste");
  assert.ok(draft, "draft deve existir para os testes");
  return draft;
}

// ── 1. Exportações esperadas do módulo pre-execution ─────────────────────

console.log("\n── 1. Exportações esperadas ─────────────────────────────────────");

test("buildPreExecutionPackage exportado", () => {
  assert.strictEqual(typeof buildPreExecutionPackage, "function");
});

test("PRE_EXECUTION_CHECKLIST exportado como array/readonly", () => {
  assert.ok(Array.isArray(PRE_EXECUTION_CHECKLIST));
});

test("PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE exportado", () => {
  assert.strictEqual(typeof PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE, "string");
});

test("PRE_EXECUTION_READY_LABEL exportado", () => {
  assert.strictEqual(typeof PRE_EXECUTION_READY_LABEL, "string");
});

test("PRE_EXECUTION_READY_SUPPORT_TEXT exportado", () => {
  assert.strictEqual(typeof PRE_EXECUTION_READY_SUPPORT_TEXT, "string");
});

// ── 2. Estado pre_execution_ready na máquina de estados ──────────────────

console.log("\n── 2. Estado pre_execution_ready na máquina de estados ──────────");

test("PREPARATION_STATUS_LABEL tem entrada para pre_execution_ready", () => {
  assert.ok("pre_execution_ready" in PREPARATION_STATUS_LABEL);
  assert.ok(PREPARATION_STATUS_LABEL["pre_execution_ready"].length > 0);
});

test("PREPARATION_STATUS_SUPPORT_TEXT tem entrada para pre_execution_ready", () => {
  assert.ok("pre_execution_ready" in PREPARATION_STATUS_SUPPORT_TEXT);
  assert.ok(PREPARATION_STATUS_SUPPORT_TEXT["pre_execution_ready"].length > 0);
});

test("PREPARATION_VALID_ACTIONS tem entrada para pre_execution_ready", () => {
  assert.ok("pre_execution_ready" in PREPARATION_VALID_ACTIONS);
});

// ── 3. Ação marcar_pre_execucao na máquina de estados ────────────────────

console.log("\n── 3. Ação marcar_pre_execucao na máquina de estados ────────────");

test("approved_for_manual_execution aceita marcar_pre_execucao [G2.5]", () => {
  const actions = PREPARATION_VALID_ACTIONS["approved_for_manual_execution"];
  assert.ok(actions.includes("marcar_pre_execucao"), "deve incluir marcar_pre_execucao");
});

test("pre_execution_ready não aceita nenhuma ação (estado terminal)", () => {
  const actions = PREPARATION_VALID_ACTIONS["pre_execution_ready"];
  assert.strictEqual(actions.length, 0);
});

// ── 4. Transição canônica → pre_execution_ready ───────────────────────────

console.log("\n── 4. Transição canônica → pre_execution_ready ──────────────────");

test("approved_for_manual_execution + marcar_pre_execucao → pre_execution_ready", () => {
  const next = transitionPreparationStatus("approved_for_manual_execution", "marcar_pre_execucao");
  assert.strictEqual(next, "pre_execution_ready");
});

test("pre_execution_ready + marcar_pre_execucao → null (já armado)", () => {
  const next = transitionPreparationStatus("pre_execution_ready", "marcar_pre_execucao");
  assert.strictEqual(next, null);
});

// ── 5. pre_execution_ready é estado terminal ─────────────────────────────

console.log("\n── 5. pre_execution_ready é estado terminal ──────────────────────");

test("pre_execution_ready rejeita todas as ações conhecidas", () => {
  const actions = ["revisar", "aprovar", "descartar", "marcar_pre_execucao"];
  for (const action of actions) {
    const next = transitionPreparationStatus("pre_execution_ready", action);
    assert.strictEqual(next, null, `ação "${action}" deve retornar null`);
  }
});

// ── 6. Transições inválidas para marcar_pre_execucao ─────────────────────

console.log("\n── 6. Transições inválidas para marcar_pre_execucao ─────────────");

test("draft + marcar_pre_execucao → null", () => {
  const next = transitionPreparationStatus("draft", "marcar_pre_execucao");
  assert.strictEqual(next, null);
});

test("review_ready + marcar_pre_execucao → null", () => {
  const next = transitionPreparationStatus("review_ready", "marcar_pre_execucao");
  assert.strictEqual(next, null);
});

test("discarded + marcar_pre_execucao → null", () => {
  const next = transitionPreparationStatus("discarded", "marcar_pre_execucao");
  assert.strictEqual(next, null);
});

// ── 7. Labels e textos de apoio para pre_execution_ready ─────────────────

console.log("\n── 7. Labels e textos de apoio ──────────────────────────────────");

test("PRE_EXECUTION_READY_LABEL não vazio", () => {
  assert.ok(PRE_EXECUTION_READY_LABEL.trim().length > 0);
});

test("PRE_EXECUTION_READY_SUPPORT_TEXT contém 'nenhuma execução'", () => {
  assert.ok(
    PRE_EXECUTION_READY_SUPPORT_TEXT.toLowerCase().includes("nenhuma execução"),
    "deve comunicar explicitamente que nenhuma execução ocorreu",
  );
});

test("PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE contém 'não foi executada'", () => {
  assert.ok(
    PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE.toLowerCase().includes("não foi executada"),
    "deve ser explícito sobre não-execução",
  );
});

test("PREPARATION_STATUS_SUPPORT_TEXT[pre_execution_ready] contém 'nenhuma execução'", () => {
  const text = PREPARATION_STATUS_SUPPORT_TEXT["pre_execution_ready"];
  assert.ok(
    text.toLowerCase().includes("nenhuma execução"),
    "texto de apoio deve comunicar não-execução",
  );
});

// ── 8. buildPreExecutionPackage — campos obrigatórios ────────────────────

console.log("\n── 8. buildPreExecutionPackage — campos obrigatórios ────────────");

test("pacote tem action_id igual ao draft de origem", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg.action_id, draft.action_id);
});

test("pacote tem action_type igual ao draft de origem", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg.action_type, draft.action_type);
});

test("pacote tem action_title igual ao draft de origem", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg.action_title, draft.action_title);
});

test("pacote tem risk_level igual ao draft de origem", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg.risk_level, draft.risk_level);
});

test("pacote tem suggested_approach igual ao draft de origem", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg.suggested_approach, draft.suggested_approach);
});

test("pacote tem suggested_steps igual ao draft de origem", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.deepEqual(pkg.suggested_steps, draft.suggested_steps);
});

// ── 9-12. Garantias canônicas ─────────────────────────────────────────────

console.log("\n── 9-12. Garantias canônicas ────────────────────────────────────");

test("not_yet_executed: true (garantia canônica)", () => {
  const pkg = buildPreExecutionPackage(makeDraft());
  assert.strictEqual(pkg.not_yet_executed, true);
});

test("requires_final_human_gesture: true (garantia canônica)", () => {
  const pkg = buildPreExecutionPackage(makeDraft());
  assert.strictEqual(pkg.requires_final_human_gesture, true);
});

test("readiness_status: 'pre_execution_ready' (garantia canônica)", () => {
  const pkg = buildPreExecutionPackage(makeDraft());
  assert.strictEqual(pkg.readiness_status, "pre_execution_ready");
});

test("armed_from_status: 'approved_for_manual_execution' (rastreabilidade)", () => {
  const pkg = buildPreExecutionPackage(makeDraft());
  assert.strictEqual(pkg.armed_from_status, "approved_for_manual_execution");
});

// ── 13. execution_checklist ───────────────────────────────────────────────

console.log("\n── 13. execution_checklist ──────────────────────────────────────");

test("PRE_EXECUTION_CHECKLIST tem pelo menos 5 itens", () => {
  assert.ok(PRE_EXECUTION_CHECKLIST.length >= 5);
});

test("checklist no pacote é o PRE_EXECUTION_CHECKLIST canônico", () => {
  const pkg = buildPreExecutionPackage(makeDraft());
  assert.deepEqual(pkg.execution_checklist, PRE_EXECUTION_CHECKLIST);
});

test("checklist contém item sobre 'nenhuma mensagem foi disparada'", () => {
  const hasItem = PRE_EXECUTION_CHECKLIST.some((item) =>
    item.toLowerCase().includes("nenhuma mensagem"),
  );
  assert.ok(hasItem, "checklist deve ter item explícito sobre não-disparo");
});

test("checklist contém item sobre gesto final", () => {
  const hasItem = PRE_EXECUTION_CHECKLIST.some((item) =>
    item.toLowerCase().includes("gesto final"),
  );
  assert.ok(hasItem, "checklist deve ter item sobre dependência de gesto final");
});

// ── 14-16. Herança de campos do draft ────────────────────────────────────

console.log("\n── 14-16. Herança de campos do draft ────────────────────────────");

test("pacote herda target_leads_detail quando disponível", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  if (draft.target_leads_detail.length > 0) {
    assert.deepEqual(pkg.target_leads_detail, draft.target_leads_detail);
  } else {
    // fallback path covered by test 16
    assert.ok(Array.isArray(pkg.target_leads_detail));
  }
});

test("pacote herda suggested_message do draft (vazio quando não há base)", () => {
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg.suggested_message, draft.suggested_message);
});

test("fallback para target_leads quando target_leads_detail vazio", () => {
  const draft = makeDraft();
  // Simulate empty target_leads_detail
  const draftWithEmpty = { ...draft, target_leads_detail: [] };
  const pkg = buildPreExecutionPackage(draftWithEmpty);
  assert.strictEqual(pkg.target_leads_detail.length, draft.target_leads.length);
  pkg.target_leads_detail.forEach((detail, i) => {
    assert.strictEqual(detail.name, draft.target_leads[i]);
    assert.strictEqual(detail.reason, "");
    assert.strictEqual(detail.priority_order, i + 1);
  });
});

// ── 17-18. Pureza e determinismo ──────────────────────────────────────────

console.log("\n── 17-18. Pureza e determinismo ─────────────────────────────────");

test("buildPreExecutionPackage não muta o draft de origem", () => {
  const draft = makeDraft();
  const originalTitle = draft.action_title;
  const originalId = draft.action_id;
  buildPreExecutionPackage(draft);
  assert.strictEqual(draft.action_title, originalTitle, "action_title do draft não deve mudar");
  assert.strictEqual(draft.action_id, originalId, "action_id do draft não deve mudar");
});

test("buildPreExecutionPackage é determinístico (mesmo draft → mesmo readiness_status)", () => {
  const draft = makeDraft();
  const pkg1 = buildPreExecutionPackage(draft);
  const pkg2 = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg1.readiness_status, pkg2.readiness_status);
  assert.strictEqual(pkg1.not_yet_executed, pkg2.not_yet_executed);
  assert.strictEqual(pkg1.requires_final_human_gesture, pkg2.requires_final_human_gesture);
});

// ── 19. Fluxo completo ────────────────────────────────────────────────────

console.log("\n── 19. Fluxo completo (draft → pre_execution_ready) ─────────────");

test("fluxo completo: draft → review_ready → approved → pre_execution_ready", () => {
  let status = PREPARATION_INITIAL_STATUS;
  assert.strictEqual(status, "draft");

  status = transitionPreparationStatus(status, "revisar");
  assert.strictEqual(status, "review_ready");

  status = transitionPreparationStatus(status, "aprovar");
  assert.strictEqual(status, "approved_for_manual_execution");

  status = transitionPreparationStatus(status, "marcar_pre_execucao");
  assert.strictEqual(status, "pre_execution_ready");

  // pacote pode ser construído
  const draft = makeDraft();
  const pkg = buildPreExecutionPackage(draft);
  assert.strictEqual(pkg.readiness_status, "pre_execution_ready");
  assert.strictEqual(pkg.not_yet_executed, true);
});

// ── 20. Backward compatibility (G2.3) ────────────────────────────────────

console.log("\n── 20. Backward compatibility (G2.3) ────────────────────────────");

test("draft → review_ready ainda funciona (G2.3)", () => {
  const next = transitionPreparationStatus("draft", "revisar");
  assert.strictEqual(next, "review_ready");
});

test("review_ready → approved_for_manual_execution ainda funciona (G2.3)", () => {
  const next = transitionPreparationStatus("review_ready", "aprovar");
  assert.strictEqual(next, "approved_for_manual_execution");
});

test("draft → descartar ainda funciona (G2.3)", () => {
  const next = transitionPreparationStatus("draft", "descartar");
  assert.strictEqual(next, "discarded");
});

test("review_ready → descartar ainda funciona (G2.3)", () => {
  const next = transitionPreparationStatus("review_ready", "descartar");
  assert.strictEqual(next, "discarded");
});

test("estados G2.3 têm labels canônicos preservados", () => {
  assert.ok(PREPARATION_STATUS_LABEL["draft"].length > 0);
  assert.ok(PREPARATION_STATUS_LABEL["review_ready"].length > 0);
  assert.ok(PREPARATION_STATUS_LABEL["approved_for_manual_execution"].length > 0);
  assert.ok(PREPARATION_STATUS_LABEL["discarded"].length > 0);
});

// ── 21. approved_for_manual_execution agora aceita marcar_pre_execucao ───

console.log("\n── 21. approved_for_manual_execution aceita marcar_pre_execucao ─");

test("approved_for_manual_execution agora aceita APENAS marcar_pre_execucao [G2.5]", () => {
  const actions = PREPARATION_VALID_ACTIONS["approved_for_manual_execution"];
  assert.ok(actions.includes("marcar_pre_execucao"), "deve incluir marcar_pre_execucao");
});

test("approved_for_manual_execution rejeita revisar (não é válida)", () => {
  const next = transitionPreparationStatus("approved_for_manual_execution", "revisar");
  assert.strictEqual(next, null);
});

test("approved_for_manual_execution rejeita descartar (não é válida)", () => {
  const next = transitionPreparationStatus("approved_for_manual_execution", "descartar");
  assert.strictEqual(next, null);
});

// ── Resultado ──────────────────────────────────────────────────────────────

console.log(`
─────────────────────────────────────────────────────────────────
  Resultado: ${passed} passed, ${failed} failed
  ${failed === 0 ? "Todos os smoke tests passaram ✅" : "❌ Há falhas — verificar logs acima"}
`);

if (failed > 0) process.exit(1);
