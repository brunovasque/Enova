/**
 * passo2_canonical_cognitive_path.smoke.mjs
 *
 * Smoke tests para o Passo 2 da transição arquitetural:
 * - Caminho cognitivo canônico formalizado (buildCognitiveInput)
 * - renderCognitiveSpeech como pass-through honesto
 * - applyFinalSpeechContract não-destrutivo no caminho llm_real
 * - Telemetria obrigatória provando redução de arbitragem do worker
 * - Topo preservado nos 4 cenários principais
 */

import { strict as assert } from "node:assert";

// ── Imports do contrato canônico ──
import {
  buildCognitiveInput,
  buildCognitiveOutput,
  validateSignal,
  buildSeparationTelemetry,
  getStageGoal,
  getAllowedSignalsForStage,
  adaptLegacyToCanonical
} from "../cognitive/src/cognitive-contract.js";

// ── Import do contrato de fala final ──
import {
  applyFinalSpeechContract,
  hasForbiddenPromise,
  containsCasaInsteadOfImovel,
  stripFutureStageCollection,
  TOPO_SAFE_MINIMUM,
  CONTRACT_CONFIG
} from "../cognitive/src/final-speech-contract.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}: ${e.message}`);
  }
}

// ══════════════════════════════════════════════════════════════
// SEÇÃO A: buildCognitiveInput — caminho canônico formalizado
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO A: buildCognitiveInput — caminho canônico formalizado ──");

test("A1: buildCognitiveInput retorna shape canônico completo", () => {
  const input = buildCognitiveInput({
    current_stage: "inicio_programa",
    message_text: "oi, quero saber",
    known_slots: { estado_civil: { value: "solteiro" } },
    goal_of_current_stage: getStageGoal("inicio_programa"),
    forbidden_topics_for_stage: [],
    allowed_signals_for_stage: getAllowedSignalsForStage("inicio_programa"),
    normative_context: [],
    recent_messages: []
  });
  assert.equal(input.current_stage, "inicio_programa");
  assert.equal(input.message_text, "oi, quero saber");
  assert.deepStrictEqual(input.known_slots, { estado_civil: { value: "solteiro" } });
  assert.ok(typeof input.goal_of_current_stage === "string");
  assert.ok(Array.isArray(input.forbidden_topics_for_stage));
  assert.ok(Array.isArray(input.allowed_signals_for_stage));
  assert.ok(Object.isFrozen(input));
});

test("A2: buildCognitiveInput com defaults válidos", () => {
  const input = buildCognitiveInput({ current_stage: "estado_civil", message_text: "solteiro" });
  assert.equal(input.current_stage, "estado_civil");
  assert.equal(input.message_text, "solteiro");
  assert.deepStrictEqual(input.known_slots, {});
  assert.equal(input.goal_of_current_stage, "");
  assert.deepStrictEqual(input.forbidden_topics_for_stage, []);
});

test("A3: buildCognitiveInput preenche goal + allowed_signals via helpers", () => {
  const goal = getStageGoal("estado_civil");
  assert.ok(goal.length > 10, "goal deve ser descritivo");
  const signals = getAllowedSignalsForStage("estado_civil");
  assert.ok(signals.length > 0, "estado_civil deve ter sinais permitidos");
  assert.ok(signals.some(s => s.startsWith("estado_civil:")));
});

test("A4: getStageGoal para topo retorna objetivo válido", () => {
  const goals = ["inicio", "inicio_decisao", "inicio_programa"].map(getStageGoal);
  goals.forEach(g => assert.ok(g.length > 10));
});

test("A5: getAllowedSignalsForStage para topo retorna [] (sem restrição)", () => {
  const signals = getAllowedSignalsForStage("inicio_programa");
  assert.deepStrictEqual(signals, []);
});

// ══════════════════════════════════════════════════════════════
// SEÇÃO B: applyFinalSpeechContract — não-destrutivo no caminho llm_real
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO B: applyFinalSpeechContract — não-destrutivo no caminho llm_real ──");

test("B1: llmSovereign + topoSealed = passthrough (sem reescrita semântica)", () => {
  const reply = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou quer que eu te explique?";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    topoSealed: true,
    currentStage: "inicio_programa"
  });
  assert.equal(result, reply);
});

test("B2: llmSovereign non-topo = passthrough (guardrails leves apenas)", () => {
  const reply = "Entendi, me diz o seu estado civil.";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    currentStage: "estado_civil"
  });
  assert.equal(result, reply);
});

test("B3: llmSovereign com 'casa' → substitui por 'imóvel' (guardrail leve)", () => {
  const reply = "Vamos encontrar uma casa pra você!";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    currentStage: "estado_civil"
  });
  assert.ok(result.includes("imóvel"));
  assert.ok(!containsCasaInsteadOfImovel(result));
});

