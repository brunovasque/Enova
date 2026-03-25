import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const waCaso = "5541999998888";
const correspondenteWa = "5511999999999";

function buildEnv() {
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
          pre_cadastro_numero: "000031",
          fase_conversa: "aguardando_retorno_correspondente",
          corr_publicacao_status: "entregue_privado_aguardando_retorno",
          corr_lock_correspondente_wa_id: correspondenteWa,
          processo_enviado_correspondente: true,
          aguardando_retorno_correspondente: true,
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  };
}

function buildRetornoRequest(messageId) {
  return new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: messageId,
              timestamp: "1773183951",
              type: "text",
              text: { body: "Pré-cadastro #000031\nSTATUS: APROVADO" }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
}

const env = buildEnv();
const originalConsoleLog = console.log;
const capturedTelemetry = [];

try {
  console.log = (...args) => {
    const line = args.map((part) => String(part)).join(" ");
    if (line.includes("TELEMETRIA-SAFE:") && line.includes("corr_return_case_ref_duplicate_ignored")) {
      capturedTelemetry.push(line);
    }
    return originalConsoleLog(...args);
  };

  await worker.fetch(buildRetornoRequest("wamid.retorno.case.ref.000031.aprovado.first"), env, {});
  const writesAfterFirst = env.__enovaSimulationCtx.writeLog.length;
  const clientMessagesAfterFirst = env.__enovaSimulationCtx.messageLog.filter((entry) => entry.wa_id === waCaso);
  const firstAckPreview = env.__enovaSimulationCtx.sendPreview;
  const stateAfterFirst = env.__enovaSimulationCtx.stateByWaId[waCaso];

  assert.equal(stateAfterFirst.retorno_correspondente_status, "aprovado");
  assert.equal(stateAfterFirst.fase_conversa, "agendamento_visita");
  assert.equal(stateAfterFirst.processo_pre_analise_status, "ret_util:aprovado");
  assert.equal(String(stateAfterFirst.processo_pre_analise_status || "").length <= 30, true);
  assert.equal(clientMessagesAfterFirst.length, 1);
  assert.equal(clientMessagesAfterFirst[0]?.stage_after, "agendamento_visita");
  assert.equal(String(firstAckPreview?.text?.body || "").includes("Perfeito, obrigado pelo retorno."), true);

  await worker.fetch(buildRetornoRequest("wamid.retorno.case.ref.000031.aprovado.duplicate"), env, {});

  const writesAfterDuplicate = env.__enovaSimulationCtx.writeLog.length;
  const clientMessagesAfterDuplicate = env.__enovaSimulationCtx.messageLog.filter((entry) => entry.wa_id === waCaso);
  const stateAfterDuplicate = env.__enovaSimulationCtx.stateByWaId[waCaso];

  assert.equal(writesAfterDuplicate, writesAfterFirst);
  assert.equal(clientMessagesAfterDuplicate.length, 1);
  assert.equal(stateAfterDuplicate.retorno_correspondente_status, "aprovado");
  assert.equal(stateAfterDuplicate.fase_conversa, "agendamento_visita");
  assert.equal(env.__enovaSimulationCtx.sendPreview, firstAckPreview);

  const telemetryPrefix = "TELEMETRIA-SAFE: ";
  const duplicateTelemetry = capturedTelemetry
    .map((line) => {
      const payload = JSON.parse(line.slice(line.indexOf(telemetryPrefix) + telemetryPrefix.length));
      return {
        event: payload?.event || null,
        details: payload?.details ? JSON.parse(payload.details) : null
      };
    })
    .find((entry) => entry?.event === "corr_return_case_ref_duplicate_ignored");

  assert.equal(duplicateTelemetry?.details?.case_ref, "000031");
  assert.equal(duplicateTelemetry?.details?.status, "aprovado");
  assert.equal(duplicateTelemetry?.details?.expected_stage, "agendamento_visita");
} finally {
  console.log = originalConsoleLog;
}

console.log("correspondente_return_idempotency.smoke: ok");
