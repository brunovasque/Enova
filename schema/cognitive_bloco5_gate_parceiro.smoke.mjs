/**
 * cognitive_bloco5_gate_parceiro.smoke.mjs
 *
 * Smoke tests para stages gate do parceiro (BLOCO 5):
 *   ctps_36_parceiro, restricao_parceiro, regularizacao_restricao_parceiro.
 *
 * Contrato canônico:
 *  - ctps_36_parceiro: soma 36 meses CTPS, separado do titular
 *  - restricao_parceiro: restrição CPF parceiro, separado do titular
 *  - regularizacao_restricao_parceiro: POSSIBILIDADE REAL de regularizar (não status)
 *  - nenhum deve abrir docs, misturar com titular/familiar/P3
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

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

const heuristicOnlyRuntime = {};

// ===== 1. ctps_36_parceiro: resposta direta "sim" =====
await asyncTest('1. ctps_36_parceiro: "sim" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 2. ctps_36_parceiro: dúvida "precisa ser seguido?" =====
await asyncTest('2. ctps_36_parceiro: "precisa ser seguido?" — esclarece sem avançar', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "precisa ser seguido?", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("parceiro") || reply.includes("36") || reply.includes("ctps") || reply.includes("soma"),
    `reply should address CTPS question: "${result.response.reply_text}"`
  );
  // Não deve misturar com titular
  assert.ok(
    !reply.includes("seu cpf") && !reply.includes("voce soma"),
    `reply must not confuse parceiro with titular: "${result.response.reply_text}"`
  );
});

// ===== 3. ctps_36_parceiro: "não sei" =====
await asyncTest('3. ctps_36_parceiro: "não sei" — aceita incerteza sem avançar', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "não sei", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 4. ctps_36_parceiro: "carteira digital" =====
await asyncTest('4. ctps_36_parceiro: "ele só tem carteira digital" — esclarece que digital é aceita', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "ele só tem carteira digital, serve?", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("digital") || reply.includes("aceita") || reply.includes("registro") || reply.includes("parceiro"),
    `reply should address digital CTPS: "${result.response.reply_text}"`
  );
});

// ===== 5. restricao_parceiro: resposta direta "não" =====
await asyncTest('5. restricao_parceiro: "não" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro", message_text: "não", known_slots: { composicao: "parceiro" }, pending_slots: ["restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 6. restricao_parceiro: "nome sujo" =====
await asyncTest('6. restricao_parceiro: "ele tá com nome sujo" — responde sobre restrição do parceiro', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro", message_text: "ele tá com nome sujo", known_slots: { composicao: "parceiro" }, pending_slots: ["restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("parceiro") || reply.includes("cpf") || reply.includes("restricao") || reply.includes("restric"),
    `reply should address restriction: "${result.response.reply_text}"`
  );
  // Não deve minimizar importância
  assert.ok(
    !reply.includes("nao importa") && !reply.includes("sem problema nenhum"),
    `reply must not minimize restriction importance: "${result.response.reply_text}"`
  );
});

// ===== 7. restricao_parceiro: "isso barra?" =====
await asyncTest('7. restricao_parceiro: "isso barra o financiamento?" — não deve afirmar nem negar', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro", message_text: "isso barra o financiamento?", known_slots: { composicao: "parceiro" }, pending_slots: ["restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  // Não deve misturar com titular
  assert.ok(
    !reply.includes("seu cpf") || reply.includes("parceiro"),
    `reply must not confuse parceiro with titular: "${result.response.reply_text}"`
  );
});

// ===== 8. regularizacao_restricao_parceiro: resposta direta "sim" =====
await asyncTest('8. regularizacao_restricao_parceiro: "sim" — engine válido, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "sim", known_slots: { composicao: "parceiro", restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== 9. regularizacao_restricao_parceiro: "estou negociando" =====
await asyncTest('9. regularizacao_restricao_parceiro: "estou negociando" — pergunta sobre possibilidade de regularizar', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "estou negociando", known_slots: { composicao: "parceiro", restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  // CONTRATO: deve perguntar sobre POSSIBILIDADE de regularizar, não status
  assert.ok(
    reply.includes("possibilidade") || reply.includes("regularizar"),
    `reply must ask about possibility of regularizing: "${result.response.reply_text}"`
  );
  // Não deve perguntar "foi regularizada?"
  assert.ok(
    !reply.includes("foi regularizada"),
    `reply must NOT ask "foi regularizada?" — must ask about possibility: "${result.response.reply_text}"`
  );
});

// ===== 10. regularizacao_restricao_parceiro: "vou ver" =====
await asyncTest('10. regularizacao_restricao_parceiro: "vou ver" — aceita sem tratar como regularizado', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "vou ver", known_slots: { composicao: "parceiro", restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  // Não deve tratar "vou ver" como regularizado
  assert.ok(
    !reply.includes("regularizada") && !reply.includes("resolvid"),
    `reply must not treat "vou ver" as regularized: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("possibilidade") || reply.includes("regularizar") || reply.includes("parceiro"),
    `reply must ask about possibility of regularizing: "${result.response.reply_text}"`
  );
});

// ===== 11. regularizacao_restricao_parceiro: "talvez" =====
await asyncTest('11. regularizacao_restricao_parceiro: "talvez" — aceita como resposta válida', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "talvez", known_slots: { composicao: "parceiro", restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") || reply.includes("regularizar") || reply.includes("parceiro"),
    `reply must ask about possibility of regularizing: "${result.response.reply_text}"`
  );
});

// ===== 12. regularizacao_restricao_parceiro: "já quitei" =====
await asyncTest('12. regularizacao_restricao_parceiro: "já quitei" — pergunta sobre possibilidade, não status', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "já quitei", known_slots: { composicao: "parceiro", restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") || reply.includes("regularizar"),
    `reply must ask about possibility of regularizing: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("foi regularizada"),
    `reply must NOT ask "foi regularizada?": "${result.response.reply_text}"`
  );
});

// ===== 13. regularizacao_restricao_parceiro: default (sem trigger contextual) =====
await asyncTest('13. regularizacao_restricao_parceiro: default text — pergunta sobre possibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "hmm", known_slots: { composicao: "parceiro", restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") && reply.includes("regularizar"),
    `default reply must ask about "possibilidade de regularizar": "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("foi regularizada"),
    `default reply must NOT ask "foi regularizada?": "${result.response.reply_text}"`
  );
});

// ===== 14. BLINDAGEM: gate parceiro não mistura com titular/familiar/P3 =====
await asyncTest('14. BLINDAGEM: gate parceiro não contamina titular/familiar/P3 e não abre docs', async () => {
  // ctps_36_parceiro não deve misturar com titular
  const r1 = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "não tenho tudo registrado", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] },
    heuristicOnlyRuntime
  );
  const reply1 = normalizeForMatch(r1.response?.reply_text);
  assert.ok(
    !reply1.includes("familiar") && !reply1.includes("p3") && !reply1.includes("document") && !reply1.includes("visita"),
    `ctps_36_parceiro must not mix with familiar/P3/docs/visita: "${r1.response?.reply_text}"`
  );

  // restricao_parceiro não deve misturar com titular
  const r2 = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro", message_text: "ele tem uma divida pequena", known_slots: { composicao: "parceiro" }, pending_slots: ["restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  const reply2 = normalizeForMatch(r2.response?.reply_text);
  assert.ok(
    !reply2.includes("familiar") && !reply2.includes("p3") && !reply2.includes("document") && !reply2.includes("visita"),
    `restricao_parceiro must not mix with familiar/P3/docs/visita: "${r2.response?.reply_text}"`
  );

  // regularizacao_restricao_parceiro não deve misturar com titular
  const r3 = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "ele está tentando resolver", known_slots: { composicao: "parceiro", restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  const reply3 = normalizeForMatch(r3.response?.reply_text);
  assert.ok(
    !reply3.includes("familiar") && !reply3.includes("p3") && !reply3.includes("document") && !reply3.includes("visita"),
    `regularizacao_restricao_parceiro must not mix with familiar/P3/docs/visita: "${r3.response?.reply_text}"`
  );
});

// ===== 15. REGRESSÃO: regularizacao_restricao titular agora pergunta possibilidade (BLOCO 9) =====
await asyncTest('15. REGRESSÃO: regularizacao_restricao (titular) pergunta possibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "estou negociando", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  // Titular agora pergunta POSSIBILIDADE (BLOCO 9 contrato)
  assert.ok(
    reply.includes("possibilidade"),
    `titular reply should ask about possibilidade: "${result.response.reply_text}"`
  );
  // Não deve contaminar com parceiro
  assert.ok(
    !reply.includes("parceiro"),
    `titular reply must not mention parceiro: "${result.response.reply_text}"`
  );
});

// ===== 16. REGRESSÃO: regularizacao_restricao_p3 NÃO foi afetada =====
await asyncTest('16. REGRESSÃO: regularizacao_restricao_p3 mantém comportamento original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "já paguei", known_slots: { restricao_p3: "sim" }, pending_slots: ["regularizacao_restricao_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("p3") || reply.includes("regulariza"),
    `P3 reply should address regularização: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("parceiro"),
    `P3 reply must not mention parceiro: "${result.response.reply_text}"`
  );
});

// ===== 17. REGRESSÃO: stages do parceiro renda continuam funcionando =====
await asyncTest('17. REGRESSÃO: parceiro_tem_renda e renda_parceiro continuam funcionando', async () => {
  const r1 = await runReadOnlyCognitiveEngine(
    { current_stage: "parceiro_tem_renda", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["parceiro_tem_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(r1.response, "parceiro_tem_renda: engine produced a result");
  const v1 = validateReadOnlyCognitiveResponse(r1.response);
  assert.ok(v1.valid, `parceiro_tem_renda: response valid: ${v1.errors.join(", ")}`);

  const r2 = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro", message_text: "3000", known_slots: { composicao: "parceiro" }, pending_slots: ["renda_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(r2.response, "renda_parceiro: engine produced a result");
  const v2 = validateReadOnlyCognitiveResponse(r2.response);
  assert.ok(v2.valid, `renda_parceiro: response valid: ${v2.errors.join(", ")}`);
});

// ===== Summary =====
console.log(`\ncognitive_bloco5_gate_parceiro.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
