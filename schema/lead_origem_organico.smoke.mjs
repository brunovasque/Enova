/**
 * lead_origem_organico.smoke.mjs
 * Smoke tests — Detecção automática de origem do lead (orgânico vs campanha)
 *
 * Validates:
 *  1. Lead novo SEM origem → source_type = "organico" + crm_lead_meta criado (COLD_POOL/COLD/organico)
 *  2. Lead com source_type de campanha → NÃO sobrescrito, NÃO cria crm_lead_meta como orgânico
 *  3. Lead com utm_source → NÃO marcado como orgânico
 *  4. Lead com base_origem → NÃO marcado como orgânico
 *  5. Lead já existente em crm_lead_meta → não sobrescreve
 *  6. Lead já orgânico (source_type = 'organico') → idempotente, não reclassifica
 *  7. Reentrada do mesmo wa_id com source_type já definido → sem alteração
 *  8. crm_lead_meta orgânico: campos obrigatórios corretos
 *  9. Estado com source_type null-ish (empty string) → classificado como orgânico
 * 10. Estado com todos os campos null → classificado como orgânico
 *
 * In-memory simulation — no Supabase required.
 */

import { strict as assert } from "node:assert";

// ─── Inline replicas ──────────────────────────────────────────────────────────

function getSimulationContext(env) {
  return env?.__enovaSimulationCtx || null;
}

function normalizeSupabaseRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  return [];
}

/**
 * Classifies a lead's origin.
 * Returns { source_type: "organico" } if no origin signal exists, otherwise null.
 */
function classifyLeadOrigin(st) {
  const hasOriginSignal = Boolean(st?.source_type || st?.base_origem || st?.utm_source);
  if (!hasOriginSignal) {
    return { source_type: "organico" };
  }
  return null;
}

async function getCrmLeadMeta(env, wa_id) {
  const simCtx = getSimulationContext(env);
  if (simCtx?.active) {
    return simCtx._crmLeadMeta?.[wa_id] || null;
  }
  return null;
}

