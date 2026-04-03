/**
 * cognitive_etapa7_precedence.smoke.mjs — Smoke tests da Etapa 7:
 * Ajuste de Precedência & Prioridade da Camada Cognitiva
 *
 * Cobertura obrigatória:
 *
 *  TOPO  (1-5)
 *   1. FAQ puro prioriza FAQ
 *   2. objeção pura prioriza objection handler
 *   3. caso factual usa KB
 *   4. contexto do stage preserva guidance local (stage context guard)
 *   5. resposta fora do stage volta com reancoragem
 *
 *  DOCS  (6-9)
 *   6. segurança de docs usa melhor precedência FAQ/objeção/KB
 *   7. dúvida factual de docs usa KB
 *   8. objeção "não tenho docs agora" prioriza objection handler
 *   9. retorno ao stage com reanchor
 *
 *  VISITA (10-13)
 *   10. horários/local usam KB/guidance certo
 *   11. objeção presencial usa objection handler
 *   12. imóvel/plantão usa FAQ/guidance correto
 *   13. retorno ao stage com reanchor
 *
 *  REGRESSÃO (14-18)
 *   14. contrato de fala final continua aplicado
 *   15. mecânico continua soberano
 *   16. nextStage intacto
 *   17. persistência intacta
 *   18. texto mecânico base intacto
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ── Dynamic imports ─────────────────────────────────────────────────────────

const {
  resolveWithPrecedence,
  isStageContextMessage,
  hasObjectionSignal,
  PRECEDENCE,
  OBJECTION_EMOTIONAL_SIGNALS,
  TOPO_STAGE_CONTEXT,
  DOCS_STAGE_CONTEXT,
  VISITA_STAGE_CONTEXT,
} = await import(
  new URL("../cognitive/src/precedence-policy.js", import.meta.url).href
);

const { getCanonicalFAQ } = await import(
  new URL("../cognitive/src/faq-lookup.js", import.meta.url).href
);
const { getCanonicalObjection } = await import(
  new URL("../cognitive/src/objections-lookup.js", import.meta.url).href
);
const { getKnowledgeBaseItem } = await import(
  new URL("../cognitive/src/knowledge-lookup.js", import.meta.url).href
);
const { buildReanchor } = await import(
  new URL("../cognitive/src/reanchor-helper.js", import.meta.url).href
);
const { applyFinalSpeechContract } = await import(
  new URL("../cognitive/src/final-speech-contract.js", import.meta.url).href
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFileText(relPath) {
  return readFileSync(path.resolve(__dirname, relPath), "utf8");
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

// Load sources for static assertions
const runCognitiveSrc = loadFileText("../cognitive/src/run-cognitive.js");
const precedenceSrc = loadFileText("../cognitive/src/precedence-policy.js");
const workerSrc = loadFileText("../Enova worker.js");

// ── Rebuild layer maps for functional tests ────────────────────────────────
// (mirrors the maps in run-cognitive.js — frozen, read-only)

const _TOPO_FAQ_MAP = Object.freeze([
  { pattern: /\b(como funciona|o que [eé]|me explica|minha casa minha vida|mcmv|programa|financiamento|subsidio|subsídio)\b/i, faqId: null, kbId: "elegibilidade_basica" },
  { pattern: /\b(quanto vou|quanto posso|valor.*financ|poder.*financ|financ.*poder|financ.*quanto)\b/i, faqId: "valor_sem_analise", kbId: null },
  { pattern: /\bfgts\b/i, faqId: "fgts_uso", kbId: "fgts_entrada" },
  { pattern: /\b(entrada|entrada m[ií]nima|valor.*entrada|preciso.*entrada)\b/i, faqId: "entrada_minima", kbId: null },
  { pattern: /\b(aprovad[oa]|vou ser aprovad|aprova[cç][aã]o|garantia|chance)\b/i, faqId: "aprovacao_garantia", kbId: null },
  { pattern: /\b(confi[aá]vel|seguro|golpe|medo|fraude|piramide)\b/i, objectionId: "medo_golpe", faqId: null, kbId: null },
  { pattern: /\b(vou pensar|depois.*vejo|pensar.*antes|pra pensar)\b/i, objectionId: "vou_pensar", faqId: null, kbId: null },
  { pattern: /\b(presencial|plant[aã]o|ir.*pessoalmente|prefiro.*presencial|prefiro.*ir)\b/i, objectionId: "presencial_preferido", faqId: null, kbId: null },
  { pattern: /\b(simul|j[aá] d[aá] pra simular|simulacao|simulação)\b/i, faqId: "simulacao_plantao", kbId: "simulacao_aprovacao" },
  { pattern: /\b(restri[cç][aã]o|nome sujo|spc|serasa|negativad)\b/i, faqId: "restricao_impede", kbId: "restricao_credito" },
  { pattern: /\b(demora|prazo|quanto tempo|rapidez)\b/i, faqId: "prazo_processo", kbId: null }
]);

const _DOCS_FAQ_MAP = Object.freeze([
  { pattern: /\b(seguro|segur|confi[aá]vel|golpe|vazar|expost|dados)\b/i, faqId: "seguranca_docs", objectionId: "duvida_seguranca_dados", kbId: null },
  { pattern: /\b(medo.*mandar|medo.*enviar|tenho medo|receio)\b/i, objectionId: "medo_golpe", faqId: null, kbId: null },
  { pattern: /\b(n[aã]o.*t[oô].*com|n[aã]o tenho.*doc|sem.*doc.*agora|n[aã]o.*consigo.*agora)\b/i, objectionId: "sem_documentos_agora", faqId: null, kbId: null },
  { pattern: /\b(mandar depois|posso.*depois|depois.*mando|mando.*depois|depois eu mando)\b/i, objectionId: "sem_documentos_agora", faqId: null, kbId: null },
  { pattern: /\b(quais doc|que doc|lista.*doc|documentos.*precis|preciso.*quais|o que eu preciso)\b/i, faqId: null, kbId: "docs_por_perfil", objectionId: null },
  { pattern: /\b(presencial|plant[aã]o|prefiro.*ir|prefiro.*presencial|n[aã]o.*online)\b/i, objectionId: "presencial_preferido", faqId: null, kbId: null },
  { pattern: /\b(sem tempo|n[aã]o tenho tempo|agora n[aã]o|corrido)\b/i, objectionId: "sem_tempo", faqId: null, kbId: null }
]);

const _VISITA_FAQ_MAP = Object.freeze([
  { pattern: /\b(hor[aá]rio|hora|dia|quando|opç[oõ]es|agenda)\b/i, faqId: null, kbId: "visita_plantao", objectionId: null },
  { pattern: /\b(onde fica|endereço|localiza[cç][aã]o|como cheg)\b/i, faqId: null, kbId: "visita_plantao", objectionId: null },
  { pattern: /\b(presencial|plant[aã]o|prefiro.*ir|prefiro.*presencial)\b/i, objectionId: "presencial_preferido", faqId: null, kbId: "visita_plantao" },
  { pattern: /\b(vou pensar|depois.*vejo|pensar.*antes|quem sabe|sem pressa)\b/i, objectionId: "vou_pensar", faqId: null, kbId: null },
  { pattern: /\b(n[aã]o quero online|n[aã]o.*online|n[aã]o.*quero.*online)\b/i, objectionId: "nao_quero_online", faqId: null, kbId: null },
  { pattern: /\b(escolher im[oó]vel|j[aá].*escolher|unidade|empreendimento)\b/i, faqId: "imovel_escolha", kbId: null, objectionId: null }
]);

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 1 — TOPO: FAQ puro prioriza FAQ
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 1: TOPO — FAQ puro prioriza FAQ ──");

test("1a. 'como funciona?' resolve KB elegibilidade_basica (no FAQ)", () => {
  const result = resolveWithPrecedence("como funciona", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para KB");
  assert.ok(result.source.includes("kb:elegibilidade_basica"), `source: ${result.source}`);
  assert.equal(result.precedence, PRECEDENCE.FAQ_DEFAULT);
});

test("1b. 'quanto posso financiar?' resolve FAQ valor_sem_analise", () => {
  const result = resolveWithPrecedence("quanto posso financiar", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para FAQ");
  assert.ok(result.source.includes("faq:valor_sem_analise"), `source: ${result.source}`);
});

test("1c. 'vou ser aprovado?' resolve FAQ aprovacao_garantia", () => {
  const result = resolveWithPrecedence("vou ser aprovado", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para FAQ");
  assert.ok(result.source.includes("faq:aprovacao_garantia"), `source: ${result.source}`);
});

test("1d. 'quanto dá de entrada?' resolve FAQ entrada_minima", () => {
  const result = resolveWithPrecedence("quanto da de entrada", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para FAQ");
  assert.ok(result.source.includes("faq:entrada_minima"), `source: ${result.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 2 — TOPO: objeção pura prioriza objection handler
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 2: TOPO — objeção pura prioriza objection handler ──");

test("2a. 'tenho medo de golpe' resolve objection medo_golpe", () => {
  const result = resolveWithPrecedence("tenho medo de golpe", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para objection");
  assert.ok(result.source.includes("objection:medo_golpe"), `source: ${result.source}`);
  assert.equal(result.precedence, PRECEDENCE.OBJECTION_PRIORITY);
});

test("2b. 'vou pensar' resolve objection vou_pensar", () => {
  const result = resolveWithPrecedence("vou pensar", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para objection");
  assert.ok(result.source.includes("objection:vou_pensar"), `source: ${result.source}`);
  assert.equal(result.precedence, PRECEDENCE.OBJECTION_PRIORITY);
});

test("2c. 'prefiro presencial' resolve objection presencial_preferido", () => {
  const result = resolveWithPrecedence("prefiro presencial", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para objection");
  assert.ok(result.source.includes("objection:presencial_preferido"), `source: ${result.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 3 — TOPO: caso factual usa KB
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 3: TOPO — caso factual usa KB ──");

test("3a. 'fgts' resolve FAQ fgts_uso (FAQ > KB quando ambos existem)", () => {
  const result = resolveWithPrecedence("fgts", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para FAQ ou KB");
  assert.ok(result.source.includes("faq:fgts_uso"), `source: ${result.source}`);
});

test("3b. 'como funciona o programa' resolve KB elegibilidade_basica", () => {
  const result = resolveWithPrecedence("como funciona o programa", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null, "deve resolver para KB");
  assert.ok(result.source.includes("kb:elegibilidade_basica"), `source: ${result.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 4 — TOPO: contexto do stage preserva guidance local
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 4: TOPO — contexto do stage preserva guidance local ──");

test("4a. 'me explica rapidinho e depois seguimos' → stage context → null", () => {
  const result = resolveWithPrecedence(
    "me explica rapidinho e depois seguimos",
    _TOPO_FAQ_MAP,
    "topo"
  );
  assert.equal(result, null, "stage-context message must return null for guidance local");
});

test("4b. 'vamos lá pode começar' → stage context → null", () => {
  const result = resolveWithPrecedence(
    "vamos la pode comecar",
    _TOPO_FAQ_MAP,
    "topo"
  );
  assert.equal(result, null, "stage-context message must return null");
});

test("4c. 'bora seguir' → stage context → null", () => {
  const result = resolveWithPrecedence("bora seguir", _TOPO_FAQ_MAP, "topo");
  assert.equal(result, null, "stage-context message must return null");
});

test("4d. isStageContextMessage detects topo context correctly", () => {
  assert.ok(isStageContextMessage("vamos la", "topo"));
  assert.ok(isStageContextMessage("bora", "topo"));
  assert.ok(isStageContextMessage("pode comecar", "topo"));
  assert.ok(isStageContextMessage("rapidinho", "topo"));
  assert.ok(!isStageContextMessage("como funciona", "topo"));
  assert.ok(!isStageContextMessage("quanto posso financiar", "topo"));
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 5 — TOPO: resposta fora do stage volta com reancoragem
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 5: TOPO — reancoragem em respostas fora do stage ──");

test("5a. respostas globais sempre têm needsReanchor=true", () => {
  const result = resolveWithPrecedence("como funciona", _TOPO_FAQ_MAP, "topo");
  assert.ok(result !== null);
  assert.equal(result.needsReanchor, true);
});

test("5b. buildReanchor funcional para stage do topo", () => {
  const reanchor = buildReanchor({ partialReply: "teste", currentStage: "inicio" });
  assert.ok(reanchor.text.length > 5, "reanchor must produce text");
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 6 — DOCS: segurança usa melhor precedência FAQ/objeção/KB
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 6: DOCS — segurança usa precedência correta ──");

test("6a. 'é seguro mandar docs?' → FAQ seguranca_docs (informational question)", () => {
  const result = resolveWithPrecedence("e seguro mandar docs", _DOCS_FAQ_MAP, "docs");
  assert.ok(result !== null);
  assert.ok(result.source.includes("faq:seguranca_docs"), `source: ${result.source}`);
  assert.equal(result.precedence, PRECEDENCE.FAQ_DEFAULT);
});

test("6b. 'tenho medo de mandar meus dados' → objection (emotional)", () => {
  const result = resolveWithPrecedence("tenho medo de mandar meus dados", _DOCS_FAQ_MAP, "docs");
  assert.ok(result !== null);
  // Emotional signal detected → objection takes priority; first matching entry with objectionId wins
  assert.ok(result.source.includes("objection:"), `expected objection, got: ${result.source}`);
  assert.equal(result.precedence, PRECEDENCE.OBJECTION_PRIORITY);
});

test("6c. 'medo de golpe com dados' → objection priority flips when emotional", () => {
  const result = resolveWithPrecedence("medo de golpe com dados", _DOCS_FAQ_MAP, "docs");
  assert.ok(result !== null);
  // With emotional signal, objection should win over FAQ
  assert.ok(
    result.source.includes("objection:"),
    `expected objection priority, got: ${result.source}`
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 7 — DOCS: dúvida factual usa KB
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 7: DOCS — dúvida factual de docs usa KB ──");

test("7a. 'o que eu preciso de documentos?' → KB docs_por_perfil", () => {
  const result = resolveWithPrecedence("o que eu preciso", _DOCS_FAQ_MAP, "docs");
  assert.ok(result !== null);
  assert.ok(result.source.includes("kb:docs_por_perfil"), `source: ${result.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 8 — DOCS: objeção "não tenho docs agora" prioriza objection
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 8: DOCS — objeção 'não tenho docs' prioriza objection handler ──");

test("8a. 'não tô com os docs agora' → objection sem_documentos_agora", () => {
  const result = resolveWithPrecedence("nao to com os docs agora", _DOCS_FAQ_MAP, "docs");
  assert.ok(result !== null);
  assert.ok(result.source.includes("objection:sem_documentos_agora"), `source: ${result.source}`);
});

test("8b. 'posso mandar depois?' → objection sem_documentos_agora", () => {
  const result = resolveWithPrecedence("posso mandar depois", _DOCS_FAQ_MAP, "docs");
  assert.ok(result !== null);
  assert.ok(result.source.includes("objection:sem_documentos_agora"), `source: ${result.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 9 — DOCS: retorno ao stage com reanchor + stage context guard
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 9: DOCS — reanchor e stage context guard ──");

test("9a. respostas globais de docs têm needsReanchor=true", () => {
  const result = resolveWithPrecedence("o que eu preciso", _DOCS_FAQ_MAP, "docs");
  assert.ok(result !== null);
  assert.equal(result.needsReanchor, true);
});

test("9b. 'vou mandar agora' → stage context → null (guidance local handles)", () => {
  const result = resolveWithPrecedence("vou mandar agora", _DOCS_FAQ_MAP, "docs");
  assert.equal(result, null, "stage-context message must return null");
});

test("9c. 'já enviei os docs' → stage context → null", () => {
  const result = resolveWithPrecedence("ja enviei os docs", _DOCS_FAQ_MAP, "docs");
  assert.equal(result, null, "stage-context message must return null");
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 10 — VISITA: horários/local usam KB/guidance certo
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 10: VISITA — horários/local usam KB correto ──");

test("10a. 'qual o horario?' → KB visita_plantao", () => {
  const result = resolveWithPrecedence("qual o horario", _VISITA_FAQ_MAP, "visita");
  assert.ok(result !== null);
  assert.ok(result.source.includes("kb:visita_plantao"), `source: ${result.source}`);
});

test("10b. 'onde fica?' → KB visita_plantao", () => {
  const result = resolveWithPrecedence("onde fica", _VISITA_FAQ_MAP, "visita");
  assert.ok(result !== null);
  assert.ok(result.source.includes("kb:visita_plantao"), `source: ${result.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 11 — VISITA: objeção presencial usa objection handler
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 11: VISITA — objeção presencial usa objection handler ──");

test("11a. 'vou pensar' → objection vou_pensar", () => {
  const result = resolveWithPrecedence("vou pensar", _VISITA_FAQ_MAP, "visita");
  assert.ok(result !== null);
  assert.ok(result.source.includes("objection:vou_pensar"), `source: ${result.source}`);
});

test("11b. 'não quero online' → objection nao_quero_online", () => {
  const result = resolveWithPrecedence("nao quero online", _VISITA_FAQ_MAP, "visita");
  assert.ok(result !== null);
  assert.ok(result.source.includes("objection:nao_quero_online"), `source: ${result.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 12 — VISITA: imóvel/plantão usa FAQ/guidance correto
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 12: VISITA — imóvel/plantão ──");

test("12a. 'já posso escolher o imóvel?' → FAQ imovel_escolha", () => {
  const result = resolveWithPrecedence("ja posso escolher o imovel", _VISITA_FAQ_MAP, "visita");
  assert.ok(result !== null);
  assert.ok(result.source.includes("faq:imovel_escolha"), `source: ${result.source}`);
});

test("12b. 'quero ir no plantão' → stage context (accepting) → null", () => {
  const result = resolveWithPrecedence("quero ir no plantao", _VISITA_FAQ_MAP, "visita");
  assert.equal(result, null, "accepting visit = stage context → guidance local handles");
});

test("12c. 'confirmo a visita' → stage context → null", () => {
  const result = resolveWithPrecedence("confirmo a visita", _VISITA_FAQ_MAP, "visita");
  assert.equal(result, null, "confirming visit = stage context");
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 13 — VISITA: retorno ao stage com reanchor
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 13: VISITA — reanchor ──");

test("13a. respostas globais de visita têm needsReanchor=true", () => {
  const result = resolveWithPrecedence("onde fica", _VISITA_FAQ_MAP, "visita");
  assert.ok(result !== null);
  assert.equal(result.needsReanchor, true);
});

test("13b. buildReanchor funcional para agendamento_visita", () => {
  const reanchor = buildReanchor({ partialReply: "teste", currentStage: "agendamento_visita" });
  assert.ok(reanchor.text.length > 5, "reanchor must produce text");
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 14 — REGRESSÃO: contrato de fala final continua aplicado
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 14: REGRESSÃO — contrato de fala final ──");

test("14a. applyFinalSpeechContract still works", () => {
  const result = applyFinalSpeechContract("Você vai comprar uma casa linda!", { currentStage: "inicio" });
  assert.ok(!result.includes("casa"), "must replace 'casa' with 'imóvel'");
});

test("14b. run-cognitive.js imports applyFinalSpeechContract", () => {
  assert.ok(runCognitiveSrc.includes("applyFinalSpeechContract"));
});

test("14c. run-cognitive.js applies final speech contract in runReadOnlyCognitiveEngine", () => {
  assert.ok(
    runCognitiveSrc.includes("applyFinalSpeechContract(response.reply_text"),
    "must apply final speech contract to response"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 15 — REGRESSÃO: mecânico continua soberano
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 15: REGRESSÃO — mecânico soberano ──");

test("15a. worker.js has step() function", () => {
  assert.ok(workerSrc.includes("function step("), "worker must have step()");
});

test("15b. worker.js has runFunnel function", () => {
  assert.ok(
    workerSrc.includes("runFunnel") || workerSrc.includes("run_funnel"),
    "worker must have runFunnel"
  );
});

test("15c. precedence-policy.js does NOT reference step/runFunnel/nextStage", () => {
  assert.ok(!precedenceSrc.includes("function step("), "must not contain step()");
  assert.ok(!precedenceSrc.includes("runFunnel"), "must not contain runFunnel");
  assert.ok(!precedenceSrc.includes("nextStage"), "must not contain nextStage");
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 16 — REGRESSÃO: nextStage intacto
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 16: REGRESSÃO — nextStage intacto ──");

test("16a. worker.js has nextStage references", () => {
  assert.ok(workerSrc.includes("nextStage"), "worker must have nextStage");
});

test("16b. precedence module does not alter nextStage", () => {
  assert.ok(!precedenceSrc.includes("nextStage"), "precedence must not touch nextStage");
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 17 — REGRESSÃO: persistência intacta
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 17: REGRESSÃO — persistência intacta ──");

test("17a. worker.js has upsert/persist functions", () => {
  assert.ok(
    workerSrc.includes("upsert") || workerSrc.includes("persist"),
    "worker must have persistence functions"
  );
});

test("17b. precedence module does not do persistence", () => {
  assert.ok(!precedenceSrc.includes("supabase"), "must not reference supabase");
  assert.ok(!precedenceSrc.includes("upsert"), "must not reference upsert");
  assert.ok(!precedenceSrc.includes("persist"), "must not reference persist");
  assert.ok(!precedenceSrc.includes("INSERT"), "must not reference INSERT");
  assert.ok(!precedenceSrc.includes("UPDATE"), "must not reference UPDATE");
});

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 18 — REGRESSÃO: texto mecânico base intacto
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── GRUPO 18: REGRESSÃO — texto mecânico base intacto ──");

test("18a. run-cognitive.js keeps resolveGlobalLayerReply for backward compat", () => {
  assert.ok(
    runCognitiveSrc.includes("function resolveGlobalLayerReply("),
    "resolveGlobalLayerReply must stay for operacional final and backward compat"
  );
});

test("18b. resolveWithPrecedence only replaces topo/docs/visita calls", () => {
  const lines = runCognitiveSrc.split("\n");
  let resolveWithPrecedenceCount = 0;
  let resolveGlobalLayerCount = 0;
  for (const line of lines) {
    if (line.includes("resolveWithPrecedence(") && !line.includes("import")) resolveWithPrecedenceCount++;
    if (line.includes("resolveGlobalLayerReply(") && !line.includes("function resolveGlobalLayerReply")) resolveGlobalLayerCount++;
  }
  assert.equal(resolveWithPrecedenceCount, 5, `expected 5 resolveWithPrecedence calls (3 topo + 1 docs + 1 visita), got ${resolveWithPrecedenceCount}`);
  assert.ok(resolveGlobalLayerCount >= 2, `expected ≥2 resolveGlobalLayerReply calls for operacional final, got ${resolveGlobalLayerCount}`);
});

test("18c. run-cognitive.js imports resolveWithPrecedence from precedence-policy.js", () => {
  assert.ok(
    runCognitiveSrc.includes('from "./precedence-policy.js"'),
    "must import from precedence-policy.js"
  );
});

// ── EXTRA: hasObjectionSignal works correctly ───────────────────────────────
console.log("\n── EXTRA: hasObjectionSignal verification ──");

test("E1. hasObjectionSignal detects emotional signals", () => {
  assert.ok(hasObjectionSignal("tenho medo"));
  assert.ok(hasObjectionSignal("vou pensar"));
  assert.ok(hasObjectionSignal("nao confio"));
  assert.ok(hasObjectionSignal("receio"));
  assert.ok(hasObjectionSignal("golpe"));
  assert.ok(!hasObjectionSignal("como funciona"));
  assert.ok(!hasObjectionSignal("quanto posso financiar"));
});

test("E2. objection signal flips priority: 'medo' on entry with both FAQ and objection", () => {
  // _DOCS_FAQ_MAP entry 0 has both faqId=seguranca_docs and objectionId=duvida_seguranca_dados
  // Without emotional signal: FAQ wins
  const resultNoEmotion = resolveWithPrecedence("e seguro", _DOCS_FAQ_MAP, "docs");
  assert.ok(resultNoEmotion !== null);
  assert.ok(resultNoEmotion.source.includes("faq:"), `no emotion → FAQ first, got: ${resultNoEmotion.source}`);

  // With emotional signal: objection wins
  const resultEmotion = resolveWithPrecedence("medo nao confio seguro", _DOCS_FAQ_MAP, "docs");
  assert.ok(resultEmotion !== null);
  assert.ok(resultEmotion.source.includes("objection:"), `emotion → objection first, got: ${resultEmotion.source}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// RESULTADO FINAL
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n────────────────────────────────────────────");
console.log(`RESULTADO: ${passed} passed / ${failed} failed / ${passed + failed} total`);
console.log("────────────────────────────────────────────");

if (failed > 0) {
  console.error("\n⚠️  Smoke tests da Etapa 7 falharam.");
  process.exit(1);
}

console.log("\n✅ Todos os smoke tests da Etapa 7 passaram.");
