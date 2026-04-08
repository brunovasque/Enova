/**
 * cognitive-contract.js — Contrato canônico worker ↔ cognitivo
 *
 * Define o shape de entrada (worker → cognitivo) e saída (cognitivo → worker).
 * Este é o contrato único e estável. Nenhum outro formato paralelo deve existir.
 *
 * ─── Responsabilidades ───────────────────────────────────────────────
 * Worker é dono de: stage, gate, parser, nextStage, persistência, envio final
 * Cognitivo é dono de: reply_text, signal, confidence, needs_confirmation,
 *                       slots_detected, pending_slots, conflicts, reason_codes
 *
 * ─── Regra central ───────────────────────────────────────────────────
 * O worker valida SOMENTE o sinal (signal). Nunca reescreve reply_text.
 * No caminho cognitivo normal: surface_sent_to_customer === reply_text
 */

// ── Canonical INPUT shape (worker → cognitivo) ─────────────────────────────

/**
 * buildCognitiveInput — Constrói o payload canônico de entrada para o cognitivo.
 *
 * @param {object} params
 * @param {string} params.current_stage — Stage atual do funil
 * @param {string} params.message_text — Texto da mensagem do cliente
 * @param {object} params.known_slots — Slots já coletados { slot_name: { value } }
 * @param {string} params.goal_of_current_stage — Objetivo do stage atual
 * @param {string[]} params.forbidden_topics_for_stage — Tópicos proibidos para este stage
 * @param {string[]} params.allowed_signals_for_stage — Sinais permitidos para este stage
 * @param {object[]} [params.normative_context] — Contexto normativo útil do MCMV
 * @param {object[]} [params.recent_messages] — Memória útil estritamente necessária
 * @returns {CognitiveInput}
 */
export function buildCognitiveInput({
  current_stage,
  message_text,
  known_slots = {},
  goal_of_current_stage = "",
  forbidden_topics_for_stage = [],
  allowed_signals_for_stage = [],
  normative_context = [],
  recent_messages = []
} = {}) {
  return Object.freeze({
    current_stage: String(current_stage || "inicio"),
    message_text: String(message_text || ""),
    known_slots: known_slots && typeof known_slots === "object" ? { ...known_slots } : {},
    goal_of_current_stage: String(goal_of_current_stage || ""),
    forbidden_topics_for_stage: Array.isArray(forbidden_topics_for_stage) ? [...forbidden_topics_for_stage] : [],
    allowed_signals_for_stage: Array.isArray(allowed_signals_for_stage) ? [...allowed_signals_for_stage] : [],
    normative_context: Array.isArray(normative_context) ? [...normative_context] : [],
    recent_messages: Array.isArray(recent_messages) ? [...recent_messages] : []
  });
}

// ── Canonical OUTPUT shape (cognitivo → worker) ────────────────────────────

/**
 * buildCognitiveOutput — Constrói o payload canônico de saída do cognitivo.
 *
 * @param {object} params
 * @param {string} params.reply_text — Fala final para o cliente (soberana)
 * @param {string|null} params.signal — Sinal estruturado da rodada (e.g. "estado_civil:casado")
 * @param {number} params.confidence — Confiança [0,1]
 * @param {boolean} params.needs_confirmation — Precisa de confirmação do cliente?
 * @param {object} params.slots_detected — Slots detectados { name: { value, raw } }
 * @param {string[]} params.pending_slots — Slots pendentes
 * @param {object[]} params.conflicts — Conflitos detectados
 * @param {string[]} params.reason_codes — Códigos de razão para decisão
 * @param {string} params.speech_origin — Origem da fala: "llm_real" | "heuristic_guidance" | "fallback_mechanical"
 * @returns {CognitiveOutput}
 */
export function buildCognitiveOutput({
  reply_text = "",
  signal = null,
  confidence = 0,
  needs_confirmation = false,
  slots_detected = {},
  pending_slots = [],
  conflicts = [],
  reason_codes = [],
  speech_origin = "fallback_mechanical"
} = {}) {
  return Object.freeze({
    reply_text: String(reply_text || ""),
    signal: signal != null ? String(signal) : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    needs_confirmation: Boolean(needs_confirmation),
    slots_detected: slots_detected && typeof slots_detected === "object" ? { ...slots_detected } : {},
    pending_slots: Array.isArray(pending_slots) ? [...pending_slots] : [],
    conflicts: Array.isArray(conflicts) ? [...conflicts] : [],
    reason_codes: Array.isArray(reason_codes) ? [...reason_codes] : [],
    speech_origin: String(speech_origin || "fallback_mechanical")
  });
}

