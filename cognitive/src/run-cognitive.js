import { READ_ONLY_COGNITIVE_FIXTURES } from "../fixtures/read-only-cases.js";

const REQUIRED_RESPONSE_FIELDS = Object.freeze([
  "reply_text",
  "slots_detected",
  "pending_slots",
  "conflicts",
  "suggested_next_slot",
  "consultive_notes",
  "should_request_confirmation",
  "should_advance_stage",
  "confidence"
]);

const STAGE_DEFAULT_PENDING_SLOTS = Object.freeze({
  estado_civil: ["estado_civil", "composicao"],
  somar_renda_solteiro: ["composicao", "familiar", "renda"],
  somar_renda_familiar: ["familiar", "p3"],
  regime_trabalho: ["regime_trabalho", "renda", "ir_declarado"],
  autonomo_ir_pergunta: ["ir_declarado", "renda"],
  renda: ["renda", "ir_declarado"]
});

const BRL_CURRENCY_PATTERN = /(?<!\d)(?:r\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?(?!\d)/i;
const OFFTRACK_HINTS = /\b(valor|entrada|parcela|imovel|imóvel|casa|apartamento|bairro|regiao|região|metros)\b/i;
const AMBIGUOUS_HINTS = /\b(acho|talvez|mais ou menos|nao sei|não sei|meio|duvida|dúvida)\b/i;
const FAMILY_MEMBER_PATTERN = /\bm[aã]e\b|\bpai\b|\birm[aã](?:o)?\b|\bav[oó]\b|\btio\b|\btia\b|\bprima\b|\bprimo\b/g;
const CONFIRMATION_SLOT_KEYS = new Set(["p3"]);
const ESTADO_CIVIL_CONFIDENCE = Object.freeze({
  default: 0.88,
  ambiguous: 0.41
});
const CONFIDENCE_RULES = Object.freeze({
  detectedBase: 0.58,
  detectedIncrement: 0.1,
  noSlotBase: 0.32,
  conflictPenalty: 0.22,
  offtrackPenalty: 0.08,
  offtrackBase: 0.58
});
const DEFAULT_COGNITIVE_AI_MODEL = "gpt-4.1-mini";
const COGNITIVE_SLOT_DEPENDENCIES = Object.freeze({
  estado_civil: ["composicao"],
  composicao: ["parceiro_p2", "familiar", "p3"],
  regime_trabalho: ["renda", "ir_declarado"],
  autonomo_ir: ["docs"],
  ctps: ["docs"],
  restricao: ["docs"],
  docs: ["correspondente"],
  correspondente: ["visita"]
});
const COGNITIVE_SLOT_CONTRACT = Object.freeze([
  {
    key: "estado_civil",
    description: "Leitura consultiva de solteiro/casado civil/união estável.",
    depends_on: []
  },
  {
    key: "composicao",
    description: "Indica se o caso segue sozinho, com parceiro ou com familiar.",
    depends_on: ["estado_civil"]
  },
  {
    key: "familiar",
    description: "Familiar específico quando a composição envolver familiar.",
    depends_on: ["composicao"]
  },
  {
    key: "p3",
    description: "Terceiro participante quando aplicável.",
    depends_on: ["composicao"]
  },
  {
    key: "regime_trabalho",
    description: "Regime como CLT, autônomo, servidor ou aposentado.",
    depends_on: []
  },
  {
    key: "renda",
    description: "Faixa/valor de renda informado pelo cliente.",
    depends_on: ["regime_trabalho"]
  },
  {
    key: "ir_declarado",
    description: "Se o cliente declara imposto de renda.",
    depends_on: ["regime_trabalho", "renda"]
  }
]);

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRequest(input = {}) {
  const context = input?.context && typeof input.context === "object" ? input.context : {};
  const message = input?.message && typeof input.message === "object" ? input.message : {};
  const knownSlotsRaw = input?.known_slots ?? context?.known_slots;
  const pendingSlotsRaw = input?.pending_slots ?? context?.pending_slots;
  const recentMessagesRaw = input?.recent_messages ?? context?.recent_messages;
  const normativeContextRaw = input?.normative_context ?? context?.normative_context;
  const normalized = {
    version: String(input?.version || "read_only_test_v1"),
    channel: String(input?.channel || "meta_whatsapp"),
    conversation_id: String(input?.conversation_id || message?.id || "cognitive-test"),
    current_stage: String(input?.current_stage || context?.current_stage || "inicio"),
    message_text: String(input?.message_text || message?.text || ""),
    known_slots:
      knownSlotsRaw && typeof knownSlotsRaw === "object" && !Array.isArray(knownSlotsRaw)
        ? cloneJson(knownSlotsRaw)
        : {},
    pending_slots: Array.isArray(pendingSlotsRaw) ? [...pendingSlotsRaw] : [],
    recent_messages: Array.isArray(recentMessagesRaw)
      ? recentMessagesRaw.map((entry) => {
          if (typeof entry === "string") return { role: "user", text: entry };
          return {
            role: String(entry?.role || "user"),
            text: String(entry?.text || "")
          };
        })
      : [],
    normative_context: Array.isArray(normativeContextRaw)
      ? normativeContextRaw
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const title = String(entry?.title || "").trim();
            const content = String(entry?.content || "").trim();
            if (!title && !content) return null;
            return {
              title: title || "Normative context",
              content,
              source: String(entry?.source || "").trim() || null
            };
          })
          .filter(Boolean)
      : []
  };

  return normalized;
}

