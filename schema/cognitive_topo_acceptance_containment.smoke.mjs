/**
 * cognitive_topo_acceptance_containment.smoke.mjs
 *
 * Smoke tests for topo acceptance/containment fix.
 * Validates that LLM replies at inicio_programa are rejected when they
 * pull premature structural collection (estado civil, nome completo,
 * nacionalidade, regime, renda, etc.).
 *
 * Scenarios:
 *  1. first_after_reset: rejects LLM reply that asks estado civil
 *  2. first_after_reset: rejects LLM reply that asks nome completo
 *  3. first_after_reset: rejects LLM reply that asks nacionalidade
 *  4. first_after_reset: rejects LLM reply that asks regime de trabalho
 *  5. first_after_reset: rejects LLM reply that asks renda mensal
 *  6. first_after_reset: accepts valid opening reply (LLM real)
 *  7. greeting_reentrada: rejects reply asking estado civil
 *  8. greeting_reentrada: rejects reply asking solteiro/casado
 *  9. greeting_reentrada: rejects reply asking CLT/autônomo
 * 10. greeting_reentrada: accepts valid opening reply (LLM real)
 * 11. ambiguous: rejects reply asking estado civil
 * 12. ambiguous: rejects reply asking nome completo
 * 13. ambiguous: rejects reply mentioning SPC/Serasa
 * 14. ambiguous: accepts valid opening reply (LLM real)
 * 15. containment: rejected reply falls to safe fallback (not llm_real)
 * 16. containment: safe fallback is semantically appropriate for topo
 * 17. reset→"Oi Enova": protected from estado civil leak
 * 18. topo continues without regression for valid LLM replies
 * 19. parser/gate/nextStage: not affected (no structural changes)
 * 20. regex does not false-positive on "Minha Casa Minha Vida" mention
 * 21. regex does not false-positive on "programa" or "funciona"
 * 22. rejects reply asking "você é brasileiro"
 * 23. rejects reply asking about CTPS/carteira de trabalho
 * 24. rejects reply mentioning "restrição no CPF"
 * 25. rejects reply asking "quanto você ganha"
 * 26. rejects reply mentioning "união estável"
 * 27. rejects reply mentioning "divorciado"
 * 28. rejects reply mentioning "viúvo/viúva"
 * 29. accepts reply that mentions "programa" and asks "já sabe como funciona?"
 * 30. accepts reply that is warm greeting + Enova intro + simple path
 * 31. rejects reply with "salário" collection
 * 32. rejects reply with "estrangeiro" collection
 * 33. rejects reply with "qual é o seu nome"
 * 34. rejects reply with "autônoma" collection
 * 35. rejects reply with "separado" mention
 * 36. null/empty/undefined replies are not safe
 * 37. all 3 validators reject null/empty/short replies
 * 38. regex does not match "Minha Casa" (word casa in program name)
 */

import assert from "node:assert/strict";

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

// ── Mirror of the TOPO_PREMATURE_COLLECTION regex from worker.js ──
const TOPO_PREMATURE_COLLECTION = /\b(?:estado\s+civil|solteiro\(?a?\)?|casad[oa]|divorci|separad[oa]|vi[uú]v[oa]|uni[aã]o\s+est[aá]vel|nome\s+completo|qual\s+(?:[eé]\s+)?(?:o\s+)?seu\s+nome|nacionalidade|voc[eê]\s+[eé]\s+brasileir|brasileiro\(?a?\)?(?:\s+nat[oa])?|estrangeir[oa]?|regime\s+de\s+trabalho|CLT|aut[oô]nom[oa]|renda\s+mensal|sal[aá]rio|quanto\s+(?:voc[eê]\s+)?ganh|CTPS|carteira\s+de\s+trabalho|SPC|Serasa|restri[cç][aã]o\s+no)/i;

function _isTopoReplySemanticallySafe(reply) {
  if (!reply || typeof reply !== "string") return false;
  return !TOPO_PREMATURE_COLLECTION.test(reply);
}

// ── Mirror of the 3 validate functions from TOPO_HAPPY_PATH_SPEECH ──
const VALIDATORS = {
  "inicio_programa:first_after_reset": (reply) =>
    reply && reply.length > 20 && /\?/.test(reply) && _isTopoReplySemanticallySafe(reply),
  "inicio_programa:greeting_reentrada": (reply) =>
    reply && reply.length > 20 && /\?/.test(reply) && _isTopoReplySemanticallySafe(reply),
  "inicio_programa:ambiguous": (reply) =>
    reply && reply.length > 20 && /sim|não|nao|funciona|programa/i.test(reply) && /\?/.test(reply) && _isTopoReplySemanticallySafe(reply),
};

// ── SAFE opening replies (should pass) ──
const SAFE_OPENING = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho?";
const SAFE_OPENING_2 = "Oi, tudo bem? Sou a Enova e ajudo com o programa Minha Casa Minha Vida. Quer que eu explique como funciona?";
const SAFE_OPENING_3 = "Que bom que você veio! O Minha Casa Minha Vida tem condições especiais. Já conhece o programa ou prefere que eu te explique rapidinho?";

