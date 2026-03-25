import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const token = "AB12CD34EF56GH78JK90LM12";
const waCaso = "5541999998888";
const correspondenteWa = "5511999999999";
const adminKey = "smoke-admin-key";

function buildEnvWithState() {
  return {
    ENV_MODE: "test",
    ENOVA_ADMIN_KEY: adminKey,
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
        [waCaso]: {
          wa_id: waCaso,
          nome: "JOAO TESTE",
          pre_cadastro_numero: "000001",
          fase_conversa: "finalizacao_processo",
          corr_assumir_token: token,
          corr_publicacao_status: "publicado_grupo_pendente_assumir",
          corr_lock_correspondente_wa_id: null,
          corr_lock_assumido_em: null,
          corr_entrega_privada_status: null,
          corr_follow_base_at: null,
          corr_follow_next_at: null,
          processo_enviado_correspondente: false,
          aguardando_retorno_correspondente: false,
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  };
}

function buildWebhookTextRequest(from, body, id) {
  return new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from,
              id,
              timestamp: "1773183927",
              type: "text",
              text: { body }
            }],
            contacts: [{ wa_id: from }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
}

async function assumirCaso(env, messageId) {
  const assumirReq = buildWebhookTextRequest(correspondenteWa, `ASSUMIR ${token}`, messageId);
  const assumirResp = await worker.fetch(assumirReq, env, {});
  assert.equal(assumirResp.status, 200);
}

async function simulateFromState(env, stage, text, stOverrides) {
  const req = new Request("https://enova.local/__admin__/simulate-from-state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": adminKey
    },
    body: JSON.stringify({
      wa_id: waCaso,
      stage,
      text,
      dry_run: true,
      max_steps: 1,
      st_overrides: stOverrides
    })
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.ok, true);
  return data;
}

// 1) Retorno aprovado entra em visita pelo handler canônico.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "112971";
  await assumirCaso(env, "wamid.assumir.visita.aprovado");
  const retornoReq = buildWebhookTextRequest(correspondenteWa, "Pré-cadastro # 112971\nCRÉDITO APROVADO", "wamid.retorno.visita.aprovado");
  const retornoResp = await worker.fetch(retornoReq, env, {});
  assert.equal(retornoResp.status, 200);
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 2) Retorno aprovado_condicionado entra em visita sem ReferenceError.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pre_cadastro_numero = "112972";
  await assumirCaso(env, "wamid.assumir.visita.aprovado.condicionado");
  const retornoReq = buildWebhookTextRequest(
    correspondenteWa,
    "Pré-cadastro # 112972\nCREDITO APROVADO\nPOSSUI PENDENCIAS",
    "wamid.retorno.visita.aprovado.condicionado"
  );
  const retornoResp = await worker.fetch(retornoReq, env, {});
  assert.equal(retornoResp.status, 200);
  const alvo = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(alvo.retorno_correspondente_status, "aprovado_condicionado");
  assert.equal(alvo.fase_conversa, "agendamento_visita");
}

// 3) Convite de visita permanece no trilho correto.
{
  const env = buildEnvWithState();
  const data = await simulateFromState(env, "agendamento_visita", "talvez", {
    processo_enviado_correspondente: true,
    retorno_correspondente_status: "aprovado",
    visita_origem: "aprovado"
  });
  assert.equal(data.stage_after, "agendamento_visita");
  assert.equal(data.writes.visita_agendamento_status, "convite");
  assert.match(data.reply_text, /próximas datas e horários oficiais/i);
}

// 4) Escolha de data avança para a oferta de horários.
{
  const env = buildEnvWithState();
  const data = await simulateFromState(env, "agendamento_visita", "1", {
    processo_enviado_correspondente: true,
    retorno_correspondente_status: "aprovado",
    visita_origem: "aprovado",
    visita_convite_status: "aceito",
    visita_agendamento_status: "data",
    visita_primeiro_slot_disponivel_em: "2026-03-14T18:30:00.000Z"
  });
  assert.equal(data.stage_after, "agendamento_visita");
  assert.equal(data.writes.visita_agendamento_status, "horario");
  assert.equal(data.writes.visita_data_escolhida, "2026-03-14");
  assert.match(data.reply_text, /agora escolha o horário oficial/i);
}

// 5) Escolha de horário confirma a visita e chega em visita_confirmada.
{
  const env = buildEnvWithState();
  const data = await simulateFromState(env, "agendamento_visita", "2", {
    processo_enviado_correspondente: true,
    retorno_correspondente_status: "aprovado",
    visita_origem: "aprovado",
    visita_convite_status: "aceito",
    visita_agendamento_status: "horario",
    visita_data_escolhida: "2026-03-14",
    visita_primeiro_slot_disponivel_em: "2026-03-14T18:30:00.000Z"
  });
  assert.equal(data.stage_after, "visita_confirmada");
  assert.equal(data.writes.visita_agendamento_status, "confirmada");
  assert.equal(data.writes.visita_confirmada, true);
  assert.equal(Boolean(data.writes.visita_slot_escolhido), true);
  assert.match(data.reply_text, /visita confirmada/i);
}

// 6) Stage visita_confirmada responde com fechamento profissional e permanece no stage.
{
  const env = buildEnvWithState();
  const data = await simulateFromState(env, "visita_confirmada", "ok", {
    processo_enviado_correspondente: true,
    retorno_correspondente_status: "aprovado",
    visita_origem: "aprovado",
    visita_agendamento_status: "confirmada",
    visita_confirmada: true,
    visita_dia_hora: "sábado, 14/03 às 14:30",
    visita_slot_escolhido: "14:30",
    visita_data_escolhida: "2026-03-14"
  });
  assert.equal(data.stage_after, "visita_confirmada");
  assert.match(data.reply_text, /sua visita já está confirmada/i);
  assert.match(data.reply_text, /se precisar, posso te relembrar os detalhes por aqui/i);
}

console.log("visita.smoke: ok");
