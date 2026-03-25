import type { CognitiveRequest, CognitiveSlotValue } from "./response-schema";

export const getKnownSlot = (
  request: CognitiveRequest,
  slotName: string
): CognitiveSlotValue | undefined => request.known_slots[slotName];

export const listPendingSlots = (request: CognitiveRequest): string[] => [
  ...request.pending_slots
];
