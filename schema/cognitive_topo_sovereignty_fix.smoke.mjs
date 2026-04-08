/**
 * cognitive_topo_sovereignty_fix.smoke.mjs
 *
 * Smoke tests for the two macro causes fixed in this PR:
 *  1. FASE 1 — Topo bypass guard: assist geral cannot promote llm_real
 *     without passing validateInicioProgramaChoiceSpeech in inicio_programa.
 *  2. FASE 2 — Strip parcial: stripFutureStageCollection invalidates entire
 *     reply to TOPO_SAFE_MINIMUM for topo instead of partial replace.
 *  3. Telemetry fields present in source code.
 *  4. Synthetic contract cases (estado_civil, regime_trabalho, renda,
 *     composicao, ctps, restricao) — none can exit broken.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_SRC = readFileSync(resolve(ROOT, "Enova worker.js"), "utf-8");
const FINAL_SPEECH_SRC = readFileSync(resolve(ROOT, "cognitive/src/final-speech-contract.js"), "utf-8");

// Dynamic import for ESM module
const fsc = await import(resolve(ROOT, "cognitive/src/final-speech-contract.js"));
const {
  applyFinalSpeechContract,
  stripFutureStageCollection,
  COLLECTION_PATTERNS,
  TOPO_SAFE_MINIMUM,
  STAGE_TO_GROUP,
  STAGE_FORBIDDEN_PATTERNS
} = fsc;

let passed = 0;
let failed = 0;

function ok(label, fn) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${label} — ${e.message}`);
    failed++;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section A: FASE 1 — Topo bypass guard uses validateInicioProgramaChoiceSpeech
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section A: FASE 1 — Topo bypass guard with choice contract ──");

ok("A1: TOPO BYPASS GUARD checks _needsChoiceContract for inicio_programa", () => {
  const idx = WORKER_SRC.indexOf("TOPO BYPASS GUARD");
  assert.ok(idx > -1, "TOPO BYPASS GUARD block exists");
  const chunk = WORKER_SRC.substring(idx, idx + 2000);
  assert.ok(chunk.includes("_needsChoiceContract"), "Guard references _needsChoiceContract");
  assert.ok(chunk.includes("validateInicioProgramaChoiceSpeech"), "Guard calls validateInicioProgramaChoiceSpeech");
});

ok("A2: Guard applies choice contract for greeting bucket in inicio_programa", () => {
  const idx = WORKER_SRC.indexOf("TOPO BYPASS GUARD");
  const chunk = WORKER_SRC.substring(idx, idx + 2000);
  assert.ok(chunk.includes('"greeting"'), "Handles greeting bucket");
  assert.ok(chunk.includes('"identity"'), "Handles identity bucket");
  assert.ok(chunk.includes('"how_it_works"'), "Handles how_it_works bucket");
  assert.ok(chunk.includes('"program_query"'), "Handles program_query bucket");
  assert.ok(chunk.includes('"other"'), "Handles other bucket");
});

ok("A3: Guard sets _topoContractBypassReason = 'choice_contract_missing' when choice fails", () => {
  const idx = WORKER_SRC.indexOf("TOPO BYPASS GUARD");
  const chunk = WORKER_SRC.substring(idx, idx + 3000);
  assert.ok(chunk.includes('"choice_contract_missing"'), "choice_contract_missing reason exists");
});

ok("A4: Guard clears __cognitive_reply_prefix when choice contract fails", () => {
  const idx = WORKER_SRC.indexOf("TOPO BYPASS GUARD");
  const chunk = WORKER_SRC.substring(idx, idx + 3000);
  assert.ok(chunk.includes("st.__cognitive_reply_prefix = null"), "Clears prefix on bypass");
  assert.ok(chunk.includes("st.__cognitive_v2_takes_final = false"), "Clears takes_final on bypass");
  assert.ok(chunk.includes("st.__speech_arbiter_source = null"), "Clears arbiter source on bypass");
});

ok("A5: Guard sets _topoValidatorName variable", () => {
  const idx = WORKER_SRC.indexOf("TOPO BYPASS GUARD");
  const chunk = WORKER_SRC.substring(idx, idx + 3000);
  assert.ok(chunk.includes("_topoValidatorName"), "Variable _topoValidatorName exists");
  assert.ok(chunk.includes('"validateInicioProgramaChoiceSpeech"'), "Sets correct validator name");
  assert.ok(chunk.includes('"semantic_tone_only"'), "Sets fallback validator name");
});

// ══════════════════════════════════════════════════════════════════════════════
// Section B: FASE 1 — Telemetry fields in topo_sovereign_chain
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section B: FASE 1 — Telemetry at promotion point ──");

ok("B1: Telemetry includes topo_validator_name", () => {
  const idx = WORKER_SRC.indexOf("topo_sovereign_chain");
  assert.ok(idx > -1, "topo_sovereign_chain event exists");
  const chunk = WORKER_SRC.substring(idx, idx + 2000);
  assert.ok(chunk.includes("topo_validator_name"), "topo_validator_name field present");
});

ok("B2: Telemetry includes topo_validator_missing_choice_contract", () => {
  const idx = WORKER_SRC.indexOf("topo_sovereign_chain");
  const chunk = WORKER_SRC.substring(idx, idx + 2000);
  assert.ok(chunk.includes("topo_validator_missing_choice_contract"), "topo_validator_missing_choice_contract field present");
});

ok("B3: Telemetry includes topo_contract_should_have_used_choice_validator", () => {
  const idx = WORKER_SRC.indexOf("topo_sovereign_chain");
  const chunk = WORKER_SRC.substring(idx, idx + 2000);
  assert.ok(chunk.includes("topo_contract_should_have_used_choice_validator"), "topo_contract_should_have_used_choice_validator field present");
});

ok("B4: Telemetry includes topo_route_key_candidate", () => {
  const idx = WORKER_SRC.indexOf("topo_sovereign_chain");
  const chunk = WORKER_SRC.substring(idx, idx + 2000);
  assert.ok(chunk.includes("topo_route_key_candidate"), "topo_route_key_candidate field present");
});

// ══════════════════════════════════════════════════════════════════════════════
// Section C: FASE 2 — stripFutureStageCollection invalidates topo entirely
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section C: FASE 2 — Topo strip invalidation (no partial strip) ──");

ok("C1: stripFutureStageCollection source has early return for topo", () => {
  const idx = FINAL_SPEECH_SRC.indexOf("function stripFutureStageCollection");
  assert.ok(idx > -1, "Function exists");
  const chunk = FINAL_SPEECH_SRC.substring(idx, idx + 3000);
  assert.ok(chunk.includes('group === "topo" && hitKeys.length > 0'), "Topo early return guard present");
  assert.ok(chunk.includes("TOPO_SAFE_MINIMUM"), "Returns TOPO_SAFE_MINIMUM");
});

ok("C2: stripFutureStageCollection detects hitKeys before stripping", () => {
  const idx = FINAL_SPEECH_SRC.indexOf("function stripFutureStageCollection");
  const chunk = FINAL_SPEECH_SRC.substring(idx, idx + 3000);
  assert.ok(chunk.includes("const hitKeys = []"), "hitKeys array declared");
  assert.ok(chunk.includes("hitKeys.push(patternKey)"), "hitKeys populated");
});

ok("C3: Topo strip no longer does partial replace for topo stages", () => {
  const idx = FINAL_SPEECH_SRC.indexOf("function stripFutureStageCollection");
  const chunk = FINAL_SPEECH_SRC.substring(idx, idx + 3000);
  // The replace loop should only appear AFTER the topo early return
  const topoReturnIdx = chunk.indexOf('group === "topo" && hitKeys.length > 0');
  const replaceIdx = chunk.indexOf('result = result.replace(regex, "").trim()');
  assert.ok(replaceIdx > topoReturnIdx, "Replace loop appears only after topo early return (non-topo path)");
});

// ══════════════════════════════════════════════════════════════════════════════
// Section D: FASE 2 — Synthetic strip cases: topo patterns
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section D: FASE 2 — Synthetic strip: topo returns TOPO_SAFE_MINIMUM ──");

const TOPO_STAGES = ["inicio_programa", "inicio", "inicio_decisao"];
const SYNTHETIC_CASES = [
  { key: "estado_civil", text: "Oi! Para começar, qual é o seu estado civil? Isso nos ajuda a entender." },
  { key: "regime_trabalho", text: "Olá! Você é CLT ou autônomo? Me conta pra gente seguir." },
  { key: "renda", text: "Legal! Quanto você ganha? Qual sua renda mensal? Vamos analisar." },
  { key: "composicao", text: "Ótimo! Você vai seguir sozinho ou com alguém? Pode somar renda?" },
  { key: "ctps", text: "Perfeito! Você tem CTPS assinada há 36 meses? Me diz pra continuar." },
  { key: "restricao", text: "Entendi! Você tem restrição no seu CPF? Pode falar sem problema." },
];

for (const stage of TOPO_STAGES) {
  for (const { key, text } of SYNTHETIC_CASES) {
    ok(`D: strip(${key}) em ${stage} → TOPO_SAFE_MINIMUM`, () => {
      const result = stripFutureStageCollection(text, stage);
      assert.strictEqual(result, TOPO_SAFE_MINIMUM,
        `Expected TOPO_SAFE_MINIMUM for ${key} in ${stage}, got: "${result.slice(0, 80)}"`);
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section E: FASE 2 — Synthetic: broken fragment patterns never produced
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section E: FASE 2 — No broken fragments at topo ──");

const BROKEN_INPUT_PATTERNS = [
  "Oi! Gostaria de saber qual é o seu estado civil? Isso nos ajuda bastante.",
  "Olá! Qual é o seu estado civil? E qual seu regime de trabalho? Vamos ver.",
  "Legal, gostaria de saber se você tem renda mensal? Me conta.",
  "Oi! Me conta qual é o seu estado civil? E se tem alguma restrição no seu CPF?",
  "Bom dia! Você tem carteira de trabalho assinada há 36 meses? E qual sua renda mensal?",
];

for (let i = 0; i < BROKEN_INPUT_PATTERNS.length; i++) {
  const input = BROKEN_INPUT_PATTERNS[i];
  ok(`E${i + 1}: Input com coleta proibida → sem fragmento quebrado no topo`, () => {
    const result = stripFutureStageCollection(input, "inicio_programa");
    // Must be either TOPO_SAFE_MINIMUM or unchanged (no partial strip)
    assert.ok(
      result === TOPO_SAFE_MINIMUM || result === input,
      `Must not produce broken fragment. Got: "${result.slice(0, 100)}"`
    );
    // Must never produce broken patterns
    assert.ok(!/qual é o seu\s+Isso/i.test(result), `No "qual é o seu Isso" in result`);
    assert.ok(!/gostaria de saber seu\s+Isso/i.test(result), `No "gostaria de saber seu Isso"`);
    assert.ok(!/gostaria de saber se\s+Isso/i.test(result), `No "gostaria de saber se Isso"`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Section F: FASE 2 — applyFinalSpeechContract with llmSovereign=true
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section F: FASE 2 — applyFinalSpeechContract llmSovereign topo ──");

for (const { key, text } of SYNTHETIC_CASES) {
  ok(`F: applyFinalSpeechContract(llmSovereign, ${key}) em inicio_programa → safe`, () => {
    const result = applyFinalSpeechContract(text, {
      currentStage: "inicio_programa",
      llmSovereign: true,
      messageText: "oi"
    });
    // Must not contain broken fragments
    assert.ok(!/qual é o seu\s+Isso/i.test(result), `No broken "qual é o seu Isso"`);
    // Must be either TOPO_SAFE_MINIMUM or a properly-formed reply
    const isSafe = result === TOPO_SAFE_MINIMUM || result.length >= 20;
    assert.ok(isSafe, `Result must be safe. Got: "${result.slice(0, 100)}"`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Section G: FASE 2 — Telemetry in applyFinalSpeechContract
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section G: FASE 2 — Contract telemetry fields present ──");

ok("G1: applyFinalSpeechContract has TOPO_FINAL_CONTRACT_TELEMETRY tag", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("TOPO_FINAL_CONTRACT_TELEMETRY"),
    "TOPO_FINAL_CONTRACT_TELEMETRY tag present");
});

ok("G2: applyFinalSpeechContract logs reply_before_contract", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("reply_before_contract"),
    "reply_before_contract field present");
});

ok("G3: applyFinalSpeechContract logs reply_before_strip", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("reply_before_strip"),
    "reply_before_strip field present");
});

ok("G4: applyFinalSpeechContract logs reply_after_strip", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("reply_after_strip"),
    "reply_after_strip field present");
});

ok("G5: applyFinalSpeechContract logs strip_changed", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("strip_changed"),
    "strip_changed field present");
});

ok("G6: applyFinalSpeechContract logs strip_returned_safe_minimum", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("strip_returned_safe_minimum"),
    "strip_returned_safe_minimum field present");
});

ok("G7: applyFinalSpeechContract logs llmSovereign", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("llmSovereign"),
    "llmSovereign field present");
});

ok("G8: stripFutureStageCollection has TOPO_STRIP_INVALIDATION tag", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("TOPO_STRIP_INVALIDATION"),
    "TOPO_STRIP_INVALIDATION tag present");
});

ok("G9: stripFutureStageCollection logs strip_pattern_keys_hit", () => {
  assert.ok(FINAL_SPEECH_SRC.includes("strip_pattern_keys_hit"),
    "strip_pattern_keys_hit field present");
});

// ══════════════════════════════════════════════════════════════════════════════
// Section H: Non-topo stages preserve existing strip behavior
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section H: Non-topo stages — existing strip behavior preserved ──");

ok("H1: estado_civil stage strips renda questions (non-topo behavior)", () => {
  const input = "Perfeito! Agora, qual sua renda mensal? Precisamos saber.";
  const result = stripFutureStageCollection(input, "estado_civil");
  // Should strip (bloco_3 forbids renda)
  assert.ok(!(/renda mensal/.test(result)), "renda mensal stripped for estado_civil stage");
  assert.ok(result !== TOPO_SAFE_MINIMUM, "Non-topo stage does not get TOPO_SAFE_MINIMUM");
});

ok("H2: regime_trabalho stage strips ctps questions (non-topo behavior)", () => {
  const input = "Certo! Você tem CTPS assinada há 36 meses? Me confirma.";
  const result = stripFutureStageCollection(input, "regime_trabalho");
  assert.ok(!(/CTPS/.test(result)), "CTPS stripped for regime_trabalho");
  assert.ok(result !== TOPO_SAFE_MINIMUM, "Non-topo stage does not get TOPO_SAFE_MINIMUM");
});

ok("H3: Operational stage (envio_docs) passes through unchanged", () => {
  const input = "Mande seus documentos: CTPS e comprovante de renda mensal?";
  const result = stripFutureStageCollection(input, "envio_docs");
  assert.strictEqual(result, input, "Operational stage returns input unchanged");
});

// ══════════════════════════════════════════════════════════════════════════════
// Section I: Cenários de surface — "reset + Oi", "Quem vc é?", etc.
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section I: Cenários de surface simulados ──");

ok("I1: 'reset + Oi' — clean reply without future collection passes strip", () => {
  const cleanReply = "Oi! Eu sou a Enova e posso te ajudar com o Minha Casa Minha Vida. Você já sabe como funciona ou quer que eu te explique?";
  const result = stripFutureStageCollection(cleanReply, "inicio_programa");
  assert.strictEqual(result, cleanReply, "Clean reply passes through unchanged");
});

ok("I2: 'Quem vc é?' — identity reply without collection passes strip", () => {
  const identityReply = "Eu sou a Enova, assistente virtual especialista no programa Minha Casa Minha Vida. Posso te ajudar a entender como funciona e analisar se você se encaixa. Quer saber mais?";
  const result = stripFutureStageCollection(identityReply, "inicio_programa");
  assert.strictEqual(result, identityReply, "Identity reply passes through unchanged");
});

ok("I3: 'Como funciona?' — explanation reply without collection passes strip", () => {
  const explReply = "O Minha Casa Minha Vida ajuda com subsídio e condições especiais de financiamento, conforme a renda da família. Posso analisar seu perfil se quiser. Me diz sim pra gente seguir!";
  const result = stripFutureStageCollection(explReply, "inicio_programa");
  assert.strictEqual(result, explReply, "Explanation reply passes through unchanged");
});

ok("I4: 'Não, me explica' — reply with premature estado_civil gets invalidated", () => {
  const badReply = "Claro! O programa funciona com base na renda. Mas primeiro, qual é o seu estado civil? Solteiro ou casado?";
  const result = stripFutureStageCollection(badReply, "inicio_programa");
  assert.strictEqual(result, TOPO_SAFE_MINIMUM,
    "Reply with premature estado_civil should be invalidated to TOPO_SAFE_MINIMUM");
});

ok("I5: Reply mixing explanation + renda collection → invalidated", () => {
  const badReply = "Legal! O MCMV ajuda bastante. Pra começar, quanto você ganha? Qual sua renda mensal?";
  const result = stripFutureStageCollection(badReply, "inicio_programa");
  assert.strictEqual(result, TOPO_SAFE_MINIMUM,
    "Reply with renda collection should be invalidated to TOPO_SAFE_MINIMUM");
});

// ══════════════════════════════════════════════════════════════════════════════
// Section J: COLLECTION_PATTERNS coverage verification
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section J: COLLECTION_PATTERNS coverage ──");

const REQUIRED_PATTERNS = ["estado_civil", "regime_trabalho", "renda", "composicao", "ctps", "restricao"];

for (const key of REQUIRED_PATTERNS) {
  ok(`J: COLLECTION_PATTERNS has key '${key}'`, () => {
    assert.ok(COLLECTION_PATTERNS[key], `COLLECTION_PATTERNS.${key} exists`);
    assert.ok(COLLECTION_PATTERNS[key] instanceof RegExp, `COLLECTION_PATTERNS.${key} is RegExp`);
  });
}

ok("J7: STAGE_FORBIDDEN_PATTERNS.topo forbids all 6 required patterns", () => {
  const topoForbidden = STAGE_FORBIDDEN_PATTERNS.topo;
  assert.ok(topoForbidden, "topo forbidden list exists");
  for (const key of REQUIRED_PATTERNS) {
    assert.ok(topoForbidden.includes(key), `topo forbids ${key}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Section K: TOPO_SAFE_MINIMUM contract
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section K: TOPO_SAFE_MINIMUM contract ──");

ok("K1: TOPO_SAFE_MINIMUM contains 'Enova'", () => {
  assert.ok(/enova/i.test(TOPO_SAFE_MINIMUM), "Contains Enova");
});

ok("K2: TOPO_SAFE_MINIMUM contains 'Minha Casa Minha Vida'", () => {
  assert.ok(/Minha Casa Minha Vida/.test(TOPO_SAFE_MINIMUM), "Contains full program name");
});

ok("K3: TOPO_SAFE_MINIMUM ends with question", () => {
  assert.ok(/\?$/.test(TOPO_SAFE_MINIMUM.trim()), "Ends with ?");
});

ok("K4: TOPO_SAFE_MINIMUM has parseável choice (funciona/explique)", () => {
  assert.ok(/funciona/.test(TOPO_SAFE_MINIMUM), "Has 'funciona'");
  assert.ok(/explique/.test(TOPO_SAFE_MINIMUM), "Has 'explique'");
});

// ══════════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════════
console.log(`\n════════════════════════════════════════════`);
console.log(`  Total: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
console.log(`════════════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
