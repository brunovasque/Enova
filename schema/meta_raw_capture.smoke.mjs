import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

function buildEnv({ rawCapture = false } = {}) {
  return {
    ENV_MODE: "test",
    TELEMETRIA_LEVEL: "debug",
    DEBUG_META_WEBHOOK: "1",
    ENOVA_META_RAW_CAPTURE: rawCapture ? "1" : "0",
    ENOVA_ADMIN_KEY: "smoke-admin-key",
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
        "5511980000001": {
          wa_id: "5511980000001",
          fase_conversa: "inicio_nome",
          funil_status: "ativo",
          atendimento_manual: true
        },
        "5511980000002": {
          wa_id: "5511980000002",
          fase_conversa: "inicio_nome",
          funil_status: "ativo",
          atendimento_manual: true
        }
      }
    }
  };
}

function buildTextWebhook({ waId, messageId, text }) {
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

function rawCaptureHeaders() {
  return {
    "content-type": "application/json",
    "user-agent": "meta-smoke-agent/1.0",
    "cf-ray": "smoke-ray-123",
    "x-hub-signature": "sha1=abc123",
    "x-hub-signature-256": "sha256=def456"
  };
}

function extractByTag(logs, tag) {
  return logs.filter((entry) => entry?.body?.tag === tag).map((entry) => entry.body);
}

async function dispatchWebhook({ env, pathname, body, headers }) {
  const req = new Request(`https://worker.local${pathname}`, {
    method: "POST",
    headers,
    body
  });
  const resp = await worker.fetch(req, env, {});
  const data = await resp.json();
  return { resp, data };
}

const originalFetch = globalThis.fetch;
const proxyLogInserts = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname !== "proxy.example.com") {
    return originalFetch(input, init);
  }

  const path = url.searchParams.get("path");
  if (path === "/rest/v1/enova_log" && String(init.method || "GET").toUpperCase() === "POST") {
    proxyLogInserts.push({
      url: url.toString(),
      body: init.body ? JSON.parse(init.body) : null
    });
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
  // 1) /webhook/meta com payload texto válido (captura ligada)
  {
    const env = buildEnv({ rawCapture: true });
    const { resp, data } = await dispatchWebhook({
      env,
      pathname: "/webhook/meta",
      body: JSON.stringify(buildTextWebhook({
        waId: "5511980000001",
        messageId: "wamid.raw.capture.meta",
        text: "mensagem valida meta"
      })),
      headers: rawCaptureHeaders()
    });

    assert.equal(resp.status, 200);
    assert.equal(data.reason, "manual_mode_bypass");
    const captures = extractByTag(proxyLogInserts, "META_WEBHOOK_RAW_CAPTURE");
    const latestCapture = captures[captures.length - 1];
    assert.ok(latestCapture);
    assert.equal(latestCapture.pathname, "/webhook/meta");
    assert.equal(latestCapture.method, "POST");
    assert.ok(
      /^[0-9a-f-]{36}$/i.test(latestCapture.replay_id) ||
      /^meta_raw_/.test(latestCapture.replay_id)
    );
    assert.match(latestCapture.raw_body, /mensagem valida meta/);
    assert.equal(latestCapture.headers_subset["content-type"], "application/json");
    assert.equal(latestCapture.headers_subset["user-agent"], "meta-smoke-agent/1.0");
    assert.equal(latestCapture.headers_subset["cf-ray"], "smoke-ray-123");
    assert.equal(latestCapture.headers_subset["x-hub-signature"], "sha1=abc123");
    assert.equal(latestCapture.headers_subset["x-hub-signature-256"], "sha256=def456");

    const enriches = extractByTag(proxyLogInserts, "META_WEBHOOK_RAW_CAPTURE_ENRICH");
    const enrich = enriches.find((entry) => entry.replay_id === latestCapture.replay_id);
    assert.ok(enrich);
    assert.equal(enrich.wa_id, "5511980000001");
    assert.equal(enrich.message_id, "wamid.raw.capture.meta");
    assert.equal(enrich.message_type, "text");
  }

  // 2) fallback / com payload válido preservado (captura ligada)
  {
    const env = buildEnv({ rawCapture: true });
    const { resp, data } = await dispatchWebhook({
      env,
      pathname: "/",
      body: JSON.stringify(buildTextWebhook({
        waId: "5511980000002",
        messageId: "wamid.raw.capture.fallback",
        text: "mensagem valida fallback"
      })),
      headers: rawCaptureHeaders()
    });

    assert.equal(resp.status, 200);
    assert.equal(data.reason, "manual_mode_bypass");
    const captures = extractByTag(proxyLogInserts, "META_WEBHOOK_RAW_CAPTURE");
    const latestCapture = captures[captures.length - 1];
    assert.ok(latestCapture);
    assert.equal(latestCapture.pathname, "/");
    assert.match(latestCapture.raw_body, /mensagem valida fallback/);
  }

  // 3) body malformado preserva comportamento e não bloqueia captura (captura ligada)
  {
    const env = buildEnv({ rawCapture: true });
    const { resp, data } = await dispatchWebhook({
      env,
      pathname: "/webhook/meta",
      body: "{\"object\":\"whatsapp_business_account\",invalid}",
      headers: rawCaptureHeaders()
    });

    assert.equal(resp.status, 200);
    assert.equal(data.reason, "webhook_parse_error");
    const captures = extractByTag(proxyLogInserts, "META_WEBHOOK_RAW_CAPTURE");
    const latestCapture = captures[captures.length - 1];
    assert.ok(latestCapture);
    assert.equal(latestCapture.pathname, "/webhook/meta");
    assert.match(latestCapture.raw_body, /invalid/);
  }

  // 4) captura desligada por flag (comportamento preservado sem persistir bruto)
  {
    const countBefore = extractByTag(proxyLogInserts, "META_WEBHOOK_RAW_CAPTURE").length;
    const env = buildEnv({ rawCapture: false });
    const { resp, data } = await dispatchWebhook({
      env,
      pathname: "/webhook/meta",
      body: JSON.stringify(buildTextWebhook({
        waId: "5511980000001",
        messageId: "wamid.raw.capture.off",
        text: "captura off"
      })),
      headers: rawCaptureHeaders()
    });

    assert.equal(resp.status, 200);
    assert.equal(data.reason, "manual_mode_bypass");
    const countAfter = extractByTag(proxyLogInserts, "META_WEBHOOK_RAW_CAPTURE").length;
    assert.equal(countAfter, countBefore);
  }
} finally {
  globalThis.fetch = originalFetch;
}
