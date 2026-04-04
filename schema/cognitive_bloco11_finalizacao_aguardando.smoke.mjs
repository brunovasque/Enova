/**
 * cognitive_bloco11_finalizacao_aguardando.smoke.mjs
 *
 * Smoke tests dedicados ao BLOCO 11 do quadro cognitivo:
 *   - finalizacao_processo
 *   - aguardando_retorno_correspondente
 *
 * Contrato canônico verificado:
 *  1. finalizacao_processo NÃO é aprovação
 *  2. finalizacao_processo comunica conclusão interna + encaminhamento
 *  3. finalizacao_processo respeita prontidão do pacote
 *  4. aguardando_retorno_correspondente usa "pré-análise"
 *  5. aguardando_retorno_correspondente não promete prazo
 *  6. Nenhum stage pula para visita/aprovação
 *  7. Catch-all (mensagem simples) produz fala útil, sem loop seco
 *  8. should_advance_stage = false em todos os cenários
 *  9. Não há duplicidade de prefixo + mecânico (fala cognitiva é única)
 * 10. Regressão: outros blocos não quebraram
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

// ================================================================
// BLOCO 11 — finalizacao_processo
// ================================================================

// 1. finalizacao_processo: "o que acontece agora?" COM pacote enviado
await asyncTest('1. finalizacao: "o que acontece agora?" + pacote enviado → menciona encaminhamento, sem aprovação', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "o que acontece agora?", known_slots: { processo_enviado_correspondente: { value: true } }, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // Deve mencionar encaminhamento
  assert.ok(
    reply.includes("encaminhad") || reply.includes("correspondente") || reply.includes("canal oficial"),
    `reply should mention forwarding: "${result.response.reply_text}"`
  );
  // NÃO pode soar como aprovação
  assert.ok(
    !reply.includes("aprovad"),
    `reply must NOT sound like approval: "${result.response.reply_text}"`
  );
  // NÃO pode puxar visita
  assert.ok(
    !reply.includes("visita") && !reply.includes("plantao") && !reply.includes("plantão"),
    `reply must NOT pull visita prematurely: "${result.response.reply_text}"`
  );
});

// 2. finalizacao_processo: "o que acontece agora?" SEM pacote enviado
await asyncTest('2. finalizacao: "o que acontece agora?" + pacote NÃO enviado → fala de finalização interna, sem falar como se já encaminhou', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "o que acontece agora?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10);
  // Deve mencionar finalização/conclusão interna
  assert.ok(
    reply.includes("conclu") || reply.includes("finali") || reply.includes("etapa"),
    `reply should mention internal conclusion: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("aprovad"),
    `reply must NOT sound like approval: "${result.response.reply_text}"`
  );
});

// 3. finalizacao_processo: "vocês me avisam?"
await asyncTest('3. finalizacao: "vocês me avisam?" → confirma acompanhamento, sem promessa', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "vocês me avisam?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("comunic") || reply.includes("avis") || reply.includes("inform"), `should confirm notification: "${result.response.reply_text}"`);
  assert.ok(!reply.includes("aprovad"), "must not mention approval");
});

// 4. finalizacao_processo: "acabou?"
await asyncTest('4. finalizacao: "acabou?" + pacote enviado → confirma conclusão, menciona correspondente', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "acabou?", known_slots: { processo_enviado_correspondente: { value: true } }, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("correspond") || reply.includes("encaminhad") || reply.includes("conclu"), `should reference correspondent: "${result.response.reply_text}"`);
  assert.ok(!reply.includes("aprovad"), "must not mention approval");
});

// 5. finalizacao_processo: "acabou?" SEM pacote
await asyncTest('5. finalizacao: "acabou?" + pacote NÃO enviado → fala de finalização em andamento', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "acabou?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("finali") || reply.includes("conclu") || reply.includes("encaminhament"), `should mention finalization: "${result.response.reply_text}"`);
  assert.ok(!reply.includes("aprovad"), "must not mention approval");
});

// 6. finalizacao_processo: "já foi aprovado?" — proteção contra salto
await asyncTest('6. finalizacao: "já foi aprovado?" → NÃO confirma aprovação', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "já foi aprovado?", known_slots: { processo_enviado_correspondente: { value: true } }, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    !reply.includes("sim") || reply.includes("ainda"),
    `must NOT confirm approval: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("finali") || reply.includes("encaminhament") || reply.includes("etapa") || reply.includes("analise") || reply.includes("parecer"),
    `should redirect to correct framing: "${result.response.reply_text}"`
  );
});

// 7. finalizacao_processo: "quero visita" — proteção contra puxar visita cedo
await asyncTest('7. finalizacao: "quero visita" → NÃO pula para visita', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "quero visita", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("posterior") || reply.includes("finali") || reply.includes("encaminhament") || reply.includes("etapa"),
    `should explain visita is a later step: "${result.response.reply_text}"`
  );
});

// 8. finalizacao_processo: catch-all simples "ok obrigado"
await asyncTest('8. finalizacao: "ok obrigado" → fala útil, sem loop seco', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "ok obrigado", known_slots: { processo_enviado_correspondente: { value: true } }, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "catch-all must produce content");
  assert.ok(
    reply.includes("encaminhad") || reply.includes("correspond") || reply.includes("acompanhand") || reply.includes("avis"),
    `catch-all should be useful: "${result.response.reply_text}"`
  );
});

// ================================================================
// BLOCO 11 — aguardando_retorno_correspondente
// ================================================================

// 9. aguardando: "quanto tempo demora?" — sem prazo inventado, menciona pré-análise
await asyncTest('9. aguardando: "quanto tempo demora?" → sem prazo, menciona pré-análise', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "quanto tempo demora?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  // Não pode inventar prazo
  assert.ok(
    !reply.includes("dias uteis") && !reply.includes("24 horas") && !reply.includes("48 horas") && !reply.includes("1 semana"),
    `must not invent deadline: "${result.response.reply_text}"`
  );
  // Deve mencionar pré-análise
  assert.ok(
    reply.includes("pre-analise") || reply.includes("pre analise") || reply.includes("correspondente"),
    `should mention pre-analise: "${result.response.reply_text}"`
  );
});

// 10. aguardando: "já teve resposta?" — menciona pré-análise, não inventa status
await asyncTest('10. aguardando: "já teve resposta?" → aguardando pré-análise, sem inventar status', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "já teve resposta?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("pre-analise") || reply.includes("correspondente") || reply.includes("ainda"),
    `should reference pre-analise or waiting: "${result.response.reply_text}"`
  );
  assert.ok(
    !reply.includes("foi aprovad") && !reply.includes("foi reprovad"),
    `must not invent decision: "${result.response.reply_text}"`
  );
});

// 11. aguardando: "e agora?" — informa pré-análise
await asyncTest('11. aguardando: "e agora?" → caso em pré-análise', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "e agora?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("pre-analise") || reply.includes("correspondente") || reply.includes("analise"),
    `should mention analysis: "${result.response.reply_text}"`
  );
});

// 12. aguardando: "já foi aprovado?" — NÃO confirma aprovação
await asyncTest('12. aguardando: "já foi aprovado?" → NÃO confirma', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "já foi aprovado?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("ainda") || reply.includes("pre-analise") || reply.includes("parecer") || reply.includes("posicionament"),
    `should clarify no decision yet: "${result.response.reply_text}"`
  );
  assert.ok(
    !(reply.includes("sim") && reply.includes("aprovad")),
    `must NOT confirm approval: "${result.response.reply_text}"`
  );
});

// 13. aguardando: catch-all "ok tá bom" — fala útil anti-loop
await asyncTest('13. aguardando: "ok tá bom" → fala útil, sem repetição seca', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "ok tá bom", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "catch-all must produce content");
  assert.ok(
    reply.includes("pre-analise") || reply.includes("correspondente") || reply.includes("atualizac"),
    `catch-all should be useful: "${result.response.reply_text}"`
  );
});

// 14. aguardando: "obrigado" — fala útil, sem loop
await asyncTest('14. aguardando: "obrigado" → fala útil', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "obrigado", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "must produce useful content");
});

// 15. aguardando: "está demorando muito" — sem prazo inventado
await asyncTest('15. aguardando: "está demorando muito" → acolhe sem prazo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "está demorando muito", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    !reply.includes("dias uteis") && !reply.includes("24 horas") && !reply.includes("48 horas"),
    `must not invent deadline: "${result.response.reply_text}"`
  );
});

// ================================================================
// BLINDAGEM CRUZADA
// ================================================================

// 16. finalizacao NÃO pede documentos novamente
await asyncTest('16. BLINDAGEM: finalizacao NÃO reabre docs', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "finalizacao_processo", message_text: "preciso mandar mais algum documento?", known_slots: { processo_enviado_correspondente: { value: true } }, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    !reply.includes("mande") && !reply.includes("envie") && !reply.includes("documento pendente"),
    `must not reopen docs: "${result.response.reply_text}"`
  );
});

// 17. aguardando NÃO pede dados já fechados
await asyncTest('17. BLINDAGEM: aguardando NÃO pede dados já fechados', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "aguardando_retorno_correspondente", message_text: "preciso enviar mais alguma coisa?", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response);
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    !reply.includes("mande") && !reply.includes("envie o") && !reply.includes("falta document"),
    `must not ask for already-closed data: "${result.response.reply_text}"`
  );
});

// 18. REGRESSÃO: envio_docs, agendamento_visita não quebraram
await asyncTest('18. REGRESSÃO: envio_docs e agendamento_visita não quebraram', async () => {
  const regressionCases = [
    { stage: "envio_docs", text: "posso mandar depois?", known: { composicao: "solteiro", regime_trabalho: "clt" }, slots: ["docs"] },
    { stage: "agendamento_visita", text: "quais horários?", known: {}, slots: ["visita"] },
  ];
  for (const { stage, text, known, slots } of regressionCases) {
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

// 19. REGRESSÃO: blocos anteriores não quebraram
await asyncTest('19. REGRESSÃO: blocos anteriores (topo, composição, gates) não quebraram', async () => {
  const regressionCases = [
    { stage: "inicio", text: "oi", known: {}, slots: [] },
    { stage: "estado_civil", text: "casado", known: {}, slots: ["estado_civil"] },
    { stage: "somar_renda_solteiro", text: "posso ir sozinho?", known: {}, slots: ["composicao"] },
    { stage: "ir_declarado", text: "não declaro", known: { regime_trabalho: "autonomo" }, slots: ["ir_declarado"] },
    { stage: "restricao", text: "tenho nome sujo", known: {}, slots: ["restricao"] },
  ];
  for (const { stage, text, known, slots } of regressionCases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: known, pending_slots: slots },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage}: engine produced a result`);
    assert.strictEqual(result.response.should_advance_stage, false, `${stage}: should_advance_stage must be false`);
  }
});

// 20. Fala única: nenhum stage retorna array ou dupla fala
await asyncTest('20. CONTRATO: fala cognitiva é string única, sem duplicação', async () => {
  const cases = [
    { stage: "finalizacao_processo", text: "o que acontece agora?", known: { processo_enviado_correspondente: { value: true } } },
    { stage: "finalizacao_processo", text: "ok obrigado", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "quanto tempo demora?", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "ok tá bom", known: {} },
  ];
  for (const { stage, text, known } of cases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: known, pending_slots: [] },
      heuristicOnlyRuntime
    );
    const reply = result.response?.reply_text;
    assert.ok(typeof reply === "string", `${stage}: reply_text must be string`);
    assert.ok(reply.length > 0, `${stage}: reply_text must not be empty`);
    // Verifica que não há duplicação óbvia
    assert.ok(!reply.includes("\n\n\n"), `${stage}: no triple newlines (duplication signal)`);
  }
});

// 21. Validação estrutural completa
await asyncTest('21. VALIDAÇÃO: todas as respostas BLOCO 11 passam validateReadOnlyCognitiveResponse', async () => {
  const cases = [
    { stage: "finalizacao_processo", text: "o que acontece agora?", known: { processo_enviado_correspondente: { value: true } } },
    { stage: "finalizacao_processo", text: "acabou?", known: {} },
    { stage: "finalizacao_processo", text: "ok obrigado", known: {} },
    { stage: "finalizacao_processo", text: "já foi aprovado?", known: {} },
    { stage: "finalizacao_processo", text: "quero visita", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "quanto tempo demora?", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "já teve resposta?", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "e agora?", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "ok tá bom", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "obrigado", known: {} },
    { stage: "aguardando_retorno_correspondente", text: "já foi aprovado?", known: {} },
  ];
  for (const { stage, text, known } of cases) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: known, pending_slots: [] },
      heuristicOnlyRuntime
    );
    assert.ok(result.response, `${stage} [${text}]: engine produced a result`);
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage} [${text}] response valid: ${v.errors.join(", ")}`);
  }
});

// ===== Summary =====
console.log(`\ncognitive_bloco11_finalizacao_aguardando.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
