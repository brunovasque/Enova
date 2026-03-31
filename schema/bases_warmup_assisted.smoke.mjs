/**
 * bases_warmup_assisted.smoke.mjs
 * Smoke tests for the assisted warmup flow:
 *   - suggestWarmupMessage: 3 variations per pool, with/without nome, index rotation
 *   - buildWarmupSelection: paused leads excluded, limit enforced
 *   - Variations differ across pools and across indices
 *   - Nome fallback (null / empty string)
 *   - Only first name used from full name
 */
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";
process.env.WORKER_BASE_URL = "https://worker.example";
process.env.ENOVA_ADMIN_KEY = "adm-key";

const { suggestWarmupMessage } = await import(
  new URL("../panel/app/bases/_callNowSuggest.ts", import.meta.url).href
);

const { buildWarmupSelection } = await import(
  new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href
);

// ─── suggestWarmupMessage: basic per-pool checks ─────────────────────────────

// COLD_POOL com nome — index 0
{
  const msg = suggestWarmupMessage("COLD_POOL", "Bruno Santos", 0);
  assert.ok(msg.includes("Bruno"), "COLD index=0 should include first name");
  assert.ok(!msg.includes("{primeiro_nome}"), "placeholder must be replaced");
  console.log("✓ COLD_POOL com nome index=0:", msg);
}

// COLD_POOL sem nome — index 0
{
  const msg = suggestWarmupMessage("COLD_POOL", null, 0);
  assert.ok(!msg.includes("{primeiro_nome}"), "no placeholder in no-name variant");
  assert.ok(!msg.includes("null"), "must not include 'null'");
  console.log("✓ COLD_POOL sem nome index=0:", msg);
}

// WARM_POOL com nome — index 1
{
  const msg = suggestWarmupMessage("WARM_POOL", "Carla", 1);
  assert.ok(msg.includes("Carla"), "WARM index=1 should include first name");
  console.log("✓ WARM_POOL com nome index=1:", msg);
}

// HOT_POOL sem nome — index 2
{
  const msg = suggestWarmupMessage("HOT_POOL", null, 2);
  assert.ok(msg.length > 10, "HOT sem nome index=2 should not be empty");
  console.log("✓ HOT_POOL sem nome index=2:", msg);
}

// ─── 3 variations per pool — all must differ ─────────────────────────────────

for (const pool of ["COLD_POOL", "WARM_POOL", "HOT_POOL"]) {
  const v0 = suggestWarmupMessage(pool, "Ana", 0);
  const v1 = suggestWarmupMessage(pool, "Ana", 1);
  const v2 = suggestWarmupMessage(pool, "Ana", 2);
  assert.notEqual(v0, v1, `${pool}: variation 0 must differ from 1`);
  assert.notEqual(v1, v2, `${pool}: variation 1 must differ from 2`);
  assert.notEqual(v0, v2, `${pool}: variation 0 must differ from 2`);
  console.log(`✓ ${pool}: 3 variações distintas com nome`);
}

for (const pool of ["COLD_POOL", "WARM_POOL", "HOT_POOL"]) {
  const v0 = suggestWarmupMessage(pool, null, 0);
  const v1 = suggestWarmupMessage(pool, null, 1);
  const v2 = suggestWarmupMessage(pool, null, 2);
  assert.notEqual(v0, v1, `${pool} sem nome: variation 0 must differ from 1`);
  assert.notEqual(v1, v2, `${pool} sem nome: variation 1 must differ from 2`);
  assert.notEqual(v0, v2, `${pool} sem nome: variation 0 must differ from 2`);
  console.log(`✓ ${pool}: 3 variações distintas sem nome`);
}

// ─── Index rotation: index % 3 — index 3 == index 0 ─────────────────────────
{
  const base = suggestWarmupMessage("COLD_POOL", "João", 0);
  const wrap = suggestWarmupMessage("COLD_POOL", "João", 3);
  assert.equal(base, wrap, "index 3 should wrap to same as index 0");
  console.log("✓ Rotação de índice: index 3 == index 0");
}

