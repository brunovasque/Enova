function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildReply(text, slotsDetected, conflicts, suggestedNextSlot) {
  const normalized = normalizeText(text);
  if (/\b(valor|entrada|parcela|imovel|imovel)\b/.test(normalized)) {
    return "Posso te orientar de forma consultiva, mas neste teste isolado eu não avanço o fluxo real. Para seguir com segurança, vou retomar a coleta do dado pendente.";
  }
  if (conflicts.length) {
    return "Entendi sua resposta, mas ela ficou ambígua. Vou pedir uma confirmação objetiva antes de consolidar a leitura cognitiva.";
  }
  if (Object.keys(slotsDetected).length >= 2) {
    return "Perfeito, consegui interpretar sua mensagem e devolver uma leitura consultiva estruturada em modo read-only.";
  }
  if (Object.keys(slotsDetected).length === 1) {
    return "Perfeito, identifiquei o principal sinal da sua resposta e já deixei a leitura estruturada para validação.";
  }
  return "Recebi sua mensagem e mantive uma resposta consultiva segura, sem tocar no fluxo real.";
}

export function createMockOpenAIFetch() {
  return async (_url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    const userContent = body?.messages?.find((entry) => entry.role === "user")?.content || "{}";
    const promptPayload = JSON.parse(userContent);
    const request = promptPayload?.request || {};
    const seed = promptPayload?.analysis_seed || {};
    const slotsDetected = seed.slots_detected && typeof seed.slots_detected === "object" ? seed.slots_detected : {};
    const conflicts = Array.isArray(seed.conflicts) ? seed.conflicts : [];
    const pendingSlots = Array.isArray(seed.pending_slots) ? seed.pending_slots : [];
    const suggestedNextSlot =
      typeof seed.suggested_next_slot === "string" ? seed.suggested_next_slot : pendingSlots[0] || null;
    const consultiveNotes = Array.isArray(seed.consultive_notes) ? [...seed.consultive_notes] : [];

    if (promptPayload?.normative_context?.length) {
      consultiveNotes.push("Contexto normativo leve recebido da CEF Knowledge Base.");
    }

    const response = {
      reply_text: buildReply(request.message_text, slotsDetected, conflicts, suggestedNextSlot),
      slots_detected: slotsDetected,
      pending_slots: pendingSlots,
      conflicts,
      suggested_next_slot: suggestedNextSlot,
      consultive_notes: consultiveNotes,
      should_request_confirmation:
        conflicts.length > 0 ||
        Object.keys(slotsDetected).length > 3 ||
        Object.keys(slotsDetected).some((slot) => slot === "p3"),
      should_advance_stage: false,
      confidence: Object.keys(slotsDetected).length ? 0.88 : conflicts.length ? 0.33 : 0.57
    };

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(response)
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };
}
