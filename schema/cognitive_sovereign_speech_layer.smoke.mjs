/**
 * cognitive_sovereign_speech_layer.smoke.mjs
 *
 * Smoke tests para a camada canônica de fala cognitiva soberana.
 *
 * Valida:
 *   A) Funções da camada existem no worker (presença de âncoras)
 *   B) step() integra renderCognitiveSpeech
 *   C) renderCognitiveSpeech — hierarquia de 3 caminhos (âncoras)
 *   D) buildMinimalCognitiveFallback — filtro cognitivo (âncoras)
 *   E) reconcileClientInput / buildRoundIntent — campos canônicos
 *   F) _COGNITIVE_RENDER_PHASE_MAP — stages mapeados
 *   G) Segurança estrutural (gates/nextStage/persistência preservados)
 *   H) _applyCognitiveSurfaceFilter — filtro honesto (SEM verniz)
 *   I) BEHAVIORAL: 8 cenários concretos de entrada → saída final
 *   J) classifyRenderPath — classificação canônica de origem
 *   K) Limitações honestas do overlap/reconciliação
 *
 * BLOCO 2 (verniz removido):
 *   _softQuestion removida. _applyCognitiveSurfaceFilter não adiciona
 *   "Me conta:" nem qualquer wrapper cosmético. Passthrough honesto
 *   quando o texto não é conversacional.
 *
 * BLOCO 3 (overlap honesto):
 *   Cobertura real: ? + comprimento > 20 + não-saudação pura.
 *   Limitações declaradas: off-trail sem ?, complementos sem ?,
 *   inputs ≤ 20 chars com ?, gates/operacional não filtrados.
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

test("14. Caminho 2: prefix sem takes_final → prefix + filtro cognitivo do rawArr", () => {
  assert.ok(
    workerSrc.includes("Caminho 2: prefix sem takes_final → prefix + filtro cognitivo do rawArr"),
    "Caminho 2 não encontrado em renderCognitiveSpeech"
  );
});

test("15. Caminho 3: sem flags → buildMinimalCognitiveFallback (nunca rawArr puro)", () => {
  assert.ok(
    workerSrc.includes("Caminho 3: sem flags → fallback cognitivo mínimo (nunca rawArr puro)"),
    "Caminho 3 não encontrado em renderCognitiveSpeech"
  );
});

// ================================================================
// SECTION D — buildMinimalCognitiveFallback
// ================================================================
console.log("\n── SECTION D: buildMinimalCognitiveFallback ──");

test("16. Operacional e gates finais passam direto sem alteração de superfície", () => {
  assert.ok(
    workerSrc.includes("if (phase === \"operacional\" || phase === \"gates_finais\") return lines"),
    "Guard operacional/gates_finais não encontrado"
  );
});

test("17. Topo e meio passam por _applyCognitiveSurfaceFilter", () => {
  assert.ok(
    workerSrc.includes("const filtered = _applyCognitiveSurfaceFilter(lines)"),
    "_applyCognitiveSurfaceFilter não chamada para topo/meio"
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

test("19. buildMinimalCognitiveFallback retorna fallback seguro para rawArr vazio", () => {
  assert.ok(
    workerSrc.includes('if (!Array.isArray(rawArr) || rawArr.length === 0) return ["Pode continuar 😊"]'),
    "Fallback seguro para rawArr vazio não encontrado"
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
// ================================================================
console.log("\n── SECTION I: BEHAVIORAL — entrada → saída final ──");

// ─── Cenário 1: `oi` — saudação pura, topo, Caminho 3 ───
test("51. BEHAVIORAL: 'oi' at inicio_programa — saída preserva rawArr sem modificação", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: "oi" });
  st.__round_intent = _buildRoundIntent(st, "oi");
  const rawArr = ["Oi! 😊 Eu sou a Enova, assistente do MCMV.", "Você já sabe como funciona?"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Caminho 3 — rawArr já conversacional → pass through
  assert.deepEqual(result, rawArr, "rawArr com emoji deve passar sem modificação");
  assert.ok(!result[0].startsWith("Me conta:"), "Nunca adiciona wrapper verniz");
  assert.ok(!result[0].startsWith("Anotei tudo aqui"), "Saudação pura não dispara overlap");
  assert.strictEqual(_classifyRenderPath(st), "cognitive_fallback");
});

// ─── Cenário 2: `oi enova` — não saudação pura, sem pergunta, topo, Caminho 3 ───
test("52. BEHAVIORAL: 'oi enova' at inicio_programa — sem overlap (sem ?)", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: "oi enova" });
  st.__round_intent = _buildRoundIntent(st, "oi enova");
  const rawArr = ["Oi! 😊 Eu sou a Enova.", "Você já sabe como funciona?"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Sem ? → sem overlap. Caminho 3, rawArr conversacional.
  assert.deepEqual(result, rawArr);
  assert.ok(!result[0].startsWith("Anotei"), "Sem ? não dispara overlap prefix");
  // reconcile: não é saudação pura, não tem pergunta paralela
  const ri = _buildRoundIntent(st, "oi enova");
  assert.strictEqual(ri.eh_saudacao_pura, false, "oi enova não é saudação pura");
  assert.strictEqual(ri.pergunta_paralela_detectada, false, "sem ? = sem pergunta paralela");
});

// ─── Cenário 3: `oi, posso usar o meu fgts?` — overlap detectado ───
test("53. BEHAVIORAL: 'oi, posso usar o meu fgts?' — overlap prefix adicionado", () => {
  const input = "oi, posso usar o meu fgts?"; // 26 chars > 20
  const st = _mkSt({ fase_conversa: "inicio_programa", last_user_text: input });
  st.__round_intent = _buildRoundIntent(st, input);
  const rawArr = ["Oi! 😊 Vou analisar seu perfil.", "Qual o seu nome completo?"];
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  // Overlap detectado → prefix "Anotei tudo aqui 😊" + rawArr
  assert.ok(result[0].includes("Anotei tudo aqui"), "Overlap prefix deve ser adicionado");
  assert.strictEqual(result.length, rawArr.length + 1, "rawArr preservado após prefix");
  assert.strictEqual(result[1], rawArr[0], "rawArr[0] deve ser result[1]");
  assert.ok(!result[1].startsWith("Me conta:"), "rawArr não recebe wrapper verniz");
  // Intenção da fase preservada (nome ainda solicitado)
  assert.ok(result[result.length - 1].includes("nome"), "Pergunta de fase preservada");
});

// ─── Cenário 4: `sou casado` — Caminho 2, cognitive heuristic ───
test("54. BEHAVIORAL: 'sou casado' at estado_civil — Caminho 2 (prefix heurístico)", () => {
  const prefix = "Entendi! 👍 Seu casamento é civil no papel ou vocês vivem como união estável?";
  const st = _mkSt({
    fase_conversa: "estado_civil",
    last_user_text: "sou casado",
    __cognitive_reply_prefix: prefix,
    __cognitive_v2_takes_final: false
  });
  const rawArr = ["Casamento civil ou união estável?"];
  const result = _renderCognitiveSpeech(st, "estado_civil", rawArr);
  // Caminho 2: prefix primeiro + rawArr filtrado appended
  assert.strictEqual(result[0], prefix, "Prefix cognitivo deve ser o primeiro elemento");
  assert.ok(result.length >= 2, "rawArr appended após prefix");
  // rawArr sem emoji → passthrough honesto (sem Me conta:)
  assert.ok(!result[1].startsWith("Me conta:"), "rawArr não recebe wrapper verniz");
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

// ─── Cenário 6: off-trail sem `?` — limitação honesta ───
test("56. BEHAVIORAL (limitação honesta): off-trail sem ? não detectado como overlap", () => {
  // BLOCO 3: esta é uma limitação CONHECIDA e declarada
  const input = "quero entender como funciona o subsidio";
  const st = _mkSt({ fase_conversa: "inicio_nome", last_user_text: input });
  st.__round_intent = _buildRoundIntent(st, input);
  const rawArr = ["Para começar, me diz seu nome completo 😊"];
  const result = _renderCognitiveSpeech(st, "inicio_nome", rawArr);
  // LIMITAÇÃO: off-trail sem ? não dispara overlap (não há ? na entrada)
  assert.ok(!result[0].includes("Anotei tudo aqui"), "Limitação: off-trail sem ? não é detectado como overlap");
  // rawArr passa através (tem 'me diz' → conversacional)
  assert.deepEqual(result, rawArr);
  // Confirmar que reconcileClientInput reflete a limitação
  const ri = _buildRoundIntent(st, input);
  assert.strictEqual(ri.pergunta_paralela_detectada, false, "Sem ? → sem detecção de pergunta paralela");
  assert.strictEqual(ri.pode_ter_multiplas_intencoes, false, "Sem detecção de múltiplas intenções");
});

// ─── Cenário 7: resposta de fase + pergunta paralela ───
test("57. BEHAVIORAL: resposta de fase + pergunta paralela — Caminho 2 preserva fase", () => {
  // "sou solteiro, e posso comprar com minha irmã?" — 46 chars, ? presente
  // O resolver cognitivo detectou "solteiro" e setou prefix
  const prefix = "Perfeito 👌 E sobre renda... você pretende usar só sua renda ou quer somar com alguém?";
  const st = _mkSt({
    fase_conversa: "estado_civil",
    last_user_text: "sou solteiro, e posso comprar com minha irmã?",
    __cognitive_reply_prefix: prefix,
    __cognitive_v2_takes_final: false
  });
  const rawArr = ["Sobre renda — só a sua ou soma com alguém?"];
  const result = _renderCognitiveSpeech(st, "estado_civil", rawArr);
  // Caminho 2: prefix do resolver + rawArr filtrado
  assert.strictEqual(result[0], prefix, "Prefix do resolver vem primeiro");
  assert.ok(result.length >= 2, "rawArr appended");
  // A intenção da fase (renda) está preservada
  assert.ok(result[0].includes("renda"), "Intenção da fase preservada no prefix");
  // Sem concatenação torta (não há duplicação, não tem Me conta:)
  assert.ok(!result[0].includes("Me conta:"), "Sem wrapper verniz no prefix");
});

// ─── Cenário 8: complemento logo em seguida ───
test("58. BEHAVIORAL: complemento 'e também' — sem overlap prefix (sem ?)", () => {
  const input = "e também tenho uma filha dependente";
  const st = _mkSt({ fase_conversa: "somar_renda_familiar", last_user_text: input });
  st.__round_intent = _buildRoundIntent(st, input);
  const rawArr = ["Ótimo! 😊 Vamos incluir a renda também.", "Qual a renda dela?"];
  const result = _renderCognitiveSpeech(st, "somar_renda_familiar", rawArr);
  // temComplemento=true, mas sem ? → pode_ter_multiplas_intencoes=false
  // Caminho 3, rawArr conversacional → pass through
  const ri = _buildRoundIntent(st, input);
  assert.strictEqual(ri.info_complementar_detectada, true, "Complemento deve ser detectado");
  assert.strictEqual(ri.pode_ter_multiplas_intencoes, false, "Sem pergunta paralela, sem múltiplas intenções");
  assert.ok(!result[0].includes("Anotei tudo aqui"), "Complemento sem ? não dispara overlap prefix");
  assert.deepEqual(result, rawArr, "rawArr conversacional passa sem modificação");
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

test("66. LIMITAÇÃO: paralelas em gates_finais/operacional passam sem reconhecimento de overlap", () => {
  // Gates finais e operacional passam rawArr sem qualquer filtro
  // (conteúdo técnico intocável). Overlap também não é reconhecido.
  const st = _mkSt({ fase_conversa: "ir_declarado", last_user_text: "não, mas e o meu sócio?" });
  st.__round_intent = _buildRoundIntent(st, "não, mas e o meu sócio?");
  const rawArr = ["Você declarou IR nos últimos 2 anos?"];
  const result = _renderCognitiveSpeech(st, "ir_declarado", rawArr);
  // gates_finais → passthrough direto, sem filtro de overlap
  assert.deepEqual(result, rawArr, "Gates finais passam sem filtro");
  // Limitação: o reconhecimento de overlap não está ativo para stages técnicos.
});

// ================================================================
// RESULTADO FINAL
// ================================================================
console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);

if (failed > 0) {
  process.exit(1);
}
