import {
  ARBITRATION_REASON_CODES,
  COGNITIVE_REASON_CODES,
  HYBRID_TELEMETRY_DEFAULTS,
  HYBRID_TELEMETRY_EVENT_TYPES,
  HYBRID_TELEMETRY_SCHEMA_VERSION,
  MECHANICAL_REASON_CODES,
  OVERRIDE_CLASSIFICATIONS
} from "./hybrid-telemetry-contract.js";

const DEFAULT_SANITIZE_OPTIONS = Object.freeze({
  maxStringLength: 500,
  maxArrayItems: 20,
  maxObjectKeys: 40,
  maxDepth: 4
});

function truncateString(value, maxStringLength) {
  const str = String(value ?? "");
  return str.length > maxStringLength
    ? `${str.slice(0, maxStringLength)}…[truncated:${str.length - maxStringLength}]`
    : str;
}

function sanitizeValue(value, options, depth, seen) {
  if (value == null) return null;
  if (depth > options.maxDepth) return "[max-depth]";

  const valueType = typeof value;
  if (valueType === "string") return truncateString(value, options.maxStringLength);
  if (valueType === "number") return Number.isFinite(value) ? value : null;
  if (valueType === "boolean") return value;
  if (valueType === "bigint") return String(value);
  if (valueType === "function") return `[function:${value.name || "anonymous"}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message, options.maxStringLength),
      stack: truncateString(value.stack || "", options.maxStringLength)
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, options.maxArrayItems)
      .map((item) => sanitizeValue(item, options, depth + 1, seen));
  }

  if (valueType === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const entries = Object.entries(value).slice(0, options.maxObjectKeys);
    const sanitized = {};
    for (const [key, entryValue] of entries) {
      sanitized[key] = sanitizeValue(entryValue, options, depth + 1, seen);
    }
    seen.delete(value);
    return sanitized;
  }

  return truncateString(value, options.maxStringLength);
}

export function sanitizeTelemetryPayload(payload, options = {}) {
  const mergedOptions = { ...DEFAULT_SANITIZE_OPTIONS, ...(options || {}) };
  return sanitizeValue(payload, mergedOptions, 0, new WeakSet());
}

export function createTurnCorrelationId(input = {}) {
  const timestamp = input.timestamp || new Date().toISOString();
  const baseParts = [
    input.conversationId || input.conversation_id || input.leadId || input.lead_id || "na",
    input.turnId || input.turn_id || input.messageId || input.message_id || "turn",
    timestamp
  ];
  const normalized = baseParts
    .map((part) => String(part || "na").replace(/[^a-zA-Z0-9_-]/g, "-"))
    .join("--")
    .replace(/-+/g, "-")
    .slice(0, 120);
  const suffix = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `corr-${normalized}-${suffix}`;
}

function buildBaseEvent(payload = {}) {
  const timestamp = payload.timestamp || new Date().toISOString();
  return {
    ...HYBRID_TELEMETRY_DEFAULTS.base,
    ...sanitizeTelemetryPayload(payload),
    schema_version: HYBRID_TELEMETRY_SCHEMA_VERSION,
    timestamp,
    correlation_id:
      payload.correlation_id ||
      payload.correlationId ||
      createTurnCorrelationId({ ...payload, timestamp })
  };
}

export function buildCognitiveTelemetryEvent(payload = {}) {
  return {
    ...HYBRID_TELEMETRY_DEFAULTS.cognitive,
    ...sanitizeTelemetryPayload(payload),
    cognitive_reason_codes: sanitizeTelemetryPayload(
      payload.cognitive_reason_codes || payload.cognitiveReasonCodes || []
    )
  };
}

export function buildMechanicalTelemetryEvent(payload = {}) {
  return {
    ...HYBRID_TELEMETRY_DEFAULTS.mechanical,
    ...sanitizeTelemetryPayload(payload),
    mechanical_reason_codes: sanitizeTelemetryPayload(
      payload.mechanical_reason_codes || payload.mechanicalReasonCodes || []
    )
  };
}

export function buildArbitrationTelemetryEvent(payload = {}) {
  return {
    ...HYBRID_TELEMETRY_DEFAULTS.arbitration,
    ...sanitizeTelemetryPayload(payload),
    arbitration_flags: sanitizeTelemetryPayload(
      payload.arbitration_flags || payload.arbitrationFlags || []
    )
  };
}

export function buildHybridTelemetryEvent({
  eventName,
  base = {},
  cognitive = {},
  mechanical = {},
  arbitration = {}
} = {}) {
  const builtBase = buildBaseEvent({ ...base, event_name: eventName || base.event_name || null });
  return {
    ...builtBase,
    cognitive: buildCognitiveTelemetryEvent(cognitive),
    mechanical: buildMechanicalTelemetryEvent(mechanical),
    arbitration: buildArbitrationTelemetryEvent(arbitration)
  };
}

async function callEmitterSafely(emitterName, emitterFn, event, result) {
  if (typeof emitterFn !== "function") return;
  try {
    await emitterFn(event);
    result.emitters[emitterName] = "ok";
  } catch (error) {
    result.ok = false;
    result.emitters[emitterName] = "error";
    result.errors.push({
      emitter: emitterName,
      message: error?.message || String(error)
    });
  }
}

export async function emitHybridTelemetry({
  event,
  consoleEmitter,
  persistentEmitter,
  additionalEmitters = {}
} = {}) {
  const sanitizedEvent = sanitizeTelemetryPayload(event || {});
  const result = {
    ok: true,
    event: sanitizedEvent,
    emitters: {},
    errors: []
  };

  const safeConsoleEmitter =
    typeof consoleEmitter === "function"
      ? consoleEmitter
      : (payload) => console.log("[hybrid-telemetry]", JSON.stringify(payload));

  await callEmitterSafely("console", safeConsoleEmitter, sanitizedEvent, result);
  await callEmitterSafely("persistent", persistentEmitter, sanitizedEvent, result);

  for (const [name, emitter] of Object.entries(additionalEmitters || {})) {
    await callEmitterSafely(name, emitter, sanitizedEvent, result);
  }

  return result;
}

export async function emitCognitiveTelemetrySafe({
  eventName = HYBRID_TELEMETRY_EVENT_TYPES.COGNITIVE_TURN_RESULT,
  base = {},
  cognitive = {},
  ...emitOptions
} = {}) {
  return emitHybridTelemetry({
    event: buildHybridTelemetryEvent({ eventName, base, cognitive }),
    ...emitOptions
  });
}

export async function emitMechanicalTelemetrySafe({
  eventName = HYBRID_TELEMETRY_EVENT_TYPES.MECHANICAL_PARSE_RESULT,
  base = {},
  mechanical = {},
  ...emitOptions
} = {}) {
  return emitHybridTelemetry({
    event: buildHybridTelemetryEvent({ eventName, base, mechanical }),
    ...emitOptions
  });
}

export async function emitArbitrationTelemetrySafe({
  eventName = HYBRID_TELEMETRY_EVENT_TYPES.ARBITRATION_CONFLICT,
  base = {},
  arbitration = {},
  cognitive = {},
  mechanical = {},
  ...emitOptions
} = {}) {
  return emitHybridTelemetry({
    event: buildHybridTelemetryEvent({ eventName, base, arbitration, cognitive, mechanical }),
    ...emitOptions
  });
}

export {
  ARBITRATION_REASON_CODES,
  COGNITIVE_REASON_CODES,
  HYBRID_TELEMETRY_EVENT_TYPES,
  MECHANICAL_REASON_CODES,
  OVERRIDE_CLASSIFICATIONS
};
