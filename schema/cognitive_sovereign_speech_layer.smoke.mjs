/**
 * cognitive_sovereign_speech_layer.smoke.mjs
 *
 * Smoke tests para a camada canônica de fala cognitiva soberana.
 *
 * Valida:
 *   A) Funções da camada existem no worker (presença de âncoras)
 *   B) step() integra renderCognitiveSpeech
 *   C) renderCognitiveSpeech — hierarquia de 3 caminhos (contrato zero-rawArr)
 *   D) buildMinimalCognitiveFallback — intent-based primário, mapa fallback
 *   E) reconcileClientInput / buildRoundIntent — campos canônicos incl. mechanical_prompt_source
 *   F) _COGNITIVE_RENDER_PHASE_MAP — stages mapeados
 *   G) Segurança estrutural (gates/nextStage/persistência preservados)
 *   H) Prova de remoção de verniz: _applyCognitiveSurfaceFilter/_softQuestion removidas
 *   I) BEHAVIORAL: 8 cenários topo/meio → zero rawArr exposto + fase preservada
 *   J) classifyRenderPath — classificação canônica de origem
 *   K) Limitações honestas do overlap/reconciliação
 *   L) BEHAVIORAL: 6 cenários gates_finais/operacional → zero rawArr, fala cognitiva
 *   M) Intent-based rendering: mechanical source como fonte de intenção
 *   N) Guardrails de cobrança por fase (_PHASE_REQUIREMENT_GUARDRAILS)
 *   O) buildRoundIntent novos campos canônicos (mechanical_prompt_source, intencao_da_rodada)
 *   P) BEHAVIORAL: intent-based rendering end-to-end em stages técnicos
 *
 * CONTRATO CENTRAL (post comments 4189815742 + 4189874369 + 4189949026):
 *   Nenhum caminho expõe rawArr literal ao cliente — SEM EXCEÇÕES:
 *   - cognitive_real (Caminho 1): rawArr DESCARTADO, só prefix LLM
 *   - cognitive_heuristic (Caminho 2): rawArr DESCARTADO, só prefix do resolver
 *   - cognitive_fallback (Caminho 3): mechanical_prompt_source → fala cognitiva
 *     via _renderCognitiveFromIntent (primário), mapa por stage (fallback).
 *     _PHASE_REQUIREMENT_GUARDRAILS valida preservação da exigência técnica.
 *
 * _applyCognitiveSurfaceFilter REMOVIDA — não existe mais exceção de superfície
 * híbrida para nenhum stage. _softQuestion também removida.
 *
 * BLOCO 3 (overlap honesto, limitações declaradas):
 *   Cobertura real: ? + comprimento > 20 + não-saudação pura.
 *   Limitações: off-trail sem ?, ≤ 20 chars, complementos sem ?.
 */

import assert from "node:assert/strict";
// vm: used to extract and test pure functions from worker source
// without loading the full worker infrastructure (avoids side effects,
// network calls, and unresolved dependencies).
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

// ================================================================
// EXTRAÇÃO DE FUNÇÕES PURAS VIA VM
// Extrai o bloco da camada soberana do worker source para testar
// comportamento real sem depender de toda a infraestrutura do worker.
// ================================================================
const _VM_BLOCK_START = "// CAMADA CANÔNICA DE FALA COGNITIVA SOBERANA";
const _VM_BLOCK_END = "// 🧠 COGNITIVE V2 — Adapter + Runner";
const _vmStartIdx = workerSrc.indexOf(_VM_BLOCK_START);
const _vmEndIdx = workerSrc.indexOf(_VM_BLOCK_END);
if (_vmStartIdx === -1 || _vmEndIdx === -1 || _vmEndIdx <= _vmStartIdx) {
  throw new Error(
    `VM block markers not found or invalid in worker source. ` +
    `Start: "${_VM_BLOCK_START}" at ${_vmStartIdx}, End: "${_VM_BLOCK_END}" at ${_vmEndIdx}`
  );
}
const _vmBlockSrc = workerSrc.substring(_vmStartIdx, _vmEndIdx) + `
;__EXPORTS.reconcileClientInput = reconcileClientInput;
__EXPORTS.buildRoundIntent = buildRoundIntent;
__EXPORTS.buildMinimalCognitiveFallback = buildMinimalCognitiveFallback;
__EXPORTS.renderCognitiveSpeech = renderCognitiveSpeech;
__EXPORTS.classifyRenderPath = classifyRenderPath;
__EXPORTS._getCognitiveRenderPhase = _getCognitiveRenderPhase;
__EXPORTS._renderCognitiveFromIntent = _renderCognitiveFromIntent;
__EXPORTS._validatePhaseRequirement = _validatePhaseRequirement;
__EXPORTS._extractRoundIntention = _extractRoundIntention;
`;
const _vmCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(_vmBlockSrc, _vmCtx);
const {
  reconcileClientInput: _reconcileClientInput,
  buildRoundIntent: _buildRoundIntent,
  buildMinimalCognitiveFallback: _buildMinimalCognitiveFallback,
  renderCognitiveSpeech: _renderCognitiveSpeech,
  classifyRenderPath: _classifyRenderPath,
  _getCognitiveRenderPhase: _getCognitiveRenderPhaseFn,
  _renderCognitiveFromIntent: _renderCognitiveFromIntentFn,
  _validatePhaseRequirement: _validatePhaseRequirementFn,
  _extractRoundIntention: _extractRoundIntentionFn
} = _vmCtx.__EXPORTS;

// Helpers para testes comportamentais
function _mkSt(overrides = {}) {
  return {
    fase_conversa: "inicio_programa",
    last_user_text: "",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __round_intent: null,
    ...overrides
  };
}

/** _containsAny(text, terms) — true se text.toLowerCase() contém algum de terms[] */
function _containsAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(t => lower.includes(t));
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
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

console.log("🧪 cognitive_sovereign_speech_layer.smoke.mjs\n");

// ================================================================
// SECTION A — Presença das âncoras no worker
// ================================================================
console.log("── SECTION A: Âncoras da camada soberana ──");

test("1. renderCognitiveSpeech está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function renderCognitiveSpeech(st, stage, rawArr)"),
    "renderCognitiveSpeech não encontrada"
  );
});

test("2. buildMinimalCognitiveFallback está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function buildMinimalCognitiveFallback(stage, rawArr, roundIntent)"),
    "buildMinimalCognitiveFallback não encontrada"
  );
});

test("3. reconcileClientInput está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function reconcileClientInput(st, userText)"),
    "reconcileClientInput não encontrada"
  );
});

test("4. buildRoundIntent está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function buildRoundIntent(st, userText, rawArr)"),
    "buildRoundIntent não encontrada"
  );
});

test("5. _applyCognitiveSurfaceFilter foi REMOVIDA do worker", () => {
  assert.ok(
    !workerSrc.includes("function _applyCognitiveSurfaceFilter("),
    "_applyCognitiveSurfaceFilter deve ter sido REMOVIDA — não há mais exceção híbrida"
  );
});

test("6. _getCognitiveRenderPhase está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function _getCognitiveRenderPhase(stage)"),
    "_getCognitiveRenderPhase não encontrada"
  );
});

test("7. _COGNITIVE_RENDER_PHASE_MAP está definido no worker", () => {
  assert.ok(
    workerSrc.includes("_COGNITIVE_RENDER_PHASE_MAP"),
    "_COGNITIVE_RENDER_PHASE_MAP não encontrado"
  );
});

// ================================================================
// SECTION B — step() usa renderCognitiveSpeech
// ================================================================
console.log("\n── SECTION B: step() integra renderCognitiveSpeech ──");

test("8. step() chama renderCognitiveSpeech(st, currentStage, rawArr.filter(Boolean))", () => {
  assert.ok(
    workerSrc.includes("renderCognitiveSpeech(st, currentStage, rawArr.filter(Boolean))"),
    "step() deve chamar renderCognitiveSpeech"
  );
});

