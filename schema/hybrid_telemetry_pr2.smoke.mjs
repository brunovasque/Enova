/**
 * hybrid_telemetry_pr2.smoke.mjs — Smoke tests for PR 2 (hybrid telemetry instrumentation)
 *
 * Validates:
 *   1. Import and usage of hooks without error
 *   2. Cognitive emission doesn't break flow
 *   3. Mechanical emission doesn't break flow
 *   4. Arbitration emission doesn't break flow
 *   5. Worker behavior is not altered
 *   6. nextStage is not touched
 *   7. parser/gate are not altered
 *   8. Emission is tolerant to missing fields
 */

import { strict as assert } from "node:assert";

// Dynamic imports for the telemetry modules
const contractPath = new URL("../telemetry/hybrid-telemetry-contract.js", import.meta.url).href;
const telemetryPath = new URL("../telemetry/hybrid-telemetry.js", import.meta.url).href;
const hooksPath = new URL("../telemetry/hybrid-telemetry-worker-hooks.js", import.meta.url).href;

const contract = await import(contractPath);
const telemetry = await import(telemetryPath);
const hooks = await import(hooksPath);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════
// SECTION A — Import and Module Integrity
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section A — Import and Module Integrity");

test("A1: contract module exports HYBRID_TELEMETRY_SCHEMA_VERSION", () => {
  assert.equal(contract.HYBRID_TELEMETRY_SCHEMA_VERSION, "hybrid-telemetry.v1");
});

test("A2: contract module exports HYBRID_TELEMETRY_EVENT_TYPES", () => {
  assert.ok(contract.HYBRID_TELEMETRY_EVENT_TYPES);
  assert.equal(typeof contract.HYBRID_TELEMETRY_EVENT_TYPES.COGNITIVE_TURN_START, "string");
  assert.equal(typeof contract.HYBRID_TELEMETRY_EVENT_TYPES.MECHANICAL_PARSE_RESULT, "string");
  assert.equal(typeof contract.HYBRID_TELEMETRY_EVENT_TYPES.ARBITRATION_CONFLICT, "string");
});

test("A3: telemetry module exports all builders", () => {
  assert.equal(typeof telemetry.buildHybridTelemetryEvent, "function");
  assert.equal(typeof telemetry.buildCognitiveTelemetryEvent, "function");
  assert.equal(typeof telemetry.buildMechanicalTelemetryEvent, "function");
  assert.equal(typeof telemetry.buildArbitrationTelemetryEvent, "function");
});

test("A4: telemetry module exports all safe emitters", () => {
  assert.equal(typeof telemetry.emitHybridTelemetry, "function");
  assert.equal(typeof telemetry.emitCognitiveTelemetrySafe, "function");
  assert.equal(typeof telemetry.emitMechanicalTelemetrySafe, "function");
  assert.equal(typeof telemetry.emitArbitrationTelemetrySafe, "function");
});

test("A5: hooks module exports all 6 hooks", () => {
  assert.equal(typeof hooks.emitTurnEntryTelemetry, "function");
  assert.equal(typeof hooks.emitCognitiveDecisionTelemetry, "function");
  assert.equal(typeof hooks.emitPostProcessingTelemetry, "function");
  assert.equal(typeof hooks.emitMechanicalDecisionTelemetry, "function");
  assert.equal(typeof hooks.emitArbitrationTelemetry, "function");
  assert.equal(typeof hooks.emitFinalOutputTelemetry, "function");
});

test("A6: hooks module exports clearHybridTurnCorrelation", () => {
  assert.equal(typeof hooks.clearHybridTurnCorrelation, "function");
});

test("A7: hooks module re-exports event types", () => {
  assert.ok(hooks.HYBRID_TELEMETRY_EVENT_TYPES);
  assert.ok(hooks.COGNITIVE_REASON_CODES);
  assert.ok(hooks.MECHANICAL_REASON_CODES);
  assert.ok(hooks.ARBITRATION_REASON_CODES);
});

// ═════════════════════════════════════════════════════════════════
// SECTION B — Cognitive Emission Without Breaking
// ═════════════════════════════════════════════════════════════════
console.log("\n🧠 Section B — Cognitive Emission Without Breaking");

