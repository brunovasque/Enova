import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;
const { buildCorrespondenteCaseRef } = workerModule;

const waId = "5541991112222";

function buildEnv() {
  return {
    ENV_MODE: "test",
    TELEMETRIA_LEVEL: "verbose",
    ENOVA_ADMIN_KEY: "adm-key",
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify",
    CORRESPONDENTE_TO: "5511000000000",
    CORRESPONDENTE_ENTRY_BASE_URL: "https://entrada.enova.local",
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
          nome: "Cliente Teste",
          fase_conversa: "envio_docs",
          envio_docs_lista_enviada: true,
          docs_lista_enviada: true,
          dossie_status: "pronto",
          dossie_participantes_json: [{ id: "p1", papel: "titular", regime_trabalho: "clt" }],
          dossie_renda_total_formal: 3200,
          dossie_renda_total_informal: 0,
          dossie_restricao_resumo: "sem_restricao",
          envio_docs_itens_json: [
            { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
            { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
            { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: "validado_basico" }
          ],
          envio_docs_status: "completo",
          pacote_status: "pronto",
          analise_docs_status: "validada",
          pacote_participantes_json: [{ participante: "p1", papel: "titular" }],
          pacote_documentos_anexados_json: [{ tipo: "identidade_cpf", participante: "p1", status: "validado_basico" }],
          pacote_renda_resumo_json: { total_geral: 3200, por_participante: [{ participante: "p1", renda_total: 3200 }] },
          pacote_restricoes_json: { resumo: "sem_restricao", participantes: [{ participante: "p1", tem_restricao: false }] },
          processo_enviado_correspondente: null,
          corr_assumir_token: null,
          corr_publicacao_status: null
        }
      }
    }
  };
}

function getLastMessageForWa(env, wa) {
  const logs = Array.isArray(env.__enovaSimulationCtx?.messageLog) ? env.__enovaSimulationCtx.messageLog : [];
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i]?.wa_id === wa) {
      return logs[i];
    }
  }
  return null;
}

function captureConsoleLogs() {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map((v) => String(v)).join(" "));
    originalLog(...args);
  };
  return {
    logs,
    restore() {
      console.log = originalLog;
    }
  };
}

function buildTextWebhook(from, text, msgId) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id: msgId,
                  timestamp: "1773183900",
                  type: "text",
                  text: { body: text }
                }
              ],
              contacts: [{ wa_id: from }],
              metadata: { phone_number_id: "test" }
            }
          }
        ]
      }
    ]
  };
}

// 1) Com docs completos/pacote pronto, texto de upload avança para finalizacao_processo.
{
  const env = buildEnv();
  const req = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(waId, "enviei documento", "wamid.docs.complete.1"))
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 200);
  const st = env.__enovaSimulationCtx.stateByWaId[waId];
  assert.equal(st.fase_conversa, "finalizacao_processo");
}

// 2) Em finalizacao_processo com pacote pronto, próxima mensagem dispara tentativa de publicação.
{
  const env = buildEnv();
  const capture = captureConsoleLogs();
  // primeiro avanço envio_docs -> finalizacao_processo
  const reqAdvance = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(waId, "enviei documento", "wamid.docs.complete.2"))
  });
  try {
    await worker.fetch(reqAdvance, env, {});

    const reqPublish = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildTextWebhook(waId, "ok", "wamid.docs.complete.3"))
    });
    const resPublish = await worker.fetch(reqPublish, env, {});
    assert.equal(resPublish.status, 200);

    const st = env.__enovaSimulationCtx.stateByWaId[waId];
    assert.equal(st.fase_conversa, "finalizacao_processo");
    assert.equal(typeof st.corr_assumir_token, "string");
    assert.equal(st.corr_assumir_token.length > 0, true);
    assert.equal(st.corr_publicacao_status, "publicado_grupo_pendente_assumir");
    assert.equal(st.processo_enviado_correspondente, false);
    const tokenPublicado = st.corr_assumir_token;
    const payloadGrupo = env.__enovaSimulationCtx.sendPreview;
    const expectedLink = `https://entrada.enova.local/correspondente/entrada?t=${tokenPublicado}`;
    const expectedFallback = `ASSUMIR ${tokenPublicado}`;
    assert.equal(payloadGrupo?.to, env.CORRESPONDENTE_TO);
    assert.notEqual(payloadGrupo?.to, waId);
    assert.equal(typeof payloadGrupo?.text?.body, "string");
    assert.equal(
      payloadGrupo.text.body,
      [
        "🚨 *Novo caso para correspondente*",
        `Ref: ${buildCorrespondenteCaseRef({ wa_id: waId })}`,
        `Token de entrada: ${tokenPublicado}`,
        "",
        "Link permanente de entrada/assunção:",
        expectedLink,
        "",
        "Se necessário, fallback no privado:",
        expectedFallback,
        "",
        "⚠️ Este grupo é apenas distribuição (sem dados sensíveis)."
      ].join("\n")
    );

    const lastMsg = getLastMessageForWa(env, waId);
    const joinedLastMsg = (lastMsg?.messages || []).join("\n");
    assert.equal(joinedLastMsg.includes("Publiquei seu caso no canal oficial de distribuição dos correspondentes."), true);
    assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_enter\"")), true);
    assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_attempt\"")), true);
    assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_result\"") && line.includes("Envio ao correspondente confirmado")), true);
    assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_client_notice\"") && line.includes("publicacao_confirmada")), true);

    env.__enovaSimulationCtx.sendPreview = null;
    const reqReprocess = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildTextWebhook(waId, "ok", "wamid.docs.complete.4"))
    });
    const resReprocess = await worker.fetch(reqReprocess, env, {});
    assert.equal(resReprocess.status, 200);
    const stReprocess = env.__enovaSimulationCtx.stateByWaId[waId];
    assert.equal(stReprocess.corr_assumir_token, tokenPublicado);
    assert.equal(stReprocess.corr_publicacao_status, "publicado_grupo_pendente_assumir");
    assert.equal(env.__enovaSimulationCtx.sendPreview, null);
  } finally {
    capture.restore();
  }
}

