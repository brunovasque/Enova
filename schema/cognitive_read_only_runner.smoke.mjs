import assert from "node:assert/strict";

const cognitiveModule = await import(new URL("../cognitive/src/run-cognitive.js", import.meta.url).href);
const fixturesModule = await import(new URL("../cognitive/fixtures/read-only-cases.js", import.meta.url).href);
const openaiMockModule = await import(new URL("./cognitive_openai_mock.mjs", import.meta.url).href);

const {
  getReadOnlyCognitiveFixtureById,
  listReadOnlyCognitiveFixtures,
  runReadOnlyCognitiveEngine,
  validateReadOnlyCognitiveResponse
} = cognitiveModule;
const { READ_ONLY_COGNITIVE_FIXTURES } = fixturesModule;
const { createMockOpenAIFetch } = openaiMockModule;

const llmRuntime = {
  openaiApiKey: "test-openai-key",
  model: "gpt-4.1-mini",
  fetchImpl: createMockOpenAIFetch()
};

assert.ok(listReadOnlyCognitiveFixtures().length >= 10);

const scenarioIds = [
  "autonomo_sem_ir",
  "casado_civil",
  "composicao_familiar",
  "fora_fluxo_duvida",
  "resposta_ambigua"
];

for (const scenarioId of scenarioIds) {
  const fixture = getReadOnlyCognitiveFixtureById(scenarioId);
  assert.ok(fixture, `fixture not found: ${scenarioId}`);

  const result = await runReadOnlyCognitiveEngine(fixture.input, llmRuntime);
  assert.equal(result?.mode, "read_only_test");
  assert.equal(result?.request?.message_text, fixture.input.message_text);
  assert.equal(result?.engine?.llm_used, true, `${scenarioId} must exercise openai path`);
  assert.equal(result?.engine?.model, "gpt-4.1-mini");

  const validation = validateReadOnlyCognitiveResponse(result?.response);
  assert.equal(validation.valid, true, `${scenarioId} invalid response: ${validation.errors.join(", ")}`);
  assert.equal(result?.validation?.valid, true, `${scenarioId} internal validation failed`);
  assert.notEqual(result.response.reply_text.trim(), "", `${scenarioId} reply_text must not be empty`);

  for (const slotName of fixture.expected.required_slots) {
    assert.ok(result.response.slots_detected[slotName], `${scenarioId} missing slot ${slotName}`);
  }

  if (fixture.expected.required_slots.length > 0) {
    assert.ok(Object.keys(result.response.slots_detected).length > 0, `${scenarioId} slots_detected should not be empty`);
  }

  if (scenarioId === "autonomo_sem_ir") {
    assert.equal(result.response.slots_detected.renda?.value, 2500);
  }
  if (scenarioId === "composicao_familiar") {
    assert.equal(result.response.slots_detected.renda?.value, 1900);
  }

  assert.equal(
    result.response.should_request_confirmation,
    fixture.expected.should_request_confirmation,
    `${scenarioId} confirmation mismatch`
  );
  assert.ok(
    result.response.confidence >= fixture.expected.min_confidence,
    `${scenarioId} confidence below expected floor`
  );
  assert.equal(result.response.should_advance_stage, false, `${scenarioId} must stay read-only`);
}

{
  const fallbackResult = await runReadOnlyCognitiveEngine({
    conversation_id: "fallback-001",
    current_stage: "renda",
    message_text: "Estou em dúvida sobre a parcela.",
    pending_slots: ["renda"]
  });

  assert.equal(fallbackResult?.engine?.llm_used, false);
  assert.ok(fallbackResult?.engine?.fallback_reason);
  assert.equal(fallbackResult?.response?.should_advance_stage, false);
}

assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "multiplos_slots"), true);

console.log("cognitive_read_only_runner.smoke: ok");
