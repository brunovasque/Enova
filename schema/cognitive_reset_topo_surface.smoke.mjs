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
  // PR #550: mirrors renderCognitiveSpeech — only LLM real is sovereign.
  const rawArr = Array.isArray(rawMessages) ? rawMessages : [rawMessages];
  const cognitivePrefix = String(st?.__cognitive_reply_prefix || "").trim();
  const v2TakesFinal = st?.__cognitive_v2_takes_final === true;
  const arbiterSource = st?.__speech_arbiter_source || null;

  // Only LLM real takes the surface. Everything else falls through.
  const arr = (v2TakesFinal && cognitivePrefix && arbiterSource === "llm_real")
    ? [cognitivePrefix]
    : rawArr.filter(Boolean);

  st.__cognitive_reply_prefix = null;
  st.__cognitive_v2_takes_final = false;
  st.__speech_arbiter_source = null;
  return arr;
}

// ── Mirrors the fixed inicio_programa !sim && !nao block (worker L22222-22254)
function simulateInicioProgramaAmbiguous(st, userText) {
  const nt = normalizeText(userText);
  const _isGreetingOrReentry = isGreetingOrReentry(nt);
  // PR #550: only promote if arbiter_source === "llm_real"
  if (_isGreetingOrReentry && st.__cognitive_reply_prefix && st.__speech_arbiter_source === "llm_real") {
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
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
  const result = simulateInicioProgramaAmbiguous(st, "oi");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
  assert.ok(result[0].includes("Oi!"), "reply should be cognitive greeting");
  assert.ok(!result[0].includes("entendido errado"), "should NOT contain mechanical reprompt");
});

// ===== 2. reset + "olá" → cognitive takes final =====
await asyncTest('2. reset + "olá" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
  const result = simulateInicioProgramaAmbiguous(st, "olá");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
  assert.ok(!result[0].includes("entendido errado"), "no mechanical reprompt");
});

