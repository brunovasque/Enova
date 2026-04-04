/**
 * final-speech-contract.js — Etapa 6: Contrato Global de Fala Final
 *
 * Padroniza COMO a Enova fala com o cliente:
 * - acolhimento sem bajulação
 * - clareza sem prolixidade
 * - persuasão leve sem promessa
 * - condução natural sem interrogatório
 * - respeito absoluto às regras de negócio
 *
 * Este módulo é o pós-processador final da camada cognitiva.
 * Ele NÃO altera o mecânico, NÃO avança stage, NÃO toca em gates.
 */

// ── Regras de negócio proibidas (promessas indevidas) ──────────────────────
const FORBIDDEN_PROMISE_PATTERNS = Object.freeze([
  // aprovação garantida
  /\b(?:garanti|garanto|garantido|garantia\s+de|com\s+certeza)\b[^.?!]{0,60}\b(?:aprovad[oa]|aprovação)\b/gi,
  /\bvoc[eê]\s+(?:vai\s+ser|será|está)\s+aprovad[oa]\b/gi,
  /\bsua\s+aprovação\s+(?:é|está)\s+garantida\b/gi,
  /\bpode\s+ficar\s+tranquil[oa][^.?!]{0,30}\baprovad[oa]\b/gi,

  // valor de financiamento sem análise
  /\bvoc[eê]\s+(?:vai\s+conseguir|consegue)\s+R?\$\s?\d/gi,
  /\bseu\s+financiamento\s+(?:será|vai\s+ser)\s+de\s+R?\$/gi,

  // subsídio garantido
  /\bseu\s+subsídio\s+(?:é|será|vai\s+ser)\s+de\s+R?\$?\s?\d/gi,
  /\bvoc[eê]\s+tem\s+direito\s+a\s+R?\$?\s?\d/gi,
  /\b(?:garanto|garanti|garantido)[^.?!]{0,40}\bsubsídio\b/gi,

  // FGTS sem validação
  /\bvoc[eê]\s+(?:vai|pode|consegue)\s+(?:usar|sacar|utilizar)\s+(?:o\s+|seu\s+)?FGTS\b/gi,
  /\b(?:vai\s+dar|dá)\s+(?:pra|para)\s+usar[^.?!]{0,20}\bFGTS\b/gi,
  /\b(?:garanto|garantido)[^.?!]{0,40}\bFGTS\b/gi,

  // prazo fechado de banco
  /\bo\s+banco\s+(?:vai|deve)\s+(?:aprovar|liberar)\s+em\s+\d+\s*dias?\b/gi,
  /\bprazo\s+de\s+\d+\s*dias?\s*(?:úteis|corridos)?\s*(?:para|pro|até)\s*(?:aprovação|liberação|análise)\b/gi,
  /\bem\s+\d+\s*dias?\s+(?:úteis\s+)?(?:fica|sai|está)\s+(?:pronto|aprovado|liberado)\b/gi
]);

// ── Substituição "casa" → "imóvel" ─────────────────────────────────────────
// Captura "casa" isolada, mas não em "casado/casada/casamento/casal"
const CASA_PATTERN = /\bcasa\b(?!d[oa]s?|ment|l\b|is\b)/gi;

// ── Controle de tamanho ────────────────────────────────────────────────────
// 400 para coleta/conversação WhatsApp; 600 para stages operacionais (docs/visita/correspondente)
// onde listas de documentos legitimamente precisam de mais espaço.
const MAX_REPLY_LENGTH = 400;
const MAX_REPLY_LENGTH_OPERACIONAL = 600;

// Stages operacionais que legitimamente precisam de mais espaço (listas de docs, detalhes de visita)
const OPERACIONAL_LONG_STAGES = new Set([
  "envio_docs", "agendamento_visita", "visita_confirmada",
  "finalizacao_processo", "aguardando_retorno_correspondente"
]);

