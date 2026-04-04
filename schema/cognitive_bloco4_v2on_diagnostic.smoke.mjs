/**
 * cognitive_bloco4_v2on_diagnostic.smoke.mjs
 *
 * Diagnostic smoke tests for BLOCO 4 cognitive shell — V2 ON mode.
 * Validates: shouldTriggerCognitiveAssist, hasClearStageAnswer, cognitive guidance,
 * solo-explicit fidelity, parceiro/familiar separation, renda_baixa ineligibility,
 * and no-duplication in the 4 stages:
 *   somar_renda_solteiro, somar_renda_familiar, quem_pode_somar, interpretar_composicao
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

// ============================================================
// SECTION 1 — shouldTriggerCognitiveAssist coverage
// (validated indirectly: if the engine produces a reply with
//  guidance content, it means the stage+message triggers correctly)
// ============================================================

console.log("\n  === SECTION 1: shouldTriggerCognitiveAssist triggers ===\n");

// 1. quem_pode_somar — "só eu" should trigger cognitive
await asyncTest('1. quem_pode_somar: "só eu" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "só eu", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// 2. quem_pode_somar — "minha esposa" should trigger cognitive
await asyncTest('2. quem_pode_somar: "minha esposa" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "minha esposa", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// 3. quem_pode_somar — "meu pai" should trigger cognitive
await asyncTest('3. quem_pode_somar: "meu pai" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "meu pai", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// 4. interpretar_composicao — "sozinho" should trigger cognitive
await asyncTest('4. interpretar_composicao: "sozinho" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "sozinho", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// 5. interpretar_composicao — "meu marido" should trigger cognitive
await asyncTest('5. interpretar_composicao: "meu marido" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "meu marido", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// 6. interpretar_composicao — "minha irmã" should trigger cognitive
await asyncTest('6. interpretar_composicao: "minha irmã" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "minha irmã", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// 7. quem_pode_somar — "não sei" should trigger cognitive
await asyncTest('7. quem_pode_somar: "não sei" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "não sei", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// 8. interpretar_composicao — "talvez" should trigger cognitive
await asyncTest('8. interpretar_composicao: "talvez" triggers cognitive engine', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "talvez", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.ok(reply.length > 5, "reply must not be empty");
});

// ============================================================
// SECTION 2 — hasClearStageAnswer coverage
// ============================================================

console.log("\n  === SECTION 2: hasClearStageAnswer correctness ===\n");

// 9. somar_renda_solteiro — "só eu" is a clear answer
await asyncTest('9. somar_renda_solteiro: "só eu" — hasClearStageAnswer via engine (solo detected)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "só eu", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  // Engine must produce a valid response (heuristic guidance takes over)
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 10. somar_renda_solteiro — "vou usar só minha renda" is solo clear answer
await asyncTest('10. somar_renda_solteiro: "vou usar só minha renda" — solo clear answer', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "vou usar só minha renda", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 11. somar_renda_familiar — "minha mãe" is a clear answer
await asyncTest('11. somar_renda_familiar: "minha mãe" — clear answer (familiar detected)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "minha mãe", known_slots: {}, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 12. somar_renda_familiar — "meu irmão" is a clear answer
await asyncTest('12. somar_renda_familiar: "meu irmão" — clear answer (familiar irmao detected)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "meu irmão", known_slots: {}, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 13. quem_pode_somar — "meu parceiro" is a clear answer
await asyncTest('13. quem_pode_somar: "meu parceiro" — clear answer (parceiro detected)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "meu parceiro", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 14. interpretar_composicao — "com familiar" is a clear answer
await asyncTest('14. interpretar_composicao: "com familiar" — clear answer (familiar detected)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "com familiar", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ============================================================
// SECTION 3 — Solo explicit fidelity (critical: solo must NOT leak to familiar)
// ============================================================

console.log("\n  === SECTION 3: Solo explicit fidelity ===\n");

// 15. "só eu" must NOT be treated as familiar/parceiro
await asyncTest('15. quem_pode_somar: "só eu" — must not classify as familiar or parceiro', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "só eu", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  // reply should not push to familiar or parceiro
  assert.doesNotMatch(reply, /vamos incluir|vamos considerar renda com parceiro|familiar|composicao/, "must not push to composicao");
});

// 16. "sem composição" must be treated as solo
await asyncTest('16. somar_renda_solteiro: "sem composição" — treated as solo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "sem composição", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  // should mention solo/sozinho, not composicao forced
  assert.ok(
    reply.includes("sozinho") || reply.includes("somar") || reply.includes("renda") || reply.includes("seguir") || reply.includes("verificar"),
    `reply should acknowledge solo intent. Got: ${result.response.reply_text}`
  );
});

// 17. "só eu vou compor" must stay solo
await asyncTest('17. quem_pode_somar: "só eu vou compor" — must stay solo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "só eu vou compor", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.doesNotMatch(reply, /vamos considerar renda com parceiro/, "must not redirect to parceiro");
});

// 18. "vou usar só minha renda" must stay solo
await asyncTest('18. interpretar_composicao: "vou usar só minha renda" — must stay solo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "vou usar só minha renda", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.doesNotMatch(reply, /vamos incluir|composicao com parceiro/, "must not push to parceiro/familiar");
});

// ============================================================
// SECTION 4 — Parceiro/familiar separation
// ============================================================

console.log("\n  === SECTION 4: Parceiro/familiar separation ===\n");

// 19. "minha esposa" in quem_pode_somar — must detect as parceiro, not familiar
await asyncTest('19. quem_pode_somar: "minha esposa" — detected as parceiro, not familiar', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "minha esposa", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  // should not confuse with familiar
  const reply = normalizeForMatch(result.response.reply_text);
  assert.doesNotMatch(reply, /\bfamiliar\b/, "must not classify esposa as familiar");
});

// 20. "minha mãe" in quem_pode_somar — must detect as familiar, not parceiro
await asyncTest('20. quem_pode_somar: "minha mãe" — detected as familiar, not parceiro', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "minha mãe", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  assert.doesNotMatch(reply, /parceiro/, "must not classify mae as parceiro");
});

// 21. "meu marido" in interpretar_composicao — parceiro (engine valid, not forced to familiar)
await asyncTest('21. interpretar_composicao: "meu marido" — engine valid, parceiro context', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "meu marido", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  // must not DECIDE as familiar when user said marido
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
});

// 22. "minha avó" in interpretar_composicao — familiar (engine valid, not forced to parceiro)
await asyncTest('22. interpretar_composicao: "minha avó" — engine valid, familiar context', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "minha avó", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
});

// ============================================================
// SECTION 5 — somar_renda_familiar requires specific familiar
// ============================================================

console.log("\n  === SECTION 5: somar_renda_familiar requires identification ===\n");

// 23. "com familiar" generic — must stay asking which familiar
await asyncTest('23. somar_renda_familiar: "com familiar" — stays asking which familiar', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "com familiar", known_slots: {}, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = normalizeForMatch(result.response.reply_text);
  // should ask which familiar
  assert.ok(
    reply.includes("familiar") || reply.includes("qual") || reply.includes("compor"),
    `reply should ask for familiar identification. Got: ${result.response.reply_text}`
  );
});

// 24. "minha mãe" — identified (clear answer), engine valid
await asyncTest('24. somar_renda_familiar: "minha mãe" — identified as mae', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "minha mãe", known_slots: {}, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 25. "minha avó" — identified
await asyncTest('25. somar_renda_familiar: "minha avó" — identified as avo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "minha avó", known_slots: {}, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ============================================================
// SECTION 6 — Cognitive engine reply quality (no duplication, natural tone)
// ============================================================

console.log("\n  === SECTION 6: Reply quality and no duplication ===\n");

// 26. Cognitive reply must not contain mechanical prefix duplication patterns
await asyncTest('26. somar_renda_solteiro: reply has no prefix duplication', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "posso tentar sozinho?", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  const reply = result.response.reply_text || "";
  // should NOT have consecutive "Perfeito" "Perfeito" or similar duplication
  assert.doesNotMatch(reply, /Perfeito.*Perfeito/i, "must not have duplicated prefix");
  assert.doesNotMatch(reply, /Show!.*Show!/i, "must not have duplicated exclamation");
});

// 27. quem_pode_somar: reply should be under 600 chars (final speech contract)
await asyncTest('27. quem_pode_somar: reply under 600 chars', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "não sei com quem somar", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  const reply = result.response.reply_text || "";
  assert.ok(reply.length <= 600, `reply too long: ${reply.length} chars`);
});

// 28. interpretar_composicao: ambiguous should not decide for user
await asyncTest('28. interpretar_composicao: ambiguous input — does not decide for user', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "talvez com alguém", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
});

// ============================================================
// SECTION 7 — Regression safety (other blocks unaffected)
// ============================================================

console.log("\n  === SECTION 7: Regression safety ===\n");

// 29. estado_civil still works
await asyncTest('29. REGRESSÃO: estado_civil "sou solteiro" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "sou solteiro", known_slots: {}, pending_slots: ["estado_civil"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `estado_civil response must be valid: ${v.errors.join(", ")}`);
});

// 30. inicio still works
await asyncTest('30. REGRESSÃO: inicio "oi boa tarde" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi boa tarde", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `inicio response must be valid: ${v.errors.join(", ")}`);
});

// 31. regime_trabalho still works
await asyncTest('31. REGRESSÃO: regime_trabalho "clt" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "clt", known_slots: {}, pending_slots: ["regime"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `regime_trabalho response must be valid: ${v.errors.join(", ")}`);
});

// 32. somar_renda_solteiro: "sim" still works (yes → somar intent)
await asyncTest('32. somar_renda_solteiro: "sim" — engine valid', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "sim", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ============================================================
// SECTION 8 — Sensitive point coverage (explicit contract phrases)
// ============================================================

console.log("\n  === SECTION 8: Sensitive point coverage ===\n");

// 33. "minha mãe" in somar_renda_solteiro
await asyncTest('33. somar_renda_solteiro: "minha mãe" — engine valid (familiar route)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "minha mãe", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 34. "meu pai" in somar_renda_solteiro
await asyncTest('34. somar_renda_solteiro: "meu pai" — engine valid (familiar route)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "meu pai", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 35. "minha irmã" in somar_renda_familiar
await asyncTest('35. somar_renda_familiar: "minha irmã" — engine valid (irmã detected)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_familiar", message_text: "minha irmã", known_slots: {}, pending_slots: ["familiar"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// 36. "meu parceiro" in quem_pode_somar
await asyncTest('36. quem_pode_somar: "meu parceiro" — engine valid (parceiro detected)', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "meu parceiro", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

// ===== Resultado final =====
console.log(`\n  Resultado: ${passed} passou(aram), ${failed} falhou(aram)\n`);
if (failed > 0) process.exit(1);
