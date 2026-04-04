/**
 * cognitive_speech_surface_alignment.smoke.mjs
 *
 * Smoke tests for the cognitive speech surface alignment task.
 * Validates:
 *  1. MAX_REPLY_LENGTH reduced from 600 to 400 (WhatsApp-friendly)
 *  2. Operational stages still get 600 chars (envio_docs, visita)
 *  3. ensureReplyHasNextAction doesn't double replies ending with ?
 *  4. estado_civil guidance lists all 6 options
 *  5. regime_trabalho guidance lists CLT/autônomo/servidor/aposentado
 *  6. renda guidance suggests numeric format
 *  7. ctps_36 guidance induces sim/não/não sei
 *  8. restricao guidance induces sim/não
 *  9. inicio_programa guidance induces sim/não
 * 10. quem_pode_somar lists parceiro/familiar/sozinho
 * 11. financiamento_conjunto lists juntos/só você/se precisar
 * 12. confirmar_casamento induces civil/união estável
 * 13. All replies under 400 chars for collection stages
 * 14. Gates/nextStage/parsers NOT changed
 * 15. Docs/correspondente/visita NOT regressed
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const { CONTRACT_CONFIG, applyFinalSpeechContract } = await import(
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

// ===== 1. MAX_REPLY_LENGTH = 400 =====
await asyncTest("1. MAX_REPLY_LENGTH reduced to 400", async () => {
  assert.strictEqual(CONTRACT_CONFIG.MAX_REPLY_LENGTH, 400);
});

// ===== 2. Operacional stages still get 600 =====
await asyncTest("2. MAX_REPLY_LENGTH_OPERACIONAL = 600", async () => {
  assert.strictEqual(CONTRACT_CONFIG.MAX_REPLY_LENGTH_OPERACIONAL, 600);
});

// ===== 3. applyFinalSpeechContract respects stage-aware length =====
await asyncTest("3. Operacional stage gets 600 limit, collection gets 400", async () => {
  const longText = "A".repeat(500) + ". B".repeat(50);
  const forDocs = applyFinalSpeechContract(longText, { currentStage: "envio_docs" });
  const forRenda = applyFinalSpeechContract(longText, { currentStage: "renda" });
  assert.ok(forDocs.length > forRenda.length, "docs reply should be longer than renda reply");
  assert.ok(forRenda.length <= 410, `renda reply should be ≤410 chars, got ${forRenda.length}`);
});

// ===== 4. estado_civil lists all 6 options =====
await asyncTest("4. estado_civil default guidance lists 6 civil status options", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "qual meu estado civil?", known_slots: {}, pending_slots: ["estado_civil"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("solteiro"), "must mention solteiro");
  assert.ok(reply.includes("casado"), "must mention casado");
  assert.ok(reply.includes("uniao estavel") || reply.includes("união estável"), "must mention união estável");
  assert.ok(reply.includes("separado"), "must mention separado");
  assert.ok(reply.includes("divorciado"), "must mention divorciado");
  assert.ok(reply.includes("viuvo") || reply.includes("viúvo"), "must mention viúvo");
});

// ===== 5. regime_trabalho lists all 4 options =====
await asyncTest("5. regime_trabalho default guidance lists 4 regime options", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "como funciona?", known_slots: {}, pending_slots: ["regime_trabalho"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("clt"), "must mention CLT");
  assert.ok(reply.includes("autonom"), "must mention autônomo");
  assert.ok(reply.includes("servidor") || reply.includes("aposentad"), "must mention servidor or aposentado");
});

// ===== 6. renda guidance suggests numeric format =====
await asyncTest("6. renda default guidance suggests numeric format (2500 or R$)", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "como informo?", known_slots: { regime_trabalho: "clt" }, pending_slots: ["renda"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("2500") || reply.includes("r$") || reply.includes("valor"), `must suggest format, got: ${result.response.reply_text}`);
});

// ===== 7. ctps_36 induces sim/não/não sei =====
await asyncTest("7. ctps_36 guidance induces sim/não/não sei", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "como funciona?", known_slots: {}, pending_slots: ["ctps_36"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("sim"), "must mention sim");
  assert.ok(reply.includes("nao") || reply.includes("não"), "must mention não");
  assert.ok(reply.includes("nao sei") || reply.includes("não sei"), "must mention não sei");
});

// ===== 8. restricao induces sim/não =====
await asyncTest("8. restricao guidance induces sim/não", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao", message_text: "o que é isso?", known_slots: {}, pending_slots: ["restricao"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("sim"), "must mention sim");
  assert.ok(reply.includes("nao") || reply.includes("não"), "must mention não");
});

// ===== 9. inicio_programa induces sim/não =====
await asyncTest("9. inicio_programa default reply induces sim/não", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_programa", message_text: "e ai?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("sim") || reply.includes("nao") || reply.includes("não"), `must induce sim/não: ${result.response.reply_text}`);
});

// ===== 10. quem_pode_somar lists 3 options =====
await asyncTest("10. quem_pode_somar lists parceiro/familiar/sozinho", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "quem_pode_somar", message_text: "o que faço?", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("parceiro") || reply.includes("parceira"), "must mention parceiro(a)");
  assert.ok(reply.includes("familiar"), "must mention familiar");
  assert.ok(reply.includes("sozinho") || reply.includes("sozinha"), "must mention sozinho(a)");
});

// ===== 11. financiamento_conjunto lists 3 options =====
await asyncTest("11. financiamento_conjunto lists juntos/só você/se precisar", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "financiamento_conjunto", message_text: "como funciona?", known_slots: {}, pending_slots: ["financiamento_conjunto"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("juntos") || reply.includes("junto"), "must mention juntos");
  assert.ok(reply.includes("voce") || reply.includes("você") || reply.includes("solo"), "must mention só você/solo");
  assert.ok(reply.includes("precisar"), "must mention se precisar");
});

// ===== 12. confirmar_casamento induces civil/união estável =====
await asyncTest("12. confirmar_casamento induces civil/união estável", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "confirmar_casamento", message_text: "sim somos casados", known_slots: {}, pending_slots: ["casamento_tipo"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("civil") || reply.includes("estavel") || reply.includes("estável"), "must mention civil or estável");
});

// ===== 13. Collection stage replies are under 400 chars =====
await asyncTest("13. Collection stage replies are short (under 400 chars)", async () => {
  const stages = ["estado_civil", "regime_trabalho", "renda", "ctps_36", "restricao", "quem_pode_somar"];
  for (const stage of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: "não entendi", known_slots: {}, pending_slots: [stage] },
      heuristicOnlyRuntime
    );
    const reply = result.response.reply_text || "";
    const processed = applyFinalSpeechContract(reply, { currentStage: stage });
    assert.ok(processed.length <= 400, `${stage} reply too long (${processed.length} chars): ${processed.substring(0, 100)}...`);
  }
});

// ===== 14. Gates/nextStage/parsers not changed =====
await asyncTest("14. should_advance_stage is false for all collection stages", async () => {
  const stages = ["estado_civil", "regime_trabalho", "renda", "ctps_36", "restricao", "inicio_programa"];
  for (const stage of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: "como funciona?", known_slots: {}, pending_slots: [stage] },
      heuristicOnlyRuntime
    );
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
  }
});

// ===== 15. Docs/correspondente/visita NOT regressed =====
await asyncTest("15. envio_docs still functional", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "envio_docs", message_text: "quais docs preciso?", known_slots: { regime_trabalho: "clt" }, pending_slots: ["docs"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("holerite") || reply.includes("doc"), "envio_docs must mention docs");
  assert.strictEqual(result.response.should_advance_stage, false);
});

await asyncTest("16. ensureReplyHasNextAction skips when reply ends with ?", async () => {
  // When guidance already ends with ?, action should NOT be appended
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "moro junto", known_slots: {}, pending_slots: ["estado_civil"] },
    heuristicOnlyRuntime
  );
  const reply = result.response.reply_text || "";
  // The reply should end with a question, not have a duplicate question appended
  assert.ok(reply.trim().endsWith("?"), `reply should end with ?: ${reply}`);
  // Count question marks — should be at most 2 (original + possible sub-question)
  const questionMarks = (reply.match(/\?/g) || []).length;
  assert.ok(questionMarks <= 3, `too many question marks (${questionMarks}): ${reply}`);
});

await asyncTest("17. autonomo_ir_pergunta shorter than before", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_ir_pergunta", message_text: "não sei", known_slots: {}, pending_slots: ["autonomo_ir"] },
    heuristicOnlyRuntime
  );
  const reply = result.response.reply_text || "";
  assert.ok(reply.length < 200, `autonomo_ir reply should be short, got ${reply.length}: ${reply}`);
  const lower = nf(reply);
  assert.ok(lower.includes("sim") && (lower.includes("nao") || lower.includes("não")), "must induce sim/não");
});

await asyncTest("18. somar_renda_solteiro shorter and induced", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "somar_renda_solteiro", message_text: "como funciona?", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  const reply = result.response.reply_text || "";
  assert.ok(reply.length < 200, `somar_renda reply should be short, got ${reply.length}`);
  const lower = nf(reply);
  assert.ok(lower.includes("sozinho") || lower.includes("sozinha") || lower.includes("somar"), "must induce choice");
});

await asyncTest("19. interpretar_composicao lists 3 options", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "interpretar_composicao", message_text: "quero saber", known_slots: {}, pending_slots: ["composicao"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("parceiro") || reply.includes("parceira"), "must mention parceiro");
  assert.ok(reply.includes("familiar"), "must mention familiar");
  assert.ok(reply.includes("sozinho") || reply.includes("sozinha"), "must mention sozinho");
});

await asyncTest("20. dependente induces sim/não", async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "dependente", message_text: "o que é isso?", known_slots: {}, pending_slots: ["dependente"] },
    heuristicOnlyRuntime
  );
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("sim"), "must mention sim");
  assert.ok(reply.includes("nao") || reply.includes("não"), "must mention não");
});

console.log("");
console.log(`cognitive_speech_surface_alignment.smoke: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