// ── Padrões de contexto emocional (no texto do cliente) ────────────────────
const EMOTIONAL_PATTERNS = Object.freeze([
  /\b(?:medo|receio|inseguran[cç]a|insegur[oa]|vergonha|preocupad[oa]|nervos[oa]|ansiedade|ansios[oa])\b/i,
  /\b(?:n[aã]o\s+sei|n[aã]o\s+entend[io]|confus[oa]|perdid[oa]|desesper)\b/i,
  /\b(?:dif[ií]cil|complicad[oa]|n[aã]o\s+consigo|n[aã]o\s+tenho\s+como)\b/i,
  /\b(?:tenho\s+medo|meu\s+nome\s+(?:est[aá]|tá)\s+suj[oa]|SPC|Serasa|nome\s+suj[oa])\b/i,
  /\b(?:renda\s+(?:é\s+)?baixa|ganho\s+pouco|salário\s+(?:é\s+)?pouco)\b/i
]);

// ── Prefixos de acolhimento (usados quando há contexto emocional) ──────────
const EMPATHY_PREFIXES = Object.freeze([
  "Entendo sua preocupação.",
  "Fica tranquilo, vamos analisar isso com calma.",
  "Entendo que essa parte pode gerar insegurança.",
  "É normal ter essa dúvida, e eu te explico.",
  "Compreendo sua situação."
]);

// ── Substituições seguras para promessas detectadas ────────────────────────
const SAFE_REPLACEMENT_MAP = Object.freeze({
  aprovacao: "isso depende da análise do seu perfil",
  financiamento: "o valor depende da análise de crédito",
  subsidio: "o subsídio depende do seu perfil e das regras do programa",
  fgts: "o uso do FGTS depende de validação junto à Caixa",
  prazo: "o prazo depende do andamento da análise"
});

// ── Stage Discipline: future-stage collection guard (ONE-STAGE-ONLY) ────────
// Detects and strips questions/collection prompts about stages that come AFTER
// the current stage in the canonical funnel order. This is a safety net for
// LLM-generated replies that may leak downstream topics into the current turn.
//
// The guard uses a stage-group ordering: each group defines forbidden downstream
// collection patterns. A reply in stage X must not contain collection questions
// about any stage group that follows X in the funnel.
const COLLECTION_PATTERNS = Object.freeze({
  estado_civil: /\b(?:estado civil|solteiro|casad[oa]|divorci|separad[oa]|vi[uú]v[oa]|uni[aã]o est[aá]vel)\b[^?]*?\?/gi,
  regime_trabalho: /\b(?:regime de trabalho|CLT|aut[oô]nomo|servidor|aposentad[oa])\b[^?]*?\?/gi,
  renda: /\b(?:renda mensal|quanto (?:voc[eê] )?ganh|sal[aá]rio mensal|valor d[ae] renda)\b[^?]*?\?/gi,
  composicao: /\b(?:somar renda|sozinho ou com|vai (?:seguir|compor) (?:sozinho|com))\b[^?]*?\?/gi,
  ctps: /\b(?:CTPS|carteira de trabalho|36 meses)\b[^?]*?\?/gi,
  restricao: /\b(?:restri[cç][aã]o no (?:seu )?CPF|nome sujo|SPC|Serasa)\b[^?]*?\?/gi,
});

// Maps each stage group to the collection patterns that are FORBIDDEN in replies
// for that group. Stages earlier in the funnel forbid more downstream patterns.
const STAGE_FORBIDDEN_PATTERNS = Object.freeze({
  // Topo stages: cannot ask about anything downstream
  topo: ["estado_civil", "composicao", "regime_trabalho", "renda", "ctps", "restricao"],
  // Bloco 3 (estado_civil group): cannot ask renda/trabalho/gates
  bloco_3: ["regime_trabalho", "renda", "ctps", "restricao"],
  // Composição: cannot ask renda/gates (regime OK if asking partner)
  composicao: ["renda", "ctps", "restricao"],
  // Renda/trabalho: cannot ask gates
  renda_trabalho: ["ctps", "restricao"],
});

