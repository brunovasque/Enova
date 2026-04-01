/**
 * Smoke tests for bases usability improvements (Phase 1):
 * - normalizePhoneToWaId helper
 * - normalizeLeadMetaInput accepting nome + telefone
 * - add_lead_manual via nome + telefone
 * - import_base via nome + telefone
 */
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";

const sharedModule = await import(
  new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href
);

const {
  normalizePhoneToWaId,
  normalizeLeadMetaInput,
  runBasesAction,
} = sharedModule;

// ─── normalizePhoneToWaId ────────────────────────────────────────────────────

// Already full international (13 digits, starts with 55)
assert.equal(normalizePhoneToWaId("5511999990001"), "5511999990001", "full wa_id passthrough 13d");
// Already full international (12 digits, starts with 55)
assert.equal(normalizePhoneToWaId("551199990001"), "551199990001", "full wa_id passthrough 12d");
// 11 digits (DDD + 9-digit mobile) → prepend 55
assert.equal(normalizePhoneToWaId("11999990001"), "5511999990001", "11d → prepend 55");
// 10 digits (DDD + 8-digit landline) → prepend 55
assert.equal(normalizePhoneToWaId("1199990001"), "551199990001", "10d → prepend 55");
// Formatted phone with spaces/dashes/parens
assert.equal(normalizePhoneToWaId("(11) 99999-0001"), "5511999990001", "formatted phone");
assert.equal(normalizePhoneToWaId("11 9 9999-0001"), "5511999990001", "spaced phone");
// Already with +55
assert.equal(normalizePhoneToWaId("+55 11 99999-0001"), "5511999990001", "+55 formatted");
// Too short → null
assert.equal(normalizePhoneToWaId("12345"), null, "too short → null");
// Empty → null
assert.equal(normalizePhoneToWaId(""), null, "empty → null");
// Non-string → null
assert.equal(normalizePhoneToWaId(null), null, "null → null");
assert.equal(normalizePhoneToWaId(undefined), null, "undefined → null");

// ─── normalizeLeadMetaInput with telefone ────────────────────────────────────

{
  const row = normalizeLeadMetaInput(
    { telefone: "(11) 99999-0001", lead_pool: "COLD_POOL" },
    { defaultLeadSource: "manual" },
  );
  assert.equal(row.wa_id, "5511999990001", "wa_id derived from telefone");
  assert.equal(row.telefone, "(11) 99999-0001", "telefone stored as-is");
  assert.equal(row.lead_pool, "COLD_POOL");
}

{
  const row = normalizeLeadMetaInput(
    { nome: "João Silva", telefone: "11999990001", lead_pool: "WARM_POOL" },
    {},
  );
  assert.equal(row.wa_id, "5511999990001", "wa_id derived from 11-digit phone");
  assert.equal(row.nome, "João Silva", "nome stored");
  assert.equal(row.telefone, "11999990001", "telefone stored");
}

// wa_id explicit takes priority over telefone
{
  const row = normalizeLeadMetaInput(
    { wa_id: "5511888880001", telefone: "11999990001", lead_pool: "HOT_POOL" },
    {},
  );
  assert.equal(row.wa_id, "5511888880001", "explicit wa_id takes priority");
  assert.equal(row.telefone, "11999990001", "telefone still stored");
}

// no wa_id and no telefone → throws
{
  let threw = false;
  try {
    normalizeLeadMetaInput({ lead_pool: "COLD_POOL" }, {});
  } catch {
    threw = true;
  }
  assert.ok(threw, "should throw when neither wa_id nor telefone provided");
}

// ─── add_lead_manual via telefone ────────────────────────────────────────────

const metaRows = new Map();
const logRows = [];

globalThis.fetch = async (input, init = {}) => {
  const rawUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(rawUrl);

  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/crm_lead_meta"
  ) {
    const method = String(init.method || "GET").toUpperCase();

    if (method === "POST") {
      const payload = JSON.parse(String(init.body || "[]"));
      const rows = Array.isArray(payload) ? payload : [payload];
      const saved = rows.map((row) => {
        const next = { ...row, created_at: "2026-03-30T00:00:00.000Z" };
        metaRows.set(row.wa_id, next);
        return next;
      });
      return new Response(JSON.stringify(saved), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    if (method === "GET") {
      const waId = url.searchParams.get("wa_id");
      let rows = Array.from(metaRows.values());
      if (waId?.startsWith("eq.")) rows = rows.filter((r) => r.wa_id === waId.slice(3));
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/enova_log"
  ) {
    const payload = JSON.parse(String(init.body || "[]"));
    logRows.push(...(Array.isArray(payload) ? payload : [payload]));
    return new Response("", { status: 201 });
  }

  if (
    url.origin === "https://supabase.example" &&
    url.pathname === "/rest/v1/enova_state"
  ) {
    return new Response("", { status: 201 });
  }

  throw new Error(`Unexpected fetch: ${url.toString()}`);
};

// add_lead_manual with telefone only
{
  const result = await runBasesAction({
    action: "add_lead_manual",
    nome: "Ana Souza",
    telefone: "11 99999-0002",
    lead_pool: "COLD_POOL",
  });
  assert.equal(result.status, 200, "add_lead_manual via telefone → 200");
  assert.equal(result.body.ok, true);
  const lead = result.body.lead;
  assert.equal(lead.wa_id, "5511999990002", "wa_id normalized from telefone");
  assert.equal(lead.nome, "Ana Souza", "nome persisted");
  assert.equal(lead.telefone, "11 99999-0002", "telefone persisted");
}

// import_base with nome + telefone
{
  const result = await runBasesAction({
    action: "import_base",
    import_ref: "import-smoke",
    leads: [
      { nome: "Carlos Lima", telefone: "(11) 88888-0003", lead_pool: "WARM_POOL" },
      { nome: "Luisa", telefone: "11777770004", lead_pool: "HOT_POOL" },
    ],
  });
  assert.equal(result.status, 200, "import_base with nome/telefone → 200");
  assert.equal(result.body.imported_count, 2, "imported 2 leads");

  const row1 = metaRows.get("5511888880003");
  assert.ok(row1, "lead 1 stored");
  assert.equal(row1.nome, "Carlos Lima");
  assert.equal(row1.telefone, "(11) 88888-0003");

  const row2 = metaRows.get("5511777770004");
  assert.ok(row2, "lead 2 stored");
  assert.equal(row2.nome, "Luisa");
}

// audit log should have entries for all operations
assert.ok(logRows.length >= 3, "at least 3 audit log entries");
assert.ok(
  logRows.every((r) => r.wa_id !== null),
  "all audit rows have wa_id set",
);

console.log("bases_usability_v1.smoke: ok");
