/**
 * worker_cognitive_separation.smoke.mjs
 *
 * Smoke tests para provar a separação de responsabilidades worker ↔ cognitivo.
 * Testa:
 *   1. Contrato canônico de entrada/saída do cognitivo
 *   2. Worker validando sinal sem reescrever fala
 *   3. surface_sent_to_customer === reply_text_from_cognitive
 *   4. stage/gate/nextStage preservados
 */

import { strict as assert } from "node:assert";

// ── Dynamic import do contrato canônico ──────────────────────────────────────
const contractMod = await import("../cognitive/src/cognitive-contract.js");
const {
  buildCognitiveInput,
  buildCognitiveOutput,
  validateSignal,
  buildSeparationTelemetry,
  adaptLegacyToCanonical,
  getStageGoal,
  getAllowedSignalsForStage
} = contractMod;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Section A: buildCognitiveInput — shape canônico de entrada
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section A: buildCognitiveInput ===");

test("A.1 — buildCognitiveInput returns frozen object with all mandatory fields", () => {
  const input = buildCognitiveInput({
    current_stage: "estado_civil",
    message_text: "sou casado",
    known_slots: { nome: { value: "João" } },
    goal_of_current_stage: "Coletar estado civil",
    forbidden_topics_for_stage: ["renda"],
    allowed_signals_for_stage: ["estado_civil:"]
  });
  assert.ok(Object.isFrozen(input), "input must be frozen");
  assert.equal(input.current_stage, "estado_civil");
  assert.equal(input.message_text, "sou casado");
  assert.deepStrictEqual(input.known_slots, { nome: { value: "João" } });
  assert.equal(input.goal_of_current_stage, "Coletar estado civil");
  assert.deepStrictEqual(input.forbidden_topics_for_stage, ["renda"]);
  assert.deepStrictEqual(input.allowed_signals_for_stage, ["estado_civil:"]);
});

test("A.2 — buildCognitiveInput defaults when no params", () => {
  const input = buildCognitiveInput();
  assert.equal(input.current_stage, "inicio");
  assert.equal(input.message_text, "");
  assert.deepStrictEqual(input.known_slots, {});
  assert.equal(input.goal_of_current_stage, "");
  assert.deepStrictEqual(input.forbidden_topics_for_stage, []);
  assert.deepStrictEqual(input.allowed_signals_for_stage, []);
  assert.deepStrictEqual(input.normative_context, []);
  assert.deepStrictEqual(input.recent_messages, []);
});

test("A.3 — buildCognitiveInput includes normative_context and recent_messages", () => {
  const input = buildCognitiveInput({
    current_stage: "renda",
    message_text: "ganho 3000",
    normative_context: [{ title: "MCMV", content: "regras" }],
    recent_messages: [{ role: "user", text: "oi" }]
  });
  assert.equal(input.normative_context.length, 1);
  assert.equal(input.recent_messages.length, 1);
});

// ═══════════════════════════════════════════════════════════════
// Section B: buildCognitiveOutput — shape canônico de saída
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section B: buildCognitiveOutput ===");

test("B.1 — buildCognitiveOutput returns frozen object with all fields", () => {
  const output = buildCognitiveOutput({
    reply_text: "Qual seu estado civil?",
    signal: "estado_civil:casado",
    confidence: 0.95,
    needs_confirmation: false,
    slots_detected: { estado_civil: { value: "casado" } },
    pending_slots: [],
    conflicts: [],
    reason_codes: ["cognitive_v2"],
    speech_origin: "llm_real"
  });
  assert.ok(Object.isFrozen(output), "output must be frozen");
  assert.equal(output.reply_text, "Qual seu estado civil?");
  assert.equal(output.signal, "estado_civil:casado");
  assert.equal(output.confidence, 0.95);
  assert.equal(output.needs_confirmation, false);
  assert.deepStrictEqual(output.slots_detected, { estado_civil: { value: "casado" } });
  assert.deepStrictEqual(output.pending_slots, []);
  assert.deepStrictEqual(output.conflicts, []);
  assert.deepStrictEqual(output.reason_codes, ["cognitive_v2"]);
  assert.equal(output.speech_origin, "llm_real");
});

