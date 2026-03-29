import assert from "node:assert/strict";

const sharedModule = await import(new URL("../panel/app/api/case-files/_shared.ts", import.meta.url).href);

const {
  mergeCaseFileRows,
  normalizeCaseFiles,
  resolveCaseFileById,
  resolveRowsFromCanonicalState,
} = sharedModule;

const waId = "5541997776666";

const primaryRows = [
  {
    wa_id: waId,
    tipo: "rg",
    participante: "p1",
    created_at: "2026-03-29T18:00:00.000Z",
    url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-real",
  },
];

const canonicalRows = resolveRowsFromCanonicalState(waId, {
  pacote_documentos_anexados_json: [
    {
      tipo: "rg",
      participante: "p1",
      status: "recebido",
      url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-real",
      created_at: "2026-03-29T18:00:00.000Z",
    },
    {
      tipo: "cpf",
      participante: "p1",
      status: "recebido",
      document_url: "https://graph.facebook.com/v20.0/cpf-real",
      created_at: "2026-03-29T18:05:00.000Z",
    },
  ],
  envio_docs_historico_json: [
    {
      origem: "confirmacao_textual",
      associado: { tipo: "cpf", participante: "p1" },
      media_ref: {
        url: "https://graph.facebook.com/v20.0/cpf-real",
      },
      at: "2026-03-29T18:05:00.000Z",
    },
  ],
});

const mergedRows = mergeCaseFileRows(primaryRows, canonicalRows);
assert.equal(mergedRows.length, 2);

const files = normalizeCaseFiles(waId, mergedRows);
assert.equal(files.length, 2);
assert.deepEqual(
  files.map((item) => item.tipo).sort(),
  ["cpf", "rg"],
);

const cpfFile = files.find((item) => item.tipo === "cpf");
assert.ok(cpfFile, "fallback canônico deve entrar no merge da listagem");

const resolvedCpf = resolveCaseFileById(waId, cpfFile.file_id, mergedRows);
assert.ok(resolvedCpf, "arquivo vindo só do fallback canônico deve continuar abrível após o merge");
assert.equal(resolvedCpf.sourceUrl, "https://graph.facebook.com/v20.0/cpf-real");

console.log("panel_case_files_merge.smoke: ok");
