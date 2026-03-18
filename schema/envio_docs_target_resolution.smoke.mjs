import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  matchEnvioDocsClassificationToChecklist,
  resolveEnvioDocsTargetFromDocumentEngine,
  chooseEnvioDocsFinalTarget
} = workerModule;

const itens = [
  { tipo: "rg", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "holerite", participante: "p2", bucket: "obrigatorio", status: "pendente" },
  { tipo: "extrato_bancario", participante: "p3", bucket: "obrigatorio", status: "validado_basico" }
];

const matchedSafe = resolveEnvioDocsTargetFromDocumentEngine(
  itens,
  { match_status: "matched_safe", matched_items: [{ tipo: "rg", participante: "p1" }] },
  { detected_doc_type: "rg" }
);
assert.equal(matchedSafe.item?.tipo, "rg");
assert.equal(matchedSafe.item?.participante, "p1");
assert.equal(matchedSafe.source, "document_engine");

const matchedReceived = resolveEnvioDocsTargetFromDocumentEngine(
  itens,
  { match_status: "matched_safe", matched_items: [{ tipo: "extrato_bancario", participante: "p3" }] },
  { detected_doc_type: "extrato_bancario" }
);
assert.equal(matchedReceived.item, null);

const ambiguousNoFallback = chooseEnvioDocsFinalTarget({
  itens,
  checklistMatch: { match_status: "ambiguous", matched_items: [{ tipo: "rg", participante: "p1" }, { tipo: "cpf", participante: "p1" }] },
  documentClassification: { detected_doc_type: "nao_identificado" },
  legacySelection: { item: null, items: [] }
});
assert.equal(ambiguousNoFallback.target, null);
assert.equal(ambiguousNoFallback.finalTargetSource, "none");
assert.equal(ambiguousNoFallback.fallbackUsed, false);

const noMatchWithFallback = chooseEnvioDocsFinalTarget({
  itens,
  checklistMatch: { match_status: "no_match", matched_items: [] },
  documentClassification: { detected_doc_type: "nao_identificado" },
  legacySelection: { item: itens[1], items: [itens[1]] }
});
assert.equal(noMatchWithFallback.target?.tipo, "cpf");
assert.equal(noMatchWithFallback.finalTargetSource, "legacy_fallback");
assert.equal(noMatchWithFallback.fallbackUsed, true);

const itensRendaResidenciaDossier = [
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" }
];

const noMatchResolvedByDossierCoverage = chooseEnvioDocsFinalTarget({
  itens: itensRendaResidenciaDossier,
  checklistMatch: { match_status: "no_match", matched_items: [] },
  documentClassification: { detected_doc_type: "holerite" },
  legacySelection: { item: null, items: [] }
});
assert.equal(noMatchResolvedByDossierCoverage.target?.tipo, "comprovante_renda");
assert.equal(noMatchResolvedByDossierCoverage.target?.participante, "p1");
assert.equal(noMatchResolvedByDossierCoverage.finalTargetSource, "dossier_coverage");
assert.equal(noMatchResolvedByDossierCoverage.fallbackUsed, false);

