/**
 * lead_origem_organico.smoke.mjs
 * Smoke tests — Detecção automática de origem do lead (orgânico vs campanha)
 *
 * Validates:
 *  1. Lead novo SEM origem → source_type definido como "organico"
 *  2. Lead com source_type de campanha → NÃO sobrescrito
 *  3. Lead com utm_source → NÃO marcado como orgânico
 *  4. Lead com base_origem → NÃO marcado como orgânico
 *  5. Lead já existente com source_type = "organico" → não reclassificado (idempotente)
 *  6. Reentrada do mesmo wa_id com source_type já definido → sem alteração
 *
 * In-memory simulation — no Supabase required.
 */

import { strict as assert } from "node:assert";

// ─── Inline replica: classifyLeadOrigin ──────────────────────────────────────
// Mirrors the logic added to handleMetaWebhook in Enova worker.js

/**
 * Classifies a lead's origin.
 * Returns { source_type: "organico" } if no origin signal exists, otherwise null.
 * @param {{ source_type?: string|null, base_origem?: string|null, utm_source?: string|null }} st
 */
function classifyLeadOrigin(st) {
  const hasOriginSignal = Boolean(st?.source_type || st?.base_origem || st?.utm_source);
  if (!hasOriginSignal) {
    return { source_type: "organico" };
  }
  return null;
}

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log("\nlead_origem_organico.smoke.mjs\n");

await test("1. Lead novo SEM origem → source_type = 'organico'", async () => {
  const st = { wa_id: "5511900000001", fase_conversa: "inicio", funil_status: null, nome: "Fulano" };
  const patch = classifyLeadOrigin(st);
  assert.ok(patch !== null, "deve retornar patch");
  assert.equal(patch.source_type, "organico", "source_type deve ser 'organico'");
});

await test("2. Lead com source_type de campanha → NÃO sobrescrito", async () => {
  const st = { wa_id: "5511900000002", fase_conversa: "inicio", source_type: "campanha_facebook" };
  const patch = classifyLeadOrigin(st);
  assert.equal(patch, null, "não deve retornar patch para lead com source_type");
});

await test("3. Lead com utm_source → NÃO marcado como orgânico", async () => {
  const st = { wa_id: "5511900000003", fase_conversa: "inicio", utm_source: "google_ads" };
  const patch = classifyLeadOrigin(st);
  assert.equal(patch, null, "utm_source é sinal de campanha — não deve classificar como orgânico");
});

await test("4. Lead com base_origem → NÃO marcado como orgânico", async () => {
  const st = { wa_id: "5511900000004", fase_conversa: "inicio", base_origem: "importacao_csv" };
  const patch = classifyLeadOrigin(st);
  assert.equal(patch, null, "base_origem é sinal de origem — não deve classificar como orgânico");
});

await test("5. Lead já orgânico (source_type = 'organico') → idempotente, não reclassifica", async () => {
  const st = { wa_id: "5511900000005", fase_conversa: "inicio_nome", source_type: "organico" };
  const patch = classifyLeadOrigin(st);
  assert.equal(patch, null, "source_type já definido (organico) — não deve sobrescrever");
});

await test("6. Reentrada com source_type já definido → sem alteração", async () => {
  const st = { wa_id: "5511900000006", fase_conversa: "inicio_decisao", source_type: "base_quente" };
  const patch = classifyLeadOrigin(st);
  assert.equal(patch, null, "reentrada com source_type existente não deve reclassificar");
});

await test("7. Estado com source_type null-ish (empty string) → classificado como orgânico", async () => {
  const st = { wa_id: "5511900000007", fase_conversa: "inicio", source_type: "" };
  const patch = classifyLeadOrigin(st);
  assert.ok(patch !== null, "string vazia não é sinal de origem");
  assert.equal(patch.source_type, "organico");
});

await test("8. Estado com todos os campos null → classificado como orgânico", async () => {
  const st = { wa_id: "5511900000008", fase_conversa: "inicio", source_type: null, base_origem: null, utm_source: null };
  const patch = classifyLeadOrigin(st);
  assert.ok(patch !== null, "todos null → sem origem → deve ser orgânico");
  assert.equal(patch.source_type, "organico");
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
