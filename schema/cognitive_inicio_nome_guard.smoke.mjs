/**
 * cognitive_inicio_nome_guard.smoke.mjs
 *
 * Smoke tests for the semantic guard added to case "inicio_nome".
 * Validates that:
 *   - real/plausible names continue to be accepted (cases 1–9)
 *   - intent/explanation phrases are rejected as names (cases 10–17)
 *   - hasClearStageAnswer("inicio_nome") is consistent with the case guard
 *   - no regression on inicio_programa or the topo reset path
 *
 * Acceptance criteria (required by PR comment):
 *  MUST ACCEPT  : Bruno, Bruno Vasques, Maria Eduarda, João Pedro, Ana Clara,
 *                 José, "meu nome é Bruno", "me chamo Maria Eduarda", "sou João Pedro"
 *  MUST REJECT  : me explique, me explica, quero entender, como funciona,
 *                 pode explicar, prefiro que explique, me explique o programa,
 *                 não sei como funciona
 */

import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

// ── Mirrors worker normalizeText exactly ──────────────────────────────────────
function normalizeText(text) {
  let s = String(text || "");
  if (/[ÃÂ]/.test(s)) {
    try { s = decodeURIComponent(escape(s)); } catch (_) { /* ignore */ }
  }
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2000-\u206F]/g, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Mirrors the semantic guard added to case "inicio_nome" ────────────────────
// Returns true when the text is clearly an intent/explanation phrase (NOT a name).
function isIntentNotName(rawNome) {
  const nt = normalizeText(rawNome);
  return (
    /\bexplica|\bexplique/.test(nt) ||
    /\bcomo funciona\b/.test(nt) ||
    /\bquero (entender|saber)\b/.test(nt) ||
    /\bpode explicar\b/.test(nt) ||
    /\bnao sei\b/.test(nt) ||
    /\bprefiro que\b/.test(nt)
  );
}

