/**
 * cognitive_estado_civil_bridge.smoke.mjs
 *
 * BLINDAGEM: ponte entre topo cognitivo e estado_civil
 *
 * Verifica que estado_civil funciona como ponte limpa entre:
 *   - topo cognitivo (blocos A/B/C já mergeados)
 *   - miolo cognitivo/mecânico existente a partir de estado_civil
 *
 * Cenários obrigatórios:
 *  1. Chegada em estado_civil vindo de brasileiro (inicio_nacionalidade)
 *  2. Chegada em estado_civil vindo de RNM indeterminado (inicio_rnm_validade)
 *  3. estado_civil com "solteiro" — fluxo mecânico preservado (should_advance=false)
 *  4. estado_civil com "casado no civil" — conjunto preservado
 *  5. estado_civil com "união estável" — sem reclassificação automática
 *  6. estado_civil com "moro junto" — NÃO infere união estável automaticamente
 *  7. Regressão blocos A, B e C — nenhum stage do topo quebrou
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const heuristicOnly = {};

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

// ===== 1. Chegada em estado_civil vindo de brasileiro =====
await asyncTest("1. Chegada de brasileiro: engine válido, sem ruído de ponte", async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "solteiro",
      known_slots: { nacionalidade: "brasileiro" },
      pending_slots: ["estado_civil", "composicao"]
    },
    heuristicOnly
  );
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  assert.strictEqual(result.response.should_advance_stage, false, "mecânico é soberano — should_advance_stage=false");
  assert.ok(result.response.slots_detected?.estado_civil, "slot estado_civil deve ser detectado");
  assert.strictEqual(result.response.slots_detected.estado_civil.value, "solteiro");
});

// ===== 2. Chegada em estado_civil vindo de RNM indeterminado =====
await asyncTest("2. Chegada de RNM indeterminado: engine válido, sem ruído de ponte", async () => {
  // Usa "solteiro" para garantir detecção heurística; o contexto de chegada (rnm_validade) é o que importa.
  // O mecânico faz o parse de divorciado, viuvo etc — o cognitivo é consultivo.
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "solteiro",
      known_slots: { rnm_validade: "indeterminado" },
      pending_slots: ["estado_civil", "composicao"]
    },
    heuristicOnly
  );
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  assert.strictEqual(result.response.should_advance_stage, false, "mecânico é soberano — should_advance_stage=false");
  assert.ok(result.response.slots_detected?.estado_civil, "slot estado_civil deve ser detectado");
  assert.strictEqual(result.response.slots_detected.estado_civil.value, "solteiro");
  // Contexto de chegada via RNM indeterminado não interfere no comportamento de estado_civil
  // O slot rnm_validade no known_slots não deve causar ruído nem alterar o output
  assert.strictEqual(result.response.slots_detected?.rnm_validade, undefined, "rnm_validade não deve vazar como slot detectado em estado_civil");
});

// ===== 3. estado_civil com "solteiro" =====
await asyncTest("3. Solteiro: fluxo mecânico preservado (should_advance=false)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "solteiro",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"]
    },
    heuristicOnly
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.strictEqual(result.response.slots_detected?.estado_civil?.value, "solteiro");
});

// ===== 4. estado_civil com "casado no civil" =====
await asyncTest("4. Casado no civil: conjunto preservado (should_advance=false)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "sou casado no civil",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"]
    },
    heuristicOnly
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  assert.strictEqual(result.response.slots_detected?.estado_civil?.value, "casado_civil");
});

// ===== 5. estado_civil com "união estável" =====
await asyncTest("5. União estável: sem reclassificação automática indevida", async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "moro junto, união estável",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"]
    },
    heuristicOnly
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  // Se detectou, deve ser uniao_estavel — nunca reclassificar automaticamente como casado
  const detectedValue = result.response.slots_detected?.estado_civil?.value;
  if (detectedValue) {
    assert.notStrictEqual(detectedValue, "casado", "união estável não pode ser reclassificada como casado");
    assert.notStrictEqual(detectedValue, "casado_civil", "união estável não pode ser reclassificada como casado_civil");
  }
});

// ===== 6. estado_civil com "moro junto" isolado =====
await asyncTest("6. Moro junto isolado: NÃO infere união estável automaticamente", async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "estado_civil",
      message_text: "moro junto",
      known_slots: {},
      pending_slots: ["estado_civil", "composicao"]
    },
    heuristicOnly
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  // Coabitação ≠ união estável — slot NÃO pode ser uniao_estavel para "moro junto" sozinho
  assert.notStrictEqual(
    result.response.slots_detected?.estado_civil?.value,
    "uniao_estavel",
    "moro junto isolado não pode inferir uniao_estavel automaticamente"
  );
});

// ===== 7. Regressão blocos A, B e C =====
await asyncTest("7. Regressão — inicio, inicio_nome, inicio_rnm_validade, estado_civil todos válidos", async () => {
  const stages = [
    { stage: "inicio", text: "oi" },
    { stage: "inicio_nome", text: "João Silva" },
    { stage: "inicio_rnm_validade", text: "é indeterminado" },
    { stage: "estado_civil", text: "solteiro" }
  ];
  for (const { stage, text } of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: [] },
      heuristicOnly
    );
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} response must be valid: ${v.errors.join(", ")}`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
  }
});

console.log("");
if (failed === 0) {
  console.log(`cognitive_estado_civil_bridge.smoke: ${passed} passed, 0 failed`);
  console.log("cognitive_estado_civil_bridge.smoke: ok");
} else {
  console.error(`cognitive_estado_civil_bridge.smoke: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
