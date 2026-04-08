/**
 * hybrid-telemetry-ranking.js — PR 5 (Fase 10)
 *
 * Ranking automático dos principais problemas do funil com base na telemetria.
 *
 * Regras invioláveis:
 *   - Ranking NUNCA altera o fluxo do atendimento
 *   - Leitura pura de enova_log — zero escrita
 *   - Não altera parser, gate, nextStage, fallback, surface ou copy
 *   - Se falhar, retorna erro descritivo — funil segue normalmente
 */

import {
  queryHybridTelemetryEvents,
  queryStageSymptoms
} from "./hybrid-telemetry-persistence.js";

// ═══════════════════════════════════════════════════════════════════
// SEVERITY WEIGHTS — higher = more severe
// ═══════════════════════════════════════════════════════════════════

export const SYMPTOM_SEVERITY = Object.freeze({
  caused_loop: 5,
  did_stage_stick: 4,
  blocked_valid_signal: 3,
  override_suspected: 3,
  did_reask: 2,
  plausible_answer_without_advance: 2,
  did_stage_repeat: 1,
  state_unchanged_when_expected: 1
});

export const SYMPTOM_KEYS = Object.keys(SYMPTOM_SEVERITY);

// ═══════════════════════════════════════════════════════════════════
// AGGREGATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Aggregate symptom events into a ranked problem list.
 *
 * @param {Array} events - Parsed telemetry events (from queryStageSymptoms or similar)
 * @returns {object} Aggregated ranking data
 */
export function aggregateSymptoms(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { by_stage: {}, by_symptom: {}, by_combination: {}, by_lead: {}, ranked: [] };
  }

  const byStage = {};    // stage → { symptom → count }
  const bySymptom = {};  // symptom → count
  const byCombination = {}; // "symptom1+symptom2" → count
  const byLead = {};     // lead_id → count of symptom events

  for (const evt of events) {
    const symptoms = evt.stage_symptoms || {};
    const stage = evt.stage_before || evt.stage_after || "unknown";
    const lead = evt.lead_id || evt.wa_id || "unknown";

    // Collect active symptoms for this event
    const activeSymptoms = [];
    for (const key of SYMPTOM_KEYS) {
      if (symptoms[key] === true) {
        activeSymptoms.push(key);

        // By symptom
        bySymptom[key] = (bySymptom[key] || 0) + 1;

        // By stage
        if (!byStage[stage]) byStage[stage] = {};
        byStage[stage][key] = (byStage[stage][key] || 0) + 1;
      }
    }

    // By combination (sorted for consistency)
    if (activeSymptoms.length > 1) {
      const comboKey = activeSymptoms.sort().join("+");
      byCombination[comboKey] = (byCombination[comboKey] || 0) + 1;
    }

    // By lead (count symptom events per lead)
    if (activeSymptoms.length > 0) {
      byLead[lead] = (byLead[lead] || 0) + 1;
    }
  }

  return {
    by_stage: byStage,
    by_symptom: bySymptom,
    by_combination: byCombination,
    by_lead: byLead,
    ranked: buildRanking(byStage, bySymptom)
  };
}

/**
 * Build a ranked list of problems ordered by severity score.
 *
 * Score = frequency × severity_weight
 */
export function buildRanking(byStage, bySymptom) {
  const problems = [];

  for (const [stage, symptoms] of Object.entries(byStage || {})) {
    for (const [symptom, count] of Object.entries(symptoms || {})) {
      const weight = SYMPTOM_SEVERITY[symptom] || 1;
      const score = count * weight;
      problems.push({ stage, symptom, count, weight, score });
    }
  }

  // Sort descending by score, then by count as tiebreaker
  problems.sort((a, b) => b.score - a.score || b.count - a.count);

  return problems;
}

/**
 * Compute top N problems from the ranking.
 */
export function topProblems(ranked, limit = 20) {
  if (!Array.isArray(ranked)) return [];
  return ranked.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════
// ENDPOINT HANDLER — GET /__admin_prod__/hybrid-telemetry/ranking
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle the ranking endpoint request.
 *
 * @param {Function} sbFetchFn - sbFetch function
 * @param {object} env - Worker environment
 * @param {URLSearchParams} params - Query parameters
 * @returns {Promise<object>} Response data
 */
export async function handleRankingEndpoint(sbFetchFn, env, params) {
  try {
    const filters = {
      lead_id: params.get("lead_id") || params.get("wa_id") || undefined,
      stage: params.get("stage") || undefined,
      since: params.get("since") || undefined,
      until: params.get("until") || undefined,
      limit: Number(params.get("limit")) || 200,
      order: params.get("order") || "desc"
    };

    const result = await queryStageSymptoms(sbFetchFn, env, filters);
    if (!result.ok) {
      return { ok: false, error: result.error || "query_failed" };
    }

    const aggregation = aggregateSymptoms(result.events);
    const limit = Number(params.get("top")) || 20;

    return {
      ok: true,
      total_events_analyzed: result.total,
      top_problems: topProblems(aggregation.ranked, limit),
      by_stage: aggregation.by_stage,
      by_symptom: aggregation.by_symptom,
      by_combination: aggregation.by_combination,
      leads_affected: Object.keys(aggregation.by_lead).length,
      severity_weights: SYMPTOM_SEVERITY
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
