/**
 * cognitive_topo_greeting_decoupling.smoke.mjs
 *
 * Smoke tests para o patch cirúrgico de desacoplamento da superfície de fala
 * concorrente no topo do funil (inicio_programa).
 *
 * CONTRATO:
 *   1. Quando LLM real é soberano → fala final é a do LLM (sem mudança)
 *   2. Quando LLM falha E é greeting/reset → fallback é natural (greeting + introdução)
 *   3. Quando LLM falha E é ambíguo (não greeting) → fallback é pergunta estrutural (sem mudança)
 *   4. _MINIMAL_FALLBACK_SPEECH_MAP de inicio_programa é natural
 *   5. stage/gate/parser/nextStage/modo_humano_manual preservados
 *   6. "nao" block preservado intacto
 *
 * Seções:
 *   A — Cenário reset + "Oi" (LLM sucesso vs falha)
 *   B — Cenário reset + "Oi Enova" / "Oi Enova tudo bem?"
 *   C — Cenário "Não, me explica?" (não afetado)
 *   D — Ambíguo não-greeting (não afetado)
 *   E — _MINIMAL_FALLBACK_SPEECH_MAP atualizado
 *   F — stage/gate/parser/nextStage preservados
 *   G — modo_humano_manual preservado
 *   H — Saudação + dúvida curta (via "nao" block)
 *   I — _renderCognitiveFromIntent preservado para stages não-topo
 *   J — Dominância LLM intacta (renderCognitiveSpeech)
 */

import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

// ================================================================
// VM EXTRACTION — sovereign speech layer
// ================================================================
const _VM_BLOCK_START = "// CAMADA CANÔNICA DE FALA COGNITIVA SOBERANA";
const _VM_BLOCK_END = "// 🧠 COGNITIVE V2 — Adapter + Runner";
const _vmStartIdx = workerSrc.indexOf(_VM_BLOCK_START);
const _vmEndIdx = workerSrc.indexOf(_VM_BLOCK_END);
if (_vmStartIdx === -1 || _vmEndIdx === -1 || _vmEndIdx <= _vmStartIdx) {
  throw new Error(`VM block markers not found in worker source.`);
}
const _vmBlockSrc = workerSrc.substring(_vmStartIdx, _vmEndIdx) + `
;__EXPORTS.reconcileClientInput = reconcileClientInput;
__EXPORTS.buildRoundIntent = buildRoundIntent;
__EXPORTS.buildMinimalCognitiveFallback = buildMinimalCognitiveFallback;
__EXPORTS.renderCognitiveSpeech = renderCognitiveSpeech;
__EXPORTS.classifyRenderPath = classifyRenderPath;
__EXPORTS._renderCognitiveFromIntent = _renderCognitiveFromIntent;
__EXPORTS._validatePhaseRequirement = _validatePhaseRequirement;
__EXPORTS._MINIMAL_FALLBACK_SPEECH_MAP = _MINIMAL_FALLBACK_SPEECH_MAP;
`;
const _vmCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(_vmBlockSrc, _vmCtx);
const {
  buildRoundIntent: _buildRoundIntent,
  buildMinimalCognitiveFallback: _buildMinimalCognitiveFallback,
  renderCognitiveSpeech: _renderCognitiveSpeech,
  classifyRenderPath: _classifyRenderPath,
  _renderCognitiveFromIntent: _renderCognitiveFromIntentFn,
  _MINIMAL_FALLBACK_SPEECH_MAP: _fallbackMap
} = _vmCtx.__EXPORTS;

// Extract modoHumanoRender
const _modoHumanoStart = workerSrc.indexOf("function modoHumanoRender(st, arr)");
const _modoHumanoEnd = workerSrc.indexOf("function ajustaTexto(msg)");
if (_modoHumanoStart === -1 || _modoHumanoEnd === -1) throw new Error("modoHumanoRender not found");
const _mhCtx = vm.createContext({ __EXPORTS: {}, Math, console, ajustaTexto: (msg) => msg });
vm.runInContext(workerSrc.substring(_modoHumanoStart, _modoHumanoEnd) + `;__EXPORTS.modoHumanoRender = modoHumanoRender;`, _mhCtx);
const _modoHumanoRender = _mhCtx.__EXPORTS.modoHumanoRender;

