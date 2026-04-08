export const HYBRID_TELEMETRY_SCHEMA_VERSION = "hybrid-telemetry.v1";

export const HYBRID_TELEMETRY_EVENT_TYPES = Object.freeze({
  COGNITIVE_TURN_START: "funnel.cognitive.turn.start",
  COGNITIVE_TURN_RESULT: "funnel.cognitive.turn.result",
  COGNITIVE_LOW_CONFIDENCE: "funnel.cognitive.low_confidence",
  MECHANICAL_PARSE_RESULT: "funnel.mechanical.parse.result",
  MECHANICAL_REASK: "funnel.mechanical.reask",
  MECHANICAL_STAGE_LOCK: "funnel.mechanical.stage.lock",
  ARBITRATION_CONFLICT: "funnel.arbitration.conflict",
  ARBITRATION_OVERRIDE: "funnel.arbitration.override",
  ARBITRATION_OVERRIDE_SUSPECTED: "funnel.arbitration.override.suspected",
  ARBITRATION_LOOP_CAUSED: "funnel.arbitration.loop.caused"
});

export const COGNITIVE_REASON_CODES = Object.freeze({
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  AMBIGUOUS_INPUT: "AMBIGUOUS_INPUT",
  NO_STRUCTURED_SIGNAL: "NO_STRUCTURED_SIGNAL",
  OFFTRACK_ONLY: "OFFTRACK_ONLY",
  AI_OUTPUT_INVALID: "AI_OUTPUT_INVALID"
});

export const MECHANICAL_REASON_CODES = Object.freeze({
  PARSER_EMPTY: "PARSER_EMPTY",
  MECHANICAL_REJECT: "MECHANICAL_REJECT",
  STATE_UNCHANGED: "STATE_UNCHANGED",
  REASK_TRIGGERED: "REASK_TRIGGERED",
  STAGE_LOCK_ENFORCED: "STAGE_LOCK_ENFORCED"
});

export const ARBITRATION_REASON_CODES = Object.freeze({
  COGNITIVE_SIGNAL_ACCEPTED: "COGNITIVE_SIGNAL_ACCEPTED",
  COGNITIVE_SIGNAL_REJECTED: "COGNITIVE_SIGNAL_REJECTED",
  MECHANICAL_OVERRIDE_VALID: "MECHANICAL_OVERRIDE_VALID",
  MECHANICAL_OVERRIDE_SUSPECTED: "MECHANICAL_OVERRIDE_SUSPECTED",
  PARSER_BLOCKED_VALID_SIGNAL: "PARSER_BLOCKED_VALID_SIGNAL",
  COGNITIVE_ATTEMPTED_UNSAFE_ADVANCE: "COGNITIVE_ATTEMPTED_UNSAFE_ADVANCE",
  OVERRIDE_CAUSED_LOOP: "OVERRIDE_CAUSED_LOOP",
  OVERRIDE_BLOCKED_VALID_PROGRESS: "OVERRIDE_BLOCKED_VALID_PROGRESS"
});

export const OVERRIDE_CLASSIFICATIONS = Object.freeze({
  OVERRIDE_VALID_SAFETY: "OVERRIDE_VALID_SAFETY",
  OVERRIDE_EXPECTED_RULE: "OVERRIDE_EXPECTED_RULE",
  OVERRIDE_SUSPECTED_EXCESS: "OVERRIDE_SUSPECTED_EXCESS",
  OVERRIDE_CAUSED_LOOP: "OVERRIDE_CAUSED_LOOP",
  OVERRIDE_BLOCKED_VALID_SIGNAL: "OVERRIDE_BLOCKED_VALID_SIGNAL",
  OVERRIDE_REQUIRED_CONFIRMATION: "OVERRIDE_REQUIRED_CONFIRMATION"
});

export const HYBRID_TELEMETRY_FIELD_GROUPS = Object.freeze({
  base: Object.freeze([
    "schema_version",
    "event_name",
    "timestamp",
    "lead_id",
    "conversation_id",
    "turn_id",
    "correlation_id",
    "stage_before",
    "stage_after"
  ]),
  cognitive: Object.freeze([
    "user_input_raw",
    "user_input_normalized",
    "ai_output_raw",
    "ai_reply_text",
    "ai_detected_intent",
    "ai_detected_entities",
    "ai_structured_signal",
    "ai_confidence",
    "ai_needs_confirmation",
    "ai_offtrack_detected",
    "ai_answered_customer_question",
    "ai_suggested_stage",
    "cognitive_reason_codes",
    "latency_ms"
  ]),
  mechanical: Object.freeze([
    "stage_expected",
    "parser_used",
    "parser_result",
    "mechanical_action",
    "mechanical_validation_result",
    "mechanical_reason_codes",
    "reask_triggered",
    "stage_locked",
    "state_before",
    "state_after",
    "state_diff",
    "persistence_result"
  ]),
  arbitration: Object.freeze([
    "cognitive_proposed_signal",
    "cognitive_confidence_band",
    "mechanical_parser_result",
    "mechanical_action_taken",
    "arbitration_triggered",
    "arbitration_outcome",
    "arbitration_winner",
    "arbitration_loser",
    "arbitration_reason",
    "override_detected",
    "override_direction",
    "override_classification",
    "override_suspected",
    "arbitration_flags"
  ])
});

export const HYBRID_TELEMETRY_DEFAULTS = Object.freeze({
  base: Object.freeze({
    schema_version: HYBRID_TELEMETRY_SCHEMA_VERSION,
    event_name: null,
    timestamp: null,
    lead_id: null,
    conversation_id: null,
    turn_id: null,
    correlation_id: null,
    stage_before: null,
    stage_after: null
  }),
  cognitive: Object.freeze({
    user_input_raw: null,
    user_input_normalized: null,
    ai_output_raw: null,
    ai_reply_text: null,
    ai_detected_intent: null,
    ai_detected_entities: [],
    ai_structured_signal: null,
    ai_confidence: null,
    ai_needs_confirmation: false,
    ai_offtrack_detected: false,
    ai_answered_customer_question: false,
    ai_suggested_stage: null,
    cognitive_reason_codes: [],
    latency_ms: null
  }),
  mechanical: Object.freeze({
    stage_expected: null,
    parser_used: null,
    parser_result: null,
    mechanical_action: null,
    mechanical_validation_result: null,
    mechanical_reason_codes: [],
    reask_triggered: false,
    stage_locked: false,
    state_before: null,
    state_after: null,
    state_diff: null,
    persistence_result: null
  }),
  arbitration: Object.freeze({
    cognitive_proposed_signal: null,
    cognitive_confidence_band: null,
    mechanical_parser_result: null,
    mechanical_action_taken: null,
    arbitration_triggered: false,
    arbitration_outcome: null,
    arbitration_winner: null,
    arbitration_loser: null,
    arbitration_reason: null,
    override_detected: false,
    override_direction: null,
    override_classification: null,
    override_suspected: false,
    arbitration_flags: []
  })
});
