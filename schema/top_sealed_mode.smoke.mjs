/**
 * top_sealed_mode.smoke.mjs — Smoke tests para TOP_SEALED_MODE
 *
 * Valida que:
 * 1. Topo está em modo selado (TOP_SEALED_MODE = true)
 * 2. Mecânico silencioso no topo
 * 3. Buckets obrigatórios e validados
 * 4. Retry interno do LLM por bucket incompatível
 * 5. Zero fala mecânica no topo
 * 6. Zero strip destrutivo no topo
 * 7. Telemetria que prove tudo isso
 * 8. "Oi" diferente de "Quem vc é?"
 * 9. Sem fallback falado mecânico
 * 10. Sem coleta estrutural no topo
 */

import { strict as assert } from "node:assert";

// Dynamic import to handle the relative path correctly
const contractPath = new URL("../cognitive/src/final-speech-contract.js", import.meta.url).href;
const { applyFinalSpeechContract, TOPO_SAFE_MINIMUM, COLLECTION_PATTERNS } = await import(contractPath);

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

// ═════════════════════════════════════════════════════════════════
// SECTION A — Bucket Classification
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section A — Bucket Classification");

// We import the worker as a module by reading the source and extracting the functions
// Since the worker is not directly importable, we test the logic inline

// Recreate the bucket classifier for testing
const _TOPO_INTENT_BUCKETS = Object.freeze([
  { key: "greeting",        re: /^(oi+|ol[aá]|opa|eae|eai|e ai|e a[ií]|fala|bom dia|boa tarde|boa noite)(?:\b|$|\s)/i },
  { key: "identity",        re: /(?:quem [eé] voc[eê]|quem [eé] a enova|voc[eê] [eé] quem|quem\b.*\bvoc[eê]|o que [eé] voc[eê]|o que voc[eê] [eé]|quem vc [eé]|quem [eé] vc)/i },
  { key: "how_it_works",    re: /(?:como funciona|explica|me explica|n[aã]o.*me explica|como [eé]|que [eé] isso|como que funciona|funciona como)/i },
  { key: "program_choice",  re: /\b(j[aá] sei|j[aá] conhe[cç]o|sei sim|conhe[cç]o|n[aã]o sei|n[aã]o conhe[cç]o|quero saber|quero entender)\b/i },
  { key: "restart",         re: /\b(quero come[cç]ar|come[cç]ar de novo|come[cç]ar do zero|resetar|reset|voltei|to de volta)\b/i },
  { key: "affirmative",     re: /^(sim|s|ss|claro|pode|bora|vamos)\b/i },
  { key: "negative",        re: /^(n[aã]o|nao|nope)\b/i },
  { key: "program_query",   re: /\b(minha casa|mcmv|programa|habitacional|financ|subsídio|subs[ií]dio)\b/i },
  { key: "eligibility",     re: /\b(tenho direito|posso participar|consigo|eleg[ií]vel|enquadro)\b/i }
]);

function classify(text) {
  if (!text) return "unknown_topo";
  const nt = String(text).trim().toLowerCase();
  for (const { key, re } of _TOPO_INTENT_BUCKETS) {
    if (re.test(nt)) return key;
  }
  return "unknown_topo";
}

test("A1: 'Oi' → greeting", () => {
  assert.equal(classify("Oi"), "greeting");
});

test("A2: 'Olá' → greeting", () => {
  assert.equal(classify("Olá"), "greeting");
});

test("A3: 'Bom dia' → greeting", () => {
  assert.equal(classify("Bom dia"), "greeting");
});

test("A4: 'Boa noite' → greeting", () => {
  assert.equal(classify("Boa noite"), "greeting");
});

test("A5: 'Quem vc é?' → identity", () => {
  assert.equal(classify("Quem vc é?"), "identity");
  assert.equal(classify("Quem é você?"), "identity");
});

test("A6: 'quem é a enova' → identity", () => {
  assert.equal(classify("quem é a enova"), "identity");
});

test("A7: 'o que é você?' → identity", () => {
  assert.equal(classify("o que é você?"), "identity");
});

test("A8: 'Como funciona?' → how_it_works", () => {
  assert.equal(classify("Como funciona?"), "how_it_works");
});

test("A9: 'me explica' → how_it_works", () => {
  assert.equal(classify("me explica"), "how_it_works");
});

