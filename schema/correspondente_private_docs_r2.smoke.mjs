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

console.log("correspondente_private_docs_r2.smoke: ok");