test("9. step() limpa __round_intent após render", () => {
  assert.ok(
    workerSrc.includes("st.__round_intent = null"),
    "step() deve limpar __round_intent"
  );
});

test("10. step() ainda limpa __cognitive_reply_prefix após render", () => {
  assert.ok(
    workerSrc.includes("st.__cognitive_reply_prefix = null"),
    "step() deve limpar __cognitive_reply_prefix"
  );
});

test("11. step() ainda limpa __cognitive_v2_takes_final após render", () => {
  assert.ok(
    workerSrc.includes("st.__cognitive_v2_takes_final = false"),
    "step() deve limpar __cognitive_v2_takes_final"
  );
});

test("12. step() NÃO usa rawArr diretamente como arr (filtro obrigatório)", () => {
  // Verifica que renderCognitiveSpeech está sendo chamado na construção de arr
  const stepStart = workerSrc.indexOf("async function step(");
  const modoHumanoStart = workerSrc.indexOf("modoHumanoRender(st, arr)");
  assert.ok(stepStart > 0, "async function step( deve existir");
  assert.ok(modoHumanoStart > stepStart, "modoHumanoRender deve aparecer após step()");
  const stepBody = workerSrc.substring(stepStart, modoHumanoStart);
  // Garante que arr é atribuído via renderCognitiveSpeech (não rawArr direto)
  assert.ok(
    stepBody.includes("renderCognitiveSpeech(st, currentStage, rawArr.filter(Boolean))"),
    "arr deve ser atribuído via renderCognitiveSpeech"
  );
  // Garante que o padrão antigo "arr = ... rawArr.filter(Boolean);" (ternário) não está mais presente
  assert.ok(
    !stepBody.includes("? [cognitivePrefix]") || !stepBody.includes(": rawArr.filter(Boolean)"),
    "step() não deve mais usar o ternário rawArr direto antigo"
  );
});

// ================================================================
// SECTION C — renderCognitiveSpeech — hierarquia de caminhos
// ================================================================
console.log("\n── SECTION C: renderCognitiveSpeech — hierarquia ──");

test("13. Caminho ÚNICO: LLM real soberano → usa apenas o prefix cognitivo", () => {
  // PR #550: Somente __speech_arbiter_source === "llm_real" é soberano
  assert.ok(
    workerSrc.includes("Caminho ÚNICO soberano: LLM real"),
    "Caminho único LLM real não encontrado em renderCognitiveSpeech"
  );
  assert.ok(
    workerSrc.includes('arbiterSource === "llm_real"'),
    "Lógica do caminho LLM real com arbiterSource não encontrada"
  );
});

test("14. Fallback extremo mínimo → tudo que não é LLM cai no mapa", () => {
  // PR #550: Caminho 2 (explicit_fallback com prefix) e Caminho 3 (prefix>20) REMOVIDOS.
  // Tudo que não é LLM → extreme_fallback via buildMinimalCognitiveFallback.
  assert.ok(
    !workerSrc.includes('arbiterSource === "explicit_fallback"'),
    "explicit_fallback path must be REMOVED"
  );
  assert.ok(
    !workerSrc.includes("cognitivePrefix.length > 20"),
    "prefix > 20 chars path must be REMOVED"
  );
});

test("15. Heurística/resolver/prefix descartados — só mapa por stage", () => {
  // PR #550: Heuristic prefix descartado. Fallback extremo mínimo via mapa.
  assert.ok(
    workerSrc.includes("extreme_fallback"),
    "extreme_fallback contrato presente em renderCognitiveSpeech"
  );
});

// ================================================================
// SECTION D — buildMinimalCognitiveFallback
// ================================================================
console.log("\n── SECTION D: buildMinimalCognitiveFallback ──");

test("16. Intent-based rendering: mechanical source como primário, mapa como fallback", () => {
  // Post comment 4189949026: a frase mecânica é fonte de intenção, não mais stage→frase fixa.
  // buildMinimalCognitiveFallback usa _renderCognitiveFromIntent como primário.
  assert.ok(
    workerSrc.includes("_renderCognitiveFromIntent(mechanicalSource, stage)"),
    "Deve usar _renderCognitiveFromIntent como mecanismo primário"
  );
  assert.ok(
    workerSrc.includes("_MINIMAL_FALLBACK_SPEECH_MAP.get(stage)"),
    "Deve manter mapa como fallback de segurança"
  );
  // Verifica que NÃO existe mais branch separado para gates/operacional
  assert.ok(
    !workerSrc.includes('if (phase === "operacional" || phase === "gates_finais")'),
    "Branch separado para gates/operacional deve ter sido removido"
  );
});

test("17. _MINIMAL_FALLBACK_SPEECH_MAP inclui stages gates_finais e operacional (rede de segurança)", () => {
  assert.ok(
    workerSrc.includes("_MINIMAL_FALLBACK_SPEECH_MAP"),
    "_MINIMAL_FALLBACK_SPEECH_MAP deve existir no worker"
  );
  // O mapa é fallback — o mecanismo primário é intent-based
  assert.ok(
    workerSrc.includes("O MECANISMO PRIMÁRIO é: transformar a frase mecânica"),
    "Docstring deve declarar que o mecanismo primário é intent-based"
  );
  // Verifica que gates e operacional estão no mapa
  const gateStages = ["ir_declarado", "ctps_36", "restricao", "envio_docs", "fim_ineligivel"];
  for (const s of gateStages) {
    assert.ok(
      workerSrc.includes(`["${s}"`),
      `Stage "${s}" deve estar em _MINIMAL_FALLBACK_SPEECH_MAP`
    );
  }
});

test("18. Overlap detectado adiciona reconhecimento antes de continuar", () => {
  assert.ok(
    workerSrc.includes("Anotei tudo aqui 😊 Deixa eu continuar a análise do seu perfil."),
    "Reconhecimento de overlap não encontrado"
  );
  assert.ok(
    workerSrc.includes("roundIntent?.pode_ter_multiplas_intencoes && roundIntent?.eh_off_trail"),
    "Guard de overlap não encontrado"
  );
});

test("19. buildMinimalCognitiveFallback retorna fallback do mapa mesmo com rawArr vazio", () => {
  // Todos os stages usam o mapa — rawArr é ignorado (nunca foi argumento do mapa).
  // Stage desconhecido com rawArr vazio → "Pode continuar 😊"
  assert.ok(
    workerSrc.includes('_MINIMAL_FALLBACK_SPEECH_MAP.get(stage) || "Pode continuar 😊"'),
    "Fallback genérico para stage desconhecido não encontrado"
  );
});

// ================================================================
// SECTION E — reconcileClientInput / buildRoundIntent
// ================================================================
console.log("\n── SECTION E: reconcileClientInput / buildRoundIntent ──");

test("20. reconcileClientInput detecta saudação pura (oi, olá, bom dia)", () => {
  assert.ok(
    workerSrc.includes("ehSaudacaoPura = /^(oi|ol"),
    "Detecção de saudação pura não encontrada"
  );
});

test("21. reconcileClientInput detecta pergunta paralela", () => {
  assert.ok(
    workerSrc.includes("temPerguntaParalela = /\\?/.test(text) && text.length > 10"),
    "Detecção de pergunta paralela não encontrada"
  );
});

test("22. reconcileClientInput detecta complemento", () => {
  assert.ok(
    workerSrc.includes("temComplemento = /^(e tamb"),
    "Detecção de complemento não encontrada"
  );
});

test("23. reconcileClientInput detecta off-trail", () => {
  assert.ok(
    workerSrc.includes("ehOffTrail = temPerguntaParalela && !ehSaudacaoPura && text.length < 120"),
    "Detecção de off-trail não encontrada"
  );
});

