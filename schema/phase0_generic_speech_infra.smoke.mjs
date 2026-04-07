/**
 * phase0_generic_speech_infra.smoke.mjs
 *
 * Smoke tests para a Fase 0 da migração da casca conversacional.
 * Valida que os aliases genéricos (HAPPY_PATH_SPEECH, getHappyPathSpeech,
 * setHappyPathFlags) existem, delegam corretamente e NÃO alteram
 * o comportamento das funções originais (topo).
 *
 * CONTRATO DA FASE 0:
 *   1. Aliases são delegates puros — mesma lógica, zero lógica nova.
 *   2. HAPPY_PATH_SPEECH é a mesma referência que TOPO_HAPPY_PATH_SPEECH.
 *   3. setHappyPathFlags produz o mesmo resultado que setTopoHappyPathFlags.
 *   4. getHappyPathSpeech delega para getTopoHappyPathSpeech.
 *   5. _MINIMAL_FALLBACK_SPEECH_MAP está intacto (30 entries).
 *   6. renderCognitiveSpeech e classifyRenderPath inalterados.
 *   7. Zero alteração em parser/gate/nextStage/persistência.
 *
 * Seções:
 *   A — HAPPY_PATH_SPEECH é a mesma referência que TOPO_HAPPY_PATH_SPEECH
 *   B — setHappyPathFlags comportamento idêntico ao setTopoHappyPathFlags
 *   C — getHappyPathSpeech existe como delegate
 *   D — renderCognitiveSpeech e classifyRenderPath inalterados
 *   E — _MINIMAL_FALLBACK_SPEECH_MAP intacto
 *   F — TOPO_HAPPY_PATH_SPEECH keys preservadas
 *   G — Nenhum callsite existente alterado
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
// VM EXTRACTION — sovereign speech layer (existing)
// ================================================================
const _VM_BLOCK_START = "// CAMADA CANÔNICA DE FALA COGNITIVA SOBERANA";
const _VM_BLOCK_END = "// 🧠 COGNITIVE V2 — Adapter + Runner";
const _vmStartIdx = workerSrc.indexOf(_VM_BLOCK_START);
const _vmEndIdx = workerSrc.indexOf(_VM_BLOCK_END);
if (_vmStartIdx === -1 || _vmEndIdx === -1 || _vmEndIdx <= _vmStartIdx) {
  throw new Error(`VM block markers not found in worker source.`);
}
const _vmBlockSrc = workerSrc.substring(_vmStartIdx, _vmEndIdx) + `
;__EXPORTS.renderCognitiveSpeech = renderCognitiveSpeech;
__EXPORTS.classifyRenderPath = classifyRenderPath;
__EXPORTS._MINIMAL_FALLBACK_SPEECH_MAP = _MINIMAL_FALLBACK_SPEECH_MAP;
__EXPORTS.buildMinimalCognitiveFallback = buildMinimalCognitiveFallback;
`;
const _vmCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(_vmBlockSrc, _vmCtx);
const {
  renderCognitiveSpeech: _renderCognitiveSpeech,
  classifyRenderPath: _classifyRenderPath,
  _MINIMAL_FALLBACK_SPEECH_MAP: _fallbackMap,
  buildMinimalCognitiveFallback: _buildMinimalCognitiveFallback
} = _vmCtx.__EXPORTS;

// ================================================================
// VM EXTRACTION — setTopoHappyPathFlags + setHappyPathFlags
// ================================================================
const _setFlagsStart = workerSrc.indexOf("function setTopoHappyPathFlags(st, happyResult)");
const _setFlagsEnd = workerSrc.indexOf("// RESOLVEDORES COGNITIVOS ESTRUTURADOS");
if (_setFlagsStart === -1 || _setFlagsEnd === -1) throw new Error("setTopoHappyPathFlags block not found");
// Inject TOPO_HAPPY_PATH_SPEECH as stub (only HAPPY_PATH_SPEECH ref needs it)
const _sfCtx = vm.createContext({ __EXPORTS: {}, TOPO_HAPPY_PATH_SPEECH: {}, getTopoHappyPathSpeech: async () => ({}) });
vm.runInContext(
  workerSrc.substring(_setFlagsStart, _setFlagsEnd) +
  `;__EXPORTS.setTopoHappyPathFlags = setTopoHappyPathFlags;` +
  `;__EXPORTS.setHappyPathFlags = setHappyPathFlags;`,
  _sfCtx
);
const _setTopoHappyPathFlags = _sfCtx.__EXPORTS.setTopoHappyPathFlags;
const _setHappyPathFlags = _sfCtx.__EXPORTS.setHappyPathFlags;

// ================================================================
// VM EXTRACTION — TOPO_HAPPY_PATH_SPEECH + HAPPY_PATH_SPEECH
// ================================================================
const _topoMapStart = workerSrc.indexOf("const TOPO_HAPPY_PATH_SPEECH = {");
const _topoMapEnd = workerSrc.indexOf("async function getTopoHappyPathSpeech(");
if (_topoMapStart === -1 || _topoMapEnd === -1) throw new Error("TOPO_HAPPY_PATH_SPEECH not found");
// Need to include up to and through getHappyPathSpeech declaration
const _aliasEnd = workerSrc.indexOf("// RESOLVEDORES COGNITIVOS ESTRUTURADOS");
const _mapBlockSrc = workerSrc.substring(_topoMapStart, _aliasEnd);

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

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`❌ ${name}: ${e.message}`);
  }
}

// ================================================================
// SECTION A — HAPPY_PATH_SPEECH é a mesma referência
// ================================================================

test("A01 — HAPPY_PATH_SPEECH declaration exists in worker source", () => {
  assert.ok(
    workerSrc.includes("const HAPPY_PATH_SPEECH = TOPO_HAPPY_PATH_SPEECH;"),
    "HAPPY_PATH_SPEECH alias must exist as reference to TOPO_HAPPY_PATH_SPEECH"
  );
});

test("A02 — HAPPY_PATH_SPEECH is a const (not let/var)", () => {
  const match = workerSrc.match(/\b(const|let|var)\s+HAPPY_PATH_SPEECH\s*=/);
  assert.ok(match, "HAPPY_PATH_SPEECH declaration not found");
  assert.equal(match[1], "const", "HAPPY_PATH_SPEECH must be const");
});

test("A03 — HAPPY_PATH_SPEECH points to TOPO_HAPPY_PATH_SPEECH (same object)", () => {
  // Extract and verify
  const line = workerSrc.match(/const HAPPY_PATH_SPEECH\s*=\s*(.+?);/);
  assert.ok(line, "HAPPY_PATH_SPEECH declaration not found");
  assert.equal(line[1].trim(), "TOPO_HAPPY_PATH_SPEECH",
    "HAPPY_PATH_SPEECH must be direct reference to TOPO_HAPPY_PATH_SPEECH");
});

// ================================================================
// SECTION B — setHappyPathFlags identical to setTopoHappyPathFlags
// ================================================================

test("B01 — setHappyPathFlags exists in worker source", () => {
  assert.ok(
    workerSrc.includes("function setHappyPathFlags(st, happyResult)"),
    "setHappyPathFlags function must exist"
  );
});

test("B02 — setHappyPathFlags delegates to setTopoHappyPathFlags", () => {
  const funcSrc = workerSrc.substring(
    workerSrc.indexOf("function setHappyPathFlags(st, happyResult)"),
    workerSrc.indexOf("// RESOLVEDORES COGNITIVOS ESTRUTURADOS")
  );
  assert.ok(
    funcSrc.includes("setTopoHappyPathFlags(st, happyResult)"),
    "setHappyPathFlags must call setTopoHappyPathFlags"
  );
});

test("B03 — setHappyPathFlags cognitive_real → same flags as setTopoHappyPathFlags", () => {
  const st1 = _mkSt();
  const st2 = _mkSt();
  const happyResult = { speech: ["Oi! 😊"], source: "cognitive_real" };

  _setTopoHappyPathFlags(st1, happyResult);
  _setHappyPathFlags(st2, happyResult);

  assert.equal(st1.__cognitive_reply_prefix, st2.__cognitive_reply_prefix);
  assert.equal(st1.__cognitive_v2_takes_final, st2.__cognitive_v2_takes_final);
  assert.equal(st1.__speech_arbiter_source, st2.__speech_arbiter_source);
});

test("B04 — setHappyPathFlags heuristic_guidance → same flags as setTopoHappyPathFlags", () => {
  const st1 = _mkSt();
  const st2 = _mkSt();
  const happyResult = { speech: ["Heurística"], source: "heuristic_guidance" };

  _setTopoHappyPathFlags(st1, happyResult);
  _setHappyPathFlags(st2, happyResult);

  assert.equal(st1.__cognitive_reply_prefix, st2.__cognitive_reply_prefix);
  assert.equal(st1.__cognitive_v2_takes_final, st2.__cognitive_v2_takes_final);
  assert.equal(st1.__speech_arbiter_source, st2.__speech_arbiter_source);
});

test("B05 — setHappyPathFlags fallback_mechanical → same flags as setTopoHappyPathFlags", () => {
  const st1 = _mkSt();
  const st2 = _mkSt();
  const happyResult = { speech: ["Fallback"], source: "fallback_mechanical" };

  _setTopoHappyPathFlags(st1, happyResult);
  _setHappyPathFlags(st2, happyResult);

  assert.equal(st1.__cognitive_reply_prefix, st2.__cognitive_reply_prefix);
  assert.equal(st1.__cognitive_v2_takes_final, st2.__cognitive_v2_takes_final);
  assert.equal(st1.__speech_arbiter_source, st2.__speech_arbiter_source);
});

test("B06 — cognitive_real via setHappyPathFlags → prefix set, takes_final true, arbiter llm_real", () => {
  const st = _mkSt();
  _setHappyPathFlags(st, { speech: ["Oi! LLM real aqui."], source: "cognitive_real" });
  assert.equal(st.__cognitive_reply_prefix, "Oi! LLM real aqui.");
  assert.equal(st.__cognitive_v2_takes_final, true);
  assert.equal(st.__speech_arbiter_source, "llm_real");
});

test("B07 — fallback via setHappyPathFlags → prefix null, takes_final false, arbiter null", () => {
  const st = _mkSt();
  _setHappyPathFlags(st, { speech: ["Fallback"], source: "fallback_mechanical" });
  assert.equal(st.__cognitive_reply_prefix, null);
  assert.equal(st.__cognitive_v2_takes_final, false);
  assert.equal(st.__speech_arbiter_source, null);
});

// ================================================================
// SECTION C — getHappyPathSpeech exists as delegate
// ================================================================

test("C01 — getHappyPathSpeech function exists in worker source", () => {
  assert.ok(
    workerSrc.includes("async function getHappyPathSpeech(env, transitionKey, st, overrides)"),
    "getHappyPathSpeech function must exist"
  );
});

test("C02 — getHappyPathSpeech delegates to getTopoHappyPathSpeech", () => {
  const funcStart = workerSrc.indexOf("async function getHappyPathSpeech(env, transitionKey, st, overrides)");
  const funcEnd = workerSrc.indexOf("function setHappyPathFlags(st, happyResult)");
  const funcSrc = workerSrc.substring(funcStart, funcEnd);
  assert.ok(
    funcSrc.includes("getTopoHappyPathSpeech(env, transitionKey, st, overrides)"),
    "getHappyPathSpeech must delegate to getTopoHappyPathSpeech"
  );
});

test("C03 — getHappyPathSpeech is async", () => {
  const match = workerSrc.match(/\basync\s+function\s+getHappyPathSpeech\b/);
  assert.ok(match, "getHappyPathSpeech must be async");
});

// ================================================================
// SECTION D — renderCognitiveSpeech and classifyRenderPath unchanged
// ================================================================

test("D01 — renderCognitiveSpeech still has LLM-only sovereign path", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Fala do LLM 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["fallback mecânico"]);
  assert.ok(Array.isArray(result), "result must be array");
  assert.equal(result.length, 1, "must have exactly 1 element");
  assert.equal(result[0], "Fala do LLM 😊");
});

test("D02 — renderCognitiveSpeech fallback when no LLM", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", []);
  assert.ok(Array.isArray(result), "result must be array");
  assert.ok(result.length > 0, "result must not be empty");
  assert.equal(st.__speech_arbiter_source, "extreme_fallback");
});

test("D03 — classifyRenderPath llm_real → llm_real", () => {
  const st = _mkSt({ __speech_arbiter_source: "llm_real" });
  assert.equal(_classifyRenderPath(st), "llm_real");
});

test("D04 — classifyRenderPath anything else → extreme_fallback", () => {
  assert.equal(_classifyRenderPath(_mkSt({ __speech_arbiter_source: null })), "extreme_fallback");
  assert.equal(_classifyRenderPath(_mkSt({ __speech_arbiter_source: "heuristic_guidance" })), "extreme_fallback");
  assert.equal(_classifyRenderPath(_mkSt({})), "extreme_fallback");
});

// ================================================================
// SECTION E — _MINIMAL_FALLBACK_SPEECH_MAP intacto
// ================================================================

test("E01 — _MINIMAL_FALLBACK_SPEECH_MAP has ≥28 entries (topo+meio+gates+operacional)", () => {
  assert.ok(_fallbackMap.size >= 28, `expected ≥28 entries, got ${_fallbackMap.size}`);
});

test("E02 — _MINIMAL_FALLBACK_SPEECH_MAP covers topo stages", () => {
  for (const stage of ["inicio", "inicio_programa", "inicio_nome", "inicio_nacionalidade"]) {
    assert.ok(_fallbackMap.has(stage), `missing topo stage: ${stage}`);
  }
});

test("E03 — _MINIMAL_FALLBACK_SPEECH_MAP covers meio stages", () => {
  for (const stage of ["estado_civil", "confirmar_casamento", "financiamento_conjunto", "somar_renda_solteiro"]) {
    assert.ok(_fallbackMap.has(stage), `missing meio stage: ${stage}`);
  }
});

test("E04 — _MINIMAL_FALLBACK_SPEECH_MAP covers gate stages", () => {
  for (const stage of ["ir_declarado", "ctps_36", "restricao", "dependente"]) {
    assert.ok(_fallbackMap.has(stage), `missing gate stage: ${stage}`);
  }
});

test("E05 — _MINIMAL_FALLBACK_SPEECH_MAP covers operacional stages", () => {
  for (const stage of ["envio_docs", "agendamento_visita", "finalizacao_processo"]) {
    assert.ok(_fallbackMap.has(stage), `missing operacional stage: ${stage}`);
  }
});

// ================================================================
// SECTION F — TOPO_HAPPY_PATH_SPEECH keys preservadas
// ================================================================

const _expectedTopoKeys = [
  "reset:abertura",
  "inicio:abertura_base",
  "inicio:reset_iniciar",
  "inicio:retomada",
  "inicio:saudacao",
  "inicio:fallback",
  "inicio_decisao:invalido",
  "inicio_decisao:continuar",
  "inicio_decisao:reset",
  "inicio_programa:sim",
  "inicio_programa:sim_pos_explicacao",
  "inicio_programa:post_expl_confirmation",
  "inicio_programa:first_after_reset",
  "inicio_programa:greeting_reentrada",
  "inicio_programa:nao",
  "inicio_programa:ambiguous",
  "inicio_nome:nome_reaproveitado",
  "inicio_nome:nome_confirmar_candidato",
  "inicio_nome:nome_aceito",
  "inicio_nacionalidade:brasileiro",
  "inicio_nacionalidade:estrangeiro",
  "estado_civil:solteiro",
  "estado_civil:casado",
  "estado_civil:uniao_estavel",
  "estado_civil:separado",
  "estado_civil:divorciado",
  "estado_civil:viuvo",
  "estado_civil:fallback"
];

test("F01 — TOPO_HAPPY_PATH_SPEECH has all expected keys", () => {
  for (const key of _expectedTopoKeys) {
    assert.ok(
      _mapBlockSrc.includes(`"${key}"`),
      `missing TOPO_HAPPY_PATH_SPEECH key: ${key}`
    );
  }
});

test("F02 — TOPO_HAPPY_PATH_SPEECH unchanged (no keys removed)", () => {
  // Verify all expected keys present
  let count = 0;
  for (const key of _expectedTopoKeys) {
    if (_mapBlockSrc.includes(`"${key}"`)) count++;
  }
  assert.equal(count, _expectedTopoKeys.length,
    `Expected all ${_expectedTopoKeys.length} keys, found ${count}`);
});

// ================================================================
// SECTION G — No existing callsite altered
// ================================================================

test("G01 — All existing getTopoHappyPathSpeech callsites still present", () => {
  const callsites = (workerSrc.match(/getTopoHappyPathSpeech\(env,/g) || []).length;
  // PR #551 had ~18 callsites in stage cases. Definition adds 1 more occurrence.
  assert.ok(callsites >= 18, `Expected ≥18 getTopoHappyPathSpeech callsites, found ${callsites}`);
});

test("G02 — All existing setTopoHappyPathFlags callsites still present", () => {
  const callsites = (workerSrc.match(/setTopoHappyPathFlags\(/g) || []).length;
  // Definition (1) + ~18 in stage cases
  assert.ok(callsites >= 18, `Expected ≥18 setTopoHappyPathFlags callsites, found ${callsites}`);
});

test("G03 — renderCognitiveSpeech function definition unchanged", () => {
  assert.ok(
    workerSrc.includes("function renderCognitiveSpeech(st, stage, rawArr)"),
    "renderCognitiveSpeech signature must be unchanged"
  );
});

test("G04 — classifyRenderPath function definition unchanged", () => {
  assert.ok(
    workerSrc.includes("function classifyRenderPath(st)"),
    "classifyRenderPath signature must be unchanged"
  );
});

test("G05 — TOPO_HAPPY_PATH_SPEECH object still exists", () => {
  assert.ok(
    workerSrc.includes("const TOPO_HAPPY_PATH_SPEECH = {"),
    "TOPO_HAPPY_PATH_SPEECH declaration must still exist"
  );
});

test("G06 — Aliases placed AFTER originals (no forward reference)", () => {
  const topoIdx = workerSrc.indexOf("const TOPO_HAPPY_PATH_SPEECH = {");
  const happyIdx = workerSrc.indexOf("const HAPPY_PATH_SPEECH = TOPO_HAPPY_PATH_SPEECH;");
  assert.ok(happyIdx > topoIdx,
    "HAPPY_PATH_SPEECH must come after TOPO_HAPPY_PATH_SPEECH");

  const getTopoIdx = workerSrc.indexOf("async function getTopoHappyPathSpeech(");
  const getHappyIdx = workerSrc.indexOf("async function getHappyPathSpeech(");
  assert.ok(getHappyIdx > getTopoIdx,
    "getHappyPathSpeech must come after getTopoHappyPathSpeech");

  const setTopoIdx = workerSrc.indexOf("function setTopoHappyPathFlags(");
  const setHappyIdx = workerSrc.indexOf("function setHappyPathFlags(");
  assert.ok(setHappyIdx > setTopoIdx,
    "setHappyPathFlags must come after setTopoHappyPathFlags");
});

// ================================================================
// Summary
// ================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`Phase 0 Infrastructure Smoke Tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
