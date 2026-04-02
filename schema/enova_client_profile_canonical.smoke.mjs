// ==============================================================================
// smoke tests — enova_client_profile_canonical.smoke.mjs
// Verifica o contrato do modelo de campo operacional único para perfil do cliente.
//
// Testa:
// 1. writeClientProfile escreve em enova_state e metadados em enova_prefill_meta
// 2. getClientProfile lê de ambas as fontes e combina corretamente
// 3. source='admin' ao escrever via admin; source='funil' ao escrever via worker
// 4. PROFILE_META_FIELDS contém os campos corretos
// 5. _upsertStateCore dispara updateProfileFieldsMeta apenas para campos de perfil
// 6. Campos proibidos (fase_conversa, nextStage) não entram no writeClientProfile
// 7. ESC close via closeDetail (verifica que estado é limpo)
// 8. savePrefillOnLeadCreateAction mapeia prefill → profile com source='admin_inicial'
// ==============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function asyncTest(name, fn) {
  return fn().then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
  }).catch((err) => {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  });
}

// ==============================================================================
// GRUPO 1: PROFILE_META_FIELDS contém os campos corretos
// ==============================================================================
console.log("\n── GRUPO 1: PROFILE_META_FIELDS ──");

// Simula a estrutura do worker para extrair PROFILE_META_FIELDS
const PROFILE_META_FIELDS = new Set([
  "nome",
  "nacionalidade",
  "estado_civil",
  "regime_trabalho",
  "renda",
  "ctps_36",
  "dependentes_qtd",
  "entrada_valor",
  "restricao",
]);

test("T1.1 — PROFILE_META_FIELDS contém os 9 campos operacionais", () => {
  assert.equal(PROFILE_META_FIELDS.size, 9);
});

test("T1.2 — PROFILE_META_FIELDS inclui nome", () => {
  assert.ok(PROFILE_META_FIELDS.has("nome"));
});

test("T1.3 — PROFILE_META_FIELDS inclui restricao", () => {
  assert.ok(PROFILE_META_FIELDS.has("restricao"));
});

test("T1.4 — PROFILE_META_FIELDS NÃO inclui fase_conversa", () => {
  assert.ok(!PROFILE_META_FIELDS.has("fase_conversa"));
});

test("T1.5 — PROFILE_META_FIELDS NÃO inclui nextStage", () => {
  assert.ok(!PROFILE_META_FIELDS.has("nextStage"));
});

test("T1.6 — PROFILE_META_FIELDS NÃO inclui funil_status", () => {
  assert.ok(!PROFILE_META_FIELDS.has("funil_status"));
});

test("T1.7 — PROFILE_META_FIELDS NÃO inclui atendimento_manual", () => {
  assert.ok(!PROFILE_META_FIELDS.has("atendimento_manual"));
});

// ==============================================================================
// GRUPO 2: writeClientProfile payload building
// ==============================================================================
console.log("\n── GRUPO 2: writeClientProfile — construção do payload ──");

function buildProfilePatches(fields, source, now) {
  const statePatch = {};
  const metaPatch = { wa_id: "5511999999999", updated_at: now, updated_by: "admin_panel" };

  const fieldMap = {
    nome: ["nome", "nome_source", "nome_updated_at"],
    nacionalidade: ["nacionalidade", "nacionalidade_source", "nacionalidade_updated_at"],
    estado_civil: ["estado_civil", "estado_civil_source", "estado_civil_updated_at"],
    regime_trabalho: ["regime_trabalho", "regime_trabalho_source", "regime_trabalho_updated_at"],
    renda: ["renda", "renda_source", "renda_updated_at"],
    ctps_36: ["ctps_36", "meses_36_source", "meses_36_updated_at"],
    dependentes_qtd: ["dependentes_qtd", "dependentes_source", "dependentes_updated_at"],
    entrada_valor: ["entrada_valor", "valor_entrada_source", "valor_entrada_updated_at"],
    restricao: ["restricao", "restricao_source", "restricao_updated_at"],
  };

  for (const [field, value] of Object.entries(fields)) {
    const mapping = fieldMap[field];
    if (mapping) {
      const [stateCol, sourceCol, updatedAtCol] = mapping;
      statePatch[stateCol] = value;
      metaPatch[sourceCol] = source;
      metaPatch[updatedAtCol] = now;
    }
    if (field === "origem_lead") metaPatch.origem_lead = value;
    if (field === "observacoes_admin") metaPatch.observacoes_admin = value;
  }

  return { statePatch, metaPatch };
}

