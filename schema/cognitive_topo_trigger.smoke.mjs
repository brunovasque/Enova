/**
 * cognitive_topo_trigger.smoke.mjs
 *
 * Smoke tests for cognitive trigger fix — saudação curta no topo + reentrada pós-reset.
 * Validates:
 * 1. inicio_programa + "oi" → trigger cognitivo ativo
 * 2. inicio_programa + "olá" → trigger cognitivo ativo
 * 3. inicio_programa + "bom dia" → trigger cognitivo ativo
 * 4. pós-reset (inicio_programa) + "oi" → trigger cognitivo ativo
 * 5. pós-reset (inicio_programa) + "quero começar" → trigger cognitivo ativo
 * 6. pós-reset (inicio_programa) + "me tira uma dúvida" → trigger cognitivo ativo
 * 7. REGRESSÃO: "me explica rapidinho como funciona?" continua funcionando
 * 8. REGRESSÃO estrutural: mecânico intacto, nextStage intacto, persistência intacta
 * 9. inicio + "oi" → trigger cognitivo ativo (com guidance humano)
 * 10. inicio + "bom dia" → trigger cognitivo ativo (com guidance humano)
 * 11. inicio_decisao + "oi" → trigger cognitivo ativo (com guidance de retomada)
 * 12. inicio_decisao + "opa" → trigger cognitivo ativo
 * 13. inicio_programa + "boa tarde" → trigger cognitivo ativo
 * 14. inicio_programa + "voltei" → trigger cognitivo ativo (reentrada)
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

// ===== 1. inicio_programa + "oi" → trigger cognitivo ativo =====
await asyncTest('1. inicio_programa: "oi" — trigger cognitivo ativo, guidance humano', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66 for topo greeting`
  );
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /oi|ajudar|minha casa|programa/.test(reply),
    `reply_text should be a human greeting, got: "${result.response.reply_text.slice(0, 120)}"`
  );
});

// ===== 2. inicio_programa + "olá" → trigger cognitivo ativo =====
await asyncTest('2. inicio_programa: "olá" — trigger cognitivo ativo, guidance humano', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "olá", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 3. inicio_programa + "bom dia" → trigger cognitivo ativo =====
await asyncTest('3. inicio_programa: "bom dia" — trigger cognitivo ativo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "bom dia", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 4. pós-reset (inicio_programa) + "oi" → trigger cognitivo ativo =====
await asyncTest('4. pós-reset inicio_programa: "oi" — trigger cognitivo ativo', async () => {
  // Simula estado pós-reset: inicio_programa, sem dados preenchidos
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 5. pós-reset (inicio_programa) + "quero começar" → trigger cognitivo ativo =====
await asyncTest('5. pós-reset inicio_programa: "quero começar" — trigger cognitivo ativo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "quero começar", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /ajudar|programa|minha casa|explicar/.test(reply),
    `reply_text should be welcoming/guiding, got: "${result.response.reply_text.slice(0, 120)}"`
  );
});

// ===== 6. pós-reset (inicio_programa) + "me tira uma dúvida" → trigger cognitivo ativo =====
await asyncTest('6. pós-reset inicio_programa: "me tira uma dúvida" — trigger cognitivo ativo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "me tira uma dúvida", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 7. REGRESSÃO: "me explica rapidinho como funciona?" continua funcionando =====
await asyncTest('7. REGRESSÃO: "me explica rapidinho como funciona?" — continua com guidance MCMV', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_programa",
      message_text: "me explica rapidinho como funciona?",
      known_slots: {},
      pending_slots: []
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /mcmv|minha casa|programa|subsidio|parcela|financiamento/.test(reply),
    `reply_text should mention programa/MCMV, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 8. REGRESSÃO estrutural: should_advance_stage always false, response valid =====
await asyncTest('8. REGRESSÃO estrutural: mecânico soberano, nextStage intacto', async () => {
  // Testa que o engine cognitivo nunca avança stage sozinho
  const stages = ["inicio", "inicio_decisao", "inicio_programa"];
  const inputs = ["oi", "bom dia", "quero começar"];
  for (const s of stages) {
    for (const input of inputs) {
      const result = await runReadOnlyCognitiveEngine(
        { current_stage: s, message_text: input, known_slots: {}, pending_slots: [] },
        heuristicOnlyRuntime
      );
      assert.strictEqual(
        result.response.should_advance_stage,
        false,
        `${s}+"${input}": should_advance_stage must be false`
      );
      const v = validateReadOnlyCognitiveResponse(result.response);
      assert.ok(v.valid, `${s}+"${input}": response must be valid: ${v.errors.join(", ")}`);
    }
  }
});

// ===== 9. inicio + "oi" → trigger cognitivo ativo (guidance humano) =====
await asyncTest('9. inicio: "oi" — trigger cognitivo ativo, guidance humano', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /oi|bom|ajudar|enova|minha casa/.test(reply),
    `reply_text should be a greeting, got: "${result.response.reply_text.slice(0, 120)}"`
  );
});

// ===== 10. inicio + "bom dia" → trigger cognitivo ativo =====
await asyncTest('10. inicio: "bom dia" — trigger cognitivo ativo, guidance humano', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "bom dia", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 11. inicio_decisao + "oi" → trigger cognitivo ativo =====
await asyncTest('11. inicio_decisao: "oi" — trigger cognitivo ativo, guidance retomada', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /volta|oi|atendimento|continuar|1|2/.test(reply),
    `reply_text should guide to decision, got: "${result.response.reply_text.slice(0, 120)}"`
  );
});

// ===== 12. inicio_decisao + "opa" → trigger cognitivo ativo =====
await asyncTest('12. inicio_decisao: "opa" — trigger cognitivo ativo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "opa", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 13. inicio_programa + "boa tarde" → trigger cognitivo ativo =====
await asyncTest('13. inicio_programa: "boa tarde" — trigger cognitivo ativo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "boa tarde", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 14. inicio_programa + "voltei" → trigger cognitivo ativo (reentrada) =====
await asyncTest('14. inicio_programa: "voltei" — trigger cognitivo ativo, reentrada', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "voltei", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

console.log(`\ncognitive_topo_trigger.smoke: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, `${failed} scenario(s) failed in cognitive_topo_trigger.smoke`);
console.log("cognitive_topo_trigger.smoke: ok");
