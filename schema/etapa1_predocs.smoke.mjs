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

async function simulateFromState(env, waId, text, stOverrides = {}) {
  const stage = "envio_docs";
  env.__enovaSimulationCtx.stateByWaId[waId] = {
    wa_id: waId,
    fase_conversa: stage,
    dossie_status: "pronto",
    docs_lista_enviada: true,
    envio_docs_lista_enviada: true,
    canal_docs_status: "pendente",
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
  return data?.writes?.controle?.etapa1_informativos || {};
}

const commonPreDocs = {
  restricao: false,
  regularizacao_restricao: "em_andamento"
};

// 1) SOLO: moradia/trabalho titular e retorno sem quebrar envio_docs.
{
  const env = buildEnv();
  const wa = "5541999200001";

  const moradiaP1 = await simulateFromState(env, wa, "Bairro Boa Vista", commonPreDocs);
  assert.equal(moradiaP1.stage_after, "envio_docs");
  assert.equal(infoBag(moradiaP1).informativo_moradia_p1, "Bairro Boa Vista");
  assert.match(moradiaP1.reply_text, /local de trabalho seu/i);

  const trabalhoP1 = await simulateFromState(env, wa, "Centro", {
    ...commonPreDocs,
    controle: { etapa1_informativos: { informativo_moradia_p1: "Bairro Boa Vista" } }
  });
  assert.equal(trabalhoP1.stage_after, "envio_docs");
  assert.equal(infoBag(trabalhoP1).informativo_trabalho_p1, "Centro");
  assert.doesNotMatch(trabalhoP1.reply_text, /local de moradia|local de trabalho/i);
}

// 2) PARCEIRO: coleta p1+p2 (moradia/trabalho) com composição fechada.
{
  const env = buildEnv();
  const wa = "5541999200002";
  const common = {
    ...commonPreDocs,
    financiamento_conjunto: true,
    restricao_parceiro: false
  };

  const m1 = await simulateFromState(env, wa, "Pilarzinho", common);
  assert.equal(m1.stage_after, "envio_docs");
  assert.equal(infoBag(m1).informativo_moradia_p1, "Pilarzinho");
  assert.match(m1.reply_text, /moradia do\(a\) parceiro\(a\)/i);

  const m2 = await simulateFromState(env, wa, "Santa Felicidade", {
    ...common,
    controle: { etapa1_informativos: { informativo_moradia_p1: "Pilarzinho" } }
  });
  assert.equal(infoBag(m2).informativo_moradia_p2, "Santa Felicidade");
  assert.match(m2.reply_text, /local de trabalho seu/i);

  const t1 = await simulateFromState(env, wa, "Batel", {
    ...common,
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Pilarzinho",
        informativo_moradia_p2: "Santa Felicidade"
      }
    }
  });
  assert.equal(infoBag(t1).informativo_trabalho_p1, "Batel");
  assert.match(t1.reply_text, /trabalho do\(a\) parceiro\(a\)/i);

  const t2 = await simulateFromState(env, wa, "Portão", {
    ...common,
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Pilarzinho",
        informativo_moradia_p2: "Santa Felicidade",
        informativo_trabalho_p1: "Batel"
      }
    }
  });
  assert.equal(t2.stage_after, "envio_docs");
  assert.equal(infoBag(t2).informativo_trabalho_p2, "Portão");
  assert.doesNotMatch(t2.reply_text, /local de moradia|local de trabalho/i);
}

// 3a) FAMILIAR COM P3 NÃO FECHADO: não pergunta P3.
{
  const env = buildEnv();
  const wa = "5541999200003";
  const common = {
    ...commonPreDocs,
    somar_renda: true,
    p2_tipo: "familiar",
    p3_required: true,
    p3_done: false,
    restricao_parceiro: false
  };

  const t2 = await simulateFromState(env, wa, "Centro Cívico", {
    ...common,
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Cabral",
        informativo_moradia_p2: "Juvevê",
        informativo_trabalho_p1: "Ahú"
      }
    }
  });
  assert.equal(t2.stage_after, "envio_docs");
  assert.equal(infoBag(t2).informativo_trabalho_p2, "Centro Cívico");
  assert.equal(Object.prototype.hasOwnProperty.call(infoBag(t2), "informativo_moradia_p3"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(infoBag(t2), "informativo_trabalho_p3"), false);
}

// 3b) FAMILIAR COM P3 FECHADO: captura P3 e retorna para envio_docs.
{
  const env = buildEnv();
  const wa = "5541999200004";
  const common = {
    ...commonPreDocs,
    somar_renda: true,
    p2_tipo: "familiar",
    p3_required: true,
    p3_done: true,
    restricao_parceiro: false
  };

  const moradiaP3 = await simulateFromState(env, wa, "Mercês", {
    ...common,
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Cabral",
        informativo_moradia_p2: "Juvevê"
      }
    }
  });
  assert.equal(moradiaP3.stage_after, "envio_docs");
  assert.equal(infoBag(moradiaP3).informativo_moradia_p3, "Mercês");
  assert.match(moradiaP3.reply_text, /local de trabalho seu/i);

  const trabalhoP3 = await simulateFromState(env, wa, "Rebouças", {
    ...common,
    controle: {
      etapa1_informativos: {
        informativo_moradia_p1: "Cabral",
        informativo_moradia_p2: "Juvevê",
        informativo_moradia_p3: "Mercês",
        informativo_trabalho_p1: "Ahú",
        informativo_trabalho_p2: "Centro Cívico"
      }
    }
  });
  assert.equal(trabalhoP3.stage_after, "envio_docs");
  assert.equal(infoBag(trabalhoP3).informativo_trabalho_p3, "Rebouças");
  assert.doesNotMatch(trabalhoP3.reply_text, /local de moradia|local de trabalho/i);
}

console.log("etapa1_predocs.smoke: ok");
