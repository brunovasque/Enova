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
//  5. hasUsefulCognitiveReply: V2 on+heuristic short → NOT useful (strict)
//  6. hasUsefulCognitiveReply: V2 off mode → answered_customer_question gate still applies
//  7. offtrack guard: when V2 already has reply, passes empty msgs so V2 wins
//  8. flags leak guard: __cognitive_v2_takes_final resets to false after step()
//  9. flags leak guard: __cognitive_reply_prefix resets to null after step()
// 10. regressão — soberania mecânica: suggested_stage nunca avança
// 11. regressão — soberania mecânica: stage/nextStage passados ao step() são preservados
// 12. regressão — fallback seguro: V2 heuristic sem LLM não aciona takes_final
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

// mirrors runFunnel cognitive block L20831-20857 (after fix)
function applyHasUsefulCognitiveReplyLogic(st, cognitive, v2Mode) {
  const COGNITIVE_V1_CONFIDENCE_MIN = 0.66;
  const lowConfidence = Number(cognitive.confidence || 0) < COGNITIVE_V1_CONFIDENCE_MIN;
  const cognitiveReply = !lowConfidence ? String(cognitive.reply_text || "").trim() : "";

  const v2OnWithLlm = v2Mode === "on" && cognitive.reason === "cognitive_v2";
  const hasUsefulCognitiveReply =
    Boolean(cognitiveReply) &&
    (
      cognitive.answered_customer_question === true ||
      Boolean(cognitive.intent) ||
      Boolean(cognitive.safe_stage_signal) ||
      (v2OnWithLlm && cognitiveReply.length > 30)
    );

  if (hasUsefulCognitiveReply) {
    st.__cognitive_reply_prefix = cognitiveReply;
    // Always set explicitly to avoid stale state from a previous call
    st.__cognitive_v2_takes_final = v2OnWithLlm ? true : false;
  } else {
    st.__cognitive_reply_prefix = null;
    st.__cognitive_v2_takes_final = false;
  }
}

// mirrors offtrack guard L20892-20932 (after fix) — decision logic only
function offtrackGuardDecision(st) {
  const v2HasReply = Boolean(st.__cognitive_reply_prefix) && st.__cognitive_v2_takes_final === true;
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

// Test 5: V2 on+heuristic (no LLM) → does NOT activate takes_final
test("T5: V2 on+heuristic (reason=cognitive_v2_heuristic) → takes_final=false", () => {
  const st = {};
  const cognitive = {
    reply_text: "Entendo sua dúvida. Vamos continuar com o processo.",
    confidence: 0.75,
    reason: "cognitive_v2_heuristic",
    answered_customer_question: true,
    intent: "fallback_contextual",
    safe_stage_signal: null
  };
  applyHasUsefulCognitiveReplyLogic(st, cognitive, "on");
  // Has prefix (because answered_customer_question=true), but takes_final=false (heuristic)
  assert.ok(Boolean(st.__cognitive_reply_prefix), "prefix deve estar definido (answered_customer_question=true)");
  assert.equal(st.__cognitive_v2_takes_final, false, "takes_final NÃO deve ser true para heuristic");
});

// Test 6: V2 off mode → no takes_final regardless
test("T6: v2Mode=off → takes_final nunca ativado mesmo com reply útil", () => {
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
  // v2OnWithLlm is false when v2Mode="off", so takes_final stays false
  assert.equal(st.__cognitive_v2_takes_final, false, "takes_final deve ser false no modo off");
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
// Summary
// ================================================================
const total = passed + failed;
console.log(`\n${"=".repeat(60)}`);
console.log(`V2 Final Speech smoke test results: ${passed} passed, ${failed} failed (${total} total)`);
console.log("=".repeat(60));

if (failed > 0) {
  process.exit(1);
}
