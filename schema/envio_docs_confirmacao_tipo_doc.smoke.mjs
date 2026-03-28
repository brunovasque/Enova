import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  handleDocumentUpload,
  resolveEnvioDocsNextPendingItemForClient,
  buildAnaliseDocsPayloadFromEnvio,
  buildEnvioDocsPlausiveisPendentesConferenciaFromState,
  buildPacoteCorrespondentePayloadFromState
} = workerModule;

function buildEnv(initialState = {}) {
  const waId = initialState.wa_id || "5541997770001";
  return {
    ENV_MODE: "test",
    TELEMETRIA_LEVEL: "verbose",
    MISTRAL_API_KEY_TEST: "test-key",
    __enovaSimulationCtx: {
      active: true,
      dryRun: true,
      suppressExternalSend: true,
      wouldSend: false,
      sendPreview: null,
      messageLog: [],
      writeLog: [],
      writesByWaId: {},
      stateByWaId: {
        [waId]: {
          wa_id: waId,
          fase_conversa: "envio_docs",
          envio_docs_lista_enviada: true,
          docs_lista_enviada: true,
          canal_docs_escolhido: "whatsapp",
          ...initialState
        }
      }
    }
  };
}

function getState(env, waId) {
  return env.__enovaSimulationCtx.stateByWaId[waId];
}

function buildPdfFetch(text) {
  return async (_url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    assert.equal(body?.document?.type, "document_url");
    return new Response(
      JSON.stringify({
        pages: [{ markdown: text }],
        confidence: 0.88
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
}

// 1) upload plausivel_incerto -> arquivo salvo, checklist intacto e status aguardando_confirmacao_tipo_doc
{
  const waId = "5541997771001";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "comprovante_renda", participante: "titular", bucket: "obrigatorio", status: "pendente" },
      { tipo: "comprovante_renda", participante: "conjuge", bucket: "obrigatorio", status: "pendente" }
    ],
    last_message_id: "wamid.upload.plausivel.1"
  });
  const st = getState(env, waId);
  const resposta = await handleDocumentUpload(env, st, {
    type: "document",
    message_id: "wamid.upload.plausivel.1",
    document: {
      id: "media-plausivel-1",
      mime_type: "application/pdf",
      filename: "holerite-ambiguous.pdf",
      base64: "ZmFrZQ=="
    }
  }, {
    fetchImpl: buildPdfFetch("Holerite mensal com vencimentos e salário líquido.")
  });

  const stAfter = getState(env, waId);
  assert.equal(resposta.keepStage, "envio_docs");
  assert.equal(stAfter.fase_docs, "aguardando_confirmacao_tipo_doc");
  assert.equal(String(stAfter.docs_status_texto || "").startsWith("pendente_confirmacao_tipo_doc::"), true);
  assert.equal(Boolean(stAfter.docs_status_geral), true);
  assert.equal(
    stAfter.envio_docs_itens_json.every((item) => item.status === "pendente"),
    true
  );
}

// 2) texto solto sem último arquivo pendente não classifica doc
{
  const waId = "5541997771002";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    last_message_id_prev: "wamid.qualquer.prev",
    last_message_id: "wamid.text.solto.1"
  });
  const st = getState(env, waId);
  const resposta = await handleDocumentUpload(env, st, {
    type: "text_signal",
    text_signal: true,
    caption: "é meu holerite",
    message_id: "wamid.text.solto.1"
  });
  const stAfter = getState(env, waId);
  assert.equal(resposta.keepStage, "envio_docs");
  assert.equal(stAfter.envio_docs_itens_json[0].status, "pendente");
  assert.equal(stAfter.fase_docs || null, null);
}

// 3) texto fora do status de confirmação não classifica doc
{
  const waId = "5541997771003";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    envio_docs_confirmacao_tipo_doc_status: null,
    envio_docs_ultimo_upload_pendente_confirmacao_json: {
      upload_id: "upload-pendente-fora-status",
      upload_message_id: "wamid.upload.prev",
      candidate_items: [{ tipo: "holerite", participante: "p1" }],
      media_ref: { media_id: "media-prev", mime_type: "application/pdf", file_name: "pendente.pdf" }
    },
    last_message_id_prev: "wamid.upload.prev",
    last_message_id: "wamid.text.solto.2"
  });
  const st = getState(env, waId);
  const resposta = await handleDocumentUpload(env, st, {
    type: "text_signal",
    text_signal: true,
    caption: "é meu holerite",
    message_id: "wamid.text.solto.2"
  });
  const stAfter = getState(env, waId);
  assert.equal(resposta.keepStage, "envio_docs");
  assert.equal(stAfter.envio_docs_itens_json[0].status, "pendente");
}

