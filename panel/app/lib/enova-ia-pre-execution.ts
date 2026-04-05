// ============================================================
// Enova IA — Pre-Execution Package (G2.5)
// panel/app/lib/enova-ia-pre-execution.ts
//
// PR G2.5 — Pré-execução Assistida (ENOVA IA)
// Escopo: PANEL-ONLY, estado local, sem side effect, sem persistência.
//
// Propósito:
//   Define a estrutura canônica do pacote de pré-execução assistida.
//   Transforma uma ação aprovada em um pacote armado e auditável para
//   futura execução segura — sem executar nada agora.
//
// O que esta camada FAZ:
//   - Tipar o PreExecutionPackage canônico
//   - Construir o pacote a partir de um EnovaIaActionDraft aprovado
//   - Expor checklist canônico de pré-execução
//   - Declarar explicitamente que a ação ainda não foi executada
//   - Declarar que execução depende de gesto final humano (próxima camada)
//   - Expor labels e textos de apoio para o estado pre_execution_ready
//
// O que esta camada NÃO FAZ:
//   - Executar ação
//   - Persistir estado ou pacote
//   - Disparar mensagem
//   - Mover lead/base/status
//   - Chamar backend, Worker ou IA externa
//   - Personalizar texto sugerido por lead individual
//     (→ melhoria futura fora do escopo desta PR — ver nota abaixo)
//
// Melhoria futura mapeada (FORA DO ESCOPO desta PR):
//   - Personalização de texto sugerido por lead individual:
//     cada lead do target_leads_detail pode ter uma variação do
//     suggested_message personalizada com seu nome, motivo e contexto.
//     Isso requer uma camada de geração/template por lead que está
//     prevista para uma PR futura de execução personalizada.
//
// Fluxo canônico:
//   approved_for_manual_execution → (marcar_pre_execucao) → pre_execution_ready
// ============================================================

import type { EnovaIaActionDraft, OperationalLeadDetail } from "./enova-ia-action-builder";

// ── Checklist canônico de pré-execução ────────────────────────────────────

/**
 * PRE_EXECUTION_CHECKLIST — passos de verificação antes de executar.
 *
 * Checklist curto e operacional. Serve como confirmação final de que
 * todos os ingredientes estão presentes antes de avançar para execução.
 * Nunca é executado automaticamente — depende de leitura humana.
 */
export const PRE_EXECUTION_CHECKLIST = [
  "Tipo de ação confirmado",
  "Leads alvo e prioridade revisados",
  "Abordagem sugerida lida e validada",
  "Texto sugerido revisado (quando houver)",
  "Sequência de execução clara",
  "Risco da ação avaliado",
  "Nenhuma mensagem foi disparada",
  "Aguardando gesto final de execução",
] as const;

export type PreExecutionChecklistItem = (typeof PRE_EXECUTION_CHECKLIST)[number];

// ── Tipo canônico do pacote de pré-execução ────────────────────────────────

/**
 * PreExecutionPackage — pacote canônico de pré-execução assistida.
 *
 * Representa uma ação completamente armada para execução futura segura.
 * Contém todos os ingredientes necessários para a próxima camada de
 * execução real — sem ter executado nada.
 *
 * Campos obrigatórios comunicam explicitamente:
 * - not_yet_executed: true  → nenhuma ação foi disparada
 * - requires_final_human_gesture: true → próxima camada exige gesto humano
 *
 * // Future: per_lead_suggested_message (melhoria futura — personalização por lead)
 */
export type PreExecutionPackage = {
  /** Identificador da ação (mesmo action_id do draft de origem). */
  action_id: string;
  /** Tipo canônico da ação armada. */
  action_type: EnovaIaActionDraft["action_type"];
  /** Título curto da ação. */
  action_title: string;
  /** Nível de risco avaliado. */
  risk_level: EnovaIaActionDraft["risk_level"];
  /** Leads alvo com motivo individual e ordem de prioridade. */
  target_leads_detail: OperationalLeadDetail[];
  /** Abordagem/tom sugerido derivado do tipo de ação. */
  suggested_approach: string;
  /**
   * Texto sugerido de contato (quando há base suficiente).
   * Vazio quando não há base — nunca inventado.
   *
   * // Future: per_lead_suggested_message — personalização por lead (fora do escopo desta PR)
   */
  suggested_message: string;
  /** Sequência de execução sugerida. */
  suggested_steps: string[];
  /** Checklist canônico de verificação pré-execução. */
  execution_checklist: readonly PreExecutionChecklistItem[];
  /** Status de readiness — sempre "pre_execution_ready" quando este pacote existe. */
  readiness_status: "pre_execution_ready";
  /** Confirmação explícita de que nenhuma execução ocorreu. Sempre true. */
  not_yet_executed: true;
  /** Confirmação explícita de que execução depende de gesto final humano. Sempre true. */
  requires_final_human_gesture: true;
  /** Estado de preparação de onde o pacote foi gerado. Rastreabilidade. */
  armed_from_status: "approved_for_manual_execution";
};

// ── Builder do pacote de pré-execução ─────────────────────────────────────

/**
 * buildPreExecutionPackage — constrói o pacote canônico de pré-execução.
 *
 * Transforma um EnovaIaActionDraft aprovado em um pacote armado, completo
 * e auditável para futura execução segura.
 *
 * Deve ser chamado somente quando o status de preparação for
 * "approved_for_manual_execution" — a transição para "pre_execution_ready"
 * é gerenciada pela máquina de estados de preparação.
 *
 * Nunca dispara side effect. Função pura e testável.
 *
 * @param draft  Draft canônico de ação assistida (G2.1–G2.4)
 * @returns      Pacote canônico de pré-execução pronto para a próxima camada
 */
export function buildPreExecutionPackage(
  draft: EnovaIaActionDraft,
): PreExecutionPackage {
  return {
    action_id:                  draft.action_id,
    action_type:                draft.action_type,
    action_title:               draft.action_title,
    risk_level:                 draft.risk_level,
    target_leads_detail:        draft.target_leads_detail.length > 0
      ? draft.target_leads_detail
      : draft.target_leads.map((name, i) => ({ name, reason: "", priority_order: i + 1 })),
    suggested_approach:         draft.suggested_approach,
    suggested_message:          draft.suggested_message,
    suggested_steps:            draft.suggested_steps,
    execution_checklist:        PRE_EXECUTION_CHECKLIST,
    readiness_status:           "pre_execution_ready",
    not_yet_executed:           true,
    requires_final_human_gesture: true,
    armed_from_status:          "approved_for_manual_execution",
  };
}

// ── Labels e textos de apoio para o estado pre_execution_ready ────────────

/**
 * PRE_EXECUTION_READY_LABEL — label operacional para o estado armado.
 *
 * Curto, legível, exibível em badge e header.
 */
export const PRE_EXECUTION_READY_LABEL = "Pronta para pré-execução";

/**
 * PRE_EXECUTION_READY_SUPPORT_TEXT — texto de apoio ao operador.
 *
 * Deixa explícito que a ação está armada mas ainda não foi executada
 * e que a execução real depende da próxima camada/gesto final.
 */
export const PRE_EXECUTION_READY_SUPPORT_TEXT =
  "Pacote armado · aguardando gesto final da próxima camada — nenhuma execução ocorreu";

/**
 * PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE — aviso explícito de não-execução.
 *
 * Texto permanente visível no pacote de pré-execução para deixar claro
 * que esta ação não foi, nem está sendo, executada automaticamente.
 */
export const PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE =
  "Esta ação não foi executada. Ela está pronta para execução futura assistida após aprovação humana final.";
