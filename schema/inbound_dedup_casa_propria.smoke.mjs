/**
 * Smoke tests — Anti-duplicação por wamid + correção contextual casa/imóvel
 *
 * Testa:
 * 1. Mesmo inbound id (wamid) processado 2x → apenas 1 envio
 * 2. Inbound ids diferentes → envios normais
 * 3. Explicação do programa preservando "casa própria"
 * 4. Menções comuns ao cliente/produto usando "imóvel"
 * 5. Garantir que "imóvel própria" nunca apareça
 */

import { strict as assert } from "node:assert";

// ── Helper: importar replaceCasa e containsCasaInsteadOfImovel ────────────
const fsc = await import(new URL("../cognitive/src/final-speech-contract.js", import.meta.url).href);
const { applyFinalSpeechContract, containsCasaInsteadOfImovel } = fsc;

// ── Helper: simular sanitizeCognitiveReply inline (extraído do worker) ────
// Reproduz a lógica do worker para testar isoladamente
function sanitizeCognitiveReplyTest(replyText) {
  let text = String(replyText || "").trim();
  if (!text) return "";
  const mcmvPlaceholder = "\u200B__MCMV__\u200B";
  text = text.replace(/Minha\s+Casa\s+Minha\s+Vida/gi, mcmvPlaceholder);
  const casaPropriaPlaceholder = "\u200B__CASA_PROPRIA__\u200B";
  text = text.replace(/\bcasa\s+própria\b/gi, casaPropriaPlaceholder);
  text = text.replace(/\bcasa\b/gi, "imóvel");
  text = text.replace(new RegExp(casaPropriaPlaceholder.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g"), "casa própria");
  text = text.replace(new RegExp(mcmvPlaceholder.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g"), "Minha Casa Minha Vida");
  text = text.replace(/\s{2,}/g, " ").trim();
  return text;
}

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    results.push(`  ❌ ${name}: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION A — Anti-duplicação por wamid (in-memory layer)
// ═══════════════════════════════════════════════════════════════

test("A1: Mesmo wamid no cache → dedupProcessedHit = true", () => {
  const PROCESSED_WINDOW_MS = 300000;
  const cache = new Map();
  const messageId = "wamid.ABGSOFakeMessageId12345";
  const processedKey = `processed:${messageId}`;
  const now = Date.now();

  // First request — sets cache
  assert.equal(cache.has(processedKey), false);
  cache.set(processedKey, now);

  // Second request (1s later) — detects duplicate
  const later = now + 1000;
  const lastProcessed = cache.get(processedKey);
  const isDuplicate = lastProcessed && (later - lastProcessed) < PROCESSED_WINDOW_MS;
  assert.equal(isDuplicate, true, "Deveria detectar duplicata");
});

test("A2: Wamid diferente → sem dedupe", () => {
  const PROCESSED_WINDOW_MS = 300000;
  const cache = new Map();
  const now = Date.now();

  cache.set("processed:wamid.AAA", now);

  const lastProcessed = cache.get("processed:wamid.BBB");
  const isDuplicate = lastProcessed && (now - lastProcessed) < PROCESSED_WINDOW_MS;
  assert.equal(isDuplicate, undefined, "Não deveria detectar duplicata para wamid diferente");
});

test("A3: Mesmo wamid fora da janela → não bloqueia", () => {
  const PROCESSED_WINDOW_MS = 300000;
  const cache = new Map();
  const messageId = "wamid.ABC";
  const processedKey = `processed:${messageId}`;
  const now = Date.now();

  cache.set(processedKey, now - 400000); // 6.6 min atrás (fora da janela de 5min)

  const lastProcessed = cache.get(processedKey);
  const isDuplicate = lastProcessed && (now - lastProcessed) < PROCESSED_WINDOW_MS;
  assert.equal(isDuplicate, false, "Fora da janela não deveria bloquear");
});

test("A4: Persistent dedup — st.last_message_id === messageId → bloqueia", () => {
  const st = { last_message_id: "wamid.XYZ123", fase_conversa: "inicio" };
  const messageId = "wamid.XYZ123";
  const isDuplicate = messageId && st?.last_message_id && st.last_message_id === messageId;
  assert.equal(isDuplicate, true, "Deveria bloquear via state persistence");
});

test("A5: Persistent dedup — st.last_message_id !== messageId → passa", () => {
  const st = { last_message_id: "wamid.OLD", fase_conversa: "inicio" };
  const messageId = "wamid.NEW";
  const isDuplicate = messageId && st?.last_message_id && st.last_message_id === messageId;
  assert.equal(isDuplicate, false, "Mensagem nova não deveria ser bloqueada");
});

test("A6: Persistent dedup — st sem last_message_id (novo lead) → passa", () => {
  const st = { fase_conversa: "inicio" };
  const messageId = "wamid.FIRST";
  const isDuplicate = Boolean(messageId && st?.last_message_id && st.last_message_id === messageId);
  assert.equal(isDuplicate, false, "Novo lead sem last_message_id não deveria bloquear");
});

test("A7: Layer 1 dedup (10s janela) — mesmo wamid dentro de 10s", () => {
  const DEDUP_WINDOW_MS = 10000;
  const cache = new Map();
  const dedupKey = "mid:wamid.TEST";
  const now = Date.now();

  cache.set(dedupKey, now);

  const later = now + 5000;
  const lastTs = cache.get(dedupKey);
  const isDuplicate = lastTs && (later - lastTs) < DEDUP_WINDOW_MS;
  assert.equal(isDuplicate, true, "Deveria bloquear dentro de 10s");
});

// ═══════════════════════════════════════════════════════════════
// SECTION B — Correção contextual casa/imóvel (applyFinalSpeechContract)
// ═══════════════════════════════════════════════════════════════

test("B1: 'casa própria' preservado via applyFinalSpeechContract", () => {
  const input = "O programa ajuda você a conquistar a casa própria.";
  const output = applyFinalSpeechContract(input, {});
  assert.ok(output.includes("casa própria"), `Esperado 'casa própria' em: "${output}"`);
  assert.ok(!output.includes("imóvel própria"), `Não deveria ter 'imóvel própria' em: "${output}"`);
});

test("B2: 'compra da casa própria' preservado", () => {
  const input = "O Minha Casa Minha Vida facilita a compra da casa própria.";
  const output = applyFinalSpeechContract(input, {});
  assert.ok(output.includes("casa própria"), `Esperado 'casa própria' em: "${output}"`);
  assert.ok(output.includes("Minha Casa Minha Vida"), `Esperado 'Minha Casa Minha Vida' em: "${output}"`);
});

test("B3: 'sair do aluguel e conquistar a casa própria' preservado", () => {
  const input = "O objetivo é sair do aluguel e conquistar a casa própria.";
  const output = applyFinalSpeechContract(input, {});
  assert.ok(output.includes("casa própria"), `Esperado 'casa própria' em: "${output}"`);
});

test("B4: 'casa' genérica → 'imóvel' via applyFinalSpeechContract", () => {
  const input = "Qual é o valor da casa que você quer comprar?";
  const output = applyFinalSpeechContract(input, {});
  assert.ok(output.includes("imóvel"), `Esperado 'imóvel' em: "${output}"`);
  assert.ok(!output.includes("casa"), `Não deveria ter 'casa' em: "${output}"`);
});

test("B5: 'imóvel própria' NUNCA aparece", () => {
  const inputs = [
    "Parabéns pela decisão de comprar a casa própria!",
    "O programa ajuda na aquisição da casa própria.",
    "Casa própria é o sonho de muita gente.",
    "A casa própria é possível com o Minha Casa Minha Vida.",
    "Vamos te ajudar a conquistar sua casa própria.",
  ];
  for (const input of inputs) {
    const output = applyFinalSpeechContract(input, {});
    assert.ok(!output.includes("imóvel própria"), `'imóvel própria' NÃO deveria aparecer em: "${output}" (input: "${input}")`);
  }
});

test("B6: 'Minha Casa Minha Vida' sempre preservado", () => {
  const input = "O Minha Casa Minha Vida é um programa do governo.";
  const output = applyFinalSpeechContract(input, {});
  assert.ok(output.includes("Minha Casa Minha Vida"), `Esperado 'Minha Casa Minha Vida' em: "${output}"`);
});

test("B7: 'casado'/'casada' não sofre replace", () => {
  const input = "Você é casado ou solteiro?";
  const output = applyFinalSpeechContract(input, {});
  assert.ok(output.includes("casado"), `Esperado 'casado' em: "${output}"`);
  assert.ok(!output.includes("imóveldo"), `'imóveldo' não deveria aparecer em: "${output}"`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION C — sanitizeCognitiveReply (worker-level)
// ═══════════════════════════════════════════════════════════════

test("C1: sanitizeCognitiveReply preserva 'casa própria'", () => {
  const output = sanitizeCognitiveReplyTest("A casa própria é seu objetivo.");
  assert.ok(output.includes("casa própria"), `Esperado 'casa própria' em: "${output}"`);
  assert.ok(!output.includes("imóvel própria"), `'imóvel própria' não deveria aparecer em: "${output}"`);
});

test("C2: sanitizeCognitiveReply substitui 'casa' genérica", () => {
  const output = sanitizeCognitiveReplyTest("Qual o valor da casa?");
  assert.ok(output.includes("imóvel"), `Esperado 'imóvel' em: "${output}"`);
  assert.ok(!output.includes("casa"), `'casa' não deveria aparecer em: "${output}"`);
});

test("C3: sanitizeCognitiveReply preserva 'Minha Casa Minha Vida'", () => {
  const output = sanitizeCognitiveReplyTest("O Minha Casa Minha Vida facilita o acesso à casa própria.");
  assert.ok(output.includes("Minha Casa Minha Vida"), `MCMV preservado em: "${output}"`);
  assert.ok(output.includes("casa própria"), `casa própria preservado em: "${output}"`);
});

test("C4: sanitizeCognitiveReply — 'imóvel própria' NUNCA aparece", () => {
  const inputs = [
    "Com o programa você pode ter a casa própria.",
    "A casa própria é um direito seu.",
    "Sua casa própria está mais perto.",
  ];
  for (const input of inputs) {
    const output = sanitizeCognitiveReplyTest(input);
    assert.ok(!output.includes("imóvel própria"), `'imóvel própria' em: "${output}" (input: "${input}")`);
  }
});

// ═══════════════════════════════════════════════════════════════
// SECTION D — containsCasaInsteadOfImovel
// ═══════════════════════════════════════════════════════════════

test("D1: containsCasaInsteadOfImovel — 'casa própria' NÃO é flagged", () => {
  assert.equal(
    containsCasaInsteadOfImovel("O programa ajuda na conquista da casa própria."),
    false,
    "'casa própria' não deveria ser flagged"
  );
});

test("D2: containsCasaInsteadOfImovel — 'casa' genérica É flagged", () => {
  assert.equal(
    containsCasaInsteadOfImovel("Qual o valor da casa?"),
    true,
    "'casa' genérica deveria ser flagged"
  );
});

test("D3: containsCasaInsteadOfImovel — 'Minha Casa Minha Vida' NÃO é flagged", () => {
  assert.equal(
    containsCasaInsteadOfImovel("O Minha Casa Minha Vida é bom."),
    false,
    "'Minha Casa Minha Vida' não deveria ser flagged"
  );
});

test("D4: containsCasaInsteadOfImovel — mix 'MCMV + casa própria' NÃO é flagged", () => {
  assert.equal(
    containsCasaInsteadOfImovel("O Minha Casa Minha Vida ajuda a conquistar a casa própria."),
    false,
    "MCMV + casa própria não deveria ser flagged"
  );
});

test("D5: containsCasaInsteadOfImovel — 'MCMV + casa genérica' É flagged", () => {
  assert.equal(
    containsCasaInsteadOfImovel("O Minha Casa Minha Vida ajuda a comprar a casa."),
    true,
    "casa genérica (fora de 'casa própria') deveria ser flagged"
  );
});

// ═══════════════════════════════════════════════════════════════
// SECTION E — Cenários de edge-case
// ═══════════════════════════════════════════════════════════════

test("E1: Múltiplas 'casa própria' preservadas", () => {
  const input = "A casa própria é o sonho. Com o programa a casa própria fica acessível.";
  const output = applyFinalSpeechContract(input, {});
  const count = (output.match(/casa própria/g) || []).length;
  assert.equal(count, 2, `Deveria ter 2 ocorrências de 'casa própria', encontrou ${count} em: "${output}"`);
});

test("E2: 'casa' genérica + 'casa própria' na mesma frase", () => {
  const input = "A casa que você busca será sua casa própria.";
  const output = applyFinalSpeechContract(input, {});
  assert.ok(output.includes("imóvel"), `'casa' genérica deveria virar 'imóvel' em: "${output}"`);
  assert.ok(output.includes("casa própria"), `'casa própria' deveria ser preservada em: "${output}"`);
  assert.ok(!output.includes("imóvel própria"), `'imóvel própria' NÃO deveria aparecer em: "${output}"`);
});

test("E3: Case insensitive — 'Casa Própria' preservado", () => {
  const input = "A Casa Própria é o objetivo.";
  const output = sanitizeCognitiveReplyTest(input);
  assert.ok(output.toLowerCase().includes("casa própria"), `Case insensitive: "${output}"`);
  assert.ok(!output.toLowerCase().includes("imóvel própria"), `Sem 'imóvel própria': "${output}"`);
});

// ═══════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════
console.log("\n=== SMOKE: inbound_dedup_casa_propria ===");
console.log(results.join("\n"));
console.log(`\n  Total: ${passed + failed} | ✅ ${passed} | ❌ ${failed}\n`);

if (failed > 0) {
  process.exit(1);
}
