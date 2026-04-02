/**
 * cognitive_topo_bloco_a.smoke.mjs
 *
 * Smoke tests for Bloco A cognitivo — inicio, inicio_decisao, inicio_programa.
 * Validates:
 * 1.  inicio + "oi" — engine runs, should_advance_stage=false
 * 2.  inicio + "como funciona?" — MCMV guidance reply, confidence >= 0.66 (heuristic)
 * 3.  inicio_decisao + "1" — engine runs, should_advance_stage=false
 * 4.  inicio_decisao + "precisa fazer tudo de novo?" — retomada guidance
 * 5.  inicio_programa + "sim" — engine runs, should_advance_stage=false
 * 6.  inicio_programa + "o fgts ajuda?" — FGTS guidance, no approval promise
 * 7.  inicio_programa + "estrangeiro pode participar?" — elegibilidade guidance
 * 8.  REGRESSÃO: estado_civil still works after allowed_stages expansion
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const { createMockOpenAIFetch } = await import(
  new URL("./cognitive_openai_mock.mjs", import.meta.url).href
);

// heuristic-only: no LLM — tests guidance builders and confidence boost directly
const heuristicOnlyRuntime = {};

// full runtime with mock LLM — used for slot-detection tests
const llmRuntime = {
  openaiApiKey: "test-openai-key",
  model: "gpt-4.1-mini",
  fetchImpl: createMockOpenAIFetch()
};

let passed = 0;
let failed = 0;

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

function normalizeForMatch(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ===== 1. inicio + saudação simples ("oi") =====
await asyncTest('1. inicio: "oi" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. inicio + "como funciona?" =====
await asyncTest('2. inicio: "como funciona?" — guia sobre MCMV, confidence >= 0.66', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "como funciona?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /mcmv|minha casa|programa|subsidio|parcela/.test(reply),
    `reply_text should mention programa/MCMV, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66 for topo guidance`
  );
});

// ===== 3. inicio_decisao + "1" =====
await asyncTest('3. inicio_decisao: "1" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "1", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 4. inicio_decisao + "precisa fazer tudo de novo?" =====
await asyncTest('4. inicio_decisao: "precisa fazer tudo de novo?" — guia de retomada', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_decisao",
      message_text: "precisa fazer tudo de novo?",
      known_slots: {},
      pending_slots: []
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /nao precisa|continuar|de onde parou|comecar do zero|escolher|1|2/.test(reply),
    `reply_text should mention retomada options, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 5. inicio_programa + "sim" =====
await asyncTest('5. inicio_programa: "sim" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "sim", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 6. inicio_programa + "o fgts ajuda?" =====
await asyncTest('6. inicio_programa: "o fgts ajuda?" — guia FGTS, sem promessa', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "o fgts ajuda?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /fgts/.test(reply),
    `reply_text should mention FGTS, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.doesNotMatch(
    reply,
    /garanto|garantido|vai ser aprovad|certeza de aprovacao|prometo/,
    "reply_text must not make approval promises"
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 7. inicio_programa + "estrangeiro pode participar?" =====
await asyncTest('7. inicio_programa: "estrangeiro pode participar?" — guia de elegibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_programa",
      message_text: "estrangeiro pode participar?",
      known_slots: {},
      pending_slots: []
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /estrangeiro|rnm|pode sim|pode participar/.test(reply),
    `reply_text should mention estrangeiro/RNM, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 8. REGRESSÃO — estado_civil não quebrou =====
await asyncTest("8. REGRESSÃO: estado_civil funciona após expansão de COGNITIVE_V1_ALLOWED_STAGES", async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "sou solteiro",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"]
    },
    llmRuntime
  );
  assert.ok(result.response, "engine produced a result for estado_civil");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `estado_civil response must be valid: ${v.errors.join(", ")}`);
  assert.ok(
    result.response.slots_detected?.estado_civil,
    "estado_civil slot should be detected for 'sou solteiro'"
  );
});

console.log(`\ncognitive_topo_bloco_a.smoke: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, `${failed} scenario(s) failed in cognitive_topo_bloco_a.smoke`);
console.log("cognitive_topo_bloco_a.smoke: ok");