function pickDetectedValue(text, pairs) {
  for (const pair of pairs) {
    if (pair.regex.test(text)) return pair.value;
  }
  return null;
}

function detectMoney(text) {
  const matches = String(text || "").match(new RegExp(BRL_CURRENCY_PATTERN.source, "gi"));
  if (!matches || !matches.length) return null;
  const parsedValues = matches
    .map((match) => {
      const raw = match.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value) => Number.isFinite(value));

  if (!parsedValues.length) return null;
  return parsedValues.sort((a, b) => b - a)[0];
}

function detectEstadoCivil(text) {
  if (/\buniao estavel\b|\buni[aã]o est[aá]vel\b|\bmoro junto\b/.test(text)) return "uniao_estavel";
  if (/\bcasad[oa]\b/.test(text)) return "casado_civil";
  if (/\bsolteir[oa]\b/.test(text)) return "solteiro";
  return null;
}

function detectRegime(text) {
  return pickDetectedValue(text, [
    { regex: /\bclt\b|\bcarteira assinada\b|\bregistrad[oa]\b/, value: "clt" },
    { regex: /\bautonom[oa]\b|\baut[oô]nomo\b|\bpor conta\b/, value: "autonomo" },
    { regex: /\bservidor\b/, value: "servidor" },
    { regex: /\baposentad[oa]\b/, value: "aposentado" }
  ]);
}

function detectIr(text) {
  if (/\bnao declaro ir\b|\bnão declaro ir\b|\bsem declarar ir\b|\bnao declaro imposto\b|\bnão declaro imposto\b/.test(text)) {
    return "nao";
  }
  if (/\bdeclaro ir\b|\bdeclaro imposto\b|\bfaço imposto de renda\b|\bfa[oç]o ir\b/.test(text)) {
    return "sim";
  }
  return null;
}

function detectComposicao(text) {
  if (/\bsozinh[oa]\b|\bs[oó] eu\b|\bs[oó] minha renda\b/.test(text)) return { tipo: "sozinho" };
  if (/\besposa\b|\bmarido\b|\bconjuge\b|\bc[oô]njuge\b|\bparceir[oa]\b/.test(text)) {
    return { tipo: "parceiro", label: "parceiro" };
  }
  if (/\bmae\b|\bm[aã]e\b|\bpai\b|\birmao\b|\birm[aã]o\b|\bavo\b|\bav[oó]\b|\btio\b|\btia\b|\bprima?\b|\bprimo\b|\bfamiliar\b/.test(text)) {
    return { tipo: "familiar", label: "familiar" };
  }
  return null;
}

function detectFamiliar(text) {
  return pickDetectedValue(text, [
    { regex: /\bm[aã]e\b/, value: "mae" },
    { regex: /\bpai\b/, value: "pai" },
    { regex: /\birma\b|\birmã\b/, value: "irma" },
    { regex: /\birmao\b|\birmão\b/, value: "irmao" },
    { regex: /\bav[oó]\b/, value: "avo" },
    { regex: /\btio\b/, value: "tio" },
    { regex: /\btia\b/, value: "tia" },
    { regex: /\bprimo\b/, value: "primo" },
    { regex: /\bprima\b/, value: "prima" },
    { regex: /\bfamiliar\b/, value: "familiar_nao_especificado" }
  ]);
}

