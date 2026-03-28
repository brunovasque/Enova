import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

function buildEnv() {
  return {
    ENV_MODE: "test",
    TELEMETRIA_LEVEL: "debug",
    DEBUG_META_WEBHOOK: "1",
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
        "5511980001001": {
          wa_id: "5511980001001",
          fase_conversa: "inicio_nome",
          funil_status: "ativo",
          atendimento_manual: true
        },
        "5511980001002": {
          wa_id: "5511980001002",
          fase_conversa: "inicio_nome",
          funil_status: "ativo",
          atendimento_manual: true
        },
        "5511980001003": {
          wa_id: "5511980001003",
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

async function dispatchSequence(env, payload) {
  const req = new Request("https://worker.local/__admin__/replay-webhook-sequence", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-enova-admin-key": "smoke-admin-key"
    },
    body: JSON.stringify(payload)
  });
  const resp = await worker.fetch(req, env, {});
  const data = await resp.json();
  return { resp, data };
}

const replayCaptureById = {
  replay_seq_ok_1: {
    replay_id: "replay_seq_ok_1",
    pathname: "/webhook/meta",
    method: "POST",
    headers_subset: { "content-type": "application/json" },
    raw_body: JSON.stringify(buildTextWebhook({
      waId: "5511980001001",
      messageId: "wamid.replay.seq.1",
      text: "evento 1"
    }))
  },
  replay_seq_ok_2: {
    replay_id: "replay_seq_ok_2",
    pathname: "/webhook/meta",
    method: "POST",
    headers_subset: { "content-type": "application/json" },
    raw_body: JSON.stringify(buildTextWebhook({
      waId: "5511980001002",
      messageId: "wamid.replay.seq.2",
      text: "evento 2"
    }))
  },
  replay_seq_ok_3: {
    replay_id: "replay_seq_ok_3",
    pathname: "/webhook/meta",
    method: "POST",
    headers_subset: { "content-type": "application/json" },
    raw_body: JSON.stringify(buildTextWebhook({
      waId: "5511980001003",
      messageId: "wamid.replay.seq.3",
      text: "evento 3"
    }))
  }
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname !== "proxy.example.com") {
    return originalFetch(input, init);
  }

  const path = url.searchParams.get("path");
  const method = String(init.method || "GET").toUpperCase();

  if (path === "/rest/v1/enova_log" && method === "GET") {
    const replayEq = String(url.searchParams.get("replay_id") || "");
    const replayId = replayEq.startsWith("eq.") ? decodeURIComponent(replayEq.slice(3)) : "";
    const row = replayCaptureById[replayId];
    return new Response(JSON.stringify(row ? [row] : []), {
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
  // 1) sequência válida por replay_ids
  {
    const env = buildEnv();
    const { resp, data } = await dispatchSequence(env, {
      replay_ids: ["replay_seq_ok_1", "replay_seq_ok_2"],
      delay_ms: 0
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, "replay_ids");
    assert.equal(data.count, 2);
    assert.equal(Array.isArray(data.results), true);
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].replay_id, "replay_seq_ok_1");
    assert.equal(data.results[1].replay_id, "replay_seq_ok_2");
    assert.equal(data.results[0].ok, true);
    assert.equal(data.results[1].ok, true);
  }

  // 2) sequência válida por events explícitos
  {
    const env = buildEnv();
    const { resp, data } = await dispatchSequence(env, {
      events: [
        {
          raw_body: JSON.stringify(buildTextWebhook({
            waId: "5511980001001",
            messageId: "wamid.replay.events.1",
            text: "evento explicito 1"
          })),
          headers_subset: { "content-type": "application/json" },
          pathname: "/webhook/meta",
          method: "POST"
        },
        {
          raw_body: JSON.stringify(buildTextWebhook({
            waId: "5511980001002",
            messageId: "wamid.replay.events.2",
            text: "evento explicito 2"
          })),
          headers_subset: { "content-type": "application/json" }
        }
      ],
      delay_ms: 0
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, "events");
    assert.equal(data.count, 2);
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].ok, true);
    assert.equal(data.results[1].ok, true);
  }

  // 3) sequência com replay_id inexistente no meio
  {
    const env = buildEnv();
    const { resp, data } = await dispatchSequence(env, {
      replay_ids: ["replay_seq_ok_1", "replay_seq_missing", "replay_seq_ok_3"],
      delay_ms: 0
    });

    assert.equal(resp.status, 404);
    assert.equal(data.ok, false);
    assert.equal(data.mode, "replay_ids");
    assert.equal(data.count, 3);
    assert.equal(data.failed_index, 1);
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].index, 0);
    assert.equal(data.results[0].ok, true);
    assert.equal(data.results[1].index, 1);
    assert.equal(data.results[1].ok, false);
    assert.equal(data.results[1].error, "replay_id_not_found");
  }

  // 4) sequência com raw_body inválido em um item + falha identificada
  {
    const env = buildEnv();
    const { resp, data } = await dispatchSequence(env, {
      events: [
        {
          raw_body: JSON.stringify(buildTextWebhook({
            waId: "5511980001001",
            messageId: "wamid.replay.invalid.1",
            text: "evento valido antes"
          })),
          pathname: "/webhook/meta",
          method: "POST"
        },
        {
          raw_body: "{\"object\":\"whatsapp_business_account\",invalid}",
          pathname: "/webhook/meta",
          method: "POST"
        }
      ],
      delay_ms: 0
    });

    assert.equal(resp.status, 400);
    assert.equal(data.ok, false);
    assert.equal(data.mode, "events");
    assert.equal(data.failed_index, 1);
    assert.equal(data.error, "sequence_item_failed");
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].index, 0);
    assert.equal(data.results[0].ok, true);
    assert.equal(data.results[1].index, 1);
    assert.equal(data.results[1].ok, false);
    assert.equal(data.results[1].forward_body?.reason, "webhook_parse_error");
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("replay_webhook_sequence.smoke: ok");
