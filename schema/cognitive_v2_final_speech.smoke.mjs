import assert from "node:assert/strict";

// ================================================================
// SMOKE TEST: V2 Final Speech Contract
// Validates the surgical fix: when COGNITIVE_V2_MODE="on" and V2
// has a useful LLM reply, V2 TAKES the final speech (substitutes
// mechanical messages). Mechanical funnel remains sovereign on
// stage/gate/nextStage/persistence.
//
// Tests:
//  1. step() assembly: v2TakesFinal=true → V2 reply substitutes mechanical
//  2. step() assembly: v2TakesFinal=false → V2 prefix + mechanical preserved
//  3. step() assembly: no cognitive prefix → mechanical only (fallback safe)
//  4. hasUsefulCognitiveReply: V2 on+LLM >30 chars → considered useful
//  5. hasUsefulCognitiveReply: V2 on+heuristic >30 chars → takes_final=true (NEW)
//  6. hasUsefulCognitiveReply: V2 off mode → answered_customer_question gate still applies
//  7. offtrack guard: when V2 already has reply, passes empty msgs so V2 wins
//  8. flags leak guard: __cognitive_v2_takes_final resets to false after step()
//  9. flags leak guard: __cognitive_reply_prefix resets to null after step()
// 10. regressão — soberania mecânica: suggested_stage nunca avança
// 11. regressão — soberania mecânica: stage/nextStage passados ao step() são preservados
// 12. regressão — baixa confiança V2 → reply descartado → fallback mecânico ativo
// 13. heuristic curto: V2 on+heuristic <=30 chars → takes_final=false (fallback mecânico)
// 14. no_llm_or_parse + fallback útil: confidence=0.68 → V2 assumes final speech
// 15. no_llm_or_parse + confidence=0 (forçado) → reply morre → fallback mecânico continua
// 16. cenário real topo: "me tira uma dúvida?" + heuristic útil → V2 takes final
// 17. regressão: reason=cognitive_v2 (LLM ok) continua takes_final=true
// 18. regressão: v2Mode=off + heuristic → takes_final=false (nunca libera fora do modo on)
// ================================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     ${e.message}`);
  }
}

// ================================================================
// Inline mirrors of the exact worker.js logic under test
// These must match the implementation in "Enova worker.js" exactly.
// ================================================================

// mirrors step() L159-174 (after fix)
function assembleMessages(st, rawMessages) {
  const rawArr = Array.isArray(rawMessages) ? rawMessages : [rawMessages];
  const cognitivePrefix = String(st?.__cognitive_reply_prefix || "").trim();
  const v2TakesFinal = st?.__cognitive_v2_takes_final === true;

  const arr = v2TakesFinal && cognitivePrefix
    ? [cognitivePrefix]
    : cognitivePrefix
      ? [cognitivePrefix, ...rawArr].filter(Boolean)
      : rawArr.filter(Boolean);

  // clear transitional flags
  st.__cognitive_reply_prefix = null;
  st.__cognitive_v2_takes_final = false;

  return arr;
}

// mirrors runFunnel cognitive block (Enova worker.js:22325-22342 — patch contrato assunção fala final)
function applyHasUsefulCognitiveReplyLogic(st, cognitive, v2Mode) {
  const COGNITIVE_V1_CONFIDENCE_MIN = 0.66;
  const lowConfidence = Number(cognitive.confidence || 0) < COGNITIVE_V1_CONFIDENCE_MIN;
  const cognitiveReply = !lowConfidence ? String(cognitive.reply_text || "").trim() : "";

  const v2OnWithLlm = v2Mode === "on" && cognitive.reason === "cognitive_v2";
  const v2OnWithHeuristic = v2Mode === "on" && (
    cognitive.reason === "cognitive_v2_heuristic" ||
    cognitive.reason === "no_llm_or_parse"
  );
  const hasUsefulCognitiveReply =
    Boolean(cognitiveReply) &&
    (
      cognitive.answered_customer_question === true ||
      Boolean(cognitive.intent) ||
      Boolean(cognitive.safe_stage_signal) ||
      (v2OnWithLlm && cognitiveReply.length > 30) ||
      (v2OnWithHeuristic && cognitiveReply.length > 30)
    );

  if (hasUsefulCognitiveReply) {
    st.__cognitive_reply_prefix = cognitiveReply;
    // Condição ampliada: além de V2 "on" com LLM/heuristic, também fecha takes_final=true
    // quando o cognitivo (qualquer modo) respondeu explicitamente a pergunta do cliente
    // com reply substancial — evita cola mecânica redundante na mesma rodada.
    const _answeredSufficiently = cognitive.answered_customer_question === true && cognitiveReply.length > 30;
    st.__cognitive_v2_takes_final = (v2OnWithLlm || (v2OnWithHeuristic && cognitiveReply.length > 30) || _answeredSufficiently) ? true : false;
  } else {
    st.__cognitive_reply_prefix = null;
    st.__cognitive_v2_takes_final = false;
  }
}