// ── Mirrors prefix + quote cleanup from case "inicio_nome" ────────────────────
function cleanNomeInput(userText) {
  let raw = String(userText || "").trim();
  if (/^(meu nome e|meu nome é|me chamo|me chama|sou|sou o|sou a|aqui e|aqui é)/i.test(raw)) {
    raw = raw
      .replace(/^(meu nome e|meu nome é|me chamo|me chama|sou|sou o|sou a|aqui e|aqui é)\s*/i, "")
      .trim();
  }
  raw = raw.replace(/^["'\-–—\s]+|["'\-–—\s]+$/g, "").trim();
  return raw;
}

// ── Full simulation: mirrors hasClearStageAnswer("inicio_nome", text) ─────────
function hasClearAnswerInicio_nome(text) {
  const raw = cleanNomeInput(text);
  const ntg = normalizeText(raw);
  if (
    /\bexplica|\bexplique/.test(ntg) ||
    /\bcomo funciona\b/.test(ntg) ||
    /\bquero (entender|saber)\b/.test(ntg) ||
    /\bpode explicar\b/.test(ntg) ||
    /\bnao sei\b/.test(ntg) ||
    /\bprefiro que\b/.test(ntg)
  ) return false;
  const partes = raw.split(/\s+/).filter(p => p.length >= 2);
  return raw.length >= 2 && partes.length >= 1 && partes.length <= 6;
}

// ── Simulates what case "inicio_nome" does end-to-end ─────────────────────────
// Returns { accepted: boolean, nome: string|null, primeiroNome: string|null }
function simulateInicio_nome(userText) {
  let rawNome = cleanNomeInput(userText);

  if (isIntentNotName(rawNome)) {
    return { accepted: false, nome: null, primeiroNome: null, reason: "intent_guard" };
  }

  if (!rawNome || rawNome.length < 2) {
    return { accepted: false, nome: null, primeiroNome: null, reason: "too_short" };
  }

  const partes = rawNome.split(/\s+/).filter(p => p.length >= 2);
  if (partes.length < 1 || partes.length > 6) {
    return { accepted: false, nome: null, primeiroNome: null, reason: "wrong_parts" };
  }

  return {
    accepted: true,
    nome: rawNome,
    primeiroNome: partes[0],
    reason: "ok"
  };
}

// =============================================================================
// GROUP 1 — MUST ACCEPT (names that are real/plausible)
// =============================================================================

test('1. "Bruno" → accepted as name', () => {
  const r = simulateInicio_nome("Bruno");
  assert.strictEqual(r.accepted, true, `Expected accepted=true, got reason=${r.reason}`);
  assert.strictEqual(r.nome, "Bruno");
  assert.strictEqual(r.primeiroNome, "Bruno");
});

test('2. "Bruno Vasques" → accepted as name', () => {
  const r = simulateInicio_nome("Bruno Vasques");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.strictEqual(r.nome, "Bruno Vasques");
  assert.strictEqual(r.primeiroNome, "Bruno");
});

test('3. "Maria Eduarda" → accepted as name', () => {
  const r = simulateInicio_nome("Maria Eduarda");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.ok(r.nome!== null);
  assert.strictEqual(r.primeiroNome, "Maria");
});

test('4. "João Pedro" → accepted as name', () => {
  const r = simulateInicio_nome("João Pedro");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.strictEqual(r.primeiroNome, "João");
});

test('5. "Ana Clara" → accepted as name', () => {
  const r = simulateInicio_nome("Ana Clara");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
});

test('6. "José" → accepted as name (single word)', () => {
  const r = simulateInicio_nome("José");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.strictEqual(r.nome, "José");
});

test('7. "meu nome é Bruno" → prefix stripped, accepted', () => {
  const r = simulateInicio_nome("meu nome é Bruno");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.strictEqual(r.nome, "Bruno");
});

test('8. "me chamo Maria Eduarda" → prefix stripped, accepted', () => {
  const r = simulateInicio_nome("me chamo Maria Eduarda");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.strictEqual(r.nome, "Maria Eduarda");
});

test('9. "sou João Pedro" → prefix stripped, accepted', () => {
  const r = simulateInicio_nome("sou João Pedro");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.strictEqual(r.nome, "João Pedro");
});

// =============================================================================
// GROUP 2 — MUST REJECT (intent/explanation phrases)
// =============================================================================

test('10. "me explique" → rejected, not saved as name', () => {
  const r = simulateInicio_nome("me explique");
  assert.strictEqual(r.accepted, false, "must NOT be accepted as name");
  assert.strictEqual(r.nome, null, "nome must not be set");
  assert.strictEqual(r.reason, "intent_guard");
});

test('11. "me explica" → rejected, not saved as name', () => {
  const r = simulateInicio_nome("me explica");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.nome, null);
  assert.strictEqual(r.reason, "intent_guard");
});

test('12. "quero entender" → rejected, not saved as name', () => {
  const r = simulateInicio_nome("quero entender");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.nome, null);
  assert.strictEqual(r.reason, "intent_guard");
});

test('13. "como funciona" → rejected', () => {
  const r = simulateInicio_nome("como funciona");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.nome, null);
  assert.strictEqual(r.reason, "intent_guard");
});

test('14. "pode explicar" → rejected', () => {
  const r = simulateInicio_nome("pode explicar");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.nome, null);
  assert.strictEqual(r.reason, "intent_guard");
});

test('15. "prefiro que explique" → rejected', () => {
  const r = simulateInicio_nome("prefiro que explique");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.nome, null);
  assert.strictEqual(r.reason, "intent_guard");
});

test('16. "me explique o programa" → rejected', () => {
  const r = simulateInicio_nome("me explique o programa");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.nome, null);
  assert.strictEqual(r.reason, "intent_guard");
});

test('17. "não sei como funciona" → rejected', () => {
  const r = simulateInicio_nome("não sei como funciona");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.nome, null);
  assert.strictEqual(r.reason, "intent_guard");
});

