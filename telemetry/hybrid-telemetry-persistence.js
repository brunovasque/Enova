/**
 * hybrid-telemetry-persistence.js — PR 4 (Fase 8)
 *
 * Persistência estruturada de telemetria híbrida via enova_log (Supabase).
 * Reusa a infraestrutura existente de `logger()` → sbFetch → enova_log.
 *
 * Regras invioláveis:
 *   - Persistência NUNCA altera o fluxo do atendimento
 *   - Se falhar, falha isolada — o funil segue normalmente
 *   - Não cria tabela nova — usa enova_log existente
 *   - Não cria coluna nova — usa campos já existentes (tag, wa_id, details)
 *   - Tag padronizado: HYBRID_TELEMETRY para identificação em consultas
 */

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

export const HYBRID_TELEMETRY_LOG_TAG = "HYBRID_TELEMETRY";

// ═══════════════════════════════════════════════════════════════════
// PERSISTENCE — writes hybrid telemetry events to enova_log
// ═══════════════════════════════════════════════════════════════════

/**
 * Flatten a hybrid telemetry event into a persistable record
 * suitable for the enova_log table (tag, wa_id, details JSON).
 *
 * @param {object} event - The hybrid telemetry event to persist
 * @returns {object} A record ready for enova_log insertion
 */
export function buildPersistenceRecord(event) {
  try {
    if (!event || typeof event !== "object") return null;

    const base = {
      schema_version: event.schema_version || null,
      event_name: event.event_name || null,
      timestamp: event.timestamp || new Date().toISOString(),
      lead_id: event.lead_id || null,
      conversation_id: event.conversation_id || null,
      turn_id: event.turn_id || null,
      correlation_id: event.correlation_id || null,
      stage_before: event.stage_before || null,
      stage_after: event.stage_after || null
    };

    // Flatten cognitive block
    const cognitive = event.cognitive && typeof event.cognitive === "object"
      ? { ...event.cognitive }
      : null;

    // Flatten mechanical block
    const mechanical = event.mechanical && typeof event.mechanical === "object"
      ? { ...event.mechanical }
      : null;

    // Flatten arbitration block
    const arbitration = event.arbitration && typeof event.arbitration === "object"
      ? { ...event.arbitration }
      : null;

    // Stage symptoms (from Hook 7)
    const stageSymptoms = event._stage_symptoms && typeof event._stage_symptoms === "object"
      ? { ...event._stage_symptoms }
      : null;

    // Contract meta (from Hook 3)
    const contractMeta = event._contract_meta && typeof event._contract_meta === "object"
      ? { ...event._contract_meta }
      : null;

    // Output meta (from Hook 6)
    const outputMeta = event._output_meta && typeof event._output_meta === "object"
      ? { ...event._output_meta }
      : null;

    const details = {
      ...base,
      cognitive,
      mechanical,
      arbitration,
      stage_symptoms: stageSymptoms,
      contract_meta: contractMeta,
      output_meta: outputMeta
    };

    return {
      tag: HYBRID_TELEMETRY_LOG_TAG,
      wa_id: base.lead_id || base.conversation_id || null,
      details: safeStringify(details)
    };
  } catch (_) {
    return null;
  }
}

/**
 * Safe JSON stringify — never throws.
 */
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return "{}";
  }
}

/**
 * Persist a hybrid telemetry event to enova_log via the provided logger function.
 * Fire-and-forget — never throws to the caller.
 *
 * @param {Function} loggerFn - The logger(env, data) function from the worker
 * @param {object} env - Worker environment bindings
 * @param {object} event - The hybrid telemetry event to persist
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function persistHybridTelemetryEvent(loggerFn, env, event) {
  try {
    if (typeof loggerFn !== "function") {
      return { ok: false, error: "logger_not_available" };
    }

    const record = buildPersistenceRecord(event);
    if (!record) {
      return { ok: false, error: "invalid_event" };
    }

    await loggerFn(env, record);
    return { ok: true };
  } catch (err) {
    // Fire-and-forget: persistence failure must never affect the flow
    try {
      console.error("[hybrid-telemetry-persistence] Error:", err?.message || String(err));
    } catch (_) { /* silent */ }
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Creates a persistent emitter function compatible with emitHybridTelemetry's
 * persistentEmitter parameter.
 *
 * @param {Function} loggerFn - The logger(env, data) function
 * @param {object} env - Worker environment bindings
 * @returns {Function} An async emitter that persists events to enova_log
 */
