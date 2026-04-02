/**
 * cognitive_bloco_operacional_final.smoke.mjs
 *
 * Smoke tests para Bloco Operacional Final Cognitivo.
 * Stages cobertos: envio_docs, aguardando_retorno_correspondente,
 *   agendamento_visita, finalizacao_processo.
 *
 *  1.  envio_docs + "posso mandar depois?" — resposta curta + retorno para orientação original
 *  2.  envio_docs + "prefiro presencial" — resposta curta, sem mexer em docs matching
 *  3.  aguardando_retorno_correspondente + "quanto tempo demora?" — resposta curta, sem prazo inventado
 *  4.  aguardando_retorno_correspondente + "já teve resposta?" — resposta curta, sem inventar status
 *  5.  agendamento_visita + "quais horários?" — resposta curta + retorno para regra real
 *  6.  agendamento_visita + "posso ir outro dia?" — resposta curta, sem agenda paralela
 *  7.  finalizacao_processo + "o que acontece agora?" — resposta curta, sem promessa indevida
 *  8.  BLINDAGEM: envio_docs não marcou docs nem abriu matching paralelo
 *  9.  BLINDAGEM: aguardando_retorno_correspondente não inventou prazo/status
 * 10.  BLINDAGEM: agendamento_visita não confirmou visita sozinho
 * 11.  REGRESSÃO: gates finais, P3, familiar, parceiro, titular, composição inicial,
 *       estado_civil e topo não quebraram
 * 12.  CHECAGEM MECÂNICA: should_advance_stage=false em todos os 4 stages operacionais finais
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const heuristicOnlyRuntime = {};

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

// ===== 1. envio_docs + deferimento =====
await asyncTest('1. envio_docs: "posso mandar depois?" — resposta cognitiva curta + retorno para orientação original', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "envio_docs", message_text: "posso mandar depois?", known_slots: { composicao: "solteiro", regime_trabalho: "clt" }, pending_slots: ["docs"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // deve acolher e orientar de volta
  assert.ok(
    reply.includes("document") || reply.includes("quando") || reply.includes("mandar") || reply.includes("analis") || reply.includes("puder"),
    `reply should acknowledge deferment and reanchor: "${result.response.reply_text}"`
  );
  // não deve marcar doc nem abrir fluxo paralelo
  assert.ok(
    !reply.includes("marcad") && !reply.includes("checklist confirmad") && !reply.includes("doc recebid"),
    `reply must not mark doc as received: "${result.response.reply_text}"`
  );
});

// ===== 2. envio_docs + recusa presencial =====
await asyncTest('2. envio_docs: "prefiro presencial" — resposta curta alinhada ao fluxo, sem mexer em docs matching', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "envio_docs", message_text: "prefiro presencial", known_slots: { composicao: "solteiro", regime_trabalho: "clt" }, pending_slots: ["docs"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve alterar checklist, marcar doc ou abrir fluxo paralelo
  assert.ok(
    !reply.includes("marcad") && !reply.includes("checklist confirmad") && !reply.includes("recebid"),
    `reply must not mark docs or open parallel flow: "${result.response.reply_text}"`
  );
});

// ===== 3. aguardando_retorno_correspondente + prazo =====
await asyncTest('3. aguardando_retorno_correspondente: "quanto tempo demora?" — resposta curta, sem prazo inventado', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "quanto tempo demora?", known_slots: {}, pending_slots: ["correspondente"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve inventar prazo específico
  assert.ok(
    !reply.includes("dias uteis") && !reply.includes("24 horas") && !reply.includes("48 horas") && !reply.includes("1 semana") && !reply.includes("2 semanas"),
    `reply must not invent specific deadline: "${result.response.reply_text}"`
  );
  // deve indicar que está aguardando
  assert.ok(
    reply.includes("aguard") || reply.includes("retorno") || reply.includes("avis") || reply.includes("nao") || reply.includes("nao tenho"),
    `reply should acknowledge waiting state: "${result.response.reply_text}"`
  );
});

// ===== 4. aguardando_retorno_correspondente + status =====
await asyncTest('4. aguardando_retorno_correspondente: "já teve resposta?" — resposta curta, sem inventar status', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "já teve resposta?", known_slots: {}, pending_slots: ["correspondente"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve inventar status aprovado sem base
  assert.ok(
    !(reply.includes("aprovad") && !reply.includes("ainda")),
    `reply must not invent approval status without basis: "${result.response.reply_text}"`
  );
  // deve comunicar que ainda está aguardando
  assert.ok(
    reply.includes("aguard") || reply.includes("ainda") || reply.includes("avis") || reply.includes("retorno"),
    `reply should communicate waiting state: "${result.response.reply_text}"`
  );
});

// ===== 5. agendamento_visita + horários =====
await asyncTest('5. agendamento_visita: "quais horários?" — resposta curta + retorno para regra real', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "agendamento_visita", message_text: "quais horários?", known_slots: {}, pending_slots: ["visita"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // deve redirecionar para agenda oficial, sem inventar horários
  assert.ok(
    reply.includes("planta") || reply.includes("agenda") || reply.includes("oficial") || reply.includes("opç") || reply.includes("opcoes"),
    `reply should reference official schedule: "${result.response.reply_text}"`
  );
});

// ===== 6. agendamento_visita + remarcação =====
await asyncTest('6. agendamento_visita: "posso ir outro dia?" — resposta curta, sem agenda paralela', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "agendamento_visita", message_text: "posso ir outro dia?", known_slots: {}, pending_slots: ["visita"] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve criar agenda paralela nem confirmar sozinho
  assert.ok(
    !reply.includes("confirmad") || !reply.includes("agendad"),
    `reply must not confirm appointment autonomously: "${result.response.reply_text}"`
  );
});

// ===== 7. finalizacao_processo + próximo passo =====
await asyncTest('7. finalizacao_processo: "o que acontece agora?" — resposta curta, sem promessa indevida', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "o que acontece agora?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve prometer aprovação nem prazo indevido
  assert.ok(
    !reply.includes("aprovad") && !reply.includes("dias uteis") && !reply.includes("24 horas"),
    `reply must not make inappropriate promises: "${result.response.reply_text}"`
  );
  // deve informar sobre continuidade do processo
  assert.ok(
    reply.includes("process") || reply.includes("etap") || reply.includes("avis") || reply.includes("seguir") || reply.includes("finali"),
    `reply should acknowledge process continuation: "${result.response.reply_text}"`
  );
});

// ===== 8. BLINDAGEM envio_docs =====
await asyncTest('8. BLINDAGEM: envio_docs não marcou docs nem abriu matching paralelo', async () => {
  const cases = [
    { text: "posso mandar depois?", label: "deferimento" },
    { text: "é seguro?", label: "segurança" },
    { text: "prefiro presencial", label: "presencial" },
    { text: "não consigo agora", label: "sem tempo" },
    { text: "posso mandar pelo site?", label: "canal site" }
  ];
  for (const { text, label } of cases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: "envio_docs", message_text: text, known_slots: { composicao: "solteiro", regime_trabalho: "clt" }, pending_slots: ["docs"] },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `envio_docs [${label}]: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `envio_docs [${label}]: should_advance_stage must be false`);
    const reply = nf(result.response?.reply_text);
    // blindagem: não pode marcar doc recebido nem abrir fluxo paralelo
    assert.ok(
      !reply.includes("doc recebid") && !reply.includes("checklist confirmad") && !reply.includes("marcad como recebid"),
      `envio_docs [${label}]: must not mark doc or open parallel flow: "${result.response?.reply_text}"`
    );
  }
});

// ===== 9. BLINDAGEM aguardando_retorno_correspondente =====
await asyncTest('9. BLINDAGEM: aguardando_retorno_correspondente não inventou prazo/status', async () => {
  const cases = [
    { text: "quanto tempo demora?", label: "prazo" },
    { text: "já teve resposta?", label: "status" },
    { text: "e agora?", label: "e agora" },
    { text: "está demorando muito", label: "demora" }
  ];
  for (const { text, label } of cases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: "aguardando_retorno_correspondente", message_text: text, known_slots: {}, pending_slots: ["correspondente"] },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `correspondente [${label}]: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `correspondente [${label}]: should_advance_stage must be false`);
    const reply = nf(result.response?.reply_text);
    // blindagem: não pode inventar prazo específico
    assert.ok(
      !reply.includes("dias uteis") && !reply.includes("24 horas") && !reply.includes("48 horas"),
      `correspondente [${label}]: must not invent specific deadline: "${result.response?.reply_text}"`
    );
    // blindagem: não pode antecipar decisão sem base
    assert.ok(
      !reply.includes("foi aprovad") && !reply.includes("foi reprovad"),
      `correspondente [${label}]: must not invent decision: "${result.response?.reply_text}"`
    );
  }
});

// ===== 10. BLINDAGEM agendamento_visita =====
await asyncTest('10. BLINDAGEM: agendamento_visita não confirmou visita sozinho', async () => {
  const cases = [
    { text: "quais horários?", label: "horários" },
    { text: "posso ir outro dia?", label: "remarcar" },
    { text: "precisa levar alguém?", label: "acompanhante" },
    { text: "prefiro ver depois", label: "esfriamento" }
  ];
  for (const { text, label } of cases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: "agendamento_visita", message_text: text, known_slots: {}, pending_slots: ["visita"] },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `agendamento_visita [${label}]: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `agendamento_visita [${label}]: should_advance_stage must be false`);
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `agendamento_visita [${label}] response valid: ${v.errors.join(", ")}`);
    // não pode avançar stage sozinho (já verificado acima) — adicional: não pode criar agenda paralela
    const reply10 = nf(result.response?.reply_text);
    assert.ok(
      !reply10.includes("confirmad") && !reply10.includes("agendad"),
      `agendamento_visita [${label}]: must not confirm or schedule visit autonomously: "${result.response?.reply_text}"`
    );
  }
});

// ===== 11. REGRESSÃO =====
await asyncTest('11. REGRESSÃO: gates finais, P3, familiar, parceiro, titular, composição inicial, estado_civil e topo não quebraram', async () => {
  const regressionCases = [
    { stage: "ir_declarado", text: "não declaro, ainda consigo?", slots: ["ir_declarado"], known: { regime_trabalho: "autonomo" } },
    { stage: "restricao", text: "tenho nome sujo, isso barra?", slots: ["restricao"], known: {} },
    { stage: "p3_tipo_pergunta", text: "não sei", slots: ["p3_tipo"], known: { composicao: "familiar" } },
    { stage: "regime_trabalho_parceiro_familiar", text: "é autônomo", slots: ["regime_trabalho_familiar"], known: { composicao: "familiar" } },
    { stage: "parceiro_tem_renda", text: "sim", slots: ["parceiro_tem_renda"], known: { composicao: "parceiro" } },
    { stage: "renda", text: "é bruto ou líquido?", slots: ["renda"], known: {} },
    { stage: "somar_renda_solteiro", text: "posso ir sozinho?", slots: ["composicao"], known: {} },
    { stage: "estado_civil", text: "casado", slots: ["estado_civil", "composicao"], known: {} },
    { stage: "inicio", text: "oi", slots: [], known: {} }
  ];
  for (const { stage, text, slots, known } of regressionCases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: known, pending_slots: slots },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} response valid: ${v.errors.join(", ")}`);
  }
});

// ===== 12. CHECAGEM MECÂNICA =====
await asyncTest('12. CHECAGEM MECÂNICA: should_advance_stage=false em todos os 4 stages operacionais finais', async () => {
  const stages = [
    { stage: "envio_docs", text: "posso mandar depois?", slots: ["docs"] },
    { stage: "aguardando_retorno_correspondente", text: "quanto tempo demora?", slots: ["correspondente"] },
    { stage: "agendamento_visita", text: "quais horários?", slots: ["visita"] },
    { stage: "finalizacao_processo", text: "o que acontece agora?", slots: [] }
  ];
  for (const { stage, text, slots } of stages) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: slots },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} response valid: ${v.errors.join(", ")}`);
  }
});

// ===== Summary =====
console.log(`\ncognitive_bloco_operacional_final.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
