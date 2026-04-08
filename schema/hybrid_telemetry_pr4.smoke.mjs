/**
 * hybrid_telemetry_pr4.smoke.mjs — PR 4 (Fases 8 + 9)
 *
 * Smoke tests for structured persistence and admin endpoints.
 *
 * Sections:
 *   A — Persistence module integrity (imports, exports)
 *   B — buildPersistenceRecord correctness
 *   C — persistHybridTelemetryEvent fire-and-forget safety
 *   D — createPersistentEmitter integration
 *   E — queryHybridTelemetryEvents post-filtering
 *   F — queryArbitrationConflicts filtering
 *   G — queryStageSymptoms filtering
 *   H — registerPersistentEmitter / getRegisteredPersistentEmitter
 *   I — Proof: parser/gate/nextStage NOT altered
 *   J — Proof: worker behavior intact
 *   K — Proof: persistence failure does NOT crash attendance
 */

import { strict as assert } from "node:assert";

// ═══════════════════════════════════════════════════════════════════
// Section A — Persistence module integrity
// ═══════════════════════════════════════════════════════════════════

const persistMod = await import("../telemetry/hybrid-telemetry-persistence.js");

const A1 = (() => {
  assert.ok(typeof persistMod.buildPersistenceRecord === "function", "buildPersistenceRecord exported");
  return "PASS";
})();
console.log(`A1 buildPersistenceRecord exported: ${A1}`);

const A2 = (() => {
  assert.ok(typeof persistMod.persistHybridTelemetryEvent === "function", "persistHybridTelemetryEvent exported");
  return "PASS";
})();
console.log(`A2 persistHybridTelemetryEvent exported: ${A2}`);

const A3 = (() => {
  assert.ok(typeof persistMod.createPersistentEmitter === "function", "createPersistentEmitter exported");
  return "PASS";
})();
console.log(`A3 createPersistentEmitter exported: ${A3}`);

const A4 = (() => {
  assert.ok(typeof persistMod.queryHybridTelemetryEvents === "function", "queryHybridTelemetryEvents exported");
  return "PASS";
})();
console.log(`A4 queryHybridTelemetryEvents exported: ${A4}`);

const A5 = (() => {
  assert.ok(typeof persistMod.queryArbitrationConflicts === "function", "queryArbitrationConflicts exported");
  return "PASS";
})();
console.log(`A5 queryArbitrationConflicts exported: ${A5}`);

const A6 = (() => {
  assert.ok(typeof persistMod.queryStageSymptoms === "function", "queryStageSymptoms exported");
  return "PASS";
})();
console.log(`A6 queryStageSymptoms exported: ${A6}`);

const A7 = (() => {
  assert.strictEqual(persistMod.HYBRID_TELEMETRY_LOG_TAG, "HYBRID_TELEMETRY", "correct tag constant");
  return "PASS";
})();
console.log(`A7 HYBRID_TELEMETRY_LOG_TAG is correct: ${A7}`);

// ═══════════════════════════════════════════════════════════════════
// Section B — buildPersistenceRecord correctness
// ═══════════════════════════════════════════════════════════════════

const B1 = (() => {
  const event = {
    schema_version: "hybrid-telemetry.v1",
    event_name: "funnel.cognitive.turn.start",
    timestamp: "2026-04-08T12:00:00.000Z",
    lead_id: "5511999999999",
    conversation_id: "5511999999999",
    turn_id: "wamid.test123",
    correlation_id: "corr-test-123",
    stage_before: "inicio",
    stage_after: "inicio",
    cognitive: { ai_detected_intent: "greeting", ai_confidence: 0.9 },
    mechanical: { parser_used: null },
    arbitration: { arbitration_triggered: false }
  };
  const record = persistMod.buildPersistenceRecord(event);
  assert.ok(record, "record built");
  assert.strictEqual(record.tag, "HYBRID_TELEMETRY", "tag is HYBRID_TELEMETRY");
  assert.strictEqual(record.wa_id, "5511999999999", "wa_id from lead_id");
  assert.ok(typeof record.details === "string", "details is stringified JSON");
  const details = JSON.parse(record.details);
  assert.strictEqual(details.event_name, "funnel.cognitive.turn.start");
  assert.strictEqual(details.correlation_id, "corr-test-123");
  assert.deepStrictEqual(details.cognitive, { ai_detected_intent: "greeting", ai_confidence: 0.9 });
  return "PASS";
})();
console.log(`B1 cognitive event persistence record: ${B1}`);