const STAGE_TO_GROUP = Object.freeze({
  inicio: "topo", inicio_decisao: "topo", inicio_programa: "topo",
  inicio_nome: "topo", inicio_nacionalidade: "topo",
  inicio_rnm: "topo", inicio_rnm_validade: "topo",
  estado_civil: "bloco_3", confirmar_casamento: "bloco_3", financiamento_conjunto: "bloco_3",
  somar_renda_solteiro: "composicao", somar_renda_familiar: "composicao",
  quem_pode_somar: "composicao", interpretar_composicao: "composicao",
  regime_trabalho: "renda_trabalho", autonomo_ir_pergunta: "renda_trabalho", renda: "renda_trabalho",
});

function stripFutureStageCollection(reply, currentStage) {
  const stage = String(currentStage || "").toLowerCase().trim();
  if (!stage || !reply) return reply;
  const group = STAGE_TO_GROUP[stage];
  if (!group) return reply; // operational/gate/etc stages — no restriction needed
  const forbidden = STAGE_FORBIDDEN_PATTERNS[group];
  if (!forbidden || !forbidden.length) return reply;

  let result = reply;
  for (const patternKey of forbidden) {
    const regex = COLLECTION_PATTERNS[patternKey];
    if (!regex) continue;
    // Reset lastIndex before each use (regex has 'g' flag)
    regex.lastIndex = 0;
    result = result.replace(regex, "").trim();
  }
  // Clean up double spaces and orphan punctuation from stripping in one pass
  result = result.replace(/\s{2,}|\s+(?=[,.!?;:])/g, (m) => /\s+(?=[,.!?;:])/.test(m) ? "" : " ").trim();
  return result;
}

// ── Helpers internos ───────────────────────────────────────────────────────

function detectEmotionalContext(messageText) {
  if (!messageText || typeof messageText !== "string") return false;
  return EMOTIONAL_PATTERNS.some((p) => p.test(messageText));
}

function pickEmpathyPrefix(index) {
  return EMPATHY_PREFIXES[Math.abs(index || 0) % EMPATHY_PREFIXES.length];
}

function classifyForbiddenPromise(match) {
  const lower = match.toLowerCase();
  if (/aprovad|aprovação/.test(lower)) return "aprovacao";
  if (/financiamento/.test(lower)) return "financiamento";
  if (/subsídio|subsidio/.test(lower)) return "subsidio";
  if (/fgts/.test(lower)) return "fgts";
  if (/prazo|dias?/.test(lower)) return "prazo";
  return "aprovacao";
}

function replaceForbiddenPromises(text) {
  let result = text;
  for (const pattern of FORBIDDEN_PROMISE_PATTERNS) {
    // Create fresh RegExp to avoid lastIndex mutation on shared frozen patterns
    const fresh = new RegExp(pattern.source, pattern.flags);
    result = result.replace(fresh, (match) => {
      const category = classifyForbiddenPromise(match);
      return SAFE_REPLACEMENT_MAP[category] || SAFE_REPLACEMENT_MAP.aprovacao;
    });
  }
  return result;
}

function replaceCasa(text) {
  return text.replace(CASA_PATTERN, "imóvel");
}

function controlLength(text, maxLen) {
  const limit = maxLen || MAX_REPLY_LENGTH;
  if (text.length <= limit) return text;
  const truncated = text.substring(0, limit);
  // Try to cut at the last sentence boundary
  const lastPeriod = truncated.lastIndexOf(". ");
  const lastQuestion = truncated.lastIndexOf("? ");
  const lastExcl = truncated.lastIndexOf("! ");
  const cutPoint = Math.max(lastPeriod, lastQuestion, lastExcl);
  if (cutPoint > limit * 0.4) {
    return truncated.substring(0, cutPoint + 1).trim();
  }
  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > limit * 0.6) {
    return truncated.substring(0, lastSpace).trim() + "…";
  }
  return truncated.trim() + "…";
}

function addEmpathyIfNeeded(reply, context) {
  if (!context.hasEmotionalContext) return reply;
  // Don't double-prefix if already empathetic
  const startsEmpathetic = /^(?:entendo|compreendo|fica tranquil|é normal|eu te explico)/i.test(reply);
  if (startsEmpathetic) return reply;
  const prefix = pickEmpathyPrefix(context.empathySeed || 0);
  return `${prefix} ${reply}`;
}

