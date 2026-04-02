/**
 * cognitive_gate_finais.smoke.mjs
 *
 * Smoke tests para Bloco Gates Finais de Viabilidade Cognitiva.
 * Stages cobertos: ir_declarado, autonomo_compor_renda, ctps_36,
 *   ctps_36_parceiro, ctps_36_parceiro_p3, dependente,
 *   restricao, restricao_parceiro, restricao_parceiro_p3,
 *   regularizacao_restricao, regularizacao_restricao_parceiro,
 *   regularizacao_restricao_p3.
 *
 *  1.  ir_declarado + "não declaro, ainda consigo?"
 *  2.  autonomo_compor_renda + "posso tentar sozinho?"
 *  3.  ctps_36 + "precisa ser seguido?"
 *  4.  ctps_36_parceiro com resposta direta (trilho mecânico preservado)
 *  5.  ctps_36_parceiro_p3 + dúvida
 *  6.  dependente com resposta direta (trilho mecânico preservado)
 *  7.  restricao + "tenho nome sujo, isso barra?"
 *  8.  restricao_parceiro com resposta aberta
 *  9.  restricao_parceiro_p3 com resposta aberta
 * 10.  regularizacao_restricao + "já quitei, mas ainda não baixou"
 * 11.  regularizacao_restricao_parceiro + dúvida
 * 12.  regularizacao_restricao_p3 + dúvida
 * 13.  BLINDAGEM: nenhum gate abriu docs/correspondente/visita
 * 14.  REGRESSÃO: P3, familiar, parceiro, titular, composição inicial,
 *       estado_civil e topo não quebraram
 * 15.  CHECAGEM MECÂNICA: should_advance_stage=false em todos os 12 stages
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
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

function nf(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ===== 1. ir_declarado + dúvida =====
await asyncTest('1. ir_declarado: "não declaro, ainda consigo?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "não declaro, ainda consigo?", known_slots: { regime_trabalho: "autonomo" }, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    (reply.includes("ir") || reply.includes("imposto") || reply.includes("declara")) &&
    (reply.includes("sim") || reply.includes("nao") || reply.includes("?") || reply.includes("confirma")),
    `reply should address IR and return to question: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 2. autonomo_compor_renda + dúvida =====
await asyncTest('2. autonomo_compor_renda: "posso tentar sozinho?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_compor_renda", message_text: "posso tentar sozinho?", known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao" }, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    reply.includes("sozinho") || reply.includes("compor") || reply.includes("composicao") || reply.includes("sistema"),
    `reply should address composicao/sozinho: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 3. ctps_36 + dúvida =====
await asyncTest('3. ctps_36: "precisa ser seguido?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "precisa ser seguido?", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    reply.includes("ctps") || reply.includes("carteira") || reply.includes("36") || reply.includes("vinculo") || reply.includes("periodo"),
    `reply should address CTPS/36 meses: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 4. ctps_36_parceiro resposta direta =====
await asyncTest('4. ctps_36_parceiro: "sim" — engine válido, should_advance_stage=false, trilho preservado', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 5. ctps_36_parceiro_p3 + dúvida =====
await asyncTest('5. ctps_36_parceiro_p3: "serve carteira digital?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro_p3", message_text: "serve carteira digital?", known_slots: { composicao: "familiar" }, pending_slots: ["ctps_36_parceiro_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 6. dependente resposta direta =====
await asyncTest('6. dependente: "não" — engine válido, should_advance_stage=false, trilho preservado', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "dependente", message_text: "não", known_slots: {}, pending_slots: ["dependente"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 7. restricao + dúvida =====
await asyncTest('7. restricao: "tenho nome sujo, isso barra?" — resposta curta, segura, sem prometer, sem alterar gate', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao", message_text: "tenho nome sujo, isso barra?", known_slots: {}, pending_slots: ["restricao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve prometer aprovação nem cravar reprovação
  assert.ok(!reply.includes("aprovado") && !reply.includes("aprovada"), `reply must not promise approval: "${result.response.reply_text}"`);
  assert.ok(
    reply.includes("restricao") || reply.includes("cpf") || reply.includes("sistema") || reply.includes("verificar") || reply.includes("confirma"),
    `reply should address restricao/cpf: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 8. restricao_parceiro resposta aberta =====
await asyncTest('8. restricao_parceiro: "estou pagando" — ajuda cognitiva sem quebrar o trilho', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro", message_text: "estou pagando", known_slots: { composicao: "parceiro" }, pending_slots: ["restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 9. restricao_parceiro_p3 resposta aberta =====
await asyncTest('9. restricao_parceiro_p3: "é pouca coisa" — ajuda cognitiva sem quebrar o trilho', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro_p3", message_text: "é pouca coisa", known_slots: { composicao: "familiar" }, pending_slots: ["restricao_parceiro_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 10. regularizacao_restricao + dúvida =====
await asyncTest('10. regularizacao_restricao: "já quitei, mas ainda não baixou" — resposta curta, segura, sem validar sozinho', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "já quitei, mas ainda não baixou", known_slots: { restricao: true }, pending_slots: ["regularizacao_restricao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve validar regularização por conta própria
  assert.ok(
    reply.includes("cpf") || reply.includes("regulariz") || reply.includes("sistema") || reply.includes("confirma") || reply.includes("formal"),
    `reply should address regularizacao/cpf: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 11. regularizacao_restricao_parceiro + dúvida =====
await asyncTest('11. regularizacao_restricao_parceiro: "estou negociando" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "estou negociando", known_slots: { composicao: "parceiro", restricao_parceiro: true }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 12. regularizacao_restricao_p3 + dúvida =====
await asyncTest('12. regularizacao_restricao_p3: "isso já serve?" — resposta cognitiva curta + retorno para pergunta original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "isso já serve?", known_slots: { composicao: "familiar" }, pending_slots: ["regularizacao_restricao_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs/correspondente/visita: "${result.response.reply_text}"`
  );
});

// ===== 13. BLINDAGEM =====
await asyncTest('13. BLINDAGEM: nenhum gate final abriu docs/correspondente/visita', async () => {
  const stageCases = [
    { stage: "ir_declarado", text: "não declaro", slots: ["ir_declarado"] },
    { stage: "autonomo_compor_renda", text: "preciso compor?", slots: ["composicao"] },
    { stage: "ctps_36", text: "serve carteira digital?", slots: ["ctps_36"] },
    { stage: "restricao", text: "tenho nome sujo", slots: ["restricao"] },
    { stage: "regularizacao_restricao", text: "estou negociando", slots: ["regularizacao_restricao"] },
    { stage: "restricao_parceiro_p3", text: "isso barra?", slots: ["restricao_parceiro_p3"] },
    { stage: "regularizacao_restricao_p3", text: "já quitei", slots: ["regularizacao_restricao_p3"] }
  ];
  for (const { stage, text, slots } of stageCases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: slots },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
    const reply = nf(result.response?.reply_text);
    assert.ok(
      !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
      `${stage}: reply must not open docs/correspondente/visita: "${result.response?.reply_text}"`
    );
  }
});

// ===== 14. REGRESSÃO =====
await asyncTest('14. REGRESSÃO: P3, familiar, parceiro, titular, composição inicial, estado_civil e topo não quebraram', async () => {
  const regressionCases = [
    { stage: "p3_tipo_pergunta", text: "não sei", slots: ["p3_tipo"], known: { composicao: "familiar" } },
    { stage: "regime_trabalho_parceiro_familiar", text: "é autônomo", slots: ["regime_trabalho_familiar"], known: { composicao: "familiar" } },
    { stage: "parceiro_tem_renda", text: "sim", slots: ["parceiro_tem_renda"], known: { composicao: "parceiro" } },
    { stage: "renda", text: "é bruto ou líquido?", slots: ["renda"], known: {} },
    { stage: "somar_renda_solteiro", text: "posso ir sozinho?", slots: ["composicao"], known: {} },
    { stage: "estado_civil", text: "casado", slots: ["estado_civil", "composicao"], known: {} },
    { stage: "inicio", text: "oi", slots: [], known: {} }
  ];
  for (const { stage, text, slots, known } of regressionCases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: known, pending_slots: slots },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} response valid: ${v.errors.join(", ")}`);
  }
});

// ===== 15. CHECAGEM MECÂNICA =====
await asyncTest('15. CHECAGEM MECÂNICA: should_advance_stage=false em todos os 12 stages dos gates finais', async () => {
  const stages = [
    { stage: "ir_declarado", text: "sim", slots: ["ir_declarado"] },
    { stage: "autonomo_compor_renda", text: "vou compor", slots: ["composicao"] },
    { stage: "ctps_36", text: "não", slots: ["ctps_36"] },
    { stage: "ctps_36_parceiro", text: "sim", slots: ["ctps_36_parceiro"] },
    { stage: "ctps_36_parceiro_p3", text: "não", slots: ["ctps_36_parceiro_p3"] },
    { stage: "dependente", text: "sim", slots: ["dependente"] },
    { stage: "restricao", text: "não", slots: ["restricao"] },
    { stage: "restricao_parceiro", text: "sim", slots: ["restricao_parceiro"] },
    { stage: "restricao_parceiro_p3", text: "não", slots: ["restricao_parceiro_p3"] },
    { stage: "regularizacao_restricao", text: "sim", slots: ["regularizacao_restricao"] },
    { stage: "regularizacao_restricao_parceiro", text: "não", slots: ["regularizacao_restricao_parceiro"] },
    { stage: "regularizacao_restricao_p3", text: "sim", slots: ["regularizacao_restricao_p3"] }
  ];
  for (const { stage, text, slots } of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: slots },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} response valid: ${v.errors.join(", ")}`);
    const reply = nf(result.response?.reply_text);
    assert.ok(
      !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
      `${stage}: reply must not open docs/correspondente/visita: "${result.response?.reply_text}"`
    );
  }
});

// ===== Summary =====
console.log(`\ncognitive_gate_finais.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
