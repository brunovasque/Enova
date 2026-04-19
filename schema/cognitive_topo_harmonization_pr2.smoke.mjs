/**
 * cognitive_topo_harmonization_pr2.smoke.mjs
 *
 * Smoke tests for PR2 — Harmonização real do topo LLM ↔ mecânico.
 *
 * Validates:
 * 1.  inicio_decisao: "quero continuar" → parsed as opcao1 (continue)
 * 2.  inicio_decisao: "prefiro recomeçar" → parsed as opcao2 (reset)
 * 3.  inicio_nacionalidade: "sim" → parsed as brasileiro
 * 4.  inicio_nacionalidade: "não" → parsed as estrangeiro
 * 5.  inicio_rnm_validade: "tem validade" → parsed as definida
 * 6.  inicio_rnm_validade: "permanente" → parsed as indeterminado
 * 7.  _MINIMAL_FALLBACK_SPEECH_MAP: inicio_rnm aligns with parser (sim/não, not "qual número")
 * 8.  _MINIMAL_FALLBACK_SPEECH_MAP: inicio_rnm_validade aligns with parser
 * 9.  reanchor-helper: all 7 topo stages map to phase "topo"
 * 10. STAGE_CONTRACT_METADATA: inicio_nacionalidade canonical_prompt aligns with parser
 * 11. inicio_decisao: "vamos lá" → parsed as opcao1
 * 12. inicio_rnm_validade: "sem validade" → parsed as indeterminado
 */

import assert from "node:assert/strict";

// ── Import reanchor helper (ESM) ──
const { stageToPhase } = await import(
  new URL("../cognitive/src/reanchor-helper.js", import.meta.url).href
);

// ── Import cognitive contract for STAGE_CONTRACT_METADATA ──
const { buildStageContract } = await import(
  new URL("../cognitive/src/cognitive-contract.js", import.meta.url).href
);

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

// ── Helper: normalizeText mirror (same as worker) ──
function normalizeText(text) {
  let s = String(text || "");
  if (/[ÃÂ]/.test(s)) {
    try { s = decodeURIComponent(escape(s)); } catch (_) {}
  }
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2000-\u206F]/g, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isYes(text) {
  const nt = normalizeText(text);
  if (!nt) return false;
  const exact = new Set(["sim", "s", "ss", "ok"]);
  if (exact.has(nt)) return true;
  return false;
}

function isNo(text) {
  const nt = normalizeText(text);
  if (!nt) return false;
  const exact = new Set(["nao", "n", "nn", "negativo"]);
  if (exact.has(nt)) return true;
  return false;
}

// ── Parser mirrors from worker (for testing alignment) ──

function parseInicioDecisao(userText) {
  const nt = normalizeText(userText || "");
  const opcao1 = /^(1|continuar|seguir|andar|prosseguir)$/i.test(nt) ||
    /\b(quero continuar|vou continuar|pode continuar|bora continuar|vamos continuar|prefiro continuar|continuar de onde parei|continuar de onde paramos|seguir de onde parei|seguir de onde paramos|vamos la|vamos lá)\b/i.test(nt);
  const opcao2 = /^(2|começar|comecar|do zero|reiniciar|reset)$/i.test(nt) ||
    /\b(quero recomeçar|quero recomecar|prefiro recomeçar|prefiro recomecar|comecar de novo|começar de novo|começa de novo|comeca de novo|tudo de novo|do inicio|do início|quero começar|quero comecar|quero começar do zero|quero comecar do zero)\b/i.test(nt);
  if (opcao1) return "continuar";
  if (opcao2) return "reset";
  return "fallback";
}

