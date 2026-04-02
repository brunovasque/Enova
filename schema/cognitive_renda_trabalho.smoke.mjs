/**
 * cognitive_renda_trabalho.smoke.mjs
 *
 * Smoke tests para Bloco Inicial de Renda/Trabalho Cognitivo.
 * Stages cobertos: regime_trabalho, autonomo_ir_pergunta, renda.
 *
 * 1.  regime_trabalho + resposta direta CLT — trilho mecânico preservado
 * 2.  regime_trabalho + dúvida MEI — resposta curta + retorno para classificação
 * 3.  regime_trabalho + ambiguidade "faço bico e umas vendas" — ajuda sem classificar
 * 4.  autonomo_ir_pergunta + resposta direta sim — trilho mecânico preservado
 * 5.  autonomo_ir_pergunta + dúvida "se eu não tiver IR, não consigo?" — resposta segura
 * 6.  autonomo_ir_pergunta + MEI "sou mei, isso conta?" — resposta alinhada PF
 * 7.  renda + valor claro — trilho mecânico preservado
 * 8.  renda + dúvida "é bruto ou líquido?" — resposta curta + retorno
 * 9.  renda + resposta aproximada "gira em torno de 2500" — ajuda sem quebrar coleta
 * 10. BLINDAGEM — multi renda / multi regime não foram puxados nesta tarefa
 * 11. REGRESSÃO — composição inicial, estado_civil e topo não quebraram
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

// ===== 1. regime_trabalho + resposta direta CLT =====
await asyncTest('1. regime_trabalho: "clt" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "clt", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. regime_trabalho + dúvida MEI =====
await asyncTest('2. regime_trabalho: "tenho mei, entra como o quê?" — resposta cognitiva + retorno classificação', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "tenho mei, entra como o quê?", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("mei") || reply.includes("autonomo") || reply.includes("pessoa fisica") || reply.includes("clt"),
    `reply should reference MEI/autonomo/classif: "${result.response.reply_text}"`
  );
});

// ===== 3. regime_trabalho + ambiguidade =====
await asyncTest('3. regime_trabalho: "faço bico e umas vendas" — ajuda cognitiva sem classificar sozinho fora da regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "faço bico e umas vendas", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
});

// ===== 4. autonomo_ir_pergunta + resposta direta sim =====
await asyncTest('4. autonomo_ir_pergunta: "sim" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "sim", known_slots: {}, pending_slots: ["ir_declarado", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 5. autonomo_ir_pergunta + dúvida =====
await asyncTest('5. autonomo_ir_pergunta: "se eu não tiver IR, não consigo?" — resposta curta, segura, sem prometer', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "se eu não tiver IR, não consigo?", known_slots: {}, pending_slots: ["ir_declarado", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    !reply.includes("aprovad"),
    `reply must not promise approval: "${result.response.reply_text}"`
  );
  assert.ok(reply.length > 10, "reply must have content");
});

// ===== 6. autonomo_ir_pergunta + MEI =====
await asyncTest('6. autonomo_ir_pergunta: "sou mei, isso conta?" — resposta alinhada PF, sem inventar fluxo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "sou mei, isso conta?", known_slots: {}, pending_slots: ["ir_declarado", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("mei") || reply.includes("pessoa fisica") || reply.includes("pf") || reply.includes("cnpj") || reply.includes("ir"),
    `reply should reference MEI/PF context: "${result.response.reply_text}"`
  );
});

// ===== 7. renda + valor claro =====
await asyncTest('7. renda: "3500" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "3500", known_slots: {}, pending_slots: ["renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 8. renda + dúvida bruto/líquido =====
await asyncTest('8. renda: "é bruto ou líquido?" — resposta cognitiva curta + retorno à pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "é bruto ou líquido?", known_slots: {}, pending_slots: ["renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("liquido") || reply.includes("bruto") || reply.includes("valor") || reply.includes("mensal"),
    `reply should address bruto/liquido: "${result.response.reply_text}"`
  );
});

// ===== 9. renda + resposta aproximada =====
await asyncTest('9. renda: "depende do mês, mas gira em torno de 2500" — ajuda conversacional sem quebrar coleta', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "depende do mês, mas gira em torno de 2500", known_slots: {}, pending_slots: ["renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
});

// ===== 10. BLINDAGEM — multi renda / multi regime não puxados =====
await asyncTest('10. BLINDAGEM: regime_trabalho sem mencionar multi_regime — reply não abre multi renda/regime', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "tenho duas fontes de renda", known_slots: {}, pending_slots: ["regime_trabalho", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    !reply.includes("multi_renda") && !reply.includes("multi_regime"),
    `reply must not open multi_renda/multi_regime: "${result.response.reply_text}"`
  );
});

// ===== 11. REGRESSÃO — composição inicial, estado_civil e topo =====
await asyncTest('11. REGRESSÃO: estado_civil "solteiro" — não quebrou após expansão do bloco renda/trabalho', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "solteiro", known_slots: {}, pending_slots: ["estado_civil", "composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `estado_civil response valid: ${v.errors.join(", ")}`);
});

// ===== Summary =====
console.log(`\ncognitive_renda_trabalho.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
