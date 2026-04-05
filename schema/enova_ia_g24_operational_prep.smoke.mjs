// ============================================================
// Smoke tests — enova-ia-action-builder (G2.4)
// Preparação Operacional Detalhada da Ação
//
// Executa o builder REAL de panel/app/lib/enova-ia-action-builder.ts.
// Requer: node --experimental-strip-types (Node v22.6+)
//
// Valida os campos G2.4 adicionados:
//   1. target_leads_detail: motivo e prioridade por lead
//   2. suggested_approach: abordagem derivada de action_type + risk_level
//   3. suggested_message: gerado apenas com base suficiente
//   4. Guards de mensagem: sem base → string vazia
//   5. Compatibilidade backward com G2.1/G2.3
//   6. Nenhum side effect: sem persistência, sem execução
// ============================================================

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const builderPath = resolve(__dirname, "../panel/app/lib/enova-ia-action-builder.ts");

// ── Importar o builder REAL ──────────────────────────────────────────────

const {
  buildEnovaIaActionDraft,
  _buildTargetLeadsDetail,
  _deriveSuggestedApproach,
  _deriveSuggestedMessage,
  ACTION_TYPE_LABEL,
} = await import(builderPath);

// ── Helpers de teste ────────────────────────────────────────────────────

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

// ── 1. target_leads_detail: estrutura e campos ────────────────────────────

console.log("\n── 1. target_leads_detail ──────────────────────────────────────");

test("1.1 — draft tem campo target_leads_detail (array)", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.ok(Array.isArray(draft.target_leads_detail), "target_leads_detail deve ser array");
});

test("1.2 — target_leads_detail preserva todos os leads identificados", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(draft.target_leads_detail.length, 2);
});

test("1.3 — target_leads_detail traz nome correto de cada lead", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(draft.target_leads_detail[0].name, "João Silva");
  assert.equal(draft.target_leads_detail[1].name, "Maria Santos");
});

test("1.4 — target_leads_detail traz motivo individual de cada lead", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(draft.target_leads_detail[0].reason, "Sem resposta há 4 dias, renda ok");
  assert.equal(draft.target_leads_detail[1].reason, "Sem resposta há 3 dias, docs parciais");
});

test("1.5 — target_leads_detail atribui priority_order 1-based na ordem da IA", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(draft.target_leads_detail[0].priority_order, 1);
  assert.equal(draft.target_leads_detail[1].priority_order, 2);
});

test("1.6 — target_leads_detail vazio quando relevant_leads vazio", () => {
  const r = makeResponse({ relevant_leads: [] });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.target_leads_detail.length, 0);
});

test("1.7 — target_leads_detail reason é string vazia quando reason é vazio no lead", () => {
  const r = makeResponse({
    relevant_leads: [{ name: "Lead Sem Motivo", reason: "" }],
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.target_leads_detail[0].reason, "");
});

test("1.8 — target_leads_detail reason trim() remove espaços em branco", () => {
  const r = makeResponse({
    relevant_leads: [{ name: "Lead Trim", reason: "  motivo com espaços  " }],
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.target_leads_detail[0].reason, "motivo com espaços");
});

test("1.9 — target_leads e target_leads_detail são consistentes em tamanho", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(draft.target_leads.length, draft.target_leads_detail.length);
});

test("1.10 — _buildTargetLeadsDetail função pura retorna array correto", () => {
  const leads = [
    { name: "Ana Costa", reason: "Lead quente" },
    { name: "Carlos Neto", reason: "Perfil ok" },
  ];
  const detail = _buildTargetLeadsDetail(leads);
  assert.equal(detail.length, 2);
  assert.equal(detail[0].priority_order, 1);
  assert.equal(detail[1].priority_order, 2);
  assert.equal(detail[0].name, "Ana Costa");
  assert.equal(detail[0].reason, "Lead quente");
});

// ── 2. suggested_approach: abordagem derivada ─────────────────────────────

console.log("\n── 2. suggested_approach ───────────────────────────────────────");

test("2.1 — draft tem campo suggested_approach (string)", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(typeof draft.suggested_approach, "string");
});

test("2.2 — suggested_approach não é vazio para ação acionável padrão", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.ok(draft.suggested_approach.length > 0, "suggested_approach não deve ser vazio");
});