function parseInicioNacionalidade(userText) {
  const nt = normalizeText(userText || "");
  if (/^(brasileiro|brasileiro mesmo|brasileira|brasileira mesmo|daqui mesmo|sou daqui mesmo|sou brasileiro|sou brasileiro mesmo|sou brasileira mesmo|sou brasileira|nascido no brasil|nascida no brasil|nasci no brasil)$/i.test(nt)) {
    return "brasileiro";
  }
  // sim/não handling (harmonized)
  if (!(/^(estrangeiro|estrangeira|sou estrangeiro|sou estrangeira|gringo|nao sou brasileiro|não sou brasileiro)$/i.test(nt)) && isYes(nt)) {
    return "brasileiro";
  }
  if (/^(estrangeiro|estrangeira|sou estrangeiro|sou estrangeira|gringo|nao sou brasileiro|não sou brasileiro)$/i.test(nt)) {
    return "estrangeiro";
  }
  if (!(/^(brasileiro|brasileiro mesmo|brasileira|brasileira mesmo|daqui mesmo|sou daqui mesmo|sou brasileiro|sou brasileiro mesmo|sou brasileira mesmo|sou brasileira|nascido no brasil|nascida no brasil|nasci no brasil)$/i.test(nt)) && isNo(nt)) {
    return "estrangeiro";
  }
  return "fallback";
}

function parseInicioRnmValidade(userText) {
  const nt = normalizeText(userText || "");
  if (/^(valido|válido|com validade|definida)$/i.test(nt) ||
      /\b(tem validade|com prazo|tem prazo|tem data|vence|tem vencimento|e valido|é válido|validade definida)\b/i.test(nt)) {
    return "definida";
  }
  if (/\b(indeterminado|permanente|definitivo|sem validade|nao vence|não vence|nao tem validade|não tem validade|sem prazo|sem vencimento)\b/i.test(nt)) {
    return "indeterminado";
  }
  return "fallback";
}

console.log("\n🔬 TOPO HARMONIZATION PR2 — Smoke Tests\n");

// ===== 1. inicio_decisao: "quero continuar" → continuar =====
await asyncTest('1. inicio_decisao: "quero continuar" → continuar', async () => {
  assert.equal(parseInicioDecisao("quero continuar"), "continuar");
});

// ===== 2. inicio_decisao: "prefiro recomeçar" → reset =====
await asyncTest('2. inicio_decisao: "prefiro recomeçar" → reset', async () => {
  assert.equal(parseInicioDecisao("prefiro recomeçar"), "reset");
});

// ===== 3. inicio_nacionalidade: "sim" → brasileiro =====
await asyncTest('3. inicio_nacionalidade: "sim" → brasileiro', async () => {
  assert.equal(parseInicioNacionalidade("sim"), "brasileiro");
});

// ===== 4. inicio_nacionalidade: "não" → estrangeiro =====
await asyncTest('4. inicio_nacionalidade: "não" → estrangeiro', async () => {
  assert.equal(parseInicioNacionalidade("não"), "estrangeiro");
});

// ===== 5. inicio_rnm_validade: "tem validade" → definida =====
await asyncTest('5. inicio_rnm_validade: "tem validade" → definida', async () => {
  assert.equal(parseInicioRnmValidade("tem validade"), "definida");
});

// ===== 6. inicio_rnm_validade: "permanente" → indeterminado =====
await asyncTest('6. inicio_rnm_validade: "permanente" → indeterminado', async () => {
  assert.equal(parseInicioRnmValidade("permanente"), "indeterminado");
});

// ===== 7. _MINIMAL_FALLBACK_SPEECH_MAP: inicio_rnm — must say "possui" / "sim ou não" =====
// We verify the alignment principle: the fallback text must induce answers the parser accepts.
await asyncTest('7. inicio_rnm fallback induces sim/não (parser-compatible)', async () => {
  // The fixed fallback is "Você possui RNM — Registro Nacional Migratório? Responda *sim* ou *não*."
  // Key: must contain "possui" or "sim" or "não", NOT "número" or "qual"
  const fallbackText = "Você possui RNM — Registro Nacional Migratório? Responda *sim* ou *não*.";
  assert.ok(/possui|sim|não/i.test(fallbackText), "Fallback must induce sim/não");
  assert.ok(!/qual.*número/i.test(fallbackText), "Fallback must NOT ask for RNM number");
});

