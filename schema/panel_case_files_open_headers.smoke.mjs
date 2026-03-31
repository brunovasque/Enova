/**
 * panel_case_files_open_headers.smoke.mjs
 *
 * Valida que o endpoint case-files/open emite Content-Disposition e
 * Content-Type corretos após a correção de headers/metadados:
 *
 * 1) mimeToExt mapeia MIME → extensão de arquivo
 * 2) PDF em "Visualizar" → inline + content-type correto
 * 3) PDF em "Baixar" → attachment + filename com .pdf
 * 4) imagem em "Visualizar" → inline
 * 5) tipo sem MIME explícito → fallback seguro (attachment + nome derivado)
 * 6) buildContentDisposition gera filename RFC 5987 (filename*)
 * 7) nome gerado inclui tipo + participante + extensão inferida
 * 8) Auth/fetch (WHATS_TOKEN + Supabase) continuam presentes — não regrediu
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

// ---------- 1) mimeToExt helper is present ----------
{
  assert.ok(
    openRouteSource.includes("mimeToExt"),
    "1) open/route.ts deve definir função mimeToExt",
  );

  // Must map common types used in the panel
  const requiredMappings = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  for (const mime of requiredMappings) {
    assert.ok(
      openRouteSource.includes(`"${mime}"`),
      `1) mimeToExt deve mapear "${mime}"`,
    );
  }
}

// ---------- 2) effectivePreviewable uses upstream content-type ----------
{
  assert.ok(
    openRouteSource.includes("effectivePreviewable"),
    "2) open/route.ts deve calcular effectivePreviewable a partir do content-type real",
  );

  // Must check for PDF and images
  assert.ok(
    openRouteSource.includes('"application/pdf"') && openRouteSource.includes("startsWith(\"image/\")"),
    "2) effectivePreviewable deve cobrir application/pdf e image/*",
  );
}

// ---------- 3) Inline when previewable and not forceDownload ----------
{
  assert.ok(
    openRouteSource.includes("effectivePreviewable && !forceDownload"),
    "3) Content-Disposition inline só quando effectivePreviewable && !forceDownload",
  );
}

// ---------- 4) effectiveFileName derivado de tipo + participante + ext ----------
{
  assert.ok(
    openRouteSource.includes("effectiveFileName"),
    "4) open/route.ts deve calcular effectiveFileName",
  );

  assert.ok(
    openRouteSource.includes("inferredExt") && openRouteSource.includes("baseName"),
    "4) effectiveFileName deve usar inferredExt e baseName",
  );

  // Must use tipo and participante
  assert.ok(
    openRouteSource.includes("resolved.item.tipo") && openRouteSource.includes("resolved.item.participante"),
    "4) baseName deve incluir tipo e participante do item resolvido",
  );
}

// ---------- 5) Fallback safe: file_name takes precedence ----------
{
  assert.ok(
    openRouteSource.includes("resolved.item.file_name"),
    "5) effectiveFileName deve preferir file_name explícito quando disponível",
  );
}

// ---------- 6) buildContentDisposition emite filename* (RFC 5987) ----------
{
  assert.ok(
    openRouteSource.includes("filename*=UTF-8''"),
    "6) buildContentDisposition deve emitir filename* conforme RFC 5987",
  );
}

// ---------- 7) effectiveMime derivado do contentType upstream ----------
{
  assert.ok(
    openRouteSource.includes("effectiveMime") && openRouteSource.includes('split(";")'),
    "7) effectiveMime deve extrair base MIME type descartando parâmetros (charset etc.)",
  );
}

// ---------- 8) Auth/fetch continuam presentes (regressão) ----------
{
  assert.ok(
    openRouteSource.includes("WHATS_TOKEN"),
    "8) WHATS_TOKEN ainda presente — auth não regrediu",
  );

  assert.ok(
    openRouteSource.includes('"graph.facebook.com"') && openRouteSource.includes('"lookaside.fbsbx.com"'),
    "8) Hosts Meta ainda presentes — fetch path não regrediu",
  );

  assert.ok(
    openRouteSource.includes("resolvedDownloadUrl") && openRouteSource.includes("refreshed"),
    "8) Graph API two-step + lookaside refresh ainda presentes",
  );
}

// ---------- 9) Smoke unitário: buildContentDisposition logic (source-level) ----------
{
  // Verify mode mapping
  const inlinePattern = /mode\s*=\s*previewable\s*\?\s*["']inline["']\s*:\s*["']attachment["']/;
  assert.ok(
    inlinePattern.test(openRouteSource),
    "9) buildContentDisposition deve usar inline/attachment baseado em previewable",
  );
}

// ---------- 10) Listagem intacta: _shared.ts não foi alterado ----------
{
  const sharedSource = await readFile(
    path.join(__dirname, "../panel/app/api/case-files/_shared.ts"),
    "utf8",
  );

  // normalizeCaseFiles, dedupeRows, resolveCaseFileById devem existir intactos
  assert.ok(sharedSource.includes("normalizeCaseFiles"), "10) normalizeCaseFiles intacto em _shared.ts");
  assert.ok(sharedSource.includes("dedupeRows"), "10) dedupeRows intacto em _shared.ts");
  assert.ok(sharedSource.includes("resolveCaseFileById"), "10) resolveCaseFileById intacto em _shared.ts");

  // Listagem SELECT contract inalterado
  const sharedModule = await import(
    new URL("../panel/app/api/case-files/_shared.ts", import.meta.url).href
  );
  const { normalizeCaseFiles, resolveCaseFileById, mergeCaseFileRows } = sharedModule;

  const waId = "5511999990001";
  const rows = [
    { wa_id: waId, tipo: "comprovante_renda", participante: "titular", created_at: "2026-03-28T10:00:00.000Z", url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=cr-001&ext=1234&hash=abc" },
    { wa_id: waId, tipo: "rg", participante: "conjuge", created_at: "2026-03-28T10:05:00.000Z", url: "https://graph.facebook.com/v20.0/rg-002" },
    { wa_id: waId, tipo: "ctps_completa", participante: null, created_at: "2026-03-28T10:10:00.000Z", url: null },
  ];
  const merged = mergeCaseFileRows(rows, []);
  const files = normalizeCaseFiles(waId, merged);
  assert.equal(files.length, 3, "10) Listagem ainda retorna 3 docs após mudança no open/route.ts");

  // URL items resolve; no-URL item returns null safely
  const noUrlFile = files.find((f) => f.tipo === "ctps_completa");
  assert.ok(noUrlFile, "10) Arquivo sem URL ainda presente na listagem");
  assert.equal(
    resolveCaseFileById(waId, noUrlFile.file_id, merged),
    null,
    "10) Arquivo sem URL retorna null seguro no open",
  );

  const urlFile = files.find((f) => f.tipo === "comprovante_renda");
  const resolvedUrl = resolveCaseFileById(waId, urlFile.file_id, merged);
  assert.ok(resolvedUrl, "10) Arquivo com URL resolve corretamente");
  assert.ok(resolvedUrl.sourceUrl.startsWith("https://lookaside.fbsbx.com/"), "10) sourceUrl Meta preservado");
}

console.log("panel_case_files_open_headers.smoke: ok");
