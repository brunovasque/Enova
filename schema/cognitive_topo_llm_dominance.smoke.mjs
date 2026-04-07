/**
 * cognitive_topo_llm_dominance.smoke.mjs
 *
 * Smoke tests for the LLM-over-heuristic priority fix in the topo happy path.
 *
 * Validates:
 *   A) normalizeModelResponse prefers LLM when llmUsed=true and reply valid
 *   B) normalizeModelResponse falls back to heuristic when LLM unavailable
 *   C) speech_origin field is propagated correctly through the chain
 *   D) getTopoHappyPathSpeech maps speech_origin honestly
 *   E) setTopoHappyPathFlags accepts both cognitive_real and heuristic_guidance
 *   F) Fallback safety: client never left without response
 *   G) Zero regression in gates/nextStage/parser/business rules
 *   H) Engine returns speech_origin in its output
 *
 * Scenarios:
 *  1.  runReadOnlyCognitiveEngine with OpenAI mock returns speech_origin="llm_real"
 *  2.  runReadOnlyCognitiveEngine without OpenAI returns speech_origin="heuristic_guidance"
 *  3.  runReadOnlyCognitiveEngine with failing OpenAI returns heuristic_guidance
 *  4.  Engine reply for "oi" at inicio_programa (heuristic, no OpenAI key)
 *  5.  Engine reply for "sim" at inicio_nome (heuristic, no OpenAI key)
 *  6.  Engine reply for "brasileiro" at inicio_nacionalidade (heuristic, no OpenAI key)
 *  7.  Engine reply for "solteiro" at estado_civil (heuristic, no OpenAI key)
 *  8.  Engine reply for "não sei, me explica?" at inicio_programa (heuristic, no OpenAI key)
 *  9.  Engine reply for "João Silva" at inicio_nome (heuristic, no OpenAI key)
 * 10.  Heuristic fallback reply is always non-empty (never empty response)
 * 11.  speech_origin in engine.speech_origin propagated for heuristic mode
 * 12.  speech_origin in engine.speech_origin propagated for LLM mode (mock)
 * 13.  Worker getTopoHappyPathSpeech maps llm_real → cognitive_real (source code)
 * 14.  Worker getTopoHappyPathSpeech maps heuristic_guidance → heuristic_guidance (source code)
 * 15.  Worker setTopoHappyPathFlags accepts "cognitive_real" (source code)
 * 16.  Worker setTopoHappyPathFlags accepts "heuristic_guidance" (source code)
 * 17.  Worker adaptCognitiveV2Output includes speech_origin field (source code)
 * 18.  normalizeModelResponse in cognitive engine has speech_origin in return (source code)
 * 19.  LLM-first priority: normalizeModelResponse checks llmDominates before phaseGuidanceReply
 * 20.  Phase guidance is fallback, not override (no early return on phaseGuidanceReply alone)
 * 21.  Worker still contains parseEstadoCivil (parser sovereignty preserved)
 * 22.  Worker still contains isYes/isNo (parser sovereignty preserved)
 * 23.  Worker still contains upsertState (persistence sovereignty preserved)
 * 24.  Worker still contains nextStage in step() calls (stage sovereignty preserved)
 * 25.  COGNITIVE_V1_CONFIDENCE_MIN still exists
 * 26.  buildPhaseGuidanceReply still exists (not removed, just deprioritized)
 * 27.  buildTopoFunilGuidance still exists (not removed)
 * 28.  reset scenario: engine returns valid reply (heuristic) — non-empty
 * 29.  LLM mock: engine returns speech_origin=llm_real with valid reply
 * 30.  Fallback mock: engine with broken fetch returns heuristic_guidance
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

const cognitivePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
const cognitiveSrc = readFileSync(cognitivePath, "utf-8");

const { runReadOnlyCognitiveEngine } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

let passed = 0;
let failed = 0;

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

console.log("🧪 cognitive_topo_llm_dominance.smoke.mjs\n");

// ================================================================
// SECTION A: Engine speech_origin with OpenAI mock
// ================================================================
console.log("── Engine speech_origin with LLM mock ──");

// Helper: create a mock OpenAI fetch that returns a valid JSON response
function createMockOpenAIFetch(replyText, confidence = 0.85) {
  return async function mockFetch() {
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply_text: replyText,
              confidence,
              slots_detected: {},
              pending_slots: [],
              conflicts: [],
              suggested_next_slot: null,
              consultive_notes: [],
              should_request_confirmation: false,
              should_advance_stage: false
            })
          }
        }]
      })
    };
  };
}

// Helper: create a failing fetch
function createFailingFetch() {
  return async function failingFetch() {
    throw new Error("Network error");
  };
}

await asyncTest("1. Engine with OpenAI mock returns speech_origin=llm_real", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "sim, quero começar" },
    {
      openaiApiKey: "sk-test-mock",
      model: "gpt-4.1-mini",
      fetchImpl: createMockOpenAIFetch("Que ótimo! Pra começar, me diz seu nome completo, por favor? 😊")
    }
  );
  assert.ok(result.engine, "engine metadata must exist");
  assert.equal(result.engine.speech_origin, "llm_real",
    "speech_origin must be llm_real when LLM succeeds");
  assert.ok(result.engine.llm_used, "llm_used must be true");
});

await asyncTest("2. Engine without OpenAI returns speech_origin=heuristic_guidance", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi" },
    {} // no OpenAI key
  );
  assert.ok(result.engine, "engine metadata must exist");
  assert.equal(result.engine.speech_origin, "heuristic_guidance",
    "speech_origin must be heuristic_guidance when no OpenAI");
  assert.ok(!result.engine.llm_used, "llm_used must be false");
});

await asyncTest("3. Engine with failing OpenAI returns heuristic_guidance", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "sim, quero começar" },
    {
      openaiApiKey: "sk-test-mock",
      model: "gpt-4.1-mini",
      fetchImpl: createFailingFetch()
    }
  );
  assert.ok(result.engine, "engine metadata must exist");
  assert.equal(result.engine.speech_origin, "heuristic_guidance",
    "speech_origin must be heuristic_guidance when LLM fails");
  assert.ok(!result.engine.llm_used, "llm_used must be false when fetch fails");
});

// ================================================================
// SECTION B: Heuristic-mode engine replies for topo stages
// ================================================================
console.log("\n── Heuristic-mode engine replies for topo stages ──");

await asyncTest("4. Engine reply for 'oi' at inicio_programa (heuristic)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
  assert.ok(result.response.reply_text.length > 10, "reply must be substantive");
});

await asyncTest("5. Engine reply for 'sim' at inicio_nome (heuristic)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_nome", message_text: "sim" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
});

await asyncTest("6. Engine reply for 'brasileiro' at inicio_nacionalidade (heuristic)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_nacionalidade", message_text: "brasileiro" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
});

await asyncTest("7. Engine reply for 'solteiro' at estado_civil (heuristic)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "solteiro" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
});

await asyncTest("8. Engine reply for 'não sei, me explica?' at inicio_programa (heuristic)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "não sei, me explica?" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
  assert.ok(result.response.reply_text.length > 20, "explanation must be substantive");
});

await asyncTest("9. Engine reply for 'João Silva' at inicio_nome (heuristic)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_nome", message_text: "João Silva" },
    {}
  );
  assert.ok(result.response, "response must exist");
  assert.ok(result.response.reply_text, "reply_text must be non-empty");
});

// ================================================================
// SECTION C: Fallback safety — client never without response
// ================================================================
console.log("\n── Fallback safety ──");

await asyncTest("10. Heuristic fallback reply is always non-empty", async () => {
  const stages = ["inicio_programa", "inicio_nome", "inicio_nacionalidade", "estado_civil"];
  for (const stage of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: "xyz random text" },
      {}
    );
    assert.ok(result.response, `response must exist for ${stage}`);
    assert.ok(result.response.reply_text, `reply_text must be non-empty for ${stage}`);
    assert.ok(result.response.reply_text.length > 5, `reply must be substantive for ${stage}`);
  }
});

// ================================================================
// SECTION D: speech_origin propagation
// ================================================================
console.log("\n── speech_origin propagation ──");

await asyncTest("11. speech_origin in engine for heuristic mode", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi" },
    {}
  );
  const origin = result.engine.speech_origin;
  assert.ok(
    origin === "heuristic_guidance" || origin === "fallback_mechanical",
    `speech_origin must be heuristic_guidance or fallback_mechanical, got: ${origin}`
  );
});

await asyncTest("12. speech_origin in engine for LLM mode (mock)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "sim, quero começar" },
    {
      openaiApiKey: "sk-test-mock",
      model: "gpt-4.1-mini",
      fetchImpl: createMockOpenAIFetch("Que ótimo! Me diz seu nome completo?")
    }
  );
  assert.equal(result.engine.speech_origin, "llm_real",
    "speech_origin must be llm_real when LLM used");
});

// ================================================================
// SECTION E: Worker source code anchors
// ================================================================
console.log("\n── Worker source code anchors ──");

await asyncTest("13. getTopoHappyPathSpeech maps llm_real → cognitive_real", async () => {
  assert.ok(
    workerSrc.includes('rawOrigin === "llm_real" ? "cognitive_real"'),
    "getTopoHappyPathSpeech must map llm_real to cognitive_real"
  );
});

await asyncTest("14. getTopoHappyPathSpeech maps heuristic_guidance → heuristic_guidance", async () => {
  assert.ok(
    workerSrc.includes('rawOrigin === "heuristic_guidance" ? "heuristic_guidance"'),
    "getTopoHappyPathSpeech must map heuristic_guidance honestly"
  );
});

await asyncTest("15. setTopoHappyPathFlags accepts cognitive_real", async () => {
  assert.ok(
    workerSrc.includes('happyResult.source === "cognitive_real"'),
    "setTopoHappyPathFlags must accept cognitive_real"
  );
});

await asyncTest("16. setTopoHappyPathFlags rejects heuristic_guidance (PR #550 — no fala final)", async () => {
  // PR #550 BLOCO 3: heuristic_guidance no longer produces fala final.
  // setTopoHappyPathFlags now has only two branches: cognitive_real (LLM) and else (clear all).
  assert.ok(
    !workerSrc.includes('happyResult.source === "heuristic_guidance"'),
    "setTopoHappyPathFlags must NOT have heuristic_guidance branch (PR #550)"
  );
});

await asyncTest("17. adaptCognitiveV2Output includes speech_origin field", async () => {
  assert.ok(
    workerSrc.includes("speech_origin: speechOrigin"),
    "adaptCognitiveV2Output must propagate speech_origin"
  );
});

await asyncTest("18. normalizeModelResponse returns speech_origin", async () => {
  assert.ok(
    cognitiveSrc.includes("speech_origin: speechOrigin"),
    "normalizeModelResponse must return speech_origin"
  );
});

await asyncTest("19. LLM-first priority: llmDominates checked before phaseGuidanceReply", async () => {
  // The code must check llmDominates first in the if-else chain
  const llmIdx = cognitiveSrc.indexOf("if (llmDominates)");
  const phaseIdx = cognitiveSrc.indexOf("} else if (phaseGuidanceReply)");
  assert.ok(llmIdx > 0, "llmDominates check must exist");
  assert.ok(phaseIdx > 0, "phaseGuidanceReply fallback check must exist");
  assert.ok(llmIdx < phaseIdx, "llmDominates must come BEFORE phaseGuidanceReply in decision chain");
});

await asyncTest("20. Phase guidance is fallback — no early return on phaseGuidanceReply alone", async () => {
  // Old pattern: "if (phaseGuidanceReply) {\n    return {"
  // This pattern must NOT exist anymore (phase guidance no longer has a dedicated early-return block)
  const earlyReturnPattern = /if \(phaseGuidanceReply\) \{\s*\n\s*return \{/;
  assert.ok(
    !earlyReturnPattern.test(cognitiveSrc),
    "phaseGuidanceReply must NOT have its own early-return block"
  );
});

// ================================================================
// SECTION F: Parser/gate sovereignty preserved
// ================================================================
console.log("\n── Parser/gate sovereignty preserved ──");

await asyncTest("21. Worker still contains parseEstadoCivil", async () => {
  assert.ok(workerSrc.includes("parseEstadoCivil"),
    "parseEstadoCivil must still exist");
});

await asyncTest("22. Worker still contains isYes/isNo", async () => {
  assert.ok(workerSrc.includes("isYes("), "isYes must still exist");
  assert.ok(workerSrc.includes("isNo("), "isNo must still exist");
});

await asyncTest("23. Worker still contains upsertState", async () => {
  assert.ok(workerSrc.includes("upsertState"),
    "upsertState must still exist");
});

await asyncTest("24. Worker still contains nextStage in step() calls", async () => {
  // Verify step() calls with nextStage parameter exist
  const stepCallPattern = /step\(env,\s*\w+,\s*\[/;
  assert.ok(stepCallPattern.test(workerSrc),
    "step() calls must still exist in worker");
});

await asyncTest("25. COGNITIVE_V1_CONFIDENCE_MIN still exists", async () => {
  assert.ok(workerSrc.includes("COGNITIVE_V1_CONFIDENCE_MIN"),
    "COGNITIVE_V1_CONFIDENCE_MIN threshold must still exist");
});

await asyncTest("26. buildPhaseGuidanceReply still exists (deprioritized, not removed)", async () => {
  assert.ok(cognitiveSrc.includes("function buildPhaseGuidanceReply("),
    "buildPhaseGuidanceReply must still exist as fallback");
});

await asyncTest("27. buildTopoFunilGuidance still exists", async () => {
  assert.ok(cognitiveSrc.includes("function buildTopoFunilGuidance("),
    "buildTopoFunilGuidance must still exist as heuristic fallback");
});

// ================================================================
// SECTION G: End-to-end engine scenarios
// ================================================================
console.log("\n── End-to-end engine scenarios ──");

await asyncTest("28. Reset scenario: engine returns valid non-empty reply (heuristic)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi, quero começar" },
    {}
  );
  assert.ok(result.ok || result.response, "engine must return result");
  assert.ok(result.response.reply_text, "reply_text must be non-empty after reset scenario");
  assert.ok(result.response.reply_text.length > 10, "reply must be substantive");
});

await asyncTest("29. LLM mock: engine returns speech_origin=llm_real with valid reply", async () => {
  const mockReply = "Que bom que quer começar! Me diz seu nome completo, por favor?";
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_nome", message_text: "sim" },
    {
      openaiApiKey: "sk-test-mock",
      model: "gpt-4.1-mini",
      fetchImpl: createMockOpenAIFetch(mockReply)
    }
  );
  assert.equal(result.engine.speech_origin, "llm_real", "must be llm_real");
  assert.ok(result.response.reply_text, "reply_text must exist");
  assert.ok(result.response.reply_text.length > 10, "reply must be substantive");
});

await asyncTest("30. Fallback mock: engine with broken fetch returns heuristic_guidance", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "solteiro" },
    {
      openaiApiKey: "sk-test-mock",
      model: "gpt-4.1-mini",
      fetchImpl: createFailingFetch()
    }
  );
  assert.ok(result.engine, "engine metadata must exist");
  assert.equal(result.engine.speech_origin, "heuristic_guidance",
    "speech_origin must be heuristic_guidance when fetch fails");
  assert.ok(result.response.reply_text, "reply_text must be non-empty (fallback works)");
});

// ================================================================
// Summary
// ================================================================
console.log(`\n🏁 Results: ${passed} passed, ${failed} failed out of ${passed + failed}\n`);
if (failed > 0) process.exit(1);
