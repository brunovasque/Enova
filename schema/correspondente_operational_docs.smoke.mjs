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
          fase_conversa: "aguardando_retorno_correspondente",
          corr_assumir_token: token,
          corr_publicacao_status: "entregue_privado_aguardando_retorno",
          corr_lock_correspondente_wa_id: correspondenteWa,
          corr_lock_assumido_em: "2026-03-29T18:00:00.000Z",
          processo_enviado_correspondente: true,
          aguardando_retorno_correspondente: true,
          dossie_status: "pronto",
          dossie_participantes_json: [{ id: "p1", role: "titular", regime_trabalho: "clt" }],
          pacote_documentos_anexados_json: [],
          envio_docs_itens_json: [],
          envio_docs_historico_json: [],
          updated_at: "2026-03-29T18:00:00.000Z",
        },
      },
    },
  };
}

async function fetchEntryHtml(env) {
  const req = new Request(`https://worker.local/correspondente/entrada?pre=000001&cw=${correspondenteWa}`, {
    method: "GET",
  });
  const res = await worker.fetch(req, env, {});
  const body = await res.text();
  assert.equal(res.status, 200);
  return body;
}

// 1) Snapshot documental sem materialidade não vira recebido operacional, mas continua visível como registro documental.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].pacote_documentos_anexados_json = [
    { tipo: "rg", participante: "p1", status: "recebido" },
  ];

  const body = await fetchEntryHtml(env);
  assert.equal(body.includes("Sem documentos recebidos mapeados."), true);
  assert.equal(body.includes("Registros documentais sem vínculo operacional:"), true);
  assert.equal(body.includes("rg — Titular"), true);
  assert.equal(body.includes("abrir documento"), false);
}

// 2) Upload real sem URL utilizável não pode criar falso vínculo operacional.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      { doc_id: "doc-real-sem-url", tipo: "ctps_completa", participante: "p1", status: "recebido", url: "" },
    ],
  };
  env.__enovaSimulationCtx.stateByWaId[waCaso].envio_docs_itens_json = [
    { tipo: "comprovante_residencia", participante: "p1", status: "pendente", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
  ];

  const body = await fetchEntryHtml(env);
  assert.equal(body.includes("Sem documentos recebidos mapeados."), true);
  assert.equal(body.includes("Registros documentais sem vínculo operacional:"), true);
  assert.equal(body.includes("ctps_completa — Titular"), true);
  assert.equal(body.includes("comprovante_residencia — Titular"), true);
  assert.equal(body.includes("abrir documento"), false);
}

// 3) confirmacao_textual com mídia/URL utilizável participa da reconstrução e gera link operacional.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].envio_docs_itens_json = [
    { tipo: "rg", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
  ];
  env.__enovaSimulationCtx.stateByWaId[waCaso].envio_docs_historico_json = [
    {
      origem: "confirmacao_textual",
      associado: { tipo: "rg", participante: "p1" },
      media_ref: {
        media_id: "mid-rg-confirmado",
        url: "https://graph.facebook.com/v20.0/mid-rg-confirmado",
        file_name: "rg-p1.pdf",
      },
    },
  ];

  const body = await fetchEntryHtml(env);
  assert.equal(body.includes("rg — Titular"), true);
  assert.equal(body.includes("/correspondente/doc?pre=000001"), true);
  assert.equal(body.includes("Nenhum link operacional disponível no momento."), false);
}

// 4) Equivalências documentais do upload real devem projetar links operacionais para os itens finais do dossiê.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].envio_docs_itens_json = [
    { tipo: "rg", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "cpf", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "comprovante_residencia", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "comprovante_renda", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "holerite_ultimo", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "ctps_completa", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: false, bloqueante_operacional: false },
  ];
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      { doc_id: "doc-cnh", tipo: "cnh", participante: "p1", status: "recebido", url: "https://docs.example.com/cnh.pdf" },
      { doc_id: "doc-res", tipo: "comprovante_residencia", participante: "p1", status: "recebido", url: "https://docs.example.com/res.pdf" },
      { doc_id: "doc-hol", tipo: "holerite", participante: "p1", status: "recebido", url: "https://docs.example.com/holerite.pdf" },
      { doc_id: "doc-ctps", tipo: "ctps", participante: "p1", status: "recebido", url: "https://docs.example.com/ctps.pdf" },
    ],
  };

  const body = await fetchEntryHtml(env);
  assert.equal(body.includes("rg — Titular"), true);
  assert.equal(body.includes("cpf — Titular"), true);
  assert.equal(body.includes("comprovante_residencia — Titular"), true);
  assert.equal(body.includes("comprovante_renda — Titular"), true);
  assert.equal(body.includes("holerite_ultimo — Titular"), true);
  assert.equal(body.includes("ctps_completa — Titular"), true);
  assert.equal(body.includes("cnh — Titular"), false);
  assert.equal(body.includes("holerite — Titular"), false);
  assert.equal(body.includes("ctps — Titular"), false);
  const openDocMatches = body.match(/>abrir documento</g) || [];
  assert.equal(openDocMatches.length, 6);
  const cnhProjectedLinks = body.match(/doc=doc_doc-cnh/g) || [];
  const resLinks = body.match(/doc=doc_doc-res/g) || [];
  const holeriteProjectedLinks = body.match(/doc=doc_doc-hol/g) || [];
  const ctpsProjectedLinks = body.match(/doc=doc_doc-ctps/g) || [];
  assert.equal(cnhProjectedLinks.length, 2);
  assert.equal(resLinks.length, 1);
  assert.equal(holeriteProjectedLinks.length, 2);
  assert.equal(ctpsProjectedLinks.length, 1);
}