// Extract setTopoHappyPathFlags
const _setFlagsStart = workerSrc.indexOf("function setTopoHappyPathFlags(st, happyResult)");
const _setFlagsEnd = workerSrc.indexOf("// RESOLVEDORES COGNITIVOS ESTRUTURADOS");
if (_setFlagsStart === -1 || _setFlagsEnd === -1) throw new Error("setTopoHappyPathFlags not found");
const _sfCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(workerSrc.substring(_setFlagsStart, _setFlagsEnd) + `;__EXPORTS.setTopoHappyPathFlags = setTopoHappyPathFlags;`, _sfCtx);
const _setTopoHappyPathFlags = _sfCtx.__EXPORTS.setTopoHappyPathFlags;

// Helpers
function _mkSt(overrides = {}) {
  return {
    fase_conversa: "inicio_programa",
    last_user_text: "",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __round_intent: null,
    __speech_arbiter_source: null,
    modo_humano: false,
    modo_humano_manual: false,
    primeiro_nome: "Ana",
    ...overrides
  };
}

// Simulates what step() does internally:
// 1. Build roundIntent from rawArr
// 2. Call renderCognitiveSpeech
function _simulateStep(st, messages) {
  const rawArr = Array.isArray(messages) ? messages : [messages];
  if (!st.__round_intent && (st.last_user_text || "").trim()) {
    st.__round_intent = _buildRoundIntent(st, st.last_user_text, rawArr);
  }
  return _renderCognitiveSpeech(st, st.fase_conversa || "inicio", rawArr.filter(Boolean));
}

// The natural greeting fallback message (from the patch)
const NATURAL_GREETING_FALLBACK = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho? Me diz *sim* (já sei) ou *não* (me explica).";

// The structural question fallback (original, for non-greeting ambiguous)
const STRUCTURAL_QUESTION = "Você já conhece como o programa Minha Casa Minha Vida funciona ou prefere que eu te explique rapidinho?";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

// ================================================================
// SECTION A — Cenário reset + "Oi" (LLM sucesso vs falha)
// ================================================================
console.log("\n📦 SECTION A — reset + 'Oi' (LLM sucesso vs falha)");

test("A1: reset + Oi — LLM real → fala do LLM é a fala final", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: "Oi! 😊 Que bom te ver por aqui! Eu sou a Enova e vou te ajudar com o Minha Casa Minha Vida. Quer saber como funciona?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Oi!"), "LLM real response used");
  assert.ok(result[0].includes("Enova"), "LLM real response used");
});

test("A2: reset + Oi — LLM falha → fallback é natural (NÃO pergunta estrutural)", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.equal(result.length, 1);
  // Must be natural greeting, NOT structural question
  assert.ok(result[0].includes("Oi!"), "starts with greeting");
  assert.ok(result[0].includes("Enova"), "introduces Enova");
  assert.ok(!result[0].startsWith("Você já conhece"), "NOT structural question");
});

test("A3: reset + Oi — fallback NÃO contém pergunta mecânica crua", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.ok(!result[0].includes("Você já conhece como"), "no 'Você já conhece' structural opening");
});

test("A4: reset + Oi — fallback contém prompt para sim/não", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.ok(/sim|não|nao/i.test(result[0]), "contains sim/não prompt");
});

// ================================================================
// SECTION B — reset + "Oi Enova" / "Oi Enova tudo bem?"
// ================================================================
console.log("\n📦 SECTION B — reset + 'Oi Enova' / 'Oi Enova tudo bem?'");

test("B1: Oi Enova — LLM real → fala do LLM é a fala final", () => {
  const st = _mkSt({
    last_user_text: "Oi Enova",
    __cognitive_reply_prefix: "Oi! 😊 Tudo bem? Eu sou a Enova, como posso te ajudar com o MCMV?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Oi!"), "LLM real response used");
});