const noMatchRendaSoloSegueDossie = chooseEnvioDocsFinalTarget({
  itens: [{ tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" }],
  checklistMatch: { match_status: "no_match", matched_items: [] },
  documentClassification: { detected_doc_type: "extrato_bancario" },
  legacySelection: { item: null, items: [] }
});
assert.equal(noMatchRendaSoloSegueDossie.target?.tipo, "comprovante_renda");
assert.equal(noMatchRendaSoloSegueDossie.target?.participante, "p1");
assert.equal(noMatchRendaSoloSegueDossie.finalTargetSource, "dossier_coverage");

const noMatchRendaConjuntoMantemAmbiguidade = chooseEnvioDocsFinalTarget({
  itens: [
    { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" },
    { tipo: "comprovante_renda", participante: "p2", bucket: "obrigatorio", status: "pendente" }
  ],
  checklistMatch: { match_status: "no_match", matched_items: [] },
  documentClassification: { detected_doc_type: "extrato_bancario" },
  legacySelection: { item: null, items: [] }
});
assert.equal(noMatchRendaConjuntoMantemAmbiguidade.target, null);
assert.equal(noMatchRendaConjuntoMantemAmbiguidade.finalTargetSource, "none");

const itensRendaAmbiguo = [
  { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "comprovante_renda", participante: "p2", bucket: "obrigatorio", status: "pendente" }
];
const fallbackUploadCannotOverrideDossierAmbiguity = chooseEnvioDocsFinalTarget({
  itens: itensRendaAmbiguo,
  checklistMatch: { match_status: "no_match", matched_items: [] },
  documentClassification: { detected_doc_type: "nao_identificado" },
  legacySelection: { item: itensRendaAmbiguo[1], items: [itensRendaAmbiguo[1]] }
});
assert.equal(fallbackUploadCannotOverrideDossierAmbiguity.target, null);
assert.equal(fallbackUploadCannotOverrideDossierAmbiguity.finalTargetSource, "none");
assert.equal(fallbackUploadCannotOverrideDossierAmbiguity.fallbackUsed, false);

const fallbackRendaSemTipoReconhecidoNaoEUsado = chooseEnvioDocsFinalTarget({
  itens: [{ tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" }],
  checklistMatch: { match_status: "no_match", matched_items: [] },
  documentClassification: { detected_doc_type: "nao_identificado" },
  legacySelection: {
    item: { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" },
    items: [{ tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" }]
  }
});
assert.equal(fallbackRendaSemTipoReconhecidoNaoEUsado.target, null);
assert.equal(fallbackRendaSemTipoReconhecidoNaoEUsado.finalTargetSource, "none");
assert.equal(fallbackRendaSemTipoReconhecidoNaoEUsado.fallbackUsed, false);

const matchedSafeWins = chooseEnvioDocsFinalTarget({
  itens,
  checklistMatch: { match_status: "matched_safe", matched_items: [{ tipo: "rg", participante: "p1" }] },
  documentClassification: { detected_doc_type: "rg" },
  legacySelection: { item: itens[1], items: [itens[1]] }
});
assert.equal(matchedSafeWins.target?.tipo, "rg");
assert.equal(matchedSafeWins.finalTargetSource, "document_engine");
assert.equal(matchedSafeWins.fallbackUsed, false);

const itensWithRecommendedCtps = [
  { tipo: "identidade_cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "ctps_completa", participante: "p1", bucket: "recomendado", status: "recomendado", recomendacao: "estrategica" }
];

const ctpsRecommendedTarget = chooseEnvioDocsFinalTarget({
  itens: itensWithRecommendedCtps,
  checklistMatch: {
    match_status: "no_match",
    match_reason: "no_pending_item_for_doc_type_and_participant",
    match_signals_json: { detected_participant: "p1", participant_confidence: 0.9 }
  },
  documentClassification: { detected_doc_type: "ctps_completa" },
  legacySelection: { item: null, items: [] }
});
assert.equal(ctpsRecommendedTarget.target?.tipo, "ctps_completa");
assert.equal(ctpsRecommendedTarget.target?.participante, "p1");
assert.equal(ctpsRecommendedTarget.finalTargetSource, "recommended_ctps");
assert.equal(ctpsRecommendedTarget.fallbackUsed, false);
assert.notEqual(ctpsRecommendedTarget.target?.tipo, "identidade_cpf");
assert.notEqual(ctpsRecommendedTarget.target?.tipo, "comprovante_renda");
assert.equal(itensWithRecommendedCtps[0].status, "pendente");
assert.equal(itensWithRecommendedCtps[1].status, "pendente");

const itensComprovantes = [
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "comprovante_residencia", participante: "p2", bucket: "obrigatorio", status: "pendente" },
  { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "comprovante_renda", participante: "p2", bucket: "obrigatorio", status: "pendente" },
  { tipo: "rg", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" }
];

const matchResidenciaSoftParticipant = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "comprovante_residencia", detected_doc_category: "comprovante_residencia", classification_confidence: 0.8 },
  { detected_participant: "p1", participant_confidence: 0.6 },
  { envio_docs_itens_json: itensComprovantes }
);
assert.equal(matchResidenciaSoftParticipant.match_status, "matched_safe");
assert.deepEqual(matchResidenciaSoftParticipant.matched_items, [{ tipo: "comprovante_residencia", participante: "p1" }]);

const matchRendaSoftParticipant = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "holerite", detected_doc_category: "comprovante_renda", classification_confidence: 0.8 },
  { detected_participant: "p2", participant_confidence: 0.61 },
  { envio_docs_itens_json: itensComprovantes }
);
assert.equal(matchRendaSoftParticipant.match_status, "matched_safe");
assert.deepEqual(matchRendaSoftParticipant.matched_items, [{ tipo: "comprovante_renda", participante: "p2" }]);

const matchRendaParticipanteForteErradoMasDossieUnico = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "holerite", detected_doc_category: "comprovante_renda", classification_confidence: 0.83 },
  { detected_participant: "p2", participant_confidence: 0.9 },
  {
    envio_docs_itens_json: [
      { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ]
  }
);
assert.equal(matchRendaParticipanteForteErradoMasDossieUnico.match_status, "matched_safe");
assert.equal(matchRendaParticipanteForteErradoMasDossieUnico.match_reason, "single_pending_item_resolved_by_dossier_coverage");
assert.deepEqual(matchRendaParticipanteForteErradoMasDossieUnico.matched_items, [{ tipo: "comprovante_renda", participante: "p1" }]);

const matchResidenciaAmbiguoReal = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "comprovante_residencia", detected_doc_category: "comprovante_residencia", classification_confidence: 0.8 },
  { detected_participant: "desconhecido", participant_confidence: 0.5 },
  { envio_docs_itens_json: itensComprovantes }
);
assert.equal(matchResidenciaAmbiguoReal.match_status, "matched_safe");
assert.equal(matchResidenciaAmbiguoReal.match_reason, "resolved_by_current_envio_docs_participant");
assert.deepEqual(matchResidenciaAmbiguoReal.matched_items, [{ tipo: "comprovante_residencia", participante: "p1" }]);

const matchResidenciaParticipanteAtivoAvancaParaP2 = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "comprovante_residencia", detected_doc_category: "comprovante_residencia", classification_confidence: 0.82 },
  { detected_participant: "desconhecido", participant_confidence: 0.5 },
  {
    envio_docs_itens_json: [
      { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_residencia", participante: "p2", bucket: "obrigatorio", status: "pendente" }
    ]
  }
);
assert.equal(matchResidenciaParticipanteAtivoAvancaParaP2.match_status, "matched_safe");
assert.deepEqual(matchResidenciaParticipanteAtivoAvancaParaP2.matched_items, [{ tipo: "comprovante_residencia", participante: "p2" }]);

const matchResidenciaParticipanteAtivoAvancaParaP3 = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "comprovante_residencia", detected_doc_category: "comprovante_residencia", classification_confidence: 0.82 },
  { detected_participant: "desconhecido", participant_confidence: 0.5 },
  {
    envio_docs_itens_json: [
      { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_renda", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_residencia", participante: "p2", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_renda", participante: "p2", bucket: "obrigatorio", status: "validado_basico" },
      { tipo: "comprovante_residencia", participante: "p3", bucket: "obrigatorio", status: "pendente" }
    ]
  }
);
assert.equal(matchResidenciaParticipanteAtivoAvancaParaP3.match_status, "matched_safe");
assert.deepEqual(matchResidenciaParticipanteAtivoAvancaParaP3.matched_items, [{ tipo: "comprovante_residencia", participante: "p3" }]);