const B2 = (() => {
  const event = {
    event_name: "funnel.mechanical.parse.result",
    lead_id: "5511888888888",
    stage_before: "inicio_nome",
    stage_after: "inicio_nome",
    mechanical: { parser_used: "parseName", reask_triggered: true },
    _stage_symptoms: { did_reask: true, did_stage_repeat: true, caused_loop: true }
  };
  const record = persistMod.buildPersistenceRecord(event);
  const details = JSON.parse(record.details);
  assert.ok(details.stage_symptoms, "stage_symptoms persisted");
  assert.strictEqual(details.stage_symptoms.did_reask, true);
  assert.strictEqual(details.stage_symptoms.caused_loop, true);
  return "PASS";
})();
console.log(`B2 mechanical+symptoms persistence record: ${B2}`);

const B3 = (() => {
  const event = {
    event_name: "funnel.arbitration.conflict",
    lead_id: "5511777777777",
    arbitration: {
      arbitration_triggered: true,
      override_detected: true,
      override_suspected: true,
      blocked_valid_signal: true
    }
  };
  const record = persistMod.buildPersistenceRecord(event);
  const details = JSON.parse(record.details);
  assert.ok(details.arbitration, "arbitration block persisted");
  assert.strictEqual(details.arbitration.arbitration_triggered, true);
  assert.strictEqual(details.arbitration.override_detected, true);
  return "PASS";
})();
console.log(`B3 arbitration event persistence record: ${B3}`);

const B4 = (() => {
  const record = persistMod.buildPersistenceRecord(null);
  assert.strictEqual(record, null, "null input returns null");
  return "PASS";
})();
console.log(`B4 null event returns null record: ${B4}`);

const B5 = (() => {
  const record = persistMod.buildPersistenceRecord({});
  assert.ok(record, "empty event still produces record");
  assert.strictEqual(record.tag, "HYBRID_TELEMETRY");
  return "PASS";
})();
console.log(`B5 empty event produces valid record: ${B5}`);

// ═══════════════════════════════════════════════════════════════════
// Section C — persistHybridTelemetryEvent safety
// ═══════════════════════════════════════════════════════════════════

const C1 = await (async () => {
  let captured = null;
  const mockLogger = async (_env, data) => { captured = data; };
  const result = await persistMod.persistHybridTelemetryEvent(mockLogger, {}, {
    event_name: "funnel.cognitive.turn.start",
    lead_id: "test-lead"
  });
  assert.strictEqual(result.ok, true, "persistence succeeds");
  assert.ok(captured, "logger was called");
  assert.strictEqual(captured.tag, "HYBRID_TELEMETRY");
  assert.strictEqual(captured.wa_id, "test-lead");
  return "PASS";
})();
console.log(`C1 persistence calls logger correctly: ${C1}`);

const C2 = await (async () => {
  const result = await persistMod.persistHybridTelemetryEvent(null, {}, { event_name: "test" });
  assert.strictEqual(result.ok, false, "no logger → graceful failure");
  assert.strictEqual(result.error, "logger_not_available");
  return "PASS";
})();
console.log(`C2 missing logger returns graceful error: ${C2}`);

const C3 = await (async () => {
  const throwingLogger = async () => { throw new Error("DB_DOWN"); };
  const result = await persistMod.persistHybridTelemetryEvent(throwingLogger, {}, {
    event_name: "test"
  });
  assert.strictEqual(result.ok, false, "throwing logger → graceful failure");
  assert.ok(result.error.includes("DB_DOWN"));
  return "PASS";
})();
console.log(`C3 throwing logger does not crash: ${C3}`);

