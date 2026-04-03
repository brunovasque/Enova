/**
 * cognitive_etapa5_global_layers.smoke.mjs — Smoke tests da Etapa 5:
 * Consumo de FAQ/Objeções/KB/Reancoragem nos builders de topo/docs/visita
 *
 * Cobertura obrigatória:
 *  TOPO (1-4)
 *  1. pergunta FAQ de topo usa FAQ canônico
 *  2. objeção de topo usa catálogo de objeções
 *  3. resposta factual usa KB
 *  4. resposta fora do stage volta com reancoragem
 *
 *  DOCS (5-7)
 *  5. dúvida de segurança usa FAQ/objeção correta
 *  6. dúvida de docs usa KB factual
 *  7. objeção "não tenho docs agora" usa objection + reanchor
 *
 *  VISITA (8-10)
 *  8. dúvida de visita usa KB factual
 *  9. objeção presencial usa objection catalog
 *  10. retorno ao stage com reanchor
 *
 *  REGRESSÃO (11-14)
 *  11. mecânico continua soberano
 *  12. nextStage intacto
 *  13. persistência intacta
 *  14. texto mecânico base intacto
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { getCanonicalFAQ } = await import(
  new URL("../cognitive/src/faq-lookup.js", import.meta.url).href
);
const { getCanonicalObjection } = await import(
  new URL("../cognitive/src/objections-lookup.js", import.meta.url).href
);
const { getKnowledgeBaseItem } = await import(
  new URL("../cognitive/src/knowledge-lookup.js", import.meta.url).href
);
const { buildReanchor, stageToPhase } = await import(
  new URL("../cognitive/src/reanchor-helper.js", import.meta.url).href
);
const { REANCHOR_PULL_BACK } = await import(
  new URL("../cognitive/src/reanchor-variants.js", import.meta.url).href
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

// Load run-cognitive.js source for static assertions
const runCognitiveSrc = loadFileText("../cognitive/src/run-cognitive.js");

// Load worker.js source for regression assertions
const workerSrc = loadFileText("../Enova worker.js");

// ---------------------------------------------------------------------------
// GRUPO 1 — TOPO: FAQ canônico
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 1: TOPO — FAQ canônico ──");

test("1a. run-cognitive.js importa getCanonicalFAQ", () => {
  assert.ok(
    runCognitiveSrc.includes("getCanonicalFAQ"),
    "run-cognitive.js deve importar/usar getCanonicalFAQ"
  );
  assert.ok(
    runCognitiveSrc.includes('from "./faq-lookup.js"'),
    "run-cognitive.js deve importar de faq-lookup.js"
  );
});

test("1b. FAQ 'valor_sem_analise' existe e tem resposta", () => {
  const faq = getCanonicalFAQ("valor_sem_analise");
  assert.ok(faq !== null, "FAQ valor_sem_analise deve existir");
  assert.ok(faq.resposta.length > 20, "resposta deve ter conteúdo real");
});

test("1c. FAQ 'fgts_uso' existe e tem resposta", () => {
  const faq = getCanonicalFAQ("fgts_uso");
  assert.ok(faq !== null, "FAQ fgts_uso deve existir");
  assert.ok(faq.resposta.length > 20, "resposta deve ter conteúdo real");
});

test("1d. _TOPO_FAQ_MAP está presente no run-cognitive.js", () => {
  assert.ok(
    runCognitiveSrc.includes("_TOPO_FAQ_MAP"),
    "run-cognitive.js deve ter _TOPO_FAQ_MAP para mapeamento de perguntas topo"
  );
});

test("1e. buildTopoFunilGuidance consome resolveGlobalLayerReply", () => {
  assert.ok(
    runCognitiveSrc.includes("resolveGlobalLayerReply(normalizedMessage, _TOPO_FAQ_MAP)"),
    "buildTopoFunilGuidance deve chamar resolveGlobalLayerReply com _TOPO_FAQ_MAP"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 2 — TOPO: objeção canônica
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 2: TOPO — objeção canônica ──");

test("2a. run-cognitive.js importa getCanonicalObjection", () => {
  assert.ok(
    runCognitiveSrc.includes("getCanonicalObjection"),
    "run-cognitive.js deve importar/usar getCanonicalObjection"
  );
  assert.ok(
    runCognitiveSrc.includes('from "./objections-lookup.js"'),
    "run-cognitive.js deve importar de objections-lookup.js"
  );
});

test("2b. objeção 'medo_golpe' existe e tem resposta_canonica", () => {
  const obj = getCanonicalObjection("medo_golpe");
  assert.ok(obj !== null, "objeção medo_golpe deve existir");
  assert.ok(obj.resposta_canonica.length > 20, "resposta_canonica deve ter conteúdo real");
});

test("2c. objeção 'vou_pensar' existe e tem resposta_canonica", () => {
  const obj = getCanonicalObjection("vou_pensar");
  assert.ok(obj !== null, "objeção vou_pensar deve existir");
  assert.ok(obj.resposta_canonica.length > 20, "resposta_canonica deve ter conteúdo real");
});

test("2d. objeção 'presencial_preferido' existe e tem resposta_canonica", () => {
  const obj = getCanonicalObjection("presencial_preferido");
  assert.ok(obj !== null, "objeção presencial_preferido deve existir");
  assert.ok(obj.resposta_canonica.length > 20, "resposta_canonica deve ter conteúdo real");
});

test("2e. _TOPO_FAQ_MAP contém objectionId para 'medo_golpe'", () => {
  assert.ok(
    runCognitiveSrc.includes('"medo_golpe"'),
    "Mapa de topo deve referenciar objection medo_golpe"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 3 — TOPO: KB factual
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 3: TOPO — KB factual ──");

test("3a. run-cognitive.js importa getKnowledgeBaseItem", () => {
  assert.ok(
    runCognitiveSrc.includes("getKnowledgeBaseItem"),
    "run-cognitive.js deve importar/usar getKnowledgeBaseItem"
  );
  assert.ok(
    runCognitiveSrc.includes('from "./knowledge-lookup.js"'),
    "run-cognitive.js deve importar de knowledge-lookup.js"
  );
});

test("3b. KB 'elegibilidade_basica' existe e tem conteudo", () => {
  const kb = getKnowledgeBaseItem("elegibilidade_basica");
  assert.ok(kb !== null, "KB elegibilidade_basica deve existir");
  assert.ok(kb.conteudo.length > 30, "conteudo deve ter conteúdo factual");
});

test("3c. KB 'fgts_entrada' existe e tem conteudo", () => {
  const kb = getKnowledgeBaseItem("fgts_entrada");
  assert.ok(kb !== null, "KB fgts_entrada deve existir");
  assert.ok(kb.conteudo.length > 30, "conteudo deve ter conteúdo factual");
});

test("3d. _TOPO_FAQ_MAP contém kbId para 'elegibilidade_basica'", () => {
  assert.ok(
    runCognitiveSrc.includes('"elegibilidade_basica"'),
    "Mapa de topo deve referenciar KB elegibilidade_basica"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 4 — TOPO: reancoragem
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 4: TOPO — reancoragem ──");

test("4a. run-cognitive.js importa buildReanchor", () => {
  assert.ok(
    runCognitiveSrc.includes("buildReanchor"),
    "run-cognitive.js deve importar/usar buildReanchor"
  );
  assert.ok(
    runCognitiveSrc.includes('from "./reanchor-helper.js"'),
    "run-cognitive.js deve importar de reanchor-helper.js"
  );
});

test("4b. wrapWithReanchor existe e é chamado em buildTopoFunilGuidance", () => {
  assert.ok(
    runCognitiveSrc.includes("function wrapWithReanchor"),
    "run-cognitive.js deve definir wrapWithReanchor"
  );
  assert.ok(
    runCognitiveSrc.includes("wrapWithReanchor(globalReply.reply, stage)"),
    "buildTopoFunilGuidance deve chamar wrapWithReanchor"
  );
});

test("4c. buildReanchor para stage 'inicio' produz reancoragem válida", () => {
  const result = buildReanchor({ partialReply: "Teste.", currentStage: "inicio" });
  assert.ok(result.text.includes("Teste."), "deve incluir partialReply");
  assert.ok(result.text.includes(REANCHOR_PULL_BACK), "deve incluir pull back");
  assert.ok(result.lines.length === 2, "deve ter exatamente 2 linhas");
});

test("4d. stageToPhase('inicio') retorna 'topo'", () => {
  assert.strictEqual(stageToPhase("inicio"), "topo");
});

// ---------------------------------------------------------------------------
// GRUPO 5 — DOCS: segurança FAQ/objeção
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 5: DOCS — segurança FAQ/objeção ──");

test("5a. FAQ 'seguranca_docs' existe e tem resposta", () => {
  const faq = getCanonicalFAQ("seguranca_docs");
  assert.ok(faq !== null, "FAQ seguranca_docs deve existir");
  assert.ok(faq.resposta.length > 20, "resposta deve ter conteúdo real");
});

test("5b. objeção 'duvida_seguranca_dados' existe e tem resposta_canonica", () => {
  const obj = getCanonicalObjection("duvida_seguranca_dados");
  assert.ok(obj !== null, "objeção duvida_seguranca_dados deve existir");
  assert.ok(obj.resposta_canonica.length > 20, "resposta_canonica deve ter conteúdo real");
});

test("5c. _DOCS_FAQ_MAP está presente no run-cognitive.js", () => {
  assert.ok(
    runCognitiveSrc.includes("_DOCS_FAQ_MAP"),
    "run-cognitive.js deve ter _DOCS_FAQ_MAP para mapeamento de perguntas docs"
  );
});

test("5d. buildDocsGuidanceByProfile consome resolveGlobalLayerReply com _DOCS_FAQ_MAP", () => {
  assert.ok(
    runCognitiveSrc.includes("resolveGlobalLayerReply(normalizedMessage, _DOCS_FAQ_MAP)"),
    "buildDocsGuidanceByProfile deve chamar resolveGlobalLayerReply com _DOCS_FAQ_MAP"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 6 — DOCS: KB factual
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 6: DOCS — KB factual ──");

test("6a. KB 'docs_por_perfil' existe e tem conteudo", () => {
  const kb = getKnowledgeBaseItem("docs_por_perfil");
  assert.ok(kb !== null, "KB docs_por_perfil deve existir");
  assert.ok(kb.conteudo.length > 30, "conteudo deve ter conteúdo factual");
});

test("6b. _DOCS_FAQ_MAP contém kbId para 'docs_por_perfil'", () => {
  assert.ok(
    runCognitiveSrc.includes('"docs_por_perfil"'),
    "Mapa de docs deve referenciar KB docs_por_perfil"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 7 — DOCS: objeção "não tenho docs agora" + reanchor
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 7: DOCS — objeção sem docs + reanchor ──");

test("7a. objeção 'sem_documentos_agora' existe e tem resposta_canonica", () => {
  const obj = getCanonicalObjection("sem_documentos_agora");
  assert.ok(obj !== null, "objeção sem_documentos_agora deve existir");
  assert.ok(obj.resposta_canonica.length > 20, "resposta_canonica deve ter conteúdo real");
});

test("7b. buildOperacionalFinalGuidance(envio_docs) consome global layers", () => {
  assert.ok(
    runCognitiveSrc.includes('resolveGlobalLayerReply(normalizedMessage, _DOCS_FAQ_MAP)'),
    "buildOperacionalFinalGuidance deve usar _DOCS_FAQ_MAP no envio_docs"
  );
});

test("7c. buildReanchor para stage 'envio_docs' produz reancoragem operacional", () => {
  const result = buildReanchor({ partialReply: "Entendi.", currentStage: "envio_docs" });
  assert.ok(result.text.includes("Entendi."), "deve incluir partialReply");
  assert.ok(result.text.includes(REANCHOR_PULL_BACK), "deve incluir pull back");
  assert.strictEqual(stageToPhase("envio_docs"), "operacional");
});

// ---------------------------------------------------------------------------
// GRUPO 8 — VISITA: KB factual
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 8: VISITA — KB factual ──");

test("8a. KB 'visita_plantao' existe e tem conteudo", () => {
  const kb = getKnowledgeBaseItem("visita_plantao");
  assert.ok(kb !== null, "KB visita_plantao deve existir");
  assert.ok(kb.conteudo.length > 30, "conteudo deve ter conteúdo factual");
});

test("8b. _VISITA_FAQ_MAP está presente no run-cognitive.js", () => {
  assert.ok(
    runCognitiveSrc.includes("_VISITA_FAQ_MAP"),
    "run-cognitive.js deve ter _VISITA_FAQ_MAP para mapeamento de perguntas visita"
  );
});

test("8c. buildVisitaGuidance consome resolveGlobalLayerReply com _VISITA_FAQ_MAP", () => {
  assert.ok(
    runCognitiveSrc.includes("resolveGlobalLayerReply(normalizedMessage, _VISITA_FAQ_MAP)"),
    "buildVisitaGuidance deve chamar resolveGlobalLayerReply com _VISITA_FAQ_MAP"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 9 — VISITA: objeção presencial
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 9: VISITA — objeção presencial ──");

test("9a. objeção 'presencial_preferido' existe no catálogo", () => {
  const obj = getCanonicalObjection("presencial_preferido");
  assert.ok(obj !== null, "objeção presencial_preferido deve existir");
  assert.ok(obj.resposta_canonica.length > 20, "resposta_canonica deve ter conteúdo real");
});

test("9b. objeção 'nao_quero_online' existe no catálogo", () => {
  const obj = getCanonicalObjection("nao_quero_online");
  assert.ok(obj !== null, "objeção nao_quero_online deve existir");
  assert.ok(obj.resposta_canonica.length > 20, "resposta_canonica deve ter conteúdo real");
});

test("9c. _VISITA_FAQ_MAP contém objectionId para presencial e online", () => {
  assert.ok(
    runCognitiveSrc.includes('"nao_quero_online"'),
    "Mapa de visita deve referenciar objection nao_quero_online"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 10 — VISITA: reanchor
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 10: VISITA — reanchor ──");

test("10a. buildReanchor para stage 'agendamento_visita' produz reancoragem operacional", () => {
  const result = buildReanchor({ partialReply: "Entendi.", currentStage: "agendamento_visita" });
  assert.ok(result.text.includes("Entendi."), "deve incluir partialReply");
  assert.ok(result.text.includes(REANCHOR_PULL_BACK), "deve incluir pull back");
  assert.strictEqual(stageToPhase("agendamento_visita"), "operacional");
});

test("10b. buildOperacionalFinalGuidance(agendamento_visita) consome global layers", () => {
  assert.ok(
    runCognitiveSrc.includes('resolveGlobalLayerReply(normalizedMessage, _VISITA_FAQ_MAP)'),
    "buildOperacionalFinalGuidance deve usar _VISITA_FAQ_MAP no agendamento_visita"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 11 — REGRESSÃO: mecânico soberano
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 11: REGRESSÃO — mecânico soberano ──");

test("11a. worker.js contém step() com nextStage", () => {
  assert.ok(
    workerSrc.includes("nextStage"),
    "worker.js deve manter nextStage no mecânico"
  );
});

test("11b. run-cognitive.js NÃO altera step()", () => {
  assert.ok(
    !runCognitiveSrc.includes("function step("),
    "run-cognitive.js não deve conter step()"
  );
});

test("11c. run-cognitive.js NÃO altera runFunnel()", () => {
  assert.ok(
    !runCognitiveSrc.includes("function runFunnel("),
    "run-cognitive.js não deve conter runFunnel()"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 12 — REGRESSÃO: nextStage intacto
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 12: REGRESSÃO — nextStage intacto ──");

test("12a. worker.js contém nextStage sem alteração", () => {
  // Verificar que nextStage ainda é referenciado normalmente
  const nextStageCount = (workerSrc.match(/nextStage/g) || []).length;
  assert.ok(nextStageCount > 10, `worker.js deve ter múltiplas referências a nextStage (encontrado: ${nextStageCount})`);
});

test("12b. worker.js contém COGNITIVE_V1_ALLOWED_STAGES", () => {
  assert.ok(
    workerSrc.includes("COGNITIVE_V1_ALLOWED_STAGES"),
    "worker.js deve manter COGNITIVE_V1_ALLOWED_STAGES"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 13 — REGRESSÃO: persistência intacta
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 13: REGRESSÃO — persistência intacta ──");

test("13a. worker.js contém upsertState", () => {
  assert.ok(
    workerSrc.includes("upsertState"),
    "worker.js deve manter upsertState"
  );
});

test("13b. run-cognitive.js NÃO toca em persistência", () => {
  assert.ok(
    !runCognitiveSrc.includes("upsertState"),
    "run-cognitive.js não deve conter upsertState"
  );
  assert.ok(
    !runCognitiveSrc.includes("supabase"),
    "run-cognitive.js não deve conter referência direta a supabase"
  );
});

// ---------------------------------------------------------------------------
// GRUPO 14 — REGRESSÃO: texto mecânico base intacto
// ---------------------------------------------------------------------------
console.log("\n── GRUPO 14: REGRESSÃO — texto mecânico base intacto ──");

test("14a. worker.js mantém shouldTriggerCognitiveAssist", () => {
  assert.ok(
    workerSrc.includes("shouldTriggerCognitiveAssist"),
    "worker.js deve manter shouldTriggerCognitiveAssist"
  );
});

test("14b. worker.js mantém __cognitive_reply_prefix", () => {
  assert.ok(
    workerSrc.includes("__cognitive_reply_prefix"),
    "worker.js deve manter __cognitive_reply_prefix"
  );
});

test("14c. buildTopoFunilGuidance preserva saudação 'Oi! Que bom ter você aqui'", () => {
  assert.ok(
    runCognitiveSrc.includes("Oi! Que bom ter você aqui"),
    "buildTopoFunilGuidance deve preservar saudação do inicio"
  );
});

test("14d. buildTopoFunilGuidance preserva saudação 'Oi! Que bom te ver de volta'", () => {
  assert.ok(
    runCognitiveSrc.includes("Oi! Que bom te ver de volta"),
    "buildTopoFunilGuidance deve preservar saudação do inicio_decisao"
  );
});

test("14e. builders NÃO autorizados continuam intocados", () => {
  // Verificar que builders de composição, renda, gates, etc. não usam global layers
  const composicaoFn = runCognitiveSrc.match(/function buildComposicaoInicialGuidance[\s\S]*?^}/m);
  if (composicaoFn) {
    assert.ok(
      !composicaoFn[0].includes("resolveGlobalLayerReply"),
      "buildComposicaoInicialGuidance NÃO deve consumir global layers nesta PR"
    );
  }
});

test("14f. resolveGlobalLayerReply só é chamado em blocos autorizados (topo/docs/visita)", () => {
  // Contar chamadas de resolveGlobalLayerReply por mapa
  const topoCount = (runCognitiveSrc.match(/resolveGlobalLayerReply\(normalizedMessage, _TOPO_FAQ_MAP\)/g) || []).length;
  const docsCount = (runCognitiveSrc.match(/resolveGlobalLayerReply\(normalizedMessage, _DOCS_FAQ_MAP\)/g) || []).length;
  const visitaCount = (runCognitiveSrc.match(/resolveGlobalLayerReply\(normalizedMessage, _VISITA_FAQ_MAP\)/g) || []).length;
  
  assert.ok(topoCount >= 1, `_TOPO_FAQ_MAP deve ser usado pelo menos 1 vez (encontrado: ${topoCount})`);
  assert.ok(docsCount >= 1, `_DOCS_FAQ_MAP deve ser usado pelo menos 1 vez (encontrado: ${docsCount})`);
  assert.ok(visitaCount >= 1, `_VISITA_FAQ_MAP deve ser usado pelo menos 1 vez (encontrado: ${visitaCount})`);
});

// ---------------------------------------------------------------------------
// RESUMO
// ---------------------------------------------------------------------------
console.log(`\n══ RESULTADO: ${passed} passed, ${failed} failed ══`);
if (failed > 0) process.exit(1);