function detectP3(text) {
  if (/\bseremos tres\b|\bseremos 3\b|\bp3\b|\bterceira pessoa\b|\bmais uma pessoa\b/.test(text)) return "sim";
  const familyCount = (text.match(FAMILY_MEMBER_PATTERN) || []).length;
  if (familyCount >= 2) return "sim";
  return null;
}

function buildSlot(value, confidence, evidence, source = "message_text") {
  return { value, confidence, evidence, source };
}

function clampConfidence(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function sanitizeReplyText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStringArray(values, fallback = []) {
  const normalized = Array.isArray(values) ? values : fallback;
  return [...new Set(normalized.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeConflictList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const slot = String(entry.slot || "").trim();
      const reason = String(entry.reason || "").trim();
      if (!slot || !reason) return null;
      return { slot, reason };
    })
    .filter(Boolean);
}

function normalizeSlotObject(rawSlots, fallbackSlots = {}) {
  const normalized = {};
  if (!rawSlots || typeof rawSlots !== "object" || Array.isArray(rawSlots)) {
    return { ...fallbackSlots };
  }

  for (const [slotName, rawValue] of Object.entries(rawSlots)) {
    const fallback = fallbackSlots[slotName];
    if (rawValue == null) {
      if (fallback) normalized[slotName] = fallback;
      continue;
    }

    if (typeof rawValue === "object" && !Array.isArray(rawValue)) {
      const hasValue = Object.prototype.hasOwnProperty.call(rawValue, "value");
      const slotValue = hasValue ? rawValue.value : fallback?.value;
      if (slotValue == null) continue;
      normalized[slotName] = {
        value: slotValue,
        confidence: clampConfidence(rawValue.confidence, fallback?.confidence ?? 0.72),
        evidence: String(rawValue.evidence || fallback?.evidence || "").trim() || null,
        source: String(rawValue.source || fallback?.source || "openai_cognitive")
      };
      continue;
    }

    normalized[slotName] = {
      value: rawValue,
      confidence: fallback?.confidence ?? 0.72,
      evidence: fallback?.evidence || null,
      source: fallback?.source || "openai_cognitive"
    };
  }

  return {
    ...fallbackSlots,
    ...normalized
  };
}

function detectSlotsFromConversation(request) {
  const combinedText = [request.message_text, ...request.recent_messages.map((entry) => entry.text)]
    .filter(Boolean)
    .join(" | ");
  const normalized = normalizeText(combinedText);
  const slotsDetected = {};
  const consultiveNotes = [];
  const conflicts = [];

  const estadoCivil = detectEstadoCivil(normalized);
  const regimeTrabalho = detectRegime(normalized);
  const renda = detectMoney(combinedText);
  const irDeclarado = detectIr(normalized);
  const composicao = detectComposicao(normalized);
  const familiar = detectFamiliar(normalized);
  const p3 = detectP3(normalized);
  const offtrack = OFFTRACK_HINTS.test(normalized);
  const ambiguous = AMBIGUOUS_HINTS.test(normalized);

  if (estadoCivil) {
    slotsDetected.estado_civil = buildSlot(
      estadoCivil,
      ambiguous ? ESTADO_CIVIL_CONFIDENCE.ambiguous : ESTADO_CIVIL_CONFIDENCE.default,
      request.message_text
    );
  }
  if (regimeTrabalho) {
    slotsDetected.regime_trabalho = buildSlot(regimeTrabalho, 0.87, request.message_text);
  }
  if (Number.isFinite(renda)) {
    slotsDetected.renda = buildSlot(renda, 0.84, request.message_text);
  }
  if (irDeclarado) {
    slotsDetected.ir_declarado = buildSlot(irDeclarado, 0.91, request.message_text);
  }
  if (composicao) {
    slotsDetected.composicao = buildSlot(composicao.tipo, composicao.tipo === "familiar" ? 0.83 : 0.86, request.message_text);
  }
  if (familiar) {
    slotsDetected.familiar = buildSlot(familiar, 0.82, request.message_text);
  }
  if (p3) {
    slotsDetected.p3 = buildSlot(p3, 0.68, request.message_text);
    consultiveNotes.push("Há indício de composição com P3; manter a validação apenas em modo consultivo.");
  }

  if (ambiguous) {
    conflicts.push({
      slot: "ambiguous_answer",
      reason: "A resposta contém termos ambíguos e precisa de confirmação humana."
    });
  }

  if (offtrack) {
    consultiveNotes.push("Cliente trouxe dúvida fora do fluxo; responder consultivamente e retornar ao stage atual.");
  }

  return {
    normalized_text: normalized,
    slots_detected: slotsDetected,
    consultive_notes: consultiveNotes,
    conflicts,
    offtrack,
    ambiguous
  };
}

function resolveRuntimeConfig(options = {}) {
  const processEnv =
    typeof process !== "undefined" && process?.env && typeof process.env === "object" ? process.env : {};
  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : typeof globalThis?.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null;
  const openaiApiKey =
    typeof options.openaiApiKey === "string" && options.openaiApiKey.trim()
      ? options.openaiApiKey.trim()
      : String(processEnv.OPENAI_API_KEY_PROD || "").trim() || null;
  const model =
    typeof options.model === "string" && options.model.trim()
      ? options.model.trim()
      : String(processEnv.COGNITIVE_AI_MODEL || DEFAULT_COGNITIVE_AI_MODEL).trim();

  return {
    fetchImpl,
    openaiApiKey,
    model,
    normativeContext: Array.isArray(options.normativeContext) ? options.normativeContext : null
  };
}

function buildNormativeContext(request, runtimeConfig) {
  const hasRuntimeNormativeContext =
    Array.isArray(runtimeConfig?.normativeContext) && runtimeConfig.normativeContext.length > 0;
  const rawContext = hasRuntimeNormativeContext
    ? runtimeConfig.normativeContext
    : request.normative_context;

  return Array.isArray(rawContext)
    ? rawContext
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const title = String(entry.title || "").trim();
          const content = String(entry.content || "").trim();
          if (!title && !content) return null;
          return {
            title: title || "Normative context",
            content,
            source: String(entry.source || "").trim() || null
          };
        })
        .filter(Boolean)
    : [];
}

