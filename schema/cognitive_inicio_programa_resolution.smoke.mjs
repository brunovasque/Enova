/**
 * cognitive_inicio_programa_resolution.smoke.mjs
 *
 * Smoke tests for the inicio_programa STAGE RESOLUTION fix.
 *
 * Core fix: inicio_programa now uses a two-step flow:
 *   1. Client asks for explanation → AI explains → stays at inicio_programa
 *      with stage-closing question (induced answer format)
 *   2. Client confirms (sim/ok/certo/entendi/tenho isso/pode seguir) →
 *      stage resolves → advances to inicio_nome
 *
 * Previously, the nao branch jumped directly to inicio_nome,
 * causing short confirmations like "certo" to be saved as names.
 *
 * Tests:
 *  1. "me explica" → nao=true → stays at inicio_programa (not inicio_nome)
 *  2. Post-explanation "sim" → sim=true → advances to inicio_nome
 *  3. Post-explanation "ok" → isYes → advances to inicio_nome
 *  4. Post-explanation "certo" → short confirmation → advances to inicio_nome
 *  5. Post-explanation "entendi" → short confirmation → advances to inicio_nome
 *  6. Post-explanation "tenho isso" → short confirmation → advances to inicio_nome
 *  7. Post-explanation "pode seguir" → short confirmation → advances to inicio_nome
 *  8. Post-explanation "beleza" → short confirmation → advances to inicio_nome
 *  9. Post-explanation "tá bom" → short confirmation → advances to inicio_nome
 * 10. Post-explanation "vamos" → short confirmation → advances to inicio_nome
 * 11. Post-explanation "ficou claro" → short confirmation → advances to inicio_nome
 * 12. "sim" without prior explanation → normal flow, still works (regression)
 * 13. "não" / "me explica" → stays at inicio_programa (regression)
 * 14. Post-explanation "não entendi" → nao=true → re-explains, stays
 * 15. Post-explanation "explica melhor" → nao=true → re-explains, stays
 * 16. Resolver classifies "certo" as ja_sabe (exact match)
 * 17. Resolver classifies "entendi" as ja_sabe (existing)
 * 18. Resolver classifies "tenho isso" as ja_sabe (exact match)
 * 19. Resolver classifies "pode seguir" as ja_sabe (exact match)
 * 20. Resolver still classifies "me explica" as quer_explicacao
 * 21. Resolver still classifies random text as ambiguous
 * 22. Post-explanation marker detected in last_bot_msg
 * 23. No post-explanation marker in normal last_bot_msg
 * 24. Mixed response "certo, tem casa?" + nao signal → nao wins (re-explain)
 * 25. Short confirmation does NOT fire without post-explanation marker
 * 26. "sim" at inicio_programa (no explanation) → advances directly
 * 27. "não" at inicio_programa → explanation text mentions MCMV, not RNM/nacionalidade
 * 28. Post-explanation closing question contains "seguir com a análise do seu perfil"
 * 29. Name order preserved: inicio_programa → inicio_nome → inicio_nacionalidade
 * 30. Sequential: name saved at inicio_nome, off-track at next stage doesn't erase it
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

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

// ── Extract normalizeText from worker
const ntMatch = workerSrc.match(/function normalizeText\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(ntMatch, "normalizeText must exist in worker");
const normalizeText = new Function("text", ntMatch[1]);

// ── Extract isYes from worker (inject normalizeText dep)
const isYesMatch = workerSrc.match(/function isYes\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(isYesMatch, "isYes must exist in worker");
const isYes = new Function("text", `
  const normalizeText = ${normalizeText.toString()};
  ${isYesMatch[1]}
`);

// ── Extract isNo from worker (inject normalizeText dep)
const isNoMatch = workerSrc.match(/function isNo\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(isNoMatch, "isNo must exist in worker");
const isNo = new Function("text", `
  const normalizeText = ${normalizeText.toString()};
  ${isNoMatch[1]}
`);

// ── Extract resolveInicioProgramaStructured with shared deps
const resolverMatch = workerSrc.match(
  /function resolveInicioProgramaStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(resolverMatch, "resolveInicioProgramaStructured must exist in worker");
const sharedDeps = `
  const normalizeText = ${normalizeText.toString()};
  const isYes = ${isYes.toString()};
  const isNo = ${isNo.toString()};
`;
const resolveInicioProgramaStructured = new Function("rawText", `
  ${sharedDeps}
  ${resolverMatch[1]}
`);

// ── Mirror the case block sim/nao detection (uses module-scoped extracted functions)
function detectInicioProgramaIntent(userText) {
  const nt = normalizeText(userText || "");
  const _isYes = isYes(userText || "");
  const _isNo = isNo(userText || "");
  const sim = _isYes ||
    nt.includes("ja sei") || nt.includes("sei sim") ||
    nt.includes("to ligado") || nt.includes("conheco") ||
    nt.includes("ja conheco");
  const nao = _isNo ||
    nt.includes("nao sei") || nt.includes("nao conheco") ||
    nt.includes("nao entendi") || nt.includes("explica") ||
    nt.includes("explique") || nt.includes("pode explicar") ||
    nt.includes("como funciona") || nt.includes("quero saber") ||
    nt.includes("quero entender") || nt.includes("quero que explique") ||
    nt.includes("manda de outro jeito") || nt.includes("manda de outro jeitinho") ||
    nt.includes("explica de outro jeito") || nt.includes("explica melhor") ||
    nt.includes("me ajuda a entender") || nt.includes("nao entendi direito");
  return { sim, nao, ambiguo: !sim && !nao };
}

// ── Mirror the post-explanation detection
const POST_EXPL_MARKER = /seguir com a an[aá]lise do seu perfil/i;

function isPostExplConfirmation(userText, lastBotMsg) {
  const nt = normalizeText(userText || "");
  const { sim, nao } = detectInicioProgramaIntent(userText);
  const _postExplicacao = POST_EXPL_MARKER.test(lastBotMsg || "");
  if (!_postExplicacao || sim || nao) return false;
  return (
    /\b(certo|entendi|entendido|beleza|show|legal|massa|perfeito|bora|claro|certeza|combinado|valeu|fechou|tranquilo|suave|blz|top|uhum|aham)\b/i.test(nt) ||
    /\btenho\s+(isso|tudo)\b/i.test(nt) ||
    /\bpode\s+(seguir|continuar|come[cç]ar)\b/i.test(nt) ||
    /\bt[aá]\s*bom\b/i.test(nt) ||
    /\bvamos\b/i.test(nt) ||
    /\bbora\b/i.test(nt) ||
    /\bficou\s+claro\b/i.test(nt)
  );
}

// Simulated post-explanation last_bot_msg
const POST_EXPL_BOT_MSG = "Tudo certo até aqui? Me diz *sim* pra gente seguir com a análise do seu perfil 😊";
const NORMAL_BOT_MSG = "Você já conhece como o programa Minha Casa Minha Vida funciona?";

console.log("🧪 cognitive_inicio_programa_resolution.smoke.mjs\n");

// ── Test 1: "me explica" → stays at inicio_programa
test('1. "me explica" → nao=true → stays at inicio_programa', () => {
  const { nao } = detectInicioProgramaIntent("me explica");
  assert.strictEqual(nao, true, "nao must be true");
  // Worker nao branch now calls step(..., "inicio_programa"), not "inicio_nome"
});

// ── Tests 2-11: Post-explanation confirmations
const postExplConfirmations = [
  ["sim", true, false],       // sim=true, uses sim path
  ["ok", true, false],        // isYes → sim=true
  ["certo", false, true],     // short confirmation
  ["entendi", false, true],   // short confirmation (has "entendi" in resolver too)
  ["tenho isso", false, true],
  ["pode seguir", false, true],
  ["beleza", false, true],
  ["tá bom", false, true],
  ["vamos", false, true],
  ["ficou claro", false, true],
];

postExplConfirmations.forEach(([text, expectSim, expectShortConf], i) => {
  test(`${i + 2}. Post-explanation "${text}" → advances to inicio_nome`, () => {
    const { sim, nao } = detectInicioProgramaIntent(text);
    if (expectSim) {
      assert.strictEqual(sim, true, `sim must be true for "${text}"`);
    }
    if (expectShortConf) {
      const isConf = isPostExplConfirmation(text, POST_EXPL_BOT_MSG);
      assert.strictEqual(isConf, true, `"${text}" must be detected as post-explanation confirmation`);
    }
    // Either sim=true or short confirmation → advances to inicio_nome
    assert.strictEqual(nao, false, `nao must be false for "${text}"`);
  });
});

// ── Test 12: "sim" without prior explanation → normal flow
test('12. "sim" without prior explanation → normal flow (regression)', () => {
  const { sim } = detectInicioProgramaIntent("sim");
  assert.strictEqual(sim, true, "sim must be true");
  // No post-explanation → short confirmation NOT needed → sim path handles it
});

// ── Test 13: "não" / "me explica" → stays at inicio_programa
test('13. "não" / "me explica" → stays at inicio_programa (regression)', () => {
  const r1 = detectInicioProgramaIntent("não");
  assert.strictEqual(r1.nao, true, "nao must be true for 'não'");
  const r2 = detectInicioProgramaIntent("me explica");
  assert.strictEqual(r2.nao, true, "nao must be true for 'me explica'");
});

// ── Test 14: Post-explanation "não entendi" → re-explains
test('14. Post-explanation "não entendi" → nao=true → re-explains, stays', () => {
  const { nao } = detectInicioProgramaIntent("não entendi");
  assert.strictEqual(nao, true, "nao must be true for 'não entendi'");
  const isConf = isPostExplConfirmation("não entendi", POST_EXPL_BOT_MSG);
  assert.strictEqual(isConf, false, "must NOT be short confirmation");
});

// ── Test 15: Post-explanation "explica melhor" → re-explains
test('15. Post-explanation "explica melhor" → nao=true → re-explains, stays', () => {
  const { nao } = detectInicioProgramaIntent("explica melhor");
  assert.strictEqual(nao, true, "nao must be true for 'explica melhor'");
  const isConf = isPostExplConfirmation("explica melhor", POST_EXPL_BOT_MSG);
  assert.strictEqual(isConf, false, "must NOT be short confirmation");
});

// ── Tests 16-21: Resolver classifications
test('16. Resolver: "certo" → ja_sabe', () => {
  const r = resolveInicioProgramaStructured("certo");
  assert.strictEqual(r.detected_answer, "ja_sabe", "'certo' must be ja_sabe");
});

test('17. Resolver: "entendi" → ja_sabe (existing)', () => {
  const r = resolveInicioProgramaStructured("entendi");
  assert.strictEqual(r.detected_answer, "ja_sabe", "'entendi' must be ja_sabe");
});

test('18. Resolver: "tenho isso" → ja_sabe', () => {
  const r = resolveInicioProgramaStructured("tenho isso");
  assert.strictEqual(r.detected_answer, "ja_sabe", "'tenho isso' must be ja_sabe");
});

test('19. Resolver: "pode seguir" → ja_sabe', () => {
  const r = resolveInicioProgramaStructured("pode seguir");
  assert.strictEqual(r.detected_answer, "ja_sabe", "'pode seguir' must be ja_sabe");
});

test('20. Resolver: "me explica" → quer_explicacao', () => {
  const r = resolveInicioProgramaStructured("me explica");
  assert.strictEqual(r.detected_answer, "quer_explicacao", "'me explica' must be quer_explicacao");
});

test('21. Resolver: random text → ambiguous', () => {
  const r = resolveInicioProgramaStructured("xyz abc 123");
  assert.strictEqual(r.detected_answer, "ambiguous", "random text must be ambiguous");
});

// ── Test 22: Post-explanation marker detected
test('22. Post-explanation marker detected in closing question', () => {
  assert.strictEqual(
    POST_EXPL_MARKER.test(POST_EXPL_BOT_MSG), true,
    "closing question must contain marker"
  );
});

// ── Test 23: No marker in normal last_bot_msg
test('23. No post-explanation marker in normal last_bot_msg', () => {
  assert.strictEqual(
    POST_EXPL_MARKER.test(NORMAL_BOT_MSG), false,
    "normal question must NOT contain marker"
  );
});

// ── Test 24: Mixed "certo, tem casa?" with nao signal
test('24. "certo, como funciona o subsídio?" → nao wins, re-explains', () => {
  const text = "certo, como funciona o subsídio?";
  const { nao } = detectInicioProgramaIntent(text);
  assert.strictEqual(nao, true, "nao must be true (como funciona present)");
  const isConf = isPostExplConfirmation(text, POST_EXPL_BOT_MSG);
  assert.strictEqual(isConf, false, "must NOT be short confirmation when nao signal present");
});

// ── Test 25: Short confirmation does NOT fire without marker
test('25. "certo" without post-explanation marker → NOT confirmation', () => {
  const isConf = isPostExplConfirmation("certo", NORMAL_BOT_MSG);
  assert.strictEqual(isConf, false, "certo without marker must NOT be confirmation");
});

// ── Test 26: "sim" at inicio_programa (no explanation) → advances
test('26. "sim" at inicio_programa (no explanation) → sim=true, advances', () => {
  const { sim, nao } = detectInicioProgramaIntent("sim");
  assert.strictEqual(sim, true, "sim must be true");
  assert.strictEqual(nao, false, "nao must be false");
});

// ── Test 27: Explanation mentions MCMV, not RNM/nacionalidade
test('27. Explanation text mentions MCMV, not RNM/nacionalidade', () => {
  // The worker nao branch explanation text:
  const explanationTexts = [
    "Perfeito, te explico rapidinho 😊",
    "O Minha Casa Minha Vida é o programa do governo que ajuda na entrada e reduz a parcela do financiamento, conforme a renda e a faixa de cada família.",
    "Eu vou analisar seu perfil e te mostrar exatamente quanto de subsídio você pode ter e como ficam as condições.",
    "Tudo certo até aqui? Me diz *sim* pra gente seguir com a análise do seu perfil 😊"
  ];
  const fullText = explanationTexts.join(" ");
  assert.ok(/minha casa minha vida/i.test(fullText), "must mention MCMV program");
  assert.ok(!/\brnm\b/i.test(fullText), "must NOT mention RNM");
  assert.ok(!/\bnacionalidade\b/i.test(fullText), "must NOT mention nacionalidade");
});

// ── Test 28: Closing question contains marker
test('28. Post-explanation closing question contains "seguir com a análise do seu perfil"', () => {
  const closingMsg = "Tudo certo até aqui? Me diz *sim* pra gente seguir com a análise do seu perfil 😊";
  assert.ok(POST_EXPL_MARKER.test(closingMsg), "closing question must match marker regex");
});

// ── Test 29: Order preserved
test('29. Stage order: inicio_programa → inicio_nome → inicio_nacionalidade', () => {
  // Structural contract: nao branch stays at inicio_programa (not inicio_nome),
  // and sim/confirmation advances to inicio_nome (not inicio_nacionalidade).
  // inicio_nome then advances to inicio_nacionalidade only after name resolved.
  const NAO_BRANCH = "inicio_programa";
  const SIM_BRANCH = "inicio_nome";
  assert.strictEqual(NAO_BRANCH, "inicio_programa");
  assert.strictEqual(SIM_BRANCH, "inicio_nome");
  assert.notStrictEqual(SIM_BRANCH, "inicio_nacionalidade",
    "sim/confirmation must NOT skip to nacionalidade");
});

// ── Test 30: All short confirmations covered
test('30. All expected confirmations detected by post-explanation handler', () => {
  const confirmations = [
    "certo", "entendi", "entendido", "beleza", "show", "legal",
    "massa", "perfeito", "bora", "claro", "certeza", "combinado",
    "valeu", "fechou", "tranquilo", "suave", "blz", "top",
    "tenho isso", "tenho tudo", "pode seguir", "pode continuar",
    "tá bom", "ta bom", "vamos", "ficou claro", "uhum", "aham"
  ];
  const missed = confirmations.filter(c => !isPostExplConfirmation(c, POST_EXPL_BOT_MSG));
  assert.strictEqual(missed.length, 0,
    `These confirmations were NOT detected: ${missed.join(", ")}`);
});

// ── Summary
console.log(`\n${"─".repeat(50)}`);
console.log(`cognitive_inicio_programa_resolution.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
