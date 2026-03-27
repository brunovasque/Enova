import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const waTextManualOn = "5511991000001";
const waTextManualOff = "5511991000002";
const waMediaManualOn = "5511991000003";

function buildEnv(stateByWaId) {
  return {
    ENV_MODE: "test",
    TELEMETRIA_LEVEL: "debug",
    DEBUG_META_WEBHOOK: "1",
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
      stateByWaId: { ...stateByWaId }
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

function buildImageWebhook({ waId, messageId, caption }) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          messages: [{
            from: waId,
            id: messageId,
            timestamp: "1773183927",
            type: "image",
            image: {
              id: `image-${messageId}`,
              mime_type: "image/jpeg",
              sha256: "abc123"
            },
            caption
          }],
          contacts: [{ wa_id: waId }],
          metadata: { phone_number_id: "test" }
        }
      }]
    }]
  };
}

async function dispatchWebhook(env, payload) {
  const req = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const res = await worker.fetch(req, env, {});
  const data = await res.json();
  return { res, data };
}

const originalConsoleLog = console.log;
const capturedLogs = [];
console.log = (...args) => {
  capturedLogs.push(args.map((v) => String(v)).join(" "));
  originalConsoleLog(...args);
};

try {
  const env = buildEnv({
    [waTextManualOn]: {
      wa_id: waTextManualOn,
      fase_conversa: "inicio_nome",
      funil_status: "ativo",
      atendimento_manual: true,
      nome: "Cliente Manual ON"
    },
    [waTextManualOff]: {
      wa_id: waTextManualOff,
      fase_conversa: "inicio",
      funil_status: "ativo",
      atendimento_manual: false,
      nome: "Cliente Manual OFF"
    },
    [waMediaManualOn]: {
      wa_id: waMediaManualOn,
      fase_conversa: "renda",
      funil_status: "ativo",
      atendimento_manual: true,
      nome: "Cliente Media Manual ON"
    }
  });

  // A) atendimento_manual=true no webhook principal (texto)
  {
    const before = env.__enovaSimulationCtx.stateByWaId[waTextManualOn]?.fase_conversa;
    const { res, data } = await dispatchWebhook(
      env,
      buildTextWebhook({
        waId: waTextManualOn,
        messageId: "wamid.manual.on.text",
        text: "quero continuar"
      })
    );
    const after = env.__enovaSimulationCtx.stateByWaId[waTextManualOn]?.fase_conversa;
    const wroteState = (env.__enovaSimulationCtx.writesByWaId[waTextManualOn] || []).some(
      (entry) => Object.prototype.hasOwnProperty.call(entry || {}, "fase_conversa")
    );

    assert.equal(res.status, 200);
    assert.equal(data?.reason, "manual_mode_bypass");
    assert.equal(before, after);
    assert.equal(wroteState, false);
    assert.equal(env.__enovaSimulationCtx.messageLog.length, 0);
  }

  // B) atendimento_manual=false no webhook principal (comportamento segue)
  {
    const { res, data } = await dispatchWebhook(
      env,
      buildTextWebhook({
        waId: waTextManualOff,
        messageId: "wamid.manual.off.text",
        text: "oi"
      })
    );

    assert.equal(res.status, 200);
    assert.notEqual(data?.reason, "manual_mode_bypass");
    assert.equal(env.__enovaSimulationCtx.messageLog.length > 0, true);
  }

  // C) atendimento_manual=true no caminho de mídia
  {
    const before = env.__enovaSimulationCtx.stateByWaId[waMediaManualOn]?.fase_conversa;
    const msgCountBefore = env.__enovaSimulationCtx.messageLog.length;
    const { res, data } = await dispatchWebhook(
      env,
      buildImageWebhook({
        waId: waMediaManualOn,
        messageId: "wamid.manual.on.media",
        caption: "foto teste"
      })
    );
    const after = env.__enovaSimulationCtx.stateByWaId[waMediaManualOn]?.fase_conversa;
    const wroteState = (env.__enovaSimulationCtx.writesByWaId[waMediaManualOn] || []).some(
      (entry) => Object.prototype.hasOwnProperty.call(entry || {}, "fase_conversa")
    );

    assert.equal(res.status, 200);
    assert.equal(data?.reason, "manual_mode_bypass");
    assert.equal(before, after);
    assert.equal(wroteState, false);
    assert.equal(env.__enovaSimulationCtx.messageLog.length, msgCountBefore);
  }

  // D) telemetria: marcador [MANUAL_MODE_BYPASS] com campos obrigatórios
  const bypassTelemetryEvents = capturedLogs
    .filter((line) => line.startsWith("TELEMETRIA-SAFE: "))
    .map((line) => line.slice("TELEMETRIA-SAFE: ".length))
    .map((raw) => {
      try {
        const parsed = JSON.parse(raw);
        const details = parsed?.details ? JSON.parse(parsed.details) : null;
        return { ...parsed, details };
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.message?.includes("[MANUAL_MODE_BYPASS]"));

  assert.equal(bypassTelemetryEvents.length >= 2, true);
  assert.equal(
    bypassTelemetryEvents.some((entry) =>
      entry?.event === "manual_mode_bypass" &&
      entry?.wa_id === waTextManualOn &&
      entry?.details?.marker === "[MANUAL_MODE_BYPASS]" &&
      entry?.details?.atendimento_manual_detectado === true &&
      entry?.details?.bypass_point === "handleMetaWebhook_pre_runFunnel" &&
      entry?.details?.runFunnel_called === false &&
      entry?.details?.sendMessage_blocked === true &&
      entry?.details?.fase_write_blocked === true &&
      typeof entry?.details?.timestamp === "string" &&
      entry.details.timestamp.length > 0
    ),
    true
  );
  assert.equal(
    bypassTelemetryEvents.some((entry) =>
      entry?.event === "manual_mode_bypass" &&
      entry?.wa_id === waMediaManualOn &&
      entry?.details?.marker === "[MANUAL_MODE_BYPASS]" &&
      entry?.details?.atendimento_manual_detectado === true &&
      entry?.details?.bypass_point === "handleMediaEnvelope_pre_runFunnel" &&
      entry?.details?.runFunnel_called === false &&
      entry?.details?.sendMessage_blocked === true &&
      entry?.details?.fase_write_blocked === true &&
      typeof entry?.details?.timestamp === "string" &&
      entry.details.timestamp.length > 0
    ),
    true
  );
} finally {
  console.log = originalConsoleLog;
}

console.log("manual_mode_bypass_worker.smoke: ok");