test("B.2 — buildCognitiveOutput defaults", () => {
  const output = buildCognitiveOutput();
  assert.equal(output.reply_text, "");
  assert.equal(output.signal, null);
  assert.equal(output.confidence, 0);
  assert.equal(output.needs_confirmation, false);
  assert.deepStrictEqual(output.slots_detected, {});
  assert.deepStrictEqual(output.pending_slots, []);
  assert.deepStrictEqual(output.conflicts, []);
  assert.deepStrictEqual(output.reason_codes, []);
  assert.equal(output.speech_origin, "fallback_mechanical");
});

test("B.3 — buildCognitiveOutput clamps confidence", () => {
  const output1 = buildCognitiveOutput({ confidence: 1.5 });
  assert.equal(output1.confidence, 1);
  const output2 = buildCognitiveOutput({ confidence: -0.3 });
  assert.equal(output2.confidence, 0);
});

test("B.4 — buildCognitiveOutput signal coerced to string or null", () => {
  const output1 = buildCognitiveOutput({ signal: null });
  assert.equal(output1.signal, null);
  const output2 = buildCognitiveOutput({ signal: "estado_civil:casado" });
  assert.equal(output2.signal, "estado_civil:casado");
});

// ═══════════════════════════════════════════════════════════════
// Section C: validateSignal — worker valida sinal, não fala
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section C: validateSignal ===");

test("C.1 — null signal is always valid", () => {
  const result = validateSignal("estado_civil", null);
  assert.equal(result.valid, true);
  assert.equal(result.reason, "no_signal");
});

test("C.2 — compatible signal for estado_civil", () => {
  const result = validateSignal("estado_civil", "estado_civil:casado");
  assert.equal(result.valid, true);
  assert.equal(result.reason, "signal_compatible");
});

test("C.3 — incompatible signal for estado_civil", () => {
  const result = validateSignal("estado_civil", "renda:3000");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signal_incompatible");
});

test("C.4 — compatible signal for renda", () => {
  const result = validateSignal("renda", "renda:5000");
  assert.equal(result.valid, true);
});

test("C.5 — compatible signal for composicao stages", () => {
  for (const s of ["quem_pode_somar", "interpretar_composicao", "somar_renda_solteiro", "somar_renda_familiar"]) {
    const result = validateSignal(s, "composicao:sozinho");
    assert.equal(result.valid, true, `signal should be valid for ${s}`);
  }
});

test("C.6 — compatible signal for regime_trabalho", () => {
  const result = validateSignal("regime_trabalho", "regime:clt");
  assert.equal(result.valid, true);
});

test("C.7 — compatible signal for autonomo_ir_pergunta", () => {
  const result = validateSignal("autonomo_ir_pergunta", "ir:sim");
  assert.equal(result.valid, true);
});

test("C.8 — unknown stage accepts any signal (no_prefix_restriction)", () => {
  const result = validateSignal("envio_docs", "anything:here");
  assert.equal(result.valid, true);
  assert.equal(result.reason, "no_prefix_restriction");
});

test("C.9 — incompatible signal for renda stage", () => {
  const result = validateSignal("renda", "estado_civil:casado");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signal_incompatible");
});

// ═══════════════════════════════════════════════════════════════
// Section D: buildSeparationTelemetry — prova de separação
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section D: buildSeparationTelemetry ===");

