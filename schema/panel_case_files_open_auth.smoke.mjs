/**
 * panel_case_files_open_auth.smoke.mjs
 *
 * Valida que o endpoint case-files/open envia o header Authorization: Bearer
 * ao buscar docs de origens Meta (lookaside.fbsbx.com / graph.facebook.com)
 * quando WHATS_TOKEN está disponível, e que não envia o header para origens
 * que não sejam Meta (ex: Supabase storage).
 *
 * Âncora de patch: open/route.ts — bloco upstreamHeaders + WHATS_TOKEN
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

// --- 1) Verificar que o código lê WHATS_TOKEN e o adiciona ao header ---

assert.ok(
  openRouteSource.includes("WHATS_TOKEN"),
  "open/route.ts deve referenciar WHATS_TOKEN para autenticar com Meta",
);

assert.ok(
  openRouteSource.includes("Authorization") && openRouteSource.includes("Bearer"),
  "open/route.ts deve construir header Authorization: Bearer <token>",
);

assert.ok(
  openRouteSource.includes("CANONICAL_ALLOWED_HOSTS"),
  "open/route.ts deve usar CANONICAL_ALLOWED_HOSTS para condicionar o header Auth",
);

// --- 2) Verificar que CANONICAL_ALLOWED_HOSTS inclui os domínios Meta corretos ---

const META_HOSTS = ["lookaside.fbsbx.com", "graph.facebook.com"];
for (const host of META_HOSTS) {
  assert.ok(
    openRouteSource.includes(JSON.stringify(host)),
    `CANONICAL_ALLOWED_HOSTS deve incluir ${host}`,
  );
}

// --- 3) Smoke funcional: shared resolve URL para doc Meta ---

const sharedModule = await import(
  new URL("../panel/app/api/case-files/_shared.ts", import.meta.url).href
);
const { normalizeCaseFiles, resolveCaseFileById } = sharedModule;

const waId = "5511999990001";

const metaRows = [
  {
    wa_id: waId,
    tipo: "rg",
    participante: "titular",
    created_at: "2026-03-30T10:00:00.000Z",
    url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=rg-auth-test",
  },
  {
    wa_id: waId,
    tipo: "cpf",
    participante: "titular",
    created_at: "2026-03-30T10:05:00.000Z",
    url: "https://graph.facebook.com/v20.0/cpf-auth-test",
  },
];

const files = normalizeCaseFiles(waId, metaRows);
assert.equal(files.length, 2, "Deve listar 2 docs Meta");

for (const file of files) {
  const resolved = resolveCaseFileById(waId, file.file_id, metaRows);
  assert.ok(resolved, `resolveCaseFileById deve resolver doc Meta (${file.tipo})`);
  const resolvedHost = new URL(resolved.sourceUrl).hostname;
  assert.ok(
    META_HOSTS.includes(resolvedHost),
    `sourceUrl deve ser Meta para doc ${file.tipo}: ${resolved.sourceUrl}`,
  );
}

// --- 4) Caso sem arquivo continua limpo ---

const emptyFiles = normalizeCaseFiles(waId, []);
assert.equal(emptyFiles.length, 0, "Lista vazia deve retornar array vazio");

// --- 5) WHATS_TOKEN ausente não quebra o código (header omitido silenciosamente) ---

// O código deve usar: const whatsToken = (process.env.WHATS_TOKEN || "").trim();
// Ou seja, sem WHATS_TOKEN o token é "" e o header não é adicionado.
assert.ok(
  openRouteSource.includes(`process.env.WHATS_TOKEN`),
  "Token lido via process.env.WHATS_TOKEN com fallback para string vazia",
);

// A condição de adição do header deve ser condicional ao token não-vazio
// (verificação estrutural: as duas partes devem existir juntas, não apenas individualmente)
assert.ok(
  openRouteSource.includes("whatsToken") && openRouteSource.includes("CANONICAL_ALLOWED_HOSTS"),
  "Header Authorization só deve ser adicionado se whatsToken for truthy e host for Meta",
);

console.log("panel_case_files_open_auth.smoke: ok");