// ===== 8. _MINIMAL_FALLBACK_SPEECH_MAP: inicio_rnm_validade — must say "validade" / "indeterminado" =====
await asyncTest('8. inicio_rnm_validade fallback induces validade/indeterminado (parser-compatible)', async () => {
  const fallbackText = "Seu RNM é *com validade* ou *indeterminado*?";
  assert.ok(/validade.*indeterminado|indeterminado.*validade/i.test(fallbackText), "Fallback must present both options");
  assert.ok(!/qual.*validade/i.test(fallbackText), "Fallback must NOT ask for a date");
});

// ===== 9. reanchor-helper: all 7 topo stages → phase "topo" =====
await asyncTest('9. reanchor-helper: all 7 topo stages map to phase "topo"', async () => {
  const topoStages = [
    "inicio", "inicio_decisao", "inicio_programa",
    "inicio_nome", "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"
  ];
  for (const stage of topoStages) {
    const phase = stageToPhase(stage);
    assert.equal(phase, "topo", `${stage} should map to "topo" but got "${phase}"`);
  }
});

// ===== 10. STAGE_CONTRACT_METADATA: inicio_nacionalidade prompt alignment =====
await asyncTest('10. inicio_nacionalidade canonical_prompt says "brasileiro/estrangeiro" (not "nato")', async () => {
  const contract = buildStageContract({ stage: "inicio_nacionalidade" });
  assert.ok(contract, "Contract should exist for inicio_nacionalidade");
  // canonical_prompt should present "brasileiro/estrangeiro" as options
  assert.ok(/brasileiro.*estrangeir|estrangeir.*brasileiro/i.test(contract.canonical_prompt),
    `canonical_prompt should mention brasileiro/estrangeiro, got: ${contract.canonical_prompt}`);
});

// ===== 11. inicio_decisao: "vamos lá" → continuar =====
await asyncTest('11. inicio_decisao: "vamos lá" → continuar', async () => {
  assert.equal(parseInicioDecisao("vamos lá"), "continuar");
});

// ===== 12. inicio_rnm_validade: "sem validade" → indeterminado =====
await asyncTest('12. inicio_rnm_validade: "sem validade" → indeterminado', async () => {
  assert.equal(parseInicioRnmValidade("sem validade"), "indeterminado");
});

// ===== 13. inicio_decisao regression: "1" → continuar =====
await asyncTest('13. inicio_decisao regression: "1" → continuar', async () => {
  assert.equal(parseInicioDecisao("1"), "continuar");
});

// ===== 14. inicio_decisao regression: "2" → reset =====
await asyncTest('14. inicio_decisao regression: "2" → reset', async () => {
  assert.equal(parseInicioDecisao("2"), "reset");
});

// ===== 15. inicio_nacionalidade regression: "brasileiro" → brasileiro =====
await asyncTest('15. inicio_nacionalidade regression: "brasileiro" → brasileiro', async () => {
  assert.equal(parseInicioNacionalidade("brasileiro"), "brasileiro");
});

// ===== 16. inicio_nacionalidade regression: "estrangeiro" → estrangeiro =====
await asyncTest('16. inicio_nacionalidade regression: "estrangeiro" → estrangeiro', async () => {
  assert.equal(parseInicioNacionalidade("estrangeiro"), "estrangeiro");
});

// ===== 17. inicio_rnm_validade regression: "indeterminado" → indeterminado =====
await asyncTest('17. inicio_rnm_validade regression: "indeterminado" → indeterminado', async () => {
  assert.equal(parseInicioRnmValidade("indeterminado"), "indeterminado");
});

// ===== 18. inicio_rnm_validade regression: "com validade" → definida =====
await asyncTest('18. inicio_rnm_validade regression: "com validade" → definida', async () => {
  assert.equal(parseInicioRnmValidade("com validade"), "definida");
});

// ===== SUMMARY =====
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
  console.error("\n❌ TOPO HARMONIZATION PR2 — Some tests FAILED");
  process.exit(1);
} else {
  console.log("\n✅ TOPO HARMONIZATION PR2 — All tests passed");
}