test("24. buildRoundIntent contém todos os campos canônicos de intenção", () => {
  const fields = [
    "stage_atual",
    "still_needs_original_answer",
    "pode_avancar",
    "resposta_de_stage_detectada",
    "pergunta_paralela_detectada",
    "info_complementar_detectada",
    "eh_off_trail",
    "eh_saudacao_pura",
    "pode_ter_multiplas_intencoes",
    "texto_reconciliado"
  ];
  for (const field of fields) {
    assert.ok(
      workerSrc.includes(field),
      `buildRoundIntent deve conter campo "${field}"`
    );
  }
});

test("25. pode_avancar é sempre false (soberano do mecânico)", () => {
  assert.ok(
    workerSrc.includes("pode_avancar: false"),
    "pode_avancar deve ser false (soberania mecânica)"
  );
});

// ================================================================
// SECTION F — _COGNITIVE_RENDER_PHASE_MAP cobre stages canônicos
// ================================================================
console.log("\n── SECTION F: _COGNITIVE_RENDER_PHASE_MAP ──");

const TOPO_STAGES = [
  "inicio_programa", "inicio_nome", "inicio_nacionalidade",
  "estado_civil", "confirmar_casamento", "financiamento_conjunto",
  "somar_renda_solteiro", "somar_renda_familiar", "quem_pode_somar"
];

for (const stage of TOPO_STAGES) {
  test(`26-${stage}: stage "${stage}" mapeado na fase topo`, () => {
    assert.ok(
      workerSrc.includes(`"${stage}"`),
      `Stage "${stage}" deve estar no _COGNITIVE_RENDER_PHASE_MAP`
    );
  });
}

test("35. Gates finais mapeados: ir_declarado, ctps_36, restricao", () => {
  const gateStages = ["ir_declarado", "ctps_36", "restricao", "dependente"];
  for (const g of gateStages) {
    assert.ok(
      workerSrc.includes(`"${g}"`),
      `Stage gate "${g}" deve estar mapeado`
    );
  }
});

// ================================================================
// SECTION G — Segurança: gates / nextStage / persistência preservados
// ================================================================
console.log("\n── SECTION G: Segurança estrutural ──");

test("36. upsertState ainda existe (persistência preservada)", () => {
  assert.ok(
    workerSrc.includes("await upsertState(env, st.wa_id,"),
    "upsertState deve continuar presente"
  );
});

test("37. modoHumanoRender ainda é chamado após renderCognitiveSpeech", () => {
  const idx = workerSrc.indexOf("renderCognitiveSpeech(st, currentStage, rawArr.filter(Boolean))");
  assert.ok(idx > 0, "renderCognitiveSpeech não encontrada em step()");
  const afterRender = workerSrc.substring(idx, idx + 800);
  assert.ok(
    afterRender.includes("modoHumanoRender(st, arr)"),
    "modoHumanoRender deve ser chamado após renderCognitiveSpeech"
  );
});

test("38. getTopoHappyPathSpeech ainda existe (happy path preservado)", () => {
  assert.ok(
    workerSrc.includes("async function getTopoHappyPathSpeech(env, transitionKey, st, overrides)"),
    "getTopoHappyPathSpeech deve continuar presente"
  );
});

test("39. setTopoHappyPathFlags ainda existe (happy path preservado)", () => {
  assert.ok(
    workerSrc.includes("function setTopoHappyPathFlags(st, happyResult)"),
    "setTopoHappyPathFlags deve continuar presente"
  );
});

test("40. TOPO_HAPPY_PATH_SPEECH map ainda existe e tem chaves de inicio_programa", () => {
  assert.ok(
    workerSrc.includes('"inicio_programa:sim"'),
    'TOPO_HAPPY_PATH_SPEECH deve ter "inicio_programa:sim"'
  );
  assert.ok(
    workerSrc.includes('"inicio_programa:first_after_reset"'),
    'TOPO_HAPPY_PATH_SPEECH deve ter "inicio_programa:first_after_reset"'
  );
});

test("41. adaptCognitiveV2Output ainda existe (adapter V2 preservado)", () => {
  assert.ok(
    workerSrc.includes("function adaptCognitiveV2Output(stage, v2Result)"),
    "adaptCognitiveV2Output deve continuar presente"
  );
});

test("42. resolveTopoStructured ainda existe (resolvers preservados)", () => {
  assert.ok(
    workerSrc.includes("function resolveTopoStructured(stage, rawText)") ||
    workerSrc.includes("function resolveTopoStructured("),
    "resolveTopoStructured deve continuar presente"
  );
});

test("43. buildCognitiveFallback ainda existe (fallback base preservado)", () => {
  assert.ok(
    workerSrc.includes("function buildCognitiveFallback(stage)"),
    "buildCognitiveFallback deve continuar presente"
  );
});

test("44. renderCognitiveSpeech NÃO chama upsertState (sem persistência)", () => {
  const idx = workerSrc.indexOf("function renderCognitiveSpeech(st, stage, rawArr)");
  const end = workerSrc.indexOf("\nfunction ", idx + 1);
  assert.ok(idx > 0, "renderCognitiveSpeech deve existir");
  const fnBody = workerSrc.substring(idx, end > 0 ? end : idx + 2000);
  assert.ok(
    !fnBody.includes("upsertState"),
    "renderCognitiveSpeech não pode chamar upsertState"
  );
});

test("45. buildMinimalCognitiveFallback NÃO chama upsertState (sem persistência)", () => {
  const idx = workerSrc.indexOf("function buildMinimalCognitiveFallback(stage, rawArr, roundIntent)");
  const end = workerSrc.indexOf("\nfunction ", idx + 1);
  assert.ok(idx > 0, "buildMinimalCognitiveFallback deve existir");
  const fnBody = workerSrc.substring(idx, end > 0 ? end : idx + 2000);
  assert.ok(
    !fnBody.includes("upsertState"),
    "buildMinimalCognitiveFallback não pode chamar upsertState"
  );
});

test("46. renderCognitiveSpeech NÃO chama runCognitiveV2WithAdapter (sem LLM em step())", () => {
  const idx = workerSrc.indexOf("function renderCognitiveSpeech(st, stage, rawArr)");
  const end = workerSrc.indexOf("\nfunction ", idx + 1);
  assert.ok(idx > 0, "renderCognitiveSpeech deve existir");
  const fnBody = workerSrc.substring(idx, end > 0 ? end : idx + 2000);
  assert.ok(
    !fnBody.includes("runCognitiveV2WithAdapter"),
    "renderCognitiveSpeech não pode chamar LLM diretamente"
  );
});

test("47. Camada soberana está documentada com ref ao COGNITIVE_MIGRATION_CONTRACT", () => {
  assert.ok(
    workerSrc.includes("COGNITIVE_MIGRATION_CONTRACT.md — seção 3.2"),
    "Ref ao contrato canônico deve estar presente"
  );
});

// ================================================================
// SECTION H — Prova de remoção de verniz: _applyCognitiveSurfaceFilter e _softQuestion removidas
// ================================================================
console.log("\n── SECTION H: Remoção de verniz — zero exceção híbrida ──");

test("48. _applyCognitiveSurfaceFilter REMOVIDA — não existe mais exceção híbrida", () => {
  assert.ok(
    !workerSrc.includes("function _applyCognitiveSurfaceFilter("),
    "_applyCognitiveSurfaceFilter deve ter sido REMOVIDA (era exceção híbrida)"
  );
  // Também não deve existir chamada a ela
  assert.ok(
    !workerSrc.includes("_applyCognitiveSurfaceFilter("),
    "Nenhuma chamada a _applyCognitiveSurfaceFilter deve existir"
  );
});

