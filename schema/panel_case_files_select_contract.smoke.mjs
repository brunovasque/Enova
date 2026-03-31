/**
 * panel_case_files_select_contract.smoke.mjs
 *
 * Valida que o contrato de SELECT dos endpoints case-files e case-files/open
 * usa apenas a coluna canônica `url` da tabela enova_docs — sem `document_url`,
 * `download_url`, `media_url` ou `link`, que não existem no schema real.
 *
 * Contexto: o erro "column enova_docs.document_url does not exist" (status 400)
 * causava falha em `failed to load files` no painel. A correção remove essas
 * colunas inexistentes do SELECT.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const routeSource = await readFile(
  path.join(__dirname, "../panel/app/api/case-files/route.ts"),
  "utf8",
);

const openRouteSource = await readFile(
  path.join(__dirname, "../panel/app/api/case-files/open/route.ts"),
  "utf8",
);

// --- 1) Verificar que as colunas inexistentes foram removidas do SELECT ---

const FORBIDDEN_COLUMNS = ["document_url", "download_url", "media_url", "link"];

for (const col of FORBIDDEN_COLUMNS) {
  // A coluna NÃO deve aparecer dentro de uma string de SELECT para enova_docs.
  // Filtramos comentários e falsos positivos no fallback endpoint (enova_state).
  const enova_docs_select_re = /searchParams\.set\(\s*["']select["']\s*,\s*["']([^"']+)["']\s*\)/g;

  let match;
  while ((match = enova_docs_select_re.exec(routeSource)) !== null) {
    const selectValue = match[1];
    if (selectValue.includes("pacote_documentos") || selectValue.includes("envio_docs_historico")) {
      continue; // Este é o fallback para enova_state, não enova_docs
    }
    assert.ok(
      !selectValue.includes(col),
      `route.ts: enova_docs SELECT não deve conter a coluna inexistente "${col}". ` +
        `SELECT encontrado: "${selectValue}"`,
    );
  }

  const openSelectRe = /searchParams\.set\(\s*["']select["']\s*,\s*["']([^"']+)["']\s*\)/g;
  while ((match = openSelectRe.exec(openRouteSource)) !== null) {
    const selectValue = match[1];
    if (selectValue.includes("pacote_documentos") || selectValue.includes("envio_docs_historico")) {
      continue;
    }
    assert.ok(
      !selectValue.includes(col),
      `open/route.ts: enova_docs SELECT não deve conter a coluna inexistente "${col}". ` +
        `SELECT encontrado: "${selectValue}"`,
    );
  }
}

// Verificação direta no texto dos arquivos, para garantia extra
for (const col of FORBIDDEN_COLUMNS) {
  const routeSelectLine = routeSource.match(
    /searchParams\.set\(\s*["']select["']\s*,\s*["']wa_id[^"']*["']\s*\)/,
  );
  if (routeSelectLine) {
    assert.ok(
      !routeSelectLine[0].includes(col),
      `route.ts: SELECT primário de enova_docs contém coluna inexistente: "${col}"`,
    );
  }

  const openSelectLine = openRouteSource.match(
    /searchParams\.set\(\s*["']select["']\s*,\s*["']wa_id[^"']*["']\s*\)/,
  );
  if (openSelectLine) {
    assert.ok(
      !openSelectLine[0].includes(col),
      `open/route.ts: SELECT primário de enova_docs contém coluna inexistente: "${col}"`,
    );
  }
}

// --- 2) Verificar que `url` e `media_id` estão no SELECT (colunas canônicas reais) ---

assert.match(
  routeSource,
  /searchParams\.set\(\s*["']select["']\s*,\s*["'][^"']*\burl\b[^"']*["']\s*\)/,
  "route.ts: SELECT deve conter a coluna canônica `url`",
);

assert.match(
  openRouteSource,
  /searchParams\.set\(\s*["']select["']\s*,\s*["'][^"']*\burl\b[^"']*["']\s*\)/,
  "open/route.ts: SELECT deve conter a coluna canônica `url`",
);

assert.match(
  routeSource,
  /searchParams\.set\(\s*["']select["']\s*,\s*["'][^"']*\bmedia_id\b[^"']*["']\s*\)/,
  "route.ts: SELECT deve conter `media_id` para fallback de URL",
);

assert.match(
  openRouteSource,
  /searchParams\.set\(\s*["']select["']\s*,\s*["'][^"']*\bmedia_id\b[^"']*["']\s*\)/,
  "open/route.ts: SELECT deve conter `media_id` para fallback de URL",
);

// --- 3) Smoke funcional: _shared normaliza corretamente com rows que têm apenas `url` ---

const sharedModule = await import(
  new URL("../panel/app/api/case-files/_shared.ts", import.meta.url).href
);
const { normalizeCaseFiles, resolveCaseFileById, mergeCaseFileRows, resolveRowsFromCanonicalState } =
  sharedModule;

const waId = "5511999990000";

// Simula o shape exacto que virá do Supabase após o patch (só `url`, sem colunas extras)
const dbRows = [
  {
    wa_id: waId,
    tipo: "rg",
    participante: "titular",
    created_at: "2026-03-30T10:00:00.000Z",
    url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-abc",
  },
  {
    wa_id: waId,
    tipo: "cpf",
    participante: "titular",
    created_at: "2026-03-30T10:05:00.000Z",
    url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=cpf-def",
  },
];

// 3a) Caso com arquivos — lista normalmente
const files = normalizeCaseFiles(waId, dbRows);
assert.equal(files.length, 2, "Deve retornar 2 arquivos quando há 2 rows");
assert.deepEqual(
  files.map((f) => f.tipo).sort(),
  ["cpf", "rg"],
);
assert.ok(files.every((f) => f.file_id), "Todos os arquivos devem ter file_id");
assert.ok(files.every((f) => f.wa_id === waId), "Todos os arquivos devem ter wa_id correto");

// 3b) Resolução de arquivo por ID deve funcionar com rows url-only
const rgFile = files.find((f) => f.tipo === "rg");
assert.ok(rgFile, "Deve encontrar arquivo de tipo rg");
const resolved = resolveCaseFileById(waId, rgFile.file_id, dbRows);
assert.ok(resolved, "resolveCaseFileById deve resolver arquivo url-only");
assert.equal(
  resolved.sourceUrl,
  "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-abc",
);

// 3c) Caso sem arquivos — painel não quebra
const emptyFiles = normalizeCaseFiles(waId, []);
assert.equal(emptyFiles.length, 0, "Lista vazia deve retornar array vazio sem erro");

// 3d) Rows sem url válida NÃO são mais ignoradas — passam com has_link=false para que
//     o painel possa refletir TODOS os documentos persistidos em enova_docs, inclusive
//     os que foram salvos sem URL (ex: processIncomingDocument sem file.url).
const rowsWithoutUrl = [
  { wa_id: waId, tipo: "rg", participante: "titular", created_at: "2026-03-30T10:00:00.000Z", url: "" },
  { wa_id: waId, tipo: "cpf", participante: null, created_at: null, url: null },
];
const filesFromEmpty = normalizeCaseFiles(waId, rowsWithoutUrl);
assert.equal(filesFromEmpty.length, 2, "Rows sem url devem aparecer no painel com has_link=false, não ser ignoradas");
assert.ok(filesFromEmpty.every((f) => f.has_link === false), "Todos os arquivos sem url devem ter has_link=false");
assert.ok(filesFromEmpty.every((f) => f.previewable === false), "Arquivos sem url não podem ser previewable");

// 3d-bis) Rows com media_id mas sem url devem aparecer com has_link=true
//         e URL construída via https://graph.facebook.com/v20.0/{media_id}
const rowsWithMediaIdOnly = [
  { wa_id: waId, tipo: "renda", participante: "titular", created_at: "2026-03-30T10:08:00.000Z", url: null, media_id: "mediaid-abc" },
];
const filesFromMediaId = normalizeCaseFiles(waId, rowsWithMediaIdOnly);
assert.equal(filesFromMediaId.length, 1, "Row com media_id mas sem url deve aparecer no painel");
assert.ok(filesFromMediaId[0].has_link === true, "Row com media_id deve ter has_link=true");
assert.ok(filesFromMediaId[0].file_id, "Row com media_id deve ter file_id válido");

// 3e) Merge com canonical rows (fallback de enova_state) continua funcionando
const canonicalRows = resolveRowsFromCanonicalState(waId, {
  pacote_documentos_anexados_json: [
    {
      tipo: "ctps",
      participante: "titular",
      url: "https://graph.facebook.com/v20.0/ctps-xyz",
      created_at: "2026-03-30T10:10:00.000Z",
    },
  ],
});
const mergedRows = mergeCaseFileRows(dbRows, canonicalRows);
const mergedFiles = normalizeCaseFiles(waId, mergedRows);
assert.equal(mergedFiles.length, 3, "Merge db + canonical deve resultar em 3 arquivos únicos");

// 3f) Caminho antigo (document_url) não deve mais aparecer no SELECT do enova_docs
// (já validado acima, mas reafirmamos explicitamente)
assert.ok(
  !routeSource.includes(
    `"wa_id,tipo,participante,created_at,url,document_url,download_url,media_url,link"`,
  ),
  "SELECT antigo com document_url não deve mais existir em route.ts",
);
assert.ok(
  !openRouteSource.includes(
    `"wa_id,tipo,participante,created_at,url,document_url,download_url,media_url,link"`,
  ),
  "SELECT antigo com document_url não deve mais existir em open/route.ts",
);

console.log("panel_case_files_select_contract.smoke: ok");
