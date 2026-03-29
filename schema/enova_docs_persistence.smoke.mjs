import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const { handleDocumentUpload } = workerModule;

function buildEnv(initialState = {}) {
  const waId = initialState.wa_id || "5541997700001";
  return {
    ENV_MODE: "test",
    TELEMETRIA_LEVEL: "verbose",
    VERCEL_PROXY_URL: "https://proxy.example",
    SUPABASE_SERVICE_ROLE: "service-role",
    MISTRAL_API_KEY_TEST: "test-key",
    META_API_VERSION: "v20.0",
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
          fase_conversa: "envio_docs",
          envio_docs_lista_enviada: true,
          docs_lista_enviada: true,
          canal_docs_escolhido: "whatsapp",
          ...initialState
        }
      }
    }
  };
}

function getState(env, waId) {
  return env.__enovaSimulationCtx.stateByWaId[waId];
}

function buildPdfFetch(text) {
  return async (_url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    assert.equal(body?.document?.type, "document_url");
    return new Response(
      JSON.stringify({
        pages: [{ markdown: text }],
        confidence: 0.91
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
}

function parseProxyRequest(url, init = {}) {
  const parsed = new URL(String(url));
  assert.equal(parsed.origin, "https://proxy.example");
  assert.equal(parsed.pathname, "/api/supabase-proxy");
  assert.equal(parsed.searchParams.get("path"), "/rest/v1/enova_docs");
  return {
    url: parsed,
    method: String(init.method || "GET").toUpperCase(),
    headers: init.headers || {},
    body: init.body ? JSON.parse(String(init.body)) : null
  };
}

async function withMockedFetch(fetchImpl, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function withCapturedConsoleError(fn) {
  const originalConsoleError = console.error;
  const entries = [];
  console.error = (...args) => {
    entries.push(args);
  };
  try {
    return {
      result: await fn(),
      entries
    };
  } finally {
    console.error = originalConsoleError;
  }
}

// 1) Upload reconhecido persiste em enova_docs pelo caminho canônico (proxy + service role).
{
  const waId = "5541997701001";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    last_message_id: "wamid.upload.persist.1"
  });
  const proxyCalls = [];

  await withMockedFetch(async (url, init = {}) => {
    const req = parseProxyRequest(url, init);
    proxyCalls.push(req);
    if (req.method === "GET") {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (req.method === "POST") {
      return new Response(JSON.stringify([req.body]), { status: 201, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected method: ${req.method}`);
  }, async () => {
    const st = getState(env, waId);
    const resposta = await handleDocumentUpload(env, st, {
      type: "document",
      message_id: "wamid.upload.persist.1",
      document: {
        id: "media-persist-1",
        mime_type: "application/pdf",
        filename: "holerite.pdf",
        base64: "ZmFrZQ=="
      }
    }, {
      fetchImpl: buildPdfFetch("Holerite mensal com vencimentos, salário base e valor líquido.")
    });
    assert.equal(resposta.keepStage, "envio_docs");
  });

  const getCall = proxyCalls.find((call) => call.method === "GET");
  const postCall = proxyCalls.find((call) => call.method === "POST");
  assert.ok(getCall, "expected duplicate precheck GET via proxy");
  assert.ok(postCall, "expected insert POST via proxy");
  assert.equal(postCall.headers.apikey, "service-role");
  assert.equal(postCall.headers.Authorization, "Bearer service-role");
  assert.equal(postCall.body.wa_id, waId);
  assert.equal(postCall.body.participante, "p1");
  assert.equal(postCall.body.tipo, "holerite");
  assert.equal(postCall.body.url, "https://graph.facebook.com/v20.0/media-persist-1");
  assert.equal(typeof postCall.body.created_at, "string");
  assert.equal(getState(env, waId).envio_docs_itens_json[0].status, "validado_basico");
}

// 2) Falha no pré-check deve logar fase, status, body e query; sem tentar insert.
{
  const waId = "5541997701002";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    last_message_id: "wamid.upload.precheck.1"
  });
  const proxyCalls = [];

  const { entries } = await withCapturedConsoleError(() =>
    withMockedFetch(async (url, init = {}) => {
      const req = parseProxyRequest(url, init);
      proxyCalls.push(req);
      if (req.method === "GET") {
        return new Response(
          JSON.stringify({ message: "proxy unavailable during precheck" }),
          { status: 503, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error("POST should not run when precheck fails");
    }, async () => {
      const st = getState(env, waId);
      await handleDocumentUpload(env, st, {
        type: "document",
        message_id: "wamid.upload.precheck.1",
        document: {
          id: "media-precheck-1",
          mime_type: "application/pdf",
          filename: "holerite.pdf",
          base64: "ZmFrZQ=="
        }
      }, {
        fetchImpl: buildPdfFetch("Holerite mensal com vencimentos, salário base e valor líquido.")
      });
    })
  );

  assert.equal(proxyCalls.filter((call) => call.method === "GET").length, 1);
  assert.equal(proxyCalls.filter((call) => call.method === "POST").length, 0);
  const logEntry = entries.find((args) => args[0] === "handleDocumentUpload: enova_docs precheck failed");
  assert.ok(logEntry, "expected precheck failure log");
  const [, details] = logEntry;
  assert.equal(details.phase, "precheck");
  assert.equal(details.status, 503);
  assert.equal(details.response_body?.message, "proxy unavailable during precheck");
  assert.equal(details.query?.select, "id");
  assert.equal(details.query?.limit, 1);
}

// 3) Falha no insert deve logar fase, status, body e payload real enviado.
{
  const waId = "5541997701003";
  const env = buildEnv({
    wa_id: waId,
    envio_docs_itens_json: [
      { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ],
    last_message_id: "wamid.upload.insert.1"
  });

  const { entries } = await withCapturedConsoleError(() =>
    withMockedFetch(async (url, init = {}) => {
      const req = parseProxyRequest(url, init);
      if (req.method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (req.method === "POST") {
        return new Response(
          JSON.stringify({ message: "insert failed at enova_docs" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected method: ${req.method}`);
    }, async () => {
      const st = getState(env, waId);
      await handleDocumentUpload(env, st, {
        type: "document",
        message_id: "wamid.upload.insert.1",
        document: {
          id: "media-insert-1",
          mime_type: "application/pdf",
          filename: "holerite.pdf",
          base64: "ZmFrZQ=="
        }
      }, {
        fetchImpl: buildPdfFetch("Holerite mensal com vencimentos, salário base e valor líquido.")
      });
    })
  );

  const logEntry = entries.find((args) => args[0] === "handleDocumentUpload: enova_docs insert failed");
  assert.ok(logEntry, "expected insert failure log");
  const [, details] = logEntry;
  assert.equal(details.phase, "insert");
  assert.equal(details.status, 400);
  assert.equal(details.response_body?.message, "insert failed at enova_docs");
  assert.equal(details.payload?.wa_id, waId);
  assert.equal(details.payload?.tipo, "holerite");
  assert.equal(details.payload?.participante, "p1");
  assert.equal(details.payload?.url, "https://graph.facebook.com/v20.0/media-insert-1");
}

console.log("enova_docs_persistence.smoke: ok");
