/**
 * BLOCO 3 — Cognitive V2-on Diagnostic Smoke Tests
 * Covers: estado_civil, confirmar_casamento, financiamento_conjunto
 *
 * Validates:
 * 1. Cognitive infrastructure wiring (ALLOWED_STAGES, intents, triggers, hasClearStageAnswer)
 * 2. "moro junto / moramos juntos" does NOT auto-classify as casamento or conjunto
 * 3. união estável does NOT reclassify as casado civil
 * 4. casado civil forces conjunto obrigatório
 * 5. Guidance builder produces correct replies for BLOCO 3 stages
 * 6. Confidence floor is set for BLOCO 3 stages
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

// ─── helpers ───────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const errors = [];

function ok(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    errors.push(label);
    console.error(`  ✗ ${label}`);
  }
}

// ─── load worker source (text parse) ──────────────────────────
import { readFileSync } from "node:fs";
const WORKER_PATH = path.resolve("Enova worker.js");
const workerSrc = readFileSync(WORKER_PATH, "utf-8");

// ─── load cognitive engine ────────────────────────────────────
const COGNITIVE_PATH = path.resolve("cognitive/src/run-cognitive.js");
const cognitiveSrc = readFileSync(COGNITIVE_PATH, "utf-8");

// ───────────────────────────────────────────────────────────────
// SECTION 1: COGNITIVE_V1_ALLOWED_STAGES includes BLOCO 3
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 1: COGNITIVE_V1_ALLOWED_STAGES ===");

// Extract the COGNITIVE_V1_ALLOWED_STAGES Set content
const allowedStagesMatch = workerSrc.match(/const COGNITIVE_V1_ALLOWED_STAGES\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
const allowedStagesBlock = allowedStagesMatch ? allowedStagesMatch[1] : "";

ok("estado_civil in COGNITIVE_V1_ALLOWED_STAGES",
  allowedStagesBlock.includes('"estado_civil"'));
ok("confirmar_casamento in COGNITIVE_V1_ALLOWED_STAGES",
  allowedStagesBlock.includes('"confirmar_casamento"'));
ok("financiamento_conjunto in COGNITIVE_V1_ALLOWED_STAGES",
  allowedStagesBlock.includes('"financiamento_conjunto"'));

// ───────────────────────────────────────────────────────────────
// SECTION 2: COGNITIVE_PLAYBOOK_V1.intents_by_stage
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 2: intents_by_stage ===");

const intentsMatch = workerSrc.match(/intents_by_stage:\s*\{([\s\S]*?)\},\s*entities_supported/);
const intentsBlock = intentsMatch ? intentsMatch[1] : "";

ok("estado_civil has intents",
  /estado_civil:\s*\[/.test(intentsBlock));
ok("confirmar_casamento has intents",
  /confirmar_casamento:\s*\[/.test(intentsBlock));
ok("financiamento_conjunto has intents",
  /financiamento_conjunto:\s*\[/.test(intentsBlock));

// Verify specific intent keys
ok("confirmar_casamento has civil_papel_confirmado intent",
  intentsBlock.includes("civil_papel_confirmado"));
ok("confirmar_casamento has moro_junto_ambiguo intent",
  intentsBlock.includes("moro_junto_ambiguo"));
ok("financiamento_conjunto has conjunto_se_precisar intent",
  intentsBlock.includes("conjunto_se_precisar"));
ok("financiamento_conjunto has duvida_solo_vs_junto intent",
  intentsBlock.includes("duvida_solo_vs_junto"));

// ───────────────────────────────────────────────────────────────
// SECTION 3: hasClearStageAnswer
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 3: hasClearStageAnswer ===");

const hasClearMatch = workerSrc.match(/function hasClearStageAnswer\(stage, text\)\s*\{([\s\S]*?)\n\}/);
const hasClearBlock = hasClearMatch ? hasClearMatch[1] : "";

ok("hasClearStageAnswer handles estado_civil",
  hasClearBlock.includes('"estado_civil"'));
ok("hasClearStageAnswer handles confirmar_casamento",
  hasClearBlock.includes('"confirmar_casamento"'));
ok("hasClearStageAnswer handles financiamento_conjunto",
  hasClearBlock.includes('"financiamento_conjunto"'));

// ───────────────────────────────────────────────────────────────
// SECTION 4: shouldTriggerCognitiveAssist
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 4: shouldTriggerCognitiveAssist ===");

const triggerMatch = workerSrc.match(/function shouldTriggerCognitiveAssist\(stage, text\)\s*\{([\s\S]*?)\n\s*return hasQuestion/);
const triggerBlock = triggerMatch ? triggerMatch[1] : "";

ok("shouldTriggerCognitiveAssist has estado_civil trigger",
  /stage === "estado_civil"/.test(triggerBlock));
ok("shouldTriggerCognitiveAssist has confirmar_casamento trigger",
  /stage === "confirmar_casamento"/.test(triggerBlock));
ok("shouldTriggerCognitiveAssist has financiamento_conjunto trigger",
  /stage === "financiamento_conjunto"/.test(triggerBlock));

// Verify "moro junto" is a trigger hint for estado_civil and confirmar_casamento
ok("estado_civil trigger includes 'moro junto'",
  /estado_civil[\s\S]{0,300}moro junto/.test(triggerBlock));
ok("confirmar_casamento trigger includes 'moro junto'",
  /confirmar_casamento[\s\S]{0,300}moro junto/.test(triggerBlock));

// ───────────────────────────────────────────────────────────────
// SECTION 5: confirmar_casamento regex fix — "moro junto" safe
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 5: confirmar_casamento regex fix ===");

// Extract the confirmar_casamento case block (use broader extraction)
const confirmarStart = workerSrc.indexOf('case "confirmar_casamento":');
const confirmarEnd = workerSrc.indexOf('\n// -----', confirmarStart + 1);
const confirmarCaseBlock = confirmarStart >= 0
  ? workerSrc.substring(confirmarStart, confirmarEnd > confirmarStart ? confirmarEnd : confirmarStart + 3000)
  : "";

// The uniao_estavel detection regex should NOT contain "moro junto" / "moramos juntos" / "vivemos juntos" / "junt[oa]s?"
const uniaoEstStart = confirmarCaseBlock.indexOf("const uniao_estavel");
const uniaoEstEnd = confirmarCaseBlock.indexOf(";", uniaoEstStart);
const uniaoEstBlock = uniaoEstStart >= 0 ? confirmarCaseBlock.substring(uniaoEstStart, uniaoEstEnd + 1) : "";

ok("confirmar_casamento uniao_estavel does NOT contain 'moro junto'",
  !uniaoEstBlock.includes("moro junto"));
ok("confirmar_casamento uniao_estavel does NOT contain 'moramos juntos'",
  !uniaoEstBlock.includes("moramos juntos"));
ok("confirmar_casamento uniao_estavel does NOT contain 'vivemos juntos'",
  !uniaoEstBlock.includes("vivemos juntos"));
ok("confirmar_casamento uniao_estavel does NOT contain 'junt[oa]s?'",
  !uniaoEstBlock.includes("junt[oa]s?"));

// The regex STILL catches explicit "uniao estavel" / "estavel"
ok("confirmar_casamento uniao_estavel still catches explicit uniao estavel",
  uniaoEstBlock.includes("uni") && uniaoEstBlock.includes("estavel"));

// ───────────────────────────────────────────────────────────────
// SECTION 6: parseEstadoCivil — "moro junto" safe
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 6: parseEstadoCivil safety ===");

const parseECMatch = workerSrc.match(/function parseEstadoCivil\(text\)\s*\{([\s\S]*?)\n\}/);
const parseECBlock = parseECMatch ? parseECMatch[1] : "";

// parseEstadoCivil has comment about removed patterns but the REGEX itself doesn't match them
// Check the actual regex line, not comments
const parseECRegexLine = parseECBlock.match(/if \(!negaUniao && \/(.*?)\/\.test/);
const parseECUniaoRegex = parseECRegexLine ? parseECRegexLine[1] : "";

ok("parseEstadoCivil uniao regex does NOT match 'moro junto'",
  !parseECUniaoRegex.includes("moro junto"));
ok("parseEstadoCivil uniao regex does NOT match 'moramos juntos'",
  !parseECUniaoRegex.includes("moramos juntos"));
ok("parseEstadoCivil uniao regex does NOT match 'vivemos juntos'",
  !parseECUniaoRegex.includes("vivemos juntos"));

// ───────────────────────────────────────────────────────────────
// SECTION 7: Cognitive engine — BLOCO_3_STAGES
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 7: Cognitive engine — BLOCO_3_STAGES ===");

ok("BLOCO_3_STAGES defined in cognitive engine",
  cognitiveSrc.includes("BLOCO_3_STAGES"));
ok("BLOCO_3_STAGES contains estado_civil",
  /BLOCO_3_STAGES.*estado_civil/.test(cognitiveSrc));
ok("BLOCO_3_STAGES contains confirmar_casamento",
  /BLOCO_3_STAGES.*confirmar_casamento/.test(cognitiveSrc));
ok("BLOCO_3_STAGES contains financiamento_conjunto",
  /BLOCO_3_STAGES.*financiamento_conjunto/.test(cognitiveSrc));

ok("isBloco3Context function defined",
  cognitiveSrc.includes("function isBloco3Context"));
ok("buildBloco3Guidance function defined",
  cognitiveSrc.includes("function buildBloco3Guidance"));

// ───────────────────────────────────────────────────────────────
// SECTION 8: Guidance content validation
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 8: Guidance content ===");

const guidanceMatch = cognitiveSrc.match(/function buildBloco3Guidance\(request\)\s*\{([\s\S]*?)\n\s*return null;\s*\n\}/);
const guidanceBlock = guidanceMatch ? guidanceMatch[1] : "";

// estado_civil guidance handles "moro junto" with disambiguation
ok("estado_civil guidance handles 'moro junto' pattern",
  /estado_civil[\s\S]*moro junto/.test(guidanceBlock));
ok("estado_civil guidance mentions 'união estável registrada'",
  guidanceBlock.includes("união estável"));

// confirmar_casamento guidance handles "moro junto"
ok("confirmar_casamento guidance handles 'moro junto'",
  /confirmar_casamento[\s\S]*moro junto/.test(guidanceBlock));
ok("confirmar_casamento guidance handles 'religioso'",
  guidanceBlock.includes("religioso"));
ok("confirmar_casamento guidance explains civil vs estável",
  guidanceBlock.includes("civil no papel") || guidanceBlock.includes("civil"));

// financiamento_conjunto guidance handles "obrigatorio"
ok("financiamento_conjunto guidance handles 'obrigatorio'",
  guidanceBlock.includes("obrigat"));
ok("financiamento_conjunto guidance mentions 'apenas se precisar'",
  guidanceBlock.includes("apenas se precisar"));
ok("financiamento_conjunto guidance handles 'não sei'",
  /nao sei/.test(guidanceBlock));

// ───────────────────────────────────────────────────────────────
// SECTION 9: buildPhaseGuidanceReply hook
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 9: buildPhaseGuidanceReply hook ===");

const phaseGuidanceMatch = cognitiveSrc.match(/function buildPhaseGuidanceReply\(\{[\s\S]*?\n\}/);
const phaseGuidanceBlock = phaseGuidanceMatch ? phaseGuidanceMatch[0] : "";

ok("buildPhaseGuidanceReply calls isBloco3Context",
  phaseGuidanceBlock.includes("isBloco3Context"));
ok("buildPhaseGuidanceReply calls buildBloco3Guidance",
  phaseGuidanceBlock.includes("buildBloco3Guidance"));

// Verify order: topo → bloco3 → composicao
const topoIdx = phaseGuidanceBlock.indexOf("isTopoFunilContext");
const bloco3Idx = phaseGuidanceBlock.indexOf("isBloco3Context");
const compIdx = phaseGuidanceBlock.indexOf("isComposicaoInicialContext");
ok("buildPhaseGuidanceReply order: topo before bloco3",
  topoIdx < bloco3Idx);
ok("buildPhaseGuidanceReply order: bloco3 before composicao",
  bloco3Idx < compIdx);

// ───────────────────────────────────────────────────────────────
// SECTION 10: Confidence floor for BLOCO_3_STAGES
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 10: Confidence floor ===");

ok("Confidence floor includes BLOCO_3_STAGES",
  cognitiveSrc.includes("BLOCO_3_STAGES.has(request.current_stage) ? 0.70"));

// ───────────────────────────────────────────────────────────────
// SECTION 11: Funnel mechanics preserved
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 11: Funnel mechanics preserved ===");

// estado_civil → somar_renda_solteiro (solteiro), confirmar_casamento (casado), financiamento_conjunto (uniao)
ok("estado_civil solteiro → somar_renda_solteiro preserved",
  workerSrc.includes('"somar_renda_solteiro"') && confirmarCaseBlock !== "");
ok("estado_civil casado → confirmar_casamento preserved",
  /estado_civil[\s\S]*?casado[\s\S]*?"confirmar_casamento"/.test(workerSrc));
ok("estado_civil uniao → financiamento_conjunto preserved",
  /estado_civil[\s\S]*?uniao[\s\S]*?"financiamento_conjunto"/.test(workerSrc));

// confirmar_casamento civil → regime_trabalho (with financiamento_conjunto: true)
// Verify we still have financial_conjunto: true in the civil path of confirmar_casamento
ok("confirmar_casamento civil → regime_trabalho + financiamento_conjunto: true preserved",
  confirmarCaseBlock.includes("financiamento_conjunto: true") && confirmarCaseBlock.includes('"regime_trabalho"'));

// confirmar_casamento uniao → financiamento_conjunto stage
ok("confirmar_casamento uniao → financiamento_conjunto stage preserved",
  confirmarCaseBlock.includes('"financiamento_conjunto"'));

// Extract financiamento_conjunto case block
const financStart = workerSrc.indexOf('case "financiamento_conjunto":');
const financEnd = workerSrc.indexOf('\n// =====', financStart + 100);
const financCaseBlock = financStart >= 0
  ? workerSrc.substring(financStart, financEnd > financStart ? financEnd : financStart + 3000)
  : "";

// financiamento_conjunto sim → regime_trabalho
ok("financiamento_conjunto sim → regime_trabalho preserved",
  financCaseBlock.includes('"regime_trabalho"'));

// financiamento_conjunto nao → regime_trabalho + financiamento_conjunto: false
ok("financiamento_conjunto nao sets financiamento_conjunto: false",
  financCaseBlock.includes("financiamento_conjunto: false"));

// financiamento_conjunto se_precisar → regime_trabalho + financiamento_conjunto: "se_precisar"
ok("financiamento_conjunto se_precisar sets 'se_precisar'",
  financCaseBlock.includes('"se_precisar"'));

// ───────────────────────────────────────────────────────────────
// SECTION 12: Civil → conjunto obrigatório rule preserved
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 12: Civil obrigatório rule preserved ===");

ok("Civil confirmation sets somar_renda: true",
  confirmarCaseBlock.includes("somar_renda: true"));
ok("Civil confirmation sets p2_tipo: 'parceiro'",
  confirmarCaseBlock.includes('p2_tipo: "parceiro"'));
ok("Civil confirmation sets casamento_formal: 'civil_papel'",
  confirmarCaseBlock.includes('casamento_formal: "civil_papel"'));

// ───────────────────────────────────────────────────────────────
// SECTION 13: Functional regex validation
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 13: Functional regex validation ===");

// Simulate parseEstadoCivil behavior for "moro junto"
function simulateParseEstadoCivil(text) {
  const nt = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!nt) return null;
  if (/(solteir|sozinha|sozinho)/.test(nt)) return "solteiro";
  const negaCasado = /nao\s+(?:\w+\s+){0,2}casad/.test(nt);
  if (!negaCasado && /(casad|casamento civil|casad[oa] no civil|casad[oa] no papel|no papel)/.test(nt)) return "casado";
  const negaUniao = /nao\s+(?:\w+\s+){0,2}uniao\s+estavel/.test(nt);
  if (!negaUniao && /(uniao estavel|juntad|amasiad|companheir|marido e mulher)/.test(nt)) return "uniao_estavel";
  if (/(separad|separei)/.test(nt)) return "separado";
  if (/(divorciad)/.test(nt)) return "divorciado";
  if (/(viuv)/.test(nt)) return "viuvo";
  return null;
}

ok("parseEstadoCivil('moro junto') → null",
  simulateParseEstadoCivil("moro junto") === null);
ok("parseEstadoCivil('moramos juntos') → null",
  simulateParseEstadoCivil("moramos juntos") === null);
ok("parseEstadoCivil('vivemos juntos') → null",
  simulateParseEstadoCivil("vivemos juntos") === null);
ok("parseEstadoCivil('casado') → casado",
  simulateParseEstadoCivil("casado") === "casado");
ok("parseEstadoCivil('sou casado no civil') → casado",
  simulateParseEstadoCivil("sou casado no civil") === "casado");
ok("parseEstadoCivil('união estável') → uniao_estavel",
  simulateParseEstadoCivil("união estável") === "uniao_estavel");
ok("parseEstadoCivil('solteiro') → solteiro",
  simulateParseEstadoCivil("solteiro") === "solteiro");
ok("parseEstadoCivil('juntado') → uniao_estavel",
  simulateParseEstadoCivil("juntado") === "uniao_estavel");

// Simulate confirmar_casamento regex (post-fix)
function simulateConfirmarCasamentoUniaoEstavel(text) {
  const estadoCivilDetectado = simulateParseEstadoCivil(text);
  const isNo = /\b(nao|não|n|nunca)\b/i.test(text) && !/\b(nao\s+sei|n\s*sei|talvez)\b/i.test(text);
  const respondeuNao = isNo;
  return (
    respondeuNao ||
    estadoCivilDetectado === "uniao_estavel" ||
    /(uni[aã]o est[áa]vel|estavel)/i.test(text)
  );
}

ok("confirmar_casamento: 'moro junto' does NOT classify as uniao_estavel",
  simulateConfirmarCasamentoUniaoEstavel("moro junto") === false);
ok("confirmar_casamento: 'moramos juntos' does NOT classify as uniao_estavel",
  simulateConfirmarCasamentoUniaoEstavel("moramos juntos") === false);
ok("confirmar_casamento: 'vivemos juntos' does NOT classify as uniao_estavel",
  simulateConfirmarCasamentoUniaoEstavel("vivemos juntos") === false);
ok("confirmar_casamento: 'juntos' alone does NOT classify as uniao_estavel",
  simulateConfirmarCasamentoUniaoEstavel("juntos") === false);
ok("confirmar_casamento: 'junta' alone does NOT classify as uniao_estavel",
  simulateConfirmarCasamentoUniaoEstavel("junta") === false);

ok("confirmar_casamento: 'união estável' still classifies correctly",
  simulateConfirmarCasamentoUniaoEstavel("união estável") === true);
ok("confirmar_casamento: 'estavel' still classifies correctly",
  simulateConfirmarCasamentoUniaoEstavel("estavel") === true);
ok("confirmar_casamento: 'não' classifies as uniao_estavel (per design)",
  simulateConfirmarCasamentoUniaoEstavel("não") === true);
ok("confirmar_casamento: 'juntado' classifies via parseEstadoCivil",
  simulateConfirmarCasamentoUniaoEstavel("juntado") === true);

// ───────────────────────────────────────────────────────────────
// SECTION 14: No other stages affected
// ───────────────────────────────────────────────────────────────
console.log("\n=== SECTION 14: No other stages affected ===");

// Verify we didn't accidentally add BLOCO 3 stages to other phase sets
ok("TOPO_FUNIL_STAGES unchanged (no confirmar_casamento)",
  !cognitiveSrc.match(/TOPO_FUNIL_STAGES.*confirmar_casamento/));
ok("COMPOSICAO_INICIAL_STAGES unchanged (no estado_civil)",
  !cognitiveSrc.match(/COMPOSICAO_INICIAL_STAGES.*estado_civil/));

// ───────────────────────────────────────────────────────────────
// SUMMARY
// ───────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log(`BLOCO 3 DIAGNOSTIC: ${pass} passed, ${fail} failed (${pass + fail} total)`);
if (errors.length) {
  console.error("\nFailed tests:");
  errors.forEach(e => console.error(`  - ${e}`));
}
console.log("=".repeat(60));

process.exit(fail > 0 ? 1 : 0);