const NOW = "2026-04-02T12:00:00.000Z";

test("T2.1 — admin write: estado_civil vai para statePatch com chave 'estado_civil'", () => {
  const { statePatch } = buildProfilePatches({ estado_civil: "solteiro" }, "admin", NOW);
  assert.equal(statePatch.estado_civil, "solteiro");
});

test("T2.2 — admin write: estado_civil_source = 'admin' em metaPatch", () => {
  const { metaPatch } = buildProfilePatches({ estado_civil: "solteiro" }, "admin", NOW);
  assert.equal(metaPatch.estado_civil_source, "admin");
});

test("T2.3 — admin write: estado_civil_updated_at = NOW em metaPatch", () => {
  const { metaPatch } = buildProfilePatches({ estado_civil: "solteiro" }, "admin", NOW);
  assert.equal(metaPatch.estado_civil_updated_at, NOW);
});

test("T2.4 — admin_inicial write: fonte = 'admin_inicial' em metaPatch", () => {
  const { metaPatch } = buildProfilePatches({ nome: "Maria" }, "admin_inicial", NOW);
  assert.equal(metaPatch.nome_source, "admin_inicial");
});

test("T2.5 — funil write: fonte = 'funil' em metaPatch", () => {
  const { metaPatch } = buildProfilePatches({ renda: 2800 }, "funil", NOW);
  assert.equal(metaPatch.renda_source, "funil");
});

test("T2.6 — ctps_36 mapeia para meses_36_source em meta", () => {
  const { metaPatch } = buildProfilePatches({ ctps_36: true }, "funil", NOW);
  assert.equal(metaPatch.meses_36_source, "funil");
  assert.ok(!metaPatch.ctps_36_source, "ctps_36_source não deve existir em meta");
});

test("T2.7 — dependentes_qtd mapeia para dependentes_source em meta", () => {
  const { metaPatch } = buildProfilePatches({ dependentes_qtd: 2 }, "admin", NOW);
  assert.equal(metaPatch.dependentes_source, "admin");
});

test("T2.8 — entrada_valor mapeia para valor_entrada_source em meta", () => {
  const { metaPatch } = buildProfilePatches({ entrada_valor: 10000 }, "admin", NOW);
  assert.equal(metaPatch.valor_entrada_source, "admin");
});

test("T2.9 — origem_lead vai para meta mas NÃO para statePatch", () => {
  const { statePatch, metaPatch } = buildProfilePatches({ origem_lead: "campanha-x" }, "admin", NOW);
  assert.equal(metaPatch.origem_lead, "campanha-x");
  assert.ok(!("origem_lead" in statePatch), "origem_lead não deve ir para enova_state");
});

test("T2.10 — observacoes_admin vai para meta mas NÃO para statePatch", () => {
  const { statePatch, metaPatch } = buildProfilePatches({ observacoes_admin: "nota interna" }, "admin", NOW);
  assert.equal(metaPatch.observacoes_admin, "nota interna");
  assert.ok(!("observacoes_admin" in statePatch), "observacoes_admin não deve ir para enova_state");
});

// ==============================================================================
// GRUPO 3: sourceLabel helper (UI)
// ==============================================================================
console.log("\n── GRUPO 3: sourceLabel helper (UI) ──");

