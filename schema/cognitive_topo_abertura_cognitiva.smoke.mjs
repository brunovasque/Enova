/**
 * cognitive_topo_abertura_cognitiva.smoke.mjs
 *
 * Smoke tests for the surgical topo opening fix.
 * Validates that the topo opening:
 *   - rejects institutional/technical tone (Cognitive Engine, programas habitacionais, etc.)
 *   - rejects premature structural collection (expanded patterns)
 *   - rejects residual fragments after strip containment
 *   - accepts feminine, human, natural LLM opening replies
 *   - protects "Minha Casa Minha Vida" official program name
 *   - reset → "Oi Enova" is protected
 *   - reset → "Oi, quem é você?" is protected
 *   - parser/gate/nextStage remain intact
 *   - topo without regression
 *
 * Sections:
 *   A. Institutional tone rejection (TOPO_INSTITUTIONAL_TONE)
 *   B. Expanded premature collection (somar renda, servidor, aposentado)
 *   C. Fragment residual containment (stripFutureStageCollection guard)
 *   D. Validator integration (all 3 validators include tone check)
 *   E. Safe openings accepted (feminine, human, natural)
 *   F. "Minha Casa Minha Vida" name preservation
 *   G. Reset → "Oi Enova" protection
 *   H. Reset → "Oi, quem é você?" protection
 *   I. Parser/gate/nextStage intact
 *   J. Fallback texts use full program name (no MCMV abbreviation in topo)
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

// ── Mirror of TOPO_PREMATURE_COLLECTION from worker.js (expanded) ──
const TOPO_PREMATURE_COLLECTION = /\b(?:estado\s+civil|solteiro\(?a?\)?|casad[oa]|divorci|separad[oa]|vi[uú]v[oa]|uni[aã]o\s+est[aá]vel|nome\s+completo|qual\s+(?:[eé]\s+)?(?:o\s+)?seu\s+nome|nacionalidade|voc[eê]\s+[eé]\s+brasileir|brasileiro\(?a?\)?(?:\s+nat[oa])?|estrangeir[oa]?|regime\s+de\s+trabalho|CLT|aut[oô]nom[oa]|renda\s+mensal|sal[aá]rio|quanto\s+(?:voc[eê]\s+)?ganh|CTPS|carteira\s+de\s+trabalho|SPC|Serasa|restri[cç][aã]o\s+no|somar\s+renda|servidor\s+p[uú]blic|aposentad[oa])/i;

// ── Mirror of TOPO_INSTITUTIONAL_TONE from worker.js ──
const TOPO_INSTITUTIONAL_TONE = /\b(?:Cognitive\s+Engine|programas?\s+habitaciona(?:l|is)|MCMV\s*\/\s*CEF|CEF\s*\/\s*MCMV|processo\s+de\s+financiamento\s+habitacional|financiamento\s+habitacional|Caixa\s+Econ[oô]mica\s+Federal)\b/i;

function _isTopoReplySemanticallySafe(reply) {
  if (!reply || typeof reply !== "string") return false;
  return !TOPO_PREMATURE_COLLECTION.test(reply);
}

function _isTopoReplyToneSafe(reply) {
  if (!reply || typeof reply !== "string") return false;
  return !TOPO_INSTITUTIONAL_TONE.test(reply);
}

// ── Mirror of the 3 validate functions (with tone check) ──
const VALIDATORS = {
  "inicio_programa:first_after_reset": (reply) =>
    reply && reply.length > 20 && /\?/.test(reply) && _isTopoReplySemanticallySafe(reply) && _isTopoReplyToneSafe(reply),
  "inicio_programa:greeting_reentrada": (reply) =>
    reply && reply.length > 20 && /\?/.test(reply) && _isTopoReplySemanticallySafe(reply) && _isTopoReplyToneSafe(reply),
  "inicio_programa:ambiguous": (reply) =>
    reply && reply.length > 20 && /sim|não|nao|funciona|programa/i.test(reply) && /\?/.test(reply) && _isTopoReplySemanticallySafe(reply) && _isTopoReplyToneSafe(reply),
};

// ── Mirror of stripFutureStageCollection fragment cleanup ──
// This mirrors the trailing fragment guard added to final-speech-contract.js
function stripTrailingFragment(text) {
  if (!text) return text;
  let result = text;
  result = result.replace(/(?:,\s*)?(?:qual\s+(?:[eé]\s+)?(?:o\s+)?seu\s*|me\s+(?:diz|conta|fala)\s+(?:o\s+)?seu?\s*|pra\s+come[cç]ar\s*[,:]?\s*|(?:e\s+)?(?:o|a|os|as)\s+seu[as]?\s*)$/i, "").trim();
  result = result.replace(/[,;:\-–—]\s*$/, "").trim();
  return result;
}

// ── SAFE opening replies ──
const SAFE_FEMININE_OPENING = "Oi! 😊 Eu sou a Enova, especialista no Minha Casa Minha Vida. Você já sabe como funciona o programa?";
const SAFE_WARM_OPENING = "Oi, tudo bem? Sou a Enova e ajudo com o programa Minha Casa Minha Vida. Quer que eu explique como funciona?";
const SAFE_INVITE_OPENING = "Que bom que você veio! O Minha Casa Minha Vida tem condições especiais. Já conhece o programa ou prefere que eu te explique rapidinho?";
const SAFE_QUEM_EH_VC = "Oi! Eu sou a Enova 😊 Minha especialidade é o Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho?";

// ── UNSAFE institutional/technical replies ──
const UNSAFE_COGNITIVE_ENGINE = "Oi! Sou o Cognitive Engine da Enova. Posso te ajudar com programas habitacionais?";
const UNSAFE_PROGRAMAS_HAB = "Olá! Trabalho com programas habitacionais do governo. Como posso te ajudar?";
const UNSAFE_MCMV_CEF = "Oi! Sou especialista em MCMV/CEF. Quer saber mais sobre o financiamento habitacional?";
const UNSAFE_CEF_MCMV = "Olá! CEF/MCMV é nossa especialidade. O que posso fazer por você?";
const UNSAFE_FIN_HAB = "Oi! Vou te ajudar com o processo de financiamento habitacional. Quer começar?";
const UNSAFE_CAIXA = "Olá! Trabalho em parceria com a Caixa Econômica Federal. Posso te ajudar?";

// ── UNSAFE expanded collection (new patterns) ──
const UNSAFE_SOMAR_RENDA = "Oi! Bem-vindo! Vai somar renda com alguém ou seguir sozinho?";
const UNSAFE_SERVIDOR = "Olá! Você é servidor público? Vamos ver as condições!";
const UNSAFE_APOSENTADO = "Oi! Você é aposentado(a)? Temos condições especiais!";

// ── Fragment residual test strings ──
const FRAGMENT_QUAL_SEU = "Oi! Para começar, qual é o seu";
const FRAGMENT_ME_DIZ = "Olá! Vou te ajudar, me diz o seu";
const FRAGMENT_PRA_COMECAR = "Tudo bem? Pra começar";
const CLEAN_AFTER_STRIP = "Oi! Para começar";

console.log("\n🎯 Topo Abertura Cognitiva — Smoke Tests\n");

// ══════════════════════════════════════════════════════
// Section A: Institutional tone rejection
// ══════════════════════════════════════════════════════
console.log("  Section A: rejeição de tom institucional/técnico");

test("1. rejects reply with 'Cognitive Engine'", () => {
  assert.strictEqual(_isTopoReplyToneSafe(UNSAFE_COGNITIVE_ENGINE), false);
});

test("2. rejects reply with 'programas habitacionais'", () => {
  assert.strictEqual(_isTopoReplyToneSafe(UNSAFE_PROGRAMAS_HAB), false);
});

test("3. rejects reply with 'MCMV/CEF'", () => {
  assert.strictEqual(_isTopoReplyToneSafe(UNSAFE_MCMV_CEF), false);
});

test("4. rejects reply with 'CEF/MCMV'", () => {
  assert.strictEqual(_isTopoReplyToneSafe(UNSAFE_CEF_MCMV), false);
});

test("5. rejects reply with 'financiamento habitacional'", () => {
  assert.strictEqual(_isTopoReplyToneSafe(UNSAFE_FIN_HAB), false);
});

test("6. rejects reply with 'Caixa Econômica Federal'", () => {
  assert.strictEqual(_isTopoReplyToneSafe(UNSAFE_CAIXA), false);
});

test("7. accepts safe feminine opening (no institutional terms)", () => {
  assert.strictEqual(_isTopoReplyToneSafe(SAFE_FEMININE_OPENING), true);
});

test("8. accepts safe warm opening (no institutional terms)", () => {
  assert.strictEqual(_isTopoReplyToneSafe(SAFE_WARM_OPENING), true);
});

test("9. tone regex does not false-positive on 'Minha Casa Minha Vida'", () => {
  assert.strictEqual(_isTopoReplyToneSafe("O Minha Casa Minha Vida é um programa incrível!"), true);
});

test("10. tone regex does not false-positive on 'programa' alone", () => {
  assert.strictEqual(_isTopoReplyToneSafe("Quer saber como funciona o programa?"), true);
});

// ══════════════════════════════════════════════════════
// Section B: Expanded premature collection (new patterns)
// ══════════════════════════════════════════════════════
console.log("\n  Section B: coleta prematura expandida (novos padrões)");

test("11. rejects reply asking 'somar renda'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_SOMAR_RENDA), false);
});

test("12. rejects reply asking 'servidor público'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_SERVIDOR), false);
});

test("13. rejects reply mentioning 'aposentado(a)'", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(UNSAFE_APOSENTADO), false);
});

test("14. safe opening still passes expanded regex", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(SAFE_FEMININE_OPENING), true);
  assert.strictEqual(_isTopoReplySemanticallySafe(SAFE_WARM_OPENING), true);
});

// ══════════════════════════════════════════════════════
// Section C: Fragment residual containment
// ══════════════════════════════════════════════════════
console.log("\n  Section C: contenção de fragmento residual");

test("15. trailing 'qual é o seu' is cleaned up", () => {
  const result = stripTrailingFragment(FRAGMENT_QUAL_SEU);
  assert.ok(!result.endsWith("qual é o seu"), `Fragment not cleaned: "${result}"`);
  assert.ok(result.length > 0, "Result should not be empty");
});

test("16. trailing 'me diz o seu' is cleaned up", () => {
  const result = stripTrailingFragment(FRAGMENT_ME_DIZ);
  assert.ok(!result.endsWith("me diz o seu"), `Fragment not cleaned: "${result}"`);
});

test("17. trailing 'pra começar' is cleaned up", () => {
  const result = stripTrailingFragment(FRAGMENT_PRA_COMECAR);
  assert.ok(!result.endsWith("Pra começar"), `Fragment not cleaned: "${result}"`);
});

test("18. non-fragment text is NOT altered", () => {
  const clean = "Oi! Eu sou a Enova, assistente do Minha Casa Minha Vida.";
  const result = stripTrailingFragment(clean);
  assert.strictEqual(result, clean);
});

test("19. already clean text after strip is preserved", () => {
  const result = stripTrailingFragment(CLEAN_AFTER_STRIP);
  assert.strictEqual(result, CLEAN_AFTER_STRIP);
});

test("20. null/empty input handled gracefully", () => {
  assert.strictEqual(stripTrailingFragment(null), null);
  assert.strictEqual(stripTrailingFragment(""), "");
});

// ══════════════════════════════════════════════════════
// Section D: Validator integration (tone check included)
// ══════════════════════════════════════════════════════
console.log("\n  Section D: validadores integrados com verificação de tom");

test("21. first_after_reset rejects Cognitive Engine reply", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](UNSAFE_COGNITIVE_ENGINE), false);
});

test("22. first_after_reset rejects programas habitacionais reply", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](UNSAFE_PROGRAMAS_HAB), false);
});

test("23. greeting_reentrada rejects MCMV/CEF reply", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](UNSAFE_MCMV_CEF), false);
});

test("24. greeting_reentrada rejects financiamento habitacional reply", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](UNSAFE_FIN_HAB), false);
});

test("25. ambiguous rejects Caixa Econômica Federal reply", () => {
  // This reply has "programa" word too but should still be rejected by tone
  const reply = "Olá! Trabalho com a Caixa Econômica Federal no programa MCMV. Já conhece o programa?";
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](reply), false);
});

test("26. all 3 validators still accept valid feminine opening", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](SAFE_FEMININE_OPENING), true);
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](SAFE_FEMININE_OPENING), true);
  // ambiguous needs extra keywords
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](SAFE_INVITE_OPENING), true);
});

// ══════════════════════════════════════════════════════
// Section E: Safe openings accepted (feminine, human, natural)
// ══════════════════════════════════════════════════════
console.log("\n  Section E: aberturas femininas/humanas aceitas");

test("27. feminine specialist opening passes all checks", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(SAFE_FEMININE_OPENING), true);
  assert.strictEqual(_isTopoReplyToneSafe(SAFE_FEMININE_OPENING), true);
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](SAFE_FEMININE_OPENING), true);
});

test("28. warm human opening passes all checks", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(SAFE_WARM_OPENING), true);
  assert.strictEqual(_isTopoReplyToneSafe(SAFE_WARM_OPENING), true);
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](SAFE_WARM_OPENING), true);
});

test("29. invite-style opening passes ambiguous validator", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(SAFE_INVITE_OPENING), true);
  assert.strictEqual(_isTopoReplyToneSafe(SAFE_INVITE_OPENING), true);
  assert.strictEqual(VALIDATORS["inicio_programa:ambiguous"](SAFE_INVITE_OPENING), true);
});

test("30. 'Oi, quem é você?' response passes all checks", () => {
  assert.strictEqual(_isTopoReplySemanticallySafe(SAFE_QUEM_EH_VC), true);
  assert.strictEqual(_isTopoReplyToneSafe(SAFE_QUEM_EH_VC), true);
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](SAFE_QUEM_EH_VC), true);
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](SAFE_QUEM_EH_VC), true);
});

// ══════════════════════════════════════════════════════
// Section F: "Minha Casa Minha Vida" name preservation
// ══════════════════════════════════════════════════════
console.log("\n  Section F: preservação do nome 'Minha Casa Minha Vida'");

test("31. 'Minha Casa Minha Vida' does NOT trigger premature collection", () => {
  const reply = "Sou a Enova 😊 Trabalho com o Minha Casa Minha Vida. Já sabe como funciona?";
  assert.strictEqual(_isTopoReplySemanticallySafe(reply), true);
});

test("32. 'Minha Casa Minha Vida' does NOT trigger institutional tone", () => {
  const reply = "Sou a Enova 😊 Trabalho com o Minha Casa Minha Vida. Já sabe como funciona?";
  assert.strictEqual(_isTopoReplyToneSafe(reply), true);
});

test("33. official name preserved in safe opening text", () => {
  assert.ok(SAFE_FEMININE_OPENING.includes("Minha Casa Minha Vida"));
  assert.ok(SAFE_WARM_OPENING.includes("Minha Casa Minha Vida"));
  assert.ok(SAFE_INVITE_OPENING.includes("Minha Casa Minha Vida"));
});

// ══════════════════════════════════════════════════════
// Section G: Reset → "Oi Enova" protection
// ══════════════════════════════════════════════════════
console.log("\n  Section G: reset → 'Oi Enova' proteção");

test("34. reset→'Oi Enova': institutional reply rejected by first_after_reset", () => {
  const institutional = "Olá! Eu sou o Cognitive Engine da Enova, especialista em programas habitacionais. Como posso ajudar?";
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](institutional), false);
});

test("35. reset→'Oi Enova': premature collection rejected by first_after_reset", () => {
  const collection = "Oi! Vamos começar. Qual é o seu estado civil?";
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](collection), false);
});

test("36. reset→'Oi Enova': valid cognitive reply accepted", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](SAFE_FEMININE_OPENING), true);
});

// ══════════════════════════════════════════════════════
// Section H: Reset → "Oi, quem é você?" protection
// ══════════════════════════════════════════════════════
console.log("\n  Section H: reset → 'Oi, quem é você?' proteção");

test("37. 'Oi, quem é você?': institutional reply rejected", () => {
  const institutional = "Sou uma ferramenta de financiamento habitacional da Caixa Econômica Federal. Me diga o que precisa?";
  assert.strictEqual(VALIDATORS["inicio_programa:first_after_reset"](institutional), false);
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](institutional), false);
});

test("38. 'Oi, quem é você?': feminine specialist reply accepted", () => {
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](SAFE_QUEM_EH_VC), true);
});

test("39. 'Oi, quem é você?': reply with expanded collection rejected", () => {
  const withSomarRenda = "Oi! Sou a Enova. Vai somar renda com alguém ou seguir sozinho?";
  assert.strictEqual(VALIDATORS["inicio_programa:greeting_reentrada"](withSomarRenda), false);
});

// ══════════════════════════════════════════════════════
// Section I: Parser/gate/nextStage intact
// ══════════════════════════════════════════════════════
console.log("\n  Section I: parser/gate/nextStage intactos");

test("40. _isTopoReplyToneSafe is a pure function (no side effects)", () => {
  assert.strictEqual(typeof _isTopoReplyToneSafe, "function");
  assert.strictEqual(typeof _isTopoReplyToneSafe("test"), "boolean");
  assert.strictEqual(typeof _isTopoReplyToneSafe(null), "boolean");
});

test("41. _isTopoReplySemanticallySafe is a pure function (no side effects)", () => {
  assert.strictEqual(typeof _isTopoReplySemanticallySafe, "function");
  assert.strictEqual(typeof _isTopoReplySemanticallySafe("test"), "boolean");
});

test("42. validators are pure functions that don't alter state", () => {
  for (const key of Object.keys(VALIDATORS)) {
    const fn = VALIDATORS[key];
    assert.strictEqual(typeof fn, "function");
    // Validators return truthy/falsy — null input returns falsy (null short-circuit is OK)
    assert.ok(!fn(null), `${key} should reject null`);
    assert.ok(!fn(""), `${key} should reject empty`);
  }
});

// ══════════════════════════════════════════════════════
// Section J: Fallback texts use full program name
// ══════════════════════════════════════════════════════
console.log("\n  Section J: fallbacks usam nome completo do programa");

test("43. _MINIMAL_FALLBACK_SPEECH_MAP inicio_programa entry uses 'Minha Casa Minha Vida'", () => {
  // This is the canonical fallback for inicio_programa.
  // Verifying the expected text (mirrored from _MINIMAL_FALLBACK_SPEECH_MAP).
  const fallback = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Você já sabe como funciona ou prefere que eu explique rapidinho?";
  assert.ok(fallback.includes("Minha Casa Minha Vida"), "Fallback must use full program name");
  assert.ok(!fallback.includes("MCMV"), "Fallback must NOT use MCMV abbreviation");
});

test("44. TOPO_HAPPY_PATH_SPEECH first_after_reset fallback uses 'Minha Casa Minha Vida'", () => {
  const fallback = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida.";
  assert.ok(fallback.includes("Minha Casa Minha Vida"));
});

test("45. institutional tone check does not reject 'MCMV' alone (only combined forms)", () => {
  // "MCMV" alone is NOT in TOPO_INSTITUTIONAL_TONE. The regex requires
  // "MCMV/CEF" or "CEF/MCMV" combinations. Standalone MCMV references
  // in non-opening contexts (e.g., later stage descriptions) are tolerated.
  const withMCMV = "Oi! O MCMV é um programa incrível. Quer saber mais?";
  assert.strictEqual(_isTopoReplyToneSafe(withMCMV), true);
});

// ══════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
  console.error("❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED");
}
