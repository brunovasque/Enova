// ============================================================
// smoke test: dossie wa_id lookup normalization
// Validates buildWaIdCandidates logic from panel/app/dossie/actions.ts
// Run: node schema/dossie_waId_lookup.smoke.mjs
// ============================================================

import assert from "node:assert/strict";

// ── Mirror of buildWaIdCandidates (copied from actions.ts logic) ──

function buildWaIdCandidates(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  const set = new Set();
  set.add(digits);

  // When no country code is present, try with Brazil prefix 55
  if (!digits.startsWith("55") && digits.length <= 11) {
    set.add(`55${digits}`);
  }

  // BR 9-digit flex: 55 + DDD(2) + [9] + number(8)
  for (const c of [...set]) {
    if (c.startsWith("55") && c.length === 13 && c[4] === "9") {
      set.add(`${c.slice(0, 4)}${c.slice(5)}`);
    } else if (c.startsWith("55") && c.length === 12) {
      set.add(`${c.slice(0, 4)}9${c.slice(4)}`);
    }
  }

  return [...set];
}

console.log("=== dossie_waId_lookup.smoke.mjs ===");

// ── Test 1: exact valid wa_id (13 digits with country code and 9th digit) ──
// User enters exactly as stored → single candidate, no flex needed
{
  const candidates = buildWaIdCandidates("5511999990000");
  assert.ok(candidates.includes("5511999990000"), "T1: full 13-digit wa_id is a candidate");
  assert.ok(candidates.length >= 1, "T1: at least 1 candidate");
}

// ── Test 2: formatted input (spaces, dashes, parentheses) ──
// User copies a WhatsApp-formatted number
{
  const candidates = buildWaIdCandidates("(55) 11 99999-0000");
  assert.ok(candidates.includes("5511999990000"), "T2: formatted number normalizes to correct wa_id");
}

// ── Test 3: missing country code (11 digits) ──
// User enters only the local number without 55
{
  const candidates = buildWaIdCandidates("11999990000");
  assert.ok(candidates.includes("11999990000"), "T3: 11-digit input kept as-is");
  assert.ok(candidates.includes("5511999990000"), "T3: 55 prefix added as candidate");
}

// ── Test 4: missing country code (10 digits, older format without 9th digit) ──
{
  const candidates = buildWaIdCandidates("1199990000");
  assert.ok(candidates.includes("1199990000"), "T4: 10-digit input kept as-is");
  assert.ok(candidates.includes("551199990000"), "T4: 55 prefix added as candidate");
}

// ── Test 5: 9-digit flex — 12-digit stored, user enters 13-digit ──
// Stored as 551199990000 (12 digits without 9), user enters 5511999990000 (13 digits with 9)
{
  const candidates = buildWaIdCandidates("5511999990000");
  assert.ok(candidates.includes("5511999990000"), "T5: 13-digit input kept as-is");
  // 13-digit starting with 55, c[4] = '9' → adds 12-digit variant
  // c = "5511999990000", c[4]='9' → "5511" + "99990000" = "551199990000"
  assert.ok(candidates.includes("551199990000"), "T5: 12-digit 9-flex variant added");
}

// ── Test 6: 9-digit flex — 13-digit stored, user enters 12-digit ──
// Stored as 5511999990000 (13 digits with 9), user enters 551199990000 (12 digits without 9)
{
  const candidates = buildWaIdCandidates("551199990000");
  assert.ok(candidates.includes("551199990000"), "T6: 12-digit input kept as-is");
  // 12-digit starting with 55 → adds 13-digit variant
  // c = "551199990000", length=12 → add "5511" + "9" + "99990000" = "5511999990000"
  assert.ok(candidates.includes("5511999990000"), "T6: 13-digit 9-flex variant added");
}

// ── Test 7: empty input → no candidates ──
{
  const candidates = buildWaIdCandidates("");
  assert.equal(candidates.length, 0, "T7: empty string returns empty candidates");
}

// ── Test 8: non-digit-only input (e.g. all spaces or symbols) → no candidates ──
{
  const candidates = buildWaIdCandidates("   ---   ");
  assert.equal(candidates.length, 0, "T8: non-digit input returns empty candidates");
}

// ── Test 9: international number not starting with 55 (no prefix logic applied) ──
{
  const candidates = buildWaIdCandidates("5491123456789"); // Argentina 54
  assert.ok(candidates.includes("5491123456789"), "T9: non-BR international number kept as-is");
  // 13 digits, starts with 54 (not 55), so no 55-prefix or 9-flex applied
  const startsWith55 = candidates.some((c) => c.startsWith("55"));
  assert.equal(startsWith55, false, "T9: no 55-prefix added for non-BR country code");
}

// ── Test 10: duplicate deduplication ──
// Entering a 13-digit number twice with different formatting should not produce duplicates
{
  const c1 = buildWaIdCandidates("5511999990000");
  const c2 = buildWaIdCandidates("55-11-99999-0000");
  // Both should normalize to the same candidates
  assert.deepEqual(new Set(c1), new Set(c2), "T10: same number in different formats produces same candidates");
}

console.log("✅ All 10 smoke tests passed.");
