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

function nextState(prevState, data) {
  const writes = data.writes || {};
  const prevControle = prevState?.controle || {};
  const writeControle = writes?.controle || {};
  return {
    ...prevState,
    ...writes,
    fase_conversa: data.stage_after,
    controle: {
      ...prevControle,
      ...writeControle,
      etapa1_informativos: {
        ...(prevControle.etapa1_informativos || {}),
        ...(writeControle.etapa1_informativos || {})
      }
    }
  };
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
  assert.match(result.reply_text, /programa minha casa minha vida/i);
  assert.match(result.reply_text, /mora atualmente/i);
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
  assert.match(fromRestricao.reply_text, /mora atualmente|local de trabalho|preferência para moradia/i);

  const envParceiroNao = buildEnv();
  const fromRestricaoParceiroNao = await simulateFromState(envParceiroNao, "5541999200103", "restricao_parceiro", "não", {
    ...preDocsBase,
    restricao: false,
    p3_required: false
  });
  assert.equal(fromRestricaoParceiroNao.stage_after, "restricao_parceiro");
  assert.match(fromRestricaoParceiroNao.reply_text, /mora atualmente|local de trabalho|preferência para moradia/i);

  const envParceiroIncerto = buildEnv();
  const fromRestricaoParceiroIncerto = await simulateFromState(envParceiroIncerto, "5541999200104", "restricao_parceiro", "não sei", {
    ...preDocsBase,
    restricao: false,
    p3_required: false
  });
  assert.equal(fromRestricaoParceiroIncerto.stage_after, "restricao_parceiro");
  assert.match(fromRestricaoParceiroIncerto.reply_text, /mora atualmente|local de trabalho|preferência para moradia/i);

  const envRegularizacaoP3 = buildEnv();
  const fromRegularizacaoP3 = await simulateFromState(envRegularizacaoP3, "5541999200105", "regularizacao_restricao_p3", "sim", {
    ...preDocsBase,
    p3_required: true,
    p3_done: true,
    renda_total_para_fluxo: 5000
  });
  assert.equal(fromRegularizacaoP3.stage_after, "regularizacao_restricao_p3");
  assert.match(fromRegularizacaoP3.reply_text, /mora atualmente|local de trabalho|preferência para moradia/i);
}

// 2.1) caminhos que antes caiam direto em envio_docs também passam pelo pré-docs.
{
  const envSoloNao = buildEnv();
  const soloNao = await simulateFromState(envSoloNao, "5541999200110", "restricao", "não", {
    ...preDocsBase,
    financiamento_conjunto: false,
    somar_renda: false,
    p3_required: false
  });
  assert.equal(soloNao.stage_after, "restricao");
  assert.match(soloNao.reply_text, /mora atualmente|local de trabalho|preferência para moradia|reserva|fgts|parcela/i);

  const envSoloIncerto = buildEnv();
  const soloIncerto = await simulateFromState(envSoloIncerto, "5541999200111", "restricao", "não sei", {
    ...preDocsBase,
    financiamento_conjunto: false,
    somar_renda: false,
    p3_required: false
  });
  assert.equal(soloIncerto.stage_after, "restricao");
  assert.match(soloIncerto.reply_text, /mora atualmente|local de trabalho|preferência para moradia|reserva|fgts|parcela/i);

  const envParceiroNaoDireto = buildEnv();
  const parceiroNaoDireto = await simulateFromState(envParceiroNaoDireto, "5541999200112", "restricao", "não", {
    ...preDocsBase,
    financiamento_conjunto: true,
    restricao: false,
    restricao_parceiro: null,
    p3_required: false
  });
  assert.equal(parceiroNaoDireto.stage_after, "restricao");
  assert.match(parceiroNaoDireto.reply_text, /mora atualmente|local de trabalho|preferência para moradia|reserva|fgts|parcela/i);

  const envParceiroIncertoDireto = buildEnv();
  const parceiroIncertoDireto = await simulateFromState(envParceiroIncertoDireto, "5541999200113", "restricao", "não sei", {
    ...preDocsBase,
    financiamento_conjunto: true,
    restricao: false,
    restricao_parceiro: null,
    p3_required: false
  });
  assert.equal(parceiroIncertoDireto.stage_after, "restricao");
  assert.match(parceiroIncertoDireto.reply_text, /mora atualmente|local de trabalho|preferência para moradia|reserva|fgts|parcela/i);
}

