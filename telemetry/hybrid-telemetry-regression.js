/**
 * hybrid-telemetry-regression.js — PR 5 (Fase 11)
 *
 * Regressão baseada em evidência — comparação temporal de sintomas.
 *
 * Regras invioláveis:
 *   - Regressão NUNCA altera o fluxo do atendimento
 *   - Leitura pura de enova_log — zero escrita
 *   - Não altera parser, gate, nextStage, fallback, surface ou copy
 *   - Se falhar, retorna erro descritivo — funil segue normalmente
 */

import { queryStageSymptoms } from "./hybrid-telemetry-persistence.js";
import { SYMPTOM_KEYS, aggregateSymptoms } from "./hybrid-telemetry-ranking.js";

// ═══════════════════════════════════════════════════════════════════
// BASELINE SNAPSHOT
// ═══════════════════════════════════════════════════════════════════

/**
 * Capture a baseline snapshot of symptom frequencies for a time window.
 *
 * @param {Array} events - Parsed telemetry events
 * @returns {object} Snapshot with counts per symptom and per stage
 */
export function captureBaseline(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      total_events: 0,
      symptom_counts: {},
      stage_advance_count: 0,
      loop_count: 0,
      reask_count: 0,
      by_stage: {}
    };
  }

  const symptomCounts = {};
  let stageAdvanceCount = 0;
  let loopCount = 0;
  let reaskCount = 0;
  const byStage = {};

  for (const evt of events) {
    const symptoms = evt.stage_symptoms || {};
    const stage = evt.stage_before || evt.stage_after || "unknown";

    if (!byStage[stage]) byStage[stage] = { total: 0, symptoms: {} };
    byStage[stage].total++;

    for (const key of SYMPTOM_KEYS) {
      if (symptoms[key] === true) {
        symptomCounts[key] = (symptomCounts[key] || 0) + 1;
        byStage[stage].symptoms[key] = (byStage[stage].symptoms[key] || 0) + 1;
      }
    }

    if (symptoms.did_stage_advance === true) stageAdvanceCount++;
    if (symptoms.caused_loop === true) loopCount++;
    if (symptoms.did_reask === true) reaskCount++;
  }

  return {
    total_events: events.length,
    symptom_counts: symptomCounts,
    stage_advance_count: stageAdvanceCount,
    loop_count: loopCount,
    reask_count: reaskCount,
    by_stage: byStage
  };
}

// ═══════════════════════════════════════════════════════════════════
// TEMPORAL COMPARISON
// ═══════════════════════════════════════════════════════════════════

/**
 * Compare two baselines (before vs after) and compute deltas.
 *
 * @param {object} before - Baseline snapshot (before deploy)
 * @param {object} after - Baseline snapshot (after deploy)
 * @returns {object} Comparison with deltas and verdicts
 */
export function compareBaselines(before, after) {
  if (!before || !after) {
    return { ok: false, error: "missing_baseline" };
  }

  const deltas = {};
  const allSymptoms = new Set([
    ...Object.keys(before.symptom_counts || {}),
    ...Object.keys(after.symptom_counts || {})
  ]);

  for (const symptom of allSymptoms) {
    const bCount = (before.symptom_counts || {})[symptom] || 0;
    const aCount = (after.symptom_counts || {})[symptom] || 0;
    const diff = aCount - bCount;
    const pct = bCount > 0 ? ((diff / bCount) * 100) : (aCount > 0 ? 100 : 0);
    deltas[symptom] = {
      before: bCount,
      after: aCount,
      diff,
      pct: Math.round(pct * 100) / 100
    };
  }

  // Key metrics
  const loopDelta = computeDelta(before.loop_count, after.loop_count);
  const reaskDelta = computeDelta(before.reask_count, after.reask_count);
  const advanceDelta = computeDelta(before.stage_advance_count, after.stage_advance_count);

  // Overall verdict
  const verdict = computeVerdict(deltas, loopDelta, reaskDelta, advanceDelta);

  return {
    ok: true,
    before: {
      total_events: before.total_events || 0,
      symptom_counts: before.symptom_counts || {},
      loop_count: before.loop_count || 0,
      reask_count: before.reask_count || 0,
      stage_advance_count: before.stage_advance_count || 0
    },
    after: {
      total_events: after.total_events || 0,
      symptom_counts: after.symptom_counts || {},
      loop_count: after.loop_count || 0,
      reask_count: after.reask_count || 0,
      stage_advance_count: after.stage_advance_count || 0
    },
    deltas,
    key_metrics: {
      loops: loopDelta,
      reasks: reaskDelta,
      stage_advances: advanceDelta
    },
    verdict
  };
}

