import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  getEnvioDocsDocumentAIConfig,
  extractEnvioDocsSignals,
  classifyEnvioDocsDocument
} = workerModule;

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

  const fakeImageFetch = async (_url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    assert.equal(body?.document?.type, "document_url");
    assert.ok(String(body?.document?.document_url || "").startsWith("data:image/jpeg;base64,"));
    return new Response(
      JSON.stringify({
        text: "RG do parceiro. Documento de identidade.",
        page_count: 1
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

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

  const ctpsDigitalWithCpf = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Carteira de Trabalho Digital CTPS do titular. CPF 123.456.789-00. Dados do trabalhador e vínculos.",
      signals_json: { doc_type_hints: ["cpf"], has_cpf_pattern: true }
    },
    {},
    { fileName: "ctps_digital.pdf", mimeType: "application/pdf" }
  );
  assert.equal(ctpsDigitalWithCpf.detected_doc_type, "ctps_completa");
  assert.equal(ctpsDigitalWithCpf.classification_ok, true);

  const ctpsDigitalWithGenericIdentity = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "CTPS Digital do titular. Documento de identidade do trabalhador. CPF 123.456.789-00. Carteira de trabalho digital.",
      signals_json: { doc_type_hints: ["ctps", "rg", "cpf"], has_cpf_pattern: true }
    },
    {},
    { fileName: "ctps_digital_identidade.pdf", mimeType: "application/pdf" }
  );
  assert.equal(ctpsDigitalWithGenericIdentity.detected_doc_type, "ctps_completa");
  assert.equal(ctpsDigitalWithGenericIdentity.classification_ok, true);
  assert.equal(ctpsDigitalWithGenericIdentity.detected_signals_json?.text_scores?.rg_com_cpf, 0);

  const cpfCadastral = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Comprovante de situacao cadastral no CPF. Cadastro de pessoas fisicas.",
      signals_json: { doc_type_hints: ["cpf"], has_cpf_pattern: true }
    },
    {},
    { fileName: "cpf.pdf", mimeType: "application/pdf" }
  );
  assert.equal(cpfCadastral.detected_doc_type, "cpf");
  assert.equal(cpfCadastral.classification_ok, true);

  const residenciaBoleto = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Boleto bancario. Nome do pagador: Maria. Endereco: Rua das Flores, 123. CEP 80000-000.",
      signals_json: {}
    },
    {},
    { fileName: "boleto_endereco.pdf", mimeType: "application/pdf" }
  );
  assert.equal(residenciaBoleto.detected_doc_type, "comprovante_residencia");
  assert.equal(residenciaBoleto.detected_doc_category, "comprovante_residencia");

  const residenciaInternet = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Conta de internet referente ao mes atual. Logradouro e CEP do titular.",
      signals_json: {}
    },
    {},
    { fileName: "conta_internet.pdf", mimeType: "application/pdf" }
  );
  assert.equal(residenciaInternet.detected_doc_type, "comprovante_residencia");

  const residenciaIptu = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "IPTU exercicio 2026. Endereco do imovel e CEP.",
      signals_json: {}
    },
    {},
    { fileName: "iptu.pdf", mimeType: "application/pdf" }
  );
  assert.equal(residenciaIptu.detected_doc_type, "comprovante_residencia");

  const holerite = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Holerite mensal com vencimentos, salario base e valor liquido.",
      signals_json: {}
    },
    {},
    { fileName: "holerite.pdf", mimeType: "application/pdf" }
  );
  assert.equal(holerite.detected_doc_type, "holerite");
  assert.equal(holerite.detected_doc_category, "comprovante_renda");

  const extratoMovimentacao = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Extrato bancario de conta corrente com movimentacao, debito, credito e historico.",
      signals_json: {}
    },
    {},
    { fileName: "extrato_movimentacao.pdf", mimeType: "application/pdf" }
  );
  assert.equal(extratoMovimentacao.detected_doc_type, "extrato_bancario");
  assert.equal(extratoMovimentacao.detected_doc_category, "comprovante_renda");

  const extratoAposentadoria = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Extrato de aposentadoria com beneficio INSS e previdencia social.",
      signals_json: {}
    },
    {},
    { fileName: "extrato_aposentadoria.pdf", mimeType: "application/pdf" }
  );
  assert.equal(extratoAposentadoria.detected_doc_type, "extrato_bancario");
  assert.equal(extratoAposentadoria.detected_doc_category, "comprovante_renda");

  const declaracaoIr = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Declaracao de ajuste anual do imposto de renda da pessoa fisica (DIRPF).",
      signals_json: {}
    },
    {},
    { fileName: "declaracao_ir.pdf", mimeType: "application/pdf" }
  );
  assert.equal(declaracaoIr.detected_doc_type, "declaracao_ir");
  assert.equal(declaracaoIr.detected_doc_category, "comprovante_renda");

  const reciboIr = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Recibo de entrega com numero do recibo e codigo de controle da declaracao.",
      signals_json: {}
    },
    {},
    { fileName: "recibo_ir.pdf", mimeType: "application/pdf" }
  );
  assert.equal(reciboIr.detected_doc_type, "recibo_ir");
  assert.equal(reciboIr.detected_doc_category, "comprovante_renda");

  const holeriteLowEvidenceButStructured = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "doc",
      signals_json: { doc_type_hints: ["holerite"] }
    },
    {},
    { fileName: "holerite_titular.pdf", mimeType: "application/pdf" }
  );
  assert.equal(holeriteLowEvidenceButStructured.detected_doc_type, "holerite");
  assert.equal(holeriteLowEvidenceButStructured.classification_ok, true);

  const holeriteComEnderecoResolvidoPeloDossie = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Holerite mensal com salario base e valor liquido. Endereco do colaborador e CEP no rodape.",
      signals_json: {}
    },
    {
      envio_docs_itens_json: [
        { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" }
      ]
    },
    { fileName: "holerite_endereco.pdf", mimeType: "application/pdf" }
  );
  assert.equal(holeriteComEnderecoResolvidoPeloDossie.detected_doc_type, "holerite");
  assert.equal(holeriteComEnderecoResolvidoPeloDossie.detected_doc_category, "comprovante_renda");
  assert.equal(holeriteComEnderecoResolvidoPeloDossie.classification_ok, true);

  const cnhDoc = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Carteira Nacional de Habilitacao categoria B. Permissao para dirigir.",
      signals_json: {}
    },
    {},
    { fileName: "cnh.pdf", mimeType: "application/pdf" }
  );
  assert.equal(cnhDoc.detected_doc_type, "cnh");
  assert.equal(cnhDoc.classification_ok, true);

  const cnhPdfDigital = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Carteira Digital de Trânsito. Documento digital de habilitação. Registro Nacional de Condutores Habilitados (RENACH). Categoria B.",
      signals_json: {}
    },
    {},
    { fileName: "cnh_digital.pdf", mimeType: "application/pdf" }
  );
  assert.equal(cnhPdfDigital.detected_doc_type, "cnh");
  assert.equal(cnhPdfDigital.classification_ok, true);

  const residenciaImagemUtilidade = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "COPEL Distribuição S.A. Tarifa de energia elétrica. Unidade consumidora 123456. Consumo 250 kWh. Valor a pagar. CEP 80000-000. Curitiba PR.",
      signals_json: { doc_type_hints: ["cpf", "rg"], has_cpf_pattern: true }
    },
    {},
    { fileName: "conta_copel.jpg", mimeType: "image/jpeg" }
  );
  assert.equal(residenciaImagemUtilidade.detected_doc_type, "comprovante_residencia");
  assert.equal(residenciaImagemUtilidade.classification_ok, true);

  const identidadeVsCnhAmbiguo = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Carteira nacional de habilitacao categoria B. Documento de identidade com CPF 123.456.789-00.",
      signals_json: { doc_type_hints: ["cnh", "rg", "cpf"], has_cpf_pattern: true }
    },
    {},
    { fileName: "ambiguidade_identidade_cnh.pdf", mimeType: "application/pdf" }
  );
  assert.equal(identidadeVsCnhAmbiguo.detected_doc_type, "cnh");
  assert.equal(identidadeVsCnhAmbiguo.classification_ok, true);

  const ctpsPdfHintComOcrParcial = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Dados do trabalhador. CPF 123.456.789-00.",
      signals_json: { doc_type_hints: ["cpf"], has_cpf_pattern: true }
    },
    {},
    { fileName: "CTPSDigital_titular.pdf", mimeType: "application/pdf" }
  );
  assert.equal(ctpsPdfHintComOcrParcial.detected_doc_type, "ctps_completa");
  assert.equal(ctpsPdfHintComOcrParcial.classification_ok, true);

  const residenciaImagemSemConcessionariaMasComFaturaEndereco = classifyEnvioDocsDocument(
    {
      extraction_ok: true,
      extracted_text_full: "Fatura mensal com leitura atual, unidade consumidora 12345 e consumo 200 kWh. Endereco Rua B, 200. CEP 22222-222. CPF 123.456.789-00.",
      signals_json: { doc_type_hints: ["cpf"], has_cpf_pattern: true }
    },
    {},
    { fileName: "fatura_endereco.jpg", mimeType: "image/jpeg" }
  );
  assert.equal(residenciaImagemSemConcessionariaMasComFaturaEndereco.detected_doc_type, "comprovante_residencia");
  assert.equal(residenciaImagemSemConcessionariaMasComFaturaEndereco.classification_ok, true);
}

await run();
console.log("envio_docs_document_ai.smoke: ok");
