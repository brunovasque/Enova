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

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  assert.equal(result?.engine?.llm_attempted, true, `${scenarioId} must attempt openai path`);
  assert.equal(result?.engine?.llm_used, true, `${scenarioId} must exercise openai path`);
  assert.equal(result?.engine?.llm_error, null, `${scenarioId} should not include llm error`);
  assert.equal(result?.engine?.fallback_used, false, `${scenarioId} should not fallback`);
  assert.equal(result?.engine?.model, "gpt-4.1-mini");
  assert.equal(typeof result?.llm_raw_response, "string", `${scenarioId} llm_raw_response must be string`);
  assert.ok(result?.llm_raw_response?.trim(), `${scenarioId} llm_raw_response must not be empty`);
  assert.ok(result?.llm_parsed_response && typeof result?.llm_parsed_response === "object", `${scenarioId} llm_parsed_response must be object`);

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

  assert.equal(fallbackResult?.engine?.llm_attempted, false);
  assert.equal(fallbackResult?.engine?.llm_used, false);
  assert.equal(fallbackResult?.engine?.llm_error, null);
  assert.equal(fallbackResult?.engine?.fallback_used, true);
  assert.ok(fallbackResult?.engine?.fallback_reason);
  assert.equal(fallbackResult?.response?.should_advance_stage, false);
  assert.equal(fallbackResult?.llm_raw_response, null);
  assert.equal(fallbackResult?.llm_parsed_response, null);
}

{
  const llmErrorResult = await runReadOnlyCognitiveEngine(
    {
      conversation_id: "fallback-llm-error-001",
      current_stage: "renda",
      message_text: "Sou autônomo e tenho renda de 2000.",
      pending_slots: ["regime_trabalho", "renda"]
    },
    {
      openaiApiKey: "test-openai-key",
      model: "gpt-4.1-mini",
      fetchImpl: async () => {
        throw new Error("boom");
      }
    }
  );

  assert.equal(llmErrorResult?.engine?.llm_attempted, true);
  assert.equal(llmErrorResult?.engine?.llm_used, false);
  assert.equal(llmErrorResult?.engine?.llm_error, "openai_fetch_failed");
  assert.equal(llmErrorResult?.engine?.fallback_used, true);
  assert.ok(llmErrorResult?.engine?.fallback_reason);
  assert.equal(llmErrorResult?.response?.should_advance_stage, false);
  assert.equal(llmErrorResult?.llm_raw_response, null);
  assert.equal(llmErrorResult?.llm_parsed_response, null);
}

{
  const conversionScenarios = [
    {
      id: "cliente_evasivo",
      input: {
        conversation_id: "conv-cta-001",
        current_stage: "renda",
        message_text: "depois eu vejo isso",
        pending_slots: ["renda"]
      },
      mustInclude: ["quanto antes", "renda média mensal"],
      mustMatch: /(me informa|me confirma|me manda|quer que eu)/i
    },
    {
      id: "cliente_sem_tempo",
      input: {
        conversation_id: "conv-cta-002",
        current_stage: "renda",
        message_text: "não tenho tempo agora",
        pending_slots: ["renda"]
      },
      mustInclude: ["é rapidinho", "renda média mensal"],
      mustMatch: /(me informa|me confirma|me manda|quer que eu)/i
    },
    {
      id: "cliente_recusa_online",
      input: {
        conversation_id: "conv-cta-003",
        current_stage: "finalizacao_processo",
        message_text: "não quero atendimento online",
        pending_slots: ["visita"]
      },
      mustInclude: ["plantão", "horário de visita"],
      mustMatch: /(me informa|me confirma|me manda|quer que eu)/i
    },
    {
      id: "cliente_com_duvida",
      input: {
        conversation_id: "conv-cta-004",
        current_stage: "renda",
        message_text: "antes disso, qual valor de entrada e parcela de um imóvel?",
        pending_slots: ["renda"]
      },
      mustInclude: ["preciso fechar esta etapa", "renda média mensal"],
      mustMatch: /(me informa|me confirma|me manda|quer que eu)/i
    },
    {
      id: "cliente_pronto_para_avancar",
      input: {
        conversation_id: "conv-cta-005",
        current_stage: "envio_docs",
        message_text: "já estou pronto para avançar",
        pending_slots: ["docs"]
      },
      mustInclude: ["documentos básicos", "adianto sua análise"],
      mustMatch: /(me informa|me confirma|me manda|quer que eu)/i
    }
  ];

  for (const scenario of conversionScenarios) {
    const result = await runReadOnlyCognitiveEngine(scenario.input, llmRuntime);
    const replyText = String(result?.response?.reply_text || "");

    assert.equal(result?.response?.should_advance_stage, false, `${scenario.id} must stay read-only`);
    assert.notEqual(replyText.trim(), "", `${scenario.id} reply_text must not be empty`);

    for (const expectedSnippet of scenario.mustInclude) {
      assert.match(
        normalizeForMatch(replyText),
        new RegExp(escapeRegex(normalizeForMatch(expectedSnippet))),
        `${scenario.id} must include ${expectedSnippet}`
      );
    }

    assert.match(replyText, scenario.mustMatch, `${scenario.id} must keep clear next action`);
  }
}

assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "multiplos_slots"), true);

console.log("cognitive_read_only_runner.smoke: ok");
