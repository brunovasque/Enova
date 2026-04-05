// ============================================================
// Enova IA — Action Builder (Estrutura Canônica da Ação Assistida)
// panel/app/lib/enova-ia-action-builder.ts
//
// PR G2.1 — Estrutura Canônica da Ação Assistida (ENOVA IA / v2 cognitivo)
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

// ── Tipo canônico do draft ─────────────────────────────────────────────────

/**
 * EnovaIaActionDraft — draft canônico de ação assistida.
 *
 * Nasce SEMPRE como draft, SEMPRE exige aprovação humana, NUNCA dispara
 * automaticamente. Campos obrigatórios garantem rastreabilidade completa:
 * motivo, risco, público, ação sugerida.
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
  /** Mensagem sugerida (vazio quando não aplicável). */
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

  // ── Leads alvo
  const targetLeads = response.relevant_leads.map((l) => l.name);

  // ── Montar draft
  const draft: EnovaIaActionDraft = {
    action_id:              generateActionId(),
    action_type:            actionType,
    action_title:           response.answer_title,
    action_summary:         response.answer_summary,
    target_count:           targetLeads.length,
    target_leads:           targetLeads,
    suggested_message:      "",
    suggested_steps:        response.recommended_actions.filter((a) => a.trim().length > 0),
    risk_level:             classifyRisk(response),
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
