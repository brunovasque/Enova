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

function assertCleanPortugueseText(value, label) {
  const text = String(value || "");
  assert.equal(text, text.normalize("NFC"), `${label} must keep NFC-composed accents`);
  assert.doesNotMatch(text, /Ã[¡-ÿ]|Â[^\sa-zA-Z0-9]|�/, `${label} must not contain mojibake or replacement chars`);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const llmRuntime = {
  openaiApiKey: "test-openai-key",
  model: "gpt-4.1-mini",
  fetchImpl: createMockOpenAIFetch()
};

assert.ok(listReadOnlyCognitiveFixtures().length >= 32);

const scenarioIds = [
  "autonomo_sem_ir",
  "casado_civil",
  "composicao_familiar",
  "fora_fluxo_duvida",
  "resposta_ambigua",
  "docs_clt_objecao_duvida",
  "docs_autonomo_site_depois",
  "correspondente_sem_retorno_ansioso",
  "correspondente_aprovado_insiste_detalhes",
  "visita_remarcar_sem_promessa",
  "visita_resistencia_por_que",
  "aluguel_ponte_conversao",
  "docs_multi_renda",
  "docs_multi_renda_multi_regime",
  "autonomo_sem_ir_regra",
  "renda_formal_abaixo_3mil_composicao",
  "dependente_solo_abaixo_4mil",
  "dependente_solo_acima_4mil",
  "ctps_36_meses",
  "reprovacao_scr_bacen",
  "reprovacao_sinad_conres",
  "reprovacao_comprometimento_renda",
  "visita_falta_envio_online",
  "visita_decisores_presentes",
  "moro_junto_sem_uniao_estavel",
  "moramos_juntos_sem_uniao_estavel",
  "uniao_estavel_explicita",
  "uniao_estavel_solo",
  "uniao_estavel_conjunto",
  "casado_civil_conjunto_obrigatorio",
  "clt_fixo_holerite_quantidade",
  "clt_variavel_holerite_quantidade",
  "autonomo_com_ir_docs_microregra",
  "autonomo_sem_ir_docs_microregra",
  "renda_extra_abaixo_2550_microregra",
  "renda_extra_acima_2550_microregra",
  "multi_renda_multi_regime_microregra",
  "composicao_participantes_docs_microregra",
  "duvida_identificacao_rg_cnh_cpf_microregra",
  "duvida_comprovante_residencia_microregra"
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
  assertCleanPortugueseText(result.response.reply_text, `${scenarioId} reply_text`);

  for (const slotName of fixture.expected.required_slots) {
    assert.ok(result.response.slots_detected[slotName], `${scenarioId} missing slot ${slotName}`);
  }

  if (fixture.expected.required_slots.length > 0) {
    assert.ok(Object.keys(result.response.slots_detected).length > 0, `${scenarioId} slots_detected should not be empty`);
  }

  if (scenarioId === "autonomo_sem_ir") {
    assert.equal(result.response.slots_detected.renda?.value, 2500);
    assert.ok(result?.llm_parsed_response?.reply_text?.trim(), `${scenarioId} parsed reply_text must not be empty`);
    assert.notEqual(String(result.response.reply_text || "").trim(), "", `${scenarioId} final reply_text must not be empty`);
    assert.equal(Object.keys(result.response.slots_detected || {}).length > 0, true, `${scenarioId} slots_detected must not be empty`);
    assert.equal(result?.engine?.llm_used, true, `${scenarioId} must keep llm_used true`);
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

  const replyNormalized = normalizeForMatch(result.response.reply_text);
  if (scenarioId === "docs_clt_objecao_duvida") {
    assert.match(replyNormalized, /pelo seu perfil/);
    assert.match(replyNormalized, /o ideal e separar/);
    assert.match(replyNormalized, /rg ou cnh com cpf/);
    assert.match(replyNormalized, /holerite/);
    assert.match(replyNormalized, /ctps/);
    assert.match(replyNormalized, /seguranca|segurança/);
    assert.match(replyNormalized, /documentos basicos por aqui/);
  }
  if (scenarioId === "docs_autonomo_site_depois") {
    assert.match(replyNormalized, /pelo seu perfil/);
    assert.match(replyNormalized, /o ideal e separar/);
    assert.match(replyNormalized, /extratos bancarios recentes/);
    assert.match(replyNormalized, /nao confirmado/);
    assert.match(replyNormalized, /preferir pode enviar pelo site com tranquilidade/);
    assert.match(replyNormalized, /quanto antes voce me enviar os documentos/);
  }
  if (scenarioId === "correspondente_sem_retorno_ansioso") {
    assert.match(replyNormalized, /sigo acompanhando com voce/);
    assert.match(replyNormalized, /enquanto nao houver retorno do correspondente/);
    assert.doesNotMatch(replyNormalized, /r\$\s*\d|valor aprovado de|credito liberado de/);
  }
  if (scenarioId === "correspondente_aprovado_insiste_detalhes") {
    assert.match(replyNormalized, /queria muito conseguir te abrir isso por aqui/);
    assert.match(replyNormalized, /realmente nao tenho acesso ao sistema de aprovacao/);
    assert.match(replyNormalized, /houve aprovacao/);
    assert.match(replyNormalized, /corretor vasques no plantao/);
    assert.doesNotMatch(replyNormalized, /r\$\s*\d|valor aprovado de|credito liberado de|taxa de juros de/);
  }
  if (scenarioId === "visita_remarcar_sem_promessa") {
    assert.match(replyNormalized, /a gente consegue remarcar/);
    assert.match(replyNormalized, /dias e horarios oficiais do plantao/);
    assert.match(replyNormalized, /ja vejo um horario dentro da agenda oficial do plantao/);
  }
  if (scenarioId === "visita_resistencia_por_que") {
    assert.match(replyNormalized, /a visita e o momento de te mostrar o processo com mais clareza/);
    assert.match(replyNormalized, /sem criar expectativa errada/);
    assert.match(replyNormalized, /ja vejo um horario dentro da agenda oficial do plantao/);
  }
  if (scenarioId === "aluguel_ponte_conversao") {
    assert.match(replyNormalized, /nao trabalha com aluguel/);
    assert.match(replyNormalized, /financiamento do seu proprio imovel|financiamento do seu próprio imóvel/);
  }
  if (scenarioId === "docs_multi_renda") {
    assert.match(replyNormalized, /comprovacao da renda extra usada na composicao|comprovação da renda extra usada na composição/);
    assert.match(replyNormalized, /extratos bancarios recentes para comprovar movimentacao da renda extra|extratos bancários recentes para comprovar movimentação da renda extra/);
    assert.match(replyNormalized, /nao confirmado/);
  }
  if (scenarioId === "docs_multi_renda_multi_regime") {
    assert.match(replyNormalized, /comprovantes de renda de todos os regimes envolvidos na composicao|comprovantes de renda de todos os regimes envolvidos na composição/);
    assert.match(replyNormalized, /documentos pessoais e de renda do parceiro na composicao|documentos pessoais e de renda do parceiro na composição/);
  }
  if (scenarioId === "autonomo_sem_ir_regra") {
    assert.match(replyNormalized, /ate 29 de maio ainda da para declarar ir|até 29 de maio ainda dá para declarar ir/);
    assert.match(replyNormalized, /compor renda com alguem proximo|compor renda com alguém próximo|composicao com alguem proximo|composição com alguém próximo/);
    assert.match(replyNormalized, /abaixo de 3 mil/);
  }
  if (scenarioId === "renda_formal_abaixo_3mil_composicao") {
    assert.match(replyNormalized, /renda formal esta abaixo de 3 mil|renda formal está abaixo de 3 mil/);
    assert.match(replyNormalized, /vale muito a pena compor com alguem proximo|vale muito a pena compor com alguém próximo/);
  }
  if (scenarioId === "dependente_solo_abaixo_4mil") {
    assert.match(replyNormalized, /processo solo com renda formal abaixo de 4 mil/);
    assert.match(replyNormalized, /filho menor de 18 anos/);
    assert.match(replyNormalized, /dependente sem renda ate terceiro grau|dependente sem renda até terceiro grau/);
  }
  if (scenarioId === "dependente_solo_acima_4mil") {
    assert.match(replyNormalized, /acima de 4 mil/);
    assert.match(replyNormalized, /podemos pular dependente/);
  }
  if (scenarioId === "ctps_36_meses") {
    assert.match(replyNormalized, /36 meses de registro em ctps/);
    assert.match(replyNormalized, /reduzir taxa de juros/);
    assert.match(replyNormalized, /aumentar seu valor financiado/);
  }
  if (scenarioId === "reprovacao_scr_bacen") {
    assert.match(replyNormalized, /scr\/bacen/);
    assert.match(replyNormalized, /registrato/);
    assert.match(replyNormalized, /extrato dos ultimos 6 meses|extrato dos últimos 6 meses/);
  }
  if (scenarioId === "reprovacao_sinad_conres") {
    assert.match(replyNormalized, /sinad|conres/);
    assert.match(replyNormalized, /agencia da caixa|agência da caixa/);
    assert.match(replyNormalized, /gerente de pessoa fisica|gerente de pessoa física/);
  }
  if (scenarioId === "reprovacao_comprometimento_renda") {
    assert.match(replyNormalized, /comprometimento de renda/);
    assert.match(replyNormalized, /limite de comprometimento e 30% da renda|limite de comprometimento é 30% da renda/);
  }
  if (scenarioId === "visita_falta_envio_online" || scenarioId === "visita_decisores_presentes") {
    assert.match(replyNormalized, /convido para o plantao com os documentos do seu perfil|convido para o plantão com os documentos do seu perfil/);
    assert.match(replyNormalized, /poder de decisao|poder de decisão/);
    assert.match(replyNormalized, /evitar perda de tempo/);
  }
  if (scenarioId === "uniao_estavel_solo") {
    assert.match(replyNormalized, /uniao estavel|união estável/);
    assert.match(replyNormalized, /pode seguir solo ou em conjunto/);
    assert.match(replyNormalized, /nao ha reclassificacao automatica|não há reclassificação automática/);
  }
  if (scenarioId === "moro_junto_sem_uniao_estavel" || scenarioId === "moramos_juntos_sem_uniao_estavel") {
    assert.equal(result.response.slots_detected.estado_civil, undefined, `${scenarioId} must not infer estado_civil as uniao_estavel`);
    assert.match(replyNormalized, /nao define uniao estavel|não define união estável/);
    assert.match(replyNormalized, /pode seguir solo ou em conjunto/);
  }
  if (scenarioId === "uniao_estavel_explicita") {
    assert.equal(result.response.slots_detected.estado_civil?.value, "uniao_estavel");
    assert.match(replyNormalized, /uniao estavel|união estável/);
    assert.match(replyNormalized, /solo ou em conjunto/);
  }
  if (scenarioId === "uniao_estavel_conjunto") {
    assert.match(replyNormalized, /uniao estavel|união estável/);
    assert.match(replyNormalized, /pode seguir em conjunto/);
  }
  if (scenarioId === "casado_civil_conjunto_obrigatorio") {
    assert.match(replyNormalized, /casamento civil/);
    assert.match(replyNormalized, /sempre em conjunto/);
  }
  if (scenarioId === "clt_fixo_holerite_quantidade") {
    assert.match(replyNormalized, /somente o ultimo holerite|somente o último holerite/);
    assert.doesNotMatch(replyNormalized, /ultimos 3 holerites|últimos 3 holerites/);
  }
  if (scenarioId === "clt_variavel_holerite_quantidade") {
    assert.match(replyNormalized, /ultimos 3 holerites|últimos 3 holerites/);
  }
  if (scenarioId === "autonomo_com_ir_docs_microregra") {
    assert.match(replyNormalized, /declaracao de ir|declaração de ir/);
    assert.match(replyNormalized, /recibo de entrega/);
  }
  if (scenarioId === "autonomo_sem_ir_docs_microregra") {
    assert.match(replyNormalized, /ate 29 de maio|até 29 de maio/);
    assert.match(replyNormalized, /ultimos 6 extratos de movimentacao bancaria|ultimos 6 extratos bancarios recentes de movimentacao bancaria|últimos 6 extratos de movimentação bancária|últimos 6 extratos bancários recentes de movimentação bancária/);
  }
  if (scenarioId === "renda_extra_abaixo_2550_microregra") {
    assert.match(replyNormalized, /comprovacao da renda extra usada na composicao|comprovação da renda extra usada na composição/);
    assert.match(replyNormalized, /extratos bancarios recentes para comprovar movimentacao da renda extra|extratos bancários recentes para comprovar movimentação da renda extra/);
    assert.match(replyNormalized, /nao confirmado|não confirmado/);
  }
  if (scenarioId === "renda_extra_acima_2550_microregra") {
    assert.match(replyNormalized, /acima de 2550/);
    assert.match(replyNormalized, /renda extra pode ser dispensada na estrategia|renda extra pode ser dispensada na estratégia/);
  }
  if (scenarioId === "multi_renda_multi_regime_microregra") {
    assert.match(replyNormalized, /comprovantes de renda de todos os regimes envolvidos na composicao|comprovantes de renda de todos os regimes envolvidos na composição/);
  }
  if (scenarioId === "composicao_participantes_docs_microregra") {
    assert.match(replyNormalized, /documentos pessoais e de renda do parceiro na composicao|documentos pessoais e de renda do parceiro na composição/);
    assert.match(replyNormalized, /documentos pessoais e de renda da terceira pessoa \(p3\) na composicao|documentos pessoais e de renda da terceira pessoa \(p3\) na composição/);
  }
  if (scenarioId === "duvida_identificacao_rg_cnh_cpf_microregra") {
    assert.match(replyNormalized, /rg ou cnh com cpf/);
    assert.match(replyNormalized, /nao confirmado|não confirmado/);
  }
  if (scenarioId === "duvida_comprovante_residencia_microregra") {
    assert.match(replyNormalized, /comprovante de residencia atualizado|comprovante de residência atualizado/);
    assert.match(replyNormalized, /nao confirmado|não confirmado/);
  }
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
  const parsedReplyPriorityResult = await runReadOnlyCognitiveEngine(
    {
      conversation_id: "priority-reply-001",
      current_stage: "renda",
      message_text: "Antes disso, qual valor de entrada e parcela de um imóvel?",
      pending_slots: ["renda"]
    },
    {
      openaiApiKey: "test-openai-key",
      model: "gpt-4.1-mini",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply_text: "RESPOSTA PARSEADA DO MODELO",
                    slots_detected: {},
                    pending_slots: ["renda"],
                    conflicts: [],
                    suggested_next_slot: "renda",
                    consultive_notes: [],
                    should_request_confirmation: false,
                    should_advance_stage: false,
                    confidence: 0.9
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    }
  );

  assert.equal(parsedReplyPriorityResult?.engine?.llm_used, true);
  assert.equal(parsedReplyPriorityResult?.llm_parsed_response?.reply_text, "RESPOSTA PARSEADA DO MODELO");
  assert.match(
    parsedReplyPriorityResult?.response?.reply_text || "",
    /^RESPOSTA PARSEADA DO MODELO/,
    "final reply_text must preserve parsed reply_text even when heuristic fallback is available"
  );
  assertCleanPortugueseText(parsedReplyPriorityResult?.response?.reply_text, "parsed reply priority");
}

{
  const encodingRepairResult = await runReadOnlyCognitiveEngine(
    {
      conversation_id: "encoding-repair-001",
      current_stage: "renda",
      message_text: "Minha renda é 3000.",
      pending_slots: ["renda"]
    },
    {
      openaiApiKey: "test-openai-key",
      model: "gpt-4.1-mini",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply_text: "NÃ£o se preocupe, sua anÃ¡lise segue com aprovaÃ§Ã£o consultiva.",
                    slots_detected: {
                      renda: {
                        value: 3000,
                        confidence: 0.93,
                        evidence: "3000",
                        source: "openai_cognitive"
                      }
                    },
                    pending_slots: ["renda"],
                    conflicts: [],
                    suggested_next_slot: "renda",
                    consultive_notes: [],
                    should_request_confirmation: false,
                    should_advance_stage: false,
                    confidence: 0.93
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    }
  );

  const replyText = String(encodingRepairResult?.response?.reply_text || "");
  assert.match(replyText, /Não se preocupe, sua análise segue com aprovação consultiva\./);
  assertCleanPortugueseText(replyText, "encoding repair reply_text");
}

{
  const phaseNormalizationScenarios = [
    {
      id: "normalize_phase_docs",
      request: {
        conversation_id: "normalize-phase-docs-001",
        current_stage: "renda",
        message_text: "Quais documentos preciso enviar?",
        known_slots: {
          regime_trabalho: "clt",
          composicao: "sozinho",
          ir_declarado: "sim"
        },
        pending_slots: ["renda"]
      },
      modelPayload: {
        reply_text: "RESPOSTA ANTIGA DO MODELO",
        slots_detected: {},
        pending_slots: ["docs"],
        conflicts: [],
        suggested_next_slot: "docs",
        consultive_notes: [],
        should_request_confirmation: false,
        should_advance_stage: false,
        confidence: 0.9
      },
      mustInclude: ["pelo seu perfil", "o ideal é separar", "documentos básicos por aqui"]
    },
    {
      id: "normalize_phase_correspondente",
      request: {
        conversation_id: "normalize-phase-cor-001",
        current_stage: "renda",
        message_text: "Me fala valor aprovado e taxa.",
        known_slots: {
          correspondente: "aprovado",
          retorno_correspondente_status: "aprovado"
        },
        pending_slots: ["renda"]
      },
      modelPayload: {
        reply_text: "RESPOSTA ANTIGA DO MODELO",
        slots_detected: {},
        pending_slots: ["correspondente"],
        conflicts: [],
        suggested_next_slot: "correspondente",
        consultive_notes: [],
        should_request_confirmation: false,
        should_advance_stage: false,
        confidence: 0.9
      },
      mustInclude: ["queria muito conseguir te abrir isso por aqui", "não tenho acesso ao sistema de aprovação", "corretor vasques no plantão"]
    },
    {
      id: "normalize_phase_visita",
      request: {
        conversation_id: "normalize-phase-visita-001",
        current_stage: "renda",
        message_text: "Pra que precisa visitar? Prefiro não visitar agora.",
        known_slots: {},
        pending_slots: ["renda"]
      },
      modelPayload: {
        reply_text: "RESPOSTA ANTIGA DO MODELO",
        slots_detected: {},
        pending_slots: ["visita"],
        conflicts: [],
        suggested_next_slot: "visita",
        consultive_notes: [],
        should_request_confirmation: false,
        should_advance_stage: false,
        confidence: 0.9
      },
      mustInclude: ["sem criar expectativa errada", "agenda oficial do plantão", "horário dentro da agenda oficial do plantão"]
    }
  ];

  for (const scenario of phaseNormalizationScenarios) {
    const result = await runReadOnlyCognitiveEngine(scenario.request, {
      openaiApiKey: "test-openai-key",
      model: "gpt-4.1-mini",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(scenario.modelPayload)
                }
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    });

    const replyText = String(result?.response?.reply_text || "");
    const normalized = normalizeForMatch(replyText);

    assert.equal(result?.engine?.llm_used, true, `${scenario.id} should use llm path`);
    assert.equal(result?.response?.should_advance_stage, false, `${scenario.id} must keep should_advance_stage=false`);
    assertCleanPortugueseText(replyText, `${scenario.id} reply_text`);
    assert.doesNotMatch(
      normalized,
      /resposta antiga do modelo|entendi, mas ainda preciso de um ponto objetivo/,
      `${scenario.id} must not fallback to generic heuristic or raw model reply`
    );

    for (const snippet of scenario.mustInclude) {
      assert.match(
        normalized,
        new RegExp(escapeRegex(normalizeForMatch(snippet))),
        `${scenario.id} must include phase guidance snippet: ${snippet}`
      );
    }
  }
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
      mustInclude: ["posso te orientar de forma consultiva", "renda média mensal"],
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
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "docs_clt_objecao_duvida"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "correspondente_aprovado_insiste_detalhes"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "visita_resistencia_por_que"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "aluguel_ponte_conversao"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "docs_multi_renda"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "docs_multi_renda_multi_regime"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "autonomo_sem_ir_regra"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "renda_formal_abaixo_3mil_composicao"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "dependente_solo_abaixo_4mil"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "dependente_solo_acima_4mil"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "ctps_36_meses"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "reprovacao_scr_bacen"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "reprovacao_sinad_conres"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "reprovacao_comprometimento_renda"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "visita_falta_envio_online"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "visita_decisores_presentes"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "uniao_estavel_solo"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "uniao_estavel_conjunto"), true);
assert.equal(READ_ONLY_COGNITIVE_FIXTURES.some((fixture) => fixture.id === "casado_civil_conjunto_obrigatorio"), true);

console.log("cognitive_read_only_runner.smoke: ok");
