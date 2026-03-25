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
    TELEMETRIA_LEVEL: "off",
    __enovaSimulationCtx: {
      active: true,
      dryRun: false,
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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const env = buildEnv();
const originalFetch = globalThis.fetch;
const proxyCalls = [];
let rejectedOptionalColumnsOnce = false;
const EXPECTED_MIN_ENOVA_STATE_PATCHES = 3;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = String(init?.method || "GET").toUpperCase();
  const bodyText = typeof init?.body === "string" ? init.body : "";
  const body = bodyText ? JSON.parse(bodyText) : null;

  if (url.hostname !== "proxy.example.com") {
    throw new Error(`Unexpected outbound fetch to ${url.hostname}`);
  }

  const path = url.searchParams.get("path");
  proxyCalls.push({
    method,
    path,
    body
  });

  if (path === "/rest/v1/enova_log") {
    return jsonResponse([], 200);
  }

  if (path === "/rest/v1/enova_state" && method === "PATCH") {
    const hasOptionalReturnColumns = Boolean(
      body &&
      Object.prototype.hasOwnProperty.call(body, "retorno_correspondente_valor_financiamento") &&
      Object.prototype.hasOwnProperty.call(body, "retorno_correspondente_valor_subsidio_federal")
    );

    if (!rejectedOptionalColumnsOnce && hasOptionalReturnColumns) {
      rejectedOptionalColumnsOnce = true;
      return jsonResponse({
        code: "PGRST204",
        message: "Could not find the 'retorno_correspondente_valor_financiamento' column of 'enova_state' in the schema cache"
      }, 400);
    }

    return jsonResponse([{ wa_id: waCaso, ...(body || {}) }], 200);
  }

  throw new Error(`Unexpected proxy request ${method} ${path}`);
};

try {
  const retornoReq = new Request("https://worker.local/webhook/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: correspondenteWa,
              id: "wamid.retorno.case.ref.schema.fallback",
              timestamp: "1773183951",
              type: "text",
              text: {
                body: [
                  "Pré-cadastro #000031",
                  "STATUS: APROVADO",
                  "MOTIVO: aprovado cadastral",
                  "Valor de financiamento: R$ 210.000,00",
                  "Valor de subsídio federal: R$ 22.000,00"
                ].join("\n")
              }
            }],
            contacts: [{ wa_id: correspondenteWa }],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });

  const resp = await worker.fetch(retornoReq, env, {});
  assert.equal(resp.status, 200);
} finally {
  globalThis.fetch = originalFetch;
}

const enovaStatePatches = proxyCalls.filter((call) => call.path === "/rest/v1/enova_state" && call.method === "PATCH");
assert.equal(rejectedOptionalColumnsOnce, true);
assert.equal(enovaStatePatches.length >= EXPECTED_MIN_ENOVA_STATE_PATCHES, true);

const firstRetornoPatch = enovaStatePatches.find((call) => call.body?.retorno_correspondente_status === "aprovado");
assert.equal(String(firstRetornoPatch?.body?.retorno_correspondente_valor_financiamento || "").includes("210.000,00"), true);
assert.equal(String(firstRetornoPatch?.body?.retorno_correspondente_valor_subsidio_federal || "").includes("22.000,00"), true);

const fallbackRetornoPatch = enovaStatePatches.find((call) => (
  call.body?.retorno_correspondente_status === "aprovado" &&
  !Object.prototype.hasOwnProperty.call(call.body || {}, "retorno_correspondente_valor_financiamento") &&
  !Object.prototype.hasOwnProperty.call(call.body || {}, "retorno_correspondente_valor_subsidio_federal")
));
assert.equal(fallbackRetornoPatch?.body?.retorno_correspondente_bruto?.includes("STATUS: APROVADO"), true);
assert.equal(fallbackRetornoPatch?.body?.retorno_correspondente_motivo, "aprovado cadastral");

const finalClientStep = env.__enovaSimulationCtx.messageLog.find((entry) => entry.wa_id === waCaso);
assert.equal(finalClientStep?.stage_after, "agendamento_visita");
assert.equal(finalClientStep?.messages?.[0], "Ótima notícia! 🎉 Recebemos uma **pré-aprovação do financiamento**.");
assert.equal(env.__enovaSimulationCtx.sendPreview?.text?.body?.includes("Perfeito, obrigado pelo retorno."), true);

console.log("correspondente_return_state_fallback.smoke: ok");