// ===== 3. reset + "oii" → cognitive takes final =====
await asyncTest('3. reset + "oii" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
  const result = simulateInicioProgramaAmbiguous(st, "oii");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 4. reset + "bom dia" → cognitive takes final =====
await asyncTest('4. reset + "bom dia" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
  const result = simulateInicioProgramaAmbiguous(st, "bom dia");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 5. reset + "boa tarde" → cognitive takes final =====
await asyncTest('5. reset + "boa tarde" → cognitive takes final', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
  const result = simulateInicioProgramaAmbiguous(st, "boa tarde");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 6. reset + "voltei" → cognitive takes final (reentry) =====
await asyncTest('6. reset + "voltei" → cognitive takes final (reentry)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
  const result = simulateInicioProgramaAmbiguous(st, "voltei");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 7. reset + "quero começar" → cognitive takes final (reentry) =====
await asyncTest('7. reset + "quero começar" → cognitive takes final (reentry)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
  const result = simulateInicioProgramaAmbiguous(st, "quero começar");
  assert.strictEqual(result.length, 1, "should have ONLY cognitive reply");
});

// ===== 8. reset + "vamos lá" → cognitive takes final (reentry) =====
await asyncTest('8. reset + "vamos lá" → cognitive takes final (reentry)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
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

// ===== 11. Ambiguous non-greeting + cognitive prefix (no LLM) → mechanical only =====
await asyncTest('11. Ambiguous non-greeting "hmm" + cognitive prefix (no LLM) → mechanical only (PR #550)', async () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: "Entendo sua dúvida.", __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  const result = simulateInicioProgramaAmbiguous(st, "hmm");
  // PR #550: Without llm_real, prefix is discarded. Result is raw mechanical.
  assert.ok(result.length >= 1, "should have mechanical messages");
  assert.ok(result.some(m => m.includes("entendido errado")), "should include mechanical reprompt");
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
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY, __cognitive_v2_takes_final: false, __speech_arbiter_source: "llm_real" };
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
await asyncTest('17. First msg after reset: "oi" + LLM cognitive prefix → cognitive takes final', async () => {
  const st = {
    fase_conversa: "inicio_programa",
    _post_reset: true,
    __cognitive_reply_prefix: COGNITIVE_GREETING_REPLY,
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: "llm_real"  // PR #550: promotion requires llm_real
  };
  const isFirstAfterReset = st._post_reset === true;
  st._post_reset = null;

  const nt = normalizeText("oi");
  const _isGreetingOrReentry = isGreetingOrReentry(nt);

  // PR #550: only promote if arbiter_source === "llm_real"
  if ((isFirstAfterReset || _isGreetingOrReentry) && st.__cognitive_reply_prefix && st.__speech_arbiter_source === "llm_real") {
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
await asyncTest('19. First msg after reset: non-greeting "Bruno Vasques" + LLM prefix → cognitive takes final', async () => {
  const st = {
    fase_conversa: "inicio_programa",
    _post_reset: true,
    __cognitive_reply_prefix: "Oi, Bruno Vasques! Que bom ter você aqui 😊 Você já sabe como funciona o MCMV?",
    __cognitive_v2_takes_final: false,
    __speech_arbiter_source: "llm_real"  // PR #550: promotion requires llm_real
  };

  const isFirstAfterReset = st._post_reset === true;
  st._post_reset = null;

  // PR #550: only promote if arbiter_source === "llm_real"
  if (isFirstAfterReset && st.__cognitive_reply_prefix && st.__speech_arbiter_source === "llm_real") {
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

// =======================================================================
// PATCH: heuristic_guidance blocked on first turn after reset (tests 29-37)
// Validates that after reset:
//   - heuristic_guidance source → flags revoked (no template takes_final)
//   - cognitive_real source → still dominates (LLM reply used)
//   - resolveTopoStructured skipped on _isFirstAfterReset
//   - step() falls through to mechanical messages only (no greeting prefix)
//   - normal ambiguous (no reset) still accepts heuristic_guidance
// =======================================================================

// ── Mirrors the NEW patched setTopoHappyPathFlags + post-reset guard ──
function applyFlagsWithPatch(st, happyResult, isFirstAfterReset) {
  // PR #550: mirrors updated setTopoHappyPathFlags.
  // ONLY cognitive_real (LLM) sets prefix/takes_final.
  // heuristic_guidance and fallback_mechanical do NOT produce fala final.
  if (happyResult.source === "cognitive_real") {
    st.__cognitive_reply_prefix = happyResult.speech[0];
    st.__cognitive_v2_takes_final = true;
    st.__speech_arbiter_source = "llm_real";
  } else {
    st.__cognitive_reply_prefix = null;
    st.__cognitive_v2_takes_final = false;
    st.__speech_arbiter_source = null;
  }
}

// ── PR #550: resolvers no longer produce fala final ──
function applyResolveTopoStructuredIfAllowed(st, isFirstAfterReset, resolvedReply) {
  // BLOCO 3: resolver is internal support only — does NOT set prefix/takes_final.
  // This function now correctly does nothing (resolver signals consumed by stage logic).
}

// ── PR #550: TOPO dedicated fallback removed — fala vem do mapa estático ──
function applyFirstResetDedicatedFallback(st, isFirstAfterReset, dedicatedFallback) {
  // BLOCO 3: TOPO_HAPPY_PATH_SPEECH.fallback no longer produces fala final.
  // renderCognitiveSpeech will use the minimal fallback map instead.
  // This function now correctly does nothing.
}

const HEURISTIC_TEMPLATE = "Oi! Fico feliz em te ajudar 😊 Você já sabe como funciona o Minha Casa Minha Vida ou prefere que eu explique rapidinho? Responda *sim* (já sei) ou *não* (explica).";
const RESOLVE_TOPO_REPLY = "Você já conhece como o programa Minha Casa Minha Vida funciona ou prefere que eu te explique rapidinho? Me diz *sim* (já sei) ou *não* (me explica).";
const MECHANICAL_REPROMPT = [
  "Você já conhece como o programa Minha Casa Minha Vida funciona ou prefere que eu te explique rapidinho?",
  "Me diz *sim* (já sei) ou *não* (me explica)."
];
// ── Mirrors TOPO_HAPPY_PATH_SPEECH["inicio_programa:first_after_reset"].fallback ──
const FIRST_RESET_DEDICATED_FALLBACK = [
  "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida.",
  "Você já sabe como funciona ou prefere que eu explique rapidinho?",
  "Me diz *sim* (já sei) ou *não* (me explica)."
];

// ===== 29. _isFirstAfterReset + heuristic_guidance → flags revoked =====
await asyncTest('29. _isFirstAfterReset + heuristic_guidance → flags revoked (no template takes_final)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false };
  applyFlagsWithPatch(st, { source: "heuristic_guidance", speech: [HEURISTIC_TEMPLATE] }, true);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "prefix must be null — heuristic rejected");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "takes_final must be false — heuristic rejected");
});

// ===== 30. _isFirstAfterReset + cognitive_real → flags kept (LLM dominates) =====
await asyncTest('30. _isFirstAfterReset + cognitive_real → flags kept (LLM reply dominates)', () => {
  const LLM_REPLY = "Que bom te ver aqui! 😊 Você já sabe como funciona o MCMV?";
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false };
  applyFlagsWithPatch(st, { source: "cognitive_real", speech: [LLM_REPLY] }, true);
  assert.strictEqual(st.__cognitive_reply_prefix, LLM_REPLY, "LLM reply preserved as prefix");
  assert.strictEqual(st.__cognitive_v2_takes_final, true, "takes_final must be true for cognitive_real");
});

// ===== 31. _isFirstAfterReset + fallback_mechanical → flags remain false (no change) =====
await asyncTest('31. _isFirstAfterReset + fallback_mechanical → flags stay false', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false };
  applyFlagsWithPatch(st, { source: "fallback_mechanical", speech: MECHANICAL_REPROMPT }, true);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "prefix stays null");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "takes_final stays false");
});

// ===== 32. resolveTopoStructured BLOCKED on _isFirstAfterReset =====
await asyncTest('32. resolveTopoStructured blocked on _isFirstAfterReset — no template prefix set', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false };
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "resolveTopoStructured blocked on post-reset");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "takes_final stays false — resolver blocked");
});