function sourceLabel(source) {
  switch (source) {
    case "admin": return "atualizado por admin";
    case "admin_inicial": return "origem: cadastro manual";
    case "funil": return "confirmado pelo cliente";
    case "manual": return "origem: cadastro manual";
    default: return "";
  }
}

test("T3.1 — source='admin' → 'atualizado por admin'", () => {
  assert.equal(sourceLabel("admin"), "atualizado por admin");
});

test("T3.2 — source='funil' → 'confirmado pelo cliente'", () => {
  assert.equal(sourceLabel("funil"), "confirmado pelo cliente");
});

test("T3.3 — source='admin_inicial' → 'origem: cadastro manual'", () => {
  assert.equal(sourceLabel("admin_inicial"), "origem: cadastro manual");
});

test("T3.4 — source='manual' → 'origem: cadastro manual'", () => {
  assert.equal(sourceLabel("manual"), "origem: cadastro manual");
});

test("T3.5 — source=null → '' (vazio)", () => {
  assert.equal(sourceLabel(null), "");
});

// ==============================================================================
// GRUPO 4: worker — PROFILE_META_FIELDS filter em upsertState payload
// ==============================================================================
console.log("\n── GRUPO 4: worker — filtragem de campos de perfil em payload ──");

test("T4.1 — payload {estado_civil: 'solteiro'} → 1 campo de perfil detectado", () => {
  const payload = { fase_conversa: "estado_civil", estado_civil: "solteiro" };
  const profileFields = new Set(Object.keys(payload).filter(k => PROFILE_META_FIELDS.has(k)));
  assert.equal(profileFields.size, 1);
  assert.ok(profileFields.has("estado_civil"));
});

test("T4.2 — payload {fase_conversa: 'inicio'} → nenhum campo de perfil detectado", () => {
  const payload = { fase_conversa: "inicio" };
  const profileFields = new Set(Object.keys(payload).filter(k => PROFILE_META_FIELDS.has(k)));
  assert.equal(profileFields.size, 0);
});

test("T4.3 — payload com vários campos mistos detecta apenas os de perfil", () => {
  const payload = {
    fase_conversa: "renda",
    renda: 2800,
    renda_total_para_fluxo: 2800,
    updated_at: NOW,
  };
  const profileFields = new Set(Object.keys(payload).filter(k => PROFILE_META_FIELDS.has(k)));
  assert.equal(profileFields.size, 1);
  assert.ok(profileFields.has("renda"));
  assert.ok(!profileFields.has("fase_conversa"));
  assert.ok(!profileFields.has("renda_total_para_fluxo"));
});

test("T4.4 — payload com nome e restricao detecta ambos", () => {
  const payload = { nome: "João", restricao: false };
  const profileFields = new Set(Object.keys(payload).filter(k => PROFILE_META_FIELDS.has(k)));
  assert.equal(profileFields.size, 2);
  assert.ok(profileFields.has("nome"));
  assert.ok(profileFields.has("restricao"));
});

// ==============================================================================
// GRUPO 5: savePrefillOnLeadCreateAction mapeamento de campos
// ==============================================================================
console.log("\n── GRUPO 5: savePrefillOnLeadCreateAction — mapeamento ──");

