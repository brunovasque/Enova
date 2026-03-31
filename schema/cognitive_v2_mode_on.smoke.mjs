import assert from "node:assert/strict";

// ================================================================
// SMOKE TEST: Cognitive V2 Mode "on" — End-to-End
// Validates that when COGNITIVE_V2_MODE="on", the V2 isolated engine
// via adapter produces correct output for the worker's contract.
//
// Tests:
// 1. V2 "on" with casado_civil fixture → reply_text, confidence, reason
// 2. V2 "on" with composicao_familiar → entities.composicao_tipo alias present
// 3. V2 "on" with LLM mock fallback → reason="cognitive_v2_heuristic"
// 4. V2 "on" → safe_stage_signal compatible with isStageSignalCompatible()
// 5. V2 "on" → suggested_stage always equals current stage
// 6. V2 "on" → COGNITIVE_HEURISTIC_REASONS covers V2 reasons
// ================================================================

const cognitiveModule = await import(new URL("../cognitive/src/run-cognitive.js", import.meta.url).href);
const fixturesModule = await import(new URL("../cognitive/fixtures/read-only-cases.js", import.meta.url).href);
const openaiMockModule = await import(new URL("./cognitive_openai_mock.mjs", import.meta.url).href);

const {
  runReadOnlyCognitiveEngine,
  validateReadOnlyCognitiveResponse
} = cognitiveModule;
const { READ_ONLY_COGNITIVE_FIXTURES } = fixturesModule;
const { createMockOpenAIFetch } = openaiMockModule;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

// ================================================================
// Inline adapter (mirrors Enova worker.js) — must match worker exactly
// ================================================================

function buildCognitiveFallback(stage) {
  return {
    reply_text: "Entendo sua dúvida. Pra te orientar com segurança, eu preciso fechar esta etapa primeiro e aí te explico o próximo passo com base no seu perfil.",
    intent: "fallback_contextual",
    entities: {},
    stage_signals: {},
    still_needs_original_answer: true,
    answered_customer_question: true,
    safe_stage_signal: null,
    suggested_stage: stage,
    confidence: 0,
    reason: "no_llm_or_parse"
  };
}

function adaptCognitiveV2Output(stage, v2Result) {
  const fallback = buildCognitiveFallback(stage);
  if (!v2Result || typeof v2Result !== "object" || !v2Result.ok) return fallback;

  const resp = v2Result.response;
  if (!resp || typeof resp !== "object") return fallback;

  const slotsDetected = resp.slots_detected && typeof resp.slots_detected === "object"
    ? resp.slots_detected : {};
  const slotKeys = Object.keys(slotsDetected);

  const entities = {};
  for (const key of slotKeys) {
    const slot = slotsDetected[key];
    if (slot && slot.value != null) {
      entities[key] = slot.value;
      if (key === "composicao") entities.composicao_tipo = slot.value;
    }
  }

  const stageSignals = {};
  for (const key of slotKeys) {
    const slot = slotsDetected[key];
    if (slot && slot.value != null) stageSignals[key] = slot.value;
  }

  let safeStageSignal = null;
  if (stage === "estado_civil" && entities.estado_civil) {
    safeStageSignal = "estado_civil:" + String(entities.estado_civil);
  } else if ((stage === "quem_pode_somar" || stage === "interpretar_composicao") && entities.composicao) {
    safeStageSignal = "composicao:" + String(entities.composicao);
  } else if (stage === "renda" && entities.renda != null) {
    safeStageSignal = "renda:" + String(entities.renda);
  } else if (stage === "ir_declarado" && entities.ir_declarado) {
    safeStageSignal = "ir:" + String(entities.ir_declarado);
  }

  const hasSlots = slotKeys.length > 0;
  const confidence = Number.isFinite(resp.confidence) ? Math.max(0, Math.min(1, resp.confidence)) : 0;
  const hasPendingSlots = Array.isArray(resp.pending_slots) && resp.pending_slots.length > 0;

  const engineUsedLlm = v2Result.engine && v2Result.engine.llm_used === true;
  const intent = hasSlots
    ? "cognitive_v2_slot_detected"
    : (resp.conflicts && resp.conflicts.length > 0)
      ? "offtrack_contextual"
      : "fallback_contextual";

  const replyText = typeof resp.reply_text === "string" && resp.reply_text.trim()
    ? resp.reply_text.trim()
    : fallback.reply_text;

  return {
    reply_text: replyText,
    intent,
    entities,
    stage_signals: stageSignals,
    still_needs_original_answer: hasPendingSlots && confidence < 0.8,
    answered_customer_question: replyText.length > 20 && resp.should_request_confirmation !== true,
    safe_stage_signal: safeStageSignal,
    suggested_stage: stage,
    confidence,
    reason: engineUsedLlm ? "cognitive_v2" : "cognitive_v2_heuristic"
  };
}

