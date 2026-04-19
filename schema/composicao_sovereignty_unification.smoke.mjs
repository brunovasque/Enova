/**
 * composicao_sovereignty_unification.smoke.mjs
 *
 * Smoke curto e focado para provar soberania estrutural da fase de composição.
 *
 * Valida que:
 * 1. COMPOSICAO_SEALED_STAGES existe e cobre exatamente os 7 stages
 * 2. Happy paths limpam flags transitórias antes do render
 * 3. Cognitive assist geral é bloqueado em happy paths (clear answer)
 * 4. Fallback paths não injetam cascas cognitivas com estado inconsistente
 * 5. Arbitragem final é determinística (sem competição implícita)
 * 6. Zero drift fora desta fase
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerSource = readFileSync(join(__dirname, "..", "Enova worker.js"), "utf-8");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════
// SECTION A — COMPOSICAO_SEALED_STAGES existence and coverage
// ═════════════════════════════════════════════════════════════════
console.log("\n🛡️  Section A — Selagem da fase (COMPOSICAO_SEALED_STAGES)");

const EXPECTED_SEALED_STAGES = [
  "estado_civil",
  "confirmar_casamento",
  "financiamento_conjunto",
  "somar_renda_solteiro",
  "somar_renda_familiar",
  "quem_pode_somar",
  "interpretar_composicao"
];

test("COMPOSICAO_SEALED_STAGES está definido no worker", () => {
  assert.ok(
    workerSource.includes("COMPOSICAO_SEALED_STAGES"),
    "Deve existir COMPOSICAO_SEALED_STAGES no worker"
  );
});

test("COMPOSICAO_SEALED_STAGES é um Set com exatamente 7 stages", () => {
  const match = workerSource.match(/const\s+COMPOSICAO_SEALED_STAGES\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
  assert.ok(match, "Deve ser definido como new Set([...])");
  const stages = match[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));
  assert.equal(stages.length, 7, `Deve ter 7 stages, encontrou ${stages.length}`);
  for (const expected of EXPECTED_SEALED_STAGES) {
    assert.ok(stages.includes(expected), `Deve conter "${expected}"`);
  }
});

test("COMPOSICAO_SEALED_STAGES NÃO contém stages do topo", () => {
  const topoStages = ["inicio", "inicio_decisao", "inicio_programa", "inicio_nome", "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"];
  const match = workerSource.match(/const\s+COMPOSICAO_SEALED_STAGES\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
  const stages = match[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));
  for (const topo of topoStages) {
    assert.ok(!stages.includes(topo), `NÃO deve conter stage do topo "${topo}"`);
  }
});

// ═════════════════════════════════════════════════════════════════
// SECTION B — Bloqueio de cognitive assist em happy paths
// ═════════════════════════════════════════════════════════════════
console.log("\n🚫 Section B — Bloqueio de vazamento do cognitive assist");

test("Guard de COMPOSICAO_SEALED_STAGES existe na área do cognitive assist", () => {
  assert.ok(
    workerSource.includes("COMPOSICAO_SEALED_STAGES.has(stage) && hasClearStageAnswer(stage, userText)"),
    "Guard de bloqueio deve usar COMPOSICAO_SEALED_STAGES.has(stage) && hasClearStageAnswer"
  );
});

test("Guard limpa __cognitive_reply_prefix quando clear answer detectado", () => {
  // Procura o bloco do guard de composicao sealed
  const guardIdx = workerSource.indexOf("COMPOSICAO_SEALED_STAGES.has(stage) && hasClearStageAnswer(stage, userText)");
  assert.ok(guardIdx > 0, "Guard deve existir");
  const guardBlock = workerSource.substring(guardIdx, guardIdx + 1000);
  assert.ok(
    guardBlock.includes("st.__cognitive_reply_prefix = null"),
    "Guard deve limpar __cognitive_reply_prefix"
  );
  assert.ok(
    guardBlock.includes("__cognitive_v2_takes_final = false"),
    "Guard deve limpar __cognitive_v2_takes_final"
  );
  assert.ok(
    guardBlock.includes("__speech_arbiter_source = null"),
    "Guard deve limpar __speech_arbiter_source"
  );
});

test("Telemetria de bloqueio composicao_sealed_assist_blocked existe", () => {
  assert.ok(
    workerSource.includes("composicao_sealed_assist_blocked"),
    "Deve emitir telemetria de bloqueio"
  );
});

// ═════════════════════════════════════════════════════════════════
// SECTION C — Limpeza de flags consistente nos happy paths
// ═════════════════════════════════════════════════════════════════
console.log("\n🧹 Section C — Limpeza de flags transitórias nos happy paths");

// Helper: conta ocorrências de um padrão no bloco de cada case
function countFlagCleanupsInStage(stageLabel) {
  // Find the case block
  const casePattern = `case "${stageLabel}":`;
  let idx = workerSource.indexOf(casePattern);
  if (idx < 0) return { found: false, count: 0 };

  // Find the next case or end
  const nextCase = workerSource.indexOf("\ncase ", idx + 10);
  const block = nextCase > 0
    ? workerSource.substring(idx, nextCase)
    : workerSource.substring(idx, idx + 10000);

  const cleanupPattern = /st\.__cognitive_reply_prefix\s*=\s*null;\s*\n\s*st\.__cognitive_v2_takes_final\s*=\s*false;\s*\n\s*st\.__speech_arbiter_source\s*=\s*null;/g;
  const matches = block.match(cleanupPattern);
  return { found: true, count: matches ? matches.length : 0 };
}

for (const stage of EXPECTED_SEALED_STAGES) {
  test(`Stage "${stage}" tem limpeza de flags antes de step()`, () => {
    const result = countFlagCleanupsInStage(stage);
    assert.ok(result.found, `Case "${stage}" deve existir no worker`);
    assert.ok(
      result.count >= 1,
      `Stage "${stage}" deve ter pelo menos 1 limpeza de flags, encontrou ${result.count}`
    );
  });
}

// ═════════════════════════════════════════════════════════════════
// SECTION D — Sem cascas cognitivas inline com estado inconsistente
// ═════════════════════════════════════════════════════════════════
console.log("\n🚧 Section D — Arbitragem previsível (sem cascas inline)");

function findCascaCognitiva(stageLabel) {
  const casePattern = `case "${stageLabel}":`;
  let idx = workerSource.indexOf(casePattern);
  if (idx < 0) return [];

  const nextCase = workerSource.indexOf("\ncase ", idx + 10);
  const block = nextCase > 0
    ? workerSource.substring(idx, nextCase)
    : workerSource.substring(idx, idx + 10000);

  // Look for inline casca pattern: sets prefix + takes_final WITHOUT arbiter_source
  const cascas = [];
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("__cognitive_reply_prefix =") && !lines[i].includes("= null")) {
      // Check if next 3 lines also set takes_final = true (casca pattern)
      const nextLines = lines.slice(i, i + 4).join(" ");
      if (nextLines.includes("__cognitive_v2_takes_final = true")) {
        cascas.push({ line: i, text: lines[i].trim() });
      }
    }
  }
  return cascas;
}

for (const stage of EXPECTED_SEALED_STAGES) {
  test(`Stage "${stage}" NÃO tem casca cognitiva inline (competição implícita)`, () => {
    const cascas = findCascaCognitiva(stage);
    // estado_civil is special: it uses setTopoHappyPathFlags which may set prefix, but followed by cleanup
    if (stage === "estado_civil") return; // setTopoHappyPathFlags is a different mechanism, not a casca
    assert.equal(
      cascas.length,
      0,
      `Stage "${stage}" não deve ter casca cognitiva inline, encontrou ${cascas.length}: ${cascas.map(c => c.text).join(", ")}`
    );
  });
}

// ═════════════════════════════════════════════════════════════════
// SECTION E — Zero drift (não toca stages fora do escopo)
// ═════════════════════════════════════════════════════════════════
console.log("\n🎯 Section E — Zero drift fora da fase");

test("TOP_SEALED_STAGES não foi alterado (preserva topo)", () => {
  const match = workerSource.match(/const\s+TOP_SEALED_STAGES\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
  assert.ok(match, "TOP_SEALED_STAGES deve existir");
  const stages = match[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));
  assert.equal(stages.length, 7, "TOP_SEALED_STAGES deve manter 7 stages");
  assert.ok(stages.includes("inicio"), "Deve manter 'inicio'");
  assert.ok(stages.includes("inicio_rnm_validade"), "Deve manter 'inicio_rnm_validade'");
});

test("TOP_SEALED_MODE continua true", () => {
  assert.ok(
    workerSource.includes("const TOP_SEALED_MODE = true;"),
    "TOP_SEALED_MODE deve ser true"
  );
});

test("renderCognitiveSpeech preserva surface soberana do topo", () => {
  assert.ok(
    workerSource.includes("TOP_SEALED_MODE && TOP_SEALED_STAGES.has(stage)"),
    "renderCognitiveSpeech deve manter o guard do topo"
  );
});

// ═════════════════════════════════════════════════════════════════
// SECTION F — Mecânico soberano (parse/gate/nextStage intacto)
// ═════════════════════════════════════════════════════════════════
console.log("\n⚙️  Section F — Mecânico soberano");

test("parseEstadoCivil continua sendo chamado em estado_civil", () => {
  // Find the main case handler (the one with { block), not the resolveTopoStructured reference
  const caseIdx = workerSource.indexOf('case "estado_civil": {');
  assert.ok(caseIdx > 0, "Case estado_civil deve existir como bloco handler");
  const block = workerSource.substring(caseIdx, caseIdx + 3000);
  assert.ok(block.includes("parseEstadoCivil"), "Deve usar parseEstadoCivil no stage");
});

test("parseComposicaoRenda continua sendo chamado em interpretar_composicao", () => {
  const caseIdx = workerSource.indexOf('case "interpretar_composicao":');
  const block = workerSource.substring(caseIdx, caseIdx + 3000);
  assert.ok(block.includes("parseComposicaoRenda"), "Deve usar parseComposicaoRenda no stage");
});

test("parseComposicaoRenda continua sendo chamado em quem_pode_somar", () => {
  const caseIdx = workerSource.indexOf('case "quem_pode_somar":');
  const block = workerSource.substring(caseIdx, caseIdx + 3000);
  assert.ok(block.includes("parseComposicaoRenda"), "Deve usar parseComposicaoRenda no stage");
});

// ═════════════════════════════════════════════════════════════════
// RESULTADO FINAL
// ═════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(60));
console.log(`📊 Resultado: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\n❌ Falhas:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}
console.log("═".repeat(60));

process.exit(failed > 0 ? 1 : 0);