async function registerOrganicLeadInCrmMeta(env, wa_id, nome) {
  if (!wa_id) return;
  const simCtx = getSimulationContext(env);
  if (simCtx?.active) {
    simCtx._crmLeadMeta = simCtx._crmLeadMeta || {};
    if (simCtx._crmLeadMeta[wa_id]) return;
    const now = new Date().toISOString();
    simCtx._crmLeadMeta[wa_id] = {
      wa_id,
      nome: nome || null,
      lead_pool: "COLD_POOL",
      lead_temp: "COLD",
      lead_source: "organico",
      tags: [],
      auto_outreach_enabled: true,
      is_paused: false,
      is_archived: false,
      created_at: now,
      updated_at: now
    };
    return;
  }
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

function makeEnv() {
  return {
    __enovaSimulationCtx: {
      active: true,
      stateByWaId: {},
      _crmLeadMeta: {}
    }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log("\nlead_origem_organico.smoke.mjs\n");

// ── Classification logic ──

await test("1. Lead novo SEM origem → classifyLeadOrigin retorna patch organico", async () => {
  const st = { wa_id: "5511900000001", fase_conversa: "inicio", funil_status: null, nome: "Fulano" };
  const patch = classifyLeadOrigin(st);
  assert.ok(patch !== null, "deve retornar patch");
  assert.equal(patch.source_type, "organico");
});

await test("2. Lead com source_type de campanha → classifyLeadOrigin retorna null", async () => {
  const st = { wa_id: "5511900000002", fase_conversa: "inicio", source_type: "campanha_facebook" };
  assert.equal(classifyLeadOrigin(st), null);
});

await test("3. Lead com utm_source → NÃO marcado como orgânico", async () => {
  const st = { wa_id: "5511900000003", fase_conversa: "inicio", utm_source: "google_ads" };
  assert.equal(classifyLeadOrigin(st), null);
});

await test("4. Lead com base_origem → NÃO marcado como orgânico", async () => {
  const st = { wa_id: "5511900000004", fase_conversa: "inicio", base_origem: "importacao_csv" };
  assert.equal(classifyLeadOrigin(st), null);
});

await test("5. Lead já orgânico (source_type = 'organico') → idempotente, não reclassifica", async () => {
  const st = { wa_id: "5511900000005", fase_conversa: "inicio_nome", source_type: "organico" };
  assert.equal(classifyLeadOrigin(st), null, "source_type já definido — não deve sobrescrever");
});

await test("6. Reentrada com source_type já definido → sem alteração", async () => {
  const st = { wa_id: "5511900000006", fase_conversa: "inicio_decisao", source_type: "base_quente" };
  assert.equal(classifyLeadOrigin(st), null);
});

await test("7. source_type empty string → classificado como orgânico", async () => {
  const st = { wa_id: "5511900000007", fase_conversa: "inicio", source_type: "" };
  const patch = classifyLeadOrigin(st);
  assert.ok(patch !== null);
  assert.equal(patch.source_type, "organico");
});

await test("8. Todos os campos null → classificado como orgânico", async () => {
  const st = { wa_id: "5511900000008", fase_conversa: "inicio", source_type: null, base_origem: null, utm_source: null };
  const patch = classifyLeadOrigin(st);
  assert.ok(patch !== null);
  assert.equal(patch.source_type, "organico");
});

// ── crm_lead_meta registration ──

await test("9. Lead novo sem rastro → crm_lead_meta criado com COLD_POOL/COLD/organico", async () => {
  const env = makeEnv();
  await registerOrganicLeadInCrmMeta(env, "5511900000009", "Maria");
  const meta = env.__enovaSimulationCtx._crmLeadMeta["5511900000009"];
  assert.ok(meta, "registro deve existir em crm_lead_meta");
  assert.equal(meta.lead_pool, "COLD_POOL");
  assert.equal(meta.lead_temp, "COLD");
  assert.equal(meta.lead_source, "organico");
  assert.equal(meta.auto_outreach_enabled, true);
  assert.equal(meta.is_paused, false);
  assert.equal(meta.is_archived, false);
  assert.equal(meta.nome, "Maria");
});

await test("10. Lead já existente em crm_lead_meta → NÃO sobrescreve", async () => {
  const env = makeEnv();
  env.__enovaSimulationCtx._crmLeadMeta["5511900000010"] = {
    wa_id: "5511900000010",
    lead_pool: "WARM_POOL",
    lead_temp: "WARM",
    lead_source: "campanha_whatsapp",
    auto_outreach_enabled: true,
    is_paused: false,
    is_archived: false
  };
  await registerOrganicLeadInCrmMeta(env, "5511900000010", "João");
  const meta = env.__enovaSimulationCtx._crmLeadMeta["5511900000010"];
  assert.equal(meta.lead_pool, "WARM_POOL", "lead_pool não deve ser sobrescrito");
  assert.equal(meta.lead_source, "campanha_whatsapp", "lead_source não deve ser sobrescrito");
});

await test("11. Lead de campanha → registerOrganicLeadInCrmMeta não é chamado (classifyLeadOrigin retorna null)", async () => {
  const env = makeEnv();
  const st = { wa_id: "5511900000011", source_type: "campanha_google" };
  const patch = classifyLeadOrigin(st);
  // patch is null → registerOrganicLeadInCrmMeta never called
  if (patch !== null) {
    await registerOrganicLeadInCrmMeta(env, st.wa_id, null);
  }
  const meta = env.__enovaSimulationCtx._crmLeadMeta["5511900000011"];
  assert.equal(meta, undefined, "lead de campanha não deve aparecer em crm_lead_meta como orgânico");
});

await test("12. Lead sem nome → crm_lead_meta criado com nome null", async () => {
  const env = makeEnv();
  await registerOrganicLeadInCrmMeta(env, "5511900000012", null);
  const meta = env.__enovaSimulationCtx._crmLeadMeta["5511900000012"];
  assert.ok(meta, "registro deve existir");
  assert.equal(meta.nome, null);
  assert.equal(meta.lead_pool, "COLD_POOL");
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
