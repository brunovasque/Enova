/**
 * panel_case_files_display_all.smoke.mjs
 *
 * Valida que o painel reflete TODOS os documentos já persistidos em enova_docs,
 * incluindo:
 * - docs com url preenchida (caso normal)
 * - docs com media_id mas sem url (fallback via Graph API)
 * - docs sem url e sem media_id (has_link=false, card visível sem botões)
 * - múltiplos docs de tipos distintos para o mesmo wa_id
 * - merge com fallback de enova_state sem perder docs do enova_docs
 *
 * Cobre os 5 smoke tests exigidos no problema:
 * 1) Múltiplos docs persistidos no mesmo wa_id → painel mostra todos
 * 2) Tipos diferentes no mesmo wa_id → todos aparecem
 * 3) Sem docs → painel não quebra
 * 4) Merge com fallback → não perde docs existentes
 * 5) Caso real: múltiplos docs em enova_docs, painel mostra todos (incluindo sem url)
 */

import assert from "node:assert/strict";

const sharedModule = await import(
  new URL("../panel/app/api/case-files/_shared.ts", import.meta.url).href
);
const { normalizeCaseFiles, resolveCaseFileById, mergeCaseFileRows, resolveRowsFromCanonicalState } =
  sharedModule;

const waId = "5541997776666";

// ─────────────────────────────────────────────────────────────────────────────
// CASO 1: múltiplos docs já persistidos no mesmo wa_id
// Painel deve mostrar todos os docs esperados
// ─────────────────────────────────────────────────────────────────────────────
{
  const rows = [
    {
      wa_id: waId,
      tipo: "comprovante_renda",
      participante: "titular",
      created_at: "2026-03-01T10:00:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-cr-1",
    },
    {
      wa_id: waId,
      tipo: "holerite_ultimo",
      participante: "titular",
      created_at: "2026-03-01T10:05:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-hu-1",
    },
    {
      wa_id: waId,
      tipo: "ctps_completa",
      participante: "titular",
      created_at: "2026-03-01T10:10:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-ctps-1",
    },
  ];

  const files = normalizeCaseFiles(waId, rows);
  assert.equal(files.length, 3, "Caso 1: deve mostrar todos os 3 docs persistidos");
  assert.deepEqual(
    files.map((f) => f.tipo).sort(),
    ["comprovante_renda", "ctps_completa", "holerite_ultimo"],
    "Caso 1: todos os tipos devem estar presentes",
  );
  assert.ok(files.every((f) => f.has_link === true), "Caso 1: todos os docs com url têm has_link=true");
}

// ─────────────────────────────────────────────────────────────────────────────
// CASO 2: tipos diferentes no mesmo wa_id → todos aparecem
// ─────────────────────────────────────────────────────────────────────────────
{
  const rows = [
    {
      wa_id: waId,
      tipo: "rg",
      participante: "titular",
      created_at: "2026-03-01T10:00:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-rg-1",
    },
    {
      wa_id: waId,
      tipo: "cpf",
      participante: "titular",
      created_at: "2026-03-01T10:02:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-cpf-1",
    },
    {
      wa_id: waId,
      tipo: "rg",
      participante: "conjuge",
      created_at: "2026-03-01T10:04:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-rg-2",
    },
    {
      wa_id: waId,
      tipo: "comprovante_residencia",
      participante: "titular",
      created_at: "2026-03-01T10:06:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-res-1",
    },
  ];

  const files = normalizeCaseFiles(waId, rows);
  assert.equal(files.length, 4, "Caso 2: 4 docs distintos devem ser listados");
  const rgs = files.filter((f) => f.tipo === "rg");
  assert.equal(rgs.length, 2, "Caso 2: dois RGs (titular e conjuge) devem aparecer separados");
  assert.ok(files.every((f) => f.has_link === true), "Caso 2: todos com url têm has_link=true");
}

// ─────────────────────────────────────────────────────────────────────────────
// CASO 3: sem docs → painel não quebra
// ─────────────────────────────────────────────────────────────────────────────
{
  const files = normalizeCaseFiles(waId, []);
  assert.equal(files.length, 0, "Caso 3: lista vazia não deve quebrar");

  const filesNull = normalizeCaseFiles(waId, /** @type {any} */ (null));
  assert.equal(filesNull.length, 0, "Caso 3: input null não deve quebrar");
}

// ─────────────────────────────────────────────────────────────────────────────
// CASO 4: merge com fallback de enova_state não perde docs do enova_docs
// ─────────────────────────────────────────────────────────────────────────────
{
  const primaryRows = [
    {
      wa_id: waId,
      tipo: "comprovante_renda",
      participante: "titular",
      created_at: "2026-03-01T10:00:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-cr-1",
    },
    {
      wa_id: waId,
      tipo: "holerite_ultimo",
      participante: "titular",
      created_at: "2026-03-01T10:05:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-hu-1",
    },
    {
      wa_id: waId,
      tipo: "ctps_completa",
      participante: "titular",
      created_at: "2026-03-01T10:10:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-ctps-1",
    },
  ];

  // enova_state tem apenas 2 dos 3 docs (ctps_completa não está no state)
  const canonicalRows = resolveRowsFromCanonicalState(waId, {
    pacote_documentos_anexados_json: [
      {
        tipo: "comprovante_renda",
        participante: "titular",
        url: "https://graph.facebook.com/v20.0/media-cr-1",
        created_at: "2026-03-01T10:00:00.000Z",
        status: "recebido",
      },
      {
        tipo: "holerite_ultimo",
        participante: "titular",
        url: "https://graph.facebook.com/v20.0/media-hu-1",
        created_at: "2026-03-01T10:05:00.000Z",
        status: "recebido",
      },
    ],
    envio_docs_historico_json: [],
  });

  const sourceRows = mergeCaseFileRows(primaryRows, canonicalRows);
  const files = normalizeCaseFiles(waId, sourceRows);

  assert.equal(files.length, 3, "Caso 4: merge não deve perder o doc que só existe em enova_docs");
  assert.ok(
    files.some((f) => f.tipo === "ctps_completa"),
    "Caso 4: ctps_completa (só em enova_docs) deve aparecer no merge",
  );
  assert.ok(files.every((f) => f.has_link === true), "Caso 4: todos os docs têm URL válida");
}

