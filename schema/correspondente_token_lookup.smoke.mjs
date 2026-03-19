import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const waCaso = "5541999998888";

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
          fase_conversa: "finalizacao_processo",
          corr_publicacao_status: "publicado_grupo_pendente_assumir",
          corr_assumir_token: "AB12CD34EF56GH78JK90LM12",
          processo_enviado_correspondente: false,
          corr_lock_correspondente_wa_id: null,
          corr_lock_assumido_em: null
        }
      }
    }
  };
}

// 1) wa_id existente: retorna payload curto esperado e sem side effects.
{
  const env = buildEnvWithState();
  const beforeState = JSON.parse(JSON.stringify(env.__enovaSimulationCtx.stateByWaId[waCaso]));
  const beforeWrites = env.__enovaSimulationCtx.writeLog.length;

  const req = new Request(`https://worker.local/__admin__/correspondente-token?wa_id=${waCaso}`, {
    method: "GET",
    headers: { "x-enova-admin-key": "adm-key" }
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data?.ok, true);
  assert.equal(data?.wa_id, waCaso);
  assert.equal(data?.fase_conversa, "finalizacao_processo");
  assert.equal(data?.corr_publicacao_status, "publicado_grupo_pendente_assumir");
  assert.equal(data?.corr_assumir_token, "AB12CD34EF56GH78JK90LM12");
  assert.equal(data?.processo_enviado_correspondente, false);
  assert.equal(data?.corr_lock_correspondente_wa_id, null);
  assert.equal(data?.corr_lock_assumido_em, null);

  assert.deepEqual(env.__enovaSimulationCtx.stateByWaId[waCaso], beforeState);
  assert.equal(env.__enovaSimulationCtx.writeLog.length, beforeWrites);
}

// 2) wa_id inexistente: resposta controlada.
{
  const env = buildEnvWithState();
  const req = new Request("https://worker.local/__admin__/correspondente-token?wa_id=5599999999999", {
    method: "GET",
    headers: { "x-enova-admin-key": "adm-key" }
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 404);
  assert.equal(data?.ok, false);
  assert.equal(data?.error, "case_not_found");
}

console.log("correspondente_token_lookup.smoke: ok");