test("2.3 — suggested_approach para followup_lote menciona follow-up", () => {
  const r = makeResponse({ mode: "plano_de_acao" });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.ok(
    draft.action_type === "followup_lote",
    `esperava followup_lote, got ${draft.action_type}`,
  );
  assert.ok(
    draft.suggested_approach.toLowerCase().includes("follow"),
    "abordagem de followup_lote deve mencionar follow",
  );
});

test("2.4 — suggested_approach com risco high adiciona nota de cautela", () => {
  const r = makeResponse({ should_escalate_human: true });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.risk_level, "high");
  assert.ok(
    draft.suggested_approach.includes("⚠️"),
    "risco alto deve incluir ícone de alerta na abordagem",
  );
});

test("2.5 — suggested_approach com risco low não tem nota de cautela de alto risco", () => {
  const r = makeResponse({ confidence: "alta", risks: [], should_escalate_human: false });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.risk_level, "low");
  assert.ok(
    !draft.suggested_approach.includes("Risco alto"),
    "risco baixo não deve mencionar risco alto",
  );
});

test("2.6 — _deriveSuggestedApproach função pura retorna string não-vazia para todos tipos", () => {
  const actionTypes = [
    "followup_lote",
    "reativacao_lote",
    "mutirao_docs",
    "pre_plantao",
    "intervencao_humana",
    "campanha_sugerida",
  ];
  for (const type of actionTypes) {
    const approach = _deriveSuggestedApproach(type, "low");
    assert.ok(approach.length > 0, `abordagem vazia para tipo: ${type}`);
  }
});

test("2.7 — _deriveSuggestedApproach todos tipos válidos da taxonomia têm abordagem", () => {
  for (const type of Object.keys(ACTION_TYPE_LABEL)) {
    const approach = _deriveSuggestedApproach(type, "medium");
    assert.ok(typeof approach === "string", `abordagem deve ser string para ${type}`);
    assert.ok(approach.length > 0, `abordagem vazia para tipo: ${type}`);
  }
});

// ── 3. suggested_message: guards e geração ───────────────────────────────

console.log("\n── 3. suggested_message ────────────────────────────────────────");

test("3.1 — suggested_message é string (nunca undefined ou null)", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(typeof draft.suggested_message, "string");
});

test("3.2 — suggested_message gerado para followup_lote com confidence alta e leads com motivo", () => {
  const r = makeResponse({
    mode: "plano_de_acao",
    recommended_actions: ["Retomar follow-up com cada lead"],
    confidence: "alta",
    relevant_leads: [{ name: "Lead X", reason: "Sem resposta há 4 dias" }],
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.action_type, "followup_lote");
  assert.ok(draft.suggested_message.length > 0, "deve gerar mensagem para followup com base");
});

test("3.3 — suggested_message vazio para campanha_sugerida (não é ação de contato direto)", () => {
  const r = makeResponse({
    mode: "campanha",
    recommended_actions: ["Criar campanha para leads frios", "Disparar comunicação"],
    confidence: "alta",
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.action_type, "campanha_sugerida");
  assert.equal(draft.suggested_message, "");
});

test("3.4 — suggested_message vazio quando confidence não é alta", () => {
  const r = makeResponse({ confidence: "media" });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.suggested_message, "");
});

test("3.5 — suggested_message vazio quando confidence baixa", () => {
  const r = makeResponse({ confidence: "baixa" });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.suggested_message, "");
});

test("3.6 — suggested_message vazio quando não há leads com motivo", () => {
  const r = makeResponse({
    relevant_leads: [{ name: "Lead Sem Motivo", reason: "" }],
    confidence: "alta",
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.suggested_message, "");
});

test("3.7 — suggested_message vazio quando relevant_leads vazio", () => {
  const r = makeResponse({ relevant_leads: [], confidence: "alta" });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.suggested_message, "");
});

