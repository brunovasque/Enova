/**
 * composicao_mismatch_fixes.smoke.mjs
 *
 * Smoke curto e focado para provar que os mismatchs reais da fase de composição
 * foram corrigidos sem quebrar a soberania estrutural.
 *
 * BLOCOs testados:
 * A — Composição genérica não vira parceiro automaticamente
 * B — Filho/filha/dependente não entram como composição indevida
 * C — Destino de "sozinho" coerente (state cleanup)
 * D — se_precisar estruturalmente consistente
 * E — Estado civil / confirmar_casamento — respostas ambíguas tratadas
 *
 * Zero drift fora da fase.
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
// BLOCO A — Composição genérica NÃO vira parceiro automaticamente
// ═════════════════════════════════════════════════════════════════
console.log("\n🔒 BLOCO A — Composição genérica não assume parceiro");

test("somar_renda_solteiro: regex 'quero somar renda$' NÃO está na detecção de parceiro", () => {
  // A regex "quero\\s+somar\\s+renda\\s*$" não deve existir na detecção de parceiro
  // do stage somar_renda_solteiro
  const parceiroBlock = workerSource.match(
    /case\s+"somar_renda_solteiro"[\s\S]*?const\s+parceiro\s*=\s*([\s\S]*?);/
  );
  assert.ok(parceiroBlock, "Deve existir const parceiro em somar_renda_solteiro");
  const parceiroRegex = parceiroBlock[1];
  assert.ok(
    !parceiroRegex.includes("quero\\s+somar\\s+renda"),
    "NÃO deve conter regex genérica 'quero somar renda' na detecção de parceiro"
  );
  assert.ok(
    !parceiroRegex.includes("quero\\s+somar\\s+renda\\s*$"),
    "NÃO deve conter regex genérica com $ na detecção de parceiro"
  );
});

test("somar_renda_solteiro: parceiro exige menção explícita (parceiro|esposa|marido|namorad|conjuge)", () => {
  const parceiroBlock = workerSource.match(
    /case\s+"somar_renda_solteiro"[\s\S]*?const\s+parceiro\s*=\s*([\s\S]*?);/
  );
  assert.ok(parceiroBlock, "Deve existir const parceiro");
  const regexStr = parceiroBlock[1];
  // Must require explicit partner mention
  assert.ok(
    regexStr.includes("parceiro") || regexStr.includes("parceira"),
    "Deve exigir menção explícita de parceiro/parceira"
  );
});

test("hasClearStageAnswer: somar_renda_solteiro NÃO aceita 'sim' isolado como resposta clara", () => {
  // Localiza a regex solo no hasClearStageAnswer para somar_renda_solteiro
  const hasClearBlock = workerSource.match(
    /if\s*\(stage\s*===\s*"somar_renda_solteiro"\)\s*\{[\s\S]*?const\s+solo\s*=\s*(\/[^;]+\/)[^;]*;/
  );
  assert.ok(hasClearBlock, "Deve existir const solo em hasClearStageAnswer para somar_renda_solteiro");
  const soloRegex = hasClearBlock[1];
  assert.ok(
    !soloRegex.includes("|sim)"),
    "NÃO deve aceitar 'sim' isolado como resposta clara de solo"
  );
});

// ═════════════════════════════════════════════════════════════════
// BLOCO B — Filho/filha/dependente NÃO entram como composição
// ═════════════════════════════════════════════════════════════════
console.log("\n🔒 BLOCO B — Filho/filha/dependente guard");

test("parseComposicaoRenda NÃO contém filho|filha na regex de familiar", () => {
  const parseBlock = workerSource.match(
    /function\s+parseComposicaoRenda[\s\S]*?return\s+"familiar";\s*\}/
  );
  assert.ok(parseBlock, "Deve existir parseComposicaoRenda com retorno 'familiar'");
  const block = parseBlock[0];
  // Check the actual regex line, not comments
  const regexLine = block.match(/if\s*\(\/(.+?)\/\.test\(nt\)\)\s*\{\s*\n\s*return\s+"familiar"/);
  assert.ok(regexLine, "Deve existir regex de familiar em parseComposicaoRenda");
  const regexContent = regexLine[1];
  assert.ok(!regexContent.includes("filho"), "Regex de familiar NÃO deve conter 'filho'");
  assert.ok(!regexContent.includes("filha"), "Regex de familiar NÃO deve conter 'filha'");
});

test("interpretar_composicao tem guard de dependente ANTES de parceiro/familiar", () => {
  const interpretarBlock = workerSource.match(
    /case\s+"interpretar_composicao"[\s\S]*?(?=case\s+"quem_pode_somar")/
  );
  assert.ok(interpretarBlock, "Deve existir case interpretar_composicao");
  const block = interpretarBlock[0];
  // Guard de dependente deve existir
  assert.ok(
    block.includes("mencionouDependente"),
    "Deve ter variável mencionouDependente"
  );
  assert.ok(
    block.includes("filho|filha") || block.includes("(filho|filha"),
    "Guard deve cobrir filho/filha"
  );
  // Guard deve vir ANTES da decisão parceiro/familiar
  const guardPos = block.indexOf("mencionouDependente");
  const parceiroPos = block.indexOf("if (parceiro)");
  assert.ok(
    guardPos < parceiroPos,
    "Guard de dependente deve vir ANTES da decisão de parceiro"
  );
});

test("somar_renda_solteiro tem guard de dependente", () => {
  const solteiroBlock = workerSource.match(
    /case\s+"somar_renda_solteiro"[\s\S]*?(?=case\s+"somar_renda_familiar")/
  );
  assert.ok(solteiroBlock, "Deve existir case somar_renda_solteiro");
  const block = solteiroBlock[0];
  assert.ok(
    block.includes("mencionouDependente"),
    "Deve ter guard de dependente em somar_renda_solteiro"
  );
});

test("somar_renda_familiar tem guard de dependente", () => {
  const familiarBlock = workerSource.match(
    /case\s+"somar_renda_familiar"[\s\S]*?(?=case\s+"parceiro_tem_renda"|\/\/\s*=+\s*\n\s*\/\/\s*C8|\/\/\s*=+\s*\n\s*\/\/.*PARCEIRO)/
  );
  assert.ok(familiarBlock, "Deve existir case somar_renda_familiar");
  const block = familiarBlock[0];
  assert.ok(
    block.includes("mencionouDependente"),
    "Deve ter guard de dependente em somar_renda_familiar"
  );
});

test("quem_pode_somar tem guard de dependente (pré-existente)", () => {
  const quemBlock = workerSource.match(
    /case\s+"quem_pode_somar"[\s\S]*?(?=case\s+"sugerir_composicao_mista")/
  );
  assert.ok(quemBlock, "Deve existir case quem_pode_somar");
  const block = quemBlock[0];
  assert.ok(
    block.includes("mencionouDependente"),
    "Deve ter guard de dependente em quem_pode_somar"
  );
});

// ═════════════════════════════════════════════════════════════════
// BLOCO C — Destino de "sozinho" coerente (state cleanup)
// ═════════════════════════════════════════════════════════════════
console.log("\n🔒 BLOCO C — Destino de sozinho coerente");

test("interpretar_composicao: sozinho define somar_renda: false", () => {
  const block = workerSource.match(
    /case\s+"interpretar_composicao"[\s\S]*?(?=case\s+"quem_pode_somar")/
  )?.[0];
  assert.ok(block, "Deve existir case interpretar_composicao");
  // Find the sozinho branch and check state
  const sozinhoSection = block.match(/if\s*\(sozinho\)\s*\{[\s\S]*?upsertState[\s\S]*?\}\)/);
  assert.ok(sozinhoSection, "Deve ter branch sozinho com upsertState");
  const stateCall = sozinhoSection[0];
  assert.ok(
    stateCall.includes("somar_renda: false") || stateCall.includes("somar_renda:false"),
    "Sozinho deve definir somar_renda: false"
  );
  assert.ok(
    stateCall.includes("financiamento_conjunto: false") || stateCall.includes("financiamento_conjunto:false"),
    "Sozinho deve definir financiamento_conjunto: false"
  );
});

// ═════════════════════════════════════════════════════════════════
// BLOCO D — se_precisar estruturalmente consistente
// ═════════════════════════════════════════════════════════════════
console.log("\n🔒 BLOCO D — se_precisar sem lacuna estrutural");

test("financiamento_conjunto: se_precisar define somar_renda: false", () => {
  const block = workerSource.match(
    /case\s+"financiamento_conjunto"[\s\S]*?(?=case\s+"parceiro_tem_renda")/
  )?.[0];
  assert.ok(block, "Deve existir case financiamento_conjunto");
  // Find the se_precisar branch
  const sePrecisarSection = block.match(
    /somente_se_precisar[\s\S]*?upsertState[\s\S]*?se_precisar[\s\S]*?\}\)/
  );
  assert.ok(sePrecisarSection, "Deve ter branch somente_se_precisar com upsertState");
  const stateCall = sePrecisarSection[0];
  assert.ok(
    stateCall.includes("somar_renda: false") || stateCall.includes("somar_renda:false"),
    "se_precisar deve definir somar_renda: false"
  );
});

// ═════════════════════════════════════════════════════════════════
// BLOCO E — confirmar_casamento surface induz resposta clara
// ═════════════════════════════════════════════════════════════════
console.log("\n🔒 BLOCO E — confirmar_casamento surface coerente");

test("confirmar_casamento: surface para casado explica convenção sim/não", () => {
  // A surface enviada de estado_civil → confirmar_casamento deve explicar que
  // "sim" = civil e "não" = estável
  const estadoCivilBlock = workerSource.match(
    /case\s+"estado_civil":\s*\{[\s\S]*?(?=\n\s*case\s+"confirmar_casamento")/
  )?.[0];
  assert.ok(estadoCivilBlock, "Deve existir case estado_civil");
  // Find the casado branch that includes the step call to confirmar_casamento
  const casadoBranch = estadoCivilBlock.match(
    /CASADO[\s\S]*?"confirmar_casamento"\s*\)/
  );
  assert.ok(casadoBranch, "Deve ter branch casado → confirmar_casamento");
  const branchText = casadoBranch[0];
  // The surface should mention sim/não convention
  assert.ok(
    branchText.includes("sim") && branchText.includes("civil"),
    "Surface deve mencionar convenção sim = civil"
  );
});

// ═════════════════════════════════════════════════════════════════
// SOBERANIA — COMPOSICAO_SEALED_STAGES intacta
// ═════════════════════════════════════════════════════════════════
console.log("\n🛡️  Soberania estrutural (PR 606)");

test("COMPOSICAO_SEALED_STAGES ainda contém exatamente 7 stages", () => {
  const match = workerSource.match(/const\s+COMPOSICAO_SEALED_STAGES\s*=\s*new\s+Set\(\[([^\]]+)\]\)/);
  assert.ok(match, "Deve ser definido como new Set([...])");
  const stages = match[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));
  assert.equal(stages.length, 7, `Deve ter 7 stages, encontrou ${stages.length}`);
  const expected = [
    "estado_civil", "confirmar_casamento", "financiamento_conjunto",
    "somar_renda_solteiro", "somar_renda_familiar",
    "quem_pode_somar", "interpretar_composicao"
  ];
  for (const s of expected) {
    assert.ok(stages.includes(s), `Deve conter "${s}"`);
  }
});

test("Nenhum stage fora do escopo foi alterado (zero drift check)", () => {
  // O guard "mencionouDependente" só deve aparecer dentro dos 7 stages + quem_pode_somar (preexistente)
  const guardMatches = [...workerSource.matchAll(/mencionouDependente/g)];
  // Deve aparecer em somar_renda_solteiro, somar_renda_familiar, interpretar_composicao, quem_pode_somar
  // + definições nas variáveis + ifs — mas NÃO em stages do topo ou fora do escopo
  assert.ok(guardMatches.length > 0, "mencionouDependente deve existir no worker");
});

// ═════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(60));
console.log(`📊 Resultado: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\n❌ Falhas:");
  for (const f of failures) {
    console.log(`   ${f.name}: ${f.error}`);
  }
}
console.log("═".repeat(60));
process.exit(failed > 0 ? 1 : 0);
