/**
 * knowledge_base_etapa4.smoke.mjs — Smoke tests da Etapa 4: Knowledge Base Factual
 *
 * Cobertura obrigatória:
 *  1. lookup de cada item mínimo obrigatório por chave
 *  2. garantia de que nenhum conteúdo está vazio
 *  3. garantia de que nenhum conteúdo usa "casa" em vez de "imóvel"
 *  4. garantia de que nenhum conteúdo promete aprovação
 *  5. helper retorna null/erro controlado para chave inexistente
 *  6. nada do mecânico foi tocado
 *  7. KB tem exatamente os blocos mínimos obrigatórios
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { getKnowledgeBaseItem, listKnowledgeBaseIds } = await import(
  new URL("../cognitive/src/knowledge-lookup.js", import.meta.url).href
);

const { KNOWLEDGE_BASE } = await import(
  new URL("../cognitive/src/knowledge-base.js", import.meta.url).href
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFileText(relPath) {
  return readFileSync(path.resolve(__dirname, relPath), "utf8");
}

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

const REQUIRED_KB_IDS = [
  "elegibilidade_basica",
  "composicao_renda",
  "autonomo_ir",
  "ctps_36",
  "restricao_credito",
  "docs_por_perfil",
  "visita_plantao",
  "correspondente_fluxo",
  "simulacao_aprovacao",
  "fgts_entrada"
];

// ---------------------------------------------------------------------------
// Grupo 1 — lookup de cada item mínimo por chave
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 1: lookup por chave ──");

for (const id of REQUIRED_KB_IDS) {
  test(`1. lookup "${id}" retorna item`, () => {
    const item = getKnowledgeBaseItem(id);
    assert.ok(item !== null, `Item "${id}" não encontrado na knowledge base`);
    assert.strictEqual(item.id, id, `id do item deve ser "${id}"`);
    assert.ok(typeof item.titulo === "string" && item.titulo.length > 0, "titulo deve ser string não-vazia");
    assert.ok(typeof item.conteudo === "string" && item.conteudo.length > 0, "conteudo deve ser string não-vazia");
  });
}

// ---------------------------------------------------------------------------
// Grupo 2 — nenhum conteúdo está vazio
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 2: conteúdo não-vazio ──");

test("2a. nenhum conteudo está vazio ou muito curto", () => {
  for (const item of KNOWLEDGE_BASE) {
    assert.ok(
      item.conteudo && item.conteudo.trim().length >= 20,
      `Item "${item.id}" tem conteudo vazio ou muito curto`
    );
  }
});

test("2b. nenhum titulo está vazio", () => {
  for (const item of KNOWLEDGE_BASE) {
    assert.ok(
      item.titulo && item.titulo.trim().length >= 3,
      `Item "${item.id}" tem titulo vazio ou muito curto`
    );
  }
});

// ---------------------------------------------------------------------------
// Grupo 3 — nenhum conteúdo usa "casa" em vez de "imóvel"
// ---------------------------------------------------------------------------
console.log('\n── GRUPO 3: sem uso de "casa" ──');

const CASA_PATTERN = /\bcasa\b/i;

test('3a. nenhum conteudo usa "casa" no lugar de "imóvel"', () => {
  for (const item of KNOWLEDGE_BASE) {
    assert.ok(
      !CASA_PATTERN.test(item.conteudo),
      `Item "${item.id}" usa "casa" no conteudo — deve usar "imóvel"`
    );
  }
});

test('3b. nenhum titulo usa "casa" no lugar de "imóvel"', () => {
  for (const item of KNOWLEDGE_BASE) {
    assert.ok(
      !CASA_PATTERN.test(item.titulo),
      `Item "${item.id}" usa "casa" no titulo — deve usar "imóvel"`
    );
  }
});

// ---------------------------------------------------------------------------
// Grupo 4 — nenhum conteúdo promete aprovação
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 4: sem promessa de aprovação ──");

const APPROVAL_PROMISE_PATTERNS = [
  /\bvai ser aprovad[oa]\b/i,
  /\bgarant(imos|ido|e)\b/i,
  /\bcom certeza (ser[aá]|fica|vai)\b/i,
  /\bpode ter certeza que\b/i,
  /\b100% aprovad[oa]\b/i,
  /\bser[aá] aprovad[oa]\b/i
];

test("4a. nenhum conteudo promete aprovação", () => {
  for (const item of KNOWLEDGE_BASE) {
    for (const pattern of APPROVAL_PROMISE_PATTERNS) {
      assert.ok(
        !pattern.test(item.conteudo),
        `Item "${item.id}" promete aprovação no conteudo (padrão: ${pattern})`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Grupo 5 — helper retorna null para chave inexistente
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 5: chave inexistente ──");

test('5a. getKnowledgeBaseItem("chave_inexistente") retorna null', () => {
  const result = getKnowledgeBaseItem("chave_inexistente");
  assert.strictEqual(result, null, "deve retornar null para chave inexistente");
});

test("5b. getKnowledgeBaseItem(undefined) retorna null", () => {
  const result = getKnowledgeBaseItem(undefined);
  assert.strictEqual(result, null, "deve retornar null para undefined");
});

test('5c. getKnowledgeBaseItem("") retorna null', () => {
  const result = getKnowledgeBaseItem("");
  assert.strictEqual(result, null, "deve retornar null para string vazia");
});

test("5d. getKnowledgeBaseItem(null) retorna null", () => {
  const result = getKnowledgeBaseItem(null);
  assert.strictEqual(result, null, "deve retornar null para null");
});

test("5e. getKnowledgeBaseItem(42) retorna null", () => {
  const result = getKnowledgeBaseItem(42);
  assert.strictEqual(result, null, "deve retornar null para tipo não-string");
});

// ---------------------------------------------------------------------------
// Grupo 6 — nada do mecânico foi tocado
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 6: isolamento do mecânico ──");

test("6a. knowledge-base.js não referencia step()/runFunnel/nextStage", () => {
  const src = loadFileText("../cognitive/src/knowledge-base.js");
  assert.ok(
    !src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "knowledge-base.js não deve tocar no mecânico"
  );
});

test("6b. knowledge-lookup.js não referencia step()/runFunnel/nextStage", () => {
  const src = loadFileText("../cognitive/src/knowledge-lookup.js");
  assert.ok(
    !src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "knowledge-lookup.js não deve tocar no mecânico"
  );
});

test("6c. knowledge-base.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/knowledge-base.js");
  assert.ok(
    !src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "knowledge-base.js não deve depender de Supabase"
  );
});

test("6d. knowledge-lookup.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/knowledge-lookup.js");
  assert.ok(
    !src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "knowledge-lookup.js não deve depender de Supabase"
  );
});

test("6e. Enova worker.js não importa knowledge-base nem knowledge-lookup", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    !src.includes("knowledge-base") && !src.includes("knowledge-lookup"),
    "Enova worker.js não deve importar os módulos da Etapa 4"
  );
});

// ---------------------------------------------------------------------------
// Grupo 7 — KB tem exatamente os blocos mínimos obrigatórios
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 7: blocos mínimos obrigatórios ──");

test("7a. listKnowledgeBaseIds() contém exatamente os 10 IDs mínimos obrigatórios", () => {
  const ids = listKnowledgeBaseIds();
  assert.strictEqual(
    ids.length,
    REQUIRED_KB_IDS.length,
    `KB deve ter ${REQUIRED_KB_IDS.length} entradas, encontrado: ${ids.length}`
  );
  for (const id of REQUIRED_KB_IDS) {
    assert.ok(ids.includes(id), `id "${id}" deve estar em listKnowledgeBaseIds()`);
  }
});

test("7b. todos os 10 blocos mínimos têm id, titulo e conteudo definidos", () => {
  for (const id of REQUIRED_KB_IDS) {
    const item = getKnowledgeBaseItem(id);
    assert.ok(item !== null, `Item "${id}" não encontrado`);
    assert.ok(item.id && item.titulo && item.conteudo, `Item "${id}" está incompleto (falta id, titulo ou conteudo)`);
  }
});

test("7c. KNOWLEDGE_BASE está frozen (imutável)", () => {
  assert.ok(Object.isFrozen(KNOWLEDGE_BASE), "KNOWLEDGE_BASE deve ser Object.freeze()");
});

test("7d. cada item da KB tem exatamente os campos: id, titulo, conteudo", () => {
  const EXPECTED_KEYS = new Set(["id", "titulo", "conteudo"]);
  for (const item of KNOWLEDGE_BASE) {
    const keys = new Set(Object.keys(item));
    assert.strictEqual(
      keys.size,
      EXPECTED_KEYS.size,
      `Item "${item.id}" tem ${keys.size} campos, esperado ${EXPECTED_KEYS.size}`
    );
    for (const k of EXPECTED_KEYS) {
      assert.ok(keys.has(k), `Item "${item.id}" não tem campo "${k}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------
console.log(`\n── Resultado: ${passed} passed, ${failed} failed ──`);

if (failed > 0) {
  process.exit(1);
}
