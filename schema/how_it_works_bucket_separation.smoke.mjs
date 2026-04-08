/**
 * how_it_works_bucket_separation.smoke.mjs — Smoke tests for how_it_works bucket separation
 *
 * Validates that:
 * 1. how_it_works bucket is classified correctly for explanation requests
 * 2. Opening shell reuse is detected and rejected
 * 3. Reply semantic class distinguishes explanation vs greeting_shell
 * 4. how_it_works bucket validation rejects greeting/program_choice shells
 * 5. how_it_works bucket validation accepts real explanations
 * 6. Bucket-aware goals are returned correctly
 * 7. Telemetry fields are present in the output
 * 8. Practical distinction: greeting vs how_it_works vs program_choice
 */

import { strict as assert } from "node:assert";

// Import cognitive-contract for bucket-aware goals
const contractPath = new URL("../cognitive/src/cognitive-contract.js", import.meta.url).href;
const { getStageGoal } = await import(contractPath);

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ── Worker internals: inline reimplementation for smoke testing ──
// These mirror the worker functions exactly for isolated testing.

const _TOPO_INTENT_BUCKETS = Object.freeze([
  { key: "greeting",        re: /^(oi+|ol[aá]|opa|eae|eai|e ai|e a[ií]|fala|bom dia|boa tarde|boa noite)(?:\b|$|\s)/i },
  { key: "identity",        re: /(?:quem [eé] voc[eê]|quem [eé] a enova|voc[eê] [eé] quem|quem\b.*\bvoc[eê]|o que [eé] voc[eê]|o que voc[eê] [eé]|quem vc [eé]|quem [eé] vc)/i },
  { key: "how_it_works",    re: /(?:como funciona|explic[ao]|explique|me explic[ao]|me explique|n[aã]o.*me explic[ao]|n[aã]o.*me explique|como [eé]|que [eé] isso|como que funciona|funciona como)/i },
  { key: "program_choice",  re: /\b(j[aá] sei|j[aá] conhe[cç]o|sei sim|conhe[cç]o|n[aã]o sei|n[aã]o conhe[cç]o|quero saber|quero entender)\b/i },
  { key: "restart",         re: /\b(quero come[cç]ar|come[cç]ar de novo|come[cç]ar do zero|resetar|reset|voltei|to de volta)\b/i },
  { key: "affirmative",     re: /^(sim|s|ss|claro|pode|bora|vamos)\b/i },
  { key: "negative",        re: /^(n[aã]o|nao|nope)\b/i },
  { key: "program_query",   re: /\b(minha casa|mcmv|programa|habitacional|financ|subsídio|subs[ií]dio)\b/i },
  { key: "eligibility",     re: /\b(tenho direito|posso participar|consigo|eleg[ií]vel|enquadro)\b/i }
]);

function _classifyTopoIntentBucket(userText) {
  if (!userText) return "unknown_topo";
  const nt = String(userText).trim().toLowerCase();
  for (const { key, re } of _TOPO_INTENT_BUCKETS) {
    if (re.test(nt)) return key;
  }
  return "unknown_topo";
}

const TOPO_OPENING_SHELL_REUSE = /\b(?:j[aá]\s+sabe\s+como\s+funciona|j[aá]\s+conhece\s+como\s+funciona|voc[eê]\s+j[aá]\s+(?:sabe|conhece)|quer\s+que\s+(?:eu\s+)?(?:te\s+)?explique|posso\s+explicar|prefere\s+que\s+(?:eu\s+)?explique|quer\s+que\s+eu\s+te\s+explique|quer\s+saber\s+como\s+funciona)\b/i;

function _isOpeningShellReuse(reply) {
  if (!reply || typeof reply !== "string") return false;
  const hasShellPattern = TOPO_OPENING_SHELL_REUSE.test(reply);
  if (!hasShellPattern) return false;
  const hasExplanation = /\b(?:governo|subs[ií]dio|parcela|entrada|financiamento|faixa|reduz|ajuda\s+na\s+entrada|an[aá]lise)\b/i.test(reply);
  return !hasExplanation;
}

