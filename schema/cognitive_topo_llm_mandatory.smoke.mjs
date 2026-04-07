/**
 * cognitive_topo_llm_mandatory.smoke.mjs
 *
 * Smoke tests para a arquitetura "LLM obrigatório no topo do funil".
 *
 * CONTRATO FINAL:
 *   1. No topo, TODA fala visível nasce do LLM quando disponível.
 *   2. step() recebe APENAS fallback extremo mínimo (1 linha curta/neutra).
 *   3. Antes de cada step(), getTopoHappyPathSpeech() é chamado (LLM obrigatório).
 *   4. Fallback manual SÓ ocorre em erro técnico extremo (LLM down).
 *   5. Mecânico permanece soberano em stage/gate/parser/nextStage/persistência.
 *   6. modo_humano_manual preservado.
 *
 * Seções:
 *   A — LLM real é fonte obrigatória de fala no topo
 *   B — Fallback extremo mínimo (curto, neutro, 1 linha)
 *   C — Cenários: reset + "Oi", "Oi Enova", "Oi Enova tudo bem?"
 *   D — Cenário: "Não, me explica?" — LLM explica primeiro
 *   E — renderCognitiveSpeech/classifyRenderPath intactos
 *   F — stage/gate/parser/nextStage preservados
 *   G — modo_humano_manual preservado
 *   H — _MINIMAL_FALLBACK_SPEECH_MAP atualizado
 *   I — TOPO_HAPPY_PATH_SPEECH novas entradas
 *   J — Integridade do source: step() NÃO tem mensagens multi-linha no topo
 *   K — rawArr NUNCA exposto ao cliente
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
__EXPORTS._MINIMAL_FALLBACK_SPEECH_MAP = _MINIMAL_FALLBACK_SPEECH_MAP;
`;
const _vmCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(_vmBlockSrc, _vmCtx);
const {
  buildRoundIntent: _buildRoundIntent,
  buildMinimalCognitiveFallback: _buildMinimalCognitiveFallback,
  renderCognitiveSpeech: _renderCognitiveSpeech,
  classifyRenderPath: _classifyRenderPath,
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
const _sfCtx = vm.createContext({ __EXPORTS: {}, TOPO_HAPPY_PATH_SPEECH: {}, getTopoHappyPathSpeech: async () => ({}) });
vm.runInContext(workerSrc.substring(_setFlagsStart, _setFlagsEnd) + `;__EXPORTS.setTopoHappyPathFlags = setTopoHappyPathFlags;`, _sfCtx);
const _setTopoHappyPathFlags = _sfCtx.__EXPORTS.setTopoHappyPathFlags;

// Extract TOPO_HAPPY_PATH_SPEECH keys
const _topoMapStart = workerSrc.indexOf("const TOPO_HAPPY_PATH_SPEECH = {");
const _topoMapEnd = workerSrc.indexOf("async function getTopoHappyPathSpeech(");
if (_topoMapStart === -1 || _topoMapEnd === -1) throw new Error("TOPO_HAPPY_PATH_SPEECH not found");
const _topoSrc = workerSrc.substring(_topoMapStart, _topoMapEnd);

// Helper: extract topo section from switch(stage) block accurately
function _getTopoSection() {
  const switchStart = workerSrc.indexOf("switch (stage) {");
  if (switchStart === -1) throw new Error("switch (stage) not found");
  const inicioCase = workerSrc.indexOf('case "inicio":', switchStart);
  if (inicioCase === -1) throw new Error('case "inicio" not found after switch');
  const inicioNomeCase = workerSrc.indexOf('case "inicio_nome":', inicioCase + 1);
  if (inicioNomeCase === -1) throw new Error('case "inicio_nome" not found after inicio');
  return workerSrc.substring(inicioCase, inicioNomeCase);
}

function _getInicioSection() {
  const switchStart = workerSrc.indexOf("switch (stage) {");
  const inicioCase = workerSrc.indexOf('case "inicio":', switchStart);
  const decisaoCase = workerSrc.indexOf('case "inicio_decisao":', inicioCase + 1);
  return workerSrc.substring(inicioCase, decisaoCase);
}

function _getDecisaoSection() {
  const switchStart = workerSrc.indexOf("switch (stage) {");
  const inicioCase = workerSrc.indexOf('case "inicio":', switchStart);
  const decisaoCase = workerSrc.indexOf('case "inicio_decisao":', inicioCase + 1);
  const progCase = workerSrc.indexOf('case "inicio_programa":', decisaoCase + 1);
  return workerSrc.substring(decisaoCase, progCase);
}

function _getProgSection() {
  const switchStart = workerSrc.indexOf("switch (stage) {");
  const inicioCase = workerSrc.indexOf('case "inicio":', switchStart);
  const decisaoCase = workerSrc.indexOf('case "inicio_decisao":', inicioCase + 1);
  const progCase = workerSrc.indexOf('case "inicio_programa":', decisaoCase + 1);
  const nomeCase = workerSrc.indexOf('case "inicio_nome":', progCase + 1);
  return workerSrc.substring(progCase, nomeCase);
}

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

function _simulateStep(st, messages) {
  const rawArr = Array.isArray(messages) ? messages : [messages];
  if (!st.__round_intent && (st.last_user_text || "").trim()) {
    st.__round_intent = _buildRoundIntent(st, st.last_user_text, rawArr);
  }
  return _renderCognitiveSpeech(st, st.fase_conversa || "inicio", rawArr.filter(Boolean));
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

// ================================================================
// SECTION A — LLM real é fonte obrigatória de fala no topo
// ================================================================
console.log("\n📦 SECTION A — LLM real é fonte obrigatória de fala");

test("A1: LLM real → fala do LLM é a fala final (inicio_programa)", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: "Oi! 😊 Que bom te ver por aqui! Eu sou a Enova e vou te ajudar com o Minha Casa Minha Vida.",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, ["Fallback mínimo"]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Enova"), "LLM response is the final speech");
  assert.ok(!result[0].includes("Fallback mínimo"), "rawArr NOT used");
});

test("A2: LLM real → renderCognitiveSpeech returns cognitivePrefix", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Oi! Tudo bem? Sou a Enova 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["qualquer fallback"]);
  assert.equal(result.length, 1);
  assert.equal(result[0], "Oi! Tudo bem? Sou a Enova 😊");
});

test("A3: LLM falha → fallback extremo mínimo via mapa (NÃO script multi-linha)", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, ["Fallback mínimo"]);
  assert.equal(result.length, 1);
  assert.ok(result[0].length < 200, "fallback is short");
});

test("A4: setTopoHappyPathFlags: cognitive_real → LLM soberano", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "cognitive_real", speech: ["Oi! Tudo bem?"] });
  assert.equal(st.__speech_arbiter_source, "llm_real");
  assert.equal(st.__cognitive_v2_takes_final, true);
  assert.ok(st.__cognitive_reply_prefix);
});

test("A5: setTopoHappyPathFlags: heuristic/fallback → NÃO produzem fala", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "heuristic_guidance", speech: ["Hmm"] });
  assert.equal(st.__speech_arbiter_source, null);
  assert.equal(st.__cognitive_v2_takes_final, false);
  assert.equal(st.__cognitive_reply_prefix, null);
});

// ================================================================
// SECTION B — Fallback extremo mínimo (curto, neutro, 1 linha)
// ================================================================
console.log("\n📦 SECTION B — Fallback extremo mínimo");

test("B1: step() no topo recebe apenas 1 mensagem curta de fallback", () => {
  // Verify: ALL step() calls in inicio/inicio_programa/inicio_decisao pass single-line fallback
  const topoSection = _getTopoSection();
  // Count step() calls
  const stepCalls = [...topoSection.matchAll(/return step\(\s*\n\s*env,/g)];
  assert.ok(stepCalls.length > 0, "step() calls exist");

  // Every step() in the topo should pass a single-element array or single string
  // Check: no step() call has more than one string literal in its messages array
  // Match: step(env, st, [\n  "...",\n  "..." (two strings = multi-line)
  const multiLineArrays = [...topoSection.matchAll(/return step\(\s*\n\s*env,\s*\n\s*(?:st|novoSt),\s*\n\s*\[\s*\n\s*"[^"]*",\s*\n\s*"/g)];
  assert.equal(multiLineArrays.length, 0, `Found ${multiLineArrays.length} step() calls with multi-line message arrays in topo — should be 0`);
});

test("B2: fallback de inicio_programa no mapa é curto e natural", () => {
  const entry = _fallbackMap.get("inicio_programa");
  assert.ok(entry, "map entry exists");
  assert.ok(entry.length < 200, "entry is short");
  assert.ok(entry.includes("Enova"), "mentions Enova");
});

test("B3: step() NÃO contém scripts de sim/não nas chamadas step() do topo", () => {
  const topoSection = _getTopoSection();
  assert.ok(!topoSection.includes('Me responde com *sim*'), "no 'Me responde com *sim*' in topo step()");
});

// ================================================================
// SECTION C — Cenários: reset + "Oi" etc.
// ================================================================
console.log("\n📦 SECTION C — Cenários de saudação/reset");

test("C1: reset + 'Oi' — LLM real → fala do LLM é a fala final", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: "Oi! 😊 Que bom te ver! Eu sou a Enova e vou te ajudar com o MCMV. Quer saber como funciona?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, ["Fallback curto"]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Enova"), "LLM response used");
  assert.ok(!result[0].includes("Fallback"), "fallback NOT used");
});

test("C2: reset + 'Oi' — LLM falha → fallback mínimo (não script)", () => {
  const st = _mkSt({
    last_user_text: "Oi",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, ["Oi! 😊 Eu sou a Enova. Posso te ajudar?"]);
  assert.equal(result.length, 1);
  assert.ok(result[0].length < 200, "fallback is minimal");
});

test("C3: 'Oi Enova' — LLM real → fala do LLM", () => {
  const st = _mkSt({
    last_user_text: "Oi Enova",
    __cognitive_reply_prefix: "Oi! 😊 Tudo bem? Eu sou a Enova, como posso te ajudar?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, ["Fallback"]);
  assert.ok(result[0].includes("Oi!"), "LLM real response");
});

test("C4: 'Oi Enova tudo bem?' — LLM real → fala do LLM (sem template)", () => {
  const st = _mkSt({
    last_user_text: "Oi Enova tudo bem?",
    __cognitive_reply_prefix: "Oi! Tudo ótimo! 😊 Eu sou a Enova e posso te ajudar com o Minha Casa Minha Vida. Quer saber como funciona?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, ["Fallback"]);
  assert.ok(result[0].includes("ótimo"), "LLM natural response");
  assert.ok(!result[0].includes("Fallback"), "fallback NOT used");
});

// ================================================================
// SECTION D — "Não, me explica?" — LLM explica primeiro
// ================================================================
console.log("\n📦 SECTION D — 'Não, me explica?'");

test("D1: 'Não, me explica?' — LLM real → LLM explica (sem script mecânico)", () => {
  const st = _mkSt({
    last_user_text: "Não, me explica?",
    __cognitive_reply_prefix: "Claro! O Minha Casa Minha Vida é um programa do governo que ajuda famílias a conquistar a casa própria. Quer seguir com a análise? 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, ["Fallback curto"]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("Minha Casa Minha Vida"), "LLM explanation");
  assert.ok(!result[0].includes("Fallback"), "no fallback");
});

test("D2: 'Não, me explica?' — LLM falha → fallback mínimo (NÃO script multi-linha)", () => {
  const st = _mkSt({
    last_user_text: "Não, me explica?",
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, ["O MCMV ajuda na entrada e reduz a parcela conforme sua renda."]);
  assert.equal(result.length, 1);
  // Fallback should be short, not the old 4-line explanation script
  assert.ok(result[0].length < 200, "fallback is minimal");
});

test("D3: explicação não puxa estado_civil cedo demais", () => {
  const st = _mkSt({
    last_user_text: "Não, me explica?",
    __cognitive_reply_prefix: "O MCMV é um programa do governo que ajuda na compra do imóvel. Quer seguir? 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _simulateStep(st, ["fallback"]);
  assert.ok(!result[0].includes("estado civil"), "no estado_civil");
  assert.ok(!result[0].includes("nome completo"), "no nome completo");
});

// ================================================================
// SECTION E — renderCognitiveSpeech/classifyRenderPath intactos
// ================================================================
console.log("\n📦 SECTION E — Árbitro soberano intacto");

test("E1: classifyRenderPath — LLM real → 'llm_real'", () => {
  const st = _mkSt({ __speech_arbiter_source: "llm_real" });
  assert.equal(_classifyRenderPath(st), "llm_real");
});

test("E2: classifyRenderPath — fallback → 'extreme_fallback'", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  assert.equal(_classifyRenderPath(st), "extreme_fallback");
});

test("E3: renderCognitiveSpeech tem exatamente 2 paths (llm_real + extreme_fallback)", () => {
  assert.ok(workerSrc.includes('arbiterSource === "llm_real"'), "llm_real path exists");
  assert.ok(workerSrc.includes('"extreme_fallback"'), "extreme_fallback path exists");
});

test("E4: Heurística NÃO produz fala final", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Heuristic text",
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _simulateStep(st, ["Fallback"]);
  assert.ok(!result[0].includes("Heuristic"), "heuristic not sovereign");
});

// ================================================================
// SECTION F — stage/gate/parser/nextStage preservados
// ================================================================
console.log("\n📦 SECTION F — Mecânico preservado");

test("F1: renderCognitiveSpeech NÃO altera stage", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa" });
  _simulateStep(st, ["Fallback"]);
  assert.equal(st.fase_conversa, "inicio_programa", "stage unchanged");
});

test("F2: renderCognitiveSpeech NÃO altera gate", () => {
  const st = _mkSt({ gate_principal: "renda_ok" });
  _simulateStep(st, ["Fallback"]);
  assert.equal(st.gate_principal, "renda_ok", "gate unchanged");
});

test("F3: setTopoHappyPathFlags preservado — fallback_mechanical → null", () => {
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
  const result = _modoHumanoRender(st, ["Oi! teste"]);
  assert.deepStrictEqual(result, ["Oi! teste"]);
});

test("G2: modo_humano=true sem manual → arr inalterado", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: false });
  const result = _modoHumanoRender(st, ["Oi! teste"]);
  assert.deepStrictEqual(result, ["Oi! teste"]);
});

test("G3: modo_humano=true com manual=true → arr transformado", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: true });
  const result = _modoHumanoRender(st, ["Oi! 😊 teste"]);
  assert.ok(result[0] !== "Oi! 😊 teste", "arr was transformed");
});

test("G4: modoHumanoRender guard exige modo_humano_manual", () => {
  assert.ok(workerSrc.includes("if (!st.modo_humano_manual) return arr;"), "manual guard exists");
});

// ================================================================
// SECTION H — _MINIMAL_FALLBACK_SPEECH_MAP atualizado
// ================================================================
console.log("\n📦 SECTION H — Fallback map");

test("H1: inicio_programa entry é natural", () => {
  const entry = _fallbackMap.get("inicio_programa");
  assert.ok(entry, "entry exists");
  assert.ok(entry.includes("Enova"), "mentions Enova");
});

test("H2: inicio entry preservado", () => {
  const entry = _fallbackMap.get("inicio");
  assert.ok(entry.includes("Oi!"), "inicio preserved");
});

test("H3: inicio_nome entry preservado", () => {
  const entry = _fallbackMap.get("inicio_nome");
  assert.ok(entry.includes("nome"), "inicio_nome preserved");
});

test("H4: estado_civil entry preservado", () => {
  const entry = _fallbackMap.get("estado_civil");
  assert.ok(entry.includes("estado civil"), "estado_civil preserved");
});

// ================================================================
// SECTION I — TOPO_HAPPY_PATH_SPEECH novas entradas
// ================================================================
console.log("\n📦 SECTION I — TOPO_HAPPY_PATH_SPEECH LLM entries");

const _requiredKeys = [
  "inicio:abertura_base",
  "inicio:reset_iniciar",
  "inicio:retomada",
  "inicio:saudacao",
  "inicio:fallback",
  "inicio_decisao:invalido",
  "inicio_decisao:continuar",
  "inicio_decisao:reset",
  "inicio_programa:first_after_reset",
  "inicio_programa:greeting_reentrada",
  "inicio_programa:ambiguous",
  "inicio_programa:nao",
  "inicio_programa:sim",
  "inicio_programa:sim_pos_explicacao",
  "inicio_programa:post_expl_confirmation"
];

for (const key of _requiredKeys) {
  test(`I: TOPO_HAPPY_PATH_SPEECH["${key}"] exists`, () => {
    assert.ok(_topoSrc.includes(`"${key}"`), `key "${key}" exists in TOPO_HAPPY_PATH_SPEECH`);
  });
}

// ================================================================
// SECTION J — Source integrity: NO multi-line scripts in step() at topo
// ================================================================
console.log("\n📦 SECTION J — Source integrity");

test("J1: getTopoHappyPathSpeech chamado antes de CADA step() no inicio", () => {
  const inicioSection = _getInicioSection();
  const stepCalls = (inicioSection.match(/return step\(/g) || []).length;
  const happyPathCalls = (inicioSection.match(/getTopoHappyPathSpeech\(/g) || []).length;
  assert.ok(happyPathCalls >= stepCalls, `${happyPathCalls} getTopoHappyPathSpeech >= ${stepCalls} step() calls`);
});

test("J2: getTopoHappyPathSpeech chamado antes de CADA step() no inicio_decisao", () => {
  const decisaoSection = _getDecisaoSection();
  const stepCalls = (decisaoSection.match(/return step\(/g) || []).length;
  const happyPathCalls = (decisaoSection.match(/getTopoHappyPathSpeech\(/g) || []).length;
  assert.ok(happyPathCalls >= stepCalls, `${happyPathCalls} getTopoHappyPathSpeech >= ${stepCalls} step() calls`);
});

test("J3: getTopoHappyPathSpeech chamado antes de CADA step() no inicio_programa", () => {
  const progSection = _getProgSection();
  const stepCalls = (progSection.match(/return step\(/g) || []).length;
  const happyPathCalls = (progSection.match(/getTopoHappyPathSpeech\(/g) || []).length;
  assert.ok(happyPathCalls >= stepCalls, `${happyPathCalls} getTopoHappyPathSpeech >= ${stepCalls} step() calls`);
});

test("J4: NÃO existe 'Me responde com *sim*' no topo", () => {
  const topoSection = _getTopoSection();
  assert.ok(!topoSection.includes("Me responde com *sim*"), "no 'Me responde com *sim*' in topo step()");
});

test("J5: NÃO existe intro multi-linha 'Eu sou a Enova 😊, assistente do programa' no topo step()", () => {
  const topoSection = _getTopoSection();
  assert.ok(!topoSection.includes("Eu sou a Enova 😊, assistente do programa"), "no multi-line intro script");
});

test("J6: NÃO existe explicação multi-linha 'Perfeito, te explico rapidinho' no step()", () => {
  const topoSection = _getTopoSection();
  assert.ok(!topoSection.includes("Perfeito, te explico rapidinho"), "no multi-line explanation script in step()");
});

test("J7: 'LLM OBRIGATÓRIO' marker em cada section do topo", () => {
  const topoSection = _getTopoSection();
  const markers = (topoSection.match(/LLM OBRIGAT/g) || []).length;
  assert.ok(markers >= 8, `Found ${markers} 'LLM OBRIGAT*RIO' markers (expected >=8)`);
});

// ================================================================
// SECTION K — rawArr NUNCA exposto ao cliente
// ================================================================
console.log("\n📦 SECTION K — rawArr NUNCA exposto");

test("K1: rawArr mecânico NÃO aparece na fala final (LLM real)", () => {
  const rawArr = ["Informe seu nome completo", "📋 Lista de documentos"];
  const st = _mkSt({
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
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null,
    fase_conversa: "inicio_nome"
  });
  st.__round_intent = _buildRoundIntent(st, "Oi", rawArr);
  const result = _renderCognitiveSpeech(st, "inicio_nome", rawArr);
  assert.ok(!result[0].includes("Informe"), "rawArr stripped");
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
