import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const worker = workerModule.default;

const token = "AB12CD34EF56GH78JK90LM12";
const waCaso = "5541999998888";
const correspondenteWa = "5511999999999";

function buildEnvWithState() {
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
        [waCaso]: {
          wa_id: waCaso,
          nome: "JOAO TESTE",
          pre_cadastro_numero: "000001",
          fase_conversa: "finalizacao_processo",
          corr_assumir_token: token,
          corr_publicacao_status: "entregue_privado_aguardando_retorno",
          corr_lock_correspondente_wa_id: correspondenteWa,
          processo_enviado_correspondente: true,
          aguardando_retorno_correspondente: false,
          updated_at: "2026-03-18T00:00:00.000Z"
        }
      }
    }
  };
}

function buildMemoryR2Bucket(initial = {}) {
  const objects = new Map(Object.entries(initial).map(([key, value]) => [key, { ...value }]));
  return {
    puts: [],
    async get(key) {
      const entry = objects.get(String(key));
      if (!entry) return null;
      return {
        body: entry.body,
        httpMetadata: entry.httpMetadata || {},
        writeHttpMetadata(headers) {
          const meta = entry.httpMetadata || {};
          if (meta.contentType) headers.set("content-type", meta.contentType);
          if (meta.contentDisposition) headers.set("content-disposition", meta.contentDisposition);
        }
      };
    },
    async put(key, body, options = {}) {
      const stored = body instanceof ArrayBuffer ? body.slice(0) : body;
      this.puts.push({ key: String(key), options });
      objects.set(String(key), {
        body: stored,
        httpMetadata: options.httpMetadata || {},
        customMetadata: options.customMetadata || {}
      });
    }
  };
}

async function fetchEntryHtml(env) {
  const req = new Request(`https://worker.local/correspondente/entrada?pre=000001&cw=${correspondenteWa}`, {
    method: "GET"
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 200);
  return await res.text();
}

// 1) Documento já materializado abre via proxy autorizado lendo do bucket privado.
{
  const env = buildEnvWithState();
  env.CORRESPONDENTE_DOCS_BUCKET = buildMemoryR2Bucket({
    "correspondente-docs/5541999998888/000001/doc_doc-rg-1.pdf": {
      body: "RG PRIVADO OK",
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: 'inline; filename="rg.pdf"'
      }
    }
  });
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-rg-1",
        tipo: "rg",
        participante: "p1",
        status: "recebido",
        url: "https://docs.example.com/rg.pdf",
        private_object_key: "correspondente-docs/5541999998888/000001/doc_doc-rg-1.pdf"
      }
    ]
  };
  const req = new Request(`https://worker.local/correspondente/doc?pre=000001&t=${token}&doc=doc_doc-rg-1`, { method: "GET" });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
  assert.equal(String(res.headers.get("content-type") || ""), "application/pdf");
  assert.equal(await res.text(), "RG PRIVADO OK");
}

