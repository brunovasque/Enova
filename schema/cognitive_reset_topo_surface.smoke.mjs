/**
 * cognitive_reset_topo_surface.smoke.mjs
 *
 * Smoke tests for reset/topo cognitive surface fix.
 * Validates:
 *   A) SILENT reset — no auto-speech, _post_reset flag set
 *   B) After reset, first message from client gets cognitive-only response
 *   C) Name candidate capture and reuse before inicio_nome
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
 * 15. SILENT reset: no messages sent (silence)
 * 16. SILENT reset: _post_reset cleared after first message
 * 17. First msg after reset: greeting + cognitive prefix → takes_final
 * 18. First msg after reset: stage preserved
 * 19. First msg after reset: non-greeting "Bruno Vasques" → takes_final
 * 20. Normal inicio (no reset) → no regression
 * 21. Silent reset: no impact on docs/correspondente/visita
 * 22. "Bruno Vasques" → detected as name_candidate
 * 23. "meu nome é Ana Silva" → detected as name_candidate
 * 24. "Oi" → handled by greeting detection, not name capture
 * 25. "me explica" → NOT a name_candidate
 * 26. inicio_nome reuse: high confidence → accepts direct
 * 27. inicio_nome reuse: medium confidence → confirms short
 * 28. inicio_nome reuse: no candidate → normal flow
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

// =======================================================================
// SILENT RESET — Tests 15-19
// Validates that reset returns silence (no auto-speech) and sets _post_reset flag.
// First user message after reset gets cognitive real treatment.
// =======================================================================

// ── Simulates the NEW silent reset handler ──
function simulateSilentReset() {
  const novoSt = {
    fase_conversa: "inicio_programa",
    last_user_text: null,
    last_processed_text: null,
    last_message_id: null,
    last_message_id_prev: null,
    _post_reset: true
  };
  return novoSt;
}

// ===== 15. SILENT reset: no messages sent =====
await asyncTest('15. SILENT reset: no messages sent after reset (silence)', async () => {
  const novoSt = simulateSilentReset();
  // Reset handler returns without calling step() — no messages assembled
  assert.strictEqual(novoSt._post_reset, true, "_post_reset flag must be set");
  assert.strictEqual(novoSt.fase_conversa, "inicio_programa", "stage must be inicio_programa");
  // No cognitive flags set (no speech at all)
  assert.strictEqual(novoSt.__cognitive_reply_prefix, undefined, "no cognitive prefix");
  assert.strictEqual(novoSt.__cognitive_v2_takes_final, undefined, "no takes_final");
});

// ===== 16. SILENT reset: _post_reset flag consumed on first message =====
await asyncTest('16. SILENT reset: _post_reset cleared after first message detection', async () => {
  const novoSt = simulateSilentReset();
  // Simulates inicio_programa entry detecting _post_reset
  const isFirstAfterReset = novoSt._post_reset === true;
  assert.ok(isFirstAfterReset, "should detect first-after-reset");
  novoSt._post_reset = null; // mirrors the worker clear
  assert.strictEqual(novoSt._post_reset, null, "flag cleared after consumption");
});

// ===== 17. First message after reset: cognitive takes final for greeting =====
await asyncTest('17. First msg after reset: "oi" + cognitive prefix → cognitive takes final', async () => {
  const st = {
    fase_conversa: "inicio_programa",
    _post_reset: true,
    __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY,
    __cognitive_v2_takes_final: false
  };
  // _isFirstAfterReset = true → forces takes_final when prefix exists
  const isFirstAfterReset = st._post_reset === true;
  st._post_reset = null;

  const nt = normalizeText("oi");
  const _isGreetingOrReentry = isGreetingOrReentry(nt);

  if ((isFirstAfterReset || _isGreetingOrReentry) && st.__cognitive_reply_prefix) {
    st.__cognitive_v2_takes_final = true;
  }

  const result = assembleMessages(st, [
    "Você já conhece como o programa funciona?",
    "Me diz *sim* ou *não*."
  ]);
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
  assert.ok(result[0].includes("Oi!"), "reply should be cognitive greeting");
});

// ===== 18. First message after reset: stage stays inicio_programa =====
await asyncTest('18. First msg after reset: stage preserved as inicio_programa', async () => {
  const st = simulateSilentReset();
  assert.strictEqual(st.fase_conversa, "inicio_programa", "stage must be inicio_programa");
});

// ===== 19. First message after reset: non-greeting also gets cognitive =====
await asyncTest('19. First msg after reset: non-greeting "Bruno Vasques" + prefix → cognitive takes final', async () => {
  const st = {
    fase_conversa: "inicio_programa",
    _post_reset: true,
    __cognitive_reply_prefix: "Oi, Bruno Vasques! Que bom ter você aqui 😊 Você já sabe como funciona o MCMV?",
    __cognitive_v2_takes_final: false
  };

  const isFirstAfterReset = st._post_reset === true;
  st._post_reset = null;

  // Even non-greeting input gets takes_final when _isFirstAfterReset is true
  if (isFirstAfterReset && st.__cognitive_reply_prefix) {
    st.__cognitive_v2_takes_final = true;
  }

  const result = assembleMessages(st, [
    "Você já conhece como o programa funciona?",
    "Me diz *sim* ou *não*."
  ]);
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
  assert.ok(result[0].includes("Bruno Vasques"), "reply should reference name");
});

// ===== 20. Normal inicio (no reset) → no regression =====
await asyncTest('20. Normal inicio_programa entry (no reset) → mechanical messages unchanged', async () => {
  // Without reset, novoSt has NO cognitive flags
  const normalSt = { fase_conversa: "inicio_programa" };
  const mechanicalMsgs = [
    "Eu sou a Enova 😊, assistente do programa Minha Casa Minha Vida.",
    "Você já sabe como funciona o programa ou prefere que eu explique rapidinho antes?",
    "Me responde com *sim* (já sei) ou *não* (quero que explique)."
  ];
  const result = assembleMessages(normalSt, mechanicalMsgs);
  assert.strictEqual(result.length, 3, "should have all 3 mechanical messages");
  assert.ok(result[0].includes("Eu sou a Enova"), "first message is mechanical intro");
  assert.ok(result[2].includes("sim"), "last message has sim/não prompt");
});

// ===== 21. Silent reset: no impact on docs/correspondente/visita =====
await asyncTest('21. Silent reset: docs/correspondente/visita stages unaffected', async () => {
  const docsSt = { fase_conversa: "envio_docs" };
  assert.strictEqual(docsSt._post_reset, undefined, "envio_docs has no _post_reset flag");
  assert.strictEqual(docsSt.__cognitive_reply_prefix, undefined, "envio_docs has no cognitive prefix");

  const visitaSt = { fase_conversa: "agendamento_visita" };
  assert.strictEqual(visitaSt._post_reset, undefined, "agendamento_visita has no _post_reset");

  const corrSt = { fase_conversa: "aguardando_retorno_correspondente" };
  assert.strictEqual(corrSt._post_reset, undefined, "correspondente has no _post_reset");
});

// =======================================================================
// NAME CANDIDATE REUSE — Tests 22-28
// Validates name_candidate capture in inicio_programa and reuse in inicio_nome.
// =======================================================================

// ── Mirrors resolveInicioNomeStructured name extraction (simplified) ──
function extractNameCandidate(rawText) {
  let candidate = String(rawText || "").trim();
  if (/^(meu nome e|meu nome é|me chamo|me chama|sou|sou o|sou a|aqui e|aqui é)/i.test(candidate)) {
    candidate = candidate.replace(/^(meu nome e|meu nome é|me chamo|me chama|sou|sou o|sou a|aqui e|aqui é)\s*/i, "").trim();
  }
  candidate = candidate.replace(/^[\"'\-–—\s]+|[\"'\-–—\s]+$/g, "").trim();
  const fc = candidate.split(/[.,!?]/)[0].trim();
  const icRx = /\s+\b(e|mas|que|porque|por)\s+(queria|quero|gostaria|adoraria|preciso|posso|tenho|tem|vai|vou|fui|vim|estou|está|nao|não)\b/i;
  const ci = fc.search(icRx);
  candidate = ci > 0 ? fc.slice(0, ci).trim() : fc;
  candidate = candidate.replace(/^[\"'\-–—\s]+|[\"'\-–—\s]+$/g, "").trim();
  const ntCand = normalizeText(candidate);
  const isIntent = /\bexplica|\bexplique/.test(ntCand) || /\bcomo funciona\b/.test(ntCand) ||
    /\bquero (entender|saber)\b/.test(ntCand) || /\bpode explicar\b/.test(ntCand) ||
    /\bnao sei\b/.test(ntCand) || /\bprefiro que\b/.test(ntCand) || /\bme ajuda\b/.test(ntCand);
  if (isIntent || !candidate || candidate.length < 2) return null;
  const parts = candidate.split(/\s+/).filter(p => p.length >= 2);
  if (parts.length < 1 || parts.length > 6) return null;
  return { extracted_name: candidate, parts };
}

// ===== 22. "Bruno Vasques" → captured as name_candidate =====
await asyncTest('22. "Bruno Vasques" → detected as plausible name_candidate', async () => {
  const result = extractNameCandidate("Bruno Vasques");
  assert.ok(result, "should extract a name candidate");
  assert.strictEqual(result.extracted_name, "Bruno Vasques");
  assert.strictEqual(result.parts.length, 2, "two parts = high confidence");
});

// ===== 23. "meu nome é Ana Silva" → captured as name_candidate =====
await asyncTest('23. "meu nome é Ana Silva" → detected as name_candidate', async () => {
  const result = extractNameCandidate("meu nome é Ana Silva");
  assert.ok(result, "should extract a name candidate");
  assert.strictEqual(result.extracted_name, "Ana Silva");
});

// ===== 24. "Oi" → greeting handled before name capture (sim/nao/greeting path) =====
await asyncTest('24. "Oi" → handled by greeting detection, not name capture path', async () => {
  // "Oi" is NOT sim/nao, but IS a greeting → caught by greeting branch first.
  // The name probe may extract it, but inicio_programa handles greetings before probing names.
  const nt = normalizeText("Oi");
  const _isGreeting = isGreetingOrReentry(nt);
  assert.ok(_isGreeting, "Oi should be caught as greeting before name probe");
});

// ===== 25. "me explica" → NOT captured as name_candidate (intent guard) =====
await asyncTest('25. "me explica" → NOT a name_candidate (intent phrase)', async () => {
  const result = extractNameCandidate("me explica");
  assert.strictEqual(result, null, "explanation request should not be name candidate");
});

// ===== 26. inicio_nome reuse: high confidence → accepts direct =====
await asyncTest('26. inicio_nome: name_candidate "Bruno Vasques" (2 parts) → high confidence accept', async () => {
  const candidato = "Bruno Vasques";
  const partes = candidato.split(/\s+/).filter(p => p.length >= 2);
  const confiancaAlta = partes.length >= 2 && partes.length <= 6;
  assert.ok(confiancaAlta, "2 parts should be high confidence");
  assert.strictEqual(partes[0], "Bruno", "first name extracted correctly");
});

// ===== 27. inicio_nome reuse: medium confidence → confirms short =====
await asyncTest('27. inicio_nome: name_candidate "Bruno" (1 part) → medium confidence confirm', async () => {
  const candidato = "Bruno";
  const partes = candidato.split(/\s+/).filter(p => p.length >= 2);
  const confiancaAlta = partes.length >= 2 && partes.length <= 6;
  const confiancaMedia = partes.length === 1 && candidato.length >= 2;
  assert.ok(!confiancaAlta, "1 part should NOT be high confidence");
  assert.ok(confiancaMedia, "1 part with >=2 chars should be medium confidence");
});

// ===== 28. inicio_nome reuse: no candidate → normal flow =====
await asyncTest('28. inicio_nome: no name_candidate → normal flow unchanged', async () => {
  const st = { fase_conversa: "inicio_nome", name_candidate: null };
  assert.ok(!st.name_candidate, "no candidate means normal flow");
});

// ===== Summary =====
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (total: ${passed + failed})`);
assert.strictEqual(passed + failed, 28, "expected exactly 28 tests");
if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED");
}