function _classifyReplySemanticClass(reply) {
  if (!reply || typeof reply !== "string") return "other";
  const nt = reply.toLowerCase();
  const hasExplanation = /\b(?:governo|subs[ií]dio|parcela|entrada|financiamento|faixa|reduz|ajuda\s+na\s+entrada|an[aá]lise|renda)\b/i.test(nt);
  const hasShellPattern = TOPO_OPENING_SHELL_REUSE.test(reply);
  const hasGreeting = /\b(?:oi|ol[aá]|bem[- ]?vind|ajudar|ajudo|por aqui)\b/i.test(nt);
  const hasIdentity = /\b(?:sou\s+a?\s*enova|assistente\s+virtual)\b/i.test(nt);
  if (hasExplanation && !hasShellPattern) return "explanation";
  if (hasExplanation && hasShellPattern) return "mixed";
  if (hasIdentity && !hasExplanation) return "identity";
  if (hasShellPattern && !hasExplanation) return "greeting_shell";
  if (hasGreeting && !hasExplanation) return "greeting_shell";
  if (/\?/.test(reply) && !hasExplanation) return "choice_question";
  return "other";
}

const TOPO_PREMATURE_COLLECTION = /\b(?:estado\s+civil|solteiro\(?a?\)?|casad[oa]|divorci|separad[oa]|vi[uú]v[oa]|uni[aã]o\s+est[aá]vel|nome\s+completo|qual\s+(?:[eé]\s+)?(?:o\s+)?seu\s+nome|nacionalidade|voc[eê]\s+[eé]\s+brasileir|brasileiro\(?a?\)?(?:\s+nat[oa])?|estrangeir[oa]?|regime\s+de\s+trabalho|CLT|aut[oô]nom[oa]|renda\s+mensal|sal[aá]rio|quanto\s+(?:voc[eê]\s+)?ganh|CTPS|carteira\s+de\s+trabalho|SPC|Serasa|restri[cç][aã]o\s+no|somar\s+renda|servidor\s+p[uú]blic|aposentad[oa])/i;

function _isTopoBucketReplyCompatible(bucket, reply) {
  if (!reply || typeof reply !== "string") return false;
  const nt = reply.toLowerCase();
  switch (bucket) {
    case "greeting":
      if (TOPO_PREMATURE_COLLECTION.test(reply)) return false;
      if (!/\b(oi|olá|ola|bem[- ]?vind|ajudar|ajudo|por aqui|tudo bem)\b/i.test(nt)) return false;
      return true;
    case "identity":
      if (TOPO_PREMATURE_COLLECTION.test(reply)) return false;
      if (!/\b(enova|assistente|virtual|programa|minha casa)\b/i.test(nt)) return false;
      return true;
    case "how_it_works":
      if (TOPO_PREMATURE_COLLECTION.test(reply)) return false;
      if (!/\b(programa|governo|subs[ií]dio|financiamento|parcela|entrada|minha casa)\b/i.test(nt)) return false;
      if (_isOpeningShellReuse(reply)) return false;
      if (reply.length < 80) return false;
      // Classificação semântica: SOMENTE "explanation" ou "mixed" são aceitas para how_it_works
      {
        const _semClass = _classifyReplySemanticClass(reply);
        if (_semClass !== "explanation" && _semClass !== "mixed") return false;
      }
      return true;
    case "program_choice":
      if (TOPO_PREMATURE_COLLECTION.test(reply)) return false;
      if (!/\?/.test(reply)) return false;
      return true;
    default:
      if (TOPO_PREMATURE_COLLECTION.test(reply)) return false;
      return true;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION A — Bucket classification tests
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n── SECTION A: Bucket Classification ──");

test("A01: 'me explique' → how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("me explique"), "how_it_works");
});

test("A02: 'me explica' → how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("me explica"), "how_it_works");
});

