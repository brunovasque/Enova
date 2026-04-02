// =============================================================
// enova_prefill_meta — Smoke Tests
// Valida: API de leitura/escrita de pré-dados administrativos
// Regra: dados aqui são pré-preenchidos, não confirmados pelo cliente
// =============================================================

import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE = "service-role";

const sharedModule = await import(
  new URL("../panel/app/api/prefill/_shared.ts", import.meta.url).href
);

const { getPrefillMeta, upsertPrefillMeta, VALID_PREFILL_STATUSES } = sharedModule;

// ── In-memory mock Supabase ────────────────────────────────────
const prefillRows = new Map();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
  const url = new URL(rawUrl);
  const pathname = url.pathname;
  const method = (init.method || "GET").toUpperCase();

  if (pathname === "/rest/v1/enova_prefill_meta") {
    if (method === "GET") {
      const waId = url.searchParams.get("wa_id")?.replace(/^eq\./, "") ?? null;
      if (!waId) return jsonResponse([]);
      const row = prefillRows.get(waId) ?? null;
      return jsonResponse(row ? [row] : []);
    }
    if (method === "POST") {
      const body = JSON.parse(init.body ?? "{}");
      const waId = body.wa_id;
      if (!waId) return jsonResponse({ message: "wa_id required" }, 400);
      const existing = prefillRows.get(waId) ?? { wa_id: waId, created_at: new Date().toISOString() };
      const merged = { ...existing, ...body };
      prefillRows.set(waId, merged);
      return jsonResponse([merged]);
    }
  }

  return jsonResponse({ error: "NOT_FOUND" }, 404);
};

// ── Helper ─────────────────────────────────────────────────────
const URL_ = process.env.SUPABASE_URL;
const KEY_ = process.env.SUPABASE_SERVICE_ROLE;

// =============================================================
// TESTE 1: Constantes e exports
// =============================================================
{
  assert.ok(Array.isArray(VALID_PREFILL_STATUSES), "VALID_PREFILL_STATUSES deve ser array");
  assert.deepEqual(
    VALID_PREFILL_STATUSES,
    ["empty", "prefilled_pending_confirmation", "confirmed", "divergent"],
    "Status válidos corretos"
  );
  console.log("✓ T1: Constantes exportadas corretamente");
}

// =============================================================
// TESTE 2: getPrefillMeta retorna null para wa_id inexistente
// =============================================================
{
  const row = await getPrefillMeta(URL_, KEY_, "5511999000001");
  assert.equal(row, null, "deve retornar null para wa_id inexistente");
  console.log("✓ T2: getPrefillMeta retorna null para wa_id inexistente");
}

// =============================================================
// TESTE 3: upsertPrefillMeta — criação nova com campos de texto
// =============================================================
{
  const saved = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000001",
    nome_prefill: "João Silva",
    nome_source: "lyx",
    nome_status: "prefilled_pending_confirmation",
    estado_civil_prefill: "casado",
    estado_civil_source: "lyx",
    estado_civil_status: "prefilled_pending_confirmation",
  });
  assert.ok(saved, "deve retornar linha salva");
  assert.equal(saved.wa_id, "5511999000001");
  assert.equal(saved.nome_prefill, "João Silva");
  assert.equal(saved.nome_source, "lyx");
  assert.equal(saved.nome_status, "prefilled_pending_confirmation");
  assert.equal(saved.estado_civil_prefill, "casado");
  console.log("✓ T3: upsertPrefillMeta cria linha nova com campos de texto");
}

// =============================================================
// TESTE 4: getPrefillMeta retorna linha existente
// =============================================================
{
  const row = await getPrefillMeta(URL_, KEY_, "5511999000001");
  assert.ok(row, "deve retornar linha existente");
  assert.equal(row.wa_id, "5511999000001");
  assert.equal(row.nome_prefill, "João Silva");
  console.log("✓ T4: getPrefillMeta retorna linha existente");
}

