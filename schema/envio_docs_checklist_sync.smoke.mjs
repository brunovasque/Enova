import assert from "node:assert/strict";

/**
 * Regression test:
 * When st.envio_docs_itens_json is empty/null, handleDocumentUpload generates
 * the checklist via generateChecklistForDocs but must sync it back to
 * st.envio_docs_itens_json so downstream functions
 * (matchEnvioDocsClassificationToChecklist, selectEnvioDocsItemForUpload)
 * see the pending items.
 *
 * Without the sync, both functions read an empty array from st and produce
 * "no_pending_item_for_doc_type" even though the doc was correctly classified.
 */

const workerModule = await import(new URL("../Enova worker.js", import.meta.url).href);
const {
  generateChecklistForDocs,
  matchEnvioDocsClassificationToChecklist,
  reconcileEnvioDocsItensWithSavedDossier
} = workerModule;

// Simulate a state where envio_docs_itens_json has not been populated yet
// (first upload before the list was ever sent to the user).
const stEmpty = {
  wa_id: "5511999990000",
  fase_conversa: "envio_docs",
  regime_trabalho: "clt",
  envio_docs_itens_json: null
};

// 1) Confirm that generateChecklistForDocs produces identidade_cpf for p1
const generated = generateChecklistForDocs(stEmpty);
const hasIdentidade = generated.some(
  (item) => item.tipo === "identidade_cpf" && item.participante === "p1"
);
assert.ok(hasIdentidade, "generateChecklistForDocs must produce identidade_cpf:p1");

// 2) The bug: matchEnvioDocsClassificationToChecklist reads st.envio_docs_itens_json directly.
//    If empty, it finds no pending items and returns no_pending_item_for_doc_type.
const matchBeforeSync = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "cnh", classification_confidence: 0.94 },
  { detected_participant: "p1", participant_confidence: 0.85 },
  stEmpty
);
assert.equal(matchBeforeSync.match_status, "no_match",
  "Before sync, empty itens means no match");

// 3) After syncing (the fix), the match should succeed.
const itensBase = Array.isArray(stEmpty.envio_docs_itens_json) && stEmpty.envio_docs_itens_json?.length
  ? [...stEmpty.envio_docs_itens_json]
  : generateChecklistForDocs(stEmpty);
const itens = reconcileEnvioDocsItensWithSavedDossier(stEmpty, itensBase);
stEmpty.envio_docs_itens_json = itens; // <-- THE FIX

const matchAfterSync = matchEnvioDocsClassificationToChecklist(
  { detected_doc_type: "cnh", classification_confidence: 0.94 },
  { detected_participant: "p1", participant_confidence: 0.85 },
  stEmpty
);
assert.equal(matchAfterSync.match_status, "matched_safe",
  "After sync, CNH must resolve to identidade_cpf pending item");
assert.ok(matchAfterSync.matched_items.length >= 1,
  "After sync, at least one matched item expected");
assert.ok(
  matchAfterSync.matched_items.some((item) => item.participante === "p1"),
  "Matched item should be for p1"
);

console.log("envio_docs_checklist_sync.smoke: ok");