function buildOpenAISystemPrompt() {
  return [
    "Você é o Enova Cognitive Engine read-only da fase 3, especialista consultivo em MCMV/CEF da Enova.",
    "Converse em português do Brasil de forma humana, natural, consultiva e objetiva.",
    "Interprete respostas abertas, extraia slots úteis, sugira a próxima melhor pergunta e aponte ambiguidades.",
    "Você NÃO pode aprovar financiamento, NÃO pode alterar o stage oficial, NÃO pode inventar regra fora do contrato ou do contexto normativo recebido.",
    "Você NÃO pode acionar produção, Meta, Supabase oficial ou qualquer side effect.",
    "Responda APENAS JSON válido compatível com este contrato:",
    JSON.stringify({
      reply_text: "string",
      slots_detected: {
        slot_name: {
          value: "unknown",
          confidence: 0.0,
          evidence: "string|null",
          source: "openai_cognitive"
        }
      },
      pending_slots: ["string"],
      conflicts: [{ slot: "string", reason: "string" }],
      suggested_next_slot: "string|null",
      consultive_notes: ["string"],
      should_request_confirmation: false,
      should_advance_stage: false,
      confidence: 0.0
    }),
    "Se faltar sinal suficiente, mantenha slots_detected vazio e use reply_text consultivo.",
    "Sempre preserve should_advance_stage=false."
  ].join(" ");
}

function buildOpenAIUserPrompt(request, analysis, normativeContext) {
  return JSON.stringify({
    task: "enova_cognitive_phase_3_read_only",
    request: {
      version: request.version,
      channel: request.channel,
      conversation_id: request.conversation_id,
      current_stage: request.current_stage,
      message_text: request.message_text,
      history: request.recent_messages,
      known_slots: request.known_slots,
      pending_slots: request.pending_slots
    },
    slot_contract: COGNITIVE_SLOT_CONTRACT,
    slot_dependencies: COGNITIVE_SLOT_DEPENDENCIES,
    normative_context: normativeContext,
    safety_contract: {
      should_advance_stage: false,
      official_write_count: 0,
      would_send_meta: false,
      production_activation: false
    },
    analysis_seed: {
      slots_detected: analysis.slots_detected,
      pending_slots: buildPendingSlots(request, analysis.slots_detected),
      conflicts: analysis.conflicts,
      suggested_next_slot: buildSuggestedNextSlot(buildPendingSlots(request, analysis.slots_detected), analysis.conflicts),
      consultive_notes: analysis.consultive_notes,
      offtrack: analysis.offtrack,
      ambiguous: analysis.ambiguous
    }
  });
}

