import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const waId = "5541991112222";

function buildEnv() {
  return {
    ENV_MODE: "test",
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
  // primeiro avanço envio_docs -> finalizacao_processo
  const reqAdvance = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(waId, "enviei documento", "wamid.docs.complete.2"))
  });
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
  assert.equal(typeof payloadGrupo?.text?.body, "string");
  assert.equal(payloadGrupo.text.body.includes(`/correspondente/entrada?t=${tokenPublicado}`), true);
  assert.equal(payloadGrupo.text.body.includes(`ASSUMIR ${tokenPublicado}`), true);

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

console.log("envio_docs_finalizacao_transition.smoke: ok");