const matchResidenciaDesempateSeguroPorSinal = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "comprovante_residencia", detected_doc_category: "comprovante_residencia", classification_confidence: 0.82 },
  {
    detected_participant: "desconhecido",
    participant_confidence: 0.5,
    participant_signals_json: {
      scoring: [
        { participante: "p1", score: 0.81 },
        { participante: "p2", score: 0.52 }
      ]
    }
  },
  { envio_docs_itens_json: itensComprovantes }
);
assert.equal(matchResidenciaDesempateSeguroPorSinal.match_status, "matched_safe");
assert.equal(matchResidenciaDesempateSeguroPorSinal.match_reason, "resolved_by_current_envio_docs_participant");
assert.deepEqual(matchResidenciaDesempateSeguroPorSinal.matched_items, [{ tipo: "comprovante_residencia", participante: "p1" }]);
assert.deepEqual(matchResidenciaDesempateSeguroPorSinal.match_signals_json?.current_participant_tiebreak, {
  participante_atual: "p1",
  candidate_count: 2,
  selected_count: 1
});

const matchResidenciaAmbiguoFallbackLegitimo = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "comprovante_residencia", detected_doc_category: "comprovante_residencia", classification_confidence: 0.82 },
  { detected_participant: "desconhecido", participant_confidence: 0.5 },
  {
    envio_docs_itens_json: [
      { tipo: "comprovante_residencia", participante: "titular", bucket: "obrigatorio", status: "pendente" },
      { tipo: "comprovante_residencia", participante: "conjuge", bucket: "obrigatorio", status: "pendente" }
    ]
  }
);
assert.equal(matchResidenciaAmbiguoFallbackLegitimo.match_status, "ambiguous");
assert.equal(matchResidenciaAmbiguoFallbackLegitimo.match_reason, "multiple_pending_items_for_doc_type");

