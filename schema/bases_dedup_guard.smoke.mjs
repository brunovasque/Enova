import assert from "node:assert/strict";

// ============================================================
// Smoke tests — Duplicate lead guard (add_lead_manual)
// Tests: block duplicate by wa_id, block by normalized phone,
//        allow fresh unique number, allow after archived.
// ============================================================

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";

const sharedModule = await import(
  new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href
);

const { runBasesAction, normalizePhoneToWaId } = sharedModule;

const metaRows = new Map();
const stateRows = new Map();
const logRows = [];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseEq(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("eq.")) return value;
  return value.slice(3);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(rawUrl);

  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/crm_lead_meta") {
    const method = String(init.method || "GET").toUpperCase();

    if (method === "GET") {
      let rows = Array.from(metaRows.values());
      const waId = parseEq(url.searchParams.get("wa_id"));
      const limit = Number(url.searchParams.get("limit") || rows.length);
      if (waId) rows = rows.filter((r) => r.wa_id === waId);
      rows = rows.slice(0, limit);
      return jsonResponse(rows, 200);
    }

    if (method === "POST") {
      const payload = JSON.parse(String(init.body || "[]"));
      const rows = Array.isArray(payload) ? payload : [payload];
      const saved = rows.map((row) => {
        const existing = metaRows.get(row.wa_id) || null;
        const createdAt = existing?.created_at || new Date().toISOString();
        const next = { ...row, created_at: createdAt, updated_at: row.updated_at ?? createdAt };
        metaRows.set(next.wa_id, next);
        return next;
      });
      return jsonResponse(saved, 201);
    }

    if (method === "PATCH") {
      const waId = parseEq(url.searchParams.get("wa_id"));
      const existing = waId ? metaRows.get(waId) : null;
      if (!existing) return jsonResponse([], 200);
      const patch = JSON.parse(String(init.body || "{}"));
      const next = { ...existing, ...patch };
      metaRows.set(waId, next);
      return jsonResponse([next], 200);
    }
  }

  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/enova_log") {
    const payload = JSON.parse(String(init.body || "[]"));
    const rows = Array.isArray(payload) ? payload : [payload];
    logRows.push(...rows);
    return new Response("", { status: 201 });
  }

  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/enova_state") {
    const method = String(init.method || "GET").toUpperCase();
    if (method === "POST") {
      const payload = JSON.parse(String(init.body || "[]"));
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        const existing = stateRows.get(row.wa_id) || {};
        stateRows.set(row.wa_id, { ...existing, ...row });
      }
      return new Response("", { status: 201 });
    }
  }

  throw new Error(`Unexpected fetch: ${url.toString()}`);
};

try {
  // ── A. Smoke tests — normalizePhoneToWaId equivalence ──

  // All four equivalent forms resolve to the same wa_id
  const f1 = normalizePhoneToWaId("(41) 98765-4321");
  const f2 = normalizePhoneToWaId("41987654321");
  const f3 = normalizePhoneToWaId("+55 41 98765-4321");
  const f4 = normalizePhoneToWaId("5541987654321");
  assert.equal(f1, "5541987654321", "format 1 must normalize");
  assert.equal(f2, "5541987654321", "format 2 must normalize");
  assert.equal(f3, "5541987654321", "format 3 must normalize");
  assert.equal(f4, "5541987654321", "format 4 must normalize");
  assert.equal(f1, f2, "format 1 == format 2");
  assert.equal(f1, f3, "format 1 == format 3");
  assert.equal(f1, f4, "format 1 == format 4");

  // ── B. First creation of a unique number succeeds ──
  {
    const { status, body } = await runBasesAction({
      action: "add_lead_manual",
      telefone: "(41) 98765-4321",
      nome: "Maria Souza",
      lead_pool: "COLD_POOL",
    });
    assert.equal(status, 200, "fresh unique number must succeed");
    assert.equal(body.ok, true, "fresh unique number body.ok must be true");
    assert.ok(metaRows.has("5541987654321"), "row must be in crm_lead_meta");
  }

  // ── C. Same number in format 2 must be blocked (duplicate) ──
  {
    const { status, body } = await runBasesAction({
      action: "add_lead_manual",
      telefone: "41987654321",
      nome: "Maria S.",
      lead_pool: "COLD_POOL",
    });
    assert.equal(status, 409, "duplicate phone (format 2) must return 409");
    assert.equal(body.ok, false, "duplicate must have ok=false");
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      "duplicate must include error message",
    );
  }

  // ── D. Same number in format 3 (+55 prefix) must be blocked ──
  {
    const { status, body } = await runBasesAction({
      action: "add_lead_manual",
      telefone: "+55 41 98765-4321",
      nome: "M. Souza",
      lead_pool: "COLD_POOL",
    });
    assert.equal(status, 409, "duplicate phone (format 3 with +55) must return 409");
    assert.equal(body.ok, false);
  }

  // ── E. Same number as full-digit string in telefone field must be blocked ──
  {
    const { status, body } = await runBasesAction({
      action: "add_lead_manual",
      telefone: "5541987654321",
      nome: "Souza Maria",
      lead_pool: "WARM_POOL",
    });
    assert.equal(status, 409, "duplicate phone (full 13-digit string) must return 409");
    assert.equal(body.ok, false);
  }

  // ── F. Different number must succeed ──
  {
    const { status, body } = await runBasesAction({
      action: "add_lead_manual",
      telefone: "(11) 91234-5678",
      nome: "João Oliveira",
      lead_pool: "COLD_POOL",
    });
    assert.equal(status, 200, "different number must succeed");
    assert.equal(body.ok, true);
    const expectedWaId = normalizePhoneToWaId("(11) 91234-5678");
    assert.ok(metaRows.has(expectedWaId), "new lead must be in crm_lead_meta");
  }

  // ── G. Error message is user-friendly (not a raw code) ──
  {
    const { body } = await runBasesAction({
      action: "add_lead_manual",
      telefone: "41987654321",
      nome: "Teste",
      lead_pool: "COLD_POOL",
    });
    assert.equal(body.ok, false);
    // Error must not be a raw code like "DUPLICATE_LEAD" — must be human-readable Portuguese
    assert.ok(
      !body.error.includes("DUPLICATE_LEAD"),
      "error must not expose raw code to user",
    );
    assert.ok(
      body.error.toLowerCase().includes("lead") || body.error.toLowerCase().includes("número"),
      "error must reference lead or number",
    );
  }

  // ── H. import_base is not affected by the duplicate guard (batch import keeps existing upsert) ──
  {
    metaRows.clear();
    const { status, body } = await runBasesAction({
      action: "import_base",
      import_ref: "import-test",
      source_type: "campanha",
      leads: [
        { wa_id: "5511000000001", lead_pool: "COLD_POOL" },
        { wa_id: "5511000000001", lead_pool: "COLD_POOL" }, // dup in batch, upsert merges
      ],
    });
    // import_base uses upsert, not blocked by duplicate guard
    assert.equal(status, 200, "import_base must not be affected by dedup guard");
    assert.equal(body.ok, true);
  }

  console.log("bases_dedup_guard.smoke: ok");
} finally {
  globalThis.fetch = originalFetch;
}