test("B4: llmSovereign preserva Minha Casa Minha Vida", () => {
  const reply = "O programa Minha Casa Minha Vida ajuda na casa própria.";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    currentStage: "inicio_programa",
    topoSealed: true
  });
  assert.ok(result.includes("Minha Casa Minha Vida"));
});

test("B5: llmSovereign NÃO adiciona empatia (não altera tom)", () => {
  const reply = "Me diz o seu estado civil.";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    currentStage: "estado_civil",
    messageText: "tenho medo de não ser aprovado"
  });
  // Não deve ter prefixo de empatia
  assert.ok(!result.startsWith("Entendo"), "llmSovereign não deve adicionar empatia");
  assert.equal(result, reply);
});

test("B6: llmSovereign NÃO trunca agressivamente", () => {
  const longReply = "A".repeat(450) + ".";
  const result = applyFinalSpeechContract(longReply, {
    llmSovereign: true,
    currentStage: "estado_civil"
  });
  assert.equal(result, longReply, "llmSovereign não deve truncar");
});

// ══════════════════════════════════════════════════════════════
// SEÇÃO C: buildSeparationTelemetry — campos Passo 2
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO C: buildSeparationTelemetry — campos Passo 2 ──");

test("C1: buildSeparationTelemetry inclui todos os campos canônicos", () => {
  const tel = buildSeparationTelemetry({
    stage_before: "inicio_programa",
    stage_after: "inicio_nome",
    reply_text_from_cognitive: "Oi! Eu sou a Enova.",
    signal_from_cognitive: null,
    signal_validated_by_worker: true,
    signal_validation_result: "no_signal",
    surface_sent_to_customer: "Oi! Eu sou a Enova.",
    needs_confirmation: false,
    confidence: 0.95,
    advance_allowed: true,
    advance_block_reason: null
  });
  assert.equal(tel.stage_before, "inicio_programa");
  assert.equal(tel.stage_after, "inicio_nome");
  assert.ok(typeof tel.reply_text_from_cognitive === "string");
  assert.equal(tel.surface_equal_reply_text, true);
  assert.equal(tel.worker_rewrote_reply, false);
  assert.equal(tel.advance_allowed, true);
});

test("C2: surface !== reply_text → worker_rewrote_reply = true", () => {
  const tel = buildSeparationTelemetry({
    reply_text_from_cognitive: "original",
    surface_sent_to_customer: "modified"
  });
  assert.equal(tel.surface_equal_reply_text, false);
  assert.equal(tel.worker_rewrote_reply, true);
});

test("C3: surface === reply_text → worker_rewrote_reply = false", () => {
  const tel = buildSeparationTelemetry({
    reply_text_from_cognitive: "same text",
    surface_sent_to_customer: "same text"
  });
  assert.equal(tel.surface_equal_reply_text, true);
  assert.equal(tel.worker_rewrote_reply, false);
});

// ══════════════════════════════════════════════════════════════
// SEÇÃO D: validateSignal — worker valida sinal, não reescreve fala
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO D: validateSignal — worker valida sinal, não reescreve fala ──");

test("D1: signal compatível com estado_civil → valid", () => {
  const result = validateSignal("estado_civil", "estado_civil:solteiro");
  assert.equal(result.valid, true);
});

test("D2: signal incompatível com estado_civil → invalid", () => {
  const result = validateSignal("estado_civil", "renda:3000");
  assert.equal(result.valid, false);
});

test("D3: topo stages sem restrição de sinal → valid", () => {
  const result = validateSignal("inicio_programa", "any_signal");
  assert.equal(result.valid, true);
});

test("D4: null signal → valid (no_signal)", () => {
  const result = validateSignal("estado_civil", null);
  assert.equal(result.valid, true);
  assert.equal(result.reason, "no_signal");
});

// ══════════════════════════════════════════════════════════════
// SEÇÃO E: adaptLegacyToCanonical — conversão legado → canônico
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO E: adaptLegacyToCanonical — conversão legado → canônico ──");

test("E1: adapta saída legada completa corretamente", () => {
  const legacy = {
    reply_text: "Entendi, vamos lá!",
    safe_stage_signal: "estado_civil:solteiro",
    confidence: 0.9,
    still_needs_original_answer: false,
    entities: { estado_civil: "solteiro" },
    reason: "cognitive_v2",
    speech_origin: "llm_real"
  };
  const canonical = adaptLegacyToCanonical(legacy);
  assert.equal(canonical.reply_text, "Entendi, vamos lá!");
  assert.equal(canonical.signal, "estado_civil:solteiro");
  assert.equal(canonical.confidence, 0.9);
  assert.equal(canonical.needs_confirmation, false);
  assert.equal(canonical.speech_origin, "llm_real");
  assert.ok(Object.isFrozen(canonical));
});

test("E2: adapta null/undefined → fallback canônico", () => {
  const canonical = adaptLegacyToCanonical(null);
  assert.equal(canonical.reply_text, "");
  assert.equal(canonical.signal, null);
  assert.equal(canonical.confidence, 0);
  assert.equal(canonical.speech_origin, "fallback_mechanical");
});

