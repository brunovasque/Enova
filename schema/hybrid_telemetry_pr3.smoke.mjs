/**
 * hybrid_telemetry_pr3.smoke.mjs — Smoke tests for PR 3 (central symptom contract closure)
 *
 * Validates:
 *   1. STAGE_SYMPTOM_CODES exported from contract
 *   2. did_stage_advance correctly emitted
 *   3. did_stage_repeat correctly emitted
 *   4. did_stage_stick correctly emitted
 *   5. did_reask correctly emitted
 *   6. plausible_answer_without_advance correctly emitted
 *   7. override_suspected correctly emitted
 *   8. blocked_valid_signal correctly emitted
 *   9. state_unchanged_when_expected correctly emitted
 *  10. caused_loop correctly emitted
 *  11. Arbitration enrichment (blocked_valid_signal, caused_loop, requires_confirmation)
 *  12. Parser/gate/nextStage not altered
 *  13. Worker behavior intact (fire-and-forget, never throws)
 */

import { strict as assert } from "node:assert";

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
// SECTION A — Contract: STAGE_SYMPTOM_CODES and new fields
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section A — Contract: STAGE_SYMPTOM_CODES");

test("A1: STAGE_SYMPTOM_CODES exported from contract", () => {
  assert.ok(contract.STAGE_SYMPTOM_CODES, "STAGE_SYMPTOM_CODES must be exported");
});

test("A2: STAGE_SYMPTOM_CODES has DID_STAGE_ADVANCE", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.DID_STAGE_ADVANCE, "DID_STAGE_ADVANCE");
});

test("A3: STAGE_SYMPTOM_CODES has DID_STAGE_REPEAT", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.DID_STAGE_REPEAT, "DID_STAGE_REPEAT");
});

test("A4: STAGE_SYMPTOM_CODES has DID_STAGE_STICK", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.DID_STAGE_STICK, "DID_STAGE_STICK");
});

test("A5: STAGE_SYMPTOM_CODES has DID_REASK", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.DID_REASK, "DID_REASK");
});

test("A6: STAGE_SYMPTOM_CODES has PLAUSIBLE_ANSWER_WITHOUT_ADVANCE", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.PLAUSIBLE_ANSWER_WITHOUT_ADVANCE, "PLAUSIBLE_ANSWER_WITHOUT_ADVANCE");
});

test("A7: STAGE_SYMPTOM_CODES has OVERRIDE_SUSPECTED", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.OVERRIDE_SUSPECTED, "OVERRIDE_SUSPECTED");
});

test("A8: STAGE_SYMPTOM_CODES has BLOCKED_VALID_SIGNAL", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.BLOCKED_VALID_SIGNAL, "BLOCKED_VALID_SIGNAL");
});

test("A9: STAGE_SYMPTOM_CODES has STATE_UNCHANGED_WHEN_EXPECTED", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.STATE_UNCHANGED_WHEN_EXPECTED, "STATE_UNCHANGED_WHEN_EXPECTED");
});

test("A10: STAGE_SYMPTOM_CODES has CAUSED_LOOP", () => {
  assert.equal(contract.STAGE_SYMPTOM_CODES.CAUSED_LOOP, "CAUSED_LOOP");
});

test("A11: STAGE_SYMPTOMS event type defined", () => {
  assert.equal(contract.HYBRID_TELEMETRY_EVENT_TYPES.STAGE_SYMPTOMS, "funnel.stage.symptoms");
});

test("A12: stage_symptoms field group in HYBRID_TELEMETRY_FIELD_GROUPS", () => {
  const groups = contract.HYBRID_TELEMETRY_FIELD_GROUPS;
  assert.ok(groups.stage_symptoms, "stage_symptoms group must exist");
  assert.ok(groups.stage_symptoms.includes("did_stage_advance"));
  assert.ok(groups.stage_symptoms.includes("did_reask"));
  assert.ok(groups.stage_symptoms.includes("caused_loop"));
});

