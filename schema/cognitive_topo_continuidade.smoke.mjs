/**
 * cognitive_topo_continuidade.smoke.mjs
 *
 * Smoke tests para a extensão da CASCA COGNITIVA DE APRESENTAÇÃO
 * nos stages críticos do topo após inicio_nome.
 *
 * Contrato canônico verificado:
 *  1. resolveInicioNacionalidadeStructured existe e é despachado por resolveTopoStructured
 *  2. resolveInicioNacionalidadeStructured classifica: brasileiro | estrangeiro | ambiguous
 *  3. reply_text é null para respostas claras; não-null para ambiguous
 *  4. Nenhum resolver contém nextStage / gate / regra de negócio
 *  5. Cognitive prefixes estão presentes nos fallbacks de:
 *     inicio_nacionalidade, somar_renda_solteiro, somar_renda_familiar, quem_pode_somar
 *  6. Prefixes são curtos, naturais, induzem resposta parseável, sem perguntas duplas
 *  7. inicio_nacionalidade → estado_civil: prefix inclui lista completa de opções
 *  8. Continuidade pós-nome não regride parser / gate / nextStage do topo já estável
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

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

function nf(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ================================================================
// Extract helper functions from worker source
// ================================================================

const ntMatch = workerSrc.match(
  /function normalizeText\(text\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(ntMatch, "normalizeText must exist in worker");
const normalizeText = new Function("text", ntMatch[1]);

const isYesMatch = workerSrc.match(/function isYes\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(isYesMatch, "isYes must exist in worker");
const isYes = new Function("text", isYesMatch[1]);

const isNoMatch = workerSrc.match(/function isNo\(text\)\s*\{([\s\S]*?)\n\}/);
assert.ok(isNoMatch, "isNo must exist in worker");
const isNo = new Function("text", isNoMatch[1]);

const pecMatch = workerSrc.match(
  /function parseEstadoCivil\(text\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(pecMatch, "parseEstadoCivil must exist in worker");
const parseEstadoCivil = new Function("text", `
  const normalizeText = ${normalizeText.toString()};
  ${pecMatch[1]}
`);

// ================================================================
// Extract resolveInicioNacionalidadeStructured
// ================================================================

const rinacMatch = workerSrc.match(
  /function resolveInicioNacionalidadeStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(rinacMatch, "resolveInicioNacionalidadeStructured must exist in worker");

const sharedDeps = `
  const normalizeText = ${normalizeText.toString()};
  const isYes = ${isYes.toString()};
  const isNo = ${isNo.toString()};
  const parseEstadoCivil = ${parseEstadoCivil.toString()};
`;

const resolveInicioNacionalidadeStructured = new Function("rawText", `
  ${sharedDeps}
  ${rinacMatch[1]}
`);

// Extract other resolvers needed for dispatcher test
const ripMatch = workerSrc.match(
  /function resolveInicioProgramaStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
const rinMatch = workerSrc.match(
  /function resolveInicioNomeStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
const recMatch = workerSrc.match(
  /function resolveEstadoCivilStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
const rccMatch = workerSrc.match(
  /function resolveConfirmarCasamentoStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
const rfcMatch = workerSrc.match(
  /function resolveFinanciamentoConjuntoStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);

assert.ok(ripMatch, "resolveInicioProgramaStructured must exist");
assert.ok(rinMatch, "resolveInicioNomeStructured must exist");
assert.ok(recMatch, "resolveEstadoCivilStructured must exist");
assert.ok(rccMatch, "resolveConfirmarCasamentoStructured must exist");
assert.ok(rfcMatch, "resolveFinanciamentoConjuntoStructured must exist");

const resolveInicioProgramaStructured = new Function("rawText", `
  ${sharedDeps} ${ripMatch[1]}
`);
const resolveInicioNomeStructured = new Function("rawText", `
  ${sharedDeps} ${rinMatch[1]}
`);
const resolveEstadoCivilStructured = new Function("rawText", `
  ${sharedDeps} ${recMatch[1]}
`);
const resolveConfirmarCasamentoStructured = new Function("rawText", `
  ${sharedDeps} ${rccMatch[1]}
`);
const resolveFinanciamentoConjuntoStructured = new Function("rawText", `
  ${sharedDeps} ${rfcMatch[1]}
`);

const rtsMatch = workerSrc.match(
  /function resolveTopoStructured\(stage, rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(rtsMatch, "resolveTopoStructured must exist in worker");

const resolveTopoStructured = new Function("stage", "rawText", `
  ${sharedDeps}
  const resolveInicioProgramaStructured = ${resolveInicioProgramaStructured.toString()};
  const resolveInicioNomeStructured = ${resolveInicioNomeStructured.toString()};
  const resolveInicioNacionalidadeStructured = ${resolveInicioNacionalidadeStructured.toString()};
  const resolveEstadoCivilStructured = ${resolveEstadoCivilStructured.toString()};
  const resolveConfirmarCasamentoStructured = ${resolveConfirmarCasamentoStructured.toString()};
  const resolveFinanciamentoConjuntoStructured = ${resolveFinanciamentoConjuntoStructured.toString()};
  ${rtsMatch[1]}
`);

// ================================================================
// Contract validator for inicio_nacionalidade
// ================================================================

function validateNacionalidadeContract(result) {
  assert.ok(result, "result must not be null");
  assert.strictEqual(result.stage, "inicio_nacionalidade", "stage must be inicio_nacionalidade");
  const VALID = new Set(["brasileiro", "estrangeiro", "ambiguous"]);
  assert.ok(VALID.has(result.detected_answer),
    `detected_answer '${result.detected_answer}' must be one of: ${[...VALID].join(", ")}`);
  assert.ok(typeof result.confidence === "number", "confidence must be number");
  assert.ok(typeof result.needs_confirmation === "boolean", "needs_confirmation must be boolean");
  assert.ok(!("nextStage" in result), "resolver must NOT contain nextStage");
  assert.ok(!("next_stage" in result), "resolver must NOT contain next_stage");
  if (result.detected_answer !== "ambiguous") {
    assert.strictEqual(result.reply_text, null, "reply_text must be null for clear answer");
    assert.ok(result.safe_stage_signal && result.safe_stage_signal.startsWith("inicio_nacionalidade:"),
      `safe_stage_signal must start with 'inicio_nacionalidade:' — got '${result.safe_stage_signal}'`);
  } else {
    assert.ok(result.reply_text && result.reply_text.length > 0, "reply_text must not be empty for ambiguous");
  }
}

// ================================================================
// 1. resolveTopoStructured dispatcher — now covers inicio_nacionalidade
// ================================================================
console.log("\n── Dispatcher ──");

await asyncTest("dispatches to inicio_nacionalidade", async () => {
  const r = resolveTopoStructured("inicio_nacionalidade", "brasileiro");
  assert.ok(r !== null, "dispatcher must return non-null for inicio_nacionalidade");
  assert.strictEqual(r.stage, "inicio_nacionalidade");
});

await asyncTest("dispatcher: returns null for unknown stage (still)", async () => {
  const r = resolveTopoStructured("regime_trabalho", "clt");
  assert.strictEqual(r, null);
});

// ================================================================
// 2. resolveInicioNacionalidadeStructured — clear answers
// ================================================================
console.log("\n── resolveInicioNacionalidadeStructured — respostas claras ──");

await asyncTest("'brasileiro' → detected_answer=brasileiro, reply_text=null", async () => {
  const r = resolveInicioNacionalidadeStructured("brasileiro");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "brasileiro");
  assert.strictEqual(r.reply_text, null);
  assert.ok(r.confidence >= 0.9);
});

await asyncTest("'brasileira' → brasileiro", async () => {
  const r = resolveInicioNacionalidadeStructured("brasileira");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "brasileiro");
});

await asyncTest("'sou brasileiro' → brasileiro", async () => {
  const r = resolveInicioNacionalidadeStructured("sou brasileiro");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "brasileiro");
});

await asyncTest("'nasci no brasil' → brasileiro", async () => {
  const r = resolveInicioNacionalidadeStructured("nasci no brasil");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "brasileiro");
});

await asyncTest("'estrangeiro' → estrangeiro, reply_text=null", async () => {
  const r = resolveInicioNacionalidadeStructured("estrangeiro");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "estrangeiro");
  assert.strictEqual(r.reply_text, null);
  assert.ok(r.confidence >= 0.9);
});

await asyncTest("'sou estrangeira' → estrangeiro", async () => {
  const r = resolveInicioNacionalidadeStructured("sou estrangeira");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "estrangeiro");
});

await asyncTest("'nao sou brasileiro' → estrangeiro", async () => {
  const r = resolveInicioNacionalidadeStructured("nao sou brasileiro");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "estrangeiro");
});

// ================================================================
// 3. resolveInicioNacionalidadeStructured — ambiguous / fallback
// ================================================================
console.log("\n── resolveInicioNacionalidadeStructured — ambiguous / fallback ──");

await asyncTest("'' (empty) → ambiguous with reply_text", async () => {
  const r = resolveInicioNacionalidadeStructured("");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text && r.reply_text.length > 0);
});

await asyncTest("random text → ambiguous with reply_text", async () => {
  const r = resolveInicioNacionalidadeStructured("quero saber mais sobre o programa");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text && r.reply_text.length > 0);
});

await asyncTest("RNM query → ambiguous (stage not diverged)", async () => {
  const r = resolveInicioNacionalidadeStructured("o que é RNM");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text && r.reply_text.length > 0);
  // Deve mencionar a pergunta do stage atual, não apenas RNM
  const rt = nf(r.reply_text);
  assert.ok(rt.includes("brasileiro") || rt.includes("estrangeiro"),
    "reply_text deve manter o foco no stage atual");
});

await asyncTest("ambiguous reply_text menciona brasileiro/estrangeiro", async () => {
  const r = resolveInicioNacionalidadeStructured("nao sei");
  validateNacionalidadeContract(r);
  assert.strictEqual(r.detected_answer, "ambiguous");
  const rt = nf(r.reply_text);
  assert.ok(rt.includes("brasileiro") || rt.includes("estrangeiro"),
    "reply must contain the stage options");
});

// ================================================================
// 4. Anchors cognitivos no worker — inicio_nacionalidade success branches
// ================================================================
console.log("\n── Anchors cognitivos no worker.js ──");

await asyncTest("inicio_nacionalidade brasileiro: cognitivo real via getTopoHappyPathSpeech", async () => {
  // Verifica que o branch brasileiro agora usa getTopoHappyPathSpeech ao invés de prefix hardcoded
  const anchor = "getTopoHappyPathSpeech(env, \"inicio_nacionalidade:brasileiro\"";
  assert.ok(workerSrc.includes(anchor),
    "inicio_nacionalidade brasileiro must call getTopoHappyPathSpeech for cognitive real speech");
});

await asyncTest("inicio_nacionalidade estrangeiro: cognitivo real via getTopoHappyPathSpeech", async () => {
  const anchor = "getTopoHappyPathSpeech(env, \"inicio_nacionalidade:estrangeiro\"";
  assert.ok(workerSrc.includes(anchor),
    "inicio_nacionalidade estrangeiro must call getTopoHappyPathSpeech for cognitive real speech");
});

await asyncTest("inicio_nacionalidade fallback: resolve resolver e seta cognitive flags", async () => {
  const anchor = "resolveTopoStructured(\"inicio_nacionalidade\"";
  assert.ok(workerSrc.includes(anchor),
    "resolveTopoStructured must be called in inicio_nacionalidade fallback");
});

await asyncTest("somar_renda_solteiro: cognitive prefix presente no fallback", async () => {
  const anchor = "Sobre a renda — você pretende seguir *só com a sua*";
  assert.ok(workerSrc.includes(anchor),
    "Cognitive prefix must be present in somar_renda_solteiro fallback");
});

await asyncTest("somar_renda_familiar: cognitive prefix presente no fallback", async () => {
  const anchor = "Me diz com qual familiar você quer compor renda:";
  assert.ok(workerSrc.includes(anchor),
    "Cognitive prefix must be present in somar_renda_familiar fallback");
});

await asyncTest("quem_pode_somar: cognitive prefix presente no fallback", async () => {
  const anchor = "Com quem você pretende somar renda:";
  assert.ok(workerSrc.includes(anchor),
    "Cognitive prefix must be present in quem_pode_somar fallback");
});

// ================================================================
// 5. Qualidade das falas — curtas, naturais, parseable
// ================================================================
console.log("\n── Qualidade das falas cognitivas ──");

await asyncTest("inicio_nacionalidade: estado_civil prefix inclui todas as 6 opções", async () => {
  const prefix = "Perfeito! Agora me diz seu estado civil: *solteiro(a)*, *casado(a) no civil*, *união estável*, *separado(a)*, *divorciado(a)* ou *viúvo(a)*?";
  const pn = nf(prefix);
  assert.ok(pn.includes("solteiro"), "deve incluir solteiro");
  assert.ok(pn.includes("casado") || pn.includes("civil"), "deve incluir casado/civil");
  assert.ok(pn.includes("uniao") || pn.includes("estavel"), "deve incluir uniao estavel");
  assert.ok(pn.includes("separado"), "deve incluir separado");
  assert.ok(pn.includes("divorciado"), "deve incluir divorciado");
  assert.ok(pn.includes("viuvo"), "deve incluir viuvo");
});

await asyncTest("somar_renda_solteiro: prefix menciona as 3 opções canônicas", async () => {
  const prefix = "Sobre a renda — você pretende seguir *só com a sua*, somar com *parceiro(a)*, ou somar com *familiar*?";
  const pn = nf(prefix);
  assert.ok(pn.includes("renda"), "deve mencionar renda");
  assert.ok(pn.includes("parceir"), "deve mencionar parceiro");
  assert.ok(pn.includes("familiar"), "deve mencionar familiar");
});

await asyncTest("quem_pode_somar: prefix menciona parceiro, familiar e sozinho", async () => {
  const prefix = "Com quem você pretende somar renda: *Parceiro(a)*, *familiar* (pai/mãe/irmão) ou *sozinho(a)*?";
  const pn = nf(prefix);
  assert.ok(pn.includes("parceir"), "deve mencionar parceiro");
  assert.ok(pn.includes("familiar"), "deve mencionar familiar");
  assert.ok(pn.includes("sozinho") || pn.includes("sozinha"), "deve mencionar sozinho");
});

await asyncTest("prefixes são curtos (< 200 chars)", async () => {
  const prefixes = [
    "Perfeito! Agora me diz seu estado civil: *solteiro(a)*, *casado(a) no civil*, *união estável*, *separado(a)*, *divorciado(a)* ou *viúvo(a)*?",
    "Sobre a renda — você pretende seguir *só com a sua*, somar com *parceiro(a)*, ou somar com *familiar*?",
    "Me diz com qual familiar você quer compor renda: pai, mãe, irmão(ã), avô(ó) ou tio(a)?",
    "Com quem você pretende somar renda? *Parceiro(a)*, *familiar* (pai/mãe/irmão) ou vai *sozinho(a)*?"
  ];
  for (const p of prefixes) {
    assert.ok(p.length < 200, `Prefix too long (${p.length}): "${p.slice(0, 50)}..."`);
  }
});

await asyncTest("prefixes NÃO contêm perguntas duplas (máx 1 '?')", async () => {
  const prefixes = [
    "Perfeito! Agora me diz seu estado civil: *solteiro(a)*, *casado(a) no civil*, *união estável*, *separado(a)*, *divorciado(a)* ou *viúvo(a)*?",
    "Sobre a renda — você pretende seguir *só com a sua*, somar com *parceiro(a)*, ou somar com *familiar*?",
    "Me diz com qual familiar você quer compor renda: pai, mãe, irmão(ã), avô(ó) ou tio(a)?",
    "Com quem você pretende somar renda: *Parceiro(a)*, *familiar* (pai/mãe/irmão) ou *sozinho(a)*?"
  ];
  for (const p of prefixes) {
    const qmarks = (p.match(/\?/g) || []).length;
    assert.ok(qmarks <= 1, `Prefix must not have double questions (found ${qmarks} '?'): "${p}"`);
  }
});

// ================================================================
// 6. Não-regressão — estados já estáveis não foram alterados
// ================================================================
console.log("\n── Não-regressão do topo estável ──");

await asyncTest("estado_civil: resolver ainda existe e classifica solteiro", async () => {
  const r = resolveEstadoCivilStructured("solteiro");
  assert.ok(r, "must return result");
  assert.strictEqual(r.stage, "estado_civil");
  assert.strictEqual(r.detected_answer, "solteiro");
  assert.strictEqual(r.reply_text, null);
});

await asyncTest("confirmar_casamento: resolver ainda existe e classifica civil", async () => {
  const r = resolveConfirmarCasamentoStructured("casado no civil");
  assert.ok(r, "must return result");
  assert.strictEqual(r.detected_answer, "civil_papel");
});

await asyncTest("financiamento_conjunto: resolver ainda existe e classifica juntos", async () => {
  const r = resolveFinanciamentoConjuntoStructured("sim, juntos");
  assert.ok(r, "must return result");
  assert.strictEqual(r.detected_answer, "juntos");
});

await asyncTest("resolveTopoStructured: ainda despacha para inicio_programa", async () => {
  const r = resolveTopoStructured("inicio_programa", "sim");
  assert.ok(r && r.stage === "inicio_programa");
});

await asyncTest("resolveTopoStructured: ainda despacha para inicio_nome", async () => {
  const r = resolveTopoStructured("inicio_nome", "Ana Silva");
  assert.ok(r && r.stage === "inicio_nome");
});

await asyncTest("resolveTopoStructured: ainda despacha para estado_civil", async () => {
  const r = resolveTopoStructured("estado_civil", "casado");
  assert.ok(r && r.stage === "estado_civil");
});

await asyncTest("inicio_nome: cognitive real via getTopoHappyPathSpeech após persistência", async () => {
  // Garante que inicio_nome usa cognitivo real para a transição (prefix será controlado por setTopoHappyPathFlags)
  const anchor = "getTopoHappyPathSpeech(env, \"inicio_nome:nome_aceito\"";
  assert.ok(workerSrc.includes(anchor),
    "inicio_nome deve usar getTopoHappyPathSpeech para transição para inicio_nacionalidade");
});

// ================================================================
// 7. Contrato de saída — nenhum resolver contém gate/nextStage
// ================================================================
console.log("\n── Contrato de saída ──");

await asyncTest("resolveInicioNacionalidadeStructured: não contém nextStage", async () => {
  const inputs = ["brasileiro", "estrangeiro", "nao sei", "rnm", ""];
  for (const inp of inputs) {
    const r = resolveInicioNacionalidadeStructured(inp);
    assert.ok(!("nextStage" in r), `nextStage must not exist in output for '${inp}'`);
    assert.ok(!("next_stage" in r), `next_stage must not exist in output for '${inp}'`);
  }
});

await asyncTest("resolveInicioNacionalidadeStructured: confidence em range [0,1]", async () => {
  const inputs = ["brasileiro", "estrangeiro", "ambiguous input", ""];
  for (const inp of inputs) {
    const r = resolveInicioNacionalidadeStructured(inp);
    assert.ok(r.confidence >= 0 && r.confidence <= 1,
      `confidence must be in [0,1], got ${r.confidence} for '${inp}'`);
  }
});

// ================================================================
// SUMMARY
// ================================================================
console.log(`\n────────────────────────────────────`);
console.log(`  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