// 3) Não-regressão: sem pacote pronto permanece em envio_docs.
{
  const env = buildEnv();
  env.__enovaSimulationCtx.stateByWaId[waId] = {
    ...env.__enovaSimulationCtx.stateByWaId[waId],
    envio_docs_itens_json: [
      { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    envio_docs_status: "parcial",
    pacote_status: "nao_montado",
    analise_docs_status: null,
    pacote_participantes_json: null,
    pacote_documentos_anexados_json: null,
    pacote_renda_resumo_json: null,
    pacote_restricoes_json: null
  };
  const req = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(waId, "enviei documento", "wamid.docs.partial.1"))
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 200);
  const st = env.__enovaSimulationCtx.stateByWaId[waId];
  assert.equal(st.fase_conversa, "envio_docs");
}

// 4) Em falha de envio, cliente não recebe confirmação de publicação e log registra falha.
{
  const env = buildEnv();
  env.CORRESPONDENTE_TO = "";
  const reqAdvance = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(waId, "enviei documento", "wamid.docs.fail.advance"))
  });
  await worker.fetch(reqAdvance, env, {});

  const req = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(waId, "ok", "wamid.docs.fail.1"))
  });
  const capture = captureConsoleLogs();
  try {
    const res = await worker.fetch(req, env, {});
    assert.equal(res.status, 200);
  } finally {
    capture.restore();
  }

  const lastMsg = getLastMessageForWa(env, waId);
  const joinedLastMsg = (lastMsg?.messages || []).join("\n");
  assert.equal(joinedLastMsg.includes("Publiquei seu caso no canal oficial de distribuição dos correspondentes."), false);
  assert.equal(joinedLastMsg.includes("Estou concluindo a etapa interna do seu processo e sigo por aqui."), true);
  assert.equal(joinedLastMsg.includes("Assim que o encaminhamento ao correspondente for confirmado, eu te aviso por aqui."), true);
  assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_result\"") && line.includes("falhou")), true);
  assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_client_notice\"") && line.includes("tentativa_falha")), true);
}

// 5) Falha no principal com fallback bem-sucedido registra principal/fallback/resultado.
{
  const env = buildEnv();
  env.__enovaSimulationCtx.suppressExternalSend = false;
  env.CORRESPONDENTE_GROUP_INTERACTIVE = "true";
  const reqAdvance = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(waId, "enviei documento", "wamid.docs.fallback.advance"))
  });
  await worker.fetch(reqAdvance, env, {});

  let graphCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const asString = String(url || "");
    if (asString.includes("graph.facebook.com") && asString.includes("/messages")) {
      graphCalls += 1;
      if (graphCalls === 1) {
        return new Response("forced_interactive_fail", { status: 500 });
      }
      return new Response(JSON.stringify({ messages: [{ id: "wamid.fallback.ok" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return originalFetch(url, init);
  };

  const capture = captureConsoleLogs();
  try {
    const req = new Request("https://worker.local/webhook/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildTextWebhook(waId, "ok", "wamid.docs.fallback.1"))
    });
    const res = await worker.fetch(req, env, {});
    assert.equal(res.status, 200);
  } finally {
    capture.restore();
    globalThis.fetch = originalFetch;
  }

  assert.equal(graphCalls >= 2, true);
  assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_attempt\"") && line.includes("principal_interactive")), true);
  assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_fallback\"") && line.includes("fallback acionado")), true);
  assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_attempt\"") && line.includes("fallback_text")), true);
  assert.equal(capture.logs.some((line) => line.includes("\"event\":\"corr_dispatch_result\"") && line.includes("confirmado via fallback")), true);
}

console.log("envio_docs_finalizacao_transition.smoke: ok");