const C4 = await (async () => {
  const result = await persistMod.persistHybridTelemetryEvent(
    async () => {}, {}, null
  );
  assert.strictEqual(result.ok, false, "null event → graceful failure");
  return "PASS";
})();
console.log(`C4 null event does not crash persistence: ${C4}`);

// ═══════════════════════════════════════════════════════════════════
// Section D — createPersistentEmitter integration
// ═══════════════════════════════════════════════════════════════════

const D1 = (() => {
  const emitter = persistMod.createPersistentEmitter(null, {});
  assert.strictEqual(emitter, null, "null logger → null emitter");
  return "PASS";
})();
console.log(`D1 null logger produces null emitter: ${D1}`);

const D2 = await (async () => {
  let captured = null;
  const mockLogger = async (_env, data) => { captured = data; };
  const emitter = persistMod.createPersistentEmitter(mockLogger, { SUPABASE_SERVICE_ROLE: "test" });
  assert.ok(typeof emitter === "function", "emitter is a function");
  await emitter({ event_name: "test_event", lead_id: "lead123" });
  assert.ok(captured, "emitter called logger");
  assert.strictEqual(captured.tag, "HYBRID_TELEMETRY");
  return "PASS";
})();
console.log(`D2 persistent emitter integration works: ${D2}`);

// ═══════════════════════════════════════════════════════════════════
// Section E — queryHybridTelemetryEvents post-filtering
// ═══════════════════════════════════════════════════════════════════

const mockSbFetch = (_env, _path, _opts) => {
  // Returns mock enova_log rows with stringified details
  return [
    {
      wa_id: "5511111111111",
      created_at: "2026-04-08T12:00:00.000Z",
      details: JSON.stringify({
        event_name: "funnel.cognitive.turn.result",
        lead_id: "5511111111111",
        stage_before: "inicio",
        stage_after: "inicio",
        correlation_id: "corr-1",
        cognitive: { ai_confidence: 0.3, cognitive_reason_codes: ["LOW_CONFIDENCE"] },
        mechanical: null,
        arbitration: null,
        stage_symptoms: null
      })
    },
    {
      wa_id: "5511111111111",
      created_at: "2026-04-08T12:01:00.000Z",
      details: JSON.stringify({
        event_name: "funnel.arbitration.conflict",
        lead_id: "5511111111111",
        stage_before: "inicio_nome",
        stage_after: "inicio_nome",
        correlation_id: "corr-2",
        cognitive: null,
        mechanical: null,
        arbitration: {
          arbitration_triggered: true,
          override_detected: true,
          override_suspected: true,
          blocked_valid_signal: false,
          caused_loop: false
        },
        stage_symptoms: {
          did_stage_advance: false,
          did_stage_repeat: true,
          did_stage_stick: false,
          did_reask: false,
          plausible_answer_without_advance: true,
          override_suspected: true,
          blocked_valid_signal: false,
          state_unchanged_when_expected: false,
          caused_loop: false
        }
      })
    },
    {
      wa_id: "5511222222222",
      created_at: "2026-04-08T12:02:00.000Z",
      details: JSON.stringify({
        event_name: "funnel.stage.symptoms",
        lead_id: "5511222222222",
        stage_before: "renda_trabalho",
        stage_after: "renda_trabalho",
        correlation_id: "corr-3",
        cognitive: null,
        mechanical: null,
        arbitration: null,
        stage_symptoms: {
          did_stage_advance: false,
          did_stage_repeat: false,
          did_stage_stick: true,
          did_reask: true,
          plausible_answer_without_advance: false,
          override_suspected: false,
          blocked_valid_signal: true,
          state_unchanged_when_expected: true,
          caused_loop: true
        }
      })
    }
  ];
};

const E1 = await (async () => {
  const result = await persistMod.queryHybridTelemetryEvents(mockSbFetch, {}, {});
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 3, "returns all 3 mock events");
  return "PASS";
})();
console.log(`E1 query all events: ${E1}`);

