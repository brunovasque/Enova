// ============================================================
// Enova IA — Action Builder (Estrutura Canônica da Ação Assistida)
// panel/app/lib/enova-ia-action-builder.ts
//
// PR G2.1 — Estrutura Canônica da Ação Assistida (ENOVA IA / v2 cognitivo)
// PR G2.4 — Preparação Operacional Detalhada da Ação
// Escopo: PANEL-ONLY, read-only/preparo, sem automação, sem IA externa.
//
// Propósito:
//   Traduzir a resposta estruturada da Enova IA (EnovaIaOpenAIResponse)
//   em um draft canônico de ação assistida (EnovaIaActionDraft), sem
//   executar, sem disparar side effect, sem mover lead, sem enviar
//   mensagem. Apenas preparo seguro de draft.
//
// O que esta camada FAZ:
//   - Ler a resposta estruturada atual da Enova IA
//   - Detectar se existe ação clara o bastante
//   - Montar EnovaIaActionDraft canônico
//   - Validar segurança mínima
//   - Marcar requires_human_approval = true (sempre)
//   - Retornar null quando não houver base suficiente
//   - Classificar risco mínimo (low/medium/high)
//   - [G2.4] Derivar detalhe operacional por lead (motivo + prioridade)
//   - [G2.4] Derivar abordagem sugerida a partir do tipo de ação e risco
//   - [G2.4] Popular mensagem sugerida apenas com base suficiente
//
// O que esta camada NÃO FAZ:
//   - Executar ação automática
//   - Disparar mensagem
//   - Mover lead/base/status
//   - Criar automação ou scheduler
//   - Abrir fluxo de aprovação visual completo
//   - Mexer em Worker/schema/Supabase
//   - Chamar IA externa
//   - Inventar lead, risco, mensagem ou público sem base concreta
//
// Princípios:
//   - Toda ação nasce como draft
//   - Toda ação exige aprovação humana
//   - Nenhuma ação dispara automaticamente
//   - Se a IA não tiver base suficiente, não monta ação fake
//   - Risco é apenas leitura/preparo — nada é executável nesta PR
// ============================================================

import type { EnovaIaOpenAIResponse, EnovaIaMode } from "./enova-ia-openai";

// ── Taxonomia de ações assistidas ──────────────────────────────────────────

/**
 * EnovaIaActionType — tipos canônicos de ações que a Enova IA pode sugerir.
 *
 * Cada tipo mapeia para uma operação real do CRM que requer preparo e
 * aprovação humana antes de qualquer execução.
 */
export type EnovaIaActionType =
  | "followup_lote"
  | "reativacao_lote"
  | "mutirao_docs"
  | "pre_plantao"
  | "intervencao_humana"
  | "campanha_sugerida";

/** Labels legíveis para cada tipo de ação. */
export const ACTION_TYPE_LABEL: Record<EnovaIaActionType, string> = {
  followup_lote:       "Follow-up em lote",
  reativacao_lote:     "Reativação em lote",
  mutirao_docs:        "Mutirão de documentos",
  pre_plantao:         "Preparação para plantão",
  intervencao_humana:  "Intervenção humana",
  campanha_sugerida:   "Campanha sugerida",
};

// ── Classificação de risco ─────────────────────────────────────────────────

/**
 * EnovaIaActionRiskLevel — nível de risco da ação assistida.
 *
 * Nesta PR todo draft é apenas leitura/preparo — nenhum risco resulta em
 * execução. O campo existe para contratos futuros (G2.2/G2.3).
 */
export type EnovaIaActionRiskLevel = "low" | "medium" | "high";

/** Labels legíveis para cada nível de risco. */
export const RISK_LEVEL_LABEL: Record<EnovaIaActionRiskLevel, string> = {
  low:    "Baixo",
  medium: "Médio",
  high:   "Alto",
};

// ── G2.4 — Tipos de preparo operacional detalhado ─────────────────────────

/**
 * OperationalLeadDetail — detalhe operacional de um lead alvo.
 *
 * [G2.4] Enriquece o lead com motivo individual e ordem de prioridade,
 * derivados diretamente dos dados da resposta da IA (sem inventar).
 */