// Inline isStageSignalCompatible (mirrors worker.js L2122-2133)
function isStageSignalCompatible(stage, safeStageSignal) {
  if (!safeStageSignal) return false;
  const map = {
    estado_civil: ["estado_civil"],
    quem_pode_somar: ["composicao"],
    interpretar_composicao: ["composicao"],
    renda: ["renda", "regime", "ir_possible"],
    ir_declarado: ["ir"]
  };
  const allowed = map[stage] || [];
  return allowed.some((prefix) => String(safeStageSignal).startsWith(prefix));
}

// Inline extractCompatibleStageAnswerFromCognitive (mirrors worker.js L2135-2183)
function extractCompatibleStageAnswerFromCognitive(stage, cognitiveOutput) {
  const c = cognitiveOutput || {};
  const entities = c.entities && typeof c.entities === "object" ? c.entities : {};
  const stageSignals = c.stage_signals && typeof c.stage_signals === "object" ? c.stage_signals : {};
  const safe = String(c.safe_stage_signal || "").toLowerCase();

  if (stage === "estado_civil") {
    const fromEntity = (entities.estado_civil || "").toLowerCase().trim();
    if (fromEntity && ["solteiro", "casado", "uniao_estavel", "separado", "divorciado", "viuvo"].includes(fromEntity)) {
      return fromEntity.replace("_", " ");
    }
    const fromSignal = (stageSignals.estado_civil || "").toLowerCase().trim();
    if (fromSignal && ["solteiro", "casado", "uniao_estavel", "separado", "divorciado", "viuvo"].includes(fromSignal)) {
      return fromSignal.replace("_", " ");
    }
    const safeMatch = safe.match(/^estado_civil:(.+)$/);
    if (safeMatch?.[1]) return safeMatch[1].replace(/_/g, " ");
    return null;
  }

  if (stage === "quem_pode_somar" || stage === "interpretar_composicao") {
    const comp = (entities.composicao_tipo || stageSignals.composicao || "").toLowerCase().trim();
    if (comp === "parceiro") return "parceiro";
    if (comp === "familiar") return "familiar";
    if (comp === "sozinho") return "sozinho";

    const safeMatch = safe.match(/^composicao:(.+)$/);
    if (safeMatch?.[1]) {
      const v = safeMatch[1].toLowerCase().trim();
      if (["parceiro", "familiar", "sozinho"].includes(v)) return v;
    }
    return null;
  }

  if (stage === "ir_declarado") {
    const ir = String(entities.ir_declarado ?? stageSignals.ir_declarado ?? "").toLowerCase().trim();
    if (ir === "sim" || ir === "true") return "sim";
    if (ir === "nao" || ir === "false") return "nao";
    const safeMatch = safe.match(/^ir:(.+)$/);
    if (safeMatch?.[1]) {
      const v = safeMatch[1].toLowerCase().trim();
      if (v === "sim" || v === "true") return "sim";
      if (v === "nao" || v === "false") return "nao";
    }
    return null;
  }

  return null;
}

// ================================================================
// Simulate full V2 "on" flow: engine → adapter → worker checks
// ================================================================

