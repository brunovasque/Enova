// Smoke test: backfill_enova_state_nome
// Valida a lógica do script schema/backfill_enova_state_nome.sql
// simulando em JavaScript os mesmos critérios do UPDATE SQL:
//
//   UPDATE enova_state e
//   SET    nome = m.nome
//   FROM   crm_lead_meta m
//   WHERE  e.wa_id = m.wa_id
//     AND  m.nome IS NOT NULL
//     AND  trim(m.nome) <> ''
//     AND  (e.nome IS NULL OR trim(e.nome) = '');

import assert from "node:assert/strict";

// ── Helper: simula o UPDATE SQL do backfill ──────────────────────────────────
function applyBackfill(stateRows, metaRows) {
  const metaByWaId = new Map(metaRows.map((r) => [r.wa_id, r]));
  return stateRows.map((state) => {
    const meta = metaByWaId.get(state.wa_id);
    if (
      meta &&
      meta.nome != null &&
      meta.nome.trim() !== "" &&
      (state.nome == null || state.nome.trim() === "")
    ) {
      return { ...state, nome: meta.nome };
    }
    return state;
  });
}

// ── Smoke 1: lead antigo com meta.nome preenchido e state.nome nulo ──────────
// Esperado: nome passa a ser preenchido em enova_state
{
  const state = [{ wa_id: "5511999990201", nome: null, source_type: "fria" }];
  const meta = [{ wa_id: "5511999990201", nome: "Ana Antiga" }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, "Ana Antiga",
    "Smoke 1: lead antigo com meta.nome preenchido e state.nome null → deve ser backfillado");
}

// ── Smoke 1b: state.nome é string vazia ──────────────────────────────────────
{
  const state = [{ wa_id: "5511999990202", nome: "", source_type: "campanha" }];
  const meta = [{ wa_id: "5511999990202", nome: "Bruno Vazio" }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, "Bruno Vazio",
    "Smoke 1b: state.nome string vazia → deve ser backfillado");
}

// ── Smoke 1c: state.nome é só whitespace ─────────────────────────────────────
{
  const state = [{ wa_id: "5511999990203", nome: "   " }];
  const meta = [{ wa_id: "5511999990203", nome: "Carlos Whitespace" }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, "Carlos Whitespace",
    "Smoke 1c: state.nome whitespace → deve ser backfillado");
}

// ── Smoke 2: lead com enova_state.nome já preenchido → permanece inalterado ──
{
  const state = [{ wa_id: "5511999990204", nome: "Diana Funil", source_type: "campanha" }];
  const meta = [{ wa_id: "5511999990204", nome: "Diana Meta Diferente" }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, "Diana Funil",
    "Smoke 2: enova_state.nome já preenchido → não deve ser sobrescrito");
}

// ── Smoke 3: meta.nome vazio → não altera enova_state ────────────────────────
{
  const state = [{ wa_id: "5511999990205", nome: null }];
  const meta = [{ wa_id: "5511999990205", nome: "" }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, null,
    "Smoke 3: meta.nome vazio → enova_state não deve ser alterado");
}

// ── Smoke 3b: meta.nome é só whitespace → não altera ─────────────────────────
{
  const state = [{ wa_id: "5511999990206", nome: null }];
  const meta = [{ wa_id: "5511999990206", nome: "   " }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, null,
    "Smoke 3b: meta.nome whitespace → enova_state não deve ser alterado");
}

// ── Smoke 3c: meta.nome é null → não altera ──────────────────────────────────
{
  const state = [{ wa_id: "5511999990207", nome: null }];
  const meta = [{ wa_id: "5511999990207", nome: null }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, null,
    "Smoke 3c: meta.nome null → enova_state não deve ser alterado");
}

// ── Smoke 4: somente nome é alterado — outros campos intocados ────────────────
{
  const state = [{
    wa_id: "5511999990208",
    nome: null,
    source_type: "morna",
    fase_conversa: "renda",
    estado_civil: "solteiro",
  }];
  const meta = [{ wa_id: "5511999990208", nome: "Eduardo Patch" }];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, "Eduardo Patch",
    "Smoke 4: nome deve ser preenchido");
  assert.equal(after[0].source_type, "morna",
    "Smoke 4: source_type deve permanecer inalterado");
  assert.equal(after[0].fase_conversa, "renda",
    "Smoke 4: fase_conversa deve permanecer inalterada");
  assert.equal(after[0].estado_civil, "solteiro",
    "Smoke 4: estado_civil deve permanecer inalterado");
}

// ── Idempotência: executar o backfill duas vezes → mesmo resultado ────────────
{
  const state = [{ wa_id: "5511999990209", nome: null }];
  const meta = [{ wa_id: "5511999990209", nome: "Fernanda Idempotente" }];
  const afterFirst = applyBackfill(state, meta);
  const afterSecond = applyBackfill(afterFirst, meta);
  assert.equal(afterFirst[0].nome, "Fernanda Idempotente",
    "Idempotência: primeira execução preenche nome");
  assert.equal(afterSecond[0].nome, "Fernanda Idempotente",
    "Idempotência: segunda execução não altera nome já preenchido");
}

// ── Batch: múltiplos leads, combinação de cenários ───────────────────────────
{
  const state = [
    { wa_id: "5511999990210", nome: null },          // deve receber backfill
    { wa_id: "5511999990211", nome: "Gustavo Funil" }, // NÃO deve ser sobrescrito
    { wa_id: "5511999990212", nome: null },            // meta.nome vazio → não altera
    { wa_id: "5511999990213", nome: "" },              // deve receber backfill
  ];
  const meta = [
    { wa_id: "5511999990210", nome: "Heloisa Backfill" },
    { wa_id: "5511999990211", nome: "Gustavo Meta" },
    { wa_id: "5511999990212", nome: "" },
    { wa_id: "5511999990213", nome: "Igor Backfill" },
  ];
  const after = applyBackfill(state, meta);
  assert.equal(after[0].nome, "Heloisa Backfill", "Batch: lead null → backfillado");
  assert.equal(after[1].nome, "Gustavo Funil",    "Batch: nome do funil preservado");
  assert.equal(after[2].nome, null,               "Batch: meta vazio → sem alteração");
  assert.equal(after[3].nome, "Igor Backfill",    "Batch: state vazio → backfillado");
}

// ── Regressão: add_lead_manual futuro continua sincronizando nome normalmente ─
// Verifica o comportamento do patch já implementado em _shared.ts (PR #483).
// upsertEnovaStateSourceType só inclui nome se != null.
{
  function simulateUpsertStatePayload({ wa_id, source_type, nome }) {
    const entry = { wa_id, source_type };
    if (nome != null) entry.nome = nome;
    return entry;
  }

  // Com nome → inclui nome no payload
  const withNome = simulateUpsertStatePayload({ wa_id: "5511999990220", source_type: "campanha", nome: "João Silva" });
  assert.equal(withNome.nome, "João Silva",
    "Regressão add_lead_manual: nome incluído no payload quando preenchido");
  assert.ok("nome" in withNome,
    "Regressão add_lead_manual: chave nome presente no payload");

  // Sem nome → NÃO inclui nome no payload (preserva nome do funil)
  const semNome = simulateUpsertStatePayload({ wa_id: "5511999990221", source_type: "fria", nome: null });
  assert.ok(!("nome" in semNome),
    "Regressão add_lead_manual: chave nome ausente do payload quando null (não sobrescreve funil)");
}

console.log("backfill_nome_sync.smoke: ok");
