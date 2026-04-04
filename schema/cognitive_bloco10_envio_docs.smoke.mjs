/**
 * cognitive_bloco10_envio_docs.smoke.mjs
 *
 * Smoke tests para BLOCO 10 — ENVIO_DOCS — Casca Cognitiva Real.
 *
 * Cobertura canônica:
 *  1.  CLT fixo → 1 holerite + envio unitário
 *  2.  CLT variável → 3 holerites + envio unitário
 *  3.  Autônomo com IR → declaração IR + recibo IR
 *  4.  Autônomo sem IR → 6 extratos bancários
 *  5.  Composição parceiro → docs parceiro mencionados
 *  6.  Composição familiar → docs familiar mencionados
 *  7.  P3 na composição → docs P3 mencionados
 *  8.  Envio unitário obrigatório presente na guidance
 *  9.  "posso mandar depois?" → acolhe + envio unitário reminder
 * 10.  "ainda não tenho todos" → acolhe + continua em envio_docs
 * 11.  "de quem é esse doc?" → pede clareza participante
 * 12.  "prefiro presencial" → acolhe, sem marcar docs
 * 13.  "é seguro enviar por aqui?" → responde segurança, sem marcar docs
 * 14.  "não tenho tempo agora" → acolhe + reminder envio unitário
 * 15.  "site" → direciona pelo site
 * 16.  should_advance_stage=false em todos os cenários
 * 17.  BLINDAGEM: não declarar pasta completa
 * 18.  BLINDAGEM: não prometer validação final
 * 19.  BLINDAGEM: CLT fixo ≠ CLT variável (holerite distinto)
 * 20.  BLINDAGEM: autônomo com IR ≠ sem IR (docs distintos)
 * 21.  Regressão: outros blocos não quebraram
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

// ===== 1. CLT fixo → 1 holerite + envio unitário =====
await asyncTest('1. CLT fixo: guidance menciona holerite (último) + envio unitário', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "quais documentos preciso enviar?",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("holerite"), `reply should mention holerite: "${result.response.reply_text}"`);
  assert.ok(
    reply.includes("ultimo") || reply.includes("fixo") || reply.includes("somente"),
    `reply should reference single/last holerite for fixed CLT: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("um por vez") || reply.includes("um documento por vez"),
    `reply should mention envio unitário: "${result.response.reply_text}"`
  );
});

// ===== 2. CLT variável → 3 holerites + envio unitário =====
await asyncTest('2. CLT variável: guidance menciona 3 últimos holerites', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "quais documentos preciso?",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt", renda_variavel: "sim" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.includes("holerite"), `reply should mention holerite: "${result.response.reply_text}"`);
  assert.ok(
    reply.includes("3") || reply.includes("tres") || reply.includes("ultimos") || reply.includes("variacao") || reply.includes("variavel"),
    `reply should reference 3 holerites or variation for variable CLT: "${result.response.reply_text}"`
  );
});

// ===== 3. Autônomo com IR → declaração IR + recibo IR =====
await asyncTest('3. Autônomo com IR: guidance menciona declaração IR + recibo', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "o que preciso enviar?",
      known_slots: { composicao: "solteiro", regime_trabalho: "autonomo", ir_declarado: "sim" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("declara") && reply.includes("ir"),
    `reply should mention declaração de IR: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("recibo"),
    `reply should mention recibo de IR: "${result.response.reply_text}"`
  );
});

// ===== 4. Autônomo sem IR → 6 extratos bancários =====
await asyncTest('4. Autônomo sem IR: guidance menciona 6 extratos bancários', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "o que preciso enviar?",
      known_slots: { composicao: "solteiro", regime_trabalho: "autonomo", ir_declarado: "nao" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("extrato"),
    `reply should mention extratos bancários: "${result.response.reply_text}"`
  );
  assert.ok(
    reply.includes("6") || reply.includes("seis"),
    `reply should mention 6 extratos: "${result.response.reply_text}"`
  );
});

// ===== 5. Composição parceiro → docs parceiro mencionados =====
await asyncTest('5. Composição parceiro: guidance menciona docs do parceiro', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "quais documentos preciso enviar?",
      known_slots: { composicao: "parceiro", regime_trabalho: "clt", regime_trabalho_parceiro: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("parceiro") || reply.includes("composicao"),
    `reply should mention parceiro docs: "${result.response.reply_text}"`
  );
});

// ===== 6. Composição familiar → docs familiar mencionados =====
await asyncTest('6. Composição familiar: guidance menciona docs do familiar', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "quais documentos preciso enviar?",
      known_slots: { composicao: "familiar", regime_trabalho: "clt", regime_trabalho_familiar: "aposentado" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("familiar") || reply.includes("composicao"),
    `reply should mention familiar docs: "${result.response.reply_text}"`
  );
});

// ===== 7. P3 na composição → docs P3 mencionados =====
await asyncTest('7. P3 na composição: guidance menciona docs da terceira pessoa', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "quais documentos preciso enviar?",
      known_slots: { composicao: "parceiro", regime_trabalho: "clt", p3: "sim", regime_trabalho_p3: "autonomo" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("p3") || reply.includes("terceira pessoa") || reply.includes("composicao"),
    `reply should mention P3 docs: "${result.response.reply_text}"`
  );
});

// ===== 8. Envio unitário obrigatório presente na guidance =====
await asyncTest('8. Envio unitário: guidance menciona envio um por vez', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "o que eu preciso enviar?",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("um por vez") || reply.includes("um documento por vez"),
    `reply should mention envio unitário: "${result.response.reply_text}"`
  );
});

// ===== 9. "posso mandar depois?" → acolhe + envio unitário =====
await asyncTest('9. Deferimento: "posso mandar depois?" — acolhe + reminder', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "posso mandar depois?",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    reply.includes("document") || reply.includes("mandar") || reply.includes("analis") || reply.includes("puder") || reply.includes("quando"),
    `reply should acknowledge deferment: "${result.response.reply_text}"`
  );
});

// ===== 10. "ainda não tenho todos" → acolhe + continua =====
await asyncTest('10. Não tem tudo: "ainda não tenho todos os docs" — acolhe sem sair da fase', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "ainda não tenho todos os documentos",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false, "must stay in envio_docs");
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  // não deve declarar pasta completa
  assert.ok(
    !reply.includes("pasta completa") && !reply.includes("tudo recebido") && !reply.includes("validado"),
    `reply must not declare pasta completa: "${result.response.reply_text}"`
  );
});

// ===== 11. Dúvida participante =====
await asyncTest('11. Dúvida participante: "de quem é esse doc?" — pede clareza', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "de quem é esse documento?",
      known_slots: { composicao: "parceiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("titular") || reply.includes("parceiro") || reply.includes("participante") || reply.includes("pessoa"),
    `reply should mention participant clarity: "${result.response.reply_text}"`
  );
});

// ===== 12. Presencial =====
await asyncTest('12. Presencial: "prefiro presencial" — acolhe sem marcar docs', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "prefiro presencial",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("recebid") && !reply.includes("checklist confirmad") && !reply.includes("marcad"),
    `reply must not mark docs: "${result.response.reply_text}"`
  );
});

// ===== 13. Segurança =====
await asyncTest('13. Segurança: "é seguro enviar por aqui?" — responde sem marcar docs', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "é seguro enviar documentos por aqui?",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    !reply.includes("recebid") && !reply.includes("checklist confirmad"),
    `reply must not mark docs: "${result.response.reply_text}"`
  );
});

// ===== 14. Sem tempo =====
await asyncTest('14. Sem tempo: "não tenho tempo agora" — acolhe + reminder unitário', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "não tenho tempo agora",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(reply.length > 10, "reply must have content");
  assert.ok(
    reply.includes("document") || reply.includes("mandar") || reply.includes("analis") || reply.includes("puder") || reply.includes("quando"),
    `reply should acknowledge time constraint: "${result.response.reply_text}"`
  );
});

// ===== 15. Site =====
await asyncTest('15. Site: "prefiro enviar pelo site" — direciona pelo site', async () => {
  const result = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "prefiro enviar pelo site",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine produced a result");
  assert.strictEqual(result.response.should_advance_stage, false);
  const reply = nf(result.response.reply_text);
  assert.ok(
    reply.includes("site") || reply.includes("portal"),
    `reply should mention site channel: "${result.response.reply_text}"`
  );
});

// ===== 16. should_advance_stage=false em todos =====
await asyncTest('16. should_advance_stage=false em todos os cenários envio_docs', async () => {
  const scenarios = [
    "posso mandar depois?",
    "prefiro presencial",
    "é seguro?",
    "não tenho tempo agora",
    "quais documentos preciso?",
    "de quem é esse doc?",
    "ainda não tenho todos"
  ];
  for (const msg of scenarios) {
    const result = await runReadOnlyCognitiveEngine(
      {
        current_stage: "envio_docs",
        message_text: msg,
        known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
        pending_slots: ["docs"]
      },
      heuristicOnlyRuntime
    );
    assert.strictEqual(result.response.should_advance_stage, false, `should_advance_stage must be false for: "${msg}"`);
  }
});

// ===== 17. BLINDAGEM: não declarar pasta completa =====
await asyncTest('17. BLINDAGEM: nenhuma resposta declara pasta completa', async () => {
  const scenarios = [
    "quais documentos preciso?",
    "posso mandar depois?",
    "é seguro?",
    "prefiro presencial"
  ];
  for (const msg of scenarios) {
    const result = await runReadOnlyCognitiveEngine(
      {
        current_stage: "envio_docs",
        message_text: msg,
        known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
        pending_slots: ["docs"]
      },
      heuristicOnlyRuntime
    );
    const reply = nf(result.response.reply_text);
    assert.ok(
      !reply.includes("pasta completa") && !reply.includes("tudo certo") && !reply.includes("todos os doc.*recebido"),
      `reply must not declare pasta completa for "${msg}": "${result.response.reply_text}"`
    );
  }
});

// ===== 18. BLINDAGEM: não prometer validação final =====
await asyncTest('18. BLINDAGEM: nenhuma resposta promete validação final', async () => {
  const scenarios = [
    "quais documentos preciso?",
    "posso mandar depois?",
    "é seguro?",
    "não tenho tempo"
  ];
  for (const msg of scenarios) {
    const result = await runReadOnlyCognitiveEngine(
      {
        current_stage: "envio_docs",
        message_text: msg,
        known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
        pending_slots: ["docs"]
      },
      heuristicOnlyRuntime
    );
    const reply = nf(result.response.reply_text);
    assert.ok(
      !reply.includes("aprovado") && !reply.includes("validado final") && !reply.includes("documento.*aprovad"),
      `reply must not promise final validation for "${msg}": "${result.response.reply_text}"`
    );
  }
});

// ===== 19. BLINDAGEM: CLT fixo ≠ CLT variável =====
await asyncTest('19. BLINDAGEM: CLT fixo ≠ CLT variável — holerite distinto', async () => {
  const fixo = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "quais documentos preciso?",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  const variavel = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "quais documentos preciso?",
      known_slots: { composicao: "solteiro", regime_trabalho: "clt", renda_variavel: "sim" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  const fixoReply = nf(fixo.response.reply_text);
  const variavelReply = nf(variavel.response.reply_text);
  // At minimum, the variable reply should be different from fixed
  assert.notStrictEqual(fixoReply, variavelReply, "CLT fixo and variável should produce different guidance");
});

// ===== 20. BLINDAGEM: autônomo com IR ≠ sem IR =====
await asyncTest('20. BLINDAGEM: autônomo com IR ≠ sem IR — docs distintos', async () => {
  const comIR = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "o que preciso enviar?",
      known_slots: { composicao: "solteiro", regime_trabalho: "autonomo", ir_declarado: "sim" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  const semIR = await runReadOnlyCognitiveEngine(
    {
      current_stage: "envio_docs",
      message_text: "o que preciso enviar?",
      known_slots: { composicao: "solteiro", regime_trabalho: "autonomo", ir_declarado: "nao" },
      pending_slots: ["docs"]
    },
    heuristicOnlyRuntime
  );
  const comIRReply = nf(comIR.response.reply_text);
  const semIRReply = nf(semIR.response.reply_text);
  assert.notStrictEqual(comIRReply, semIRReply, "autônomo com IR and sem IR should produce different guidance");
  assert.ok(comIRReply.includes("ir") || comIRReply.includes("declara"), `com IR should mention declaração: "${comIR.response.reply_text}"`);
  assert.ok(semIRReply.includes("extrato"), `sem IR should mention extratos: "${semIR.response.reply_text}"`);
});

// ===== 21. Regressão: outros blocos não quebraram =====
await asyncTest('21. REGRESSÃO: topo, composição inicial, estado_civil, renda, gates finais não quebraram', async () => {
  // Topo
  const topo = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi, quero financiar", known_slots: {}, pending_slots: ["nome"] },
    heuristicOnlyRuntime
  );
  assert.ok(topo.response, "topo engine produced result");
  const vTopo = validateReadOnlyCognitiveResponse(topo.response);
  assert.ok(vTopo.valid, `topo response valid: ${vTopo.errors.join(", ")}`);

  // Estado civil
  const ec = await runReadOnlyCognitiveEngine(
    { current_stage: "estado_civil", message_text: "sou casado", known_slots: { nome: "João" }, pending_slots: ["estado_civil"] },
    heuristicOnlyRuntime
  );
  assert.ok(ec.response, "estado_civil engine produced result");
  const vEc = validateReadOnlyCognitiveResponse(ec.response);
  assert.ok(vEc.valid, `estado_civil response valid: ${vEc.errors.join(", ")}`);

  // Renda
  const renda = await runReadOnlyCognitiveEngine(
    { current_stage: "renda", message_text: "ganho 3 mil", known_slots: { nome: "João", regime_trabalho: "clt" }, pending_slots: ["renda"] },
    heuristicOnlyRuntime
  );
  assert.ok(renda.response, "renda engine produced result");
  const vRenda = validateReadOnlyCognitiveResponse(renda.response);
  assert.ok(vRenda.valid, `renda response valid: ${vRenda.errors.join(", ")}`);

  // Gate final
  const ctps = await runReadOnlyCognitiveEngine(
    { current_stage: "ctps_36", message_text: "sim, tenho", known_slots: { regime_trabalho: "clt" }, pending_slots: ["ctps_36"] },
    heuristicOnlyRuntime
  );
  assert.ok(ctps.response, "ctps_36 engine produced result");
  const vCtps = validateReadOnlyCognitiveResponse(ctps.response);
  assert.ok(vCtps.valid, `ctps_36 response valid: ${vCtps.errors.join(", ")}`);
});

// ===== SUMMARY =====
console.log(`\ncognitive_bloco10_envio_docs.smoke: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
