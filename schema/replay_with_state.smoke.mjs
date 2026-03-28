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
    CORRESPONDENTE_ENTRY_BASE_URL: "https://entrada.enova.local"
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

async function dispatchReplayWithState(env, payload) {
  const req = new Request("https://worker.local/__admin__/replay-with-state", {
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

const stateByWaId = {
  "5511980002001": {
    wa_id: "5511980002001",
    fase_conversa: "inicio_nome",
    funil_status: "ativo",
    atendimento_manual: false
  },
  "5511980002002": {
    wa_id: "5511980002002",
    fase_conversa: "inicio_nome",
    funil_status: "ativo",
    atendimento_manual: false
  }
};

const replayCaptureById = {
  replay_state_unit_1: {
    replay_id: "replay_state_unit_1",
    pathname: "/webhook/meta",
    method: "POST",
    headers_subset: { "content-type": "application/json" },
    raw_body: JSON.stringify(buildTextWebhook({
      waId: "5511980002001",
      messageId: "wamid.replay.state.unit.1",
      text: "evento unitario"
    }))
  },
  replay_state_seq_1: {
    replay_id: "replay_state_seq_1",
    pathname: "/webhook/meta",
    method: "POST",
    headers_subset: { "content-type": "application/json" },
    raw_body: JSON.stringify(buildTextWebhook({
      waId: "5511980002002",
      messageId: "wamid.replay.state.seq.1",
      text: "evento sequencia 1"
    }))
  },
  replay_state_seq_2: {
    replay_id: "replay_state_seq_2",
    pathname: "/webhook/meta",
    method: "POST",
    headers_subset: { "content-type": "application/json" },
    raw_body: JSON.stringify(buildTextWebhook({
      waId: "5511980002002",
      messageId: "wamid.replay.state.seq.2",
      text: "evento sequencia 2"
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

  if (path === "/rest/v1/enova_state" && method === "GET") {
    const waEq = String(url.searchParams.get("wa_id") || "");
    const waId = waEq.startsWith("eq.") ? decodeURIComponent(waEq.slice(3)) : "";
    const row = stateByWaId[waId] || null;
    return new Response(JSON.stringify(row ? [row] : []), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  if (path === "/rest/v1/enova_state" && method === "PATCH") {
    const waEq = String(url.searchParams.get("wa_id") || "");
    const waId = waEq.startsWith("eq.") ? decodeURIComponent(waEq.slice(3)) : "";
    const patch = init.body ? JSON.parse(String(init.body)) : {};
    const current = stateByWaId[waId] || { wa_id: waId };
    stateByWaId[waId] = { ...current, ...patch, wa_id: waId };
    return new Response(JSON.stringify([stateByWaId[waId]]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  if (path === "/rest/v1/enova_state" && method === "POST") {
    const rows = init.body ? JSON.parse(String(init.body)) : [];
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row?.wa_id) {
      stateByWaId[row.wa_id] = { ...(stateByWaId[row.wa_id] || {}), ...row };
      return new Response(JSON.stringify([stateByWaId[row.wa_id]]), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response(JSON.stringify([]), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  }

  if (path === "/rest/v1/enova_state" && method === "DELETE") {
    const waEq = String(url.searchParams.get("wa_id") || "");
    const waId = waEq.startsWith("eq.") ? decodeURIComponent(waEq.slice(3)) : "";
    delete stateByWaId[waId];
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

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
  // 1) replay unitário com state_snapshot + comprovação de influência
  {
    const env = buildEnv();
    const { resp, data } = await dispatchReplayWithState(env, {
      wa_id: "5511980002001",
      state_snapshot: {
        atendimento_manual: true,
        fase_conversa: "finalizacao_processo"
      },
      replay_id: "replay_state_unit_1"
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, "replay_id");
    assert.equal(data.snapshot_applied, true);
    assert.equal(data.restore_after, false);
    assert.equal(data.restored, false);
    assert.equal(data.state_before.atendimento_manual, false);
    assert.equal(data.result.ok, true);
    assert.equal(data.result.forward_body?.reason, "manual_mode_bypass");
    assert.equal(data.state_after.atendimento_manual, true);
    assert.equal(stateByWaId["5511980002001"].atendimento_manual, true);
  }

  // 2) replay de sequência com state_snapshot
  {
    const env = buildEnv();
    const { resp, data } = await dispatchReplayWithState(env, {
      wa_id: "5511980002002",
      state_snapshot: {
        atendimento_manual: true
      },
      replay_ids: ["replay_state_seq_1", "replay_state_seq_2"],
      delay_ms: 0
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.mode, "replay_ids");
    assert.equal(Array.isArray(data.results), true);
    assert.equal(data.results.length, 2);
    assert.equal(data.results[0].ok, true);
    assert.equal(data.results[1].ok, true);
    assert.equal(data.results[0].forward_body?.reason, "manual_mode_bypass");
    assert.equal(data.results[1].forward_body?.reason, "manual_mode_bypass");
  }

  // 3) replay com restore_after: true restaura estado original
  {
    const env = buildEnv();
    stateByWaId["5511980002002"] = {
      wa_id: "5511980002002",
      fase_conversa: "inicio_nome",
      funil_status: "ativo",
      atendimento_manual: false
    };

    const { resp, data } = await dispatchReplayWithState(env, {
      wa_id: "5511980002002",
      state_snapshot: {
        atendimento_manual: true,
        fase_conversa: "finalizacao_processo"
      },
      replay_id: "replay_state_seq_1",
      restore_after: true
    });

    assert.equal(resp.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.restore_after, true);
    assert.equal(data.restored, true);
    assert.equal(data.state_before.atendimento_manual, false);
    assert.equal(data.state_after.atendimento_manual, false);
    assert.equal(stateByWaId["5511980002002"].atendimento_manual, false);
    assert.equal(stateByWaId["5511980002002"].fase_conversa, "inicio_nome");
  }

  // 4) payload inválido sem wa_id
  {
    const env = buildEnv();
    const { resp, data } = await dispatchReplayWithState(env, {
      state_snapshot: { atendimento_manual: true },
      replay_id: "replay_state_unit_1"
    });

    assert.equal(resp.status, 400);
    assert.equal(data.ok, false);
    assert.equal(data.error, "invalid_payload");
  }

  // 5) payload inválido sem state_snapshot
  {
    const env = buildEnv();
    const { resp, data } = await dispatchReplayWithState(env, {
      wa_id: "5511980002001",
      replay_id: "replay_state_unit_1"
    });

    assert.equal(resp.status, 400);
    assert.equal(data.ok, false);
    assert.equal(data.error, "invalid_payload");
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("replay_with_state.smoke: ok");
