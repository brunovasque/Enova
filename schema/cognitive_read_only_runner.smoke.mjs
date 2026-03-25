import assert from "node:assert/strict";

const cognitiveModule = await import(new URL("../cognitive/src/run-cognitive.js", import.meta.url).href);
const fixturesModule = await import(new URL("../cognitive/fixtures/read-only-cases.js", import.meta.url).href);

const {
  getReadOnlyCognitiveFixtureById,
  listReadOnlyCognitiveFixtures,
  runReadOnlyCognitiveEngine,
  validateReadOnlyCognitiveResponse
} = cognitiveModule;
const { READ_ONLY_COGNITIVE_FIXTURES } = fixturesModule;

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

  const result = runReadOnlyCognitiveEngine(fixture.input);
  assert.equal(result?.mode, "read_only_test");
  assert.equal(result?.request?.message_text, fixture.input.message_text);

  const validation = validateReadOnlyCognitiveResponse(result?.response);
  assert.equal(validation.valid, true, `${scenarioId} invalid response: ${validation.errors.join(", ")}`);
  assert.equal(result?.validation?.valid, true, `${scenarioId} internal validation failed`);

  for (const slotName of fixture.expected.required_slots) {
    assert.ok(result.response.slots_detected[slotName], `${scenarioId} missing slot ${slotName}`);
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

assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "multiplos_slots"), true);

console.log("cognitive_read_only_runner.smoke: ok");
