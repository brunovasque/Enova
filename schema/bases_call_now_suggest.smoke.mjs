/**
 * bases_call_now_suggest.smoke.mjs
 * Smoke tests for suggestCallNowMessage helper.
 */
import assert from "node:assert/strict";

// The helper imports LeadPool from _shared.ts which references env vars in its
// top-level REQUIRED_ENVS array — none are executed at import, so we can set
// them to dummy values to satisfy any runtime checks.
process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";

const { suggestCallNowMessage } = await import(
  new URL("../panel/app/bases/_callNowSuggest.ts", import.meta.url).href
);

// ─── Test 1: COLD_POOL with nome ─────────────────────────────────────────────
{
  const msg = suggestCallNowMessage("COLD_POOL", "Bruno Santos");
  assert.ok(msg.includes("Bruno"), "COLD_POOL with nome should include first name");
  assert.ok(msg.length > 10, "COLD_POOL message should not be empty");
  console.log("✓ COLD_POOL com nome:", msg);
}

// ─── Test 2: COLD_POOL without nome ──────────────────────────────────────────
{
  const msg = suggestCallNowMessage("COLD_POOL", null);
  assert.ok(!msg.includes("null"), "COLD_POOL without nome must not include 'null'");
  assert.ok(msg.length > 10, "COLD_POOL fallback message should not be empty");
  console.log("✓ COLD_POOL sem nome:", msg);
}

// ─── Test 3: WARM_POOL with nome ─────────────────────────────────────────────
{
  const msg = suggestCallNowMessage("WARM_POOL", "Carla Mendes");
  assert.ok(msg.includes("Carla"), "WARM_POOL with nome should include first name");
  assert.ok(msg.length > 10, "WARM_POOL message should not be empty");
  console.log("✓ WARM_POOL com nome:", msg);
}

// ─── Test 4: WARM_POOL without nome ──────────────────────────────────────────
{
  const msg = suggestCallNowMessage("WARM_POOL", null);
  assert.ok(!msg.includes("null"), "WARM_POOL without nome must not include 'null'");
  console.log("✓ WARM_POOL sem nome:", msg);
}

// ─── Test 5: HOT_POOL with nome ──────────────────────────────────────────────
{
  const msg = suggestCallNowMessage("HOT_POOL", "João");
  assert.ok(msg.includes("João"), "HOT_POOL with nome should include first name");
  assert.ok(msg.length > 10, "HOT_POOL message should not be empty");
  console.log("✓ HOT_POOL com nome:", msg);
}

// ─── Test 6: HOT_POOL without nome ───────────────────────────────────────────
{
  const msg = suggestCallNowMessage("HOT_POOL", null);
  assert.ok(!msg.includes("null"), "HOT_POOL without nome must not include 'null'");
  console.log("✓ HOT_POOL sem nome:", msg);
}

// ─── Test 7: Only first name is used when full name is provided ──────────────
{
  const msg = suggestCallNowMessage("WARM_POOL", "Maria Clara Souza");
  assert.ok(msg.includes("Maria"), "should use only first name from full name");
  assert.ok(!msg.includes("Clara"), "should NOT include middle/last names");
  console.log("✓ Apenas primeiro nome:", msg);
}

// ─── Test 8: Messages are different across pools ──────────────────────────────
{
  const cold = suggestCallNowMessage("COLD_POOL", "Ana");
  const warm = suggestCallNowMessage("WARM_POOL", "Ana");
  const hot = suggestCallNowMessage("HOT_POOL", "Ana");
  assert.notEqual(cold, warm, "COLD and WARM messages should differ");
  assert.notEqual(warm, hot, "WARM and HOT messages should differ");
  assert.notEqual(cold, hot, "COLD and HOT messages should differ");
  console.log("✓ Mensagens distintas por pool");
}

// ─── Test 9: Empty string nome treated as no name ────────────────────────────
{
  const msg = suggestCallNowMessage("COLD_POOL", "");
  assert.ok(!msg.startsWith("Oi, !"), "empty string nome should not produce 'Oi, !'");
  // Should match the null fallback
  const fallback = suggestCallNowMessage("COLD_POOL", null);
  assert.equal(msg, fallback, "empty string nome should produce same message as null nome");
  console.log("✓ Nome vazio tratado como sem nome:", msg);
}

console.log("\nbases_call_now_suggest.smoke: ok");
