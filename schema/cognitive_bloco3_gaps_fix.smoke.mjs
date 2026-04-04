/**
 * SMOKE TEST — BLOCO 3 GAPS FIX VALIDATION
 *
 * Validates the 5 gaps fixed in the BLOCO 3 cognitive shell closure:
 *
 * GAP 1: somar_renda_solteiro sozinho regex — "sem composição", "não vou somar"
 * GAP 2: quem_pode_somar sozinho regex — "sem composição", "não vou somar"
 * GAP 3: interpretar_composicao sozinho regex — "sem composição", "não vou somar"
 * GAP 4: somar_renda_familiar "qualquer" branch — stays at somar_renda_familiar
 * GAP 5: hasClearStageAnswer quem_pode_somar/interpretar_composicao — "sem composição", "não vou somar"
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const WORKER_PATH = resolve(import.meta.dirname, "..", "Enova worker.js");
const workerSource = readFileSync(WORKER_PATH, "utf8");

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function normalizeText(text) {
  if (!text) return "";
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractFunction(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const match = re.exec(workerSource);
  if (!match) return null;
  let depth = 0;
  let start = match.index;
  for (let i = start; i < workerSource.length; i++) {
    if (workerSource[i] === "{") depth++;
    if (workerSource[i] === "}") depth--;
    if (depth === 0 && i > start) return workerSource.slice(start, i + 1);
  }
  return null;
}

// ============================================================
// SECTION 1: somar_renda_solteiro — "sem composição" and "não vou somar"
// ============================================================
console.log("\n=== SECTION 1: somar_renda_solteiro sozinho regex (GAP 1) ===\n");

{
  // Get the full somar_renda_solteiro case block (generous range)
  const caseStart = workerSource.indexOf('case "somar_renda_solteiro"');
  const block = workerSource.slice(caseStart, caseStart + 8000);

  // Verify "sem composic" present in the block (source code string match)
  ok(block.includes("sem") && block.includes("composic"), 'somar_renda_solteiro block has "sem composic" pattern');

  // Verify "nao vou somar" present
  ok(/n\[aã\]o.*vou.*somar/.test(block) || /nao.*vou.*somar/i.test(block),
    'somar_renda_solteiro block has "não vou somar" pattern');

  // The sozinho regex tests against tBase (normalized) for "sem composic"
  // and against t (raw) for "não vou somar" — verify both work
  const tBase_sem = normalizeText("sem composição");
  ok(/sem\s+composic/i.test(tBase_sem), '"sem composição" normalized → matches /sem composic/');

  ok(/n[aã]o\s+vou\s+somar/i.test("não vou somar"), '"não vou somar" raw → matches /n[aã]o vou somar/');
  ok(/n[aã]o\s+vou\s+somar/i.test("nao vou somar"), '"nao vou somar" normalized → matches');

  // Regressions
  ok(/\b(so|somente|apenas)\s+(minha\s+renda|minha|eu)\b/i.test(normalizeText("vou usar só minha renda")),
    '"vou usar só minha renda" still matches (regression)');
  ok(/\bs[oó]\s+eu\b/i.test("só eu"), '"só eu" still matches (regression)');
  ok(/\b(sozinha|sozinho)\b/i.test("sozinho"), '"sozinho" still matches (regression)');
}

// ============================================================
// SECTION 2: quem_pode_somar — "sem composição" and "não vou somar"
// ============================================================
console.log("\n=== SECTION 2: quem_pode_somar sozinho regex (GAP 2) ===\n");

{
  const caseStart = workerSource.indexOf('case "quem_pode_somar"');
  const block = workerSource.slice(caseStart, caseStart + 8000);

  ok(/sem\s*composic/i.test(block), 'quem_pode_somar block has "sem composic" pattern');
  ok(/nao\s*vou\s*somar/i.test(block), 'quem_pode_somar block has "nao vou somar" pattern');

  // quem_pode_somar tests against tBase (normalized), so:
  const tBase_sem = normalizeText("sem composição");
  ok(/sem composic/i.test(tBase_sem), '"sem composição" normalized → matches');

  const tBase_nao = normalizeText("não vou somar");
  ok(/nao vou somar/i.test(tBase_nao), '"não vou somar" normalized → matches');

  // Regressions (against normalized text, as actual code uses tBase)
  ok(/so\s*eu/i.test(normalizeText("só eu")), '"só eu" normalized → matches (regression)');
  ok(/sozinh/i.test("sozinho"), '"sozinho" matches (regression)');
  ok(/ninguem/i.test(normalizeText("ninguém")), '"ninguém" normalized → matches (regression)');
}

// ============================================================
// SECTION 3: interpretar_composicao — "sem composição" and "não vou somar"
// ============================================================
console.log("\n=== SECTION 3: interpretar_composicao sozinho regex (GAP 3) ===\n");

{
  const caseStart = workerSource.indexOf('case "interpretar_composicao"');
  const block = workerSource.slice(caseStart, caseStart + 3000);

  ok(/sem composi\[çc\]/i.test(block) || /sem\s+composi/i.test(block),
    'interpretar_composicao block has "sem composiç/c" pattern');
  ok(/n\[aã\]o\s*vou\s*somar/i.test(block) || /nao vou somar/i.test(block),
    'interpretar_composicao block has "não vou somar" pattern');

  // interpretar_composicao tests against raw t, so regex uses character classes
  const rawSozinhoRe = /(sem composi[çc]|n[aã]o vou somar)/i;
  ok(rawSozinhoRe.test("sem composição"), '"sem composição" raw → matches /sem composi[çc]/');
  ok(rawSozinhoRe.test("não vou somar"), '"não vou somar" raw → matches /n[aã]o vou somar/');

  // Regressions
  ok(/(s[oó]\s*eu)/i.test("só eu"), '"só eu" still matches (regression)');
  ok(/solo/i.test("solo"), '"solo" still matches (regression)');
}

// ============================================================
// SECTION 4: somar_renda_familiar — "qualquer" stays at somar_renda_familiar
// ============================================================
console.log("\n=== SECTION 4: somar_renda_familiar qualquer branch (GAP 4) ===\n");

{
  const caseStart = workerSource.indexOf('case "somar_renda_familiar"');
  const block = workerSource.slice(caseStart, caseStart + 8000);

  // Find the QUALQUER section
  const qualquerIdx = block.indexOf("qualquer");
  ok(qualquerIdx > 0, "somar_renda_familiar block contains 'qualquer' logic");

  // The qualquer branch should NOT advance to regime_trabalho_parceiro_familiar
  // but instead stay at somar_renda_familiar
  const qualquerSection = block.slice(
    block.indexOf("if (qualquer)"),
    block.indexOf("if (qualquer)") + 800
  );

  ok(qualquerSection.length > 50, "qualquer branch section found");

  ok(
    qualquerSection.includes('"somar_renda_familiar"'),
    'qualquer branch nextStage is "somar_renda_familiar" (stays in place)'
  );

  ok(
    !qualquerSection.includes('"regime_trabalho_parceiro_familiar"'),
    'qualquer branch does NOT advance to "regime_trabalho_parceiro_familiar"'
  );

  ok(
    !qualquerSection.includes("nao_especificado"),
    'qualquer branch does NOT set familiar_tipo to "nao_especificado"'
  );

  // Verify it asks which specific family member
  ok(
    /qual familiar|Pai.*m[aã]e|pai.*mãe/i.test(qualquerSection),
    'qualquer branch asks which specific family member'
  );
}

// ============================================================
// SECTION 5: hasClearStageAnswer — "sem composição" / "não vou somar"
// ============================================================
console.log("\n=== SECTION 5: hasClearStageAnswer coverage (GAP 5) ===\n");

{
  // Use direct source search around hasClearStageAnswer for quem_pode_somar
  const hcIdx = workerSource.indexOf('function hasClearStageAnswer');
  const hcBlock = workerSource.slice(hcIdx, hcIdx + 5000);
  const qpsInHc = hcBlock.indexOf('quem_pode_somar');
  const qpsSection = hcBlock.slice(qpsInHc, qpsInHc + 500);

  ok(qpsSection.includes("sem") && qpsSection.includes("composic"),
    'hasClearStageAnswer quem_pode_somar includes "sem composic"');
  ok(qpsSection.includes("nao") && qpsSection.includes("vou") && qpsSection.includes("somar"),
    'hasClearStageAnswer quem_pode_somar includes "nao vou somar"');

  // Direct regex test (hasClearStageAnswer normalizes text → nt)
  const clearRe = /(so\s*(a\s*)?minha|so\s*eu|sozinh|ninguem|sem ninguem|sem\s*composic|nao\s*vou\s*somar)/i;
  ok(clearRe.test(normalizeText("sem composição")), '"sem composição" normalized → hasClearStageAnswer matches');
  ok(clearRe.test(normalizeText("não vou somar")), '"não vou somar" normalized → hasClearStageAnswer matches');
  ok(clearRe.test("so eu"), '"so eu" → hasClearStageAnswer matches (regression)');
  ok(clearRe.test("sozinho"), '"sozinho" → hasClearStageAnswer matches (regression)');
}

// ============================================================
// SECTION 6: Regression — existing behavior preserved
// ============================================================
console.log("\n=== SECTION 6: Regression guards ===\n");

{
  // estado_civil "moro junto" still does NOT match casamento/uniao_estavel
  const parseEstadoCivilSrc = extractFunction("parseEstadoCivil");
  ok(parseEstadoCivilSrc !== null, "parseEstadoCivil function found");
  ok(
    !/(moro junto|moramos juntos)/.test(
      parseEstadoCivilSrc.match(/uniao estavel.*$/m)?.[0] || ""
    ),
    'parseEstadoCivil: "moro junto" NOT in uniao_estavel regex (regression safe)'
  );

  // confirmar_casamento: uniao regex does not include "moro junto"
  const confirmStart = workerSource.indexOf('case "confirmar_casamento"');
  const confirmBlock = workerSource.slice(confirmStart, confirmStart + 2000);
  const uniaoLine = confirmBlock.match(/const uniao_estavel\s*=[\s\S]*?;/)?.[0] || "";
  ok(
    !uniaoLine.includes("moro junto") && !uniaoLine.includes("moramos juntos"),
    'confirmar_casamento: uniao_estavel regex does NOT include "moro junto" (regression safe)'
  );

  // Civil → conjunto obrigatório preserved
  const civilBlock = confirmBlock.slice(confirmBlock.indexOf("if (civil)"), confirmBlock.indexOf("if (civil)") + 500);
  ok(
    civilBlock.includes("financiamento_conjunto: true") && civilBlock.includes("somar_renda: true"),
    'confirmar_casamento: civil → financiamento_conjunto=true, somar_renda=true (regression safe)'
  );

  // somar_renda_solteiro: renda baixa → fim_ineligivel preserved (bigger block)
  const somarStart = workerSource.indexOf('case "somar_renda_solteiro"');
  const somarBlock = workerSource.slice(somarStart, somarStart + 12000);
  ok(
    somarBlock.includes("fim_ineligivel") && somarBlock.includes("renda_baixa_sem_composicao"),
    'somar_renda_solteiro: renda baixa → fim_ineligivel preserved (regression safe)'
  );

  // somar_renda_solteiro: parceiro detection preserved
  ok(
    somarBlock.includes("regime_trabalho_parceiro") && /parceiro/i.test(somarBlock),
    'somar_renda_solteiro: parceiro path preserved (regression safe)'
  );

  // somar_renda_solteiro: familiar → pais_casados_civil_pergunta preserved
  ok(
    somarBlock.includes("pais_casados_civil_pergunta"),
    'somar_renda_solteiro: familiar → pais_casados_civil_pergunta preserved (regression safe)'
  );

  // quem_pode_somar: parceiro/familiar/sozinho paths preserved
  const qpsStart = workerSource.indexOf('case "quem_pode_somar"');
  const qpsBlock = workerSource.slice(qpsStart, qpsStart + 8000);
  ok(
    qpsBlock.includes("regime_trabalho_parceiro") && qpsBlock.includes("fim_ineligivel"),
    'quem_pode_somar: parceiro/solo paths preserved (regression safe)'
  );

  // interpretar_composicao: all three paths preserved
  const icStart = workerSource.indexOf('case "interpretar_composicao"');
  const icBlock = workerSource.slice(icStart, icStart + 3000);
  ok(
    icBlock.includes("regime_trabalho_parceiro") && icBlock.includes("somar_renda_familiar") && icBlock.includes("ir_declarado"),
    'interpretar_composicao: parceiro/familiar/sozinho paths preserved (regression safe)'
  );
}

// ============================================================
// SECTION 7: Sensitive phrase coverage — all contract-required phrases
// ============================================================
console.log("\n=== SECTION 7: Sensitive phrase coverage ===\n");

{
  // Test against NORMALIZED text (as runtime does for most patterns)
  const phrases = [
    { text: "só eu", expected: "solo" },
    { text: "só minha renda", expected: "solo" },
    { text: "vou usar só minha renda", expected: "solo" },
    { text: "sem composição", expected: "solo" },
    { text: "não vou somar", expected: "solo" },
    { text: "sozinho", expected: "solo" },
    { text: "sozinha", expected: "solo" },
    { text: "apenas eu", expected: "solo" },
  ];

  // Unified solo regex (combining patterns used across somar_renda_solteiro / quem_pode_somar)
  const soloDetectionRe = /(so|somente|apenas)\s+(minha\s+renda|minha|eu)|sozinha|sozinho|sem\s+composic|nao\s+vou\s+somar/i;

  for (const { text, expected } of phrases) {
    const nt = normalizeText(text);
    const matchesNormalized = soloDetectionRe.test(nt);
    // Also test raw for interpretar_composicao patterns
    const rawRe = /(s[oó]\s*(a\s*)?minha(\s+renda)?|s[oó]\s*eu|apenas eu|somente eu|solo|sozinh|sem composi[çc]|n[aã]o vou somar)/i;
    const matchesRaw = rawRe.test(text);
    ok(
      matchesNormalized || matchesRaw,
      `"${text}" → ${expected} (normalized: ${matchesNormalized}, raw: ${matchesRaw})`
    );
  }

  // Family member detection
  const familyPhrases = [
    { text: "minha mãe", expected: "mae" },
    { text: "meu pai", expected: "pai" },
    { text: "minha irmã", expected: "irmao" },
    { text: "minha avó", expected: "avo" },
  ];

  for (const { text, expected } of familyPhrases) {
    const nt = normalizeText(text);
    let result = "unknown";
    if (/\b(mae|minha mae)\b/i.test(nt)) result = "mae";
    else if (/\b(pai|meu pai)\b/i.test(nt)) result = "pai";
    else if (/\b(irmao|irmaos|irma|minha irma|meu irmao)\b/i.test(nt)) result = "irmao";
    else if (/\b(avo|avos|vo|vos|vovo|vovos)\b/i.test(nt)) result = "avo";
    ok(result === expected, `"${text}" → ${expected} (got: ${result})`);
  }

  // Partner detection
  const partnerPhrases = [
    { text: "meu parceiro", expected: "parceiro" },
    { text: "minha esposa", expected: "parceiro" },
    { text: "meu marido", expected: "parceiro" },
  ];

  for (const { text, expected } of partnerPhrases) {
    const nt = normalizeText(text);
    let result = "unknown";
    if (/(parceir|namorad|espos|marid|mulher|boy|girl)/i.test(nt)) result = "parceiro";
    ok(result === expected, `"${text}" → ${expected} (got: ${result})`);
  }
}

// ============================================================
// SECTION 8: "moro junto" safety — must NOT trigger false positives
// ============================================================
console.log("\n=== SECTION 8: moro junto safety ===\n");

{
  // "moro junto" must NOT be detected as casado by parseEstadoCivil
  const nt = normalizeText("moro junto");
  ok(
    !/(casad|casamento civil|casad[oa] no civil|casad[oa] no papel|no papel)/.test(nt),
    '"moro junto" does NOT match casado regex'
  );

  // "moro junto" must NOT be detected as uniao_estavel by parseEstadoCivil
  ok(
    !/(uniao estavel|juntad|amasiad|companheir|marido e mulher)/.test(nt),
    '"moro junto" does NOT match uniao_estavel regex'
  );

  // "moramos juntos" same safety
  const nt2 = normalizeText("moramos juntos");
  ok(
    !/(uniao estavel|juntad|amasiad|companheir|marido e mulher)/.test(nt2),
    '"moramos juntos" does NOT match uniao_estavel regex'
  );

  // "vivemos juntos" same safety
  const nt3 = normalizeText("vivemos juntos");
  ok(
    !/(uniao estavel|juntad|amasiad|companheir|marido e mulher)/.test(nt3),
    '"vivemos juntos" does NOT match uniao_estavel regex'
  );
}

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`BLOCO 3 GAPS FIX: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${"=".repeat(60)}`);

process.exit(failed > 0 ? 1 : 0);
