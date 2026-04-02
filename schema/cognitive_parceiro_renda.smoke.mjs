/**
 * cognitive_parceiro_renda.smoke.mjs
 *
 * Smoke tests para Bloco do Parceiro Cognitivo.
 * Stages cobertos: parceiro_tem_renda, regime_trabalho_parceiro,
 *   inicio_multi_regime_pergunta_parceiro, inicio_multi_regime_coletar_parceiro,
 *   renda_parceiro, inicio_multi_renda_pergunta_parceiro, inicio_multi_renda_coletar_parceiro.
 *
 *  1. parceiro_tem_renda + resposta direta — trilho mecânico preservado
 *  2. parceiro_tem_renda + dúvida "só eu tenho renda" — resposta cognitiva curta + retorno
 *  3. regime_trabalho_parceiro + dúvida aberta "ele tem mei, entra como o quê?" — ajuda sem classificar
 *  4. inicio_multi_regime_pergunta_parceiro + resposta aberta "ela é CLT e faz extra" — ajuda sem classificar
 *  5. inicio_multi_regime_coletar_parceiro + ambiguidade "tem mei também" — resposta curta e segura
 *  6. renda_parceiro + valor claro — trilho mecânico preservado
 *  7. renda_parceiro + dúvida "é bruto ou líquido?" — resposta cognitiva curta + retorno
 *  8. inicio_multi_renda_pergunta_parceiro + dúvida "a renda dele varia, isso conta?" — resposta + retorno
 *  9. inicio_multi_renda_coletar_parceiro + resposta aproximada "depende, mas gira em torno de 800" — ajuda sem quebrar coleta
 * 10. BLINDAGEM — parceiro não contaminou familiar/P3 nem abriu docs/correspondente/visita
 * 11. REGRESSÃO — titular, composição inicial, estado_civil e topo não quebraram
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

// ===== 1. parceiro_tem_renda + resposta direta =====
await asyncTest('1. parceiro_tem_renda: "sim" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "parceiro_tem_renda", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["parceiro_tem_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. parceiro_tem_renda + dúvida =====
await asyncTest('2. parceiro_tem_renda: "só eu tenho renda" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "parceiro_tem_renda", message_text: "só eu tenho renda", known_slots: { composicao: "parceiro" }, pending_slots: ["parceiro_tem_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("parceiro") || reply.includes("sim") || reply.includes("nao") || reply.includes("renda"),
    `reply should address the question: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem misturar com familiar
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("familiar"),
    `reply must not open docs or mix with familiar: "${result.response.reply_text}"`
  );
});

// ===== 3. regime_trabalho_parceiro + dúvida aberta =====
await asyncTest('3. regime_trabalho_parceiro: "ele tem mei, entra como o quê?" — ajuda cognitiva sem classificar sozinho fora da regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro", message_text: "ele tem mei, entra como o quê?", known_slots: { composicao: "parceiro" }, pending_slots: ["regime_trabalho_parceiro"] },
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
  // blindagem: não deve afirmar que já classificou definitivamente
  assert.ok(
    !reply.includes("regime definido") && !reply.includes("regime confirmado"),
    `reply must not claim to have definitively classified regime: "${result.response.reply_text}"`
  );
  // não deve misturar com titular
  assert.ok(
    !reply.includes("seu regime") || reply.includes("parceiro"),
    `reply must not confuse parceiro with titular: "${result.response.reply_text}"`
  );
});

// ===== 4. inicio_multi_regime_pergunta_parceiro + resposta aberta =====
await asyncTest('4. inicio_multi_regime_pergunta_parceiro: "ela é CLT e faz extra" — ajuda cognitiva sem classificar sozinho fora da regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_pergunta_parceiro", message_text: "ela é CLT e faz extra", known_slots: { composicao: "parceiro" }, pending_slots: ["multi_regime_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve consolidar o regime final
  assert.ok(
    !reply.includes("regime final") && !reply.includes("classificado como"),
    `reply must not claim to have consolidated final regime: "${result.response.reply_text}"`
  );
  // não deve abrir docs
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 5. inicio_multi_regime_coletar_parceiro + ambiguidade =====
await asyncTest('5. inicio_multi_regime_coletar_parceiro: "tem mei também" — resposta curta e segura, sem inventar regime final', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_coletar_parceiro", message_text: "tem mei também", known_slots: { composicao: "parceiro" }, pending_slots: ["multi_regime_parceiro"] },
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
  // não deve abrir docs nem fluxo PJ paralelo
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 6. renda_parceiro + valor claro =====
await asyncTest('6. renda_parceiro: "2500" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro", message_text: "2500", known_slots: { composicao: "parceiro" }, pending_slots: ["renda_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 7. renda_parceiro + dúvida =====
await asyncTest('7. renda_parceiro: "é bruto ou líquido?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro", message_text: "é bruto ou líquido?", known_slots: { composicao: "parceiro" }, pending_slots: ["renda_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("liquido") || reply.includes("bruto") || reply.includes("renda") || reply.includes("parceiro"),
    `reply should address bruto/liquido/renda: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem misturar com titular
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 8. inicio_multi_renda_pergunta_parceiro + dúvida =====
await asyncTest('8. inicio_multi_renda_pergunta_parceiro: "a renda dele varia, isso conta?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_pergunta_parceiro", message_text: "a renda dele varia, isso conta?", known_slots: { composicao: "parceiro" }, pending_slots: ["multi_renda_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    reply.includes("varia") || reply.includes("media") || reply.includes("renda") || reply.includes("parceiro") || reply.includes("alem"),
    `reply should address renda variavel/parceiro: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem misturar com renda do titular
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("correspondente"),
    `reply must not open docs/correspondente: "${result.response.reply_text}"`
  );
});

// ===== 9. inicio_multi_renda_coletar_parceiro + resposta aproximada =====
await asyncTest('9. inicio_multi_renda_coletar_parceiro: "depende, mas gira em torno de 800" — ajuda conversacional sem quebrar coleta segura', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_coletar_parceiro", message_text: "depende, mas gira em torno de 800", known_slots: { composicao: "parceiro" }, pending_slots: ["multi_renda_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve assumir valor fechado perigoso
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

// ===== 10. BLINDAGEM =====
await asyncTest('10. BLINDAGEM: parceiro não contaminou familiar/P3 e não abriu docs/correspondente/visita', async () => {
  // parceiro_tem_renda não deve cruzar com familiar
  const r1 = await runReadOnlyCognitiveEngine(
    { current_stage: "parceiro_tem_renda", message_text: "só eu tenho renda", known_slots: { composicao: "parceiro" }, pending_slots: ["parceiro_tem_renda"] },
    heuristicOnlyRuntime
  );
  const reply1 = normalizeForMatch(r1.response?.reply_text);
  assert.ok(
    !reply1.includes("familiar") && !reply1.includes("p3") && !reply1.includes("document") && !reply1.includes("visita"),
    `parceiro_tem_renda reply must not mix with familiar/P3/docs/visita: "${r1.response?.reply_text}"`
  );

  // renda_parceiro não deve contaminar renda do titular
  const r2 = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro", message_text: "quanto precisa ter?", known_slots: { composicao: "parceiro" }, pending_slots: ["renda_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(r2.response, "engine produced a result for renda_parceiro");
  assert.strictEqual(r2.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply2 = normalizeForMatch(r2.response.reply_text);
  assert.ok(
    !reply2.includes("document") && !reply2.includes("correspondente") && !reply2.includes("visita"),
    `renda_parceiro reply must not open docs/correspondente/visita: "${r2.response?.reply_text}"`
  );

  // inicio_multi_regime_coletar_parceiro com MEI não deve abrir PJ paralelo
  const r3 = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_coletar_parceiro", message_text: "ele tem PJ também", known_slots: { composicao: "parceiro" }, pending_slots: ["multi_regime_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(r3.response, "engine produced a result for multi_regime_coletar_parceiro");
  assert.strictEqual(r3.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply3 = normalizeForMatch(r3.response.reply_text);
  assert.ok(
    !reply3.includes("document") && !reply3.includes("correspondente") && !reply3.includes("visita"),
    `multi_regime_coletar_parceiro reply must not open docs/correspondente/visita: "${r3.response?.reply_text}"`
  );
});

// ===== 11. REGRESSÃO =====
await asyncTest('11. REGRESSÃO: titular, composição inicial, estado_civil e topo não quebraram após expansão do bloco parceiro', async () => {
  const regimeResult = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "clt", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(regimeResult.response, "regime_trabalho: engine produced a result");
  assert.strictEqual(regimeResult.response.should_advance_stage, false, "regime_trabalho: should_advance_stage must be false");
  const vRegime = validateReadOnlyCognitiveResponse(regimeResult.response);
  assert.ok(vRegime.valid, `regime_trabalho response valid: ${vRegime.errors.join(", ")}`);

  const rendaResult = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "3000", known_slots: {}, pending_slots: ["renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(rendaResult.response, "renda: engine produced a result");
  assert.strictEqual(rendaResult.response.should_advance_stage, false, "renda: should_advance_stage must be false");
  const vRenda = validateReadOnlyCognitiveResponse(rendaResult.response);
  assert.ok(vRenda.valid, `renda response valid: ${vRenda.errors.join(", ")}`);

  const estadoCivilResult = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "casado", known_slots: {}, pending_slots: ["estado_civil", "composicao"] },
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

  // regressão no próprio bloco titular renda
  const aprofundamentoResult = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "sim", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(aprofundamentoResult.response, "possui_renda_extra: engine produced a result");
  assert.strictEqual(aprofundamentoResult.response.should_advance_stage, false, "possui_renda_extra: should_advance_stage must be false");
  const vAprofundamento = validateReadOnlyCognitiveResponse(aprofundamentoResult.response);
  assert.ok(vAprofundamento.valid, `possui_renda_extra response valid: ${vAprofundamento.errors.join(", ")}`);
});

// ===== Summary =====
console.log(`\ncognitive_parceiro_renda.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
