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
  conversationId: string;
  channel: "meta_whatsapp";
  currentStage: string;
  messageText: string;
  knownSlots: Record<string, CognitiveSlotValue>;
  pendingSlots: string[];
}

export interface CognitiveResponse {
  version: "V1";
  humanResponse: string;
  knownSlots: Record<string, CognitiveSlotValue>;
  pendingSlots: string[];
  conflicts: CognitiveConflict[];
  suggestedNextSlot: string | null;
  consultiveNotes: string[];
  shouldRequestConfirmation: boolean;
  shouldAdvanceStage: false;
}

export const emptyCognitiveResponse = (): CognitiveResponse => ({
  version: "V1",
  humanResponse: "",
  knownSlots: {},
  pendingSlots: [],
  conflicts: [],
  suggestedNextSlot: null,
  consultiveNotes: [],
  shouldRequestConfirmation: false,
  shouldAdvanceStage: false
});