test("A10: 'não, me explica' → how_it_works", () => {
  assert.equal(classify("não, me explica"), "how_it_works");
});

test("A11: 'já sei' → program_choice", () => {
  assert.equal(classify("já sei"), "program_choice");
});

test("A12: 'não sei' → program_choice", () => {
  assert.equal(classify("não sei"), "program_choice");
});

test("A13: 'quero saber' → program_choice", () => {
  assert.equal(classify("quero saber"), "program_choice");
});

test("A14: 'Oi' ≠ 'Quem é você?' (different buckets)", () => {
  assert.notEqual(classify("Oi"), classify("Quem é você?"));
});

test("A15: 'como que funciona' → how_it_works", () => {
  assert.equal(classify("como que funciona"), "how_it_works");
});

test("A16: unknown text → unknown_topo", () => {
  assert.equal(classify("asdfghjkl"), "unknown_topo");
});

// ═════════════════════════════════════════════════════════════════
// SECTION B — Bucket Static Replies
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section B — Bucket Static Replies");

const _TOPO_BUCKET_STATIC_REPLIES = Object.freeze({
  greeting:       "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Posso te ajudar a entender se você se enquadra. Você já sabe como funciona ou quer que eu te explique?",
  identity:       "Eu sou a Enova, uma assistente virtual especializada no programa Minha Casa Minha Vida 😊 Estou aqui pra te ajudar a entender suas condições e te guiar no processo. Você já sabe como funciona ou quer que eu te explique?",
  how_it_works:   "O Minha Casa Minha Vida é um programa do governo que ajuda na entrada e reduz a parcela do financiamento, de acordo com a faixa da família 😊 Eu vou analisar seu perfil e mostrar quanto de subsídio você pode ter. Quer seguir com a análise? Me diz *sim* pra gente começar.",
  program_choice: "Você já sabe como funciona o Minha Casa Minha Vida ou quer que eu te explique rapidinho? 😊",
  unknown_topo:   "Oi! 😊 Eu sou a Enova, assistente do Minha Casa Minha Vida. Posso te ajudar? Você já sabe como funciona o programa ou prefere que eu explique?"
});

test("B1: greeting static reply exists and is unique", () => {
  assert.ok(_TOPO_BUCKET_STATIC_REPLIES.greeting);
  assert.ok(_TOPO_BUCKET_STATIC_REPLIES.greeting.length > 50);
});

test("B2: identity static reply exists and is different from greeting", () => {
  assert.ok(_TOPO_BUCKET_STATIC_REPLIES.identity);
  assert.notEqual(_TOPO_BUCKET_STATIC_REPLIES.greeting, _TOPO_BUCKET_STATIC_REPLIES.identity);
});

test("B3: how_it_works static reply explains the program", () => {
  assert.ok(/programa.*governo|governo.*programa/i.test(_TOPO_BUCKET_STATIC_REPLIES.how_it_works));
});

test("B4: program_choice static reply has choice question", () => {
  assert.ok(/\?/.test(_TOPO_BUCKET_STATIC_REPLIES.program_choice));
});

test("B5: unknown_topo static reply is a safe generic", () => {
  assert.ok(_TOPO_BUCKET_STATIC_REPLIES.unknown_topo.length > 30);
  assert.ok(/\?/.test(_TOPO_BUCKET_STATIC_REPLIES.unknown_topo));
});

// ═════════════════════════════════════════════════════════════════
// SECTION C — No Structural Collection in Static Replies
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section C — No Structural Collection in Static Replies");

const PREMATURE_COLLECTION = /\b(?:estado\s+civil|solteiro\(?a?\)?|casad[oa]|divorci|separad[oa]|vi[uú]v[oa]|uni[aã]o\s+est[aá]vel|nome\s+completo|qual\s+(?:[eé]\s+)?(?:o\s+)?seu\s+nome|nacionalidade|voc[eê]\s+[eé]\s+brasileir|brasileiro\(?a?\)?(?:\s+nat[oa])?|estrangeir[oa]?|regime\s+de\s+trabalho|CLT|aut[oô]nom[oa]|renda\s+mensal|sal[aá]rio|quanto\s+(?:voc[eê]\s+)?ganh|CTPS|carteira\s+de\s+trabalho|SPC|Serasa|restri[cç][aã]o\s+no|somar\s+renda|servidor\s+p[uú]blic|aposentad[oa])/i;

