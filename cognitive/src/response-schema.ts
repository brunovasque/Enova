export type CognitiveSlotState =
  | "unknown"
  | "inferred"
  | "pending_confirmation"
  | "confirmed"
  | "conflicted"
  | "blocked"
  | "not_applicable";

export interface CognitiveSlotValue {
  state: CognitiveSlotState;
  value?: unknown;
  notes?: string[];
}

export interface CognitiveConflict {
  slot: string;
  reason: string;
}

export interface CognitiveRequest {
  version: "V1";
  conversation_id: string;
  channel: "meta_whatsapp";
  current_stage: string;
  message_text: string;
  known_slots: Record<string, CognitiveSlotValue>;
  pending_slots: string[];
}

export interface CognitiveResponse {
  version: "V1";
  human_response: string;
  known_slots: Record<string, CognitiveSlotValue>;
  pending_slots: string[];
  conflicts: CognitiveConflict[];
  suggested_next_slot: string | null;
  consultive_notes: string[];
  should_request_confirmation: boolean;
  should_advance_stage: false;
}

export const emptyCognitiveResponse = (): CognitiveResponse => ({
  version: "V1",
  human_response: "",
  known_slots: {},
  pending_slots: [],
  conflicts: [],
  suggested_next_slot: null,
  consultive_notes: [],
  should_request_confirmation: false,
  should_advance_stage: false
});