// ── Signal validation (worker-side) ────────────────────────────────────────

/**
 * ALLOWED_SIGNALS_BY_STAGE — Mapa de sinais permitidos por stage.
 * O worker usa isso para validar se o signal do cognitivo é compatível.
 * Ele NÃO julga reply_text; apenas valida o sinal.
 */
const ALLOWED_SIGNAL_PREFIXES = Object.freeze({
  estado_civil:       ["estado_civil:"],
  confirmar_casamento: ["estado_civil:"],
  financiamento_conjunto: ["composicao:"],
  quem_pode_somar:    ["composicao:"],
  interpretar_composicao: ["composicao:"],
  somar_renda_solteiro: ["composicao:"],
  somar_renda_familiar: ["composicao:"],
  regime_trabalho:    ["regime:"],
  autonomo_ir_pergunta: ["ir:"],
  renda:              ["renda:"],
  ir_declarado:       ["ir:"]
});

/**
 * validateSignal — Valida se o signal do cognitivo é compatível com o stage.
 *
 * @param {string} stage — Stage atual do funil
 * @param {string|null} signal — Signal retornado pelo cognitivo
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateSignal(stage, signal) {
  if (!signal) {
    return { valid: true, reason: "no_signal" };
  }
  const prefixes = ALLOWED_SIGNAL_PREFIXES[stage];
  if (!prefixes) {
    // Stages sem mapa de sinais: aceitar qualquer sinal (operacionais, gates, etc.)
    return { valid: true, reason: "no_prefix_restriction" };
  }
  const signalStr = String(signal);
  const isCompatible = prefixes.some(prefix => signalStr.startsWith(prefix));
  return {
    valid: isCompatible,
    reason: isCompatible ? "signal_compatible" : "signal_incompatible"
  };
}

// ── Telemetry shape for separation of responsibilities ──────────────────────

/**
 * buildSeparationTelemetry — Constrói telemetria que prova a separação de responsabilidades.
 *
 * @param {object} params
 * @returns {object} Telemetria canônica
 */
export function buildSeparationTelemetry({
  stage_before = null,
  stage_after = null,
  reply_text_from_cognitive = null,
  signal_from_cognitive = null,
  signal_validated_by_worker = false,
  signal_validation_result = null,
  surface_sent_to_customer = null,
  needs_confirmation = false,
  confidence = null,
  advance_allowed = false,
  advance_block_reason = null
} = {}) {
  const surfaceEqualReplyText = (
    reply_text_from_cognitive != null &&
    surface_sent_to_customer != null &&
    surface_sent_to_customer === reply_text_from_cognitive
  );
  return {
    stage_before,
    stage_after,
    reply_text_from_cognitive: reply_text_from_cognitive != null ? String(reply_text_from_cognitive).slice(0, 500) : null,
    signal_from_cognitive,
    signal_validated_by_worker,
    signal_validation_result,
    surface_sent_to_customer: surface_sent_to_customer != null ? String(surface_sent_to_customer).slice(0, 500) : null,
    surface_equal_reply_text: surfaceEqualReplyText,
    worker_rewrote_reply: !surfaceEqualReplyText && reply_text_from_cognitive != null,
    needs_confirmation,
    confidence,
    advance_allowed,
    advance_block_reason
  };
}

// ── Stage goals (used by buildCognitiveInput) ──────────────────────────────