async function callOpenAIReadOnly(runtimeConfig, prompt) {
  if (!runtimeConfig?.openaiApiKey || !runtimeConfig?.fetchImpl) {
    return { ok: false, reason: "missing_openai_config", parsed: null };
  }

  let response;
  try {
    response = await runtimeConfig.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeConfig.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: runtimeConfig.model || DEFAULT_COGNITIVE_AI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ]
      })
    });
  } catch {
    return { ok: false, reason: "openai_fetch_failed", parsed: null };
  }

  if (!response?.ok) {
    return { ok: false, reason: `openai_http_${response?.status || "error"}`, parsed: null };
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: "openai_invalid_json", parsed: null };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, reason: "openai_empty_content", parsed: null };
  }

  try {
    return {
      ok: true,
      reason: null,
      parsed: JSON.parse(content)
    };
  } catch {
    return { ok: false, reason: "openai_parse_failed", parsed: null };
  }
}

function detectKnownSlotConflicts(knownSlots, detectedSlots) {
  const conflicts = [];
  for (const [slot, detected] of Object.entries(detectedSlots)) {
    const existing = knownSlots?.[slot];
    if (!existing) continue;
    const knownValue = typeof existing === "object" && existing !== null && "value" in existing ? existing.value : existing;
    if (knownValue == null) continue;
    if (String(knownValue) !== String(detected.value)) {
      conflicts.push({
        slot,
        reason: `Valor detectado (${detected.value}) diverge do valor já conhecido (${knownValue}).`
      });
    }
  }
  return conflicts;
}

function buildPendingSlots(request, detectedSlots) {
  const seed = request.pending_slots.length
    ? request.pending_slots
    : STAGE_DEFAULT_PENDING_SLOTS[request.current_stage] || [];
  return [...new Set(seed.filter((slot) => !detectedSlots[slot]))];
}

function buildSuggestedNextSlot(pendingSlots, conflicts) {
  if (conflicts.some((conflict) => conflict.slot === "ambiguous_answer")) return "confirmacao_humana";
  return pendingSlots[0] || null;
}

function buildReplyText({ request, detectedSlots, pendingSlots, suggestedNextSlot, conflicts, offtrack }) {
  if (offtrack) {
    const nextSlotLabel = suggestedNextSlot || request.current_stage;
    return `Posso te orientar nisso de forma consultiva, mas neste teste read-only eu não avanço o fluxo real. Para seguir com segurança, me confirma primeiro o ponto de ${nextSlotLabel}.`;
  }

  if (conflicts.length) {
    return "Entendi sua resposta, mas ela ficou ambígua para o motor cognitivo de teste. Vou marcar a necessidade de confirmação antes de sugerir qualquer próximo passo.";
  }

  const detectedKeys = Object.keys(detectedSlots);
  if (!detectedKeys.length) {
    return "Recebi sua mensagem no runner read-only, mas ainda não identifiquei slot suficiente para sugerir avanço. Posso seguir de forma consultiva sem tocar no fluxo real.";
  }

  if (detectedKeys.length > 2) {
    return "Perfeito — consegui detectar múltiplos sinais na mesma frase em modo read-only. Vou devolver tudo estruturado para teste, sem alterar o funil real.";
  }

  return "Perfeito — capturei o sinal principal da sua mensagem em modo read-only e devolvi a leitura estruturada do cognitivo para validação.";
}

