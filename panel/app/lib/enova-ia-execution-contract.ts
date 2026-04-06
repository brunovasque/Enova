// ============================================================
// Enova IA — Execution Contract (G3.1) — Contrato Local de Execução Futura
// panel/app/lib/enova-ia-execution-contract.ts
//
// PR G3.1 — Executor Real Controlado (camada de contrato local)
// Escopo: PANEL-ONLY, estado local, sem side effect, sem persistência.
//
// Propósito:
//   Define a estrutura canônica do contrato local de execução futura.
//   Transforma uma autorização confirmada (G2.6) em um contrato formal,
//   estruturado e auditável que a próxima frente poderá ligar ao executor
//   real — sem executar nada agora.
//
// O que esta camada FAZ:
//   - Tipar o ExecutionContract canônico com todos os campos exigidos
//   - Definir os guardrails canônicos de execução local
//   - Construir o contrato a partir do ExecutionAuthorizationPackage + EnovaIaActionDraft
//   - Expor provas esperadas e expectativa de rollback (contratos futuros)
//   - Declarar explicitamente que nada foi executado
//   - Declarar que execução real requer próxima camada (G3.2+)
//
// O que esta camada NÃO FAZ:
//   - Executar ação
//   - Persistir contrato ou estado
//   - Disparar mensagem
//   - Mover lead/base/status
//   - Chamar backend, Worker ou IA externa
//   - Personalizar texto por lead individual
//     (→ melhoria futura — ver nota abaixo)
//
// Melhorias futuras mapeadas (FORA DO ESCOPO):
//   - Execução real (G3.2+): ligar este contrato ao executor real
//   - Persistência real: salvar contrato em banco com trilha
//   - Prova/log reais: capturar confirmação de execução por lead
//   - Rollback real: desfazer ações executadas com prova
//   - Personalização por lead: variar mensagem/abordagem por contexto individual
//   - Integração com Worker/backend: enviar contrato ao sistema de automação
//
// Fluxo canônico:
//   authorized_for_controlled_execution
//     → (preparar_contrato_execucao) → execution_contract_ready
//
// Dependências:
//   - enova-ia-pre-execution.ts: ExecutionAuthorizationPackage
//   - enova-ia-action-builder.ts: EnovaIaActionDraft, OperationalLeadDetail
// ============================================================

import type { ExecutionAuthorizationPackage } from "./enova-ia-pre-execution";
import type { EnovaIaActionDraft, OperationalLeadDetail } from "./enova-ia-action-builder";

// ── Guardrails canônicos de execução local ────────────────────────────────

/**
 * ExecutionGuardrail — um guardrail canônico para execução controlada.
 *
 * Cada guardrail declara uma condição que DEVE ser satisfeita antes de
 * qualquer execução real. Eles existem como contrato local — sem execução.
 */
export type ExecutionGuardrail = {
  /** Identificador único do guardrail (snake_case). */
  id: string;
  /** Descrição legível da condição que precisa ser satisfeita. */
  rule: string;
  /** Consequência se o guardrail não for atendido. */
  consequence: string;
};

/**
 * EXECUTION_GUARDRAILS — guardrails canônicos locais de execução.
 *
 * Definem as condições mínimas obrigatórias para que uma execução real
 * futura seja considerada válida. Eles existem como contrato local — sem
 * execução agora.
 *
 * Mapeamento dos guardrails:
 * 1. Autorização humana obrigatória antes de qualquer execução
 * 2. Alvos válidos identificados e não vazios
 * 3. Tipo de ação suportado pelo executor real
 * 4. Prova/log esperado definido antes de executar
 * 5. Execução silenciosa proibida — toda ação deve ser registrada
 */
export const EXECUTION_GUARDRAILS: readonly ExecutionGuardrail[] = [
  {
    id:           "require_human_authorization",
    rule:         "Não executar sem autorização humana final explícita",
    consequence:  "Execução bloqueada — nenhuma ação dispara sem gesto humano confirmado",
  },
  {
    id:           "require_valid_targets",
    rule:         "Não executar se não houver alvos válidos identificados",
    consequence:  "Execução bloqueada — lista de alvos vazia ou inválida não permite ação",
  },
  {
    id:           "require_supported_action_type",
    rule:         "Não executar se o tipo de ação não estiver suportado pelo executor real",
    consequence:  "Execução bloqueada — tipo de ação desconhecido ou não homologado não é acionável",
  },
  {
    id:           "require_proof_definition",
    rule:         "Não executar sem prova/log esperado definido previamente",
    consequence:  "Execução bloqueada — toda ação precisa de trilha e confirmação planejadas",
  },
  {
    id:           "forbid_silent_execution",
    rule:         "Não executar silenciosamente — toda ação deve ser registrada e auditável",
    consequence:  "Execução bloqueada — execução sem registro é proibida por contrato",
  },
] as const;

