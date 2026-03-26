import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

function buildEnv(initialStateByWaId = {}) {
  return {
    ENV_MODE: "test",
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
      stateByWaId: { ...initialStateByWaId }
    }
  };
}

function buildStickerWebhookRequest({ from, profileName, messageId }) {
  const contact = { wa_id: from };
  if (typeof profileName !== "undefined") {
    contact.profile = { name: profileName };
  }

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
              id: messageId,
              timestamp: "1773183927",
              type: "sticker",
              sticker: {
                id: `sticker-${messageId}`,
                mime_type: "image/webp",
                sha256: "abc123"
              }
            }],
            contacts: [contact],
            metadata: { phone_number_id: "test" }
          }
        }]
      }]
    })
  });
}

async function dispatchWebhook(env, payload) {
  const resp = await worker.fetch(buildStickerWebhookRequest(payload), env, {});
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.reason, "ignored_non_text_payload");
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname !== "proxy.example.com") {
    return originalFetch(input, init);
  }

  return new Response(JSON.stringify([]), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
};

try {
  // 1) State novo com profile.name -> salva em nome.
  {
    const waId = "5511911111111";
    const env = buildEnv();
    await dispatchWebhook(env, {
      from: waId,
      profileName: "Maria da Silva",
      messageId: "wamid.profile.new"
    });

    const st = env.__enovaSimulationCtx.stateByWaId[waId];
    assert.ok(st);
    assert.equal(st.nome, "Maria da Silva");
    assert.equal(st.fase_conversa, "inicio");
  }

  // 2) State existente com nome vazio + profile.name -> preenche sem mexer na fase.
  {
    const waId = "5511922222222";
    const env = buildEnv({
      [waId]: {
        wa_id: waId,
        nome: "   ",
        fase_conversa: "estado_civil",
        funil_status: "ativo"
      }
    });

    await dispatchWebhook(env, {
      from: waId,
      profileName: "Carlos Pereira",
      messageId: "wamid.profile.fill-empty"
    });

    const st = env.__enovaSimulationCtx.stateByWaId[waId];
    assert.equal(st.nome, "Carlos Pereira");
    assert.equal(st.fase_conversa, "estado_civil");
  }

  // 3) State existente com nome já preenchido + profile.name -> não sobrescreve.
  {
    const waId = "5511933333333";
    const env = buildEnv({
      [waId]: {
        wa_id: waId,
        nome: "Nome Manual",
        fase_conversa: "inicio_nome",
        funil_status: "ativo"
      }
    });

    await dispatchWebhook(env, {
      from: waId,
      profileName: "Nome do Perfil",
      messageId: "wamid.profile.keep-manual"
    });

    const st = env.__enovaSimulationCtx.stateByWaId[waId];
    assert.equal(st.nome, "Nome Manual");
    assert.equal(st.fase_conversa, "inicio_nome");
  }

  // 4) Inbound sem profile.name -> não quebra nem apaga valor existente.
  {
    const waId = "5511944444444";
    const env = buildEnv({
      [waId]: {
        wa_id: waId,
        nome: "Nome Existente",
        fase_conversa: "renda",
        funil_status: "ativo"
      }
    });

    await dispatchWebhook(env, {
      from: waId,
      messageId: "wamid.profile.missing"
    });

    const st = env.__enovaSimulationCtx.stateByWaId[waId];
    assert.equal(st.nome, "Nome Existente");
    assert.equal(st.fase_conversa, "renda");
  }
} finally {
  globalThis.fetch = originalFetch;
}