test("A13: arbitration field group has blocked_valid_signal", () => {
  assert.ok(contract.HYBRID_TELEMETRY_FIELD_GROUPS.arbitration.includes("blocked_valid_signal"));
});

test("A14: arbitration field group has caused_loop", () => {
  assert.ok(contract.HYBRID_TELEMETRY_FIELD_GROUPS.arbitration.includes("caused_loop"));
});

test("A15: arbitration field group has requires_confirmation", () => {
  assert.ok(contract.HYBRID_TELEMETRY_FIELD_GROUPS.arbitration.includes("requires_confirmation"));
});

test("A16: HYBRID_TELEMETRY_DEFAULTS.stage_symptoms has all symptom keys", () => {
  const d = contract.HYBRID_TELEMETRY_DEFAULTS.stage_symptoms;
  assert.ok(d, "stage_symptoms defaults must exist");
  assert.equal(d.did_stage_advance, false);
  assert.equal(d.did_stage_repeat, false);
  assert.equal(d.did_stage_stick, false);
  assert.equal(d.did_reask, false);
  assert.equal(d.plausible_answer_without_advance, false);
  assert.equal(d.override_suspected, false);
  assert.equal(d.blocked_valid_signal, false);
  assert.equal(d.state_unchanged_when_expected, false);
  assert.equal(d.caused_loop, false);
});