function buildHeuristicResponse(request, analysis, conflictList) {
  const pendingSlots = buildPendingSlots(request, analysis.slots_detected);
  const suggestedNextSlot = buildSuggestedNextSlot(pendingSlots, conflictList);
  const slotsDetectedCount = Object.keys(analysis.slots_detected).length;
  const shouldRequestConfirmation =
    conflictList.length > 0 ||
    slotsDetectedCount > 3 ||
    Object.keys(analysis.slots_detected).some((slot) => CONFIRMATION_SLOT_KEYS.has(slot));

  const consultiveNotes = [...analysis.consultive_notes];
  if (slotsDetectedCount > 2) {
    consultiveNotes.push("A resposta concentrou múltiplos slots; revisar a ordem canônica apenas fora do fluxo real.");
  }
  if (suggestedNextSlot) {
    consultiveNotes.push(`Próximo slot sugerido em modo read-only: ${suggestedNextSlot}.`);
  }
  consultiveNotes.push("Runner isolado: sem write oficial, sem Meta real e sem alteração de stage.");

  const confidenceBase = slotsDetectedCount
    ? CONFIDENCE_RULES.detectedBase + Math.min(slotsDetectedCount, 4) * CONFIDENCE_RULES.detectedIncrement
    : analysis.offtrack ? CONFIDENCE_RULES.offtrackBase : CONFIDENCE_RULES.noSlotBase;
  const confidencePenalty =
    conflictList.length * CONFIDENCE_RULES.conflictPenalty +
    (analysis.offtrack ? CONFIDENCE_RULES.offtrackPenalty : 0);
  const confidence = Math.max(0.05, Math.min(0.99, Number((confidenceBase - confidencePenalty).toFixed(2))));

  return {
    reply_text: buildReplyText({
      request,
      detectedSlots: analysis.slots_detected,
      pendingSlots,
      suggestedNextSlot,
      conflicts: conflictList,
      offtrack: analysis.offtrack
    }),
    slots_detected: analysis.slots_detected,
    pending_slots: pendingSlots,
    conflicts: conflictList,
    suggested_next_slot: suggestedNextSlot,
    consultive_notes: consultiveNotes,
    should_request_confirmation: shouldRequestConfirmation,
    should_advance_stage: false,
    confidence
  };
}

function normalizeModelResponse({
  request,
  analysis,
  heuristicResponse,
  modelResponse,
  llmUsed
}) {
  if (!modelResponse || typeof modelResponse !== "object") {
    return heuristicResponse;
  }

  const slotsDetected = normalizeSlotObject(modelResponse.slots_detected, heuristicResponse.slots_detected);
  const conflicts = [
    ...heuristicResponse.conflicts,
    ...normalizeConflictList(modelResponse.conflicts)
  ].filter(
    (entry, index, array) =>
      array.findIndex((candidate) => candidate.slot === entry.slot && candidate.reason === entry.reason) === index
  );
  const pendingSlots = uniqueStringArray(
    modelResponse.pending_slots,
    buildPendingSlots(request, slotsDetected)
  );
  const suggestedNextSlot =
    typeof modelResponse.suggested_next_slot === "string" && modelResponse.suggested_next_slot.trim()
      ? modelResponse.suggested_next_slot.trim()
      : buildSuggestedNextSlot(pendingSlots, conflicts);
  const consultiveNotes = uniqueStringArray([
    ...heuristicResponse.consultive_notes,
    ...(Array.isArray(modelResponse.consultive_notes) ? modelResponse.consultive_notes : []),
    llmUsed ? `Modelo cognitivo read-only utilizado: ${request.current_stage}.` : null
  ]);
  const replyText =
    sanitizeReplyText(modelResponse.reply_text) ||
    sanitizeReplyText(modelResponse.human_response) ||
    heuristicResponse.reply_text;
  const shouldRequestConfirmation =
    typeof modelResponse.should_request_confirmation === "boolean"
      ? modelResponse.should_request_confirmation || conflicts.length > 0
      : heuristicResponse.should_request_confirmation || conflicts.length > 0;

  return {
    reply_text: replyText,
    slots_detected: slotsDetected,
    pending_slots: pendingSlots,
    conflicts,
    suggested_next_slot: suggestedNextSlot,
    consultive_notes: consultiveNotes,
    should_request_confirmation: shouldRequestConfirmation,
    should_advance_stage: false,
    confidence: clampConfidence(
      modelResponse.confidence,
      heuristicResponse.confidence
    )
  };
}

