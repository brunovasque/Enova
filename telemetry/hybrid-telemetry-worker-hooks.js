/**
 * hybrid-telemetry-worker-hooks.js — PR 2
 *
 * Instrumentação real da telemetria híbrida no worker.
 * Conecta os helpers da PR 1 (hybrid-telemetry.js) aos pontos reais do fluxo.
 *
 * Regras invioláveis:
 *   - Nenhuma emissão pode alterar decisão do fluxo
 *   - Nenhuma emissão pode derrubar atendimento
 *   - Nenhuma emissão pode alterar nextStage, parser, gate, copy, fallback ou surface
 *   - Se falhar, falha isolada e segue o fluxo
 *   - Telemetria não pode lançar exceção para o chamador
 *
 * Todos os hooks retornam void (fire-and-forget seguro).
 */

import {
  createTurnCorrelationId,
  buildHybridTelemetryEvent,
  emitHybridTelemetry,
  emitCognitiveTelemetrySafe,
  emitMechanicalTelemetrySafe,
  emitArbitrationTelemetrySafe,
  HYBRID_TELEMETRY_EVENT_TYPES,
  COGNITIVE_REASON_CODES,
  MECHANICAL_REASON_CODES,
  ARBITRATION_REASON_CODES,
  OVERRIDE_CLASSIFICATIONS,
  sanitizeTelemetryPayload
} from "./hybrid-telemetry.js";

// ═══════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════

/** Safe string slice — never throws */
function safeSlice(value, maxLen = 500) {
  try {
    const s = String(value ?? "");
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
  } catch (_) { return ""; }
}

/** Safe JSON — never throws */
function safeStringify(value) {
  try { return JSON.stringify(value); } catch (_) { return "{}"; }
}

/** Build default console emitter reusing existing logger pattern */
function buildConsoleEmitter(tag) {
  return (payload) => {
    try {
      console.log(`[hybrid-telemetry][${tag}]`, safeStringify(payload));
    } catch (_) { /* fire-and-forget */ }
  };
}

/** Create or reuse correlation_id for the turn */
function resolveCorrelationId(st, messageId) {
  if (st?.__hybrid_correlation_id) return st.__hybrid_correlation_id;
  const corrId = createTurnCorrelationId({
    conversationId: st?.wa_id || st?.lead_id || null,
    turnId: messageId || st?.last_message_id || null,
    timestamp: new Date().toISOString()
  });
  if (st && typeof st === "object") {
    st.__hybrid_correlation_id = corrId;
  }
  return corrId;
}