test("B2: Oi Enova — LLM falha → fallback natural", () => {
  const st = _mkSt({
    last_user_text: "Oi Enova",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.ok(result[0].includes("Oi!"), "starts with greeting");
  assert.ok(result[0].includes("Enova"), "introduces Enova");
});

test("B3: Oi Enova tudo bem? — LLM falha → fallback natural", () => {
  const st = _mkSt({
    last_user_text: "Oi Enova tudo bem?",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.ok(result[0].includes("Oi!"), "starts with greeting");
  assert.ok(!result[0].startsWith("Você já conhece"), "NOT structural question");
});

// ================================================================
// SECTION C — "Não, me explica?" (nao block — NÃO afetado)
// ================================================================
console.log("\n📦 SECTION C — 'Não, me explica?' (nao block — NÃO afetado)");

test("C1: Não, me explica — LLM real → LLM responde com explicação", () => {
  const st = _mkSt({
    last_user_text: "Não, me explica?",
    __cognitive_reply_prefix: "Claro! O Minha Casa Minha Vida é um programa do governo que ajuda famílias a conquistar a casa própria com subsídios e parcelas menores. Vou analisar seu perfil pra ver como você se encaixa! Me diz *sim* pra gente seguir 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  // nao block uses different hardcoded messages (explanation text)
  const naoMsgs = [
    "Perfeito, te explico rapidinho 😊",
    "O Minha Casa Minha Vida é o programa do governo que ajuda na entrada e reduz a parcela do financiamento.",
    "Eu vou analisar seu perfil e te mostrar exatamente quanto de subsídio você pode ter.",
    "Tudo certo até aqui? Me diz *sim* pra gente seguir com a análise do seu perfil 😊"
  ];
  const result = _simulateStep(st, naoMsgs);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Minha Casa Minha Vida"), "LLM explains MCMV");
});

test("C2: Não, me explica — LLM falha → fallback usa explicação mecânica (não afetado pelo patch)", () => {
  const st = _mkSt({
    last_user_text: "Não, me explica?",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const naoMsgs = [
    "Perfeito, te explico rapidinho 😊",
    "O Minha Casa Minha Vida é o programa do governo.",
    "Me diz *sim* pra gente seguir com a análise do seu perfil 😊"
  ];
  const result = _simulateStep(st, naoMsgs);
  // Fallback uses _renderCognitiveFromIntent with first part
  assert.ok(result[0].includes("Perfeito"), "fallback preserves explanation opening");
});

// ================================================================
// SECTION D — Ambíguo não-greeting (NÃO afetado pelo patch)
// ================================================================
console.log("\n📦 SECTION D — Ambíguo não-greeting (NÃO afetado)");

test("D1: texto ambíguo (não greeting) — LLM falha → pergunta estrutural preservada", () => {
  const st = _mkSt({
    last_user_text: "hmm",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  // Non-greeting ambiguous uses original structural messages
  const ambMsgs = [
    STRUCTURAL_QUESTION,
    "Me diz *sim* (já sei) ou *não* (me explica)."
  ];
  const result = _simulateStep(st, ambMsgs);
  // Structural question is still used for non-greeting ambiguous
  assert.ok(result[0].includes("funciona") || result[0].includes("programa"), "structural question preserved for non-greeting");
});

// ================================================================
// SECTION E — _MINIMAL_FALLBACK_SPEECH_MAP atualizado
// ================================================================
console.log("\n📦 SECTION E — _MINIMAL_FALLBACK_SPEECH_MAP atualizado");

test("E1: inicio_programa map entry é natural", () => {
  const entry = _fallbackMap.get("inicio_programa");
  assert.ok(entry, "map entry exists");
  assert.ok(entry.includes("Oi!"), "starts with greeting");
  assert.ok(entry.includes("Enova"), "mentions Enova");
  assert.ok(entry.includes("Minha Casa Minha Vida"), "mentions program name");
  assert.ok(entry.includes("?"), "has question");
});

test("E2: inicio_programa map entry NÃO é pergunta estrutural mecânica", () => {
  const entry = _fallbackMap.get("inicio_programa");
  assert.ok(!entry.startsWith("Vou analisar"), "not mechanical prompt start");
});

test("E3: inicio map entry preservado (não alterado)", () => {
  const entry = _fallbackMap.get("inicio");
  assert.ok(entry.includes("Oi!"), "inicio entry preserved");
});

test("E4: inicio_nome map entry preservado", () => {
  const entry = _fallbackMap.get("inicio_nome");
  assert.ok(entry.includes("nome"), "inicio_nome entry preserved");
});

test("E5: estado_civil map entry preservado", () => {
  const entry = _fallbackMap.get("estado_civil");
  assert.ok(entry.includes("estado civil"), "estado_civil entry preserved");
});

// ================================================================
// SECTION F — stage/gate/parser/nextStage preservados
// ================================================================
console.log("\n📦 SECTION F — stage/gate/parser/nextStage preservados");

test("F1: renderCognitiveSpeech NÃO altera stage", () => {
  const st = _mkSt({
    fase_conversa: "inicio_programa",
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.equal(st.fase_conversa, "inicio_programa", "stage unchanged");
});

test("F2: renderCognitiveSpeech NÃO altera gate", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null,
    gate_principal: "renda_ok"
  });
  _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.equal(st.gate_principal, "renda_ok", "gate unchanged");
});

test("F3: setTopoHappyPathFlags preservado — cognitive_real → llm_real", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "cognitive_real", speech: ["Oi! Tudo bem?"] });
  assert.equal(st.__speech_arbiter_source, "llm_real");
  assert.equal(st.__cognitive_v2_takes_final, true);
  assert.ok(st.__cognitive_reply_prefix);
});

test("F4: setTopoHappyPathFlags preservado — heuristic → null", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "heuristic_guidance", speech: ["Hmm"] });
  assert.equal(st.__speech_arbiter_source, null);
  assert.equal(st.__cognitive_v2_takes_final, false);
  assert.equal(st.__cognitive_reply_prefix, null);
});

test("F5: setTopoHappyPathFlags preservado — fallback_mechanical → null", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "fallback_mechanical", speech: ["Hmm"] });
  assert.equal(st.__speech_arbiter_source, null);
  assert.equal(st.__cognitive_v2_takes_final, false);
  assert.equal(st.__cognitive_reply_prefix, null);
});

