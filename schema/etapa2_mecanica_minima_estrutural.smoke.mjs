import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const adminKey = "etapa2-estrutural-admin-key";
const waId = "5541993334444";

function buildEnv() {
  return {
    ENV_MODE: "test",
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
      stateByWaId: {
        [waId]: {
          wa_id: waId,
          nome: "JOAO TESTE",
          fase_conversa: "inicio",
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  };
}

async function simulateFromState(env, stage, text, stOverrides = {}) {
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
      st_overrides: {
        wa_id: waId,
        nome: "JOAO TESTE",
        fase_conversa: stage,
        ...stOverrides
      }
    })
  });
  const resp = await worker.fetch(req, env, { waitUntil() {} });
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.ok, true);
  return data;
}

// 1) CLT fixo/variável sem alterar trilho principal.
{
  const env = buildEnv();
  const fixed = await simulateFromState(env, "inicio_multi_regime_pergunta", "salário fixo, só esse", {
    regime: "clt",
    regime_trabalho: "clt"
  });
  assert.equal(fixed.stage_after, "renda");
  assert.equal(
    fixed.writes?.controle?.etapa2_estrutural?.clt_renda_perfil_por_participante?.p1,
    "fixo"
  );

  const variable = await simulateFromState(env, "inicio_multi_regime_pergunta", "varia por comissão e hora extra, só esse", {
    regime: "clt",
    regime_trabalho: "clt"
  });
  assert.equal(variable.stage_after, "renda");
  assert.equal(
    variable.writes?.controle?.etapa2_estrutural?.clt_renda_perfil_por_participante?.p1,
    "variavel"
  );
}

// 2) Renda extra entra/não entra na composição por participante.
{
  const env = buildEnv();
  const entra = await simulateFromState(env, "inicio_multi_renda_pergunta", "entra na composição", {
    renda: 3500
  });
  assert.equal(entra.stage_after, "inicio_multi_renda_pergunta");
  assert.equal(
    entra.writes?.controle?.etapa2_estrutural?.renda_extra_entra_composicao_por_participante?.p1,
    true
  );

  const naoEntraParceiro = await simulateFromState(
    env,
    "inicio_multi_renda_pergunta_parceiro",
    "não entra na composição",
    {
      regime_trabalho_parceiro: "clt",
      renda: 4000,
      renda_parceiro: 1800
    }
  );
  assert.equal(naoEntraParceiro.stage_after, "inicio_multi_renda_pergunta_parceiro");
  assert.equal(
    naoEntraParceiro.writes?.controle?.etapa2_estrutural?.renda_extra_entra_composicao_por_participante?.p2,
    false
  );
}

// 3) Multi renda/multi regime por participante (p1/p2/p3).
{
  const env = buildEnv();

  const rendaP1 = await simulateFromState(env, "inicio_multi_renda_coletar", "Bico - 1000", {});
  assert.equal(
    Number(rendaP1.writes?.controle?.etapa2_estrutural?.multi_renda_qtd_por_participante?.p1 || 0) >= 1,
    true
  );

  const rendaP2 = await simulateFromState(env, "inicio_multi_renda_coletar_parceiro", "Freela - 800", {});
  assert.equal(
    Number(rendaP2.writes?.controle?.etapa2_estrutural?.multi_renda_qtd_por_participante?.p2 || 0) >= 1,
    true
  );

  const rendaP3 = await simulateFromState(env, "inicio_multi_renda_p3_loop", "Extra - 500", {});
  assert.equal(
    Number(rendaP3.writes?.controle?.etapa2_estrutural?.multi_renda_qtd_por_participante?.p3 || 0) >= 1,
    true
  );

  const regimeP1 = await simulateFromState(env, "inicio_multi_regime_coletar", "autônomo", {});
  assert.equal(
    Number(regimeP1.writes?.controle?.etapa2_estrutural?.multi_regime_qtd_por_participante?.p1 || 0) >= 1,
    true
  );

  const regimeP2 = await simulateFromState(env, "inicio_multi_regime_coletar_parceiro", "servidor", {});
  assert.equal(
    Number(regimeP2.writes?.controle?.etapa2_estrutural?.multi_regime_qtd_por_participante?.p2 || 0) >= 1,
    true
  );

  const regimeP3 = await simulateFromState(env, "inicio_multi_regime_p3_loop", "clt", {});
  assert.equal(
    Number(regimeP3.writes?.controle?.etapa2_estrutural?.multi_regime_qtd_por_participante?.p3 || 0) >= 1,
    true
  );
}

// 4) Reprovação categorizada no nível do caso sem mudar transição.
{
  const env = buildEnv();

  const scr = await simulateFromState(
    env,
    "aguardando_retorno_correspondente",
    "Pré-cadastro # 123456\nJOAO TESTE\nSTATUS: REPROVADO\nMOTIVO: SCR/BACEN",
    { nome: "JOAO TESTE", nome_parceiro_normalizado: null }
  );
  assert.equal(scr.stage_after, "aguardando_retorno_correspondente");
  assert.equal(scr.writes?.controle?.etapa2_estrutural?.reprovacao_categoria_caso, "scr_bacen");

  const sinad = await simulateFromState(
    env,
    "aguardando_retorno_correspondente",
    "Pré-cadastro # 123456\nJOAO TESTE\nSTATUS: REPROVADO\nMOTIVO: SINAD/CONRES",
    { nome: "JOAO TESTE", nome_parceiro_normalizado: null }
  );
  assert.equal(sinad.writes?.controle?.etapa2_estrutural?.reprovacao_categoria_caso, "sinad_conres");

  const comprometimento = await simulateFromState(
    env,
    "aguardando_retorno_correspondente",
    "Pré-cadastro # 123456\nJOAO TESTE\nSTATUS: REPROVADO\nMOTIVO: comprometimento de renda",
    { nome: "JOAO TESTE", nome_parceiro_normalizado: null }
  );
  assert.equal(
    comprometimento.writes?.controle?.etapa2_estrutural?.reprovacao_categoria_caso,
    "comprometimento_renda"
  );
}

// 5) Contadores oficiais de docs/follow-up sem contador paralelo.
{
  const env = buildEnv();

  const docsFollow = await simulateFromState(env, "envio_docs", "ok", {
    envio_docs_status: "pendente",
    docs_lista_enviada: true,
    envio_docs_lista_enviada: true,
    envio_docs_lembrete_count: 0
  });
  assert.equal(docsFollow.stage_after, "envio_docs");
  assert.equal(docsFollow.writes?.envio_docs_lembrete_count, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(docsFollow.writes || {}, "docs_followup_count"), false);

  const visitaFollow = await simulateFromState(env, "finalizacao_processo", "não quero atendimento online", {
    fase_conversa: "finalizacao_processo",
    processo_enviado_correspondente: false,
    envio_docs_status: "completo",
    pacote_status: "pronto",
    dossie_resumo: "ok",
    visita_confirmada: false,
    funil_status: "ativo",
    visita_recusa_online_tentativas_count: 1
  });
  assert.equal(visitaFollow.stage_after, "finalizacao_processo");
  assert.equal(Object.prototype.hasOwnProperty.call(visitaFollow.writes || {}, "followup_count"), false);
}

console.log("etapa2_mecanica_minima_estrutural.smoke: ok");