// 4) arquivo fora de ordem reconhecido forte entra no checklist certo sem trocar a pendência principal ativa
{
  const waId = "5541997771004";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    last_message_id: "wamid.upload.foraordem.1"
  });
  const st = getState(env, waId);
  const resposta = await handleDocumentUpload(env, st, {
    type: "document",
    message_id: "wamid.upload.foraordem.1",
    document: {
      id: "media-fora-ordem-1",
      mime_type: "application/pdf",
      filename: "holerite.pdf",
      base64: "ZmFrZQ=="
    }
  }, {
    fetchImpl: buildPdfFetch("Holerite mensal com vencimentos, salário base e valor líquido.")
  });

  const stAfter = getState(env, waId);
  const nextPending = resolveEnvioDocsNextPendingItemForClient(stAfter.envio_docs_itens_json);
  assert.equal(resposta.keepStage, "envio_docs");
  assert.equal(Array.isArray(stAfter.envio_docs_itens_json), true);
  assert.equal(nextPending?.tipo, "identidade_cpf");
}

// 5) plausivel_incerto + confirmação textual válida atualiza checklist e preserva pendência principal
{
  const waId = "5541997771005";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    envio_docs_confirmacao_tipo_doc_status: "aguardando_confirmacao_tipo_doc",
    envio_docs_ultimo_upload_pendente_confirmacao_json: {
      upload_id: "upload-confirmar-1",
      upload_message_id: "wamid.upload.confirmar.1",
      detected_doc_type: "holerite",
      candidate_items: [{ tipo: "holerite", participante: "p1" }],
      media_ref: {
        media_id: "media-confirmar-1",
        mime_type: "application/pdf",
        file_name: "arquivo-pendente.pdf",
        url: "https://example.com/arquivo-pendente.pdf"
      },
      pergunta_confirmacao: "Recebi seu arquivo, mas não consegui confirmar sozinho. Esse arquivo é mesmo seu holerite?"
    },
    envio_docs_ultima_pergunta_confirmacao_id: "upload-confirmar-1",
    last_message_id_prev: "wamid.upload.confirmar.1",
    last_message_id: "wamid.text.confirmar.1"
  });
  const st = getState(env, waId);
  const resposta = await handleDocumentUpload(env, st, {
    type: "text_signal",
    text_signal: true,
    caption: "é meu holerite",
    message_id: "wamid.text.confirmar.1"
  });
  const stAfter = getState(env, waId);
  const nextPending = resolveEnvioDocsNextPendingItemForClient(stAfter.envio_docs_itens_json);
  assert.equal(resposta.keepStage, "envio_docs");
  assert.equal(Array.isArray(stAfter.envio_docs_itens_json), true);
  assert.equal(stAfter.fase_docs, "envio_documentos");
  assert.equal(String(stAfter.docs_status_texto || "").includes("Pendências atuais"), true);
  assert.equal(nextPending?.tipo, "identidade_cpf");
}

// 6) anti-loop local: mesma confirmação não reaplica e mesma pergunta não se repete para o mesmo upload
{
  const waId = "5541997771006";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    envio_docs_confirmacao_tipo_doc_status: "aguardando_confirmacao_tipo_doc",
    envio_docs_ultimo_upload_pendente_confirmacao_json: {
      upload_id: "upload-loop-1",
      upload_message_id: "wamid.upload.loop.1",
      detected_doc_type: "holerite",
      candidate_items: [{ tipo: "holerite", participante: "p1" }],
      media_ref: { media_id: "media-loop-1", mime_type: "application/pdf", file_name: "loop.pdf" },
      pergunta_confirmacao: "Recebi seu arquivo, mas não consegui confirmar sozinho. Esse arquivo é mesmo seu holerite?"
    },
    envio_docs_ultima_pergunta_confirmacao_id: "upload-loop-1",
    last_message_id_prev: "wamid.upload.loop.1",
    last_message_id: "wamid.text.loop.1"
  });
  const st = getState(env, waId);
  const invalid1 = await handleDocumentUpload(env, st, {
    type: "text_signal",
    text_signal: true,
    caption: "ok",
    message_id: "wamid.text.loop.1"
  });
  const invalid2 = await handleDocumentUpload(env, st, {
    type: "text_signal",
    text_signal: true,
    caption: "ok",
    message_id: "wamid.text.loop.1"
  });
  assert.equal(
    (
      invalid1.message.join("\n").includes("último arquivo enviado") ||
      invalid1.message.join("\n").includes("Esse arquivo é mesmo")
    ),
    true
  );
  assert.equal(
    (
      invalid2.message.join("\n").includes("último arquivo enviado") ||
      invalid2.message.join("\n").includes("Esse arquivo é mesmo")
    ),
    true
  );

  st.last_message_id_prev = "wamid.upload.loop.1";
  st.last_message_id = "wamid.text.loop.2";
  await handleDocumentUpload(env, st, {
    type: "text_signal",
    text_signal: true,
    caption: "é meu holerite",
    message_id: "wamid.text.loop.2"
  });
  const stAfterConfirm = getState(env, waId);
  const statusDepoisDaConfirmacao = stAfterConfirm.docs_status_geral;

  stAfterConfirm.last_message_id_prev = "wamid.text.loop.2";
  stAfterConfirm.last_message_id = "wamid.text.loop.3";
  await handleDocumentUpload(env, stAfterConfirm, {
    type: "text_signal",
    text_signal: true,
    caption: "é meu holerite",
    message_id: "wamid.text.loop.3"
  });
  assert.equal(getState(env, waId).docs_status_geral, statusDepoisDaConfirmacao);
}