// ================================================================
// SECTION G — modo_humano_manual preservado
// ================================================================
console.log("\n📦 SECTION G — modo_humano_manual preservado");

test("G1: modo_humano=false → arr inalterado", () => {
  const st = _mkSt({ modo_humano: false, modo_humano_manual: false });
  const arr = ["Oi! 😊 teste"];
  const result = _modoHumanoRender(st, arr);
  assert.deepStrictEqual(result, arr);
});

test("G2: modo_humano=true sem manual → arr inalterado", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: false });
  const arr = ["Oi! 😊 teste"];
  const result = _modoHumanoRender(st, arr);
  assert.deepStrictEqual(result, arr);
});

test("G3: modo_humano=true com manual=true → arr transformado", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: true });
  const arr = ["Oi! 😊 teste"];
  const result = _modoHumanoRender(st, arr);
  assert.ok(result[0] !== arr[0], "arr was transformed");
});

// ================================================================
// SECTION H — Saudação + dúvida curta (via "nao" block)
// ================================================================
console.log("\n📦 SECTION H — Saudação + dúvida curta");

test("H1: 'Oi, como funciona?' — LLM responde → fala final é do LLM", () => {
  const st = _mkSt({
    last_user_text: "Oi, como funciona?",
    __cognitive_reply_prefix: "O Minha Casa Minha Vida é um programa que ajuda na compra do imóvel com subsídio do governo 😊 Quer que eu analise seu perfil?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, [NATURAL_GREETING_FALLBACK]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Minha Casa Minha Vida"), "LLM response used");
});

// ================================================================
// SECTION I — _renderCognitiveFromIntent preservado para stages não-topo
// ================================================================
console.log("\n📦 SECTION I — _renderCognitiveFromIntent preservado para outros stages");

test("I1: estado_civil — transformação preservada", () => {
  const result = _renderCognitiveFromIntentFn("Informe seu estado civil", "estado_civil");
  assert.ok(result, "transformation works for estado_civil");
  assert.ok(result.includes("estado civil") || result.includes("Me fala"), "cognitive version produced");
});

test("I2: inicio_nome — transformação preservada", () => {
  const result = _renderCognitiveFromIntentFn("Informe seu nome completo", "inicio_nome");
  assert.ok(result, "transformation works for inicio_nome");
  assert.ok(result.includes("nome"), "nome requirement preserved");
});

test("I3: ir_declarado — transformação preservada", () => {
  const result = _renderCognitiveFromIntentFn("Você declarou imposto de renda?", "ir_declarado");
  assert.ok(result, "transformation works for ir_declarado");
  assert.ok(/imposto|ir\b|renda/i.test(result), "IR requirement preserved");
});

test("I4: inicio_programa — transformação ainda funciona (map não bloqueia)", () => {
  const result = _renderCognitiveFromIntentFn(
    "Perfeito, te explico rapidinho 😊",
    "inicio_programa"
  );
  assert.ok(result, "transformation works for inicio_programa explanation text");
  assert.ok(result.includes("Perfeito"), "explanation preserved");
});