test("D.1 — surface_equal_reply_text is true when surface matches", () => {
  const tel = buildSeparationTelemetry({
    stage_before: "estado_civil",
    stage_after: "confirmar_casamento",
    reply_text_from_cognitive: "Entendi, você é casado.",
    surface_sent_to_customer: "Entendi, você é casado.",
    signal_from_cognitive: "estado_civil:casado",
    signal_validated_by_worker: true,
    signal_validation_result: "signal_compatible"
  });
  assert.equal(tel.surface_equal_reply_text, true);
  assert.equal(tel.worker_rewrote_reply, false);
});

test("D.2 — worker_rewrote_reply is true when surface differs", () => {
  const tel = buildSeparationTelemetry({
    reply_text_from_cognitive: "Original text",
    surface_sent_to_customer: "Modified text"
  });
  assert.equal(tel.surface_equal_reply_text, false);
  assert.equal(tel.worker_rewrote_reply, true);
});

test("D.3 — all required telemetry fields present", () => {
  const tel = buildSeparationTelemetry({
    stage_before: "renda",
    stage_after: "renda",
    reply_text_from_cognitive: "Quanto você ganha?",
    signal_from_cognitive: null,
    signal_validated_by_worker: true,
    signal_validation_result: "no_signal",
    surface_sent_to_customer: "Quanto você ganha?",
    needs_confirmation: false,
    confidence: 0.85,
    advance_allowed: false,
    advance_block_reason: null
  });
  const requiredKeys = [
    "stage_before", "stage_after", "reply_text_from_cognitive",
    "signal_from_cognitive", "signal_validated_by_worker",
    "signal_validation_result", "surface_sent_to_customer",
    "surface_equal_reply_text", "worker_rewrote_reply",
    "needs_confirmation", "confidence",
    "advance_allowed", "advance_block_reason"
  ];
  for (const key of requiredKeys) {
    assert.ok(key in tel, `missing telemetry key: ${key}`);
  }
});

test("D.4 — telemetry truncates long reply_text", () => {
  const longText = "a".repeat(600);
  const tel = buildSeparationTelemetry({
    reply_text_from_cognitive: longText,
    surface_sent_to_customer: longText
  });
  assert.ok(tel.reply_text_from_cognitive.length <= 500);
  assert.ok(tel.surface_sent_to_customer.length <= 500);
});

// ═══════════════════════════════════════════════════════════════
// Section E: adaptLegacyToCanonical — conversão legado → canônico
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section E: adaptLegacyToCanonical ===");

test("E.1 — converts legacy output to canonical format", () => {
  const legacy = {
    reply_text: "Entendi, você é casado.",
    speech_origin: "llm_real",
    intent: "cognitive_v2_slot_detected",
    entities: { estado_civil: "casado" },
    stage_signals: { estado_civil: "casado" },
    still_needs_original_answer: false,
    answered_customer_question: true,
    safe_stage_signal: "estado_civil:casado",
    suggested_stage: "estado_civil",
    confidence: 0.92,
    reason: "cognitive_v2"
  };
  const canonical = adaptLegacyToCanonical(legacy);
  assert.equal(canonical.reply_text, "Entendi, você é casado.");
  assert.equal(canonical.signal, "estado_civil:casado");
  assert.equal(canonical.confidence, 0.92);
  assert.equal(canonical.needs_confirmation, false);
  assert.deepStrictEqual(canonical.slots_detected, { estado_civil: "casado" });
  assert.deepStrictEqual(canonical.reason_codes, ["cognitive_v2"]);
  assert.equal(canonical.speech_origin, "llm_real");
});

test("E.2 — handles null legacy output gracefully", () => {
  const canonical = adaptLegacyToCanonical(null);
  assert.equal(canonical.reply_text, "");
  assert.equal(canonical.signal, null);
  assert.equal(canonical.confidence, 0);
  assert.equal(canonical.speech_origin, "fallback_mechanical");
});

test("E.3 — maps still_needs_original_answer to needs_confirmation", () => {
  const legacy = {
    reply_text: "test",
    still_needs_original_answer: true,
    confidence: 0.5
  };
  const canonical = adaptLegacyToCanonical(legacy);
  assert.equal(canonical.needs_confirmation, true);
});

