/**
 * cognitive_reset_topo_surface.smoke.mjs
 *
 * Smoke tests for reset/topo cognitive surface fix.
 * Validates that after reset, greetings/reentry at inicio_programa
 * get cognitive-only response (not mechanical reprompt seco).
 *
 * Scenarios:
 *  1. reset + "oi"     → cognitive takes final, no mechanical reprompt
 *  2. reset + "olá"    → cognitive takes final
 *  3. reset + "oii"    → cognitive takes final
 *  4. reset + "bom dia" → cognitive takes final
 *  5. reset + "boa tarde" → cognitive takes final
 *  6. reset + "voltei" → cognitive takes final (reentry)
 *  7. reset + "quero começar" → cognitive takes final (reentry)
 *  8. reset + "vamos lá" → cognitive takes final (reentry)
 *  9. inicio_programa + "sim" → normal flow, no override (regression)
 * 10. inicio_programa + "não" → normal flow, no override (regression)
 * 11. inicio_programa + ambiguous non-greeting + cognitive prefix → prefix-only, NOT takes_final
 * 12. inicio_programa + greeting + NO cognitive prefix → mechanical fallback
 * 13. stage/nextStage preserved after cognitive takes final
 * 14. cognitive engine produces useful reply for greeting at inicio_programa
 */

import assert from "node:assert/strict";

// ── Import cognitive engine for engine-level tests
const { runReadOnlyCognitiveEngine } = await import(
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

// ── Mirrors worker normalizeText (simplified)
function normalizeText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ── Mirrors the EXACT greeting/reentry detection in the fix (worker L22225-22227)
function isGreetingOrReentry(nt) {
  return (
    /^(oi+|ola|olá|opa|eae|eai|fala|bom dia|boa tarde|boa noite|e ai|e aí)\b/i.test(nt) ||
    /\b(quero comecar|quero começar|voltei|to de volta|tô de volta|vamos la|vamos lá)\b/i.test(nt)
  );
}

// ── Mirrors step() message assembly (worker L161-175)
function assembleMessages(st, rawMessages) {
  const rawArr = Array.isArray(rawMessages) ? rawMessages : [rawMessages];
  const cognitivePrefix = String(st?.__cognitive_reply_prefix || "").trim();
  const v2TakesFinal = st?.__cognitive_v2_takes_final === true;

  const arr = v2TakesFinal && cognitivePrefix
    ? [cognitivePrefix]
    : cognitivePrefix
      ? [cognitivePrefix, ...rawArr].filter(Boolean)
      : rawArr.filter(Boolean);

  st.__cognitive_reply_prefix = null;
  st.__cognitive_v2_takes_final = false;
  return arr;
}

// ── Mirrors the fixed inicio_programa !sim && !nao block (worker L22222-22254)
function simulateInicioProgramaAmbiguous(st, userText) {
  const nt = normalizeText(userText);
  const _isGreetingOrReentry = isGreetingOrReentry(nt);
  if (_isGreetingOrReentry && st.__cognitive_reply_prefix) {
    st.__cognitive_v2_takes_final = true;
  }

  const mechanicalReprompt = [
    "Acho que posso ter entendido errado 🤔",
    "Só confirma pra mim rapidinho:",
    "Você *já sabe como funciona* o programa Minha Casa Minha Vida, ou prefere que eu te explique de forma bem simples?",
    "Responde com *sim* (já sei) ou *não* (quero que explique)."
  ];

  return assembleMessages(st, mechanicalReprompt);
}

const COGNITIVE_GREETING_REPLY = "Oi! Fico feliz em te ajudar 😊 O Minha Casa Minha Vida é um programa do governo com subsídio e condições especiais. Você já sabe como funciona ou prefere que eu explique rapidinho?";

console.log("\n🧪 cognitive_reset_topo_surface.smoke.mjs\n");

// ===== 1. reset + "oi" → cognitive takes final =====
await asyncTest('1. reset + "oi" → cognitive takes final, no mechanical reprompt', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "oi");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
  assert.ok(result[0].includes("Oi!"), "reply should be cognitive greeting");
  assert.ok(!result[0].includes("entendido errado"), "should NOT contain mechanical reprompt");
});

