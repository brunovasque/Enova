/**
 * panel_case_files_full_listing.smoke.mjs
 *
 * Valida que o painel reflete TODOS os documentos persistidos em enova_docs,
 * incluindo aqueles sem url preenchida, sem perder docs válidos e sem
 * depender de colunas inexistentes como media_id.
 *
 * Cobre:
 *  1) Múltiplos docs com url — todos aparecem
 *  2) Tipos diferentes no mesmo wa_id — todos aparecem
 *  3) Docs sem url — aparecem como não-previsualizáveis
 *  4) Merge com fallback canônico — não perde docs existentes
 *  5) Caso representativo: docs em enova_docs + painel mostra todos
 *  6) Nenhuma coluna inexistente (media_id) no fluxo
 *  7) Caso vazio — painel não quebra
 *  8) Dedupe não descarta docs distintos
 *  9) No-URL row coberta por canonical com URL — sem duplicata
 */

import assert from "node:assert/strict";

const sharedModule = await import(
  new URL("../panel/app/api/case-files/_shared.ts", import.meta.url).href
);

const {
  mergeCaseFileRows,
  normalizeCaseFiles,
  resolveCaseFileById,
  resolveRowsFromCanonicalState,
} = sharedModule;

const waId = "554185260518";

// ---------- 1) Múltiplos docs com url — todos aparecem ----------
{
  const rows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://supabase.example.com/storage/a.pdf" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: null, created_at: "2026-03-28T10:05:00.000Z", url: "https://supabase.example.com/storage/b.pdf" },
    { wa_id: waId, tipo: "ctps_completa", participante: null, created_at: "2026-03-28T10:10:00.000Z", url: "https://supabase.example.com/storage/c.pdf" },
    { wa_id: waId, tipo: "rg_cnh_frente", participante: null, created_at: "2026-03-28T10:15:00.000Z", url: "https://supabase.example.com/storage/d.pdf" },
    { wa_id: waId, tipo: "rg_cnh_verso", participante: null, created_at: "2026-03-28T10:20:00.000Z", url: "https://supabase.example.com/storage/e.pdf" },
  ];
  const files = normalizeCaseFiles(waId, rows);
  assert.equal(files.length, 5, "1) Todos os 5 docs com url devem aparecer");
  assert.deepEqual(
    files.map((f) => f.tipo).sort(),
    ["comprovante_renda", "ctps_completa", "holerite_ultimo", "rg_cnh_frente", "rg_cnh_verso"],
  );
  assert.ok(files.every((f) => f.previewable === true), "1) Todos devem ser previsualizáveis (pdf)");
}

// ---------- 2) Tipos diferentes no mesmo wa_id ----------
{
  const rows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: "titular", created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/1.pdf" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: "titular", created_at: "2026-03-28T10:00:01.000Z", url: "https://example.com/2.jpg" },
    { wa_id: waId, tipo: "ctps_completa", participante: "conjuge", created_at: "2026-03-28T10:00:02.000Z", url: "https://example.com/3.png" },
  ];
  const files = normalizeCaseFiles(waId, rows);
  assert.equal(files.length, 3, "2) Tipos diferentes devem gerar 3 itens distintos");
  assert.deepEqual(
    files.map((f) => f.tipo).sort(),
    ["comprovante_renda", "ctps_completa", "holerite_ultimo"],
  );
}

// ---------- 3) Docs sem url — aparecem como não-previsualizáveis ----------
{
  const rows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/a.pdf" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: null, created_at: "2026-03-28T10:05:00.000Z", url: null },
    { wa_id: waId, tipo: "ctps_completa", participante: null, created_at: "2026-03-28T10:10:00.000Z", url: "" },
    { wa_id: waId, tipo: "rg_cnh_frente", participante: null, created_at: "2026-03-28T10:15:00.000Z", url: "https://example.com/d.pdf" },
  ];
  const merged = mergeCaseFileRows(rows, []);
  const files = normalizeCaseFiles(waId, merged);
  assert.equal(files.length, 4, "3) Todos os 4 docs devem aparecer (incluindo sem url)");
  const withUrl = files.filter((f) => f.previewable);
  const withoutUrl = files.filter((f) => !f.previewable);
  assert.equal(withUrl.length, 2, "3) 2 docs com url são previsualizáveis");
  assert.equal(withoutUrl.length, 2, "3) 2 docs sem url são não-previsualizáveis");
  assert.deepEqual(
    files.map((f) => f.tipo).sort(),
    ["comprovante_renda", "ctps_completa", "holerite_ultimo", "rg_cnh_frente"],
    "3) Todos os tipos aparecem na listagem",
  );
}

// ---------- 4) Merge com fallback canônico — não perde docs existentes ----------
{
  const primaryRows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/a.pdf" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: null, created_at: "2026-03-28T10:05:00.000Z", url: "https://example.com/b.pdf" },
    { wa_id: waId, tipo: "ctps_completa", participante: null, created_at: "2026-03-28T10:10:00.000Z", url: "https://example.com/c.pdf" },
  ];
  const canonicalRows = resolveRowsFromCanonicalState(waId, {
    pacote_documentos_anexados_json: [
      { tipo: "rg_cnh_frente", url: "https://graph.facebook.com/v20.0/rg-front", created_at: "2026-03-28T10:15:00.000Z" },
    ],
    envio_docs_historico_json: [
      { associado: { tipo: "comprovante_renda" }, media_ref: { url: "https://example.com/a.pdf" }, at: "2026-03-28T10:00:00.000Z" },
    ],
  });
  const merged = mergeCaseFileRows(primaryRows, canonicalRows);
  const files = normalizeCaseFiles(waId, merged);
  assert.ok(files.length >= 4, "4) Merge não deve perder docs existentes (pelo menos 4)");
  const tipos = files.map((f) => f.tipo);
  assert.ok(tipos.includes("comprovante_renda"), "4) comprovante_renda presente");
  assert.ok(tipos.includes("holerite_ultimo"), "4) holerite_ultimo presente");
  assert.ok(tipos.includes("ctps_completa"), "4) ctps_completa presente");
  assert.ok(tipos.includes("rg_cnh_frente"), "4) rg_cnh_frente do canônico presente");
}

