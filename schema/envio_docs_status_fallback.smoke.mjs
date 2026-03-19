import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const waId = "5541993334444";

function buildEnv(statePatch = {}) {
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
          envio_docs_itens_json: [
            { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
            { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
            { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: "validado_basico" }
          ],
          envio_docs_status: "completo",
          pacote_status: "pronto",
          processo_enviado_correspondente: null,
          corr_publicacao_status: null,
          aguardando_retorno_correspondente: null,
          retorno_correspondente_status: null,
          retorno_correspondente_motivo: null,
          ...statePatch
        }
      }
    }
  };
}

function buildTextWebhook(text, msgId) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: waId,
                  id: msgId,
                  timestamp: "1773183900",
                  type: "text",
                  text: { body: text }
                }
              ],
              contacts: [{ wa_id: waId }],
              metadata: { phone_number_id: "test" }
            }
          }
        ]
      }
    ]
  };
}

async function runScenario(env, text, msgId) {
  const req = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildTextWebhook(text, msgId))
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 200);
  const log = env.__enovaSimulationCtx.messageLog;
  const lastMessages = log[log.length - 1]?.messages || [];
  return {
    messages: lastMessages,
    state: env.__enovaSimulationCtx.stateByWaId[waId]
  };
}

// 1) pendência real de docs => informa pendência real
{
  const env = buildEnv({
    envio_docs_itens_json: [
      { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: "validado_basico" }
    ],
    envio_docs_status: "parcial",
    pacote_status: "nao_montado"
  });
  const out = await runScenario(env, "foi aprovado?", "wamid.status.pending.1");
  const joined = out.messages.join("\n").toLowerCase();
  assert.equal(joined.includes("ainda faltam"), true);
  assert.equal(joined.includes("comprovante de residência"), true);
}

// 2) docs completos em análise interna => informa análise documental
{
  const env = buildEnv({
    pacote_status: "nao_montado",
    processo_enviado_correspondente: false,
    corr_publicacao_status: null
  });
  const out = await runScenario(env, "como ficou?", "wamid.status.analysis.1");
  const joined = out.messages.join("\n").toLowerCase();
  assert.equal(joined.includes("análise documental"), true);
  assert.equal(joined.includes("te aviso"), true);
}

// 3) encaminhado / aguardando correspondente => informa aguardando retorno
{
  const env = buildEnv({
    processo_enviado_correspondente: true,
    corr_publicacao_status: "entregue_privado_aguardando_retorno",
    aguardando_retorno_correspondente: true
  });
  const out = await runScenario(env, "já foi enviado?", "wamid.status.awaiting.1");
  const joined = out.messages.join("\n").toLowerCase();
  assert.equal(joined.includes("encaminhado ao correspondente"), true);
  assert.equal(joined.includes("aguardando o retorno"), true);
}

// 4) retorno salvo => responde coerente com retorno real salvo
{
  const env = buildEnv({
    envio_docs_itens_json: [
      { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: "validado_basico" }
    ],
    envio_docs_status: "completo",
    processo_enviado_correspondente: true,
    corr_publicacao_status: "entregue_privado_aguardando_retorno",
    aguardando_retorno_correspondente: true,
    retorno_correspondente_status: "pendencia_documental",
    retorno_correspondente_motivo: "comprovante de residência atualizado"
  });
  const out = await runScenario(env, "já teve resposta?", "wamid.status.savedreturn.1");
  const joined = out.messages.join("\n").toLowerCase();
  assert.equal(joined.includes("retorno salvo com pendência documental"), true);
  assert.equal(joined.includes("comprovante de residência atualizado"), true);
}

console.log("envio_docs_status_fallback.smoke: ok");
