/**
 * cognitive_structured_resolvers.smoke.mjs
 *
 * Smoke tests para os RESOLVEDORES COGNITIVOS ESTRUTURADOS do topo do funil.
 *
 * Contrato canônico verificado:
 *  1. resolveTopoStructured existe e despacha para os 5 stages
 *  2. resolveInicioProgramaStructured classifica ja_sabe / quer_explicacao / ambiguous
 *  3. resolveInicioNomeStructured classifica name_candidate / not_name / ambiguous
 *  4. resolveEstadoCivilStructured classifica 6 categorias + ambiguous
 *  5. resolveConfirmarCasamentoStructured classifica civil_papel / uniao_estavel / ambiguous
 *  6. resolveFinanciamentoConjuntoStructured classifica juntos / solo / se_precisar / ambiguous
 *  7. Nenhum resolvedor inventa categoria fora do contrato
 *  8. Todas as saídas seguem o contrato estruturado
 *  9. reply_text é null quando mecânico resolve, não-null quando ambíguo
 * 10. safe_stage_signal segue formato "stage:valor"
 * 11. Nenhum gate/nextStage/regra de negócio é alterado
 * 12. Respostas mistas tratadas corretamente
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

// normalizeText
const ntMatch = workerSrc.match(
  /function normalizeText\(text\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(ntMatch, "normalizeText must exist in worker");
const normalizeText = new Function("text", ntMatch[1]);

// isYes
const isYesMatch = workerSrc.match(
  /function isYes\(text\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(isYesMatch, "isYes must exist in worker");
const isYes = new Function("text", isYesMatch[1]);

// isNo
const isNoMatch = workerSrc.match(
  /function isNo\(text\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(isNoMatch, "isNo must exist in worker");
const isNo = new Function("text", isNoMatch[1]);

// parseEstadoCivil
const pecMatch = workerSrc.match(
  /function parseEstadoCivil\(text\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(pecMatch, "parseEstadoCivil must exist in worker");
// parseEstadoCivil uses normalizeText internally, we need to provide it
const parseEstadoCivil = new Function("text", `
  const normalizeText = ${normalizeText.toString()};
  ${pecMatch[1]}
`);

// ================================================================
// Extract resolver functions from worker source
// ================================================================

// resolveTopoStructured
const rtsMatch = workerSrc.match(
  /function resolveTopoStructured\(stage, rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(rtsMatch, "resolveTopoStructured must exist in worker");

// resolveInicioProgramaStructured
const ripMatch = workerSrc.match(
  /function resolveInicioProgramaStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(ripMatch, "resolveInicioProgramaStructured must exist in worker");

// resolveInicioNomeStructured
const rinMatch = workerSrc.match(
  /function resolveInicioNomeStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(rinMatch, "resolveInicioNomeStructured must exist in worker");

// resolveEstadoCivilStructured
const recMatch = workerSrc.match(
  /function resolveEstadoCivilStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(recMatch, "resolveEstadoCivilStructured must exist in worker");

// resolveConfirmarCasamentoStructured
const rccMatch = workerSrc.match(
  /function resolveConfirmarCasamentoStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(rccMatch, "resolveConfirmarCasamentoStructured must exist in worker");

// resolveFinanciamentoConjuntoStructured
const rfcMatch = workerSrc.match(
  /function resolveFinanciamentoConjuntoStructured\(rawText\)\s*\{([\s\S]*?)\n\}/
);
assert.ok(rfcMatch, "resolveFinanciamentoConjuntoStructured must exist in worker");

// Build executable functions with proper dependencies
const sharedDeps = `
  const normalizeText = ${normalizeText.toString()};
  const isYes = ${isYes.toString()};
  const isNo = ${isNo.toString()};
  const parseEstadoCivil = ${parseEstadoCivil.toString()};
`;

const resolveInicioProgramaStructured = new Function("rawText", `
  ${sharedDeps}
  ${ripMatch[1]}
`);

const resolveInicioNomeStructured = new Function("rawText", `
  ${sharedDeps}
  ${rinMatch[1]}
`);

const resolveEstadoCivilStructured = new Function("rawText", `
  ${sharedDeps}
  ${recMatch[1]}
`);

const resolveConfirmarCasamentoStructured = new Function("rawText", `
  ${sharedDeps}
  ${rccMatch[1]}
`);

const resolveFinanciamentoConjuntoStructured = new Function("rawText", `
  ${sharedDeps}
  ${rfcMatch[1]}
`);

// Build resolveTopoStructured with all dependencies
const resolveTopoStructured = new Function("stage", "rawText", `
  ${sharedDeps}
  const resolveInicioProgramaStructured = ${resolveInicioProgramaStructured.toString()};
  const resolveInicioNomeStructured = ${resolveInicioNomeStructured.toString()};
  const resolveEstadoCivilStructured = ${resolveEstadoCivilStructured.toString()};
  const resolveConfirmarCasamentoStructured = ${resolveConfirmarCasamentoStructured.toString()};
  const resolveFinanciamentoConjuntoStructured = ${resolveFinanciamentoConjuntoStructured.toString()};
  ${rtsMatch[1]}
`);

// ================================================================
// Helpers: contract validation
// ================================================================

const VALID_STAGES = new Set([
  "inicio_programa", "inicio_nome", "estado_civil",
  "confirmar_casamento", "financiamento_conjunto"
]);

const VALID_ANSWERS_BY_STAGE = {
  inicio_programa: new Set(["ja_sabe", "quer_explicacao", "ambiguous"]),
  inicio_nome: new Set(["name_candidate", "not_name", "ambiguous"]),
  estado_civil: new Set(["solteiro", "casado_civil", "uniao_estavel", "separado", "divorciado", "viuvo", "ambiguous"]),
  confirmar_casamento: new Set(["civil_papel", "uniao_estavel", "ambiguous"]),
  financiamento_conjunto: new Set(["juntos", "solo", "se_precisar", "ambiguous"])
};

function validateContract(result, expectedStage) {
  assert.ok(result, "result must not be null");
  assert.strictEqual(result.stage, expectedStage, `stage must be ${expectedStage}`);
  assert.ok(VALID_ANSWERS_BY_STAGE[expectedStage].has(result.detected_answer),
    `detected_answer "${result.detected_answer}" must be valid for ${expectedStage}`);
  assert.ok(typeof result.confidence === "number", "confidence must be a number");
  assert.ok(result.confidence >= 0 && result.confidence <= 1, "confidence must be 0-1");
  assert.ok(typeof result.needs_confirmation === "boolean", "needs_confirmation must be boolean");
  if (result.safe_stage_signal) {
    assert.ok(result.safe_stage_signal.startsWith(expectedStage + ":"),
      `safe_stage_signal must start with "${expectedStage}:"`);
  }
  // reply_text is null for clear answers, string for ambiguous
  if (result.detected_answer === "ambiguous") {
    assert.ok(typeof result.reply_text === "string" && result.reply_text.length > 0,
      "ambiguous must have non-empty reply_text");
  }
}

// ================================================================
console.log("\n🧪 RESOLVEDORES COGNITIVOS ESTRUTURADOS — SMOKE TESTS\n");
// ================================================================

// ================================================================
// 1. DISPATCHER
// ================================================================
console.log("── resolveTopoStructured (dispatcher) ──");

await asyncTest("dispatches to inicio_programa", async () => {
  const r = resolveTopoStructured("inicio_programa", "sim");
  assert.ok(r, "must return result");
  assert.strictEqual(r.stage, "inicio_programa");
});

await asyncTest("dispatches to inicio_nome", async () => {
  const r = resolveTopoStructured("inicio_nome", "Bruno");
  assert.ok(r, "must return result");
  assert.strictEqual(r.stage, "inicio_nome");
});

await asyncTest("dispatches to estado_civil", async () => {
  const r = resolveTopoStructured("estado_civil", "solteiro");
  assert.ok(r, "must return result");
  assert.strictEqual(r.stage, "estado_civil");
});

await asyncTest("dispatches to confirmar_casamento", async () => {
  const r = resolveTopoStructured("confirmar_casamento", "sim");
  assert.ok(r, "must return result");
  assert.strictEqual(r.stage, "confirmar_casamento");
});

await asyncTest("dispatches to financiamento_conjunto", async () => {
  const r = resolveTopoStructured("financiamento_conjunto", "juntos");
  assert.ok(r, "must return result");
  assert.strictEqual(r.stage, "financiamento_conjunto");
});

await asyncTest("returns null for unknown stage", async () => {
  const r = resolveTopoStructured("renda", "algo");
  assert.strictEqual(r, null);
});

// ================================================================
// 2. INICIO_PROGRAMA — ja_sabe / quer_explicacao / ambiguous
// ================================================================
console.log("\n── inicio_programa ──");

await asyncTest("'sim' → ja_sabe", async () => {
  const r = resolveInicioProgramaStructured("sim");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ja_sabe");
  assert.ok(r.confidence >= 0.9);
  assert.strictEqual(r.needs_confirmation, false);
  assert.strictEqual(r.safe_stage_signal, "inicio_programa:sim");
  assert.strictEqual(r.reply_text, null);
});

await asyncTest("'já sei' → ja_sabe", async () => {
  const r = resolveInicioProgramaStructured("já sei");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ja_sabe");
});

await asyncTest("'tô ligado' → ja_sabe", async () => {
  const r = resolveInicioProgramaStructured("tô ligado");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ja_sabe");
});

await asyncTest("'conheço' → ja_sabe", async () => {
  const r = resolveInicioProgramaStructured("conheço");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ja_sabe");
});

await asyncTest("'tô por dentro' → ja_sabe", async () => {
  const r = resolveInicioProgramaStructured("tô por dentro");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ja_sabe");
});

await asyncTest("'me explica' → quer_explicacao", async () => {
  const r = resolveInicioProgramaStructured("me explica");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "quer_explicacao");
  assert.ok(r.confidence >= 0.8);
  assert.strictEqual(r.safe_stage_signal, "inicio_programa:nao");
});

await asyncTest("'quero entender melhor' → quer_explicacao", async () => {
  const r = resolveInicioProgramaStructured("quero entender melhor");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "quer_explicacao");
});

await asyncTest("'não sei como funciona' → quer_explicacao", async () => {
  const r = resolveInicioProgramaStructured("não sei como funciona");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "quer_explicacao");
});

await asyncTest("'como funciona' → quer_explicacao", async () => {
  const r = resolveInicioProgramaStructured("como funciona");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "quer_explicacao");
});

await asyncTest("'nunca ouvi falar' → quer_explicacao", async () => {
  const r = resolveInicioProgramaStructured("nunca ouvi falar");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "quer_explicacao");
});

await asyncTest("'olá bom dia' → ambiguous", async () => {
  const r = resolveInicioProgramaStructured("olá bom dia");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.confidence < 0.5);
  assert.strictEqual(r.needs_confirmation, true);
  assert.ok(r.reply_text.includes("sim"));
  assert.ok(r.reply_text.includes("não"));
});

await asyncTest("'quero comprar uma casa' → ambiguous", async () => {
  const r = resolveInicioProgramaStructured("quero comprar uma casa");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

await asyncTest("empty input → ambiguous", async () => {
  const r = resolveInicioProgramaStructured("");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

// ================================================================
// 3. INICIO_NOME — name_candidate / not_name / ambiguous
// ================================================================
console.log("\n── inicio_nome ──");

await asyncTest("'Bruno' → name_candidate", async () => {
  const r = resolveInicioNomeStructured("Bruno");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.ok(r.confidence >= 0.8);
  assert.strictEqual(r.reply_text, null);
  assert.ok(r.payload, "must have payload");
  assert.strictEqual(r.payload.extracted_name, "Bruno");
});

await asyncTest("'Bruno Vasques' → name_candidate", async () => {
  const r = resolveInicioNomeStructured("Bruno Vasques");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "Bruno Vasques");
});

await asyncTest("'meu nome é Bruno' → name_candidate", async () => {
  const r = resolveInicioNomeStructured("meu nome é Bruno");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "Bruno");
});

await asyncTest("'me chamo Maria Eduarda' → name_candidate", async () => {
  const r = resolveInicioNomeStructured("me chamo Maria Eduarda");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "Maria Eduarda");
});

await asyncTest("'sou João Pedro' → name_candidate", async () => {
  const r = resolveInicioNomeStructured("sou João Pedro");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "João Pedro");
});

await asyncTest("'Bruno. Tem casa?' → name_candidate (resposta mista)", async () => {
  const r = resolveInicioNomeStructured("Bruno. Tem casa?");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "Bruno");
});

await asyncTest("'meu nome é Bruno. Como funciona?' → name_candidate (resposta mista)", async () => {
  const r = resolveInicioNomeStructured("meu nome é Bruno. Como funciona?");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "Bruno");
});

await asyncTest("'me explique' → not_name", async () => {
  const r = resolveInicioNomeStructured("me explique");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "not_name");
  assert.ok(r.reply_text);
  assert.ok(r.reply_text.includes("nome"));
});

await asyncTest("'quero entender' → not_name", async () => {
  const r = resolveInicioNomeStructured("quero entender");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "not_name");
});

await asyncTest("'como funciona o programa' → not_name", async () => {
  const r = resolveInicioNomeStructured("como funciona o programa");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "not_name");
});

await asyncTest("empty input → ambiguous", async () => {
  const r = resolveInicioNomeStructured("");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

await asyncTest("'Ana Maria de Souza e Silva' → name_candidate (nome composto)", async () => {
  const r = resolveInicioNomeStructured("Ana Maria de Souza e Silva");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.ok(r.payload.extracted_name.includes("Ana"));
});

// ================================================================
// 4. ESTADO_CIVIL — 6 categorias + ambiguous
// ================================================================
console.log("\n── estado_civil ──");

await asyncTest("'solteiro' → solteiro", async () => {
  const r = resolveEstadoCivilStructured("solteiro");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "solteiro");
  assert.ok(r.confidence >= 0.9);
  assert.strictEqual(r.safe_stage_signal, "estado_civil:solteiro");
  assert.strictEqual(r.reply_text, null);
});

await asyncTest("'sou solteira' → solteiro", async () => {
  const r = resolveEstadoCivilStructured("sou solteira");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "solteiro");
});

await asyncTest("'casado no civil' → casado_civil", async () => {
  const r = resolveEstadoCivilStructured("casado no civil");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "casado_civil");
  assert.strictEqual(r.safe_stage_signal, "estado_civil:casado");
});

await asyncTest("'casada no papel' → casado_civil", async () => {
  const r = resolveEstadoCivilStructured("casada no papel");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "casado_civil");
});

await asyncTest("'união estável' → uniao_estavel", async () => {
  const r = resolveEstadoCivilStructured("união estável");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "uniao_estavel");
  assert.strictEqual(r.safe_stage_signal, "estado_civil:uniao_estavel");
});

await asyncTest("'juntado' → uniao_estavel", async () => {
  const r = resolveEstadoCivilStructured("juntado");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "uniao_estavel");
});

await asyncTest("'moro junto' → ambiguous (precisa esclarecimento)", async () => {
  const r = resolveEstadoCivilStructured("moro junto");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text.includes("civil"));
  assert.ok(r.reply_text.includes("estável") || r.reply_text.includes("estavel"));
});

await asyncTest("'divorciado' → divorciado", async () => {
  const r = resolveEstadoCivilStructured("divorciado");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "divorciado");
  assert.strictEqual(r.safe_stage_signal, "estado_civil:divorciado");
});

await asyncTest("'viúvo' → viuvo", async () => {
  const r = resolveEstadoCivilStructured("viúvo");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "viuvo");
  assert.strictEqual(r.safe_stage_signal, "estado_civil:viuvo");
});

await asyncTest("'separado' → separado", async () => {
  const r = resolveEstadoCivilStructured("separado");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "separado");
  assert.strictEqual(r.safe_stage_signal, "estado_civil:separado");
});

await asyncTest("'sou separada faz tempo' → separado", async () => {
  const r = resolveEstadoCivilStructured("sou separada faz tempo");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "separado");
});

await asyncTest("'não sei o que responder' → ambiguous", async () => {
  const r = resolveEstadoCivilStructured("não sei o que responder");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

await asyncTest("'moramos juntos faz 5 anos' → ambiguous", async () => {
  const r = resolveEstadoCivilStructured("moramos juntos faz 5 anos");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text.includes("civil"));
});

await asyncTest("'qual a diferença' → ambiguous", async () => {
  const r = resolveEstadoCivilStructured("qual a diferença?");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

await asyncTest("empty → ambiguous", async () => {
  const r = resolveEstadoCivilStructured("");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "ambiguous");
});

await asyncTest("'eu sou viúva' → viuvo", async () => {
  const r = resolveEstadoCivilStructured("eu sou viúva");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "viuvo");
});

await asyncTest("'texto aleatório xyz' → ambiguous (não inventa categoria)", async () => {
  const r = resolveEstadoCivilStructured("texto aleatório xyz");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "ambiguous");
});

// ================================================================
// 5. CONFIRMAR_CASAMENTO — civil_papel / uniao_estavel / ambiguous
// ================================================================
console.log("\n── confirmar_casamento ──");

await asyncTest("'sim' → civil_papel", async () => {
  const r = resolveConfirmarCasamentoStructured("sim");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "civil_papel");
  assert.ok(r.confidence >= 0.9);
  assert.strictEqual(r.safe_stage_signal, "confirmar_casamento:civil");
});

await asyncTest("'civil no papel' → civil_papel", async () => {
  const r = resolveConfirmarCasamentoStructured("civil no papel");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "civil_papel");
});

await asyncTest("'casamento civil' → civil_papel", async () => {
  const r = resolveConfirmarCasamentoStructured("casamento civil");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "civil_papel");
});

await asyncTest("'não' → uniao_estavel", async () => {
  const r = resolveConfirmarCasamentoStructured("não");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "uniao_estavel");
  assert.strictEqual(r.safe_stage_signal, "confirmar_casamento:uniao_estavel");
});

await asyncTest("'união estável' → uniao_estavel", async () => {
  const r = resolveConfirmarCasamentoStructured("união estável");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "uniao_estavel");
});

await asyncTest("'moro junto' → ambiguous", async () => {
  const r = resolveConfirmarCasamentoStructured("moro junto");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

await asyncTest("'religioso' → ambiguous", async () => {
  const r = resolveConfirmarCasamentoStructured("religioso");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text.includes("religioso"));
});

await asyncTest("'não sei' → ambiguous", async () => {
  const r = resolveConfirmarCasamentoStructured("não sei");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

await asyncTest("'papel passado' → civil_papel", async () => {
  const r = resolveConfirmarCasamentoStructured("papel passado");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "civil_papel");
});

await asyncTest("empty → ambiguous", async () => {
  const r = resolveConfirmarCasamentoStructured("");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "ambiguous");
});

// ================================================================
// 6. FINANCIAMENTO_CONJUNTO — juntos / solo / se_precisar / ambiguous
// ================================================================
console.log("\n── financiamento_conjunto ──");

await asyncTest("'sim' → juntos", async () => {
  const r = resolveFinanciamentoConjuntoStructured("sim");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "juntos");
  assert.ok(r.confidence >= 0.9);
  assert.strictEqual(r.safe_stage_signal, "financiamento_conjunto:sim");
});

await asyncTest("'vamos juntos' → juntos", async () => {
  const r = resolveFinanciamentoConjuntoStructured("vamos juntos");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "juntos");
});

await asyncTest("'comprar juntos' → juntos", async () => {
  const r = resolveFinanciamentoConjuntoStructured("comprar juntos");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "juntos");
});

await asyncTest("'não, só eu' → solo", async () => {
  const r = resolveFinanciamentoConjuntoStructured("não, só eu");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "solo");
  assert.strictEqual(r.safe_stage_signal, "financiamento_conjunto:nao");
});

await asyncTest("'sozinho' → solo", async () => {
  const r = resolveFinanciamentoConjuntoStructured("sozinho");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "solo");
});

await asyncTest("'apenas eu' → solo", async () => {
  const r = resolveFinanciamentoConjuntoStructured("apenas eu");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "solo");
});

await asyncTest("'se precisar' → se_precisar", async () => {
  const r = resolveFinanciamentoConjuntoStructured("se precisar");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "se_precisar");
  assert.strictEqual(r.safe_stage_signal, "financiamento_conjunto:se_precisar");
});

await asyncTest("'só se faltar' → se_precisar", async () => {
  const r = resolveFinanciamentoConjuntoStructured("só se faltar");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "se_precisar");
});

await asyncTest("'apenas se precisar' → se_precisar", async () => {
  const r = resolveFinanciamentoConjuntoStructured("apenas se precisar");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "se_precisar");
});

await asyncTest("'precisa ser junto?' → ambiguous", async () => {
  const r = resolveFinanciamentoConjuntoStructured("precisa ser junto?");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text.includes("obrigatório") || r.reply_text.includes("juntos"));
});

await asyncTest("'não sei' → ambiguous", async () => {
  const r = resolveFinanciamentoConjuntoStructured("não sei");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "ambiguous");
  assert.ok(r.reply_text);
});

await asyncTest("'melhora algo?' → ambiguous", async () => {
  const r = resolveFinanciamentoConjuntoStructured("melhora algo?");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "ambiguous");
});

await asyncTest("empty → ambiguous", async () => {
  const r = resolveFinanciamentoConjuntoStructured("");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "ambiguous");
});

// ================================================================
// 7. NON-REGRESSION: resolvers never invent categories
// ================================================================
console.log("\n── Non-regression / safety ──");

await asyncTest("inicio_programa: random text → only valid categories", async () => {
  const inputs = ["oi", "bom dia", "quero comprar casa", "financiamento", "123", "🏠"];
  for (const input of inputs) {
    const r = resolveInicioProgramaStructured(input);
    assert.ok(VALID_ANSWERS_BY_STAGE.inicio_programa.has(r.detected_answer),
      `"${input}" produced invalid category "${r.detected_answer}"`);
  }
});

await asyncTest("estado_civil: random text → only valid categories", async () => {
  const inputs = ["oi", "123", "quero casa", "sim", "não", "talvez", "hmm"];
  for (const input of inputs) {
    const r = resolveEstadoCivilStructured(input);
    assert.ok(VALID_ANSWERS_BY_STAGE.estado_civil.has(r.detected_answer),
      `"${input}" produced invalid category "${r.detected_answer}"`);
  }
});

await asyncTest("financiamento_conjunto: random text → only valid categories", async () => {
  const inputs = ["oi", "123", "que?", "hmm", "depende"];
  for (const input of inputs) {
    const r = resolveFinanciamentoConjuntoStructured(input);
    assert.ok(VALID_ANSWERS_BY_STAGE.financiamento_conjunto.has(r.detected_answer),
      `"${input}" produced invalid category "${r.detected_answer}"`);
  }
});

await asyncTest("all resolvers return correct contract structure", async () => {
  const cases = [
    ["inicio_programa", "algo"],
    ["inicio_nome", "algo"],
    ["estado_civil", "algo"],
    ["confirmar_casamento", "algo"],
    ["financiamento_conjunto", "algo"]
  ];
  for (const [stage, text] of cases) {
    const r = resolveTopoStructured(stage, text);
    assert.ok(r, `${stage} must return result`);
    assert.ok("stage" in r, `${stage}: missing 'stage'`);
    assert.ok("detected_answer" in r, `${stage}: missing 'detected_answer'`);
    assert.ok("confidence" in r, `${stage}: missing 'confidence'`);
    assert.ok("needs_confirmation" in r, `${stage}: missing 'needs_confirmation'`);
    assert.ok("safe_stage_signal" in r, `${stage}: missing 'safe_stage_signal'`);
    assert.ok("reply_text" in r, `${stage}: missing 'reply_text'`);
  }
});

await asyncTest("ambiguous replies always induce parseable answer", async () => {
  // inicio_programa ambiguous replies must contain sim/não
  const r1 = resolveInicioProgramaStructured("random text");
  if (r1.detected_answer === "ambiguous" && r1.reply_text) {
    const rt = nf(r1.reply_text);
    assert.ok(rt.includes("sim") && rt.includes("nao"),
      "inicio_programa ambiguous reply must contain sim/não options");
  }
  // estado_civil ambiguous replies must list options
  const r2 = resolveEstadoCivilStructured("random text");
  if (r2.detected_answer === "ambiguous" && r2.reply_text) {
    const rt = nf(r2.reply_text);
    assert.ok(rt.includes("solteir") || rt.includes("casad") || rt.includes("civil"),
      "estado_civil ambiguous reply must list valid options");
  }
});

await asyncTest("resolver does NOT advance stage (no nextStage in output)", async () => {
  const stages = ["inicio_programa", "inicio_nome", "estado_civil", "confirmar_casamento", "financiamento_conjunto"];
  for (const stage of stages) {
    const r = resolveTopoStructured(stage, "teste");
    assert.ok(!("nextStage" in r), `${stage}: resolver must NOT contain nextStage`);
    assert.ok(!("next_stage" in r), `${stage}: resolver must NOT contain next_stage`);
    assert.ok(!("should_advance_stage" in r), `${stage}: resolver must NOT contain should_advance_stage`);
  }
});

// ================================================================
// 8. EDGE CASES / MIXED RESPONSES
// ================================================================
console.log("\n── Edge cases / mixed responses ──");

await asyncTest("inicio_nome: 'João Pedro e queria saber do financiamento' → name_candidate 'João Pedro'", async () => {
  const r = resolveInicioNomeStructured("João Pedro e queria saber do financiamento");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "João Pedro");
});

await asyncTest("inicio_nome: 'aqui é Carla Souza' → name_candidate", async () => {
  const r = resolveInicioNomeStructured("aqui é Carla Souza");
  validateContract(r, "inicio_nome");
  assert.strictEqual(r.detected_answer, "name_candidate");
  assert.strictEqual(r.payload.extracted_name, "Carla Souza");
});

await asyncTest("estado_civil: 'vivo com minha companheira' → uniao_estavel", async () => {
  const r = resolveEstadoCivilStructured("vivo com minha companheira");
  validateContract(r, "estado_civil");
  assert.strictEqual(r.detected_answer, "uniao_estavel");
});

await asyncTest("confirmar_casamento: 'casado no civil sim' → civil_papel", async () => {
  const r = resolveConfirmarCasamentoStructured("casado no civil sim");
  validateContract(r, "confirmar_casamento");
  assert.strictEqual(r.detected_answer, "civil_papel");
});

await asyncTest("financiamento_conjunto: 'somar renda com minha esposa' → juntos", async () => {
  const r = resolveFinanciamentoConjuntoStructured("somar renda com minha esposa");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "juntos");
});

await asyncTest("financiamento_conjunto: 'se faltar a gente soma' → se_precisar", async () => {
  const r = resolveFinanciamentoConjuntoStructured("se faltar a gente soma");
  validateContract(r, "financiamento_conjunto");
  assert.strictEqual(r.detected_answer, "se_precisar");
});

await asyncTest("inicio_programa: 'sei sim, pode pular' → ja_sabe", async () => {
  const r = resolveInicioProgramaStructured("sei sim, pode pular");
  validateContract(r, "inicio_programa");
  assert.strictEqual(r.detected_answer, "ja_sabe");
});

// ================================================================
// SUMMARY
// ================================================================
console.log(`\n────────────────────────────────────`);
console.log(`  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
