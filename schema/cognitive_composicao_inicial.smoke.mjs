/**
 * cognitive_composicao_inicial.smoke.mjs
 *
 * Smoke tests para Bloco Inicial de Composição Cognitiva.
 * Stages cobertos: somar_renda_solteiro, somar_renda_familiar, quem_pode_somar, interpretar_composicao.
 *
 * 1.  somar_renda_solteiro + resposta direta positiva — trilho mecânico preservado
 * 2.  somar_renda_solteiro + dúvida "posso tentar sozinho?" — resposta curta + retorno à pergunta
 * 3.  somar_renda_solteiro + "isso melhora minhas chances?" — resposta curta, sem decidir
 * 4.  somar_renda_familiar + dúvida "posso somar com minha mãe?" — resposta curta, sem prometer
 * 5.  somar_renda_familiar + "pode ser com meu pai?" — resposta curta, sem prometer
 * 6.  quem_pode_somar + resposta aberta "vou somar com minha mãe" — trilho preservado
 * 7.  quem_pode_somar + ambiguidade "ainda não sei" — resposta curta + retorno
 * 8.  interpretar_composicao + fala familiar/parceiro ambígua — ajuda sem decidir sozinho
 * 9.  BLINDAGEM — solteiro sozinho não vira casal por inferência
 * 10. REGRESSÃO — estado_civil e topo não quebram após expansão
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

// ===== 1. somar_renda_solteiro + resposta direta =====
await asyncTest('1. somar_renda_solteiro: "sim vou somar" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "sim vou somar", known_slots: {}, pending_slots: ["composicao", "familiar", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. somar_renda_solteiro + dúvida "posso tentar sozinho?" =====
await asyncTest('2. somar_renda_solteiro: "posso tentar sozinho?" — resposta cognitiva curta + retorno à pergunta', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "posso tentar sozinho?", known_slots: {}, pending_slots: ["composicao", "familiar", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  // deve retornar à pergunta original: menciona somar ou seguir sozinho
  assert.ok(
    reply.includes("somar") || reply.includes("sozinho") || reply.includes("alguem") || reply.includes("alguém"),
    `reply must return to original question. Got: ${result.response.reply_text}`
  );
});

// ===== 3. somar_renda_solteiro + "isso melhora minhas chances?" =====
await asyncTest('3. somar_renda_solteiro: "isso melhora minhas chances?" — resposta sem decidir, retorna à pergunta', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "isso melhora minhas chances?", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  // não deve prometer aprovação
  assert.doesNotMatch(reply, /aprovad/, "reply must not promise approval");
});

// ===== 4. somar_renda_familiar + "posso somar com minha mãe?" =====
await asyncTest('4. somar_renda_familiar: "posso somar com minha mãe?" — resposta curta, sem prometer regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "posso somar com minha mãe?", known_slots: {}, pending_slots: ["familiar", "p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  // não deve prometer que qualquer pessoa serve
  assert.doesNotMatch(reply, /qualquer pessoa serve|qualquer familiar vale/, "must not overpromise");
  // deve devolver para coletar familiar
  assert.ok(
    reply.includes("familiar") || reply.includes("compor") || reply.includes("mae") || reply.includes("mãe"),
    `reply must return to familiar collection. Got: ${result.response.reply_text}`
  );
});

// ===== 5. somar_renda_familiar + "pode ser com meu pai?" =====
await asyncTest('5. somar_renda_familiar: "pode ser com meu pai?" — resposta curta, sem prometer', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "pode ser com meu pai?", known_slots: {}, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  assert.doesNotMatch(reply, /aprovad/, "must not promise approval");
});

// ===== 6. quem_pode_somar + "vou somar com minha mãe" =====
await asyncTest('6. quem_pode_somar: "vou somar com minha mãe" — trilho mecânico preservado', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "vou somar com minha mãe", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 7. quem_pode_somar + "ainda não sei" =====
await asyncTest('7. quem_pode_somar: "ainda não sei" — resposta cognitiva curta + retorno para coleta', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "ainda não sei", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  // deve devolver para coleta
  assert.ok(
    reply.includes("confirma") || reply.includes("saber") || reply.includes("compor") || reply.includes("quem"),
    `reply must return to collection. Got: ${result.response.reply_text}`
  );
});

// ===== 8. interpretar_composicao + fala ambígua familiar+parceiro =====
await asyncTest('8. interpretar_composicao: fala ambígua "talvez com minha mãe ou meu marido" — ajuda sem decidir', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "talvez com minha mãe ou meu marido", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
});

// ===== 9. BLINDAGEM — solteiro sozinho não vira casal por inferência =====
await asyncTest('9. BLINDAGEM: somar_renda_solteiro "moro junto mas vou comprar sozinho" — não reclassifica para casal', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "moro junto mas vou comprar sozinho", known_slots: { estado_civil: { value: "solteiro" } }, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  // não deve mencionar casado nem casal nem reclassificação de estado civil
  assert.doesNotMatch(reply, /casado|reclassific/, "must not reclassify as casado");
});

// ===== 10. REGRESSÃO — estado_civil e topo não quebram =====
await asyncTest('10. REGRESSÃO: estado_civil continua funcionando após expansão', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "sou casado no civil", known_slots: {}, pending_slots: ["estado_civil", "composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `estado_civil response must be valid: ${v.errors.join(", ")}`);
});

await asyncTest('10b. REGRESSÃO: inicio_rnm continua funcionando', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_rnm", message_text: "o que é RNM?", known_slots: {}, pending_slots: ["rnm_status"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.includes("rnm") || reply.includes("registro"), `inicio_rnm reply should mention RNM. Got: ${result.response.reply_text}`);
});

// ===== Resultado final =====
console.log(`\n  Resultado: ${passed} passou(aram), ${failed} falhou(aram)\n`);
if (failed > 0) process.exit(1);