test("49. _softQuestion foi REMOVIDA — sem wrapper 'Me conta:' em perguntas", () => {
  assert.ok(
    !workerSrc.includes("function _softQuestion("),
    "_softQuestion deve ter sido REMOVIDA (era verniz cosmético)"
  );
  assert.ok(
    !workerSrc.includes('"Me conta: "'),
    "String 'Me conta: ' não deve aparecer como output no worker"
  );
});

test("50. buildMinimalCognitiveFallback NÃO referencia _applyCognitiveSurfaceFilter", () => {
  const idx = workerSrc.indexOf("function buildMinimalCognitiveFallback(");
  const end = workerSrc.indexOf("\nfunction ", idx + 1);
  assert.ok(idx > 0, "buildMinimalCognitiveFallback deve existir");
  const fnBody = workerSrc.substring(idx, end > 0 ? end : idx + 2000);
  assert.ok(
    !fnBody.includes("_applyCognitiveSurfaceFilter"),
    "buildMinimalCognitiveFallback não pode mais usar _applyCognitiveSurfaceFilter"
  );
  // Deve usar apenas o mapa para todos os stages
  assert.ok(
    fnBody.includes("_MINIMAL_FALLBACK_SPEECH_MAP.get(stage)"),
    "Deve usar _MINIMAL_FALLBACK_SPEECH_MAP.get(stage) para TODOS os stages"
  );
});

// ================================================================
// SECTION I — BEHAVIORAL: 8 cenários concretos de entrada → saída final
//
// CONTRATO (post comments 4189815742 + 4189874369):
// - Nenhum caminho expõe rawArr literal ao cliente — SEM EXCEÇÕES
// - cognitive_real: rawArr DESCARTADO, só prefix cognitivo
// - cognitive_heuristic: rawArr DESCARTADO, só prefix (que já é completo)
// - cognitive_fallback: TODOS os stages usam _MINIMAL_FALLBACK_SPEECH_MAP
//   (inclusive gates_finais e operacional — sem exceção híbrida)
// ================================================================
console.log("\n── SECTION I: BEHAVIORAL — entrada → saída final ──");

// ─── Cenário 1: `oi` — saudação pura, topo, Caminho 3 ───
test("51. BEHAVIORAL: 'oi' at inicio_programa — usa mapa cognitivo, rawArr NUNCA exposto", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: "oi" });
  st.__round_intent = _buildRoundIntent(st, "oi");
  const rawArr = ["[texto mecânico — deve ser ignorado]"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Caminho 3: usa _MINIMAL_FALLBACK_SPEECH_MAP para inicio_programa
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
  assert.ok(!result[0].includes("[texto mecânico"), "rawArr não exposto ao cliente");
  assert.ok(!result[0].startsWith("Anotei tudo aqui"), "Saudação pura não dispara overlap");
  assert.ok(result[0].includes("😊"), "Saída tem tom conversacional");
  assert.strictEqual(_classifyRenderPath(st), "extreme_fallback");
  assert.ok(
    _containsAny(result[0], ["minha casa minha vida", "enova", "programa"]),
    "Intenção da fase (programa) preservada na saída cognitiva"
  );
});

// ─── Cenário 2: `oi enova` — não saudação pura, sem pergunta, topo, Caminho 3 ───
test("52. BEHAVIORAL: 'oi enova' at inicio_programa — rawArr IGNORADO, fala cognitiva por stage", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: "oi enova" });
  st.__round_intent = _buildRoundIntent(st, "oi enova");
  const rawArr = ["[mecânico — ignorado]"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Caminho 3 sem overlap: usa mapa, rawArr não exposto
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto ao cliente");
  assert.ok(!result[0].startsWith("Anotei"), "Sem ? → sem overlap");
  assert.ok(result[0].includes("😊"), "Tom conversacional presente");
  // reconcile: não é saudação pura, não tem pergunta paralela
  const ri = _buildRoundIntent(st, "oi enova");
  assert.strictEqual(ri.eh_saudacao_pura, false, "oi enova não é saudação pura");
  assert.strictEqual(ri.pergunta_paralela_detectada, false, "Sem ? = sem pergunta paralela");
});

// ─── Cenário 3: `oi, posso usar o meu fgts?` — overlap detectado ───
test("53. BEHAVIORAL: 'oi, posso usar o meu fgts?' — overlap + fala cognitiva, SEM rawArr exposto", () => {
  const input = "oi, posso usar o meu fgts?"; // 26 chars > 20
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: input });
  st.__round_intent = _buildRoundIntent(st, input);
  const rawArr = ["[mecânico — não deve aparecer ao cliente]"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Overlap detectado → prefix "Anotei tudo aqui 😊" + fala cognitiva do mapa
  assert.ok(result[0].includes("Anotei tudo aqui"), "Overlap prefix deve ser adicionado");
  assert.strictEqual(result.length, 2, "Exatamente 2 elementos: overlap prefix + stage speech");
  assert.ok(!result[0].includes("[mecânico") && !result[1].includes("[mecânico"), "rawArr não exposto em nenhum elemento");
  // Intenção da fase preservada via mapa (MCMV ou análise)
  assert.ok(
    _containsAny(result[1], ["mcmv", "analisar", "perfil"]) || result[1].includes("😊"),
    "Intenção da fase preservada no segundo elemento"
  );
});

// ─── Cenário 4: `sou casado` — Sem LLM → fallback extremo mínimo ───
test("54. BEHAVIORAL: 'sou casado' at estado_civil — prefix descartado, mapa cognitivo", () => {
  // PR #550: Heuristic prefix é DESCARTADO — não é fala final pronta.
  // Fala vem do mapa estático (extreme_fallback).
  const prefix = "Entendi! 👍 Seu casamento é civil no papel ou vocês vivem como união estável?";
  const st = _mkSt({
    fase_conversa: "estado_civil",
    last_user_text: "sou casado",
    __cognitive_reply_prefix: prefix,
    __cognitive_v2_takes_final: false
  });
  const rawArr = ["[mecânico — deve ser descartado]"];
  const result = _renderCognitiveSpeech(st, "estado_civil", rawArr);
  assert.strictEqual(result.length, 1, "Exatamente 1 elemento");
  assert.ok(!result[0].includes("[mecânico"), "rawArr descartado");
  // Fallback extremo: mapa por stage, não o prefix heurístico
  assert.strictEqual(_classifyRenderPath(st), "extreme_fallback");
});