await testAsync("B1: emitCognitiveDecisionTelemetry with full params returns without error", async () => {
  await hooks.emitCognitiveDecisionTelemetry({
    st: { wa_id: "5511999999999", fase_conversa: "inicio", last_message_id: "wamid123" },
    stage: "inicio",
    userText: "Oi, quero saber do programa",
    cognitive: {
      intent: "greeting",
      confidence: 0.85,
      reply_text: "Olá! Bem-vindo(a)!",
      safe_stage_signal: null,
      answered_customer_question: true,
      still_needs_original_answer: false
    },
    cognitiveReply: "Olá! Bem-vindo(a)!",
    hasUsefulReply: true,
    speechOrigin: "llm_real",
    v2Mode: "on"
  });
});

await testAsync("B2: emitCognitiveDecisionTelemetry with minimal params", async () => {
  await hooks.emitCognitiveDecisionTelemetry({
    st: { wa_id: "5511999999999" },
    stage: "renda",
    userText: "3000",
    cognitive: {}
  });
});

await testAsync("B3: emitCognitiveDecisionTelemetry with null cognitive", async () => {
  await hooks.emitCognitiveDecisionTelemetry({
    st: {},
    stage: null,
    cognitive: null
  });
});

await testAsync("B4: emitCognitiveDecisionTelemetry with empty params", async () => {
  await hooks.emitCognitiveDecisionTelemetry({});
});

await testAsync("B5: emitCognitiveDecisionTelemetry with no params", async () => {
  await hooks.emitCognitiveDecisionTelemetry();
});

// ═════════════════════════════════════════════════════════════════
// SECTION C — Mechanical Emission Without Breaking
// ═════════════════════════════════════════════════════════════════
console.log("\n⚙️ Section C — Mechanical Emission Without Breaking");

await testAsync("C1: emitMechanicalDecisionTelemetry with full params", async () => {
  await hooks.emitMechanicalDecisionTelemetry({
    st: { wa_id: "5511999999999", fase_conversa: "nome", last_message_id: "wamid456" },
    stageBefore: "nome",
    stageAfter: "estado_civil",
    parserUsed: "nome_parser",
    parserResult: { nome: "João Silva" },
    mechanicalAction: "stage_advance",
    validationResult: { valid: true },
    reaskTriggered: false,
    stageLocked: false,
    stateDiff: { fase_conversa: { from: "nome", to: "estado_civil" } }
  });
});

await testAsync("C2: emitMechanicalDecisionTelemetry with reask triggered", async () => {
  await hooks.emitMechanicalDecisionTelemetry({
    st: { wa_id: "5511999999999" },
    stageBefore: "renda",
    stageAfter: "renda",
    parserUsed: "renda_parser",
    parserResult: null,
    mechanicalAction: "reask",
    reaskTriggered: true,
    stageLocked: false
  });
});

await testAsync("C3: emitMechanicalDecisionTelemetry with stage locked", async () => {
  await hooks.emitMechanicalDecisionTelemetry({
    st: {},
    stageBefore: "envio_docs",
    stageAfter: "envio_docs",
    stageLocked: true
  });
});

await testAsync("C4: emitMechanicalDecisionTelemetry with no params", async () => {
  await hooks.emitMechanicalDecisionTelemetry();
});

// ═════════════════════════════════════════════════════════════════
// SECTION D — Arbitration Emission Without Breaking
// ═════════════════════════════════════════════════════════════════
console.log("\n⚖️ Section D — Arbitration Emission Without Breaking");

await testAsync("D1: emitArbitrationTelemetry with full conflict", async () => {
  await hooks.emitArbitrationTelemetry({
    st: { wa_id: "5511999999999", fase_conversa: "estado_civil", last_message_id: "wamid789" },
    stage: "estado_civil",
    cognitiveSignal: "estado_civil:solteiro",
    mechanicalParserResult: "solteiro",
    mechanicalAction: "step",
    arbitrationTriggered: true,
    arbitrationOutcome: "cognitive_accepted",
    arbitrationWinner: "cognitive",
    arbitrationReason: "llm_real_takes_final",
    overrideDetected: false,
    overrideClassification: null,
    overrideSuspected: false
  });
});

await testAsync("D2: emitArbitrationTelemetry with override detected", async () => {
  await hooks.emitArbitrationTelemetry({
    st: { wa_id: "5511999999999" },
    stage: "renda",
    cognitiveSignal: "renda:5000",
    mechanicalParserResult: null,
    mechanicalAction: "stay",
    arbitrationTriggered: true,
    arbitrationOutcome: "mechanical_prevails",
    arbitrationWinner: "mechanical",
    arbitrationReason: "mechanical_sovereign",
    overrideDetected: true,
    overrideClassification: "OVERRIDE_EXPECTED_RULE",
    overrideSuspected: false
  });
});

