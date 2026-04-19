/**
 * sovereign_topo_surface_unification.smoke.mjs
 *
 * Smoke test: UNIFICAÇÃO SOBERANA DA SURFACE DO TOPO
 *
 * Prova que os 7 stages do topo operam sob uma única política soberana de surface:
 * 1. Todos os 7 stages estão em TOP_SEALED_STAGES
 * 2. TOP_SEALED_BUCKET_STAGES separa bucket-classified (3) de collection (4)
 * 3. renderCognitiveSpeech usa fallback por stage para collection stages
 * 4. getTopoHappyPathSpeech diferencia bucket validation de sealed protection
 * 5. Anti-repetição de saudação inter-turno ativo no step()
 * 6. Zero drift em gates/parser/nextStage
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name} — ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BLOCO A: 7 STAGES SELADOS
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── BLOCO A: TOP_SEALED_STAGES cobre todos os 7 stages do topo ──");

const ALL_TOPO_STAGES = [
  "inicio", "inicio_decisao", "inicio_programa",
  "inicio_nome", "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"
];

test("A1. TOP_SEALED_STAGES contém exatamente 7 stages do topo", () => {
  const match = workerSrc.match(/const TOP_SEALED_STAGES\s*=\s*new Set\(\[(.*?)\]\)/);
  assert.ok(match, "TOP_SEALED_STAGES must exist");
  for (const stage of ALL_TOPO_STAGES) {
    assert.ok(match[1].includes(`"${stage}"`), `${stage} must be in TOP_SEALED_STAGES`);
  }
});

test("A2. TOP_SEALED_BUCKET_STAGES contém apenas os 3 stages de abertura", () => {
  const match = workerSrc.match(/const TOP_SEALED_BUCKET_STAGES\s*=\s*new Set\(\[(.*?)\]\)/);
  assert.ok(match, "TOP_SEALED_BUCKET_STAGES must exist");
  assert.ok(match[1].includes('"inicio"'), "inicio must be in bucket stages");
  assert.ok(match[1].includes('"inicio_decisao"'), "inicio_decisao must be in bucket stages");
  assert.ok(match[1].includes('"inicio_programa"'), "inicio_programa must be in bucket stages");
  assert.ok(!match[1].includes('"inicio_nome"'), "inicio_nome must NOT be in bucket stages");
  assert.ok(!match[1].includes('"inicio_nacionalidade"'), "inicio_nacionalidade must NOT be in bucket stages");
  assert.ok(!match[1].includes('"inicio_rnm"'), "inicio_rnm must NOT be in bucket stages");
});

test("A3. TOP_SEALED_MODE está ativo", () => {
  assert.ok(/const TOP_SEALED_MODE\s*=\s*true;/.test(workerSrc), "TOP_SEALED_MODE must be true");
});

// ═══════════════════════════════════════════════════════════════════════
// BLOCO B: ELIMINAÇÃO DE CONVIVÊNCIA CONFUSA
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── BLOCO B: renderCognitiveSpeech com política soberana unificada ──");

test("B1. renderCognitiveSpeech tem split bucket vs stage fallback", () => {
  assert.ok(
    /TOP_SEALED_BUCKET_STAGES\.has\(stage\)/.test(workerSrc),
    "renderCognitiveSpeech must check TOP_SEALED_BUCKET_STAGES for split fallback"
  );
});

test("B2. renderCognitiveSpeech usa _MINIMAL_FALLBACK_SPEECH_MAP para collection stages", () => {
  // Verifica que existe um path com topo_sealed_stage_fallback
  assert.ok(
    /topo_sealed_stage_fallback/.test(workerSrc),
    "topo_sealed_stage_fallback render path must exist"
  );
});

test("B3. Transição inter-stage usa fallback do PRÓXIMO stage (não bucket static)", () => {
  assert.ok(
    /topo_sealed_transition_next/.test(workerSrc),
    "topo_sealed_transition_next render path must exist"
  );
  assert.ok(
    /_MINIMAL_FALLBACK_SPEECH_MAP\.get\(nextStage\)/.test(workerSrc),
    "transition must use _MINIMAL_FALLBACK_SPEECH_MAP.get(nextStage)"
  );
});

// ═══════════════════════════════════════════════════════════════════════
// BLOCO C: FALLBACK POR STAGE, NÃO GENÉRICO
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── BLOCO C: Fallback coerente por stage ──");

test("C1. _MINIMAL_FALLBACK_SPEECH_MAP tem fallback para inicio_nome (contém 'nome')", () => {
  const match = workerSrc.match(/\["inicio_nome",\s*"([^"]+)"\]/);
  assert.ok(match, "inicio_nome fallback must exist in map");
  assert.ok(/nome/i.test(match[1]), "inicio_nome fallback must mention 'nome'");
});

test("C2. _MINIMAL_FALLBACK_SPEECH_MAP tem fallback para inicio_nacionalidade (contém 'brasileiro/estrangeiro')", () => {
  const match = workerSrc.match(/\["inicio_nacionalidade",\s*"([^"]+)"\]/);
  assert.ok(match, "inicio_nacionalidade fallback must exist in map");
  assert.ok(/brasileir|estrangeir/i.test(match[1]), "inicio_nacionalidade fallback must mention nationality");
});

test("C3. _MINIMAL_FALLBACK_SPEECH_MAP tem fallback para inicio_rnm (contém 'RNM')", () => {
  const match = workerSrc.match(/\["inicio_rnm",\s*"([^"]+)"\]/);
  assert.ok(match, "inicio_rnm fallback must exist in map");
  assert.ok(/RNM/i.test(match[1]), "inicio_rnm fallback must mention 'RNM'");
});

test("C4. _MINIMAL_FALLBACK_SPEECH_MAP tem fallback para inicio_rnm_validade (contém 'validade/indeterminado')", () => {
  const match = workerSrc.match(/\["inicio_rnm_validade",\s*"([^"]+)"\]/);
  assert.ok(match, "inicio_rnm_validade fallback must exist in map");
  assert.ok(/validade|indeterminado/i.test(match[1]), "inicio_rnm_validade fallback must mention validity");
});

test("C5. getTopoHappyPathSpeech diferencia _isBucketSealed de _isSealed", () => {
  assert.ok(
    /const _isBucketSealed\s*=\s*_isSealed\s*&&\s*TOP_SEALED_BUCKET_STAGES/.test(workerSrc),
    "_isBucketSealed must be derived from _isSealed and TOP_SEALED_BUCKET_STAGES"
  );
});

test("C6. Bucket validation gated por _isBucketSealed (não _isSealed)", () => {
  assert.ok(
    /_isBucketSealed && !_isTopoBucketReplyCompatible/.test(workerSrc),
    "bucket validation must use _isBucketSealed, not _isSealed"
  );
});

test("C7. getTopoHappyPathSpeech sealed fallback split: bucket vs stage", () => {
  assert.ok(
    /TOPO_SEALED_STAGE_FALLBACK/.test(workerSrc),
    "TOPO_SEALED_STAGE_FALLBACK log tag must exist for stage-specific fallback path"
  );
});

// ═══════════════════════════════════════════════════════════════════════
// BLOCO D: ANTI-REPETIÇÃO DE SAUDAÇÃO
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── BLOCO D: Anti-repetição de saudação inter-turno ──");

test("D1. Anti-greeting instruction injected into LLM goal when previous turn greeted", () => {
  assert.ok(
    /REGRA ABSOLUTA.*turno anterior já saudou/i.test(workerSrc),
    "Anti-greeting LLM instruction must exist"
  );
});

test("D2. Anti-greeting post-render guardrail exists in step()", () => {
  assert.ok(
    /__topo_greeting_stripped_inter_turn/.test(workerSrc),
    "Greeting strip flag must exist in step()"
  );
});

test("D3. Anti-greeting guardrail checks last_bot_msg for previous greeting", () => {
  assert.ok(
    /last_bot_msg.*oi\|ol/.test(workerSrc) || /oi\|ol.*last_bot_msg/.test(workerSrc) || /_prevTurnGreeted/.test(workerSrc),
    "Anti-greeting must check last_bot_msg"
  );
});

// ═══════════════════════════════════════════════════════════════════════
// BLOCO E: PRESERVAÇÃO DO MECÂNICO SOBERANO
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── BLOCO E: Soberania mecânica preservada ──");

test("E1. inicio_programa sim → inicio_nome (gate preservado)", () => {
  const simToNome = /\/\/ ✅ JÁ CONHECE[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_nome"\s*\)/;
  assert.ok(simToNome.test(workerSrc), "sim block must advance to inicio_nome");
});

test("E2. inicio_nome nome_aceito → inicio_nacionalidade (gate preservado)", () => {
  const nomeToNac = /case "inicio_nome":[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_nacionalidade"\s*\)/;
  assert.ok(nomeToNac.test(workerSrc), "inicio_nome accepted name must advance to inicio_nacionalidade");
});

test("E3. inicio_nacionalidade brasileiro → estado_civil (gate preservado)", () => {
  const brToEC = /case "inicio_nacionalidade":[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"estado_civil"\s*\)/;
  assert.ok(brToEC.test(workerSrc), "inicio_nacionalidade brasileiro must advance to estado_civil");
});

test("E4. inicio_rnm:possui → inicio_rnm_validade (gate preservado)", () => {
  const rnmToVal = /case "inicio_rnm":[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"inicio_rnm_validade"\s*\)/;
  assert.ok(rnmToVal.test(workerSrc), "inicio_rnm possui must advance to inicio_rnm_validade");
});

test("E5. inicio_rnm_validade:indeterminado → estado_civil (gate preservado)", () => {
  const valToEC = /case "inicio_rnm_validade":[\s\S]*?return step\(\s*env,\s*st,[\s\S]*?"estado_civil"\s*\)/;
  assert.ok(valToEC.test(workerSrc), "inicio_rnm_validade indeterminado must advance to estado_civil");
});

test("E6. TOPO_HAPPY_PATH_SPEECH entries exist for all 7 topo stages", () => {
  const requiredKeys = [
    "inicio:", "inicio_decisao:", "inicio_programa:",
    "inicio_nome:", "inicio_nacionalidade:", "inicio_rnm:", "inicio_rnm_validade:"
  ];
  for (const key of requiredKeys) {
    assert.ok(
      workerSrc.includes(`"${key}`) || workerSrc.includes(`'${key}`),
      `TOPO_HAPPY_PATH_SPEECH must have entry starting with "${key}"`
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CONCORRÊNCIA DE CAMADAS: PROVA DE REDUÇÃO
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── PROVA: Redução de concorrência entre camadas ──");

test("P1. cognitiveAssist bloqueado para TODOS os 7 stages (via TOP_SEALED_STAGES)", () => {
  // cognitiveAssist block usa TOP_SEALED_STAGES.has(stage) — expandido agora
  const blockPattern = /TOP_SEALED_MODE\s*&&\s*TOP_SEALED_STAGES\.has\(stage\)[\s\S]*?__cognitive_reply_prefix\s*=\s*null/;
  assert.ok(blockPattern.test(workerSrc), "cognitiveAssist block must exist and use TOP_SEALED_STAGES");
});

test("P2. Retry instruction gated por _isBucketSealed (não genérica)", () => {
  // Verifica que o retry usa _isBucketSealed para decidir se injeta bucket instruction
  assert.ok(
    /_isBucketSealed[\s\S]*?_getTopoBucketRetryInstruction/.test(workerSrc),
    "Retry instruction must be gated by _isBucketSealed"
  );
});

test("P3. Política clara de render: soberano → bucket/stage fallback → last resort", () => {
  // A hierarquia: _SOVEREIGN_SOURCES check first, then TOP_SEALED check, then extreme_fallback
  const hierarchyPattern = /_SOVEREIGN_SOURCES\.has\(arbiterSource\)[\s\S]*?TOP_SEALED_STAGES\.has\(stage\)[\s\S]*?extreme_fallback/;
  assert.ok(hierarchyPattern.test(workerSrc), "Render hierarchy must follow: sovereign → sealed → extreme_fallback");
});

// ── Summary ──
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (total: ${passed + failed})\n`);
if (failed > 0) {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED — Surface soberana do topo unificada");
}