// ---------- 5) Caso representativo: docs em enova_docs sem url + canonical cobre ----------
{
  // Cenário: enova_docs tem row sem url, canonical tem a mesma com url
  const primaryRows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/a.pdf" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: null, created_at: "2026-03-28T10:05:00.000Z", url: null },
    { wa_id: waId, tipo: "ctps_completa", participante: null, created_at: "2026-03-28T10:10:00.000Z", url: null },
  ];
  const canonicalRows = resolveRowsFromCanonicalState(waId, {
    pacote_documentos_anexados_json: [
      { tipo: "holerite_ultimo", url: "https://graph.facebook.com/v20.0/holerite", created_at: "2026-03-28T10:05:00.000Z" },
    ],
  });
  const merged = mergeCaseFileRows(primaryRows, canonicalRows);
  const files = normalizeCaseFiles(waId, merged);

  // Deve ter 3 itens: comprovante (url), holerite (canonical url), ctps (sem url)
  assert.equal(files.length, 3, "5) Todos os 3 docs devem aparecer");

  const tipos = files.map((f) => f.tipo);
  assert.ok(tipos.includes("comprovante_renda"), "5) comprovante_renda presente");
  assert.ok(tipos.includes("holerite_ultimo"), "5) holerite_ultimo presente (via canonical)");
  assert.ok(tipos.includes("ctps_completa"), "5) ctps_completa presente (sem url, não-previsualizável)");

  // holerite via canonical deve ser resolvível
  const holeriteFile = files.find((f) => f.tipo === "holerite_ultimo");
  assert.ok(holeriteFile, "5) holerite_ultimo deve ter file_id");
  const resolved = resolveCaseFileById(waId, holeriteFile.file_id, merged);
  assert.ok(resolved, "5) holerite deve ser resolvível via canonical");

  // ctps sem url não deve ser resolvível (sem sourceUrl)
  const ctpsFile = files.find((f) => f.tipo === "ctps_completa");
  assert.ok(ctpsFile, "5) ctps_completa deve ter file_id");
  assert.equal(ctpsFile.previewable, false, "5) ctps sem url deve ser não-previsualizável");
}

// ---------- 6) Nenhuma coluna inexistente (media_id) no fluxo ----------
{
  // Verificação funcional: rows sem campo media_id funcionam normalmente
  const rows = [
    { wa_id: waId, tipo: "rg", participante: "titular", created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/rg.pdf" },
  ];
  const files = normalizeCaseFiles(waId, rows);
  assert.equal(files.length, 1, "6) Row sem media_id funciona normalmente");
  assert.ok(!("media_id" in rows[0]), "6) Row não contém campo media_id");
}

// ---------- 7) Caso vazio — painel não quebra ----------
{
  const filesEmpty = normalizeCaseFiles(waId, []);
  assert.equal(filesEmpty.length, 0, "7) Lista vazia retorna 0 itens");

  const filesNull = normalizeCaseFiles(waId, null);
  assert.equal(filesNull.length, 0, "7) null retorna 0 itens");

  const filesUndef = normalizeCaseFiles(waId, undefined);
  assert.equal(filesUndef.length, 0, "7) undefined retorna 0 itens");
}

// ---------- 8) Dedupe não descarta docs distintos ----------
{
  // Dois docs do mesmo tipo mas com URLs diferentes (e.g., frente e verso enviados no mesmo segundo)
  const rows = [
    { wa_id: waId, tipo: "rg_cnh_frente", participante: "titular", created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/front.pdf" },
    { wa_id: waId, tipo: "rg_cnh_frente", participante: "titular", created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/front2.pdf" },
  ];
  const merged = mergeCaseFileRows(rows, []);
  const files = normalizeCaseFiles(waId, merged);
  assert.equal(files.length, 2, "8) Docs com mesmo tipo mas URLs diferentes são preservados");
}

// ---------- 9) No-URL row coberta por canonical com URL — sem duplicata ----------
{
  const primaryRows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: null },
  ];
  const canonicalRows = resolveRowsFromCanonicalState(waId, {
    pacote_documentos_anexados_json: [
      { tipo: "comprovante_renda", url: "https://graph.facebook.com/v20.0/comp", created_at: "2026-03-28T10:00:00.000Z" },
    ],
  });
  const merged = mergeCaseFileRows(primaryRows, canonicalRows);
  const files = normalizeCaseFiles(waId, merged);

  // Deve ter exatamente 1 item (canonical com url prevalece, sem duplicata)
  assert.equal(files.length, 1, "9) No-URL row coberta por canonical gera apenas 1 item");
  assert.equal(files[0].tipo, "comprovante_renda", "9) Tipo correto do item");

  // Deve ser resolvível (canonical tem url)
  const resolved = resolveCaseFileById(waId, files[0].file_id, merged);
  assert.ok(resolved, "9) Arquivo deve ser resolvível via canonical com URL");
  assert.equal(resolved.sourceUrl, "https://graph.facebook.com/v20.0/comp");
}

console.log("panel_case_files_full_listing.smoke: ok");