// rg_com_cpf deve resolver rg+cpf do mesmo participante sem ambiguidade
const itensRgCpfMesmoParticipante = [
  { tipo: "rg", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" }
];
const matchRgComCpf = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "rg_com_cpf", detected_doc_category: "identidade", classification_confidence: 0.83 },
  { detected_participant: "p1", participant_confidence: 0.8 },
  { envio_docs_itens_json: itensRgCpfMesmoParticipante }
);
assert.equal(matchRgComCpf.match_status, "matched_safe");
assert.equal(matchRgComCpf.match_reason, "rg_com_cpf_resolves_identity_and_cpf_same_participant");
assert.deepEqual(
  matchRgComCpf.matched_items
    .map(({ tipo, participante }) => ({ tipo, participante }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo)),
  itensRgCpfMesmoParticipante
    .map(({ tipo, participante }) => ({ tipo, participante }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo))
);
const engineRgComCpf = resolveEnvioDocsTargetFromDocumentEngine(
  itensRgCpfMesmoParticipante,
  matchRgComCpf,
  { detected_doc_type: "rg_com_cpf" }
);
assert.equal(engineRgComCpf.source, "document_engine");
assert.equal(engineRgComCpf.item?.participante, "p1");
const finalTargetRgComCpf = chooseEnvioDocsFinalTarget({
  itens: itensRgCpfMesmoParticipante,
  checklistMatch: matchRgComCpf,
  documentClassification: { detected_doc_type: "rg_com_cpf" },
  legacySelection: { item: null, items: [] }
});
assert.equal(finalTargetRgComCpf.finalTargetSource, "document_engine");
assert.equal(finalTargetRgComCpf.matchedItems?.length, 2);

const matchRendaDesempateSeguroPorSinal = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "holerite", detected_doc_category: "comprovante_renda", classification_confidence: 0.83 },
  {
    detected_participant: "desconhecido",
    participant_confidence: 0.5,
    participant_signals_json: {
      scoring: [
        { participante: "p2", score: 0.86 },
        { participante: "p1", score: 0.54 }
      ]
    }
  },
  { envio_docs_itens_json: itensComprovantes }
);
assert.equal(matchRendaDesempateSeguroPorSinal.match_status, "matched_safe");
assert.equal(matchRendaDesempateSeguroPorSinal.match_reason, "resolved_by_current_envio_docs_participant");
assert.deepEqual(matchRendaDesempateSeguroPorSinal.matched_items, [{ tipo: "comprovante_renda", participante: "p1" }]);
assert.deepEqual(matchRendaDesempateSeguroPorSinal.match_signals_json?.current_participant_tiebreak, {
  participante_atual: "p1",
  candidate_count: 2,
  selected_count: 1
});

const matchCnhSoloIdentidade = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "cnh", detected_doc_category: "identidade", classification_confidence: 0.85 },
  { detected_participant: "desconhecido", participant_confidence: 0.5 },
  {
    envio_docs_itens_json: [
      { tipo: "rg", participante: "p1", bucket: "obrigatorio", status: "pendente" },
      { tipo: "cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" }
    ]
  }
);
assert.equal(matchCnhSoloIdentidade.match_status, "matched_safe");
assert.equal(matchCnhSoloIdentidade.match_reason, "rg_com_cpf_resolves_identity_and_cpf_same_participant");
assert.deepEqual(
  matchCnhSoloIdentidade.matched_items
    .map(({ tipo, participante }) => ({ tipo, participante }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo)),
  [
    { tipo: "cpf", participante: "p1" },
    { tipo: "rg", participante: "p1" }
  ].sort((a, b) => a.tipo.localeCompare(b.tipo))
);

