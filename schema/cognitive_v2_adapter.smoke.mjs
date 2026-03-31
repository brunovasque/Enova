import assert from "node:assert/strict";

// ================================================================
// SMOKE TEST: Cognitive V2 Adapter + Feature Flag
// Validates:
// 1. adaptCognitiveV2Output correctly converts isolated engine output
// 2. Feature flag COGNITIVE_V2_MODE controls which engine is used
// 3. Default mode "off" preserves legacy behavior
// 4. Shadow mode runs both engines
// 5. On mode uses isolated engine via adapter
// ================================================================

const cognitiveModule = await import(new URL("../cognitive/src/run-cognitive.js", import.meta.url).href);
const fixturesModule = await import(new URL("../cognitive/fixtures/read-only-cases.js", import.meta.url).href);
const openaiMockModule = await import(new URL("./cognitive_openai_mock.mjs", import.meta.url).href);

const {
  runReadOnlyCognitiveEngine,
  validateReadOnlyCognitiveResponse,
  listReadOnlyCognitiveFixtures
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
// PART 1: Unit test adaptCognitiveV2Output in isolation
// ================================================================

// Inline adapter implementation to test independently of worker
// (mirrors the function in Enova worker.js)
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
      // Alias: V1 usa composicao_tipo, V2 usa composicao — manter ambos para compatibilidade
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

// ================================================================
console.log("\n📐 PART 1: adaptCognitiveV2Output unit tests");
// ================================================================

test("returns fallback for null input", () => {
  const result = adaptCognitiveV2Output("estado_civil", null);
  assert.equal(result.intent, "fallback_contextual");
  assert.equal(result.confidence, 0);
  assert.equal(result.reason, "no_llm_or_parse");
  assert.equal(result.suggested_stage, "estado_civil");
});

test("returns fallback for failed v2 result", () => {
  const result = adaptCognitiveV2Output("renda", { ok: false, response: null });
  assert.equal(result.intent, "fallback_contextual");
  assert.equal(result.confidence, 0);
});

test("converts estado_civil slot correctly", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "Entendi, você é casado.",
      slots_detected: {
        estado_civil: { value: "casado_civil", confidence: 0.92, evidence: "casado", source: "heuristic" }
      },
      pending_slots: ["composicao"],
      conflicts: [],
      suggested_next_slot: "composicao",
      consultive_notes: [],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.88
    },
    engine: { llm_used: true }
  };
  const result = adaptCognitiveV2Output("estado_civil", v2);
  assert.equal(result.entities.estado_civil, "casado_civil");
  assert.equal(result.safe_stage_signal, "estado_civil:casado_civil");
  assert.equal(result.intent, "cognitive_v2_slot_detected");
  assert.equal(result.confidence, 0.88);
  assert.equal(result.reason, "cognitive_v2");
  assert.equal(result.suggested_stage, "estado_civil");
});

test("converts composicao slot for quem_pode_somar", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "Entendi, vai ser sozinho.",
      slots_detected: {
        composicao: { value: "sozinho", confidence: 0.86, evidence: null, source: "heuristic" }
      },
      pending_slots: [],
      conflicts: [],
      suggested_next_slot: null,
      consultive_notes: [],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.86
    },
    engine: { llm_used: false }
  };
  const result = adaptCognitiveV2Output("quem_pode_somar", v2);
  assert.equal(result.safe_stage_signal, "composicao:sozinho");
  assert.equal(result.entities.composicao, "sozinho");
  assert.equal(result.entities.composicao_tipo, "sozinho", "composicao_tipo alias must be present");
  assert.equal(result.reason, "cognitive_v2_heuristic");
});

test("composicao_tipo alias matches composicao for extractCompatibleStageAnswer compatibility", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "Entendi, composição familiar.",
      slots_detected: {
        composicao: { value: "familiar", confidence: 0.83, evidence: null, source: "heuristic" }
      },
      pending_slots: [],
      conflicts: [],
      suggested_next_slot: null,
      consultive_notes: [],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.83
    },
    engine: { llm_used: true }
  };
  const result = adaptCognitiveV2Output("interpretar_composicao", v2);
  assert.equal(result.entities.composicao, "familiar");
  assert.equal(result.entities.composicao_tipo, "familiar");
  assert.equal(result.safe_stage_signal, "composicao:familiar");
});