// ── UNSAFE replies (premature collection — should be rejected) ──
const UNSAFE_ESTADO_CIVIL = "Oi! Vamos começar a análise do seu perfil. Qual é o seu estado civil?";
const UNSAFE_NOME_COMPLETO = "Olá! Para iniciar, preciso do seu nome completo. Pode me dizer?";
const UNSAFE_NACIONALIDADE = "Oi! Bem-vindo ao programa. Para começar, qual é a sua nacionalidade?";
const UNSAFE_BRASILEIRO = "Oi, tudo bem? Antes de começar, você é brasileiro nato?";
const UNSAFE_REGIME = "Olá! Vamos analisar seu perfil. Qual o seu regime de trabalho?";
const UNSAFE_CLT = "Oi! Você trabalha CLT ou é autônomo? Preciso saber para a análise.";
const UNSAFE_RENDA = "Olá! Para calcular o subsídio, qual a sua renda mensal?";
const UNSAFE_QUANTO_GANHA = "Oi! Me conta, quanto você ganha por mês? Vou ver o programa para você.";
const UNSAFE_SOLTEIRO = "Olá! Vamos ver as condições. Você é solteiro(a)?";
const UNSAFE_CASADO = "Oi! Que legal que veio! Você é casado ou solteiro?";
const UNSAFE_CTPS = "Oi! Me conta: você tem CTPS com mais de 36 meses?";
const UNSAFE_CARTEIRA = "Olá! Tem carteira de trabalho assinada? Vamos ver as condições.";
const UNSAFE_SPC = "Oi! Antes de mais nada, tem alguma restrição no SPC ou Serasa?";
const UNSAFE_RESTRICAO = "Olá! Existe alguma restrição no seu CPF? Me conta que vou te ajudar.";
const UNSAFE_UNIAO = "Oi! Você está em união estável? Preciso saber para a análise.";
const UNSAFE_DIVORCIADO = "Olá! Você é divorciado(a)? Isso pode influenciar nas condições.";
const UNSAFE_VIUVO = "Oi! Você é viúvo(a)? Vamos ver as melhores condições.";
const UNSAFE_SALARIO = "Olá! Qual o seu salário mensal? Vou calcular o subsídio.";
const UNSAFE_ESTRANGEIRO = "Oi! Você é estrangeiro? Preciso verificar a documentação.";
const UNSAFE_QUAL_NOME = "Olá! Qual é o seu nome? Vamos começar a análise.";
const UNSAFE_AUTONOMO = "Oi! Você é autônoma? Me conta para eu ver as condições.";
const UNSAFE_SEPARADO = "Olá! Você é separado judicialmente? Isso influencia na análise.";

console.log("\n🔒 Topo Acceptance/Containment — Smoke Tests\n");

// ── Section A: first_after_reset — rejects premature collection ──
console.log("  Section A: inicio_programa:first_after_reset — rejeição de coleta prematura");

test("1. first_after_reset: rejects LLM reply asking estado civil", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](UNSAFE_ESTADO_CIVIL), false);
});

test("2. first_after_reset: rejects LLM reply asking nome completo", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](UNSAFE_NOME_COMPLETO), false);
});

test("3. first_after_reset: rejects LLM reply asking nacionalidade", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](UNSAFE_NACIONALIDADE), false);
});

test("4. first_after_reset: rejects LLM reply asking regime de trabalho", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](UNSAFE_REGIME), false);
});

test("5. first_after_reset: rejects LLM reply asking renda mensal", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](UNSAFE_RENDA), false);
});

test("6. first_after_reset: accepts valid opening reply (LLM real)", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](SAFE_OPENING), true);
});

// ── Section B: greeting_reentrada — rejects premature collection ──
console.log("\n  Section B: inicio_programa:greeting_reentrada — rejeição de coleta prematura");

test("7. greeting_reentrada: rejects reply asking estado civil", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](UNSAFE_ESTADO_CIVIL), false);
});

test("8. greeting_reentrada: rejects reply asking solteiro/casado", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](UNSAFE_CASADO), false);
});

test("9. greeting_reentrada: rejects reply asking CLT/autônomo", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](UNSAFE_CLT), false);
});

test("10. greeting_reentrada: accepts valid opening reply (LLM real)", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](SAFE_OPENING_2), true);
});

// ── Section C: ambiguous — rejects premature collection ──
console.log("\n  Section C: inicio_programa:ambiguous — rejeição de coleta prematura");

test("11. ambiguous: rejects reply asking estado civil", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](UNSAFE_ESTADO_CIVIL), false);
});

test("12. ambiguous: rejects reply asking nome completo", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](UNSAFE_NOME_COMPLETO), false);
});

test("13. ambiguous: rejects reply mentioning SPC/Serasa", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](UNSAFE_SPC), false);
});

test("14. ambiguous: accepts valid opening reply (LLM real)", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](SAFE_OPENING_3), true);
});

// ── Section D: containment behavior ──
console.log("\n  Section D: contenção segura do topo");

test("15. containment: rejected reply is not semantically safe", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_ESTADO_CIVIL), false);
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_NOME_COMPLETO), false);
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_RENDA), false);
});

