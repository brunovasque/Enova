/**
 * cognitive_familiar_renda.smoke.mjs
 *
 * Smoke tests para Bloco Familiar Cognitivo.
 * Stages cobertos: pais_casados_civil_pergunta, confirmar_avo_familiar,
 *   renda_familiar_valor, regime_trabalho_parceiro_familiar, renda_parceiro_familiar,
 *   inicio_multi_regime_familiar_pergunta, inicio_multi_regime_familiar_loop,
 *   inicio_multi_renda_familiar_pergunta, inicio_multi_renda_familiar_loop.
 * somar_renda_familiar já coberto pelo bloco composicao inicial.
 *
 *  1. somar_renda_familiar + dúvida "posso somar com minha mãe?" — resposta cognitiva curta + retorno
 *  2. pais_casados_civil_pergunta + ambiguidade "moram juntos, mas não são casados" — resposta curta e segura
 *  3. confirmar_avo_familiar + resposta aberta — sem quebrar trilho mecânico
 *  4. renda_familiar_valor + dúvida "é bruto ou líquido?" — resposta cognitiva curta + retorno
 *  5. regime_trabalho_parceiro_familiar + dúvida "tem mei, entra como o quê?" — ajuda sem classificar sozinho
 *  6. renda_parceiro_familiar + valor claro — trilho mecânico preservado
 *  7. inicio_multi_regime_familiar_pergunta + resposta aberta — ajuda cognitiva sem classificar sozinho fora da regra
 *  8. inicio_multi_regime_familiar_loop + ambiguidade — resposta curta e segura, sem inventar regime final
 *  9. inicio_multi_renda_familiar_pergunta + dúvida — resposta cognitiva curta + retorno
 * 10. inicio_multi_renda_familiar_loop + resposta aproximada — ajuda conversacional sem quebrar coleta segura
 * 11. BLINDAGEM — familiar não contaminou parceiro/P3 e não abriu docs/correspondente/visita
 * 12. REGRESSÃO — parceiro, titular, composição inicial, estado_civil e topo não quebraram
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

// ===== 1. somar_renda_familiar + dúvida =====
await asyncTest('1. somar_renda_familiar: "posso somar com minha mãe?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "posso somar com minha mãe?", known_slots: { composicao: "familiar" }, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("mae") || reply.includes("familiar") || reply.includes("composicao") || reply.includes("sistema"),
    `reply should address the question about composing with mae: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem misturar com parceiro
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("parceiro"),
    `reply must not open docs or mix with parceiro: "${result.response.reply_text}"`
  );
});

// ===== 2. pais_casados_civil_pergunta + ambiguidade =====
await asyncTest('2. pais_casados_civil_pergunta: "moram juntos, mas não são casados" — resposta curta e segura + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "pais_casados_civil_pergunta", message_text: "moram juntos, mas não são casados", known_slots: { composicao: "familiar" }, pending_slots: ["pais_casados_civil"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // deve devolver para a pergunta original — perguntar sobre casamento civil
  assert.ok(
    reply.includes("civil") || reply.includes("casad") || reply.includes("sim") || reply.includes("nao"),
    `reply should return to original question about casamento civil: "${result.response.reply_text}"`
  );
  // blindagem: não deve misturar com parceiro nem abrir docs
  assert.ok(
    !reply.includes("document") && !reply.includes("parceiro conjugal"),
    `reply must not open docs or mix with parceiro conjugal: "${result.response.reply_text}"`
  );
});

// ===== 3. confirmar_avo_familiar + resposta aberta =====
await asyncTest('3. confirmar_avo_familiar: "não sei informar" — sem quebrar o trilho mecânico', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_avo_familiar", message_text: "não sei informar", known_slots: { composicao: "familiar" }, pending_slots: ["confirmar_avo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve inventar vínculo nem misturar com P3
  assert.ok(
    !reply.includes("p3") && !reply.includes("terceiro") && !reply.includes("terceira pessoa"),
    `reply must not mix with P3: "${result.response.reply_text}"`
  );
  // não deve abrir docs
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 4. renda_familiar_valor + dúvida =====
await asyncTest('4. renda_familiar_valor: "é bruto ou líquido?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_familiar_valor", message_text: "é bruto ou líquido?", known_slots: { composicao: "familiar" }, pending_slots: ["renda_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("liquido") || reply.includes("bruto") || reply.includes("renda") || reply.includes("familiar"),
    `reply should address bruto/liquido/renda familiar: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem misturar com titular/parceiro
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 5. regime_trabalho_parceiro_familiar + dúvida aberta =====
await asyncTest('5. regime_trabalho_parceiro_familiar: "tem mei, entra como o quê?" — ajuda cognitiva sem classificar sozinho fora da regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar", message_text: "tem mei, entra como o quê?", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_familiar"] },
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
  // blindagem: não deve afirmar classificação definitiva e não deve abrir fluxo PJ paralelo
  assert.ok(
    !reply.includes("regime definido") && !reply.includes("regime confirmado"),
    `reply must not claim to have definitively classified regime: "${result.response.reply_text}"`
  );
  // não deve misturar com parceiro conjugal
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 6. renda_parceiro_familiar + valor claro =====
await asyncTest('6. renda_parceiro_familiar: "1800" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro_familiar", message_text: "1800", known_slots: { composicao: "familiar" }, pending_slots: ["renda_parceiro_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 7. inicio_multi_regime_familiar_pergunta + resposta aberta =====
await asyncTest('7. inicio_multi_regime_familiar_pergunta: "ele é CLT e faz extra" — ajuda cognitiva sem classificar sozinho fora da regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_familiar_pergunta", message_text: "ele é CLT e faz extra", known_slots: { composicao: "familiar" }, pending_slots: ["multi_regime_familiar"] },
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

// ===== 8. inicio_multi_regime_familiar_loop + ambiguidade =====
await asyncTest('8. inicio_multi_regime_familiar_loop: "tem mei também" — resposta curta e segura, sem inventar regime final', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_familiar_loop", message_text: "tem mei também", known_slots: { composicao: "familiar" }, pending_slots: ["multi_regime_familiar"] },
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
  // não deve abrir docs nem fluxo PJ/MEI paralelo
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 9. inicio_multi_renda_familiar_pergunta + dúvida =====
await asyncTest('9. inicio_multi_renda_familiar_pergunta: "a renda dele varia, isso conta?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_familiar_pergunta", message_text: "a renda dele varia, isso conta?", known_slots: { composicao: "familiar" }, pending_slots: ["multi_renda_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    reply.includes("varia") || reply.includes("media") || reply.includes("renda") || reply.includes("familiar") || reply.includes("alem"),
    `reply should address renda variavel/familiar: "${result.response.reply_text}"`
  );
  // blindagem: não deve abrir docs nem misturar com renda do titular
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("correspondente"),
    `reply must not open docs/correspondente: "${result.response.reply_text}"`
  );
});

// ===== 10. inicio_multi_renda_familiar_loop + resposta aproximada =====
await asyncTest('10. inicio_multi_renda_familiar_loop: "depende, mas gira em torno de 900" — ajuda conversacional sem quebrar coleta segura', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_familiar_loop", message_text: "depende, mas gira em torno de 900", known_slots: { composicao: "familiar" }, pending_slots: ["multi_renda_familiar"] },
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
    !reply.includes("valor confirmado") && !reply.includes("900 confirmado"),
    `reply must not assume closed value without confirmation: "${result.response.reply_text}"`
  );
  // não deve abrir docs
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 11. BLINDAGEM =====
await asyncTest('11. BLINDAGEM: familiar não contaminou parceiro/P3 e não abriu docs/correspondente/visita', async () => {
  // pais_casados_civil_pergunta não deve misturar com parceiro conjugal
  const r1 = await runReadOnlyCognitiveEngine(
    { current_stage: "pais_casados_civil_pergunta", message_text: "meus pais são separados", known_slots: { composicao: "familiar" }, pending_slots: ["pais_casados_civil"] },
    heuristicOnlyRuntime
  );
  const reply1 = normalizeForMatch(r1.response?.reply_text);
  assert.ok(
    !reply1.includes("parceiro conjugal") && !reply1.includes("p3") && !reply1.includes("document") && !reply1.includes("visita"),
    `pais_casados_civil_pergunta reply must not mix with parceiro/P3/docs/visita: "${r1.response?.reply_text}"`
  );

  // renda_familiar_valor não deve contaminar renda do titular ou parceiro
  const r2 = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_familiar_valor", message_text: "quanto precisa ter?", known_slots: { composicao: "familiar" }, pending_slots: ["renda_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(r2.response, "engine produced a result for renda_familiar_valor");
  assert.strictEqual(r2.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply2 = normalizeForMatch(r2.response.reply_text);
  assert.ok(
    !reply2.includes("document") && !reply2.includes("correspondente") && !reply2.includes("visita"),
    `renda_familiar_valor reply must not open docs/correspondente/visita: "${r2.response?.reply_text}"`
  );

  // inicio_multi_regime_familiar_loop com MEI não deve abrir PJ paralelo
  const r3 = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_familiar_loop", message_text: "ela tem PJ também", known_slots: { composicao: "familiar" }, pending_slots: ["multi_regime_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(r3.response, "engine produced a result for inicio_multi_regime_familiar_loop");
  assert.strictEqual(r3.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply3 = normalizeForMatch(r3.response.reply_text);
  assert.ok(
    !reply3.includes("document") && !reply3.includes("correspondente") && !reply3.includes("visita"),
    `inicio_multi_regime_familiar_loop reply must not open docs/correspondente/visita: "${r3.response?.reply_text}"`
  );

  // regime_trabalho_parceiro_familiar não deve confundir familiar com parceiro conjugal
  const r4 = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar", message_text: "é aposentado", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(r4.response, "engine produced a result for regime_trabalho_parceiro_familiar");
  assert.strictEqual(r4.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply4 = normalizeForMatch(r4.response.reply_text);
  assert.ok(
    !reply4.includes("document") && !reply4.includes("correspondente") && !reply4.includes("visita"),
    `regime_trabalho_parceiro_familiar reply must not open docs/correspondente/visita: "${r4.response?.reply_text}"`
  );
});

// ===== 12. REGRESSÃO =====
await asyncTest('12. REGRESSÃO: parceiro, titular, composição inicial, estado_civil e topo não quebraram após expansão do bloco familiar', async () => {
  // parceiro
  const parceiroResult = await runReadOnlyCognitiveEngine(
    { current_stage: "parceiro_tem_renda", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["parceiro_tem_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(parceiroResult.response, "parceiro_tem_renda: engine produced a result");
  assert.strictEqual(parceiroResult.response.should_advance_stage, false, "parceiro_tem_renda: should_advance_stage must be false");
  const vParceiro = validateReadOnlyCognitiveResponse(parceiroResult.response);
  assert.ok(vParceiro.valid, `parceiro_tem_renda response valid: ${vParceiro.errors.join(", ")}`);

  // regime_trabalho (titular)
  const regimeResult = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "clt", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(regimeResult.response, "regime_trabalho: engine produced a result");
  assert.strictEqual(regimeResult.response.should_advance_stage, false, "regime_trabalho: should_advance_stage must be false");
  const vRegime = validateReadOnlyCognitiveResponse(regimeResult.response);
  assert.ok(vRegime.valid, `regime_trabalho response valid: ${vRegime.errors.join(", ")}`);

  // estado_civil
  const estadoCivilResult = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "casado", known_slots: {}, pending_slots: ["estado_civil", "composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(estadoCivilResult.response, "estado_civil: engine produced a result");
  assert.strictEqual(estadoCivilResult.response.should_advance_stage, false, "estado_civil: should_advance_stage must be false");
  const vEstadoCivil = validateReadOnlyCognitiveResponse(estadoCivilResult.response);
  assert.ok(vEstadoCivil.valid, `estado_civil response valid: ${vEstadoCivil.errors.join(", ")}`);

  // composicao inicial
  const composicaoResult = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "vou seguir sozinho", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(composicaoResult.response, "somar_renda_solteiro: engine produced a result");
  assert.strictEqual(composicaoResult.response.should_advance_stage, false, "somar_renda_solteiro: should_advance_stage must be false");
  const vComposicao = validateReadOnlyCognitiveResponse(composicaoResult.response);
  assert.ok(vComposicao.valid, `somar_renda_solteiro response valid: ${vComposicao.errors.join(", ")}`);

  // topo
  const topoResult = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(topoResult.response, "inicio: engine produced a result");
  assert.strictEqual(topoResult.response.should_advance_stage, false, "inicio: should_advance_stage must be false");
  const vTopo = validateReadOnlyCognitiveResponse(topoResult.response);
  assert.ok(vTopo.valid, `inicio response valid: ${vTopo.errors.join(", ")}`);

  // aprofundamento renda
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
console.log(`\ncognitive_familiar_renda.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
