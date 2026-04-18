/**
 * cognitive_stage_contract_pr1.smoke.mjs
 *
 * Smoke tests for PR1 — Contrato Cognitivo-Mecânico v1.
 *
 * Validates:
 *   A) buildStageContract exists and produces correct shape
 *   B) Contract is built for topo stages (inicio_programa)
 *   C) Contract is built for renda stage
 *   D) Contract is built for sim/não stage (ir_declarado)
 *   E) Contract does NOT alter mechanical advance
 *   F) Telemetry summary shows principal fields
 *   G) Safety: parser/nextStage/gates/persistence untouched
 *   H) forbidden_topics_now is plugged into buildCognitiveInput
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load cognitive-contract.js functions directly ──
const contractPath = resolve(__dirname, "..", "cognitive", "src", "cognitive-contract.js");
const {
  buildStageContract,
  buildStageContractTelemetrySummary,
  buildCognitiveInput,
  getStageGoal,
  getAllowedSignalsForStage,
  validateSignal,
  adaptLegacyToCanonical,
  buildSeparationTelemetry
} = await import(contractPath);

// ── Load worker source for structural assertions ──
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`❌ ${name}: ${e.message}`);
  }
}

console.log("\n══════════════════════════════════════════════════════════");
console.log("  SMOKE: PR1 — Contrato Cognitivo-Mecânico v1");
console.log("══════════════════════════════════════════════════════════\n");

// ══════════════════════════════════════════════════════════
// SECTION A — buildStageContract exists and produces correct shape
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION A: buildStageContract shape ──");

test("A1: buildStageContract is exported and is a function", () => {
  assert.equal(typeof buildStageContract, "function");
});

test("A2: buildStageContract returns frozen object with all required fields", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.ok(Object.isFrozen(contract), "contract must be frozen");
  // Required fields per spec
  assert.ok("stage_current" in contract);
  assert.ok("stage_goal" in contract);
  assert.ok("canonical_prompt" in contract);
  assert.ok("expected_slot" in contract);
  assert.ok("allowed_topics_now" in contract);
  assert.ok("forbidden_topics_now" in contract);
  assert.ok("stage_micro_rules" in contract);
  assert.ok("brief_answer_allowed" in contract);
  assert.ok("return_to_stage_prompt" in contract);
  assert.ok("fallback_prompt" in contract);
  assert.ok("mechanical_source_of_truth" in contract);
});

test("A3: mechanical_source_of_truth is always true", () => {
  const c1 = buildStageContract({ stage: "inicio_programa" });
  const c2 = buildStageContract({ stage: "renda" });
  const c3 = buildStageContract({ stage: "unknown_stage_xyz" });
  assert.equal(c1.mechanical_source_of_truth, true);
  assert.equal(c2.mechanical_source_of_truth, true);
  assert.equal(c3.mechanical_source_of_truth, true);
});

test("A4: contract_version is present", () => {
  const contract = buildStageContract({ stage: "estado_civil" });
  assert.ok(contract.contract_version, "contract_version must be present");
  assert.equal(typeof contract.contract_version, "string");
});

test("A5: unknown stage returns valid contract with defaults", () => {
  const contract = buildStageContract({ stage: "stage_futuro_abc" });
  assert.equal(contract.stage_current, "stage_futuro_abc");
  assert.ok(contract.stage_goal.length > 0, "goal should have a default");
  assert.equal(contract.mechanical_source_of_truth, true);
  assert.deepEqual(contract.allowed_topics_now, []);
  assert.deepEqual(contract.forbidden_topics_now, []);
});

// ══════════════════════════════════════════════════════════
// SECTION B — Contract for topo stage (inicio_programa)
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION B: Topo contract (inicio_programa) ──");

test("B1: inicio_programa contract has correct stage_current", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.equal(contract.stage_current, "inicio_programa");
});

test("B2: inicio_programa has forbidden_topics that prevent premature data collection", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.ok(contract.forbidden_topics_now.length > 0, "should have forbidden topics");
  assert.ok(contract.forbidden_topics_now.includes("coleta_nome"), "should forbid coleta_nome");
  assert.ok(contract.forbidden_topics_now.includes("coleta_renda"), "should forbid coleta_renda");
});

test("B3: inicio_programa expected_slot is null (not collecting data)", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.equal(contract.expected_slot, null);
});

test("B4: inicio_programa canonical_prompt contains program presentation", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.ok(contract.canonical_prompt.length > 20, "canonical_prompt must be meaningful");
});

test("B5: inicio_programa with bucket overrides goal", () => {
  const c1 = buildStageContract({ stage: "inicio_programa", bucket: "greeting" });
  const c2 = buildStageContract({ stage: "inicio_programa", bucket: null });
  // Bucket-specific goal should be different from generic
  assert.notEqual(c1.stage_goal, c2.stage_goal, "greeting bucket should have different goal");
});

test("B6: inicio_programa stage_micro_rules are present", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.ok(contract.stage_micro_rules.length > 0, "micro rules must be present for topo");
});

// ══════════════════════════════════════════════════════════
// SECTION C — Contract for renda stage
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION C: Renda contract ──");

test("C1: renda contract has expected_slot = 'renda'", () => {
  const contract = buildStageContract({ stage: "renda" });
  assert.equal(contract.expected_slot, "renda");
});

test("C2: renda contract has forbidden topics (no docs, no approval)", () => {
  const contract = buildStageContract({ stage: "renda" });
  assert.ok(contract.forbidden_topics_now.includes("coleta_documentos"), "forbids docs");
  assert.ok(contract.forbidden_topics_now.includes("aprovacao"), "forbids approval");
});

test("C3: renda has micro_rules about not promising approval", () => {
  const contract = buildStageContract({ stage: "renda" });
  const hasNoPromise = contract.stage_micro_rules.some(r => /não prometer|NÃO prometer/i.test(r));
  assert.ok(hasNoPromise, "renda micro rules must include no-promise rule");
});

test("C4: renda brief_answer_allowed is false", () => {
  const contract = buildStageContract({ stage: "renda" });
  assert.equal(contract.brief_answer_allowed, false, "renda requires value, not brief answer");
});

// ══════════════════════════════════════════════════════════
// SECTION D — Contract for sim/não stage (ir_declarado)
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION D: Sim/não contract (ir_declarado) ──");

test("D1: ir_declarado contract has expected_slot = 'ir_declarado'", () => {
  const contract = buildStageContract({ stage: "ir_declarado" });
  assert.equal(contract.expected_slot, "ir_declarado");
});

test("D2: ir_declarado brief_answer_allowed is true", () => {
  const contract = buildStageContract({ stage: "ir_declarado" });
  assert.equal(contract.brief_answer_allowed, true, "ir_declarado accepts sim/não");
});

test("D3: ir_declarado has canonical_prompt about IR", () => {
  const contract = buildStageContract({ stage: "ir_declarado" });
  assert.ok(/imposto|ir|renda/i.test(contract.canonical_prompt), "prompt must reference IR");
});

test("D4: dependente also accepts brief answer", () => {
  const contract = buildStageContract({ stage: "dependente" });
  assert.equal(contract.brief_answer_allowed, true);
  assert.equal(contract.expected_slot, "dependente");
});

// ══════════════════════════════════════════════════════════
// SECTION E — Contract does NOT alter mechanical advance
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION E: No mechanical alteration ──");

test("E1: buildStageContract does not modify state", () => {
  const st = { fase_conversa: "renda", renda: null, wa_id: "5511999" };
  const before = JSON.stringify(st);
  buildStageContract({ stage: "renda", state: st });
  const after = JSON.stringify(st);
  assert.equal(before, after, "state must not be modified by buildStageContract");
});

test("E2: contract is frozen (immutable)", () => {
  const contract = buildStageContract({ stage: "estado_civil" });
  assert.ok(Object.isFrozen(contract));
  assert.throws(() => { contract.stage_current = "hacked"; }, "frozen must throw on mutation");
});

test("E3: allowed_signals matches existing ALLOWED_SIGNAL_PREFIXES", () => {
  const contract = buildStageContract({ stage: "estado_civil" });
  const existing = getAllowedSignalsForStage("estado_civil");
  assert.deepEqual(contract.allowed_signals, existing, "allowed_signals must match existing");
});

// ══════════════════════════════════════════════════════════
// SECTION F — Telemetry summary
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION F: Telemetry summary ──");

test("F1: buildStageContractTelemetrySummary returns compact object", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  const summary = buildStageContractTelemetrySummary(contract);
  assert.equal(summary.contract_stage, "inicio_programa");
  assert.equal(summary.contract_expected_slot, null);
  assert.equal(summary.contract_has_forbidden_topics, true);
  assert.equal(summary.contract_brief_answer_allowed, false);
  assert.equal(summary.contract_has_micro_rules, true);
  assert.equal(summary.mechanical_source_of_truth, true);
  assert.equal(summary.contract_valid, true);
});

test("F2: telemetry summary for renda shows expected_slot", () => {
  const contract = buildStageContract({ stage: "renda" });
  const summary = buildStageContractTelemetrySummary(contract);
  assert.equal(summary.contract_stage, "renda");
  assert.equal(summary.contract_expected_slot, "renda");
  assert.equal(summary.contract_valid, true);
});

test("F3: telemetry summary for null contract is safe", () => {
  const summary = buildStageContractTelemetrySummary(null);
  assert.equal(summary.contract_valid, false);
  assert.equal(summary.contract_stage, null);
});

test("F4: telemetry summary for ir_declarado shows brief_answer_allowed", () => {
  const contract = buildStageContract({ stage: "ir_declarado" });
  const summary = buildStageContractTelemetrySummary(contract);
  assert.equal(summary.contract_brief_answer_allowed, true);
});

// ══════════════════════════════════════════════════════════
// SECTION G — Safety: parser/nextStage/gates/persistence untouched
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION G: Safety checks ──");

test("G1: buildStageContract does NOT call upsertState", () => {
  // Search cognitive-contract.js source
  const contractSrc = readFileSync(contractPath, "utf-8");
  assert.ok(!contractSrc.includes("upsertState"), "cognitive-contract must not call upsertState");
});

test("G2: buildStageContract does NOT reference nextStage decision", () => {
  const contractSrc = readFileSync(contractPath, "utf-8");
  // Should not contain nextStage assignment logic
  assert.ok(!contractSrc.includes("fase_conversa ="), "contract must not assign fase_conversa");
});

test("G3: worker still has parseAnswerForStage / extractCompatibleStageAnswerFromCognitive", () => {
  assert.ok(workerSrc.includes("parseAnswerForStage") || workerSrc.includes("extractCompatibleStageAnswer"),
    "parser functions must still exist in worker");
});

test("G4: worker __stage_contract is cleaned in step() transient flags", () => {
  assert.ok(workerSrc.includes("st.__stage_contract = null"),
    "__stage_contract must be cleaned in step() transient flags section");
});

test("G5: buildStageContract is called inside runCognitiveV2WithAdapter", () => {
  assert.ok(workerSrc.includes("buildStageContract({"),
    "buildStageContract must be called in runCognitiveV2WithAdapter");
});

test("G6: stage_contract_telemetry is emitted in step()", () => {
  assert.ok(workerSrc.includes("stage_contract_telemetry"),
    "stage_contract_telemetry log must be present in step()");
});

test("G7: forbidden_topics_now is used in buildCognitiveInput call", () => {
  // The forbidden topics from the contract should be passed to buildCognitiveInput
  assert.ok(workerSrc.includes("forbidden_topics_for_stage: stageContract.forbidden_topics_now"),
    "forbidden_topics_now from contract must be passed to buildCognitiveInput");
});

// ══════════════════════════════════════════════════════════
// SECTION H — Coverage of priority stages
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION H: Priority stages coverage ──");

const PRIORITY_STAGES = [
  "inicio_programa",
  "inicio_nome",
  "inicio_nacionalidade",
  "estado_civil",
  "somar_renda_solteiro",
  "regime_trabalho",
  "renda",
  "ir_declarado",
  "dependente",
  "restricao",
  "envio_docs"
];

for (const stage of PRIORITY_STAGES) {
  test(`H: ${stage} — contract has metadata (non-empty micro_rules)`, () => {
    const contract = buildStageContract({ stage });
    assert.ok(contract.stage_micro_rules.length > 0,
      `${stage} must have micro rules defined`);
    assert.ok(contract.canonical_prompt.length > 10,
      `${stage} must have meaningful canonical_prompt`);
    assert.ok(contract.forbidden_topics_now.length > 0,
      `${stage} must have at least one forbidden topic`);
  });
}

// ══════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════

console.log("\n══════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
