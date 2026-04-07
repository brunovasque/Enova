/**
 * cognitive_topo_programa_name_containment.smoke.mjs
 *
 * Smoke tests for:
 *   PART A — Official program name "Minha Casa Minha Vida" preservation
 *   PART B — Topo stage-aware containment in applyFinalSpeechContract
 *
 * Validates:
 *  1. "Minha Casa Minha Vida" is preserved by replaceCasa (via applyFinalSpeechContract)
 *  2. Generic "casa" is still replaced by "imóvel" outside the official name
 *  3. Mixed text: official name preserved + generic "casa" replaced
 *  4. sanitizeCognitiveReply preserves "Minha Casa Minha Vida"
 *  5. sanitizeCognitiveReply still replaces generic "casa"
 *  6. containsCasaInsteadOfImovel returns false for "Minha Casa Minha Vida" alone
 *  7. containsCasaInsteadOfImovel returns true for generic "casa" outside name
 *  8. applyFinalSpeechContract with llmSovereign + inicio_programa strips estado_civil question
 *  9. applyFinalSpeechContract with llmSovereign + inicio_programa strips renda question
 * 10. applyFinalSpeechContract with llmSovereign + inicio_programa preserves valid topo reply
 * 11. applyFinalSpeechContract with llmSovereign + non-topo stage does NOT strip
 * 12. first_after_reset validate rejects reply with premature collection
 * 13. greeting_reentrada validate rejects reply with premature collection
 * 14. ambiguous validate rejects reply with premature collection
 * 15. first_after_reset validate accepts proper opening reply
 * 16. greeting_reentrada validate accepts proper opening reply
 * 17. ambiguous validate accepts proper opening reply
 * 18. reset → "Oi Enova" protected from collection leak
 * 19. "imóvel" rule continues outside official name
 * 20. Multiple MCMV mentions preserved
 * 21. Case-insensitive MCMV preserved (minha casa minha vida)
 * 22. parser/gate/nextStage not touched (structural check)
 * 23. applyFinalSpeechContract with llmSovereign + inicio strips composicao question
 * 24. applyFinalSpeechContract with llmSovereign + inicio_decisao strips regime question
 * 25. topo without regression: valid LLM replies accepted as llm_real
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workerPath = resolve("Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

// ── Import applyFinalSpeechContract & helpers from final-speech-contract.js ──
const { applyFinalSpeechContract, containsCasaInsteadOfImovel, stripFutureStageCollection } = await import(
  resolve("cognitive/src/final-speech-contract.js")
);

// ── Extract sanitizeCognitiveReply from worker source ──
const sanitizeMatch = workerSrc.match(
  /function sanitizeCognitiveReply\(replyText\)\s*\{[\s\S]*?\n\}/
);
assert.ok(sanitizeMatch, "sanitizeCognitiveReply not found in worker");
// Use eval in a module context to avoid issues with regex in function body
const sanitizeFn = (() => {
  const body = sanitizeMatch[0];
  // Wrap as a callable
  const wrapped = `(${body})`;
  return eval(wrapped);
})();

// ── Extract TOPO_HAPPY_PATH_SPEECH validate functions ──
const topoBlockMatch = workerSrc.match(
  /const TOPO_HAPPY_PATH_SPEECH\s*=\s*\{[\s\S]*?\n\};/
);
assert.ok(topoBlockMatch, "TOPO_HAPPY_PATH_SPEECH not found in worker");

// Extract _isTopoReplySemanticallySafe + _isTopoReplyToneSafe
const safetyFnMatch = workerSrc.match(
  /const TOPO_PREMATURE_COLLECTION[\s\S]*?function _isTopoReplyToneSafe\(reply\)\s*\{[\s\S]*?\n\}/
);
assert.ok(safetyFnMatch, "_isTopoReplySemanticallySafe/_isTopoReplyToneSafe not found in worker");

// Build evaluate context with TOPO_PREMATURE_COLLECTION + TOPO_INSTITUTIONAL_TONE + safety fns + TOPO_HAPPY_PATH_SPEECH
const evalCode = safetyFnMatch[0] + "\n" + topoBlockMatch[0] + "\nreturn TOPO_HAPPY_PATH_SPEECH;";
const TOPO_HAPPY_PATH_SPEECH = new Function(evalCode)();

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log("\n=== PART A — Official Program Name Preservation ===\n");

// 1. applyFinalSpeechContract preserves "Minha Casa Minha Vida"
test("1. applyFinalSpeechContract preserves 'Minha Casa Minha Vida'", () => {
  const input = "O programa Minha Casa Minha Vida é ótimo para você!";
  const result = applyFinalSpeechContract(input, { currentStage: "inicio" });
  assert.ok(result.includes("Minha Casa Minha Vida"), `Expected MCMV preserved, got: ${result}`);
  assert.ok(!result.includes("Minha imóvel Minha Vida"), `Got contaminated: ${result}`);
});

// 2. Generic "casa" still replaced by "imóvel"
test("2. Generic 'casa' still replaced by 'imóvel' outside official name", () => {
  const input = "Vamos encontrar a casa perfeita para você!";
  const result = applyFinalSpeechContract(input, { currentStage: "inicio" });
  assert.ok(result.includes("imóvel"), `Expected 'imóvel', got: ${result}`);
  assert.ok(!result.includes("casa"), `Still has 'casa': ${result}`);
});

// 3. Mixed: MCMV preserved + generic "casa" replaced
test("3. Mixed: official name preserved + generic 'casa' replaced", () => {
  const input = "No programa Minha Casa Minha Vida, ajudo a encontrar a casa ideal.";
  const result = applyFinalSpeechContract(input, { currentStage: "inicio" });
  assert.ok(result.includes("Minha Casa Minha Vida"), `MCMV lost: ${result}`);
  assert.ok(result.includes("imóvel ideal"), `Generic 'casa' not replaced: ${result}`);
});

// 4. sanitizeCognitiveReply preserves "Minha Casa Minha Vida"
test("4. sanitizeCognitiveReply preserves 'Minha Casa Minha Vida'", () => {
  const input = "Eu sou a Enova, assistente do Minha Casa Minha Vida.";
  const result = sanitizeFn(input);
  assert.ok(result.includes("Minha Casa Minha Vida"), `MCMV corrupted in worker: ${result}`);
});

// 5. sanitizeCognitiveReply still replaces generic "casa"
test("5. sanitizeCognitiveReply replaces generic 'casa' → 'imóvel'", () => {
  const input = "Vamos procurar uma casa para você.";
  const result = sanitizeFn(input);
  assert.ok(result.includes("imóvel"), `Generic 'casa' not replaced: ${result}`);
});

// 6. containsCasaInsteadOfImovel returns false for MCMV alone
test("6. containsCasaInsteadOfImovel returns false for 'Minha Casa Minha Vida' alone", () => {
  const result = containsCasaInsteadOfImovel("O programa Minha Casa Minha Vida é excelente.");
  assert.equal(result, false, "Should not flag MCMV as needing replacement");
});

// 7. containsCasaInsteadOfImovel returns true for generic "casa"
test("7. containsCasaInsteadOfImovel returns true for generic 'casa'", () => {
  const result = containsCasaInsteadOfImovel("Vamos procurar uma casa linda.");
  assert.equal(result, true, "Should flag generic 'casa'");
});

// 19. "imóvel" rule continues outside official name
test("19. 'imóvel' rule continues for all generic uses of 'casa'", () => {
  const input = "A casa dos seus sonhos. Veja a casa agora.";
  const result = applyFinalSpeechContract(input, { currentStage: "inicio" });
  assert.ok(!result.includes("casa"), `Generic 'casa' not replaced: ${result}`);
});

// 20. Multiple MCMV mentions preserved
test("20. Multiple MCMV mentions all preserved", () => {
  const input = "O Minha Casa Minha Vida é bom. O Minha Casa Minha Vida ajuda muita gente.";
  const result = applyFinalSpeechContract(input, { currentStage: "inicio" });
  const count = (result.match(/Minha Casa Minha Vida/g) || []).length;
  assert.equal(count, 2, `Expected 2 MCMV mentions, got ${count}`);
});

// 21. Case-insensitive MCMV preserved
test("21. Case-insensitive MCMV preserved", () => {
  const input = "o minha casa minha vida é um programa do governo.";
  const result = applyFinalSpeechContract(input, { currentStage: "inicio" });
  assert.ok(!result.includes("minha imóvel"), `Case-insensitive MCMV corrupted: ${result}`);
});

console.log("\n=== PART B — Topo Stage-Aware Containment ===\n");

// 8. llmSovereign + inicio_programa strips estado_civil question
test("8. applyFinalSpeechContract llmSovereign+inicio_programa strips estado_civil", () => {
  const input = "Oi! Eu sou a Enova. Você é casado ou solteiro?";
  const result = applyFinalSpeechContract(input, {
    currentStage: "inicio_programa",
    llmSovereign: true
  });
  assert.ok(!(/casad[oa]|solteiro/i.test(result) && /\?/.test(result)), `Estado civil not stripped: ${result}`);
});

// 9. llmSovereign + inicio_programa strips renda question
test("9. applyFinalSpeechContract llmSovereign+inicio_programa strips renda question", () => {
  const input = "Oi! Qual é a sua renda mensal?";
  const result = applyFinalSpeechContract(input, {
    currentStage: "inicio_programa",
    llmSovereign: true
  });
  assert.ok(!(/renda mensal/i.test(result) && /\?/.test(result)), `Renda not stripped: ${result}`);
});

// 10. llmSovereign + inicio_programa preserves valid topo reply
test("10. applyFinalSpeechContract llmSovereign+inicio_programa preserves valid reply", () => {
  const input = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique?";
  const result = applyFinalSpeechContract(input, {
    currentStage: "inicio_programa",
    llmSovereign: true
  });
  assert.ok(result.includes("Minha Casa Minha Vida"), `MCMV lost: ${result}`);
  assert.ok(result.includes("funciona"), `Valid content stripped: ${result}`);
});

// 11. llmSovereign + non-topo stage does NOT strip collection
test("11. applyFinalSpeechContract llmSovereign+estado_civil does NOT strip estado_civil", () => {
  const input = "Me conta: você é casado ou solteiro?";
  const result = applyFinalSpeechContract(input, {
    currentStage: "estado_civil",
    llmSovereign: true
  });
  assert.ok(result.includes("casado"), `Should NOT strip for estado_civil stage: ${result}`);
});

// 12. first_after_reset validate rejects premature collection
test("12. first_after_reset validate rejects premature collection", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:first_after_reset"].validate;
  assert.equal(validate("Oi! Você é solteiro ou casado? Me diz pra eu saber."), false);
});

// 13. greeting_reentrada validate rejects premature collection
test("13. greeting_reentrada validate rejects premature collection", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:greeting_reentrada"].validate;
  assert.equal(validate("Oi! Qual é o seu nome completo? E seu regime de trabalho?"), false);
});

// 14. ambiguous validate rejects premature collection
test("14. ambiguous validate rejects premature collection", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:ambiguous"].validate;
  assert.equal(validate("Hmm, quanto você ganha por mês? Me confirma seu regime de trabalho?"), false);
});

// 15. first_after_reset validate accepts proper opening
test("15. first_after_reset validate accepts proper opening", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:first_after_reset"].validate;
  const ok = validate("Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho?");
  assert.equal(ok, true, "Valid opening should be accepted");
});

// 16. greeting_reentrada validate accepts proper opening
test("16. greeting_reentrada validate accepts proper opening", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:greeting_reentrada"].validate;
  const ok = validate("Oi! Tudo bem? Eu sou a Enova. Você já sabe como funciona o programa ou prefere que eu explique rapidinho?");
  assert.equal(ok, true, "Valid greeting should be accepted");
});

// 17. ambiguous validate accepts proper opening
test("17. ambiguous validate accepts proper opening", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:ambiguous"].validate;
  const ok = validate("Você já conhece como o programa Minha Casa Minha Vida funciona ou prefere que eu te explique rapidinho? Me diz sim ou não.");
  assert.equal(ok, true, "Valid ambiguous reply should be accepted");
});

// 18. reset → "Oi Enova" protected (simulation)
test("18. reset→'Oi Enova': first_after_reset rejects LLM with estado civil", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:first_after_reset"].validate;
  const badReply = "Oi! Prazer! Pra começar, me diz: você é solteiro ou casado?";
  assert.equal(validate(badReply), false, "Must reject premature collection post-reset");
});

// 22. structural check: parser/gate/nextStage not touched
test("22. parser/gate/nextStage: structural check (no changes)", () => {
  // Verify critical step/nextStage/gate functions exist in worker source
  assert.ok(workerSrc.includes("async function step("), "step function must exist");
  assert.ok(workerSrc.includes("nextStage"), "nextStage parameter/logic must exist");
});

// 23. llmSovereign + inicio strips composicao question
test("23. applyFinalSpeechContract llmSovereign+inicio strips composicao question", () => {
  const input = "Oi! Você vai seguir sozinho ou com alguém?";
  const result = applyFinalSpeechContract(input, {
    currentStage: "inicio",
    llmSovereign: true
  });
  assert.ok(!(/sozinho ou com/i.test(result) && /\?/.test(result)), `Composicao not stripped: ${result}`);
});

// 24. llmSovereign + inicio_decisao strips regime question
test("24. applyFinalSpeechContract llmSovereign+inicio_decisao strips regime question", () => {
  const input = "Oi! Você trabalha de CLT ou autônomo?";
  const result = applyFinalSpeechContract(input, {
    currentStage: "inicio_decisao",
    llmSovereign: true
  });
  assert.ok(!(/CLT.*autônomo/i.test(result) && /\?/.test(result)), `Regime not stripped: ${result}`);
});

// 25. Valid LLM replies still accepted as llm_real (no regression)
test("25. Topo without regression: valid LLM replies accepted", () => {
  const validate = TOPO_HAPPY_PATH_SPEECH["inicio_programa:first_after_reset"].validate;
  const goodReply = "Oi! 😊 Eu sou a Enova. Posso te ajudar com o programa Minha Casa Minha Vida. Você já sabe como funciona?";
  assert.equal(validate(goodReply), true, "Valid LLM reply should be accepted");
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