// 5) Docs armazenados com tipos canônicos/matched (caso real de produção) devem projetar links operacionais via equivalência reversa.
{
  const env = buildEnvWithState();
  env.__enovaSimulationCtx.stateByWaId[waCaso].envio_docs_itens_json = [
    { tipo: "rg", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "cpf", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "comprovante_residencia", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "comprovante_renda", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "holerite_ultimo", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "ctps_completa", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: false, bloqueante_operacional: false },
  ];
  env.__enovaSimulationCtx.docsByWaId = {
    [waCaso]: [
      { doc_id: "doc-rg-from-cnh", tipo: "rg", participante: "p1", status: "recebido", url: "https://graph.facebook.com/v20.0/mid-cnh-1" },
      { doc_id: "doc-cpf-from-cnh", tipo: "cpf", participante: "p1", status: "recebido", url: "https://graph.facebook.com/v20.0/mid-cnh-1" },
      { doc_id: "doc-res", tipo: "comprovante_residencia", participante: "p1", status: "recebido", url: "https://graph.facebook.com/v20.0/mid-res-2" },
      { doc_id: "doc-renda-from-hol", tipo: "comprovante_renda", participante: "p1", status: "recebido", url: "https://graph.facebook.com/v20.0/mid-hol-3" },
      { doc_id: "doc-ctps", tipo: "ctps_completa", participante: "p1", status: "recebido", url: "https://graph.facebook.com/v20.0/mid-ctps-4" },
    ],
  };

  const body = await fetchEntryHtml(env);
  assert.equal(body.includes("rg — Titular"), true);
  assert.equal(body.includes("cpf — Titular"), true);
  assert.equal(body.includes("comprovante_residencia — Titular"), true);
  assert.equal(body.includes("comprovante_renda — Titular"), true);
  assert.equal(body.includes("holerite_ultimo — Titular"), true);
  assert.equal(body.includes("ctps_completa — Titular"), true);
  const openDocMatches = body.match(/>abrir documento</g) || [];
  assert.equal(openDocMatches.length, 6);
}

// 6) Docs via historico com tipos canônicos + pacote sem URLs: sibling match deve resolver links.
{
  const env = buildEnvWithState();
  const st = env.__enovaSimulationCtx.stateByWaId[waCaso];
  st.envio_docs_itens_json = [
    { tipo: "rg", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "cpf", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "comprovante_residencia", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "comprovante_renda", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "holerite_ultimo", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: true, bloqueante_operacional: true },
    { tipo: "ctps_completa", participante: "p1", status: "recebido_pendente_validacao", bucket: "obrigatorio", obrigatorio: false, bloqueante_operacional: false },
  ];
  st.pacote_documentos_anexados_json = [
    { tipo: "rg", participante: "p1", status: "recebido" },
    { tipo: "cpf", participante: "p1", status: "recebido" },
    { tipo: "comprovante_residencia", participante: "p1", status: "recebido" },
    { tipo: "comprovante_renda", participante: "p1", status: "recebido" },
    { tipo: "holerite_ultimo", participante: "p1", status: "recebido" },
    { tipo: "ctps_completa", participante: "p1", status: "recebido" },
  ];
  st.envio_docs_historico_json = [
    { origem: "upload", at: "2026-03-29T10:00:00Z", associado: { tipo: "rg", participante: "p1" }, media_ref: { media_id: "mid-cnh-1", url: "https://graph.facebook.com/v20.0/mid-cnh-1" }},
    { origem: "upload", at: "2026-03-29T10:01:00Z", associado: { tipo: "comprovante_residencia", participante: "p1" }, media_ref: { media_id: "mid-res-2", url: "https://graph.facebook.com/v20.0/mid-res-2" }},
    { origem: "upload", at: "2026-03-29T10:02:00Z", associado: { tipo: "comprovante_renda", participante: "p1" }, media_ref: { media_id: "mid-hol-3", url: "https://graph.facebook.com/v20.0/mid-hol-3" }},
    { origem: "upload", at: "2026-03-29T10:03:00Z", associado: { tipo: "ctps_completa", participante: "p1" }, media_ref: { media_id: "mid-ctps-4", url: "https://graph.facebook.com/v20.0/mid-ctps-4" }},
  ];

  const body = await fetchEntryHtml(env);
  const openDocMatches = body.match(/>abrir documento</g) || [];
  assert.equal(openDocMatches.length, 6);
  assert.equal(body.includes("Registros documentais sem vínculo operacional:"), false);
}

console.log("correspondente_operational_docs.smoke: ok");