export type OperationalLeadDetail = {
  /** Nome do lead (igual a target_leads[i]). */
  name: string;
  /** Motivo individual resumido, derivado de relevant_leads[i].reason. Vazio quando não disponível. */
  reason: string;
  /** Ordem de prioridade sugerida (1-based). Derivada da posição na resposta da IA. */
  priority_order: number;
};

// ── Tipo canônico do draft ─────────────────────────────────────────────────

/**
 * EnovaIaActionDraft — draft canônico de ação assistida.
 *
 * Nasce SEMPRE como draft, SEMPRE exige aprovação humana, NUNCA dispara
 * automaticamente. Campos obrigatórios garantem rastreabilidade completa:
 * motivo, risco, público, ação sugerida.
 *
 * [G2.4] Adicionado: target_leads_detail, suggested_approach.
 * [G2.4] Enriquecido: suggested_message (apenas quando há base suficiente).
 */
export type EnovaIaActionDraft = {
  /** UUID do draft (gerado no momento da criação). */
  action_id: string;
  /** Tipo canônico da ação sugerida. */
  action_type: EnovaIaActionType;
  /** Título curto e direto da ação sugerida. */
  action_title: string;
  /** Resumo operacional do que a ação pretende fazer. */
  action_summary: string;
  /** Número estimado de leads alvo (0 quando indeterminado). */
  target_count: number;
  /** Nomes dos leads alvo concretos (vazio quando não identificados). */
  target_leads: string[];
  /**
   * [G2.4] Detalhe operacional por lead: motivo individual + ordem de prioridade.
   * Derivado de relevant_leads da resposta da IA. Vazio quando não há leads identificados.
   */
  target_leads_detail: OperationalLeadDetail[];
  /**
   * [G2.4] Abordagem/tom sugerido para a ação.
   * Derivado de action_type + risk_level. Vazio quando não aplicável.
   */
  suggested_approach: string;
  /**
   * Mensagem sugerida de contato.
   * [G2.4] Populado apenas quando há base suficiente (tipo de contato direto +
   * leads com motivo real + confidence alta). Vazio quando não há base.
   */
  suggested_message: string;
  /** Passos sugeridos para execução (vazio quando não aplicável). */
  suggested_steps: string[];
  /** Nível de risco da ação (apenas classificação, sem execução). */
  risk_level: EnovaIaActionRiskLevel;
  /** Sempre true — toda ação exige gesto humano. */
  requires_human_approval: true;
  /** Motivo/justificativa operacional da ação. */
  reason: string;
  /** Modo da Enova IA que originou a resposta. */
  source_mode: EnovaIaMode;
  /** Prompt original que gerou a resposta (para rastreabilidade). */
  created_from_prompt: string;
  /** Sempre "draft" — nunca nasce executável. */
  status: "draft";
};

// ── Constantes internas ────────────────────────────────────────────────────

/** Modos da Enova IA que indicam potencial de ação assistida. */
const ACTIONABLE_MODES: ReadonlySet<EnovaIaMode> = new Set<EnovaIaMode>([
  "plano_de_acao",
  "segmentacao",
  "campanha",
  "risco",
]);

/**
 * Mapeamento de mode → action_type padrão.
 * Quando há dúvida sobre qual tipo de ação, usamos o mais conservador.
 */
const MODE_TO_DEFAULT_ACTION_TYPE: Partial<Record<EnovaIaMode, EnovaIaActionType>> = {
  plano_de_acao: "followup_lote",
  segmentacao:   "reativacao_lote",
  campanha:      "campanha_sugerida",
  risco:         "intervencao_humana",
};

/** Mínimo de ações recomendadas para considerar que há base suficiente. */
const MIN_RECOMMENDED_ACTIONS = 1;

/** Mínimo de pontos de análise para considerar que há base suficiente. */
const MIN_ANALYSIS_POINTS = 1;

/**
 * Palavras-chave que detectam tipo de ação mais específico dentro de
 * recommended_actions. Busca case-insensitive.
 */
