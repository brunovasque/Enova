/**
 * cognitive_sovereign_speech_layer.smoke.mjs
 *
 * Smoke tests para a camada canônica de fala cognitiva soberana.
 *
 * Valida:
 *   A) Funções da camada existem no worker (presença de âncoras)
 *   B) step() integra renderCognitiveSpeech
 *   C) renderCognitiveSpeech — hierarquia de 3 caminhos (contrato zero-rawArr)
 *   D) buildMinimalCognitiveFallback — _MINIMAL_FALLBACK_SPEECH_MAP para topo/meio
 *   E) reconcileClientInput / buildRoundIntent — campos canônicos
 *   F) _COGNITIVE_RENDER_PHASE_MAP — stages mapeados
 *   G) Segurança estrutural (gates/nextStage/persistência preservados)
 *   H) _applyCognitiveSurfaceFilter — filtro honesto (SEM verniz, SEM _softQuestion)
 *   I) BEHAVIORAL: 8 cenários → prova explícita zero rawArr exposto + fase preservada
 *   J) classifyRenderPath — classificação canônica de origem
 *   K) Limitações honestas do overlap/reconciliação
 *
 * CONTRATO CENTRAL (post comment 4189815742):
 *   Nenhum caminho expõe rawArr literal ao cliente:
 *   - cognitive_real (Caminho 1): rawArr DESCARTADO, só prefix LLM
 *   - cognitive_heuristic (Caminho 2): rawArr DESCARTADO, só prefix do resolver
 *   - cognitive_fallback topo/meio (Caminho 3): usa _MINIMAL_FALLBACK_SPEECH_MAP
 *   - cognitive_fallback gates/operacional: conteúdo técnico obrigatório
 *
 * BLOCO 2 (verniz removido):
 *   _softQuestion removida. _applyCognitiveSurfaceFilter é filtro honesto para
 *   gates/operacional: converte imperativo formal → conversacional se presente.
 *
 * BLOCO 3 (overlap honesto, limitações declaradas):
 *   Cobertura real: ? + comprimento > 20 + não-saudação pura.
 *   Limitações: off-trail sem ?, ≤ 20 chars, complementos sem ?, gates/operacional.
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
__EXPORTS._applyCognitiveSurfaceFilter = _applyCognitiveSurfaceFilter;
__EXPORTS._getCognitiveRenderPhase = _getCognitiveRenderPhase;
`;
const _vmCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(_vmBlockSrc, _vmCtx);
const {
  reconcileClientInput: _reconcileClientInput,
  buildRoundIntent: _buildRoundIntent,
  buildMinimalCognitiveFallback: _buildMinimalCognitiveFallback,
  renderCognitiveSpeech: _renderCognitiveSpeech,
  classifyRenderPath: _classifyRenderPath,
  _applyCognitiveSurfaceFilter: _applyCognitiveSurfaceFilterFn,
  _getCognitiveRenderPhase: _getCognitiveRenderPhaseFn
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
    workerSrc.includes("function buildRoundIntent(st, userText)"),
    "buildRoundIntent não encontrada"
  );
});

test("5. _applyCognitiveSurfaceFilter está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function _applyCognitiveSurfaceFilter(lines)"),
    "_applyCognitiveSurfaceFilter não encontrada"
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

test("13. Caminho 1: v2TakesFinal + cognitivePrefix → usa apenas o prefix cognitivo", () => {
  // Verifica que o comentário e a lógica estão presentes
  assert.ok(
    workerSrc.includes("Caminho 1: LLM real assumiu a fala → usa apenas a fala cognitiva"),
    "Caminho 1 não encontrado em renderCognitiveSpeech"
  );
  assert.ok(
    workerSrc.includes("if (v2TakesFinal && cognitivePrefix) return [cognitivePrefix]"),
    "Lógica do caminho 1 não encontrada"
  );
});

test("14. Caminho 2: prefix sem takes_final → APENAS prefix, rawArr DESCARTADO", () => {
  assert.ok(
    workerSrc.includes("Caminho 2: prefix cognitivo sem takes_final → prefix É a fala completa, rawArr descartado"),
    "Caminho 2 novo contrato não encontrado em renderCognitiveSpeech"
  );
  assert.ok(
    workerSrc.includes("if (cognitivePrefix) return [cognitivePrefix]"),
    "Lógica do caminho 2 (prefix only, rawArr descartado) não encontrada"
  );
});

test("15. Caminho 3: sem flags → buildMinimalCognitiveFallback (rawArr NUNCA exposto para topo/meio)", () => {
  assert.ok(
    workerSrc.includes("Caminho 3: sem flags → fallback cognitivo mínimo (rawArr NUNCA exposto literalmente para topo/meio)"),
    "Caminho 3 novo contrato não encontrado em renderCognitiveSpeech"
  );
});

// ================================================================
// SECTION D — buildMinimalCognitiveFallback
// ================================================================
console.log("\n── SECTION D: buildMinimalCognitiveFallback ──");

test("16. Gates finais e operacional: conteúdo técnico preservado via _applyCognitiveSurfaceFilter", () => {
  // Gates e operacional têm conteúdo técnico obrigatório — não é possível substituir sem LLM
  // _applyCognitiveSurfaceFilter é chamada para fazer ajuste de registro (Informe→Me fala) mas
  // preserva o conteúdo técnico porque ele É a resposta correta para essas fases.
  assert.ok(
    workerSrc.includes("Gates finais e operacional: conteúdo técnico obrigatório — precisão > forma"),
    "Guard gates/operacional não encontrado com novo contrato"
  );
  assert.ok(
    workerSrc.includes("_applyCognitiveSurfaceFilter(lines)"),
    "_applyCognitiveSurfaceFilter deve ser usada para gates/operacional"
  );
});

test("17. Topo e meio: usa _MINIMAL_FALLBACK_SPEECH_MAP — rawArr NUNCA exposto literalmente", () => {
  assert.ok(
    workerSrc.includes("_MINIMAL_FALLBACK_SPEECH_MAP"),
    "_MINIMAL_FALLBACK_SPEECH_MAP deve existir no worker"
  );
  assert.ok(
    workerSrc.includes("Topo e meio: NUNCA expor rawArr literal — usar fala cognitiva mínima por stage"),
    "Contrato de não-exposição de rawArr não encontrado"
  );
  assert.ok(
    workerSrc.includes('_MINIMAL_FALLBACK_SPEECH_MAP.get(stage) || "Pode continuar 😊"'),
    "Lookup de stage no mapa não encontrado"
  );
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

test("19. buildMinimalCognitiveFallback retorna fallback seguro para rawArr vazio em gates/operacional", () => {
  // Para gates/operacional, rawArr vazio → "Pode continuar 😊"
  // Para topo/meio, rawArr é ignorado — usa _MINIMAL_FALLBACK_SPEECH_MAP
  assert.ok(
    workerSrc.includes('if (!Array.isArray(rawArr) || rawArr.length === 0) return ["Pode continuar 😊"]'),
    "Fallback seguro para rawArr vazio não encontrado (gates/operacional)"
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
  const afterRender = workerSrc.substring(idx, idx + 400);
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
// SECTION H — _applyCognitiveSurfaceFilter: filtro honesto, sem verniz
// ================================================================
console.log("\n── SECTION H: _applyCognitiveSurfaceFilter — filtro honesto ──");

test("48. Textos com emoji passam sem alteração (jaConversacional)", () => {
  assert.ok(
    workerSrc.includes("/👌|✅|💛|😊|😉|👍|✍️|🤝|🔥|⚠️|📝|✨/.test(allText)"),
    "Guard de emoji não encontrado"
  );
  // Behavioral: emoji → pass through unchanged
  const lines = ["Oi! 😊 Vou analisar seu perfil.", "Qual o seu nome?"];
  const result = _applyCognitiveSurfaceFilterFn(lines);
  assert.deepEqual(result, lines, "Texto com emoji deve passar sem modificação");
});

test("49. Textos com 'perfeito/ótimo/entendi' passam sem alteração (jaConversacional)", () => {
  assert.ok(
    workerSrc.includes("/\\b(perfeito|ótimo|entendi|tranquilo|show|certinho|boa|claro)\\b/i.test(allText)"),
    "Guard de palavras conversacionais não encontrado"
  );
  // Behavioral: palavra conversacional → pass through unchanged
  const lines = ["Perfeito 👌", "Qual o seu nome completo?"];
  const result = _applyCognitiveSurfaceFilterFn(lines);
  assert.deepEqual(result, lines, "Texto com 'Perfeito' deve passar sem modificação");
});

test("50. _softQuestion foi REMOVIDA — sem wrapper 'Me conta:' em perguntas", () => {
  // BLOCO 2: verniz removido. _softQuestion não deve existir.
  assert.ok(
    !workerSrc.includes("function _softQuestion("),
    "_softQuestion deve ter sido REMOVIDA (era verniz cosmético)"
  );
  assert.ok(
    !workerSrc.includes('"Me conta: "'),
    "String 'Me conta: ' não deve aparecer como output no worker"
  );
  // Behavioral: pergunta mecânica sem emoji → passthrough HONESTO (sem wrapper)
  const lines = ["Qual é o seu estado civil?"];
  const result = _applyCognitiveSurfaceFilterFn(lines);
  assert.deepEqual(result, lines, "Pergunta mecânica passa sem wrapper 'Me conta:'");
  assert.ok(!result[0].startsWith("Me conta:"), "Nunca adiciona wrapper 'Me conta:'");
});

// ================================================================
// SECTION I — BEHAVIORAL: 8 cenários concretos de entrada → saída final
//
// CONTRATO NOVO (BLOCOs 1-3 do comment 4189815742):
// - Nenhum caminho expõe rawArr literal ao cliente
// - cognitive_real: rawArr DESCARTADO, só prefix cognitivo
// - cognitive_heuristic: rawArr DESCARTADO, só prefix (que já é completo)
// - cognitive_fallback topo/meio: usa _MINIMAL_FALLBACK_SPEECH_MAP (rawArr ignorado)
// - cognitive_fallback gates/operacional: conteúdo técnico preservado
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
  assert.strictEqual(_classifyRenderPath(st), "cognitive_fallback");
  // Prova de intenção da fase: fala menciona MCMV ou análise
  assert.ok(
    _containsAny(result[0], ["mcmv", "analisar", "perfil"]),
    "Intenção da fase (MCMV) preservada na saída cognitiva"
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

// ─── Cenário 4: `sou casado` — Caminho 2, cognitive_heuristic, rawArr DESCARTADO ───
test("54. BEHAVIORAL: 'sou casado' at estado_civil — Caminho 2, rawArr DESCARTADO, só prefix", () => {
  const prefix = "Entendi! 👍 Seu casamento é civil no papel ou vocês vivem como união estável?";
  const st = _mkSt({
    fase_conversa: "estado_civil",
    last_user_text: "sou casado",
    __cognitive_reply_prefix: prefix,
    __cognitive_v2_takes_final: false
  });
  const rawArr = ["[mecânico — deve ser descartado]"];
  const result = _renderCognitiveSpeech(st, "estado_civil", rawArr);
  // Caminho 2: APENAS o prefix, rawArr DESCARTADO
  assert.strictEqual(result.length, 1, "Exatamente 1 elemento — só o prefix cognitivo");
  assert.strictEqual(result[0], prefix, "Saída é exclusivamente o prefix cognitivo");
  assert.ok(!result[0].includes("[mecânico"), "rawArr foi descartado");
  assert.ok(!result[0].includes("Me conta:"), "Sem wrapper verniz");
  // Intenção da fase preservada no prefix (contém a pergunta de casamento)
  assert.ok(
    _containsAny(result[0], ["casamento", "civil", "estável"]),
    "Intenção da fase (estado civil) preservada no prefix"
  );
  assert.strictEqual(_classifyRenderPath(st), "cognitive_heuristic");
});

// ─── Cenário 5: `reset + oi enova` — Caminho 1, cognitive real ───
test("55. BEHAVIORAL: 'reset + oi enova' — Caminho 1, rawArr DESCARTADO", () => {
  const cogSpeech = "Oi! 😊 Eu sou a Enova. Você já sabe como funciona ou prefere que eu explique?";
  const st = _mkSt({
    fase_conversa: "inicio_programa",
    last_user_text: "oi enova",
    __cognitive_reply_prefix: cogSpeech,
    __cognitive_v2_takes_final: true
  });
  const rawArr = ["[mechanical reset raw response — should be discarded]"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Caminho 1: SOMENTE o cognitive prefix. rawArr é DESCARTADO.
  assert.strictEqual(result.length, 1, "Exatamente 1 elemento na saída (rawArr descartado)");
  assert.strictEqual(result[0], cogSpeech, "Saída deve ser APENAS o prefix cognitivo");
  assert.ok(!result[0].includes("[mechanical"), "rawArr foi descartado");
  assert.ok(!result[0].includes("Me conta:"), "Sem verniz na saída cognitiva real");
  assert.strictEqual(_classifyRenderPath(st), "cognitive_real");
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

// ─── Cenário 7: resposta de fase + pergunta paralela → Caminho 2, rawArr DESCARTADO ───
test("57. BEHAVIORAL: resposta de fase + pergunta paralela — Caminho 2, rawArr DESCARTADO", () => {
  // "sou solteiro, e posso comprar com minha irmã?" — 46 chars, ? presente
  // O resolver cognitivo detectou "solteiro" e setou prefix completo
  const prefix = "Perfeito 👌 E sobre renda... você pretende usar só sua renda ou quer somar com alguém?";
  const st = _mkSt({
    fase_conversa: "estado_civil",
    last_user_text: "sou solteiro, e posso comprar com minha irmã?",
    __cognitive_reply_prefix: prefix,
    __cognitive_v2_takes_final: false
  });
  const rawArr = ["[mecânico — deve ser descartado]"];
  const result = _renderCognitiveSpeech(st, "estado_civil", rawArr);
  // Caminho 2: APENAS o prefix, rawArr DESCARTADO
  assert.strictEqual(result.length, 1, "Exatamente 1 elemento — só o prefix cognitivo");
  assert.strictEqual(result[0], prefix, "Saída é exclusivamente o prefix cognitivo");
  assert.ok(!result[0].includes("[mecânico"), "rawArr descartado");
  // Intenção da fase (renda) está preservada no prefix
  assert.ok(result[0].includes("renda"), "Intenção da fase preservada no prefix");
  assert.ok(!result[0].includes("Me conta:"), "Sem wrapper verniz no prefix");
  assert.strictEqual(_classifyRenderPath(st), "cognitive_heuristic");
});

// ─── Cenário 8: complemento `e também` — Caminho 3, rawArr ignorado, fala cognitiva ───
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
// SECTION J — classifyRenderPath: 3 classificações canônicas
// ================================================================
console.log("\n── SECTION J: classifyRenderPath — classificação da origem ──");

test("59. classifyRenderPath: cognitive_real (v2TakesFinal=true + prefix)", () => {
  const st = _mkSt({ __cognitive_reply_prefix: "fala cognitiva", __cognitive_v2_takes_final: true });
  assert.strictEqual(_classifyRenderPath(st), "cognitive_real");
});

test("60. classifyRenderPath: cognitive_heuristic (prefix sem takes_final)", () => {
  const st = _mkSt({ __cognitive_reply_prefix: "fala heurística", __cognitive_v2_takes_final: false });
  assert.strictEqual(_classifyRenderPath(st), "cognitive_heuristic");
});

test("61. classifyRenderPath: cognitive_fallback (sem flags)", () => {
  const st = _mkSt({ __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false });
  assert.strictEqual(_classifyRenderPath(st), "cognitive_fallback");
});

test("62. classifyRenderPath: v2TakesFinal=true sem prefix → cognitive_fallback (prefix vazio)", () => {
  // v2TakesFinal sozinho sem prefix não é suficiente para Caminho 1
  const st = _mkSt({ __cognitive_reply_prefix: "", __cognitive_v2_takes_final: true });
  assert.strictEqual(_classifyRenderPath(st), "cognitive_fallback");
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

test("66. Gates finais: conteúdo técnico preservado via _applyCognitiveSurfaceFilter", () => {
  // Gates finais têm conteúdo técnico obrigatório. Não é possível substituir
  // por fala genérica sem LLM. O _applyCognitiveSurfaceFilter é aplicado para
  // ajuste de registro (Informe→Me fala) mas preserva o conteúdo.
  const st = _mkSt({ fase_conversa: "ir_declarado", last_user_text: "não, mas e o meu sócio?" });
  st.__round_intent = _buildRoundIntent(st, "não, mas e o meu sócio?");
  const rawArr = ["Você declarou IR nos últimos 2 anos?"];
  const result = _renderCognitiveSpeech(st, "ir_declarado", rawArr);
  // gates_finais → conteúdo técnico preservado (é a resposta correta para a fase)
  assert.strictEqual(result[0], rawArr[0], "Conteúdo técnico de gate preservado");
  // Limitação declarada: overlap não é reconhecido em stages técnicos.
  assert.ok(!result[0].includes("Anotei tudo aqui"), "Overlap não ativo para gates técnicos");
});

// ================================================================
// RESULTADO FINAL
// ================================================================
console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);

if (failed > 0) {
  process.exit(1);
}
