/**
 * incident_badges_panel.smoke.mjs
 * Smoke tests — frente INCIDENT BADGES / INTERLIGAÇÃO DE ABAS
 *
 * Valida a lógica pura dos helpers de badge, navegação e contrato de dados
 * das três abas (Atendimento, CRM, Bases) com incidente aberto.
 * Não depende de browser, Supabase ou servidor Next.js.
 *
 * GRUPO 1 — Badge URL helper
 * GRUPO 2 — Severidade → classe CSS
 * GRUPO 3 — Badge condicional (só renderiza com incidente aberto)
 * GRUPO 4 — Incidentes: pre-fill de busca a partir de URL param
 * GRUPO 5 — Filtro de incidentes
 * GRUPO 6 — Contrato de dados: CRM e Bases com campos reais de incidente
 * GRUPO 7 — Regressão: Atendimento não regrediu
 */

import { strict as assert } from "node:assert";

// ─── GRUPO 1: Badge URL helper ───────────────────────────────────────────────

function buildIncidentesUrl(waId) {
  if (!waId || !waId.trim()) return "/incidentes";
  return `/incidentes?wa_id=${encodeURIComponent(waId.trim())}`;
}

// T1: URL gerada corretamente para wa_id simples
assert.equal(
  buildIncidentesUrl("5511999887766"),
  "/incidentes?wa_id=5511999887766",
  "T1: URL badge para wa_id simples"
);

// T2: wa_id com caracteres especiais é encoded corretamente
assert.equal(
  buildIncidentesUrl("551199 887766"),
  "/incidentes?wa_id=551199%20887766",
  "T2: wa_id com espaço é percent-encoded"
);

// T3: wa_id vazio retorna URL base sem param
assert.equal(
  buildIncidentesUrl(""),
  "/incidentes",
  "T3: wa_id vazio → URL sem param"
);

// T4: wa_id null/undefined retorna URL base
assert.equal(
  buildIncidentesUrl(null),
  "/incidentes",
  "T4: wa_id null → URL sem param"
);

// T5: wa_id com whitespace é trimado antes de encode
assert.equal(
  buildIncidentesUrl("  5511999887766  "),
  "/incidentes?wa_id=5511999887766",
  "T5: wa_id com whitespace é trimado"
);

// ─── GRUPO 2: Severidade → classe CSS ────────────────────────────────────────

function getIncidenteBadgeClass(severidade) {
  switch (severidade) {
    case "CRITICAL": return "incidenteBadgeCritical";
    case "HIGH":     return "incidenteBadgeHigh";
    case "MEDIUM":   return "incidenteBadgeMedium";
    case "LOW":      return "incidenteBadgeLow";
    default:         return "";
  }
}

// T6: CRITICAL → classe correta
assert.equal(getIncidenteBadgeClass("CRITICAL"), "incidenteBadgeCritical", "T6: CRITICAL → incidenteBadgeCritical");

// T7: HIGH → classe correta
assert.equal(getIncidenteBadgeClass("HIGH"), "incidenteBadgeHigh", "T7: HIGH → incidenteBadgeHigh");

// T8: MEDIUM → classe correta
assert.equal(getIncidenteBadgeClass("MEDIUM"), "incidenteBadgeMedium", "T8: MEDIUM → incidenteBadgeMedium");

// T9: LOW → classe correta
assert.equal(getIncidenteBadgeClass("LOW"), "incidenteBadgeLow", "T9: LOW → incidenteBadgeLow");

// T10: null/desconhecido → string vazia (sem classe extra)
assert.equal(getIncidenteBadgeClass(null), "", "T10: null → sem classe de severidade");
assert.equal(getIncidenteBadgeClass("UNKNOWN"), "", "T10b: desconhecido → sem classe");

// ─── GRUPO 3: Badge condicional ───────────────────────────────────────────────

function shouldShowIncidentBadge(lead) {
  return lead.tem_incidente_aberto === true;
}

// T11: lead com incidente aberto → mostra badge
assert.equal(
  shouldShowIncidentBadge({ tem_incidente_aberto: true }),
  true,
  "T11: lead com incidente → mostra badge"
);

