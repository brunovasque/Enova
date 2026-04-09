/**
 * patches_diagnostico_ps_fase3.smoke.mjs
 *
 * Smoke tests para os 3 patches pós-diagnóstico PS Fase 3:
 *   Patch A — topo/identity: speech key dedicada para identity bucket
 *   Patch B — composição stale surface: prefix cognitivo limpo antes de avanço de stage
 *   Patch C — restrição/mojibake: normalizeText antes de temNaoTenho
 */

import { readFileSync } from "fs";

const src = readFileSync(new URL("../Enova worker.js", import.meta.url), "utf8");

let pass = 0;
let fail = 0;

function ok(label, cond) {
  if (cond) { console.log("  ✅ " + label); pass++; }
  else       { console.log("  ❌ " + label); fail++; }
}

// ─────────────────────────────────────────────────────────────
// PATCH A — topo/identity
// ─────────────────────────────────────────────────────────────
console.log("\nPATCH A — topo/identity speech key\n");

ok(
  "A1: início_programa:identity speech key presente em TOPO_HAPPY_PATH_SPEECH",
  src.includes('"inicio_programa:identity"')
);

ok(
  "A2: identity speech key tem cognitiveMessage correto (quem é você?)",
  src.includes('"inicio_programa:identity"') &&
    src.slice(
      src.indexOf('"inicio_programa:identity"'),
      src.indexOf('"inicio_programa:identity"') + 400
    ).includes('"quem é você?"')
);

ok(
  "A3: identity validate usa _isTopoBucketReplyCompatible('identity', reply)",
  src.includes('_isTopoBucketReplyCompatible("identity", reply)')
);

ok(
  "A4: handler de inicio_programa detecta identity bucket (_ambBucket)",
  src.includes("_ambBucket = (!_isFirstAfterReset && !_isGreetingOrReentry)")
);

ok(
  "A5: handler roteia identity bucket para inicio_programa:identity",
  src.includes('_ambBucket === "identity"') &&
    src.includes('"inicio_programa:identity"')
);

// Confirm greeting/how_it_works routing NOT changed
ok(
  "A6: greeting_reentrada routing preservado",
  src.includes('"inicio_programa:greeting_reentrada"')
);

ok(
  "A7: ambiguous routing preservado como fallback (não identity)",
  src.includes('"inicio_programa:ambiguous"')
);

ok(
  "A8: how_it_works fallback inalterado (não é interceptado pelo identity routing)",
  // how_it_works input ("Como funciona?") maps to nao branch not ambiguous branch
  src.includes('"inicio_programa:nao"') &&
    src.includes('nt.includes("como funciona")')
);

// ─────────────────────────────────────────────────────────────
// PATCH B — composição stale surface
// ─────────────────────────────────────────────────────────────
console.log("\nPATCH B — composição stale surface (somar_renda_solteiro)\n");

// Verify all advance branches clear the prefix before return step()
const caseStart = src.indexOf('case "somar_renda_solteiro"');
const caseEnd   = src.indexOf("// C10 — SOMAR RENDA FAMILIAR");
const caseBlock = src.slice(caseStart, caseEnd);

// Helper: check that a particular nextStage has prefix clearing before the return step() that
// uses it as the last argument. Targets the return step pattern (not the telemetry emit).
function hasClearing(nextStage) {
  const re = /return step\(\s*\n([\s\S]*?)\);/g;
  let m;
  while ((m = re.exec(caseBlock)) !== null) {
    const stageMatch = m[1].match(/"([^"]+)"\s*\n?\s*$/);
    if (stageMatch && stageMatch[1] === nextStage) {
      const before = caseBlock.slice(Math.max(0, m.index - 500), m.index);
      return before.includes("st.__cognitive_reply_prefix = null;") &&
             before.includes("st.__cognitive_v2_takes_final = false;") &&
             before.includes("st.__speech_arbiter_source = null;");
    }
  }
  return false;
}

ok(
  "B1: sozinho → fim_ineligivel: prefix limpo antes de return step",
  hasClearing("fim_ineligivel")
);

ok(
  "B2: sozinho → regime_trabalho: prefix limpo antes de return step",
  hasClearing("regime_trabalho")
);

ok(
  "B3: regime_trabalho speech (tipo de trabalho) segue prefix clearing",
  (() => {
    const idx = caseBlock.indexOf("Qual é o seu **tipo de trabalho**");
    if (idx === -1) return false;
    const before = caseBlock.slice(Math.max(0, idx - 300), idx);
    return before.includes("st.__cognitive_reply_prefix = null;");
  })()
);

ok(
  "B4: parceiro → regime_trabalho_parceiro: prefix limpo antes de return step",
  hasClearing("regime_trabalho_parceiro")
);

ok(
  "B5: familiar (com tipo) → pais_casados_civil_pergunta: prefix limpo antes de return step",
  hasClearing("pais_casados_civil_pergunta")
);