// ===== 2. reset + "olá" → cognitive takes final =====
await asyncTest('2. reset + "olá" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "olá");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
  assert.ok(!result[0].includes("entendido errado"), "no mechanical reprompt");
});

// ===== 3. reset + "oii" → cognitive takes final =====
await asyncTest('3. reset + "oii" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "oii");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 4. reset + "bom dia" → cognitive takes final =====
await asyncTest('4. reset + "bom dia" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "bom dia");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 5. reset + "boa tarde" → cognitive takes final =====
await asyncTest('5. reset + "boa tarde" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "boa tarde");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 6. reset + "voltei" → cognitive takes final (reentry) =====
await asyncTest('6. reset + "voltei" → cognitive takes final (reentry)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "voltei");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 7. reset + "quero começar" → cognitive takes final (reentry) =====
await asyncTest('7. reset + "quero começar" → cognitive takes final (reentry)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "quero começar");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 8. reset + "vamos lá" → cognitive takes final (reentry) =====
await asyncTest('8. reset + "vamos lá" → cognitive takes final (reentry)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "vamos lá");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 9. REGRESSÃO: "sim" → normal flow, no override =====
await asyncTest('9. REGRESSÃO: "sim" flui normalmente (não entra no bloco !sim && !nao)', async () => {
  // "sim" matches isYes() → never enters the !sim && !nao block
  // Just verify the greeting detection doesn't match "sim"
  const nt = normalizeText("sim");
  assert.strictEqual(isGreetingOrReentry(nt), false, '"sim" must NOT match greeting/reentry');
});

// ===== 10. REGRESSÃO: "não" → normal flow =====
await asyncTest('10. REGRESSÃO: "não" flui normalmente (não entra no bloco !sim && !nao)', async () => {
  const nt = normalizeText("não");
  assert.strictEqual(isGreetingOrReentry(nt), false, '"não" must NOT match greeting/reentry');
});

// ===== 11. Ambiguous non-greeting + cognitive prefix → prefix-only, NOT takes_final =====
await asyncTest('11. Ambiguous non-greeting "hmm" + cognitive prefix → prefix + mechanical (NOT takes_final)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: "Entendo sua dúvida.", __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "hmm");
  assert.ok(result.length > 1, "should have cognitive prefix + mechanical messages");
  assert.strictEqual(result[0], "Entendo sua dúvida.", "first element should be cognitive prefix");
  assert.ok(result.some(m => m.includes("entendido errado")), "should still include mechanical reprompt");
});

// ===== 12. Greeting + NO cognitive prefix → mechanical fallback =====
await asyncTest('12. Greeting "oi" + NO cognitive prefix → mechanical fallback', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false };
  const result = simulateInicioProgramaAmbiguous(st, "oi");
  assert.ok(result.length === 4, "should have all 4 mechanical reprompt messages");
  assert.ok(result[0].includes("entendido errado"), "first message should be mechanical reprompt");
});

// ===== 13. Stage preserved after cognitive takes final =====
await asyncTest('13. Stage/nextStage preserved (inicio_programa stays) after cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false };
  simulateInicioProgramaAmbiguous(st, "oi");
  // After step(), __cognitive_v2_takes_final is cleared but fase_conversa stays
  assert.strictEqual(st.fase_conversa, "inicio_programa", "stage must stay inicio_programa");
  // Flags should be cleared by assembleMessages (mirrors step() L173-175)
  assert.strictEqual(st.__cognitive_reply_prefix, null, "prefix should be cleared after step");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "takes_final should be cleared after step");
});

// ===== 14. Cognitive engine produces useful reply for greeting at inicio_programa =====
await asyncTest('14. Cognitive engine returns useful reply for "oi" at inicio_programa', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.ok(result.response.reply_text.length > 20, "reply_text should be substantial");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.ok(result.response.confidence >= 0.66, `confidence ${result.response.confidence} >= 0.66`);
});

// ===== Summary =====
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (total: ${passed + failed})`);
if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED");
}