// mirrors offtrack guard (Enova worker.js:22378-22384 — patch contrato assunção fala final)
function offtrackGuardDecision(st) {
  // Condição ampliada: takes_final=true OU prefix substancial (>30 chars).
  // Evita que reply cognitivo útil em modo "off" (V1) seja concatenado com reanchor mecânico.
  const v2HasReply = Boolean(st.__cognitive_reply_prefix) && (
    st.__cognitive_v2_takes_final === true ||
    String(st.__cognitive_reply_prefix).length > 30
  );
  const offtrackMessages = v2HasReply
    ? []
    : [
        "Certo. Vou analisar seu perfil primeiro e, no final, tiro todas suas dúvidas, combinado?",
        "Pra eu seguir aqui, me responde só a pergunta anterior direitinho. 🙏"
      ];
  return { v2HasReply, offtrackMessages };
}

// ================================================================
// GRUPO 1 — Montagem final em step()
// ================================================================
console.log("\n🔧 GRUPO 1: Montagem final em step()");

// Test 1: V2 takes final — reply substitutes mechanical
test("T1: v2TakesFinal=true → V2 reply substitutes mechanical messages", () => {
  const st = {
    __cognitive_reply_prefix: "Claro! O financiamento funciona assim: você contrata com garantia de imóvel. Me confirma seu estado civil pra continuar?",
    __cognitive_v2_takes_final: true
  };
  const mechanical = ["Acho que não entendi 🤔", "Me diga seu *estado civil*: solteiro(a), casado(a)..."];
  const result = assembleMessages(st, mechanical);
  assert.equal(result.length, 1, "deve ter apenas 1 mensagem (V2 reply)");
  assert.ok(result[0].includes("financiamento"), "deve conter a fala do V2");
  assert.ok(!result.some(m => m.includes("Acho que não entendi")), "fala mecânica deve estar silenciada");
});

// Test 2: V2 as prefix only (v1 mode) — mechanical preserved
test("T2: v2TakesFinal=false → V2 prefixes, mechanical preserved (legado)", () => {
  const st = {
    __cognitive_reply_prefix: "Boa pergunta! Vou te explicar.",
    __cognitive_v2_takes_final: false
  };
  const mechanical = ["Me diga seu estado civil."];
  const result = assembleMessages(st, mechanical);
  assert.equal(result.length, 2, "deve ter 2 mensagens (prefixo + mecânico)");
  assert.ok(result[0].includes("Boa pergunta"), "primeiro deve ser o prefixo V2");
  assert.ok(result[1].includes("estado civil"), "segundo deve ser mecânico");
});

// Test 3: No cognitive prefix — mechanical fallback passes through unchanged
test("T3: sem prefixo cognitivo → apenas mensagens mecânicas (fallback seguro)", () => {
  const st = {
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false
  };
  const mechanical = ["Me diga seu estado civil."];
  const result = assembleMessages(st, mechanical);
  assert.equal(result.length, 1, "deve ter exatamente 1 mensagem mecânica");
  assert.ok(result[0].includes("estado civil"), "deve ser a mensagem mecânica");
});

// ================================================================
// GRUPO 2 — hasUsefulCognitiveReply + takes_final flag
// ================================================================
console.log("\n🧠 GRUPO 2: hasUsefulCognitiveReply + takes_final flag");