const E2 = await (async () => {
  const result = await persistMod.queryHybridTelemetryEvents(mockSbFetch, {}, {
    event_name: "funnel.arbitration.conflict"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 1, "filtered to 1 conflict");
  assert.strictEqual(result.events[0].event_name, "funnel.arbitration.conflict");
  return "PASS";
})();
console.log(`E2 filter by event_name: ${E2}`);

const E3 = await (async () => {
  const result = await persistMod.queryHybridTelemetryEvents(mockSbFetch, {}, {
    stage: "renda_trabalho"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 1, "filtered to renda_trabalho");
  return "PASS";
})();
console.log(`E3 filter by stage: ${E3}`);

const E4 = await (async () => {
  const result = await persistMod.queryHybridTelemetryEvents(mockSbFetch, {}, {
    reason_code: "LOW_CONFIDENCE"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 1, "filtered by reason code");
  return "PASS";
})();
console.log(`E4 filter by reason_code: ${E4}`);

const E5 = await (async () => {
  const throwingFetch = () => { throw new Error("NETWORK_ERROR"); };
  const result = await persistMod.queryHybridTelemetryEvents(throwingFetch, {}, {});
  assert.strictEqual(result.ok, false, "error returns ok:false");
  assert.ok(result.error.includes("NETWORK_ERROR"));
  return "PASS";
})();
console.log(`E5 query with failing fetch: ${E5}`);

// ═══════════════════════════════════════════════════════════════════
// Section F — queryArbitrationConflicts
// ═══════════════════════════════════════════════════════════════════

const F1 = await (async () => {
  const result = await persistMod.queryArbitrationConflicts(mockSbFetch, {}, {});
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 1, "only 1 event has arbitration conflict");
  assert.strictEqual(result.events[0].event_name, "funnel.arbitration.conflict");
  return "PASS";
})();
console.log(`F1 conflicts query returns only conflict events: ${F1}`);

const F2 = await (async () => {
  const result = await persistMod.queryArbitrationConflicts(mockSbFetch, {}, {
    lead_id: "5511111111111"
  });
  assert.strictEqual(result.ok, true);
  // sbFetch mock returns all 3 because we don't actually filter at DB level in mock
  // but post-filter catches it (lead_id filter is at DB level, conflict filter is post)
  assert.ok(result.events.length >= 1, "conflict for lead found");
  return "PASS";
})();
console.log(`F2 conflicts by lead: ${F2}`);

// ═══════════════════════════════════════════════════════════════════
// Section G — queryStageSymptoms
// ═══════════════════════════════════════════════════════════════════

const G1 = await (async () => {
  const result = await persistMod.queryStageSymptoms(mockSbFetch, {}, {});
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 2, "2 events have active symptoms");
  return "PASS";
})();
console.log(`G1 symptoms query returns events with active symptoms: ${G1}`);

const G2 = await (async () => {
  const result = await persistMod.queryStageSymptoms(mockSbFetch, {}, {
    symptom: "caused_loop"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 1, "only 1 event has caused_loop");
  assert.strictEqual(result.events[0].stage_symptoms.caused_loop, true);
  return "PASS";
})();
console.log(`G2 symptoms filtered by caused_loop: ${G2}`);

const G3 = await (async () => {
  const result = await persistMod.queryStageSymptoms(mockSbFetch, {}, {
    symptom: "did_stage_repeat"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 1, "only 1 event has did_stage_repeat");
  return "PASS";
})();
console.log(`G3 symptoms filtered by did_stage_repeat: ${G3}`);

const G4 = await (async () => {
  const result = await persistMod.queryStageSymptoms(mockSbFetch, {}, {
    symptom: "blocked_valid_signal"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.events.length, 1, "only 1 event has blocked_valid_signal");
  return "PASS";
})();
console.log(`G4 symptoms filtered by blocked_valid_signal: ${G4}`);

// ═══════════════════════════════════════════════════════════════════
// Section H — registerPersistentEmitter / getRegisteredPersistentEmitter
// ═══════════════════════════════════════════════════════════════════

const hooksMod = await import("../telemetry/hybrid-telemetry-worker-hooks.js");

const H1 = (() => {
  assert.ok(typeof hooksMod.registerPersistentEmitter === "function", "registerPersistentEmitter exported");
  assert.ok(typeof hooksMod.getRegisteredPersistentEmitter === "function", "getRegisteredPersistentEmitter exported");
  return "PASS";
})();
console.log(`H1 register/get persistent emitter exported: ${H1}`);

const H2 = (() => {
  hooksMod.registerPersistentEmitter(null);
  assert.strictEqual(hooksMod.getRegisteredPersistentEmitter(), null, "null clears emitter");
  return "PASS";
})();
console.log(`H2 null registration clears emitter: ${H2}`);

const H3 = (() => {
  const fn = async () => {};
  hooksMod.registerPersistentEmitter(fn);
  assert.strictEqual(hooksMod.getRegisteredPersistentEmitter(), fn, "function registered");
  hooksMod.registerPersistentEmitter(null); // cleanup
  return "PASS";
})();
console.log(`H3 function registration works: ${H3}`);

const H4 = (() => {
  hooksMod.registerPersistentEmitter("not_a_function");
  assert.strictEqual(hooksMod.getRegisteredPersistentEmitter(), null, "non-function rejected");
  return "PASS";
})();
console.log(`H4 non-function registration rejected: ${H4}`);

// ═══════════════════════════════════════════════════════════════════
// Section I — Proof: parser/gate/nextStage NOT altered
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";

const workerSrc = readFileSync(new URL("../Enova worker.js", import.meta.url), "utf8");

const I1 = (() => {
  // Verify persistence module does NOT contain parser/gate/nextStage references
  const persistSrc = readFileSync(new URL("../telemetry/hybrid-telemetry-persistence.js", import.meta.url), "utf8");
  assert.ok(!persistSrc.includes("nextStage"), "persistence does not reference nextStage");
  assert.ok(!persistSrc.includes("pickParser"), "persistence does not reference pickParser");
  assert.ok(!persistSrc.includes("fase_conversa ="), "persistence does not write fase_conversa");
  return "PASS";
})();
console.log(`I1 persistence module has no parser/gate/nextStage: ${I1}`);

const I2 = (() => {
  // Verify persistence import does not alter any decisional function
  const hooksSrc = readFileSync(new URL("../telemetry/hybrid-telemetry-worker-hooks.js", import.meta.url), "utf8");
  // Only check for assignment/modification patterns, not comment references
  assert.ok(!hooksSrc.includes("nextStage ="), "hooks do not assign nextStage");
  assert.ok(!hooksSrc.includes("pickParser"), "hooks do not reference pickParser");
  return "PASS";
})();
console.log(`I2 hooks module has no parser/gate/nextStage: ${I2}`);

const I3 = (() => {
  // Verify queryHybridTelemetryEvents is read-only (uses GET)
  const persistSrc = readFileSync(new URL("../telemetry/hybrid-telemetry-persistence.js", import.meta.url), "utf8");
  assert.ok(persistSrc.includes('method: "GET"'), "query uses GET method");
  // The only POST is in the persistence write (via logger)
  assert.ok(!persistSrc.includes('method: "POST"'), "query helpers never do POST");
  return "PASS";
})();
console.log(`I3 query helpers are read-only: ${I3}`);

const I4 = (() => {
  // Verify the admin endpoints are GET-only
  const byLeadBlock = workerSrc.includes('request.method === "GET" && pathname === "/__admin_prod__/hybrid-telemetry/by-lead"');
  const recentBlock = workerSrc.includes('request.method === "GET" && pathname === "/__admin_prod__/hybrid-telemetry/recent"');
  const conflictsBlock = workerSrc.includes('request.method === "GET" && pathname === "/__admin_prod__/hybrid-telemetry/conflicts"');
  const symptomsBlock = workerSrc.includes('request.method === "GET" && pathname === "/__admin_prod__/hybrid-telemetry/symptoms"');
  assert.ok(byLeadBlock, "by-lead endpoint is GET");
  assert.ok(recentBlock, "recent endpoint is GET");
  assert.ok(conflictsBlock, "conflicts endpoint is GET");
  assert.ok(symptomsBlock, "symptoms endpoint is GET");
  return "PASS";
})();
console.log(`I4 all admin endpoints are GET-only: ${I4}`);

// ═══════════════════════════════════════════════════════════════════
// Section J — Proof: worker behavior intact
// ═══════════════════════════════════════════════════════════════════

const J1 = (() => {
  // step() function still exists and has not been structurally altered
  assert.ok(workerSrc.includes("async function step(env, st, messages, nextStage"), "step() signature intact");
  return "PASS";
})();
console.log(`J1 step() function signature intact: ${J1}`);

const J2 = (() => {
  // renderCognitiveSpeech still called in step()
  assert.ok(workerSrc.includes("renderCognitiveSpeech(st, currentStage, rawArr"), "renderCognitiveSpeech still called");
  return "PASS";
})();
console.log(`J2 renderCognitiveSpeech still in step(): ${J2}`);

const J3 = (() => {
  // sendMessage still called
  assert.ok(workerSrc.includes("await sendMessage(env, st.wa_id, msg)"), "sendMessage still called");
  return "PASS";
})();
console.log(`J3 sendMessage still in step(): ${J3}`);

const J4 = (() => {
  // handleMetaWebhook still exists
  assert.ok(workerSrc.includes("handleMetaWebhook"), "handleMetaWebhook exists");
  return "PASS";
})();
console.log(`J4 handleMetaWebhook exists: ${J4}`);

const J5 = (() => {
  // Existing admin endpoints still present
  assert.ok(workerSrc.includes('pathname === "/__admin__/health"'), "health endpoint intact");
  assert.ok(workerSrc.includes('pathname === "/__admin__/send"'), "send endpoint intact");
  assert.ok(workerSrc.includes('pathname === "/__admin__/simulate-funnel"'), "simulate-funnel intact");
  return "PASS";
})();
console.log(`J5 existing admin endpoints intact: ${J5}`);

// ═══════════════════════════════════════════════════════════════════
// Section K — Proof: persistence failure does NOT crash attendance
// ═══════════════════════════════════════════════════════════════════

const K1 = await (async () => {
  // emitTurnEntryTelemetry should work even if persistentEmitter throws
  hooksMod.registerPersistentEmitter(async () => { throw new Error("DB_DOWN_SIMULATED"); });
  try {
    await hooksMod.emitTurnEntryTelemetry({
      st: { wa_id: "test-k1", fase_conversa: "inicio" },
      messageId: "wamid.k1",
      waId: "test-k1",
      userText: "olá",
      stage: "inicio"
    });
    // If we get here, the hook did not throw
    return "PASS";
  } catch (err) {
    return `FAIL: hook threw: ${err.message}`;
  } finally {
    hooksMod.registerPersistentEmitter(null);
  }
})();
console.log(`K1 persistence failure does not crash emitTurnEntryTelemetry: ${K1}`);

const K2 = await (async () => {
  hooksMod.registerPersistentEmitter(async () => { throw new Error("DB_DOWN_SIMULATED"); });
  try {
    await hooksMod.emitCognitiveDecisionTelemetry({
      st: { wa_id: "test-k2", fase_conversa: "inicio" },
      stage: "inicio",
      userText: "oi"
    });
    return "PASS";
  } catch (err) {
    return `FAIL: hook threw: ${err.message}`;
  } finally {
    hooksMod.registerPersistentEmitter(null);
  }
})();
console.log(`K2 persistence failure does not crash emitCognitiveDecisionTelemetry: ${K2}`);

const K3 = await (async () => {
  hooksMod.registerPersistentEmitter(async () => { throw new Error("DB_DOWN_SIMULATED"); });
  try {
    await hooksMod.emitMechanicalDecisionTelemetry({
      st: { wa_id: "test-k3", fase_conversa: "inicio" },
      stageBefore: "inicio",
      stageAfter: "inicio"
    });
    return "PASS";
  } catch (err) {
    return `FAIL: hook threw: ${err.message}`;
  } finally {
    hooksMod.registerPersistentEmitter(null);
  }
})();
console.log(`K3 persistence failure does not crash emitMechanicalDecisionTelemetry: ${K3}`);

const K4 = await (async () => {
  hooksMod.registerPersistentEmitter(async () => { throw new Error("DB_DOWN_SIMULATED"); });
  try {
    await hooksMod.emitArbitrationTelemetry({
      st: { wa_id: "test-k4", fase_conversa: "inicio" },
      stage: "inicio",
      arbitrationTriggered: true
    });
    return "PASS";
  } catch (err) {
    return `FAIL: hook threw: ${err.message}`;
  } finally {
    hooksMod.registerPersistentEmitter(null);
  }
})();
console.log(`K4 persistence failure does not crash emitArbitrationTelemetry: ${K4}`);

const K5 = await (async () => {
  hooksMod.registerPersistentEmitter(async () => { throw new Error("DB_DOWN_SIMULATED"); });
  try {
    await hooksMod.emitStageSymptomsHook({
      st: { wa_id: "test-k5", fase_conversa: "inicio" },
      stageBefore: "inicio",
      stageAfter: "inicio"
    });
    return "PASS";
  } catch (err) {
    return `FAIL: hook threw: ${err.message}`;
  } finally {
    hooksMod.registerPersistentEmitter(null);
  }
})();
console.log(`K5 persistence failure does not crash emitStageSymptomsHook: ${K5}`);

const K6 = await (async () => {
  hooksMod.registerPersistentEmitter(async () => { throw new Error("DB_DOWN_SIMULATED"); });
  try {
    await hooksMod.emitFinalOutputTelemetry({
      st: { wa_id: "test-k6", fase_conversa: "inicio" },
      stageBefore: "inicio",
      stageAfter: "inicio",
      outputSurface: "test"
    });
    return "PASS";
  } catch (err) {
    return `FAIL: hook threw: ${err.message}`;
  } finally {
    hooksMod.registerPersistentEmitter(null);
  }
})();
console.log(`K6 persistence failure does not crash emitFinalOutputTelemetry: ${K6}`);

const K7 = await (async () => {
  hooksMod.registerPersistentEmitter(async () => { throw new Error("DB_DOWN_SIMULATED"); });
  try {
    await hooksMod.emitPostProcessingTelemetry({
      st: { wa_id: "test-k7", fase_conversa: "inicio" },
      stage: "inicio",
      replyBeforeContract: "before",
      replyAfterContract: "after"
    });
    return "PASS";
  } catch (err) {
    return `FAIL: hook threw: ${err.message}`;
  } finally {
    hooksMod.registerPersistentEmitter(null);
  }
})();
console.log(`K7 persistence failure does not crash emitPostProcessingTelemetry: ${K7}`);

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

const allResults = [
  A1, A2, A3, A4, A5, A6, A7,
  B1, B2, B3, B4, B5,
  C1, C2, C3, C4,
  D1, D2,
  E1, E2, E3, E4, E5,
  F1, F2,
  G1, G2, G3, G4,
  H1, H2, H3, H4,
  I1, I2, I3, I4,
  J1, J2, J3, J4, J5,
  K1, K2, K3, K4, K5, K6, K7
];

const passed = allResults.filter(r => r === "PASS").length;
const failed = allResults.filter(r => r !== "PASS").length;

console.log(`\n═══════════════════════════════════════`);
console.log(`TOTAL: ${allResults.length} | PASS: ${passed} | FAIL: ${failed}`);
console.log(`═══════════════════════════════════════`);

if (failed > 0) {
  process.exit(1);
}
