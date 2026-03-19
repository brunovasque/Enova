import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;
const { buildCorrespondenteGroupAlert } = workerModule;

const token = "AB12CD34EF56GH78JK90LM12";
const waCaso = "5541999998888";
const correspondenteWa = "5511999999999";

function buildEnvWithState() {
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
        [waCaso]: {
          wa_id: waCaso,
          nome: "JOAO TESTE",
          fase_conversa: "finalizacao_processo",
          corr_assumir_token: token,
          corr_publicacao_status: "publicado_grupo_pendente_assumir",
          corr_lock_correspondente_wa_id: null,
          corr_lock_assumido_em: null,
          corr_entrega_privada_status: null,
          processo_enviado_correspondente: false,
          aguardando_retorno_correspondente: false,
          dossie_resumo: "SEGREDO DOSSIE",
          renda: 8900,
          restricao: "nao",
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  };
}

// 1) Mensagem de correspondente deve conter link permanente de entrada.
{
  const env = buildEnvWithState();
  const mensagem = buildCorrespondenteGroupAlert(env.__enovaSimulationCtx.stateByWaId[waCaso], token, env);
  assert.equal(mensagem.includes("Link permanente de entrada/assunção"), true);
  assert.equal(
    mensagem.includes(`https://entrada.enova.local/correspondente/entrada?t=${token}`),
    true
  );
}

// 2) GET antes da assunção: exibe apenas capa (sem dossiê sensível).
{
  const env = buildEnvWithState();
  const req = new Request(`https://worker.local/correspondente/entrada?t=${token}`, { method: "GET" });
  const res = await worker.fetch(req, env, {});
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(html.includes("Capa do caso"), true);
  assert.equal(html.includes("Novo pré-cadastro disponível para assunção"), true);
  assert.equal(html.includes("SEGREDO DOSSIE"), false);
  assert.equal(html.includes("Renda Titular"), false);
  assert.equal(html.includes("Restrição"), false);
  assert.equal(html.includes("Resumo executivo"), true);
  assert.equal(html.includes("Perfil"), true);
  assert.equal(html.includes("Documentos por participante"), true);
  assert.equal(html.includes("Pendências"), true);
}

// 3) POST de assunção via link registra lock e mantém fluxo atual íntegro.
{
  const env = buildEnvWithState();
  const postReq = new Request("https://worker.local/correspondente/entrada", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      correspondente_wa_id: correspondenteWa
    })
  });
  const postRes = await worker.fetch(postReq, env, {});
  assert.equal(postRes.status, 303);

  const atualizado = env.__enovaSimulationCtx.stateByWaId[waCaso];
  assert.equal(atualizado.corr_lock_correspondente_wa_id, correspondenteWa);
  assert.equal(typeof atualizado.corr_lock_assumido_em, "string");
  assert.equal(atualizado.aguardando_retorno_correspondente, true);
  assert.equal(atualizado.processo_enviado_correspondente, true);

  const reopenReq = new Request(`https://worker.local/correspondente/entrada?t=${token}`, { method: "GET" });
  const reopenRes = await worker.fetch(reopenReq, env, {});
  const reopenHtml = await reopenRes.text();
  assert.equal(reopenRes.status, 200);
  assert.equal(reopenHtml.includes("já foi assumido"), true);
}

// 4) Ponte aprovado -> agendamento_visita não pode regredir.
{
  const env = buildEnvWithState();
  const req = new Request("https://worker.local/__admin__/run-canonical-suite-v1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "adm-key"
    },
    body: JSON.stringify({
      scenario_id: "terminal_retorno_correspondente_aprovado"
    })
  });
  const res = await worker.fetch(req, env, {});
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data?.ok, true);
  assert.equal(Number(data?.summary?.failed || 0), 0);
}

console.log("correspondente_entry_link.smoke: ok");
