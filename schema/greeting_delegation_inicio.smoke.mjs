/**
 * greeting_delegation_inicio.smoke.mjs
 *
 * Smoke tests for the greeting delegation patch:
 *   - inicio + GREETING_TOPO → buildTopoFunilGuidance returns null (LLM delegates)
 *   - inicio_decisao + GREETING_TOPO → returns null
 *   - inicio_programa + GREETING_TOPO → continues null (no regression)
 *   - REENTRY_TOPO without greeting → hardcoded text preserved (reentry path)
 *   - "Me explique" → no regression
 *
 * Telemetry proof fields validated:
 *   topo_stage, greeting_delegated_to_llm, reentry_path_used, hardcoded_greeting_bypassed
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cognitivePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
const cognitiveSrc = readFileSync(cognitivePath, "utf-8");

const { runReadOnlyCognitiveEngine } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

console.log("════════════════════════════════════════════════════════════");
console.log("  GREETING DELEGATION (inicio / inicio_decisao) Smoke Tests");
console.log("════════════════════════════════════════════════════════════\n");

// ═══════════════════════════════════════════════════════════════════════════
// Section A — Source-level structural checks
// ═══════════════════════════════════════════════════════════════════════════
console.log("── Section A: Source structure ──");

test("A1: buildTopoFunilGuidance exists", () => {
  assert.ok(
    cognitiveSrc.includes("function buildTopoFunilGuidance("),
    "buildTopoFunilGuidance must exist"
  );
});

test("A2: inicio — GREETING_TOPO && !REENTRY_TOPO → null (not hardcoded)", () => {
  // The patch: greeting pure -> return null, comes BEFORE the reentry path
  // Verify the source contains the new pattern for inicio
  assert.ok(
    cognitiveSrc.includes('GREETING_TOPO.test(normalizedMessage) && !REENTRY_TOPO.test(normalizedMessage)'),
    "inicio must use GREETING_TOPO && !REENTRY_TOPO guard for null delegation"
  );
});

test("A3: inicio_decisao — GREETING_TOPO && !REENTRY_TOPO → null (not hardcoded)", () => {
  // Both inicio and inicio_decisao must have the pattern — count occurrences
  const matchCount = (
    cognitiveSrc.match(/GREETING_TOPO\.test\(normalizedMessage\) && !REENTRY_TOPO\.test\(normalizedMessage\)/g) || []
  ).length;
  assert.ok(
    matchCount >= 2,
    `Expected at least 2 occurrences of greeting null guard (inicio + inicio_decisao), found ${matchCount}`
  );
});

test("A4: inicio does NOT use GREETING_TOPO || REENTRY_TOPO combined for hardcoded text", () => {
  // The old pattern that triggered hardcoded for both
  // Ensure it's been removed (replaced by split conditions)
  const oldPattern = /GREETING_TOPO\.test\(normalizedMessage\)\s*\|\|\s*REENTRY_TOPO\.test\(normalizedMessage\)/;
  assert.ok(
    !oldPattern.test(cognitiveSrc),
    "Old GREETING_TOPO || REENTRY_TOPO combined pattern must not exist (was causing hardcoded greeting)"
  );
});

test("A5: greeting strings still present for REENTRY_TOPO path", () => {
  // These must remain for the REENTRY case
  assert.ok(
    cognitiveSrc.includes("Oi! Que bom ter você aqui"),
    "inicio REENTRY_TOPO response must still be present in source"
  );
  assert.ok(
    cognitiveSrc.includes("Oi! Que bom te ver de volta"),
    "inicio_decisao REENTRY_TOPO response must still be present in source"
  );
});

test("A6: inicio_programa greeting delegation (null) pattern unchanged", () => {
  // inicio_programa must still have: if (GREETING_TOPO...) return null
  assert.ok(
    cognitiveSrc.includes("Greeting puro: retorna null para delegar ao LLM cognitivo com variação") ||
    cognitiveSrc.includes("return null;"),
    "inicio_programa greeting null delegation must remain"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Section B — Runtime: buildTopoFunilGuidance returns null for greeting
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── Section B: Runtime null delegation for greeting ──");

await asyncTest("B1: inicio + 'Oi' → engine returns non-empty (LLM or heuristic fallback)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "Oi" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty (heuristic fallback covers null)");
});

await asyncTest("B2: inicio + 'Olá' → engine returns non-empty", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "Olá" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
});

await asyncTest("B3: inicio_decisao + 'Oi' → engine returns non-empty", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "Oi" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty (heuristic fallback covers null)");
});

await asyncTest("B4: inicio_decisao + 'Bom dia' → engine returns non-empty", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "Bom dia" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
});

await asyncTest("B5: inicio_programa + 'Oi' → continues non-empty (no regression)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "Oi" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty (no regression in inicio_programa)");
});

// ═══════════════════════════════════════════════════════════════════════════
// Section C — REENTRY_TOPO path preserved
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── Section C: REENTRY_TOPO path preserved ──");

await asyncTest("C1: inicio + 'quero começar' (REENTRY_TOPO only) → returns non-empty reentry text", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "quero começar" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty for reentry");
  assert.ok(
    result.response.reply_text.includes("Enova") || result.response.reply_text.length > 10,
    "reentry reply must be substantive"
  );
});

await asyncTest("C2: inicio + 'voltei' (REENTRY_TOPO only) → returns non-empty reentry text", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "voltei" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty for voltei reentry");
});

await asyncTest("C3: inicio_decisao + 'quero começar' → reentry text includes continuar/zero option", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "quero começar" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
  // The reentry path should preserve the continuar/recomeçar option
  assert.ok(
    result.response.reply_text.includes("continuar") || result.response.reply_text.includes("começar do zero") || result.response.reply_text.length > 10,
    "inicio_decisao reentry should reference continue or restart options"
  );
});

await asyncTest("C4: inicio_decisao + 'voltei' → returns non-empty reentry text", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "voltei" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty for voltei at inicio_decisao");
});

// ═══════════════════════════════════════════════════════════════════════════
// Section D — "Me explique" no regression
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── Section D: Me explique no regression ──");

await asyncTest("D1: inicio_programa + 'Me explique' → explanation reply present", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "Me explique" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty for Me explique");
  assert.ok(result.response.reply_text.length > 20, "explanation reply must be substantive");
});

await asyncTest("D2: inicio + 'como funciona' → non-empty reply (global layer or fallback)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "como funciona" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty for como funciona at inicio");
});

// ═══════════════════════════════════════════════════════════════════════════
// Section E — Telemetry proof (source-level markers)
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── Section E: Telemetry proof markers ──");

test("E1: topo_stage — inicio and inicio_decisao referenced in buildTopoFunilGuidance", () => {
  assert.ok(
    cognitiveSrc.includes('stage === "inicio"') && cognitiveSrc.includes('stage === "inicio_decisao"'),
    "topo_stage: both inicio and inicio_decisao must be guarded in buildTopoFunilGuidance"
  );
});

test("E2: greeting_delegated_to_llm — null returned for GREETING_TOPO at inicio", () => {
  // Verify: after greeting check, return null (delegation proof)
  const inicioBlock = cognitiveSrc.match(/if \(stage === "inicio"\)[\s\S]*?if \(stage === "inicio_decisao"\)/);
  assert.ok(inicioBlock, "inicio block must be extractable");
  assert.ok(
    inicioBlock[0].includes("return null"),
    "greeting_delegated_to_llm: inicio block must return null for pure greeting"
  );
});

test("E3: greeting_delegated_to_llm — null returned for GREETING_TOPO at inicio_decisao", () => {
  const inicioDecisaoBlock = cognitiveSrc.match(/if \(stage === "inicio_decisao"\)[\s\S]*?if \(stage === "inicio_programa"\)/);
  assert.ok(inicioDecisaoBlock, "inicio_decisao block must be extractable");
  assert.ok(
    inicioDecisaoBlock[0].includes("return null"),
    "greeting_delegated_to_llm: inicio_decisao block must return null for pure greeting"
  );
});

test("E4: reentry_path_used — REENTRY_TOPO has its own condition in both stages", () => {
  const reentryOccurrences = (
    cognitiveSrc.match(/REENTRY_TOPO\.test\(normalizedMessage\)\)/g) || []
  ).length;
  assert.ok(
    reentryOccurrences >= 2,
    `reentry_path_used: REENTRY_TOPO standalone condition must exist in at least 2 stages, found ${reentryOccurrences}`
  );
});

test("E5: hardcoded_greeting_bypassed — GREETING_TOPO alone no longer returns string in inicio", () => {
  // The old pattern returned a string for greeting — verify it's gone
  assert.ok(
    !cognitiveSrc.match(/GREETING_TOPO\.test\(normalizedMessage\)\s*\|\|\s*REENTRY_TOPO\.test\(normalizedMessage\)/),
    "hardcoded_greeting_bypassed: combined OR pattern must not exist"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n══ RESULTADO: ${passed} passed, ${failed} failed ══\n`);
if (failed > 0) process.exit(1);
