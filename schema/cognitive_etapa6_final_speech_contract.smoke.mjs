/**
 * cognitive_etapa6_final_speech_contract.smoke.mjs — Smoke tests da Etapa 6:
 * Contrato Global de Fala Final
 *
 * Cobertura obrigatória:
 *  1.  resposta com "casa" vira "imóvel"
 *  2.  resposta com promessa indevida é bloqueada/ajustada
 *  3.  resposta muito longa é encurtada/controlada
 *  4.  resposta de FAQ continua clara após contrato
 *  5.  objeção emocional recebe tom mais acolhedor
 *  6.  docs recebe resposta com segurança + clareza + reancoragem
 *  7.  visita recebe resposta natural e consultiva
 *  8.  topo recebe explicação + condução natural
 *  9.  nenhuma resposta perde coerência com o stage
 *  10. nenhuma parte do mecânico é alterada
 *  11. regressão dos blocos já conectados
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const {
  applyFinalSpeechContract,
  hasForbiddenPromise,
  containsCasaInsteadOfImovel,
  exceedsMaxLength,
  detectEmotionalContext,
  CONTRACT_CONFIG
} = await import(
  new URL("../cognitive/src/final-speech-contract.js", import.meta.url).href
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFileText(relPath) {
  return readFileSync(path.resolve(__dirname, relPath), "utf8");
}

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

// Load sources for static assertions
const runCognitiveSrc = loadFileText("../cognitive/src/run-cognitive.js");
const workerSrc = loadFileText("../Enova worker.js");
const contractSrc = loadFileText("../cognitive/src/final-speech-contract.js");

// ---------------------------------------------------------------------------
// GRUPO 1 — "CASA" → "IMÓVEL"
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 1: Substituição casa → imóvel ──");

test("1.1 — 'casa' isolada vira 'imóvel'", () => {
  const result = applyFinalSpeechContract("Quer comprar uma casa?", {});
  assert.ok(!containsCasaInsteadOfImovel(result), `Resultado ainda contém 'casa': ${result}`);
  assert.ok(result.includes("imóvel"), `Resultado não contém 'imóvel': ${result}`);
});

test("1.2 — 'casado' permanece inalterado", () => {
  const result = applyFinalSpeechContract("Você é casado?", {});
  assert.ok(result.includes("casado"), `casado foi alterado: ${result}`);
});

test("1.3 — 'casamento' permanece inalterado", () => {
  const result = applyFinalSpeechContract("Certidão de casamento.", {});
  assert.ok(result.includes("casamento"), `casamento foi alterado: ${result}`);
});

test("1.4 — múltiplas ocorrências de 'casa'", () => {
  const result = applyFinalSpeechContract("A casa dos seus sonhos. Veja a casa agora.", {});
  assert.ok(!containsCasaInsteadOfImovel(result), `Ainda contém 'casa': ${result}`);
  assert.ok((result.match(/imóvel/g) || []).length >= 2, `Esperava 2+ 'imóvel': ${result}`);
});

test("1.5 — containsCasaInsteadOfImovel detecta 'casa'", () => {
  assert.ok(containsCasaInsteadOfImovel("Comprar uma casa própria"));
  assert.ok(!containsCasaInsteadOfImovel("Comprar um imóvel próprio"));
  assert.ok(!containsCasaInsteadOfImovel("Você é casado?"));
});

// ---------------------------------------------------------------------------
// GRUPO 2 — PROMESSAS PROIBIDAS
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 2: Bloqueio de promessas proibidas ──");

test("2.1 — promessa de aprovação garantida é removida", () => {
  const input = "Pode ficar tranquilo, garanto que você será aprovado!";
  assert.ok(hasForbiddenPromise(input), "Deveria detectar promessa");
  const result = applyFinalSpeechContract(input, {});
  assert.ok(!hasForbiddenPromise(result), `Promessa não foi removida: ${result}`);
});

test("2.2 — 'você vai ser aprovado' é ajustada", () => {
  const input = "Fique calmo, você vai ser aprovado com certeza.";
  const result = applyFinalSpeechContract(input, {});
  assert.ok(!hasForbiddenPromise(result), `Promessa não foi removida: ${result}`);
});

test("2.3 — promessa de subsídio é ajustada", () => {
  const input = "Seu subsídio vai ser de R$ 47.000.";
  const result = applyFinalSpeechContract(input, {});
  assert.ok(!hasForbiddenPromise(result), `Promessa não foi removida: ${result}`);
  assert.ok(result.includes("depende"), `Resultado não usa frase segura: ${result}`);
});

test("2.4 — promessa de FGTS é ajustada", () => {
  const input = "Você pode usar o FGTS sem problema.";
  const result = applyFinalSpeechContract(input, {});
  assert.ok(!hasForbiddenPromise(result), `Promessa não foi removida: ${result}`);
});

test("2.5 — promessa de prazo bancário é ajustada", () => {
  const input = "O banco vai aprovar em 15 dias úteis.";
  const result = applyFinalSpeechContract(input, {});
  assert.ok(!hasForbiddenPromise(result), `Promessa não foi removida: ${result}`);
});

test("2.6 — texto sem promessa continua inalterado", () => {
  const input = "Me confirma seu estado civil?";
  const result = applyFinalSpeechContract(input, {});
  assert.equal(result, input);
});

test("2.7 — promessa de valor de financiamento é ajustada", () => {
  const input = "Você vai conseguir R$ 200.000 de financiamento.";
  const result = applyFinalSpeechContract(input, {});
  assert.ok(!hasForbiddenPromise(result), `Promessa não foi removida: ${result}`);
});

test("2.8 — hasForbiddenPromise retorna false para texto seguro", () => {
  assert.ok(!hasForbiddenPromise("Me confirma seu regime de trabalho?"));
  assert.ok(!hasForbiddenPromise("Entendi sua dúvida sobre o imóvel."));
});

// ---------------------------------------------------------------------------
// GRUPO 3 — CONTROLE DE TAMANHO
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 3: Controle de tamanho ──");

test("3.1 — texto curto permanece intacto", () => {
  const input = "Entendi, me confirma seu estado civil?";
  const result = applyFinalSpeechContract(input, {});
  assert.equal(result, input);
});

test("3.2 — texto longo é encurtado", () => {
  const longText = "Entendi sua dúvida. ".repeat(50);
  assert.ok(exceedsMaxLength(longText), "Deveria exceder limite");
  const result = applyFinalSpeechContract(longText, {});
  assert.ok(result.length <= CONTRACT_CONFIG.MAX_REPLY_LENGTH + 10, `Resultado muito longo: ${result.length}`);
});

test("3.3 — truncagem respeita limite de sentença", () => {
  const longText = "Primeira frase completa. Segunda frase completa. " +
    "Terceira frase que é bem longa e ocupa bastante espaço. ".repeat(15);
  const result = applyFinalSpeechContract(longText, {});
  assert.ok(
    result.endsWith(".") || result.endsWith("?") || result.endsWith("!") || result.endsWith("…"),
    `Resultado não termina em pontuação: ${result.slice(-20)}`
  );
});

test("3.4 — exceedsMaxLength detecta corretamente", () => {
  assert.ok(!exceedsMaxLength("Curto"));
  assert.ok(exceedsMaxLength("x".repeat(CONTRACT_CONFIG.MAX_REPLY_LENGTH + 1)));
});

// ---------------------------------------------------------------------------
// GRUPO 4 — FAQ APÓS CONTRATO
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 4: FAQ continua clara após contrato ──");

test("4.1 — resposta FAQ de elegibilidade permanece compreensível", () => {
  const faq = "Para financiar um imóvel pelo Minha Casa Minha Vida, é preciso ter renda familiar de até R$ 8.000. A análise leva em conta o perfil de crédito e a documentação.";
  const result = applyFinalSpeechContract(faq, { currentStage: "inicio" });
  assert.ok(result.includes("financiar"), "Conteúdo FAQ preservado");
  assert.ok(result.includes("renda"), "Conteúdo FAQ preservado");
  assert.ok(result.length > 30, "Resposta não foi destruída");
});

test("4.2 — resposta FAQ com 'casa' é corrigida mas conteúdo preservado", () => {
  const faq = "Para financiar uma casa pelo programa, é preciso atender aos critérios de renda.";
  const result = applyFinalSpeechContract(faq, { currentStage: "inicio" });
  assert.ok(result.includes("imóvel"), "casa deveria virar imóvel");
  assert.ok(result.includes("critérios"), "Conteúdo FAQ preservado");
});

test("4.3 — resposta FAQ sem promessa permanece idêntica", () => {
  const faq = "A análise depende do seu perfil de crédito e dos documentos apresentados.";
  const result = applyFinalSpeechContract(faq, { currentStage: "inicio" });
  assert.equal(result, faq);
});

// ---------------------------------------------------------------------------
// GRUPO 5 — CONTEXTO EMOCIONAL
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 5: Objeção emocional recebe acolhimento ──");

test("5.1 — detectEmotionalContext detecta medo", () => {
  assert.ok(detectEmotionalContext("tenho medo de mandar meus documentos"));
});

test("5.2 — detectEmotionalContext detecta insegurança", () => {
  assert.ok(detectEmotionalContext("estou inseguro com isso"));
});

test("5.3 — detectEmotionalContext detecta vergonha de renda", () => {
  assert.ok(detectEmotionalContext("minha renda é baixa, nem sei se vale a pena"));
});

test("5.4 — detectEmotionalContext retorna false para neutro", () => {
  assert.ok(!detectEmotionalContext("quero saber o horário da visita"));
});

test("5.5 — resposta com contexto emocional recebe prefixo acolhedor", () => {
  const reply = "Me confirma seu regime de trabalho para seguirmos.";
  const result = applyFinalSpeechContract(reply, {
    messageText: "tenho medo de não ser aprovado, meu nome tá sujo"
  });
  assert.ok(result.length > reply.length, "Deveria ter prefixo");
  assert.ok(
    /^(?:entendo|compreendo|fica tranquil|é normal)/i.test(result),
    `Deveria começar com acolhimento: ${result.substring(0, 50)}`
  );
});

test("5.6 — resposta já empática não recebe duplo prefixo", () => {
  const reply = "Entendo sua preocupação, vamos analisar com calma.";
  const result = applyFinalSpeechContract(reply, {
    messageText: "tenho medo de ser reprovado"
  });
  assert.ok(
    !result.startsWith("Entendo sua preocupação. Entendo"),
    `Prefixo duplicado: ${result.substring(0, 80)}`
  );
});

test("5.7 — contexto emocional de SPC/Serasa é detectado", () => {
  assert.ok(detectEmotionalContext("meu nome está sujo no SPC"));
  assert.ok(detectEmotionalContext("tenho restrição no Serasa"));
});

// ---------------------------------------------------------------------------
// GRUPO 6 — DOCS: segurança + clareza + reancoragem
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 6: Docs — segurança, clareza, reancoragem ──");

test("6.1 — resposta de docs não contém promessa", () => {
  const reply = "Seus documentos estão seguros. Garanto que sua aprovação vai sair rápido.";
  const result = applyFinalSpeechContract(reply, { currentStage: "envio_docs" });
  assert.ok(!hasForbiddenPromise(result), `Promessa em docs: ${result}`);
});

test("6.2 — resposta de docs com 'casa' é corrigida", () => {
  const reply = "Preciso dos documentos da sua casa.";
  const result = applyFinalSpeechContract(reply, { currentStage: "envio_docs" });
  assert.ok(result.includes("imóvel"), `Docs não substituiu 'casa': ${result}`);
});

test("6.3 — resposta de docs com medo recebe acolhimento", () => {
  const reply = "Me mande os documentos para continuarmos.";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "envio_docs",
    messageText: "tenho medo de mandar meus dados"
  });
  assert.ok(result.length > reply.length, "Deveria ter acolhimento");
});

test("6.4 — resposta curta de docs permanece legível", () => {
  const reply = "Perfeito, agora preciso do seu comprovante de renda.";
  const result = applyFinalSpeechContract(reply, { currentStage: "envio_docs" });
  assert.ok(result.length >= 20, "Resposta não deve ser destruída");
});

// ---------------------------------------------------------------------------
// GRUPO 7 — VISITA: resposta natural e consultiva
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 7: Visita — resposta natural e consultiva ──");

test("7.1 — resposta de visita não contém promessa", () => {
  const reply = "Garanto que na visita você vai ser aprovado na hora.";
  const result = applyFinalSpeechContract(reply, { currentStage: "agendamento_visita" });
  assert.ok(!hasForbiddenPromise(result), `Promessa em visita: ${result}`);
});

test("7.2 — resposta de visita com 'casa' é corrigida", () => {
  const reply = "Vamos agendar sua visita para ver a casa.";
  const result = applyFinalSpeechContract(reply, { currentStage: "agendamento_visita" });
  assert.ok(result.includes("imóvel"), `Visita não substituiu 'casa': ${result}`);
});

test("7.3 — resposta de visita preserva conteúdo consultivo", () => {
  const reply = "A visita ao plantão é uma ótima oportunidade para conhecer as opções disponíveis e tirar dúvidas presencialmente.";
  const result = applyFinalSpeechContract(reply, { currentStage: "agendamento_visita" });
  assert.ok(result.includes("plantão") || result.includes("visita"), "Conteúdo consultivo preservado");
});

test("7.4 — resposta de visita com medo recebe acolhimento", () => {
  const reply = "A visita é tranquila e sem compromisso.";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "agendamento_visita",
    messageText: "não sei se vale a pena ir, estou inseguro"
  });
  assert.ok(result.length > reply.length, "Deveria ter acolhimento");
});

// ---------------------------------------------------------------------------
// GRUPO 8 — TOPO: explicação + condução natural
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 8: Topo — explicação + condução natural ──");

test("8.1 — resposta de topo não contém promessa", () => {
  const reply = "Garanto que você vai conseguir R$ 300.000 de financiamento.";
  const result = applyFinalSpeechContract(reply, { currentStage: "inicio" });
  assert.ok(!hasForbiddenPromise(result), `Promessa em topo: ${result}`);
});

test("8.2 — resposta de topo com 'casa' é corrigida", () => {
  const reply = "Quer saber como financiar uma casa própria?";
  const result = applyFinalSpeechContract(reply, { currentStage: "inicio" });
  assert.ok(result.includes("imóvel"), `Topo não substituiu 'casa': ${result}`);
});

test("8.3 — resposta de topo com coleta prematura é invalidada para TOPO_SAFE_MINIMUM", () => {
  const reply = "O primeiro passo é entender seu perfil. Me confirma: você trabalha de carteira assinada ou é autônomo?";
  const result = applyFinalSpeechContract(reply, { currentStage: "inicio" });
  // FASE 2: coleta prematura (regime_trabalho: "autônomo?") no topo → TOPO_SAFE_MINIMUM inteiro
  // Não pode sair como fragmento parcial. Invalidação é o comportamento correto.
  assert.ok(result.includes("Enova") || result.includes("Minha Casa Minha Vida"),
    "Invalidada para safe minimum com identidade Enova/MCMV");
});

test("8.4 — resposta de topo com dúvida emocional é acolhedora", () => {
  const reply = "Me confirma sua renda mensal para eu analisar as opções.";
  const result = applyFinalSpeechContract(reply, {
    currentStage: "inicio",
    messageText: "ganho pouco, não sei se consigo financiar"
  });
  assert.ok(result.length > reply.length, "Deveria ter acolhimento");
});

// ---------------------------------------------------------------------------
// GRUPO 9 — COERÊNCIA COM STAGE
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 9: Coerência com stage ──");

test("9.1 — contrato não remove informação de stage do texto", () => {
  const replies = [
    { reply: "Preciso confirmar seu estado civil.", stage: "inicio" },
    { reply: "Me envie o comprovante de renda.", stage: "envio_docs" },
    { reply: "Vamos agendar a visita ao plantão.", stage: "agendamento_visita" }
  ];
  for (const { reply, stage } of replies) {
    const result = applyFinalSpeechContract(reply, { currentStage: stage });
    assert.ok(result.length >= 15, `Resposta vazia para stage ${stage}: ${result}`);
  }
});

test("9.2 — contrato preserva termos-chave de cada stage", () => {
  // Topo: valid topo content (program explanation) is preserved
  const result1 = applyFinalSpeechContract("Me confirma se já conhece o programa?", { currentStage: "inicio" });
  assert.ok(result1.includes("programa"), "Topo preservado");

  const result2 = applyFinalSpeechContract("Envie sua identidade com foto.", { currentStage: "envio_docs" });
  assert.ok(result2.includes("identidade"), "Docs preservado");

  const result3 = applyFinalSpeechContract("Qual dia fica melhor para a visita?", { currentStage: "agendamento_visita" });
  assert.ok(result3.includes("visita"), "Visita preservado");
});

// ---------------------------------------------------------------------------
// GRUPO 10 — MECÂNICO INTACTO
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 10: Mecânico intacto ──");

test("10.1 — worker.js step() não foi alterado pela Etapa 6", () => {
  // step() must still reference __cognitive_reply_prefix
  assert.ok(
    workerSrc.includes("__cognitive_reply_prefix"),
    "step() perdeu referência a __cognitive_reply_prefix"
  );
});

test("10.2 — worker.js runFunnel() existe intacto", () => {
  assert.ok(
    workerSrc.includes("runFunnel"),
    "runFunnel desapareceu do worker"
  );
});

test("10.3 — worker.js nextStage existe intacto", () => {
  assert.ok(
    workerSrc.includes("nextStage"),
    "nextStage desapareceu do worker"
  );
});

test("10.4 — worker.js gates existem intactos", () => {
  assert.ok(
    workerSrc.includes("COGNITIVE_V1_ALLOWED_STAGES"),
    "COGNITIVE_V1_ALLOWED_STAGES desapareceu do worker"
  );
});

test("10.5 — run-cognitive.js não altera nextStage", () => {
  // O contrato é puro: não toca em should_advance_stage
  assert.ok(
    !contractSrc.includes("nextStage"),
    "Contrato referencia nextStage — proibido"
  );
  assert.ok(
    !contractSrc.includes("should_advance_stage"),
    "Contrato referencia should_advance_stage — proibido"
  );
});

test("10.6 — contrato não altera persistência", () => {
  assert.ok(
    !contractSrc.includes("upsert"),
    "Contrato referencia upsert — proibido"
  );
  assert.ok(
    !contractSrc.includes("supabase"),
    "Contrato referencia supabase — proibido"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 11 — REGRESSÃO DOS BLOCOS CONECTADOS
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 11: Regressão dos blocos conectados ──");

test("11.1 — run-cognitive.js importa contrato de fala final", () => {
  assert.ok(
    runCognitiveSrc.includes("applyFinalSpeechContract"),
    "run-cognitive.js não importa applyFinalSpeechContract"
  );
});

test("11.2 — run-cognitive.js importa Etapa 5 global layers", () => {
  assert.ok(
    runCognitiveSrc.includes("getCanonicalFAQ"),
    "run-cognitive.js perdeu import getCanonicalFAQ"
  );
  assert.ok(
    runCognitiveSrc.includes("getCanonicalObjection"),
    "run-cognitive.js perdeu import getCanonicalObjection"
  );
  assert.ok(
    runCognitiveSrc.includes("getKnowledgeBaseItem"),
    "run-cognitive.js perdeu import getKnowledgeBaseItem"
  );
  assert.ok(
    runCognitiveSrc.includes("buildReanchor"),
    "run-cognitive.js perdeu import buildReanchor"
  );
});

test("11.3 — run-cognitive.js preserva _TOPO_FAQ_MAP", () => {
  assert.ok(
    runCognitiveSrc.includes("_TOPO_FAQ_MAP"),
    "run-cognitive.js perdeu _TOPO_FAQ_MAP"
  );
});

test("11.4 — run-cognitive.js preserva _DOCS_FAQ_MAP", () => {
  assert.ok(
    runCognitiveSrc.includes("_DOCS_FAQ_MAP"),
    "run-cognitive.js perdeu _DOCS_FAQ_MAP"
  );
});

test("11.5 — run-cognitive.js preserva _VISITA_FAQ_MAP", () => {
  assert.ok(
    runCognitiveSrc.includes("_VISITA_FAQ_MAP"),
    "run-cognitive.js perdeu _VISITA_FAQ_MAP"
  );
});

test("11.6 — run-cognitive.js preserva resolveGlobalLayerReply", () => {
  assert.ok(
    runCognitiveSrc.includes("resolveGlobalLayerReply"),
    "run-cognitive.js perdeu resolveGlobalLayerReply"
  );
});

test("11.7 — run-cognitive.js preserva wrapWithReanchor", () => {
  assert.ok(
    runCognitiveSrc.includes("wrapWithReanchor"),
    "run-cognitive.js perdeu wrapWithReanchor"
  );
});

test("11.8 — run-cognitive.js preserva buildPhaseGuidanceReply", () => {
  assert.ok(
    runCognitiveSrc.includes("buildPhaseGuidanceReply"),
    "run-cognitive.js perdeu buildPhaseGuidanceReply"
  );
});

test("11.9 — contrato de fala é aplicado em runReadOnlyCognitiveEngine", () => {
  // Verifica que o contrato é chamado no ponto correto
  const idx = runCognitiveSrc.indexOf("runReadOnlyCognitiveEngine");
  const fnBody = runCognitiveSrc.slice(idx, idx + 3000);
  assert.ok(
    fnBody.includes("applyFinalSpeechContract"),
    "applyFinalSpeechContract não é chamado em runReadOnlyCognitiveEngine"
  );
});

test("11.10 — documento ETAPA6 existe", () => {
  const docPath = path.resolve(__dirname, "cognitive/ETAPA6_FINAL_SPEECH_CONTRACT.md");
  const doc = readFileSync(docPath, "utf8");
  assert.ok(doc.includes("Etapa 6"), "Documento não menciona Etapa 6");
  assert.ok(doc.includes("contrato"), "Documento não menciona contrato");
});

test("11.11 — contrato exporta funções necessárias", () => {
  assert.ok(typeof applyFinalSpeechContract === "function", "applyFinalSpeechContract não exportado");
  assert.ok(typeof hasForbiddenPromise === "function", "hasForbiddenPromise não exportado");
  assert.ok(typeof containsCasaInsteadOfImovel === "function", "containsCasaInsteadOfImovel não exportado");
  assert.ok(typeof exceedsMaxLength === "function", "exceedsMaxLength não exportado");
  assert.ok(typeof detectEmotionalContext === "function", "detectEmotionalContext não exportado");
});

test("11.12 — CONTRACT_CONFIG tem valores esperados", () => {
  assert.ok(CONTRACT_CONFIG.MAX_REPLY_LENGTH > 0, "MAX_REPLY_LENGTH inválido");
  assert.ok(CONTRACT_CONFIG.FORBIDDEN_PROMISE_PATTERNS_COUNT > 0, "Sem patterns de promessa");
  assert.ok(CONTRACT_CONFIG.EMOTIONAL_PATTERNS_COUNT > 0, "Sem patterns emocionais");
  assert.ok(CONTRACT_CONFIG.EMPATHY_PREFIXES_COUNT > 0, "Sem prefixos empáticos");
});

// ---------------------------------------------------------------------------
// GRUPO 12 — EDGE CASES
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 12: Edge cases ──");

test("12.1 — null/undefined não quebra", () => {
  assert.equal(applyFinalSpeechContract(null, {}), "");
  assert.equal(applyFinalSpeechContract(undefined, {}), "");
  assert.equal(applyFinalSpeechContract("", {}), "");
});

test("12.2 — context vazio não quebra", () => {
  const result = applyFinalSpeechContract("Texto simples.");
  assert.equal(result, "Texto simples.");
});

test("12.3 — espaços extras são normalizados", () => {
  const result = applyFinalSpeechContract("Texto  com   espaços   extras .", {});
  assert.ok(!result.includes("  "), `Espaços duplos: ${result}`);
  assert.ok(!result.includes(" ."), `Espaço antes de ponto: ${result}`);
});

test("12.4 — hasForbiddenPromise com input inválido", () => {
  assert.ok(!hasForbiddenPromise(null));
  assert.ok(!hasForbiddenPromise(undefined));
  assert.ok(!hasForbiddenPromise(""));
  assert.ok(!hasForbiddenPromise(123));
});

test("12.5 — detectEmotionalContext com input inválido", () => {
  assert.ok(!detectEmotionalContext(null));
  assert.ok(!detectEmotionalContext(undefined));
  assert.ok(!detectEmotionalContext(""));
});

// ---------------------------------------------------------------------------
// RESULTADO FINAL
// ---------------------------------------------------------------------------
console.log(`\n══ RESULTADO: ${passed} passed, ${failed} failed ══\n`);
if (failed > 0) process.exit(1);
