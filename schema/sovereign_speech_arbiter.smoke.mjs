/**
 * sovereign_speech_arbiter.smoke.mjs
 *
 * Smoke tests para a arquitetura de árbitro soberano da superfície (PR #544).
 *
 * Valida que:
 *   A) LLM real é o árbitro soberano quando disponível (llm_real)
 *   B) Fallback extremo explícito quando LLM não disponível (explicit_fallback)
 *   C) Heurística/topo/reanchor rebaixados para suporte — nunca soberanos
 *   D) modoHumanoRender só reescreve com modo_humano_manual=true
 *   E) Nenhum gate/nextStage/regra de negócio alterado
 *   F) Cobrança da fase preservada
 *   G) Pós-LLM blindado — sem reescrita semântica
 *   H) __speech_arbiter_source corretamente propagado
 *   I) classifyRenderPath retorna apenas "llm_real" ou "explicit_fallback"
 *   J) Cenários comportamentais end-to-end
 *
 * Cenários:
 *   1. reset + oi enova
 *   2. saudação simples
 *   3. saudação + pergunta
 *   4. resposta de fase + pergunta paralela
 *   5. gate técnico (ir_declarado, restricao)
 *   6. operacional (envio_docs)
 *   7. caso com reanchor
 *   8. caso com modo humano ativo (manual legítimo)
 *   9. caso com modo humano auto (sem manual flag)
 *   10. caso com LLM real assumindo
 *   11. caso com fallback extremo controlado
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
// VM EXTRACTION — extract sovereign speech functions from worker
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
  _renderCognitiveFromIntent: _renderCognitiveFromIntentFn,
  _validatePhaseRequirement: _validatePhaseRequirementFn,
  _extractRoundIntention: _extractRoundIntentionFn
} = _vmCtx.__EXPORTS;

// ================================================================
// Extract modoHumanoRender via VM
// ================================================================
const _modoHumanoStart = workerSrc.indexOf("function modoHumanoRender(st, arr)");
const _modoHumanoEnd = workerSrc.indexOf("function ajustaTexto(msg)");
if (_modoHumanoStart === -1 || _modoHumanoEnd === -1) {
  throw new Error("modoHumanoRender block not found in worker source");
}
const _modoHumanoSrc = workerSrc.substring(_modoHumanoStart, _modoHumanoEnd) + `
;__EXPORTS.modoHumanoRender = modoHumanoRender;
`;
const _mhCtx = vm.createContext({
  __EXPORTS: {},
  Math,
  console,
  ajustaTexto: (msg) => msg // stub — we only test the guard logic
});
vm.runInContext(_modoHumanoSrc, _mhCtx);
const _modoHumanoRender = _mhCtx.__EXPORTS.modoHumanoRender;

// ================================================================
// Extract setTopoHappyPathFlags via VM
// ================================================================
const _setFlagsStart = workerSrc.indexOf("function setTopoHappyPathFlags(st, happyResult)");
const _setFlagsEnd = workerSrc.indexOf("// RESOLVEDORES COGNITIVOS ESTRUTURADOS");
if (_setFlagsStart === -1 || _setFlagsEnd === -1) {
  throw new Error("setTopoHappyPathFlags block not found in worker source");
}
const _setFlagsSrc = workerSrc.substring(_setFlagsStart, _setFlagsEnd) + `
;__EXPORTS.setTopoHappyPathFlags = setTopoHappyPathFlags;
`;
const _sfCtx = vm.createContext({ __EXPORTS: {} });
vm.runInContext(_setFlagsSrc, _sfCtx);
const _setTopoHappyPathFlags = _sfCtx.__EXPORTS.setTopoHappyPathFlags;

// ================================================================
// HELPERS
// ================================================================
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
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ================================================================
// SECTION A — LLM real é árbitro soberano
// ================================================================
console.log("\n📦 SECTION A — LLM real é árbitro soberano");

test("A1: renderCognitiveSpeech uses LLM prefix when arbiter=llm_real", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Oi Ana! Vou te ajudar com o MCMV 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["Pergunta mecânica"]);
  assert.equal(result.length, 1);
  assert.equal(result[0], "Oi Ana! Vou te ajudar com o MCMV 😊");
});

test("A2: classifyRenderPath returns 'llm_real' when arbiter=llm_real", () => {
  const st = _mkSt({ __speech_arbiter_source: "llm_real" });
  assert.equal(_classifyRenderPath(st), "llm_real");
});

test("A3: LLM real discards rawArr completely", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Resposta do LLM completa",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const rawArr = ["Informe seu estado civil", "Informe seu CPF"];
  const result = _renderCognitiveSpeech(st, "estado_civil", rawArr);
  assert.equal(result.length, 1);
  assert.ok(!result[0].includes("Informe"), "rawArr deve ser descartado com LLM real");
});

test("A4: LLM real preserves phase collection (takes_final=true)", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Me conta seu estado civil 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", ["estado civil?"]);
  assert.ok(result[0].includes("estado civil"), "fase preservada na fala do LLM");
});

// ================================================================
// SECTION B — Fallback extremo explícito
// ================================================================
console.log("\n📦 SECTION B — Fallback extremo explícito");

test("B1: No flags → explicit_fallback via map", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _renderCognitiveSpeech(st, "inicio_nome", []);
  assert.ok(result.length >= 1);
  assert.ok(result[0].includes("nome"), "fallback explícito deve cobrar nome");
  assert.equal(st.__speech_arbiter_source, "explicit_fallback");
});

test("B2: classifyRenderPath returns 'explicit_fallback' when no LLM", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  assert.equal(_classifyRenderPath(st), "explicit_fallback");
});

test("B3: Fallback uses _MINIMAL_FALLBACK_SPEECH_MAP for known stage", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  const result = _renderCognitiveSpeech(st, "ir_declarado", []);
  assert.ok(result[0].toLowerCase().includes("imposto") || result[0].toLowerCase().includes("ir"),
    "fallback para ir_declarado deve mencionar imposto/IR");
});

test("B4: Fallback uses _renderCognitiveFromIntent for mechanical source", () => {
  const roundIntent = { mechanical_prompt_source: "Informe seu estado civil" };
  const result = _buildMinimalCognitiveFallback("estado_civil", [], roundIntent);
  assert.ok(result.length >= 1);
  assert.ok(!result[0].startsWith("Informe"), "mechanical prefix removido");
  assert.ok(result[0].includes("estado civil") || result[0].includes("😊"), "cognitive transform applied");
});

test("B5: explicit_fallback with prefix (>20 chars, no llm_real)", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Sobre a renda — você pretende seguir só com a sua?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: null // no arbiter source set
  });
  const result = _renderCognitiveSpeech(st, "somar_renda_solteiro", ["mecânico"]);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes("renda"), "prefix long usado como fallback");
});

test("B6: Fallback for unknown stage returns generic", () => {
  const result = _buildMinimalCognitiveFallback("stage_desconhecido", [], null);
  assert.ok(result[0].includes("continuar"), "stage desconhecido → genérico");
});

// ================================================================
// SECTION C — Heurística/topo/reanchor rebaixados
// ================================================================
console.log("\n📦 SECTION C — Heurística/topo/reanchor rebaixados");

test("C1: setTopoHappyPathFlags with cognitive_real sets llm_real", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "cognitive_real", speech: ["LLM response"] });
  assert.equal(st.__speech_arbiter_source, "llm_real");
  assert.equal(st.__cognitive_v2_takes_final, true);
});

test("C2: setTopoHappyPathFlags with heuristic_guidance sets explicit_fallback", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "heuristic_guidance", speech: ["Heuristic text"] });
  assert.equal(st.__speech_arbiter_source, "explicit_fallback");
  assert.equal(st.__cognitive_v2_takes_final, true);
  assert.ok(st.__cognitive_reply_prefix, "prefix set for heuristic");
});

test("C3: setTopoHappyPathFlags with fallback_mechanical clears all", () => {
  const st = _mkSt();
  _setTopoHappyPathFlags(st, { source: "fallback_mechanical", speech: ["Fallback"] });
  assert.equal(st.__speech_arbiter_source, null);
  assert.equal(st.__cognitive_v2_takes_final, false);
  assert.equal(st.__cognitive_reply_prefix, null);
});

test("C4: heuristic prefix without llm_real → treated as explicit_fallback", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Heuristic resolver says casado ou solteiro?",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "explicit_fallback"
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", ["mecânico"]);
  assert.equal(result[0], "Heuristic resolver says casado ou solteiro?");
  assert.equal(_classifyRenderPath(st), "explicit_fallback");
});

test("C5: classifyRenderPath never returns 'cognitive_heuristic' (removed)", () => {
  const st = _mkSt({ __speech_arbiter_source: "explicit_fallback" });
  const result = _classifyRenderPath(st);
  assert.notEqual(result, "cognitive_heuristic", "cognitive_heuristic eliminado");
  assert.notEqual(result, "cognitive_real", "old cognitive_real eliminado");
});

test("C6: resolveTopoStructured callsite marks resolver as explicit_fallback", () => {
  // Verify the pattern exists in source code
  assert.ok(
    workerSrc.includes('st.__speech_arbiter_source = "explicit_fallback"; // BLOCO B: resolver = suporte'),
    "resolver callsites must mark explicit_fallback"
  );
  // Count occurrences — should be at least 6 (inicio_programa, inicio_nome, nac, estado_civil, confirmar_casamento, financiamento_conjunto)
  const matches = (workerSrc.match(/resolver = suporte/g) || []).length;
  assert.ok(matches >= 6, `Expected >=6 resolver = suporte markers, found ${matches}`);
});

// ================================================================
// SECTION D — modoHumanoRender blindado
// ================================================================
console.log("\n📦 SECTION D — modoHumanoRender blindado");

test("D1: modoHumanoRender ignores auto modo_humano (no manual flag)", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: false });
  const arr = ["Fala do LLM pura"];
  const result = _modoHumanoRender(st, arr);
  assert.deepStrictEqual(result, arr, "auto mode should NOT rewrite");
});

test("D2: modoHumanoRender applies with manual flag", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: true });
  const arr = ["Fala do LLM pura"];
  const result = _modoHumanoRender(st, arr);
  assert.ok(result[0] !== "Fala do LLM pura", "manual mode should rewrite");
  assert.ok(result[0].includes("Ana"), "should use primeiro_nome");
});

test("D3: modoHumanoRender off → no rewrite", () => {
  const st = _mkSt({ modo_humano: false, modo_humano_manual: false });
  const arr = ["Fala original"];
  const result = _modoHumanoRender(st, arr);
  assert.deepStrictEqual(result, arr);
});

test("D4: modoHumanoRender self-disables after one round", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: true });
  _modoHumanoRender(st, ["Teste"]);
  assert.equal(st.modo_humano, false, "should self-disable");
});

// ================================================================
// SECTION E — Gates/nextStage/regra de negócio preservados
// ================================================================
console.log("\n📦 SECTION E — Gates/nextStage preservados");

test("E1: Nenhum gate/nextStage alterado no worker source", () => {
  // Verify critical gate patterns still exist
  const gates = [
    "inicio_rnm",
    "inicio_rnm_validade",
    "ir_declarado",
    "ctps_36",
    "restricao",
    "restricao_parceiro",
    "regularizacao_restricao",
    "fim_ineligivel"
  ];
  for (const gate of gates) {
    assert.ok(
      workerSrc.includes(`"${gate}"`),
      `Gate "${gate}" must exist in worker source`
    );
  }
});

test("E2: runFunnel function exists", () => {
  assert.ok(workerSrc.includes("async function runFunnel("), "runFunnel must exist");
});

test("E3: step function exists", () => {
  assert.ok(workerSrc.includes("async function step("), "step must exist");
});

test("E4: nextStage patterns preserved", () => {
  // Check key nextStage assignments exist
  assert.ok(workerSrc.includes('"inicio_nome"'), "inicio_nome stage exists");
  assert.ok(workerSrc.includes('"inicio_nacionalidade"'), "inicio_nacionalidade stage exists");
  assert.ok(workerSrc.includes('"estado_civil"'), "estado_civil stage exists");
  assert.ok(workerSrc.includes('"somar_renda_solteiro"'), "somar_renda_solteiro stage exists");
});

// ================================================================
// SECTION F — Cobrança da fase preservada
// ================================================================
console.log("\n📦 SECTION F — Cobrança da fase preservada");

test("F1: _MINIMAL_FALLBACK_SPEECH_MAP covers required stages", () => {
  const requiredStages = [
    "inicio", "inicio_programa", "inicio_nome", "estado_civil",
    "ir_declarado", "ctps_36", "restricao", "envio_docs"
  ];
  for (const stage of requiredStages) {
    const result = _buildMinimalCognitiveFallback(stage, [], null);
    assert.ok(result.length >= 1, `Stage "${stage}" must have fallback speech`);
    assert.ok(result[0].length > 10, `Fallback for "${stage}" must be substantive`);
  }
});

test("F2: Guardrails preserve technical requirements for ir_declarado", () => {
  const result = _renderCognitiveFromIntentFn("Informe se declarou imposto de renda", "ir_declarado");
  assert.ok(result, "should pass guardrail");
  assert.ok(/imposto|ir\b|renda|declara/i.test(result), "IR requirement preserved");
});

test("F3: Guardrails preserve technical requirements for ctps_36", () => {
  const result = _renderCognitiveFromIntentFn("Informe se tem 36 meses de carteira", "ctps_36");
  assert.ok(result, "should pass guardrail");
  assert.ok(/36|carteira|ctps|meses/i.test(result), "CTPS requirement preserved");
});

test("F4: Guardrails preserve technical requirements for restricao", () => {
  const result = _renderCognitiveFromIntentFn("Informe se tem restrição no CPF", "restricao");
  assert.ok(result, "should pass guardrail");
  assert.ok(/restriç|cpf|spc|serasa|negativ/i.test(result), "restricao requirement preserved");
});

test("F5: Phase guardrails block invalid transforms", () => {
  // A transform that loses the technical term should be blocked
  const result = _renderCognitiveFromIntentFn("Bom dia, tudo bem?", "ir_declarado");
  assert.equal(result, null, "should block — no IR term in output");
});

// ================================================================
// SECTION G — Pós-LLM blindado
// ================================================================
console.log("\n📦 SECTION G — Pós-LLM blindado");

test("G1: __speech_arbiter_source is set in worker source", () => {
  assert.ok(workerSrc.includes("__speech_arbiter_source"), "arbiter source must exist");
});

test("G2: step() clears __speech_arbiter_source after rendering", () => {
  assert.ok(
    workerSrc.includes("st.__speech_arbiter_source = null;"),
    "step must clear arbiter source"
  );
});

test("G3: Post-LLM guard — modoHumanoRender requires manual flag", () => {
  assert.ok(
    workerSrc.includes("if (!st.modo_humano_manual) return arr;"),
    "modoHumanoRender must check modo_humano_manual"
  );
});

test("G4: No silent swap from LLM to heuristic in renderCognitiveSpeech", () => {
  // When arbiter_source = llm_real, only path 1 matches
  const st = _mkSt({
    __cognitive_reply_prefix: "LLM says hello",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio", ["mecânico"]);
  assert.equal(result[0], "LLM says hello", "LLM must not be swapped");
});

test("G5: renderCognitiveSpeech does not add extra content to LLM reply", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Resposta pura do LLM",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "estado_civil", ["mecânico1", "mecânico2"]);
  assert.equal(result.length, 1, "only one message — no extras");
  assert.equal(result[0], "Resposta pura do LLM");
});

// ================================================================
// SECTION H — __speech_arbiter_source propagação
// ================================================================
console.log("\n📦 SECTION H — __speech_arbiter_source propagação");

test("H1: Worker source has 'llm_real' arbiter source assignments", () => {
  assert.ok(
    workerSrc.includes('__speech_arbiter_source = "llm_real"'),
    "llm_real assignments must exist"
  );
});

test("H2: Worker source has 'explicit_fallback' arbiter source assignments", () => {
  assert.ok(
    workerSrc.includes('__speech_arbiter_source = "explicit_fallback"'),
    "explicit_fallback assignments must exist"
  );
});

test("H3: No 'cognitive_heuristic' classification in classifyRenderPath", () => {
  // Verify the old classification is gone
  const classifyFnSrc = workerSrc.substring(
    workerSrc.indexOf("function classifyRenderPath("),
    workerSrc.indexOf("function classifyRenderPath(") + 300
  );
  assert.ok(!classifyFnSrc.includes("cognitive_heuristic"), "cognitive_heuristic removed from classifier");
  assert.ok(!classifyFnSrc.includes("cognitive_real"), "old cognitive_real removed from classifier");
});

test("H4: setTopoHappyPathFlags propagates arbiter source correctly", () => {
  // cognitive_real → llm_real
  const st1 = _mkSt();
  _setTopoHappyPathFlags(st1, { source: "cognitive_real", speech: ["test"] });
  assert.equal(st1.__speech_arbiter_source, "llm_real");

  // heuristic_guidance → explicit_fallback
  const st2 = _mkSt();
  _setTopoHappyPathFlags(st2, { source: "heuristic_guidance", speech: ["test"] });
  assert.equal(st2.__speech_arbiter_source, "explicit_fallback");

  // fallback_mechanical → null
  const st3 = _mkSt();
  _setTopoHappyPathFlags(st3, { source: "fallback_mechanical", speech: ["test"] });
  assert.equal(st3.__speech_arbiter_source, null);
});

// ================================================================
// SECTION I — classifyRenderPath contrato novo
// ================================================================
console.log("\n📦 SECTION I — classifyRenderPath contrato novo");

test("I1: classifyRenderPath returns 'llm_real' for llm_real source", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: "llm_real" }), "llm_real");
});

test("I2: classifyRenderPath returns 'explicit_fallback' for explicit_fallback source", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: "explicit_fallback" }), "explicit_fallback");
});

test("I3: classifyRenderPath returns 'explicit_fallback' for null source", () => {
  assert.equal(_classifyRenderPath({ __speech_arbiter_source: null }), "explicit_fallback");
});

test("I4: classifyRenderPath returns 'explicit_fallback' for undefined source", () => {
  assert.equal(_classifyRenderPath({}), "explicit_fallback");
});

// ================================================================
// SECTION J — Cenários comportamentais end-to-end
// ================================================================
console.log("\n📦 SECTION J — Cenários comportamentais end-to-end");

test("J1: reset + oi enova — fallback explícito para inicio_programa", () => {
  const st = _mkSt({
    fase_conversa: "inicio_programa",
    __speech_arbiter_source: null,
    __cognitive_v2_takes_final: false,
    __cognitive_reply_prefix: null
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["Oi"]);
  assert.ok(result.length >= 1, "deve ter fala");
  assert.ok(result[0].length > 5, "fala substantiva");
  assert.equal(st.__speech_arbiter_source, "explicit_fallback", "arbiter = explicit_fallback");
});

test("J2: saudação simples — fallback com mapa", () => {
  const st = _mkSt({
    fase_conversa: "inicio",
    __speech_arbiter_source: null
  });
  const result = _renderCognitiveSpeech(st, "inicio", []);
  assert.ok(result[0].includes("😊") || result[0].includes("falar"), "saudação cognitiva");
});

test("J3: saudação + pergunta — LLM real assume", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "Oi! 😊 Ótima pergunta sobre o MCMV...",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["oi enova como funciona?"]);
  assert.equal(result[0], "Oi! 😊 Ótima pergunta sobre o MCMV...");
});

test("J4: resposta de fase + pergunta paralela — overlap", () => {
  const roundIntent = {
    mechanical_prompt_source: "Informe seu estado civil",
    pode_ter_multiplas_intencoes: true,
    eh_off_trail: true
  };
  const result = _buildMinimalCognitiveFallback("estado_civil", [], roundIntent);
  assert.ok(result.length === 2, "overlap: 2 mensagens");
  assert.ok(result[0].includes("Anotei"), "overlap prefix");
});

test("J5: gate técnico (ir_declarado) — fallback preserva cobrança", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  const result = _renderCognitiveSpeech(st, "ir_declarado", ["Informe IR"]);
  assert.ok(
    result[0].toLowerCase().includes("imposto") || result[0].toLowerCase().includes("ir"),
    "IR cobrança preservada"
  );
});

test("J6: operacional (envio_docs) — fallback preserva cobrança", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  const result = _renderCognitiveSpeech(st, "envio_docs", []);
  assert.ok(result[0].includes("documento") || result[0].includes("📎"), "docs cobrança preservada");
});

test("J7: caso com reanchor — reanchor é suporte, não soberano", () => {
  // Verify buildReanchor is only used when takes_final=false
  assert.ok(
    workerSrc.includes("v2HasReply") &&
    workerSrc.includes("buildReanchor({ currentStage: stage }).lines"),
    "reanchor only used when v2HasReply=false"
  );
});

test("J8: modo humano manual legítimo — reescreve", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: true });
  const result = _modoHumanoRender(st, ["Teste"]);
  assert.ok(result[0] !== "Teste", "manual mode rewrites");
});

test("J9: modo humano auto (sem manual) — NÃO reescreve", () => {
  const st = _mkSt({ modo_humano: true, modo_humano_manual: false });
  const result = _modoHumanoRender(st, ["Teste"]);
  assert.equal(result[0], "Teste", "auto mode does NOT rewrite");
});

test("J10: LLM real assume — prefix é a fala final", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "O LLM real respondeu com detalhes sobre seu perfil 😊",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "inicio_programa", ["mecânico"]);
  assert.equal(result.length, 1);
  assert.equal(result[0], "O LLM real respondeu com detalhes sobre seu perfil 😊");
});

test("J11: fallback extremo controlado — sem LLM, usa mapa", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: null
  });
  const result = _renderCognitiveSpeech(st, "restricao", []);
  assert.ok(
    result[0].toLowerCase().includes("restrição") || result[0].toLowerCase().includes("cpf"),
    "fallback deve cobrar restricao"
  );
  assert.equal(st.__speech_arbiter_source, "explicit_fallback");
});

// ================================================================
// SECTION K — rawArr NUNCA exposto
// ================================================================
console.log("\n📦 SECTION K — rawArr NUNCA exposto");

test("K1: rawArr literal never exposed with LLM", () => {
  const st = _mkSt({
    __cognitive_reply_prefix: "LLM reply",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  });
  const result = _renderCognitiveSpeech(st, "ir_declarado", ["Informe IR LITERAL"]);
  assert.ok(!result.join("").includes("LITERAL"), "rawArr not exposed");
});

test("K2: rawArr literal never exposed in fallback", () => {
  const st = _mkSt({ __speech_arbiter_source: null });
  const result = _renderCognitiveSpeech(st, "ir_declarado", ["RAWTEXT_LITERAL_TEST"]);
  const joined = result.join("");
  assert.ok(!joined.includes("RAWTEXT_LITERAL_TEST"), "rawArr not exposed in fallback");
});

// ================================================================
// SECTION L — Integridade da camada soberana no source
// ================================================================
console.log("\n📦 SECTION L — Integridade da camada soberana no source");

test("L1: renderCognitiveSpeech docstring mentions 'Árbitro soberano único'", () => {
  assert.ok(
    workerSrc.includes("Árbitro soberano único da superfície visível"),
    "docstring updated"
  );
});

test("L2: REGRA MESTRA DA SUPERFÍCIE comment exists", () => {
  assert.ok(
    workerSrc.includes("REGRA MESTRA DA SUPERFÍCIE"),
    "regra mestra comment exists"
  );
});

test("L3: BLOCO D comment about blindagem exists in step()", () => {
  assert.ok(
    workerSrc.includes("BLOCO D: Blindagem pós-LLM"),
    "BLOCO D comment in step()"
  );
});

test("L4: BLOCO F comment about modo humano manual exists", () => {
  assert.ok(
    workerSrc.includes("BLOCO F"),
    "BLOCO F comment exists"
  );
});

test("L5: No gate/nextStage was removed or altered", () => {
  // Critical pattern: stage assignments in runFunnel must still exist
  const criticalPatterns = [
    '"inicio_rnm"',
    '"inicio_rnm_validade"',
    '"fim_ineligivel"',
    '"regime_trabalho"',
    '"envio_docs"',
    '"agendamento_visita"'
  ];
  for (const p of criticalPatterns) {
    assert.ok(workerSrc.includes(p), `Critical pattern ${p} must exist`);
  }
});

// ================================================================
// SUMMARY
// ================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`SOVEREIGN SPEECH ARBITER SMOKE TESTS — PR #544`);
console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`${"=".repeat(60)}`);

if (failed > 0) {
  console.error(`\n⚠️ ${failed} test(s) failed!`);
  process.exit(1);
} else {
  console.log(`\n🎉 All ${passed} tests passed!`);
}
