import { getDependentSlots } from "./dependency-engine";
import { listPendingSlots } from "./slot-engine";
import type { CognitiveRequest, CognitiveResponse } from "./response-schema";
import { emptyCognitiveResponse } from "./response-schema";

export const createPlaceholderResponse = (
  request: CognitiveRequest
): CognitiveResponse => {
  const pendingSlots = listPendingSlots(request);
  const suggestedNextSlot = pendingSlots[0] ?? null;
  const consultiveNotes =
    suggestedNextSlot === null
      ? []
      : [`Slot sugerido para próxima pergunta: ${suggestedNextSlot}.`];

  if (suggestedNextSlot !== null) {
    consultiveNotes.push(
      `Dependências consultivas observadas: ${getDependentSlots(suggestedNextSlot).join(", ") || "nenhuma"}.`
    );
  }

  return {
    ...emptyCognitiveResponse(),
    human_response:
      "Placeholder do Enova Cognitive Engine: retorno consultivo ainda não integrado em produção.",
    known_slots: request.known_slots,
    pending_slots: pendingSlots,
    suggested_next_slot: suggestedNextSlot,
    consultive_notes: consultiveNotes
  };
};