ok(
  "B6: familiar (sem tipo) → somar_renda_familiar: prefix limpo antes de return step",
  hasClearing("somar_renda_familiar")
);

ok(
  "B7: fallback (não entendido, mesmo stage) NÃO tem clearing — preserva prefix do reprompt",
  (() => {
    // The fallback branch intentionally sets its own prefix before step(), don't clear it
    const fallbackIdx = caseBlock.lastIndexOf("somar_renda_solteiro (fallback)");
    if (fallbackIdx === -1) return false;
    const after = caseBlock.slice(fallbackIdx, fallbackIdx + 500);
    // Should have prefix SET not null
    return after.includes("st.__cognitive_reply_prefix =") &&
           !after.slice(0, after.indexOf("return step(")).includes("st.__cognitive_reply_prefix = null;");
  })()
);

// ─────────────────────────────────────────────────────────────
// PATCH C — restrição / mojibake
// ─────────────────────────────────────────────────────────────
console.log("\nPATCH C — restrição / normalizeText defensivo\n");

ok(
  "C1: normalizeText aplicado antes de temNaoTenho (variável _userTextNormRestricao)",
  src.includes("_userTextNormRestricao = normalizeText(userText)")
);

ok(
  "C2: temNaoTenho usa _userTextNormRestricao (não userText raw)",
  src.includes("const temNaoTenho = /\\bnao\\s+tenho\\b/.test(_userTextNormRestricao)")
);

ok(
  "C3: regex de temNaoTenho usa 'nao' sem variantes acentuadas (normalizeText já strippou)",
  src.includes("/\\bnao\\s+tenho\\b/") &&
    !src.includes("/\\b(n[aã]o|nao)\\s+tenho\\b/i.test(_userTextNormRestricao)")
);

// Validate logic unchanged: sim still uses !temNaoTenho guard, nao still uses temNaoTenho
ok(
  "C4: guard !temNaoTenho no sim preservado",
  (() => {
    const restricaoBlock = src.slice(
      src.indexOf('case "restricao":'),
      src.indexOf('case "restricao":') + 2000
    );
    return restricaoBlock.includes("!temNaoTenho && (");
  })()
);

ok(
  "C5: nao branch usa temNaoTenho como condição",
  (() => {
    const restricaoBlock = src.slice(
      src.indexOf('case "restricao":'),
      src.indexOf('case "restricao":') + 2000
    );
    return restricaoBlock.includes("temNaoTenho ||");
  })()
);

// Mojibake unit check
ok(
  "C6 (inline): mojibake 'NÃ£o tenho' → normalizeText → 'nao tenho' → /nao tenho/ matches",
  (() => {
    // Simulate normalizeText manually for the test without importing
    const input = "NÃ£o tenho restriÃ§Ã£o";
    // Fix mojibake: decodeURIComponent(escape(s))
    let s = input;
    if (/[ÃÂ]/.test(s)) {
      try { s = decodeURIComponent(escape(s)); } catch(_) {}
    }
    s = s.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2000-\u206F]/g, " ")
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return /\bnao\s+tenho\b/.test(s);
  })()
);

ok(
  "C7 (inline): UTF-8 'Não tenho restrição' → normalizeText → 'nao tenho restricao' → matches",
  (() => {
    const input = "Não tenho restrição";
    let s = input;
    s = s.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return /\bnao\s+tenho\b/.test(s);
  })()
);

// ─────────────────────────────────────────────────────────────
// REGRESSÃO — nada quebrado nos pontos adjacentes
// ─────────────────────────────────────────────────────────────
console.log("\nREGRESSÃO\n");

ok(
  "R1: TOP_SEALED_MODE ainda = true",
  src.includes("const TOP_SEALED_MODE = true;")
);

ok(
  "R2: TOP_SEALED_STAGES ainda inclui inicio, inicio_decisao, inicio_programa",
  src.includes('new Set(["inicio", "inicio_decisao", "inicio_programa"])')
);

ok(
  "R3: hasRestricaoIndicador usa normalizeText (inalterado)",
  src.includes("function hasRestricaoIndicador(text)") &&
    src.includes("const nt = normalizeText(text);") &&
    src.includes("/(negativad|nome sujo|cpf sujo|spc|serasa|restricao|protesto")
);

ok(
  "R4: greeting/identity statics em _TOPO_BUCKET_STATIC_REPLIES inalterados",
  src.includes('"greeting":') && src.includes('"identity":') &&
    src.includes("_TOPO_BUCKET_STATIC_REPLIES = Object.freeze(")
);

ok(
  "R5: validateInicioProgramaChoiceSpeech inalterado",
  src.includes("function validateInicioProgramaChoiceSpeech(reply, { requirePresentation = false } = {})")
);

// ─────────────────────────────────────────────────────────────
// RESULTADO
// ─────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════");
console.log(`  patches_diagnostico_ps_fase3.smoke: ${pass} passed, ${fail} failed`);
console.log("══════════════════════════════════════");
if (fail > 0) process.exit(1);