const itensIdentidadeConjuntoPendentes = [
  { tipo: "rg", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "cpf", participante: "p1", bucket: "obrigatorio", status: "pendente" },
  { tipo: "rg", participante: "p2", bucket: "obrigatorio", status: "pendente" },
  { tipo: "cpf", participante: "p2", bucket: "obrigatorio", status: "pendente" }
];
const matchCnhConjuntoBlocoPrimeiroParticipante = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "cnh", detected_doc_category: "identidade", classification_confidence: 0.86 },
  { detected_participant: "desconhecido", participant_confidence: 0.4 },
  { envio_docs_itens_json: itensIdentidadeConjuntoPendentes }
);
assert.equal(matchCnhConjuntoBlocoPrimeiroParticipante.match_status, "matched_safe");
assert.equal(matchCnhConjuntoBlocoPrimeiroParticipante.match_reason, "identity_resolved_by_current_envio_docs_participant");
assert.deepEqual(
  matchCnhConjuntoBlocoPrimeiroParticipante.matched_items
    .map(({ tipo, participante }) => ({ tipo, participante }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo)),
  [
    { tipo: "cpf", participante: "p1" },
    { tipo: "rg", participante: "p1" }
  ].sort((a, b) => a.tipo.localeCompare(b.tipo))
);
const finalCnhConjuntoBlocoPrimeiroParticipante = chooseEnvioDocsFinalTarget({
  itens: itensIdentidadeConjuntoPendentes,
  checklistMatch: matchCnhConjuntoBlocoPrimeiroParticipante,
  documentClassification: { detected_doc_type: "cnh" },
  legacySelection: { item: null, items: [] }
});
assert.equal(finalCnhConjuntoBlocoPrimeiroParticipante.finalTargetSource, "document_engine");
assert.equal(finalCnhConjuntoBlocoPrimeiroParticipante.target?.participante, "p1");

const itensIdentidadeConjuntoBlocoSegundoParticipante = [
  { tipo: "rg", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
  { tipo: "cpf", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
  { tipo: "comprovante_residencia", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
  { tipo: "holerite", participante: "p1", bucket: "obrigatorio", status: "validado_basico" },
  { tipo: "rg", participante: "p2", bucket: "obrigatorio", status: "pendente" },
  { tipo: "cpf", participante: "p2", bucket: "obrigatorio", status: "pendente" }
];
const matchCnhConjuntoBlocoSegundoParticipante = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "cnh", detected_doc_category: "identidade", classification_confidence: 0.86 },
  { detected_participant: "desconhecido", participant_confidence: 0.4 },
  { envio_docs_itens_json: itensIdentidadeConjuntoBlocoSegundoParticipante }
);
assert.equal(matchCnhConjuntoBlocoSegundoParticipante.match_status, "matched_safe");
assert.deepEqual(
  matchCnhConjuntoBlocoSegundoParticipante.matched_items
    .map(({ tipo, participante }) => ({ tipo, participante }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo)),
  [
    { tipo: "cpf", participante: "p2" },
    { tipo: "rg", participante: "p2" }
  ].sort((a, b) => a.tipo.localeCompare(b.tipo))
);
const finalCnhConjuntoBlocoSegundoParticipante = chooseEnvioDocsFinalTarget({
  itens: itensIdentidadeConjuntoBlocoSegundoParticipante,
  checklistMatch: matchCnhConjuntoBlocoSegundoParticipante,
  documentClassification: { detected_doc_type: "cnh" },
  legacySelection: { item: null, items: [] }
});
assert.equal(finalCnhConjuntoBlocoSegundoParticipante.finalTargetSource, "document_engine");
assert.equal(finalCnhConjuntoBlocoSegundoParticipante.target?.participante, "p2");

const matchCnhSemContextoSeguro = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "cnh", detected_doc_category: "identidade", classification_confidence: 0.86 },
  { detected_participant: "desconhecido", participant_confidence: 0.4 },
  {
    envio_docs_itens_json: [
      { tipo: "rg", participante: "titular", bucket: "obrigatorio", status: "pendente" },
      { tipo: "cpf", participante: "titular", bucket: "obrigatorio", status: "pendente" },
      { tipo: "rg", participante: "conjuge", bucket: "obrigatorio", status: "pendente" },
      { tipo: "cpf", participante: "conjuge", bucket: "obrigatorio", status: "pendente" }
    ]
  }
);
assert.equal(matchCnhSemContextoSeguro.match_status, "ambiguous");
assert.equal(matchCnhSemContextoSeguro.match_reason, "multiple_pending_items_for_doc_type");

console.log("envio_docs_target_resolution.smoke: ok");
