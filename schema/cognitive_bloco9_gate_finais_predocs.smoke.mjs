/**
 * cognitive_bloco9_gate_finais_predocs.smoke.mjs
 *
 * Smoke tests de contrato canônico para BLOCO 9 — GATES FINAIS PRÉ-DOCS.
 * Stages cobertos: ir_declarado, autonomo_compor_renda, ctps_36, ctps_36_parceiro,
 *   ctps_36_parceiro_p3, dependente, restricao, restricao_parceiro, restricao_parceiro_p3,
 *   regularizacao_restricao, regularizacao_restricao_parceiro, regularizacao_restricao_p3.
 *
 * Contrato canônico BLOCO 9:
 *  1. ir_declarado: confirmar IR PF; MEI → PF; ambíguo → reperguntar
 *  2. autonomo_compor_renda: sem IR → composição pode ser sugerida
 *  3. ctps_36/ctps_36_parceiro/ctps_36_parceiro_p3: aceitar sim/não/não sei
 *  4. dependente: solo <4k → perguntar; conjunto/solo >4k → pular
 *  5. restricao/restricao_parceiro/restricao_parceiro_p3: separação titular/parceiro/P3
 *  6. regularizacao_restricao (todos): perguntar POSSIBILIDADE (não status); aceitar sim/não/não sei
 *  7. nenhum stage abre envio_docs
 *  8. separação total titular × parceiro × P3
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

let passed = 0;
let failed = 0;

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

function nf(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const rt = {};

// ═══════════════════════════════════════════════════════
// SECTION 1: ir_declarado
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 1: ir_declarado ===\n");

await asyncTest('1.1 ir_declarado: default — pede confirmação IR', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "opa", known_slots: { regime_trabalho: "autonomo" }, pending_slots: ["ir_declarado"] }, rt
  );
  assert.ok(r.response, "engine produced a result");
  assert.strictEqual(r.response.should_advance_stage, false);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("imposto de renda") || reply.includes("ir"), `must ask about IR: "${r.response.reply_text}"`);
});

await asyncTest('1.2 ir_declarado: "não declaro" — acolhe sem barrar', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "não declaro", known_slots: { regime_trabalho: "autonomo" }, pending_slots: ["ir_declarado"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("impossivel") && !reply.includes("impossível"), "must not say impossible");
  assert.ok(reply.includes("sim") && reply.includes("nao"), "must ask for sim/não");
});

await asyncTest('1.3 ir_declarado: "sou MEI" — esclarece PF', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "sou MEI", known_slots: { regime_trabalho: "autonomo" }, pending_slots: ["ir_declarado"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("pessoa fisica") || reply.includes("pf"), "must clarify PF");
});

await asyncTest('1.4 ir_declarado: "atrapalha?" — esclarece sem prometer', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "isso atrapalha?", known_slots: { regime_trabalho: "autonomo" }, pending_slots: ["ir_declarado"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("aprovad"), "must not promise approval");
});

await asyncTest('1.5 ir_declarado: reply not open envio_docs', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ir_declarado", message_text: "sim", known_slots: { regime_trabalho: "autonomo" }, pending_slots: ["ir_declarado"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("envio") && !reply.includes("documento"), "must not mention docs");
});

// ═══════════════════════════════════════════════════════
// SECTION 2: autonomo_compor_renda
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 2: autonomo_compor_renda ===\n");

await asyncTest('2.1 autonomo_compor_renda: default — menciona composição', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_compor_renda", message_text: "opa", known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao" }, pending_slots: ["autonomo_compor_renda"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("composi") || reply.includes("compor"), `must mention composition: "${r.response.reply_text}"`);
});

await asyncTest('2.2 autonomo_compor_renda: "posso tentar sozinho" — aceita tentativa solo', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_compor_renda", message_text: "posso tentar sozinho?", known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao" }, pending_slots: ["autonomo_compor_renda"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("sozinho") || reply.includes("solo") || reply.includes("perfil"), `must acknowledge solo attempt: "${r.response.reply_text}"`);
});

await asyncTest('2.3 autonomo_compor_renda: "é obrigatório?" — esclarece que não é', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_compor_renda", message_text: "é obrigatório compor renda?", known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao" }, pending_slots: ["autonomo_compor_renda"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao e obrigatori") || reply.includes("não é obrigatóri") || reply.includes("nao e obrigatoria") || reply.includes("não é obrigatória"), `must clarify not mandatory: "${r.response.reply_text}"`);
});

await asyncTest('2.4 autonomo_compor_renda: not open envio_docs', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "autonomo_compor_renda", message_text: "sim", known_slots: { regime_trabalho: "autonomo", ir_declarado: "nao" }, pending_slots: ["autonomo_compor_renda"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("envio") && !reply.includes("documento"), "must not mention docs");
});

// ═══════════════════════════════════════════════════════
// SECTION 3: ctps_36 — titular aceita "não sei"
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 3: ctps_36 (titular) ===\n");

await asyncTest('3.1 ctps_36: default — inclui "não sei"', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "opa", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao sei"), `must include "não sei": "${r.response.reply_text}"`);
  assert.ok(reply.includes("36"), "must mention 36 months");
});

await asyncTest('3.2 ctps_36: "precisa ser seguido?" — inclui "não sei"', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "precisa ser seguido?", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao sei"), `must include "não sei": "${r.response.reply_text}"`);
  assert.ok(reply.includes("ininterrupt") || reply.includes("soma"), "must clarify sum logic");
});

await asyncTest('3.3 ctps_36: "carteira digital serve?" — inclui "não sei"', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "a carteira digital serve?", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao sei"), `must include "não sei": "${r.response.reply_text}"`);
});

await asyncTest('3.4 ctps_36: "não chego nos 36" — inclui "não sei"', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "não chego nos 36 meses", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao sei"), `must include "não sei": "${r.response.reply_text}"`);
});

await asyncTest('3.5 ctps_36: not mention juros/aprovação', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "sim tenho 36 meses", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("aprovad"), "must not promise approval");
});

// ═══════════════════════════════════════════════════════
// SECTION 4: ctps_36_parceiro — aceita "não sei"
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 4: ctps_36_parceiro ===\n");

await asyncTest('4.1 ctps_36_parceiro: default — inclui "não sei"', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "opa", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao sei"), `must include "não sei": "${r.response.reply_text}"`);
  assert.ok(reply.includes("parceiro"), "must mention parceiro");
});

await asyncTest('4.2 ctps_36_parceiro: "precisa ser seguido?" — parceiro com "não sei"', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "precisa ser seguido?", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao sei"), `must include "não sei": "${r.response.reply_text}"`);
  assert.ok(reply.includes("parceiro"), "must refer to parceiro");
});

await asyncTest('4.3 ctps_36_parceiro: separação — não menciona titular', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["ctps_36_parceiro"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("voce soma") && !reply.includes("você soma"), "must not mix with titular CTPS");
});

// ═══════════════════════════════════════════════════════
// SECTION 5: ctps_36_parceiro_p3 — aceita "não sei"
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 5: ctps_36_parceiro_p3 ===\n");

await asyncTest('5.1 ctps_36_parceiro_p3: default — inclui "não sei"', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro_p3", message_text: "opa", known_slots: { composicao: "familiar", p3: "sim" }, pending_slots: ["ctps_36_parceiro_p3"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("nao sei"), `must include "não sei": "${r.response.reply_text}"`);
  assert.ok(reply.includes("p3"), "must mention P3");
});

await asyncTest('5.2 ctps_36_parceiro_p3: separação de titular e parceiro', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36_parceiro_p3", message_text: "não sei", known_slots: { composicao: "familiar", p3: "sim" }, pending_slots: ["ctps_36_parceiro_p3"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("voce soma") && !reply.includes("parceiro soma"), "must not mix with titular/parceiro");
});

// ═══════════════════════════════════════════════════════
// SECTION 6: dependente
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 6: dependente ===\n");

await asyncTest('6.1 dependente: solo <4k — pergunta dependente', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "dependente", message_text: "opa", known_slots: { composicao: "solo", renda: 3000 }, pending_slots: ["dependente"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("dependente") || reply.includes("filho") || reply.includes("menor"), `must ask about dependente: "${r.response.reply_text}"`);
});

await asyncTest('6.2 dependente: solo >4k — pode pular', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "dependente", message_text: "opa", known_slots: { composicao: "solo", renda: 5000 }, pending_slots: ["dependente"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("pular") || reply.includes("acima") || reply.includes("4 mil") || reply.includes("dependente"), `solo >4k guidance: "${r.response.reply_text}"`);
});

await asyncTest('6.3 dependente: conjunto — pode pular', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "dependente", message_text: "opa", known_slots: { composicao: "parceiro", renda: 3000 }, pending_slots: ["dependente"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("conjunt") || reply.includes("composic") || reply.includes("pular") || reply.includes("dependente"), `conjunto guidance: "${r.response.reply_text}"`);
});

await asyncTest('6.4 dependente: "não entendi" — explica o que é', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "dependente", message_text: "não entendi o que é dependente", known_slots: {}, pending_slots: ["dependente"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("filho") || reply.includes("menor") || reply.includes("terceiro grau"), "must explain dependente concept");
});

await asyncTest('6.5 dependente: not open envio_docs', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "dependente", message_text: "sim", known_slots: {}, pending_slots: ["dependente"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("envio") && !reply.includes("documento"), "must not mention docs");
});

// ═══════════════════════════════════════════════════════
// SECTION 7: restricao — titular
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 7: restricao (titular) ===\n");

await asyncTest('7.1 restricao: default — pergunta CPF titular', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao", message_text: "opa", known_slots: {}, pending_slots: ["restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("restricao") || reply.includes("restrição") || reply.includes("cpf"), `must ask about restricao: "${r.response.reply_text}"`);
  assert.ok(!reply.includes("parceiro") && !reply.includes("p3"), "must not mention parceiro/P3");
});

await asyncTest('7.2 restricao: "nome sujo" — acolhe sem minimizar', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao", message_text: "to com nome sujo no SPC", known_slots: {}, pending_slots: ["restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("nao importa") && !reply.includes("não importa") && !reply.includes("irrelevante"), "must not minimize restriction");
});

await asyncTest('7.3 restricao: "isso barra?" — não afirma nem nega', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao", message_text: "isso barra o financiamento?", known_slots: {}, pending_slots: ["restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("aprovad"), "must not promise approval");
});

// ═══════════════════════════════════════════════════════
// SECTION 8: restricao_parceiro
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 8: restricao_parceiro ===\n");

await asyncTest('8.1 restricao_parceiro: default — pergunta CPF parceiro', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro", message_text: "opa", known_slots: { composicao: "parceiro" }, pending_slots: ["restricao_parceiro"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("parceiro"), "must mention parceiro");
  assert.ok(!reply.includes("p3"), "must not mention P3");
});

// ═══════════════════════════════════════════════════════
// SECTION 9: restricao_parceiro_p3
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 9: restricao_parceiro_p3 ===\n");

await asyncTest('9.1 restricao_parceiro_p3: default — pergunta CPF P3', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro_p3", message_text: "opa", known_slots: { composicao: "familiar", p3: "sim" }, pending_slots: ["restricao_parceiro_p3"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("p3"), "must mention P3");
  assert.ok(!reply.includes("voce") && !reply.includes("parceiro") || reply.includes("p3"), "must focus on P3");
});

// ═══════════════════════════════════════════════════════
// SECTION 10: regularizacao_restricao — TITULAR pergunta POSSIBILIDADE
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 10: regularizacao_restricao (titular) ===\n");

await asyncTest('10.1 regularizacao_restricao: default — pergunta possibilidade', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "opa", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
  assert.ok(reply.includes("nao sei"), `must accept "não sei": "${r.response.reply_text}"`);
});

await asyncTest('10.2 regularizacao_restricao: "estou negociando" — pergunta possibilidade', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "estou negociando", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

await asyncTest('10.3 regularizacao_restricao: "vou ver" — não trata como regularizado', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "vou ver", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
  assert.ok(!reply.includes("regularizada") && !reply.includes("foi regulari"), "must not treat as concluded");
});

await asyncTest('10.4 regularizacao_restricao: "talvez" — não trata como regularizado', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "talvez", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

await asyncTest('10.5 regularizacao_restricao: "está tentando" — não trata como regularizado', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "está tentando regularizar", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

await asyncTest('10.6 regularizacao_restricao: "não sei" — aceita e reorienta', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "não sei", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

await asyncTest('10.7 regularizacao_restricao: "já quitei" — pergunta possibilidade, não status', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "já quitei a dívida", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

await asyncTest('10.8 regularizacao_restricao: "ainda não baixou" — pergunta possibilidade', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "paguei mas ainda não baixou no CPF", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

await asyncTest('10.9 regularizacao_restricao: não menciona parceiro/P3', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "opa", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("parceiro") && !reply.includes("p3"), "must not mention parceiro/P3");
});

// ═══════════════════════════════════════════════════════
// SECTION 11: regularizacao_restricao_parceiro — POSSIBILIDADE
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 11: regularizacao_restricao_parceiro ===\n");

await asyncTest('11.1 regularizacao_restricao_parceiro: default — possibilidade', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "opa", known_slots: { restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
  assert.ok(reply.includes("parceiro"), "must mention parceiro");
});

await asyncTest('11.2 regularizacao_restricao_parceiro: "vou ver" — possibilidade', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "vou ver", known_slots: { restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

// ═══════════════════════════════════════════════════════
// SECTION 12: regularizacao_restricao_p3 — POSSIBILIDADE
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 12: regularizacao_restricao_p3 ===\n");

await asyncTest('12.1 regularizacao_restricao_p3: default — possibilidade', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "opa", known_slots: { restricao_p3: "sim" }, pending_slots: ["regularizacao_restricao_p3"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
  assert.ok(reply.includes("p3"), "must mention P3");
});

await asyncTest('12.2 regularizacao_restricao_p3: "vou ver" — possibilidade', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "vou ver", known_slots: { restricao_p3: "sim" }, pending_slots: ["regularizacao_restricao_p3"] }, rt
  );
  assert.ok(r.response);
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("possibilidade"), `must ask about possibilidade: "${r.response.reply_text}"`);
});

// ═══════════════════════════════════════════════════════
// SECTION 13: BLINDAGEM — nenhum gate abre envio_docs
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 13: BLINDAGEM ===\n");

const blindagemStages = [
  { stage: "ir_declarado", slots: { regime_trabalho: "autonomo" } },
  { stage: "autonomo_compor_renda", slots: { regime_trabalho: "autonomo", ir_declarado: "nao" } },
  { stage: "ctps_36", slots: { regime_trabalho: "clt" } },
  { stage: "dependente", slots: {} },
  { stage: "restricao", slots: {} },
  { stage: "regularizacao_restricao", slots: { restricao: "sim" } },
];

for (const { stage, slots } of blindagemStages) {
  await asyncTest(`13.X ${stage}: reply never opens envio_docs or asks for documents`, async () => {
    const r = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: "sim", known_slots: slots, pending_slots: [stage] }, rt
    );
    assert.ok(r.response);
    const reply = nf(r.response.reply_text);
    assert.ok(!reply.includes("envio_docs"), "must not mention envio_docs stage");
    assert.ok(!reply.includes("holerite") && !reply.includes("extrato bancario"), "must not ask for specific docs");
  });
}

// ═══════════════════════════════════════════════════════
// SECTION 14: SEPARAÇÃO TOTAL titular × parceiro × P3
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 14: SEPARAÇÃO ===\n");

await asyncTest('14.1 restricao (titular) não menciona parceiro/P3', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao", message_text: "sim tenho restrição", known_slots: {}, pending_slots: ["restricao"] }, rt
  );
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("parceiro") && !reply.includes("p3"), "titular restricao must not mention parceiro/P3");
});

await asyncTest('14.2 restricao_parceiro não menciona titular/P3', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro", message_text: "sim", known_slots: { composicao: "parceiro" }, pending_slots: ["restricao_parceiro"] }, rt
  );
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("p3"), "parceiro restricao must not mention P3");
  assert.ok(reply.includes("parceiro"), "must mention parceiro");
});

await asyncTest('14.3 restricao_parceiro_p3 não menciona titular/parceiro-conjugal', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "restricao_parceiro_p3", message_text: "sim", known_slots: { composicao: "familiar", p3: "sim" }, pending_slots: ["restricao_parceiro_p3"] }, rt
  );
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("p3"), "must mention P3");
});

await asyncTest('14.4 regularizacao_restricao (titular) não menciona parceiro/P3', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao", message_text: "negociando", known_slots: { restricao: "sim" }, pending_slots: ["regularizacao_restricao"] }, rt
  );
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("parceiro") && !reply.includes("p3"), "titular regularizacao must not mention parceiro/P3");
});

await asyncTest('14.5 regularizacao_restricao_parceiro não menciona P3', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_parceiro", message_text: "negociando", known_slots: { restricao_parceiro: "sim" }, pending_slots: ["regularizacao_restricao_parceiro"] }, rt
  );
  const reply = nf(r.response.reply_text);
  assert.ok(!reply.includes("p3"), "parceiro regularizacao must not mention P3");
  assert.ok(reply.includes("parceiro"), "must mention parceiro");
});

await asyncTest('14.6 regularizacao_restricao_p3 não menciona titular/parceiro', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regularizacao_restricao_p3", message_text: "negociando", known_slots: { restricao_p3: "sim" }, pending_slots: ["regularizacao_restricao_p3"] }, rt
  );
  const reply = nf(r.response.reply_text);
  assert.ok(reply.includes("p3"), "must mention P3");
});

// ═══════════════════════════════════════════════════════
// SECTION 15: REGRESSÃO — blocos adjacentes intactos
// ═══════════════════════════════════════════════════════

console.log("\n  === SECTION 15: REGRESSÃO ===\n");

await asyncTest('15.1 REGRESSÃO: estado_civil "solteiro" — engine valid', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "solteiro", known_slots: {}, pending_slots: ["estado_civil"] }, rt
  );
  assert.ok(r.response);
  const v = validateReadOnlyCognitiveResponse(r.response);
  assert.ok(v.valid, `must be valid: ${v.errors.join(", ")}`);
});

await asyncTest('15.2 REGRESSÃO: renda "3500" — engine valid', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "3500", known_slots: { regime_trabalho: "clt" }, pending_slots: ["renda"] }, rt
  );
  assert.ok(r.response);
  const v = validateReadOnlyCognitiveResponse(r.response);
  assert.ok(v.valid, `must be valid: ${v.errors.join(", ")}`);
});

await asyncTest('15.3 REGRESSÃO: regime_trabalho "clt" — engine valid', async () => {
  const r = await runReadOnlyCognitiveEngine(
    { current_stage: "regime_trabalho", message_text: "clt", known_slots: {}, pending_slots: ["regime_trabalho"] }, rt
  );
  assert.ok(r.response);
  const v = validateReadOnlyCognitiveResponse(r.response);
  assert.ok(v.valid, `must be valid: ${v.errors.join(", ")}`);
});

// ═══════════════════════════════════════════════════════
// RESULTADO
// ═══════════════════════════════════════════════════════

console.log(`\ncognitive_bloco9_gate_finais_predocs.smoke: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
