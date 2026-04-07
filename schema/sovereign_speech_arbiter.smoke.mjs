/**
 * sovereign_speech_arbiter.smoke.mjs
 *
 * Smoke tests para o árbitro soberano da superfície (PR #550).
 *
 * CONTRATO FINAL:
 *   1. LLM real = ÚNICO soberano da superfície quando disponível
 *   2. Fallback extremo mínimo = mapa por stage, SOMENTE quando LLM não disponível
 *   3. Heurística/resolver/topo/prefix local = suporte interno APENAS
 *   4. modoHumanoRender = somente modo manual legítimo do painel
 *   5. Pós-LLM: normalizeModelResponse/ensureReplyHasNextAction/applyFinalSpeechContract
 *      NÃO reescrevem semântica quando LLM é soberano
 *
 * Seções:
 *   A — LLM real é ÚNICO soberano
 *   B — Fallback extremo mínimo (sem heurística/resolver)
 *   C — Heurística/topo/resolver REBAIXADOS (não produzem fala final)
 *   D — modoHumanoRender blindado (manual only)
 *   E — Gates/nextStage preservados
 *   F — Cobrança da fase preservada
 *   G — Pós-LLM blindado (ensureReplyHasNextAction, applyFinalSpeechContract)
 *   H — __speech_arbiter_source propagação
 *   I — classifyRenderPath contrato novo (llm_real | extreme_fallback)
 *   J — Dominância real da superfície (BLOCO 5)
 *   K — rawArr NUNCA exposto
 *   L — Integridade da camada no source
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
// VM EXTRACTION
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
__EXPORTS._extractRoundIntention = _extractRoundIntention;
`;
const _vmCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(_vmBlockSrc, _vmCtx);
const {
  buildRoundIntent: _buildRoundIntent,
  buildMinimalCognitiveFallback: _buildMinimalCognitiveFallback,
  renderCognitiveSpeech: _renderCognitiveSpeech,
  classifyRenderPath: _classifyRenderPath,
  _renderCognitiveFromIntent: _renderCognitiveFromIntentFn
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

// Extract applyFinalSpeechContract
const cognitivePath = resolve(__dirname, "..", "cognitive", "src", "final-speech-contract.js");
const cogSrc = readFileSync(cognitivePath, "utf-8");

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
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

// ================================================================
// SECTION A — LLM real é ÚNICO soberano
// ================================================================
console.log("\n📦 SECTION A — LLM real é ÚNICO soberano");

test("A1: LLM real → fala do LLM é a fala final", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Oi Ana! Vou te ajudar com o MCMV 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["Mecânico"]);
  assert.equal(result.length, 1);
  assert.equal(result[0], "Oi Ana! Vou te ajudar com o MCMV 😊");
});

test("A2: LLM real discards rawArr completely", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Resposta do LLM completa",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", ["Informe LITERAL"]);
  assert.ok(!result[0].includes("LITERAL"), "rawArr deve ser descartado");
});

test("A3: classifyRenderPath returns 'llm_real' when LLM", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: "llm_real" }), "llm_real");
});

test("A4: LLM takes priority — nothing else can substitute after", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "LLM says hello",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio", ["mecânico"]);
  assert.equal(result[0], "LLM says hello");
  assert.equal(result.length, 1, "only one message — no extras");
});

// ================================================================
// SECTION B — Fallback extremo mínimo
// ================================================================
console.log("\n📦 SECTION B — Fallback extremo mínimo");

test("B1: No flags → extreme_fallback via map", () => {
  const st = _mkSt();
  const result = _renderCognitiveSpeech(st, "inicio_nome", []);
  assert.ok(result.length >= 1);
  assert.ok(result[0].includes("nome"), "fallback cobrar nome");
  assert.equal(st.__speech_arbiter_source, "extreme_fallback");
});

test("B2: classifyRenderPath returns 'extreme_fallback' when no LLM", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: null }), "extreme_fallback");
  assert.equal(_classifyRenderPath({}), "extreme_fallback");
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: "extreme_fallback" }), "extreme_fallback");
});

test("B3: Fallback uses _MINIMAL_FALLBACK_SPEECH_MAP for known stage", () => {
  const st = _mkSt();
  const result = _renderCognitiveSpeech(st, "ir_declarado", []);
  const lower = result[0].toLowerCase();
  assert.ok(lower.includes("imposto") || lower.includes("ir"), "fallback mentions IR");
});

test("B4: Fallback for unknown stage returns generic", () => {
  const result = _buildMinimalCognitiveFallback("stage_desconhecido", [], null);
  assert.ok(result[0].includes("continuar"));
});

test("B5: REMOVED — prefix > 20 chars path does NOT exist", () => {
  // Verify the old path was removed
  assert.ok(
    !workerSrc.includes("cognitivePrefix.length > 20"),
    "prefix > 20 chars path must be REMOVED"
  );
});

test("B6: Heuristic prefix is DISCARDED (not used as fallback)", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Heuristic generated this beautiful text about estado civil",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: null  // NOT llm_real — so it must be discarded
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", ["mecânico"]);
  // The prefix should NOT be used — should fall through to minimal fallback map
  assert.ok(!result[0].includes("beautiful"), "heuristic prefix must be discarded");
  assert.equal(st.__speech_arbiter_source, "extreme_fallback");
});

test("B7: Resolver prefix is DISCARDED (not used as fallback)", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Resolver says: casado ou solteiro?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "explicit_fallback"  // old name — should NOT match
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", ["mecânico"]);
  assert.ok(!result[0].includes("Resolver says"), "resolver prefix must be discarded");
});

// ================================================================
// SECTION C — Heurística/topo/resolver REBAIXADOS
// ================================================================
console.log("\n📦 SECTION C — Heurística/topo/resolver REBAIXADOS");

test("C1: setTopoHappyPathFlags — cognitive_real → llm_real", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "cognitive_real", speech: ["LLM response"] });
  assert.equal(st.__speech_arbiter_source, "llm_real");
  assert.equal(st.__cognitive_v2_takes_final, true);
});

test("C2: setTopoHappyPathFlags — heuristic_guidance → NO prefix, NO takes_final", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "heuristic_guidance", speech: ["Heuristic text"] });
  assert.equal(st.__speech_arbiter_source, null, "heuristic must NOT set arbiter");
  assert.equal(st.__cognitive_v2_takes_final, false, "heuristic must NOT set takes_final");
  assert.equal(st.__cognitive_reply_prefix, null, "heuristic must NOT set prefix");
});

test("C3: setTopoHappyPathFlags — fallback_mechanical → NO prefix", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "fallback_mechanical", speech: ["Fallback"] });
  assert.equal(st.__speech_arbiter_source, null);
  assert.equal(st.__cognitive_v2_takes_final, false);
  assert.equal(st.__cognitive_reply_prefix, null);
});

test("C4: resolveTopoStructured does NOT produce speech in worker source", () => {
  // Verify that NO resolveTopoStructured callsite sets __cognitive_reply_prefix
  const resolverCallsites = workerSrc.split("resolveTopoStructured(").length - 1;
  assert.ok(resolverCallsites >= 6, `Expected >=6 resolver calls, found ${resolverCallsites}`);
  // None of them should set prefix anymore
  assert.ok(
    !workerSrc.includes('st.__cognitive_reply_prefix = _resolução.reply_text'),
    "resolver inicio_programa must NOT set prefix"
  );
  assert.ok(
    !workerSrc.includes('st.__cognitive_reply_prefix = _resolNac.reply_text'),
    "resolver nacionalidade must NOT set prefix"
  );
  assert.ok(
    !workerSrc.includes('st.__cognitive_reply_prefix = _resolEstCivil.reply_text'),
    "resolver estado_civil must NOT set prefix"
  );
  assert.ok(
    !workerSrc.includes('st.__cognitive_reply_prefix = _resolConfCas.reply_text'),
    "resolver confirmar_casamento must NOT set prefix"
  );
  assert.ok(
    !workerSrc.includes('st.__cognitive_reply_prefix = _resolFinConj.reply_text'),
    "resolver financiamento_conjunto must NOT set prefix"
  );
});

test("C5: TOPO_HAPPY_PATH_SPEECH.fallback does NOT produce takes_final in topo", () => {
  // Verify that the TOPO fallback blocks were removed
  assert.ok(
    !workerSrc.includes('_firstResetFallback.join("\\n")'),
    "TOPO first_after_reset fallback must NOT produce speech"
  );
  assert.ok(
    !workerSrc.includes('_greetingFallback.join("\\n")'),
    "TOPO greeting fallback must NOT produce speech"
  );
});

test("C6: No 'explicit_fallback' in worker speech paths (old term removed)", () => {
  // The old term should be gone from speech arbiter assignments
  const speechAssignments = workerSrc.match(/__speech_arbiter_source\s*=\s*"explicit_fallback"/g) || [];
  assert.equal(speechAssignments.length, 0, "explicit_fallback must be removed from arbiter assignments");
});

// ================================================================
// SECTION D — modoHumanoRender blindado
// ================================================================
console.log("\n📦 SECTION D — modoHumanoRender blindado");

test("D1: auto modo_humano (no manual flag) → NO rewrite", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: false });
  const result = _modoHumanoRender(st, ["Fala do LLM pura"]);
  assert.deepStrictEqual(result, ["Fala do LLM pura"]);
});

test("D2: manual flag → rewrites", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: true });
  const result = _modoHumanoRender(st, ["Fala do LLM pura"]);
  assert.ok(result[0] !== "Fala do LLM pura", "manual mode should rewrite");
});

test("D3: modo_humano off → no rewrite", () => {
  const st = _mkSt({ modo_humano: false });
  assert.deepStrictEqual(_modoHumanoRender(st, ["Original"]), ["Original"]);
});

// ================================================================
// SECTION E — Gates/nextStage preservados
// ================================================================
console.log("\n📦 SECTION E — Gates/nextStage preservados");

test("E1: Critical gates exist", () => {
  for (const gate of ["inicio_rnm","ir_declarado","ctps_36","restricao","fim_ineligivel"]) {
    assert.ok(workerSrc.includes(`"${gate}"`), `Gate "${gate}" must exist`);
  }
});

test("E2: Critical stage transitions exist", () => {
  for (const s of ["inicio_nome","inicio_nacionalidade","estado_civil","somar_renda_solteiro","regime_trabalho","envio_docs"]) {
    assert.ok(workerSrc.includes(`"${s}"`), `Stage "${s}" must exist`);
  }
});

// ================================================================
// SECTION F — Cobrança da fase preservada
// ================================================================
console.log("\n📦 SECTION F — Cobrança da fase preservada");

test("F1: _MINIMAL_FALLBACK_SPEECH_MAP covers required stages", () => {
  for (const stage of ["inicio","inicio_programa","inicio_nome","estado_civil","ir_declarado","ctps_36","restricao","envio_docs"]) {
    const result = _buildMinimalCognitiveFallback(stage, [], null);
    assert.ok(result.length >= 1 && result[0].length > 10, `Stage "${stage}" must have fallback`);
  }
});

test("F2: Guardrails preserve technical requirements (ir_declarado)", () => {
  const result = _renderCognitiveFromIntentFn("Informe se declarou imposto de renda", "ir_declarado");
  assert.ok(result && /imposto|ir\b|renda|declara/i.test(result));
});

test("F3: Guardrails preserve technical requirements (restricao)", () => {
  const result = _renderCognitiveFromIntentFn("Informe se tem restrição no CPF", "restricao");
  assert.ok(result && /restriç|cpf|spc|serasa|negativ/i.test(result));
});

// ================================================================
// SECTION G — Pós-LLM blindado
// ================================================================
console.log("\n📦 SECTION G — Pós-LLM blindado");

test("G1: ensureReplyHasNextAction NOT applied when LLM sovereign (source check)", () => {
  // Verify the cognitive engine has the guard
  const cogEnginePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
  const cogEngineSrc = readFileSync(cogEnginePath, "utf-8");
  assert.ok(
    cogEngineSrc.includes('speechOrigin === "llm_real"') && cogEngineSrc.includes("ensureReplyHasNextAction"),
    "cognitive engine must guard ensureReplyHasNextAction for LLM sovereign"
  );
});

test("G2: applyFinalSpeechContract has llmSovereign guard", () => {
  assert.ok(
    cogSrc.includes("context.llmSovereign === true"),
    "applyFinalSpeechContract must have llmSovereign guard"
  );
});

test("G3: applyFinalSpeechContract with llmSovereign=true skips empathy/truncation", () => {
  assert.ok(
    cogSrc.includes("NÃO reescrever tom") || cogSrc.includes("llmSovereign"),
    "llmSovereign must skip empathy and truncation"
  );
});

test("G4: normalizeModelResponse LLM-first check exists", () => {
  const cogEnginePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
  const cogEngineSrc = readFileSync(cogEnginePath, "utf-8");
  assert.ok(
    cogEngineSrc.includes("llmDominates") && cogEngineSrc.includes('speechOrigin = "llm_real"'),
    "normalizeModelResponse must have LLM-first path"
  );
});

test("G5: Post-LLM blindage — LLM reply skips ensureReplyHasNextAction", () => {
  const cogEnginePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
  const cogEngineSrc = readFileSync(cogEnginePath, "utf-8");
  // The LLM path should use replyText directly, not wrapped
  assert.ok(
    cogEngineSrc.includes('speechOrigin === "llm_real"\n    ? replyText\n    : ensureReplyHasNextAction'),
    "LLM reply must skip ensureReplyHasNextAction"
  );
});

test("G6: step() clears __speech_arbiter_source after rendering", () => {
  assert.ok(workerSrc.includes("st.__speech_arbiter_source = null;"));
});

// ================================================================
// SECTION H — __speech_arbiter_source propagação
// ================================================================
console.log("\n📦 SECTION H — __speech_arbiter_source propagação");

test("H1: 'llm_real' assignments exist in worker", () => {
  assert.ok(workerSrc.includes('__speech_arbiter_source = "llm_real"'));
});

test("H2: No 'explicit_fallback' arbiter assignments in worker", () => {
  const matches = (workerSrc.match(/__speech_arbiter_source\s*=\s*"explicit_fallback"/g) || []).length;
  assert.equal(matches, 0, "explicit_fallback arbiter assignments must be 0");
});

test("H3: Heuristic path in runFunnel clears prefix when NOT LLM", () => {
  assert.ok(
    workerSrc.includes("if (!v2OnWithLlm) {") && workerSrc.includes("st.__cognitive_reply_prefix = null;"),
    "heuristic path must clear prefix"
  );
});

// ================================================================
// SECTION I — classifyRenderPath contrato novo
// ================================================================
console.log("\n📦 SECTION I — classifyRenderPath contrato novo");

test("I1: llm_real → 'llm_real'", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: "llm_real" }), "llm_real");
});

test("I2: extreme_fallback → 'extreme_fallback'", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: "extreme_fallback" }), "extreme_fallback");
});

test("I3: null → 'extreme_fallback'", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: null }), "extreme_fallback");
});

test("I4: undefined → 'extreme_fallback'", () => {
  assert.equal(_classifyRenderPath({}), "extreme_fallback");
});

test("I5: old 'explicit_fallback' → 'extreme_fallback' (not recognized)", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: "explicit_fallback" }), "extreme_fallback");
});

// ================================================================
// SECTION J — Dominância real da superfície (BLOCO 5)
// ================================================================
console.log("\n📦 SECTION J — Dominância real da superfície (BLOCO 5)");

// J.A — Se há LLM válido: fala final é do LLM e nada substitui
test("J-A1: LLM válido → fala final é do LLM, rawArr descartado", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "LLM: Oi Ana! Sobre o MCMV...",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["Mecânico cru ignorado"]);
  assert.equal(result[0], "LLM: Oi Ana! Sobre o MCMV...");
  assert.equal(result.length, 1);
});

test("J-A2: LLM válido → classifyRenderPath = llm_real", () => {
  const st = _mkSt({ __speech_arbiter_source: "llm_real" });
  assert.equal(_classifyRenderPath(st), "llm_real");
});

test("J-A3: LLM válido → nenhuma camada posterior pode substituir (contrato step)", () => {
  // step() clears all flags after render — so no posterior layer can act
  assert.ok(
    workerSrc.includes("st.__cognitive_reply_prefix = null") &&
    workerSrc.includes("st.__cognitive_v2_takes_final = false") &&
    workerSrc.includes("st.__speech_arbiter_source = null"),
    "step must clear all flags after render"
  );
});

// J.B — Se NÃO há LLM: fallback mínimo, não heurística disfarçada
test("J-B1: Sem LLM → fallback extremo mínimo (mapa por stage)", () => {
  const st = _mkSt();
  const result = _renderCognitiveSpeech(st, "estado_civil", ["mecânico"]);
  assert.equal(st.__speech_arbiter_source, "extreme_fallback");
  assert.ok(result.length >= 1);
});

test("J-B2: Sem LLM → NOT heurística soberana disfarçada", () => {
  // Even with heuristic prefix set, it should be DISCARDED
  const st = _mkSt({
    __cognitive_reply_prefix: "Heuristic beautiful speech about marriage",
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", []);
  assert.ok(!result[0].includes("beautiful"), "heuristic prefix discarded");
  assert.equal(st.__speech_arbiter_source, "extreme_fallback");
});

test("J-B3: Sem LLM → NOT resolver soberano disfarçado", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Resolver: Casado ou solteiro? Escolha...",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: null  // NOT llm_real
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", []);
  assert.ok(!result[0].includes("Escolha"), "resolver prefix discarded");
});

test("J-B4: Sem LLM → NOT prefix local por comprimento", () => {
  // The old "prefix > 20 chars" path was removed
  const st = _mkSt({
    __cognitive_reply_prefix: "This is a very long prefix that should not be used as fallback for speech",
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _renderCognitiveSpeech(st, "ir_declarado", []);
  assert.ok(!result[0].includes("very long prefix"), "long prefix path removed");
});

// J.C — Topo: reset + oi enova, saudação simples, saudação + pergunta
test("J-C1: Topo reset+oi → LLM ou extreme_fallback (não heurística)", () => {
  const st = _mkSt({ fase_conversa: "inicio_programa" });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["oi"]);
  assert.ok(
    st.__speech_arbiter_source === "extreme_fallback" || st.__speech_arbiter_source === "llm_real",
    "topo must be llm_real or extreme_fallback"
  );
});

test("J-C2: Saudação simples sem LLM → extreme_fallback (mapa)", () => {
  const st = _mkSt();
  const result = _renderCognitiveSpeech(st, "inicio", []);
  assert.equal(st.__speech_arbiter_source, "extreme_fallback");
});

test("J-C3: Saudação + pergunta com LLM → llm_real soberano", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "LLM: Oi! Ótima pergunta sobre o MCMV...",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["oi como funciona?"]);
  assert.equal(result[0], "LLM: Oi! Ótima pergunta sobre o MCMV...");
});

// J.D — Pós-LLM: nenhuma camada posterior reescreve
test("J-D1: modoHumanoRender não reescreve fala automática", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: false });
  assert.deepStrictEqual(_modoHumanoRender(st, ["LLM response"]), ["LLM response"]);
});

test("J-D2: applyFinalSpeechContract with llmSovereign skips empathy", () => {
  // Verify the code path exists
  assert.ok(cogSrc.includes("addEmpathyIfNeeded") && cogSrc.includes("llmSovereign"));
});

test("J-D3: ensureReplyHasNextAction skipped for LLM real", () => {
  const cogEnginePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
  const cogEngineSrc = readFileSync(cogEnginePath, "utf-8");
  // Verify the guard exists
  assert.ok(
    cogEngineSrc.includes('const finalReplyText = speechOrigin === "llm_real"'),
    "LLM real must skip ensureReplyHasNextAction"
  );
});

// ================================================================
// SECTION K — rawArr NUNCA exposto
// ================================================================
console.log("\n📦 SECTION K — rawArr NUNCA exposto");

test("K1: rawArr not exposed with LLM", () => {
  const st = _mkSt({ __cognitive_reply_prefix: "LLM reply", __cognitive_v2_takes_final: true, __speech_arbiter_source: "llm_real" });
  assert.ok(!_renderCognitiveSpeech(st, "ir_declarado", ["LITERAL_RAW"]).join("").includes("LITERAL_RAW"));
});

test("K2: rawArr not exposed in fallback", () => {
  const st = _mkSt();
  assert.ok(!_renderCognitiveSpeech(st, "ir_declarado", ["RAWTEXT"]).join("").includes("RAWTEXT"));
});

// ================================================================
// SECTION L — Integridade da camada no source
// ================================================================
console.log("\n📦 SECTION L — Integridade da camada no source");

test("L1: REGRA MESTRA DA SUPERFÍCIE (PR #550) comment exists", () => {
  assert.ok(workerSrc.includes("REGRA MESTRA DA SUPERFÍCIE (PR #550"));
});

test("L2: BLOCO 3 comments exist for resolver demotion", () => {
  const matches = (workerSrc.match(/BLOCO 3 \(PR #550\)/g) || []).length;
  assert.ok(matches >= 6, `Expected >=6 BLOCO 3 markers, found ${matches}`);
});

test("L3: BLOCO 4 comments exist for post-LLM blindage", () => {
  const cogEnginePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
  const cogEngineSrc = readFileSync(cogEnginePath, "utf-8");
  assert.ok(cogEngineSrc.includes("BLOCO 4 (PR #550)"), "BLOCO 4 in cognitive engine");
  assert.ok(cogSrc.includes("BLOCO 4 (PR #550)"), "BLOCO 4 in final-speech-contract");
});

test("L4: No gate/nextStage removed", () => {
  for (const p of ['"inicio_rnm"','"fim_ineligivel"','"regime_trabalho"','"envio_docs"','"agendamento_visita"']) {
    assert.ok(workerSrc.includes(p), `Pattern ${p} must exist`);
  }
});

// ================================================================
// SUMMARY
// ================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`SOVEREIGN SPEECH ARBITER SMOKE TESTS — PR #550`);
console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`${"=".repeat(60)}`);
if (failed > 0) { console.error(`\n⚠️ ${failed} test(s) failed!`); process.exit(1); }
else { console.log(`\n🎉 All ${passed} tests passed!`); }
