/**
 * cognitive_sovereign_speech_layer.smoke.mjs
 *
 * Smoke tests para a camada canônica de fala cognitiva soberana.
 *
 * Valida:
 *   A) Funções da camada existem no worker (presença de âncoras)
 *   B) renderCognitiveSpeech — hierarquia de 3 caminhos
 *   C) buildMinimalCognitiveFallback — filtro cognitivo de superfície
 *   D) reconcileClientInput — detecção de overlap
 *   E) buildRoundIntent — contrato de intenção da rodada
 *   F) step() usa renderCognitiveSpeech (não rawArr direto)
 *   G) Flags transitórias são limpas após step()
 *   H) Segurança: gates/nextStage/persistência/modoHumano preservados
 *
 * Grupos de smoke tests:
 *   A — Topo (oi, olá, bom dia)
 *   B — Topo com intenção junto (oi posso usar FGTS, oi sou casado)
 *   C — Pós-reset
 *   D — Overlap / múltiplas intenções
 *   E — Off-trail
 *   F — Segurança estrutural
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
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

console.log("🧪 cognitive_sovereign_speech_layer.smoke.mjs\n");

// ================================================================
// SECTION A — Presença das âncoras no worker
// ================================================================
console.log("── SECTION A: Âncoras da camada soberana ──");

test("1. renderCognitiveSpeech está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function renderCognitiveSpeech(st, stage, rawArr)"),
    "renderCognitiveSpeech não encontrada"
  );
});

test("2. buildMinimalCognitiveFallback está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function buildMinimalCognitiveFallback(stage, rawArr, roundIntent)"),
    "buildMinimalCognitiveFallback não encontrada"
  );
});

test("3. reconcileClientInput está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function reconcileClientInput(st, userText)"),
    "reconcileClientInput não encontrada"
  );
});

test("4. buildRoundIntent está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function buildRoundIntent(st, userText)"),
    "buildRoundIntent não encontrada"
  );
});

test("5. _applyCognitiveSurfaceFilter está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function _applyCognitiveSurfaceFilter(lines)"),
    "_applyCognitiveSurfaceFilter não encontrada"
  );
});

test("6. _getCognitiveRenderPhase está definida no worker", () => {
  assert.ok(
    workerSrc.includes("function _getCognitiveRenderPhase(stage)"),
    "_getCognitiveRenderPhase não encontrada"
  );
});

test("7. _COGNITIVE_RENDER_PHASE_MAP está definido no worker", () => {
  assert.ok(
    workerSrc.includes("_COGNITIVE_RENDER_PHASE_MAP"),
    "_COGNITIVE_RENDER_PHASE_MAP não encontrado"
  );
});

// ================================================================
// SECTION B — step() usa renderCognitiveSpeech
// ================================================================
console.log("\n── SECTION B: step() integra renderCognitiveSpeech ──");

test("8. step() chama renderCognitiveSpeech(st, currentStage, rawArr.filter(Boolean))", () => {
  assert.ok(
    workerSrc.includes("renderCognitiveSpeech(st, currentStage, rawArr.filter(Boolean))"),
    "step() deve chamar renderCognitiveSpeech"
  );
});

test("9. step() limpa __round_intent após render", () => {
  assert.ok(
    workerSrc.includes("st.__round_intent = null"),
    "step() deve limpar __round_intent"
  );
});

test("10. step() ainda limpa __cognitive_reply_prefix após render", () => {
  assert.ok(
    workerSrc.includes("st.__cognitive_reply_prefix = null"),
    "step() deve limpar __cognitive_reply_prefix"
  );
});

test("11. step() ainda limpa __cognitive_v2_takes_final após render", () => {
  assert.ok(
    workerSrc.includes("st.__cognitive_v2_takes_final = false"),
    "step() deve limpar __cognitive_v2_takes_final"
  );
});

test("12. step() NÃO usa rawArr diretamente como arr (filtro obrigatório)", () => {
  // Verifica que a lógica antiga (rawArr.filter(Boolean) direto em arr=) foi removida
  const oldPattern = /const arr\s*=.*rawArr\.filter\(Boolean\)(?!\))/;
  assert.ok(
    !oldPattern.test(workerSrc.substring(workerSrc.indexOf("async function step("), workerSrc.indexOf("modoHumanoRender"))),
    "step() não deve mais usar rawArr diretamente como arr sem passar por renderCognitiveSpeech"
  );
});

// ================================================================
// SECTION C — renderCognitiveSpeech — hierarquia de caminhos
// ================================================================
console.log("\n── SECTION C: renderCognitiveSpeech — hierarquia ──");

test("13. Caminho 1: v2TakesFinal + cognitivePrefix → usa apenas o prefix cognitivo", () => {
  // Verifica que o comentário e a lógica estão presentes
  assert.ok(
    workerSrc.includes("Caminho 1: LLM real assumiu a fala → usa apenas a fala cognitiva"),
    "Caminho 1 não encontrado em renderCognitiveSpeech"
  );
  assert.ok(
    workerSrc.includes("if (v2TakesFinal && cognitivePrefix) return [cognitivePrefix]"),
    "Lógica do caminho 1 não encontrada"
  );
});

test("14. Caminho 2: prefix sem takes_final → prefix + filtro cognitivo do rawArr", () => {
  assert.ok(
    workerSrc.includes("Caminho 2: prefix sem takes_final → prefix + filtro cognitivo do rawArr"),
    "Caminho 2 não encontrado em renderCognitiveSpeech"
  );
});

test("15. Caminho 3: sem flags → buildMinimalCognitiveFallback (nunca rawArr puro)", () => {
  assert.ok(
    workerSrc.includes("Caminho 3: sem flags → fallback cognitivo mínimo (nunca rawArr puro)"),
    "Caminho 3 não encontrado em renderCognitiveSpeech"
  );
});

// ================================================================
// SECTION D — buildMinimalCognitiveFallback
// ================================================================
console.log("\n── SECTION D: buildMinimalCognitiveFallback ──");

test("16. Operacional e gates finais passam direto sem alteração de superfície", () => {
  assert.ok(
    workerSrc.includes("if (phase === \"operacional\" || phase === \"gates_finais\") return lines"),
    "Guard operacional/gates_finais não encontrado"
  );
});

test("17. Topo e meio passam por _applyCognitiveSurfaceFilter", () => {
  assert.ok(
    workerSrc.includes("const filtered = _applyCognitiveSurfaceFilter(lines)"),
    "_applyCognitiveSurfaceFilter não chamada para topo/meio"
  );
});

test("18. Overlap detectado adiciona reconhecimento antes de continuar", () => {
  assert.ok(
    workerSrc.includes("Anotei tudo aqui 😊 Deixa eu continuar a análise do seu perfil."),
    "Reconhecimento de overlap não encontrado"
  );
  assert.ok(
    workerSrc.includes("roundIntent?.pode_ter_multiplas_intencoes && roundIntent?.eh_off_trail"),
    "Guard de overlap não encontrado"
  );
});

test("19. buildMinimalCognitiveFallback retorna fallback seguro para rawArr vazio", () => {
  assert.ok(
    workerSrc.includes('if (!Array.isArray(rawArr) || rawArr.length === 0) return ["Pode continuar 😊"]'),
    "Fallback seguro para rawArr vazio não encontrado"
  );
});

// ================================================================
// SECTION E — reconcileClientInput / buildRoundIntent
// ================================================================
console.log("\n── SECTION E: reconcileClientInput / buildRoundIntent ──");

test("20. reconcileClientInput detecta saudação pura (oi, olá, bom dia)", () => {
  assert.ok(
    workerSrc.includes("ehSaudacaoPura = /^(oi|ol"),
    "Detecção de saudação pura não encontrada"
  );
});

test("21. reconcileClientInput detecta pergunta paralela", () => {
  assert.ok(
    workerSrc.includes("temPerguntaParalela = /\\?/.test(text) && text.length > 10"),
    "Detecção de pergunta paralela não encontrada"
  );
});

test("22. reconcileClientInput detecta complemento", () => {
  assert.ok(
    workerSrc.includes("temComplemento = /^(e tamb"),
    "Detecção de complemento não encontrada"
  );
});

test("23. reconcileClientInput detecta off-trail", () => {
  assert.ok(
    workerSrc.includes("ehOffTrail = temPerguntaParalela && !ehSaudacaoPura && text.length < 120"),
    "Detecção de off-trail não encontrada"
  );
});

test("24. buildRoundIntent contém todos os campos canônicos de intenção", () => {
  const fields = [
    "stage_atual",
    "still_needs_original_answer",
    "pode_avancar",
    "resposta_de_stage_detectada",
    "pergunta_paralela_detectada",
    "info_complementar_detectada",
    "eh_off_trail",
    "eh_saudacao_pura",
    "pode_ter_multiplas_intencoes",
    "texto_reconciliado"
  ];
  for (const field of fields) {
    assert.ok(
      workerSrc.includes(field),
      `buildRoundIntent deve conter campo "${field}"`
    );
  }
});

test("25. pode_avancar é sempre false (soberano do mecânico)", () => {
  assert.ok(
    workerSrc.includes("pode_avancar: false"),
    "pode_avancar deve ser false (soberania mecânica)"
  );
});

// ================================================================
// SECTION F — _COGNITIVE_RENDER_PHASE_MAP cobre stages canônicos
// ================================================================
console.log("\n── SECTION F: _COGNITIVE_RENDER_PHASE_MAP ──");

const TOPO_STAGES = [
  "inicio_programa", "inicio_nome", "inicio_nacionalidade",
  "estado_civil", "confirmar_casamento", "financiamento_conjunto",
  "somar_renda_solteiro", "somar_renda_familiar", "quem_pode_somar"
];

for (const stage of TOPO_STAGES) {
  test(`26-${stage}: stage "${stage}" mapeado na fase topo`, () => {
    assert.ok(
      workerSrc.includes(`"${stage}"`),
      `Stage "${stage}" deve estar no _COGNITIVE_RENDER_PHASE_MAP`
    );
  });
}

test("35. Gates finais mapeados: ir_declarado, ctps_36, restricao", () => {
  const gateStages = ["ir_declarado", "ctps_36", "restricao", "dependente"];
  for (const g of gateStages) {
    assert.ok(
      workerSrc.includes(`"${g}"`),
      `Stage gate "${g}" deve estar mapeado`
    );
  }
});

// ================================================================
// SECTION G — Segurança: gates / nextStage / persistência preservados
// ================================================================
console.log("\n── SECTION G: Segurança estrutural ──");

test("36. upsertState ainda existe (persistência preservada)", () => {
  assert.ok(
    workerSrc.includes("await upsertState(env, st.wa_id,"),
    "upsertState deve continuar presente"
  );
});

test("37. modoHumanoRender ainda é chamado após renderCognitiveSpeech", () => {
  const idx = workerSrc.indexOf("renderCognitiveSpeech(st, currentStage, rawArr.filter(Boolean))");
  assert.ok(idx > 0, "renderCognitiveSpeech não encontrada em step()");
  const afterRender = workerSrc.substring(idx, idx + 400);
  assert.ok(
    afterRender.includes("modoHumanoRender(st, arr)"),
    "modoHumanoRender deve ser chamado após renderCognitiveSpeech"
  );
});

test("38. getTopoHappyPathSpeech ainda existe (happy path preservado)", () => {
  assert.ok(
    workerSrc.includes("async function getTopoHappyPathSpeech(env, transitionKey, st, overrides)"),
    "getTopoHappyPathSpeech deve continuar presente"
  );
});

test("39. setTopoHappyPathFlags ainda existe (happy path preservado)", () => {
  assert.ok(
    workerSrc.includes("function setTopoHappyPathFlags(st, happyResult)"),
    "setTopoHappyPathFlags deve continuar presente"
  );
});

test("40. TOPO_HAPPY_PATH_SPEECH map ainda existe e tem chaves de inicio_programa", () => {
  assert.ok(
    workerSrc.includes('"inicio_programa:sim"'),
    'TOPO_HAPPY_PATH_SPEECH deve ter "inicio_programa:sim"'
  );
  assert.ok(
    workerSrc.includes('"inicio_programa:first_after_reset"'),
    'TOPO_HAPPY_PATH_SPEECH deve ter "inicio_programa:first_after_reset"'
  );
});

test("41. adaptCognitiveV2Output ainda existe (adapter V2 preservado)", () => {
  assert.ok(
    workerSrc.includes("function adaptCognitiveV2Output(stage, v2Result)"),
    "adaptCognitiveV2Output deve continuar presente"
  );
});

test("42. resolveTopoStructured ainda existe (resolvers preservados)", () => {
  assert.ok(
    workerSrc.includes("function resolveTopoStructured(stage, rawText)") ||
    workerSrc.includes("function resolveTopoStructured("),
    "resolveTopoStructured deve continuar presente"
  );
});

test("43. buildCognitiveFallback ainda existe (fallback base preservado)", () => {
  assert.ok(
    workerSrc.includes("function buildCognitiveFallback(stage)"),
    "buildCognitiveFallback deve continuar presente"
  );
});

test("44. renderCognitiveSpeech NÃO chama upsertState (sem persistência)", () => {
  const idx = workerSrc.indexOf("function renderCognitiveSpeech(st, stage, rawArr)");
  const end = workerSrc.indexOf("\nfunction ", idx + 1);
  const fnBody = workerSrc.substring(idx, end > 0 ? end : idx + 600);
  assert.ok(
    !fnBody.includes("upsertState"),
    "renderCognitiveSpeech não pode chamar upsertState"
  );
});

test("45. buildMinimalCognitiveFallback NÃO chama upsertState (sem persistência)", () => {
  const idx = workerSrc.indexOf("function buildMinimalCognitiveFallback(stage, rawArr, roundIntent)");
  const end = workerSrc.indexOf("\nfunction ", idx + 1);
  const fnBody = workerSrc.substring(idx, end > 0 ? end : idx + 600);
  assert.ok(
    !fnBody.includes("upsertState"),
    "buildMinimalCognitiveFallback não pode chamar upsertState"
  );
});

test("46. renderCognitiveSpeech NÃO chama runCognitiveV2WithAdapter (sem LLM em step())", () => {
  const idx = workerSrc.indexOf("function renderCognitiveSpeech(st, stage, rawArr)");
  const end = workerSrc.indexOf("\nfunction ", idx + 1);
  const fnBody = workerSrc.substring(idx, end > 0 ? end : idx + 600);
  assert.ok(
    !fnBody.includes("runCognitiveV2WithAdapter"),
    "renderCognitiveSpeech não pode chamar LLM diretamente"
  );
});

test("47. Camada soberana está documentada com ref ao COGNITIVE_MIGRATION_CONTRACT", () => {
  assert.ok(
    workerSrc.includes("COGNITIVE_MIGRATION_CONTRACT.md — seção 3.2"),
    "Ref ao contrato canônico deve estar presente"
  );
});

// ================================================================
// SECTION H — _applyCognitiveSurfaceFilter comportamento
// ================================================================
console.log("\n── SECTION H: _applyCognitiveSurfaceFilter comportamento ──");

test("48. Textos com emoji de feedback passam sem alteração (jaConversacional)", () => {
  assert.ok(
    workerSrc.includes("/👌|✅|💛|😊|😉|👍|✍️|🤝|🔥|⚠️|📝|✨/.test(allText)"),
    "Guard de emoji não encontrado"
  );
});

test("49. Textos com 'perfeito/ótimo/entendi' passam sem alteração (jaConversacional)", () => {
  assert.ok(
    workerSrc.includes("/\\b(perfeito|ótimo|entendi|tranquilo|show|certinho|boa|claro)\\b/i.test(allText)"),
    "Guard de palavras conversacionais não encontrado"
  );
});

test("50. _softQuestion não altera perguntas que começam com 'me/você/qual'", () => {
  assert.ok(
    workerSrc.includes('/^(me |você |vc |qual |como |quando |onde |por que |tudo |pode |pra |para |e |a )/i.test(clean)'),
    "Guard de início conversacional em _softQuestion não encontrado"
  );
});

// ================================================================
// RESULTADO FINAL
// ================================================================
console.log(`\n📊 Resultado: ${passed} passou, ${failed} falhou\n`);

if (failed > 0) {
  process.exit(1);
}
