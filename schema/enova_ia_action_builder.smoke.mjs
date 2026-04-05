// ============================================================
// Smoke tests — enova-ia-action-builder (G2.1)
//
// Executa o builder REAL de panel/app/lib/enova-ia-action-builder.ts.
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Valida a estrutura canônica da ação assistida:
//   1. Resposta com ação clara gera draft
//   2. Resposta vaga/não acionável retorna null
//   3. Status nasce como "draft"
//   4. requires_human_approval nasce true
//   5. Nenhum side effect externo ocorreu
//   6. Taxonomia, risco, detecção de tipo
// ============================================================

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const builderPath = resolve(__dirname, "../panel/app/lib/enova-ia-action-builder.ts");

// ── Importar o builder REAL ──────────────────────────────────────────────

const {
  buildEnovaIaActionDraft,
  ACTION_TYPE_LABEL,
  RISK_LEVEL_LABEL,
  _hasActionableBasis,
  _classifyRisk,
  _detectActionType,
} = await import(builderPath);

// Derive valid sets from the real module (not reimplemented here)
const VALID_ACTION_TYPES = new Set(Object.keys(ACTION_TYPE_LABEL));
const VALID_RISK_LEVELS  = new Set(Object.keys(RISK_LEVEL_LABEL));

// ── Helpers de teste ────────────────────────────────────────────────────

/** Fábrica de resposta OpenAI para testes. */
function makeResponse(overrides = {}) {
  return {
    mode: "plano_de_acao",
    answer_title: "Plano de follow-up para leads mornos",
    answer_summary: "Identificamos 12 leads mornos que podem ser reengajados com follow-up leve.",
    analysis_points: ["12 leads sem resposta há 3-5 dias", "Perfil válido para MCMV"],
    recommended_actions: ["Enviar follow-up leve para cada lead", "Priorizar os de renda validada"],
    relevant_leads: [
      { name: "João Silva", reason: "Sem resposta há 4 dias, renda ok" },
      { name: "Maria Santos", reason: "Sem resposta há 3 dias, docs parciais" },
    ],
    suggested_programs: ["Reengajamento morno"],
    risks: ["Alguns podem já ter desistido"],
    should_escalate_human: false,
    should_request_system_improvement: false,
    system_improvement_suggestion: null,
    confidence: "alta",
    notes: null,
    ...overrides,
  };
}

// ── TESTES ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log("\n🔬 Smoke Tests — enova-ia-action-builder (G2.1)\n");

// ── 1. Resposta com ação clara gera draft ───────────────────────────────

test("1.1 — Resposta plano_de_acao com ações claras gera draft", () => {
  const r = makeResponse();
  const draft = buildEnovaIaActionDraft(r, "reengajar leads mornos");
  assert.ok(draft !== null, "draft não deveria ser null");
  assert.ok(draft.action_id.length > 0, "action_id deve ter valor");
});

test("1.2 — Resposta segmentacao com ações claras gera draft", () => {
  const r = makeResponse({
    mode: "segmentacao",
    recommended_actions: ["Segmentar leads frios recuperáveis"],
    analysis_points: ["30 leads frios com perfil válido"],
  });
  const draft = buildEnovaIaActionDraft(r, "segmentar leads frios");
  assert.ok(draft !== null, "draft não deveria ser null");
  assert.equal(draft.source_mode, "segmentacao");
});

test("1.3 — Resposta campanha com ações claras gera draft", () => {
  const r = makeResponse({
    mode: "campanha",
    recommended_actions: ["Disparar campanha de WhatsApp"],
    analysis_points: ["Oportunidade de reativação sazonal"],
  });
  const draft = buildEnovaIaActionDraft(r, "campanha de reativação");
  assert.ok(draft !== null);
  assert.equal(draft.action_type, "campanha_sugerida");
});

test("1.4 — Resposta risco com ações claras gera draft", () => {
  const r = makeResponse({
    mode: "risco",
    recommended_actions: ["Escalar para corretor humano imediatamente"],
    analysis_points: ["Lead com restrição grave no CPF"],
    should_escalate_human: true,
  });
  const draft = buildEnovaIaActionDraft(r, "analisar riscos");
  assert.ok(draft !== null);
});

// ── 2. Resposta vaga/não acionável retorna null ─────────────────────────

test("2.1 — Resposta modo 'conhecimento' retorna null (não acionável)", () => {
  const r = makeResponse({ mode: "conhecimento" });
  const draft = buildEnovaIaActionDraft(r, "o que é mcmv?");
  assert.equal(draft, null);
});

test("2.2 — Resposta modo 'analise_operacional' retorna null (não acionável)", () => {
  const r = makeResponse({ mode: "analise_operacional" });
  const draft = buildEnovaIaActionDraft(r, "resumo da operação");
  assert.equal(draft, null);
});

test("2.3 — Resposta modo 'precisa_humano' retorna null (não acionável)", () => {
  const r = makeResponse({ mode: "precisa_humano" });
  const draft = buildEnovaIaActionDraft(r, "situação complexa");
  assert.equal(draft, null);
});