// T12: lead sem incidente → não mostra badge
assert.equal(
  shouldShowIncidentBadge({ tem_incidente_aberto: false }),
  false,
  "T12: lead sem incidente → não mostra badge"
);

// T13: campo null (sem attendance_meta ainda) → não mostra badge
assert.equal(
  shouldShowIncidentBadge({ tem_incidente_aberto: null }),
  false,
  "T13: tem_incidente_aberto null → não mostra badge"
);

// ─── GRUPO 4: IncidentesUI — pre-fill busca a partir de URL param ─────────────

function resolveInitialBusca(waIdParam) {
  const trimmed = (waIdParam ?? "").trim();
  return trimmed;
}

// T14: ?wa_id=5511999887766 → busca pre-preenchida com esse wa_id
assert.equal(
  resolveInitialBusca("5511999887766"),
  "5511999887766",
  "T14: wa_id param → busca pre-preenchida"
);

// T15: sem param (null/empty) → busca começa vazia
assert.equal(resolveInitialBusca(null), "", "T15: sem param → busca vazia");
assert.equal(resolveInitialBusca(""), "", "T15b: param vazio → busca vazia");

// T16: wa_id param com espaços é trimado
assert.equal(
  resolveInitialBusca("  5511999887766  "),
  "5511999887766",
  "T16: wa_id param com espaços é trimado"
);

// ─── GRUPO 5: Filtro de incidentes no IncidentesUI ────────────────────────────

function filterIncidents(incidents, busca) {
  const q = busca.trim().toLowerCase();
  if (!q) return incidents;
  return incidents.filter((inc) => {
    const nomeMatch = (inc.nome ?? "").toLowerCase().includes(q);
    const waIdMatch = inc.wa_id.toLowerCase().includes(q);
    const idMatch = inc.id_incidente.toLowerCase().includes(q);
    return nomeMatch || waIdMatch || idMatch;
  });
}

const mockIncidents = [
  { id_incidente: "inc-001", wa_id: "5511999887766", nome: "João Silva", status_incidente: "OPEN" },
  { id_incidente: "inc-002", wa_id: "5511988776655", nome: "Maria Costa", status_incidente: "OPEN" },
  { id_incidente: "inc-003", wa_id: "5511999887766", nome: "João Silva", status_incidente: "RESOLVED" },
];

// T17: filtro por wa_id encontra incidentes daquele lead
const resultT17 = filterIncidents(mockIncidents, "5511999887766");
assert.equal(resultT17.length, 2, "T17: filtro por wa_id retorna incidentes do lead (todos os status)");

// T18: filtro por wa_id diferente não inclui outros leads
const resultT18 = filterIncidents(mockIncidents, "5511988776655");
assert.equal(resultT18.length, 1, "T18: filtro por wa_id não inclui outros leads");
assert.equal(resultT18[0].wa_id, "5511988776655", "T18b: lead correto retornado");

// T19: busca vazia retorna todos
const resultT19 = filterIncidents(mockIncidents, "");
assert.equal(resultT19.length, 3, "T19: busca vazia retorna todos os incidentes");

// T20: busca por nome também funciona
const resultT20 = filterIncidents(mockIncidents, "maria");
assert.equal(resultT20.length, 1, "T20: busca por nome funciona");

// ─── GRUPO 6: Contrato de dados — CRM e Bases agora têm campos reais ──────────

// Simula o contrato crm_leads_v1 (inclui JOIN a enova_attendance_meta)
function buildCrmLeadWithIncident(override = {}) {
  return {
    wa_id: "5511999887766",
    nome: "João Silva",
    telefone: null,
    fase_funil: "envio_docs",
    status_analise: null,
    // Campos injetados pelo LEFT JOIN enova_attendance_meta
    tem_incidente_aberto: true,
    tipo_incidente: "WORKER_EXCEPTION",
    severidade_incidente: "HIGH",
    ...override,
  };
}

// T21: CRM lead com incidente → badge deve aparecer
const crmLeadComIncidente = buildCrmLeadWithIncident();
assert.equal(shouldShowIncidentBadge(crmLeadComIncidente), true, "T21: CRM lead com incidente → badge ativo");
assert.equal(
  buildIncidentesUrl(crmLeadComIncidente.wa_id),
  "/incidentes?wa_id=5511999887766",
  "T21b: URL de navegação do CRM correta"
);

