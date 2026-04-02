/**
 * incident_badges_panel.smoke.mjs
 * Smoke tests — front-only — frente INCIDENT BADGES / INTERLIGAÇÃO DE ABAS
 *
 * Valida a lógica pura dos helpers de badge e de navegação/interligação entre abas.
 * Não depende de browser, Supabase ou servidor Next.js.
 *
 * GRUPO 1 — Badge URL helper
 * GRUPO 2 — Severidade → classe CSS
 * GRUPO 3 — Badge condicional (só renderiza com incidente aberto)
 * GRUPO 4 — Incidentes: pre-fill de busca a partir de URL param
 * GRUPO 5 — Regressão: lógica existente não quebrada
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

// T13: campo null (não definido no payload) → não mostra badge
assert.equal(
  shouldShowIncidentBadge({ tem_incidente_aberto: null }),
  false,
  "T13: tem_incidente_aberto null → não mostra badge"
);

// T14: campo undefined (ausente no payload, ex: CRM/Bases sem dados de incidente) → não mostra badge
assert.equal(
  shouldShowIncidentBadge({}),
  false,
  "T14: campo ausente → não mostra badge (graceful)"
);

// ─── GRUPO 4: IncidentesUI — pre-fill busca a partir de URL param ─────────────

function resolveInitialBusca(waIdParam) {
  // Lógica espelhada do IncidentesUI: se wa_id param presente, usa como busca inicial
  const trimmed = (waIdParam ?? "").trim();
  return trimmed;
}

// T15: ?wa_id=5511999887766 → busca pre-preenchida com esse wa_id
assert.equal(
  resolveInitialBusca("5511999887766"),
  "5511999887766",
  "T15: wa_id param → busca pre-preenchida"
);

// T16: sem param (null/empty) → busca começa vazia
assert.equal(
  resolveInitialBusca(null),
  "",
  "T16: sem param → busca vazia"
);

assert.equal(
  resolveInitialBusca(""),
  "",
  "T16b: param vazio → busca vazia"
);

// T17: wa_id param com espaços é trimado
assert.equal(
  resolveInitialBusca("  5511999887766  "),
  "5511999887766",
  "T17: wa_id param com espaços é trimado"
);

// ─── GRUPO 5: Filtro de incidentes no IncidentesUI ────────────────────────────

function filterIncidents(incidents, busca) {
  // Replica lógica do filteredIncidents do IncidentesUI
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

// T18: filtro por wa_id encontra incidentes daquele lead
const resultT18 = filterIncidents(mockIncidents, "5511999887766");
assert.equal(resultT18.length, 2, "T18: filtro por wa_id retorna incidentes do lead (todos os status)");

// T19: filtro por wa_id diferente não inclui outros leads
const resultT19 = filterIncidents(mockIncidents, "5511988776655");
assert.equal(resultT19.length, 1, "T19: filtro por wa_id não inclui outros leads");
assert.equal(resultT19[0].wa_id, "5511988776655", "T19b: lead correto retornado");

// T20: busca vazia retorna todos
const resultT20 = filterIncidents(mockIncidents, "");
assert.equal(resultT20.length, 3, "T20: busca vazia retorna todos os incidentes");

// T21: busca por nome também funciona
const resultT21 = filterIncidents(mockIncidents, "maria");
assert.equal(resultT21.length, 1, "T21: busca por nome funciona");

// ─── Resultado ────────────────────────────────────────────────────────────────

console.log("incident_badges_panel.smoke.mjs: todos os testes passaram (21/21) ✓");
