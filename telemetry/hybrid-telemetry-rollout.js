/**
 * hybrid-telemetry-rollout.js — PR 5 (Fase 12)
 *
 * Rollout controlado — feature flags por stage/type/feature com modos OFF/SHADOW/ON.
 *
 * Regras invioláveis:
 *   - Rollout flags NUNCA alteram o fluxo existente quando OFF
 *   - SHADOW mode observa sem afetar o resultado do atendimento
 *   - Não altera parser, gate, nextStage, fallback, surface ou copy
 *   - Configuração em memória — sem tabela nova, sem coluna nova
 *   - Se falhar, comportamento = OFF (conservative fallback)
 */

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

export const ROLLOUT_MODES = Object.freeze({
  OFF: "OFF",
  SHADOW: "SHADOW",
  ON: "ON"
});

export const VALID_MODES = new Set(Object.values(ROLLOUT_MODES));

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY ROLLOUT STATE
// ═══════════════════════════════════════════════════════════════════

/**
 * Structure:
 * _rolloutFlags = {
 *   "stage:inicio_nome": "OFF",
 *   "type:cognitive_override": "SHADOW",
 *   "feature:new_parser_logic": "ON"
 * }
 *
 * Key format: "<dimension>:<identifier>"
 *   - dimension: "stage" | "type" | "feature"
 *   - identifier: specific stage name, type name, or feature name
 */
let _rolloutFlags = {};

// ═══════════════════════════════════════════════════════════════════
// FLAG MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a canonical flag key.
 */
export function buildFlagKey(dimension, identifier) {
  if (!dimension || !identifier) return null;
  return `${String(dimension).toLowerCase()}:${String(identifier).toLowerCase()}`;
}

/**
 * Set a rollout flag.
 *
 * @param {string} dimension - "stage" | "type" | "feature"
 * @param {string} identifier - Specific name (e.g. "inicio_nome", "cognitive_override")
 * @param {string} mode - "OFF" | "SHADOW" | "ON"
 * @returns {object} Result of the operation
 */
export function setRolloutFlag(dimension, identifier, mode) {
  const key = buildFlagKey(dimension, identifier);
  if (!key) {
    return { ok: false, error: "invalid_key", detail: "dimension and identifier are required" };
  }

  const normalizedMode = String(mode || "").toUpperCase();
  if (!VALID_MODES.has(normalizedMode)) {
    return { ok: false, error: "invalid_mode", detail: `Mode must be one of: ${[...VALID_MODES].join(", ")}` };
  }

  const previous = _rolloutFlags[key] || ROLLOUT_MODES.OFF;
  _rolloutFlags[key] = normalizedMode;

  return { ok: true, key, previous, current: normalizedMode };
}

/**
 * Get the current mode for a flag.
 * Defaults to OFF if not explicitly set.
 */
export function getRolloutFlag(dimension, identifier) {
  const key = buildFlagKey(dimension, identifier);
  if (!key) return ROLLOUT_MODES.OFF;
  return _rolloutFlags[key] || ROLLOUT_MODES.OFF;
}

/**
 * Check if a flag is active (ON mode).
 */
export function isRolloutActive(dimension, identifier) {
  return getRolloutFlag(dimension, identifier) === ROLLOUT_MODES.ON;
}

/**
 * Check if a flag is in shadow mode.
 */
export function isRolloutShadow(dimension, identifier) {
  return getRolloutFlag(dimension, identifier) === ROLLOUT_MODES.SHADOW;
}

/**
 * Check if a flag should execute the new behavior (ON or SHADOW for observation).
 * SHADOW: execute new logic but DON'T use its result (observe only).
 * ON: execute new logic and USE its result.
 * OFF: don't execute new logic at all.
 */
export function shouldExecuteNewLogic(dimension, identifier) {
  const mode = getRolloutFlag(dimension, identifier);
  return mode === ROLLOUT_MODES.ON || mode === ROLLOUT_MODES.SHADOW;
}

/**
 * Check if the result of new logic should be applied (only ON, not SHADOW).
 */
export function shouldApplyNewLogic(dimension, identifier) {
  return getRolloutFlag(dimension, identifier) === ROLLOUT_MODES.ON;
}

/**
 * Get all current rollout flags.
 */
export function getAllRolloutFlags() {
  return { ..._rolloutFlags };
}

/**
 * Reset all rollout flags to empty.
 */
export function resetAllRolloutFlags() {
  const previous = { ..._rolloutFlags };
  _rolloutFlags = {};
  return { ok: true, previous, current: {} };
}

/**
 * Bulk set rollout flags.
 *
 * @param {Array<{dimension, identifier, mode}>} flags
 * @returns {object} Results for each flag
 */
export function bulkSetRolloutFlags(flags) {
  if (!Array.isArray(flags)) {
    return { ok: false, error: "flags_must_be_array" };
  }

  const results = [];
  for (const f of flags) {
    results.push(setRolloutFlag(f.dimension, f.identifier, f.mode));
  }

  return { ok: true, results, current_flags: getAllRolloutFlags() };
}

// ═══════════════════════════════════════════════════════════════════
// ENDPOINT HANDLER — POST /__admin_prod__/hybrid-telemetry/rollout
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle the rollout endpoint request.
 *
 * POST body:
 *   Single flag: { dimension, identifier, mode }
 *   Bulk: { flags: [{ dimension, identifier, mode }, ...] }
 *   Reset: { action: "reset" }
 *   Status (GET): no body needed
 *
 * @param {string} method - HTTP method
 * @param {object|null} body - Parsed request body (for POST)
 * @returns {object} Response data
 */
export function handleRolloutEndpoint(method, body) {
  try {
    // GET — return current status
    if (method === "GET") {
      return {
        ok: true,
        flags: getAllRolloutFlags(),
        valid_modes: [...VALID_MODES],
        valid_dimensions: ["stage", "type", "feature"]
      };
    }

    // POST — modify flags
    if (method === "POST") {
      if (!body || typeof body !== "object") {
        return { ok: false, error: "invalid_body" };
      }

      // Reset action
      if (body.action === "reset") {
        return resetAllRolloutFlags();
      }

      // Bulk set
      if (Array.isArray(body.flags)) {
        return bulkSetRolloutFlags(body.flags);
      }

      // Single set
      if (body.dimension && body.identifier && body.mode) {
        const result = setRolloutFlag(body.dimension, body.identifier, body.mode);
        return { ...result, current_flags: getAllRolloutFlags() };
      }

      return {
        ok: false,
        error: "invalid_payload",
        detail: "Provide { dimension, identifier, mode } or { flags: [...] } or { action: 'reset' }"
      };
    }

    return { ok: false, error: "method_not_allowed" };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
