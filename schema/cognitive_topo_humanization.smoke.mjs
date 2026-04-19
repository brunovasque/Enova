/**
 * cognitive_topo_humanization.smoke.mjs
 *
 * Smoke tests for topo surface humanization.
 * Validates:
 *  1. No bureaucratic/template phrases in topo speech
 *  2. No repeated greeting patterns
 *  3. Mechanical flow preserved (stage order intact)
 *  4. Style guardrails present in system prompt builder
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_SRC = readFileSync(resolve(ROOT, "Enova worker.js"), "utf-8");
const COGNITIVE_CONTRACT_SRC = readFileSync(resolve(ROOT, "cognitive/src/cognitive-contract.js"), "utf-8");
const RUN_COGNITIVE_SRC = readFileSync(resolve(ROOT, "cognitive/src/run-cognitive.js"), "utf-8");

// Dynamic import for contract module
const cc = await import(resolve(ROOT, "cognitive/src/cognitive-contract.js"));
const { buildStageContract, getStageGoal } = cc;

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
// Section A: No bureaucratic phrases in topo fallback speech
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section A: No bureaucratic phrases in topo fallback speech ──");

const BUREAUCRATIC_PATTERNS = [
  /Obrigado por compartilhar/i,
  /Para continuarmos, preciso/i,
  /Pode me informar/i,
  /Agora, para continuar/i,
  /Para continuar, preciso confirmar/i,
  /Pode me dizer seu nome completo\? 😊/,
];

const TOPO_STAGES = ["inicio", "inicio_decisao", "inicio_programa", "inicio_nome", "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"];

// Check STAGE_CONTRACT_METADATA prompts
for (const stage of TOPO_STAGES) {
  ok(`${stage} contract has no bureaucratic canonical_prompt`, () => {
    const contract = buildStageContract({ stage });
    for (const pat of BUREAUCRATIC_PATTERNS) {
      assert.ok(!pat.test(contract.canonical_prompt), `canonical_prompt matches bureaucratic pattern: ${pat}`);
    }
  });

  ok(`${stage} contract has no bureaucratic return_to_stage_prompt`, () => {
    const contract = buildStageContract({ stage });
    for (const pat of BUREAUCRATIC_PATTERNS) {
      assert.ok(!pat.test(contract.return_to_stage_prompt), `return_to_stage_prompt matches bureaucratic pattern: ${pat}`);
    }
  });

  ok(`${stage} contract has no bureaucratic fallback_prompt`, () => {
    const contract = buildStageContract({ stage });
    for (const pat of BUREAUCRATIC_PATTERNS) {
      assert.ok(!pat.test(contract.fallback_prompt), `fallback_prompt matches bureaucratic pattern: ${pat}`);
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Section B: No bureaucratic phrases in _MINIMAL_FALLBACK_SPEECH_MAP (worker)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section B: No bureaucratic phrases in worker fallback map ──");

for (const pat of BUREAUCRATIC_PATTERNS) {
  ok(`_MINIMAL_FALLBACK_SPEECH_MAP topo entries free of: ${pat.source}`, () => {
    // Extract topo entries from the map (between "// ── topo ──" and the next non-topo entry)
    const topoSection = WORKER_SRC.match(/\/\/ ── topo ──[\s\S]*?\["inicio_rnm_validade"[^\]]*\]/);
    assert.ok(topoSection, "Could not locate topo section in _MINIMAL_FALLBACK_SPEECH_MAP");
    assert.ok(!pat.test(topoSection[0]), `topo fallback map contains bureaucratic phrase: ${pat}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Section C: No bureaucratic phrases in _TOPO_BUCKET_STATIC_REPLIES
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section C: No bureaucratic phrases in bucket static replies ──");

ok("_TOPO_BUCKET_STATIC_REPLIES free of bureaucratic patterns", () => {
  const bucketSection = WORKER_SRC.match(/_TOPO_BUCKET_STATIC_REPLIES = Object\.freeze\(\{[\s\S]*?\}\)/);
  assert.ok(bucketSection, "Could not locate _TOPO_BUCKET_STATIC_REPLIES");
  for (const pat of BUREAUCRATIC_PATTERNS) {
    assert.ok(!pat.test(bucketSection[0]), `bucket static replies contains: ${pat}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Section D: No repeated greeting in topo (saudação repetida bloqueada)
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section D: No repeated greeting in collection stages ──");

const COLLECTION_STAGES = ["inicio_nome", "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"];
const GREETING_PATTERN = /^Oi!?\s/i;

for (const stage of COLLECTION_STAGES) {
  ok(`${stage} canonical_prompt does not start with greeting`, () => {
    const contract = buildStageContract({ stage });
    assert.ok(!GREETING_PATTERN.test(contract.canonical_prompt), `canonical_prompt starts with greeting: ${contract.canonical_prompt}`);
  });

  ok(`${stage} fallback_prompt does not start with greeting`, () => {
    const contract = buildStageContract({ stage });
    assert.ok(!GREETING_PATTERN.test(contract.fallback_prompt), `fallback_prompt starts with greeting: ${contract.fallback_prompt}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Section E: Mechanical flow preserved — contract structure intact
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section E: Mechanical flow preserved ──");

ok("inicio contract has expected_slot=null", () => {
  const c = buildStageContract({ stage: "inicio" });
  assert.equal(c.expected_slot, null);
});

ok("inicio_nome contract has expected_slot=nome", () => {
  const c = buildStageContract({ stage: "inicio_nome" });
  assert.equal(c.expected_slot, "nome");
});

ok("inicio_nacionalidade contract has expected_slot=nacionalidade", () => {
  const c = buildStageContract({ stage: "inicio_nacionalidade" });
  assert.equal(c.expected_slot, "nacionalidade");
});

ok("inicio_rnm contract has expected_slot=rnm_status", () => {
  const c = buildStageContract({ stage: "inicio_rnm" });
  assert.equal(c.expected_slot, "rnm_status");
});

ok("inicio_rnm_validade contract has expected_slot=rnm_validade", () => {
  const c = buildStageContract({ stage: "inicio_rnm_validade" });
  assert.equal(c.expected_slot, "rnm_validade");
});

ok("forbidden_topics preserved for inicio_nome", () => {
  const c = buildStageContract({ stage: "inicio_nome" });
  assert.ok(c.forbidden_topics_now.includes("coleta_estado_civil"));
  assert.ok(c.forbidden_topics_now.includes("coleta_renda"));
});

ok("forbidden_topics preserved for inicio_nacionalidade", () => {
  const c = buildStageContract({ stage: "inicio_nacionalidade" });
  assert.ok(c.forbidden_topics_now.includes("coleta_renda"));
  assert.ok(c.forbidden_topics_now.includes("coleta_documentos"));
});

// ══════════════════════════════════════════════════════════════════════════════
// Section F: Style guardrails present in system prompt
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section F: Style guardrails in system prompt ──");

ok("buildOpenAISystemPrompt contains anti-template style rule", () => {
  assert.ok(
    RUN_COGNITIVE_SRC.includes("ESTILO OBRIGATÓRIO NO TOPO"),
    "Missing topo style guardrail in buildOpenAISystemPrompt"
  );
});

ok("buildOpenAISystemPrompt prohibits 'Obrigado por compartilhar'", () => {
  assert.ok(
    RUN_COGNITIVE_SRC.includes("Obrigado por compartilhar"),
    "Missing anti-template prohibition in system prompt"
  );
});

ok("buildOpenAISystemPrompt prohibits 'Para continuarmos, preciso confirmar'", () => {
  assert.ok(
    RUN_COGNITIVE_SRC.includes("Para continuarmos, preciso confirmar"),
    "Missing anti-template prohibition in system prompt"
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// Section G: Stage micro_rules contain style guidance
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section G: Stage micro_rules have style guidance ──");

for (const stage of TOPO_STAGES) {
  ok(`${stage} micro_rules contain ESTILO guidance`, () => {
    const c = buildStageContract({ stage });
    const hasStyle = c.stage_micro_rules.some(r => r.includes("ESTILO"));
    assert.ok(hasStyle, `${stage} micro_rules missing ESTILO guidance`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Section H: No bureaucratic phrases in run-cognitive guidance
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n── Section H: No bureaucratic phrases in run-cognitive guidance ──");

ok("run-cognitive topo guidance (inicio→inicio_rnm_validade) has no 'O sistema precisa confirmar'", () => {
  // Extract the topo-scoped section from buildBloco2Guidance (between "if (stage === \"inicio\")" and after "inicio_rnm_validade")
  const startIdx = RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio")');
  const endIdx = RUN_COGNITIVE_SRC.indexOf('return null;', RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio_rnm_validade")'));
  assert.ok(startIdx > 0 && endIdx > startIdx, "Could not locate topo section in run-cognitive");
  const topoSection = RUN_COGNITIVE_SRC.slice(startIdx, endIdx + 100);
  assert.ok(!topoSection.includes("O sistema precisa confirmar"), "Found bureaucratic system reference in topo guidance");
});

ok("run-cognitive topo guidance has no 'O sistema precisa verificar'", () => {
  const startIdx = RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio")');
  const endIdx = RUN_COGNITIVE_SRC.indexOf('return null;', RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio_rnm_validade")'));
  const topoSection = RUN_COGNITIVE_SRC.slice(startIdx, endIdx + 100);
  assert.ok(!topoSection.includes("O sistema precisa verificar"), "Found bureaucratic system reference in topo guidance");
});

ok("run-cognitive topo guidance has no 'O sistema verifica'", () => {
  const startIdx = RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio")');
  const endIdx = RUN_COGNITIVE_SRC.indexOf('return null;', RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio_rnm_validade")'));
  const topoSection = RUN_COGNITIVE_SRC.slice(startIdx, endIdx + 100);
  assert.ok(!topoSection.includes("O sistema verifica"), "Found bureaucratic system reference in topo guidance");
});

ok("run-cognitive topo guidance has no verbose 'Você possui *RNM*? Responda'", () => {
  const startIdx = RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio")');
  const endIdx = RUN_COGNITIVE_SRC.indexOf('return null;', RUN_COGNITIVE_SRC.indexOf('if (stage === "inicio_rnm_validade")'));
  const topoSection = RUN_COGNITIVE_SRC.slice(startIdx, endIdx + 100);
  assert.ok(!topoSection.includes("Você possui *RNM*? Responda"), "Found verbose RNM prompt in topo guidance");
});

// ══════════════════════════════════════════════════════════════════════════════
// RESULT
// ══════════════════════════════════════════════════════════════════════════════
console.log(`\n═══ TOPO HUMANIZATION SMOKE: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) process.exit(1);