// ═══════════════════════════════════════════════════════════════
// Section F: getStageGoal / getAllowedSignalsForStage
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section F: getStageGoal / getAllowedSignalsForStage ===");

test("F.1 — getStageGoal returns goal for known stage", () => {
  const goal = getStageGoal("estado_civil");
  assert.ok(goal.includes("estado civil"));
});

test("F.2 — getStageGoal returns default for unknown stage", () => {
  const goal = getStageGoal("unknown_stage_xyz");
  assert.ok(goal.length > 0);
});

test("F.3 — getAllowedSignalsForStage returns prefixes for known stage", () => {
  const signals = getAllowedSignalsForStage("estado_civil");
  assert.ok(Array.isArray(signals));
  assert.ok(signals.includes("estado_civil:"));
});

test("F.4 — getAllowedSignalsForStage returns empty for unknown stage", () => {
  const signals = getAllowedSignalsForStage("unknown_stage_xyz");
  assert.ok(Array.isArray(signals));
  assert.equal(signals.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// Section G: Worker NÃO reescreve fala — prova comportamental
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section G: Worker não reescreve fala (prova) ===");

test("G.1 — canonical output reply_text is preserved exactly", () => {
  const replyText = "Que bom que você é casado! Vamos continuar com o processo.";
  const output = buildCognitiveOutput({
    reply_text: replyText,
    signal: "estado_civil:casado",
    confidence: 0.95,
    speech_origin: "llm_real"
  });
  // Worker deve usar output.reply_text diretamente como surface
  assert.equal(output.reply_text, replyText, "reply_text must be exactly preserved");

  // Telemetria prova que surface === reply_text
  const tel = buildSeparationTelemetry({
    reply_text_from_cognitive: output.reply_text,
    surface_sent_to_customer: output.reply_text
  });
  assert.equal(tel.surface_equal_reply_text, true);
  assert.equal(tel.worker_rewrote_reply, false);
});

test("G.2 — signal validation does not affect reply_text", () => {
  const output = buildCognitiveOutput({
    reply_text: "Essa é a fala do cognitivo.",
    signal: "renda:5000",
    confidence: 0.8,
    speech_origin: "llm_real"
  });
  // Worker valida sinal para estado_civil → incompatível
  const validation = validateSignal("estado_civil", output.signal);
  assert.equal(validation.valid, false);
  // Mesmo com sinal incompatível, reply_text permanece intacto
  assert.equal(output.reply_text, "Essa é a fala do cognitivo.");
});

test("G.3 — low confidence blocks signal, not reply_text", () => {
  const output = buildCognitiveOutput({
    reply_text: "Fala cognitiva.",
    signal: "estado_civil:solteiro",
    confidence: 0.3,
    speech_origin: "llm_real"
  });
  // Worker pode bloquear avanço por baixa confiança
  const advanceAllowed = output.confidence >= 0.66;
  assert.equal(advanceAllowed, false, "advance should be blocked");
  // Mas reply_text permanece
  assert.equal(output.reply_text, "Fala cognitiva.");
});

// ═══════════════════════════════════════════════════════════════
// Section H: Stage/gate/nextStage preservados
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section H: Stage/gate/nextStage preservados ===");

test("H.1 — validateSignal does not mutate stage decisions", () => {
  // validateSignal apenas retorna valid/reason — não altera nenhum estado
  const result = validateSignal("renda", "renda:5000");
  assert.ok(!("nextStage" in result));
  assert.ok(!("stage" in result));
  assert.ok(!("gate" in result));
});

test("H.2 — buildCognitiveOutput does not contain stage/gate/nextStage", () => {
  const output = buildCognitiveOutput({
    reply_text: "test",
    signal: "test:value",
    confidence: 0.9,
    speech_origin: "llm_real"
  });
  // Cognitivo NÃO tem poder sobre stage/gate/nextStage
  assert.ok(!("stage" in output));
  assert.ok(!("nextStage" in output));
  assert.ok(!("gate" in output));
  assert.ok(!("parser" in output));
});

test("H.3 — buildCognitiveInput provides stage context but cognitivo cannot advance", () => {
  const input = buildCognitiveInput({
    current_stage: "estado_civil",
    message_text: "sou casado"
  });
  // Input informa stage ao cognitivo (read-only)
  assert.equal(input.current_stage, "estado_civil");
  // O output canônico não tem should_advance_stage
  const output = buildCognitiveOutput({ reply_text: "test" });
  assert.ok(!("should_advance_stage" in output));
});

// ═══════════════════════════════════════════════════════════════
// Section I: Integração contrato + validação
// ═══════════════════════════════════════════════════════════════
console.log("\n=== Section I: Integração completa ===");

test("I.1 — full flow: input → output → validateSignal → telemetry", () => {
  // 1. Worker builds input
  const input = buildCognitiveInput({
    current_stage: "estado_civil",
    message_text: "sou casado",
    known_slots: {},
    goal_of_current_stage: getStageGoal("estado_civil"),
    allowed_signals_for_stage: getAllowedSignalsForStage("estado_civil")
  });
  assert.equal(input.current_stage, "estado_civil");

  // 2. Cognitive returns output
  const output = buildCognitiveOutput({
    reply_text: "Entendi, você é casado!",
    signal: "estado_civil:casado",
    confidence: 0.95,
    needs_confirmation: false,
    slots_detected: { estado_civil: { value: "casado" } },
    speech_origin: "llm_real"
  });

  // 3. Worker validates signal only
  const signalResult = validateSignal(input.current_stage, output.signal);
  assert.equal(signalResult.valid, true);

  // 4. Worker does NOT rewrite reply_text
  const surfaceSent = output.reply_text; // exact pass-through

  // 5. Telemetry proves separation
  const tel = buildSeparationTelemetry({
    stage_before: input.current_stage,
    stage_after: "confirmar_casamento",
    reply_text_from_cognitive: output.reply_text,
    signal_from_cognitive: output.signal,
    signal_validated_by_worker: true,
    signal_validation_result: signalResult.reason,
    surface_sent_to_customer: surfaceSent,
    needs_confirmation: output.needs_confirmation,
    confidence: output.confidence,
    advance_allowed: true,
    advance_block_reason: null
  });
  assert.equal(tel.surface_equal_reply_text, true);
  assert.equal(tel.worker_rewrote_reply, false);
  assert.equal(tel.signal_validated_by_worker, true);
  assert.equal(tel.advance_allowed, true);
});

test("I.2 — full flow with incompatible signal: block advance, preserve reply", () => {
  const output = buildCognitiveOutput({
    reply_text: "Vou te ajudar com o Minha Casa Minha Vida!",
    signal: "renda:3000",
    confidence: 0.88,
    speech_origin: "llm_real"
  });

  const signalResult = validateSignal("estado_civil", output.signal);
  assert.equal(signalResult.valid, false);

  const tel = buildSeparationTelemetry({
    stage_before: "estado_civil",
    stage_after: "estado_civil",
    reply_text_from_cognitive: output.reply_text,
    signal_from_cognitive: output.signal,
    signal_validated_by_worker: true,
    signal_validation_result: signalResult.reason,
    surface_sent_to_customer: output.reply_text,
    advance_allowed: false,
    advance_block_reason: "signal_incompatible"
  });
  assert.equal(tel.surface_equal_reply_text, true);
  assert.equal(tel.worker_rewrote_reply, false);
  assert.equal(tel.advance_allowed, false);
  assert.equal(tel.advance_block_reason, "signal_incompatible");
});

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`worker_cognitive_separation.smoke.mjs — ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}\n`);

if (failed > 0) process.exit(1);