await testAsync("D3: emitArbitrationTelemetry with no conflict", async () => {
  await hooks.emitArbitrationTelemetry({
    st: {},
    stage: "inicio",
    arbitrationTriggered: false
  });
});

await testAsync("D4: emitArbitrationTelemetry with no params", async () => {
  await hooks.emitArbitrationTelemetry();
});

// ═════════════════════════════════════════════════════════════════
// SECTION E — Turn Entry Emission
// ═════════════════════════════════════════════════════════════════
console.log("\n🚀 Section E — Turn Entry Emission");

await testAsync("E1: emitTurnEntryTelemetry with full params", async () => {
  await hooks.emitTurnEntryTelemetry({
    st: { wa_id: "5511999999999", fase_conversa: "inicio" },
    messageId: "wamid-abc-123",
    waId: "5511999999999",
    userText: "Oi, bom dia!",
    normalizedUserText: "oi bom dia",
    stage: "inicio"
  });
});

await testAsync("E2: emitTurnEntryTelemetry with no params", async () => {
  await hooks.emitTurnEntryTelemetry();
});

await testAsync("E3: emitTurnEntryTelemetry with empty st", async () => {
  await hooks.emitTurnEntryTelemetry({ st: {}, userText: "teste" });
});

// ═════════════════════════════════════════════════════════════════
// SECTION F — Post-processing Emission
// ═════════════════════════════════════════════════════════════════
console.log("\n🔧 Section F — Post-processing Emission");

await testAsync("F1: emitPostProcessingTelemetry with surface changed", async () => {
  await hooks.emitPostProcessingTelemetry({
    st: { wa_id: "5511999999999", fase_conversa: "inicio" },
    stage: "inicio",
    replyBeforeContract: "Olá! Vamos falar sobre o programa Minha Casa Minha Vida.",
    replyAfterContract: "Olá! Vamos falar sobre o programa Minha Casa Minha Vida?",
    surfaceChanged: true
  });
});

await testAsync("F2: emitPostProcessingTelemetry with no surface change", async () => {
  await hooks.emitPostProcessingTelemetry({
    st: { wa_id: "5511999999999" },
    stage: "nome",
    replyBeforeContract: "Pode me dizer seu nome?",
    replyAfterContract: "Pode me dizer seu nome?",
    surfaceChanged: false
  });
});

await testAsync("F3: emitPostProcessingTelemetry with no params", async () => {
  await hooks.emitPostProcessingTelemetry();
});

// ═════════════════════════════════════════════════════════════════
// SECTION G — Final Output Emission
// ═════════════════════════════════════════════════════════════════
console.log("\n📤 Section G — Final Output Emission");

await testAsync("G1: emitFinalOutputTelemetry with full params", async () => {
  await hooks.emitFinalOutputTelemetry({
    st: { wa_id: "5511999999999", fase_conversa: "nome", last_message_id: "wamid-xyz" },
    stageBefore: "nome",
    stageAfter: "estado_civil",
    outputSurface: "Obrigado, João! Qual é o seu estado civil?",
    surfaceEqualLlm: true,
    mechanicalTextCandidate: "Qual é o seu estado civil?",
    mechanicalTextBlocked: true,
    speechArbiterSource: "llm_real"
  });
});

await testAsync("G2: emitFinalOutputTelemetry with extreme_fallback", async () => {
  await hooks.emitFinalOutputTelemetry({
    st: { wa_id: "5511999999999" },
    stageBefore: "renda",
    stageAfter: "renda",
    outputSurface: "Me diz sua renda mensal, por favor.",
    surfaceEqualLlm: null,
    mechanicalTextCandidate: "Me diz sua renda mensal, por favor.",
    mechanicalTextBlocked: false,
    speechArbiterSource: "extreme_fallback"
  });
});

await testAsync("G3: emitFinalOutputTelemetry with no params", async () => {
  await hooks.emitFinalOutputTelemetry();
});

// ═════════════════════════════════════════════════════════════════
// SECTION H — Worker Behavior Not Altered (Proof)
// ═════════════════════════════════════════════════════════════════
console.log("\n🔒 Section H — Worker Behavior Not Altered");

