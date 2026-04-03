// Smoke test: add_lead_manual deve sincronizar nome em enova_state
// Garante que o Atendimento (que lê e.nome de enova_state via enova_attendance_v1) receba o nome correto.

import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";
process.env.WORKER_BASE_URL = "https://worker.example";
process.env.ENOVA_ADMIN_KEY = "adm-key";

const { runBasesAction } = await import(
  new URL("../panel/app/api/bases/_shared.ts", import.meta.url).href
);

const metaRows = new Map();
const stateRows = new Map();
const logRows = [];

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
    if (method === "POST") {
      const payload = JSON.parse(String(init.body || "[]"));
      const rows = Array.isArray(payload) ? payload : [payload];
      const saved = rows.map((row, index) => {
        const createdAt = `2026-04-03T00:00:${String(index).padStart(2, "0")}.000Z`;
        const next = { ...row, created_at: createdAt, updated_at: row.updated_at ?? createdAt };
        metaRows.set(next.wa_id, next);
        return next;
      });
      return new Response(JSON.stringify(saved), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "GET") {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
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

  if (url.origin === "https://supabase.example" && url.pathname === "/rest/v1/enova_log") {
    const payload = JSON.parse(String(init.body || "[]"));
    logRows.push(...(Array.isArray(payload) ? payload : [payload]));
    return new Response("", { status: 201 });
  }

  throw new Error(`Unexpected fetch: ${url.toString()}`);
};

try {
  // ── Smoke 1: lead manual COM nome → nome salvo em crm_lead_meta E em enova_state ──
  {
    const { status, body } = await runBasesAction({
      action: "add_lead_manual",
      wa_id: "5511999990101",
      nome: "João da Silva",
      lead_pool: "COLD_POOL",
      source_type: "campanha",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    // Bases: nome salvo em crm_lead_meta
    assert.equal(metaRows.get("5511999990101")?.nome, "João da Silva", "nome deve estar em crm_lead_meta (Bases)");

    // Atendimento: nome sincronizado em enova_state (lido por enova_attendance_v1)
    assert.equal(stateRows.get("5511999990101")?.nome, "João da Silva", "nome deve estar em enova_state (Atendimento)");

    // source_type continua salvo
    assert.equal(stateRows.get("5511999990101")?.source_type, "campanha", "source_type deve estar em enova_state");
  }

  // ── Smoke 2: lead manual SEM nome → enova_state.nome não sobrescrito ──
  // Simula lead que já tem nome no funil (enova_state) mas é re-adicionado sem nome
  {
    // Pre-seed enova_state com nome do funil
    stateRows.set("5511999990102", { wa_id: "5511999990102", nome: "Maria Funil", source_type: "fria" });

    const { status, body } = await runBasesAction({
      action: "add_lead_manual",
      wa_id: "5511999990102",
      // nome NÃO fornecido
      lead_pool: "WARM_POOL",
      source_type: "morna",
    });
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    // Nome do funil deve ser preservado (não sobrescrito com null)
    assert.equal(stateRows.get("5511999990102")?.nome, "Maria Funil", "nome do funil não deve ser sobrescrito por null");

    // source_type deve ser atualizado
    assert.equal(stateRows.get("5511999990102")?.source_type, "morna", "source_type deve ser atualizado");
  }

  // ── Smoke 3: regressão import_base — source_type ainda funciona, nome não quebra ──
  {
    const { status, body } = await runBasesAction({
      action: "import_base",
      import_ref: "import-regressao",
      source_type: "campanha",
      leads: [
        { wa_id: "5511999990103", nome: "Carlos Import", lead_pool: "COLD_POOL" },
        { wa_id: "5511999990104", lead_pool: "HOT_POOL", lead_temp: "HOT" },
      ],
    });
    assert.equal(status, 200);
    assert.equal(body.imported_count, 2);

    // Importação continua gravando source_type em enova_state
    assert.equal(stateRows.get("5511999990103")?.source_type, "campanha", "import_base deve salvar source_type");
    assert.equal(stateRows.get("5511999990104")?.source_type, "campanha", "import_base deve salvar source_type");

    // import_base NÃO sincroniza nome em enova_state (fora do escopo deste PR)
    // — apenas documenta o comportamento atual para regressão
    assert.equal(metaRows.get("5511999990103")?.nome, "Carlos Import", "import_base salva nome em crm_lead_meta");
  }

  // ── Smoke 4: audit log registrado corretamente ──
  {
    const tags = logRows.map((r) => r.tag);
    assert.ok(tags.includes("bases_add_lead_manual"), "audit log bases_add_lead_manual deve existir");
  }

  console.log("add_lead_manual_nome_sync.smoke: ok");
} finally {
  globalThis.fetch = originalFetch;
}
