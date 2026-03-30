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

function infoBag(data) {
  return data.writes?.controle?.etapa1_informativos || {};
}

// 1) Mini-bloco do autônomo: coleta informativos no stage certo e retorna para IR sem alterar gate estrutural.
{
  const env = buildEnv();
  const wa = "5541999300001";
  const base = { regime: "autonomo" };

  const perguntaProfissao = await simulateFromState(env, wa, "autonomo_ir_pergunta", "sim", base);
  assert.equal(perguntaProfissao.stage_after, "autonomo_ir_pergunta");
  assert.match(perguntaProfissao.reply_text, /profiss[aã]o|atividade principal/i);
  assert.equal(Object.hasOwn(infoBag(perguntaProfissao), "titular_autonomo_profissao_atividade"), false);

  const salvaProfissao = await simulateFromState(env, wa, "autonomo_ir_pergunta", "motorista de app", {
    ...base
  });
  assert.equal(salvaProfissao.stage_after, "autonomo_ir_pergunta");
  assert.equal(infoBag(salvaProfissao).titular_autonomo_profissao_atividade, "motorista de app");
  assert.match(salvaProfissao.reply_text, /pessoa f[ií]sica|mei|pj/i);

  const salvaMeiPj = await simulateFromState(env, wa, "autonomo_ir_pergunta", "mei", {
    ...base,
    controle: {
      etapa1_informativos: {
        titular_autonomo_profissao_atividade: "motorista de app"
      }
    }
  });
  assert.equal(salvaMeiPj.stage_after, "autonomo_ir_pergunta");
  assert.equal(infoBag(salvaMeiPj).titular_autonomo_mei_pj_status, "mei");
  assert.match(salvaMeiPj.reply_text, /renda costuma ser mais est[aá]vel|varia bastante/i);

  const salvaEstabilidade = await simulateFromState(env, wa, "autonomo_ir_pergunta", "varia bastante", {
    ...base,
    controle: {
      etapa1_informativos: {
        titular_autonomo_profissao_atividade: "motorista de app",
        titular_autonomo_mei_pj_status: "mei"
      }
    }
  });
  assert.equal(salvaEstabilidade.stage_after, "autonomo_ir_pergunta");
  assert.equal(infoBag(salvaEstabilidade).titular_autonomo_renda_estabilidade, "variavel");
  assert.match(salvaEstabilidade.reply_text, /imposto de renda/i);

  const irSimMantemGate = await simulateFromState(env, wa, "autonomo_ir_pergunta", "sim", {
    ...base,
    controle: {
      etapa1_informativos: {
        titular_autonomo_profissao_atividade: "motorista de app",
        titular_autonomo_mei_pj_status: "mei",
        titular_autonomo_renda_estabilidade: "variavel"
      }
    }
  });
  assert.equal(irSimMantemGate.stage_after, "renda");
  assert.equal(irSimMantemGate.writes.ir_declarado, true);
  assert.equal(Object.hasOwn(irSimMantemGate.writes, "docs_lista_enviada"), false);
}

// 2) Renda <= 3500: respostas válidas de CTPS seguem sem interrupção por escolaridade.
{
  const env = buildEnv();
  const wa = "5541999300002";
  const base = {
    regime: "clt",
    renda: 3200,
    renda_total_para_fluxo: 3200,
    financiamento_conjunto: false
  };

  const ctpsSim = await simulateFromState(env, wa, "ctps_36", "sim", base);
  assert.equal(ctpsSim.stage_after, "dependente");
  assert.equal(ctpsSim.writes.ctps_36, true);
  assert.equal(Object.hasOwn(infoBag(ctpsSim), "titular_curso_superior_status"), false);

  const ctpsNao = await simulateFromState(env, wa, "ctps_36", "não", base);
  assert.equal(ctpsNao.stage_after, "dependente");
  assert.equal(ctpsNao.writes.ctps_36, false);
  assert.equal(Object.hasOwn(infoBag(ctpsNao), "titular_curso_superior_status"), false);

  const ctpsNaoSei = await simulateFromState(env, wa, "ctps_36", "não sei", base);
  assert.equal(ctpsNaoSei.stage_after, "dependente");
  assert.equal(ctpsNaoSei.writes.ctps_36, null);
  assert.equal(Object.hasOwn(infoBag(ctpsNaoSei), "titular_curso_superior_status"), false);
}

