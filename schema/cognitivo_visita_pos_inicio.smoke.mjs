/**
 * cognitivo_visita_pos_inicio.smoke.mjs
 *
 * Valida patch cognitivo de visita pós-início:
 * - continuidade pós-início (visita_confirmada com dúvida genérica)
 * - follow-up humano (convite feito → cliente esfria)
 * - persuasão objetiva (cliente indeciso)
 * - continuidade de remarcação (visita_confirmada + remarcar)
 * - pós-visita: próximo passo objetivo (finalizacao_processo)
 * - sem regressão no que já existia de visita
 */

import assert from "node:assert/strict";

const { runReadOnlyCognitiveEngine } = await import(
  new URL("../cognitive/src/run-cognitive.js", import.meta.url).href
);

const openaiMockModule = await import(new URL("./cognitive_openai_mock.mjs", import.meta.url).href);
const { createMockOpenAIFetch } = openaiMockModule;

const llmRuntime = {
  openaiApiKey: "test-openai-key",
  model: "gpt-4.1-mini",
  fetchImpl: createMockOpenAIFetch()
};

function normalizeForMatch(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const scenarios = [
  {
    label: "visita iniciada — continuidade coerente (stage=visita_confirmada)",
    input: {
      conversation_id: "smoke-visita-001",
      current_stage: "visita_confirmada",
      message_text: "Ok, e o que acontece agora?",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    mustInclude: ["passo certo", "confirma"],
    mustNotInclude: ["não tenho acesso"]
  },
  {
    label: "cliente esfria após convite → follow-up humano (visita=convite)",
    input: {
      conversation_id: "smoke-visita-002",
      current_stage: "agendamento_visita",
      message_text: "Vou pensar, talvez depois.",
      known_slots: { visita: "convite" },
      pending_slots: ["visita"],
      recent_messages: []
    },
    mustInclude: ["confirmar", "horário", "online"],
    mustNotInclude: []
  },
  {
    label: "cliente indeciso → persuasão objetiva (sem slot de convite)",
    input: {
      conversation_id: "smoke-visita-003",
      current_stage: "agendamento_visita",
      message_text: "Não sei, acho que não preciso visitar agora.",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    mustInclude: ["compromisso", "confirma"],
    mustNotInclude: []
  },
  {
    label: "visita confirmada + remarcar → continuidade coerente",
    input: {
      conversation_id: "smoke-visita-004",
      current_stage: "visita_confirmada",
      message_text: "Preciso remarcar para outro dia.",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    mustInclude: ["agenda oficial", "dia e horario"],
    mustNotInclude: []
  },
  {
    label: "pós-visita (finalizacao_processo) → próximo passo objetivo",
    input: {
      conversation_id: "smoke-visita-005",
      current_stage: "finalizacao_processo",
      message_text: "Fiz a visita, e agora?",
      known_slots: {},
      pending_slots: [],
      recent_messages: []
    },
    mustInclude: ["proximo passo", "corretor"],
    mustNotInclude: []
  },
  {
    label: "sem regressão — resistência original continua funcionando",
    input: {
      conversation_id: "smoke-visita-006",
      current_stage: "agendamento_visita",
      message_text: "Pra que precisa visitar? Prefiro não visitar agora.",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    mustInclude: ["sem criar expectativa errada", "agenda oficial do plantao"],
    mustNotInclude: []
  },
  {
    label: "sem regressão — aceite de visita continua funcionando",
    input: {
      conversation_id: "smoke-visita-007",
      current_stage: "agendamento_visita",
      message_text: "Quero visitar, pode agendar.",
      known_slots: {},
      pending_slots: ["visita"],
      recent_messages: []
    },
    mustInclude: ["opcoes oficiais de agenda"],
    mustNotInclude: []
  }
];

let passed = 0;
let failed = 0;

for (const scenario of scenarios) {
  const result = await runReadOnlyCognitiveEngine(scenario.input, llmRuntime);
  const replyRaw = result?.response?.reply_text ?? "";
  const reply = normalizeForMatch(replyRaw);

  let ok = true;
  const failures = [];

  for (const snippet of scenario.mustInclude) {
    const normalizedSnippet = normalizeForMatch(snippet);
    if (!reply.includes(normalizedSnippet)) {
      failures.push(`must include "${snippet}" but got: "${replyRaw.slice(0, 120)}"`);
      ok = false;
    }
  }

  for (const snippet of scenario.mustNotInclude) {
    const normalizedSnippet = normalizeForMatch(snippet);
    if (reply.includes(normalizedSnippet)) {
      failures.push(`must NOT include "${snippet}" but found it in: "${replyRaw.slice(0, 120)}"`);
      ok = false;
    }
  }

  if (ok) {
    console.log(`  ✅ ${scenario.label}`);
    passed++;
  } else {
    console.error(`  ❌ ${scenario.label}`);
    for (const f of failures) console.error(`     → ${f}`);
    failed++;
  }
}

console.log(`\n============================================================`);
console.log(`cognitivo_visita_pos_inicio.smoke: ${passed} passed, ${failed} failed`);
console.log(`============================================================\n`);

assert.equal(failed, 0, `${failed} scenario(s) failed in cognitivo_visita_pos_inicio.smoke`);

console.log("cognitivo_visita_pos_inicio.smoke: ok");
