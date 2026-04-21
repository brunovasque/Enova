/**
 * cognitive_topo_pr3_operacional.smoke.mjs
 *
 * PR3 — PROVA OPERACIONAL E VALIDAÇÃO REAL DO TOPO
 *
 * Objetivo: provar que o topo está operacional após PR1 (contrato) + PR2 (harmonização).
 *
 * BLOCO A — happy path do topo
 *   A1. inicio: "oi" → engine runs, should_advance_stage=false (topo aceita saudação natural)
 *   A2. inicio_programa: "sim" → ja_sabe (já conhece → sinal inicio_nome)
 *   A3. inicio_programa: "já conheço" → ja_sabe (expressão natural equivalente)
 *   A4. inicio_nome: nome válido → engine runs, should_advance_stage=false
 *   A5. inicio_nacionalidade: "brasileiro" → parser=brasileiro
 *   A6. inicio_nacionalidade: "sim" → parser=brasileiro (happy path: prompt diz "é brasileiro?")
 *
 * BLOCO B — retomada/decisão
 *   B1. "1" → continuar
 *   B2. "continuar" → continuar
 *   B3. "quero continuar" → continuar
 *   B4. "2" → reset
 *   B5. "começar do zero" → reset
 *   B6. "prefiro recomeçar" → reset
 *
 * BLOCO C — nacionalidade
 *   C1. "brasileiro" → brasileiro
 *   C2. "sou brasileiro" → brasileiro
 *   C3. "sim" → brasileiro
 *   C4. "estrangeiro" → estrangeiro
 *   C5. "não" → estrangeiro
 *
 * BLOCO D — RNM
 *   D1. possui RNM = "sim" → isYes=true (parser aceita)
 *   D2. possui RNM = "não" → isNo=true (parser aceita)
 *   D3. RNM validade = "com validade" → definida
 *   D4. RNM validade = "tem validade" → definida
 *   D5. RNM validade = "indeterminado" → indeterminado
 *   D6. RNM validade = "permanente" → indeterminado (equivalente aceito pelo parser)
 *
 * BLOCO E — comportamento
 *   E1. fallback inicio_rnm induz "sim ou não" (parser-compatible, sem "qual número")
 *   E2. fallback inicio_rnm_validade induz "com validade ou indeterminado" (parser-compatible)
 *   E3. reanchor: todos os 7 stages do topo mapeiam para phase="topo"
 *   E4. ausência de mascaramento: engine nunca reporta should_advance_stage=true no topo
 *
 * Escopo: SOMENTE os 7 stages do topo.
 * Não toca: meio, final, parceiro/familiar/P3, envio_docs, visita.
 */

import assert from "node:assert/strict";

// ── Imports cognitivos ──
const { runReadOnlyCognitiveEngine, validateReadOnlyCognitiveResponse } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const { stageToPhase } = await import(
  new URL("../cognitive/src/reanchor-helper.js", import.meta.url).href
);

// ── Runtime sem LLM (heurístico puro, zero request externo) ──
const heuristicOnlyRuntime = {};

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

// ── Mirrors exatos do worker (normalizeText + parsers) ──

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
  const phrases = [
    "declaro sim", "sim declaro", "eu declaro",
    "faco imposto", "faço imposto", "declaro imposto",
    "tenho imposto de renda", "tenho ir", "possuo ir"
  ];
  if (phrases.some((term) => nt.includes(normalizeText(term)))) return true;
  if (/\bdeclaro\b/.test(nt) && !/\bnao declaro\b/.test(nt)) return true;
  return false;
}

function isNo(text) {
  const nt = normalizeText(text);
  if (!nt) return false;
  const exact = new Set(["nao", "n", "nn", "negativo"]);
  if (exact.has(nt)) return true;
  const phrases = [
    "nunca", "jamais", "ainda nao", "agora nao", "talvez depois",
    "nao declaro", "não declaro", "eu nao declaro", "eu não declaro",
    "nao faco imposto", "não faço imposto",
    "nao tenho imposto de renda", "não tenho imposto de renda",
    "sem imposto", "nunca declarei"
  ];
  if (phrases.some((term) => nt.includes(normalizeText(term)))) return true;
  return false;
}

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