// 2.2) Cenário 1: fluxo completo do PRÉ-DOCS com nova abertura, nova ordem, valores e handoff para docs.
{
  const env = buildEnv();
  const wa = "5541999200114";
  let flowState = {
    ...preDocsBase,
    renda: 4500,
    controle: { etapa1_informativos: {} }
  };

  const abertura = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(abertura.stage_after, "regularizacao_restricao");
  assert.match(abertura.reply_text, /programa minha casa minha vida/i);
  assert.match(abertura.reply_text, /mora atualmente/i);
  flowState = nextState(flowState, abertura);

  const moradiaAtual = await simulateFromState(env, wa, "regularizacao_restricao", "Batel", flowState);
  assert.equal(moradiaAtual.stage_after, "regularizacao_restricao");
  assert.match(moradiaAtual.reply_text, /local de trabalho/i);
  flowState = nextState(flowState, moradiaAtual);

  const trabalho = await simulateFromState(env, wa, "regularizacao_restricao", "Centro", flowState);
  assert.equal(trabalho.stage_after, "regularizacao_restricao");
  assert.match(trabalho.reply_text, /prefer[eê]ncia para moradia/i);
  flowState = nextState(flowState, trabalho);

  const moradiaPreferencia = await simulateFromState(env, wa, "regularizacao_restricao", "Água Verde", flowState);
  assert.equal(moradiaPreferencia.stage_after, "regularizacao_restricao");
  assert.match(moradiaPreferencia.reply_text, /até qual valor mensal considera pagar de parcela/i);
  flowState = nextState(flowState, moradiaPreferencia);

  const parcela = await simulateFromState(env, wa, "regularizacao_restricao", "R$ 1.200", flowState);
  assert.equal(parcela.stage_after, "regularizacao_restricao");
  assert.match(parcela.reply_text, /reserva para entrada/i);
  flowState = nextState(flowState, parcela);

  const reserva = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(reserva.stage_after, "regularizacao_restricao");
  assert.match(reserva.reply_text, /qual valor aproximadamente você tem de reserva/i);
  assert.match(reserva.reply_text, /não tem problema/i);
  flowState = nextState(flowState, reserva);

  const reservaValor = await simulateFromState(env, wa, "regularizacao_restricao", "R$ 20 mil", flowState);
  assert.equal(reservaValor.stage_after, "regularizacao_restricao");
  assert.match(reservaValor.reply_text, /fgts disponível hoje/i);
  flowState = nextState(flowState, reservaValor);

  const fgts = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(fgts.stage_after, "regularizacao_restricao");
  assert.match(fgts.reply_text, /valor aproximadamente você tem disponível no fgts/i);
  flowState = nextState(flowState, fgts);

  const fgtsValor = await simulateFromState(env, wa, "regularizacao_restricao", "R$ 8 mil", flowState);
  assert.equal(fgtsValor.stage_after, "envio_docs");
  assert.match(fgtsValor.reply_text, /Com essas informações mais os dados de seu perfil do programa/i);
  assert.match(fgtsValor.reply_text, /Me confirme com \*sim\* que eu já libero a lista objetiva dos documentos/i);
  assert.doesNotMatch(fgtsValor.reply_text, /Último ponto informativo antes dos documentos/i);
  flowState = nextState(flowState, fgtsValor);

  assert.equal(flowState.controle.etapa1_informativos.informativo_moradia_atual_p1, "Batel");
  assert.equal(flowState.controle.etapa1_informativos.informativo_trabalho_p1, "Centro");
  assert.equal(flowState.controle.etapa1_informativos.informativo_moradia_p1, "Água Verde");
  assert.equal(flowState.controle.etapa1_informativos.informativo_parcela_mensal, "R$ 1.200");
  assert.equal(flowState.controle.etapa1_informativos.visita_reserva_entrada_tem, true);
  assert.equal(flowState.controle.etapa1_informativos.visita_reserva_entrada_valor, "R$ 20 mil");
  assert.equal(flowState.controle.etapa1_informativos.visita_fgts_disponivel, true);
  assert.equal(flowState.controle.etapa1_informativos.visita_fgts_valor, "R$ 8 mil");

  const docs = await simulateFromState(env, wa, "envio_docs", "sim", {
    ...flowState,
    dossie_status: "pronto",
    docs_lista_enviada: false,
    envio_docs_lista_enviada: false,
    canal_docs_status: "pendente"
  });
  assert.equal(docs.stage_after, "envio_docs");
  assert.equal(docs.writes.docs_lista_enviada, true);
  assert.equal(docs.writes.envio_docs_lista_enviada, true);
  assert.match(docs.reply_text, /Me envie primeiro seu documento de identificação/i);
  assert.doesNotMatch(docs.reply_text, /Último ponto informativo antes dos documentos/i);
}

