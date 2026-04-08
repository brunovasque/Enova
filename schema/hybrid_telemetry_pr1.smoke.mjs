import assert from "node:assert/strict";

const contractModule = await import(
  new URL("../telemetry/hybrid-telemetry-contract.js", import.meta.url).href
);
const telemetryModule = await import(
  new URL("../telemetry/hybrid-telemetry.js", import.meta.url).href
);

const {
  HYBRID_TELEMETRY_EVENT_TYPES,
  COGNITIVE_REASON_CODES,
  MECHANICAL_REASON_CODES,
  ARBITRATION_REASON_CODES,
  OVERRIDE_CLASSIFICATIONS,
  HYBRID_TELEMETRY_FIELD_GROUPS
} = contractModule;

const {
  buildHybridTelemetryEvent,
  buildCognitiveTelemetryEvent,
  buildMechanicalTelemetryEvent,
  buildArbitrationTelemetryEvent,
  createTurnCorrelationId,
  sanitizeTelemetryPayload,
  emitHybridTelemetry,
  emitCognitiveTelemetrySafe,
  emitMechanicalTelemetrySafe,
  emitArbitrationTelemetrySafe
} = telemetryModule;

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`    ${error.message}`);
  }
}

await test("exports taxonomy and canonical groups", async () => {
  assert.equal(HYBRID_TELEMETRY_EVENT_TYPES.COGNITIVE_TURN_START, "funnel.cognitive.turn.start");
  assert.ok(HYBRID_TELEMETRY_FIELD_GROUPS.cognitive.includes("ai_reply_text"));
  assert.ok(COGNITIVE_REASON_CODES.LOW_CONFIDENCE);
  assert.ok(MECHANICAL_REASON_CODES.STAGE_LOCK_ENFORCED);
  assert.ok(ARBITRATION_REASON_CODES.MECHANICAL_OVERRIDE_VALID);
  assert.ok(OVERRIDE_CLASSIFICATIONS.OVERRIDE_REQUIRED_CONFIRMATION);
});

await test("creates stable-enough correlation id", async () => {
  const correlationId = createTurnCorrelationId({
    conversation_id: "wa-123",
    turn_id: "turn-9",
    timestamp: "2026-04-08T12:00:00.000Z"
  });
  assert.match(correlationId, /^corr-/);
  assert.match(correlationId, /wa-123/);
});

await test("builds cognitive/mechanical/arbitration payloads with defaults", async () => {
  const cognitive = buildCognitiveTelemetryEvent({});
  const mechanical = buildMechanicalTelemetryEvent({});
  const arbitration = buildArbitrationTelemetryEvent({});
  assert.deepEqual(cognitive.cognitive_reason_codes, []);
  assert.deepEqual(mechanical.mechanical_reason_codes, []);
  assert.deepEqual(arbitration.arbitration_flags, []);
});

await test("builds hybrid event with sanitized payload", async () => {
  const event = buildHybridTelemetryEvent({
    eventName: HYBRID_TELEMETRY_EVENT_TYPES.ARBITRATION_OVERRIDE,
    base: {
      conversation_id: "wa-123",
      turn_id: "turn-1",
      stage_before: "inicio_programa",
      stage_after: "inicio_programa"
    },
    cognitive: {
      user_input_raw: "oi",
      ai_reply_text: "texto curto"
    },
    arbitration: {
      arbitration_triggered: true,
      override_detected: true
    }
  });
  assert.equal(event.event_name, HYBRID_TELEMETRY_EVENT_TYPES.ARBITRATION_OVERRIDE);
  assert.equal(event.cognitive.user_input_raw, "oi");
  assert.equal(event.arbitration.override_detected, true);
  assert.ok(event.correlation_id);
});

await test("sanitizes long strings and circular objects", async () => {
  const circular = {};
  circular.self = circular;
  const payload = sanitizeTelemetryPayload({
    long: "x".repeat(700),
    nested: circular
  });
  assert.match(payload.long, /\[truncated:/);
  assert.equal(payload.nested.self, "[circular]");
});

await test("safe emit does not throw when emitters fail", async () => {
  const result = await emitHybridTelemetry({
    event: buildHybridTelemetryEvent({
      eventName: HYBRID_TELEMETRY_EVENT_TYPES.COGNITIVE_TURN_RESULT,
      base: { conversation_id: "wa-1", turn_id: "1" }
    }),
    consoleEmitter: () => {
      throw new Error("console failed");
    },
    persistentEmitter: () => {
      throw new Error("persist failed");
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

await test("typed safe emitters return consistent envelopes", async () => {
  const results = await Promise.all([
    emitCognitiveTelemetrySafe({
      base: { conversation_id: "wa-1", turn_id: "1" },
      cognitive: { user_input_raw: "oi" },
      consoleEmitter: () => {}
    }),
    emitMechanicalTelemetrySafe({
      base: { conversation_id: "wa-1", turn_id: "2" },
      mechanical: { parser_used: "inicio_programa" },
      consoleEmitter: () => {}
    }),
    emitArbitrationTelemetrySafe({
      base: { conversation_id: "wa-1", turn_id: "3" },
      arbitration: { arbitration_triggered: true },
      consoleEmitter: () => {}
    })
  ]);
  for (const result of results) {
    assert.equal(result.ok, true);
    assert.ok(result.event.correlation_id);
  }
});

console.log(`\nHybrid telemetry PR1 smoke: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
