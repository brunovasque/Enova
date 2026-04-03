/**
 * objections_canonico.smoke.mjs — Smoke tests da Etapa 2: Catálogo Canônico de Objeções
 *
 * Cobertura obrigatória:
 *  1. lookup de cada objeção mínima por chave (10 entradas)
 *  2. nenhuma resposta está vazia
 *  3. cada objeção tem pelo menos 2 variantes de tom
 *  4. nenhuma resposta usa "casa" em vez de "imóvel"
 *  5. nenhuma resposta promete aprovação
 *  6. helper retorna null/erro controlado para chave inexistente
 *  7. nada do mecânico foi tocado
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { getCanonicalObjection, listCanonicalObjectionIds, getCanonicalObjectionVariant } =
  await import(new URL("../cognitive/src/objections-lookup.js", import.meta.url).href);

const { OBJECTIONS_CATALOG } = await import(
  new URL("../cognitive/src/objections-canonico.js", import.meta.url).href
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
// Grupo 1 — lookup de cada objeção mínima por chave
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 1: lookup por chave ──");

const REQUIRED_OBJECTION_IDS = [
  "medo_golpe",
  "sem_tempo",
  "presencial_preferido",
  "vou_pensar",
  "ja_fiz_em_outro_lugar",
  "vergonha_renda",
  "medo_reprovacao",
  "nao_quero_online",
  "sem_documentos_agora",
  "duvida_seguranca_dados"
];

for (const id of REQUIRED_OBJECTION_IDS) {
  test(`1. lookup "${id}" retorna entrada`, () => {
    const obj = getCanonicalObjection(id);
    assert.ok(obj !== null, `Objeção "${id}" não encontrada no catálogo`);
    assert.strictEqual(obj.id, id, `id da entrada deve ser "${id}"`);
    assert.ok(typeof obj.frase_tipica === "string", "frase_tipica deve ser string");
    assert.ok(typeof obj.resposta_canonica === "string", "resposta_canonica deve ser string");
    assert.ok(Array.isArray(obj.variantes_tom), "variantes_tom deve ser array");
  });
}

// ---------------------------------------------------------------------------
// Grupo 2 — nenhuma resposta está vazia
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 2: respostas não-vazias ──");

test("2a. nenhuma resposta_canonica está vazia", () => {
  for (const entry of OBJECTIONS_CATALOG) {
    assert.ok(
      entry.resposta_canonica && entry.resposta_canonica.trim().length >= 10,
      `Objeção "${entry.id}" tem resposta_canonica vazia ou muito curta`
    );
  }
});

test("2b. nenhuma frase_tipica está vazia", () => {
  for (const entry of OBJECTIONS_CATALOG) {
    assert.ok(
      entry.frase_tipica && entry.frase_tipica.trim().length >= 5,
      `Objeção "${entry.id}" tem frase_tipica vazia ou muito curta`
    );
  }
});

test("2c. nenhuma variante de tom está vazia", () => {
  for (const entry of OBJECTIONS_CATALOG) {
    for (const [i, variante] of entry.variantes_tom.entries()) {
      assert.ok(
        typeof variante === "string" && variante.trim().length >= 10,
        `Objeção "${entry.id}" tem variante_tom[${i}] vazia ou muito curta`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Grupo 3 — cada objeção tem pelo menos 2 variantes de tom
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 3: variantes de tom ──");

test("3a. cada objeção tem ao menos 2 variantes_tom", () => {
  for (const entry of OBJECTIONS_CATALOG) {
    assert.ok(
      Array.isArray(entry.variantes_tom) && entry.variantes_tom.length >= 2,
      `Objeção "${entry.id}" tem menos de 2 variantes_tom`
    );
  }
});

test("3b. getCanonicalObjectionVariant(id, 0) retorna primeira variante", () => {
  for (const id of REQUIRED_OBJECTION_IDS) {
    const v0 = getCanonicalObjectionVariant(id, 0);
    assert.ok(typeof v0 === "string" && v0.length > 0, `variante 0 de "${id}" deve ser string não-vazia`);
  }
});

test("3c. getCanonicalObjectionVariant(id, 1) retorna segunda variante", () => {
  for (const id of REQUIRED_OBJECTION_IDS) {
    const v1 = getCanonicalObjectionVariant(id, 1);
    assert.ok(typeof v1 === "string" && v1.length > 0, `variante 1 de "${id}" deve ser string não-vazia`);
  }
});

test("3d. variante 0 e variante 1 são diferentes entre si", () => {
  for (const id of REQUIRED_OBJECTION_IDS) {
    const v0 = getCanonicalObjectionVariant(id, 0);
    const v1 = getCanonicalObjectionVariant(id, 1);
    assert.notStrictEqual(v0, v1, `variantes 0 e 1 de "${id}" são idênticas — devem ser distintas`);
  }
});

// ---------------------------------------------------------------------------
// Grupo 4 — nenhuma resposta usa "casa" em vez de "imóvel"
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 4: sem uso de 'casa' ──");

const CASA_PATTERN = /\bcasa\b/i;

test('4a. nenhuma resposta_canonica usa "casa" no lugar de "imóvel"', () => {
  for (const entry of OBJECTIONS_CATALOG) {
    assert.ok(
      !CASA_PATTERN.test(entry.resposta_canonica),
      `Objeção "${entry.id}" usa "casa" na resposta_canonica — deve usar "imóvel"`
    );
  }
});

test('4b. nenhuma variante_tom usa "casa" no lugar de "imóvel"', () => {
  for (const entry of OBJECTIONS_CATALOG) {
    for (const [i, variante] of entry.variantes_tom.entries()) {
      assert.ok(
        !CASA_PATTERN.test(variante),
        `Objeção "${entry.id}" variante[${i}] usa "casa" — deve usar "imóvel"`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Grupo 5 — nenhuma resposta promete aprovação
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 5: sem promessa de aprovação ──");

const APPROVAL_PROMISE_PATTERNS = [
  /\bvai ser aprovad[oa]\b/i,
  /\bgarant(imos|ido|e)\b/i,
  /\bcom certeza (ser[aá]|fica|vai)\b/i,
  /\bpode ter certeza que\b/i,
  /\b100% aprovad[oa]\b/i
];

test("5a. nenhuma resposta_canonica promete aprovação", () => {
  for (const entry of OBJECTIONS_CATALOG) {
    for (const pattern of APPROVAL_PROMISE_PATTERNS) {
      assert.ok(
        !pattern.test(entry.resposta_canonica),
        `Objeção "${entry.id}" promete aprovação na resposta_canonica (padrão: ${pattern})`
      );
    }
  }
});

test("5b. nenhuma variante_tom promete aprovação", () => {
  for (const entry of OBJECTIONS_CATALOG) {
    for (const [i, variante] of entry.variantes_tom.entries()) {
      for (const pattern of APPROVAL_PROMISE_PATTERNS) {
        assert.ok(
          !pattern.test(variante),
          `Objeção "${entry.id}" variante[${i}] promete aprovação (padrão: ${pattern})`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Grupo 6 — helper retorna null para chave inexistente
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 6: chave inexistente ──");

test('6a. getCanonicalObjection("chave_inexistente") retorna null', () => {
  const result = getCanonicalObjection("chave_inexistente");
  assert.strictEqual(result, null, "deve retornar null para chave inexistente");
});

test("6b. getCanonicalObjection(undefined) retorna null", () => {
  const result = getCanonicalObjection(undefined);
  assert.strictEqual(result, null, "deve retornar null para undefined");
});

test('6c. getCanonicalObjection("") retorna null', () => {
  const result = getCanonicalObjection("");
  assert.strictEqual(result, null, "deve retornar null para string vazia");
});

test("6d. getCanonicalObjection(null) retorna null", () => {
  const result = getCanonicalObjection(null);
  assert.strictEqual(result, null, "deve retornar null para null");
});

test('6e. getCanonicalObjectionVariant("chave_inexistente") retorna null', () => {
  const result = getCanonicalObjectionVariant("chave_inexistente");
  assert.strictEqual(result, null, "deve retornar null para chave inexistente");
});

test("6f. listCanonicalObjectionIds() contém exatamente os 10 IDs obrigatórios", () => {
  const ids = listCanonicalObjectionIds();
  assert.strictEqual(
    ids.length,
    REQUIRED_OBJECTION_IDS.length,
    `catálogo deve ter ${REQUIRED_OBJECTION_IDS.length} entradas`
  );
  for (const id of REQUIRED_OBJECTION_IDS) {
    assert.ok(ids.includes(id), `id "${id}" deve estar em listCanonicalObjectionIds()`);
  }
});

// ---------------------------------------------------------------------------
// Grupo 7 — nada do mecânico foi tocado
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 7: isolamento do mecânico ──");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFileText(relPath) {
  return readFileSync(path.resolve(__dirname, relPath), "utf8");
}

test("7a. objections-canonico.js não referencia step()/runFunnel/nextStage", () => {
  const src = loadFileText("../cognitive/src/objections-canonico.js");
  assert.ok(
    !src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "objections-canonico.js não deve tocar no mecânico"
  );
});

test("7b. objections-lookup.js não referencia step()/runFunnel/nextStage", () => {
  const src = loadFileText("../cognitive/src/objections-lookup.js");
  assert.ok(
    !src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "objections-lookup.js não deve tocar no mecânico"
  );
});

test("7c. objections-canonico.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/objections-canonico.js");
  assert.ok(
    !src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "objections-canonico.js não deve depender de Supabase"
  );
});

test("7d. objections-lookup.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/objections-lookup.js");
  assert.ok(
    !src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "objections-lookup.js não deve depender de Supabase"
  );
});

test("7e. Enova worker.js não foi modificado pela Etapa 2 (sem import de objections-canonico)", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    !src.includes("objections-canonico") && !src.includes("objections-lookup"),
    "Enova worker.js não deve importar os módulos de objeções da Etapa 2"
  );
});

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------
console.log(`\n── Resultado: ${passed} passed, ${failed} failed ──`);

if (failed > 0) {
  process.exit(1);
}