// 2) Primeiro acesso legado materializa no R2 e a reabertura seguinte sai do bucket sem nova ida à Meta.
{
  const env = buildEnvWithState();
  const bucket = buildMemoryR2Bucket();
  env.CORRESPONDENTE_DOCS_BUCKET = bucket;
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-meta-1",
        tipo: "rg",
        participante: "p1",
        status: "recebido",
        url: "https://graph.facebook.com/v20.0/mid-rg-meta-1",
        file_name: "rg-meta.pdf"
      }
    ]
  };

  const originalFetch = globalThis.fetch;
  let graphFetchCount = 0;
  let lookasideFetchCount = 0;
  globalThis.fetch = async (input, init = {}) => {
    const asString = String(input || "");
    if (asString === "https://graph.facebook.com/v20.0/mid-rg-meta-1") {
      graphFetchCount += 1;
      assert.equal(String(init?.headers?.Authorization || ""), `Bearer ${env.WHATS_TOKEN}`);
      return new Response(
        JSON.stringify({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-meta-real" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (asString === "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-meta-real") {
      lookasideFetchCount += 1;
      assert.equal(String(init?.headers?.Authorization || ""), `Bearer ${env.WHATS_TOKEN}`);
      return new Response("RG META LAZY", { status: 200, headers: { "content-type": "application/pdf" } });
    }
    return originalFetch(input, init);
  };
  try {
    const req = new Request(`https://worker.local/correspondente/doc?pre=000001&t=${token}&doc=doc_doc-meta-1`, { method: "GET" });
    const first = await worker.fetch(req, env, {});
    assert.equal(first.status, 200);
    assert.equal(await first.text(), "RG META LAZY");
    assert.equal(graphFetchCount, 1);
    assert.equal(lookasideFetchCount, 1);
    assert.equal(bucket.puts.length, 1);
    assert.equal(Boolean(env.__enovaSimulationCtx.docsByWaId[waCaso][0].private_object_key), true);
    assert.equal(Boolean(env.__enovaSimulationCtx.docsByWaId[waCaso][0].private_materialized_at), true);

    const second = await worker.fetch(req, env, {});
    assert.equal(second.status, 200);
    assert.equal(await second.text(), "RG META LAZY");
    assert.equal(graphFetchCount, 1);
    assert.equal(lookasideFetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 3) Autorização continua exigindo case/token corretos.
{
  const env = buildEnvWithState();
  env.CORRESPONDENTE_DOCS_BUCKET = buildMemoryR2Bucket();
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-rg-1",
        tipo: "rg",
        participante: "p1",
        status: "recebido",
        url: "https://docs.example.com/rg.pdf"
      }
    ]
  };
  const req = new Request(`https://worker.local/correspondente/doc?pre=000999&t=${token}&doc=doc_doc-rg-1`, { method: "GET" });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 403);
}

