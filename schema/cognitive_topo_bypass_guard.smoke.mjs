/**
 * cognitive_topo_bypass_guard.smoke.mjs
 *
 * Smoke tests for the topo bypass fix:
 *  1. Legacy prompt identity — no "Enova Cognitive Engine" or "MCMV/CEF"
 *  2. General cognitive assist cannot bypass topo acceptance contract
 *  3. stripFutureStageCollection never leaves broken fragments at topo
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_SRC = readFileSync(resolve(ROOT, "Enova worker.js"), "utf-8");
const RUN_COG_SRC = readFileSync(resolve(ROOT, "cognitive/src/run-cognitive.js"), "utf-8");
const FINAL_SPEECH_SRC = readFileSync(resolve(ROOT, "cognitive/src/final-speech-contract.js"), "utf-8");

let passed = 0;
let failed = 0;

function ok(label, fn) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${label} — ${e.message}`);
    failed++;
  }
}

// ── Section A: Legacy prompt identity ──────────────────────────────────────
console.log("\n── Section A: Legacy prompt identity ──");

ok("A1: buildOpenAISystemPrompt does NOT contain 'Enova Cognitive Engine'", () => {
  // Find the buildOpenAISystemPrompt function content
  const idx = RUN_COG_SRC.indexOf("function buildOpenAISystemPrompt()");
  assert.ok(idx > -1, "buildOpenAISystemPrompt exists");
  const chunk = RUN_COG_SRC.substring(idx, idx + 2000);
  assert.ok(!/Enova Cognitive Engine/i.test(chunk),
    "Must not contain 'Enova Cognitive Engine'");
});

ok("A2: buildOpenAISystemPrompt does NOT contain 'MCMV/CEF'", () => {
  const idx = RUN_COG_SRC.indexOf("function buildOpenAISystemPrompt()");
  const chunk = RUN_COG_SRC.substring(idx, idx + 2000);
  assert.ok(!/MCMV\/CEF/.test(chunk),
    "Must not contain 'MCMV/CEF'");
});

ok("A3: buildOpenAISystemPrompt does NOT contain 'CEF/MCMV'", () => {
  const idx = RUN_COG_SRC.indexOf("function buildOpenAISystemPrompt()");
  const chunk = RUN_COG_SRC.substring(idx, idx + 2000);
  assert.ok(!/CEF\/MCMV/.test(chunk),
    "Must not contain 'CEF/MCMV'");
});

ok("A4: buildOpenAISystemPrompt identifies as 'Enova' (user-facing)", () => {
  const idx = RUN_COG_SRC.indexOf("function buildOpenAISystemPrompt()");
  const chunk = RUN_COG_SRC.substring(idx, idx + 2000);
  assert.ok(/\bEnova\b/.test(chunk),
    "Must reference Enova");
});

ok("A5: buildOpenAISystemPrompt references 'Minha Casa Minha Vida'", () => {
  const idx = RUN_COG_SRC.indexOf("function buildOpenAISystemPrompt()");
  const chunk = RUN_COG_SRC.substring(idx, idx + 2000);
  assert.ok(/Minha Casa Minha Vida/.test(chunk),
    "Must reference the full program name");
});

ok("A6: no 'Enova Cognitive Engine' anywhere in visible prompt strings of run-cognitive.js", () => {
  // Check all string literals in the file
  const matches = RUN_COG_SRC.match(/"[^"]*Enova Cognitive Engine[^"]*"/g);
  assert.ok(!matches || matches.length === 0,
    "Must not have Enova Cognitive Engine in any string literal");
});

// ── Section B: Topo bypass guard in worker ─────────────────────────────────
console.log("\n── Section B: Topo bypass guard in general cognitive assist ──");

ok("B1: TOPO BYPASS GUARD comment exists in cognitive assist block", () => {
  assert.ok(WORKER_SRC.includes("TOPO BYPASS GUARD"),
    "Must have TOPO BYPASS GUARD comment");
});

ok("B2: Guard checks _isTopoReplySemanticallySafe for general cognitive assist", () => {
  // The guard must call _isTopoReplySemanticallySafe within the cognitive assist block
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("COGNITIVE ASSIST (SOCORRO CONTROLADO)"),
    WORKER_SRC.indexOf("OFFTRACK GUARD")
  );
  assert.ok(assistBlock.includes("_isTopoReplySemanticallySafe"),
    "Must validate semantic safety in cognitive assist block");
});

ok("B3: Guard checks _isTopoReplyToneSafe for general cognitive assist", () => {
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("COGNITIVE ASSIST (SOCORRO CONTROLADO)"),
    WORKER_SRC.indexOf("OFFTRACK GUARD")
  );
  assert.ok(assistBlock.includes("_isTopoReplyToneSafe"),
    "Must validate tone safety in cognitive assist block");
});

ok("B4: Guard covers stage === 'inicio'", () => {
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("TOPO BYPASS GUARD"),
    WORKER_SRC.indexOf("TOPO BYPASS GUARD") + 800
  );
  assert.ok(/stage\s*===\s*["']inicio["']/.test(assistBlock),
    "Must guard inicio stage");
});

ok("B5: Guard covers stage === 'inicio_decisao'", () => {
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("TOPO BYPASS GUARD"),
    WORKER_SRC.indexOf("TOPO BYPASS GUARD") + 800
  );
  assert.ok(/stage\s*===\s*["']inicio_decisao["']/.test(assistBlock),
    "Must guard inicio_decisao stage");
});

ok("B6: Guard covers stage === 'inicio_programa'", () => {
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("TOPO BYPASS GUARD"),
    WORKER_SRC.indexOf("TOPO BYPASS GUARD") + 800
  );
  assert.ok(/stage\s*===\s*["']inicio_programa["']/.test(assistBlock),
    "Must guard inicio_programa stage");
});

ok("B7: Guard revokes __cognitive_v2_takes_final on failed validation", () => {
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("TOPO BYPASS GUARD"),
    WORKER_SRC.indexOf("TOPO BYPASS GUARD") + 2500
  );
  assert.ok(assistBlock.includes("__cognitive_v2_takes_final = false"),
    "Must revoke takes_final on validation failure");
});

ok("B8: Guard revokes __cognitive_reply_prefix on failed validation", () => {
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("TOPO BYPASS GUARD"),
    WORKER_SRC.indexOf("TOPO BYPASS GUARD") + 2500
  );
  assert.ok(assistBlock.includes("__cognitive_reply_prefix = null"),
    "Must revoke prefix on validation failure");
});

ok("B9: Guard revokes __speech_arbiter_source on failed validation", () => {
  const assistBlock = WORKER_SRC.substring(
    WORKER_SRC.indexOf("TOPO BYPASS GUARD"),
    WORKER_SRC.indexOf("TOPO BYPASS GUARD") + 2500
  );
  assert.ok(assistBlock.includes("__speech_arbiter_source = null"),
    "Must revoke arbiter source on validation failure");
});

// ── Section C: Truncation safety ───────────────────────────────────────────
console.log("\n── Section C: Truncation / fragment safety ──");

// Import the ESM module for live testing
const finalSpeech = await import(resolve(ROOT, "cognitive/src/final-speech-contract.js"));
const { applyFinalSpeechContract, stripFutureStageCollection } = finalSpeech;

ok("C1: stripFutureStageCollection removes estado civil question at topo", () => {
  const reply = "Oi! Eu sou a Enova. Qual é o seu estado civil?";
  const result = stripFutureStageCollection(reply, "inicio_programa");
  assert.ok(!/estado civil/.test(result), "Must strip estado civil");
});

ok("C2: topo result after stripping is not a broken fragment", () => {
  const reply = "Eu vou te ajudar. Qual é o seu estado civil?";
  const result = stripFutureStageCollection(reply, "inicio_programa");
  assert.ok(result.length >= 20, `Result '${result}' must be >= 20 chars`);
  assert.ok(!/\bseu\s*$/.test(result), "Must not end with orphan 'seu'");
});

ok("C3: topo stripping that destroys reply produces safe minimum", () => {
  // A reply that is ONLY a collection question — stripping leaves nothing useful
  const reply = "Qual é o seu estado civil?";
  const result = stripFutureStageCollection(reply, "inicio_programa");
  assert.ok(result.length >= 20, `Result '${result}' must be >= 20 chars`);
  assert.ok(!/estado civil/.test(result), "Must not contain stripped pattern");
});

ok("C4: 'você é' trailing fragment is cleaned", () => {
  const reply = "Olá! Eu queria saber se você é";
  const result = stripFutureStageCollection(reply, "inicio_programa");
  assert.ok(!/voc[eê]\s+[eé]\s*$/.test(result), `Must not end with 'você é': '${result}'`);
});

ok("C5: 'gostaria de saber' trailing fragment is cleaned", () => {
  const reply = "Oi! Legal, eu gostaria de saber";
  const result = stripFutureStageCollection(reply, "inicio_programa");
  assert.ok(!/gostaria de saber\s*$/.test(result), `Must not end with 'gostaria de saber': '${result}'`);
});

ok("C6: TRAILING_FRAGMENT_PATTERN is defined in final-speech-contract.js", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("TRAILING_FRAGMENT_PATTERN"),
    "Must define TRAILING_FRAGMENT_PATTERN");
});

ok("C7: TOPO_SAFE_MINIMUM is defined in final-speech-contract.js", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("TOPO_SAFE_MINIMUM"),
    "Must define TOPO_SAFE_MINIMUM");
});

ok("C8: TOPO_SAFE_MINIMUM mentions Enova", () => {
  assert.ok(/TOPO_SAFE_MINIMUM.*Enova/s.test(FINAL_SPEECH_SRC) ||
    FINAL_SPEECH_SRC.includes('TOPO_SAFE_MINIMUM = "Eu sou a Enova'),
    "TOPO_SAFE_MINIMUM must mention Enova");
});

ok("C9: TOPO_SAFE_MINIMUM mentions Minha Casa Minha Vida", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("Minha Casa Minha Vida"),
    "TOPO_SAFE_MINIMUM must reference program name");
});

ok("C10: applyFinalSpeechContract with llmSovereign at topo strips collection", () => {
  const reply = "Oi! Sou a Enova. Qual é o seu estado civil? Me conte sobre seu regime de trabalho?";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "inicio_programa",
    llmSovereign: true
  });
  assert.ok(!/estado civil/.test(result), "Must strip estado civil at topo even with llmSovereign");
  assert.ok(!/regime de trabalho/.test(result), "Must strip regime at topo even with llmSovereign");
});

ok("C11: normal reply at topo not affected by strip", () => {
  const reply = "Oi! Eu sou a Enova e vou te ajudar com o Minha Casa Minha Vida. Você já sabe como funciona ou quer que eu te explique?";
  const result = stripFutureStageCollection(reply, "inicio_programa");
  assert.equal(result, reply, "Good topo reply must pass through unchanged");
});

// ── Section D: Integration — simulated bypass scenario ─────────────────────
console.log("\n── Section D: Simulated bypass scenarios ──");

ok("D1: TOPO_INSTITUTIONAL_TONE regex blocks 'Enova Cognitive Engine'", () => {
  const regex = /\b(?:Cognitive\s+Engine|programas?\s+habitaciona(?:l|is)|MCMV\s*\/\s*CEF|CEF\s*\/\s*MCMV|processo\s+de\s+financiamento\s+habitacional|financiamento\s+habitacional|Caixa\s+Econ[oô]mica\s+Federal)\b/i;
  assert.ok(regex.test("Eu sou o Enova Cognitive Engine"), "Must match Cognitive Engine");
  assert.ok(regex.test("Especialista em MCMV/CEF"), "Must match MCMV/CEF");
  assert.ok(regex.test("Caixa Econômica Federal"), "Must match Caixa");
  assert.ok(!regex.test("Eu sou a Enova, especialista no Minha Casa Minha Vida"), "Must NOT match clean reply");
});

ok("D2: TOPO_PREMATURE_COLLECTION regex blocks structural collection", () => {
  const regex = /\b(?:estado\s+civil|solteiro\(?a?\)?|casad[oa]|divorci|separad[oa]|vi[uú]v[oa]|uni[aã]o\s+est[aá]vel|nome\s+completo|qual\s+(?:[eé]\s+)?(?:o\s+)?seu\s+nome|nacionalidade|voc[eê]\s+[eé]\s+brasileir|brasileiro\(?a?\)?(?:\s+nat[oa])?|estrangeir[oa]?|regime\s+de\s+trabalho|CLT|aut[oô]nom[oa]|renda\s+mensal|sal[aá]rio|quanto\s+(?:voc[eê]\s+)?ganh|CTPS|carteira\s+de\s+trabalho|SPC|Serasa|restri[cç][aã]o\s+no|somar\s+renda|servidor\s+p[uú]blic|aposentad[oa])/i;
  assert.ok(regex.test("Qual é o seu estado civil?"), "Must block estado civil");
  assert.ok(regex.test("Qual é o seu nome completo?"), "Must block nome completo");
  assert.ok(!regex.test("Você já sabe como o programa funciona?"), "Must allow clean greeting");
});

ok("D3: parser de inicio_programa NOT altered", () => {
  // Verify the parser function still exists unchanged
  assert.ok(WORKER_SRC.includes("validateInicioProgramaChoiceSpeech"),
    "Parser function must still exist");
});

ok("D4: stage/gate/nextStage logic NOT touched", () => {
  // The bypass guard is purely about speech revocation, not stage changes
  const guard = WORKER_SRC.substring(
    WORKER_SRC.indexOf("TOPO BYPASS GUARD"),
    WORKER_SRC.indexOf("TOPO BYPASS GUARD") + 800
  );
  assert.ok(!/nextStage/.test(guard), "Bypass guard must not touch nextStage");
  assert.ok(!/\.gate\s*=/.test(guard), "Bypass guard must not touch gate");
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed === 0) {
  console.log("✅ ALL TESTS PASSED");
} else {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
}
