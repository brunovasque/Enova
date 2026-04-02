/**
 * cognitive_topo_bloco_b.smoke.mjs
 *
 * Smoke tests for Bloco B cognitivo — inicio_nome, inicio_nacionalidade.
 * Validates:
 * 1.  inicio_nome + nome válido — engine runs, should_advance_stage=false
 * 2.  inicio_nome + frase de apresentação — engine runs, should_advance_stage=false
 * 3.  inicio_nome + dúvida curta — resposta cognitiva, still_needs_original_answer
 * 4.  inicio_nome + resistência leve ("depois eu mando") — resposta cognitiva curta
 * 5.  inicio_nacionalidade + "sou brasileiro" — engine runs, should_advance_stage=false
 * 6.  inicio_nacionalidade + "sou estrangeiro" — engine runs, should_advance_stage=false
 * 7.  inicio_nacionalidade + "o que é RNM?" — resposta cognitiva, sem prometer
 * 8.  inicio_nacionalidade + "sou estrangeiro, ainda posso tentar?" — resposta curta, sem prometer
 * 9.  REGRESSÃO — inicio_programa e estado_civil não quebram após expansão dos allowed_stages
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const { createMockOpenAIFetch } = await import(
  new URL("./cognitive_openai_mock.mjs", import.meta.url).href
);

const heuristicOnlyRuntime = {};

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

// ===== 1. inicio_nome + nome válido =====
await asyncTest('1. inicio_nome: "Bruno Vasques" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_nome", message_text: "Bruno Vasques", known_slots: {}, pending_slots: ["nome"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. inicio_nome + frase de apresentação =====
await asyncTest('2. inicio_nome: "meu nome é Bruno Vasques" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_nome", message_text: "meu nome é Bruno Vasques", known_slots: {}, pending_slots: ["nome"] },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 3. inicio_nome + dúvida curta =====
await asyncTest('3. inicio_nome: "pra que precisa do meu nome?" — resposta cognitiva + retorno para coleta', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_nome",
      message_text: "pra que precisa do meu nome?",
      known_slots: {},
      pending_slots: ["nome"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /nome|atendimento|identificar|registrar|sistema/.test(reply),
    `reply_text should address the question about nome, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66 for topo guidance`
  );
});

// ===== 4. inicio_nome + resistência leve =====
await asyncTest('4. inicio_nome: "depois eu mando" — resposta cognitiva curta, retorno para coleta', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_nome",
      message_text: "depois eu mando",
      known_slots: {},
      pending_slots: ["nome"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /nome|completo|registrar|sobrenome/.test(reply),
    `reply_text should prompt for nome, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 5. inicio_nacionalidade + "sou brasileiro" =====
await asyncTest('5. inicio_nacionalidade: "sou brasileiro" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_nacionalidade",
      message_text: "sou brasileiro",
      known_slots: {},
      pending_slots: ["nacionalidade"]
    },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 6. inicio_nacionalidade + "sou estrangeiro" =====
await asyncTest('6. inicio_nacionalidade: "sou estrangeiro" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_nacionalidade",
      message_text: "sou estrangeiro",
      known_slots: {},
      pending_slots: ["nacionalidade"]
    },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 7. inicio_nacionalidade + dúvida sobre RNM =====
await asyncTest('7. inicio_nacionalidade: "o que é RNM?" — resposta cognitiva curta, sem prometer elegibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_nacionalidade",
      message_text: "o que é RNM?",
      known_slots: {},
      pending_slots: ["nacionalidade"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /rnm|registro nacional|migrat|estrangeiro|documentac|documental/.test(reply),
    `reply_text should explain RNM, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.doesNotMatch(
    reply,
    /garanto|garantido|aprovad|certeza|prometo|pode sim participar do programa/,
    "reply_text must not make approval promises"
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 8. inicio_nacionalidade + dúvida sobre estrangeiro =====
await asyncTest('8. inicio_nacionalidade: "sou estrangeiro, ainda posso tentar?" — resposta curta, sem prometer', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_nacionalidade",
      message_text: "sou estrangeiro, ainda posso tentar?",
      known_slots: {},
      pending_slots: ["nacionalidade"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /estrangeiro|documentac|documental|sistema|rnm|verificar/.test(reply),
    `reply_text should address estrangeiro elegibility carefully, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.doesNotMatch(
    reply,
    /garanto|certeza|aprovad|prometo/,
    "reply_text must not make promises"
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 9. REGRESSÃO — inicio_programa e estado_civil não quebram =====
await asyncTest("9. REGRESSÃO: inicio_programa e estado_civil funcionam após expansão de COGNITIVE_V1_ALLOWED_STAGES", async () => {
  const resultPrograma = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "o fgts ajuda?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.strictEqual(resultPrograma.response.should_advance_stage, false, "inicio_programa: should_advance_stage must be false");
  const replyPrograma = normalizeForMatch(resultPrograma.response.reply_text);
  assert.ok(
    /fgts/.test(replyPrograma),
    `inicio_programa reply should mention FGTS, got: "${resultPrograma.response.reply_text.slice(0, 120)}"`
  );

  const resultEstadoCivil = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "sou solteiro",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"]
    },
    llmRuntime
  );
  assert.strictEqual(resultEstadoCivil.response.should_advance_stage, false, "estado_civil: should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(resultEstadoCivil.response);
  assert.ok(v.valid, `estado_civil response must be valid: ${v.errors.join(", ")}`);
  assert.ok(
    resultEstadoCivil.response.slots_detected?.estado_civil,
    "estado_civil slot should be detected for 'sou solteiro'"
  );
});

console.log(`\ncognitive_topo_bloco_b.smoke: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, `${failed} scenario(s) failed in cognitive_topo_bloco_b.smoke`);
console.log("cognitive_topo_bloco_b.smoke: ok");
