import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

function buildEnv() {
  return {
    ENV_MODE: "test",
    TELEMETRIA_LEVEL: "debug",
    DEBUG_META_WEBHOOK: "1",
    ENOVA_META_RAW_CAPTURE: "0",
    ENOVA_ADMIN_KEY: "smoke-admin-key",
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
        "5511980000003": {
          wa_id: "5511980000003",
          fase_conversa: "inicio_nome",
          funil_status: "ativo",
          atendimento_manual: true
        },
        "5511980000004": {
          wa_id: "5511980000004",
          fase_conversa: "inicio_nome",
          funil_status: "ativo",
          atendimento_manual: true
        }
      }
    }
  };
}

function buildWebhookEvent({ waId, messageId, text }) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: waId,
            id: messageId,
            timestamp: "1773183927",
            type: "text",
            text: { body: text }
          }],
          contacts: [{ wa_id: waId }],
          metadata: { phone_number_id: "test" }
        }
      }]
    }]
  };
}

function buildHeadersSubset() {
  return {
    "content-type": "application/json",
    "user-agent": "meta-smoke-agent/1.0",
    "cf-ray": "smoke-ray-raw-replay",
    "x-hub-signature": "sha1=abc123",
    "x-hub-signature-256": "sha256=def456"
  };
}

async function dispatchAdminReplay({ env, body }) {
  const req = new Request("https://worker.local/__admin__/replay-webhook-raw", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "smoke-admin-key"
    },
    body: JSON.stringify(body)
  });

  const resp = await worker.fetch(req, env, {});
  const data = await resp.json();
  return { resp, data };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname !== "proxy.example.com") {
    return originalFetch(input, init);
  }

  const path = url.searchParams.get("path");
  const method = String(init.method || "GET").toUpperCase();
  if (path === "/rest/v1/enova_log" && method === "GET") {
    const replayIdForLookup = "replay-ok-123";
    const capture = {
      id: 1,
      tag: "META_WEBHOOK_RAW_CAPTURE",
      details: {
        replay_id: replayIdForLookup,
        raw_body: JSON.stringify(buildWebhookEvent({
          waId: "5511980000003",
          messageId: "wamid.raw.replay.by.id",
          text: "replay por id"
        })),
        headers_subset: buildHeadersSubset(),
        pathname: "/webhook/meta",
        method: "POST"
      },
      created_at: new Date().toISOString()
    };
    return new Response(JSON.stringify([capture]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  if (path === "/rest/v1/enova_log" && method === "POST") {
    return new Response(JSON.stringify([{ ok: true }]), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  }

  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

try {
  // 1) replay por replay_id válido
  {
    const env = buildEnv();
    const { resp, data } = await dispatchAdminReplay({
      env,
      body: { replay_id: "replay-ok-123" }
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.source, "replay_id");
    assert.equal(data.replay_id, "replay-ok-123");
    assert.equal(data.pathname, "/webhook/meta");
    assert.equal(data.method, "POST");
    assert.equal(data.forward_status, 200);
    assert.match(String(data.forward_body || ""), /manual_mode_bypass/);
  }

  // 2) replay explícito com raw_body + headers_subset
  {
    const env = buildEnv();
    const { resp, data } = await dispatchAdminReplay({
      env,
      body: {
        raw_body: JSON.stringify(buildWebhookEvent({
          waId: "5511980000004",
          messageId: "wamid.raw.replay.explicit",
          text: "replay explicito"
        })),
        headers_subset: buildHeadersSubset(),
        pathname: "/webhook/meta",
        method: "POST"
      }
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.source, "explicit");
    assert.equal(data.replay_id, null);
    assert.equal(data.pathname, "/webhook/meta");
    assert.equal(data.method, "POST");
    assert.equal(data.forward_status, 200);
    assert.match(String(data.forward_body || ""), /manual_mode_bypass/);
  }

  // 3) replay_id inexistente
  {
    const env = buildEnv();
    const { resp, data } = await dispatchAdminReplay({
      env,
      body: { replay_id: "inexistente-404" }
    });

    assert.equal(resp.status, 404);
    assert.equal(data.ok, false);
    assert.equal(data.error, "replay_not_found");
    assert.equal(data.replay_id, "inexistente-404");
  }

  // 4) raw_body malformado
  {
    const env = buildEnv();
    const { resp, data } = await dispatchAdminReplay({
      env,
      body: {
        raw_body: "{\"object\":\"whatsapp_business_account\",invalid}",
        headers_subset: buildHeadersSubset(),
        pathname: "/webhook/meta",
        method: "POST"
      }
    });

    assert.equal(resp.status, 400);
    assert.equal(data.ok, false);
    assert.equal(data.error, "invalid_raw_body");
    assert.equal(data.source, "explicit");
    assert.equal(data.forward_status, 200);
    assert.match(String(data.forward_body || ""), /webhook_parse_error/);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("replay_webhook_raw.smoke: ok");