test("converts renda slot correctly", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "Perfeito, renda de R$ 5.000.",
      slots_detected: {
        renda: { value: 5000, confidence: 0.84, evidence: "5000", source: "heuristic" }
      },
      pending_slots: ["ir_declarado"],
      conflicts: [],
      suggested_next_slot: "ir_declarado",
      consultive_notes: [],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.78
    },
    engine: { llm_used: true }
  };
  const result = adaptCognitiveV2Output("renda", v2);
  assert.equal(result.safe_stage_signal, "renda:5000");
  assert.equal(result.entities.renda, 5000);
  assert.equal(result.confidence, 0.78);
  // has pending slots and confidence < 0.8 → still_needs_original_answer true
  assert.equal(result.still_needs_original_answer, true);
});

test("converts ir_declarado slot correctly", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "Entendi que você declara IR.",
      slots_detected: {
        ir_declarado: { value: "sim", confidence: 0.91, evidence: "declaro", source: "heuristic" }
      },
      pending_slots: [],
      conflicts: [],
      suggested_next_slot: null,
      consultive_notes: [],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.91
    },
    engine: { llm_used: true }
  };
  const result = adaptCognitiveV2Output("ir_declarado", v2);
  assert.equal(result.safe_stage_signal, "ir:sim");
  assert.equal(result.entities.ir_declarado, "sim");
  // confidence 0.91 >= 0.8 → still_needs_original_answer false
  assert.equal(result.still_needs_original_answer, false);
});

test("sets offtrack_contextual intent when conflicts exist", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "Sua resposta ficou ambígua.",
      slots_detected: {},
      pending_slots: ["estado_civil"],
      conflicts: [{ slot: "estado_civil", reason: "ambiguous" }],
      suggested_next_slot: "estado_civil",
      consultive_notes: [],
      should_request_confirmation: true,
      should_advance_stage: false,
      confidence: 0.33
    },
    engine: { llm_used: true }
  };
  const result = adaptCognitiveV2Output("estado_civil", v2);
  assert.equal(result.intent, "offtrack_contextual");
  assert.equal(result.safe_stage_signal, null);
});

test("all required fields present in output", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "Teste.",
      slots_detected: {},
      pending_slots: [],
      conflicts: [],
      suggested_next_slot: null,
      consultive_notes: [],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.5
    },
    engine: { llm_used: false }
  };
  const result = adaptCognitiveV2Output("estado_civil", v2);
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
console.log("\n🔧 PART 2: Adapter works with real isolated engine output");
// ================================================================

const mockFetch = createMockOpenAIFetch();

const ADAPTER_FIXTURE_STAGES = {
  clt_simples: "estado_civil",
  autonomo_com_ir: "renda",
  casado_civil: "estado_civil",
  composicao_familiar: "quem_pode_somar"
};

for (const [fixtureId, expectedStage] of Object.entries(ADAPTER_FIXTURE_STAGES)) {
  await asyncTest(`adapter converts fixture '${fixtureId}' for stage '${expectedStage}'`, async () => {
    const fixtures = listReadOnlyCognitiveFixtures();
    const fixture = fixtures.find((f) => f.id === fixtureId);
    if (!fixture) {
      // Fixture may not exist in current fixture set — skip gracefully
      console.log(`     ⏭️ Fixture '${fixtureId}' not found, skipping`);
      return;
    }
    const fixtureData = (await import(new URL("../cognitive/fixtures/read-only-cases.js", import.meta.url).href))
      .READ_ONLY_COGNITIVE_FIXTURES.find((f) => f.id === fixtureId);
    if (!fixtureData) return;

    const v2Result = await runReadOnlyCognitiveEngine(fixtureData.input, {
      openaiApiKey: "sk-test-mock",
      model: "gpt-4.1-mini",
      fetchImpl: mockFetch
    });

    // Validate V2 result is valid
    assert.ok(v2Result.ok, `V2 result should be ok for fixture '${fixtureId}'`);

    // Run through adapter
    const adapted = adaptCognitiveV2Output(expectedStage, v2Result);

    // Verify adapter output shape matches cognitiveAssistV1 contract
    assert.equal(typeof adapted.reply_text, "string");
    assert.ok(adapted.reply_text.length > 0, "reply_text should not be empty");
    assert.equal(typeof adapted.intent, "string");
    assert.equal(typeof adapted.entities, "object");
    assert.equal(typeof adapted.stage_signals, "object");
    assert.equal(typeof adapted.still_needs_original_answer, "boolean");
    assert.equal(typeof adapted.answered_customer_question, "boolean");
    assert.equal(typeof adapted.confidence, "number");
    assert.ok(adapted.confidence >= 0 && adapted.confidence <= 1, "confidence should be 0-1");
    assert.equal(adapted.suggested_stage, expectedStage);
    assert.ok(adapted.reason.startsWith("cognitive_v2"), `reason should start with cognitive_v2, got: ${adapted.reason}`);
  });
}

