/**
 * cognitive_bloco7_contrato_p3.smoke.mjs
 *
 * Smoke tests de contrato canônico para BLOCO 7 — P3.
 * Validações do contrato obrigatório:
 *
 *  1. regularizacao_restricao_p3 pergunta POSSIBILIDADE (não status)
 *  2. regularizacao_restricao_p3 "vou ver" → guidance com possibilidade
 *  3. regularizacao_restricao_p3 "talvez" → guidance com possibilidade
 *  4. regularizacao_restricao_p3 "está tentando" → guidance com possibilidade
 *  5. regularizacao_restricao_p3 "não sei" → guidance com possibilidade
 *  6. ctps_36_parceiro_p3 default guidance inclui "não sei" como opção
 *  7. ctps_36_parceiro_p3 "precisa ser seguido?" → inclui "não sei" para P3
 *  8. ctps_36_parceiro_p3 "serve carteira digital?" → inclui "não sei" para P3
 *  9. ctps_36_parceiro_p3 "não chego nos 36" → inclui "não sei" para P3
 * 10. regularizacao_restricao (titular) pergunta POSSIBILIDADE (BLOCO 9 contrato)
 * 11. ctps_36 (titular) inclui "não sei" como opção (BLOCO 9 contrato)
 * 12. ctps_36_parceiro (P2) inclui "não sei" como opção (BLOCO 9 contrato)
 * 13. P3 separação: p3_tipo_pergunta não mistura com parceiro conjugal
 * 14. P3 separação: renda_parceiro_familiar_p3 não pede docs
 * 15. P3 separação: regime_trabalho_parceiro_familiar_p3 separado do familiar P2
 * 16. REGRESSÃO: regularizacao_restricao_parceiro (P2) continua perguntando possibilidade
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

// ===== 1. regularizacao_restricao_p3 default → POSSIBILIDADE =====
await asyncTest('1. regularizacao_restricao_p3: default guidance pergunta POSSIBILIDADE (não status)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "opa", known_slots: { composicao: "familiar" }, pending_slots: ["regularizacao_restricao_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") && reply.includes("p3"),
    `reply must ask about POSSIBILIDADE for P3: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("nao sei") || reply.includes("não sei"),
    `reply must include "não sei" as option: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("foi regularizada"),
    `reply must NOT ask "foi regularizada" (status): "${result.response.reply_text}"`
  );
});

// ===== 2. regularizacao_restricao_p3 "vou ver" =====
await asyncTest('2. regularizacao_restricao_p3: "vou ver" → guidance com possibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "vou ver", known_slots: { composicao: "familiar" }, pending_slots: ["regularizacao_restricao_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") && reply.includes("p3"),
    `reply must ask about possibilidade for P3: "${result.response.reply_text}"`
  );
});

// ===== 3. regularizacao_restricao_p3 "talvez" =====
await asyncTest('3. regularizacao_restricao_p3: "talvez" → guidance com possibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "talvez", known_slots: { composicao: "familiar" }, pending_slots: ["regularizacao_restricao_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") && reply.includes("p3"),
    `reply must ask about possibilidade: "${result.response.reply_text}"`
  );
});

// ===== 4. regularizacao_restricao_p3 "está tentando" =====
await asyncTest('4. regularizacao_restricao_p3: "está tentando" → guidance com possibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "está tentando", known_slots: { composicao: "familiar" }, pending_slots: ["regularizacao_restricao_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") && reply.includes("p3"),
    `reply must ask about possibilidade: "${result.response.reply_text}"`
  );
});

// ===== 5. regularizacao_restricao_p3 "não sei" =====
await asyncTest('5. regularizacao_restricao_p3: "não sei" → guidance com possibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "não sei", known_slots: { composicao: "familiar" }, pending_slots: ["regularizacao_restricao_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") && reply.includes("p3"),
    `reply must ask about possibilidade: "${result.response.reply_text}"`
  );
});

// ===== 6. ctps_36_parceiro_p3 default → inclui "não sei" =====
await asyncTest('6. ctps_36_parceiro_p3: default guidance inclui "não sei" como opção', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro_p3", message_text: "opa", known_slots: { composicao: "familiar" }, pending_slots: ["ctps_36_parceiro_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("nao sei") || reply.includes("não sei"),
    `P3 ctps reply must include "não sei" as option: "${result.response.reply_text}"`
  );
});

// ===== 7. ctps_36_parceiro_p3 "precisa ser seguido?" → inclui "não sei" =====
await asyncTest('7. ctps_36_parceiro_p3: "precisa ser seguido?" → inclui "não sei" para P3', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro_p3", message_text: "precisa ser seguido?", known_slots: { composicao: "familiar" }, pending_slots: ["ctps_36_parceiro_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("nao sei") || reply.includes("não sei"),
    `P3 ctps "seguido" reply must include "não sei": "${result.response.reply_text}"`
  );
});

// ===== 8. ctps_36_parceiro_p3 "serve carteira digital?" → inclui "não sei" =====
await asyncTest('8. ctps_36_parceiro_p3: "serve carteira digital?" → inclui "não sei" para P3', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro_p3", message_text: "serve carteira digital da ctps?", known_slots: { composicao: "familiar" }, pending_slots: ["ctps_36_parceiro_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("nao sei") || reply.includes("não sei"),
    `P3 ctps "digital" reply must include "não sei": "${result.response.reply_text}"`
  );
});

// ===== 9. ctps_36_parceiro_p3 "não chego nos 36" → inclui "não sei" =====
await asyncTest('9. ctps_36_parceiro_p3: "não chego nos 36" → inclui "não sei" para P3', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro_p3", message_text: "acho que não chego nos 36", known_slots: { composicao: "familiar" }, pending_slots: ["ctps_36_parceiro_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("nao sei") || reply.includes("não sei"),
    `P3 ctps "não chego" reply must include "não sei": "${result.response.reply_text}"`
  );
});

// ===== 10. regularizacao_restricao (TITULAR) pergunta POSSIBILIDADE (BLOCO 9 contrato) =====
await asyncTest('10. regularizacao_restricao (titular): pergunta POSSIBILIDADE "possibilidade de regularizar"', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "opa", known_slots: { restricao: true }, pending_slots: ["regularizacao_restricao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade"),
    `titular reply must ask about POSSIBILIDADE: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("nao sei"),
    `titular reply must accept "não sei": "${result.response.reply_text}"`
  );
});

// ===== 11. ctps_36 (TITULAR) inclui "não sei" como opção (BLOCO 9 contrato) =====
await asyncTest('11. ctps_36 (titular): default inclui "não sei" como opção', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "opa", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("nao sei"),
    `titular ctps reply must include "não sei": "${result.response.reply_text}"`
  );
});

// ===== 12. ctps_36_parceiro (P2) inclui "não sei" como opção (BLOCO 9 contrato) =====
await asyncTest('12. ctps_36_parceiro (P2): default inclui "não sei" como opção', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "opa", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("nao sei"),
    `parceiro ctps reply must include "não sei": "${result.response.reply_text}"`
  );
});

// ===== 13. P3 separação: p3_tipo_pergunta =====
await asyncTest('13. P3 separação: p3_tipo_pergunta não mistura com parceiro conjugal do titular', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "p3_tipo_pergunta", message_text: "quem eu coloco?", known_slots: { composicao: "familiar" }, pending_slots: ["p3_tipo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 14. P3 separação: renda_parceiro_familiar_p3 não pede docs =====
await asyncTest('14. P3 separação: renda_parceiro_familiar_p3 não pede docs', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro_familiar_p3", message_text: "ela ganha uns 2000", known_slots: { composicao: "familiar" }, pending_slots: ["renda_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    !reply.includes("document") && !reply.includes("holerite") && !reply.includes("contracheque") && !reply.includes("correspondente") && !reply.includes("visita"),
    `P3 renda reply must not ask for docs: "${result.response.reply_text}"`
  );
});

// ===== 15. P3 separação: regime_trabalho_parceiro_familiar_p3 =====
await asyncTest('15. P3 separação: regime_trabalho_parceiro_familiar_p3 separado do familiar P2', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar_p3", message_text: "não sei qual", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_p3"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  // Must reference P3 or regime
  assert.ok(
    reply.includes("p3") || reply.includes("regime") || reply.includes("clt") || reply.includes("autonomo"),
    `P3 regime reply must address regime: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("correspondente") && !reply.includes("visita"),
    `P3 regime reply must not open docs: "${result.response.reply_text}"`
  );
});

// ===== 16. REGRESSÃO: regularizacao_restricao_parceiro (P2) =====
await asyncTest('16. REGRESSÃO: regularizacao_restricao_parceiro (P2) continua perguntando possibilidade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "opa", known_slots: { composicao: "parceiro", restricao_parceiro: true }, pending_slots: ["regularizacao_restricao_parceiro"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("possibilidade") && reply.includes("parceiro"),
    `P2 regularizacao reply must ask about possibilidade for parceiro: "${result.response.reply_text}"`
  );
});

// ===== Summary =====
console.log(`\ncognitive_bloco7_contrato_p3.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
