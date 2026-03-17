import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  generateChecklistForDocs,
  isEnvioDocsBlockingItem,
  recomputeEnvioDocsProgress,
  isCorrespondentePacoteReady
} = workerModule;

const recebido = "validado_basico";
const pendente = "pendente";

const baseReadyState = {
  pacote_status: "pronto",
  analise_docs_status: "validada",
  pacote_participantes_json: [{ participante: "p1", papel: "titular" }],
  pacote_documentos_anexados_json: [{ tipo: "rg", participante: "p1", status: recebido }],
  pacote_renda_resumo_json: { total_geral: 3500 },
  pacote_restricoes_json: { resumo: "sem_restricao" }
};

const withReadyStatus = (itens) => {
  const progress = recomputeEnvioDocsProgress(itens);
  return {
    ...baseReadyState,
    envio_docs_status: progress.envio_docs_status
  };
};

const cltComCtpsPendente = [
  { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: pendente }
];
const cltComCtpsItem = cltComCtpsPendente.find((item) => item.tipo === "ctps_completa" && item.participante === "p1");
assert.equal(isEnvioDocsBlockingItem(cltComCtpsItem), false);
assert.equal(recomputeEnvioDocsProgress(cltComCtpsPendente).envio_docs_status, "completo");
assert.equal(isCorrespondentePacoteReady(withReadyStatus(cltComCtpsPendente)), true);

const cltSemHolerite = [
  { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: pendente },
  { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: pendente }
];
assert.notEqual(recomputeEnvioDocsProgress(cltSemHolerite).envio_docs_status, "completo");

const autonomoIrSemRecibo = [
  { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "declaracao_ir", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "recibo_ir", participante: "p1", bucket: "obrigatorio", status: pendente }
];
assert.notEqual(recomputeEnvioDocsProgress(autonomoIrSemRecibo).envio_docs_status, "completo");

const autonomoIrComCtpsPendente = [
  { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "declaracao_ir", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "recibo_ir", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "ctps_completa", participante: "p1", bucket: "obrigatorio", status: pendente }
];
assert.equal(recomputeEnvioDocsProgress(autonomoIrComCtpsPendente).envio_docs_status, "completo");

const conjuntoP2CtpsPendente = [
  { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "identidade_cpf", participante: "p2", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p2", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_renda", participante: "p2", bucket: "obrigatorio", status: recebido },
  { tipo: "ctps_completa", participante: "p2", bucket: "obrigatorio", status: pendente }
];
assert.equal(recomputeEnvioDocsProgress(conjuntoP2CtpsPendente).envio_docs_status, "completo");

const conjuntoP2SemRendaObrigatoria = [
  { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "holerites", participante: "p1", bucket: "obrigatorio", status: recebido },
  { tipo: "identidade_cpf", participante: "p2", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_residencia", participante: "p2", bucket: "obrigatorio", status: recebido },
  { tipo: "comprovante_renda", participante: "p2", bucket: "obrigatorio", status: pendente },
  { tipo: "ctps_completa", participante: "p2", bucket: "obrigatorio", status: pendente }
];
assert.notEqual(recomputeEnvioDocsProgress(conjuntoP2SemRendaObrigatoria).envio_docs_status, "completo");

const checklistSoloClt = generateChecklistForDocs({
  regime_trabalho: "clt",
  financiamento_conjunto: false
});
assert.equal(
  checklistSoloClt.some((item) => item.tipo === "ctps_completa" && item.participante === "p1"),
  true
);
