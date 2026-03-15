import assert from "node:assert/strict";

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
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
assert.equal(itensWithRecommendedCtps[0].status, "pendente");
assert.equal(itensWithRecommendedCtps[1].status, "pendente");

console.log("envio_docs_target_resolution.smoke: ok");