// 2.3) Cenário 2: reserva = sim + "não quero informar" avança sem travar.
{
  const env = buildEnv();
  const wa = "5541999200115";
  let flowState = {
    ...preDocsBase,
    controle: {
      etapa1_informativos: {
        informativo_moradia_atual_p1: "Atual",
        informativo_trabalho_p1: "Batel",
        informativo_moradia_p1: "Centro",
        informativo_parcela_mensal: "R$ 1.000"
      }
    }
  };
  const result = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(result.stage_after, "regularizacao_restricao");
  assert.match(result.reply_text, /qual valor aproximadamente você tem de reserva/i);
  flowState = nextState(flowState, result);

  const semValor = await simulateFromState(env, wa, "regularizacao_restricao", "não quero informar", flowState);
  assert.equal(semValor.stage_after, "regularizacao_restricao");
  assert.equal(infoBag(semValor).visita_reserva_entrada_valor, "não informado");
  assert.match(semValor.reply_text, /fgts disponível hoje/i);
}

// 2.4) Cenário 3: baixa renda mantém escolaridade no PRÉ-DOCS após FGTS.
{
  const env = buildEnv();
  const wa = "5541999200116";
  let flowState = {
    ...preDocsBase,
    renda: 3000,
    controle: {
      etapa1_informativos: {
        informativo_moradia_atual_p1: "Atual",
        informativo_trabalho_p1: "Batel",
        informativo_moradia_p1: "Centro",
        informativo_parcela_mensal: "R$ 1.000",
        visita_reserva_entrada_tem: false
      }
    }
  };
  const first = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(first.stage_after, "regularizacao_restricao");
  assert.match(first.reply_text, /valor aproximadamente você tem disponível no fgts/i);
  flowState = nextState(flowState, first);

  const second = await simulateFromState(env, wa, "regularizacao_restricao", "não sei", flowState);
  assert.equal(second.stage_after, "regularizacao_restricao");
  assert.equal(infoBag(second).visita_fgts_valor, "não informado");
  assert.match(second.reply_text, /Último ponto informativo antes dos documentos/i);
  assert.match(second.reply_text, /curso superior/i);
}