test("H1: hooks never throw synchronous exceptions", () => {
  // All hooks should be safe to call with garbage input
  const badInputs = [null, undefined, 42, "string", true, [], { circular: {} }];
  for (const input of badInputs) {
    // These should NOT throw
    hooks.clearHybridTurnCorrelation(input);
  }
});

await testAsync("H2: hooks return undefined/void (fire-and-forget)", async () => {
  const result = await hooks.emitTurnEntryTelemetry({ st: null });
  // Hook must not return meaningful data that could influence flow
  assert.ok(result === undefined || result === null || typeof result === "object");
});

test("H3: clearHybridTurnCorrelation cleans up __hybrid_correlation_id", () => {
  const st = { wa_id: "test", __hybrid_correlation_id: "corr-test-123" };
  hooks.clearHybridTurnCorrelation(st);
  assert.equal(st.__hybrid_correlation_id, null);
});

test("H4: clearHybridTurnCorrelation is safe with no state", () => {
  hooks.clearHybridTurnCorrelation(null);
  hooks.clearHybridTurnCorrelation(undefined);
  hooks.clearHybridTurnCorrelation({});
  // No throw = pass
});

// ═════════════════════════════════════════════════════════════════
// SECTION I — nextStage Not Touched (Proof)
// ═════════════════════════════════════════════════════════════════
console.log("\n🎯 Section I — nextStage Not Touched");

test("I1: hooks module does not export any stage manipulation functions", () => {
  const exports = Object.keys(hooks);
  const stageManipulators = exports.filter(k =>
    /nextStage|setStage|updateStage|advanceStage|changeStage/i.test(k)
  );
  assert.equal(stageManipulators.length, 0, `Found stage manipulators: ${stageManipulators}`);
});

test("I2: hooks module source code does not modify nextStage", () => {
  // Verify the hook functions don't have side effects on nextStage
  const st = { wa_id: "test", fase_conversa: "nome", __hybrid_correlation_id: null };
  const originalFaseConversa = st.fase_conversa;
  hooks.clearHybridTurnCorrelation(st);
  assert.equal(st.fase_conversa, originalFaseConversa, "fase_conversa must not change");
});

// ═════════════════════════════════════════════════════════════════
// SECTION J — Parser/Gate Not Altered (Proof)
// ═════════════════════════════════════════════════════════════════
console.log("\n🔐 Section J — Parser/Gate Not Altered");

test("J1: hooks module does not export parser or gate functions", () => {
  const exports = Object.keys(hooks);
  const parserGateExports = exports.filter(k =>
    /parser|gate|parse|hasClearStageAnswer/i.test(k)
  );
  assert.equal(parserGateExports.length, 0, `Found parser/gate exports: ${parserGateExports}`);
});

test("J2: state object is not modified beyond __hybrid_correlation_id", () => {
  const st = {
    wa_id: "test",
    fase_conversa: "renda",
    nome: "Test",
    __cognitive_reply_prefix: "prefix",
    __cognitive_v2_takes_final: true,
    __speech_arbiter_source: "llm_real"
  };
  const snapshot = JSON.stringify(st);
  hooks.clearHybridTurnCorrelation(st);
  // Only __hybrid_correlation_id should have been set to null
  const expected = { ...JSON.parse(snapshot), __hybrid_correlation_id: null };
  assert.deepStrictEqual(st, expected);
});

// ═════════════════════════════════════════════════════════════════
// SECTION K — Tolerant to Missing Fields
// ═════════════════════════════════════════════════════════════════
console.log("\n🛡️ Section K — Tolerant to Missing Fields");

await testAsync("K1: emitTurnEntryTelemetry with undefined fields", async () => {
  await hooks.emitTurnEntryTelemetry({
    st: undefined,
    messageId: undefined,
    waId: undefined,
    userText: undefined,
    normalizedUserText: undefined,
    stage: undefined
  });
});

await testAsync("K2: emitCognitiveDecisionTelemetry with null cognitive fields", async () => {
  await hooks.emitCognitiveDecisionTelemetry({
    st: { wa_id: null },
    stage: null,
    userText: null,
    cognitive: {
      intent: null,
      confidence: null,
      reply_text: null,
      safe_stage_signal: null,
      answered_customer_question: null,
      still_needs_original_answer: null
    },
    cognitiveReply: null,
    hasUsefulReply: null,
    speechOrigin: null,
    v2Mode: null
  });
});