test("2.4 — Resposta modo 'melhoria_crm' retorna null (não acionável)", () => {
  const r = makeResponse({ mode: "melhoria_crm" });
  const draft = buildEnovaIaActionDraft(r, "melhorar o CRM");
  assert.equal(draft, null);
});

test("2.5 — Ações recomendadas vazias retorna null", () => {
  const r = makeResponse({ recommended_actions: [] });
  const draft = buildEnovaIaActionDraft(r, "teste vazio");
  assert.equal(draft, null);
});

test("2.6 — Ações recomendadas com strings vazias retorna null", () => {
  const r = makeResponse({ recommended_actions: ["", "  ", ""] });
  const draft = buildEnovaIaActionDraft(r, "teste strings vazias");
  assert.equal(draft, null);
});

test("2.7 — analysis_points vazios retorna null", () => {
  const r = makeResponse({ analysis_points: [] });
  const draft = buildEnovaIaActionDraft(r, "teste sem análise");
  assert.equal(draft, null);
});

test("2.8 — answer_summary vazio retorna null", () => {
  const r = makeResponse({ answer_summary: "" });
  const draft = buildEnovaIaActionDraft(r, "teste sem resumo");
  assert.equal(draft, null);
});

test("2.9 — answer_summary só espaços retorna null", () => {
  const r = makeResponse({ answer_summary: "   " });
  const draft = buildEnovaIaActionDraft(r, "teste resumo branco");
  assert.equal(draft, null);
});

// ── 3. Status nasce como "draft" ────────────────────────────────────────

test("3.1 — status é sempre 'draft'", () => {
  const r = makeResponse();
  const draft = buildEnovaIaActionDraft(r, "teste status");
  assert.equal(draft.status, "draft");
});

test("3.2 — status é 'draft' para todos os modos acionáveis", () => {
  for (const mode of ["plano_de_acao", "segmentacao", "campanha", "risco"]) {
    const r = makeResponse({ mode });
    const draft = buildEnovaIaActionDraft(r, `teste ${mode}`);
    assert.ok(draft !== null, `draft null para mode ${mode}`);
    assert.equal(draft.status, "draft", `status != draft para mode ${mode}`);
  }
});

// ── 4. requires_human_approval nasce true ───────────────────────────────

test("4.1 — requires_human_approval é sempre true", () => {
  const r = makeResponse();
  const draft = buildEnovaIaActionDraft(r, "teste approval");
  assert.equal(draft.requires_human_approval, true);
});

test("4.2 — requires_human_approval true para todos os modos acionáveis", () => {
  for (const mode of ["plano_de_acao", "segmentacao", "campanha", "risco"]) {
    const r = makeResponse({ mode });
    const draft = buildEnovaIaActionDraft(r, `teste ${mode}`);
    assert.ok(draft !== null);
    assert.equal(draft.requires_human_approval, true, `approval != true para ${mode}`);
  }
});

// ── 5. Nenhum side effect externo ───────────────────────────────────────

test("5.1 — builder é puro — não modifica a resposta original", () => {
  const r = makeResponse();
  const rCopy = JSON.parse(JSON.stringify(r));
  buildEnovaIaActionDraft(r, "teste pureza");
  assert.deepEqual(r, rCopy, "resposta original foi modificada!");
});

test("5.2 — builder retorna objeto novo (não referência compartilhada)", () => {
  const r = makeResponse();
  const d1 = buildEnovaIaActionDraft(r, "teste ref 1");
  const d2 = buildEnovaIaActionDraft(r, "teste ref 2");
  assert.ok(d1 !== d2, "dois drafts são a mesma referência");
  assert.notEqual(d1.action_id, d2.action_id, "action_ids iguais");
});

test("5.3 — nenhuma variável global foi alterada", () => {
  const globalKeysBefore = Object.keys(globalThis).sort().join(",");
  buildEnovaIaActionDraft(makeResponse(), "teste globals");
  const globalKeysAfter = Object.keys(globalThis).sort().join(",");
  assert.equal(globalKeysBefore, globalKeysAfter, "globals mudaram!");
});

// ── 6. Detecção de tipo de ação (via _detectActionType real) ────────────

test("6.1 — detecta followup_lote por keyword 'follow-up'", () => {
  const t = _detectActionType(["Enviar follow-up leve"], "plano_de_acao");
  assert.equal(t, "followup_lote");
});

test("6.2 — detecta reativacao_lote por keyword 'reativ'", () => {
  const t = _detectActionType(["Reativar leads frios"], "plano_de_acao");
  assert.equal(t, "reativacao_lote");
});

test("6.3 — detecta mutirao_docs por keyword 'document'", () => {
  const t = _detectActionType(["Solicitar documentação pendente"], "plano_de_acao");
  assert.equal(t, "mutirao_docs");
});

test("6.4 — detecta pre_plantao por keyword 'visita'", () => {
  const t = _detectActionType(["Agendar visita ao empreendimento"], "plano_de_acao");
  assert.equal(t, "pre_plantao");
});

test("6.5 — detecta intervencao_humana por keyword 'escalar'", () => {
  const t = _detectActionType(["Escalar para corretor sênior"], "plano_de_acao");
  assert.equal(t, "intervencao_humana");
});