// 4) Card deduplicado prioriza o representante materializado e o link final abre do bucket sem cair no Meta legado.
{
  const env = buildEnvWithState();
  env.CORRESPONDENTE_DOCS_BUCKET = buildMemoryR2Bucket({
    "correspondente-docs/5541999998888/000001/doc_doc-rg-materializado.pdf": {
      body: "RG MATERIALIZADO NO CARD",
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: 'inline; filename="rg-materializado.pdf"'
      }
    }
  });
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-rg-legacy",
        tipo: "rg",
        participante: "p1",
        status: "recebido",
        url: "https://graph.facebook.com/v20.0/mid-rg-card"
      }
    ]
  };
  env.__enovaSimulationCtx.stateByWaId[waCaso].envio_docs_itens_json = [
    { tipo: "rg", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true }
  ];
  env.__enovaSimulationCtx.stateByWaId[waCaso].pacote_documentos_anexados_json = [
    {
      tipo: "rg",
      participante: "p1",
      status: "recebido",
      url: "https://graph.facebook.com/v20.0/mid-rg-card",
      private_object_key: "correspondente-docs/5541999998888/000001/doc_doc-rg-materializado.pdf",
      private_materialized_at: "2026-03-29T18:05:00.000Z"
    }
  ];

  const body = await fetchEntryHtml(env);
  const rgLinks = body.match(/rg — Titular/g) || [];
  assert.ok(rgLinks.length >= 1);
  const entryMatch = body.match(/rg — Titular:\s*<a href="([^"]*\/correspondente\/doc\?[^"]+)"/);
  assert.notEqual(entryMatch, null);
  const href = String(entryMatch?.[1] || "").replace(/&amp;/g, "&");

  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const asString = String(input || "");
    let host = "";
    try {
      host = new URL(asString).hostname.toLowerCase();
    } catch {}
    if (
      host === "graph.facebook.com" ||
      host.endsWith(".graph.facebook.com") ||
      host === "lookaside.fbsbx.com" ||
      host.endsWith(".lookaside.fbsbx.com")
    ) {
      upstreamCalls += 1;
      throw new Error("should not fetch legacy Meta URL when private_object_key survives");
    }
    return originalFetch(input, init);
  };
  try {
    const openReq = new Request(new URL(href, "https://worker.local").toString(), { method: "GET" });
    const openRes = await worker.fetch(openReq, env, {});
    assert.equal(openRes.status, 200);
    assert.equal(await openRes.text(), "RG MATERIALIZADO NO CARD");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 5) Stored URL expired — fallback to media_id via Graph API materializes and serves.
{
  const env = buildEnvWithState();
  const bucket = buildMemoryR2Bucket();
  env.CORRESPONDENTE_DOCS_BUCKET = bucket;
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-expired-1",
        tipo: "comprovante_renda",
        participante: "p1",
        status: "recebido",
        url: "https://lookaside.fbsbx.com/expired-link?hash=abc",
        media_id: "mid-fresh-1",
        file_name: "renda.pdf"
      }
    ]
  };

  const originalFetch = globalThis.fetch;
  let graphResolveCalls = 0;
  let downloadCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const asString = String(input || "");
    // Expired lookaside URL returns 404
    if (asString.includes("lookaside.fbsbx.com/expired-link")) {
      return new Response("expired", { status: 404 });
    }
    // Graph API resolution for media_id
    if (asString === "https://graph.facebook.com/v20.0/mid-fresh-1") {
      graphResolveCalls += 1;
      return new Response(
        JSON.stringify({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=mid-fresh-1-download" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    // Actual download from fresh lookaside URL
    if (asString.includes("mid-fresh-1-download")) {
      downloadCalls += 1;
      return new Response("RENDA PDF CONTENT", { status: 200, headers: { "content-type": "application/pdf" } });
    }
    return originalFetch(input, init);
  };
  try {
    const req = new Request(`https://worker.local/correspondente/doc?pre=000001&t=${token}&doc=doc_doc-expired-1`, { method: "GET" });
    const res = await worker.fetch(req, env, {});
    assert.equal(res.status, 200, "should serve 200 from media_id fallback");
    assert.equal(await res.text(), "RENDA PDF CONTENT");
    assert.equal(graphResolveCalls, 1, "should have called Graph API to resolve media_id");
    assert.equal(downloadCalls, 1, "should have downloaded from resolved URL");
    assert.equal(bucket.puts.length, 1, "should have put document into R2");
    assert.equal(Boolean(env.__enovaSimulationCtx.docsByWaId[waCaso][0].private_object_key), true, "should persist private_object_key");
    assert.equal(Boolean(env.__enovaSimulationCtx.docsByWaId[waCaso][0].private_materialized_at), true, "should persist private_materialized_at");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 6) Reabertura after media_id fallback serves from R2 (no Meta calls).
{
  const env = buildEnvWithState();
  // Simulate a doc that was previously materialized via media_id fallback
  env.CORRESPONDENTE_DOCS_BUCKET = buildMemoryR2Bucket({
    "correspondente-docs/5541999998888/000001/doc_doc-fallback-reopen.pdf": {
      body: "REOPEN FROM R2",
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: 'inline; filename="renda.pdf"'
      }
    }
  });
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-fallback-reopen",
        tipo: "comprovante_renda",
        participante: "p1",
        status: "recebido",
        url: "https://lookaside.fbsbx.com/expired-link?hash=abc",
        media_id: "mid-old-1",
        private_object_key: "correspondente-docs/5541999998888/000001/doc_doc-fallback-reopen.pdf",
        private_materialized_at: "2026-03-30T00:00:00.000Z"
      }
    ]
  };

  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const asString = String(input || "");
    let host = "";
    try { host = new URL(asString).hostname.toLowerCase(); } catch {}
    if (host.includes("facebook.com") || host.includes("fbsbx.com")) {
      metaCalls += 1;
      throw new Error("should not call Meta on reopening a materialized doc");
    }
    return originalFetch(input, init);
  };
  try {
    const req = new Request(`https://worker.local/correspondente/doc?pre=000001&t=${token}&doc=doc_doc-fallback-reopen`, { method: "GET" });
    const res = await worker.fetch(req, env, {});
    assert.equal(res.status, 200, "reopen should succeed from R2");
    assert.equal(await res.text(), "REOPEN FROM R2");
    assert.equal(metaCalls, 0, "should not call Meta for reopened materialized doc");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 7) Doc with only media_id (no stored URL) materializes via Graph API.
{
  const env = buildEnvWithState();
  const bucket = buildMemoryR2Bucket();
  env.CORRESPONDENTE_DOCS_BUCKET = bucket;
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-media-only-1",
        tipo: "cpf",
        participante: "p1",
        status: "recebido",
        media_id: "mid-cpf-001",
        mime_type: "image/jpeg",
        file_name: "cpf.jpg"
      }
    ]
  };

  const originalFetch = globalThis.fetch;
  let graphCalls = 0;
  let downloadCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const asString = String(input || "");
    if (asString === "https://graph.facebook.com/v20.0/mid-cpf-001") {
      graphCalls += 1;
      return new Response(
        JSON.stringify({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=cpf-download" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (asString.includes("cpf-download")) {
      downloadCalls += 1;
      return new Response("CPF IMAGE DATA", { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    return originalFetch(input, init);
  };
  try {
    const req = new Request(`https://worker.local/correspondente/doc?pre=000001&t=${token}&doc=doc_doc-media-only-1`, { method: "GET" });
    const res = await worker.fetch(req, env, {});
    assert.equal(res.status, 200, "doc with only media_id should serve");
    assert.equal(await res.text(), "CPF IMAGE DATA");
    assert.equal(graphCalls, 1, "should resolve media_id via Graph API");
    assert.equal(downloadCalls, 1, "should download from resolved URL");
    assert.equal(bucket.puts.length, 1, "should materialize in R2");
    assert.equal(Boolean(env.__enovaSimulationCtx.docsByWaId[waCaso][0].private_object_key), true);
    assert.equal(Boolean(env.__enovaSimulationCtx.docsByWaId[waCaso][0].private_materialized_at), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 8) Primary URL works (non-Meta) — no fallback needed, materializes normally.
{
  const env = buildEnvWithState();
  const bucket = buildMemoryR2Bucket();
  env.CORRESPONDENTE_DOCS_BUCKET = bucket;
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      {
        doc_id: "doc-direct-url-1",
        tipo: "comprovante_residencia",
        participante: "p1",
        status: "recebido",
        url: "https://cdn.example.com/residencia.pdf",
        media_id: "mid-should-not-use",
        file_name: "residencia.pdf"
      }
    ]
  };

  const originalFetch = globalThis.fetch;
  let directCalls = 0;
  let graphCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const asString = String(input || "");
    if (asString === "https://cdn.example.com/residencia.pdf") {
      directCalls += 1;
      return new Response("RESIDENCIA PDF", { status: 200, headers: { "content-type": "application/pdf" } });
    }
    if (asString.includes("graph.facebook.com")) {
      graphCalls += 1;
      throw new Error("should not hit Graph API when primary URL works");
    }
    return originalFetch(input, init);
  };
  try {
    const req = new Request(`https://worker.local/correspondente/doc?pre=000001&t=${token}&doc=doc_doc-direct-url-1`, { method: "GET" });
    const res = await worker.fetch(req, env, {});
    assert.equal(res.status, 200, "direct URL should work");
    assert.equal(await res.text(), "RESIDENCIA PDF");
    assert.equal(directCalls, 1, "should fetch from direct URL");
    assert.equal(graphCalls, 0, "should not use Graph API fallback when primary works");
    assert.equal(bucket.puts.length, 1, "should materialize in R2");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log("correspondente_private_docs_r2.smoke: ok");
