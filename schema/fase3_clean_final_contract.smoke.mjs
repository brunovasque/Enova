/**
 * fase3_clean_final_contract.smoke.mjs
 *
 * Smoke tests obrigatórios para Fase 3 — Contrato Canônico Limpo.
 *
 * CONTRATO FASE 3:
 *   1. output_surface === reply_text quando speech_arbiter_source === "llm_real"
 *   2. applyFinalSpeechContract() NÃO roda no caminho normal de llm_real
 *   3. sanitizeCognitiveReply() NÃO contamina o caminho normal de llm_real
 *   4. Sem regressão no topo: greeting, how_it_works, identity
 *   5. Fallback mecânico ainda funciona quando LLM falha
 *   6. node_humano_manual continua como exceção manual rastreável
 *
 * Seções:
 *   A — applyFinalSpeechContract bloqueado para llm_real (llmSovereign guard)
 *   B — sanitizeCognitiveReply: apenas caminhos não-soberanos
 *   C — run-cognitive.js: llm_real não passa por applyFinalSpeechContract
 *   D — final-speech-contract.js: contrato completo preservado para não-soberano
 *   E — Regressão: topo (greeting / how_it_works / identity)
 *   F — Fallback mecânico preservado quando LLM falha
 *   G — node_humano_manual: exceção rastreável
 *   H — Prova de surface_equal_llm: true na telemetria emitida
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const contractPath = new URL("../cognitive/src/final-speech-contract.js", import.meta.url).href;
const {
  applyFinalSpeechContract,
  hasForbiddenPromise,
  containsCasaInsteadOfImovel,
  TOPO_SAFE_MINIMUM
} = await import(contractPath);

const cogEnginePath = resolve(__dirname, "..", "cognitive", "src", "run-cognitive.js");
const cogEngineSrc = readFileSync(cogEnginePath, "utf-8");

const finalContractPath = resolve(__dirname, "..", "cognitive", "src", "final-speech-contract.js");
const finalContractSrc = readFileSync(finalContractPath, "utf-8");

const workerPath = resolve(__dirname, "..", "Enova worker.js");
const workerSrc = readFileSync(workerPath, "utf-8");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

// ═════════════════════════════════════════════════════════════════
// SECTION A — applyFinalSpeechContract bloqueado para llm_real
// Prova: applyFinalSpeechContract NÃO roda no caminho normal de llm_real
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION A — applyFinalSpeechContract bloqueado para llm_real");

test("A1: llmSovereign guard existe em final-speech-contract.js", () => {
  assert.ok(finalContractSrc.includes("FINAL_CONTRACT_LLM_SOVEREIGN_GUARD"),
    "Fase 3 sovereign guard tag must exist");
  assert.ok(finalContractSrc.includes("context.llmSovereign === true"),
    "llmSovereign check must exist at top of applyFinalSpeechContract");
});

test("A2: llmSovereign=true retorna reply intacto (apenas normalizeWhitespace)", () => {
  const llmReply = "Olá! Eu sou a Enova e posso te ajudar com o Minha Casa Minha Vida. 😊";
  const result = applyFinalSpeechContract(llmReply, {
    currentStage: "estado_civil",
    llmSovereign: true,
    messageText: "oi"
  });
  // Reply deve sair sem substituições
  assert.ok(result.includes("Minha Casa Minha Vida"), "MCMV preserved");
  assert.ok(result.length > 0, "Non-empty result");
  assert.equal(result.trim(), llmReply.trim(), "Reply unchanged by sovereign guard");
});

test("A3: llmSovereign=true não aplica casa→imóvel (surface soberana intocável)", () => {
  const llmReply = "Você quer comprar uma casa pelo programa Minha Casa Minha Vida?";
  const result = applyFinalSpeechContract(llmReply, {
    currentStage: "estado_civil",
    llmSovereign: true,
    messageText: "quero"
  });
  // casa→imóvel NÃO deve ser aplicado para llm_real
  assert.ok(result.includes("uma casa"), "casa não substituído no caminho soberano");
  assert.ok(result.includes("Minha Casa Minha Vida"), "MCMV preservado");
});

test("A4: llmSovereign=true não aplica stripFutureStageCollection", () => {
  // Mesmo com coleção prematura, llmSovereign não strip
  const llmReply = "Vamos avançar! Qual é o seu estado civil?";
  const result = applyFinalSpeechContract(llmReply, {
    currentStage: "inicio",
    llmSovereign: true,
    messageText: "oi"
  });
  // Strip NÃO deve ocorrer — surface soberana intocável
  assert.ok(result.includes("estado civil"), "Strip não aplicado para llm_real sovereign");
});

test("A5: run-cognitive.js NÃO chama applyFinalSpeechContract para llm_real", () => {
  // Prova estrutural: o if para llm_real em run-cognitive.js NÃO chama applyFinalSpeechContract
  // O padrão antigo era: response.reply_text = applyFinalSpeechContract(..., { llmSovereign: true })
  // O novo padrão é: log + skip (sem chamada para llm_real)
  assert.ok(cogEngineSrc.includes("FASE3_LLM_REAL_CONTRACT_SKIPPED"),
    "Fase 3 tag must exist in run-cognitive.js for llm_real skip");
  // A chamada applyFinalSpeechContract com llmSovereign deve ter sido removida
  assert.ok(!cogEngineSrc.includes("llmSovereign: true"),
    "llmSovereign: true deve ter sido removido do run-cognitive.js");
  // A chamada para não-llm_real ainda existe (preservado)
  assert.ok(cogEngineSrc.includes("applyFinalSpeechContract(response.reply_text"),
    "applyFinalSpeechContract preservado para non-llm_real");
});

test("A6: run-cognitive.js: llm_real path retorna reply_text sem modificação", () => {
  // Prova estrutural: no bloco llm_real, não há assignment de reply_text
  // O bloco antigo: response.reply_text = applyFinalSpeechContract(...)
  // O novo bloco: apenas console.log (sem assignment)
  const llmBlock = cogEngineSrc.slice(
    cogEngineSrc.indexOf("FASE3_LLM_REAL_CONTRACT_SKIPPED"),
    cogEngineSrc.indexOf("} else {", cogEngineSrc.indexOf("FASE3_LLM_REAL_CONTRACT_SKIPPED"))
  );
  assert.ok(llmBlock.length > 0, "llm_real block found");
  assert.ok(!llmBlock.includes("response.reply_text = applyFinalSpeechContract"),
    "applyFinalSpeechContract NÃO deve ser chamada no bloco llm_real");
});

// ═════════════════════════════════════════════════════════════════
// SECTION B — sanitizeCognitiveReply: apenas caminhos não-soberanos
// Prova: sanitizeCognitiveReply NÃO contamina o caminho de llm_real
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION B — sanitizeCognitiveReply: apenas caminhos não-soberanos");

test("B1: worker.js COGNITIVE ASSIST block tem guard para llm_real", () => {
  // Prova estrutural: verificar que o bloco COGNITIVE ASSIST tem conditional para llm_real
  assert.ok(workerSrc.includes("_canonicalSpeechOrigin === \"llm_real\""),
    "Conditional for llm_real in COGNITIVE ASSIST must exist");
});

test("B2: worker.js: cognitiveReply é passado diretamente para llm_real sem sanitize", () => {
  // Prova estrutural: o cognitiveReply para llm_real usa String(...).trim() sem sanitizeCognitiveReply
  assert.ok(workerSrc.includes("? String(cognitive.reply_text || \"\").trim()"),
    "Direct string passthrough for llm_real must exist");
});

test("B3: worker.js topo path tem guard para llm_real", () => {
  // Prova estrutural: topo path também condiciona sanitizeCognitiveReply
  assert.ok(workerSrc.includes("rawOrigin === \"llm_real\""),
    "rawOrigin llm_real conditional in topo path must exist");
  assert.ok(workerSrc.includes("? String(cogResult?.reply_text || \"\").trim()"),
    "Direct passthrough for llm_real in topo path must exist");
});

test("B4: sanitizeCognitiveReply ainda existe para caminhos não-soberanos", () => {
  // O fallback/heuristic ainda usa sanitizeCognitiveReply
  assert.ok(workerSrc.includes("sanitizeCognitiveReply(cognitive.reply_text)"),
    "sanitizeCognitiveReply preserved for non-sovereign paths in COGNITIVE ASSIST");
  assert.ok(workerSrc.includes("sanitizeCognitiveReply(cogResult?.reply_text)"),
    "sanitizeCognitiveReply preserved for non-sovereign paths in topo");
});

// ═════════════════════════════════════════════════════════════════
// SECTION C — Surface = reply_text: prova direta
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION C — Surface = reply_text (prova direta via applyFinalSpeechContract)");

test("C1: reply_text llm_real sai intacto do contrato final (texto simples)", () => {
  const llmReply = "Oi! Sou a Enova. Posso te ajudar a verificar se você se qualifica para o Minha Casa Minha Vida. Por onde você quer começar?";
  const result = applyFinalSpeechContract(llmReply, {
    currentStage: "inicio",
    llmSovereign: true,
    messageText: "oi"
  });
  assert.equal(result.trim(), llmReply.trim(), "surface_equal_llm: true — reply intacto");
});

test("C2: reply_text llm_real sai intacto mesmo com emojis", () => {
  const llmReply = "Olá! 😊 Eu sou a Enova e posso te ajudar com o Minha Casa Minha Vida. 🏠";
  const result = applyFinalSpeechContract(llmReply, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: true,
    messageText: "oi"
  });
  assert.equal(result.trim(), llmReply.trim(), "surface_equal_llm: true — emojis preservados");
});

test("C3: reply_text llm_real sai intacto em estágio operacional", () => {
  const llmReply = "Para prosseguir, você precisará enviar a documentação. Vou te guiar nos próximos passos.";
  const result = applyFinalSpeechContract(llmReply, {
    currentStage: "envio_docs",
    llmSovereign: true,
    messageText: "ok"
  });
  assert.equal(result.trim(), llmReply.trim(), "surface_equal_llm: true — operacional intacto");
});

// ═════════════════════════════════════════════════════════════════
// SECTION D — Contrato completo preservado para não-soberano
// Prova: applyFinalSpeechContract ainda funciona para fallback/heuristic
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION D — Contrato completo para não-soberano");

test("D1: non-llm_real recebe casa→imóvel normalmente", () => {
  const heuristicReply = "Você quer comprar uma casa?";
  const result = applyFinalSpeechContract(heuristicReply, {
    currentStage: "estado_civil",
    messageText: "sim"
  });
  assert.ok(result.includes("imóvel"), "casa→imóvel aplicado para non-llm_real");
});

test("D2: non-llm_real recebe bloqueio de promessas proibidas", () => {
  const heuristicReply = "Você vai ser aprovado com certeza!";
  const result = applyFinalSpeechContract(heuristicReply, {
    currentStage: "estado_civil",
    messageText: "ok"
  });
  assert.ok(!result.includes("vai ser aprovado"), "Promessa proibida bloqueada para non-llm_real");
});

test("D3: non-llm_real em topo recebe strip de coleção prematura", () => {
  const heuristicReply = "Oi! Qual é o seu estado civil?";
  const result = applyFinalSpeechContract(heuristicReply, {
    currentStage: "inicio",
    messageText: "oi"
  });
  // No topo, estado civil é coleção prematura → strip/invalidate
  assert.ok(!result.includes("estado civil") || result === TOPO_SAFE_MINIMUM,
    "Coleção prematura bloqueada no topo para non-llm_real");
});

test("D4: non-llm_real com MCMV preserva nome oficial", () => {
  const heuristicReply = "Você quer uma casa pelo programa Minha Casa Minha Vida?";
  const result = applyFinalSpeechContract(heuristicReply, {
    currentStage: "estado_civil",
    messageText: "sim"
  });
  assert.ok(result.includes("Minha Casa Minha Vida"), "MCMV preservado para non-llm_real");
  assert.ok(result.includes("imóvel"), "casa isolada substituída para non-llm_real");
});

// ═════════════════════════════════════════════════════════════════
// SECTION E — Sem regressão: topo (greeting / how_it_works / identity)
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION E — Sem regressão no topo");

test("E1: topo greeting — fala llm_real sai intacta", () => {
  const greeting = "Oi! Que bom ter você por aqui 😊 Eu sou a Enova! Você já conhece o programa Minha Casa Minha Vida ou prefere que eu te explique como funciona?";
  const result = applyFinalSpeechContract(greeting, {
    currentStage: "inicio",
    llmSovereign: true,
    topoSealed: true,
    messageText: "oi"
  });
  assert.equal(result.trim(), greeting.trim(), "Greeting llm_real intacto");
});

test("E2: topo how_it_works — fala llm_real sai intacta", () => {
  const explanation = "O Minha Casa Minha Vida é um programa do governo federal que ajuda famílias de baixa renda a conquistar a casa própria com subsídio e juros reduzidos.";
  const result = applyFinalSpeechContract(explanation, {
    currentStage: "inicio_programa",
    llmSovereign: true,
    topoSealed: true,
    messageText: "como funciona"
  });
  assert.equal(result.trim(), explanation.trim(), "How_it_works llm_real intacto");
});

test("E3: topo identity — fala llm_real sai intacta", () => {
  const identity = "Eu sou a Enova! 😊 Sou a assistente virtual do programa Minha Casa Minha Vida. Minha missão é te ajudar a entender se você se qualifica e te guiar em todo o processo.";
  const result = applyFinalSpeechContract(identity, {
    currentStage: "inicio_decisao",
    llmSovereign: true,
    topoSealed: true,
    messageText: "quem é você"
  });
  assert.equal(result.trim(), identity.trim(), "Identity llm_real intacto");
});

test("E4: topo fallback não-soberano ainda usa strip/invalidate", () => {
  // Garantir que non-llm_real no topo ainda aplica o contrato completo
  const badFallback = "Qual é o seu estado civil e regime de trabalho?";
  const result = applyFinalSpeechContract(badFallback, {
    currentStage: "inicio",
    messageText: "oi"
  });
  // Para non-llm_real no topo, coleção prematura é bloqueada
  assert.ok(
    (!result.includes("estado civil") && !result.includes("regime de trabalho")) || result === TOPO_SAFE_MINIMUM,
    "Non-llm_real topo: coleção prematura bloqueada"
  );
});

// ═════════════════════════════════════════════════════════════════
// SECTION F — Fallback mecânico preservado quando LLM falha
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION F — Fallback mecânico preservado");

test("F1: applyFinalSpeechContract sem llmSovereign funciona normalmente", () => {
  // Fallback heurístico ainda processa corretamente
  const fallbackReply = "Entendi! Agora me diz qual seu estado civil — solteiro, casado ou outro?";
  const result = applyFinalSpeechContract(fallbackReply, {
    currentStage: "estado_civil",
    messageText: "ok"
  });
  assert.ok(typeof result === "string" && result.length > 0, "Fallback procesado normalmente");
});

test("F2: applyFinalSpeechContract com llmSovereign=false processa guardrails", () => {
  const reply = "Quer comprar uma casa? Você vai ser aprovado com certeza!";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "estado_civil",
    llmSovereign: false,
    messageText: "sim"
  });
  assert.ok(result.includes("imóvel"), "casa→imóvel aplicado");
  assert.ok(!result.includes("vai ser aprovado"), "Promessa proibida bloqueada");
});

test("F3: source code proof — fallback mecânico path preserved in run-cognitive.js", () => {
  // O bloco else (non-llm_real) ainda chama applyFinalSpeechContract
  assert.ok(cogEngineSrc.includes("speech_origin !== \"llm_real\"") ||
            cogEngineSrc.includes("speech_origin === \"llm_real\""),
    "llm_real conditional exists in run-cognitive.js");
  // O else ainda tem a chamada completa
  const elseIdx = cogEngineSrc.indexOf("} else {", cogEngineSrc.indexOf("FASE3_LLM_REAL_CONTRACT_SKIPPED"));
  const elseBlock = cogEngineSrc.slice(elseIdx, elseIdx + 500);
  assert.ok(elseBlock.includes("applyFinalSpeechContract(response.reply_text"),
    "applyFinalSpeechContract ainda presente no else (non-llm_real)");
});

// ═════════════════════════════════════════════════════════════════
// SECTION G — node_humano_manual: exceção rastreável
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION G — node_humano_manual como exceção rastreável");

test("G1: modoHumanoRender existe e requer flag manual explícita", () => {
  assert.ok(workerSrc.includes("modoHumanoRender"), "modoHumanoRender exists");
  assert.ok(workerSrc.includes("st.modo_humano_manual"), "modo_humano_manual flag check exists");
});

test("G2: modoHumanoRender retorna arr sem modificar quando modo_humano_manual falso", () => {
  // Prova estrutural: sem modo_humano_manual=true, retorna arr diretamente
  assert.ok(workerSrc.includes("if (!st.modo_humano_manual) return arr"),
    "Guard against auto-human-mode exists");
});

test("G3: source code proof — modoHumanoRender após renderCognitiveSpeech no step()", () => {
  // Verificar que modoHumanoRender é chamado APÓS renderCognitiveSpeech no step()
  const renderIdx = workerSrc.indexOf("renderCognitiveSpeech(st, currentStage, rawArr");
  const modoIdx = workerSrc.indexOf("modoHumanoRender(st, arr)", renderIdx);
  assert.ok(renderIdx !== -1 && modoIdx !== -1 && modoIdx > renderIdx,
    "modoHumanoRender called after renderCognitiveSpeech");
});

// ═════════════════════════════════════════════════════════════════
// SECTION H — Telemetria: surface_equal_llm prova
// ═════════════════════════════════════════════════════════════════
console.log("\n📦 SECTION H — Telemetria: prova de surface_equal_llm");

test("H1: step_separation_proof telemetria existe no worker", () => {
  assert.ok(workerSrc.includes("step_separation_proof"), "step_separation_proof telemetry exists");
  assert.ok(workerSrc.includes("surface_equal_reply_text"), "surface_equal_reply_text field exists");
});

test("H2: FASE3_LLM_REAL_CONTRACT_SKIPPED emitido em run-cognitive.js", () => {
  assert.ok(cogEngineSrc.includes("FASE3_LLM_REAL_CONTRACT_SKIPPED"),
    "Fase 3 telemetry tag emitted for llm_real skip");
  assert.ok(cogEngineSrc.includes("surface_equal_llm: true"),
    "surface_equal_llm: true emitted for llm_real path");
});

test("H3: FINAL_CONTRACT_LLM_SOVEREIGN_GUARD emitido em final-speech-contract.js", () => {
  assert.ok(finalContractSrc.includes("FINAL_CONTRACT_LLM_SOVEREIGN_GUARD"),
    "Sovereign guard tag emitted");
  assert.ok(finalContractSrc.includes("surface_equal_llm: true"),
    "surface_equal_llm: true emitted by sovereign guard");
});

test("H4: worker emite surface_equal_llm no caminho llm_real", () => {
  // _surfaceEqualLlm é calculado como (_outputSurface === _llmResponseForTelemetry)
  assert.ok(workerSrc.includes("_surfaceEqualLlm = speechArbiterSource === \"llm_real\""),
    "surfaceEqualLlm calculation exists");
  assert.ok(workerSrc.includes("surface_equal_reply_text"),
    "surface_equal_reply_text field tracked");
});

// ═════════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`FASE 3 — Clean Final Contract Smoke Tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}
console.log(`${"═".repeat(60)}\n`);
process.exit(failed > 0 ? 1 : 0);