// 3) Escolaridade migra para bloco pré-docs e não fica mais em ctps_36.
{
  const env = buildEnv();
  const wa = "5541999300003";
  const base = {
    regime: "clt",
    renda: 3200,
    renda_total_para_fluxo: 3200,
    financiamento_conjunto: false
  };

  const ctpsSemHook = await simulateFromState(env, wa, "ctps_36", "não tenho, só ensino médio", base);
  assert.equal(ctpsSemHook.stage_after, "dependente");
  assert.equal(ctpsSemHook.writes.ctps_36, false);
  assert.equal(Object.hasOwn(infoBag(ctpsSemHook), "titular_curso_superior_status"), false);

  const escolaridadePreDocs = await simulateFromState(env, wa, "regularizacao_restricao", "sim", {
    ...base,
    restricao: false,
    regularizacao_restricao: "em_andamento",
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Centro",
        informativo_trabalho_p1: "Batel",
        visita_reserva_entrada_tem: true,
        visita_fgts_disponivel: true
      }
    }
  });
  assert.equal(escolaridadePreDocs.stage_after, "regularizacao_restricao");
  assert.match(escolaridadePreDocs.reply_text, /curso superior|cursando|incompleto/i);

  const escolaridadeIncompleto = await simulateFromState(env, wa, "regularizacao_restricao", "incompleto", {
    ...base,
    restricao: false,
    regularizacao_restricao: "em_andamento",
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Centro",
        informativo_trabalho_p1: "Batel",
        visita_reserva_entrada_tem: true,
        visita_fgts_disponivel: true
      }
    }
  });
  assert.equal(escolaridadeIncompleto.stage_after, "regularizacao_restricao");
  assert.doesNotMatch(escolaridadeIncompleto.reply_text, /curso superior|cursando|incompleto/i);
}

// 4) Regressão rápida: ctps_36_parceiro mantém comportamento.
{
  const env = buildEnv();
  const wa = "5541999300004";
  const parceiro = await simulateFromState(env, wa, "ctps_36_parceiro", "sim", {
    ctps_36: false,
    p3_ctps_36: false,
    somar_renda: true,
    financiamento_conjunto: true
  });
  assert.equal(parceiro.stage_after, "restricao");
  assert.equal(parceiro.writes.ctps_36_parceiro, true);
}

// 5) Não-gate / não-contaminação: composição <3000 e stage envio_docs permanecem intactos.
{
  const env = buildEnv();
  const waComposicao = "5541999300005";
  const comp = await simulateFromState(env, waComposicao, "renda", "2500", {
    somar_renda: false
  });
  assert.equal(comp.stage_after, "quem_pode_somar");
  assert.equal(comp.writes.renda_total_para_fluxo, 2500);

  const waDocs = "5541999300006";
  const docs = await simulateFromState(env, waDocs, "envio_docs", "ok", {
    dossie_status: "pronto",
    docs_lista_enviada: true,
    envio_docs_lista_enviada: true,
    canal_docs_status: "pendente",
    restricao: false,
    regularizacao_restricao: "em_andamento"
  });
  assert.equal(docs.stage_after, "envio_docs");
  assert.equal(Object.hasOwn(infoBag(docs), "titular_autonomo_profissao_atividade"), false);
  assert.equal(Object.hasOwn(infoBag(docs), "titular_curso_superior_status"), false);
}

console.log("autonomo_informativos_ctps_predocs.smoke: ok");
