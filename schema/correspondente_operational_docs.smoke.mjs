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

console.log("correspondente_operational_docs.smoke: ok");