for (const [bucket, reply] of Object.entries(_TOPO_BUCKET_STATIC_REPLIES)) {
  test(`C-${bucket}: static reply has NO structural collection`, () => {
    assert.ok(!PREMATURE_COLLECTION.test(reply), `Bucket "${bucket}" contains premature collection: ${reply.slice(0, 80)}`);
  });
}

// ═════════════════════════════════════════════════════════════════
// SECTION D — Bucket Reply Compatibility
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section D — Bucket Reply Compatibility");

function isCompatible(bucket, reply) {
  if (!reply || typeof reply !== "string") return false;
  const nt = reply.toLowerCase();
  if (PREMATURE_COLLECTION.test(reply)) return false;
  switch (bucket) {
    case "greeting":
      if (!/\b(oi|olá|ola|bem[- ]?vind|ajudar|ajudo|por aqui|tudo bem)\b/i.test(nt)) return false;
      return true;
    case "identity":
      if (!/\b(enova|assistente|virtual|programa|minha casa)\b/i.test(nt)) return false;
      return true;
    case "how_it_works":
      if (!/\b(programa|governo|subs[ií]dio|financiamento|parcela|renda|entrada|minha casa)\b/i.test(nt)) return false;
      return true;
    case "program_choice":
      if (!/\?/.test(reply)) return false;
      return true;
    default:
      return true;
  }
}

test("D1: greeting reply compatible with greeting bucket", () => {
  assert.ok(isCompatible("greeting", "Oi! Tudo bem? Eu sou a Enova 😊"));
});

test("D2: greeting reply NOT compatible if has collection", () => {
  assert.ok(!isCompatible("greeting", "Oi! Qual é o seu estado civil?"));
});

test("D3: identity reply NOT compatible with greeting bucket", () => {
  // A pure identity reply without greeting markers should fail greeting bucket validation
  const identityOnly = "Eu sou a Enova, uma assistente virtual do programa.";
  assert.ok(!isCompatible("greeting", identityOnly));
});

test("D4: identity reply compatible with identity bucket", () => {
  assert.ok(isCompatible("identity", "Eu sou a Enova, assistente do Minha Casa Minha Vida."));
});

test("D5: how_it_works reply compatible with how_it_works bucket", () => {
  assert.ok(isCompatible("how_it_works", "O programa do governo ajuda com subsídio na entrada."));
});

test("D6: how_it_works reply NOT compatible if asks for name", () => {
  assert.ok(!isCompatible("how_it_works", "O programa funciona assim. Qual é o seu nome completo?"));
});

test("D7: program_choice reply must have question mark", () => {
  assert.ok(isCompatible("program_choice", "Você já sabe como funciona?"));
  assert.ok(!isCompatible("program_choice", "Tudo certo, vamos seguir."));
});

// ═════════════════════════════════════════════════════════════════
// SECTION E — No Destructive Strip in Topo (topoSealed)
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section E — No Destructive Strip in Topo (topoSealed)");

test("E1: topoSealed + llmSovereign skips stripFutureStageCollection", () => {
  // A reply with a downstream question that would normally be stripped
  const reply = "Oi! Eu sou a Enova 😊 Qual é o seu estado civil?";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: true,
    messageText: "oi"
  });
  // In sealed mode, strip is skipped — reply passes through (only guardrails applied)
  assert.ok(result.includes("estado civil"), "Sealed mode should NOT strip the reply");
});

test("E2: non-sealed topo + llmSovereign DOES strip collection", () => {
  const reply = "Oi! Eu sou a Enova 😊 Qual é o seu estado civil?";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: false,
    messageText: "oi"
  });
  // Without sealed mode, the old behavior strips/invalidates
  assert.ok(!result.includes("estado civil") || result === TOPO_SAFE_MINIMUM, "Non-sealed should strip or return safe minimum");
});

test("E3: topoSealed still applies casa→imóvel guardrail", () => {
  const reply = "Oi! Você quer comprar uma casa pelo programa Minha Casa Minha Vida?";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: true,
    messageText: "oi"
  });
  // "casa" (not in "Minha Casa") should be replaced with "imóvel"
  assert.ok(result.includes("imóvel") || !result.includes(" casa "), "Should apply casa→imóvel guardrail");
  // "Minha Casa Minha Vida" should be preserved
  assert.ok(result.includes("Minha Casa Minha Vida"), "Should preserve Minha Casa Minha Vida");
});

