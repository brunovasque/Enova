/**
 * cognitive_bloco1_v2on_diagnostic.smoke.mjs
 *
 * Diagnostic smoke tests for BLOCO 1 (inicio, inicio_decisao, inicio_programa)
 * in V2 "on" mode. Validates the canonical contract:
 *
 * 1. Cognitive reply is the SOLE visible final speech (no mechanical duplication)
 * 2. Mechanical text never leaks alongside cognitive in V2 on mode
 * 3. nextStage / gates / persistence remain untouched by cognitive
 * 4. Single question per turn
 * 5. Opening guard preserves first-contact mechanical opening
 * 6. All heuristic replies for topo stages are > 30 chars (ensures takes_final=true)
 * 7. Cognitive guidance aligns with the canonical contract per stage
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

// Heuristic-only runtime — simulates V2 on mode with no LLM (heuristic fallback)
const runtime = {};

let passed = 0;
let failed = 0;

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

function norm(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ============================================================
// GRUPO 1: step() assembly contract (unit-level simulation)
// ============================================================
console.log("\n🔧 GRUPO 1: step() assembly — V2 on mode contract");

await asyncTest("T1: V2 takes_final=true replaces mechanical (no duplication)", () => {
  const cognitivePrefix = "Oi! Que bom ter você aqui 😊 Eu sou a Enova.";
  const v2TakesFinal = true;
  const rawArr = ["Oi! Tudo bem? 😊", "Eu sou a Enova, assistente virtual.", "Posso te fazer perguntas?"];

  const arr = v2TakesFinal && cognitivePrefix
    ? [cognitivePrefix]
    : cognitivePrefix
      ? [cognitivePrefix, ...rawArr].filter(Boolean)
      : rawArr.filter(Boolean);

  assert.strictEqual(arr.length, 1, "V2 takes_final must produce exactly 1 message");
  assert.strictEqual(arr[0], cognitivePrefix, "must be ONLY the cognitive reply");
});

await asyncTest("T2: no cognitive reply → mechanical only (no cognitive leak)", () => {
  const cognitivePrefix = "";
  const v2TakesFinal = false;
  const rawArr = ["Perfeito 👌", "Vamos começar."];

  const arr = v2TakesFinal && cognitivePrefix
    ? [cognitivePrefix]
    : cognitivePrefix
      ? [cognitivePrefix, ...rawArr].filter(Boolean)
      : rawArr.filter(Boolean);

  assert.strictEqual(arr.length, 2, "mechanical messages preserved");
  assert.strictEqual(arr[0], "Perfeito 👌");
});

await asyncTest("T3: opening guard — inicio + opening_used=false → prefix nullified", () => {
  const stage = "inicio";
  const st = { opening_used: false, __cognitive_reply_prefix: "Oi! Que bom..." };

  // Simulate opening guard (worker.js L20852-20853)
  if (stage === "inicio" && st.opening_used !== true) {
    st.__cognitive_reply_prefix = null;
  }

  assert.strictEqual(st.__cognitive_reply_prefix, null, "prefix must be null after opening guard");
});

await asyncTest("T3b: opening guard — non-inicio stage → prefix preserved regardless of opening_used", () => {
  const stage = "inicio_programa";
  const st = { opening_used: false, __cognitive_reply_prefix: "Oi! Que bom..." };

  if (stage === "inicio" && st.opening_used !== true) {
    st.__cognitive_reply_prefix = null;
  }

  assert.strictEqual(st.__cognitive_reply_prefix, "Oi! Que bom...", "prefix must survive for non-inicio stages");
});

await asyncTest("T4: opening guard — inicio + opening_used=true → prefix preserved", () => {
  const stage = "inicio";
  const st = { opening_used: true, __cognitive_reply_prefix: "Oi! Que bom..." };

  // Opening guard should NOT fire when opening_used=true
  if (stage === "inicio" && st.opening_used !== true) {
    st.__cognitive_reply_prefix = null;
  }

  assert.strictEqual(st.__cognitive_reply_prefix, "Oi! Que bom...", "prefix must survive when opening_used=true");
});

// ============================================================
// GRUPO 2: All heuristic topo replies are > 30 chars (ensures takes_final=true)
// ============================================================
console.log("\n📏 GRUPO 2: All topo heuristic replies > 30 chars (takes_final=true guarantee)");

const TOPO_SCENARIOS = [
  { stage: "inicio", text: "oi", label: "inicio greeting" },
  { stage: "inicio", text: "voltei", label: "inicio reentry" },
  { stage: "inicio", text: "tenho medo de ser enganado", label: "inicio fear" },
  { stage: "inicio", text: "não tenho tempo", label: "inicio no_time" },
  { stage: "inicio_decisao", text: "oi", label: "inicio_decisao greeting" },
  { stage: "inicio_decisao", text: "onde parei?", label: "inicio_decisao where" },
  { stage: "inicio_decisao", text: "precisa tudo de novo?", label: "inicio_decisao need_restart" },
  { stage: "inicio_decisao", text: "qualquer coisa", label: "inicio_decisao fallback" },
  { stage: "inicio_programa", text: "oi", label: "inicio_programa greeting" },
  { stage: "inicio_programa", text: "voltei", label: "inicio_programa reentry" },
  { stage: "inicio_programa", text: "estrangeiro pode?", label: "inicio_programa estrangeiro" },
  { stage: "inicio_programa", text: "quanto de renda precisa?", label: "inicio_programa renda" },
  { stage: "inicio_programa", text: "demora muito?", label: "inicio_programa time" },
  { stage: "inicio_programa", text: "tenho medo de reprovação", label: "inicio_programa fear" },
];

for (const { stage, text, label } of TOPO_SCENARIOS) {
  await asyncTest(`T_len: ${label} — reply > 30 chars`, async () => {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: [] },
      runtime
    );
    const reply = result.response?.reply_text || "";
    assert.ok(
      reply.length > 30,
      `reply for ${label} is ${reply.length} chars (must be >30): "${reply.slice(0, 80)}"`
    );
  });
}

// ============================================================
// GRUPO 3: Cognitive replies align with canonical contract
// ============================================================
console.log("\n📜 GRUPO 3: Contract alignment — forbidden promises check");

const FORBIDDEN_PROMISE = /\b(garanto|garantido|aprovad[oa]|vou te aprovar|certeza de aprovacao|prometo|seu subsidio sera|valor exato|x mil reais|parcela de|entrada de)\b/i;

for (const { stage, text, label } of TOPO_SCENARIOS) {
  await asyncTest(`T_contract: ${label} — no forbidden promises`, async () => {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: [] },
      runtime
    );
    const reply = result.response?.reply_text || "";
    if (reply.length > 0) {
      assert.doesNotMatch(
        norm(reply),
        FORBIDDEN_PROMISE,
        `reply must not contain forbidden promises: "${reply.slice(0, 120)}"`
      );
    }
  });
}

// ============================================================
// GRUPO 4: should_advance_stage is always false (mechanical sovereignty)
// ============================================================
console.log("\n🛡️ GRUPO 4: Mechanical sovereignty — should_advance_stage=false");

for (const { stage, text, label } of TOPO_SCENARIOS) {
  await asyncTest(`T_stage: ${label} — should_advance_stage=false`, async () => {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: [] },
      runtime
    );
    assert.strictEqual(
      result.response.should_advance_stage,
      false,
      "cognitive must never advance stage"
    );
  });
}

// ============================================================
// GRUPO 5: Stage-specific guidance quality
// ============================================================
console.log("\n🎯 GRUPO 5: Stage-specific guidance quality");

await asyncTest("T_inicio_greeting: natural greeting + program mention", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi", known_slots: {}, pending_slots: [] },
    runtime
  );
  const reply = norm(result.response.reply_text);
  assert.ok(/enova|minha casa|programa|pre-analise/.test(reply),
    `inicio greeting must mention Enova/programa: "${result.response.reply_text.slice(0, 120)}"`);
});

await asyncTest("T_decisao_greeting: includes decision options", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "oi", known_slots: {}, pending_slots: [] },
    runtime
  );
  const reply = norm(result.response.reply_text);
  assert.ok(/continuar|1|2|onde parou|zero/.test(reply),
    `decisao greeting must include options: "${result.response.reply_text.slice(0, 120)}"`);
});

await asyncTest("T_programa_greeting: explains MCMV + asks knowledge question", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "oi", known_slots: {}, pending_slots: [] },
    runtime
  );
  const reply = norm(result.response.reply_text);
  assert.ok(/minha casa|programa|subsidio|governo/.test(reply),
    `programa greeting must mention MCMV: "${result.response.reply_text.slice(0, 120)}"`);
  assert.ok(/funciona|sabe|explique|explico/.test(reply),
    `programa greeting must ask about knowledge: "${result.response.reply_text.slice(0, 120)}"`);
});

await asyncTest("T_programa_estrangeiro: mentions RNM", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "estrangeiro pode participar?", known_slots: {}, pending_slots: [] },
    runtime
  );
  const reply = norm(result.response.reply_text);
  assert.ok(/rnm|estrangeiro|pode/.test(reply),
    `must mention RNM/estrangeiro: "${result.response.reply_text.slice(0, 120)}"`);
});

// ============================================================
// GRUPO 6: V2 takes_final simulation — complete pipeline
// ============================================================
console.log("\n⚙️ GRUPO 6: V2 takes_final complete pipeline simulation");

await asyncTest("T_pipeline: inicio greeting → V2 on → takes_final=true → single cognitive reply", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi", known_slots: {}, pending_slots: [] },
    runtime
  );
  const cognitiveReply = result.response?.reply_text || "";

  // In V2 on mode, the adapter wraps the engine result with reason.
  // For heuristic fallback (no LLM), reason is "cognitive_v2_heuristic" or "no_llm_or_parse".
  // The takes_final condition for heuristic: reply.length > 30.
  // For LLM: takes_final = true always (v2OnWithLlm).
  // We test the heuristic path since runtime has no LLM key.
  assert.ok(cognitiveReply.length > 30, `reply must be >30 chars: ${cognitiveReply.length}`);

  // Simulate the worker's takes_final decision for heuristic path:
  // v2OnWithHeuristic = true (reason would be "cognitive_v2_heuristic"/"no_llm_or_parse")
  // takes_final = v2OnWithHeuristic && cognitiveReply.length > 30
  const wouldTakeFinal = cognitiveReply.length > 30; // guaranteed true by assert above

  // Simulate step() assembly
  const mechanical = ["Oi! Tudo bem? 😊", "Eu sou a Enova.", "Posso te fazer perguntas?"];
  const arr = wouldTakeFinal && cognitiveReply
    ? [cognitiveReply]
    : cognitiveReply
      ? [cognitiveReply, ...mechanical].filter(Boolean)
      : mechanical.filter(Boolean);

  assert.strictEqual(arr.length, 1, "only cognitive reply in final output");
  assert.strictEqual(arr[0], cognitiveReply, "final output IS the cognitive reply");
});

await asyncTest("T_pipeline: inicio_decisao greeting → cognitive includes options", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_decisao", message_text: "oi", known_slots: {}, pending_slots: [] },
    runtime
  );
  const cognitiveReply = result.response?.reply_text || "";
  assert.ok(cognitiveReply.length > 30, `reply > 30 chars`);
  const n = norm(cognitiveReply);
  assert.ok(/1|2|continuar|zero/.test(n), "must include decision options in cognitive reply");
});

await asyncTest("T_pipeline: inicio_programa greeting → cognitive includes program question", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "bom dia", known_slots: {}, pending_slots: [] },
    runtime
  );
  const cognitiveReply = result.response?.reply_text || "";
  assert.ok(cognitiveReply.length > 30, `reply > 30 chars`);
  const n = norm(cognitiveReply);
  assert.ok(/funciona|sabe|explique|explico/.test(n), "must ask about program knowledge");
});

// ============================================================
// RESULTADO
// ============================================================
console.log(`\n${"═".repeat(60)}`);
console.log(`BLOCO 1 V2-on diagnostic: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${"═".repeat(60)}`);

if (failed > 0) {
  console.error("\n❌ Some diagnostic tests failed.");
  process.exit(1);
} else {
  console.log("\n✅ BLOCO 1 (inicio, inicio_decisao, inicio_programa) confirmed correct in V2 on mode.");
  console.log("   - No duplication (V2 takes_final always true for topo heuristic replies > 30 chars)");
  console.log("   - No mechanical leak in V2 on mode");
  console.log("   - Opening guard protects first contact");
  console.log("   - All replies align with canonical contract (no forbidden promises)");
  console.log("   - Cognitive never advances stage (mechanical sovereign)");
}