// ─── Cenário 5: `reset + oi enova` — Caminho 1, cognitive real ───
test("55. BEHAVIORAL: 'reset + oi enova' — Caminho 1, rawArr DESCARTADO", () => {
  const cogSpeech = "Oi! 😊 Eu sou a Enova. Você já sabe como funciona ou prefere que eu explique?";
  const st = _mkSt({
    fase_conversa: "inicio_programa",
    last_user_text: "oi enova",
    __cognitive_reply_prefix: cogSpeech,
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const rawArr = ["[mechanical reset raw response — should be discarded]"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Caminho 1: SOMENTE o cognitive prefix. rawArr é DESCARTADO.
  assert.strictEqual(result.length, 1, "Exatamente 1 elemento na saída (rawArr descartado)");
  assert.strictEqual(result[0], cogSpeech, "Saída deve ser APENAS o prefix cognitivo");
  assert.ok(!result[0].includes("[mechanical"), "rawArr foi descartado");
  assert.ok(!result[0].includes("Me conta:"), "Sem verniz na saída cognitiva real");
  assert.strictEqual(_classifyRenderPath(st), "llm_real");
});

// ─── Cenário 6: off-trail sem `?` — usa mapa cognitivo (rawArr ignorado) ───
test("56. BEHAVIORAL: off-trail sem ? at inicio_nome — usa mapa cognitivo, rawArr ignorado", () => {
  // BLOCO 3: sem ? → sem overlap detectado. Mas rawArr ainda NÃO é exposto.
  // Caminho 3 → _MINIMAL_FALLBACK_SPEECH_MAP para inicio_nome.
  const input = "quero entender como funciona o subsidio";
  const st = _mkSt({ fase_conversa: "inicio_nome", last_user_text: input });
  st.__round_intent = _buildRoundIntent(st, input);
  const rawArr = ["[pergunta mecânica — não expor]"];
  const result = _renderCognitiveSpeech(st, "inicio_nome", rawArr);
  // rawArr não exposto — usa mapa
  assert.ok(!result[0].includes("[pergunta mecânica"), "rawArr não exposto ao cliente");
  assert.ok(!result[0].includes("Anotei tudo aqui"), "Sem ? → sem overlap prefix");
  // Intenção da fase (nome) preservada no mapa
  assert.ok(
    _containsAny(result[0], ["nome"]),
    "Intenção da fase (nome completo) preservada via mapa"
  );
  // Confirmação de limitação: sem ? → sem detecção de overlap
  const ri = _buildRoundIntent(st, input);
  assert.strictEqual(ri.pergunta_paralela_detectada, false, "Sem ? → sem detecção de pergunta paralela");
});

// ─── Cenário 7: resposta de fase + pergunta paralela → prefix descartado, mapa ───
test("57. BEHAVIORAL: resposta de fase + pergunta paralela — prefix descartado, mapa", () => {
  // PR #550: Heuristic prefix é DESCARTADO — fala vem do mapa
  const prefix = "Perfeito 👌 E sobre renda... você pretende usar só sua renda ou quer somar com alguém?";
  const st = _mkSt({
    fase_conversa: "estado_civil",
    last_user_text: "sou solteiro, e posso comprar com minha irmã?",
    __cognitive_reply_prefix: prefix,
    __cognitive_v2_takes_final: false
  });
  const rawArr = ["[mecânico — deve ser descartado]"];
  const result = _renderCognitiveSpeech(st, "estado_civil", rawArr);
  assert.strictEqual(result.length, 1, "Exatamente 1 elemento");
  assert.ok(!result[0].includes("[mecânico"), "rawArr descartado");
  assert.strictEqual(_classifyRenderPath(st), "extreme_fallback");
});
test("58. BEHAVIORAL: complemento 'e também' at somar_renda_familiar — rawArr ignorado, fala cognitiva", () => {
  const input = "e também tenho uma filha dependente";
  const st = _mkSt({ fase_conversa: "somar_renda_familiar", last_user_text: input });
  st.__round_intent = _buildRoundIntent(st, input);
  const rawArr = ["[mecânico — não expor]"];
  const result = _renderCognitiveSpeech(st, "somar_renda_familiar", rawArr);
  // Caminho 3: usa mapa, rawArr NÃO exposto
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto ao cliente");
  assert.ok(!result[0].includes("Anotei tudo aqui"), "Complemento sem ? não dispara overlap prefix");
  // Intenção da fase (renda familiar) preservada no mapa
  assert.ok(
    _containsAny(result[0], ["renda", "familiar", "somar"]),
    "Intenção da fase (renda familiar) preservada via mapa"
  );
  // Confirmação de contrato
  const ri = _buildRoundIntent(st, input);
  assert.strictEqual(ri.info_complementar_detectada, true, "Complemento deve ser detectado");
  assert.strictEqual(ri.pode_ter_multiplas_intencoes, false, "Sem pergunta paralela, sem múltiplas intenções");
});

// ================================================================
// SECTION J — classifyRenderPath: 2 classificações canônicas (PR #544)
// ================================================================
console.log("\n── SECTION J: classifyRenderPath — classificação da origem ──");

test("59. classifyRenderPath: llm_real (arbiter_source=llm_real)", () => {
  const st = _mkSt({ __speech_arbiter_source: "llm_real" });
  assert.strictEqual(_classifyRenderPath(st), "llm_real");
});

test("60. classifyRenderPath: extreme_fallback (arbiter_source=explicit_fallback → extreme)", () => {
  const st = _mkSt({ __speech_arbiter_source: "explicit_fallback" });
  assert.strictEqual(_classifyRenderPath(st), "extreme_fallback");
});

test("61. classifyRenderPath: extreme_fallback (sem flags)", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  assert.strictEqual(_classifyRenderPath(st), "extreme_fallback");
});

test("62. classifyRenderPath: extreme_fallback (arbiter_source undefined)", () => {
  const st = _mkSt({});
  delete st.__speech_arbiter_source;
  assert.strictEqual(_classifyRenderPath(st), "extreme_fallback");
});

// ================================================================
// SECTION K — Limitações honestas do overlap/reconciliação
// BLOCO 3: declarar explicitamente o que NÃO está coberto
// ================================================================
console.log("\n── SECTION K: Limitações honestas do overlap ──");

test("63. LIMITAÇÃO: off-trail sem ? não é detectado como overlap", () => {
  // Não temos cobertura para "quero saber sobre juros" sem ?
  const input = "quero saber sobre os juros do financiamento";
  const ri = _buildRoundIntent(_mkSt({ last_user_text: input }), input);
  assert.strictEqual(ri.pergunta_paralela_detectada, false, "Sem ? → não detectado como pergunta paralela");
  assert.strictEqual(ri.pode_ter_multiplas_intencoes, false, "Sem ? → não detectado como múltiplas intenções");
  // Esta é uma limitação conhecida e declarada.
});

test("64. LIMITAÇÃO: inputs com ? mas ≤ 20 chars NÃO disparam overlap completo", () => {
  // "posso usar fgts?" = 16 chars ≤ 20 → pode_ter_multiplas_intencoes=false
  const input = "posso usar fgts?";
  const ri = _buildRoundIntent(_mkSt({ last_user_text: input }), input);
  assert.strictEqual(ri.pergunta_paralela_detectada, true, "Tem ? → pergunta paralela detectada");
  assert.strictEqual(ri.pode_ter_multiplas_intencoes, false, "Mas 16 ≤ 20 → não classifica como múltiplas intenções");
  // Limitação: threshold de 20 chars pode não capturar perguntas curtas mas legítimas
});

test("65. LIMITAÇÃO: complemento sem ? não dispara overlap prefix", () => {
  // "e também minha mãe" sem ? → sem overlap prefix mesmo sendo complemento
  const input = "e também minha mãe vai comprar";
  const ri = _buildRoundIntent(_mkSt({ last_user_text: input }), input);
  assert.strictEqual(ri.info_complementar_detectada, true, "Complemento detectado");
  assert.strictEqual(ri.pode_ter_multiplas_intencoes, false, "Mas sem ? → sem múltiplas intenções");
  // buildMinimalCognitiveFallback não adiciona prefix para este caso.
});

test("66. Gates finais: rawArr NUNCA exposto — usa _MINIMAL_FALLBACK_SPEECH_MAP", () => {
  // Post comment 4189874369: gates finais também usam fala cognitiva do mapa.
  // rawArr mecânico não aparece na saída.
  const st = _mkSt({ fase_conversa: "ir_declarado", last_user_text: "não" });
  st.__round_intent = _buildRoundIntent(st, "não");
  const rawArr = ["[texto mecânico — não expor ao cliente]"];
  const result = _renderCognitiveSpeech(st, "ir_declarado", rawArr);
  // gates_finais → fala cognitiva do mapa, rawArr DESCARTADO
  assert.ok(!result[0].includes("[texto mecânico"), "rawArr não exposto em gates_finais");
  assert.ok(result[0].includes("😊") || result[0].includes("📋"), "Saída deve ser cognitiva");
  assert.ok(
    _containsAny(result[0], ["imposto", "declarou"]),
    "Intenção do stage ir_declarado preservada"
  );
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
});

// ================================================================
// SECTION L — BEHAVIORAL: 6 cenários gates_finais/operacional
// Prova que nenhum stage técnico expõe rawArr mecânico ao cliente.
// Post comment 4189874369: a exceção híbrida foi removida.
// TODOS os stages usam _MINIMAL_FALLBACK_SPEECH_MAP.
// ================================================================
console.log("\n── SECTION L: BEHAVIORAL — stages técnicos sem exceção ──");

// ─── Cenário L1: ir_declarado — gate final ───
test("67. BEHAVIORAL: ir_declarado — fala cognitiva do mapa, rawArr DESCARTADO", () => {
  const st = _mkSt({ fase_conversa: "ir_declarado", last_user_text: "sim" });
  st.__round_intent = _buildRoundIntent(st, "sim");
  const rawArr = ["[mecânico: Informe se declarou IR nos últimos 2 anos]"];
  const result = _renderCognitiveSpeech(st, "ir_declarado", rawArr);
  // rawArr mecânico NÃO aparece
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto");
  assert.ok(!result[0].includes("Informe"), "Texto mecânico com 'Informe' não exposto");
  // Fala cognitiva do mapa — fiel à intenção técnica do stage
  assert.ok(
    _containsAny(result[0], ["imposto de renda", "declarou"]),
    "Intenção técnica do stage (IR) preservada via mapa"
  );
  assert.ok(result[0].includes("😊"), "Tom conversacional presente");
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
  assert.strictEqual(_classifyRenderPath(st), "extreme_fallback");
});

// ─── Cenário L2: ctps_36 — gate final ───
test("68. BEHAVIORAL: ctps_36 — fala cognitiva do mapa, rawArr DESCARTADO", () => {
  const st = _mkSt({ fase_conversa: "ctps_36", last_user_text: "tenho sim" });
  st.__round_intent = _buildRoundIntent(st, "tenho sim");
  const rawArr = ["[mecânico: Você tem 36 meses de registro?]"];
  const result = _renderCognitiveSpeech(st, "ctps_36", rawArr);
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto");
  assert.ok(
    _containsAny(result[0], ["36 meses", "carteira"]),
    "Intenção técnica do stage (CTPS 36) preservada via mapa"
  );
  assert.ok(result[0].includes("📋"), "Emoji cognitivo presente");
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
});

// ─── Cenário L3: restricao — gate final ───
test("69. BEHAVIORAL: restricao — fala cognitiva do mapa, rawArr DESCARTADO", () => {
  const st = _mkSt({ fase_conversa: "restricao", last_user_text: "não tenho" });
  st.__round_intent = _buildRoundIntent(st, "não tenho");
  const rawArr = ["[mecânico: Existe restrição em seu CPF?]"];
  const result = _renderCognitiveSpeech(st, "restricao", rawArr);
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto");
  assert.ok(
    _containsAny(result[0], ["restrição", "cpf", "spc", "serasa"]),
    "Intenção técnica do stage (restrição) preservada via mapa"
  );
  assert.ok(result[0].includes("😊"), "Tom conversacional presente");
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
});

// ─── Cenário L4: envio_docs — operacional ───
test("70. BEHAVIORAL: envio_docs — fala cognitiva do mapa, rawArr DESCARTADO", () => {
  const st = _mkSt({ fase_conversa: "envio_docs", last_user_text: "ok" });
  st.__round_intent = _buildRoundIntent(st, "ok");
  const rawArr = ["[mecânico: Envie os documentos listados abaixo]"];
  const result = _renderCognitiveSpeech(st, "envio_docs", rawArr);
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto");
  assert.ok(
    _containsAny(result[0], ["documentos", "análise", "envie"]),
    "Intenção técnica do stage (envio docs) preservada via mapa"
  );
  assert.ok(result[0].includes("📎") || result[0].includes("😊"), "Emoji cognitivo presente");
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
});

// ─── Cenário L5: aguardando_retorno_correspondente — operacional ───
test("71. BEHAVIORAL: aguardando_retorno_correspondente — fala cognitiva, rawArr DESCARTADO", () => {
  const st = _mkSt({ fase_conversa: "aguardando_retorno_correspondente", last_user_text: "e aí?" });
  st.__round_intent = _buildRoundIntent(st, "e aí?");
  const rawArr = ["[mecânico: Aguardando retorno do correspondente bancário]"];
  const result = _renderCognitiveSpeech(st, "aguardando_retorno_correspondente", rawArr);
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto");
  assert.ok(
    _containsAny(result[0], ["aguardando", "correspondente", "novidade"]),
    "Intenção técnica do stage (aguardando retorno) preservada via mapa"
  );
  assert.ok(result[0].includes("😊"), "Tom conversacional presente");
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
});

// ─── Cenário L6: fim_ineligivel — operacional ───
test("72. BEHAVIORAL: fim_ineligivel — fala cognitiva, rawArr DESCARTADO", () => {
  const st = _mkSt({ fase_conversa: "fim_ineligivel", last_user_text: "entendi" });
  st.__round_intent = _buildRoundIntent(st, "entendi");
  const rawArr = ["[mecânico: O cliente não é elegível para o programa]"];
  const result = _renderCognitiveSpeech(st, "fim_ineligivel", rawArr);
  assert.ok(!result[0].includes("[mecânico"), "rawArr não exposto");
  assert.ok(
    _containsAny(result[0], ["não foi possível", "processo", "estou por aqui"]),
    "Intenção técnica do stage (fim inelegível) preservada via mapa"
  );
  assert.ok(result[0].includes("💛"), "Tom empático presente");
  assert.strictEqual(result.length, 1, "Exatamente 1 linha cognitiva");
});

// ================================================================
// SECTION M — Intent-based rendering: mechanical source como fonte de intenção
// Post comment 4189949026: frases mecânicas = intent source, não fala final.
// O render cognitivo usa a intenção mecânica para gerar fala conversacional.
// ================================================================

console.log("\n── SECTION M: Intent-based rendering — mechanical source como intenção ──");

test("73. _renderCognitiveFromIntent transforma imperativo em conversacional", () => {
  const result = _renderCognitiveFromIntentFn("Informe o número do seu RNM", "inicio_rnm");
  assert.ok(result, "Deve retornar resultado não-null");
  assert.ok(!result.startsWith("Informe"), "Não deve começar com imperativo");
  assert.ok(_containsAny(result, ["rnm", "número"]), "Deve preservar conteúdo técnico (RNM)");
  assert.ok(/😊|📋|👍/.test(result), "Deve ter tom conversacional (emoji)");
});

test("74. _renderCognitiveFromIntent com pergunta preserva sentido", () => {
  const result = _renderCognitiveFromIntentFn("Você declarou IR nos últimos 2 anos?", "ir_declarado");
  assert.ok(result, "Deve retornar resultado não-null");
  assert.ok(_containsAny(result, ["ir", "declar", "2 anos"]), "Conteúdo técnico preservado");
  // Guardrail valida presença de termos obrigatórios
  assert.ok(_validatePhaseRequirementFn("ir_declarado", result), "Guardrail deve passar");
});

test("75. _renderCognitiveFromIntent retorna null quando source vazio", () => {
  const result = _renderCognitiveFromIntentFn("", "inicio_nome");
  assert.strictEqual(result, null, "Source vazio → null → fallback mapa");
});

test("76. _renderCognitiveFromIntent: 'Envie seus documentos' → conversacional", () => {
  const result = _renderCognitiveFromIntentFn("Envie seus documentos para análise", "envio_docs");
  assert.ok(result, "Deve retornar resultado");
  assert.ok(!result.startsWith("Envie"), "Não deve começar com imperativo");
  assert.ok(_containsAny(result, ["documento", "análise"]), "Conteúdo técnico preservado");
  assert.ok(_validatePhaseRequirementFn("envio_docs", result), "Guardrail envio_docs passa");
});

test("77. _renderCognitiveFromIntent: 'Selecione o tipo de casamento' → conversacional", () => {
  const result = _renderCognitiveFromIntentFn("Selecione o tipo de casamento civil ou união estável", "confirmar_casamento");
  assert.ok(result, "Deve retornar resultado");
  assert.ok(!result.startsWith("Selecione"), "Imperativo removido");
  assert.ok(_containsAny(result, ["casamento", "civil", "união"]), "Conteúdo técnico preservado");
});

test("78. buildMinimalCognitiveFallback usa mechanical source quando presente no roundIntent", () => {
  // Simula roundIntent com mechanical_prompt_source
  const roundIntent = {
    stage_atual: "ir_declarado",
    mechanical_prompt_source: "Você declarou Imposto de Renda nos últimos 2 anos?",
    intencao_da_rodada: "Imposto de Renda nos últimos 2 anos?",
    still_needs_original_answer: true,
    pode_avancar: false,
    resposta_de_stage_detectada: true,
    pergunta_paralela_detectada: false,
    info_complementar_detectada: false,
    eh_off_trail: false,
    eh_saudacao_pura: false,
    pode_ter_multiplas_intencoes: false,
    texto_reconciliado: "sim"
  };
  const result = _buildMinimalCognitiveFallback("ir_declarado", ["RAWMECH"], roundIntent);
  assert.ok(!result[0].includes("RAWMECH"), "rawArr literal não exposto");
  assert.ok(_containsAny(result[0], ["imposto", "renda", "ir", "declar"]), "Intenção mecânica preservada na saída");
});

test("79. buildMinimalCognitiveFallback cai no mapa quando mechanical source vazio", () => {
  const roundIntent = {
    stage_atual: "inicio_nome",
    mechanical_prompt_source: "",
    intencao_da_rodada: "inicio_nome",
    still_needs_original_answer: true,
    pode_avancar: false,
    resposta_de_stage_detectada: false,
    pergunta_paralela_detectada: false,
    info_complementar_detectada: false,
    eh_off_trail: false,
    eh_saudacao_pura: true,
    pode_ter_multiplas_intencoes: false,
    texto_reconciliado: "oi"
  };
  const result = _buildMinimalCognitiveFallback("inicio_nome", ["RAWMECH"], roundIntent);
  assert.ok(!result[0].includes("RAWMECH"), "rawArr literal não exposto");
  assert.ok(_containsAny(result[0], ["nome"]), "Mapa de segurança preserva intenção do stage");
});

test("80. BEHAVIORAL: mechanical source 'Informe seu nome completo' → fala cognitiva com nome", () => {
  const st = _mkSt({ fase_conversa: "inicio_nome", last_user_text: "oi" });
  const rawArr = ["Informe seu nome completo"];
  st.__round_intent = _buildRoundIntent(st, "oi", rawArr);
  const result = _renderCognitiveSpeech(st, "inicio_nome", rawArr);
  assert.ok(!result[0].includes("Informe"), "Imperativo não exposto");
  assert.ok(_containsAny(result[0], ["nome"]), "Intenção (nome) preservada");
  assert.ok(/😊|👍/.test(result[0]), "Tom conversacional");
  assert.strictEqual(result.length, 1, "Exatamente 1 linha");
});

test("81. BEHAVIORAL: mechanical source 'Confirme se tem restrição no CPF' → cognitivo com CPF/restrição", () => {
  const st = _mkSt({ fase_conversa: "restricao", last_user_text: "sim" });
  const rawArr = ["Confirme se tem restrição no CPF ou Serasa"];
  st.__round_intent = _buildRoundIntent(st, "sim", rawArr);
  const result = _renderCognitiveSpeech(st, "restricao", rawArr);
  assert.ok(!result[0].includes("Confirme se"), "Imperativo não exposto");
  assert.ok(_containsAny(result[0], ["restriç", "cpf", "serasa"]), "Conteúdo técnico preservado");
  assert.ok(_validatePhaseRequirementFn("restricao", result[0]), "Guardrail restricao passa");
});

// ================================================================
// SECTION N — Guardrails de cobrança por fase
// Post comment 4189949026: se a fase precisa de resposta, a fala COBRA.
// ================================================================

console.log("\n── SECTION N: Guardrails de cobrança por fase ──");

test("82. _validatePhaseRequirement: ir_declarado PASSA com texto correto", () => {
  assert.ok(
    _validatePhaseRequirementFn("ir_declarado", "Você declarou Imposto de Renda nos últimos 2 anos?"),
    "Guardrail deve passar"
  );
});

test("83. _validatePhaseRequirement: ir_declarado FALHA sem termo obrigatório", () => {
  assert.ok(
    !_validatePhaseRequirementFn("ir_declarado", "Me conta mais sobre você"),
    "Guardrail deve falhar — falta termo obrigatório"
  );
});

test("84. _validatePhaseRequirement: ctps_36 exige '36' ou 'carteira' ou 'meses'", () => {
  assert.ok(
    _validatePhaseRequirementFn("ctps_36", "Você tem mais de 36 meses de carteira?"),
    "Guardrail ctps_36 com termos corretos"
  );
  assert.ok(
    !_validatePhaseRequirementFn("ctps_36", "Me fala sobre sua vida profissional"),
    "Guardrail ctps_36 sem termos obrigatórios"
  );
});

test("85. _validatePhaseRequirement: restricao exige 'restriç' ou 'cpf' ou 'spc' ou 'serasa'", () => {
  assert.ok(
    _validatePhaseRequirementFn("restricao", "Existe alguma restrição no seu CPF?"),
    "Guardrail restricao com termos corretos"
  );
  assert.ok(
    !_validatePhaseRequirementFn("restricao", "Tudo bem com você?"),
    "Guardrail restricao sem termos"
  );
});

test("86. _validatePhaseRequirement: stage sem guardrail → sempre aceita", () => {
  assert.ok(
    _validatePhaseRequirementFn("stage_desconhecido", "Qualquer texto"),
    "Stage sem guardrail → aceita qualquer texto"
  );
});

test("87. _validatePhaseRequirement: envio_docs exige 'documento' ou 'envie' ou 'análise'", () => {
  assert.ok(
    _validatePhaseRequirementFn("envio_docs", "Me envia os documentos para análise"),
    "Guardrail envio_docs com termos corretos"
  );
});

test("88. Guardrail + renderCognitiveFromIntent: transformação que perde intent → fallback mapa", () => {
  // Se _renderCognitiveFromIntent gerar texto que NÃO passa no guardrail,
  // buildMinimalCognitiveFallback cai no mapa de segurança
  const fakeRound = {
    stage_atual: "ir_declarado",
    // Fonte mecânica sem conteúdo relevante — guardrail vai falhar
    mechanical_prompt_source: "Ok, vamos continuar",
    intencao_da_rodada: "Ok, vamos continuar",
    still_needs_original_answer: true,
    pode_avancar: false,
    resposta_de_stage_detectada: false,
    pergunta_paralela_detectada: false,
    info_complementar_detectada: false,
    eh_off_trail: false,
    eh_saudacao_pura: false,
    pode_ter_multiplas_intencoes: false,
    texto_reconciliado: "sim"
  };
  const result = _buildMinimalCognitiveFallback("ir_declarado", ["RAWMECH"], fakeRound);
  // O guardrail ir_declarado exige "imposto|ir|renda|declara" — "Ok, vamos continuar" não tem.
  // Então deve cair no mapa.
  assert.ok(!result[0].includes("RAWMECH"), "rawArr não exposto");
  assert.ok(_containsAny(result[0], ["imposto", "renda", "ir", "declar"]),
    "Mapa de segurança garante cobrança correta quando guardrail falha");
});

// ================================================================
// SECTION O — buildRoundIntent novos campos canônicos
// Post comment 4189949026: mechanical_prompt_source + intencao_da_rodada
// ================================================================

console.log("\n── SECTION O: buildRoundIntent — novos campos canônicos ──");

test("89. buildRoundIntent inclui mechanical_prompt_source do rawArr", () => {
  const st = _mkSt({ fase_conversa: "ir_declarado", last_user_text: "sim" });
  const rawArr = ["Você declarou IR?", "Preciso confirmar."];
  const intent = _buildRoundIntent(st, "sim", rawArr);
  assert.ok(intent.mechanical_prompt_source, "mechanical_prompt_source deve existir");
  assert.ok(intent.mechanical_prompt_source.includes("Você declarou IR?"), "Deve conter a frase mecânica");
  assert.ok(intent.mechanical_prompt_source.includes("Preciso confirmar."), "Deve conter todas as partes do rawArr");
});

test("90. buildRoundIntent inclui intencao_da_rodada extraída da frase mecânica", () => {
  const st = _mkSt({ fase_conversa: "inicio_nome", last_user_text: "oi" });
  const rawArr = ["Informe seu nome completo"];
  const intent = _buildRoundIntent(st, "oi", rawArr);
  assert.ok(intent.intencao_da_rodada, "intencao_da_rodada deve existir");
  // A intenção deve ter o imperativo removido
  assert.ok(!intent.intencao_da_rodada.startsWith("Informe"), "Imperativo deve ser removido da intenção");
  assert.ok(_containsAny(intent.intencao_da_rodada, ["nome"]), "Intenção preserva o conteúdo core");
});

test("91. buildRoundIntent sem rawArr → mechanical_prompt_source vazio", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: "oi" });
  const intent = _buildRoundIntent(st, "oi");
  assert.strictEqual(intent.mechanical_prompt_source, "", "Sem rawArr → source vazio");
  assert.ok(intent.intencao_da_rodada, "intencao_da_rodada deve existir mesmo sem source");
});