const ACTION_KEYWORD_MAP: ReadonlyArray<{
  keywords: readonly string[];
  type: EnovaIaActionType;
}> = [
  { keywords: ["follow-up", "followup", "retomar", "recontatar"],       type: "followup_lote" },
  { keywords: ["document", "pasta", "docs", "checklist", "mutir"],      type: "mutirao_docs" },
  { keywords: ["plant", "visita", "empreendimento"],                    type: "pre_plantao" },
  { keywords: ["campanha", "disparar", "comunica"],                     type: "campanha_sugerida" },
  { keywords: ["interven", "humano", "manual", "corretor", "escalar"],  type: "intervencao_humana" },
  { keywords: ["reativ", "reengaj", "recuper", "frio", "lote"],         type: "reativacao_lote" },
];

// ── Funções internas de derivação ──────────────────────────────────────────

/** Gera UUID v4 usando crypto.randomUUID quando disponível, fallback manual. */
function generateActionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback para ambientes sem crypto.randomUUID
  const hex = "0123456789abcdef";
  const segments = [8, 4, 4, 4, 12] as const;
  return segments
    .map((len) =>
      Array.from({ length: len }, () => hex[Math.floor(Math.random() * 16)]).join(""),
    )
    .join("-");
}

/**
 * Detecta o tipo de ação mais provável a partir dos textos de
 * recommended_actions da resposta OpenAI.
 */
function detectActionType(
  actions: readonly string[],
  mode: EnovaIaMode,
): EnovaIaActionType {
  // Varrer keywords em recommended_actions
  const joined = actions.join(" ").toLowerCase();
  for (const entry of ACTION_KEYWORD_MAP) {
    if (entry.keywords.some((kw) => joined.includes(kw))) {
      return entry.type;
    }
  }
  // Fallback por mode
  return MODE_TO_DEFAULT_ACTION_TYPE[mode] ?? "intervencao_humana";
}

/**
 * Classifica o risco da ação com base nos sinais da resposta.
 *
 * Regras:
 * - should_escalate_human || confidence=baixa → high
 * - risks.length >= 2 || confidence=media    → medium
 * - Restante                                  → low
 */
function classifyRisk(response: EnovaIaOpenAIResponse): EnovaIaActionRiskLevel {
  if (response.should_escalate_human || response.confidence === "baixa") {
    return "high";
  }
  if (response.risks.length >= 2 || response.confidence === "media") {
    return "medium";
  }
  return "low";
}

/**
 * Verifica se a resposta tem base suficiente para montar um draft.
 *
 * Critérios:
 * - Modo acionável (plano_de_acao, segmentacao, campanha, risco)
 * - Pelo menos MIN_RECOMMENDED_ACTIONS ações recomendadas com conteúdo
 * - Pelo menos MIN_ANALYSIS_POINTS pontos de análise com conteúdo
 * - answer_summary não vazio
 */
function hasActionableBasis(response: EnovaIaOpenAIResponse): boolean {
  if (!ACTIONABLE_MODES.has(response.mode)) {
    return false;
  }
  const meaningfulActions = response.recommended_actions.filter(
    (a) => a.trim().length > 0,
  );
  if (meaningfulActions.length < MIN_RECOMMENDED_ACTIONS) {
    return false;
  }
  const meaningfulAnalysis = response.analysis_points.filter(
    (a) => a.trim().length > 0,
  );
  if (meaningfulAnalysis.length < MIN_ANALYSIS_POINTS) {
    return false;
  }
  if (!response.answer_summary || response.answer_summary.trim().length === 0) {
    return false;
  }
  return true;
}

// ── G2.4 — Funções de preparo operacional detalhado ──────────────────────

/**
 * [G2.4] buildTargetLeadsDetail — converte relevant_leads em OperationalLeadDetail[].
 *
 * Preserva a ordem da IA (priority_order 1-based = posição na resposta).
 * O motivo vem diretamente de relevant_leads[i].reason — nunca inventado.
 * Leads sem motivo explícito recebem reason vazio (honesto).
 */
function buildTargetLeadsDetail(
  relevantLeads: ReadonlyArray<{ name: string; reason: string }>,
): OperationalLeadDetail[] {
  return relevantLeads.map((lead, index) => ({
    name: lead.name,
    reason: lead.reason.trim(),
    priority_order: index + 1,
  }));
}