test("6.6 — detecta campanha_sugerida por keyword 'campanha'", () => {
  const t = _detectActionType(["Lançar campanha de WhatsApp"], "plano_de_acao");
  assert.equal(t, "campanha_sugerida");
});

test("6.7 — fallback para mode default quando sem keyword", () => {
  const t = _detectActionType(["Ação genérica sem palavra-chave"], "segmentacao");
  assert.equal(t, "reativacao_lote"); // default de segmentacao
});

// ── 7. Classificação de risco (via _classifyRisk real) ─────────────────

test("7.1 — risco high quando should_escalate_human=true", () => {
  const risk = _classifyRisk(makeResponse({ should_escalate_human: true }));
  assert.equal(risk, "high");
});

test("7.2 — risco high quando confidence=baixa", () => {
  const risk = _classifyRisk(makeResponse({ confidence: "baixa" }));
  assert.equal(risk, "high");
});

test("7.3 — risco medium quando risks >= 2", () => {
  const risk = _classifyRisk(makeResponse({ risks: ["risco 1", "risco 2"], confidence: "alta" }));
  assert.equal(risk, "medium");
});

test("7.4 — risco medium quando confidence=media", () => {
  const risk = _classifyRisk(makeResponse({ confidence: "media", risks: [] }));
  assert.equal(risk, "medium");
});

test("7.5 — risco low quando confidence=alta e poucos riscos", () => {
  const risk = _classifyRisk(makeResponse({ confidence: "alta", risks: ["risco leve"] }));
  assert.equal(risk, "low");
});

test("7.6 — risco low quando sem riscos e confidence alta", () => {
  const risk = _classifyRisk(makeResponse({ confidence: "alta", risks: [] }));
  assert.equal(risk, "low");
});

// ── 8. Campos do draft estão corretos ───────────────────────────────────

test("8.1 — target_leads vem dos relevant_leads", () => {
  const r = makeResponse();
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.deepEqual(draft.target_leads, ["João Silva", "Maria Santos"]);
  assert.equal(draft.target_count, 2);
});

test("8.2 — target_leads vazio quando relevant_leads vazio", () => {
  const r = makeResponse({ relevant_leads: [] });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.deepEqual(draft.target_leads, []);
  assert.equal(draft.target_count, 0);
});

test("8.3 — suggested_steps vem dos recommended_actions filtrados", () => {
  const r = makeResponse({ recommended_actions: ["Ação 1", "", "Ação 2"] });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.deepEqual(draft.suggested_steps, ["Ação 1", "Ação 2"]);
});

test("8.4 — reason vem dos analysis_points concatenados", () => {
  const r = makeResponse({ analysis_points: ["Ponto A", "Ponto B"] });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.reason, "Ponto A; Ponto B");
});

test("8.5 — created_from_prompt preserva o prompt original", () => {
  const prompt = "quais leads preciso recontatar hoje?";
  const draft = buildEnovaIaActionDraft(makeResponse(), prompt);
  assert.equal(draft.created_from_prompt, prompt);
});

test("8.6 — source_mode preserva o modo da resposta", () => {
  const r = makeResponse({ mode: "campanha" });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.source_mode, "campanha");
});

test("8.7 — suggested_message é string (string vazia quando sem base para contato direto)", () => {
  // campanha_sugerida type → não gera mensagem sugerida (MESSAGING_ACTION_TYPES não inclui campanha)
  const r = makeResponse({
    mode: "campanha",
    recommended_actions: ["Criar campanha para leads frios", "Disparar comunicação em lote"],
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(typeof draft.suggested_message, "string");
  assert.equal(draft.suggested_message, "");
});

test("8.8 — action_title vem do answer_title", () => {
  const r = makeResponse({ answer_title: "Título Customizado" });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.action_title, "Título Customizado");
});

test("8.9 — action_summary vem do answer_summary", () => {
  const r = makeResponse({ answer_summary: "Resumo operacional." });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.action_summary, "Resumo operacional.");
});

// ── 9. Validação de tipos canônicos (derivados do módulo real) ───────────

test("9.1 — action_type é sempre um tipo válido da taxonomia do builder", () => {
  for (const mode of ["plano_de_acao", "segmentacao", "campanha", "risco"]) {
    const r = makeResponse({ mode });
    const draft = buildEnovaIaActionDraft(r, "teste");
    assert.ok(VALID_ACTION_TYPES.has(draft.action_type), `tipo inválido: ${draft.action_type}`);
  }
});

test("9.2 — risk_level é sempre um nível válido do builder", () => {
  for (const conf of ["alta", "media", "baixa"]) {
    const r = makeResponse({ confidence: conf });
    const draft = buildEnovaIaActionDraft(r, "teste");
    assert.ok(VALID_RISK_LEVELS.has(draft.risk_level), `risco inválido: ${draft.risk_level}`);
  }
});

// ── Resultado final ─────────────────────────────────────────────────────

console.log(`\n📊 Resultado: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
if (failed > 0) {
  process.exit(1);
}