function normalizeWhitespace(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

// ── Função principal: applyFinalSpeechContract ─────────────────────────────

/**
 * Aplica o contrato global de fala final sobre a resposta cognitiva.
 *
 * @param {string} reply - Texto da resposta cognitiva
 * @param {object} context - Contexto da conversa
 * @param {string} [context.currentStage] - Stage atual do funil
 * @param {string} [context.messageText] - Texto da mensagem do cliente
 * @param {number} [context.empathySeed] - Seed para variação de prefixo empático
 * @returns {string} Resposta ajustada pelo contrato
 */
export function applyFinalSpeechContract(reply, context = {}) {
  if (!reply || typeof reply !== "string") return reply || "";

  const messageText = context.messageText || "";
  const hasEmotionalContext = detectEmotionalContext(messageText);

  let result = reply;

  // 1. Substituir "casa" por "imóvel"
  result = replaceCasa(result);

  // 2. Bloquear/ajustar promessas proibidas
  result = replaceForbiddenPromises(result);

  // 2.5 Stage discipline: strip future-stage collection questions (ONE-STAGE-ONLY)
  result = stripFutureStageCollection(result, context.currentStage);

  // 3. Adicionar acolhimento quando contexto emocional detectado
  result = addEmpathyIfNeeded(result, {
    hasEmotionalContext,
    empathySeed: context.empathySeed || (messageText.length % EMPATHY_PREFIXES.length)
  });

  // 4. Controlar tamanho (stage-aware: operacional usa limite maior)
  const currentStage = String(context.currentStage || "").toLowerCase().trim();
  const maxLen = OPERACIONAL_LONG_STAGES.has(currentStage) ? MAX_REPLY_LENGTH_OPERACIONAL : MAX_REPLY_LENGTH;
  result = controlLength(result, maxLen);

  // 5. Normalizar espaços
  result = normalizeWhitespace(result);

  return result;
}

// ── Funções de verificação (exportadas para testes) ────────────────────────

/**
 * Verifica se o texto contém promessa proibida.
 * @param {string} text
 * @returns {boolean}
 */
export function hasForbiddenPromise(text) {
  if (!text || typeof text !== "string") return false;
  for (const pattern of FORBIDDEN_PROMISE_PATTERNS) {
    // Create fresh RegExp to avoid lastIndex mutation on shared patterns
    const fresh = new RegExp(pattern.source, pattern.flags);
    if (fresh.test(text)) return true;
  }
  return false;
}

/**
 * Verifica se o texto contém "casa" que deveria ser "imóvel".
 * @param {string} text
 * @returns {boolean}
 */
export function containsCasaInsteadOfImovel(text) {
  if (!text || typeof text !== "string") return false;
  // Create fresh RegExp to avoid lastIndex mutation on shared pattern
  const fresh = new RegExp(CASA_PATTERN.source, CASA_PATTERN.flags);
  return fresh.test(text);
}

/**
 * Verifica se o texto excede o limite de tamanho.
 * @param {string} text
 * @returns {boolean}
 */
export function exceedsMaxLength(text) {
  if (!text || typeof text !== "string") return false;
  return text.length > MAX_REPLY_LENGTH;
}

/**
 * Detecta contexto emocional no texto do cliente.
 * @param {string} text
 * @returns {boolean}
 */
export { detectEmotionalContext };

/**
 * Strips future-stage collection questions from a reply (ONE-STAGE-ONLY guard).
 * @param {string} reply
 * @param {string} currentStage
 * @returns {string}
 */
export { stripFutureStageCollection };

// ── Constantes exportadas para testes ──────────────────────────────────────
export const CONTRACT_CONFIG = Object.freeze({
  MAX_REPLY_LENGTH,
  MAX_REPLY_LENGTH_OPERACIONAL,
  FORBIDDEN_PROMISE_PATTERNS_COUNT: FORBIDDEN_PROMISE_PATTERNS.length,
  EMOTIONAL_PATTERNS_COUNT: EMOTIONAL_PATTERNS.length,
  EMPATHY_PREFIXES_COUNT: EMPATHY_PREFIXES.length
});
