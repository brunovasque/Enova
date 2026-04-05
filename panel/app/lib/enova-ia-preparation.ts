// ============================================================
// Enova IA — Preparation State Machine (G2.3 + G2.5)
// panel/app/lib/enova-ia-preparation.ts
//
// PR G2.3 — Aprovação Humana + Estado de Preparação (ENOVA IA)
// PR G2.5 — Pré-execução Assistida (ENOVA IA)
// Escopo: PANEL-ONLY, estado local, sem side effect, sem persistência.
//
// Propósito:
//   Define os estados canônicos de preparação da ação assistida,
//   seus labels operacionais, textos de apoio ao operador e as
//   transições permitidas entre estados.
//
// O que esta camada FAZ:
//   - Tipar os 5 estados canônicos de preparação
//   - Expor labels e textos de apoio para cada estado
//   - Declarar quais ações de botão são válidas em cada estado
//   - Calcular transição de estado (função pura, sem side effect)
//
// O que esta camada NÃO FAZ:
//   - Executar ação
//   - Persistir estado
//   - Disparar mensagem
//   - Mover lead/base/status
//   - Chamar backend ou IA externa
//
// Fluxo canônico de preparação (G2.3 + G2.5):
//   draft → (revisar) → review_ready → (aprovar) → approved_for_manual_execution
//   approved_for_manual_execution → (marcar_pre_execucao) → pre_execution_ready
//   draft | review_ready → (descartar) → discarded
// ============================================================

/**
 * ExecutorPreparationStatus — estados canônicos de preparação da ação assistida.
 *
 * - draft                        : rascunho inicial; ação ainda não revisada pelo operador
 * - review_ready                 : operador marcou como pronto para revisão; aguarda aprovação
 * - approved_for_manual_execution: aprovado para execução manual futura; NADA foi executado
 * - pre_execution_ready          : [G2.5] pacote de pré-execução armado; aguarda gesto final
 * - discarded                    : descartado localmente; sem qualquer efeito externo
 */
export type ExecutorPreparationStatus =
  | "draft"
  | "review_ready"
  | "approved_for_manual_execution"
  | "pre_execution_ready"
  | "discarded";

/** Ações de transição disponíveis no fluxo de preparação. */
export type PreparationAction = "revisar" | "aprovar" | "descartar" | "marcar_pre_execucao";

// ── Labels operacionais ────────────────────────────────────────────────────

/** Label operacional curto para exibição em badges e headers. */
export const PREPARATION_STATUS_LABEL: Record<ExecutorPreparationStatus, string> = {
  draft:                         "Rascunho",
  review_ready:                  "Pronto para revisão",
  approved_for_manual_execution: "Aprovado para execução manual",
  pre_execution_ready:           "Pronta para pré-execução",
  discarded:                     "Descartado",
};

// ── Textos de apoio ao operador ────────────────────────────────────────────

/**
 * Texto de apoio contextual para o operador em cada estado.
 *
 * Deixa explícito:
 * - O que a ação está esperando agora
 * - Que nenhuma execução ocorreu em nenhum estado
 */
export const PREPARATION_STATUS_SUPPORT_TEXT: Record<ExecutorPreparationStatus, string> = {
  draft:
    "Aguardando revisão · rascunho inicial — nenhuma ação foi executada",
  review_ready:
    "Pronto para aprovação — revise os passos e aprove para execução manual",
  approved_for_manual_execution:
    "Aprovado para execução manual — nenhuma ação foi executada automaticamente",
  pre_execution_ready:
    "Pacote armado · aguardando gesto final da próxima camada — nenhuma execução ocorreu",
  discarded:
    "Ação descartada localmente — sem nenhum efeito externo",
};

// ── Mapa de ações válidas por estado ──────────────────────────────────────

/**
 * PREPARATION_VALID_ACTIONS — ações permitidas em cada estado.
 *
 * Garante o fluxo canônico:
 * - draft: pode revisar ou descartar (não pode aprovar sem revisar antes)
 * - review_ready: pode aprovar ou descartar
 * - approved_for_manual_execution: pode armar para pré-execução [G2.5]
 * - pre_execution_ready: estado final armado — nenhuma ação disponível [G2.5]
 * - discarded: nenhuma ação disponível
 */
export const PREPARATION_VALID_ACTIONS: Record<
  ExecutorPreparationStatus,
  ReadonlyArray<PreparationAction>
> = {
  draft:                         ["revisar", "descartar"],
  review_ready:                  ["aprovar", "descartar"],
  approved_for_manual_execution: ["marcar_pre_execucao"],
  pre_execution_ready:           [],
  discarded:                     [],
};

// ── Função de transição pura ───────────────────────────────────────────────

/**
 * transitionPreparationStatus — aplica uma ação de preparação ao estado atual.
 *
 * Retorna o próximo estado canônico se a ação for válida para o estado atual.
 * Retorna null se a ação não for permitida no estado atual.
 *
 * Nunca dispara side effect. Função pura e testável.
 *
 * @param current  Estado canônico atual
 * @param action   Ação que o operador quer realizar
 * @returns        Próximo estado, ou null se ação inválida
 */
export function transitionPreparationStatus(
  current: ExecutorPreparationStatus,
  action: PreparationAction,
): ExecutorPreparationStatus | null {
  if (!(PREPARATION_VALID_ACTIONS[current] as readonly string[]).includes(action)) {
    return null;
  }
  switch (action) {
    case "revisar":            return "review_ready";
    case "aprovar":            return "approved_for_manual_execution";
    case "descartar":          return "discarded";
    case "marcar_pre_execucao": return "pre_execution_ready";
  }
}

// ── Exports utilitários para testes ───────────────────────────────────────

/** Estado inicial canônico de qualquer nova ação assistida. */
export const PREPARATION_INITIAL_STATUS: ExecutorPreparationStatus = "draft";