// ── Provas esperadas e expectativa de rollback ────────────────────────────

/**
 * ExpectedProof — prova/log esperado de uma execução futura.
 *
 * Declara o que será considerado como confirmação de execução válida.
 * Esses campos existem como contrato local — sem execução agora.
 *
 * // Future (G3.2+): populated with real execution confirmations
 */
export type ExpectedProof = {
  /** Tipo de prova esperada. */
  proof_type: "message_sent" | "status_changed" | "log_recorded" | "human_confirmation";
  /** Descrição do que precisa ser provado. */
  description: string;
};

/**
 * EXPECTED_PROOFS_BY_STATUS — provas esperadas por confirmação de execução futura.
 *
 * Lista o que será necessário provar quando a execução real acontecer (G3.2+).
 * Existem apenas como contrato local agora.
 */
export const EXPECTED_PROOFS_BY_STATUS: readonly ExpectedProof[] = [
  {
    proof_type:  "human_confirmation",
    description: "Confirmação explícita do operador humano de que a ação foi iniciada",
  },
  {
    proof_type:  "log_recorded",
    description: "Registro local auditável da tentativa de execução (timestamp + action_id)",
  },
  {
    proof_type:  "message_sent",
    description: "Confirmação de envio de mensagem por lead alvo (quando action_type de contato direto)",
  },
] as const;

/**
 * ROLLBACK_EXPECTATION — expectativa de rollback para execução futura.
 *
 * Declara o que seria necessário para desfazer a execução caso necessário.
 * Existe apenas como contrato local agora — rollback real é G3.2+.
 *
 * // Future (G3.2+): rollback real com trilha e prova
 */
export const ROLLBACK_EXPECTATION =
  "Rollback via reversão manual do status/mensagem por lead — requer trilha de execução real. Rollback real fora do escopo desta camada (G3.2+).";

// ── Tipo canônico do contrato local de execução ───────────────────────────

/**
 * ExecutionContract — contrato canônico local de execução futura.
 *
 * [G3.1] Representa o "molde oficial" da execução futura. Declara tudo
 * que seria necessário para uma execução válida — sem ter executado nada.
 *
 * Campos obrigatórios comunicam explicitamente:
 * - execution_status: "not_executed"  → nenhuma ação foi disparada
 * - authorization_status              → o estado de autorização de origem
 * - explicit_notice                   → aviso textual canônico
 *
 * // Future (G3.2+): a próxima camada lê este contrato e o executa com trilha real
 */
export type ExecutionContract = {
  /** Identificador único da ação — mesmo action_id de toda a cadeia G2.1→G3.1. */
  action_id: string;
  /** Tipo canônico da ação a ser executada. */
  action_type: EnovaIaActionDraft["action_type"];
  /** Status de autorização de origem — sempre "authorized_for_controlled_execution". */
  authorization_status: ExecutionAuthorizationPackage["authorization_status"];
  /**
   * Status local de execução — sempre "not_executed" nesta camada.
   * A próxima frente (G3.2+) atualizará para "executed" ou "failed".
   *
   * // Future (G3.2+): "executing" | "executed" | "failed" | "rolled_back"
   */
  execution_status: "not_executed";
  /** Detalhe operacional dos leads alvo — nome + motivo + prioridade. */
  target_leads_detail: OperationalLeadDetail[];
  /** Sequência de passos sugeridos para execução. */
  suggested_steps: string[];
  /** Abordagem/tom sugerido derivado do tipo de ação. */
  suggested_approach: string;
  /** Texto sugerido de contato (vazio quando não há base suficiente). */
  suggested_message: string;
  /** Guardrails canônicos de execução — condições obrigatórias antes de agir. */
  execution_guardrails: readonly ExecutionGuardrail[];
  /** Provas esperadas quando execução real acontecer (G3.2+). */
  expected_proofs: readonly ExpectedProof[];
  /** Expectativa de rollback para a execução futura. */
  rollback_expectation: string;
  /** Aviso explícito e canônico de não-execução. Sempre preenchido. */
  explicit_notice: string;
  /** Timestamp ISO local de quando o contrato foi preparado. Apenas referência local — não persistido. */
  contract_prepared_at_local: string;
  /** Referência ao action_id do pacote de autorização que originou este contrato. */
  authorization_package_ref: string;
  /** Referência ao pacote de pré-execução que originou a autorização. */
  pre_execution_package_ref: string;
  /** Confirmação explícita de que nenhuma execução ocorreu. Sempre true. */
  not_yet_executed: true;
  /**
   * Indica que este contrato está pronto para a próxima frente de execução real.
   * Sempre true quando o contrato existe — a execução real é responsabilidade de G3.2+.
   */
  ready_for_real_executor: true;
};