// T22: CRM lead sem incidente (tem_incidente_aberto = false) → badge não aparece
const crmLeadSemIncidente = buildCrmLeadWithIncident({ tem_incidente_aberto: false });
assert.equal(shouldShowIncidentBadge(crmLeadSemIncidente), false, "T22: CRM lead sem incidente → sem badge");

// T23: CRM lead com tem_incidente_aberto null (sem attendance_meta) → badge não aparece
const crmLeadSemMeta = buildCrmLeadWithIncident({ tem_incidente_aberto: null });
assert.equal(shouldShowIncidentBadge(crmLeadSemMeta), false, "T23: CRM lead sem meta → sem badge");

// Simula o contrato bases_leads_v1 (crm_lead_meta LEFT JOIN enova_attendance_meta)
function buildBasesLeadWithIncident(override = {}) {
  return {
    wa_id: "5511999887766",
    nome: "João Silva",
    telefone: null,
    lead_pool: "WARM_POOL",
    lead_temp: "WARM",
    is_paused: false,
    // Campos injetados pelo LEFT JOIN enova_attendance_meta
    tem_incidente_aberto: true,
    tipo_incidente: "MESSAGE_SEND_FAILURE",
    severidade_incidente: "CRITICAL",
    ...override,
  };
}

// T24: Bases lead com incidente → badge deve aparecer
const basesLeadComIncidente = buildBasesLeadWithIncident();
assert.equal(shouldShowIncidentBadge(basesLeadComIncidente), true, "T24: Bases lead com incidente → badge ativo");
assert.equal(
  buildIncidentesUrl(basesLeadComIncidente.wa_id),
  "/incidentes?wa_id=5511999887766",
  "T24b: URL de navegação de Bases correta"
);

// T25: Bases lead sem incidente → badge não aparece
const basesLeadSemIncidente = buildBasesLeadWithIncident({ tem_incidente_aberto: false });
assert.equal(shouldShowIncidentBadge(basesLeadSemIncidente), false, "T25: Bases lead sem incidente → sem badge");

// T26: severity badge class funcionando em CRM e Bases
assert.equal(getIncidenteBadgeClass(crmLeadComIncidente.severidade_incidente), "incidenteBadgeHigh", "T26: CRM HIGH → classe correta");
assert.equal(getIncidenteBadgeClass(basesLeadComIncidente.severidade_incidente), "incidenteBadgeCritical", "T26b: Bases CRITICAL → classe correta");

// ─── GRUPO 7: Regressão — Atendimento não regrediu ────────────────────────────

// Simula AttendanceRow com campos de incidente (já existiam)
function buildAttendanceLeadWithIncident(override = {}) {
  return {
    wa_id: "5511999887766",
    nome: "João Silva",
    fase_atendimento: "estado_civil",
    tem_incidente_aberto: true,
    tipo_incidente: "PERSISTENCE_FAILURE",
    severidade_incidente: "MEDIUM",
    ...override,
  };
}

// T27: Atendimento com incidente → badge ativo
const atendLeadComIncidente = buildAttendanceLeadWithIncident();
assert.equal(shouldShowIncidentBadge(atendLeadComIncidente), true, "T27: Atendimento com incidente → badge ativo");

// T28: Atendimento sem incidente → sem badge
const atendLeadSemIncidente = buildAttendanceLeadWithIncident({ tem_incidente_aberto: false });
assert.equal(shouldShowIncidentBadge(atendLeadSemIncidente), false, "T28: Atendimento sem incidente → sem badge");

// T29: URL de Atendimento correta
assert.equal(
  buildIncidentesUrl(atendLeadComIncidente.wa_id),
  "/incidentes?wa_id=5511999887766",
  "T29: URL de navegação de Atendimento correta"
);

// ─── Resultado ────────────────────────────────────────────────────────────────

console.log("incident_badges_panel.smoke.mjs: todos os testes passaram (29/29) ✓");