function computeDelta(before, after) {
  const bVal = before || 0;
  const aVal = after || 0;
  const diff = aVal - bVal;
  const pct = bVal > 0 ? ((diff / bVal) * 100) : (aVal > 0 ? 100 : 0);
  return {
    before: bVal,
    after: aVal,
    diff,
    pct: Math.round(pct * 100) / 100
  };
}

/**
 * Compute an overall verdict based on deltas.
 *
 * Logic:
 *   - If loops decreased AND (reasks decreased OR advances increased) → "melhorou"
 *   - If loops increased OR (reasks increased AND advances decreased) → "piorou"
 *   - Otherwise → "neutro"
 */
function computeVerdict(deltas, loopDelta, reaskDelta, advanceDelta) {
  const loopsDown = loopDelta.diff < 0;
  const loopsUp = loopDelta.diff > 0;
  const reasksDown = reaskDelta.diff < 0;
  const reasksUp = reaskDelta.diff > 0;
  const advancesUp = advanceDelta.diff > 0;
  const advancesDown = advanceDelta.diff < 0;

  // Count how many severe symptoms decreased
  const severeSymptoms = ["caused_loop", "did_stage_stick", "blocked_valid_signal", "override_suspected"];
  let severeDown = 0;
  let severeUp = 0;
  for (const s of severeSymptoms) {
    if (deltas[s]) {
      if (deltas[s].diff < 0) severeDown++;
      if (deltas[s].diff > 0) severeUp++;
    }
  }

  if (loopsDown && (reasksDown || advancesUp)) return "melhorou";
  if (severeDown >= 2 && severeUp === 0) return "melhorou";
  if (loopsUp) return "piorou";
  if (reasksUp && advancesDown) return "piorou";
  if (severeUp >= 2 && severeDown === 0) return "piorou";

  return "neutro";
}

// ═══════════════════════════════════════════════════════════════════
// ENDPOINT HANDLER — GET /__admin_prod__/hybrid-telemetry/regression
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle the regression endpoint request.
 *
 * Requires `before_since` + `before_until` and `after_since` + `after_until`
 * to define the two time windows for comparison.
 *
 * Alternative: `deploy_at` — auto-splits before/after around a deploy timestamp.
 *
 * @param {Function} sbFetchFn - sbFetch function
 * @param {object} env - Worker environment
 * @param {URLSearchParams} params - Query parameters
 * @returns {Promise<object>} Comparison response
 */
export async function handleRegressionEndpoint(sbFetchFn, env, params) {
  try {
    const stage = params.get("stage") || undefined;
    const leadId = params.get("lead_id") || params.get("wa_id") || undefined;
    const limit = Number(params.get("limit")) || 200;

    let beforeSince, beforeUntil, afterSince, afterUntil;

    const deployAt = params.get("deploy_at");
    if (deployAt) {
      // Auto-split: 24h before deploy_at, 24h after
      const deployTs = new Date(deployAt).getTime();
      if (!Number.isFinite(deployTs)) {
        return { ok: false, error: "invalid_deploy_at_timestamp" };
      }
      const windowMs = Number(params.get("window_hours") || 24) * 3600 * 1000;
      beforeSince = new Date(deployTs - windowMs).toISOString();
      beforeUntil = deployAt;
      afterSince = deployAt;
      afterUntil = new Date(deployTs + windowMs).toISOString();
    } else {
      beforeSince = params.get("before_since");
      beforeUntil = params.get("before_until");
      afterSince = params.get("after_since");
      afterUntil = params.get("after_until");
    }

    if (!beforeSince || !beforeUntil || !afterSince || !afterUntil) {
      return {
        ok: false,
        error: "missing_time_windows",
        details: "Provide deploy_at OR (before_since + before_until + after_since + after_until)"
      };
    }

    // Query before window
    const beforeResult = await queryStageSymptoms(sbFetchFn, env, {
      stage, lead_id: leadId, since: beforeSince, until: beforeUntil, limit
    });

    // Query after window
    const afterResult = await queryStageSymptoms(sbFetchFn, env, {
      stage, lead_id: leadId, since: afterSince, until: afterUntil, limit
    });

    if (!beforeResult.ok || !afterResult.ok) {
      return {
        ok: false,
        error: "query_failed",
        before_error: beforeResult.error || null,
        after_error: afterResult.error || null
      };
    }

    const beforeBaseline = captureBaseline(beforeResult.events);
    const afterBaseline = captureBaseline(afterResult.events);

    const comparison = compareBaselines(beforeBaseline, afterBaseline);

    return {
      ...comparison,
      windows: {
        before: { since: beforeSince, until: beforeUntil },
        after: { since: afterSince, until: afterUntil }
      },
      ...(stage && { stage }),
      ...(leadId && { lead_id: leadId })
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