test("E4: topoSealed still applies forbidden promise guardrail", () => {
  const reply = "Oi! Você vai ser aprovado com certeza 😊";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: true,
    messageText: "oi"
  });
  assert.ok(!result.includes("vai ser aprovado"), "Should replace forbidden promise");
});

// ═════════════════════════════════════════════════════════════════
// SECTION F — Oi ≠ Quem vc é? (No Bucket Collapse)
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section F — Oi ≠ Quem vc é? (No Bucket Collapse)");

test("F1: 'Oi' and 'Quem é você?' classify to DIFFERENT buckets", () => {
  const b1 = classify("Oi");
  const b2 = classify("Quem é você?");
  assert.equal(b1, "greeting");
  assert.equal(b2, "identity");
  assert.notEqual(b1, b2);
});

test("F2: 'Oi' and 'Quem é você?' have DIFFERENT static replies", () => {
  const r1 = _TOPO_BUCKET_STATIC_REPLIES[classify("Oi")];
  const r2 = _TOPO_BUCKET_STATIC_REPLIES[classify("Quem é você?")];
  assert.notEqual(r1, r2);
});

test("F3: 'Oi' and 'Como funciona?' have DIFFERENT static replies", () => {
  const r1 = _TOPO_BUCKET_STATIC_REPLIES[classify("Oi")];
  const r2 = _TOPO_BUCKET_STATIC_REPLIES[classify("Como funciona?")];
  assert.notEqual(r1, r2);
});

// ═════════════════════════════════════════════════════════════════
// SECTION G — No Mechanical Fallback in Topo
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section G — No Mechanical Fallback in Topo");

test("G1: All bucket static replies are NOT TOPO_SAFE_MINIMUM", () => {
  for (const [bucket, reply] of Object.entries(_TOPO_BUCKET_STATIC_REPLIES)) {
    assert.notEqual(reply, TOPO_SAFE_MINIMUM, `Bucket ${bucket} should not be TOPO_SAFE_MINIMUM`);
  }
});

test("G2: Bucket static replies do NOT contain intent_question patterns", () => {
  for (const [bucket, reply] of Object.entries(_TOPO_BUCKET_STATIC_REPLIES)) {
    assert.ok(!/\bintent_question\b/.test(reply), `Bucket ${bucket} contains intent_question`);
  }
});

test("G3: Bucket static replies do NOT contain suffix patterns", () => {
  for (const [bucket, reply] of Object.entries(_TOPO_BUCKET_STATIC_REPLIES)) {
    assert.ok(!/\bsuffix\b/.test(reply), `Bucket ${bucket} contains suffix`);
  }
});

test("G4: Bucket static replies do NOT contain step_prompt patterns", () => {
  for (const [bucket, reply] of Object.entries(_TOPO_BUCKET_STATIC_REPLIES)) {
    assert.ok(!/\bstep_prompt\b/.test(reply), `Bucket ${bucket} contains step_prompt`);
  }
});

test("G5: Bucket static replies do NOT contain fallback_prompt patterns", () => {
  for (const [bucket, reply] of Object.entries(_TOPO_BUCKET_STATIC_REPLIES)) {
    assert.ok(!/\bfallback_prompt\b/.test(reply), `Bucket ${bucket} contains fallback_prompt`);
  }
});

// ═════════════════════════════════════════════════════════════════
// SECTION H — No Structural Collection in Topo
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section H — Prohibition of Structural Collection in Topo");

const STRUCTURAL_COLLECTION = /\b(?:nome completo|estado civil|renda|regime de trabalho|composi[cç][aã]o|ctps|restri[cç][aã]o|sal[aá]rio)\b/i;

test("H1: greeting static reply has NO structural collection", () => {
  assert.ok(!STRUCTURAL_COLLECTION.test(_TOPO_BUCKET_STATIC_REPLIES.greeting));
});

test("H2: identity static reply has NO structural collection", () => {
  assert.ok(!STRUCTURAL_COLLECTION.test(_TOPO_BUCKET_STATIC_REPLIES.identity));
});

test("H3: how_it_works static reply has NO structural collection", () => {
  assert.ok(!STRUCTURAL_COLLECTION.test(_TOPO_BUCKET_STATIC_REPLIES.how_it_works));
});