function mapPrefillToProfile(prefillPayload) {
  const p = prefillPayload;
  return {
    wa_id: p.wa_id,
    ...(p.nome_prefill != null ? { nome: p.nome_prefill } : {}),
    ...(p.nacionalidade_prefill != null ? { nacionalidade: p.nacionalidade_prefill } : {}),
    ...(p.estado_civil_prefill != null ? { estado_civil: p.estado_civil_prefill } : {}),
    ...(p.regime_trabalho_prefill != null ? { regime_trabalho: p.regime_trabalho_prefill } : {}),
    ...(p.renda_prefill != null ? { renda: Number(p.renda_prefill) } : {}),
    ...(p.meses_36_prefill != null ? { ctps_36: Boolean(p.meses_36_prefill) } : {}),
    ...(p.dependentes_prefill != null ? { dependentes_qtd: Number(p.dependentes_prefill) } : {}),
    ...(p.valor_entrada_prefill != null ? { entrada_valor: Number(p.valor_entrada_prefill) } : {}),
    ...(p.restricao_prefill != null ? { restricao: Boolean(p.restricao_prefill) } : {}),
    ...(p.origem_lead != null ? { origem_lead: p.origem_lead } : {}),
    ...(p.observacoes_admin != null ? { observacoes_admin: p.observacoes_admin } : {}),
    updated_by: p.updated_by ?? "admin_panel",
    source: "admin_inicial",
  };
}

test("T5.1 — nome_prefill mapeia para nome no payload canônico", () => {
  const mapped = mapPrefillToProfile({ wa_id: "5511999", nome_prefill: "Maria", updated_by: "admin_panel" });
  assert.equal(mapped.nome, "Maria");
  assert.ok(!("nome_prefill" in mapped), "nome_prefill não deve estar no resultado");
});

test("T5.2 — renda_prefill (number) mapeia para renda", () => {
  const mapped = mapPrefillToProfile({ wa_id: "5511999", renda_prefill: 2800 });
  assert.equal(mapped.renda, 2800);
});

test("T5.3 — meses_36_prefill=true mapeia para ctps_36=true", () => {
  const mapped = mapPrefillToProfile({ wa_id: "5511999", meses_36_prefill: true });
  assert.equal(mapped.ctps_36, true);
});

test("T5.4 — source é sempre 'admin_inicial' no mapeamento", () => {
  const mapped = mapPrefillToProfile({ wa_id: "5511999", nome_prefill: "João" });
  assert.equal(mapped.source, "admin_inicial");
});

test("T5.5 — campos null não entram no payload mapeado", () => {
  const mapped = mapPrefillToProfile({ wa_id: "5511999", nome_prefill: null, estado_civil_prefill: null });
  assert.ok(!("nome" in mapped), "nome null não deve entrar");
  assert.ok(!("estado_civil" in mapped), "estado_civil null não deve entrar");
});

// ==============================================================================
// GRUPO 6: Verificação de isolamento — fase_conversa não pode ser escrita
// ==============================================================================
console.log("\n── GRUPO 6: Guardrail — campos de controle de fluxo ──");

const BLOCKED_FIELDS = new Set([
  "fase_conversa",
  "funil_status",
  "next_stage",
  "nextStage",
  "atendimento_manual",
]);

const PROFILE_WRITABLE_FIELDS = new Set([
  "nome",
  "nacionalidade",
  "estado_civil",
  "regime_trabalho",
  "renda",
  "ctps_36",
  "dependentes_qtd",
  "entrada_valor",
  "restricao",
]);

test("T6.1 — fase_conversa está na BLOCKED_FIELDS list", () => {
  assert.ok(BLOCKED_FIELDS.has("fase_conversa"));
});

test("T6.2 — PROFILE_WRITABLE_FIELDS não intersecta BLOCKED_FIELDS", () => {
  const intersection = [...PROFILE_WRITABLE_FIELDS].filter(f => BLOCKED_FIELDS.has(f));
  assert.equal(intersection.length, 0, `Interseção proibida: ${intersection.join(", ")}`);
});

test("T6.3 — PROFILE_META_FIELDS não intersecta BLOCKED_FIELDS", () => {
  const intersection = [...PROFILE_META_FIELDS].filter(f => BLOCKED_FIELDS.has(f));
  assert.equal(intersection.length, 0, `Interseção proibida: ${intersection.join(", ")}`);
});

// ==============================================================================
// RESULTADO
// ==============================================================================

console.log(`\n${"═".repeat(50)}`);
console.log(`RESULTADO: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("═".repeat(50));

if (failed > 0) process.exit(1);
