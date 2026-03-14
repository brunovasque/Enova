import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const { getEnvioDocsDocumentAIConfig, extractEnvioDocsSignals } = workerModule;

async function run() {
  const cfgTest = getEnvioDocsDocumentAIConfig({
    ENOVA_ENV: "test",
    MISTRAL_API_KEY_TEST: "test-key",
    MISTRAL_API_KEY: "prod-key"
  });
  assert.equal(cfgTest.envMode, "test");
  assert.equal(cfgTest.apiKey, "test-key");

  const cfgProd = getEnvioDocsDocumentAIConfig({
    ENOVA_ENV: "prod",
    MISTRAL_API_KEY_TEST: "test-key",
    MISTRAL_API_KEY: "prod-key"
  });
  assert.equal(cfgProd.envMode, "prod");
  assert.equal(cfgProd.apiKey, "prod-key");

  const fakePdfFetch = async (_url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    assert.equal(body?.document?.type, "document_url");
    assert.ok(String(body?.document?.document_url || "").startsWith("data:application/pdf;base64,"));
    assert.equal("document_base64" in (body?.document || {}), false);
    return new Response(
      JSON.stringify({
        pages: [
          { markdown: "CPF 123.456.789-00\nTitular\nComprovante de renda" }
        ],
        confidence: 0.88
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const pdfResult = await extractEnvioDocsSignals(
    { ENOVA_ENV: "test", MISTRAL_API_KEY_TEST: "test-key" },
    {
      mime_type: "application/pdf",
      filename: "renda.pdf",
      base64: "ZmFrZS1wZGY="
    },
    { sourceType: "pdf", fetchImpl: fakePdfFetch }
  );

  assert.equal(pdfResult.extraction_ok, true);
  assert.equal(pdfResult.source_type, "pdf");
  assert.equal(pdfResult.extraction_error_code, null);
  assert.ok(Array.isArray(pdfResult.signals_json.doc_type_hints));

  const fakeImageFetch = async () =>
    new Response(
      JSON.stringify({
        text: "RG do parceiro. Documento de identidade.",
        page_count: 1
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  const imageResult = await extractEnvioDocsSignals(
    { ENOVA_ENV: "test", MISTRAL_API_KEY_TEST: "test-key" },
    {
      mime_type: "image/jpeg",
      filename: "doc.jpg",
      base64: "ZmFrZS1pbWFnZQ=="
    },
    { sourceType: "image", fetchImpl: fakeImageFetch }
  );

  assert.equal(imageResult.extraction_ok, true);
  assert.equal(imageResult.source_type, "image");
  assert.equal(imageResult.extraction_error_code, null);

  const noKeyResult = await extractEnvioDocsSignals(
    { ENOVA_ENV: "test" },
    {
      mime_type: "application/pdf",
      filename: "sem-chave.pdf",
      base64: "ZmFrZQ=="
    },
    { sourceType: "pdf" }
  );

  assert.equal(noKeyResult.extraction_ok, false);
  assert.equal(noKeyResult.extraction_error_code, "missing_api_key");
}

await run();
console.log("envio_docs_document_ai.smoke: ok");
