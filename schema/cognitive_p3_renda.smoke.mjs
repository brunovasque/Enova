/**
 * cognitive_p3_renda.smoke.mjs
 *
 * Smoke tests para Bloco P3 Cognitivo.
 * Stages cobertos: p3_tipo_pergunta, regime_trabalho_parceiro_familiar_p3,
 *   renda_parceiro_familiar_p3, inicio_multi_regime_p3_pergunta,
 *   inicio_multi_regime_p3_loop, inicio_multi_renda_p3_pergunta,
 *   inicio_multi_renda_p3_loop.
 *
 *  1. p3_tipo_pergunta + dúvida aberta "é a esposa do meu pai" — resposta cognitiva curta + retorno
 *  2. regime_trabalho_parceiro_familiar_p3 + "tem mei, entra como o quê?" — ajuda sem classificar sozinho
 *  3. renda_parceiro_familiar_p3 + valor claro — trilho mecânico preservado
 *  4. renda_parceiro_familiar_p3 + dúvida "é bruto ou líquido?" — resposta cognitiva curta + retorno
 *  5. inicio_multi_regime_p3_pergunta + resposta aberta — ajuda cognitiva sem classificar sozinho fora da regra
 *  6. inicio_multi_regime_p3_loop + ambiguidade — resposta curta e segura, sem inventar regime final
 *  7. inicio_multi_renda_p3_pergunta + dúvida — resposta cognitiva curta + retorno
 *  8. inicio_multi_renda_p3_loop + resposta aproximada — ajuda conversacional sem quebrar coleta segura
 *  9. BLINDAGEM — P3 não contaminou parceiro/familiar e não abriu docs/correspondente/visita
 * 10. REGRESSÃO — familiar, parceiro, titular, composição inicial, estado_civil e topo não quebraram
 * 11. CHECAGEM MECÂNICA — should_advance_stage sempre false em todos os stages P3
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const { createMockOpenAIFetch } = await import(
  new URL("./cognitive_openai_mock.mjs", import.meta.url).href
);

const heuristicOnlyRuntime = {};

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

// ===== 1. p3_tipo_pergunta + dúvida aberta =====
await asyncTest('1. p3_tipo_pergunta: "é a esposa do meu pai" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "p3_tipo_pergunta", message_text: "é a esposa do meu pai", known_slots: { composicao: "familiar" }, pending_slots: ["p3_tipo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // deve devolver para pergunta original sem inventar vínculo
  assert.ok(
    (reply.includes("terceira") || reply.includes("p3") || reply.includes("vinculo") || reply.includes("parentesco")) &&
    (reply.includes("composicao") || reply.includes("sistema") || reply.includes("confirma") || reply.includes("?") || reply.includes("pessoa")),
    `reply should reference p3/vinculo/terceira AND return to original question: "${result.response.reply_text}"`
  );
  // blindagem: não deve misturar com parceiro conjugal do titular nem abrir docs
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 2. regime_trabalho_parceiro_familiar_p3 + dúvida MEI =====
await asyncTest('2. regime_trabalho_parceiro_familiar_p3: "tem mei, entra como o quê?" — ajuda cognitiva sem classificar sozinho', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar_p3", message_text: "tem mei, entra como o quê?", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_p3"] },
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
  // não deve afirmar classificação definitiva nem abrir fluxo PJ/MEI paralelo
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 3. renda_parceiro_familiar_p3 + valor claro =====
await asyncTest('3. renda_parceiro_familiar_p3: "2500" — engine válido, should_advance_stage=false, trilho preservado', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro_familiar_p3", message_text: "2500", known_slots: { composicao: "familiar" }, pending_slots: ["renda_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 4. renda_parceiro_familiar_p3 + dúvida bruto/líquido =====
await asyncTest('4. renda_parceiro_familiar_p3: "é bruto ou líquido?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro_familiar_p3", message_text: "é bruto ou líquido?", known_slots: { composicao: "familiar" }, pending_slots: ["renda_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("liquido") || reply.includes("bruto") || reply.includes("renda") || reply.includes("p3"),
    `reply should address bruto/liquido/renda p3: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("visita"),
    `reply must not open docs/visita: "${result.response.reply_text}"`
  );
});

// ===== 5. inicio_multi_regime_p3_pergunta + resposta aberta =====
await asyncTest('5. inicio_multi_regime_p3_pergunta: "ele é CLT e faz bico" — ajuda cognitiva sem classificar sozinho fora da regra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_p3_pergunta", message_text: "ele é CLT e faz bico", known_slots: { composicao: "familiar" }, pending_slots: ["multi_regime_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // deve orientar sem classificar definitivamente
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 6. inicio_multi_regime_p3_loop + ambiguidade =====
await asyncTest('6. inicio_multi_regime_p3_loop: "não sei exatamente" — resposta curta e segura, sem inventar regime final', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_p3_loop", message_text: "não sei exatamente", known_slots: { composicao: "familiar" }, pending_slots: ["multi_regime_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 7. inicio_multi_renda_p3_pergunta + dúvida =====
await asyncTest('7. inicio_multi_renda_p3_pergunta: "não sei se o bico conta" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_p3_pergunta", message_text: "não sei se o bico conta", known_slots: { composicao: "familiar" }, pending_slots: ["multi_renda_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 8. inicio_multi_renda_p3_loop + resposta aproximada =====
await asyncTest('8. inicio_multi_renda_p3_loop: "gira em torno de 800" — ajuda conversacional sem quebrar coleta segura', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_p3_loop", message_text: "gira em torno de 800", known_slots: { composicao: "familiar" }, pending_slots: ["multi_renda_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // deve acolher estimativa sem assumir valor fechado perigoso
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 9. BLINDAGEM =====
await asyncTest('9. BLINDAGEM: P3 não contaminou parceiro/familiar e não abriu docs/correspondente/visita', async () => {
  // p3_tipo_pergunta não deve mencionar parceiro conjugal do titular
  const r1 = await runReadOnlyCognitiveEngine(
    { current_stage: "p3_tipo_pergunta", message_text: "é o cônjuge da minha mãe", known_slots: { composicao: "familiar" }, pending_slots: ["p3_tipo"] },
    heuristicOnlyRuntime
  );
  assert.ok(r1.response, "engine produced a result for p3_tipo_pergunta");
  assert.strictEqual(r1.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply1 = normalizeForMatch(r1.response?.reply_text);
  assert.ok(
    !reply1.includes("document") && !reply1.includes("visita") && !reply1.includes("correspondente"),
    `p3_tipo_pergunta reply must not open docs/visita/correspondente: "${r1.response?.reply_text}"`
  );

  // renda_parceiro_familiar_p3 não deve contaminar renda do titular
  const r2 = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro_familiar_p3", message_text: "quanto precisa ter?", known_slots: { composicao: "familiar" }, pending_slots: ["renda_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(r2.response, "engine produced a result for renda_parceiro_familiar_p3");
  assert.strictEqual(r2.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply2 = normalizeForMatch(r2.response?.reply_text);
  assert.ok(
    !reply2.includes("document") && !reply2.includes("correspondente") && !reply2.includes("visita"),
    `renda_parceiro_familiar_p3 reply must not open docs/correspondente/visita: "${r2.response?.reply_text}"`
  );

  // inicio_multi_regime_p3_loop com MEI não deve abrir fluxo PJ paralelo
  const r3 = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_p3_loop", message_text: "ela tem PJ também", known_slots: { composicao: "familiar" }, pending_slots: ["multi_regime_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(r3.response, "engine produced a result for inicio_multi_regime_p3_loop");
  assert.strictEqual(r3.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply3 = normalizeForMatch(r3.response?.reply_text);
  assert.ok(
    !reply3.includes("document") && !reply3.includes("correspondente") && !reply3.includes("visita"),
    `inicio_multi_regime_p3_loop reply must not open docs/correspondente/visita: "${r3.response?.reply_text}"`
  );

  // inicio_multi_renda_p3_loop não deve aceitar ambiguidade perigosa como valor fechado
  const r4 = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_p3_loop", message_text: "mais ou menos", known_slots: { composicao: "familiar" }, pending_slots: ["multi_renda_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(r4.response, "engine produced a result for inicio_multi_renda_p3_loop");
  assert.strictEqual(r4.response.should_advance_stage, false, "should_advance_stage must be false");
  const reply4 = normalizeForMatch(r4.response?.reply_text);
  assert.ok(
    !reply4.includes("document") && !reply4.includes("correspondente") && !reply4.includes("visita"),
    `inicio_multi_renda_p3_loop must not open docs/correspondente/visita: "${r4.response?.reply_text}"`
  );
});

// ===== 10. REGRESSÃO =====
await asyncTest('10. REGRESSÃO: familiar, parceiro, titular, composição inicial, estado_civil e topo não quebraram após expansão do bloco P3', async () => {
  // familiar
  const familiarResult = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar", message_text: "é autônomo", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(familiarResult.response, "regime_trabalho_parceiro_familiar: engine produced a result");
  assert.strictEqual(familiarResult.response.should_advance_stage, false, "familiar: should_advance_stage must be false");
  const vFamiliar = validateReadOnlyCognitiveResponse(familiarResult.response);
  assert.ok(vFamiliar.valid, `familiar response valid: ${vFamiliar.errors.join(", ")}`);

  // parceiro
  const parceiroResult = await runReadOnlyCognitiveEngine(
    { current_stage: "parceiro_tem_renda", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["parceiro_tem_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(parceiroResult.response, "parceiro_tem_renda: engine produced a result");
  assert.strictEqual(parceiroResult.response.should_advance_stage, false, "parceiro: should_advance_stage must be false");
  const vParceiro = validateReadOnlyCognitiveResponse(parceiroResult.response);
  assert.ok(vParceiro.valid, `parceiro response valid: ${vParceiro.errors.join(", ")}`);

  // titular renda
  const rendaResult = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "é bruto ou líquido?", known_slots: {}, pending_slots: ["renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(rendaResult.response, "renda: engine produced a result");
  assert.strictEqual(rendaResult.response.should_advance_stage, false, "renda: should_advance_stage must be false");
  const vRenda = validateReadOnlyCognitiveResponse(rendaResult.response);
  assert.ok(vRenda.valid, `renda response valid: ${vRenda.errors.join(", ")}`);

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
    { current_stage: "somar_renda_familiar", message_text: "posso somar com minha mãe?", known_slots: { composicao: "familiar" }, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(composicaoResult.response, "somar_renda_familiar: engine produced a result");
  assert.strictEqual(composicaoResult.response.should_advance_stage, false, "composicao: should_advance_stage must be false");
  const vComposicao = validateReadOnlyCognitiveResponse(composicaoResult.response);
  assert.ok(vComposicao.valid, `somar_renda_familiar response valid: ${vComposicao.errors.join(", ")}`);

  // topo
  const topoResult = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(topoResult.response, "inicio: engine produced a result");
  assert.strictEqual(topoResult.response.should_advance_stage, false, "topo: should_advance_stage must be false");
  const vTopo = validateReadOnlyCognitiveResponse(topoResult.response);
  assert.ok(vTopo.valid, `inicio response valid: ${vTopo.errors.join(", ")}`);
});

// ===== 11. CHECAGEM MECÂNICA =====
await asyncTest('11. CHECAGEM MECÂNICA: should_advance_stage=false em todos os 7 stages P3', async () => {
  const stages = [
    { stage: "p3_tipo_pergunta", text: "não sei responder", slots: ["p3_tipo"] },
    { stage: "regime_trabalho_parceiro_familiar_p3", text: "ele é registrado", slots: ["regime_trabalho_p3"] },
    { stage: "renda_parceiro_familiar_p3", text: "a renda varia", slots: ["renda_p3"] },
    { stage: "inicio_multi_regime_p3_pergunta", text: "tem mais um", slots: ["multi_regime_p3"] },
    { stage: "inicio_multi_regime_p3_loop", text: "mei", slots: ["multi_regime_p3"] },
    { stage: "inicio_multi_renda_p3_pergunta", text: "tem bico", slots: ["multi_renda_p3"] },
    { stage: "inicio_multi_renda_p3_loop", text: "mais ou menos 500", slots: ["multi_renda_p3"] }
  ];
  for (const { stage, text, slots } of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: { composicao: "familiar" }, pending_slots: slots },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} response valid: ${v.errors.join(", ")}`);
  }
});

// ===== Summary =====
console.log(`\ncognitive_p3_renda.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