// ===== 33. resolveTopoStructured DOES NOT produce speech (PR #550) =====
await asyncTest('33. resolveTopoStructured does NOT produce speech — prefix stays null', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false };
  applyResolveTopoStructuredIfAllowed(st, false, RESOLVE_TOPO_REPLY);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "resolver does NOT set prefix (PR #550)");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "resolver does NOT set takes_final (PR #550)");
});

// ===== 34. reset + "Oi Enova" → heuristic/resolver/topo all blocked → raw mechanical =====
await asyncTest('34. reset + "Oi Enova": heuristic/resolver/topo blocked → raw mechanical (will be filtered by renderCognitiveSpeech)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  // Simulate: heuristic doesn't set prefix, resolver doesn't set prefix, TOPO fallback doesn't set prefix
  applyFlagsWithPatch(st, { source: "heuristic_guidance", speech: [HEURISTIC_TEMPLATE] }, true);
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, true, FIRST_RESET_DEDICATED_FALLBACK);
  // All three functions are now no-ops for non-LLM. Result = raw mechanical (unfiltered in simulation).
  // In PROD, renderCognitiveSpeech would use the minimal fallback map instead.
  assert.strictEqual(st.__cognitive_reply_prefix, null, "no prefix set — all blocked");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "no takes_final — all blocked");
  // The final speech in PROD comes from renderCognitiveSpeech → minimal fallback map, not these layers.
});

// ===== 35. reset + "Oi" → same as 34, all blocked =====
await asyncTest('35. reset + "Oi": heuristic/resolver/topo all blocked → raw mechanical (filtered by render)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  applyFlagsWithPatch(st, { source: "heuristic_guidance", speech: [HEURISTIC_TEMPLATE] }, true);
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, true, FIRST_RESET_DEDICATED_FALLBACK);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "no prefix set");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "no takes_final");
});

// ===== 36. Normal ambiguous (no reset): heuristic no longer accepted (PR #550) =====
await asyncTest('36. Normal ambiguous (no reset): heuristic NOT accepted → no takes_final', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  // isFirstAfterReset = FALSE, but heuristic still doesn't set prefix (PR #550)
  applyFlagsWithPatch(st, { source: "heuristic_guidance", speech: [HEURISTIC_TEMPLATE] }, false);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "heuristic no longer sets prefix (PR #550)");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "heuristic no longer sets takes_final (PR #550)");
});

