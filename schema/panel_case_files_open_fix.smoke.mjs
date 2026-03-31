/**
 * panel_case_files_open_fix.smoke.mjs
 *
 * Valida que o endpoint case-files/open:
 * 1) Resolve corretamente docs listados pelo painel (file_id match)
 * 2) Adiciona auth Supabase para URLs do host Supabase
 * 3) Tem fallback Meta (Graph API refresh) para URLs lookaside expiradas
 * 4) Não usa colunas inexistentes (media_id no SELECT)
 * 5) Preserva listagem sem alterações
 * 6) Itens sem link continuam seguros (não explode)
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openRouteSource = await readFile(
  path.join(__dirname, "../panel/app/api/case-files/open/route.ts"),
  "utf8",
);

const sharedModule = await import(
  new URL("../panel/app/api/case-files/_shared.ts", import.meta.url).href
);
const {
  normalizeCaseFiles,
  resolveCaseFileById,
  mergeCaseFileRows,
  resolveRowsFromCanonicalState,
} = sharedModule;

const waId = "554185260518";

// ---------- 1) file_id from listing matches open resolution ----------
{
  const rows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=cr-123&ext=1234&hash=abc" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: null, created_at: "2026-03-28T10:05:00.000Z", url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=ho-456&ext=5678&hash=def" },
    { wa_id: waId, tipo: "ctps_completa", participante: null, created_at: "2026-03-28T10:10:00.000Z", url: "https://graph.facebook.com/v20.0/ctps-789" },
  ];

  const merged = mergeCaseFileRows(rows, []);
  const files = normalizeCaseFiles(waId, merged);
  assert.equal(files.length, 3, "1) Listagem mostra 3 docs");

  // Every listed file can be resolved by open
  for (const file of files) {
    const resolved = resolveCaseFileById(waId, file.file_id, merged);
    assert.ok(resolved, `1) file_id ${file.file_id} (${file.tipo}) deve ser resolvível pelo open`);
    assert.ok(resolved.sourceUrl, `1) sourceUrl deve existir para ${file.tipo}`);
  }
}

// ---------- 2) Supabase auth present in open/route.ts ----------
{
  // The open endpoint should add apikey + Authorization for Supabase-origin URLs
  assert.ok(
    openRouteSource.includes("apikey") && openRouteSource.includes("serviceRoleKey"),
    "2) open/route.ts deve adicionar apikey para URLs Supabase",
  );

  // Supabase host comparison present
  assert.ok(
    openRouteSource.includes("supabaseHostname") || openRouteSource.includes("supabaseHost"),
    "2) open/route.ts deve comparar host Supabase para decidir auth",
  );
}

// ---------- 3) Meta Graph API refresh fallback present ----------
{
  // Verify the Graph API refresh pattern exists
  assert.ok(
    openRouteSource.includes("graph.facebook.com/v20.0/"),
    "3) open/route.ts deve ter fallback via Graph API para URLs Meta expiradas",
  );

  // Verify mid parameter extraction
  assert.ok(
    openRouteSource.includes('"mid"') || openRouteSource.includes("'mid'"),
    "3) open/route.ts deve extrair media_id do parâmetro 'mid' da URL",
  );

  // Verify the refreshed URL is validated
  assert.ok(
    openRouteSource.includes("isAllowedFileOrigin") && openRouteSource.includes("refreshed"),
    "3) open/route.ts deve validar a URL refreshed antes de usar",
  );
}

// ---------- 4) No nonexistent columns in SELECT ----------
{
  const FORBIDDEN_COLUMNS = ["document_url", "download_url", "media_url", "link", "media_id"];
  const selectRe = /searchParams\.set\(\s*["']select["']\s*,\s*["']([^"']+)["']\s*\)/g;

  let match;
  while ((match = selectRe.exec(openRouteSource)) !== null) {
    const selectValue = match[1];
    if (selectValue.includes("pacote_documentos") || selectValue.includes("envio_docs_historico")) {
      continue; // fallback for enova_state, not enova_docs
    }
    for (const col of FORBIDDEN_COLUMNS) {
      assert.ok(
        !selectValue.includes(col),
        `4) SELECT em open/route.ts não deve conter coluna inexistente "${col}": "${selectValue}"`,
      );
    }
  }
}

// ---------- 5) Listing is preserved ----------
{
  // Full listing with mixed URL/no-URL rows still works
  const rows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/a.pdf" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: null, created_at: "2026-03-28T10:05:00.000Z", url: null },
    { wa_id: waId, tipo: "ctps_completa", participante: null, created_at: "2026-03-28T10:10:00.000Z", url: "https://example.com/c.pdf" },
  ];
  const merged = mergeCaseFileRows(rows, []);
  const files = normalizeCaseFiles(waId, merged);
  assert.equal(files.length, 3, "5) Listagem mostra todos os 3 docs (incluindo sem URL)");
  assert.deepEqual(
    files.map((f) => f.tipo).sort(),
    ["comprovante_renda", "ctps_completa", "holerite_ultimo"],
  );
}

// ---------- 6) No-URL item from listing is safe in open ----------
{
  const rows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://example.com/a.pdf" },
    { wa_id: waId, tipo: "holerite_ultimo", participante: null, created_at: "2026-03-28T10:05:00.000Z", url: null },
  ];
  const merged = mergeCaseFileRows(rows, []);
  const files = normalizeCaseFiles(waId, merged);

  const noUrlFile = files.find((f) => f.tipo === "holerite_ultimo");
  assert.ok(noUrlFile, "6) Arquivo sem URL deve estar na listagem");

  // resolveCaseFileById should return null for no-URL items (safe, not crash)
  const resolved = resolveCaseFileById(waId, noUrlFile.file_id, merged);
  assert.equal(resolved, null, "6) No-URL item retorna null (arquivo não encontrado), sem crash");

  // The URL-item should still resolve correctly
  const urlFile = files.find((f) => f.tipo === "comprovante_renda");
  const resolvedUrl = resolveCaseFileById(waId, urlFile.file_id, merged);
  assert.ok(resolvedUrl, "6) URL-item continua resolvendo normalmente");
  assert.equal(resolvedUrl.sourceUrl, "https://example.com/a.pdf");
}

// ---------- 7) Canonical merge + open resolution ----------
{
  const primaryRows = [
    { wa_id: waId, tipo: "rg", participante: null, created_at: "2026-03-28T10:00:00.000Z", url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-001&ext=1234&hash=abc" },
  ];
  const canonicalRows = resolveRowsFromCanonicalState(waId, {
    pacote_documentos_anexados_json: [
      { tipo: "cpf", url: "https://graph.facebook.com/v20.0/cpf-002", created_at: "2026-03-28T10:05:00.000Z" },
    ],
  });
  const merged = mergeCaseFileRows(primaryRows, canonicalRows);
  const files = normalizeCaseFiles(waId, merged);
  assert.equal(files.length, 2, "7) Merge produz 2 docs");

  for (const file of files) {
    const resolved = resolveCaseFileById(waId, file.file_id, merged);
    assert.ok(resolved, `7) ${file.tipo} resolve no open após merge`);
  }
}

console.log("panel_case_files_open_fix.smoke: ok");