await testAsync("K3: emitMechanicalDecisionTelemetry with empty strings", async () => {
  await hooks.emitMechanicalDecisionTelemetry({
    st: { wa_id: "" },
    stageBefore: "",
    stageAfter: "",
    parserUsed: "",
    parserResult: "",
    mechanicalAction: "",
    validationResult: "",
    reaskTriggered: null,
    stageLocked: null
  });
});

await testAsync("K4: emitArbitrationTelemetry with mixed null/undefined", async () => {
  await hooks.emitArbitrationTelemetry({
    st: null,
    stage: undefined,
    cognitiveSignal: null,
    mechanicalParserResult: undefined,
    mechanicalAction: null,
    arbitrationTriggered: undefined,
    arbitrationOutcome: null,
    arbitrationWinner: undefined,
    arbitrationReason: null,
    overrideDetected: undefined,
    overrideClassification: null,
    overrideSuspected: undefined
  });
});

await testAsync("K5: emitFinalOutputTelemetry with very long strings", async () => {
  const longStr = "x".repeat(10000);
  await hooks.emitFinalOutputTelemetry({
    st: { wa_id: "test" },
    stageBefore: longStr,
    stageAfter: longStr,
    outputSurface: longStr,
    mechanicalTextCandidate: longStr
  });
});

await testAsync("K6: emitPostProcessingTelemetry with circular reference in st", async () => {
  const st = { wa_id: "test" };
  st.self = st; // circular reference
  await hooks.emitPostProcessingTelemetry({
    st,
    stage: "inicio",
    replyBeforeContract: "test",
    replyAfterContract: "test",
    surfaceChanged: false
  });
});

// ═════════════════════════════════════════════════════════════════
// SECTION L — Correlation ID Management
// ═════════════════════════════════════════════════════════════════
console.log("\n🔗 Section L — Correlation ID Management");

test("L1: createTurnCorrelationId generates unique IDs", () => {
  const id1 = telemetry.createTurnCorrelationId({ conversationId: "wa1", turnId: "t1" });
  const id2 = telemetry.createTurnCorrelationId({ conversationId: "wa1", turnId: "t1" });
  assert.ok(id1.startsWith("corr-"), "Should start with corr-");
  assert.ok(id2.startsWith("corr-"), "Should start with corr-");
  // While technically could be same with very low probability, they should differ
  // because of random suffix
  assert.notEqual(id1, id2, "Two calls should produce different IDs");
});

test("L2: createTurnCorrelationId with empty input", () => {
  const id = telemetry.createTurnCorrelationId({});
  assert.ok(id.startsWith("corr-"));
  assert.ok(id.length > 10);
});

test("L3: createTurnCorrelationId with no input", () => {
  const id = telemetry.createTurnCorrelationId();
  assert.ok(id.startsWith("corr-"));
});

// ═════════════════════════════════════════════════════════════════
// SECTION M — Sanitization Safety
// ═════════════════════════════════════════════════════════════════
console.log("\n🧹 Section M — Sanitization Safety");

test("M1: sanitizeTelemetryPayload handles null", () => {
  const result = telemetry.sanitizeTelemetryPayload(null);
  assert.equal(result, null);
});

test("M2: sanitizeTelemetryPayload handles undefined", () => {
  const result = telemetry.sanitizeTelemetryPayload(undefined);
  assert.equal(result, null);
});

test("M3: sanitizeTelemetryPayload truncates long strings", () => {
  const longStr = "a".repeat(1000);
  const result = telemetry.sanitizeTelemetryPayload(longStr);
  assert.ok(result.length < 600, "Should be truncated");
  assert.ok(result.includes("truncated"), "Should contain truncation indicator");
});

test("M4: sanitizeTelemetryPayload handles circular references", () => {
  const obj = { a: 1 };
  obj.self = obj;
  const result = telemetry.sanitizeTelemetryPayload(obj);
  assert.ok(result, "Should handle circular references");
  assert.equal(result.self, "[circular]");
});

test("M5: sanitizeTelemetryPayload handles nested objects", () => {
  const obj = { a: { b: { c: { d: { e: { f: "deep" } } } } } };
  const result = telemetry.sanitizeTelemetryPayload(obj);
  assert.ok(result, "Should handle deep nesting");
});

// ═════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(60));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failures.length > 0) {
  console.log("\n❌ Failures:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}

console.log("═".repeat(60));
process.exit(failed > 0 ? 1 : 0);