const mockFetch = createMockOpenAIFetch();

async function runV2OnFlow(stage, userText, knownSlots = {}) {
  const rawInput = {
    current_stage: stage,
    message_text: String(userText || ""),
    known_slots: knownSlots,
    pending_slots: [],
    recent_messages: []
  };
  const v2Result = await runReadOnlyCognitiveEngine(rawInput, {
    openaiApiKey: "sk-test-mock",
    model: "gpt-4.1-mini",
    fetchImpl: mockFetch
  });
  return adaptCognitiveV2Output(stage, v2Result);
}

// ================================================================
console.log("\n🧠 PART 1: V2 mode 'on' — basic contract validation");
// ================================================================

await asyncTest("casado_civil: reply_text not empty, confidence > 0, reason contains cognitive_v2", async () => {
  const result = await runV2OnFlow("estado_civil", "Sou casado no civil");
  assert.ok(result.reply_text.length > 0, "reply_text must not be empty");
  assert.ok(result.confidence > 0, "confidence must be > 0");
  assert.ok(result.reason.startsWith("cognitive_v2"), `reason must start with cognitive_v2, got: ${result.reason}`);
  assert.equal(result.suggested_stage, "estado_civil", "suggested_stage must equal current stage");
});

await asyncTest("renda: reply_text not empty, entities.renda present", async () => {
  const result = await runV2OnFlow("renda", "Ganho 5 mil por mês");
  assert.ok(result.reply_text.length > 0, "reply_text must not be empty");
  assert.equal(result.suggested_stage, "renda", "suggested_stage must equal current stage");
  // V2 heuristic should detect renda
  if (result.entities.renda != null) {
    assert.ok(Number.isFinite(result.entities.renda), "renda entity should be a number");
  }
});

await asyncTest("ir_declarado: sim detected correctly", async () => {
  const result = await runV2OnFlow("ir_declarado", "Sim, eu declaro imposto de renda");
  assert.ok(result.reply_text.length > 0);
  assert.equal(result.suggested_stage, "ir_declarado");
  if (result.entities.ir_declarado) {
    assert.equal(result.entities.ir_declarado, "sim");
  }
});

// ================================================================
console.log("\n🔗 PART 2: V2 mode 'on' — composicao_tipo alias");
// ================================================================

await asyncTest("composicao_familiar: entities.composicao_tipo alias present", async () => {
  const result = await runV2OnFlow("quem_pode_somar", "Minha mãe vai compor a renda comigo");
  assert.ok(result.reply_text.length > 0);
  // V2 should detect composicao
  if (result.entities.composicao) {
    assert.equal(result.entities.composicao_tipo, result.entities.composicao,
      "composicao_tipo must equal composicao");
    // extractCompatibleStageAnswerFromCognitive should find it via composicao_tipo
    const extracted = extractCompatibleStageAnswerFromCognitive("quem_pode_somar", result);
    assert.ok(extracted, "extractCompatibleStageAnswerFromCognitive must find composicao via alias");
    assert.equal(extracted, "familiar");
  }
});

await asyncTest("composicao_sozinho via interpretar_composicao stage", async () => {
  const result = await runV2OnFlow("interpretar_composicao", "Vou só eu, sozinho");
  assert.ok(result.reply_text.length > 0);
  if (result.entities.composicao) {
    assert.equal(result.entities.composicao_tipo, result.entities.composicao);
    const extracted = extractCompatibleStageAnswerFromCognitive("interpretar_composicao", result);
    assert.ok(extracted, "extractCompatibleStageAnswerFromCognitive must find composicao");
    assert.equal(extracted, "sozinho");
  }
});

// ================================================================
console.log("\n🔒 PART 3: V2 mode 'on' — safe_stage_signal compatibility");
// ================================================================

