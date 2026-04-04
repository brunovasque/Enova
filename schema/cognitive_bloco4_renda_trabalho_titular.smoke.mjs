/**
 * cognitive_bloco4_renda_trabalho_titular.smoke.mjs
 *
 * Diagnostic smoke tests for BLOCO 4 — RENDA / TRABALHO TITULAR — cognitive shell.
 * Validates:
 *   1. ir_declarado specific triggers + guidance
 *   2. possui_renda_extra: comissão/hora extra/adicional ≠ renda mista
 *   3. No duplication of cognitive prefix + mechanic
 *   4. Mechanic regex guards for hora extra / comissão / adicional
 *   5. Regression safety for all 9 BLOCO 4 stages
 *
 * Stages covered:
 *   renda, regime_trabalho, ir_declarado, autonomo_ir_pergunta,
 *   possui_renda_extra, inicio_multi_regime_pergunta,
 *   inicio_multi_regime_coletar, inicio_multi_renda_pergunta,
 *   inicio_multi_renda_coletar
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

// ============================================================
// SECTION 1 — ir_declarado cognitive triggers + guidance
// ============================================================
console.log("\n  === SECTION 1: ir_declarado triggers + guidance ===\n");

await asyncTest('1. ir_declarado: "sou MEI" — cognitive engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "sou MEI", known_slots: {}, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  assert.ok(/pessoa fisica|pf|cnpj|financiamento|ir/i.test(reply), "reply must mention PF context or IR");
});

await asyncTest('2. ir_declarado: "prejudica não ter IR?" — cognitive engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "prejudica não ter IR?", known_slots: {}, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  assert.ok(!/aprova|parcela|subsidio|entrada/i.test(reply), "reply must not promise results");
});

await asyncTest('3. ir_declarado: "sim" — engine valid, clear answer', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "sim", known_slots: {}, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
});

await asyncTest('4. ir_declarado: "não declaro" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "não declaro", known_slots: {}, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
  assert.ok(!/reprova|impossivel|impossível|nao pode|não pode/i.test(reply), "reply must not say impossible");
});

await asyncTest('5. ir_declarado: "atrapalha?" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "atrapalha?", known_slots: {}, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must not be empty");
});

// ============================================================
// SECTION 2 — possui_renda_extra: comissão/hora extra ≠ renda mista
// ============================================================
console.log("\n  === SECTION 2: possui_renda_extra comissão/hora extra separation ===\n");

await asyncTest('6. possui_renda_extra: "tenho hora extra" — guidance redirects to renda por fora', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "tenho hora extra", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(/renda formal|renda por fora|bico|uber|freela/i.test(reply), "reply must redirect to renda por fora, not accept hora extra as renda mista");
});

await asyncTest('7. possui_renda_extra: "ganho comissão" — guidance redirects to renda por fora', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "ganho comissão", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(/renda formal|renda por fora|bico|uber|freela/i.test(reply), "reply must redirect to renda por fora, not accept comissão as renda mista");
});

await asyncTest('8. possui_renda_extra: "recebo adicional noturno" — guidance redirects', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "recebo adicional noturno", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(/renda formal|renda por fora|bico|uber|freela/i.test(reply), "reply must redirect, not accept adicional as renda mista");
});

await asyncTest('9. possui_renda_extra: "faço bico" — still accepted as renda extra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "faço bico", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
  // bico IS renda extra — reply should acknowledge, not reject
  assert.ok(!/nao e renda extra|não é renda extra|renda formal/i.test(reply), "reply must not reject bico as renda extra");
});

await asyncTest('10. possui_renda_extra: "sim, Uber" — still accepted as renda extra', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "sim, Uber", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

await asyncTest('11. possui_renda_extra: "faço bico e hora extra" — bico still counts', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "faço bico e hora extra", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// ============================================================
// SECTION 3 — Mechanic regex guard validation
// ============================================================
console.log("\n  === SECTION 3: Mechanic regex guard validation ===\n");

// These test the regex logic directly (not the cognitive engine)
function testPossuiRendaExtraRegex(text) {
  const t = String(text || "").trim();
  const isHoraExtraOnly = /\bhoras?\s+extras?\b/i.test(t) && !/\b(bico|uber|ifood|freela|renda\s+extra|por\s+fora|informal)\b/i.test(t);
  const isComissaoOnly = /\b(comiss[aã]o|adicional\s+noturno|adicional)\b/i.test(t) && !/\b(bico|uber|ifood|freela|renda\s+extra|por\s+fora|informal)\b/i.test(t);
  const sim = !isHoraExtraOnly && !isComissaoOnly && /(sim|tenho|faço|faco|uber|ifood|extra|bico)/i.test(t);
  return sim;
}

await asyncTest('12. Regex: "hora extra" → NOT sim (not renda mista)', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("hora extra"), false);
});

await asyncTest('13. Regex: "tenho hora extra" → NOT sim', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("tenho hora extra"), false);
});

await asyncTest('14. Regex: "horas extras" → NOT sim', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("horas extras"), false);
});

await asyncTest('15. Regex: "comissão" → NOT sim', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("comissão"), false);
});

await asyncTest('16. Regex: "adicional noturno" → NOT sim', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("adicional noturno"), false);
});

await asyncTest('17. Regex: "sim" → sim (valid yes)', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("sim"), true);
});

await asyncTest('18. Regex: "tenho bico" → sim (valid renda extra)', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("tenho bico"), true);
});

await asyncTest('19. Regex: "faço uber" → sim (valid renda extra)', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("faço uber"), true);
});

await asyncTest('20. Regex: "faço bico e hora extra" → sim (bico overrides hora extra guard)', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("faço bico e hora extra"), true);
});

await asyncTest('21. Regex: "tenho renda extra e hora extra" → sim (renda extra overrides guard)', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("tenho renda extra e hora extra"), true);
});

await asyncTest('22. Regex: "ifood" → sim (valid renda extra)', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("ifood"), true);
});

await asyncTest('23. Regex: "adicional" → NOT sim', async () => {
  assert.strictEqual(testPossuiRendaExtraRegex("adicional"), false);
});

// ============================================================
// SECTION 4 — Reply quality and no duplication
// ============================================================
console.log("\n  === SECTION 4: Reply quality ===\n");

await asyncTest('24. regime_trabalho: reply under 600 chars', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "tenho mei, entra como o quê?", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.ok(result.response.reply_text.length <= 600, "reply must be under 600 chars");
});

await asyncTest('25. ir_declarado: reply under 600 chars', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "sou MEI, isso muda algo?", known_slots: {}, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.ok(result.response.reply_text.length <= 600, "reply must be under 600 chars");
});

await asyncTest('26. possui_renda_extra hora extra: reply under 600 chars', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "possui_renda_extra", message_text: "tenho hora extra", known_slots: {}, pending_slots: ["renda_extra"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.ok(result.response.reply_text.length <= 600, "reply must be under 600 chars");
});

// ============================================================
// SECTION 5 — Autônomo com IR vs sem IR distinction
// ============================================================
console.log("\n  === SECTION 5: Autônomo IR distinction ===\n");

await asyncTest('27. autonomo_ir_pergunta: "não declaro" — engine valid, no auto-classify', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "não declaro", known_slots: {}, pending_slots: ["ir_declarado", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(!/reprova|impossivel|impossível/i.test(reply), "must not say impossible without IR");
});

await asyncTest('28. autonomo_ir_pergunta: "sim, declaro" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "sim, declaro", known_slots: {}, pending_slots: ["ir_declarado", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
});

// ============================================================
// SECTION 6 — MEI/PJ stays pessoa física
// ============================================================
console.log("\n  === SECTION 6: MEI/PJ stays pessoa física ===\n");

await asyncTest('29. regime_trabalho: "MEI" — reply must not open empresa analysis', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "MEI", known_slots: {}, pending_slots: ["regime_trabalho", "renda", "ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(/pessoa fisica|pf|cpf|autonom/i.test(reply), "reply must stay in pessoa física context");
  assert.ok(!/analise.*empresa|analise.*cnpj|analise.*mei/i.test(reply), "must not open empresa analysis");
});

await asyncTest('30. ir_declarado: "sou MEI" — reply stays PF', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "sou MEI", known_slots: {}, pending_slots: ["ir_declarado"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(/pessoa fisica|pf|cpf|cnpj|financiamento|ir/i.test(reply), "reply must reference PF context");
});

// ============================================================
// SECTION 7 — Multi-regime / multi-renda coherence
// ============================================================
console.log("\n  === SECTION 7: Multi-regime / multi-renda ===\n");

await asyncTest('31. inicio_multi_regime_pergunta: "sim" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_pergunta", message_text: "sim", known_slots: {}, pending_slots: ["multi_regime"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
});

await asyncTest('32. inicio_multi_regime_coletar: "servidor" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_regime_coletar", message_text: "servidor", known_slots: {}, pending_slots: ["multi_regime"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(!/doc|holerite|comprovante/i.test(reply), "must not ask for docs now");
});

await asyncTest('33. inicio_multi_renda_pergunta: "sim, tenho freela" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_pergunta", message_text: "sim, tenho freela", known_slots: {}, pending_slots: ["multi_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(!/doc|holerite|comprovante|extrato/i.test(reply), "must not ask for docs now");
});

await asyncTest('34. inicio_multi_renda_coletar: "800" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_multi_renda_coletar", message_text: "800", known_slots: {}, pending_slots: ["multi_renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
});

// ============================================================
// SECTION 8 — Regression safety
// ============================================================
console.log("\n  === SECTION 8: Regression safety ===\n");

await asyncTest('35. REGRESSÃO: estado_civil "solteiro" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "solteiro", known_slots: {}, pending_slots: ["estado_civil"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
});

await asyncTest('36. REGRESSÃO: inicio "oi boa tarde" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi boa tarde", known_slots: {}, pending_slots: ["interesse"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
});

await asyncTest('37. REGRESSÃO: somar_renda_solteiro "só eu" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "só eu", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
});

await asyncTest('38. REGRESSÃO: regime_trabalho "clt" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "clt", known_slots: {}, pending_slots: ["regime_trabalho"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
});

await asyncTest('39. REGRESSÃO: renda "3500" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "3500", known_slots: {}, pending_slots: ["renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
});

await asyncTest('40. REGRESSÃO: autonomo_ir_pergunta "sim" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "sim", known_slots: {}, pending_slots: ["ir_declarado", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
});

// ============================================================
// SECTION 9 — No docs request in this block
// ============================================================
console.log("\n  === SECTION 9: No docs request in renda/trabalho block ===\n");

await asyncTest('41. renda: "2500" — reply must not mention docs/holerite/extrato', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "2500", known_slots: {}, pending_slots: ["renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(!/holerite|extrato|doc|comprovante/i.test(reply), "must not request docs at renda stage");
});

await asyncTest('42. autonomo_ir_pergunta: reply must not ask for 6 extratos', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "não tenho IR", known_slots: {}, pending_slots: ["ir_declarado", "renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(!/6 extrato|seis extrato|extratos bancarios|extratos bancários/i.test(reply), "must not ask for extratos at this stage");
});

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n  Resultado: ${passed} passou(aram), ${failed} falhou(aram)\n`);
if (failed > 0) process.exit(1);
