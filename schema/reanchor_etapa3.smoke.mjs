/**
 * reanchor_etapa3.smoke.mjs — Smoke tests da Etapa 3: Helper Global de Reancoragem
 *
 * Cobertura obrigatória:
 *  1.  lookup de variantes por fase (topo, meio, gates_finais, operacional)
 *  2.  garantia de no mínimo 3 variantes por fase
 *  3.  buildReanchor() com partialReply + fase topo
 *  4.  buildReanchor() sem partialReply + fase topo
 *  5.  buildReanchor() com fase meio
 *  6.  buildReanchor() com fase gates_finais
 *  7.  buildReanchor() com fase operacional
 *  8.  garantia de que nenhuma variante usa "casa" em vez de "imóvel"
 *  9.  garantia de que nenhuma variante promete aprovação
 *  10. garantia de que o offtrack guard passou a consumir o helper global
 *  11. garantia de que o mecânico continua intocado fora dessa troca textual
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { getReanchorVariants, buildReanchor, stageToPhase } = await import(
  new URL("../cognitive/src/reanchor-helper.js", import.meta.url).href
);

const { REANCHOR_VARIANTS, REANCHOR_PULL_BACK } = await import(
  new URL("../cognitive/src/reanchor-variants.js", import.meta.url).href
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

const PHASES = ["topo", "meio", "gates_finais", "operacional"];

// ---------------------------------------------------------------------------
// Grupo 1 — lookup de variantes por fase
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 1: lookup de variantes por fase ──");

for (const phase of PHASES) {
  test(`1. getReanchorVariants("${phase}") retorna array não-vazio`, () => {
    const variants = getReanchorVariants(phase);
    assert.ok(Array.isArray(variants) || (variants && typeof variants[Symbol.iterator] === "function"),
      `getReanchorVariants("${phase}") deve retornar array`);
    const arr = Array.from(variants);
    assert.ok(arr.length > 0, `getReanchorVariants("${phase}") não deve ser vazio`);
  });
}

test("1e. getReanchorVariants(fase_invalida) retorna variantes de topo como fallback", () => {
  const fallback = getReanchorVariants("fase_inexistente");
  const topo = getReanchorVariants("topo");
  assert.deepStrictEqual(Array.from(fallback), Array.from(topo),
    "fase inválida deve cair no fallback de topo");
});

// ---------------------------------------------------------------------------
// Grupo 2 — no mínimo 3 variantes por fase
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 2: mínimo 3 variantes por fase ──");

for (const phase of PHASES) {
  test(`2. "${phase}" tem ao menos 3 variantes`, () => {
    const variants = Array.from(getReanchorVariants(phase));
    assert.ok(
      variants.length >= 3,
      `Fase "${phase}" tem ${variants.length} variante(s) — precisa de ao menos 3`
    );
  });
}

// ---------------------------------------------------------------------------
// Grupo 3 — buildReanchor com partialReply + topo
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 3: buildReanchor com partialReply + topo ──");

test("3a. buildReanchor({ partialReply, phase:'topo', variantIndex:0 }) retorna text e lines", () => {
  const result = buildReanchor({ partialReply: "Entendido.", phase: "topo", variantIndex: 0 });
  assert.ok(typeof result.text === "string" && result.text.length > 0, "text deve ser string não-vazia");
  assert.ok(Array.isArray(result.lines) && result.lines.length >= 2, "lines deve ter ao menos 2 itens");
});

test("3b. buildReanchor com partialReply: line1 começa com o partialReply", () => {
  const result = buildReanchor({ partialReply: "Entendido.", phase: "topo", variantIndex: 0 });
  assert.ok(result.lines[0].startsWith("Entendido."),
    "linha 1 deve começar com o partialReply");
});

test("3c. buildReanchor com partialReply: text contém REANCHOR_PULL_BACK", () => {
  const result = buildReanchor({ partialReply: "Entendido.", phase: "topo", variantIndex: 0 });
  assert.ok(result.text.includes(REANCHOR_PULL_BACK),
    "text deve conter a frase de pull-back canônica");
});

// ---------------------------------------------------------------------------
// Grupo 4 — buildReanchor sem partialReply + topo
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 4: buildReanchor sem partialReply + topo ──");

test("4a. buildReanchor({ phase:'topo', variantIndex:0 }) retorna text e lines válidos", () => {
  const result = buildReanchor({ phase: "topo", variantIndex: 0 });
  assert.ok(typeof result.text === "string" && result.text.length > 0, "text deve ser string não-vazia");
  assert.ok(Array.isArray(result.lines) && result.lines.length >= 2, "lines deve ter ao menos 2 itens");
});

test("4b. buildReanchor sem partialReply: lines[0] é uma variante do catálogo de topo", () => {
  const topoVariants = Array.from(getReanchorVariants("topo"));
  const result = buildReanchor({ phase: "topo", variantIndex: 0 });
  assert.ok(topoVariants.includes(result.lines[0]),
    "lines[0] deve ser uma variante do catálogo de topo");
});

test("4c. buildReanchor sem partialReply: lines[1] é o REANCHOR_PULL_BACK", () => {
  const result = buildReanchor({ phase: "topo", variantIndex: 0 });
  assert.strictEqual(result.lines[1], REANCHOR_PULL_BACK,
    "lines[1] deve ser exatamente o REANCHOR_PULL_BACK");
});

test("4d. buildReanchor() sem argumentos não lança exceção", () => {
  assert.doesNotThrow(() => buildReanchor(), "buildReanchor() sem args deve funcionar");
});

// ---------------------------------------------------------------------------
// Grupo 5 — buildReanchor com fase meio
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 5: buildReanchor com fase meio ──");

test("5a. buildReanchor({ phase:'meio', variantIndex:0 }) retorna variante de meio", () => {
  const meioVariants = Array.from(getReanchorVariants("meio"));
  const result = buildReanchor({ phase: "meio", variantIndex: 0 });
  assert.ok(meioVariants.includes(result.lines[0]),
    "lines[0] deve ser uma variante do catálogo de meio");
});

test("5b. buildReanchor derivado de stage de meio (renda_trabalho)", () => {
  const result = buildReanchor({ currentStage: "renda_trabalho", variantIndex: 0 });
  const meioVariants = Array.from(getReanchorVariants("meio"));
  assert.ok(meioVariants.includes(result.lines[0]),
    "stage 'renda_trabalho' deve derivar fase 'meio'");
});

// ---------------------------------------------------------------------------
// Grupo 6 — buildReanchor com fase gates_finais
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 6: buildReanchor com fase gates_finais ──");

test("6a. buildReanchor({ phase:'gates_finais', variantIndex:0 }) retorna variante de gates_finais", () => {
  const variants = Array.from(getReanchorVariants("gates_finais"));
  const result = buildReanchor({ phase: "gates_finais", variantIndex: 0 });
  assert.ok(variants.includes(result.lines[0]),
    "lines[0] deve ser uma variante do catálogo de gates_finais");
});

test("6b. buildReanchor derivado de stage ctps_36 → gates_finais", () => {
  const result = buildReanchor({ currentStage: "ctps_36", variantIndex: 0 });
  const gatesVariants = Array.from(getReanchorVariants("gates_finais"));
  assert.ok(gatesVariants.includes(result.lines[0]),
    "stage 'ctps_36' deve derivar fase 'gates_finais'");
});

test("6c. stageToPhase('restricao') retorna 'gates_finais'", () => {
  assert.strictEqual(stageToPhase("restricao"), "gates_finais");
});

// ---------------------------------------------------------------------------
// Grupo 7 — buildReanchor com fase operacional
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 7: buildReanchor com fase operacional ──");

test("7a. buildReanchor({ phase:'operacional', variantIndex:0 }) retorna variante de operacional", () => {
  const variants = Array.from(getReanchorVariants("operacional"));
  const result = buildReanchor({ phase: "operacional", variantIndex: 0 });
  assert.ok(variants.includes(result.lines[0]),
    "lines[0] deve ser uma variante do catálogo de operacional");
});

test("7b. buildReanchor derivado de stage envio_docs → operacional", () => {
  const result = buildReanchor({ currentStage: "envio_docs", variantIndex: 0 });
  const opVariants = Array.from(getReanchorVariants("operacional"));
  assert.ok(opVariants.includes(result.lines[0]),
    "stage 'envio_docs' deve derivar fase 'operacional'");
});

test("7c. stageToPhase('agendamento_visita') retorna 'operacional'", () => {
  assert.strictEqual(stageToPhase("agendamento_visita"), "operacional");
});

// ---------------------------------------------------------------------------
// Grupo 8 — nenhuma variante usa "casa" em vez de "imóvel"
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 8: sem uso de 'casa' ──");

const CASA_PATTERN = /\bcasa\b/i;

test("8a. nenhuma variante de reancoragem usa 'casa' em vez de 'imóvel'", () => {
  for (const phase of PHASES) {
    for (const [i, variant] of Array.from(getReanchorVariants(phase)).entries()) {
      assert.ok(
        !CASA_PATTERN.test(variant),
        `Fase "${phase}" variante[${i}] usa "casa" — deve usar "imóvel"`
      );
    }
  }
});

test("8b. REANCHOR_PULL_BACK não usa 'casa'", () => {
  assert.ok(!CASA_PATTERN.test(REANCHOR_PULL_BACK), "REANCHOR_PULL_BACK não deve usar 'casa'");
});

// ---------------------------------------------------------------------------
// Grupo 9 — nenhuma variante promete aprovação
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 9: sem promessa de aprovação ──");

const APPROVAL_PATTERNS = [
  /\bvai ser aprovad[oa]\b/i,
  /\bgarant(imos|ido|e)\b/i,
  /\bcom certeza (ser[aá]|fica|vai)\b/i,
  /\bpode ter certeza que\b/i,
  /\b100% aprovad[oa]\b/i
];

test("9a. nenhuma variante de reancoragem promete aprovação", () => {
  for (const phase of PHASES) {
    for (const [i, variant] of Array.from(getReanchorVariants(phase)).entries()) {
      for (const pattern of APPROVAL_PATTERNS) {
        assert.ok(
          !pattern.test(variant),
          `Fase "${phase}" variante[${i}] promete aprovação (padrão: ${pattern})`
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Grupo 10 — offtrack guard passou a consumir o helper global
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 10: offtrack guard consome o helper global ──");

test("10a. Enova worker.js importa buildReanchor do helper canônico", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    src.includes('from "./cognitive/src/reanchor-helper.js"'),
    "worker.js deve importar de ./cognitive/src/reanchor-helper.js"
  );
  assert.ok(
    src.includes("buildReanchor"),
    "worker.js deve usar buildReanchor"
  );
});

test("10b. worker.js não tem mais o texto hardcoded do guard externo", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    !src.includes("Vou analisar seu perfil primeiro e, no final, tiro todas suas dúvidas"),
    "worker.js não deve ter o texto hardcoded do guard externo"
  );
});

test("10c. worker.js não tem mais o array hardcoded do guard interno", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    !src.includes('"Pra eu seguir aqui, me responde só a pergunta anterior direitinho. 🙏"'),
    "worker.js não deve ter a string hardcoded do array de offtrackMessages"
  );
});

test("10d. reanchor-helper.js usa buildReanchor({ currentStage: stage }) no guard interno", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    src.includes("buildReanchor({ currentStage: stage }).lines"),
    "guard interno deve usar buildReanchor({ currentStage: stage }).lines"
  );
});

// ---------------------------------------------------------------------------
// Grupo 11 — mecânico continua intocado fora dessa troca textual
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 11: mecânico intocado ──");

test("11a. reanchor-variants.js não referencia step()/runFunnel/nextStage", () => {
  const src = loadFileText("../cognitive/src/reanchor-variants.js");
  assert.ok(
    !src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "reanchor-variants.js não deve tocar no mecânico"
  );
});

test("11b. reanchor-helper.js não referencia step()/runFunnel/nextStage", () => {
  const src = loadFileText("../cognitive/src/reanchor-helper.js");
  assert.ok(
    !src.includes("step(") && !src.includes("runFunnel") && !src.includes("nextStage"),
    "reanchor-helper.js não deve tocar no mecânico"
  );
});

test("11c. reanchor-variants.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/reanchor-variants.js");
  assert.ok(
    !src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "reanchor-variants.js não deve depender de Supabase"
  );
});

test("11d. reanchor-helper.js não tem dependência de Supabase", () => {
  const src = loadFileText("../cognitive/src/reanchor-helper.js");
  assert.ok(
    !src.includes("supabase") && !src.includes("Supabase") && !src.includes("createClient"),
    "reanchor-helper.js não deve depender de Supabase"
  );
});

test("11e. a mudança no worker.js é cirúrgica: step() ainda existe e não foi alterado", () => {
  const src = loadFileText("../Enova worker.js");
  // step() deve ainda existir no worker
  assert.ok(src.includes("function step("), "function step() deve ainda existir no worker");
  // nextStage logic deve ainda existir
  assert.ok(src.includes("nextStage"), "nextStage deve ainda existir no worker");
  // nenhum gate foi removido
  assert.ok(src.includes("yesNoStages"), "yesNoStages (offtrack determinístico) deve ainda existir");
});

test("11f. offtrack determinístico (yesNoStages) não foi tocado", () => {
  const src = loadFileText("../Enova worker.js");
  assert.ok(
    src.includes("yesNoStages.has(stage)"),
    "offtrack determinístico (yesNoStages.has(stage)) deve estar intacto"
  );
});

// ---------------------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------------------
console.log(`\n── Resultado: ${passed} passed, ${failed} failed ──`);

if (failed > 0) {
  process.exit(1);
}