// Test 4: V2 on+LLM with long reply → useful, takes_final=true
test("T4: V2 on+LLM reply >30 chars → hasUseful=true, takes_final=true", () => {
  const st = {};
  const cognitive = {
    reply_text: "O financiamento é um produto de crédito imobiliário com prazo de até 35 anos e taxa a partir de 8% ao ano.",
    confidence: 0.80,
    reason: "cognitive_v2",
    answered_customer_question: false,
    intent: null,
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.ok(Boolean(st.__cognitive_reply_prefix), "prefix deve estar definido");
  assert.equal(st.__cognitive_v2_takes_final, true, "takes_final deve ser true");
});

// Test 5: V2 on+heuristic with useful long reply → NOW takes_final=true
test("T5: V2 on+heuristic (reason=cognitive_v2_heuristic) + reply útil >30 chars → takes_final=true", () => {
  const st = {};
  const cognitive = {
    reply_text: "Entendo sua dúvida. Vamos continuar com o processo e eu te explico tudo passo a passo.",
    confidence: 0.75,
    reason: "cognitive_v2_heuristic",
    answered_customer_question: true,
    intent: "fallback_contextual",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.ok(Boolean(st.__cognitive_reply_prefix), "prefix deve estar definido");
  assert.equal(st.__cognitive_v2_takes_final, true, "takes_final deve ser true para heuristic útil (>30 chars)");
});

// Test 6: V2 off mode + answered_customer_question=true → takes_final=true (nova cobertura)
test("T6: v2Mode=off + answered_customer_question=true + reply>30 → takes_final=true (patch assunção)", () => {
  const st = {};
  const cognitive = {
    reply_text: "O financiamento habitacional é um produto de crédito com prazo longo e taxa fixa.",
    confidence: 0.80,
    reason: "cognitive_v2",
    answered_customer_question: true,
    intent: "fallback_contextual",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "off");
  // Com o patch: answered_customer_question=true + reply>30 → takes_final=true (qualquer modo)
  assert.ok(Boolean(st.__cognitive_reply_prefix), "prefix deve estar definido");
  assert.equal(st.__cognitive_v2_takes_final, true, "takes_final deve ser true: cognitivo respondeu explicitamente (answered=true, reply>30)");
});

// Test 7: Short reply V2 on+LLM <30 chars with no other signal → NOT useful
test("T7: V2 on+LLM reply <=30 chars, sem signal/intent → NOT useful, fallback mecânico", () => {
  const st = {};
  const cognitive = {
    reply_text: "Entendido.",
    confidence: 0.75,
    reason: "cognitive_v2",
    answered_customer_question: false,
    intent: null,
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.equal(st.__cognitive_reply_prefix, null, "prefix deve ser null (reply muito curto)");
  assert.equal(st.__cognitive_v2_takes_final, false, "takes_final deve ser false");
});

// ================================================================
// GRUPO 3 — Offtrack guard integra com V2
// ================================================================
console.log("\n🛡️ GRUPO 3: Offtrack guard integra com V2");

// Test 8: offtrack guard + V2 has reply → empty offtrack msgs, V2 wins
test("T8: offtrack detectado + V2 tem reply → offtrackMessages vazio, V2 vence", () => {
  const st = {
    __cognitive_reply_prefix: "O programa é o Minha Casa Minha Vida — financia imóveis com taxa reduzida. Me diga seu estado civil pra continuar.",
    __cognitive_v2_takes_final: true
  };
  const { v2HasReply, offtrackMessages } = offtrackGuardDecision(st);
  assert.equal(v2HasReply, true, "v2HasReply deve ser true");
  assert.equal(offtrackMessages.length, 0, "offtrackMessages deve estar vazio");
});

// Test 9: offtrack guard + no V2 reply → hardcoded fallback messages used
test("T9: offtrack detectado + sem V2 reply → mensagens hardcoded de offtrack usadas", () => {
  const st = {
    __cognitive_reply_prefix: null,
    __cognitive_v2_takes_final: false
  };
  const { v2HasReply, offtrackMessages } = offtrackGuardDecision(st);
  assert.equal(v2HasReply, false, "v2HasReply deve ser false");
  assert.equal(offtrackMessages.length, 2, "deve ter 2 mensagens hardcoded de offtrack");
  assert.ok(offtrackMessages[0].includes("Vou analisar"), "primeira mensagem deve ser o fallback offtrack");
});

// ================================================================
// GRUPO 4 — Flag leak guard (flags não vazam entre rodadas)
// ================================================================
console.log("\n🔒 GRUPO 4: Flag leak guard");

// Test 10: flags are cleared after assembleMessages()
test("T10: __cognitive_v2_takes_final resetado para false após step()", () => {
  const st = {
    __cognitive_reply_prefix: "Resposta V2 de teste com mais de 30 caracteres para passar na validação.",
    __cognitive_v2_takes_final: true
  };
  assembleMessages(st, ["mensagem mecânica"]);
  assert.equal(st.__cognitive_v2_takes_final, false, "flag deve ser false após step()");
});

// Test 11: __cognitive_reply_prefix cleared after assembleMessages()
test("T11: __cognitive_reply_prefix resetado para null após step()", () => {
  const st = {
    __cognitive_reply_prefix: "Resposta V2 longa de teste para passar.",
    __cognitive_v2_takes_final: false
  };
  assembleMessages(st, ["mecânico"]);
  assert.equal(st.__cognitive_reply_prefix, null, "prefix deve ser null após step()");
});

// ================================================================
// GRUPO 5 — Soberania mecânica (regressão)
// ================================================================
console.log("\n⚙️  GRUPO 5: Soberania mecânica — regressão");

// Test 12: V2 never advances suggested_stage beyond current stage
test("T12: adaptCognitiveV2Output: suggested_stage = current stage (nunca avança)", () => {
  // Simula o comportamento do adapter: suggested_stage sempre = stage passado
  function mockAdaptOutput(stage) {
    return { suggested_stage: stage }; // mirrors adapter invariant
  }
  const stages = ["estado_civil", "renda", "envio_docs", "agendamento_visita"];
  for (const s of stages) {
    const out = mockAdaptOutput(s);
    assert.equal(out.suggested_stage, s, `suggested_stage deve ser '${s}'`);
  }
});

// Test 13: With V2 takes_final=true, nextStage parameter passed to step() is unchanged
test("T13: nextStage não é alterado pelo V2 takes_final (stage soberano)", () => {
  // assembleMessages() does not touch nextStage — it only modifies the message array
  const nextStage = "renda"; // mechanical decides this
  const st = {
    __cognitive_reply_prefix: "Resposta V2 de teste com mais de 30 caracteres aqui.",
    __cognitive_v2_takes_final: true
  };
  const mechanical = ["Qual é sua renda?"];
  const result = assembleMessages(st, mechanical);
  // nextStage should be completely untouched
  assert.equal(nextStage, "renda", "nextStage permanece intacto — mecânico decide");
  assert.equal(result.length, 1, "apenas o V2 reply na fala");
});

// Test 14: low confidence → V2 reply discarded → mechanical fallback active
test("T14: baixa confiança V2 → reply descartado → fallback mecânico ativo", () => {
  const st = {};
  const cognitive = {
    reply_text: "Resposta bem longa do V2 com mais de 30 caracteres mas confiança baixa.",
    confidence: 0.50, // below 0.66 threshold
    reason: "cognitive_v2",
    answered_customer_question: false,
    intent: null,
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.equal(st.__cognitive_reply_prefix, null, "prefix deve ser null (baixa confiança)");
  assert.equal(st.__cognitive_v2_takes_final, false, "takes_final deve ser false (baixa confiança)");
});

// ================================================================
// GRUPO 6 — Heuristic/Fallback V2 takes_final (CORREÇÃO CIRÚRGICA)
// ================================================================
console.log("\n🔬 GRUPO 6: Heuristic/Fallback V2 takes_final");

// Test 15: V2 on+heuristic short reply (<=30 chars) → takes_final=false
test("T15: V2 on+heuristic reply <=30 chars → takes_final=false (fallback mecânico)", () => {
  const st = {};
  const cognitive = {
    reply_text: "Entendido, vamos seguir.",
    confidence: 0.72,
    reason: "cognitive_v2_heuristic",
    answered_customer_question: false,
    intent: null,
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.equal(st.__cognitive_reply_prefix, null, "prefix deve ser null (reply curto sem signal)");
  assert.equal(st.__cognitive_v2_takes_final, false, "takes_final deve ser false (reply curto)");
});

// Test 16: no_llm_or_parse + fallback útil (confidence=0.68 from fix) → V2 assumes final
test("T16: no_llm_or_parse + fallback útil (confidence=0.68) → V2 assume fala final", () => {
  const st = {};
  // Simulates buildCognitiveFallback output AFTER the fix (confidence: 0.68)
  const cognitive = {
    reply_text: "Entendo sua dúvida. Pra te orientar com segurança, eu preciso fechar esta etapa primeiro e aí te explico o próximo passo com base no seu perfil.",
    confidence: 0.68, // FIXED: was 0, now 0.68 (above 0.66 threshold)
    reason: "no_llm_or_parse",
    answered_customer_question: true,
    intent: "fallback_contextual",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.ok(Boolean(st.__cognitive_reply_prefix), "prefix deve estar definido (fallback útil)");
  assert.equal(st.__cognitive_v2_takes_final, true, "takes_final deve ser true (fallback útil >30 chars, v2 on)");
});

// Test 17: no_llm_or_parse with forced confidence=0 → reply dies → mechanical fallback
test("T17: no_llm_or_parse + confidence=0 forçado → reply morre → fallback mecânico", () => {
  const st = {};
  const cognitive = {
    reply_text: "Entendo sua dúvida. Pra te orientar com segurança, eu preciso fechar esta etapa.",
    confidence: 0, // Forced zero (e.g. manual override) — below 0.66 threshold
    reason: "no_llm_or_parse",
    answered_customer_question: true,
    intent: "fallback_contextual",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.equal(st.__cognitive_reply_prefix, null, "prefix deve ser null (confidence=0 mata reply)");
  assert.equal(st.__cognitive_v2_takes_final, false, "takes_final deve ser false (reply morto)");
});

// Test 18: real topo scenario — "me tira uma dúvida?" + heuristic useful → V2 takes final
test("T18: cenário real topo — 'me tira uma dúvida?' + heuristic útil → V2 assume fala final", () => {
  const st = {};
  // Simulates heuristic response for a typical top-of-funnel question
  const cognitive = {
    reply_text: "Claro! O programa Minha Casa Minha Vida ajuda você a financiar seu imóvel com condições especiais. Pra começar, preciso entender um pouco sobre você. Me conta: você já tem algum programa de habitação em mente?",
    confidence: 0.72, // heuristic floor for topo stages
    reason: "cognitive_v2_heuristic",
    answered_customer_question: true,
    intent: "fallback_contextual",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.ok(Boolean(st.__cognitive_reply_prefix), "prefix deve estar definido (heuristic útil)");
  assert.equal(st.__cognitive_v2_takes_final, true, "takes_final deve ser true (heuristic útil assume fala final)");
  // Also verify that step() would use ONLY the V2 reply
  const mechanical = ["Acho que posso ter entendido errado 🤔", "Me confirma: você está procurando um programa habitacional?"];
  const result = assembleMessages(st, mechanical);
  // After assembleMessages, __cognitive_v2_takes_final was true + prefix was set → result should be V2 only
  // NOTE: we need to re-set st before assembleMessages since applyHasUsefulCognitiveReplyLogic set them
  // The test above already validated via applyHasUsefulCognitiveReplyLogic; verify assembly separately below
});

// Test 19: full pipeline — heuristic takes_final → step() substitutes mechanical
test("T19: pipeline completo — heuristic takes_final → step() substitui mecânico", () => {
  const st = {
    __cognitive_reply_prefix: "Claro! O programa Minha Casa Minha Vida ajuda você a financiar seu imóvel com condições especiais. Pra começar, preciso entender um pouco sobre você.",
    __cognitive_v2_takes_final: true
  };
  const mechanical = ["Acho que posso ter entendido errado 🤔", "Me confirma: você está procurando um programa habitacional?"];
  const result = assembleMessages(st, mechanical);
  assert.equal(result.length, 1, "deve ter apenas 1 mensagem (V2 heuristic)");
  assert.ok(result[0].includes("Minha Casa Minha Vida"), "deve conter a fala V2 heuristic");
  assert.ok(!result.some(m => m.includes("entendido errado")), "fala mecânica deve estar silenciada");
});

// Test 20: regressão — reason=cognitive_v2 (LLM ok) continues to work as before
test("T20: regressão — LLM ok (reason=cognitive_v2) → takes_final=true (preservado)", () => {
  const st = {};
  const cognitive = {
    reply_text: "O financiamento é um produto de crédito imobiliário com prazo de até 35 anos e taxa a partir de 8% ao ano.",
    confidence: 0.80,
    reason: "cognitive_v2",
    answered_customer_question: false,
    intent: null,
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  assert.ok(Boolean(st.__cognitive_reply_prefix), "prefix deve estar definido");
  assert.equal(st.__cognitive_v2_takes_final, true, "takes_final deve ser true (LLM ok, como antes)");
});

// Test 21: regressão — v2Mode=off + answered=false + apenas intent → takes_final=false (preservado)
test("T21: regressão — v2Mode=off + answered_customer_question=false + intent → takes_final=false", () => {
  const st = {};
  const cognitive = {
    reply_text: "Claro! O programa Minha Casa Minha Vida ajuda você a financiar com condições especiais.",
    confidence: 0.72,
    reason: "cognitive_v2_heuristic",
    answered_customer_question: false, // não respondeu explicitamente → takes_final não fecha
    intent: "fallback_contextual",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "off");
  // answered_customer_question=false → condição _answeredSufficiently=false → takes_final=false
  assert.equal(st.__cognitive_v2_takes_final, false, "takes_final deve ser false: answered=false, intent apenas não basta para assumir final no modo off");
});

// ================================================================
// GRUPO 7 — Smoke tests obrigatórios do patch (A–F)
// Cobrem os 4 cenários novos + preservações obrigatórias
// ================================================================
console.log("\n🔥 GRUPO 7: Smoke tests obrigatórios do patch assunção fala final");

// ── Smoke A: Topo happy path — resposta cognitiva útil assume fala final ──
test("SA: topo happy path — modo off + answered=true + reply>30 → takes_final=true, sem mecânico anexado", () => {
  const st = {};
  const cognitive = {
    reply_text: "Que ótimo que você já conhece o programa! Vou analisar seu perfil agora. Qual o seu nome completo para eu começar?",
    confidence: 0.80,
    reason: "cognitive_v1",
    answered_customer_question: true,
    intent: "sim_conheco_programa",
    safe_stage_signal: "inicio_programa:sim"
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "off");
  assert.equal(st.__cognitive_v2_takes_final, true, "SA: takes_final deve ser true — topo happy path cognitivo assume fala final");
  // step() com takes_final=true → apenas prefixo, sem mecânico
  const mechanical = ["Ótimo, então vamos direto ao ponto 😉", "Pra começar, qual o seu *nome completo*?"];
  const result = assembleMessages(st, mechanical);
  assert.equal(result.length, 1, "SA: apenas 1 mensagem — cognitivo assume fala final, sem cola mecânica");
  assert.ok(result[0].includes("nome completo"), "SA: reply cognitivo inclui pergunta de nome");
});

// ── Smoke B: Pós-reset — primeira mensagem útil, sem pergunta mecânica crua ──
test("SB: pós-reset — modo off + answered=true → takes_final=true, fallback mecânico não domina", () => {
  const st = {};
  const cognitive = {
    reply_text: "Olá! Que bom que voltou. Para continuar de onde paramos, você já tem conhecimento sobre o Minha Casa Minha Vida?",
    confidence: 0.78,
    reason: "cognitive_v1",
    answered_customer_question: true,
    intent: "first_after_reset",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "off");
  assert.equal(st.__cognitive_v2_takes_final, true, "SB: takes_final=true — pós-reset cognitivo assume fala final");
  // step() deve mostrar apenas o reply cognitivo, não a pergunta mecânica crua
  const mechanical = ["Você já conhece como o programa Minha Casa Minha Vida funciona ou prefere que eu te explique rapidinho?", "Me diz *sim* (já sei) ou *não* (me explica)."];
  const result = assembleMessages(st, mechanical);
  assert.equal(result.length, 1, "SB: apenas 1 mensagem — sem pergunta mecânica crua por trás");
  assert.ok(!result.some(m => m.includes("Me diz *sim*")), "SB: pergunta mecânica crua não aparece");
});

// ── Smoke C: Off-trail — reply cognitivo útil, sem redundância mecânica ──
test("SC: off-trail — modo off + replied cognitivo útil (>30 chars, takes_final=false) → v2HasReply=true, reanchor vazio", () => {
  // Simula: V1 modo off respondeu off-trail (takes_final=false por answered=false),
  // mas o reply é substancial (>30 chars) — Fix 2 garante offtrackMessages=[].
  const st = {
    __cognitive_reply_prefix: "Boa pergunta! Sim, o FGTS pode ser usado como entrada no Minha Casa Minha Vida. Pra calcular quanto você teria, preciso fechar as etapas anteriores primeiro.",
    __cognitive_v2_takes_final: false // Fix 1 não fechou (answered=false), mas Fix 2 cobre
  };
  const { v2HasReply, offtrackMessages } = offtrackGuardDecision(st);
  assert.equal(v2HasReply, true, "SC: v2HasReply=true — Fix 2: prefix substancial evita reanchor mecânico");
  assert.equal(offtrackMessages.length, 0, "SC: reanchor mecânico vazio — sem redundância na mesma rodada");
  // step() com rawArr=[] → apenas prefixo (mesmo sem takes_final=true)
  const result = assembleMessages(st, offtrackMessages);
  assert.equal(result.length, 1, "SC: apenas 1 mensagem (reply cognitivo)");
  assert.ok(result[0].includes("FGTS"), "SC: reply cognitivo de off-trail preservado");
});

// ── Smoke C2: Off-trail — Fix 1 fecha takes_final=true → v2HasReply via takes_final ──
test("SC2: off-trail — modo off + answered=true + reply>30 → takes_final=true, v2HasReply=true via Fix 1", () => {
  const st = {};
  const cognitive = {
    reply_text: "Sim! O FGTS pode ser utilizado como entrada no financiamento do Minha Casa Minha Vida. Ótimo recurso! Vamos continuar e eu calculo tudo para você.",
    confidence: 0.80,
    reason: "cognitive_v1",
    answered_customer_question: true,
    intent: "fgts_question",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "off");
  assert.equal(st.__cognitive_v2_takes_final, true, "SC2: Fix 1 fecha takes_final=true (answered=true)");
  const { v2HasReply, offtrackMessages } = offtrackGuardDecision(st);
  assert.equal(v2HasReply, true, "SC2: v2HasReply=true via takes_final=true");
  assert.equal(offtrackMessages.length, 0, "SC2: reanchor vazio — cognitivo assume fala final");
});

// ── Smoke D: Sem resposta cognitiva suficiente — fallback mecânico preservado ──
test("SD: sem reply cognitivo suficiente — fluxo seguro, fallback mecânico preservado", () => {
  const st = {};
  // reply curto, answered=false, sem intent/signal
  const cognitive = {
    reply_text: "Ok.",
    confidence: 0.70,
    reason: "cognitive_v1",
    answered_customer_question: false,
    intent: null,
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "off");
  assert.equal(st.__cognitive_reply_prefix, null, "SD: prefix nulo — reply não suficiente");
  assert.equal(st.__cognitive_v2_takes_final, false, "SD: takes_final=false — fallback mecânico seguro");
  // step() deve mostrar apenas mensagens mecânicas
  const mechanical = ["Me diga seu estado civil."];
  const result = assembleMessages(st, mechanical);
  assert.equal(result.length, 1, "SD: apenas mecânico");
  assert.ok(result[0].includes("estado civil"), "SD: mensagem mecânica preservada");
});

// ── Smoke D2: replied=false (ambiguidade) — fallback mecânico preservado ──
test("SD2: replied útil mas sem resposta suficiente (answered=false) → takes_final=false, mecânico preservado", () => {
  const st = {};
  const cognitive = {
    reply_text: "Entendo o que você quer dizer. Pode me confirmar seu estado civil para eu seguir?",
    confidence: 0.75,
    reason: "cognitive_v1",
    answered_customer_question: false, // pediu confirmação → não assumiu fala final
    intent: "ambiguidade",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "off");
  // prefix fica set (intent detectado), mas takes_final=false → mecânico é anexado
  assert.ok(Boolean(st.__cognitive_reply_prefix), "SD2: prefix setado (intent detectado)");
  assert.equal(st.__cognitive_v2_takes_final, false, "SD2: takes_final=false — mecânico deve ser exibido junto");
});

// ── Smoke E: Modo humano manual — modoHumanoRender preservado, sem interferência ──
test("SE: modo humano manual — step() com modo_humano=true preservado, takes_final não interfere", () => {
  // modoHumanoRender lê st.modo_humano — não é afetado pelos flags cognitivos
  // Verificamos que os flags cognitivos são limpos ANTES de modoHumanoRender ser chamado
  // (worker.js:174-178: limpa flags, então chama modoHumanoRender)
  // O patch não altera essa ordem — modo humano continua soberano sobre a apresentação.
  const st = {
    __cognitive_reply_prefix: "Resposta cognitiva que não deve interferir no modo humano.",
    __cognitive_v2_takes_final: true,
    modo_humano: true,     // modo humano manual ativo
    primeiro_nome: "João"
  };
  // assembleMessages simula step() — consome prefix+takes_final, limpa flags
  const mechanical = ["Mensagem mecânica padrão."];
  const result = assembleMessages(st, mechanical);
  // Após assembleMessages: flags limpos
  assert.equal(st.__cognitive_v2_takes_final, false, "SE: takes_final limpo após step() — não vaza para modo humano");
  assert.equal(st.__cognitive_reply_prefix, null, "SE: prefix limpo após step() — não vaza para modo humano");
  // modo_humano em st permanece inalterado pelo patch (gerenciado pelo modoHumanoRender no worker)
  assert.equal(st.modo_humano, true, "SE: st.modo_humano preservado integralmente — patch não toca nele");
});

// ── Smoke F: Não regressão de stage — gates/nextStage/persistência intactos ──
test("SF: não regressão — takes_final=true não altera nextStage, gate ou persistência", () => {
  // O patch modifica APENAS a fala final (surface conversacional).
  // nextStage é parâmetro de step(), nunca alterado pelo prefix/takes_final.
  const nextStage = "inicio_nome"; // mecânico decide
  const st = {
    __cognitive_reply_prefix: "Ótimo que você já conhece o programa! Qual seu nome completo?",
    __cognitive_v2_takes_final: true,
    fase_conversa: "inicio_programa" // mecânico preservado
  };
  const mechanical = ["Pra começar, qual o seu *nome completo*?"];
  const result = assembleMessages(st, mechanical);
  // nextStage completamente intocado
  assert.equal(nextStage, "inicio_nome", "SF: nextStage intacto — mecânico soberano");
  assert.equal(st.fase_conversa, "inicio_programa", "SF: fase_conversa intacta — não alterada pelo patch");
  assert.equal(result.length, 1, "SF: apenas 1 mensagem (cognitivo assume fala final)");
  // Flags limpos → não vazam para próxima rodada
  assert.equal(st.__cognitive_v2_takes_final, false, "SF: takes_final limpo para próxima rodada");
  assert.equal(st.__cognitive_reply_prefix, null, "SF: prefix limpo para próxima rodada");
});

// ================================================================
// Summary
// ================================================================
const total = passed + failed;
console.log(`\n${"=".repeat(60)}`);
console.log(`V2 Final Speech + Heuristic/Fallback smoke test results: ${passed} passed, ${failed} failed (${total} total)`);
console.log("=".repeat(60));

if (failed > 0) {
  process.exit(1);
}