const STAGE_GOALS = Object.freeze({
  inicio: "Acolher o cliente e entender o motivo do contato",
  inicio_decisao: "Confirmar se o cliente quer seguir com o Minha Casa Minha Vida",
  inicio_programa: "Confirmar interesse e apresentar o programa",
  inicio_nome: "Coletar o nome do cliente",
  inicio_nacionalidade: "Verificar nacionalidade do cliente",
  inicio_rnm: "Coletar RNM do cliente estrangeiro",
  inicio_rnm_validade: "Verificar validade do RNM",
  estado_civil: "Coletar o estado civil do cliente",
  confirmar_casamento: "Confirmar tipo de casamento",
  financiamento_conjunto: "Definir se financiamento será conjunto",
  quem_pode_somar: "Identificar quem pode somar renda",
  interpretar_composicao: "Interpretar tipo de composição de renda",
  somar_renda_solteiro: "Definir composição de renda (solteiro)",
  somar_renda_familiar: "Definir composição de renda (casado/familiar)",
  regime_trabalho: "Coletar regime de trabalho",
  autonomo_ir_pergunta: "Verificar se autônomo declara IR",
  renda: "Coletar a renda mensal do cliente",
  ir_declarado: "Confirmar se declara IR",
  envio_docs: "Orientar envio de documentos",
  agendamento_visita: "Agendar visita ao imóvel",
  visita_confirmada: "Confirmar detalhes da visita",
  finalizacao_processo: "Finalizar processo",
  aguardando_retorno_correspondente: "Aguardar retorno do correspondente"
});

// ── Bucket-aware goals for inicio_programa ─────────────────────────────────
// When the topo bucket is known, the goal is more specific than the generic
// inicio_programa goal. This prevents how_it_works from collapsing with greeting.
const INICIO_PROGRAMA_BUCKET_GOALS = Object.freeze({
  greeting: "Saudação acolhedora: apresente-se como Enova, assistente do Minha Casa Minha Vida. Pergunte se o cliente já sabe como funciona ou quer explicação.",
  identity: "O cliente perguntou quem você é. Explique que você é a Enova, assistente virtual do Minha Casa Minha Vida. NÃO repita saudação de boas-vindas.",
  how_it_works: "O cliente pediu explicação do programa. EXPLIQUE o Minha Casa Minha Vida: programa do governo que oferece subsídio na entrada e parcela reduzida conforme renda familiar. Mencione benefícios reais (subsídio, faixas, parcela). NÃO pergunte 'já sabe como funciona?' — ele já disse que quer explicação. Ao final, pergunte se quer seguir com a análise.",
  program_choice: "Pergunte ao cliente se já sabe como funciona o Minha Casa Minha Vida ou se quer explicação.",
  unknown_topo: "Confirmar interesse e apresentar o programa Minha Casa Minha Vida"
});

/**
 * getStageGoal — Retorna o objetivo do stage.
 * @param {string} stage — Stage atual
 * @param {string} [bucket] — Bucket do topo (opcional). Se fornecido para inicio_programa, retorna goal específico do bucket.
 */
export function getStageGoal(stage, bucket) {
  if (stage === "inicio_programa" && bucket && INICIO_PROGRAMA_BUCKET_GOALS[bucket]) {
    return INICIO_PROGRAMA_BUCKET_GOALS[bucket];
  }
  return STAGE_GOALS[stage] || "Conduzir a conversa com o cliente";
}

/**
 * getAllowedSignalsForStage — Retorna prefixos de sinais permitidos para o stage.
 */
export function getAllowedSignalsForStage(stage) {
  return ALLOWED_SIGNAL_PREFIXES[stage] || [];
}

// ── Adapter: convert legacy adaptCognitiveV2Output → canonical output ──────

/**
 * adaptLegacyToCanonical — Converte saída legada do adapter para o formato canônico.
 * Usado durante a transição. Não cria formato novo — apenas mapeia.
 *
 * @param {object} legacyOutput — Saída de adaptCognitiveV2Output()
 * @returns {CognitiveOutput}
 */
export function adaptLegacyToCanonical(legacyOutput) {
  if (!legacyOutput || typeof legacyOutput !== "object") {
    return buildCognitiveOutput();
  }
  return buildCognitiveOutput({
    reply_text: legacyOutput.reply_text || "",
    signal: legacyOutput.safe_stage_signal || null,
    confidence: legacyOutput.confidence || 0,
    needs_confirmation: legacyOutput.still_needs_original_answer === true,
    slots_detected: legacyOutput.entities || {},
    pending_slots: [],
    conflicts: [],
    reason_codes: [legacyOutput.reason || "unknown"].filter(Boolean),
    speech_origin: legacyOutput.speech_origin || "fallback_mechanical"
  });
}
