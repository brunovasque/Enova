/**
 * cognitive_topo_bloco_c.smoke.mjs
 *
 * Smoke tests for Bloco C cognitivo — inicio_rnm, inicio_rnm_validade.
 * Validates:
 * 1.  inicio_rnm + "sim, tenho" — trilho mecânico preservado, should_advance_stage=false
 * 2.  inicio_rnm + "não tenho" — trilho mecânico preservado, should_advance_stage=false
 * 3.  inicio_rnm + "o que é RNM?" — resposta cognitiva curta + retorno à pergunta original
 * 4.  inicio_rnm + "não sei se o meu conta" — resposta curta e segura, sem prometer
 * 5.  inicio_rnm_validade + "é indeterminado" — trilho mecânico preservado, should_advance_stage=false
 * 6.  inicio_rnm_validade + "tem validade" — trilho mecânico preservado, should_advance_stage=false
 * 7.  inicio_rnm_validade + "como sei se é indeterminado?" — resposta cognitiva curta + retorno
 * 8.  inicio_rnm_validade + "se tiver validade ainda dá?" — resposta curta, sem reinterpretar
 * 9.  REGRESSÃO — inicio_nacionalidade e estado_civil não quebram após expansão dos allowed_stages
 * 10. REGRESSÃO CRÍTICA — nenhum cenário cognitivo altera funil_status ou desvia fim_ineligivel
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

// ===== 1. inicio_rnm + "sim, tenho" =====
await asyncTest('1. inicio_rnm: "sim, tenho" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_rnm", message_text: "sim, tenho", known_slots: {}, pending_slots: ["rnm_status"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. inicio_rnm + "não tenho" =====
await asyncTest('2. inicio_rnm: "não tenho" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_rnm", message_text: "não tenho", known_slots: {}, pending_slots: ["rnm_status"] },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.doesNotMatch(
    reply,
    /garanto|garantido|aprovad|certeza|prometo|elegivel|elegível/,
    "reply_text must not make eligibility promises"
  );
});

// ===== 3. inicio_rnm + "o que é RNM?" =====
await asyncTest('3. inicio_rnm: "o que é RNM?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_rnm",
      message_text: "o que é RNM?",
      known_slots: {},
      pending_slots: ["rnm_status"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /rnm|registro nacional|migrat[oó]rio|policia federal|estrangeiro/.test(reply),
    `reply_text should explain RNM, got: "${result.response.reply_text.slice(0, 120)}"`
  );
  assert.ok(
    /sim|nao|nao\.|sim\.|possui|rnm\?/.test(reply),
    `reply_text should return to original question, got: "${result.response.reply_text.slice(0, 160)}"`
  );
  assert.doesNotMatch(
    reply,
    /garanto|garantido|aprovad|certeza|prometo|serve|qualquer documento/,
    "reply_text must not make promises or say any document serves"
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 4. inicio_rnm + "não sei se o meu conta" =====
await asyncTest('4. inicio_rnm: "não sei se o meu conta" — resposta curta e segura, sem prometer', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_rnm",
      message_text: "não sei se o meu conta",
      known_slots: {},
      pending_slots: ["rnm_status"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /rnm|sistema|confirmar|possui|sim|nao/.test(reply),
    `reply_text should guide back to RNM question, got: "${result.response.reply_text.slice(0, 160)}"`
  );
  assert.doesNotMatch(
    reply,
    /garanto|certeza|aprovad|prometo|serve sim|funciona sim/,
    "reply_text must not make promises"
  );
  assert.ok(
    result.response.confidence > 0,
    `confidence ${result.response.confidence} must be > 0 (ambiguous input legitimately causes penalty)`
  );
});

// ===== 5. inicio_rnm_validade + "é indeterminado" =====
await asyncTest('5. inicio_rnm_validade: "é indeterminado" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_rnm_validade",
      message_text: "é indeterminado",
      known_slots: {},
      pending_slots: ["rnm_validade"]
    },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 6. inicio_rnm_validade + "tem validade" =====
await asyncTest('6. inicio_rnm_validade: "tem validade" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_rnm_validade",
      message_text: "tem validade",
      known_slots: {},
      pending_slots: ["rnm_validade"]
    },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.doesNotMatch(
    reply,
    /garanto|garantido|aprovad|certeza|prometo|elegivel|elegível/,
    "reply_text must not suavize ineligibility gate"
  );
});

// ===== 7. inicio_rnm_validade + "como sei se é indeterminado?" =====
await asyncTest('7. inicio_rnm_validade: "como sei se é indeterminado?" — resposta cognitiva + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_rnm_validade",
      message_text: "como sei se é indeterminado?",
      known_slots: {},
      pending_slots: ["rnm_validade"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /indeterminado|validade|data|prazo|documento|frente/.test(reply),
    `reply_text should explain indeterminado, got: "${result.response.reply_text.slice(0, 160)}"`
  );
  assert.ok(
    /validade|indeterminado/.test(reply),
    `reply_text should return to original question, got: "${result.response.reply_text.slice(0, 160)}"`
  );
  assert.doesNotMatch(
    reply,
    /garanto|certeza|aprovad|prometo|elegivel/,
    "reply_text must not make promises"
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 8. inicio_rnm_validade + "se tiver validade ainda dá?" =====
await asyncTest('8. inicio_rnm_validade: "se tiver validade ainda dá?" — resposta curta, sem reinterpretar regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_rnm_validade",
      message_text: "se tiver validade ainda dá?",
      known_slots: {},
      pending_slots: ["rnm_validade"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response.reply_text.length > 0, "reply_text must not be empty");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    /sistema|confirmar|validade|indeterminado|trilho|confirma/.test(reply),
    `reply_text should address the question without reinterpreting, got: "${result.response.reply_text.slice(0, 160)}"`
  );
  assert.doesNotMatch(
    reply,
    /garanto|certeza|aprovad|prometo|da sim|funciona sim|pode sim|consegue sim/,
    "reply_text must not reinterpret the ineligibility gate"
  );
  assert.ok(
    result.response.confidence >= 0.66,
    `confidence ${result.response.confidence} must be >= 0.66`
  );
});

// ===== 9. REGRESSÃO — inicio_nacionalidade e estado_civil não quebram =====
await asyncTest("9. REGRESSÃO: inicio_nacionalidade e estado_civil funcionam após expansão de COGNITIVE_V1_ALLOWED_STAGES", async () => {
  const resultNacionalidade = await runReadOnlyCognitiveEngine(
    {
      current_stage: "inicio_nacionalidade",
      message_text: "sou brasileiro",
      known_slots: {},
      pending_slots: ["nacionalidade"]
    },
    heuristicOnlyRuntime
  );
  assert.strictEqual(resultNacionalidade.response.should_advance_stage, false, "inicio_nacionalidade: should_advance_stage must be false");
  const v1 = validateReadOnlyCognitiveResponse(resultNacionalidade.response);
  assert.ok(v1.valid, `inicio_nacionalidade response must be valid: ${v1.errors.join(", ")}`);

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
  const v2 = validateReadOnlyCognitiveResponse(resultEstadoCivil.response);
  assert.ok(v2.valid, `estado_civil response must be valid: ${v2.errors.join(", ")}`);
  assert.ok(
    resultEstadoCivil.response.slots_detected?.estado_civil,
    "estado_civil slot should be detected for 'sou solteiro'"
  );
});

// ===== 10. REGRESSÃO CRÍTICA — nenhum cenário cognitivo altera funil_status =====
await asyncTest("10. REGRESSÃO CRÍTICA: nenhuma resposta cognitiva altera funil_status ou desvia fim_ineligivel", async () => {
  const scenarios = [
    { stage: "inicio_rnm", text: "o que é RNM?" },
    { stage: "inicio_rnm", text: "não sei se o meu conta" },
    { stage: "inicio_rnm", text: "sou estrangeiro, posso continuar?" },
    { stage: "inicio_rnm_validade", text: "como sei se é indeterminado?" },
    { stage: "inicio_rnm_validade", text: "se tiver validade ainda dá?" },
    { stage: "inicio_rnm_validade", text: "não entendi essa parte" }
  ];

  for (const { stage, text } of scenarios) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: [] },
      heuristicOnlyRuntime
    );
    assert.strictEqual(
      result.response.should_advance_stage,
      false,
      `${stage} / "${text}": should_advance_stage must be false`
    );
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} / "${text}": response must be valid: ${v.errors.join(", ")}`);
    // Engine output never carries funil_status — slots_detected should not have funil_status
    const slotsKeys = Object.keys(result.response.slots_detected || {});
    assert.ok(
      !slotsKeys.includes("funil_status"),
      `${stage} / "${text}": engine must not produce funil_status slot`
    );
    assert.ok(
      !slotsKeys.includes("fase_conversa"),
      `${stage} / "${text}": engine must not produce fase_conversa slot`
    );
    const reply = normalizeForMatch(result.response.reply_text);
    assert.doesNotMatch(
      reply,
      /ineligivel|inelegivel|fim_ineligivel/,
      `${stage} / "${text}": cognitive reply must not reference ineligibility outcome`
    );
  }
});

console.log(`\ncognitive_topo_bloco_c.smoke: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, `${failed} scenario(s) failed in cognitive_topo_bloco_c.smoke`);
console.log("cognitive_topo_bloco_c.smoke: ok");