// ================================================================
// SECTION J — Dominância LLM intacta (renderCognitiveSpeech)
// ================================================================
console.log("\n📦 SECTION J — Dominância LLM intacta");

test("J1: LLM real → renderCognitiveSpeech retorna cognitivePrefix", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: "Oi! Tudo bem? Sou a Enova 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", [NATURAL_GREETING_FALLBACK]);
  assert.equal(result.length, 1);
  assert.equal(result[0], "Oi! Tudo bem? Sou a Enova 😊");
});

test("J2: LLM falha → renderCognitiveSpeech retorna fallback", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  st.__round_intent = _buildRoundIntent(st, "Oi", [NATURAL_GREETING_FALLBACK]);
  const result = _renderCognitiveSpeech(st, "inicio_programa", [NATURAL_GREETING_FALLBACK]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Oi!") || result[0].includes("Enova"), "fallback is natural");
});

test("J3: classifyRenderPath — LLM real → 'llm_real'", () => {
  const st = _mkSt({ __speech_arbiter_source: "llm_real" });
  assert.equal(_classifyRenderPath(st), "llm_real");
});

test("J4: classifyRenderPath — fallback → 'extreme_fallback'", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  assert.equal(_classifyRenderPath(st), "extreme_fallback");
});

test("J5: Heurística NÃO produz fala final (arbiter blocks)", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Heuristic guidance text",
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  st.__round_intent = _buildRoundIntent(st, "Oi", [NATURAL_GREETING_FALLBACK]);
  const result = _renderCognitiveSpeech(st, "inicio_programa", [NATURAL_GREETING_FALLBACK]);
  // Should NOT return the heuristic text
  assert.ok(!result[0].includes("Heuristic guidance"), "heuristic not sovereign");
});

// ================================================================
// SECTION K — rawArr NUNCA exposto ao cliente
// ================================================================
console.log("\n📦 SECTION K — rawArr NUNCA exposto");

test("K1: rawArr mecânico NÃO aparece na fala final (LLM real)", () => {
  const rawArr = ["Informe seu nome completo", "📋 Lista de documentos obrigatórios:"];
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: "Oi! 😊 Que bom!",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", rawArr);
  assert.ok(!result[0].includes("Informe"), "rawArr not exposed");
});

test("K2: rawArr mecânico NÃO aparece cru na fala final (fallback)", () => {
  const rawArr = ["Informe seu nome completo"];
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null,
    fase_conversa: "inicio_nome"
  });
  st.__round_intent = _buildRoundIntent(st, "Oi", rawArr);
  const result = _renderCognitiveSpeech(st, "inicio_nome", rawArr);
  assert.ok(!result[0].includes("Informe"), "rawArr 'Informe' stripped");
});

// ================================================================
// SECTION L — Integridade do source (anchors no worker.js)
// ================================================================
console.log("\n📦 SECTION L — Integridade do source");

test("L1: PATCH CIRÚRGICO marker presente no worker", () => {
  assert.ok(workerSrc.includes("PATCH CIRÚRGICO: desacoplar superfície de fala concorrente no topo"), "patch marker found");
});

test("L2: _ambFallbackMsgs condicional presente", () => {
  assert.ok(workerSrc.includes("_ambFallbackMsgs"), "conditional variable exists");
});

test("L3: mensagem natural de fallback para greeting está no worker", () => {
  assert.ok(workerSrc.includes("Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho? Me diz *sim* (já sei) ou *não* (me explica)."), "natural greeting fallback message present");
});

test("L4: mensagem estrutural original preservada para não-greeting", () => {
  assert.ok(workerSrc.includes("Você já conhece como o programa Minha Casa Minha Vida funciona ou prefere que eu te explique rapidinho?"), "original structural message preserved");
});

test("L5: renderCognitiveSpeech continua com 2 paths (llm_real + extreme_fallback)", () => {
  assert.ok(workerSrc.includes('arbiterSource === "llm_real"'), "llm_real path exists");
  assert.ok(workerSrc.includes('"extreme_fallback"'), "extreme_fallback path exists");
});

test("L6: modoHumanoRender guard continua exigindo modo_humano_manual", () => {
  assert.ok(workerSrc.includes("if (!st.modo_humano_manual) return arr;"), "manual guard exists");
});

// ================================================================
// SUMMARY
// ================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`RESULTADO: ${passed} passed, ${failed} failed (total: ${passed + failed})`);
console.log(`${"=".repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
