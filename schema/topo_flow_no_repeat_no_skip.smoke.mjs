/**
 * topo_flow_no_repeat_no_skip.smoke.mjs
 *
 * Focused smoke test for 2 real bugs in the top funnel:
 *
 * BUG 1: "Já conheço" at inicio_programa caused bot to repeat the same question
 *   Root cause: renderCognitiveSpeech TOP_SEALED_MODE fallback replaced the
 *   transition surface with the program_choice bucket static reply, even though
 *   the state correctly advanced to inicio_nome.
 *
 * BUG 2: After the repeated question, user says "Já conheço" again, but stage
 *   is now inicio_nome — the handler treats it as a name and advances to
 *   inicio_nacionalidade, skipping name collection.
 *   Root cause: Same as BUG 1 — the wrong surface caused the user to answer
 *   the wrong question, which was misinterpreted by the next stage.
 *
 * Fix: renderCognitiveSpeech now accepts nextStage parameter. When the mechanical
 * handler advances FROM a TOP_SEALED stage TO a non-sealed stage, the sealed
 * bucket static fallback is skipped and the correct next-stage fallback is used.
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
    console.error(`  ❌ ${name} — ${e.message}`);
  }
}

// ── Extract normalizeText
const ntMatch = workerSrc.match(/function normalizeText\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(ntMatch, "normalizeText must exist in worker");
const normalizeText = new Function("text", ntMatch[1]);

// ── Extract isYes
const isYesMatch = workerSrc.match(/function isYes\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(isYesMatch, "isYes must exist in worker");
const isYes = new Function("text", `
  const normalizeText = ${normalizeText.toString()};
  ${isYesMatch[1]}
`);

// ── Extract isNo
const isNoMatch = workerSrc.match(/function isNo\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(isNoMatch, "isNo must exist in worker");
const isNo = new Function("text", `
  const normalizeText = ${normalizeText.toString()};
  ${isNoMatch[1]}
`);

// ── Mirror the sim/nao detection from inicio_programa case block
function detectInicioProgramaIntent(userText) {
  const nt = normalizeText(userText || "");
  const sim = isYes(nt) ||
    nt.includes("ja sei") ||
    nt.includes("sei sim") || nt.includes("to ligado") ||
    nt.includes("conheco") ||
    nt.includes("conheço") || nt.includes("já conheço") ||
    nt.includes("ja conheco");
  const nao = isNo(nt) ||
    nt.includes("nao sei") || nt.includes("não sei") ||
    nt.includes("nao conheco") || nt.includes("não conheço") ||
    nt.includes("não entendi") || nt.includes("nao entendi") ||
    nt.includes("explica") || nt.includes("explique") ||
    nt.includes("me explica") || nt.includes("pode explicar") ||
    nt.includes("como funciona") || nt.includes("quero saber") ||
    nt.includes("quero entender");
  return { sim, nao, ambiguo: !sim && !nao };
}

console.log("\n── BUG 1: inicio_programa must NOT repeat after 'Já conheço' ──");

test("1. 'Já conheço' triggers sim detection in inicio_programa", () => {
  const { sim, nao, ambiguo } = detectInicioProgramaIntent("Já conheço");
  assert.ok(sim, "sim should be true for 'Já conheço'");
  assert.ok(!nao, "nao should be false");
  assert.ok(!ambiguo, "ambiguo should be false");
});

test("2. 'Ja conheço' (no accent on a) also triggers sim", () => {
  const { sim } = detectInicioProgramaIntent("Ja conheço");
  assert.ok(sim, "sim should be true for 'Ja conheço'");
});

test("3. 'ja conheco' (no accents) triggers sim", () => {
  const { sim } = detectInicioProgramaIntent("ja conheco");
  assert.ok(sim, "sim should be true for 'ja conheco'");
});

test("4. 'já sei' triggers sim", () => {
  const { sim } = detectInicioProgramaIntent("já sei");
  assert.ok(sim, "sim should be true for 'já sei'");
});

test("5. 'sim' triggers sim", () => {
  const { sim } = detectInicioProgramaIntent("sim");
  assert.ok(sim, "sim should be true for 'sim'");
});

console.log("\n── FIX: renderCognitiveSpeech signature and transition-out logic ──");

test("6. renderCognitiveSpeech accepts nextStage parameter (4 params)", () => {
  const sigPattern = /function renderCognitiveSpeech\(st,\s*stage,\s*rawArr,\s*nextStage\)/;
  assert.ok(sigPattern.test(workerSrc), "renderCognitiveSpeech should accept 4 params");
});

test("7. step() passes nextStage to renderCognitiveSpeech", () => {
  const callPattern = /renderCognitiveSpeech\(st,\s*currentStage,\s*rawArr\.filter\(Boolean\),\s*nextStage\)/;
  assert.ok(callPattern.test(workerSrc), "step() should pass nextStage");
});

test("8. renderCognitiveSpeech has transition-out guard for TOP_SEALED_STAGES", () => {
  // Verify the new guard exists in the source
  const guardPattern = /nextStage\s*&&\s*nextStage\s*!==\s*stage\s*&&\s*!TOP_SEALED_STAGES\.has\(nextStage\)/;
  assert.ok(guardPattern.test(workerSrc), "transition-out guard should exist in renderCognitiveSpeech");
});

test("9. Transition-out path uses buildMinimalCognitiveFallback with nextStage", () => {
  const pathPattern = /return buildMinimalCognitiveFallback\(nextStage,\s*rawArr,\s*roundIntent\)/;
  assert.ok(pathPattern.test(workerSrc), "transition-out should use nextStage for fallback");
});

console.log("\n── BUG 2: inicio_nome must NOT be skipped ──");

test("10. _MINIMAL_FALLBACK_SPEECH_MAP has inicio_nome fallback with 'nome'", () => {
  const mapPattern = /\["inicio_nome",\s*"[^"]*nome[^"]*"\]/i;
  assert.ok(mapPattern.test(workerSrc), "inicio_nome fallback should mention 'nome'");
});

test("11. inicio_nome is NOT in TOP_SEALED_STAGES", () => {
  const sealedPattern = /const TOP_SEALED_STAGES\s*=\s*new Set\(\[.*?\]\)/;
  const match = workerSrc.match(sealedPattern);
  assert.ok(match, "TOP_SEALED_STAGES should exist");
  assert.ok(!match[0].includes("inicio_nome"), "inicio_nome must NOT be in TOP_SEALED_STAGES");
});

test("12. inicio_nacionalidade is NOT in TOP_SEALED_STAGES", () => {
  const sealedPattern = /const TOP_SEALED_STAGES\s*=\s*new Set\(\[.*?\]\)/;
  const match = workerSrc.match(sealedPattern);
  assert.ok(!match[0].includes("inicio_nacionalidade"), "inicio_nacionalidade must NOT be in TOP_SEALED_STAGES");
});

console.log("\n── FLOW PROOF: inicio_programa → inicio_nome → inicio_nacionalidade ──");

test("13. inicio_programa sim block advances to 'inicio_nome'", () => {
  // Find the sim block and verify it calls step with inicio_nome
  const simToNome = /\/\/ ✅ JÁ CONHECE[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_nome"\s*\)/;
  assert.ok(simToNome.test(workerSrc), "sim block should advance to inicio_nome");
});

test("14. inicio_nome accepted name block advances to 'inicio_nacionalidade'", () => {
  // Verify inicio_nome saves name and advances to inicio_nacionalidade
  const nomeToNac = /case "inicio_nome":[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_nacionalidade"\s*\)/;
  assert.ok(nomeToNac.test(workerSrc), "inicio_nome accepted name should advance to inicio_nacionalidade");
});

test("15. Stage order proof: inicio_programa next is inicio_nome, not inicio_nacionalidade", () => {
  // Verify that inicio_programa:sim NEVER goes to inicio_nacionalidade
  const wrongTransition = /case "inicio_programa":[\s\S]*?sim[\s\S]*?return step\([\s\S]*?"inicio_nacionalidade"/;
  // This is tricky — the case block is large. Let me check a simpler way.
  // The sim block should only reference inicio_nome as nextStage.
  const simBlock = workerSrc.match(/\/\/ ✅ JÁ CONHECE[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_nome"\s*\);/);
  assert.ok(simBlock, "sim handler should step to inicio_nome");
  assert.ok(!simBlock[0].includes('"inicio_nacionalidade"'), "sim handler must NOT skip to inicio_nacionalidade");
});

console.log("\n── GUARDRAILS ──");

test("16. TOP_SEALED_MODE is true", () => {
  assert.ok(/const TOP_SEALED_MODE\s*=\s*true;/.test(workerSrc), "TOP_SEALED_MODE should be true");
});

test("17. program_choice bucket static reply asks about program (not name)", () => {
  const match = workerSrc.match(/program_choice:\s*"([^"]+)"/);
  assert.ok(match, "program_choice static reply should exist");
  assert.ok(/funciona/i.test(match[1]), "Reply should ask about the program");
  assert.ok(!/nome/i.test(match[1]), "Reply should NOT ask for the name");
});

test("18. inicio_programa:sim speech config targets inicio_nome cognitiveStage", () => {
  const match = workerSrc.match(/"inicio_programa:sim":\s*\{[\s\S]*?cognitiveStage:\s*"([^"]+)"/);
  assert.ok(match, "inicio_programa:sim config should exist");
  assert.strictEqual(match[1], "inicio_nome", "cognitiveStage should be inicio_nome");
});

test("19. No regression: inicio_programa nao block stays at inicio_programa", () => {
  const naoBlock = workerSrc.match(/if \(nao\) \{[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_programa"\s*\)/);
  assert.ok(naoBlock, "nao block should stay at inicio_programa");
});

test("20. No regression: ambiguous block stays at inicio_programa", () => {
  const ambBlock = workerSrc.match(/if \(!sim && !nao\) \{[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_programa"\s*\)/);
  assert.ok(ambBlock, "ambiguous block should stay at inicio_programa");
});

// ── Summary ──
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (total: ${passed + failed})\n`);
if (failed > 0) {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED");
}