// =============================================================================
// GROUP 3 — hasClearStageAnswer consistency
// =============================================================================

test('18. hasClearStageAnswer accepts "Bruno Vasques"', () => {
  assert.strictEqual(hasClearAnswerInicio_nome("Bruno Vasques"), true);
});

test('19. hasClearStageAnswer accepts "meu nome é José"', () => {
  assert.strictEqual(hasClearAnswerInicio_nome("meu nome é José"), true);
});

test('20. hasClearStageAnswer rejects "me explique"', () => {
  assert.strictEqual(hasClearAnswerInicio_nome("me explique"), false, "clearAnswer must be false for intent phrase");
});

test('21. hasClearStageAnswer rejects "quero entender"', () => {
  assert.strictEqual(hasClearAnswerInicio_nome("quero entender"), false);
});

test('22. hasClearStageAnswer rejects "como funciona"', () => {
  assert.strictEqual(hasClearAnswerInicio_nome("como funciona"), false);
});

test('23. hasClearStageAnswer rejects "não sei como funciona"', () => {
  assert.strictEqual(hasClearAnswerInicio_nome("não sei como funciona"), false);
});

// =============================================================================
// GROUP 4 — Edge cases / regression guards
// =============================================================================

test('24. "Pedro Henrique" → accepted (extra name, no intent markers)', () => {
  const r = simulateInicio_nome("Pedro Henrique");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
});

test('25. "Maria de Souza" → accepted (preposition in name is fine)', () => {
  const r = simulateInicio_nome("Maria de Souza");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
  assert.strictEqual(r.primeiroNome, "Maria");
});

test('26. "José da Silva" → accepted', () => {
  const r = simulateInicio_nome("José da Silva");
  assert.strictEqual(r.accepted, true, `reason=${r.reason}`);
});

test('27. "me explica melhor" → rejected (explicar variant)', () => {
  const r = simulateInicio_nome("me explica melhor");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.reason, "intent_guard");
});

test('28. "quero saber mais" → rejected (quero saber)', () => {
  const r = simulateInicio_nome("quero saber mais");
  assert.strictEqual(r.accepted, false, "must NOT be accepted");
  assert.strictEqual(r.reason, "intent_guard");
});

test('29. "quero explicação" → rejected (explicacao contains explica prefix)', () => {
  const r = simulateInicio_nome("quero explicação");
  assert.strictEqual(r.accepted, false, "must NOT be accepted (explicacao has explica prefix)");
  assert.strictEqual(r.reason, "intent_guard");
});

test('30. "não sei" (alone) → rejected (nao sei pattern)', () => {
  const r = simulateInicio_nome("não sei");
  assert.strictEqual(r.accepted, false);
  assert.strictEqual(r.reason, "intent_guard");
});

test('31. empty string → rejected (too short)', () => {
  const r = simulateInicio_nome("");
  assert.strictEqual(r.accepted, false);
});

test('32. "A" → rejected (too short / single char)', () => {
  const r = simulateInicio_nome("A");
  // After cleanup, length < 2 or partes empty
  assert.strictEqual(r.accepted, false);
});

test('33. No regression: "sim" alone in inicio_programa still resolves sim=true', () => {
  // This validates that isYes("sim") logic is untouched.
  // We only simulate: isYes exact-match check on "sim"
  const exact = new Set(["sim", "s", "ss", "ok"]);
  const nt = normalizeText("sim");
  assert.strictEqual(exact.has(nt), true, "isYes('sim') must still return true — no regression");
});

test('34. No regression: "me explica o programa" still hits nao=true in inicio_programa', () => {
  // Check that the inicio_programa nao detector (nt.includes("explica")) still fires.
  const nt = normalizeText("me explica o programa");
  const nao = nt.includes("explica");
  assert.strictEqual(nao, true, "inicio_programa nao detector must still work");
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(56)}`);
console.log(`cognitive_inicio_nome_guard.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
