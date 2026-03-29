import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const { buildDocumentDossierFromState, buildPacoteCorrespondentePayloadFromState } = workerModule;
const worker = workerModule.default;

const adminKey = "smoke-admin-key";

function buildEnv() {
  return {
    ENV_MODE: "test",
    OFFTRACK_AI_ENABLED: "false",
    ENOVA_ADMIN_KEY: adminKey,
    VERCEL_PROXY_URL: "https://proxy.example.com",
    SUPABASE_SERVICE_ROLE: "service-role",
    META_API_VERSION: "v20.0",
    PHONE_NUMBER_ID: "123456",
    WHATS_TOKEN: "token",
    META_VERIFY_TOKEN: "verify",
    TELEMETRIA_LEVEL: "off",
    __enovaSimulationCtx: {
      active: true,
      dryRun: true,
      suppressExternalSend: true,
      wouldSend: false,
      sendPreview: null,
      messageLog: [],
      writeLog: [],
      writesByWaId: {},
      stateByWaId: {}
    }
  };
}

function buildStateBase(overrides = {}) {
  return {
    wa_id: "5541999300001",
    nome: "JOAO TESTE",
    fase_conversa: "envio_docs",
    estado_civil: "solteiro",
    regime_trabalho: "autonomo",
    renda: 3200,
    restricao: false,
    regularizacao_restricao: false,
    dossie_participantes_json: [
      {
        id: "p1",
        role: "titular",
        regime_trabalho: "autonomo",
        renda: 3200,
        restricao: false,
        regularizacao_restricao: false
      }
    ],
    dossie_renda_total_formal: 0,
    dossie_renda_total_informal: 3200,
    dossie_restricao_resumo: "sem_restricao",
    dossie_resumo_humano: "Dossiê base",
    dossie_pendencias_json: [],
    dossie_observacoes_correspondente_json: [],
    dossie_observacoes_cliente_json: [],
    envio_docs_status: "completo",
    envio_docs_historico_json: [],
    analise_docs_pendencias_json: [],
    analise_docs_docs_invalidos_json: [],
    analise_docs_docs_ilegiveis_json: [],
    analise_docs_docs_faltantes_json: [],
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Bairro Alto",
        informativo_trabalho_p1: "Centro",
        visita_reserva_entrada_tem: true,
        visita_fgts_disponivel: true,
        visita_decisor_adicional_visita: true,
        visita_decisor_adicional_nome: "Maria",
        titular_autonomo_profissao_atividade: "Motorista de app",
        titular_autonomo_mei_pj_status: "mei",
        titular_autonomo_renda_estabilidade: "variavel",
        titular_curso_superior_status: "cursando"
      },
      etapa2_estrutural: {
        inicio_multi_renda_coletar: true,
        inicio_multi_regime_coletar: true,
        titular_tipo_renda_clt: "variavel",
        reprovacao_categoria_caso: "documental"
      }
    },
    ...overrides
  };
}

// 1) Enriquecimento do dossiê com sinais persistidos.
{
  const state = buildStateBase();
  const dossie = buildDocumentDossierFromState(state);
  const sinais = dossie?.dossie_sinais_persistidos_json || {};

  assert.equal(sinais?.moradia?.p1, "Bairro Alto");
  assert.equal(sinais?.trabalho?.p1, "Centro");
  assert.equal(sinais?.visita?.reserva_entrada_tem, true);
  assert.equal(sinais?.visita?.fgts_disponivel, true);
  assert.equal("decisor_adicional_visita" in (sinais?.visita || {}), false);
  assert.equal("decisor_adicional_nome" in (sinais?.visita || {}), false);
  assert.equal(sinais?.autonomo?.profissao_atividade, "Motorista de app");
  assert.equal(sinais?.autonomo?.mei_pj_status, "mei");
  assert.equal(sinais?.autonomo?.renda_estabilidade, "variavel");
  assert.equal(sinais?.titular?.curso_superior_status, "cursando");
  assert.equal(sinais?.renda?.multi_renda, true);
  assert.equal(sinais?.renda?.multi_regime, true);
  assert.equal(sinais?.trabalho_clt?.titular_tipo_renda, "variavel");
  assert.equal("reprovacao" in sinais, false);
}

// 2) Enriquecimento do pacote do correspondente com os mesmos sinais (via trilho existente).
{
  const state = buildStateBase();
  const pacote = buildPacoteCorrespondentePayloadFromState(state, [], null);
  const sinais = pacote?.pacote_sinais_persistidos_json || {};

  assert.equal(pacote?.pacote_status, "pronto");
  assert.equal(sinais?.moradia?.p1, "Bairro Alto");
  assert.equal(sinais?.trabalho?.p1, "Centro");
  assert.equal(sinais?.visita?.reserva_entrada_tem, true);
  assert.equal(sinais?.visita?.fgts_disponivel, true);
  assert.equal(sinais?.autonomo?.mei_pj_status, "mei");
  assert.equal(sinais?.renda?.multi_regime, true);
  assert.equal("decisor_adicional_visita" in (sinais?.visita || {}), false);
  assert.equal("decisor_adicional_nome" in (sinais?.visita || {}), false);
  assert.equal("reprovacao" in sinais, false);
}

async function simulateFromState(env, waId, stage, text, stOverrides = {}) {
  env.__enovaSimulationCtx.stateByWaId[waId] = {
    wa_id: waId,
    fase_conversa: stage,
    updated_at: "2026-03-27T00:00:00.000Z",
    ...(env.__enovaSimulationCtx.stateByWaId[waId] || {}),
    ...stOverrides
  };

  const req = new Request("https://enova.local/__admin__/simulate-from-state", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": adminKey
    },
    body: JSON.stringify({
      wa_id: waId,
      stage,
      text,
      dry_run: true,
      max_steps: 1,
      st_overrides: env.__enovaSimulationCtx.stateByWaId[waId]
    })
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.ok, true);
  return data;
}

// 3) Follow-up/visita: uso contextual sem alterar trilho.
{
  const env = buildEnv();
  const wa = "5541999300002";
  const data = await simulateFromState(env, wa, "envio_docs", "prefiro presencial", {
    nome: "MARIA TESTE",
    funil_status: "elegivel",
    docs_lista_enviada: true,
    envio_docs_lista_enviada: true,
    envio_docs_status: "parcial",
    envio_docs_lembrete_count: 2,
    processo_enviado_correspondente: false,
    visita_confirmada: false,
    visita_origem: null,
    canal_docs_agendamento_pendente: false,
    controle: {
      etapa1_informativos: {
        visita_decisor_adicional_visita: true,
        visita_decisor_adicional_nome: "Carlos",
        visita_reserva_entrada_tem: true,
        visita_fgts_disponivel: true
      }
    }
  });

  assert.equal(data.stage_after, "agendamento_visita");
  assert.match(data.reply_text, /também deixei anotado que existe decisor adicional/i);
}

console.log("worker_persisted_signals_consumption.smoke: ok");
