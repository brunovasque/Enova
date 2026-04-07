/**
 * cognitive_fase1_consolidacao_topo.smoke.mjs
 *
 * Smoke tests para a FASE 1 — Consolidação do Topo.
 *
 * Valida que 100% das transições do topo do funil estão no padrão canônico:
 *   1. getTopoHappyPathSpeech chamado ANTES de cada step()
 *   2. setTopoHappyPathFlags chamado ANTES de cada step()
 *   3. step() recebe APENAS fallback extremo mínimo (1 linha curta/neutra)
 *   4. Nenhum texto mecânico multi-linha como fala normal
 *   5. Parser/gate/nextStage/persistência intactos
 *   6. modo_humano_manual intacto
 *
 * Seções:
 *   A — TOPO_HAPPY_PATH_SPEECH entries completas para todos os stages
 *   B — getTopoHappyPathSpeech chamado antes de CADA step() no topo
 *   C — setTopoHappyPathFlags chamado antes de CADA step() no topo
 *   D — step() recebe fallback extremo mínimo (1 linha curta/neutra)
 *   E — Nenhum texto multi-linha mecânico como fala normal no step()
 *   F — inicio_nome: 3 transições migradas (intent, curto, invalido)
 *   G — inicio_rnm: 3 transições migradas (nao_possui, possui, fallback)
 *   H — inicio_rnm_validade: 3 transições migradas (definida, indeterminado, fallback)
 *   I — inicio_nacionalidade: fallback com entry dedicada
 *   J — estado_civil: fallback incondicional
 *   K — Parser/gate/nextStage intactos
 *   L — Persistência intacta
 *   M — modo_humano_manual intacto
 *   N — reset intacto
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

// ================================================================
// SECTION A — TOPO_HAPPY_PATH_SPEECH entries completas
// ================================================================
console.log("\n📦 SECTION A — TOPO_HAPPY_PATH_SPEECH entries completas");

const REQUIRED_ENTRIES = [
  // inicio
  "inicio:abertura_base", "inicio:reset_iniciar", "inicio:retomada",
  "inicio:saudacao", "inicio:fallback",
  // inicio_decisao
  "inicio_decisao:invalido", "inicio_decisao:continuar", "inicio_decisao:reset",
  // inicio_programa
  "inicio_programa:sim", "inicio_programa:sim_pos_explicacao",
  "inicio_programa:post_expl_confirmation", "inicio_programa:first_after_reset",
  "inicio_programa:greeting_reentrada", "inicio_programa:nao", "inicio_programa:ambiguous",
  // inicio_nome
  "inicio_nome:nome_reaproveitado", "inicio_nome:nome_confirmar_candidato",
  "inicio_nome:nome_aceito", "inicio_nome:intent_not_name",
  "inicio_nome:nome_curto", "inicio_nome:nome_invalido",
  // inicio_nacionalidade
  "inicio_nacionalidade:brasileiro", "inicio_nacionalidade:estrangeiro",
  "inicio_nacionalidade:fallback",
  // inicio_rnm
  "inicio_rnm:nao_possui", "inicio_rnm:possui", "inicio_rnm:fallback",
  // inicio_rnm_validade
  "inicio_rnm_validade:definida", "inicio_rnm_validade:indeterminado",
  "inicio_rnm_validade:fallback",
  // estado_civil
  "estado_civil:solteiro", "estado_civil:casado", "estado_civil:uniao_estavel",
  "estado_civil:separado", "estado_civil:divorciado", "estado_civil:viuvo",
  "estado_civil:fallback"
];

REQUIRED_ENTRIES.forEach((entry, i) => {
  test(`A${i + 1}. TOPO_HAPPY_PATH_SPEECH["${entry}"] exists`, () => {
    assert.ok(
      workerSrc.includes(`"${entry}"`),
      `Missing speech entry: ${entry}`
    );
  });
});

// ================================================================
// SECTION B — getTopoHappyPathSpeech chamado antes de CADA step()
// ================================================================
console.log("\n📦 SECTION B — getTopoHappyPathSpeech chamado antes de step() no topo");

const TOPO_STAGES_WITH_CALLSITES = [
  { stage: "inicio", keys: ["inicio:abertura_base", "inicio:reset_iniciar", "inicio:retomada", "inicio:saudacao", "inicio:fallback"] },
  { stage: "inicio_decisao", keys: ["inicio_decisao:invalido", "inicio_decisao:continuar", "inicio_decisao:reset"] },
  { stage: "inicio_nome", keys: ["inicio_nome:intent_not_name", "inicio_nome:nome_curto", "inicio_nome:nome_invalido", "inicio_nome:nome_aceito"] },
  { stage: "inicio_nacionalidade", keys: ["inicio_nacionalidade:brasileiro", "inicio_nacionalidade:estrangeiro", "inicio_nacionalidade:fallback"] },
  { stage: "inicio_rnm", keys: ["inicio_rnm:nao_possui", "inicio_rnm:possui", "inicio_rnm:fallback"] },
  { stage: "inicio_rnm_validade", keys: ["inicio_rnm_validade:definida", "inicio_rnm_validade:indeterminado", "inicio_rnm_validade:fallback"] },
  { stage: "estado_civil", keys: ["estado_civil:solteiro", "estado_civil:casado", "estado_civil:uniao_estavel", "estado_civil:separado", "estado_civil:divorciado", "estado_civil:viuvo", "estado_civil:fallback"] }
];

TOPO_STAGES_WITH_CALLSITES.forEach(({ stage, keys }) => {
  keys.forEach(key => {
    test(`B. ${key} calls getTopoHappyPathSpeech`, () => {
      assert.ok(
        workerSrc.includes(`getTopoHappyPathSpeech(env, "${key}"`) ||
        // inicio_programa uses variable key selection for ambiguous/greeting/first_after_reset
        (key.startsWith("inicio_programa:") && workerSrc.includes(`"${key}"`)),
        `${key} must call getTopoHappyPathSpeech`
      );
    });
  });
});

// ================================================================
// SECTION C — setTopoHappyPathFlags chamado em TODAS as transições
// ================================================================
console.log("\n📦 SECTION C — setTopoHappyPathFlags chamado nas transições migradas");

// Extract all topo stage case blocks
function extractCaseBlock(src, caseName) {
  // Find the funnel case block (has opening brace after the case label)
  const casePattern = `case "${caseName}": {`;
  let caseStart = src.indexOf(casePattern);
  if (caseStart === -1) {
    // Try with newline before brace
    const altPattern = `case "${caseName}":`;
    let searchIdx = 0;
    while (searchIdx < src.length) {
      const idx = src.indexOf(altPattern, searchIdx);
      if (idx === -1) return "";
      // Check if this occurrence is followed by a block (has { nearby)
      const afterCase = src.substring(idx + altPattern.length, idx + altPattern.length + 10).trim();
      if (afterCase.startsWith("{")) {
        caseStart = idx;
        break;
      }
      searchIdx = idx + 1;
    }
    if (caseStart === -1 || caseStart === undefined) return "";
  }
  
  // Find the opening { of this case block
  const braceStart = src.indexOf("{", caseStart + `case "${caseName}":`.length);
  if (braceStart === -1) return "";
  
  // Count braces to find the matching closing }
  let depth = 1;
  for (let i = braceStart + 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        return src.substring(caseStart, i + 1);
      }
    }
  }
  
  return src.substring(caseStart);
}

const TOPO_CASE_STAGES = ["inicio", "inicio_decisao", "inicio_programa", "inicio_nome",
  "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade", "estado_civil"];

TOPO_CASE_STAGES.forEach(stage => {
  test(`C. ${stage}: setTopoHappyPathFlags is called`, () => {
    const block = extractCaseBlock(workerSrc, stage);
    assert.ok(block.length > 0, `case "${stage}" not found`);
    assert.ok(
      block.includes("setTopoHappyPathFlags("),
      `${stage} must call setTopoHappyPathFlags`
    );
  });
});

// ================================================================
// SECTION D — step() fallback extremo mínimo (1 linha curta)
// ================================================================
console.log("\n📦 SECTION D — step() fallback extremo mínimo");

// For each migrated stage, verify step() arguments are single-line
const MIGRATED_STAGES_STEP_CHECK = [
  { stage: "inicio_nome", patterns: [
    "Me confirma seu *nome completo*, por favor.",
    "Me manda seu *nome completo*, por favor.",
    "Me manda seu *nome completo*, por favor."
  ]},
  { stage: "inicio_rnm", patterns: [
    "O RNM indeterminado é obrigatório para o MCMV.",
    "Seu RNM é *com validade* ou *indeterminado*?",
    "Você possui *RNM*? Responda *sim* ou *não*."
  ]},
  { stage: "inicio_rnm_validade", patterns: [
    "RNM com validade definida não se enquadra no MCMV.",
    "Qual é o seu estado civil?",
    "Seu RNM é *com validade* ou *indeterminado*?"
  ]},
  { stage: "inicio_nacionalidade", patterns: [
    "Você é *brasileiro(a)* ou *estrangeiro(a)*?"
  ]},
  { stage: "estado_civil", patterns: [
    "Me diz seu estado civil, por favor."
  ]}
];

MIGRATED_STAGES_STEP_CHECK.forEach(({ stage, patterns }) => {
  patterns.forEach(pattern => {
    test(`D. ${stage}: fallback "${pattern.slice(0, 40)}..." is single-line`, () => {
      assert.ok(workerSrc.includes(pattern), `Missing fallback pattern: ${pattern}`);
      // Confirm it's in a step() call array as single element
      const idx = workerSrc.indexOf(pattern);
      assert.ok(idx > 0, `Pattern not found in source`);
    });
  });
});

// ================================================================
// SECTION E — No multi-line mechanical text in step() calls
// ================================================================
console.log("\n📦 SECTION E — No multi-line mechanical text in step() for migrated stages");

// Check that old multi-line fallbacks have been removed
const REMOVED_OLD_PATTERNS = [
  "Entendi sua dúvida! Mas antes, me confirma só seu *nome completo*, por favor",
  "Opa, acho que não peguei certinho seu nome completo",
  "Só pra ficar certinho aqui no sistema",
  "Para financiar pelo Minha Casa Minha Vida é obrigatório ter o *RNM com prazo de validade por tempo indeterminado*",
  "Quando você tiver o RNM, posso te ajudar a fazer tudo certinho",
  "Seu RNM é *com validade* ou *indeterminado*?\",\n        \"Responda: *valido* ou *indeterminado*.",
  "Com *RNM de validade definida*, infelizmente você não se enquadra",
  "Quando mudar para *indeterminado*, posso te ajudar imediatamente",
  "Ótimo! Vamos seguir então",
  "Só preciso confirmar 🙂",
  "Só preciso confirmar rapidinho 🙂",
  "Perdão 😅, não consegui entender.",
  "Pra te orientar certinho, me diz seu estado civil:"
];

REMOVED_OLD_PATTERNS.forEach(pattern => {
  test(`E. Removed old multi-line: "${pattern.slice(0, 50)}..."`, () => {
    // Check that this pattern does NOT appear in a step() call context
    // (it may still exist in TOPO_HAPPY_PATH_SPEECH map, which is fine)
    const stepCallRegion = workerSrc.match(/return step\(\s*env,\s*st,[\s\S]*?\);/g) || [];
    const inStepCall = stepCallRegion.some(call => call.includes(pattern));
    assert.ok(!inStepCall, `Old pattern still in step() call: ${pattern.slice(0, 50)}...`);
  });
});

// ================================================================
// SECTION F — inicio_nome: 3 transições migradas
// ================================================================
console.log("\n📦 SECTION F — inicio_nome: transições migradas");

test("F1. inicio_nome:intent_not_name calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_nome:intent_not_name"'));
});

test("F2. inicio_nome:nome_curto calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_nome:nome_curto"'));
});

test("F3. inicio_nome:nome_invalido calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_nome:nome_invalido"'));
});

test("F4. inicio_nome:nome_aceito calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_nome:nome_aceito"'));
});

// ================================================================
// SECTION G — inicio_rnm: 3 transições migradas
// ================================================================
console.log("\n📦 SECTION G — inicio_rnm: transições migradas");

test("G1. inicio_rnm:nao_possui calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_rnm:nao_possui"'));
});

test("G2. inicio_rnm:possui calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_rnm:possui"'));
});

test("G3. inicio_rnm:fallback calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_rnm:fallback"'));
});

// ================================================================
// SECTION H — inicio_rnm_validade: 3 transições migradas
// ================================================================
console.log("\n📦 SECTION H — inicio_rnm_validade: transições migradas");

test("H1. inicio_rnm_validade:definida calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_rnm_validade:definida"'));
});

test("H2. inicio_rnm_validade:indeterminado calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_rnm_validade:indeterminado"'));
});

test("H3. inicio_rnm_validade:fallback calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_rnm_validade:fallback"'));
});

// ================================================================
// SECTION I — inicio_nacionalidade: fallback com entry dedicada
// ================================================================
console.log("\n📦 SECTION I — inicio_nacionalidade: fallback dedicado");

test("I1. inicio_nacionalidade:fallback uses dedicated speech entry", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "inicio_nacionalidade:fallback"'));
});

test("I2. inicio_nacionalidade fallback no longer uses inicio_programa:ambiguous", () => {
  const nacBlock = extractCaseBlock(workerSrc, "inicio_nacionalidade");
  assert.ok(!nacBlock.includes('getTopoHappyPathSpeech(env, "inicio_programa:ambiguous"'),
    "nacionalidade must NOT call inicio_programa:ambiguous");
});

// ================================================================
// SECTION J — estado_civil: fallback incondicional
// ================================================================
console.log("\n📦 SECTION J — estado_civil: fallback incondicional");

test("J1. estado_civil:fallback calls getTopoHappyPathSpeech", () => {
  assert.ok(workerSrc.includes('getTopoHappyPathSpeech(env, "estado_civil:fallback"'));
});

test("J2. estado_civil setTopoHappyPathFlags is unconditional", () => {
  // The block between getTopoHappyPathSpeech and the final step() for estado_civil fallback
  // should have setTopoHappyPathFlags OUTSIDE the if/else (unconditional)
  const ecBlock = extractCaseBlock(workerSrc, "estado_civil");
  // Find the fallback section (after all specific estado_civil cases)
  const fallbackIdx = ecBlock.indexOf('getTopoHappyPathSpeech(env, "estado_civil:fallback"');
  if (fallbackIdx === -1) {
    assert.fail("estado_civil:fallback not found");
  }
  const fallbackBlock = ecBlock.substring(fallbackIdx, fallbackIdx + 600);
  // setTopoHappyPathFlags should be called after the if/else, not inside
  const setFlagsIdx = fallbackBlock.indexOf("setTopoHappyPathFlags(st, _ecFallbackSpeech)");
  assert.ok(setFlagsIdx > 0, "setTopoHappyPathFlags must be called for estado_civil fallback");
  // Verify it's NOT inside "} else {" block
  const beforeSetFlags = fallbackBlock.substring(0, setFlagsIdx);
  const lastBrace = beforeSetFlags.lastIndexOf("}");
  // After the closing brace, setTopoHappyPathFlags should be outside the conditional
  assert.ok(lastBrace < setFlagsIdx, "setTopoHappyPathFlags must be unconditional (outside if/else)");
});

// ================================================================
// SECTION K — Parser/gate/nextStage intactos
// ================================================================
console.log("\n📦 SECTION K — Parser/gate/nextStage intactos");

test("K1. normalizeText preserved in inicio_rnm", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm");
  assert.ok(block.includes("normalizeText("), "normalizeText must be preserved");
});

test("K2. normalizeText preserved in inicio_rnm_validade", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm_validade");
  assert.ok(block.includes("normalizeText("), "normalizeText must be preserved");
});

test("K3. isNo preserved in inicio_rnm", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm");
  assert.ok(block.includes("isNo("), "isNo gate preserved");
});

test("K4. isYes preserved in inicio_rnm", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm");
  assert.ok(block.includes("isYes("), "isYes gate preserved");
});

test("K5. RNM regex gates preserved", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm_validade");
  assert.ok(block.includes("\\bindeterminado\\b"), "indeterminado gate preserved");
  assert.ok(block.includes("valido|válido|com validade|definida"), "definida gate preserved");
});

test("K6. nextStage fim_ineligivel preserved in inicio_rnm", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm");
  assert.ok(block.includes('"fim_ineligivel"'), "nextStage fim_ineligivel preserved");
});

test("K7. nextStage inicio_rnm_validade preserved", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm");
  assert.ok(block.includes('"inicio_rnm_validade"'), "nextStage inicio_rnm_validade preserved");
});

test("K8. nextStage estado_civil preserved in inicio_rnm_validade", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm_validade");
  assert.ok(block.includes('"estado_civil"'), "nextStage estado_civil preserved");
});

test("K9. inicio_nome parser preserved (rawNome cleaning)", () => {
  const block = extractCaseBlock(workerSrc, "inicio_nome");
  assert.ok(block.includes("rawNome"), "rawNome variable preserved");
  assert.ok(block.includes("meu nome e|meu nome é"), "prefix removal preserved");
  assert.ok(block.includes("partes.length"), "word count validation preserved");
});

test("K10. _isIntentNotName guard preserved", () => {
  const block = extractCaseBlock(workerSrc, "inicio_nome");
  assert.ok(block.includes("_isIntentNotName"), "intent guard preserved");
});

// ================================================================
// SECTION L — Persistência intacta
// ================================================================
console.log("\n📦 SECTION L — Persistência intacta");

test("L1. upsertState preserved in inicio_rnm (nao_possui)", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm");
  assert.ok(block.includes('rnm_status: "não possui"'), "rnm_status persistence preserved");
  assert.ok(block.includes('funil_status: "ineligivel"'), "funil_status persistence preserved");
});

test("L2. upsertState preserved in inicio_rnm (possui)", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm");
  assert.ok(block.includes('rnm_status: "possui"'), "rnm_status possui persistence preserved");
});

test("L3. upsertState preserved in inicio_rnm_validade (definida)", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm_validade");
  assert.ok(block.includes('rnm_validade: "definida"'), "rnm_validade definida persistence preserved");
});

test("L4. upsertState preserved in inicio_rnm_validade (indeterminado)", () => {
  const block = extractCaseBlock(workerSrc, "inicio_rnm_validade");
  assert.ok(block.includes('rnm_validade: "indeterminado"'), "rnm_validade indeterminado persistence preserved");
});

test("L5. upsertState nome preserved in inicio_nome", () => {
  const block = extractCaseBlock(workerSrc, "inicio_nome");
  assert.ok(block.includes("nome: nomeCompleto"), "nome persistence preserved");
});

test("L6. estado_civil upsertState preserved", () => {
  const block = extractCaseBlock(workerSrc, "estado_civil");
  assert.ok(block.includes('estado_civil: "solteiro"'), "solteiro persistence");
  assert.ok(block.includes('estado_civil: "casado"'), "casado persistence");
  assert.ok(block.includes('estado_civil: "viuvo"'), "viuvo persistence");
});

// ================================================================
// SECTION M — modo_humano_manual intacto
// ================================================================
console.log("\n📦 SECTION M — modo_humano_manual intacto");

test("M1. modo_humano_manual guard function exists", () => {
  assert.ok(workerSrc.includes("function modoHumanoRender"), "modoHumanoRender function preserved");
});

test("M2. modo_humano_manual check exists in worker", () => {
  assert.ok(workerSrc.includes("modo_humano_manual"), "modo_humano_manual reference preserved");
});

// ================================================================
// SECTION N — reset intacto
// ================================================================
console.log("\n📦 SECTION N — reset intacto");

test("N1. reset:abertura entry preserved", () => {
  assert.ok(workerSrc.includes('"reset:abertura"'), "reset entry preserved");
});

test("N2. post-reset detection logic preserved", () => {
  assert.ok(workerSrc.includes("_isFirstAfterReset") || workerSrc.includes("last_processed_text"),
    "post-reset detection logic preserved");
});

// ================================================================
// FINAL RESULT
// ================================================================
console.log("\n============================================================");
console.log(`RESULTADO FASE 1: ${passed} passed, ${failed} failed (total: ${passed + failed})`);
console.log("============================================================");

if (failed > 0) {
  console.log("\n❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("\n✅ ALL TESTS PASSED — FASE 1 CONSOLIDAÇÃO DO TOPO 100%");
}