// ══════════════════════════════════════════════════════════════
// SEÇÃO F: Topo preservado nos 4 cenários principais
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO F: Topo preservado nos 4 cenários principais ──");

test("F1: 'reset + Oi' → buildCognitiveInput aceita stage inicio_programa", () => {
  const input = buildCognitiveInput({
    current_stage: "inicio_programa",
    message_text: "Oi",
    goal_of_current_stage: getStageGoal("inicio_programa")
  });
  assert.equal(input.current_stage, "inicio_programa");
  assert.ok(input.goal_of_current_stage.length > 5);
});

test("F2: 'Quem vc é?' → buildCognitiveInput preserva mensagem intacta", () => {
  const input = buildCognitiveInput({
    current_stage: "inicio_programa",
    message_text: "Quem vc é?",
    goal_of_current_stage: getStageGoal("inicio_programa")
  });
  assert.equal(input.message_text, "Quem vc é?");
});

test("F3: 'Como funciona?' → applyFinalSpeechContract preserva explicação", () => {
  const explain = "O Minha Casa Minha Vida é um programa do governo que ajuda na entrada e reduz a parcela do financiamento.";
  const result = applyFinalSpeechContract(explain, {
    llmSovereign: true,
    topoSealed: true,
    currentStage: "inicio_programa"
  });
  assert.equal(result, explain);
});

test("F4: 'Não, me explica' → applyFinalSpeechContract preserva fala LLM soberana", () => {
  const reply = "Claro! O Minha Casa Minha Vida é um programa do governo federal que facilita o financiamento de imóvel. Quer seguir com a análise?";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    topoSealed: true,
    currentStage: "inicio_programa"
  });
  assert.equal(result, reply);
});

// ══════════════════════════════════════════════════════════════
// SEÇÃO G: Contrato final não destrói fala no caminho normal llm_real
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO G: Contrato final não destrói fala no caminho normal llm_real ──");

test("G1: contrato não adiciona empatia quando llmSovereign", () => {
  const reply = "Me diz seu estado civil.";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    currentStage: "estado_civil",
    messageText: "tenho medo"
  });
  assert.equal(result, reply);
});

test("G2: contrato não trunca quando llmSovereign", () => {
  const long = "X".repeat(500) + ".";
  const result = applyFinalSpeechContract(long, {
    llmSovereign: true,
    currentStage: "renda"
  });
  assert.equal(result.length, long.length);
});

test("G3: contrato não faz strip de future stage quando topoSealed", () => {
  // Reply com coleta futura que SERIA stripped em modo não-selado
  const reply = "Oi! Eu sou a Enova 😊 Qual é o seu estado civil?";
  const result = applyFinalSpeechContract(reply, {
    llmSovereign: true,
    topoSealed: true,
    currentStage: "inicio_programa"
  });
  // topoSealed: strip é PULADO, reply preservada
  assert.equal(result, reply);
});

test("G4: sem llmSovereign, contrato aplica strip no topo (comportamento preservado)", () => {
  const reply = "Oi! Qual é o seu estado civil?";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "inicio_programa"
  });
  // Sem llmSovereign no topo → strip deve atuar (TOPO_SAFE_MINIMUM)
  assert.equal(result, TOPO_SAFE_MINIMUM);
});

// ══════════════════════════════════════════════════════════════
// SEÇÃO H: buildCognitiveOutput — shape canônico de saída
// ══════════════════════════════════════════════════════════════
console.log("\n── SEÇÃO H: buildCognitiveOutput — shape canônico de saída ──");

test("H1: buildCognitiveOutput retorna shape congelado", () => {
  const output = buildCognitiveOutput({
    reply_text: "Oi!",
    signal: "estado_civil:solteiro",
    confidence: 0.9,
    speech_origin: "llm_real"
  });
  assert.equal(output.reply_text, "Oi!");
  assert.equal(output.signal, "estado_civil:solteiro");
  assert.equal(output.confidence, 0.9);
  assert.equal(output.speech_origin, "llm_real");
  assert.ok(Object.isFrozen(output));
});

test("H2: buildCognitiveOutput defaults seguros", () => {
  const output = buildCognitiveOutput();
  assert.equal(output.reply_text, "");
  assert.equal(output.signal, null);
  assert.equal(output.confidence, 0);
  assert.equal(output.needs_confirmation, false);
  assert.equal(output.speech_origin, "fallback_mechanical");
});

// ══════════════════════════════════════════════════════════════
// RESULTADO
// ══════════════════════════════════════════════════════════════
console.log(`\n═══ RESULTADO: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) {
  console.error(`\n❌ ${failed} tests FAILED`);
  process.exit(1);
} else {
  console.log("\n✅ All Passo 2 smoke tests passed!");
}
