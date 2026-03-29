import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
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

const preDocsBase = {
  restricao: false,
  regularizacao_restricao: "em_andamento",
  renda: 4500,
  controle: {
    etapa1_informativos: {
      visita_reserva_entrada_tem: false,
      visita_fgts_disponivel: false,
      titular_curso_superior_status: "nao"
    }
  }
};

// 1) pré-docs roda imediatamente antes de docs no trilho regularizacao_restricao.
{
  const env = buildEnv();
  const wa = "5541999200101";
  const result = await simulateFromState(env, wa, "regularizacao_restricao", "sim", preDocsBase);
  assert.equal(result.stage_after, "regularizacao_restricao");
  assert.match(result.reply_text, /local de moradia/i);
}

// 2) caminhos de produção mapeados (#1, #2, #3, #8) passam pelo bloco pré-docs.
{
  const envRestricao = buildEnv();
  const fromRestricao = await simulateFromState(envRestricao, "5541999200102", "restricao", "não", {
    ...preDocsBase,
    composicao_pessoa: "familiar",
    restricao_parceiro: false,
    p3_required: false
  });
  assert.equal(fromRestricao.stage_after, "restricao");
  assert.match(fromRestricao.reply_text, /local de moradia|local de trabalho/i);

  const envParceiroNao = buildEnv();
  const fromRestricaoParceiroNao = await simulateFromState(envParceiroNao, "5541999200103", "restricao_parceiro", "não", {
    ...preDocsBase,
    restricao: false,
    p3_required: false
  });
  assert.equal(fromRestricaoParceiroNao.stage_after, "restricao_parceiro");
  assert.match(fromRestricaoParceiroNao.reply_text, /local de moradia|local de trabalho/i);

  const envParceiroIncerto = buildEnv();
  const fromRestricaoParceiroIncerto = await simulateFromState(envParceiroIncerto, "5541999200104", "restricao_parceiro", "não sei", {
    ...preDocsBase,
    restricao: false,
    p3_required: false
  });
  assert.equal(fromRestricaoParceiroIncerto.stage_after, "restricao_parceiro");
  assert.match(fromRestricaoParceiroIncerto.reply_text, /local de moradia|local de trabalho/i);

  const envRegularizacaoP3 = buildEnv();
  const fromRegularizacaoP3 = await simulateFromState(envRegularizacaoP3, "5541999200105", "regularizacao_restricao_p3", "sim", {
    ...preDocsBase,
    p3_required: true,
    p3_done: true,
    renda_total_para_fluxo: 5000
  });
  assert.equal(fromRegularizacaoP3.stage_after, "regularizacao_restricao_p3");
  assert.match(fromRegularizacaoP3.reply_text, /local de moradia|local de trabalho/i);
}

// 3) envio_docs não intercepta mais o bloco informativo intruso.
{
  const env = buildEnv();
  const wa = "5541999200106";
  const result = await simulateFromState(env, wa, "envio_docs", "sim", {
    ...preDocsBase,
    dossie_status: "pronto",
    docs_lista_enviada: false,
    envio_docs_lista_enviada: false,
    canal_docs_status: "pendente"
  });
  assert.equal(result.stage_after, "envio_docs");
  assert.doesNotMatch(result.reply_text, /local de moradia|local de trabalho|curso superior|fgts|reserva/i);
}

console.log("etapa1_predocs.smoke: ok");