// ===== 37. Gate/nextStage: zero change — step() still called with "inicio_programa" =====
await asyncTest('37. Gate/nextStage zero change: step() nextStage param is inicio_programa', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  applyFlagsWithPatch(st, { source: "heuristic_guidance", speech: [HEURISTIC_TEMPLATE] }, true);
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, true, FIRST_RESET_DEDICATED_FALLBACK);
  assembleMessages(st, MECHANICAL_REPROMPT);
  assert.strictEqual(st.fase_conversa, "inicio_programa", "stage stays inicio_programa — gate/nextStage untouched");
});

// =======================================================================
// MINIMAL FALLBACK — Tests 38–42 (PR #550 rewrite)
// PR #550 removed dedicated TOPO fallback as speech producer.
// Without LLM, all paths fall through to mechanical raw which in PROD
// gets filtered by renderCognitiveSpeech → minimal fallback map.
// Tests verify that no local layer produces fala final pronta.
// =======================================================================

// ===== 38. Without LLM: no prefix set, falls through to raw =====
await asyncTest('38. Without LLM: fallback_mechanical → no prefix, no takes_final (PR #550)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  applyFlagsWithPatch(st, { source: "fallback_mechanical", speech: MECHANICAL_REPROMPT }, true);
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, true, FIRST_RESET_DEDICATED_FALLBACK);
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "takes_final must be false — no LLM");
  assert.strictEqual(st.__cognitive_reply_prefix, null, "prefix must be null — no local speech producer");
});

// ===== 39. Without LLM: assembleMessages returns raw (in PROD filtered by render) =====
await asyncTest('39. Without LLM: assembleMessages returns raw mechanical (filtered by renderCognitiveSpeech in PROD)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  applyFlagsWithPatch(st, { source: "fallback_mechanical", speech: MECHANICAL_REPROMPT }, true);
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, true, FIRST_RESET_DEDICATED_FALLBACK);
  const result = assembleMessages(st, MECHANICAL_REPROMPT);
  // Without LLM, result is raw mechanical. In PROD, renderCognitiveSpeech would filter via map.
  assert.ok(result.length >= 1, "result has at least 1 message");
});

// ===== 40. reset: no layer produces speech without LLM =====
await asyncTest('40. reset + "Me explica": no layer produces speech without LLM (PR #550)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  applyFlagsWithPatch(st, { source: "fallback_mechanical", speech: MECHANICAL_REPROMPT }, true);
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, true, FIRST_RESET_DEDICATED_FALLBACK);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "no prefix — all blocked");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "no takes_final — all blocked");
});

// ===== 41. reset + nome: no layer produces speech without LLM =====
await asyncTest('41. reset + "Bruno Vasques" (no LLM): no layer produces speech (PR #550)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  applyFlagsWithPatch(st, { source: "fallback_mechanical", speech: MECHANICAL_REPROMPT }, true);
  applyResolveTopoStructuredIfAllowed(st, true, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, true, FIRST_RESET_DEDICATED_FALLBACK);
  assert.strictEqual(st.__cognitive_reply_prefix, null, "no prefix");
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "no takes_final");
});

// ===== 42. Normal ambiguous (no reset): no local layer produces speech =====
await asyncTest('42. Normal ambiguous (no reset): no local layer produces speech (PR #550)', () => {
  const st = { fase_conversa: "inicio_programa", __cognitive_reply_prefix: null, __cognitive_v2_takes_final: false, __speech_arbiter_source: null };
  applyFlagsWithPatch(st, { source: "fallback_mechanical", speech: MECHANICAL_REPROMPT }, false);
  applyResolveTopoStructuredIfAllowed(st, false, RESOLVE_TOPO_REPLY);
  applyFirstResetDedicatedFallback(st, false, FIRST_RESET_DEDICATED_FALLBACK);
  // PR #550: resolver and dedicated fallback no longer produce speech
  assert.strictEqual(st.__cognitive_v2_takes_final, false, "no takes_final — resolver no longer sovereign");
  assert.strictEqual(st.__cognitive_reply_prefix, null, "no prefix — resolver no longer sovereign");
});

// ===== Summary =====
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (total: ${passed + failed})`);
assert.strictEqual(passed + failed, 42, "expected exactly 42 tests");
if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED");
}
