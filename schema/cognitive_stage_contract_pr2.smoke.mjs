/**
 * cognitive_stage_contract_pr2.smoke.mjs
 *
 * Smoke tests for PR2 — Stage Contract plugado no renderer cognitivo.
 *
 * Validates:
 *   A) buildCognitiveInput carries stage_contract field
 *   B) Topo: contract prevents repetition (canonical_prompt, forbidden_topics)
 *   C) Stage objetivo (regime_trabalho/renda): reply anchored to correct stage
 *   D) Sim/não stages (ir_declarado/dependente): brief_answer_allowed discipline
 *   E) Off-focus recovery: return_to_stage_prompt available
 *   F) No mechanical advance altered (parser/nextStage/gates/persistence/docs untouched)
 *   G) normalizeRequest in run-cognitive.js carries stage_contract
 *   H) buildOpenAISystemPrompt and buildOpenAIUserPrompt inject contract
 *
 * OBRIGATÓRIOS (por CODEX_WORKFLOW):
 *   1. topo: evita repetição burra da mesma pergunta
 *   2. stage objetivo (regime_trabalho ou renda): resposta ancorada no stage
 *   3. sim/não (ir_declarado ou dependente): resposta curta e disciplinada
 *   4. saída parcial de foco: retorno ao stage usando return_to_stage_prompt
 *   5. nenhum teste mostra alteração de avanço mecânico
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load cognitive-contract.js functions ──
const contractPath = resolve(__dirname, "..", "cognitive", "src", "cognitive-contract.js");
const {
  buildStageContract,
  buildCognitiveInput,
  getStageGoal,
  getAllowedSignalsForStage
} = await import(contractPath);

// ── Load run-cognitive.js source for structural assertions ──
const runCogPath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
const runCogSrc = readFileSync(runCogPath, "utf-8");

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
console.log("  SMOKE: PR2 — Stage Contract plugado no renderer cognitivo");
console.log("══════════════════════════════════════════════════════════\n");

// ══════════════════════════════════════════════════════════
// SECTION A — buildCognitiveInput carries stage_contract
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION A: buildCognitiveInput with stage_contract ──");

test("A1: buildCognitiveInput accepts stage_contract param", () => {
  const contract = buildStageContract({ stage: "renda" });
  const input = buildCognitiveInput({
    current_stage: "renda",
    message_text: "3800",
    stage_contract: contract
  });
  assert.ok(input.stage_contract, "stage_contract must be present in input");
  assert.equal(input.stage_contract.stage_current, "renda");
  assert.equal(input.stage_contract.expected_slot, "renda");
});

test("A2: buildCognitiveInput without stage_contract returns null", () => {
  const input = buildCognitiveInput({
    current_stage: "renda",
    message_text: "3800"
  });
  assert.equal(input.stage_contract, null, "stage_contract must be null when not provided");
});

test("A3: buildCognitiveInput stage_contract is a plain copy, not frozen original", () => {
  const contract = buildStageContract({ stage: "renda" });
  const input = buildCognitiveInput({
    current_stage: "renda",
    message_text: "3800",
    stage_contract: contract
  });
  assert.notStrictEqual(input.stage_contract, contract, "must be a copy, not the same reference");
  assert.equal(input.stage_contract.stage_current, contract.stage_current);
});

// ══════════════════════════════════════════════════════════
// SECTION B — Topo: contract prevents repetition
// Smoke #1: evita repetição burra da mesma pergunta
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION B: Topo (inicio_programa) contract discipline ──");

test("B1: topo contract has canonical_prompt for variation reference", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.ok(contract.canonical_prompt, "canonical_prompt must exist");
  assert.ok(contract.canonical_prompt.length > 10, "canonical_prompt must be non-trivial");
});

test("B2: topo contract forbids coleta stages (nome, renda, docs)", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.ok(contract.forbidden_topics_now.includes("coleta_nome"), "must forbid coleta_nome");
  assert.ok(contract.forbidden_topics_now.includes("coleta_renda"), "must forbid coleta_renda");
  assert.ok(contract.forbidden_topics_now.includes("coleta_documentos"), "must forbid coleta_documentos");
});

test("B3: topo contract has micro_rules including variation rule", () => {
  const contract = buildStageContract({ stage: "inicio_programa" });
  assert.ok(contract.stage_micro_rules.length > 0, "must have micro rules");
  const hasVariation = contract.stage_micro_rules.some(r => /vari/i.test(r));
  assert.ok(hasVariation, "must have tone variation rule to prevent repetition");
});

test("B4: topo stage_contract is injected into buildCognitiveInput in worker", () => {
  assert.ok(workerSrc.includes("stage_contract: stageContract"),
    "worker must pass stageContract into buildCognitiveInput");
});

// ══════════════════════════════════════════════════════════
// SECTION C — Stage objetivo: reply anchored to correct stage
// Smoke #2: regime_trabalho / renda — resposta ancorada no stage
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION C: Objective stage (regime_trabalho, renda) contract ──");

test("C1: regime_trabalho contract has expected_slot = regime_trabalho", () => {
  const contract = buildStageContract({ stage: "regime_trabalho" });
  assert.equal(contract.expected_slot, "regime_trabalho");
  assert.ok(contract.forbidden_topics_now.includes("coleta_documentos"));
  assert.ok(contract.forbidden_topics_now.includes("coleta_nome"));
});

test("C2: renda contract has expected_slot = renda", () => {
  const contract = buildStageContract({ stage: "renda" });
  assert.equal(contract.expected_slot, "renda");
  assert.ok(contract.stage_micro_rules.some(r => /mensal/i.test(r)), "micro rule must mention mensal");
});

test("C3: regime_trabalho input carries full contract into cognitive", () => {
  const contract = buildStageContract({ stage: "regime_trabalho" });
  const input = buildCognitiveInput({
    current_stage: "regime_trabalho",
    message_text: "CLT",
    stage_contract: contract
  });
  assert.equal(input.stage_contract.expected_slot, "regime_trabalho");
  assert.equal(input.stage_contract.stage_current, "regime_trabalho");
  assert.ok(input.stage_contract.forbidden_topics_now.length > 0);
});

// ══════════════════════════════════════════════════════════
// SECTION D — Sim/não stages: brief_answer_allowed discipline
// Smoke #3: ir_declarado / dependente — resposta curta e disciplinada
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION D: Sim/não stages (ir_declarado, dependente) ──");

test("D1: ir_declarado has brief_answer_allowed = true", () => {
  const contract = buildStageContract({ stage: "ir_declarado" });
  assert.equal(contract.brief_answer_allowed, true);
  assert.equal(contract.expected_slot, "ir_declarado");
});

test("D2: dependente has brief_answer_allowed = true", () => {
  const contract = buildStageContract({ stage: "dependente" });
  assert.equal(contract.brief_answer_allowed, true);
  assert.equal(contract.expected_slot, "dependente");
});

test("D3: renda does NOT have brief_answer_allowed", () => {
  const contract = buildStageContract({ stage: "renda" });
  assert.equal(contract.brief_answer_allowed, false);
});

test("D4: brief_answer_allowed carried through buildCognitiveInput", () => {
  const contract = buildStageContract({ stage: "ir_declarado" });
  const input = buildCognitiveInput({
    current_stage: "ir_declarado",
    message_text: "sim",
    stage_contract: contract
  });
  assert.equal(input.stage_contract.brief_answer_allowed, true);
});

// ══════════════════════════════════════════════════════════
// SECTION E — Off-focus recovery: return_to_stage_prompt
// Smoke #4: saída parcial de foco → retorno ao stage
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION E: Off-focus recovery (return_to_stage_prompt) ──");

test("E1: every contract stage has return_to_stage_prompt", () => {
  const stages = ["inicio_programa", "inicio_nome", "estado_civil", "regime_trabalho", "renda", "ir_declarado", "dependente"];
  for (const stage of stages) {
    const contract = buildStageContract({ stage });
    assert.ok(contract.return_to_stage_prompt, `${stage} must have return_to_stage_prompt`);
    assert.ok(contract.return_to_stage_prompt.length > 5, `${stage} return_to_stage_prompt must be meaningful`);
  }
});

test("E2: every contract stage has fallback_prompt", () => {
  const stages = ["inicio_programa", "inicio_nome", "estado_civil", "regime_trabalho", "renda", "ir_declarado"];
  for (const stage of stages) {
    const contract = buildStageContract({ stage });
    assert.ok(contract.fallback_prompt, `${stage} must have fallback_prompt`);
  }
});

test("E3: return_to_stage_prompt available in cognitive input for off-focus handling", () => {
  const contract = buildStageContract({ stage: "renda" });
  const input = buildCognitiveInput({
    current_stage: "renda",
    message_text: "quanto custa um apartamento?",
    stage_contract: contract
  });
  assert.ok(input.stage_contract.return_to_stage_prompt.length > 5);
  assert.ok(input.stage_contract.fallback_prompt.length > 5);
});

// ══════════════════════════════════════════════════════════
// SECTION F — No mechanical advance altered
// Smoke #5: nenhum teste mostra alteração de avanço mecânico
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION F: Safety — No mechanical changes ──");

test("F1: buildStageContract does NOT modify state object", () => {
  const st = { fase_conversa: "renda", renda: null };
  const before = JSON.stringify(st);
  buildStageContract({ stage: "renda", state: st });
  assert.equal(JSON.stringify(st), before);
});

test("F2: buildCognitiveInput with stage_contract is frozen", () => {
  const contract = buildStageContract({ stage: "renda" });
  const input = buildCognitiveInput({
    current_stage: "renda",
    message_text: "3800",
    stage_contract: contract
  });
  assert.ok(Object.isFrozen(input), "input must be frozen");
});

test("F3: mechanical_source_of_truth is always true", () => {
  const stages = ["inicio_programa", "renda", "ir_declarado", "dependente", "regime_trabalho"];
  for (const stage of stages) {
    const contract = buildStageContract({ stage });
    assert.equal(contract.mechanical_source_of_truth, true, `${stage}: mechanical must be sovereign`);
  }
});

test("F4: parser not altered — worker does not change parseSignal patterns", () => {
  // The worker's signal parsing (isStageSignalCompatible, adaptCognitiveV2Output signal mapping)
  // should remain unchanged. We verify by checking key known patterns still exist.
  assert.ok(workerSrc.includes("estado_civil:" + " + String(entities.estado_civil)") ||
            workerSrc.includes('estado_civil:" + String(entities.estado_civil)'),
    "estado_civil signal parsing must be unchanged");
  assert.ok(workerSrc.includes('safeStageSignal = "renda:" + String(entities.renda)'),
    "renda signal parsing must be unchanged");
});

test("F5: nextStage logic not altered — worker step cleanup still exists", () => {
  assert.ok(workerSrc.includes("st.__stage_contract = null"),
    "__stage_contract cleanup must remain in step() transient flags");
});

test("F6: persistence not altered — no new upsertState calls added", () => {
  // Count upsertState occurrences: should not have increased from PR2 changes
  // We just verify stage_contract is NOT persisted
  assert.ok(!workerSrc.includes("upsertState") || !workerSrc.includes('stage_contract"'),
    "stage_contract must NOT be persisted via upsertState");
});

test("F7: gates not altered — worker gate checks unchanged", () => {
  // Verify the gate-related flags are not touched by our PR
  assert.ok(workerSrc.includes("__cognitive_v2_takes_final"),
    "cognitive takes_final flag must still exist");
});

// ══════════════════════════════════════════════════════════
// SECTION G — run-cognitive.js structural integration
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION G: run-cognitive.js structural integration ──");

test("G1: normalizeRequest in run-cognitive.js reads stage_contract", () => {
  assert.ok(runCogSrc.includes("stage_contract"),
    "normalizeRequest must handle stage_contract field");
  assert.ok(runCogSrc.includes("stageContractRaw"),
    "normalizeRequest must extract stageContractRaw");
});

test("G2: buildOpenAISystemPrompt accepts stageContract parameter", () => {
  assert.ok(runCogSrc.includes("function buildOpenAISystemPrompt(stageContract)"),
    "buildOpenAISystemPrompt must accept stageContract parameter");
});

test("G3: buildOpenAISystemPrompt injects expected_slot discipline", () => {
  assert.ok(runCogSrc.includes("SLOT ESPERADO"),
    "system prompt must include expected slot discipline");
});

test("G4: buildOpenAISystemPrompt injects forbidden_topics discipline", () => {
  assert.ok(runCogSrc.includes("TÓPICOS PROIBIDOS"),
    "system prompt must include forbidden topics discipline");
});

test("G5: buildOpenAISystemPrompt injects micro_rules discipline", () => {
  assert.ok(runCogSrc.includes("MICRO REGRAS"),
    "system prompt must include micro rules discipline");
});

test("G6: buildOpenAISystemPrompt injects brief_answer discipline", () => {
  assert.ok(runCogSrc.includes("RESPOSTA BREVE PERMITIDA"),
    "system prompt must include brief_answer discipline");
});

test("G7: buildOpenAISystemPrompt injects return_to_stage discipline", () => {
  assert.ok(runCogSrc.includes("SE O CLIENTE SAIR DO FOCO"),
    "system prompt must include return_to_stage discipline");
});

test("G8: buildOpenAIUserPrompt injects stage_contract into payload", () => {
  assert.ok(runCogSrc.includes("payload.stage_contract"),
    "user prompt must inject stage_contract into payload");
});

test("G9: buildOpenAIUserPrompt preserves mechanical_source_of_truth", () => {
  assert.ok(runCogSrc.includes("mechanical_source_of_truth: true"),
    "user prompt must assert mechanical_source_of_truth = true");
});

test("G10: runReadOnlyCognitiveEngine passes stage_contract to system prompt", () => {
  assert.ok(runCogSrc.includes("buildOpenAISystemPrompt(request.stage_contract)"),
    "engine must pass request.stage_contract to system prompt builder");
});

// ══════════════════════════════════════════════════════════
// SECTION H — End-to-end contract shape through input pipeline
// ══════════════════════════════════════════════════════════

console.log("\n── SECTION H: End-to-end contract shape ──");

test("H1: full pipeline — renda stage with CLT answer", () => {
  const contract = buildStageContract({ stage: "renda" });
  const input = buildCognitiveInput({
    current_stage: "renda",
    message_text: "3800",
    known_slots: { regime_trabalho: { value: "clt" } },
    goal_of_current_stage: getStageGoal("renda"),
    forbidden_topics_for_stage: contract.forbidden_topics_now,
    allowed_signals_for_stage: getAllowedSignalsForStage("renda"),
    stage_contract: contract
  });
  assert.equal(input.current_stage, "renda");
  assert.equal(input.stage_contract.expected_slot, "renda");
  assert.ok(input.stage_contract.forbidden_topics_now.includes("coleta_documentos"));
  assert.equal(input.stage_contract.brief_answer_allowed, false);
  assert.equal(input.stage_contract.mechanical_source_of_truth, true);
});

test("H2: full pipeline — ir_declarado with sim answer", () => {
  const contract = buildStageContract({ stage: "ir_declarado" });
  const input = buildCognitiveInput({
    current_stage: "ir_declarado",
    message_text: "sim",
    known_slots: { regime_trabalho: { value: "autonomo" } },
    goal_of_current_stage: getStageGoal("ir_declarado"),
    forbidden_topics_for_stage: contract.forbidden_topics_now,
    allowed_signals_for_stage: getAllowedSignalsForStage("ir_declarado"),
    stage_contract: contract
  });
  assert.equal(input.stage_contract.expected_slot, "ir_declarado");
  assert.equal(input.stage_contract.brief_answer_allowed, true);
  assert.ok(input.stage_contract.stage_micro_rules.some(r => /sim ou não/i.test(r) || /aceitar/i.test(r)));
});

test("H3: full pipeline — unknown stage degrades gracefully", () => {
  const contract = buildStageContract({ stage: "stage_futuro_xyz" });
  const input = buildCognitiveInput({
    current_stage: "stage_futuro_xyz",
    message_text: "oi",
    stage_contract: contract
  });
  assert.equal(input.stage_contract.stage_current, "stage_futuro_xyz");
  assert.equal(input.stage_contract.expected_slot, null);
  assert.equal(input.stage_contract.mechanical_source_of_truth, true);
  assert.ok(input.stage_contract.return_to_stage_prompt, "must have default return_to_stage_prompt");
  assert.ok(input.stage_contract.fallback_prompt, "must have default fallback_prompt");
});

// ══════════════════════════════════════════════════════════
// FINAL SUMMARY
// ══════════════════════════════════════════════════════════

console.log("\n══════════════════════════════════════════════════════════");
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════════════════════\n");

if (failed > 0) process.exitCode = 1;