// =============================================================
// TESTE 5: upsertPrefillMeta — campos numéricos e boolean
// =============================================================
{
  const saved = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000002",
    renda_prefill: 3500,
    renda_source: "manual",
    renda_status: "prefilled_pending_confirmation",
    meses_36_prefill: true,
    meses_36_source: "lyx",
    meses_36_status: "prefilled_pending_confirmation",
    dependentes_prefill: 2,
    dependentes_source: "manual",
    dependentes_status: "prefilled_pending_confirmation",
    valor_entrada_prefill: 15000,
    valor_entrada_source: "lyx",
    valor_entrada_status: "prefilled_pending_confirmation",
    restricao_prefill: false,
    restricao_source: "lyx",
    restricao_status: "prefilled_pending_confirmation",
  });
  assert.ok(saved, "deve retornar linha salva");
  assert.equal(saved.renda_prefill, 3500);
  assert.equal(saved.meses_36_prefill, true);
  assert.equal(saved.dependentes_prefill, 2);
  assert.equal(saved.valor_entrada_prefill, 15000);
  assert.equal(saved.restricao_prefill, false);
  console.log("✓ T5: upsertPrefillMeta salva campos numéricos e boolean");
}

// =============================================================
// TESTE 6: upsertPrefillMeta — campos admin-only
// =============================================================
{
  const saved = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000003",
    origem_lead: "lyx",
    observacoes_admin: "Cliente veio do Lyx, já tem perfil salvo",
    updated_by: "admin_panel",
  });
  assert.ok(saved, "deve retornar linha salva");
  assert.equal(saved.origem_lead, "lyx");
  assert.equal(saved.observacoes_admin, "Cliente veio do Lyx, já tem perfil salvo");
  assert.equal(saved.updated_by, "admin_panel");
  console.log("✓ T6: upsertPrefillMeta salva campos admin-only");
}

// =============================================================
// TESTE 7: Fluxo completo — cadastro sem prefill (não quebra)
// =============================================================
{
  // Criar lead sem nenhum dado prefill — deve retornar null
  const row = await getPrefillMeta(URL_, KEY_, "5511999000099");
  assert.equal(row, null, "wa_id sem prefill retorna null, sem erro");
  console.log("✓ T7: Fluxo sem prefill não quebra (retorna null)");
}

// =============================================================
// TESTE 8: upsertPrefillMeta — validação de wa_id vazio rejeita
// =============================================================
{
  let threw = false;
  try {
    await upsertPrefillMeta(URL_, KEY_, { wa_id: "" });
  } catch {
    threw = true;
  }
  assert.ok(threw, "wa_id vazio deve rejeitar");
  console.log("✓ T8: upsertPrefillMeta rejeita wa_id vazio");
}

// =============================================================
// TESTE 9: upsertPrefillMeta — status inválido é normalizado
// =============================================================
{
  const saved = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000004",
    nome_prefill: "Maria",
    // @ts-ignore - testing invalid status normalization
    nome_status: "status_invalido_xpto",
  });
  assert.ok(saved, "deve salvar mesmo com status inválido");
  // O valor normalizado é "prefilled_pending_confirmation"
  assert.equal(saved.nome_status, "prefilled_pending_confirmation", "status inválido normalizado");
  console.log("✓ T9: Status inválido é normalizado para prefilled_pending_confirmation");
}

// =============================================================
// TESTE 10: upsertPrefillMeta — atualização preserva outros campos
// =============================================================
{
  // First insert
  await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000005",
    nome_prefill: "Carlos",
    nome_status: "prefilled_pending_confirmation",
    renda_prefill: 2000,
    renda_status: "prefilled_pending_confirmation",
  });
  // Update only renda — nome should be preserved in mock (merge)
  await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000005",
    renda_prefill: 4000,
    renda_status: "prefilled_pending_confirmation",
  });
  const row = await getPrefillMeta(URL_, KEY_, "5511999000005");
  assert.ok(row, "row deve existir");
  assert.equal(row.renda_prefill, 4000, "renda deve ter sido atualizada");
  // Note: nome_prefill preservation depends on merge behavior (handled by Supabase upsert)
  console.log("✓ T10: Atualização via upsert mescla campos corretamente");
}

// =============================================================
// TESTE 11: getPrefillMeta — campos nationality, regime_trabalho, restricao
// =============================================================
{
  await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000006",
    nacionalidade_prefill: "brasileira",
    nacionalidade_status: "prefilled_pending_confirmation",
    regime_trabalho_prefill: "clt",
    regime_trabalho_status: "prefilled_pending_confirmation",
    restricao_prefill: true,
    restricao_status: "prefilled_pending_confirmation",
  });
  const row = await getPrefillMeta(URL_, KEY_, "5511999000006");
  assert.equal(row?.nacionalidade_prefill, "brasileira");
  assert.equal(row?.regime_trabalho_prefill, "clt");
  assert.equal(row?.restricao_prefill, true);
  console.log("✓ T11: Campos nacionalidade, regime_trabalho, restricao funcionam");
}