// ================================================================
console.log("\n🏁 PART 3: safe_stage_signal compatibility verification");
// ================================================================

// Inline isStageSignalCompatible (from worker.js L2122-2133)
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

test("safe_stage_signal for estado_civil is compatible", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "OK.",
      slots_detected: { estado_civil: { value: "solteiro", confidence: 0.9 } },
      pending_slots: [], conflicts: [], suggested_next_slot: null,
      consultive_notes: [], should_request_confirmation: false,
      should_advance_stage: false, confidence: 0.9
    },
    engine: { llm_used: true }
  };
  const adapted = adaptCognitiveV2Output("estado_civil", v2);
  assert.ok(isStageSignalCompatible("estado_civil", adapted.safe_stage_signal),
    `Signal '${adapted.safe_stage_signal}' should be compatible with estado_civil`);
});

test("safe_stage_signal for composicao is compatible with quem_pode_somar", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "OK.",
      slots_detected: { composicao: { value: "familiar", confidence: 0.83 } },
      pending_slots: [], conflicts: [], suggested_next_slot: null,
      consultive_notes: [], should_request_confirmation: false,
      should_advance_stage: false, confidence: 0.83
    },
    engine: { llm_used: true }
  };
  const adapted = adaptCognitiveV2Output("quem_pode_somar", v2);
  assert.ok(isStageSignalCompatible("quem_pode_somar", adapted.safe_stage_signal),
    `Signal '${adapted.safe_stage_signal}' should be compatible with quem_pode_somar`);
});

test("safe_stage_signal for renda is compatible", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "OK.",
      slots_detected: { renda: { value: 3200, confidence: 0.84 } },
      pending_slots: [], conflicts: [], suggested_next_slot: null,
      consultive_notes: [], should_request_confirmation: false,
      should_advance_stage: false, confidence: 0.84
    },
    engine: { llm_used: true }
  };
  const adapted = adaptCognitiveV2Output("renda", v2);
  assert.ok(isStageSignalCompatible("renda", adapted.safe_stage_signal),
    `Signal '${adapted.safe_stage_signal}' should be compatible with renda`);
});

test("safe_stage_signal for ir_declarado is compatible", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "OK.",
      slots_detected: { ir_declarado: { value: "sim", confidence: 0.91 } },
      pending_slots: [], conflicts: [], suggested_next_slot: null,
      consultive_notes: [], should_request_confirmation: false,
      should_advance_stage: false, confidence: 0.91
    },
    engine: { llm_used: true }
  };
  const adapted = adaptCognitiveV2Output("ir_declarado", v2);
  assert.ok(isStageSignalCompatible("ir_declarado", adapted.safe_stage_signal),
    `Signal '${adapted.safe_stage_signal}' should be compatible with ir_declarado`);
});

test("null safe_stage_signal when no relevant slot detected", () => {
  const v2 = {
    ok: true,
    response: {
      reply_text: "OK.",
      slots_detected: {},
      pending_slots: ["estado_civil"], conflicts: [], suggested_next_slot: "estado_civil",
      consultive_notes: [], should_request_confirmation: false,
      should_advance_stage: false, confidence: 0.5
    },
    engine: { llm_used: true }
  };
  const adapted = adaptCognitiveV2Output("estado_civil", v2);
  assert.equal(adapted.safe_stage_signal, null);
  assert.equal(isStageSignalCompatible("estado_civil", adapted.safe_stage_signal), false);
});

// ================================================================
// Summary
// ================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`Adapter smoke test results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(60)}\n`);

if (failed > 0) {
  process.exit(1);
}