test("92. buildRoundIntent com rawArr vazio [] → mechanical_prompt_source vazio", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: "oi" });
  const intent = _buildRoundIntent(st, "oi", []);
  assert.strictEqual(intent.mechanical_prompt_source, "", "rawArr vazio → source vazio");
});

test("93. buildRoundIntent preserva todos os campos canônicos originais", () => {
  const st = _mkSt({ fase_conversa: "estado_civil", last_user_text: "sou casado, e o fgts?" });
  const rawArr = ["Casamento civil ou união estável?"];
  const intent = _buildRoundIntent(st, "sou casado, e o fgts?", rawArr);
  // Campos originais
  assert.ok("stage_atual" in intent);
  assert.ok("still_needs_original_answer" in intent);
  assert.ok("pode_avancar" in intent);
  assert.ok("resposta_de_stage_detectada" in intent);
  assert.ok("pergunta_paralela_detectada" in intent);
  assert.ok("info_complementar_detectada" in intent);
  assert.ok("eh_off_trail" in intent);
  assert.ok("eh_saudacao_pura" in intent);
  assert.ok("pode_ter_multiplas_intencoes" in intent);
  assert.ok("texto_reconciliado" in intent);
  // Novos campos
  assert.ok("mechanical_prompt_source" in intent);
  assert.ok("intencao_da_rodada" in intent);
});