/**
 * [G2.4] Mapeamento de action_type → abordagem/tom sugerido.
 *
 * Derivado do tipo canônico da ação — nunca inventado.
 * Combinado com risk_level para calibrar o tom.
 */
const ACTION_TYPE_APPROACH: Record<EnovaIaActionType, string> = {
  followup_lote:      "Follow-up leve e direto — retomar conversa sem pressão; um toque por lead; aguardar resposta antes de novo contato",
  reativacao_lote:    "Reativação com gatilho concreto — reengajar apenas com argumento novo; não repetir mensagem anterior; priorizar os de perfil mais válido",
  mutirao_docs:       "Cobrança objetiva de documentos — listagem clara do que falta; tom prestativo; facilitar o envio; confirmar recebimento",
  pre_plantao:        "Confirmação de presença no plantão — tom entusiasmado mas direto; confirmar data/local; reforçar benefício da visita",
  intervencao_humana: "Intervenção pessoal do corretor — abordagem consultiva; escutar antes de propor; sem pressão; identificar bloqueio real",
  campanha_sugerida:  "Comunicação em lote com mensagem uniforme — tom consistente para todos; mensagem clara e com CTA específico",
};

/**
 * [G2.4] deriveSuggestedApproach — retorna o texto de abordagem/tom sugerido.
 *
 * Ajusta levemente com base no risco: risco alto adiciona nota de cautela.
 * Retorna string vazia apenas quando action_type não tiver abordagem definida
 * (situação impossível dado o tipo fechado, mas seguro por contrato).
 */
function deriveSuggestedApproach(
  actionType: EnovaIaActionType,
  riskLevel: EnovaIaActionRiskLevel,
): string {
  const base = ACTION_TYPE_APPROACH[actionType] ?? "";
  if (!base) return "";
  if (riskLevel === "high") {
    return `${base} · ⚠️ Risco alto: revisar caso a caso antes de agir`;
  }
  return base;
}

/**
 * [G2.4] Tipos de ação em que uma mensagem sugerida faz sentido operacional.
 *
 * Apenas ações de contato direto individual: followup e reativação.
 * Ações de mutirão, plantão, campanha e intervenção têm lógica própria
 * de texto e não se beneficiam de mensagem padrão sugerida aqui.
 */
const MESSAGING_ACTION_TYPES: ReadonlySet<EnovaIaActionType> = new Set<EnovaIaActionType>([
  "followup_lote",
  "reativacao_lote",
]);

/** Mínimo de leads com motivo não-vazio para gerar mensagem sugerida. */
const MIN_LEADS_WITH_REASON_FOR_MESSAGE = 1;

/**
 * [G2.4] Textos canônicos de mensagem sugerida por tipo de ação de contato direto.
 *
 * Apenas tipos incluídos em MESSAGING_ACTION_TYPES. Nunca inventam informação
 * não presente — são textos de abertura genéricos e seguros para recontato.
 */
const SUGGESTED_MESSAGE_BY_TYPE: Partial<Record<EnovaIaActionType, string>> = {
  followup_lote:   "Oi, tudo bem? Passando para dar continuidade à nossa conversa sobre o financiamento. Você conseguiu pensar melhor? Estou à disposição para tirar qualquer dúvida 😊",
  reativacao_lote: "Olá! Vi que ainda não tivemos chance de avançar juntos. Quero compartilhar uma atualização que pode fazer diferença para o seu caso — posso te contar em 2 minutos?",
};

/**
 * [G2.4] deriveSuggestedMessage — gera mensagem sugerida quando há base suficiente.
 *
 * Critérios obrigatórios (todos devem ser verdadeiros):
 * - action_type é de contato direto (followup_lote ou reativacao_lote)
 * - confidence da IA é "alta" (base sólida)
 * - há pelo menos 1 lead com motivo não-vazio identificado
 *
 * Quando esses critérios não são atendidos, retorna "" (sem mensagem inventada).
 *
 * O texto gerado é baseado no tipo de ação e no motivo do primeiro lead
 * como referência de contexto — nunca inventa informação não presente na
 * resposta da IA.
 */