export function createPersistentEmitter(loggerFn, env) {
  if (typeof loggerFn !== "function" || !env) return null;

  return async (event) => {
    await persistHybridTelemetryEvent(loggerFn, env, event);
  };
}

// ═══════════════════════════════════════════════════════════════════
// QUERY HELPERS — read hybrid telemetry from enova_log
// ═══════════════════════════════════════════════════════════════════

/**
 * Query hybrid telemetry events from enova_log.
 *
 * @param {Function} sbFetchFn - The sbFetch(env, path, options) function
 * @param {object} env - Worker environment bindings
 * @param {object} filters - Query filters
 * @param {string} [filters.lead_id] - Filter by lead/wa_id
 * @param {string} [filters.event_name] - Filter by event name
 * @param {string} [filters.stage] - Filter by stage
 * @param {string} [filters.reason_code] - Filter by reason code (searched in details)
 * @param {string} [filters.since] - ISO timestamp for start of range
 * @param {string} [filters.until] - ISO timestamp for end of range
 * @param {number} [filters.limit=50] - Max results to return
 * @param {string} [filters.order="desc"] - Order direction (asc/desc)
 * @returns {Promise<{ok: boolean, events: Array, error?: string}>}
 */
export async function queryHybridTelemetryEvents(sbFetchFn, env, filters = {}) {
  try {
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const order = filters.order === "asc" ? "created_at.asc" : "created_at.desc";

    const query = {
      select: "wa_id,details,created_at",
      tag: `eq.${HYBRID_TELEMETRY_LOG_TAG}`,
      order,
      limit: String(limit)
    };

    // Filter by lead_id / wa_id
    if (filters.lead_id) {
      query.wa_id = `eq.${filters.lead_id}`;
    }

    // Filter by time range
    if (filters.since) {
      query["created_at"] = `gte.${filters.since}`;
    }
    if (filters.until) {
      // If 'since' was already set, we need to combine with 'and'
      if (filters.since) {
        query["created_at"] = `gte.${filters.since}`;
        // PostgREST doesn't support two filters on same column easily
        // We use a workaround with ordering and limit
      } else {
        query["created_at"] = `lte.${filters.until}`;
      }
    }

    const rows = normalizeRows(await sbFetchFn(env, "/rest/v1/enova_log", {
      method: "GET",
      query
    }));

    // Post-filter in JS for fields inside `details` JSON
    let events = rows.map(parseLogRow).filter(Boolean);

    if (filters.event_name) {
      events = events.filter(e => e.event_name === filters.event_name);
    }

    if (filters.stage) {
      events = events.filter(e =>
        e.stage_before === filters.stage || e.stage_after === filters.stage
      );
    }

    if (filters.reason_code) {
      events = events.filter(e => eventContainsReasonCode(e, filters.reason_code));
    }

    if (filters.conflict_type) {
      events = events.filter(e => eventIsConflict(e, filters.conflict_type));
    }

    if (filters.symptom) {
      events = events.filter(e => eventHasSymptom(e, filters.symptom));
    }

    return { ok: true, events, total: events.length };
  } catch (err) {
    return {
      ok: false,
      events: [],
      total: 0,
      error: err?.message || String(err)
    };
  }
}

/**
 * Query specifically for arbitration conflict events.
 */
