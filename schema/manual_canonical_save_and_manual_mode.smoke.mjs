import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const adminKey = "smoke-admin-key";
const waId = "5541991230001";

function buildEnv(initialState = {}) {
  return {
    ENV_MODE: "test",
    DEBUG_META_WEBHOOK: "1",
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
          fase_conversa: "estado_civil",
          funil_status: "ativo",
          nome: "Nome Base",
          ...initialState
        }
      }
    }
  };
}

function buildWebhookTextRequest({ from, body, id }) {
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

async function callManualSave(env, payload, withAuth = true) {
  const headers = {
    "content-type": "application/json"
  };
  if (withAuth) headers["x-enova-admin-key"] = adminKey;
  const req = new Request("https://worker.local/__admin__/manual-canonical-save", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const res = await worker.fetch(req, env, {});
  const data = await res.json();
  return { res, data };
}

{
  const env = buildEnv({ atendimento_manual: true, fase_conversa: "renda", last_bot_msg: "prévio" });
  const captured = [];
  const originalLog = console.log;
  console.log = (...args) => {
    captured.push(args);
    return originalLog(...args);
  };
  try {
    const req = buildWebhookTextRequest({
      from: waId,
      body: "oi",
      id: "wamid.manual.mode.bypass"
    });
    const res = await worker.fetch(req, env, {});
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reason, "manual_mode_bypass");
    assert.equal(env.__enovaSimulationCtx.messageLog.length, 0);
    assert.equal(env.__enovaSimulationCtx.wouldSend, false);
    const stateAfter = env.__enovaSimulationCtx.stateByWaId[waId];
    assert.equal(stateAfter.fase_conversa, "renda");
    const hasBypassLog = captured.some((entry) => entry[0] === "[MANUAL_MODE_BYPASS]");
    assert.equal(hasBypassLog, true);
  } finally {
    console.log = originalLog;
  }
}

{
  const env = buildEnv({ atendimento_manual: false, fase_conversa: "estado_civil" });
  const req = buildWebhookTextRequest({
    from: waId,
    body: "casado",
    id: "wamid.manual.mode.normal"
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.reason, "runFunnel_ok");
}

{
  const env = buildEnv({ renda: 1500 });
  const { res, data } = await callManualSave(env, {
    wa_id: waId,
    field: "renda",
    value: "2.500",
    source: "panel_manual",
    operator: "op_a"
  });
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.blocked, false);
  assert.equal(data.previous_value, 1500);
  assert.equal(data.normalized_value, 2500);
  assert.equal(data.changed, true);
  assert.equal(data.write_applied, true);
}

{
  const env = buildEnv();
  const blockedFields = [
    "fase_conversa",
    "funil_status",
    "docs_identidade",
    "corr_publicacao_status",
    "visita_confirmada",
    "_incoming_media",
    "__cognitive_reply_prefix",
    "renda_total_para_fluxo"
  ];
  for (const field of blockedFields) {
    const { res, data } = await callManualSave(env, {
      wa_id: waId,
      field,
      value: "x",
      source: "panel_manual",
      operator: "op_b"
    });
    assert.equal(res.status, 200);
    assert.equal(data.ok, false);
    assert.equal(data.blocked, true);
    assert.equal(data.failed_at, "allowlist");
    assert.equal(data.changed, false);
    assert.equal(typeof data.block_reason, "string");
  }
}

{
  const env = buildEnv();
  const { res, data } = await callManualSave(env, {
    wa_id: waId,
    field: "renda",
    value: "abc",
    source: "panel_manual",
    operator: "op_c"
  });
  assert.equal(res.status, 400);
  assert.equal(data.ok, false);
  assert.equal(data.failed_at, "normalize");
}

{
  const env = buildEnv();
  const { res, data } = await callManualSave(
    env,
    {
      wa_id: waId,
      field: "renda",
      value: 2000,
      source: "panel_manual",
      operator: "op_d"
    },
    false
  );
  assert.equal(res.status, 401);
  assert.equal(data.ok, false);
  assert.equal(data.failed_at, "auth");
}

console.log("manual_canonical_save_and_manual_mode.smoke: ok");