// ─── Messages differ across pools ────────────────────────────────────────────
{
  const cold = suggestWarmupMessage("COLD_POOL", "Ana", 0);
  const warm = suggestWarmupMessage("WARM_POOL", "Ana", 0);
  const hot  = suggestWarmupMessage("HOT_POOL",  "Ana", 0);
  assert.notEqual(cold, warm, "COLD and WARM index=0 must differ");
  assert.notEqual(warm, hot,  "WARM and HOT  index=0 must differ");
  assert.notEqual(cold, hot,  "COLD and HOT  index=0 must differ");
  console.log("✓ Mensagens distintas entre pools (index=0)");
}

// ─── Only first name is used ──────────────────────────────────────────────────
{
  const msg = suggestWarmupMessage("WARM_POOL", "Maria Clara Souza", 0);
  assert.ok(msg.includes("Maria"), "should include first name");
  assert.ok(!msg.includes("Clara"), "should NOT include middle name");
  assert.ok(!msg.includes("Souza"), "should NOT include last name");
  console.log("✓ Apenas primeiro nome usado:", msg);
}

// ─── Empty string nome treated as no name ─────────────────────────────────────
{
  const msgEmpty = suggestWarmupMessage("COLD_POOL", "", 0);
  const msgNull  = suggestWarmupMessage("COLD_POOL", null, 0);
  assert.equal(msgEmpty, msgNull, "empty nome should equal null nome (no-name variant)");
  assert.ok(!msgEmpty.startsWith("Oi, !"), "must not produce 'Oi, !'");
  console.log("✓ Nome vazio tratado como sem nome");
}

// ─── buildWarmupSelection: paused leads excluded ─────────────────────────────
{
  const rows = [
    {
      wa_id: "5511000000001",
      nome: "Lead Ativo",
      telefone: null,
      lead_pool: "COLD_POOL",
      lead_temp: "COLD",
      lead_source: null,
      tags: [],
      obs_curta: null,
      import_ref: null,
      auto_outreach_enabled: true,
      is_paused: false,
      created_at: null,
      updated_at: "2024-01-01T00:00:00.000Z",
    },
    {
      wa_id: "5511000000002",
      nome: "Lead Pausado",
      telefone: null,
      lead_pool: "COLD_POOL",
      lead_temp: "COLD",
      lead_source: null,
      tags: [],
      obs_curta: null,
      import_ref: null,
      auto_outreach_enabled: true,
      is_paused: true, // paused
      created_at: null,
      updated_at: "2024-01-02T00:00:00.000Z",
    },
    {
      wa_id: "5511000000003",
      nome: "Lead Auto Off",
      telefone: null,
      lead_pool: "COLD_POOL",
      lead_temp: "COLD",
      lead_source: null,
      tags: [],
      obs_curta: null,
      import_ref: null,
      auto_outreach_enabled: false, // not eligible
      is_paused: false,
      created_at: null,
      updated_at: "2024-01-03T00:00:00.000Z",
    },
  ];

  const selection = buildWarmupSelection(rows, { lead_pool: "COLD_POOL", limit: 5 });
  assert.equal(selection.length, 1, "only 1 eligible lead (active + auto_outreach_enabled)");
  assert.equal(selection[0].wa_id, "5511000000001");
  console.log("✓ buildWarmupSelection: pausado e auto_outreach_enabled=false excluídos");
}

// ─── buildWarmupSelection: small limit enforced ───────────────────────────────
{
  const rows = Array.from({ length: 10 }, (_, i) => ({
    wa_id: `551100000000${i}`,
    nome: `Lead ${i}`,
    telefone: null,
    lead_pool: "WARM_POOL",
    lead_temp: "WARM",
    lead_source: null,
    tags: [],
    obs_curta: null,
    import_ref: null,
    auto_outreach_enabled: true,
    is_paused: false,
    created_at: null,
    updated_at: `2024-01-0${i + 1}T00:00:00.000Z`,
  }));

  const selection = buildWarmupSelection(rows, { lead_pool: "WARM_POOL", limit: 3 });
  assert.equal(selection.length, 3, "limit=3 must yield at most 3 leads");
  console.log("✓ buildWarmupSelection: limite 3 respeitado");
}

console.log("\nbases_warmup_assisted.smoke: ok");