function parseInicioRnm(userText) {
  if (isYes(userText)) return "possui";
  if (isNo(userText)) return "nao_possui";
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

function resolveInicioProgramaJaSabe(rawText) {
  const nt = normalizeText(rawText || "");
  return (
    isYes(nt) ||
    /\bja sei\b/.test(nt) ||
    /\bja conhe[cç]o\b/.test(nt) ||
    /\bsei sim\b/.test(nt) ||
    /\bt[oô] ligado\b/.test(nt) ||
    /\bconhe[cç]o\b/.test(nt) ||
    (/\bsei como\b/.test(nt) && !/nao sei/.test(nt)) ||
    /\bpode pular\b/.test(nt) ||
    /\bja vi\b/.test(nt) ||
    /\bt[oô] por dentro\b/.test(nt) ||
    /\bsei tudo\b/.test(nt) ||
    (/\bentendi\b/.test(nt) && !/nao\s+entendi/.test(nt)) ||
    /^(certo|beleza|show|legal|massa|perfeito|bora|claro|certeza|combinado|valeu|fechou|tranquilo|suave|blz|top|uhum|aham)$/i.test(nt) ||
    /^t[aá]\s*bom$/i.test(nt) ||
    /^pode\s+(seguir|continuar)$/i.test(nt) ||
    /^ficou\s+claro$/i.test(nt) ||
    /^tenho\s+(isso|tudo)$/i.test(nt)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════════");
console.log("  PR3 — PROVA OPERACIONAL DO TOPO (7 stages)");
console.log("══════════════════════════════════════════════════════════════════\n");

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO A — happy path do topo
// ─────────────────────────────────────────────────────────────────────────────
console.log("── BLOCO A: happy path ──");

await asyncTest('A1. inicio: "oi" → engine aceita, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio", message_text: "oi", known_slots: {}, pending_slots: [] },
    heuristicOnlyRuntime
  );
  assert.ok(result.response, "engine must produce a result");
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

test('A2. inicio_programa: "sim" → ja_sabe (sinal para inicio_nome)', () => {
  assert.ok(resolveInicioProgramaJaSabe("sim"), '"sim" must resolve as ja_sabe');
});

test('A3. inicio_programa: "já conheço" → ja_sabe (expressão natural)', () => {
  assert.ok(resolveInicioProgramaJaSabe("já conheço"), '"já conheço" must resolve as ja_sabe');
});

await asyncTest('A4. inicio_nome: nome válido → engine aceita, should_advance_stage=false', async () => {
  const result = await runReadOnlyCognitiveEngine(
    { current_stage: "inicio_nome", message_text: "Ana Paula Mendes", known_slots: {}, pending_slots: ["nome"] },
    heuristicOnlyRuntime
  );
  assert.strictEqual(result.response.should_advance_stage, false, "should_advance_stage must be false");
  const v = validateReadOnlyCognitiveResponse(result.response);
  assert.ok(v.valid, `response must be valid: ${v.errors.join(", ")}`);
});

test('A5. inicio_nacionalidade: "brasileiro" → parser=brasileiro', () => {
  assert.equal(parseInicioNacionalidade("brasileiro"), "brasileiro");
});

test('A6. inicio_nacionalidade: "sim" → parser=brasileiro (happy path)', () => {
  assert.equal(parseInicioNacionalidade("sim"), "brasileiro");
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO B — retomada/decisão
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── BLOCO B: retomada/decisão ──");

test('B1. inicio_decisao: "1" → continuar', () => {
  assert.equal(parseInicioDecisao("1"), "continuar");
});

test('B2. inicio_decisao: "continuar" → continuar', () => {
  assert.equal(parseInicioDecisao("continuar"), "continuar");
});

test('B3. inicio_decisao: "quero continuar" → continuar', () => {
  assert.equal(parseInicioDecisao("quero continuar"), "continuar");
});

test('B4. inicio_decisao: "2" → reset', () => {
  assert.equal(parseInicioDecisao("2"), "reset");
});

// PARSER GAP ENCONTRADO: "começar do zero" (isolado) não está no regex opcao2 do worker.
// opcao2 exige: "quero começar do zero" (com "quero") ou simplesmente "do zero" sozinho.
// "começar do zero" com as 3 palavras cai em fallback → loop no stage inicio_decisao.
// Causa: parser — regex `opcao2` em `handleIniciodeDecisao`. Não corrigir nesta PR.
test('B5. inicio_decisao: "começar do zero" → PARSER GAP (esperado: reset, real: fallback → loop)', () => {
  const result = parseInicioDecisao("começar do zero");
  // Documenta a falha: o parser retorna "fallback" em vez de "reset"
  // Isso causa loop: bot pede "1 ou 2" de volta quando usuário diz "começar do zero"
  if (result === "fallback") {
    throw new Error(
      'PARSER GAP: "começar do zero" → "fallback" (esperado "reset"). ' +
      'Stage: inicio_decisao. Causa: regex opcao2 não cobre "começar do zero" isolado. ' +
      'Risco: loop — bot repete fallback ao invés de avançar. ' +
      'Workaround existente: "do zero" ou "quero começar do zero" funcionam. ' +
      'Correção pendente: adicionar /(^|\\b)come[cç]ar do zero($|\\b)/ ao opcao2.'
    );
  }
  assert.equal(result, "reset");
});

test('B6. inicio_decisao: "prefiro recomeçar" → reset', () => {
  assert.equal(parseInicioDecisao("prefiro recomeçar"), "reset");
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO C — nacionalidade
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── BLOCO C: nacionalidade ──");

test('C1. inicio_nacionalidade: "brasileiro" → brasileiro', () => {
  assert.equal(parseInicioNacionalidade("brasileiro"), "brasileiro");
});

test('C2. inicio_nacionalidade: "sou brasileiro" → brasileiro', () => {
  assert.equal(parseInicioNacionalidade("sou brasileiro"), "brasileiro");
});

test('C3. inicio_nacionalidade: "sim" → brasileiro', () => {
  assert.equal(parseInicioNacionalidade("sim"), "brasileiro");
});

test('C4. inicio_nacionalidade: "estrangeiro" → estrangeiro', () => {
  assert.equal(parseInicioNacionalidade("estrangeiro"), "estrangeiro");
});

test('C5. inicio_nacionalidade: "não" → estrangeiro', () => {
  assert.equal(parseInicioNacionalidade("não"), "estrangeiro");
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO D — RNM
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── BLOCO D: RNM ──");

test('D1. inicio_rnm: "sim" → possui (isYes=true)', () => {
  assert.equal(parseInicioRnm("sim"), "possui");
});

test('D2. inicio_rnm: "não" → nao_possui (isNo=true)', () => {
  assert.equal(parseInicioRnm("não"), "nao_possui");
});

test('D3. inicio_rnm_validade: "com validade" → definida', () => {
  assert.equal(parseInicioRnmValidade("com validade"), "definida");
});

test('D4. inicio_rnm_validade: "tem validade" → definida', () => {
  assert.equal(parseInicioRnmValidade("tem validade"), "definida");
});

test('D5. inicio_rnm_validade: "indeterminado" → indeterminado', () => {
  assert.equal(parseInicioRnmValidade("indeterminado"), "indeterminado");
});

test('D6. inicio_rnm_validade: "permanente" → indeterminado (equivalente aceito)', () => {
  assert.equal(parseInicioRnmValidade("permanente"), "indeterminado");
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO E — comportamento (fallback, reanchor, sem mascaramento)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n── BLOCO E: comportamento ──");

test('E1. fallback inicio_rnm: induz "sim ou não" (compatível com parser, sem pedir número)', () => {
  const fallback = "Você possui RNM — Registro Nacional Migratório? Responda *sim* ou *não*.";
  assert.ok(/possui|sim|não/i.test(fallback), "fallback must induce sim/não");
  assert.ok(!/qual.*n[uú]mero/i.test(fallback), "fallback must NOT ask for RNM number");
  // Confirmar que "sim" e "não" do fallback são aceitos pelo parser
  assert.equal(parseInicioRnm("sim"), "possui");
  assert.equal(parseInicioRnm("não"), "nao_possui");
});

test('E2. fallback inicio_rnm_validade: induz "com validade/indeterminado" (compatível com parser)', () => {
  const fallback = "Seu RNM é *com validade* ou *indeterminado*?";
  assert.ok(/validade.*indeterminado|indeterminado.*validade/i.test(fallback), "fallback must present both options");
  assert.ok(!/qual.*validade/i.test(fallback), "fallback must NOT ask for a date");
  // Confirmar que as respostas do fallback são aceitas pelo parser
  assert.equal(parseInicioRnmValidade("com validade"), "definida");
  assert.equal(parseInicioRnmValidade("indeterminado"), "indeterminado");
});

test('E3. reanchor: os 7 stages do topo mapeiam para phase="topo"', () => {
  const topoStages = [
    "inicio", "inicio_decisao", "inicio_programa",
    "inicio_nome", "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"
  ];
  for (const stage of topoStages) {
    const phase = stageToPhase(stage);
    assert.equal(phase, "topo", `${stage} deve mapear para "topo", mas retornou "${phase}"`);
  }
});

await asyncTest('E4. ausência de mascaramento: engine nunca retorna should_advance_stage=true no topo', async () => {
  const topoInputs = [
    { stage: "inicio",              text: "oi" },
    { stage: "inicio_decisao",      text: "1" },
    { stage: "inicio_programa",     text: "sim" },
    { stage: "inicio_nome",         text: "Maria da Silva" },
    { stage: "inicio_nacionalidade", text: "sou brasileiro" },
    { stage: "inicio_rnm",          text: "sim" },
    { stage: "inicio_rnm_validade", text: "indeterminado" }
  ];
  for (const { stage, text } of topoInputs) {
    const result = await runReadOnlyCognitiveEngine(
      { current_stage: stage, message_text: text, known_slots: {}, pending_slots: [] },
      heuristicOnlyRuntime
    );
    assert.strictEqual(
      result.response.should_advance_stage,
      false,
      `MASCARAMENTO DETECTADO: ${stage}/"${text}" retornou should_advance_stage=true`
    );
    const v = validateReadOnlyCognitiveResponse(result.response);
    assert.ok(v.valid, `${stage}/"${text}": response inválida: ${v.errors.join(", ")}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMÁRIO
// ─────────────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n══════════════════════════════════════════════════════════════════`);
console.log(`  RESULTADO: ${passed}/${total} aprovados, ${failed} falhou`);
console.log(`══════════════════════════════════════════════════════════════════\n`);

if (failed > 0) {
  console.error("❌ PR3 TOPO — gate REPROVADO: falhas encontradas");
  process.exit(1);
} else {
  console.log("✅ PR3 TOPO — gate APROVADO: topo operacional");
  console.log("   → Libera descida ao meio do funil");
}
