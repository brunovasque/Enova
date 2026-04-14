import { getStageGoal } from "./cognitive-contract";
import { COGNITIVE_SYSTEM_PROMPT, COGNITIVE_RESPONSE_STYLE } from "./prompts";
import type { CognitiveRequest, CognitiveResponse } from "./response-schema";
import { emptyCognitiveResponse } from "./response-schema";

export async function runCognitiveEngine(
  request: CognitiveRequest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<CognitiveResponse> {
  const stageGoal = getStageGoal(request.current_stage);
  const userPrompt = `
Stage atual: ${request.current_stage}
Objetivo do stage: ${stageGoal}
Mensagem do cliente: "${request.message_text}"
Slots conhecidos: ${JSON.stringify(request.known_slots)}
Slots pendentes: ${JSON.stringify(request.pending_slots)}

Responda APENAS com JSON válido seguindo o shape CognitiveResponse V1.
should_advance_stage deve ser false obrigatoriamente.
`.trim();

  try {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: COGNITIVE_SYSTEM_PROMPT + "\n" + COGNITIVE_RESPONSE_STYLE },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

    const data = await res.json() as any;
    const raw = JSON.parse(data.choices[0].message.content);

    return {
      ...emptyCognitiveResponse(),
      ...raw,
      should_advance_stage: false // blindagem — mecânico decide sempre
    };
  } catch (e) {
    console.error("COGNITIVE_ENGINE_ERROR:", e);
    return {
      ...emptyCognitiveResponse(),
      human_response: "",
      should_advance_stage: false
    };
  }
}
