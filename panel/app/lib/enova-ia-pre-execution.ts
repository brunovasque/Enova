// ============================================================
// Enova IA — Pre-Execution Package (G2.5) + Execution Authorization (G2.6)
// panel/app/lib/enova-ia-pre-execution.ts
//
// PR G2.5 — Pré-execução Assistida (ENOVA IA)
// PR G2.6 — Gesto Final Humano + Disparo Controlado Futuro (ENOVA IA)
// Escopo: PANEL-ONLY, estado local, sem side effect, sem persistência.
//
// Propósito:
//   Define a estrutura canônica do pacote de pré-execução assistida (G2.5)
//   e o pacote de autorização final humana local (G2.6).
//   Transforma uma ação aprovada em um pacote armado e auditável para
//   futura execução segura — sem executar nada agora.
//
// O que esta camada FAZ:
//   - Tipar o PreExecutionPackage canônico (G2.5)
//   - Construir o pacote a partir de um EnovaIaActionDraft aprovado (G2.5)
//   - Expor checklist canônico de pré-execução (G2.5)
//   - Declarar explicitamente que a ação ainda não foi executada (G2.5 + G2.6)
//   - Declarar que execução depende de gesto final humano (G2.5)
//   - [G2.6] Tipar o ExecutionAuthorizationPackage canônico
//   - [G2.6] Construir o pacote de autorização local a partir do pacote de pré-execução
//   - Expor labels e textos de apoio para os estados pre_execution_ready e authorized
//
// O que esta camada NÃO FAZ:
//   - Executar ação
//   - Persistir estado ou pacote
//   - Disparar mensagem
//   - Mover lead/base/status
//   - Chamar backend, Worker ou IA externa
//   - Personalizar texto sugerido por lead individual
//     (→ melhoria futura fora do escopo — ver nota abaixo)
//
// Melhoria futura mapeada (FORA DO ESCOPO):
//   - Personalização de texto sugerido por lead individual:
//     cada lead do target_leads_detail pode ter uma variação do
//     suggested_message personalizada com seu nome, motivo e contexto.
//     Isso requer uma camada de geração/template por lead prevista
//     para uma PR futura de execução personalizada.
//   - Persistência/autorização real em banco (fora do escopo — G3+)
//   - Executor real com trilha e prova (fora do escopo — G3+)
//   - Integração com backend/Worker (fora do escopo — G3+)
//
// Fluxo canônico:
//   approved_for_manual_execution → (marcar_pre_execucao) → pre_execution_ready
//   pre_execution_ready → (autorizar_execucao_controlada) → authorized_for_controlled_execution
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
  "Aguardando gesto final humano de autorização",
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

// ── [G2.6] Pacote de autorização final humana ─────────────────────────────

/**
 * ExecutionAuthorizationPackage — registro local do gesto final humano.
 *
 * [G2.6] Captura o fato de que o operador realizou o gesto final de
 * autorização sobre um pacote de pré-execução armado.
 *
 * Campos obrigatórios comunicam explicitamente:
 * - authorized_by_human: true   → gesto humano foi realizado
 * - not_yet_executed: true      → nenhuma execução ocorreu
 * - final_human_gesture_required: false → gesto já foi cumprido
 * - authorization_status        → estado canônico de autorização
 *
 * Este pacote é local e não é persistido. Não dispara side effect.
 * A execução real requer uma camada futura (G3+).
 *
 * // Future: persistência real (G3+)
 * // Future: executor real com trilha e prova (G3+)
 * // Future: integração com backend/Worker (G3+)
 */
export type ExecutionAuthorizationPackage = {
  /** Identificador da ação — mesmo action_id do pacote de pré-execução. */
  action_id: string;
  /** Status de readiness do pacote de origem. Sempre "pre_execution_ready". */
  readiness_status: "pre_execution_ready";
  /** Status canônico de autorização. */
  authorization_status: "authorized_for_controlled_execution";
  /** Confirmação explícita de que o gesto foi realizado por um humano. Sempre true. */
  authorized_by_human: true;
  /** Timestamp ISO local do momento da autorização. Apenas referência local — não é persistido. */
  authorized_at_local: string;
  /**
   * Indica se o gesto final humano ainda é necessário.
   * Sempre false neste pacote — o gesto já foi cumprido.
   */
  final_human_gesture_required: false;
  /** Confirmação explícita de que nenhuma execução ocorreu. Sempre true. */
  not_yet_executed: true;
  /** Aviso textual explícito de que a execução real ainda não aconteceu. */
  explicit_notice: string;
  /** Referência ao action_id do pacote de pré-execução que originou esta autorização. */
  pre_execution_package_ref: string;
};

/**
 * EXECUTION_AUTHORIZATION_NOTICE — aviso explícito de autorização sem execução.
 *
 * [G2.6] Texto permanente visível no estado authorized_for_controlled_execution.
 * Deixa absolutamente claro que a autorização humana foi registrada localmente,
 * mas nenhuma execução real ocorreu — e que isso depende de uma camada futura.
 */
export const EXECUTION_AUTHORIZATION_NOTICE =
  "Gesto final humano registrado localmente. Esta ação está autorizada para futura execução controlada — mas ainda NÃO foi executada. Nenhuma mensagem foi disparada. Nenhum lead foi movido.";

/**
 * buildExecutionAuthorizationPackage — constrói o pacote local de autorização final humana.
 *
 * [G2.6] Deve ser chamado somente quando o operador confirma o gesto final
 * sobre um pacote de pré-execução armado (pre_execution_ready).
 *
 * Nunca dispara side effect. Função pura e testável.
 * O timestamp authorized_at_local é gerado no momento da chamada.
 *
 * @param preExecPackage  Pacote canônico de pré-execução armado (G2.5)
 * @returns               Pacote local de autorização final humana
 */
export function buildExecutionAuthorizationPackage(
  preExecPackage: PreExecutionPackage,
): ExecutionAuthorizationPackage {
  return {
    action_id:                   preExecPackage.action_id,
    readiness_status:            "pre_execution_ready",
    authorization_status:        "authorized_for_controlled_execution",
    authorized_by_human:         true,
    authorized_at_local:         new Date().toISOString(),
    final_human_gesture_required: false,
    not_yet_executed:            true,
    explicit_notice:             EXECUTION_AUTHORIZATION_NOTICE,
    pre_execution_package_ref:   preExecPackage.action_id,
  };
}