// ── Avisos e labels canônicos ─────────────────────────────────────────────

/**
 * EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE — aviso canônico de não-execução.
 *
 * [G3.1] Texto permanente e explícito de que o contrato foi preparado
 * mas nenhuma execução real ocorreu — e que isso é responsabilidade de G3.2+.
 */
export const EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE =
  "Contrato local de execução preparado. Esta ação ainda NÃO foi executada. " +
  "Nenhuma mensagem foi disparada. Nenhum lead foi movido. " +
  "A execução real depende da próxima frente (G3.2+) que ligará este contrato ao executor real.";

/**
 * EXECUTION_CONTRACT_READY_LABEL — label operacional para o estado contrato pronto.
 */
export const EXECUTION_CONTRACT_READY_LABEL = "Contrato local de execução preparado";

/**
 * EXECUTION_CONTRACT_READY_SUPPORT_TEXT — texto de apoio ao operador.
 */
export const EXECUTION_CONTRACT_READY_SUPPORT_TEXT =
  "Contrato local preparado · autorizado: sim · pronto para integração com executor real: sim · executado: não";

/**
 * FUTURE_SCOPE_NOTICE — declaração explícita das melhorias futuras fora do escopo.
 *
 * [G3.1] Declara formalmente o que está fora do escopo desta camada.
 */
export const FUTURE_SCOPE_NOTICE =
  "Fora do escopo (G3.2+): execução real · persistência real · integração com Worker/backend · " +
  "prova/log reais · rollback real · personalização por lead.";

// ── Builder do contrato local ─────────────────────────────────────────────

/**
 * buildExecutionContract — constrói o contrato canônico local de execução futura.
 *
 * [G3.1] Transforma uma autorização confirmada (G2.6) em um contrato formal
 * e auditável que a próxima frente poderá ligar ao executor real.
 *
 * Deve ser chamado somente quando o status de preparação for
 * "authorized_for_controlled_execution" — a transição para
 * "execution_contract_ready" é gerenciada pela máquina de estados.
 *
 * Nunca dispara side effect. Função pura e testável.
 *
 * @param authPackage  Pacote de autorização final humana (G2.6)
 * @param draft        Draft canônico de ação assistida (G2.1–G2.4)
 * @returns            Contrato canônico local de execução futura
 */
export function buildExecutionContract(
  authPackage: ExecutionAuthorizationPackage,
  draft: EnovaIaActionDraft,
): ExecutionContract {
  const targetDetail: OperationalLeadDetail[] =
    draft.target_leads_detail.length > 0
      ? draft.target_leads_detail
      : draft.target_leads.map((name, i) => ({
          name,
          reason: "",
          priority_order: i + 1,
        }));

  return {
    action_id:                    authPackage.action_id,
    action_type:                  draft.action_type,
    authorization_status:         authPackage.authorization_status,
    execution_status:             "not_executed",
    target_leads_detail:          targetDetail,
    suggested_steps:              draft.suggested_steps,
    suggested_approach:           draft.suggested_approach,
    suggested_message:            draft.suggested_message,
    execution_guardrails:         EXECUTION_GUARDRAILS,
    expected_proofs:              EXPECTED_PROOFS_BY_STATUS,
    rollback_expectation:         ROLLBACK_EXPECTATION,
    explicit_notice:              EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE,
    contract_prepared_at_local:   new Date().toISOString(),
    authorization_package_ref:    authPackage.action_id,
    pre_execution_package_ref:    authPackage.pre_execution_package_ref,
    not_yet_executed:             true,
    ready_for_real_executor:      true,
  };
}