test("3.8 — suggested_message gerado para reativacao_lote com base suficiente", () => {
  const r = makeResponse({
    mode: "segmentacao",
    recommended_actions: ["Reativar leads frios do lote de setembro"],
    confidence: "alta",
    relevant_leads: [{ name: "Lead Frio", reason: "Sem resposta há 10 dias, perfil válido" }],
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.action_type, "reativacao_lote");
  assert.ok(draft.suggested_message.length > 0, "deve gerar mensagem para reativacao com base");
});

test("3.9 — suggested_message vazio para mutirao_docs mesmo com base suficiente", () => {
  const r = makeResponse({
    recommended_actions: ["Cobrar documentos pendentes de cada lead"],
    confidence: "alta",
    relevant_leads: [{ name: "Lead Docs", reason: "CPF pendente" }],
  });
  const draft = buildEnovaIaActionDraft(r, "teste");
  assert.equal(draft.action_type, "mutirao_docs");
  assert.equal(draft.suggested_message, "");
});

test("3.10 — _deriveSuggestedMessage função pura: retorna string para followup com base", () => {
  const leadsDetail = [{ name: "L", reason: "motivo real", priority_order: 1 }];
  const msg = _deriveSuggestedMessage("followup_lote", leadsDetail, "alta");
  assert.ok(typeof msg === "string");
  assert.ok(msg.length > 0);
});

test("3.11 — _deriveSuggestedMessage função pura: retorna vazio para intervencao_humana", () => {
  const leadsDetail = [{ name: "L", reason: "motivo", priority_order: 1 }];
  const msg = _deriveSuggestedMessage("intervencao_humana", leadsDetail, "alta");
  assert.equal(msg, "");
});

// ── 4. Compatibilidade backward com G2.1/G2.3 ────────────────────────────

console.log("\n── 4. Compatibilidade backward G2.1/G2.3 ───────────────────────");

test("4.1 — status ainda nasce como 'draft'", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(draft.status, "draft");
});

test("4.2 — requires_human_approval ainda nasce como true", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.equal(draft.requires_human_approval, true);
});

test("4.3 — campos G2.1 (action_id, action_type, risk_level, etc.) ainda presentes", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.ok(typeof draft.action_id === "string" && draft.action_id.length > 0);
  assert.ok(typeof draft.action_type === "string");
  assert.ok(typeof draft.risk_level === "string");
  assert.ok(typeof draft.action_title === "string");
  assert.ok(typeof draft.action_summary === "string");
  assert.ok(Array.isArray(draft.target_leads));
  assert.ok(Array.isArray(draft.suggested_steps));
  assert.ok(typeof draft.reason === "string");
});

test("4.4 — target_leads ainda funciona como antes (array de nomes)", () => {
  const draft = buildEnovaIaActionDraft(makeResponse(), "teste");
  assert.deepEqual(draft.target_leads, ["João Silva", "Maria Santos"]);
});

test("4.5 — retorno null para resposta sem base (compatibilidade G2.1)", () => {
  const r = makeResponse({ mode: "conhecimento" });
  const result = buildEnovaIaActionDraft(r, "teste");
  assert.equal(result, null);
});

// ── 5. Sem side effect — nenhuma mutação, nenhuma execução ───────────────

console.log("\n── 5. Ausência de side effects ─────────────────────────────────");

test("5.1 — buildEnovaIaActionDraft não muta a resposta original", () => {
  const r = makeResponse();
  const before = JSON.stringify(r);
  buildEnovaIaActionDraft(r, "teste");
  assert.equal(JSON.stringify(r), before, "resposta original não deve ser mutada");
});

test("5.2 — duas chamadas com mesma resposta geram drafts distintos (action_id único)", () => {
  const r = makeResponse();
  const d1 = buildEnovaIaActionDraft(r, "teste");
  const d2 = buildEnovaIaActionDraft(r, "teste");
  assert.notEqual(d1.action_id, d2.action_id);
});

test("5.3 — suggested_approach e suggested_message são determinísticos (mesmos inputs → mesmo output)", () => {
  const r = makeResponse();
  const d1 = buildEnovaIaActionDraft(r, "teste");
  const d2 = buildEnovaIaActionDraft(r, "teste");
  assert.equal(d1.suggested_approach, d2.suggested_approach);
  assert.equal(d1.suggested_message, d2.suggested_message);
});

test("5.4 — target_leads_detail é cópia independente (sem referência compartilhada)", () => {
  const r = makeResponse();
  const draft = buildEnovaIaActionDraft(r, "teste");
  // Mutate original relevant_leads — draft must not be affected
  r.relevant_leads[0].reason = "MUTADO";
  assert.notEqual(draft.target_leads_detail[0].reason, "MUTADO");
});

// ── Resultado final ──────────────────────────────────────────────────────

console.log(`\n📊 Resultado: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
if (failed > 0) {
  process.exit(1);
}
