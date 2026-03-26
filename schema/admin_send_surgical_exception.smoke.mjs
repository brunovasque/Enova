import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const waId = "5541999998888";

function buildEnv(envMode = "production") {
  return {
    ENV_MODE: envMode,
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
      stateByWaId: {}
    }
  };
}

{
  const env = buildEnv("production");
  const req = new Request("https://worker.local/__admin__/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "adm-key"
    },
    body: JSON.stringify({ wa_id: waId, text: "Teste manual prod" })
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data?.ok, true);
  assert.equal(data?.meta_status, 200);
  assert.equal(data?.message_id, "dry_run_suppressed");
  assert.equal(env.__enovaSimulationCtx?.wouldSend, true);
  assert.deepEqual(env.__enovaSimulationCtx?.sendPreview, {
    messaging_product: "whatsapp",
    to: waId,
    type: "text",
    text: { body: "Teste manual prod" }
  });
}

{
  const env = buildEnv("production");
  const req = new Request("https://worker.local/__admin__/send", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ wa_id: waId, text: "Sem auth" })
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 401);
  assert.equal(data?.ok, false);
  assert.equal(data?.error, "unauthorized");
}

{
  const env = buildEnv("production");
  const req = new Request("https://worker.local/__admin__/send", {
    method: "GET",
    headers: {
      "x-enova-admin-key": "adm-key"
    }
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 403);
  assert.equal(data?.ok, false);
  assert.equal(data?.error, "forbidden_test_only");
}

{
  const env = buildEnv("production");
  const req = new Request("https://worker.local/__admin__/cognitive-test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "adm-key"
    },
    body: JSON.stringify({ list_fixtures: true })
  });

  const res = await worker.fetch(req, env, {});
  const data = await res.json();

  assert.equal(res.status, 403);
  assert.equal(data?.ok, false);
  assert.equal(data?.error, "forbidden_test_only");
}

console.log("admin_send_surgical_exception.smoke: ok");
