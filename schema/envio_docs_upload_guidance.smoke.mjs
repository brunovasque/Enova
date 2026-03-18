import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  generateChecklistForDocs,
  envioDocsResumoPendencias,
  resolveEnvioDocsNextPendingItemForClient,
  buildEnvioDocsNextPendingPrompt,
  buildEnvioDocsUploadGuidanceLines,
  recomputeEnvioDocsProgress,
  isCorrespondentePacoteReady
} = workerModule;

const recebido = "validado_basico";
const pendente = "pendente";

function markReceived(itens, tipo, participante = "p1") {
  return (Array.isArray(itens) ? itens : []).map((item) => {
    const sameTipo = String(item?.tipo || "").trim().toLowerCase() === String(tipo).trim().toLowerCase();
    const sameParticipante = String(item?.participante || "").trim().toLowerCase() === String(participante).trim().toLowerCase();
    if (!sameTipo || !sameParticipante) return item;
    return { ...item, status: recebido };
  });
}

// 1) Upload de 1 documento do titular: pede só próximo doc e sem listão
{
  let itens = generateChecklistForDocs({ regime_trabalho: "clt", financiamento_conjunto: false });
  itens = markReceived(itens, "identidade_cpf", "p1");
  const progress = recomputeEnvioDocsProgress(itens);
  const guidance = buildEnvioDocsUploadGuidanceLines(itens, progress);
  assert.equal(guidance.length, 1);
  assert.equal(guidance[0].includes("Agora me envie"), true);
  assert.equal(guidance[0].includes("comprovante de residência do titular"), true);
  assert.equal(guidance[0].includes("•"), false);
  assert.equal(guidance.join("\n").includes("próximos documentos"), false);
}

// 2) CTPS aplicável e pendente: continua aparecendo/podendo ser pedida ao cliente
{
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: pendente }
  ];
  const nextItem = resolveEnvioDocsNextPendingItemForClient(itens);
  assert.equal(nextItem?.tipo, "ctps_completa");
  assert.equal(buildEnvioDocsNextPendingPrompt(nextItem)?.includes("CTPS completa"), true);
  const fallbackResumo = envioDocsResumoPendencias(itens, { includeNonBlocking: true, limit: 0 }).join("\n");
  assert.equal(fallbackResumo.includes("Carteira de Trabalho Completa"), true);
}

// 3) Obrigatórios completos sem CTPS: segue apto para correspondente
{
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: pendente }
  ];
  const progress = recomputeEnvioDocsProgress(itens);
  assert.equal(progress.envio_docs_status, "completo");
  const ready = isCorrespondentePacoteReady({
    envio_docs_status: progress.envio_docs_status,
    pacote_status: "pronto",
    analise_docs_status: "validada",
    pacote_participantes_json: [{ participante: "p1", papel: "titular" }],
    pacote_documentos_anexados_json: [{ tipo: "identidade_cpf", participante: "p1", status: recebido }],
    pacote_renda_resumo_json: { total_geral: 3500 },
    pacote_restricoes_json: { resumo: "sem_restricao" }
  });
  assert.equal(ready, true);
}

// 4) Cenário conjunto/composição: próximo documento correto da pessoa correta
{
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "identidade_cpf", participante: "p2", bucket: "obrigatorio", status: recebido },
    { tipo: "comprovante_residencia", participante: "p2", bucket: "obrigatorio", status: pendente },
    { tipo: "comprovante_renda", participante: "p2", bucket: "obrigatorio", status: pendente },
    { tipo: "ctps_completa", participante: "p2", bucket: "obrigatorio", status: pendente }
  ];
  const progress = recomputeEnvioDocsProgress(itens);
  const guidance = buildEnvioDocsUploadGuidanceLines(itens, progress);
  assert.equal(guidance[0].includes("comprovante de residência da composição (parceiro(a))"), true);
  assert.equal(guidance[0].includes("•"), false);
}

// 5) Fallback resumo explícito: lista completa só sob chamada explícita
{
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: pendente },
    { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: pendente },
    { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: pendente },
    { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: pendente }
  ];
  const resumoExplicito = envioDocsResumoPendencias(itens, { includeNonBlocking: true, limit: 0 });
  assert.equal(resumoExplicito.length, 4);
  const guidance = buildEnvioDocsUploadGuidanceLines(itens, recomputeEnvioDocsProgress(itens));
  assert.equal(guidance.length, 1);
  assert.equal(guidance[0].startsWith("Agora me envie"), true);
}

console.log("envio_docs_upload_guidance.smoke: ok");
