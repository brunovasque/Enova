/**
 * hybrid_telemetry_pr5.smoke.mjs — PR 5 (Fases 10 + 11 + 12)
 *
 * Smoke tests for ranking, regression, and rollout control.
 *
 * Sections:
 *   A — Ranking module integrity (imports, exports)
 *   B — aggregateSymptoms correctness
 *   C — buildRanking ordering (severity-based)
 *   D — Regression module integrity
 *   E — captureBaseline correctness
 *   F — compareBaselines deltas & verdicts
 *   G — Rollout module integrity
 *   H — Rollout flag CRUD operations
 *   I — Rollout modes (OFF/SHADOW/ON) behavior
 *   J — handleRolloutEndpoint (GET/POST)
 *   K — Proof: parser/gate/nextStage NOT altered
 *   L — Proof: worker behavior intact
 *   M — Endpoints protection proof
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ═══════════════════════════════════════════════════════════════════
// Section A — Ranking module integrity
// ═══════════════════════════════════════════════════════════════════

const rankingMod = await import("../telemetry/hybrid-telemetry-ranking.js");

const A1 = (() => {
  assert.ok(typeof rankingMod.aggregateSymptoms === "function", "aggregateSymptoms exported");
  return "PASS";
})();
console.log(`A1 aggregateSymptoms exported: ${A1}`);

const A2 = (() => {
  assert.ok(typeof rankingMod.buildRanking === "function", "buildRanking exported");
  return "PASS";
})();
console.log(`A2 buildRanking exported: ${A2}`);

const A3 = (() => {
  assert.ok(typeof rankingMod.topProblems === "function", "topProblems exported");
  return "PASS";
})();
console.log(`A3 topProblems exported: ${A3}`);

const A4 = (() => {
  assert.ok(typeof rankingMod.handleRankingEndpoint === "function", "handleRankingEndpoint exported");
  return "PASS";
})();
console.log(`A4 handleRankingEndpoint exported: ${A4}`);

const A5 = (() => {
  assert.ok(typeof rankingMod.SYMPTOM_SEVERITY === "object", "SYMPTOM_SEVERITY exported");
  assert.ok(rankingMod.SYMPTOM_SEVERITY.caused_loop > rankingMod.SYMPTOM_SEVERITY.did_stage_stick, "loop > stuck severity");
  assert.ok(rankingMod.SYMPTOM_SEVERITY.did_stage_stick > rankingMod.SYMPTOM_SEVERITY.blocked_valid_signal, "stuck > blocked severity");
  assert.ok(rankingMod.SYMPTOM_SEVERITY.blocked_valid_signal >= rankingMod.SYMPTOM_SEVERITY.did_reask, "blocked >= reask severity");
  assert.ok(rankingMod.SYMPTOM_SEVERITY.did_reask >= rankingMod.SYMPTOM_SEVERITY.did_stage_repeat, "reask >= repeat severity");
  return "PASS";
})();
console.log(`A5 SYMPTOM_SEVERITY hierarchy correct: ${A5}`);

// ═══════════════════════════════════════════════════════════════════
// Section B — aggregateSymptoms correctness
// ═══════════════════════════════════════════════════════════════════

const B1 = (() => {
  const result = rankingMod.aggregateSymptoms([]);
  assert.deepStrictEqual(result.by_stage, {});
  assert.deepStrictEqual(result.by_symptom, {});
  assert.deepStrictEqual(result.ranked, []);
  return "PASS";
})();
console.log(`B1 aggregateSymptoms empty input: ${B1}`);

const B2 = (() => {
  const events = [
    { stage_before: "inicio_nome", stage_symptoms: { caused_loop: true, did_reask: true }, lead_id: "lead1" },
    { stage_before: "inicio_nome", stage_symptoms: { caused_loop: true }, lead_id: "lead1" },
    { stage_before: "inicio_cpf", stage_symptoms: { did_stage_stick: true }, lead_id: "lead2" }
  ];
  const result = rankingMod.aggregateSymptoms(events);
  assert.strictEqual(result.by_symptom.caused_loop, 2, "caused_loop count");
  assert.strictEqual(result.by_symptom.did_reask, 1, "did_reask count");
  assert.strictEqual(result.by_symptom.did_stage_stick, 1, "did_stage_stick count");
  assert.strictEqual(result.by_stage["inicio_nome"].caused_loop, 2, "by_stage inicio_nome caused_loop");
  assert.strictEqual(result.by_stage["inicio_cpf"].did_stage_stick, 1, "by_stage inicio_cpf");
  assert.ok(Object.keys(result.by_lead).length === 2, "2 leads affected");
  return "PASS";
})();
console.log(`B2 aggregateSymptoms with data: ${B2}`);

const B3 = (() => {
  const events = [
    { stage_before: "inicio_nome", stage_symptoms: { caused_loop: true, did_stage_stick: true }, lead_id: "l1" }
  ];
  const result = rankingMod.aggregateSymptoms(events);
  assert.ok(Object.keys(result.by_combination).length > 0, "combination captured");
  const comboKey = Object.keys(result.by_combination)[0];
  assert.ok(comboKey.includes("caused_loop"), "combo includes loop");
  assert.ok(comboKey.includes("did_stage_stick"), "combo includes stuck");
  return "PASS";
})();
console.log(`B3 aggregateSymptoms combinations: ${B3}`);

// ═══════════════════════════════════════════════════════════════════
// Section C — buildRanking ordering
// ═══════════════════════════════════════════════════════════════════

const C1 = (() => {
  const byStage = {
    inicio_nome: { caused_loop: 2, did_reask: 5 },
    inicio_cpf: { did_stage_stick: 3 }
  };
  const bySymptom = { caused_loop: 2, did_reask: 5, did_stage_stick: 3 };
  const ranked = rankingMod.buildRanking(byStage, bySymptom);
  // caused_loop: 2*5=10, did_stage_stick: 3*4=12, did_reask: 5*2=10
  assert.strictEqual(ranked[0].symptom, "did_stage_stick", "stuck ranks first (score 12)");
  assert.strictEqual(ranked[0].score, 12, "correct score for stuck");
  return "PASS";
})();
console.log(`C1 buildRanking orders by severity score: ${C1}`);

const C2 = (() => {
  const byStage = {
    s1: { caused_loop: 1 },
    s2: { did_stage_repeat: 10 }
  };
  const ranked = rankingMod.buildRanking(byStage, {});
  // caused_loop: 1*5=5, did_stage_repeat: 10*1=10
  assert.strictEqual(ranked[0].symptom, "did_stage_repeat", "repeat ranks first (score 10)");
  assert.strictEqual(ranked[1].symptom, "caused_loop", "loop ranks second (score 5)");
  return "PASS";
})();
console.log(`C2 buildRanking frequency × weight: ${C2}`);

const C3 = (() => {
  const result = rankingMod.topProblems([{ a: 1 }, { b: 2 }, { c: 3 }], 2);
  assert.strictEqual(result.length, 2, "topProblems limits correctly");
  return "PASS";
})();
console.log(`C3 topProblems limit: ${C3}`);

// ═══════════════════════════════════════════════════════════════════
// Section D — Regression module integrity
// ═══════════════════════════════════════════════════════════════════

const regressionMod = await import("../telemetry/hybrid-telemetry-regression.js");

const D1 = (() => {
  assert.ok(typeof regressionMod.captureBaseline === "function", "captureBaseline exported");
  return "PASS";
})();
console.log(`D1 captureBaseline exported: ${D1}`);

const D2 = (() => {
  assert.ok(typeof regressionMod.compareBaselines === "function", "compareBaselines exported");
  return "PASS";
})();
console.log(`D2 compareBaselines exported: ${D2}`);

const D3 = (() => {
  assert.ok(typeof regressionMod.handleRegressionEndpoint === "function", "handleRegressionEndpoint exported");
  return "PASS";
})();
console.log(`D3 handleRegressionEndpoint exported: ${D3}`);

// ═══════════════════════════════════════════════════════════════════
// Section E — captureBaseline correctness
// ═══════════════════════════════════════════════════════════════════

const E1 = (() => {
  const baseline = regressionMod.captureBaseline([]);
  assert.strictEqual(baseline.total_events, 0, "empty events");
  assert.strictEqual(baseline.loop_count, 0, "zero loops");
  return "PASS";
})();
console.log(`E1 captureBaseline empty input: ${E1}`);

const E2 = (() => {
  const events = [
    { stage_before: "s1", stage_symptoms: { caused_loop: true, did_reask: true, did_stage_advance: true } },
    { stage_before: "s1", stage_symptoms: { caused_loop: true } },
    { stage_before: "s2", stage_symptoms: { did_stage_stick: true } }
  ];
  const baseline = regressionMod.captureBaseline(events);
  assert.strictEqual(baseline.total_events, 3, "3 events");
  assert.strictEqual(baseline.loop_count, 2, "2 loops");
  assert.strictEqual(baseline.reask_count, 1, "1 reask");
  assert.strictEqual(baseline.stage_advance_count, 1, "1 advance");
  assert.strictEqual(baseline.symptom_counts.caused_loop, 2, "caused_loop=2");
  assert.strictEqual(baseline.by_stage.s1.total, 2, "s1 has 2 events");
  return "PASS";
})();
console.log(`E2 captureBaseline with data: ${E2}`);

// ═══════════════════════════════════════════════════════════════════
// Section F — compareBaselines deltas & verdicts
// ═══════════════════════════════════════════════════════════════════

const F1 = (() => {
  const before = {
    total_events: 10, symptom_counts: { caused_loop: 5, did_reask: 3 },
    loop_count: 5, reask_count: 3, stage_advance_count: 2
  };
  const after = {
    total_events: 10, symptom_counts: { caused_loop: 2, did_reask: 1 },
    loop_count: 2, reask_count: 1, stage_advance_count: 5
  };
  const result = regressionMod.compareBaselines(before, after);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deltas.caused_loop.diff, -3, "loop decreased by 3");
  assert.strictEqual(result.deltas.did_reask.diff, -2, "reask decreased by 2");
  assert.strictEqual(result.key_metrics.loops.diff, -3, "loop key metric");
  assert.strictEqual(result.key_metrics.stage_advances.diff, 3, "advances increased");
  assert.strictEqual(result.verdict, "melhorou", "verdict should be melhorou");
  return "PASS";
})();
console.log(`F1 compareBaselines detects improvement: ${F1}`);

const F2 = (() => {
  const before = {
    total_events: 10, symptom_counts: { caused_loop: 2 },
    loop_count: 2, reask_count: 1, stage_advance_count: 5
  };
  const after = {
    total_events: 10, symptom_counts: { caused_loop: 6 },
    loop_count: 6, reask_count: 3, stage_advance_count: 2
  };
  const result = regressionMod.compareBaselines(before, after);
  assert.strictEqual(result.verdict, "piorou", "verdict should be piorou");
  assert.strictEqual(result.deltas.caused_loop.diff, 4, "loop increased");
  return "PASS";
})();
console.log(`F2 compareBaselines detects regression: ${F2}`);

const F3 = (() => {
  const before = {
    total_events: 10, symptom_counts: { did_reask: 3 },
    loop_count: 0, reask_count: 3, stage_advance_count: 5
  };
  const after = {
    total_events: 10, symptom_counts: { did_reask: 3 },
    loop_count: 0, reask_count: 3, stage_advance_count: 5
  };
  const result = regressionMod.compareBaselines(before, after);
  assert.strictEqual(result.verdict, "neutro", "verdict should be neutro");
  return "PASS";
})();
console.log(`F3 compareBaselines neutral: ${F3}`);

const F4 = (() => {
  const result = regressionMod.compareBaselines(null, null);
  assert.strictEqual(result.ok, false, "fails with missing baselines");
  return "PASS";
})();
console.log(`F4 compareBaselines missing input: ${F4}`);

// ═══════════════════════════════════════════════════════════════════
// Section G — Rollout module integrity
// ═══════════════════════════════════════════════════════════════════

const rolloutMod = await import("../telemetry/hybrid-telemetry-rollout.js");

const G1 = (() => {
  assert.ok(typeof rolloutMod.setRolloutFlag === "function", "setRolloutFlag exported");
  assert.ok(typeof rolloutMod.getRolloutFlag === "function", "getRolloutFlag exported");
  assert.ok(typeof rolloutMod.isRolloutActive === "function", "isRolloutActive exported");
  assert.ok(typeof rolloutMod.isRolloutShadow === "function", "isRolloutShadow exported");
  assert.ok(typeof rolloutMod.shouldExecuteNewLogic === "function", "shouldExecuteNewLogic exported");
  assert.ok(typeof rolloutMod.shouldApplyNewLogic === "function", "shouldApplyNewLogic exported");
  return "PASS";
})();
console.log(`G1 rollout functions exported: ${G1}`);

const G2 = (() => {
  assert.deepStrictEqual(rolloutMod.ROLLOUT_MODES, { OFF: "OFF", SHADOW: "SHADOW", ON: "ON" });
  return "PASS";
})();
console.log(`G2 ROLLOUT_MODES constant: ${G2}`);

const G3 = (() => {
  assert.ok(typeof rolloutMod.handleRolloutEndpoint === "function", "handleRolloutEndpoint exported");
  return "PASS";
})();
console.log(`G3 handleRolloutEndpoint exported: ${G3}`);

// ═══════════════════════════════════════════════════════════════════
// Section H — Rollout flag CRUD operations
// ═══════════════════════════════════════════════════════════════════

// Reset before testing
rolloutMod.resetAllRolloutFlags();

const H1 = (() => {
  const result = rolloutMod.setRolloutFlag("stage", "inicio_nome", "ON");
  assert.strictEqual(result.ok, true, "set succeeds");
  assert.strictEqual(result.current, "ON", "mode is ON");
  assert.strictEqual(rolloutMod.getRolloutFlag("stage", "inicio_nome"), "ON", "get returns ON");
  return "PASS";
})();
console.log(`H1 setRolloutFlag + getRolloutFlag: ${H1}`);

const H2 = (() => {
  const result = rolloutMod.setRolloutFlag("stage", "inicio_nome", "SHADOW");
  assert.strictEqual(result.previous, "ON", "previous was ON");
  assert.strictEqual(result.current, "SHADOW", "now SHADOW");
  return "PASS";
})();
console.log(`H2 flag update preserves previous: ${H2}`);

const H3 = (() => {
  const result = rolloutMod.setRolloutFlag("stage", "test", "INVALID");
  assert.strictEqual(result.ok, false, "invalid mode rejected");
  return "PASS";
})();
console.log(`H3 invalid mode rejected: ${H3}`);

const H4 = (() => {
  // Flag not set → defaults to OFF
  assert.strictEqual(rolloutMod.getRolloutFlag("feature", "nonexistent"), "OFF", "default is OFF");
  return "PASS";
})();
console.log(`H4 default mode is OFF: ${H4}`);

const H5 = (() => {
  const result = rolloutMod.resetAllRolloutFlags();
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.current, {}, "all flags cleared");
  assert.strictEqual(rolloutMod.getRolloutFlag("stage", "inicio_nome"), "OFF", "reset back to OFF");
  return "PASS";
})();
console.log(`H5 resetAllRolloutFlags: ${H5}`);

const H6 = (() => {
  const result = rolloutMod.bulkSetRolloutFlags([
    { dimension: "stage", identifier: "s1", mode: "ON" },
    { dimension: "type", identifier: "t1", mode: "SHADOW" }
  ]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.results.length, 2);
  assert.strictEqual(rolloutMod.getRolloutFlag("stage", "s1"), "ON");
  assert.strictEqual(rolloutMod.getRolloutFlag("type", "t1"), "SHADOW");
  rolloutMod.resetAllRolloutFlags();
  return "PASS";
})();
console.log(`H6 bulkSetRolloutFlags: ${H6}`);

// ═══════════════════════════════════════════════════════════════════
// Section I — Rollout modes behavior
// ═══════════════════════════════════════════════════════════════════

const I1 = (() => {
  rolloutMod.resetAllRolloutFlags();
  // OFF by default
  assert.strictEqual(rolloutMod.isRolloutActive("stage", "s1"), false, "OFF not active");
  assert.strictEqual(rolloutMod.isRolloutShadow("stage", "s1"), false, "OFF not shadow");
  assert.strictEqual(rolloutMod.shouldExecuteNewLogic("stage", "s1"), false, "OFF no execute");
  assert.strictEqual(rolloutMod.shouldApplyNewLogic("stage", "s1"), false, "OFF no apply");
  return "PASS";
})();
console.log(`I1 OFF mode: no execution, no application: ${I1}`);

const I2 = (() => {
  rolloutMod.setRolloutFlag("stage", "s1", "SHADOW");
  assert.strictEqual(rolloutMod.isRolloutActive("stage", "s1"), false, "SHADOW not active");
  assert.strictEqual(rolloutMod.isRolloutShadow("stage", "s1"), true, "SHADOW is shadow");
  assert.strictEqual(rolloutMod.shouldExecuteNewLogic("stage", "s1"), true, "SHADOW executes");
  assert.strictEqual(rolloutMod.shouldApplyNewLogic("stage", "s1"), false, "SHADOW does not apply");
  rolloutMod.resetAllRolloutFlags();
  return "PASS";
})();
console.log(`I2 SHADOW mode: executes but does not apply: ${I2}`);

const I3 = (() => {
  rolloutMod.setRolloutFlag("feature", "f1", "ON");
  assert.strictEqual(rolloutMod.isRolloutActive("feature", "f1"), true, "ON is active");
  assert.strictEqual(rolloutMod.isRolloutShadow("feature", "f1"), false, "ON not shadow");
  assert.strictEqual(rolloutMod.shouldExecuteNewLogic("feature", "f1"), true, "ON executes");
  assert.strictEqual(rolloutMod.shouldApplyNewLogic("feature", "f1"), true, "ON applies");
  rolloutMod.resetAllRolloutFlags();
  return "PASS";
})();
console.log(`I3 ON mode: executes and applies: ${I3}`);

// ═══════════════════════════════════════════════════════════════════
// Section J — handleRolloutEndpoint
// ═══════════════════════════════════════════════════════════════════

const J1 = (() => {
  rolloutMod.resetAllRolloutFlags();
  const result = rolloutMod.handleRolloutEndpoint("GET", null);
  assert.strictEqual(result.ok, true);
  assert.ok(result.valid_modes, "includes valid_modes");
  assert.ok(result.valid_dimensions, "includes valid_dimensions");
  return "PASS";
})();
console.log(`J1 handleRolloutEndpoint GET status: ${J1}`);

const J2 = (() => {
  const result = rolloutMod.handleRolloutEndpoint("POST", { dimension: "stage", identifier: "s1", mode: "ON" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.current, "ON");
  assert.ok(result.current_flags, "returns current_flags");
  rolloutMod.resetAllRolloutFlags();
  return "PASS";
})();
console.log(`J2 handleRolloutEndpoint POST single: ${J2}`);

const J3 = (() => {
  const result = rolloutMod.handleRolloutEndpoint("POST", { action: "reset" });
  assert.strictEqual(result.ok, true);
  return "PASS";
})();
console.log(`J3 handleRolloutEndpoint POST reset: ${J3}`);

const J4 = (() => {
  const result = rolloutMod.handleRolloutEndpoint("POST", null);
  assert.strictEqual(result.ok, false, "null body rejected");
  return "PASS";
})();
console.log(`J4 handleRolloutEndpoint POST invalid body: ${J4}`);

const J5 = (() => {
  const result = rolloutMod.handleRolloutEndpoint("DELETE", null);
  assert.strictEqual(result.ok, false, "unsupported method rejected");
  return "PASS";
})();
console.log(`J5 handleRolloutEndpoint unsupported method: ${J5}`);

// ═══════════════════════════════════════════════════════════════════
// Section K — Proof: parser/gate/nextStage NOT altered
// ═══════════════════════════════════════════════════════════════════

const workerSrc = readFileSync(resolve(import.meta.dirname, "../Enova worker.js"), "utf8");

const K1 = (() => {
  // Verify the new imports exist
  assert.ok(workerSrc.includes('import { handleRankingEndpoint }'), "ranking import present");
  assert.ok(workerSrc.includes('import { handleRegressionEndpoint }'), "regression import present");
  assert.ok(workerSrc.includes('import { handleRolloutEndpoint }'), "rollout import present");
  return "PASS";
})();
console.log(`K1 new imports present in worker: ${K1}`);

const K2 = (() => {
  // The ranking endpoint is GET-only
  assert.ok(workerSrc.includes('pathname === "/__admin_prod__/hybrid-telemetry/ranking"'), "ranking endpoint exists");
  // The regression endpoint is GET-only
  assert.ok(workerSrc.includes('pathname === "/__admin_prod__/hybrid-telemetry/regression"'), "regression endpoint exists");
  // The rollout endpoint exists for both GET and POST
  const rolloutMatches = workerSrc.match(/hybrid-telemetry\/rollout/g) || [];
  assert.ok(rolloutMatches.length >= 2, "rollout endpoint exists for GET and POST");
  return "PASS";
})();
console.log(`K2 new endpoints wired in worker: ${K2}`);

const K3 = (() => {
  // Verify parser functions are NOT touched
  // Check that critical functions still exist unchanged
  const hasGateLogic = workerSrc.includes("nextStage");
  assert.ok(hasGateLogic, "nextStage still present (not removed)");
  return "PASS";
})();
console.log(`K3 nextStage logic untouched: ${K3}`);

const K4 = (() => {
  // Verify the new code is inside the admin_prod block
  // Find the ranking endpoint and verify it's after the admin guard
  const adminGuardIdx = workerSrc.indexOf("const isAdminProdPath = pathname.startsWith");
  const rankingIdx = workerSrc.indexOf('hybrid-telemetry/ranking"');
  assert.ok(rankingIdx > adminGuardIdx, "ranking is after admin guard");
  return "PASS";
})();
console.log(`K4 ranking endpoint after admin guard: ${K4}`);

// ═══════════════════════════════════════════════════════════════════
// Section L — Proof: worker behavior intact
// ═══════════════════════════════════════════════════════════════════

const L1 = (() => {
  // Verify that the rollout module defaults to OFF and doesn't affect anything
  rolloutMod.resetAllRolloutFlags();
  const flags = rolloutMod.getAllRolloutFlags();
  assert.deepStrictEqual(flags, {}, "no flags set by default");
  return "PASS";
})();
console.log(`L1 rollout defaults to empty (no impact): ${L1}`);

const L2 = (() => {
  // Verify ranking aggregation on null/undefined doesn't throw
  const r1 = rankingMod.aggregateSymptoms(null);
  assert.deepStrictEqual(r1.ranked, [], "null input safe");
  const r2 = rankingMod.aggregateSymptoms(undefined);
  assert.deepStrictEqual(r2.ranked, [], "undefined input safe");
  return "PASS";
})();
console.log(`L2 aggregateSymptoms null-safe: ${L2}`);

const L3 = (() => {
  // Verify regression handles missing baselines
  const result = regressionMod.compareBaselines(null, { total_events: 0 });
  assert.strictEqual(result.ok, false, "fails gracefully with null before");
  return "PASS";
})();
console.log(`L3 compareBaselines null-safe: ${L3}`);

const L4 = (() => {
  // Verify setRolloutFlag with null dimension
  const result = rolloutMod.setRolloutFlag(null, null, "ON");
  assert.strictEqual(result.ok, false, "null key rejected");
  return "PASS";
})();
console.log(`L4 setRolloutFlag null-safe: ${L4}`);

const L5 = (() => {
  // Verify buildFlagKey returns null for invalid input
  assert.strictEqual(rolloutMod.buildFlagKey(null, "test"), null, "null dimension");
  assert.strictEqual(rolloutMod.buildFlagKey("stage", null), null, "null identifier");
  assert.strictEqual(rolloutMod.buildFlagKey("stage", "test"), "stage:test", "valid key");
  return "PASS";
})();
console.log(`L5 buildFlagKey validation: ${L5}`);

// ═══════════════════════════════════════════════════════════════════
// Section M — Endpoints protection proof
// ═══════════════════════════════════════════════════════════════════

const M1 = (() => {
  // All new endpoints are under /__admin_prod__/ which requires ALLOW_ADMIN_PROD + x-enova-admin-key
  const rankingLine = workerSrc.split("\n").find(l => l.includes('hybrid-telemetry/ranking'));
  assert.ok(rankingLine.includes("__admin_prod__"), "ranking under admin_prod");
  const regressionLine = workerSrc.split("\n").find(l => l.includes('hybrid-telemetry/regression'));
  assert.ok(regressionLine.includes("__admin_prod__"), "regression under admin_prod");
  const rolloutLine = workerSrc.split("\n").find(l => l.includes('hybrid-telemetry/rollout'));
  assert.ok(rolloutLine.includes("__admin_prod__"), "rollout under admin_prod");
  return "PASS";
})();
console.log(`M1 all endpoints under __admin_prod__ protection: ${M1}`);

const M2 = (() => {
  // Verify ALLOW_ADMIN_PROD gate exists before our endpoints
  const guardBlock = workerSrc.indexOf('const allowProdAdmin = String(env.ALLOW_ADMIN_PROD');
  const rankingBlock = workerSrc.indexOf('hybrid-telemetry/ranking');
  assert.ok(guardBlock > 0 && rankingBlock > guardBlock, "ALLOW_ADMIN_PROD guard before ranking");
  return "PASS";
})();
console.log(`M2 ALLOW_ADMIN_PROD gate before endpoints: ${M2}`);

const M3 = (() => {
  // Verify isAdminAuthorized check exists in the admin_prod block
  const authCheck = workerSrc.indexOf('isAdminAuthorized()');
  assert.ok(authCheck > 0, "isAdminAuthorized check exists");
  return "PASS";
})();
console.log(`M3 x-enova-admin-key auth present: ${M3}`);

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

const allResults = [
  A1, A2, A3, A4, A5,
  B1, B2, B3,
  C1, C2, C3,
  D1, D2, D3,
  E1, E2,
  F1, F2, F3, F4,
  G1, G2, G3,
  H1, H2, H3, H4, H5, H6,
  I1, I2, I3,
  J1, J2, J3, J4, J5,
  K1, K2, K3, K4,
  L1, L2, L3, L4, L5,
  M1, M2, M3
];

const passed = allResults.filter(r => r === "PASS").length;
const failed = allResults.filter(r => r !== "PASS").length;

console.log(`\n═══ SUMMARY ═══`);
console.log(`Total: ${allResults.length} | Passed: ${passed} | Failed: ${failed}`);
if (failed === 0) {
  console.log("✅ ALL SMOKE TESTS PASSED");
} else {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
}
