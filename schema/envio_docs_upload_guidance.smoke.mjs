import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  generateChecklistForDocs,
  envioDocsResumoPendencias,
  resolveEnvioDocsNextPendingItemForClient,
  buildEnvioDocsNextPendingPrompt,
  buildEnvioDocsUploadGuidanceLines,
  recomputeEnvioDocsProgress,
  reconcileEnvioDocsItensWithSavedDossier,
  buildDocumentDossierFromState,
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
    docs_status_geral: "completo",
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

// 6) Perfil salvo só com P1: conclui e encerra pasta normalmente
{
  const st = {
    dossie_participantes_json: [{ id: "p1", role: "titular" }],
    dossie_pendencias_json: [
      { tipo: "identidade_cpf", participante: "p1", obrigatorio: true },
      { tipo: "comprovante_residencia", participante: "p1", obrigatorio: true },
      { tipo: "holerites", participante: "p1", obrigatorio: true }
    ]
  };
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido }
  ];
  const reconciled = reconcileEnvioDocsItensWithSavedDossier(st, itens);
  const guidance = buildEnvioDocsUploadGuidanceLines(reconciled, recomputeEnvioDocsProgress(reconciled));
  assert.equal(guidance[0], "Recebemos sua pasta. Agora ela está em análise documental.");
}

// 7) Perfil salvo P1+P2: nunca encerra cedo após P1 completo, avança para P2
{
  const st = {
    dossie_participantes_json: [{ id: "p1" }, { id: "p2" }],
    dossie_pendencias_json: [
      { tipo: "identidade_cpf", participante: "p1", obrigatorio: true },
      { tipo: "comprovante_residencia", participante: "p1", obrigatorio: true },
      { tipo: "holerites", participante: "p1", obrigatorio: true },
      { tipo: "identidade_cpf", participante: "p2", obrigatorio: true },
      { tipo: "comprovante_residencia", participante: "p2", obrigatorio: true },
      { tipo: "comprovante_renda", participante: "p2", obrigatorio: true }
    ]
  };
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido }
  ];
  const reconciled = reconcileEnvioDocsItensWithSavedDossier(st, itens);
  const guidance = buildEnvioDocsUploadGuidanceLines(reconciled, recomputeEnvioDocsProgress(reconciled));
  assert.equal(guidance[0].includes("documento de identificação da composição (parceiro(a))"), true);
  assert.equal(guidance[0].includes("análise documental"), false);
}

// 8) Perfil salvo P1+P2+P3: avança em cadeia e só encerra no final
{
  const st = {
    dossie_participantes_json: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    dossie_pendencias_json: [
      { tipo: "identidade_cpf", participante: "p1", obrigatorio: true },
      { tipo: "identidade_cpf", participante: "p2", obrigatorio: true },
      { tipo: "identidade_cpf", participante: "p3", obrigatorio: true }
    ]
  };
  const aposP1 = reconcileEnvioDocsItensWithSavedDossier(st, [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido }
  ]);
  const guidanceP2 = buildEnvioDocsUploadGuidanceLines(aposP1, recomputeEnvioDocsProgress(aposP1));
  assert.equal(guidanceP2[0].includes("parceiro(a)"), true);

  const aposP2 = markReceived(aposP1, "identidade_cpf", "p2");
  const guidanceP3 = buildEnvioDocsUploadGuidanceLines(aposP2, recomputeEnvioDocsProgress(aposP2));
  assert.equal(guidanceP3[0].includes("composição (familiar)"), true);

  const aposP3 = markReceived(aposP2, "identidade_cpf", "p3");
  const guidanceFinal = buildEnvioDocsUploadGuidanceLines(aposP3, recomputeEnvioDocsProgress(aposP3));
  assert.equal(guidanceFinal[0], "Recebemos sua pasta. Agora ela está em análise documental.");
}

// 9) Perfil salvo sem P2/P3: não inventa participantes extras
{
  const st = {
    dossie_participantes_json: [{ id: "p1" }],
    dossie_pendencias_json: [
      { tipo: "identidade_cpf", participante: "p1", obrigatorio: true }
    ]
  };
  const itens = [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "identidade_cpf", participante: "p2", bucket: "obrigatorio", status: pendente }
  ];
  const reconciled = reconcileEnvioDocsItensWithSavedDossier(st, itens);
  assert.equal(reconciled.some((item) => item.participante === "p2" || item.participante === "p3"), false);
}

// 10) Não regressão: binding por participante ativo permanece no participante da vez
{
  const st = {
    dossie_participantes_json: [{ id: "p1" }, { id: "p2" }],
    dossie_pendencias_json: [
      { tipo: "identidade_cpf", participante: "p1", obrigatorio: true },
      { tipo: "identidade_cpf", participante: "p2", obrigatorio: true },
      { tipo: "comprovante_residencia", participante: "p2", obrigatorio: true }
    ]
  };
  const reconciled = reconcileEnvioDocsItensWithSavedDossier(st, [
    { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
    { tipo: "identidade_cpf", participante: "p2", bucket: "obrigatorio", status: pendente },
    { tipo: "comprovante_residencia", participante: "p2", bucket: "obrigatorio", status: pendente }
  ]);
  const nextItem = resolveEnvioDocsNextPendingItemForClient(reconciled);
  assert.equal(nextItem?.participante, "p2");
}

// 11) Dossiê nasce com P2 somente quando o perfil canônico explicita p2_tipo
{
  const dossieComP2 = buildDocumentDossierFromState({
    regime_trabalho: "clt",
    renda: 3500,
    p2_tipo: "parceiro",
    regime_trabalho_parceiro: "clt",
    renda_parceiro: 1800
  });
  assert.deepEqual(
    (dossieComP2.dossie_participantes_json || []).map((p) => p.id),
    ["p1", "p2"]
  );

  const dossieSemP2 = buildDocumentDossierFromState({
    regime_trabalho: "clt",
    renda: 3500,
    financiamento_conjunto: true,
    somar_renda: true
  });
  assert.deepEqual(
    (dossieSemP2.dossie_participantes_json || []).map((p) => p.id),
    ["p1"]
  );
}

// 12) Dossiê com composição familiar + P3 explícito percorre P1 -> P2 -> P3
{
  const dossie = buildDocumentDossierFromState({
    regime_trabalho: "clt",
    renda: 3200,
    p2_tipo: "familiar",
    regime_trabalho_parceiro_familiar: "clt",
    renda_parceiro_familiar: 1500,
    p3_required: true,
    p3_tipo: "pai",
    regime_trabalho_parceiro_familiar_p3: "clt",
    renda_parceiro_familiar_p3: 1400
  });
  const ids = (dossie.dossie_participantes_json || []).map((p) => p.id);
  assert.deepEqual(ids, ["p1", "p2", "p3"]);
}

console.log("envio_docs_upload_guidance.smoke: ok");