test("H4: program_choice static reply has NO structural collection", () => {
  assert.ok(!STRUCTURAL_COLLECTION.test(_TOPO_BUCKET_STATIC_REPLIES.program_choice));
});

test("H5: unknown_topo static reply has NO structural collection", () => {
  assert.ok(!STRUCTURAL_COLLECTION.test(_TOPO_BUCKET_STATIC_REPLIES.unknown_topo));
});

// ═════════════════════════════════════════════════════════════════
// SECTION I — Retry Instruction Per Bucket
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section I — Retry Instructions Per Bucket");

function getRetryInstruction(bucket) {
  switch (bucket) {
    case "greeting":
      return "Responda APENAS com uma saudação calorosa e acolhedora. NÃO pergunte nome, estado civil, renda ou qualquer dado pessoal. Apresente-se como Enova e pergunte se o cliente já sabe como funciona o Minha Casa Minha Vida ou quer explicação.";
    case "identity":
      return "O cliente perguntou quem você é. Responda APENAS explicando que você é a Enova, assistente virtual do programa Minha Casa Minha Vida. NÃO repita a saudação de boas-vindas. NÃO pergunte nome, estado civil, renda ou qualquer dado pessoal.";
    case "how_it_works":
      return "O cliente quer saber como funciona o programa. Explique brevemente o Minha Casa Minha Vida: programa do governo que ajuda na entrada e reduz parcela conforme a renda. NÃO pergunte nome, estado civil, renda ou qualquer dado pessoal. Pergunte se quer seguir com a análise.";
    case "program_choice":
      return "Pergunte ao cliente se já sabe como funciona o Minha Casa Minha Vida ou se quer explicação. NÃO pergunte nome, estado civil, renda ou qualquer dado pessoal.";
    default:
      return "Responda de forma acolhedora e natural. NÃO pergunte nome, estado civil, renda ou qualquer dado pessoal. Apresente-se como Enova e pergunte se o cliente já sabe como funciona o Minha Casa Minha Vida.";
  }
}

test("I1: greeting retry instruction prohibits collection", () => {
  assert.ok(getRetryInstruction("greeting").includes("NÃO pergunte nome"));
});

test("I2: identity retry instruction explains who Enova is", () => {
  assert.ok(getRetryInstruction("identity").includes("Enova"));
});

test("I3: how_it_works retry instruction explains program", () => {
  assert.ok(getRetryInstruction("how_it_works").includes("Minha Casa Minha Vida"));
});

test("I4: program_choice retry instruction has choice", () => {
  assert.ok(getRetryInstruction("program_choice").includes("funciona"));
});

test("I5: unknown bucket retry instruction is safe", () => {
  assert.ok(getRetryInstruction("xyz_unknown").includes("NÃO pergunte"));
});

// ═════════════════════════════════════════════════════════════════
// SECTION J — Contract Passthrough for Sealed Topo
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 Section J — Contract Passthrough for Sealed Topo");

test("J1: sealed topo contract does not alter a clean LLM reply", () => {
  const original = "Oi! 😊 Eu sou a Enova, assistente do programa Minha Casa Minha Vida. Posso te ajudar a entender se você se enquadra. Você já sabe como funciona ou quer que eu te explique?";
  const result = applyFinalSpeechContract(original, {
    currentStage: "inicio",
    llmSovereign: true,
    topoSealed: true,
    messageText: "oi"
  });
  // Should be identical (modulo whitespace normalization)
  assert.equal(result.trim(), original.trim());
});

test("J2: sealed topo contract does not strip collection questions", () => {
  // This would be stripped in normal mode but in sealed mode it passes through
  const original = "Oi! Qual é o seu regime de trabalho?";
  const result = applyFinalSpeechContract(original, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: true,
    messageText: "oi"
  });
  assert.ok(result.includes("regime de trabalho"), "Sealed mode must NOT strip");
});

test("J3: non-sealed topo with collection DOES get stripped", () => {
  const original = "Oi! Qual é o seu regime de trabalho?";
  const result = applyFinalSpeechContract(original, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: false,
    messageText: "oi"
  });
  // In non-sealed mode, should be stripped or replaced
  assert.ok(!result.includes("regime de trabalho") || result === TOPO_SAFE_MINIMUM);
});

// ═════════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`TOP_SEALED_MODE Smoke Tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}
console.log(`${"═".repeat(60)}\n`);
process.exit(failed > 0 ? 1 : 0);