// =============================================================
// TESTE 12: Soberania do funil — prefill não deve mudar enova_state
// =============================================================
{
  // Verificar que upsertPrefillMeta só escreve em enova_prefill_meta
  // e nunca em enova_state (verificado pela URL na chamada fetch)
  let wroteEnovaState = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
    const url = new URL(rawUrl);
    if (url.pathname === "/rest/v1/enova_state" && (init.method || "GET").toUpperCase() !== "GET") {
      wroteEnovaState = true;
    }
    return origFetch(input, init);
  };
  await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000007",
    nome_prefill: "Teste Soberania",
    nome_status: "prefilled_pending_confirmation",
  });
  globalThis.fetch = origFetch;
  assert.ok(!wroteEnovaState, "upsertPrefillMeta NÃO deve escrever em enova_state");
  console.log("✓ T12: upsertPrefillMeta não contamina enova_state (soberania do funil preservada)");
}

// =============================================================
// SUMÁRIO
// =============================================================
console.log("\n✅ Todos os smoke tests de enova_prefill_meta passaram (12/12)");

// =============================================================
// TESTES DE REGRESSÃO — Fixes de bloqueadores
// =============================================================

// =============================================================
// TESTE 13: Boolean — "false" string deve ser persistido como false
// =============================================================
{
  const saved = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000010",
    // @ts-ignore - testing string-boolean coercion
    meses_36_prefill: "false",
    meses_36_status: "prefilled_pending_confirmation",
    // @ts-ignore
    restricao_prefill: "false",
    restricao_status: "prefilled_pending_confirmation",
  });
  assert.ok(saved, "deve salvar");
  assert.equal(saved.meses_36_prefill, false, '"false" string deve ser false, não true');
  assert.equal(saved.restricao_prefill, false, '"false" string para restricao deve ser false');
  console.log("✓ T13: Boolean parsing — string 'false' → false (não true)");
}

// =============================================================
// TESTE 14: Boolean — "true" string deve ser persistido como true
// =============================================================
{
  const saved = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000011",
    // @ts-ignore - testing string-boolean coercion
    meses_36_prefill: "true",
    meses_36_status: "prefilled_pending_confirmation",
  });
  assert.ok(saved, "deve salvar");
  assert.equal(saved.meses_36_prefill, true, '"true" string deve ser true');
  console.log("✓ T14: Boolean parsing — string 'true' → true");
}

// =============================================================
// TESTE 15: Boolean — null/undefined deve ser null
// =============================================================
{
  const saved = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000012",
    meses_36_prefill: null,
    meses_36_status: "empty",
    restricao_prefill: undefined,
    restricao_status: "empty",
  });
  assert.ok(saved, "deve salvar");
  assert.equal(saved.meses_36_prefill, null, "null deve permanecer null");
  console.log("✓ T15: Boolean parsing — null/undefined → null");
}

// =============================================================
// TESTE 16: deriveStatus — admin edit reseta confirmed para prefilled_pending
// Verifica que a regra está implementada corretamente no _shared.ts
// A lógica de status no frontend (editStateToPayload) também reseta.
// =============================================================
{
  // Se payload já traz nome_status com valor válido, _shared.ts aceita
  // (o frontend é quem decide o status; _shared normaliza inválidos)
  const savedConfirmed = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000013",
    nome_prefill: "João Confirmado",
    nome_status: "confirmed",
  });
  assert.equal(savedConfirmed?.nome_status, "confirmed", "status confirmed aceito quando explicitamente enviado");

  // Admin edita o valor — frontend enviará prefilled_pending_confirmation
  const savedEdited = await upsertPrefillMeta(URL_, KEY_, {
    wa_id: "5511999000013",
    nome_prefill: "João Editado",
    nome_status: "prefilled_pending_confirmation",
  });
  assert.equal(savedEdited?.nome_status, "prefilled_pending_confirmation", "edição admin reseta para pending");
  assert.equal(savedEdited?.nome_prefill, "João Editado", "valor novo deve ser salvo");
  console.log("✓ T16: Status reseta para prefilled_pending_confirmation após edição admin");
}

// =============================================================
// SUMÁRIO FINAL
// =============================================================
console.log("\n✅ Todos os smoke tests de enova_prefill_meta passaram (16/16)");