// 7) pacote correspondente separa confirmados / plausíveis pendentes / faltantes
{
  const st = {
    envio_docs_status: "completo",
    envio_docs_confirmacao_tipo_doc_status: "aguardando_confirmacao_tipo_doc",
    envio_docs_ultimo_upload_pendente_confirmacao_json: {
      upload_id: "upload-pacote-1",
      upload_message_id: "wamid.upload.pacote.1",
      detected_doc_type: "ctps_completa",
      candidate_items: [{ tipo: "ctps_completa", participante: "p1" }],
      media_ref: {
        media_id: "media-pacote-1",
        mime_type: "application/pdf",
        file_name: "ctps.pdf"
      }
    },
    dossie_participantes_json: [{ id: "p1", papel: "titular", regime_trabalho: "clt" }],
    dossie_renda_total_formal: 3200,
    dossie_renda_total_informal: 0,
    dossie_restricao_resumo: "sem_restricao",
    envio_docs_historico_json: []
  };
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
    { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
    { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
    { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: "pendente" }
  ];
  const plausiveisPendentes = buildEnvioDocsPlausiveisPendentesConferenciaFromState(st);
  const analise = buildAnaliseDocsPayloadFromEnvio(itens, { plausiveisPendentes });
  const pacote = buildPacoteCorrespondentePayloadFromState({ ...st, ...analise }, itens, analise);
  assert.equal(Array.isArray(analise.analise_docs_docs_confirmados_json), true);
  assert.equal(analise.analise_docs_docs_confirmados_json.length, 3);
  assert.equal(analise.analise_docs_docs_plausiveis_pendentes_conferencia_json.length, 1);
  assert.equal(analise.analise_docs_docs_faltantes_json.length, 0);
  assert.equal(pacote.pacote_status, "nao_montado");
  assert.equal(Array.isArray(pacote.pacote_docs_confirmados_json), true);
  assert.equal(Array.isArray(pacote.pacote_docs_plausiveis_pendentes_conferencia_json), true);
  assert.equal(Array.isArray(pacote.pacote_docs_faltantes_json), true);
}

// 8) prova explícita: handleDocumentUpload não persiste colunas novas de docs no enova_state
{
  const waId = "5541997771010";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    last_message_id: "wamid.upload.writeproof.1"
  });
  const st = getState(env, waId);
  await handleDocumentUpload(env, st, {
    type: "document",
    message_id: "wamid.upload.writeproof.1",
    document: {
      id: "media-writeproof-1",
      mime_type: "application/pdf",
      filename: "holerite-writeproof.pdf",
      base64: "ZmFrZQ=="
    }
  }, {
    fetchImpl: buildPdfFetch("Holerite mensal com vencimentos e salário líquido.")
  });

  const writeLog = Array.isArray(env.__enovaSimulationCtx?.writeLog) ? env.__enovaSimulationCtx.writeLog : [];
  const wroteForbiddenColumn = writeLog.some((entry) => {
    const patch = entry?.patch || {};
    return (
      Object.prototype.hasOwnProperty.call(patch, "envio_docs_confirmacao_tipo_doc_status") ||
      Object.prototype.hasOwnProperty.call(patch, "envio_docs_ultimo_upload_pendente_confirmacao_json") ||
      Object.prototype.hasOwnProperty.call(patch, "envio_docs_ultima_pergunta_confirmacao_id") ||
      Object.prototype.hasOwnProperty.call(patch, "envio_docs_ultimo_upload_confirmacao_id") ||
      Object.prototype.hasOwnProperty.call(patch, "envio_docs_itens_json") ||
      Object.prototype.hasOwnProperty.call(patch, "envio_docs_historico_json") ||
      Object.keys(patch).some((k) => k.startsWith("analise_docs_")) ||
      Object.keys(patch).some((k) => k.startsWith("pacote_docs_"))
    );
  });
  assert.equal(wroteForbiddenColumn, false);
}

console.log("envio_docs_confirmacao_tipo_doc.smoke: ok");