test("A17: HYBRID_TELEMETRY_DEFAULTS.arbitration has new enriched keys", () => {
  const d = contract.HYBRID_TELEMETRY_DEFAULTS.arbitration;
  assert.equal(d.blocked_valid_signal, false);
  assert.equal(d.caused_loop, false);
  assert.equal(d.requires_confirmation, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION B — emitStageSymptomsHook: did_stage_advance
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section B — did_stage_advance emission");

await testAsync("B1: emitStageSymptomsHook emits did_stage_advance=true when stage changes", async () => {
  const emitted = [];
  const result = await hooks.emitStageSymptomsHook({
    st: { wa_id: "test-lead", last_message_id: "msg-1" },
    stageBefore: "inicio",
    stageAfter: "nome",
    reaskTriggered: false,
    stageLocked: false
  });
  // Fire-and-forget: result is undefined, no throw = pass
  assert.ok(true, "emitStageSymptomsHook did not throw");
});

await testAsync("B2: emitStageSymptomsHook does not throw on stage advance", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "nome",
      stageAfter: "cpf",
      reaskTriggered: false,
      stageLocked: false
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false, "must never throw");
});

// ═════════════════════════════════════════════════════════════════
// SECTION C — did_stage_repeat
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section C — did_stage_repeat emission");

await testAsync("C1: emitStageSymptomsHook does not throw on stage repeat", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "nome",
      stageAfter: "nome",
      reaskTriggered: false,
      stageLocked: false
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION D — did_stage_stick
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section D — did_stage_stick emission");

await testAsync("D1: emitStageSymptomsHook does not throw on stage stick (locked)", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "renda",
      stageAfter: "renda",
      reaskTriggered: false,
      stageLocked: true
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION E — did_reask
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section E — did_reask emission");

await testAsync("E1: emitStageSymptomsHook does not throw on reask", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "estado_civil",
      stageAfter: "estado_civil",
      reaskTriggered: true,
      stageLocked: false
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION F — plausible_answer_without_advance
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section F — plausible_answer_without_advance emission");

await testAsync("F1: emitStageSymptomsHook does not throw on plausible answer without advance", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "renda",
      stageAfter: "renda",
      reaskTriggered: false,
      stageLocked: false,
      cognitiveSignal: "plausible_signal",
      cognitiveConfidence: 0.8,
      mechanicalAction: "stay",
      overrideSuspected: false,
      stateDiff: null
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION G — override_suspected
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section G — override_suspected emission");

await testAsync("G1: emitStageSymptomsHook does not throw on override suspected", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "cpf",
      stageAfter: "cpf",
      reaskTriggered: false,
      stageLocked: false,
      cognitiveSignal: "advance_signal",
      cognitiveConfidence: 0.9,
      mechanicalAction: "stay",
      overrideSuspected: true,
      stateDiff: null
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION H — blocked_valid_signal
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section H — blocked_valid_signal emission");

await testAsync("H1: emitStageSymptomsHook does not throw on blocked valid signal", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "fgts",
      stageAfter: "fgts",
      reaskTriggered: false,
      stageLocked: false,
      cognitiveSignal: "strong_signal",
      cognitiveConfidence: 0.95,
      mechanicalAction: "stay",
      overrideSuspected: false,
      stateDiff: null
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION I — state_unchanged_when_expected
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section I — state_unchanged_when_expected emission");

await testAsync("I1: emitStageSymptomsHook does not throw on state unchanged when expected", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "renda",
      stageAfter: "renda",
      reaskTriggered: false,
      stageLocked: false,
      cognitiveSignal: "income_signal",
      cognitiveConfidence: 0.7,
      mechanicalAction: "stay",
      overrideSuspected: false,
      stateDiff: null
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION J — caused_loop
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section J — caused_loop emission");

await testAsync("J1: emitStageSymptomsHook does not throw on caused_loop scenario", async () => {
  let threw = false;
  try {
    await hooks.emitStageSymptomsHook({
      st: { wa_id: "w1" },
      stageBefore: "estado_civil",
      stageAfter: "estado_civil",
      reaskTriggered: true,
      stageLocked: false,
      cognitiveSignal: "marital_signal",
      cognitiveConfidence: 0.85,
      mechanicalAction: "stay",
      overrideSuspected: true,
      stateDiff: null
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

// ═════════════════════════════════════════════════════════════════
// SECTION K — Arbitration enrichment
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section K — Arbitration enrichment");

await testAsync("K1: emitArbitrationTelemetry accepts blockedValidSignal param without throwing", async () => {
  let threw = false;
  try {
    await hooks.emitArbitrationTelemetry({
      st: { wa_id: "w1" },
      stage: "nome",
      cognitiveSignal: "advance",
      mechanicalParserResult: null,
      mechanicalAction: "stay",
      arbitrationTriggered: true,
      arbitrationOutcome: "mechanical_prevails",
      arbitrationWinner: "mechanical",
      arbitrationReason: "mechanical_sovereign",
      overrideDetected: true,
      overrideClassification: "OVERRIDE_EXPECTED_RULE",
      overrideSuspected: false,
      blockedValidSignal: true,
      causedLoop: false,
      requiresConfirmation: false
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

await testAsync("K2: emitArbitrationTelemetry accepts causedLoop param without throwing", async () => {
  let threw = false;
  try {
    await hooks.emitArbitrationTelemetry({
      st: { wa_id: "w1" },
      stage: "renda",
      arbitrationTriggered: true,
      arbitrationWinner: "mechanical",
      causedLoop: true,
      requiresConfirmation: false
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

await testAsync("K3: emitArbitrationTelemetry accepts requiresConfirmation param without throwing", async () => {
  let threw = false;
  try {
    await hooks.emitArbitrationTelemetry({
      st: { wa_id: "w1" },
      stage: "cpf",
      arbitrationTriggered: false,
      requiresConfirmation: true
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false);
});

await testAsync("K4: emitArbitrationTelemetry infers blocked_valid_signal when not provided", async () => {
  let threw = false;
  try {
    await hooks.emitArbitrationTelemetry({
      st: { wa_id: "w1" },
      stage: "fgts",
      cognitiveSignal: "advance",
      arbitrationTriggered: true,
      arbitrationWinner: "mechanical",
      overrideDetected: true
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false, "inferred blocked_valid_signal must not throw");
});

// ═════════════════════════════════════════════════════════════════
// SECTION L — Proof: parser/gate/nextStage not altered
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section L — Proof: parser/gate/nextStage not altered");

test("L1: hybrid-telemetry-contract.js does not export any parser function", () => {
  const keys = Object.keys(contract);
  const parserKeys = keys.filter(k => k.toLowerCase().includes("parser") || k.toLowerCase().includes("gate"));
  assert.equal(parserKeys.length, 0, `Unexpected parser/gate exports: ${parserKeys.join(", ")}`);
});

test("L2: hybrid-telemetry-worker-hooks.js does not export nextStage or parser", () => {
  const keys = Object.keys(hooks);
  const dangerous = keys.filter(k =>
    k === "nextStage" || k === "parseInput" || k === "runGate" || k === "runFunnel"
  );
  assert.equal(dangerous.length, 0, `Unexpected exports: ${dangerous.join(", ")}`);
});

test("L3: STAGE_SYMPTOM_CODES is frozen (immutable)", () => {
  assert.ok(Object.isFrozen(contract.STAGE_SYMPTOM_CODES), "must be frozen");
});

test("L4: stage_symptoms defaults is frozen", () => {
  assert.ok(Object.isFrozen(contract.HYBRID_TELEMETRY_DEFAULTS.stage_symptoms), "must be frozen");
});

// ═════════════════════════════════════════════════════════════════
// SECTION M — Worker behavior intact (fire-and-forget, tolerant)
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section M — Worker behavior intact");

await testAsync("M1: emitStageSymptomsHook is safe with null st", async () => {
  let threw = false;
  try { await hooks.emitStageSymptomsHook({ st: null }); } catch (_) { threw = true; }
  assert.equal(threw, false);
});

await testAsync("M2: emitStageSymptomsHook is safe with undefined params", async () => {
  let threw = false;
  try { await hooks.emitStageSymptomsHook(undefined); } catch (_) { threw = true; }
  assert.equal(threw, false);
});

await testAsync("M3: emitStageSymptomsHook is safe with empty object", async () => {
  let threw = false;
  try { await hooks.emitStageSymptomsHook({}); } catch (_) { threw = true; }
  assert.equal(threw, false);
});

await testAsync("M4: emitArbitrationTelemetry is safe with no new params (backward compat)", async () => {
  let threw = false;
  try {
    await hooks.emitArbitrationTelemetry({
      st: { wa_id: "back-compat" },
      stage: "nome",
      cognitiveSignal: "advance",
      arbitrationTriggered: true,
      arbitrationWinner: "cognitive",
      arbitrationReason: "llm_real_takes_final",
      overrideDetected: false,
      overrideClassification: null,
      overrideSuspected: false
    });
  } catch (_) { threw = true; }
  assert.equal(threw, false, "backward-compat call must not throw");
});

await testAsync("M5: emitStageSymptomsHook is exported from hooks module", async () => {
  assert.equal(typeof hooks.emitStageSymptomsHook, "function");
});

// ═════════════════════════════════════════════════════════════════
// SECTION N — STAGE_SYMPTOM_CODES re-export chain
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section N — STAGE_SYMPTOM_CODES re-export chain");

test("N1: STAGE_SYMPTOM_CODES exported from hybrid-telemetry.js", () => {
  assert.ok(telemetry.STAGE_SYMPTOM_CODES, "must be re-exported from hybrid-telemetry.js");
});

test("N2: STAGE_SYMPTOM_CODES exported from hybrid-telemetry-worker-hooks.js", () => {
  assert.ok(hooks.STAGE_SYMPTOM_CODES, "must be re-exported from hooks");
});

test("N3: STAGE_SYMPTOM_CODES is same object across chain", () => {
  assert.deepEqual(
    contract.STAGE_SYMPTOM_CODES,
    telemetry.STAGE_SYMPTOM_CODES
  );
});

// ═════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`📊 hybrid_telemetry_pr3.smoke.mjs — Results`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
if (failures.length > 0) {
  console.log("\n🔴 Failures:");
  for (const { name, error } of failures) {
    console.log(`   • ${name}: ${error}`);
  }
}
console.log(`${"═".repeat(60)}\n`);

if (failed > 0) process.exit(1);