function deriveSuggestedMessage(
  actionType: EnovaIaActionType,
  leadsDetail: OperationalLeadDetail[],
  confidence: EnovaIaOpenAIResponse["confidence"],
): string {
  // Guarda: tipo de ação deve ser de contato direto
  if (!MESSAGING_ACTION_TYPES.has(actionType)) return "";
  // Guarda: confiança alta necessária para não inventar mensagem sem base
  if (confidence !== "alta") return "";
  // Guarda: pelo menos 1 lead com motivo explícito
  const leadsWithReason = leadsDetail.filter((l) => l.reason.length > 0);
  if (leadsWithReason.length < MIN_LEADS_WITH_REASON_FOR_MESSAGE) return "";

  if (actionType === "followup_lote" || actionType === "reativacao_lote") {
    return SUGGESTED_MESSAGE_BY_TYPE[actionType] ?? "";
  }
  return "";
}

// ── Builder público ────────────────────────────────────────────────────────

/**
 * buildEnovaIaActionDraft — traduz uma resposta estruturada da Enova IA
 * em um draft canônico de ação assistida.
 *
 * Retorna null quando:
 * - a resposta não tem base suficiente para montar ação
 * - o modo não é acionável
 * - ações recomendadas estão vazias ou insuficientes
 *
 * Quando retorna um draft:
 * - status = "draft" (sempre)
 * - requires_human_approval = true (sempre)
 * - nenhum side effect é disparado
 * - [G2.4] target_leads_detail traz motivo + prioridade por lead
 * - [G2.4] suggested_approach derivado do tipo de ação e risco
 * - [G2.4] suggested_message populado apenas quando há base suficiente
 *
 * @param response   Resposta estruturada da Enova IA (OpenAI ou local)
 * @param prompt     Prompt original do usuário (para rastreabilidade)
 * @returns          Draft canônico ou null se não houver base
 */
export function buildEnovaIaActionDraft(
  response: EnovaIaOpenAIResponse,
  prompt: string,
): EnovaIaActionDraft | null {
  // ── Guarda: base suficiente?
  if (!hasActionableBasis(response)) {
    return null;
  }

  // ── Tipo de ação
  const actionType = detectActionType(response.recommended_actions, response.mode);

  // ── Risco
  const riskLevel = classifyRisk(response);

  // ── Leads alvo
  const targetLeads = response.relevant_leads.map((l) => l.name);

  // ── [G2.4] Detalhe operacional por lead (motivo + prioridade)
  const targetLeadsDetail = buildTargetLeadsDetail(response.relevant_leads);

  // ── [G2.4] Abordagem sugerida
  const suggestedApproach = deriveSuggestedApproach(actionType, riskLevel);

  // ── [G2.4] Mensagem sugerida — apenas com base suficiente
  const suggestedMessage = deriveSuggestedMessage(
    actionType,
    targetLeadsDetail,
    response.confidence,
  );

  // ── Montar draft
  const draft: EnovaIaActionDraft = {
    action_id:              generateActionId(),
    action_type:            actionType,
    action_title:           response.answer_title,
    action_summary:         response.answer_summary,
    target_count:           targetLeads.length,
    target_leads:           targetLeads,
    target_leads_detail:    targetLeadsDetail,
    suggested_approach:     suggestedApproach,
    suggested_message:      suggestedMessage,
    suggested_steps:        response.recommended_actions.filter((a) => a.trim().length > 0),
    risk_level:             riskLevel,
    requires_human_approval: true,
    reason:                 response.analysis_points.filter((a) => a.trim().length > 0).join("; "),
    source_mode:            response.mode,
    created_from_prompt:    prompt,
    status:                 "draft",
  };

  return draft;
}

// ── Exports utilitários para testes ────────────────────────────────────────

/** Re-exporta para uso em testes unitários. */
export { hasActionableBasis as _hasActionableBasis };
export { classifyRisk as _classifyRisk };
export { detectActionType as _detectActionType };
export { buildTargetLeadsDetail as _buildTargetLeadsDetail };
export { deriveSuggestedApproach as _deriveSuggestedApproach };
export { deriveSuggestedMessage as _deriveSuggestedMessage };
