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
    humanResponse: "",
    knownSlots: request.knownSlots,
    pendingSlots,
    suggestedNextSlot,
    consultiveNotes
  };
};