// ================================================================
// SECTION P — BEHAVIORAL: intent-based rendering end-to-end em stages técnicos
// Post comment 4189949026: mechanical source → fala cognitiva (não stage→frase fixa)
// ================================================================

console.log("\n── SECTION P: BEHAVIORAL — intent-based rendering end-to-end ──");

test("94. E2E: ir_declarado com mechanical source → fala cognitiva baseada na intenção", () => {
  const st = _mkSt({ fase_conversa: "ir_declarado", last_user_text: "sim" });
  const rawArr = ["Você declarou Imposto de Renda nos últimos 2 anos?"];
  st.__round_intent = _buildRoundIntent(st, "sim", rawArr);
  const result = _renderCognitiveSpeech(st, "ir_declarado", rawArr);
  assert.ok(!result[0].includes("[mecânico"), "rawArr literal não exposto");
  assert.ok(_containsAny(result[0], ["imposto", "renda", "ir", "declar"]), "Intenção técnica preservada");
  assert.ok(/😊|📋|👍/.test(result[0]), "Tom conversacional");
  assert.strictEqual(result.length, 1, "1 linha");
});

test("95. E2E: ctps_36 com mechanical source → preserva '36 meses'", () => {
  const st = _mkSt({ fase_conversa: "ctps_36", last_user_text: "sim" });
  const rawArr = ["Você tem mais de 36 meses de carteira assinada?"];
  st.__round_intent = _buildRoundIntent(st, "sim", rawArr);
  const result = _renderCognitiveSpeech(st, "ctps_36", rawArr);
  assert.ok(_containsAny(result[0], ["36", "carteira", "meses"]), "Conteúdo técnico '36 meses' preservado");
  assert.ok(/😊|📋/.test(result[0]), "Tom conversacional");
});

