/**
 * cognitive_aprofundamento_renda.smoke.mjs
 *
 * Smoke tests para Bloco de Aprofundamento de Renda Cognitivo.
 * Stages cobertos: possui_renda_extra, inicio_multi_regime_pergunta,
 *   inicio_multi_regime_coletar, inicio_multi_renda_pergunta, inicio_multi_renda_coletar.
 *
 * 1.  possui_renda_extra + resposta direta — trilho mecânico preservado
 * 2.  possui_renda_extra + dúvida "faço uns bicos, conta?" — resposta cognitiva curta + retorno
 * 3.  inicio_multi_regime_pergunta + resposta aberta "sou CLT e faço extra" — ajuda sem classificar
 * 4.  inicio_multi_regime_coletar + ambiguidade "tenho mei também" — resposta curta e segura
 * 5.  inicio_multi_renda_pergunta + dúvida "minha renda varia, isso conta?" — resposta cognitiva + retorno
 * 6.  inicio_multi_renda_coletar + resposta aproximada "depende, mas o extra gira em torno de 800" — ajuda sem quebrar coleta
 * 7.  BLINDAGEM — multi renda / multi regime não abriram docs nem correspondente
 * 8.  REGRESSÃO — bloco renda/trabalho, composição inicial, estado_civil e topo não quebraram
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

// ===== 1. possui_renda_extra + resposta direta =====
await asyncTest('1. possui_renda_extra: "sim" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "sim", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. possui_renda_extra + dúvida =====
await asyncTest('2. possui_renda_extra: "faço uns bicos, conta?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "faço uns bicos, conta?", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("bico") || reply.includes("extra") || reply.includes("informal") || reply.includes("renda"),
    `reply should reference bico/extra/renda: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("sim") || reply.includes("nao") || reply.includes("responda") || reply.includes("renda extra") || reply.includes("alem"),
    `reply should return to original question: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem composição automática
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 3. inicio_multi_regime_pergunta + resposta aberta =====
await asyncTest('3. inicio_multi_regime_pergunta: "sou CLT e faço extra" — ajuda cognitiva sem classificar sozinho fora da regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_pergunta", message_text: "sou CLT e faço extra", known_slots: {}, pending_slots: ["multi_regime"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve afirmar que classificou o regime final
  assert.ok(
    !reply.includes("seu regime e") && !reply.includes("seu regime é"),
    `reply must not claim to have classified regime: "${result.response.reply_text}"`
  );
});

// ===== 4. inicio_multi_regime_coletar + ambiguidade =====
await asyncTest('4. inicio_multi_regime_coletar: "tenho mei também" — resposta curta e segura, sem inventar regime final', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_coletar", message_text: "tenho mei também", known_slots: {}, pending_slots: ["multi_regime"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("mei") || reply.includes("autonomo") || reply.includes("regime"),
    `reply should reference MEI/autonomo/regime: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir fluxo paralelo de MEI/PJ
  assert.ok(
    !reply.includes("cnpj") || reply.includes("mei"),
    `reply must not open CNPJ parallel flow without grounding: "${result.response.reply_text}"`
  );
});

// ===== 5. inicio_multi_renda_pergunta + dúvida =====
await asyncTest('5. inicio_multi_renda_pergunta: "minha renda varia, isso conta?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_pergunta", message_text: "minha renda varia, isso conta?", known_slots: {}, pending_slots: ["multi_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    reply.includes("varia") || reply.includes("media") || reply.includes("renda") || reply.includes("alem"),
    `reply should address variavel/renda: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem média documental
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("correspondente"),
    `reply must not open docs/correspondente: "${result.response.reply_text}"`
  );
});

// ===== 6. inicio_multi_renda_coletar + resposta aproximada =====
await asyncTest('6. inicio_multi_renda_coletar: "depende, mas o extra gira em torno de 800" — ajuda conversacional sem quebrar coleta segura', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_coletar", message_text: "depende, mas o extra gira em torno de 800", known_slots: {}, pending_slots: ["multi_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve assumir valor fechado perigoso (ex: afirmar que valor está confirmado sem confirmação)
  assert.ok(
    !reply.includes("valor confirmado") && !reply.includes("800 confirmado"),
    `reply must not assume closed value without confirmation: "${result.response.reply_text}"`
  );
  // não deve abrir docs
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 7. BLINDAGEM — multi renda / multi regime não abriram docs nem correspondente =====
await asyncTest('7. BLINDAGEM: inicio_multi_renda_pergunta — reply não abre docs nem correspondente', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_pergunta", message_text: "não sei se minha renda extra entra", known_slots: {}, pending_slots: ["multi_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
  // blindagem de MEI/PJ: não deve abrir fluxo paralelo
  const resultMultiRegime = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_coletar", message_text: "tenho PJ também", known_slots: {}, pending_slots: ["multi_regime"] },
    heuristicOnlyRuntime
  );
  assert.ok(resultMultiRegime.response, "engine produced a result for multi_regime");
  assert.strictEqual(resultMultiRegime.response.should_advance_stage, false, "should_advance_stage must be false for multi_regime");
  const replyRegime = normalizeForMatch(resultMultiRegime.response.reply_text);
  assert.ok(
    !replyRegime.includes("document") && !replyRegime.includes("correspondente") && !replyRegime.includes("visita"),
    `multi_regime reply must not open docs/correspondente/visita: "${resultMultiRegime.response.reply_text}"`
  );
});

// ===== 8. REGRESSÃO — bloco renda/trabalho, composição inicial, estado_civil e topo =====
await asyncTest('8. REGRESSÃO: regime_trabalho, estado_civil, somar_renda_solteiro não quebraram após expansão do bloco aprofundamento', async () => {
  const regimeResult = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "clt", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(regimeResult.response, "regime_trabalho: engine produced a result");
  assert.strictEqual(regimeResult.response.should_advance_stage, false, "regime_trabalho: should_advance_stage must be false");
  const vRegime = validateReadOnlyCognitiveResponse(regimeResult.response);
  assert.ok(vRegime.valid, `regime_trabalho response valid: ${vRegime.errors.join(", ")}`);

  const estadoCivilResult = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "solteiro", known_slots: {}, pending_slots: ["estado_civil", "composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(estadoCivilResult.response, "estado_civil: engine produced a result");
  assert.strictEqual(estadoCivilResult.response.should_advance_stage, false, "estado_civil: should_advance_stage must be false");
  const vEstadoCivil = validateReadOnlyCognitiveResponse(estadoCivilResult.response);
  assert.ok(vEstadoCivil.valid, `estado_civil response valid: ${vEstadoCivil.errors.join(", ")}`);

  const composicaoResult = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "vou seguir sozinho", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(composicaoResult.response, "somar_renda_solteiro: engine produced a result");
  assert.strictEqual(composicaoResult.response.should_advance_stage, false, "somar_renda_solteiro: should_advance_stage must be false");
  const vComposicao = validateReadOnlyCognitiveResponse(composicaoResult.response);
  assert.ok(vComposicao.valid, `somar_renda_solteiro response valid: ${vComposicao.errors.join(", ")}`);
});

// ===== Summary =====
console.log(`\ncognitive_aprofundamento_renda.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