// 2.5) Cenário 4: escolaridade respondida com "sim" salva e avança sem repetir.
{
  const env = buildEnv();
  const wa = "5541999200119";
  let flowState = {
    ...preDocsBase,
    renda: 3000,
    controle: {
      etapa1_informativos: {
        informativo_moradia_atual_p1: "Atual",
        informativo_trabalho_p1: "Batel",
        informativo_moradia_p1: "Centro",
        informativo_parcela_mensal: "R$ 1.000",
        visita_reserva_entrada_tem: false,
        visita_fgts_disponivel: false,
        predocs_routing_active: true,
        predocs_routing_stage: "regularizacao_restricao",
        predocs_routing_envio_docs_message: [
          "Perfeito! 👌",
          "Agora vou te passar a documentação certa do seu caso pra seguirmos com envio online.",
          "Me confirme com *sim* que eu já libero a lista objetiva dos documentos."
        ]
      }
    }
  };

  const escolaridadePrompt = await simulateFromState(env, wa, "regularizacao_restricao", "oi", flowState);
  assert.equal(escolaridadePrompt.stage_after, "regularizacao_restricao");
  assert.match(escolaridadePrompt.reply_text, /Último ponto informativo antes dos documentos/i);
  flowState = nextState(flowState, escolaridadePrompt);

  const escolaridadeSim = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(escolaridadeSim.stage_after, "envio_docs");
  assert.equal(infoBag(escolaridadeSim).titular_curso_superior_status, "sim");
  assert.doesNotMatch(escolaridadeSim.reply_text, /Último ponto informativo antes dos documentos/i);
  assert.match(escolaridadeSim.reply_text, /Com essas informações mais os dados de seu perfil do programa/i);
  assert.match(escolaridadeSim.reply_text, /documentos/i);
}

// 2.6) Cenário 5: escolaridade respondida com "não" salva e avança sem repetir.
{
  const env = buildEnv();
  const wa = "5541999200121";
  let flowState = {
    ...preDocsBase,
    renda: 3000,
    controle: {
      etapa1_informativos: {
        informativo_moradia_atual_p1: "Atual",
        informativo_trabalho_p1: "Batel",
        informativo_moradia_p1: "Centro",
        informativo_parcela_mensal: "R$ 1.000",
        visita_reserva_entrada_tem: false,
        visita_fgts_disponivel: false,
        predocs_routing_active: true,
        predocs_routing_stage: "regularizacao_restricao",
        predocs_routing_envio_docs_message: [
          "Perfeito! 👌",
          "Agora vou te passar a documentação certa do seu caso pra seguirmos com envio online.",
          "Me confirme com *sim* que eu já libero a lista objetiva dos documentos."
        ]
      }
    }
  };

  const escolaridadePrompt = await simulateFromState(env, wa, "regularizacao_restricao", "oi", flowState);
  assert.equal(escolaridadePrompt.stage_after, "regularizacao_restricao");
  assert.match(escolaridadePrompt.reply_text, /Último ponto informativo antes dos documentos/i);
  flowState = nextState(flowState, escolaridadePrompt);

  const escolaridadeNao = await simulateFromState(env, wa, "regularizacao_restricao", "não", flowState);
  assert.equal(escolaridadeNao.stage_after, "envio_docs");
  assert.equal(infoBag(escolaridadeNao).titular_curso_superior_status, "nao");
  assert.doesNotMatch(escolaridadeNao.reply_text, /Último ponto informativo antes dos documentos/i);
  assert.match(escolaridadeNao.reply_text, /Com essas informações mais os dados de seu perfil do programa/i);
  assert.match(escolaridadeNao.reply_text, /documentos/i);
}