export function validateReadOnlyCognitiveResponse(response) {
  const errors = [];
  const value = response && typeof response === "object" ? response : null;

  if (!value) errors.push("response must be an object");
  for (const field of REQUIRED_RESPONSE_FIELDS) {
    if (!value || !(field in value)) errors.push(`missing field: ${field}`);
  }

  if (value && typeof value.reply_text !== "string") errors.push("reply_text must be a string");
  if (value && (!value.slots_detected || typeof value.slots_detected !== "object" || Array.isArray(value.slots_detected))) {
    errors.push("slots_detected must be an object");
  }
  if (value && !Array.isArray(value.pending_slots)) errors.push("pending_slots must be an array");
  if (value && !Array.isArray(value.conflicts)) errors.push("conflicts must be an array");
  if (value && !(typeof value.suggested_next_slot === "string" || value.suggested_next_slot === null)) {
    errors.push("suggested_next_slot must be string|null");
  }
  if (value && !Array.isArray(value.consultive_notes)) errors.push("consultive_notes must be an array");
  if (value && typeof value.should_request_confirmation !== "boolean") {
    errors.push("should_request_confirmation must be boolean");
  }
  if (value && value.should_advance_stage !== false) errors.push("should_advance_stage must be false");
  if (value && (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
    errors.push("confidence must be a number between 0 and 1");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function listReadOnlyCognitiveFixtures() {
  return READ_ONLY_COGNITIVE_FIXTURES.map((fixture) => ({
    id: fixture.id,
    title: fixture.title,
    current_stage: fixture.input.current_stage
  }));
}

export function getReadOnlyCognitiveFixtureById(fixtureId) {
  if (!fixtureId) return null;
  return READ_ONLY_COGNITIVE_FIXTURES.find((fixture) => fixture.id === fixtureId) || null;
}

export async function runReadOnlyCognitiveEngine(rawInput = {}, options = {}) {
  const request = normalizeRequest(rawInput);
  const analysis = detectSlotsFromConversation(request);
  const knownSlotConflicts = detectKnownSlotConflicts(request.known_slots, analysis.slots_detected);
  const conflicts = [...analysis.conflicts, ...knownSlotConflicts];
  const heuristicResponse = buildHeuristicResponse(request, analysis, conflicts);
  const runtimeConfig = resolveRuntimeConfig(options);
  const normativeContext = buildNormativeContext(request, runtimeConfig);
  const prompt = {
    system: buildOpenAISystemPrompt(),
    user: buildOpenAIUserPrompt(request, analysis, normativeContext)
  };
  const llmResult = await callOpenAIReadOnly(runtimeConfig, prompt);
  const llmAttempted = llmResult.ok || llmResult.reason !== "missing_openai_config";
  const llmError = llmAttempted && !llmResult.ok ? llmResult.reason : null;
  const fallbackUsed = !llmResult.ok;
  const response = normalizeModelResponse({
    request,
    analysis,
    heuristicResponse,
    modelResponse: llmResult.parsed,
    llmUsed: llmResult.ok
  });

  const validation = validateReadOnlyCognitiveResponse(response);

  return {
    ok: validation.valid,
    mode: "read_only_test",
    request,
    response,
    validation,
    engine: {
      llm_attempted: llmAttempted,
      llm_requested: Boolean(runtimeConfig.openaiApiKey),
      llm_used: llmResult.ok,
      llm_error: llmError,
      fallback_used: fallbackUsed,
      provider: llmResult.ok ? "openai" : "heuristic_fallback",
      model: runtimeConfig.openaiApiKey ? runtimeConfig.model : null,
      fallback_reason: llmResult.ok ? null : llmResult.reason
    }
  };
}

function parseCliArgs(argv) {
  const parsed = {};
  for (const rawArg of argv) {
    if (!rawArg.startsWith("--")) continue;
    const [key, ...rest] = rawArg.slice(2).split("=");
    parsed[key] = rest.length ? rest.join("=") : true;
  }
  return parsed;
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args["list-fixtures"]) {
    console.log(JSON.stringify({ ok: true, fixtures: listReadOnlyCognitiveFixtures() }, null, 2));
    return;
  }

  if (typeof args.fixture === "string") {
    const fixture = getReadOnlyCognitiveFixtureById(args.fixture);
    if (!fixture) {
      console.error(JSON.stringify({ ok: false, error: "fixture_not_found", fixture_id: args.fixture }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(await runReadOnlyCognitiveEngine(fixture.input), null, 2));
    return;
  }

  if (typeof args.json === "string") {
    console.log(JSON.stringify(await runReadOnlyCognitiveEngine(JSON.parse(args.json)), null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: false,
        error: "usage",
        details: "Use --list-fixtures, --fixture=<id> ou --json='<payload>'."
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  /run-cognitive\.js$/.test(process.argv[1])
) {
  await runCli();
}