test("A03: 'como funciona' → how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("como funciona"), "how_it_works");
});

test("A04: 'não, me explica' → how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("não, me explica"), "how_it_works");
});

test("A05: 'como funciona isso?' → how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("como funciona isso?"), "how_it_works");
});

test("A06: 'oi' → greeting", () => {
  assert.equal(_classifyTopoIntentBucket("oi"), "greeting");
});

test("A07: 'quem é você' → identity", () => {
  assert.equal(_classifyTopoIntentBucket("quem é você"), "identity");
});

test("A08: 'já sei' → program_choice", () => {
  assert.equal(_classifyTopoIntentBucket("já sei"), "program_choice");
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION B — Opening shell reuse detection
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n── SECTION B: Opening Shell Reuse Detection ──");

test("B01: shell reuse detected — 'Você já sabe como funciona ou quer que eu explique?'", () => {
  assert.equal(_isOpeningShellReuse("Você já sabe como funciona ou quer que eu explique?"), true);
});

test("B02: shell reuse detected — 'Já conhece como funciona o programa?'", () => {
  assert.equal(_isOpeningShellReuse("Já conhece como funciona o programa?"), true);
});

test("B03: shell reuse detected — 'Posso explicar pra você como funciona'", () => {
  assert.equal(_isOpeningShellReuse("Posso explicar pra você como funciona"), true);
});

test("B04: NOT shell reuse — real explanation with subsídio", () => {
  assert.equal(_isOpeningShellReuse(
    "O Minha Casa Minha Vida é um programa do governo que oferece subsídio na entrada e reduz a parcela do financiamento. Quer seguir com a análise?"
  ), false);
});

test("B05: NOT shell reuse — explanation with financiamento", () => {
  assert.equal(_isOpeningShellReuse(
    "O programa ajuda na entrada do financiamento e reduz a parcela conforme a renda da família. Quer que eu analise seu perfil?"
  ), false);
});

test("B06: shell reuse detected — 'Prefere que eu explique como funciona?'", () => {
  assert.equal(_isOpeningShellReuse("Prefere que eu explique como funciona?"), true);
});

test("B07: NOT shell reuse — normal greeting", () => {
  assert.equal(_isOpeningShellReuse("Oi! Eu sou a Enova 😊"), false);
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION C — Reply semantic class
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n── SECTION C: Reply Semantic Class ──");

test("C01: real explanation → 'explanation'", () => {
  assert.equal(_classifyReplySemanticClass(
    "O Minha Casa Minha Vida é um programa do governo que oferece subsídio na entrada e reduz a parcela do financiamento conforme a renda."
  ), "explanation");
});

test("C02: shell re-ask without explanation → 'greeting_shell'", () => {
  assert.equal(_classifyReplySemanticClass(
    "Você já sabe como funciona ou quer que eu explique?"
  ), "greeting_shell");
});

test("C03: identity reply → 'identity'", () => {
  assert.equal(_classifyReplySemanticClass(
    "Sou a Enova, assistente virtual do programa Minha Casa Minha Vida."
  ), "identity");
});

test("C04: mixed — explanation + shell → 'mixed'", () => {
  assert.equal(_classifyReplySemanticClass(
    "O programa oferece subsídio na entrada. Quer que eu te explique mais?"
  ), "mixed");
});

test("C05: greeting → 'greeting_shell'", () => {
  assert.equal(_classifyReplySemanticClass(
    "Oi! Tudo bem? Estou por aqui pra te ajudar."
  ), "greeting_shell");
});

test("C06: choice question without explanation → 'choice_question'", () => {
  assert.equal(_classifyReplySemanticClass(
    "Você gostaria de saber mais sobre o programa?"
  ), "choice_question");
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION D — Bucket compatibility validation
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n── SECTION D: Bucket Compatibility Validation ──");

test("D01: how_it_works REJECTS shell reuse", () => {
  assert.equal(_isTopoBucketReplyCompatible("how_it_works",
    "Oi! Eu sou a Enova 😊 Você já sabe como funciona o programa ou quer que eu explique?"
  ), false);
});

test("D02: how_it_works REJECTS short reply", () => {
  assert.equal(_isTopoBucketReplyCompatible("how_it_works",
    "O programa do governo ajuda."
  ), false);
});

test("D03: how_it_works ACCEPTS real explanation", () => {
  assert.equal(_isTopoBucketReplyCompatible("how_it_works",
    "O Minha Casa Minha Vida é um programa do governo que oferece subsídio na entrada do imóvel e reduz a parcela do financiamento, de acordo com a renda da família 😊 Vou analisar seu perfil."
  ), true);
});

test("D04: how_it_works REJECTS greeting-style reply", () => {
  assert.equal(_isTopoBucketReplyCompatible("how_it_works",
    "Oi! Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Posso te ajudar?"
  ), false);
});

test("D05: greeting ACCEPTS proper greeting", () => {
  assert.equal(_isTopoBucketReplyCompatible("greeting",
    "Oi! Eu sou a Enova 😊 Posso te ajudar?"
  ), true);
});

test("D06: how_it_works REJECTS re-ask disguised as explanation", () => {
  assert.equal(_isTopoBucketReplyCompatible("how_it_works",
    "Entendo! O Minha Casa Minha Vida é um programa super legal. Você já sabe como funciona ou quer que eu explique?"
  ), false);
});

test("D07: how_it_works ACCEPTS static fallback reply", () => {
  assert.equal(_isTopoBucketReplyCompatible("how_it_works",
    "O Minha Casa Minha Vida é um programa do governo que ajuda na entrada e reduz a parcela do financiamento, de acordo com a faixa da família 😊 Eu vou analisar seu perfil e mostrar quanto de subsídio você pode ter. Quer seguir com a análise? Me diz *sim* pra gente começar."
  ), true);
});

test("D08: how_it_works REJECTS program_choice shell", () => {
  assert.equal(_isTopoBucketReplyCompatible("how_it_works",
    "Você já conhece como funciona esse programa?"
  ), false);
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION E — Practical distinction between buckets
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n── SECTION E: Practical Bucket Distinction ──");

test("E01: greeting ≠ how_it_works — 'Oi' classified differently from 'Me explique'", () => {
  assert.notEqual(
    _classifyTopoIntentBucket("Oi"),
    _classifyTopoIntentBucket("Me explique")
  );
});

test("E02: how_it_works ≠ program_choice — 'Me explique' classified differently from 'Já sei'", () => {
  assert.notEqual(
    _classifyTopoIntentBucket("Me explique"),
    _classifyTopoIntentBucket("Já sei")
  );
});

test("E03: greeting ≠ identity — 'Oi' classified differently from 'Quem é você?'", () => {
  assert.notEqual(
    _classifyTopoIntentBucket("Oi"),
    _classifyTopoIntentBucket("Quem é você?")
  );
});

test("E04: 'Como funciona?' response must be 'explanation' class, not 'greeting_shell'", () => {
  // A proper how_it_works reply should be classified as explanation
  const goodReply = "O Minha Casa Minha Vida é um programa do governo que oferece subsídio na entrada e reduz a parcela do financiamento conforme a renda familiar.";
  assert.equal(_classifyReplySemanticClass(goodReply), "explanation");
});

test("E05: greeting reply cannot pass how_it_works bucket validation", () => {
  const greetingReply = "Oi! Eu sou a Enova 😊 Posso te ajudar a entender o Minha Casa Minha Vida?";
  assert.equal(_isTopoBucketReplyCompatible("how_it_works", greetingReply), false);
});

test("E06: program_choice re-ask cannot pass how_it_works bucket validation", () => {
  const choiceReply = "Você já sabe como funciona o Minha Casa Minha Vida ou quer que eu te explique rapidinho?";
  assert.equal(_isTopoBucketReplyCompatible("how_it_works", choiceReply), false);
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION F — Bucket-aware stage goals
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n── SECTION F: Bucket-Aware Stage Goals ──");

test("F01: inicio_programa default goal is generic", () => {
  const goal = getStageGoal("inicio_programa");
  assert.ok(goal.includes("Confirmar interesse"));
});

test("F02: inicio_programa + how_it_works bucket = specific explanation goal", () => {
  const goal = getStageGoal("inicio_programa", "how_it_works");
  assert.ok(goal.includes("EXPLIQUE"), `Goal should contain EXPLIQUE, got: ${goal}`);
});

test("F03: inicio_programa + greeting bucket = specific greeting goal", () => {
  const goal = getStageGoal("inicio_programa", "greeting");
  assert.ok(goal.includes("Saudação"), `Goal should contain Saudação, got: ${goal}`);
});

test("F04: inicio_programa + program_choice bucket = specific choice goal", () => {
  const goal = getStageGoal("inicio_programa", "program_choice");
  assert.ok(goal.includes("Pergunte"), `Goal should contain Pergunte, got: ${goal}`);
});

test("F05: how_it_works goal prohibits re-asking 'já sabe como funciona'", () => {
  const goal = getStageGoal("inicio_programa", "how_it_works");
  assert.ok(goal.includes("NÃO pergunte"), `Goal should prohibit re-asking, got: ${goal}`);
});

test("F06: other stages unaffected by bucket param", () => {
  const goal = getStageGoal("estado_civil", "how_it_works");
  assert.equal(goal, "Coletar o estado civil do cliente");
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION G — Incompatibility detection ("Me explique" generating real explanation)
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n── SECTION G: 'Me explique' must generate real explanation ──");

test("G01: 'Me explique' bucket is how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("Me explique"), "how_it_works");
});

test("G02: 'Como funciona?' bucket is how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("Como funciona?"), "how_it_works");
});

test("G03: 'Não, me explica' bucket is how_it_works", () => {
  assert.equal(_classifyTopoIntentBucket("Não, me explica"), "how_it_works");
});

test("G04: reformulated opening shell is INCOMPATIBLE with how_it_works", () => {
  const badReplies = [
    "Você já sabe como funciona ou quer que eu te explique?",
    "Já conhece como funciona esse programa?",
    "Posso explicar os detalhes para você",
    "Prefere que eu explique como funciona?",
    "Quer saber como funciona o programa?"
  ];
  for (const r of badReplies) {
    assert.equal(_isTopoBucketReplyCompatible("how_it_works", r), false, `Should reject: "${r}"`);
  }
});

test("G05: real explanation is COMPATIBLE with how_it_works", () => {
  const goodReplies = [
    "O Minha Casa Minha Vida é um programa do governo que oferece subsídio na entrada e reduz a parcela do financiamento, de acordo com a renda da família 😊 Eu vou analisar seu perfil e mostrar quanto de subsídio você pode ter. Quer seguir com a análise? Me diz *sim* pra gente começar.",
    "O programa Minha Casa Minha Vida funciona assim: o governo federal oferece um subsídio que ajuda na entrada do imóvel e reduz a parcela mensal do financiamento. Tudo depende da faixa de renda da família. Quer que eu analise seu perfil?"
  ];
  for (const r of goodReplies) {
    assert.equal(_isTopoBucketReplyCompatible("how_it_works", r), true, `Should accept: "${r.slice(0, 60)}..."`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n══════════════════════════════════════`);
console.log(`  TOTAL: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
if (failures.length > 0) {
  console.log(`\n  Failures:`);
  for (const f of failures) {
    console.log(`    - ${f.name}: ${f.error}`);
  }
}
console.log(`══════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