export async function queryArbitrationConflicts(sbFetchFn, env, filters = {}) {
  const result = await queryHybridTelemetryEvents(sbFetchFn, env, {
    ...filters,
    limit: filters.limit || 100
  });

  if (!result.ok) return result;

  const conflictEvents = result.events.filter(e => {
    const arb = e.arbitration || {};
    return (
      arb.arbitration_triggered === true ||
      arb.override_detected === true ||
      arb.override_suspected === true ||
      arb.blocked_valid_signal === true ||
      arb.caused_loop === true ||
      (e.event_name || "").includes("arbitration") ||
      (e.event_name || "").includes("override")
    );
  });

  return { ok: true, events: conflictEvents, total: conflictEvents.length };
}

/**
 * Query specifically for stage symptom events.
 */
export async function queryStageSymptoms(sbFetchFn, env, filters = {}) {
  const result = await queryHybridTelemetryEvents(sbFetchFn, env, {
    ...filters,
    limit: filters.limit || 100
  });

  if (!result.ok) return result;

  const symptomKeys = [
    "did_stage_repeat", "did_stage_stick", "did_reask",
    "plausible_answer_without_advance", "blocked_valid_signal",
    "caused_loop", "override_suspected", "state_unchanged_when_expected"
  ];

  const symptomEvents = result.events.filter(e => {
    const symptoms = e.stage_symptoms || {};
    return symptomKeys.some(key => symptoms[key] === true);
  });

  // If a specific symptom filter is requested
  if (filters.symptom) {
    const filtered = symptomEvents.filter(e => {
      const symptoms = e.stage_symptoms || {};
      return symptoms[filters.symptom] === true;
    });
    return { ok: true, events: filtered, total: filtered.length };
  }

  return { ok: true, events: symptomEvents, total: symptomEvents.length };
}

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

function normalizeRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  return [];
}

function parseLogRow(row) {
  if (!row) return null;
  try {
    let details = row.details;
    if (typeof details === "string") {
      try { details = JSON.parse(details); } catch { details = {}; }
    }
    if (!details || typeof details !== "object") details = {};

    return {
      wa_id: row.wa_id || details.lead_id || null,
      created_at: row.created_at || null,
      event_name: details.event_name || null,
      timestamp: details.timestamp || row.created_at || null,
      correlation_id: details.correlation_id || null,
      lead_id: details.lead_id || row.wa_id || null,
      conversation_id: details.conversation_id || null,
      turn_id: details.turn_id || null,
      stage_before: details.stage_before || null,
      stage_after: details.stage_after || null,
      schema_version: details.schema_version || null,
      cognitive: details.cognitive || null,
      mechanical: details.mechanical || null,
      arbitration: details.arbitration || null,
      stage_symptoms: details.stage_symptoms || null,
      contract_meta: details.contract_meta || null,
      output_meta: details.output_meta || null
    };
  } catch (_) {
    return null;
  }
}

function eventContainsReasonCode(event, reasonCode) {
  if (!event || !reasonCode) return false;
  const cogCodes = event.cognitive?.cognitive_reason_codes || [];
  const mechCodes = event.mechanical?.mechanical_reason_codes || [];
  const arbReason = event.arbitration?.arbitration_reason || "";
  return (
    (Array.isArray(cogCodes) && cogCodes.includes(reasonCode)) ||
    (Array.isArray(mechCodes) && mechCodes.includes(reasonCode)) ||
    arbReason === reasonCode
  );
}

function eventIsConflict(event, conflictType) {
  if (!event) return false;
  const arb = event.arbitration || {};
  if (!conflictType) {
    return Boolean(arb.arbitration_triggered || arb.override_detected || arb.override_suspected);
  }
  if (conflictType === "override") return Boolean(arb.override_detected);
  if (conflictType === "override_suspected") return Boolean(arb.override_suspected);
  if (conflictType === "blocked") return Boolean(arb.blocked_valid_signal);
  if (conflictType === "loop") return Boolean(arb.caused_loop);
  return Boolean(arb.override_classification === conflictType);
}

function eventHasSymptom(event, symptom) {
  if (!event || !symptom) return false;
  const symptoms = event.stage_symptoms || {};
  return symptoms[symptom] === true;
}