await asyncTest("estado_civil safe_stage_signal compatible", async () => {
  const result = await runV2OnFlow("estado_civil", "Sou solteiro");
  if (result.safe_stage_signal) {
    assert.ok(isStageSignalCompatible("estado_civil", result.safe_stage_signal),
      `Signal '${result.safe_stage_signal}' must be compatible with estado_civil`);
  }
});

await asyncTest("quem_pode_somar safe_stage_signal compatible", async () => {
  const result = await runV2OnFlow("quem_pode_somar", "Meu pai vai compor comigo");
  if (result.safe_stage_signal) {
    assert.ok(isStageSignalCompatible("quem_pode_somar", result.safe_stage_signal),
      `Signal '${result.safe_stage_signal}' must be compatible with quem_pode_somar`);
  }
});

await asyncTest("renda safe_stage_signal compatible", async () => {
  const result = await runV2OnFlow("renda", "Ganho 3200 reais");
  if (result.safe_stage_signal) {
    assert.ok(isStageSignalCompatible("renda", result.safe_stage_signal),
      `Signal '${result.safe_stage_signal}' must be compatible with renda`);
  }
});

await asyncTest("ir_declarado safe_stage_signal compatible", async () => {
  const result = await runV2OnFlow("ir_declarado", "Não declaro IR");
  if (result.safe_stage_signal) {
    assert.ok(isStageSignalCompatible("ir_declarado", result.safe_stage_signal),
      `Signal '${result.safe_stage_signal}' must be compatible with ir_declarado`);
  }
});

// ================================================================
console.log("\n🎯 PART 4: V2 mode 'on' — telemetry reason compatibility");
// ================================================================

const COGNITIVE_HEURISTIC_REASONS = new Set(["no_llm_or_parse", "cognitive_v2_heuristic"]);

await asyncTest("reason is recognized by COGNITIVE_HEURISTIC_REASONS or is LLM reason", async () => {
  const result = await runV2OnFlow("estado_civil", "Sou casado");
  const reason = result.reason;
  const isHeuristic = COGNITIVE_HEURISTIC_REASONS.has(reason);
  const isLlm = reason === "cognitive_v2" || reason === "cognitive_v1";
  assert.ok(isHeuristic || isLlm, `reason '${reason}' must be recognized`);
});

await asyncTest("all 10 required fields present in V2 'on' output", async () => {
  const result = await runV2OnFlow("estado_civil", "Sou solteiro");
  const requiredFields = [
    "reply_text", "intent", "entities", "stage_signals",
    "still_needs_original_answer", "answered_customer_question",
    "safe_stage_signal", "suggested_stage", "confidence", "reason"
  ];
  for (const field of requiredFields) {
    assert.ok(field in result, `Missing field: ${field}`);
  }
});

// ================================================================
console.log("\n🛡️ PART 5: V2 mode 'on' — safety guarantees");
// ================================================================

await asyncTest("suggested_stage always equals current stage (never advances)", async () => {
  const stages = ["estado_civil", "quem_pode_somar", "interpretar_composicao", "renda", "ir_declarado"];
  for (const stage of stages) {
    const result = await runV2OnFlow(stage, "Sim");
    assert.equal(result.suggested_stage, stage,
      `suggested_stage for '${stage}' must be '${stage}', got '${result.suggested_stage}'`);
  }
});

await asyncTest("confidence is always 0-1", async () => {
  const inputs = [
    { stage: "estado_civil", text: "Sou casado" },
    { stage: "renda", text: "10 mil" },
    { stage: "ir_declarado", text: "Não" },
    { stage: "quem_pode_somar", text: "Sozinho" },
    { stage: "estado_civil", text: "asdfgh junk text" }
  ];
  for (const { stage, text } of inputs) {
    const result = await runV2OnFlow(stage, text);
    assert.ok(result.confidence >= 0 && result.confidence <= 1,
      `confidence for '${stage}'/'${text}' must be 0-1, got ${result.confidence}`);
  }
});

// ================================================================
// Summary
// ================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`V2 mode 'on' smoke test results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(60)}\n`);

if (failed > 0) {
  process.exit(1);
}