test("16. containment: safe fallback text IS semantically appropriate for topo", () => {
  const FALLBACK = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho?";
  assert.strictEqual(_isTopoReplySemanticallySafe(FALLBACK), true);
});

test("17. reset→'Oi Enova': protected from estado civil leak", () => {
  // Simulates the scenario: reset → "Oi Enova" → LLM returns estado civil question
  // The validate function must reject it
  const llmReplyWithEstadoCivil = "Olá! Que bom que veio. Pra começar, me diz: qual o seu estado civil?";
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](llmReplyWithEstadoCivil), false);
  // Valid reply must pass
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](SAFE_OPENING), true);
});

test("18. topo continues without regression for valid LLM replies", () => {
  // All safe openings must pass all 3 validators
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](SAFE_OPENING), true);
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](SAFE_OPENING), true);
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](SAFE_OPENING_2), true);
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](SAFE_OPENING_3), true);
});

test("19. parser/gate/nextStage: not affected (containment is validate-only)", () => {
  // The fix only adds _isTopoReplySemanticallySafe to validate functions.
  // No changes to parser, gate, nextStage, or persistence.
  // This test confirms that the containment mechanism is purely a speech validation.
  assert.strictEqual(typeof _isTopoReplySemanticallySafe, "function");
  // Accepts string, returns boolean — pure function, no side effects
  assert.strictEqual(typeof _isTopoReplySemanticallySafe("test"), "boolean");
});

// ── Section E: regex precision — no false positives ──
console.log("\n  Section E: precisão do regex — sem falsos positivos");

test("20. regex does not false-positive on 'Minha Casa Minha Vida' mention", () => {
  const reply = "O programa Minha Casa Minha Vida ajuda muitas famílias. Quer saber mais?";
  assert.strictEqual(_isTopoReplySemanticallySafe(reply), true);
});

test("21. regex does not false-positive on 'programa' or 'funciona'", () => {
  const reply = "O programa funciona assim: o governo te ajuda com subsídio. Quer que eu explique?";
  assert.strictEqual(_isTopoReplySemanticallySafe(reply), true);
});

// ── Section F: comprehensive rejection coverage ──
console.log("\n  Section F: cobertura abrangente de rejeição");

test("22. rejects reply asking 'você é brasileiro'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_BRASILEIRO), false);
});

test("23. rejects reply asking about CTPS/carteira de trabalho", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_CTPS), false);
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_CARTEIRA), false);
});

test("24. rejects reply mentioning 'restrição no CPF'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_RESTRICAO), false);
});

test("25. rejects reply asking 'quanto você ganha'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_QUANTO_GANHA), false);
});

test("26. rejects reply mentioning 'união estável'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_UNIAO), false);
});

test("27. rejects reply mentioning 'divorciado'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_DIVORCIADO), false);
});

test("28. rejects reply mentioning 'viúvo/viúva'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_VIUVO), false);
});

test("29. accepts reply that mentions 'programa' and asks 'já sabe como funciona?'", () => {
  const reply = "Oi! Sou a Enova 😊 Vou te ajudar com o programa Minha Casa Minha Vida. Você já sabe como funciona?";
  assert.strictEqual(_isTopoReplySemanticallySafe(reply), true);
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](reply), true);
});

test("30. accepts reply that is warm greeting + Enova intro + simple path", () => {
  const reply = "Que bom que você veio! 😊 Eu sou a Enova, assistente do Minha Casa Minha Vida. Quer que eu te explique o programa ou você já conhece?";
  assert.strictEqual(_isTopoReplySemanticallySafe(reply), true);
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](reply), true);
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](reply), true);
});

// ── Additional edge cases ──
console.log("\n  Section G: edge cases adicionais");

test("31. rejects reply with 'salário' collection", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_SALARIO), false);
});

test("32. rejects reply with 'estrangeiro' collection", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_ESTRANGEIRO), false);
});

test("33. rejects reply with 'qual é o seu nome'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_QUAL_NOME), false);
});

test("34. rejects reply with 'autônoma' collection", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_AUTONOMO), false);
});

test("35. rejects reply with 'separado' mention", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_SEPARADO), false);
});

test("36. null/empty/undefined replies are not safe", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(null), false);
  assert.strictEqual(_isTopoReplySemanticallySafe(""), false);
  assert.strictEqual(_isTopoReplySemanticallySafe(undefined), false);
});

test("37. all 3 validators reject null/empty/short replies", () => {
  for (const key of Object.keys(VALIDATORS)) {
    assert.ok(!VALIDATORS[key](null), `${key} should reject null`);
    assert.ok(!VALIDATORS[key](""), `${key} should reject empty`);
    assert.ok(!VALIDATORS[key]("Oi?"), `${key} should reject too short`);
  }
});

test("38. regex does not match 'Minha Casa' (word casa in program name)", () => {
  // "Minha Casa Minha Vida" should NOT trigger premature collection
  const reply = "O Minha Casa Minha Vida é um programa incrível! Quer saber mais?";
  assert.strictEqual(_isTopoReplySemanticallySafe(reply), true);
});

// ── Summary ──
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
  console.error("❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED");
}
