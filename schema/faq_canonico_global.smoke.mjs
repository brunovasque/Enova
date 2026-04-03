/**
 * faq_canonico_global.smoke.mjs — Smoke tests da Etapa 1: FAQ Canônico Global
 *
 * Cobertura obrigatória:
 *  1. lookup de cada FAQ mínima por chave (10 entradas)
 *  2. nenhuma resposta está vazia
 *  3. nenhuma resposta usa "casa" em vez de "imóvel"
 *  4. nenhuma resposta promete aprovação
 *  5. helper retorna null para chave inexistente
 *  6. nada do mecânico foi tocado (step/runFunnel/nextStage ausentes no catálogo)
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { getCanonicalFAQ, listCanonicalFAQIds } = await import(
  new URL("../cognitive/src/faq-lookup.js", import.meta.url).href
);

const { FAQ_CATALOG } = await import(
  new URL("../cognitive/src/faq-canonico.js", import.meta.url).href
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Grupo 1 — lookup de cada FAQ mínima por chave
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 1: lookup por chave ──");

const REQUIRED_FAQ_IDS = [
  "valor_sem_analise",
  "seguranca_docs",
  "fgts_uso",
  "entrada_minima",
  "prazo_processo",
  "simulacao_plantao",
  "imovel_escolha",
  "aprovacao_garantia",
  "restricao_impede",
  "composicao_obrigatoria"
];

for (const id of REQUIRED_FAQ_IDS) {
  test(`1. lookup "${id}" retorna entrada`, () => {
    const faq = getCanonicalFAQ(id);
    assert.ok(faq !== null, `FAQ "${id}" não encontrada no catálogo`);
    assert.strictEqual(faq.id, id, `id da entrada deve ser "${id}"`);
    assert.ok(typeof faq.pergunta_tipica === "string", "pergunta_tipica deve ser string");
    assert.ok(typeof faq.resposta === "string", "resposta deve ser string");
  });
}

// ---------------------------------------------------------------------------
// Grupo 2 — nenhuma resposta está vazia
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 2: respostas não-vazias ──");

test("2. nenhuma resposta está vazia", () => {
  for (const entry of FAQ_CATALOG) {
    assert.ok(
      entry.resposta && entry.resposta.trim().length >= 10,
      `FAQ "${entry.id}" tem resposta vazia ou muito curta`
    );
  }
});

test("2b. nenhuma pergunta_tipica está vazia", () => {
  for (const entry of FAQ_CATALOG) {
    assert.ok(
      entry.pergunta_tipica && entry.pergunta_tipica.trim().length >= 5,
      `FAQ "${entry.id}" tem pergunta_tipica vazia ou muito curta`
    );
  }
});

// ---------------------------------------------------------------------------
// Grupo 3 — nenhuma resposta usa "casa" em vez de "imóvel"
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 3: sem uso de 'casa' ──");

test('3. nenhuma resposta usa "casa" no lugar de "imóvel"', () => {
  const CASA_PATTERN = /\bcasa\b/i;
  for (const entry of FAQ_CATALOG) {
    assert.ok(
      !CASA_PATTERN.test(entry.resposta),
      `FAQ "${entry.id}" usa "casa" na resposta — deve usar "imóvel"`
    );
  }
});

// ---------------------------------------------------------------------------
// Grupo 4 — nenhuma resposta promete aprovação
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 4: sem promessa de aprovação ──");

const APPROVAL_PROMISE_PATTERNS = [
  /\bvai ser aprovad[oa]\b/i,
  /\bgarant(imos|ido|e)\b/i,
  /\bcom certeza (ser[aá]|fica|vai)\b/i,
  /\bpode ter certeza que\b/i,
  /\b100% aprovad[oa]\b/i
];

test("4. nenhuma resposta promete aprovação", () => {
  for (const entry of FAQ_CATALOG) {
    for (const pattern of APPROVAL_PROMISE_PATTERNS) {
      assert.ok(
        !pattern.test(entry.resposta),
        `FAQ "${entry.id}" promete aprovação (padrão: ${pattern})`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Grupo 5 — helper retorna null para chave inexistente
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 5: chave inexistente ──");

test('5a. getCanonicalFAQ("chave_inexistente") retorna null', () => {
  const result = getCanonicalFAQ("chave_inexistente");
  assert.strictEqual(result, null, "deve retornar null para chave inexistente");
});

test("5b. getCanonicalFAQ(undefined) retorna null", () => {
  const result = getCanonicalFAQ(undefined);
  assert.strictEqual(result, null, "deve retornar null para undefined");
});

test('5c. getCanonicalFAQ("") retorna null', () => {
  const result = getCanonicalFAQ("");
  assert.strictEqual(result, null, "deve retornar null para string vazia");
});

test("5d. getCanonicalFAQ(null) retorna null", () => {
  const result = getCanonicalFAQ(null);
  assert.strictEqual(result, null, "deve retornar null para null");
});

test("5e. listCanonicalFAQIds() contém exatamente os 10 IDs obrigatórios", () => {
  const ids = listCanonicalFAQIds();
  assert.strictEqual(ids.length, REQUIRED_FAQ_IDS.length, `catálogo deve ter ${REQUIRED_FAQ_IDS.length} entradas`);
  for (const id of REQUIRED_FAQ_IDS) {
    assert.ok(ids.includes(id), `id "${id}" deve estar em listCanonicalFAQIds()`);
  }
});

// ---------------------------------------------------------------------------
// Grupo 6 — mecânico intocado (verificação de isolamento de arquivo)
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 6: isolamento do mecânico ──");

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFileText(relPath) {
  return readFileSync(path.resolve(__dirname, relPath), "utf8");
}

test("6a. faq-canonico.js não importa nem referencia step()", () => {
  const src = loadFileText("../cognitive/src/faq-canonico.js");
  assert.ok(!src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "faq-canonico.js não deve tocar no mecânico");
});

test("6b. faq-lookup.js não importa nem referencia step()", () => {
  const src = loadFileText("../cognitive/src/faq-lookup.js");
  assert.ok(!src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "faq-lookup.js não deve tocar no mecânico");
});

test("6c. faq-canonico.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/faq-canonico.js");
  assert.ok(!src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "faq-canonico.js não deve depender de Supabase");
});

test("6d. faq-lookup.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/faq-lookup.js");
  assert.ok(!src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "faq-lookup.js não deve depender de Supabase");
});

test("6e. Enova worker.js não foi modificado pela Etapa 1 (sem import de faq-canonico)", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    !src.includes("faq-canonico") && !src.includes("faq-lookup"),
    "Enova worker.js não deve importar os módulos FAQ da Etapa 1"
  );
});

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------
console.log(`\n── Resultado: ${passed} passed, ${failed} failed ──`);

if (failed > 0) {
  process.exit(1);
}