// ─────────────────────────────────────────────────────────────────────────────
// CASO 5: caso real — docs em enova_docs sem url e sem media_id
//         (ex: processIncomingDocument com file.url = null)
//         Antes: painel mostrava só parte (docs sem url eram invisíveis)
//         Depois do patch: painel mostra todos, com has_link=false para os sem url
// ─────────────────────────────────────────────────────────────────────────────
{
  const primaryRows = [
    // doc com url preenchida (já era visível antes do patch)
    {
      wa_id: waId,
      tipo: "comprovante_renda",
      participante: "titular",
      created_at: "2026-03-01T10:00:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-cr-1",
    },
    // doc sem url, mas com media_id (visível após patch via fallback URL)
    {
      wa_id: waId,
      tipo: "holerite_ultimo",
      participante: "titular",
      created_at: "2026-03-01T10:05:00.000Z",
      url: null,
      media_id: "mediaid-hu-001",
    },
    // doc sem url e sem media_id (visível após patch, com has_link=false)
    {
      wa_id: waId,
      tipo: "ctps_completa",
      participante: "titular",
      created_at: "2026-03-01T10:10:00.000Z",
      url: null,
      media_id: null,
    },
  ];

  const files = normalizeCaseFiles(waId, primaryRows);

  assert.equal(
    files.length,
    3,
    "Caso 5: todos os 3 docs em enova_docs devem aparecer no painel (inclusive os sem url)",
  );

  const cr = files.find((f) => f.tipo === "comprovante_renda");
  assert.ok(cr, "Caso 5: comprovante_renda deve aparecer");
  assert.equal(cr.has_link, true, "Caso 5: comprovante_renda com url tem has_link=true");

  const hu = files.find((f) => f.tipo === "holerite_ultimo");
  assert.ok(hu, "Caso 5: holerite_ultimo com media_id deve aparecer");
  assert.equal(hu.has_link, true, "Caso 5: holerite_ultimo com media_id tem has_link=true (URL construída)");
  // Verifica que a URL foi construída corretamente a partir do media_id
  const huResolved = resolveCaseFileById(waId, hu.file_id, primaryRows);
  assert.ok(huResolved, "Caso 5: holerite_ultimo com media_id deve ser resolvível");
  assert.equal(
    huResolved.sourceUrl,
    "https://graph.facebook.com/v20.0/mediaid-hu-001",
    "Caso 5: URL de holerite_ultimo deve ser construída a partir do media_id",
  );

  const ctps = files.find((f) => f.tipo === "ctps_completa");
  assert.ok(ctps, "Caso 5: ctps_completa sem url e sem media_id deve aparecer no painel");
  assert.equal(ctps.has_link, false, "Caso 5: ctps_completa sem url/media_id tem has_link=false");
  assert.equal(ctps.previewable, false, "Caso 5: ctps_completa sem url/media_id não é previewable");
}

// ─────────────────────────────────────────────────────────────────────────────
// CASO 5b: merge completo — enova_docs com docs parcialmente sem url
//          + enova_state com subset dos docs
//          Resultado: todos os docs de enova_docs aparecem
// ─────────────────────────────────────────────────────────────────────────────
{
  const primaryRows = [
    {
      wa_id: waId,
      tipo: "comprovante_renda",
      participante: "titular",
      created_at: "2026-03-01T10:00:00.000Z",
      url: "https://graph.facebook.com/v20.0/media-cr-1",
    },
    {
      wa_id: waId,
      tipo: "holerite_ultimo",
      participante: "titular",
      created_at: "2026-03-01T10:05:00.000Z",
      url: null,
      media_id: null,
    },
    {
      wa_id: waId,
      tipo: "ctps_completa",
      participante: "titular",
      created_at: "2026-03-01T10:10:00.000Z",
      url: null,
      media_id: null,
    },
  ];

  // enova_state tem apenas comprovante_renda
  const canonicalRows = resolveRowsFromCanonicalState(waId, {
    pacote_documentos_anexados_json: [
      {
        tipo: "comprovante_renda",
        participante: "titular",
        url: "https://graph.facebook.com/v20.0/media-cr-1",
        created_at: "2026-03-01T10:00:00.000Z",
        status: "recebido",
      },
    ],
    envio_docs_historico_json: [],
  });

  const sourceRows = mergeCaseFileRows(primaryRows, canonicalRows);
  const files = normalizeCaseFiles(waId, sourceRows);

  assert.equal(
    files.length,
    3,
    "Caso 5b: todos os 3 docs de enova_docs devem aparecer após merge (mesmo sem url)",
  );

  const withLink = files.filter((f) => f.has_link);
  const withoutLink = files.filter((f) => !f.has_link);
  assert.equal(withLink.length, 1, "Caso 5b: apenas comprovante_renda tem link");
  assert.equal(withoutLink.length, 2, "Caso 5b: holerite_ultimo e ctps_completa não têm link");
  assert.ok(
    withoutLink.every((f) => f.tipo === "holerite_ultimo" || f.tipo === "ctps_completa"),
    "Caso 5b: os docs sem link são holerite_ultimo e ctps_completa",
  );
}

console.log("panel_case_files_display_all.smoke: ok");