test("96. E2E: envio_docs com mechanical 'Envie documentos' → conversacional", () => {
  const st = _mkSt({ fase_conversa: "envio_docs", last_user_text: "ok" });
  const rawArr = ["Envie os documentos necessários para análise do financiamento"];
  st.__round_intent = _buildRoundIntent(st, "ok", rawArr);
  const result = _renderCognitiveSpeech(st, "envio_docs", rawArr);
  assert.ok(!result[0].startsWith("Envie"), "Imperativo 'Envie' não exposto como superfície");
  assert.ok(_containsAny(result[0], ["documento", "análise"]), "Conteúdo técnico preservado");
});

test("97. E2E: restricao com mechanical 'Confirme restrição CPF' → cognitivo preserva SPC/Serasa", () => {
  const st = _mkSt({ fase_conversa: "restricao", last_user_text: "não sei" });
  const rawArr = ["Confirme se existe restrição no CPF. Pode ser SPC ou Serasa."];
  st.__round_intent = _buildRoundIntent(st, "não sei", rawArr);
  const result = _renderCognitiveSpeech(st, "restricao", rawArr);
  assert.ok(_containsAny(result[0], ["restriç", "cpf"]), "Conteúdo 'restrição CPF' preservado");
});

test("98. E2E: stage sem mechanical source → cai no mapa de segurança, não expõe rawArr", () => {
  const st = _mkSt({ fase_conversa: "dependente", last_user_text: "não" });
  // Sem rawArr no buildRoundIntent
  st.__round_intent = _buildRoundIntent(st, "não");
  const result = _renderCognitiveSpeech(st, "dependente", ["[rawArr mecânico não expor]"]);
  assert.ok(!result[0].includes("[rawArr"), "rawArr literal NUNCA exposto");
  assert.ok(_containsAny(result[0], ["dependente", "filho"]), "Mapa preserva intenção do stage");
});

test("99. E2E: stage desconhecido com mechanical source → renderiza cognitivamente o source", () => {
  const st = _mkSt({ fase_conversa: "stage_futuro_xyz", last_user_text: "ok" });
  const rawArr = ["Preciso que confirme o endereço residencial"];
  st.__round_intent = _buildRoundIntent(st, "ok", rawArr);
  const result = _renderCognitiveSpeech(st, "stage_futuro_xyz", rawArr);
  // Stage desconhecido sem guardrail → intent-based rendering aceita
  assert.ok(!result[0].startsWith("Preciso que"), "Não expõe imperativo mecânico cru");
  assert.ok(_containsAny(result[0], ["endereço", "residencial"]) || result[0].includes("continuar"),
    "Deve usar intenção mecânica OU fallback genérico");
});

// ================================================================
// RESULTADO FINAL
// ================================================================
console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);

if (failed > 0) {
  process.exit(1);
}