// 2.7) Cenário 6: reserva = sim + sem valor e FGTS = sim + sem valor avançam para docs.
{
  const env = buildEnv();
  const wa = "5541999200117";
  let flowState = {
    ...preDocsBase,
    renda: 4500,
    controle: {
      etapa1_informativos: {
        informativo_moradia_atual_p1: "Atual",
        informativo_trabalho_p1: "Batel",
        informativo_moradia_p1: "Centro",
        informativo_parcela_mensal: "R$ 1.000"
      }
    }
  };

  const reserva = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(reserva.stage_after, "regularizacao_restricao");
  assert.match(reserva.reply_text, /qual valor aproximadamente você tem de reserva/i);
  flowState = nextState(flowState, reserva);

  const reservaSemValor = await simulateFromState(env, wa, "regularizacao_restricao", "", flowState);
  assert.equal(reservaSemValor.stage_after, "regularizacao_restricao");
  assert.equal(infoBag(reservaSemValor).visita_reserva_entrada_valor, "não informado");
  assert.match(reservaSemValor.reply_text, /fgts disponível hoje/i);
  flowState = nextState(flowState, reservaSemValor);

  const fgts = await simulateFromState(env, wa, "regularizacao_restricao", "sim", flowState);
  assert.equal(fgts.stage_after, "regularizacao_restricao");
  assert.match(fgts.reply_text, /valor aproximadamente você tem disponível no fgts/i);
  flowState = nextState(flowState, fgts);

  const fgtsSemValor = await simulateFromState(env, wa, "regularizacao_restricao", "", flowState);
  assert.equal(fgtsSemValor.stage_after, "envio_docs");
  assert.equal(infoBag(fgtsSemValor).visita_fgts_valor, "não informado");
}

// 2.8) Cenário 7: reserva = não e FGTS = não segue normal para docs.
{
  const env = buildEnv();
  const wa = "5541999200118";
  let flowState = {
    ...preDocsBase,
    renda: 4500,
    controle: {
      etapa1_informativos: {
        informativo_moradia_atual_p1: "Atual",
        informativo_trabalho_p1: "Batel",
        informativo_moradia_p1: "Centro",
        informativo_parcela_mensal: "R$ 1.000"
      }
    }
  };

  const reservaNao = await simulateFromState(env, wa, "regularizacao_restricao", "não", flowState);
  assert.equal(reservaNao.stage_after, "regularizacao_restricao");
  assert.equal(infoBag(reservaNao).visita_reserva_entrada_tem, false);
  assert.match(reservaNao.reply_text, /fgts disponível hoje/i);
  flowState = nextState(flowState, reservaNao);

  const fgtsNao = await simulateFromState(env, wa, "regularizacao_restricao", "não", flowState);
  assert.equal(fgtsNao.stage_after, "envio_docs");
  assert.equal(infoBag(fgtsNao).visita_fgts_disponivel, false);
}

// 3) envio_docs não intercepta bloco informativo e reconhece "sim" para liberar a lista.
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
  assert.equal(result.writes.docs_lista_enviada, true);
  assert.doesNotMatch(result.reply_text, /local de moradia|local de trabalho|curso superior|fgts|reserva/i);
  assert.match(result.reply_text, /Me envie primeiro seu documento de identificação/i);
}

// 4) resposta livre no pré-docs não pode cair no guard sim/não do stage original.
{
  const env = buildEnv();
  const wa = "5541999200120";
  const first = await simulateFromState(env, wa, "restricao", "não", {
    ...preDocsBase,
    financiamento_conjunto: false,
    somar_renda: false,
    p3_required: false
  });
  assert.equal(first.stage_after, "restricao");
  assert.match(first.reply_text, /mora atualmente|local de trabalho|preferência para moradia|reserva|fgts|parcela/i);

  const second = await simulateFromState(env, wa, "restricao", "merces", {
    ...(env.__enovaSimulationCtx.stateByWaId[wa] || {}),
    controle: {
      etapa1_informativos: {
        ...(preDocsBase.controle?.etapa1_informativos || {}),
        predocs_routing_active: true,
        predocs_routing_stage: "restricao",
        predocs_routing_envio_docs_message: [
          "Perfeito! 👌",
          "Agora vou te passar a documentação certa do seu caso pra seguirmos com envio online.",
          "Me confirme com *sim* que eu já libero a lista objetiva dos documentos."
        ]
      }
    }
  });
  assert.equal(second.stage_after, "restricao");
  assert.doesNotMatch(second.reply_text, /Pra eu seguir aqui, me responde só a pergunta anterior direitinho/i);
  assert.match(second.reply_text, /mora atualmente|local de trabalho|preferência para moradia|reserva|fgts|parcela/i);
}

console.log("etapa1_predocs.smoke: ok");