/** Build minimal state diff from before/after — safe and bounded */
function buildMinimalStateDiff(before, after) {
  try {
    if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
    const SAFE_DIFF_KEYS = [
      "fase_conversa", "nome", "estado_civil", "cpf",
      "renda_informada", "fgts_informado", "regime_trabalho",
      "programa_interesse", "source_type"
    ];
    const diff = {};
    let hasChange = false;
    for (const key of SAFE_DIFF_KEYS) {
      if (before[key] !== after[key]) {
        diff[key] = { from: before[key] ?? null, to: after[key] ?? null };
        hasChange = true;
      }
    }
    return hasChange ? diff : null;
  } catch (_) { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// HOOK 1 — TURN ENTRY (handleMetaWebhook)
// ═══════════════════════════════════════════════════════════════════

/**
 * Emits turn start telemetry at the beginning of handleMetaWebhook.
 *
 * @param {object} params
 * @param {object} params.st - current state
 * @param {string} params.messageId - meta message id (wamid)
 * @param {string} params.waId - WhatsApp ID
 * @param {string} params.userText - raw user input
 * @param {string} params.normalizedUserText - normalized user text
 * @param {string} params.stage - current stage (fase_conversa)
 */
export async function emitTurnEntryTelemetry({ st, messageId, waId, userText, normalizedUserText, stage } = {}) {
  try {
    const correlationId = resolveCorrelationId(st, messageId);
    await emitCognitiveTelemetrySafe({
      eventName: HYBRID_TELEMETRY_EVENT_TYPES.COGNITIVE_TURN_START,
      base: {
        lead_id: waId || st?.wa_id || null,
        conversation_id: waId || st?.wa_id || null,
        turn_id: messageId || null,
        correlation_id: correlationId,
        stage_before: stage || st?.fase_conversa || "inicio",
        stage_after: null
      },
      cognitive: {
        user_input_raw: safeSlice(userText, 500),
        user_input_normalized: safeSlice(normalizedUserText, 500)
      },
      consoleEmitter: buildConsoleEmitter("turn_entry")
    });
  } catch (_) { /* fire-and-forget: telemetry must never break the flow */ }
}

// ═══════════════════════════════════════════════════════════════════
// HOOK 2 — COGNITIVE DECISION (COGNITIVE ASSIST block)
// ═══════════════════════════════════════════════════════════════════

/**
 * Emits cognitive decision telemetry after the COGNITIVE ASSIST block processes.
 *
 * @param {object} params
 * @param {object} params.st - current state
 * @param {string} params.stage - current stage
 * @param {string} params.userText - user input
 * @param {object} params.cognitive - cognitive output object
 * @param {string} params.cognitiveReply - sanitized cognitive reply
 * @param {boolean} params.hasUsefulReply - whether cognitive had useful reply
 * @param {string} params.speechOrigin - speech arbiter source
 * @param {string} params.v2Mode - cognitive v2 mode (off/shadow/on)
 */
export async function emitCognitiveDecisionTelemetry({
  st, stage, userText, cognitive, cognitiveReply,
  hasUsefulReply, speechOrigin, v2Mode
} = {}) {
  try {
    const correlationId = resolveCorrelationId(st);
    const reasonCodes = [];
    const confidence = Number(cognitive?.confidence ?? 0);
    if (confidence < 0.5) reasonCodes.push(COGNITIVE_REASON_CODES.LOW_CONFIDENCE);
    if (!cognitive?.safe_stage_signal) reasonCodes.push(COGNITIVE_REASON_CODES.NO_STRUCTURED_SIGNAL);
    if (cognitive?.intent === "ambiguous" || cognitive?.intent === "unclear") {
      reasonCodes.push(COGNITIVE_REASON_CODES.AMBIGUOUS_INPUT);
    }

    await emitCognitiveTelemetrySafe({
      eventName: HYBRID_TELEMETRY_EVENT_TYPES.COGNITIVE_TURN_RESULT,
      base: {
        lead_id: st?.wa_id || null,
        conversation_id: st?.wa_id || null,
        turn_id: st?.last_message_id || null,
        correlation_id: correlationId,
        stage_before: stage || st?.fase_conversa || "inicio",
        stage_after: stage
      },
      cognitive: {
        user_input_raw: safeSlice(userText, 500),
        ai_detected_intent: cognitive?.intent || null,
        ai_structured_signal: cognitive?.safe_stage_signal || null,
        ai_confidence: confidence || null,
        ai_reply_text: safeSlice(cognitiveReply || cognitive?.reply_text, 500),
        ai_offtrack_detected: cognitive?.offtrack === true,
        ai_answered_customer_question: cognitive?.answered_customer_question === true,
        ai_suggested_stage: cognitive?.suggested_stage || null,
        ai_needs_confirmation: cognitive?.still_needs_original_answer === true,
        cognitive_reason_codes: reasonCodes,
        latency_ms: cognitive?.latency_ms || null
      },
      consoleEmitter: buildConsoleEmitter("cognitive_decision")
    });
  } catch (_) { /* fire-and-forget */ }
}

// ═══════════════════════════════════════════════════════════════════
// HOOK 3 — POST-PROCESSING / FINAL CONTRACT
// ═══════════════════════════════════════════════════════════════════

/**
 * Emits telemetry for the post-processing step where cognitive reply
 * goes through the final speech contract.
 *
 * @param {object} params
 * @param {object} params.st - current state
 * @param {string} params.stage - current stage
 * @param {string} params.replyBeforeContract - reply text before final contract
 * @param {string} params.replyAfterContract - reply text after final contract
 * @param {boolean} params.surfaceChanged - whether the surface was altered
 */
export async function emitPostProcessingTelemetry({
  st, stage, replyBeforeContract, replyAfterContract, surfaceChanged
} = {}) {
  try {
    const correlationId = resolveCorrelationId(st);
    const event = buildHybridTelemetryEvent({
      eventName: "funnel.cognitive.post_processing",
      base: {
        lead_id: st?.wa_id || null,
        conversation_id: st?.wa_id || null,
        turn_id: st?.last_message_id || null,
        correlation_id: correlationId,
        stage_before: stage || st?.fase_conversa || "inicio",
        stage_after: stage
      },
      cognitive: {
        ai_reply_text: safeSlice(replyAfterContract, 500),
        ai_output_raw: safeSlice(replyBeforeContract, 500)
      }
    });
    // Extend with contract-specific fields
    event._contract_meta = {
      reply_before_contract: safeSlice(replyBeforeContract, 300),
      reply_after_contract: safeSlice(replyAfterContract, 300),
      surface_changed: Boolean(surfaceChanged),
      contract_applied: true
    };
    await emitHybridTelemetry({
      event,
      consoleEmitter: buildConsoleEmitter("post_processing")
    });
  } catch (_) { /* fire-and-forget */ }
}

// ═══════════════════════════════════════════════════════════════════
// HOOK 4 — MECHANICAL DECISION (step / runFunnel)
// ═══════════════════════════════════════════════════════════════════

/**
 * Emits mechanical decision telemetry from step() and runFunnel internals.
 *
 * @param {object} params
 * @param {object} params.st - current state
 * @param {string} params.stageBefore - stage before step()
 * @param {string} params.stageAfter - stage after step()
 * @param {string} params.parserUsed - which parser was used (if any)
 * @param {*} params.parserResult - parser result
 * @param {string} params.mechanicalAction - action taken (step/reask/lock)
 * @param {*} params.validationResult - validation result
 * @param {boolean} params.reaskTriggered - whether reask was triggered
 * @param {boolean} params.stageLocked - whether stage is locked
 * @param {object} params.stateDiff - minimal state diff
 */
export async function emitMechanicalDecisionTelemetry({
  st, stageBefore, stageAfter, parserUsed, parserResult,
  mechanicalAction, validationResult, reaskTriggered,
  stageLocked, stateDiff
} = {}) {
  try {
    const correlationId = resolveCorrelationId(st);
    const reasonCodes = [];
    if (!parserResult) reasonCodes.push(MECHANICAL_REASON_CODES.PARSER_EMPTY);
    if (reaskTriggered) reasonCodes.push(MECHANICAL_REASON_CODES.REASK_TRIGGERED);
    if (stageLocked) reasonCodes.push(MECHANICAL_REASON_CODES.STAGE_LOCK_ENFORCED);
    if (stageBefore === stageAfter && !reaskTriggered) {
      reasonCodes.push(MECHANICAL_REASON_CODES.STATE_UNCHANGED);
    }

    await emitMechanicalTelemetrySafe({
      eventName: HYBRID_TELEMETRY_EVENT_TYPES.MECHANICAL_PARSE_RESULT,
      base: {
        lead_id: st?.wa_id || null,
        conversation_id: st?.wa_id || null,
        turn_id: st?.last_message_id || null,
        correlation_id: correlationId,
        stage_before: stageBefore || st?.fase_conversa || "inicio",
        stage_after: stageAfter || stageBefore || null
      },
      mechanical: {
        parser_used: safeSlice(parserUsed, 100),
        parser_result: safeSlice(typeof parserResult === "object" ? safeStringify(parserResult) : parserResult, 300),
        mechanical_action: mechanicalAction || "step",
        mechanical_validation_result: safeSlice(
          typeof validationResult === "object" ? safeStringify(validationResult) : validationResult, 300
        ),
        reask_triggered: Boolean(reaskTriggered),
        stage_locked: Boolean(stageLocked),
        mechanical_reason_codes: reasonCodes,
        state_diff: stateDiff || null
      },
      consoleEmitter: buildConsoleEmitter("mechanical_decision")
    });
  } catch (_) { /* fire-and-forget */ }
}

// ═══════════════════════════════════════════════════════════════════
// HOOK 5 — ARBITRATION (cognitive vs mechanical)
// ═══════════════════════════════════════════════════════════════════

/**
 * Emits arbitration telemetry where cognitive and mechanical results
 * are compared and one wins.
 *
 * @param {object} params
 * @param {object} params.st - current state
 * @param {string} params.stage - current stage
 * @param {string} params.cognitiveSignal - cognitive proposed signal
 * @param {*} params.mechanicalParserResult - mechanical parser result
 * @param {string} params.mechanicalAction - action taken by mechanical
 * @param {boolean} params.arbitrationTriggered - whether arbitration occurred
 * @param {string} params.arbitrationOutcome - outcome description
 * @param {string} params.arbitrationWinner - "cognitive" or "mechanical"
 * @param {string} params.arbitrationReason - reason for the outcome
 * @param {boolean} params.overrideDetected - whether override was detected
 * @param {string} params.overrideClassification - classification of override
 * @param {boolean} params.overrideSuspected - suspected problematic override
 */
export async function emitArbitrationTelemetry({
  st, stage, cognitiveSignal, mechanicalParserResult,
  mechanicalAction, arbitrationTriggered, arbitrationOutcome,
  arbitrationWinner, arbitrationReason, overrideDetected,
  overrideClassification, overrideSuspected
} = {}) {
  try {
    const correlationId = resolveCorrelationId(st);
    await emitArbitrationTelemetrySafe({
      eventName: arbitrationTriggered
        ? HYBRID_TELEMETRY_EVENT_TYPES.ARBITRATION_CONFLICT
        : HYBRID_TELEMETRY_EVENT_TYPES.ARBITRATION_OVERRIDE_SUSPECTED,
      base: {
        lead_id: st?.wa_id || null,
        conversation_id: st?.wa_id || null,
        turn_id: st?.last_message_id || null,
        correlation_id: correlationId,
        stage_before: stage || st?.fase_conversa || "inicio",
        stage_after: stage
      },
      arbitration: {
        cognitive_proposed_signal: safeSlice(cognitiveSignal, 200),
        mechanical_parser_result: safeSlice(
          typeof mechanicalParserResult === "object"
            ? safeStringify(mechanicalParserResult)
            : mechanicalParserResult, 300
        ),
        mechanical_action_taken: mechanicalAction || null,
        arbitration_triggered: Boolean(arbitrationTriggered),
        arbitration_outcome: arbitrationOutcome || null,
        arbitration_winner: arbitrationWinner || null,
        arbitration_reason: arbitrationReason || null,
        override_detected: Boolean(overrideDetected),
        override_classification: overrideClassification || null,
        override_suspected: Boolean(overrideSuspected)
      },
      cognitive: {
        ai_structured_signal: safeSlice(cognitiveSignal, 200)
      },
      mechanical: {
        parser_result: safeSlice(
          typeof mechanicalParserResult === "object"
            ? safeStringify(mechanicalParserResult)
            : mechanicalParserResult, 300
        ),
        mechanical_action: mechanicalAction || null
      },
      consoleEmitter: buildConsoleEmitter("arbitration")
    });
  } catch (_) { /* fire-and-forget */ }
}

// ═══════════════════════════════════════════════════════════════════
// HOOK 6 — FINAL OUTPUT (step choke point)
// ═══════════════════════════════════════════════════════════════════

/**
 * Emits final output telemetry at the step() choke point.
 *
 * @param {object} params
 * @param {object} params.st - current state
 * @param {string} params.stageBefore - stage before step()
 * @param {string} params.stageAfter - stage after step()
 * @param {string} params.outputSurface - final text sent to client
 * @param {boolean} params.surfaceEqualLlm - whether surface equals LLM output
 * @param {string} params.mechanicalTextCandidate - text candidate from mechanical
 * @param {boolean} params.mechanicalTextBlocked - whether mechanical text was blocked
 * @param {string} params.speechArbiterSource - speech arbiter source
 */
export async function emitFinalOutputTelemetry({
  st, stageBefore, stageAfter, outputSurface,
  surfaceEqualLlm, mechanicalTextCandidate,
  mechanicalTextBlocked, speechArbiterSource
} = {}) {
  try {
    const correlationId = resolveCorrelationId(st);
    const event = buildHybridTelemetryEvent({
      eventName: "funnel.output.final",
      base: {
        lead_id: st?.wa_id || null,
        conversation_id: st?.wa_id || null,
        turn_id: st?.last_message_id || null,
        correlation_id: correlationId,
        stage_before: stageBefore || st?.fase_conversa || "inicio",
        stage_after: stageAfter || stageBefore || null
      }
    });
    event._output_meta = {
      output_surface: safeSlice(outputSurface, 500),
      surface_equal_llm: surfaceEqualLlm,
      mechanical_text_candidate: safeSlice(mechanicalTextCandidate, 300),
      mechanical_text_blocked: Boolean(mechanicalTextBlocked),
      speech_arbiter_source: speechArbiterSource || null
    };
    await emitHybridTelemetry({
      event,
      consoleEmitter: buildConsoleEmitter("final_output")
    });

    // Clean up correlation_id for the turn
    clearHybridTurnCorrelation(st);
  } catch (_) { /* fire-and-forget */ }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY — Clear turn correlation
// ═══════════════════════════════════════════════════════════════════

/**
 * Clears the hybrid correlation ID from state.
 * Call at the end of each turn to prevent leaking across turns.
 */
export function clearHybridTurnCorrelation(st) {
  try {
    if (st && typeof st === "object") {
      st.__hybrid_correlation_id = null;
    }
  } catch (_) { /* fire-and-forget */ }
}

// Re-export constants for convenience
export {
  HYBRID_TELEMETRY_EVENT_TYPES,
  COGNITIVE_REASON_CODES,
  MECHANICAL_REASON_CODES,
  ARBITRATION_REASON_CODES,
  OVERRIDE_CLASSIFICATIONS
};
