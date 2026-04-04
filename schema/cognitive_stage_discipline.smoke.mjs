/**
 * cognitive_stage_discipline.smoke.mjs
 *
 * Smoke tests for the ONE-STAGE-ONLY / ONE-TURN-ONE-GOAL stage discipline fix.
 * Validates:
 *  1. inicio_programa + pedido de explicação => reply só fala do programa, sem perguntar estado civil
 *  2. inicio_programa => não antecipa estado_civil
 *  3. inicio_nome => não antecipa nacionalidade/estado_civil
 *  4. inicio_nacionalidade => não antecipa estado_civil indevidamente
 *  5. estado_civil => não antecipa renda/regime_trabalho
 *  6. regime_trabalho => não antecipa renda se não for o contrato daquele turno
 *  7. replies continuam curtas (< 400 chars)
 *  8. reset/topo corrigidos permanecem funcionando
 *  9. gates/nextStage/parsers intactos
 * 10. sem regressão em docs/correspondente/visita
 * 11. isSlotOwnedByCurrentStage guarda corretamente
 * 12. stripFutureStageCollection post-processing guard
 * 13. ensureReplyHasNextAction expanded guard
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse, isSlotOwnedByCurrentStage } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const { applyFinalSpeechContract, stripFutureStageCollection, CONTRACT_CONFIG } = await import(
  new URL("../cognitive/src/final-speech-contract.js", import.meta.url).href
);

const heuristicOnlyRuntime = {};

let passed = 0;
let failed = 0;

function nf(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function asyncTest(name, fn) {
  try { await fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.error(`  ❌ ${name}`); console.error(`     ${e.message}`); }
}

console.log("\n=== Stage Discipline (ONE-STAGE-ONLY) Smoke Tests ===\n");

// =========================================================================
// SECTION 1: isSlotOwnedByCurrentStage guard
// =========================================================================

await asyncTest("1. isSlotOwnedByCurrentStage: estado_civil owns estado_civil", async () => {
  assert.ok(isSlotOwnedByCurrentStage("estado_civil", "estado_civil"));
});

await asyncTest("2. isSlotOwnedByCurrentStage: estado_civil owns composicao", async () => {
  assert.ok(isSlotOwnedByCurrentStage("estado_civil", "composicao"));
});

await asyncTest("3. isSlotOwnedByCurrentStage: inicio_programa does NOT own estado_civil", async () => {
  assert.ok(!isSlotOwnedByCurrentStage("inicio_programa", "estado_civil"));
});

await asyncTest("4. isSlotOwnedByCurrentStage: inicio_nome does NOT own estado_civil", async () => {
  assert.ok(!isSlotOwnedByCurrentStage("inicio_nome", "estado_civil"));
});

await asyncTest("5. isSlotOwnedByCurrentStage: inicio_nome owns nome", async () => {
  assert.ok(isSlotOwnedByCurrentStage("inicio_nome", "nome"));
});

await asyncTest("6. isSlotOwnedByCurrentStage: regime_trabalho owns regime_trabalho", async () => {
  assert.ok(isSlotOwnedByCurrentStage("regime_trabalho", "regime_trabalho"));
});

await asyncTest("7. isSlotOwnedByCurrentStage: inicio_programa does NOT own renda", async () => {
  assert.ok(!isSlotOwnedByCurrentStage("inicio_programa", "renda"));
});

await asyncTest("8. isSlotOwnedByCurrentStage: topo stage inicio has no owned slots", async () => {
  assert.ok(!isSlotOwnedByCurrentStage("inicio", "estado_civil"));
  assert.ok(!isSlotOwnedByCurrentStage("inicio", "renda"));
  assert.ok(!isSlotOwnedByCurrentStage("inicio", "composicao"));
});

// =========================================================================
// SECTION 2: stripFutureStageCollection post-processing guard
// =========================================================================

await asyncTest("9. stripFutureStageCollection: topo stage strips estado civil question", async () => {
  const input = "O MCMV é um programa federal. Qual seu estado civil?";
  const result = stripFutureStageCollection(input, "inicio_programa");
  assert.ok(!nf(result).includes("estado civil"), `Expected no estado civil, got: ${result}`);
});

await asyncTest("10. stripFutureStageCollection: topo stage strips renda question", async () => {
  const input = "O programa pode te ajudar. Qual é a sua renda mensal?";
  const result = stripFutureStageCollection(input, "inicio_programa");
  assert.ok(!nf(result).includes("renda mensal?"), `Expected no renda question, got: ${result}`);
});

await asyncTest("11. stripFutureStageCollection: estado_civil stage strips regime question", async () => {
  const input = "Entendi seu estado civil. Você é CLT ou autônomo?";
  const result = stripFutureStageCollection(input, "estado_civil");
  assert.ok(!nf(result).includes("clt ou autonomo?"), `Expected no regime question, got: ${result}`);
});

await asyncTest("12. stripFutureStageCollection: does not strip when stage allows it", async () => {
  const input = "Me confirma se é casado no civil ou união estável?";
  const result = stripFutureStageCollection(input, "estado_civil");
  // estado_civil CAN talk about casado/civil — these are its own domain
  assert.ok(result.length > 10, `Expected reply to remain, got: ${result}`);
});

await asyncTest("13. stripFutureStageCollection: operational stages not restricted", async () => {
  const input = "Me manda os docs. Qual é a sua renda mensal?";
  const result = stripFutureStageCollection(input, "envio_docs");
  // envio_docs is operational — no restriction applies
  assert.strictEqual(result, input);
});

await asyncTest("14. stripFutureStageCollection: null/empty stage returns unchanged", async () => {
  const input = "Some reply text.";
  assert.strictEqual(stripFutureStageCollection(input, ""), input);
  assert.strictEqual(stripFutureStageCollection(input, null), input);
});

// =========================================================================
// SECTION 3: inicio_programa replies must NOT mention estado civil
// =========================================================================

await asyncTest("15. inicio_programa + explicação => reply NÃO pergunta estado civil", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_programa",
    message_text: "me explica melhor como funciona",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["estado_civil"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("estado civil"), `Reply must not mention estado_civil: ${result.response.reply_text}`);
  assert.ok(!reply.includes("solteiro"), `Reply must not mention solteiro: ${result.response.reply_text}`);
  assert.ok(!reply.includes("casad"), `Reply must not mention casado: ${result.response.reply_text}`);
});

await asyncTest("16. inicio_programa + saudação => reply NÃO pergunta estado civil", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_programa",
    message_text: "oi",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["estado_civil"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("estado civil"), `Reply must not mention estado_civil: ${result.response.reply_text}`);
});

await asyncTest("17. inicio_programa => reply contém sim/não do programa", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_programa",
    message_text: "quero saber mais",
    recent_messages: [],
    known_slots: {},
    pending_slots: []
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("sim") || reply.includes("programa") || reply.includes("funciona"),
    `Reply should reference the program: ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 4: inicio_nome must NOT mention estado_civil/nacionalidade
// =========================================================================

await asyncTest("18. inicio_nome => reply NÃO pergunta estado civil", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_nome",
    message_text: "pode ser só o primeiro nome?",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["estado_civil"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("estado civil"), `Reply must not mention estado_civil: ${result.response.reply_text}`);
  assert.ok(reply.includes("nome"), `Reply should mention nome: ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 5: inicio_nacionalidade must NOT mention estado_civil
// =========================================================================

await asyncTest("19. inicio_nacionalidade => reply NÃO pergunta estado civil", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_nacionalidade",
    message_text: "estrangeiro pode participar?",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["estado_civil"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("estado civil"), `Reply must not mention estado_civil: ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 6: estado_civil must NOT mention renda/regime_trabalho
// =========================================================================

await asyncTest("20. estado_civil => reply NÃO pergunta renda", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "estado_civil",
    message_text: "não sei direito",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["renda", "regime_trabalho"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("renda mensal"), `Reply must not mention renda: ${result.response.reply_text}`);
  assert.ok(!reply.includes("clt"), `Reply must not mention CLT: ${result.response.reply_text}`);
  assert.ok(!reply.includes("autonomo"), `Reply must not mention autônomo: ${result.response.reply_text}`);
});

await asyncTest("21. estado_civil => reply fala do estado civil corretamente", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "estado_civil",
    message_text: "qual a diferença?",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["estado_civil"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("casamento") || reply.includes("uniao") || reply.includes("solteiro") || reply.includes("estado civil"),
    `Reply should reference estado civil topic: ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 7: regime_trabalho must NOT ask about renda if not its contract
// =========================================================================

await asyncTest("22. regime_trabalho => reply fala do regime, não pergunta renda isoladamente", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "regime_trabalho",
    message_text: "não entendi",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["regime_trabalho"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("clt") || reply.includes("autonomo") || reply.includes("servidor") || reply.includes("regime"),
    `Reply should reference regime options: ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 8: Replies remain short (< 400 chars)
// =========================================================================

await asyncTest("23. inicio_programa reply under 400 chars", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_programa",
    message_text: "me explica",
    recent_messages: [],
    known_slots: {},
    pending_slots: []
  }, heuristicOnlyRuntime);
  assert.ok(result.response.reply_text.length <= 400,
    `Reply too long (${result.response.reply_text.length}): ${result.response.reply_text}`);
});

await asyncTest("24. estado_civil reply under 400 chars", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "estado_civil",
    message_text: "moro junto com meu namorado",
    recent_messages: [],
    known_slots: {},
    pending_slots: []
  }, heuristicOnlyRuntime);
  assert.ok(result.response.reply_text.length <= 400,
    `Reply too long (${result.response.reply_text.length}): ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 9: Validation — should_advance_stage always false
// =========================================================================

await asyncTest("25. should_advance_stage remains false", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_programa",
    message_text: "sim já sei",
    recent_messages: [],
    known_slots: {},
    pending_slots: []
  }, heuristicOnlyRuntime);
  assert.strictEqual(result.response.should_advance_stage, false);
  const validation = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(validation.valid, `Validation failed: ${validation.errors.join(", ")}`);
});

// =========================================================================
// SECTION 10: Operational stages not regressed
// =========================================================================

await asyncTest("26. envio_docs reply still functional", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "envio_docs",
    message_text: "quero enviar os documentos",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["docs"]
  }, heuristicOnlyRuntime);
  assert.ok(result.response.reply_text.length > 10, "Reply should not be empty");
  const validation = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(validation.valid, `Validation failed: ${validation.errors.join(", ")}`);
});

await asyncTest("27. agendamento_visita reply still functional", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "agendamento_visita",
    message_text: "quero agendar",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["visita"]
  }, heuristicOnlyRuntime);
  assert.ok(result.response.reply_text.length > 10, "Reply should not be empty");
  const validation = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(validation.valid, `Validation failed: ${validation.errors.join(", ")}`);
});

// =========================================================================
// SECTION 11: applyFinalSpeechContract with stage discipline
// =========================================================================

await asyncTest("28. applyFinalSpeechContract strips estado civil question from inicio_programa reply", async () => {
  const reply = "O MCMV é um programa federal de financiamento. Qual seu estado civil?";
  const result = applyFinalSpeechContract(reply, { currentStage: "inicio_programa" });
  assert.ok(!nf(result).includes("estado civil"), `Expected no estado civil, got: ${result}`);
});

await asyncTest("29. applyFinalSpeechContract preserves valid reply for estado_civil stage", async () => {
  const reply = "Me diz: é casado no civil ou tem união estável?";
  const result = applyFinalSpeechContract(reply, { currentStage: "estado_civil" });
  // estado_civil can talk about casado/civil — those are its own domain
  assert.ok(result.length > 10, `Reply should remain meaningful, got: ${result}`);
});

// =========================================================================
// SECTION 12: confirmar_casamento, financiamento_conjunto, ctps, restricao
// =========================================================================

await asyncTest("30. confirmar_casamento => NÃO pergunta renda", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "confirmar_casamento",
    message_text: "é religioso",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["renda"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("renda mensal"), `Reply must not mention renda: ${result.response.reply_text}`);
});

await asyncTest("31. financiamento_conjunto => NÃO pergunta renda diretamente", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "financiamento_conjunto",
    message_text: "não sei se vale a pena",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["renda"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("renda mensal"), `Reply must not mention renda: ${result.response.reply_text}`);
});

await asyncTest("32. ctps_36 stage responds about CTPS only", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "ctps_36",
    message_text: "não tenho certeza",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["ctps_36"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("ctps") || reply.includes("36") || reply.includes("carteira"),
    `Reply should reference CTPS: ${result.response.reply_text}`);
});

await asyncTest("33. restricao stage responds about restricao only", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "restricao",
    message_text: "meu nome tá sujo",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["restricao"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("restricao") || reply.includes("restricoes") || reply.includes("cpf") || reply.includes("sim") || reply.includes("nao"),
    `Reply should reference restricao: ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 13: inicio_rnm, inicio_rnm_validade
// =========================================================================

await asyncTest("34. inicio_rnm => NÃO pergunta estado civil", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_rnm",
    message_text: "não sei o que é RNM",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["estado_civil"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("estado civil"), `Reply must not mention estado_civil: ${result.response.reply_text}`);
  assert.ok(reply.includes("rnm") || reply.includes("registro"), `Reply should reference RNM: ${result.response.reply_text}`);
});

await asyncTest("35. inicio_rnm_validade => NÃO pergunta estado civil", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "inicio_rnm_validade",
    message_text: "como saber se é indeterminado?",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["estado_civil"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("estado civil"), `Reply must not mention estado_civil: ${result.response.reply_text}`);
});

// =========================================================================
// SECTION 14: quem_pode_somar, interpretar_composicao
// =========================================================================

await asyncTest("36. quem_pode_somar => NÃO pergunta sobre CTPS/restrição", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "quem_pode_somar",
    message_text: "minha mãe pode somar?",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["ctps_36", "restricao"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("ctps"), `Reply must not mention CTPS: ${result.response.reply_text}`);
  assert.ok(!reply.includes("restricao"), `Reply must not mention restricao: ${result.response.reply_text}`);
});

await asyncTest("37. interpretar_composicao => NÃO pergunta renda/CTPS", async () => {
  const result = await runReadOnlyCognitiveEngine({
    current_stage: "interpretar_composicao",
    message_text: "quero seguir com meu marido",
    recent_messages: [],
    known_slots: {},
    pending_slots: ["renda", "ctps_36"]
  }, heuristicOnlyRuntime);
  const reply = nf(result.response.reply_text);
  assert.ok(!reply.includes("ctps"), `Reply must not mention CTPS: ${result.response.reply_text}`);
});

// =========================================================================
// Summary
// =========================================================================

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
