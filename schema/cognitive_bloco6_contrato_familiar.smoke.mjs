/**
 * cognitive_bloco6_contrato_familiar.smoke.mjs
 *
 * Smoke tests para CONTRATO CANÔNICO DO BLOCO 6 (FAMILIAR).
 * Cobre os pontos sensíveis obrigatórios do contrato:
 *
 *  1. confirmar_avo_familiar + LOAS → não tratar como renda financiável
 *  2. confirmar_avo_familiar + BPC → não tratar como renda financiável
 *  3. confirmar_avo_familiar + pensão alimentícia → não tratar como renda financiável
 *  4. confirmar_avo_familiar + idade 68+ → aviso de restrição
 *  5. confirmar_avo_familiar + "só recebe benefício" → aviso que benefício sozinho não compõe
 *  6. regime_trabalho_parceiro_familiar + pensionista → aviso de não financiável
 *  7. regime_trabalho_parceiro_familiar + LOAS/BPC → aviso de não financiável
 *  8. regime_trabalho_parceiro_familiar + "só benefício" → aviso que benefício sozinho não compõe
 *  9. BLINDAGEM: familiar não confunde com parceiro conjugal
 * 10. BLINDAGEM: familiar não abre P3 nem docs
 * 11. BLINDAGEM: multi-regime/multi-renda do familiar não contamina titular
 * 12. REGRESSÃO: stages existentes do bloco 6 continuam funcionando
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

function normalizeForMatch(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ===== 1. confirmar_avo_familiar + LOAS =====
await asyncTest('1. confirmar_avo_familiar: "minha avó recebe LOAS" — aviso que LOAS não é renda financiável', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_avo_familiar", message_text: "minha avó recebe LOAS", known_slots: { composicao: "familiar" }, pending_slots: ["confirmar_avo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("financ") || reply.includes("nao entr") || reply.includes("nao cont") || reply.includes("loas") || reply.includes("beneficio"),
    `reply should warn about LOAS not being financeable: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("parceiro conjugal"),
    `reply must not open docs or mix with parceiro: "${result.response.reply_text}"`
  );
});

// ===== 2. confirmar_avo_familiar + BPC =====
await asyncTest('2. confirmar_avo_familiar: "ele recebe BPC" — aviso que BPC não é renda financiável', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_avo_familiar", message_text: "ele recebe BPC", known_slots: { composicao: "familiar" }, pending_slots: ["confirmar_avo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("financ") || reply.includes("nao entr") || reply.includes("nao cont") || reply.includes("bpc") || reply.includes("beneficio"),
    `reply should warn about BPC not being financeable: "${result.response.reply_text}"`
  );
});

// ===== 3. confirmar_avo_familiar + pensão alimentícia =====
await asyncTest('3. confirmar_avo_familiar: "recebe pensão alimentícia" — aviso que pensão alimentícia não é renda financiável', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_avo_familiar", message_text: "recebe pensão alimentícia", known_slots: { composicao: "familiar" }, pending_slots: ["confirmar_avo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("financ") || reply.includes("nao entr") || reply.includes("nao cont") || reply.includes("pensao") || reply.includes("beneficio"),
    `reply should warn about pensão alimentícia not being financeable: "${result.response.reply_text}"`
  );
});

// ===== 4. confirmar_avo_familiar + idade 68+ =====
await asyncTest('4. confirmar_avo_familiar: "ela tem 72 anos" — aviso de restrição por idade', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_avo_familiar", message_text: "ela tem 72 anos", known_slots: { composicao: "familiar" }, pending_slots: ["confirmar_avo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("68") || reply.includes("idade") || reply.includes("restric") || reply.includes("anos"),
    `reply should warn about age restriction: "${result.response.reply_text}"`
  );
});

// ===== 5. confirmar_avo_familiar + "só recebe benefício" =====
await asyncTest('5. confirmar_avo_familiar: "só recebe aposentadoria" — aviso que benefício sozinho não compõe', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_avo_familiar", message_text: "só recebe aposentadoria", known_slots: { composicao: "familiar" }, pending_slots: ["confirmar_avo"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("financ") || reply.includes("sozinho") || reply.includes("outra renda") || reply.includes("beneficio"),
    `reply should warn about benefício alone: "${result.response.reply_text}"`
  );
});

// ===== 6. regime_trabalho_parceiro_familiar + pensionista =====
await asyncTest('6. regime_trabalho_parceiro_familiar: "é pensionista" — aviso de não financiável', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar", message_text: "é pensionista", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("financ") || reply.includes("nao cont") || reply.includes("pensao") || reply.includes("pensionista") || reply.includes("outra atividade"),
    `reply should warn about pensionista not being financeable: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("document") && !reply.includes("parceiro conjugal"),
    `reply must not open docs or mix with parceiro: "${result.response.reply_text}"`
  );
});

// ===== 7. regime_trabalho_parceiro_familiar + LOAS/BPC =====
await asyncTest('7. regime_trabalho_parceiro_familiar: "recebe BPC" — aviso de não financiável', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar", message_text: "recebe BPC", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("financ") || reply.includes("nao cont") || reply.includes("bpc") || reply.includes("loas") || reply.includes("outra atividade"),
    `reply should warn about BPC not being financeable: "${result.response.reply_text}"`
  );
});

// ===== 8. regime_trabalho_parceiro_familiar + "só benefício" =====
await asyncTest('8. regime_trabalho_parceiro_familiar: "só tem benefício" — aviso que benefício sozinho não compõe', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar", message_text: "só tem benefício", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(
    reply.includes("financ") || reply.includes("sozinho") || reply.includes("outra") || reply.includes("beneficio"),
    `reply should warn about benefício alone: "${result.response.reply_text}"`
  );
});

// ===== 9. BLINDAGEM: familiar não confunde com parceiro conjugal =====
await asyncTest('9. BLINDAGEM: nenhum stage familiar menciona parceiro conjugal', async () => {
  const stages = [
    "confirmar_avo_familiar",
    "regime_trabalho_parceiro_familiar",
    "renda_familiar_valor",
    "renda_parceiro_familiar",
    "inicio_multi_regime_familiar_pergunta",
    "inicio_multi_regime_familiar_loop",
    "inicio_multi_renda_familiar_pergunta",
    "inicio_multi_renda_familiar_loop"
  ];
  for (const stage of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: "dúvida geral", known_slots: { composicao: "familiar" }, pending_slots: [] },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    const reply = normalizeForMatch(result.response.reply_text);
    assert.ok(
      !reply.includes("parceiro conjugal") && !reply.includes("esposo") && !reply.includes("marido"),
      `${stage}: reply must not reference parceiro conjugal: "${result.response.reply_text}"`
    );
  }
});

// ===== 10. BLINDAGEM: familiar não abre P3 nem docs =====
await asyncTest('10. BLINDAGEM: nenhum stage familiar abre P3, docs, correspondente ou visita', async () => {
  const stages = [
    "confirmar_avo_familiar",
    "regime_trabalho_parceiro_familiar",
    "renda_familiar_valor",
    "renda_parceiro_familiar",
    "inicio_multi_regime_familiar_pergunta",
    "inicio_multi_regime_familiar_loop",
    "inicio_multi_renda_familiar_pergunta",
    "inicio_multi_renda_familiar_loop"
  ];
  for (const stage of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: "como funciona?", known_slots: { composicao: "familiar" }, pending_slots: [] },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    const reply = normalizeForMatch(result.response.reply_text);
    assert.ok(
      !reply.includes("p3") && !reply.includes("terceira pessoa") && !reply.includes("document") && !reply.includes("holerite") && !reply.includes("correspondente") && !reply.includes("visita"),
      `${stage}: reply must not open P3/docs/correspondente/visita: "${result.response.reply_text}"`
    );
  }
});

// ===== 11. BLINDAGEM: multi-regime/multi-renda do familiar não contamina titular =====
await asyncTest('11. BLINDAGEM: multi-regime do familiar não menciona titular ou renda do titular', async () => {
  const r1 = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_familiar_pergunta", message_text: "ele tem mais um emprego", known_slots: { composicao: "familiar" }, pending_slots: ["multi_regime_familiar"] },
    heuristicOnlyRuntime
  );
  const reply1 = normalizeForMatch(r1.response?.reply_text);
  assert.ok(
    !reply1.includes("sua renda") && !reply1.includes("titular") && !reply1.includes("voce"),
    `multi_regime_familiar_pergunta: must not reference titular: "${r1.response?.reply_text}"`
  );

  const r2 = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_familiar_pergunta", message_text: "tem renda extra sim", known_slots: { composicao: "familiar" }, pending_slots: ["multi_renda_familiar"] },
    heuristicOnlyRuntime
  );
  const reply2 = normalizeForMatch(r2.response?.reply_text);
  assert.ok(
    !reply2.includes("sua renda") && !reply2.includes("titular"),
    `multi_renda_familiar_pergunta: must not reference titular: "${r2.response?.reply_text}"`
  );
});

// ===== 12. REGRESSÃO: stages existentes continuam funcionando =====
await asyncTest('12. REGRESSÃO: confirmar_avo_familiar fallback + renda_parceiro_familiar valor claro', async () => {
  // confirmar_avo_familiar with "sim"
  const r1 = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_avo_familiar", message_text: "sim, é meu avô", known_slots: { composicao: "familiar" }, pending_slots: ["confirmar_avo"] },
    heuristicOnlyRuntime
  );
  assert.ok(r1.response, "confirmar_avo sim: engine produced a result");
  const v1 = validateReadOnlyCognitiveResponse(r1.response);
  assert.ok(v1.valid, `confirmar_avo sim valid: ${v1.errors.join(", ")}`);
  const reply1 = normalizeForMatch(r1.response.reply_text);
  assert.ok(
    reply1.includes("avo") || reply1.includes("confirma") || reply1.includes("sistema"),
    `confirmar_avo sim: must reference avô: "${r1.response.reply_text}"`
  );

  // renda_parceiro_familiar with clear value
  const r2 = await runReadOnlyCognitiveEngine(
    { current_stage: "renda_parceiro_familiar", message_text: "2500", known_slots: { composicao: "familiar" }, pending_slots: ["renda_parceiro_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(r2.response, "renda_parceiro_familiar 2500: engine produced a result");
  assert.strictEqual(r2.response.should_advance_stage, false);
  const v2 = validateReadOnlyCognitiveResponse(r2.response);
  assert.ok(v2.valid, `renda_parceiro_familiar 2500 valid: ${v2.errors.join(", ")}`);

  // regime_trabalho_parceiro_familiar with CLT
  const r3 = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho_parceiro_familiar", message_text: "CLT", known_slots: { composicao: "familiar" }, pending_slots: ["regime_trabalho_familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(r3.response, "regime_trabalho CLT: engine produced a result");
  const v3 = validateReadOnlyCognitiveResponse(r3.response);
  assert.ok(v3.valid, `regime_trabalho CLT valid: ${v3.errors.join(", ")}`);
  const reply3 = normalizeForMatch(r3.response.reply_text);
  assert.ok(
    reply3.includes("clt") || reply3.includes("regime") || reply3.includes("familiar"),
    `regime_trabalho CLT: must reference CLT: "${r3.response.reply_text}"`
  );
});

// ===== Summary =====
console.log(`\ncognitive_bloco6_contrato_familiar.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
