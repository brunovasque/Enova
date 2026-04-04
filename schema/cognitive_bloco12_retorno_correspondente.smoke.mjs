/**
 * cognitive_bloco12_retorno_correspondente.smoke.mjs
 *
 * Smoke tests dedicados ao BLOCO 12 do quadro cognitivo:
 *   - Retorno do Correspondente (casca cognitiva)
 *
 * Contrato canônico verificado:
 *  1. buildCognitiveBloco12Reply existe e cobre 11 status canônicos
 *  2. aprovado e aprovado_condicionado → mesma condução comercial, puxam visita
 *  3. reprovado com motivo → explica sem valores
 *  4. pendencia_documental ≠ pendencia_risco
 *  5. em_analise_com_prazo → NÃO inventa prazo
 *  6. nao_identificado → NÃO chuta status
 *  7. Classificação inline detecta todos os status
 *  8. __cognitive_v2_takes_final garante fala única
 *  9. Reset/greeting limpa flags cognitivas
 * 10. Name mismatch limpa flags cognitivas
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
// Extract buildCognitiveBloco12Reply from worker source
// ================================================================
const fnMatch = workerSrc.match(
  /function buildCognitiveBloco12Reply\(statusCanonico, motivo\)\s*\{([\s\S]*?)\n\}\n/
);
assert.ok(fnMatch, "buildCognitiveBloco12Reply must exist in worker");

const buildCognitiveBloco12Reply = new Function(
  "statusCanonico",
  "motivo",
  fnMatch[1]
);

// ================================================================
// Helper: inline classifier (mirrors worker logic)
// ================================================================
function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function classifyInline(rawText) {
  const ntMsg = normalizeText(rawText);
  const hasAny = (terms) => terms.some((term) => ntMsg.includes(term));

  const reprovado = /\b(reprovado|credito reprovado|negado|nao aprovado)\b/.test(ntMsg);
  const pendenciaRisco = hasAny([
    "conres", "sinad", "comprometimento de renda",
    "margem financeira comprometida",
    "proponente grupo familiar com margem financeira comprometida",
    "impactada por compromissos financeiros na caixa e ou em outros bancos",
    "scr", "registrato", "bacen", "serasa", "spc", "protesto",
    "restricao", "restricoes", "divida", "dividas"
  ]);
  const pendenciaDocumental = hasAny([
    "pendencia documental", "complemento documental", "documento adicional",
    "complementar documento", "complementacao documental", "ajuste documental",
    "pendencia de documento", "falta de documento", "documentacao pendente"
  ]);
  const aprovadoCondicionado = hasAny([
    "aprovado condicionado", "aprovacao condicionada", "credito aprovado condicionado",
    "pre aprovacao condicionada", "aprovado com ressalvas", "aprovado com condicoes"
  ]);
  const aprovado = /\b(aprovado|aprovada|credito aprovado|liberado|liberada)\b/.test(ntMsg);
  const analiseAtiva = hasAny(["analise ativa", "ja existe analise", "analise ativa existente"]);
  const aguardandoCartinha = hasAny(["cartinha de cancelamento", "carta de cancelamento", "cartinha cancelamento"]);
  const aguardandoAutorizacao = hasAny(["aguardando autorizacao", "pendente de autorizacao", "falta autorizacao"]);
  const emAnalise = /\b(em analise|em andamento|analise em andamento|analise em curso)\b/.test(ntMsg);
  const prazoRetorno = ntMsg.match(/(\d+)\s*(hora|horas|h\b|dia|dias|util|uteis)/);

  let status = "nao_identificado";
  if (reprovado) status = "reprovado";
  else if (pendenciaRisco) status = "pendencia_risco";
  else if (pendenciaDocumental) status = "pendencia_documental";
  else if (aprovadoCondicionado) status = "aprovado_condicionado";
  else if (aprovado) status = "aprovado";
  else if (analiseAtiva) status = "analise_ativa_existente";
  else if (aguardandoCartinha) status = "aguardando_cartinha_cancelamento";
  else if (aguardandoAutorizacao) status = "aguardando_autorizacao";
  else if (emAnalise && prazoRetorno) status = "em_analise_com_prazo";
  else if (emAnalise) status = "em_analise";

  return { status, prazoRetorno };
}

// ================================================================
// SEÇÃO A — buildCognitiveBloco12Reply: cobertura dos 11 status
// ================================================================

console.log("\n🧪 BLOCO 12 — buildCognitiveBloco12Reply: 11 status canônicos\n");

await asyncTest("1. aprovado → reply exists, mentions pré-aprovação, mentions visita", async () => {
  const reply = buildCognitiveBloco12Reply("aprovado", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("pre-") || n.includes("aprovad") || n.includes("positiva"), "must mention approval");
  assert.ok(n.includes("visita") || n.includes("plantao"), "must mention visita");
  assert.ok(!n.includes("valor") && !n.includes("r$"), "must NOT mention values");
});

await asyncTest("2. aprovado_condicionado → same commercial conduct as aprovado, mentions visita", async () => {
  const replyAprov = buildCognitiveBloco12Reply("aprovado", null);
  const replyCond = buildCognitiveBloco12Reply("aprovado_condicionado", null);
  assert.ok(replyCond, "must return a string");
  const n = nf(replyCond);
  assert.ok(n.includes("visita") || n.includes("plantao"), "must mention visita");
  // Same commercial conduct
  assert.strictEqual(replyAprov, replyCond, "aprovado and aprovado_condicionado must have same text");
});

await asyncTest("3. reprovado sem motivo → respectful, no false hope, no values", async () => {
  const reply = buildCognitiveBloco12Reply("reprovado", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("nao foi aprovad") || n.includes("nao aprovad") || n.includes("infelizmente"), "must mention rejection");
  assert.ok(!n.includes("visita") && !n.includes("plantao"), "must NOT mention visita");
  assert.ok(!n.includes("valor") && !n.includes("r$"), "must NOT mention values");
});

await asyncTest("4. reprovado com motivo → includes motivo in reply", async () => {
  const reply = buildCognitiveBloco12Reply("reprovado", "CONRES ativo");
  assert.ok(reply, "must return a string");
  assert.ok(reply.includes("CONRES ativo"), "must include the motivo text");
});

await asyncTest("5. pendencia_risco sem motivo → mentions restrição, no values, not approval", async () => {
  const reply = buildCognitiveBloco12Reply("pendencia_risco", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("financeiro") || n.includes("restrico") || n.includes("risco") || n.includes("pendencia"), "must mention financial/risk");
  assert.ok(!n.includes("aprovad"), "must NOT sound like approval");
  assert.ok(!n.includes("valor") && !n.includes("r$"), "must NOT mention values");
  assert.ok(n.includes("regulariz") || n.includes("proximo") || n.includes("orientar"), "must offer next steps");
});

await asyncTest("6. pendencia_risco com motivo → includes motivo", async () => {
  const reply = buildCognitiveBloco12Reply("pendencia_risco", "SCR comprometido");
  assert.ok(reply, "must return a string");
  assert.ok(reply.includes("SCR comprometido"), "must include the motivo text");
});

await asyncTest("7. pendencia_documental sem motivo → mentions complemento documental, not risco", async () => {
  const reply = buildCognitiveBloco12Reply("pendencia_documental", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("document") || n.includes("complemento"), "must mention docs");
  assert.ok(!n.includes("risco") && !n.includes("restricao") && !n.includes("restrico"), "must NOT mention risk");
  assert.ok(!n.includes("aprovad"), "must NOT sound like approval");
});

await asyncTest("8. pendencia_documental com motivo → includes motivo", async () => {
  const reply = buildCognitiveBloco12Reply("pendencia_documental", "IRPF faltando");
  assert.ok(reply, "must return a string");
  assert.ok(reply.includes("IRPF faltando"), "must include the motivo text");
});

await asyncTest("9. analise_ativa_existente → explains active analysis, not approval/rejection", async () => {
  const reply = buildCognitiveBloco12Reply("analise_ativa_existente", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("analise ativa") || n.includes("ja existe"), "must explain active analysis");
  assert.ok(!n.includes("aprovad") && !n.includes("reprovad"), "must NOT be approval or rejection");
});

await asyncTest("10. aguardando_cartinha_cancelamento → explains cartinha needed", async () => {
  const reply = buildCognitiveBloco12Reply("aguardando_cartinha_cancelamento", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("cartinha") || n.includes("cancelar") || n.includes("autorizacao"), "must mention cartinha/cancellation");
  assert.ok(!n.includes("aprovad"), "must NOT be approval");
});

await asyncTest("11. aguardando_autorizacao → explains authorization needed, not approval", async () => {
  const reply = buildCognitiveBloco12Reply("aguardando_autorizacao", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("autorizacao") || n.includes("autoriza"), "must mention authorization");
  assert.ok(!n.includes("aprovad") && !n.includes("liberado"), "must NOT sound like credit is released");
});

await asyncTest("12. em_analise_com_prazo com prazo → mentions prazo without inventing it", async () => {
  const reply = buildCognitiveBloco12Reply("em_analise_com_prazo", "48 horas");
  assert.ok(reply, "must return a string");
  assert.ok(reply.includes("48 horas"), "must include the actual prazo");
  const n = nf(reply);
  assert.ok(n.includes("andamento") || n.includes("analise"), "must mention analysis in progress");
});

await asyncTest("13. em_analise_com_prazo sem prazo → no invented prazo", async () => {
  const reply = buildCognitiveBloco12Reply("em_analise_com_prazo", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(!n.match(/\d+\s*(hora|dia)/), "must NOT invent a specific prazo");
});

await asyncTest("14. em_analise → calm, no loop, no approval/rejection", async () => {
  const reply = buildCognitiveBloco12Reply("em_analise", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("andamento") || n.includes("analise"), "must mention analysis in progress");
  assert.ok(!n.includes("aprovad") && !n.includes("reprovad"), "must NOT be approval or rejection");
  assert.ok(n.length > 30, "must not be a dry loop response");
});

await asyncTest("15. nao_identificado → safe, no guessing, asks for clarification", async () => {
  const reply = buildCognitiveBloco12Reply("nao_identificado", null);
  assert.ok(reply, "must return a string");
  const n = nf(reply);
  assert.ok(n.includes("validar") || n.includes("confirmar") || n.includes("encaminhar") || n.includes("trecho"), "must ask for clarification");
  assert.ok(!n.includes("aprovad") && !n.includes("reprovad"), "must NOT guess a status");
});

// ================================================================
// SEÇÃO B — Inline classifier: correct status detection
// ================================================================

console.log("\n🧪 BLOCO 12 — Inline classifier: detecção de status\n");

await asyncTest("16. 'crédito aprovado' → aprovado", async () => {
  assert.strictEqual(classifyInline("Crédito aprovado").status, "aprovado");
});

await asyncTest("17. 'aprovado condicionado' → aprovado_condicionado", async () => {
  assert.strictEqual(classifyInline("Aprovado condicionado, pendência de seguro").status, "aprovado_condicionado");
});

await asyncTest("18. 'reprovado' → reprovado", async () => {
  assert.strictEqual(classifyInline("Crédito reprovado - score insuficiente").status, "reprovado");
});

await asyncTest("19. 'CONRES ativo' → pendencia_risco", async () => {
  assert.strictEqual(classifyInline("CONRES ativo para proponente").status, "pendencia_risco");
});

await asyncTest("20. 'SINAD pendente' → pendencia_risco", async () => {
  assert.strictEqual(classifyInline("SINAD pendente - verificar regularização").status, "pendencia_risco");
});

await asyncTest("21. 'pendência documental' → pendencia_documental", async () => {
  assert.strictEqual(classifyInline("Pendência documental: IRPF faltante").status, "pendencia_documental");
});

await asyncTest("22. 'SCR comprometido' → pendencia_risco (not documental)", async () => {
  assert.strictEqual(classifyInline("SCR comprometido acima do limite").status, "pendencia_risco");
});

await asyncTest("23. reprovado > pendencia_risco priority", async () => {
  assert.strictEqual(classifyInline("Reprovado por CONRES ativo").status, "reprovado");
});

await asyncTest("24. 'análise ativa existente' → analise_ativa_existente", async () => {
  assert.strictEqual(classifyInline("Já existe análise ativa para esse CPF").status, "analise_ativa_existente");
});

await asyncTest("25. 'cartinha de cancelamento' → aguardando_cartinha_cancelamento", async () => {
  assert.strictEqual(classifyInline("Necessária cartinha de cancelamento da análise anterior").status, "aguardando_cartinha_cancelamento");
});

await asyncTest("26. 'aguardando autorização' → aguardando_autorizacao", async () => {
  assert.strictEqual(classifyInline("Aguardando autorização formal do gerente").status, "aguardando_autorizacao");
});

await asyncTest("27. 'em análise com prazo 48 horas' → em_analise_com_prazo", async () => {
  const r = classifyInline("Em análise, retorno em 48 horas");
  assert.strictEqual(r.status, "em_analise_com_prazo");
  assert.ok(r.prazoRetorno, "must extract prazo");
  assert.strictEqual(r.prazoRetorno[1], "48");
});

await asyncTest("28. 'em andamento' → em_analise", async () => {
  assert.strictEqual(classifyInline("Caso em andamento, sem previsão").status, "em_analise");
});

await asyncTest("29. 'bom dia' (saudação) → nao_identificado (noise path)", async () => {
  assert.strictEqual(classifyInline("bom dia, alguma novidade?").status, "nao_identificado");
});

await asyncTest("30. text without keywords → nao_identificado", async () => {
  assert.strictEqual(classifyInline("pode me ligar quando puder?").status, "nao_identificado");
});

await asyncTest("31. 'liberada' → aprovado", async () => {
  assert.strictEqual(classifyInline("Operação liberada pelo correspondente").status, "aprovado");
});

await asyncTest("32. 'negado' → reprovado", async () => {
  assert.strictEqual(classifyInline("Crédito negado por restrição interna").status, "reprovado");
});

await asyncTest("33. 'aprovado com ressalvas' → aprovado_condicionado", async () => {
  assert.strictEqual(classifyInline("Aprovado com ressalvas, limite reduzido").status, "aprovado_condicionado");
});

await asyncTest("34. 'comprometimento de renda' → pendencia_risco", async () => {
  assert.strictEqual(classifyInline("Proponente com comprometimento de renda alto").status, "pendencia_risco");
});

await asyncTest("35. 'margem financeira comprometida' → pendencia_risco", async () => {
  assert.strictEqual(classifyInline("Margem financeira comprometida na Caixa").status, "pendencia_risco");
});

await asyncTest("36. 'em análise 5 dias' → em_analise_com_prazo", async () => {
  const r = classifyInline("Em análise, previsão de retorno em 5 dias");
  assert.strictEqual(r.status, "em_analise_com_prazo");
  assert.strictEqual(r.prazoRetorno[1], "5");
});

// ================================================================
// SEÇÃO C — Contract rules
// ================================================================

console.log("\n🧪 BLOCO 12 — Regras de contrato\n");

await asyncTest("37. aprovado reply does NOT include values (R$)", async () => {
  const reply = buildCognitiveBloco12Reply("aprovado", null);
  assert.ok(!reply.includes("R$"), "must NOT mention currency");
  assert.ok(!/\d{2,}\.?\d{3}/.test(reply), "must NOT include large numbers");
});

await asyncTest("38. reprovado reply does NOT sell false hope", async () => {
  const reply = buildCognitiveBloco12Reply("reprovado", null);
  const n = nf(reply);
  assert.ok(!n.includes("com certeza") && !n.includes("garantia"), "must NOT guarantee anything");
  assert.ok(!n.includes("visita") && !n.includes("plantao"), "must NOT mention visita");
});

await asyncTest("39. pendencia_documental and pendencia_risco have DIFFERENT replies", async () => {
  const replyDoc = buildCognitiveBloco12Reply("pendencia_documental", null);
  const replyRisk = buildCognitiveBloco12Reply("pendencia_risco", null);
  assert.notStrictEqual(replyDoc, replyRisk, "doc and risk must be different replies");
});

await asyncTest("40. em_analise reply is calm, not a dry loop", async () => {
  const reply = buildCognitiveBloco12Reply("em_analise", null);
  assert.ok(reply.length > 50, "must not be a dry/short loop message");
});

await asyncTest("41. nao_identificado does NOT guess any specific status", async () => {
  const reply = buildCognitiveBloco12Reply("nao_identificado", null);
  const n = nf(reply);
  assert.ok(!n.includes("aprovad"), "must NOT guess approval");
  assert.ok(!n.includes("reprovad"), "must NOT guess rejection");
  assert.ok(!n.includes("pendencia"), "must NOT guess pendencia");
  assert.ok(!n.includes("risco"), "must NOT guess risco");
});

// ================================================================
// SEÇÃO D — Worker source verification (structural checks)
// ================================================================

console.log("\n🧪 BLOCO 12 — Verificação estrutural no worker\n");

await asyncTest("42. worker sets __cognitive_v2_takes_final for aprovado path", async () => {
  assert.ok(
    workerSrc.includes("cogBloco12Aprov") && workerSrc.includes("__cognitive_v2_takes_final = true"),
    "aprovado path must set v2_takes_final"
  );
});

await asyncTest("43. worker sets cognitive prefix for reprovado path", async () => {
  assert.ok(
    workerSrc.includes("cogBloco12Repr"),
    "reprovado path must build cognitive reply"
  );
});

await asyncTest("44. worker sets cognitive prefix for pendencia_risco path", async () => {
  assert.ok(
    workerSrc.includes("cogBloco12Risk"),
    "pendencia_risco path must build cognitive reply"
  );
});

await asyncTest("45. worker sets cognitive prefix for pendencia_documental path", async () => {
  assert.ok(
    workerSrc.includes("cogBloco12Doc"),
    "pendencia_documental path must build cognitive reply"
  );
});

await asyncTest("46. worker clears cognitive flags for reset/greeting path", async () => {
  // Check that the anti-loop section clears cognitive flags
  const resetSection = workerSrc.slice(
    workerSrc.indexOf("Anti-loop: saudacao/reset em aguardando_retorno_correspondente"),
    workerSrc.indexOf("Anti-loop: saudacao/reset em aguardando_retorno_correspondente") + 500
  );
  assert.ok(
    resetSection.includes("__cognitive_reply_prefix = null"),
    "reset path must clear cognitive prefix"
  );
  assert.ok(
    resetSection.includes("__cognitive_v2_takes_final = false"),
    "reset path must clear v2_takes_final"
  );
});

await asyncTest("47. worker clears cognitive flags for name mismatch path", async () => {
  const mismatchSection = workerSrc.slice(
    workerSrc.indexOf("mensagem mecânica é mais precisa para mismatch"),
    workerSrc.indexOf("mensagem mecânica é mais precisa para mismatch") + 200
  );
  assert.ok(
    mismatchSection.includes("__cognitive_reply_prefix = null"),
    "mismatch path must clear cognitive prefix"
  );
});

await asyncTest("48. worker sets cognitive prefix for nao_identificado fallback", async () => {
  assert.ok(
    workerSrc.includes("cogBloco12Fallback"),
    "nao_identificado fallback must build cognitive reply"
  );
});

await asyncTest("49. aprovado path still goes to agendamento_visita (nextStage preserved)", async () => {
  // Find the aprovado step() call and verify it routes to agendamento_visita
  const aprovSection = workerSrc.slice(
    workerSrc.indexOf("cogBloco12Aprov"),
    workerSrc.indexOf("cogBloco12Aprov") + 600
  );
  assert.ok(
    aprovSection.includes('"agendamento_visita"'),
    "aprovado must route to agendamento_visita"
  );
});

await asyncTest("50. all 11 canonical statuses in CORRESPONDENTE_RETURN_STATUS_CANONICAL", async () => {
  const expected = [
    "analise_ativa_existente", "aguardando_cartinha_cancelamento",
    "aguardando_autorizacao", "em_analise_com_prazo", "aprovado",
    "aprovado_condicionado", "reprovado", "pendencia_documental",
    "pendencia_risco", "em_analise", "nao_identificado"
  ];
  for (const s of expected) {
    assert.ok(
      workerSrc.includes(`"${s}"`),
      `status "${s}" must be in worker source`
    );
  }
});

await asyncTest("51. buildCognitiveBloco12Reply covers all 11 statuses (non-null)", async () => {
  const statuses = [
    "aprovado", "aprovado_condicionado", "reprovado",
    "pendencia_risco", "pendencia_documental",
    "analise_ativa_existente", "aguardando_cartinha_cancelamento",
    "aguardando_autorizacao", "em_analise_com_prazo", "em_analise",
    "nao_identificado"
  ];
  for (const s of statuses) {
    const reply = buildCognitiveBloco12Reply(s, null);
    assert.ok(reply, `reply for "${s}" must not be null`);
    assert.ok(reply.length > 20, `reply for "${s}" must have meaningful content`);
  }
});

await asyncTest("52. em_analise handler persists retorno_correspondente_status", async () => {
  // Find the handler section (not the helper function) - search for the upsertState call
  const marker = 'cogB12Analise = buildCognitiveBloco12Reply("em_analise"';
  const idx = workerSrc.indexOf(marker);
  assert.ok(idx > 0, "em_analise handler section must exist");
  const emAnaliseSection = workerSrc.slice(Math.max(0, idx - 400), idx + 200);
  assert.ok(
    emAnaliseSection.includes('retorno_correspondente_status: "em_analise"'),
    "em_analise handler must persist status"
  );
});

// ================================================================
// Summary
// ================================================================
console.log(`\n📊 BLOCO 12 Smoke Results: ${passed} passed, ${failed} failed out of ${passed + failed}\n`);
if (failed > 0) process.exit(1);
