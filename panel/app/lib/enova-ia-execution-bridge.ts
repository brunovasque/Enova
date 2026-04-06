// ============================================================
// Enova IA — Execution Bridge (G3.2) — Integração Inicial Controlada
// panel/app/lib/enova-ia-execution-bridge.ts
//
// PR G3.2 — Executor Real Controlado (integração inicial)
// Escopo: PANEL-ONLY, estado local, sem side effect, sem persistência.
//
// Propósito:
//   Cria a primeira ponte segura entre o contrato local (G3.1) e uma
//   futura camada de execução real — sem executar nada agora.
//
//   Esta camada faz o "handoff controlado": pega o ExecutionContract
//   já preparado e constrói um ExecutionBridgePayload que comunica
//   explicitamente:
//   - qual ação está pronta para a tentativa futura
//   - qual subconjunto de tipos de ação é suportado nesta fase inicial
//   - quais tipos de ação ainda não são suportados nesta fase
//   - quais guardrails adicionais se aplicam à bridge
//   - que a execução real ainda NÃO ocorreu
//   - que esta é apenas a integração inicial — não o executor pleno
//
// O que esta camada FAZ:
//   - Tipar o ExecutionBridgePayload canônico
//   - Definir o subconjunto de action_types suportados na bridge inicial
//   - Definir guardrails canônicos da bridge
//   - Construir o payload a partir de um ExecutionContract (G3.1) pronto
//   - Declarar explicitamente que execução real ainda não ocorreu
//   - Declarar explicitamente o que ficou fora do escopo desta fase
//   - Sempre retornar payload (com action_type_supported=false para tipos não suportados)
//
// O que esta camada NÃO FAZ:
//   - Executar ação
//   - Persistir contrato, bridge ou estado
//   - Disparar mensagem
//   - Mover lead/base/status
//   - Chamar backend, Worker ou IA externa
//   - Suportar todos os tipos de ação de uma vez
//   - Automatizar execução sem guardrail
//
// Subconjunto suportado nesta fase (diagnóstico):
//   followup_lote, reativacao_lote
//   → Ações de contato direto já tipadas, com leads identificados e mensagem sugerida
//   → São as mais controláveis como primeira tentativa de bridge
//   → Permitem prova clara (mensagem enviada por lead alvo)
//
// Subconjunto NÃO suportado nesta fase:
//   mutirao_docs, pre_plantao, intervencao_humana, campanha_sugerida
//   → Requerem suporte de backend mais complexo — ficam para G4+
//
// Fluxo canônico:
//   execution_contract_ready
//     → (preparar_bridge_integracao) → execution_bridge_ready
//
// Dependências:
//   - enova-ia-execution-contract.ts: ExecutionContract
//   - enova-ia-action-builder.ts: EnovaIaActionType
// ============================================================

import type { ExecutionContract } from "./enova-ia-execution-contract";
import type { EnovaIaActionType } from "./enova-ia-action-builder";

// ── Subconjunto suportado nesta fase inicial ──────────────────────────────

/**
 * BRIDGE_SUPPORTED_ACTION_TYPES — tipos de ação suportados nesta bridge inicial.
 *
 * Diagnóstico: followup_lote e reativacao_lote são os mais seguros para uma
 * primeira tentativa de bridge porque:
 * - São ações de contato direto com leads já identificados e tipados
 * - Já possuem suggested_message gerado quando há base suficiente
 * - São os mais controláveis em uma primeira camada de integração
 * - Permitem prova clara (mensagem enviada por lead alvo)
 *
 * Os demais tipos ficam para G4+ (ver BRIDGE_UNSUPPORTED_ACTION_TYPES).
 */
export const BRIDGE_SUPPORTED_ACTION_TYPES: readonly EnovaIaActionType[] = [
  "followup_lote",
  "reativacao_lote",
] as const;

/**
 * BRIDGE_UNSUPPORTED_ACTION_TYPES — tipos de ação NÃO suportados nesta fase.
 *
 * Permanecem fora do escopo desta bridge inicial porque requerem
 * suporte de backend mais complexo, múltiplas etapas ou coordenação
 * com sistemas externos não disponíveis nesta fase.
 *
 * // Future (G4+): suporte expandido por tipo de ação
 */
export const BRIDGE_UNSUPPORTED_ACTION_TYPES: readonly EnovaIaActionType[] = [
  "mutirao_docs",
  "pre_plantao",
  "intervencao_humana",
  "campanha_sugerida",
] as const;

// ── Guardrails canônicos da bridge ────────────────────────────────────────

/**
 * ExecutionBridgeGuardrail — guardrail canônico da integração inicial.
 */
export type ExecutionBridgeGuardrail = {
  /** Identificador único do guardrail (snake_case). */
  id: string;
  /** Descrição legível da condição que precisa ser satisfeita. */
  rule: string;
  /** Consequência se o guardrail não for atendido. */
  consequence: string;
};

/**
 * BRIDGE_GUARDRAILS — guardrails canônicos da bridge inicial.
 *
 * Complementam os EXECUTION_GUARDRAILS do contrato (G3.1).
 * Definem as condições específicas obrigatórias para a bridge.
 *
 * Mapeamento dos guardrails:
 * 1. Não iniciar bridge sem contrato local pronto
 * 2. Não iniciar bridge para tipo de ação fora do subconjunto suportado
 * 3. Não iniciar bridge sem autorização humana confirmada no contrato
 * 4. Não iniciar bridge sem alvos válidos no contrato de origem
 * 5. Não executar ação real nesta camada — bridge é só preparação
 */
export const BRIDGE_GUARDRAILS: readonly ExecutionBridgeGuardrail[] = [
  {
    id:          "require_execution_contract_ready",
    rule:        "Não iniciar bridge sem contrato local pronto (execution_contract_ready)",
    consequence: "Bridge bloqueada — contrato local ausente ou não preparado",
  },
  {
    id:          "require_supported_action_type_bridge",
    rule:        "Não iniciar bridge para tipo de ação fora do subconjunto suportado nesta fase",
    consequence: "Bridge bloqueada — apenas followup_lote e reativacao_lote são suportados agora",
  },
  {
    id:          "require_authorized_contract",
    rule:        "Não iniciar bridge sem authorized_for_controlled_execution confirmado no contrato",
    consequence: "Bridge bloqueada — contrato sem autorização humana não pode avançar",
  },
  {
    id:          "require_valid_targets_bridge",
    rule:        "Não iniciar bridge sem alvos válidos no contrato de origem",
    consequence: "Bridge bloqueada — lista de alvos vazia no contrato de origem",
  },
  {
    id:          "forbid_real_execution_in_bridge",
    rule:        "Não executar ação real nesta camada — bridge é apenas preparação de integração",
    consequence: "Bridge é somente handoff controlado — execução real requer próxima frente (G4+)",
  },
] as const;

// ── Tipo canônico do payload de bridge ────────────────────────────────────

/**
 * ExecutionBridgePayload — payload canônico da integração inicial controlada.
 *
 * [G3.2] Representa a primeira ponte segura entre o contrato local (G3.1)
 * e uma futura execução real. Declara tudo que seria necessário para a
 * próxima camada se conectar — sem ter executado nada.
 *
 * Campos obrigatórios comunicam explicitamente:
 * - bridge_status: "integration_prepared"   → ponte preparada, NÃO executando
 * - execution_real_not_started: true         → nenhuma execução real ocorreu
 * - action_type_supported: boolean           → tipo de ação suportado nesta fase?
 * - explicit_notice                          → aviso textual canônico
 *
 * // Future (G4+): a próxima camada lê este payload e inicia execução real com trilha
 */
export type ExecutionBridgePayload = {
  /** Identificador único da ação — preservado de ponta a ponta desde G2.1. */
  action_id: string;
  /** Tipo canônico da ação. */
  action_type: EnovaIaActionType;
  /**
   * Status da bridge — sempre "integration_prepared" nesta camada.
   * Declara que a integração inicial foi preparada, mas a execução real não ocorreu.
   *
   * // Future (G4+): "executing" | "executed" | "failed" | "rolled_back"
   */
  bridge_status: "integration_prepared";
  /** Indica se o action_type está no subconjunto suportado nesta fase. */
  action_type_supported: boolean;
  /** Tipos de ação suportados nesta fase inicial. */
  supported_action_types: readonly EnovaIaActionType[];
  /** Tipos de ação NÃO suportados nesta fase — explícito para transparência. */
  unsupported_action_types: readonly EnovaIaActionType[];
  /** Guardrails canônicos da bridge — condições obrigatórias antes de qualquer execução real. */
  bridge_guardrails: readonly ExecutionBridgeGuardrail[];
  /** Referência ao ExecutionContract de origem (action_id). */
  execution_contract_ref: string;
  /** Status do contrato de origem — sempre "not_executed". */
  contract_execution_status: "not_executed";
  /** Confirmação explícita de que execução real não foi iniciada. Sempre true. */
  execution_real_not_started: true;
  /** Confirmação explícita de que o contrato local está pronto. Sempre true. */
  local_contract_ready: true;
  /** Confirmação de que a integração inicial foi preparada. Sempre true. */
  integration_initial_prepared: true;
  /** Aviso explícito e canônico. Sempre preenchido. */
  explicit_notice: string;
  /** Declaração explícita do que ficou fora do escopo nesta fase. */
  out_of_scope_notice: string;
  /** Timestamp ISO local de quando o bridge payload foi preparado. Apenas referência local — não persistido. */
  bridge_prepared_at_local: string;
};

// ── Avisos e labels canônicos ─────────────────────────────────────────────

/**
 * BRIDGE_NOT_EXECUTED_NOTICE — aviso canônico de não-execução na bridge.
 *
 * [G3.2] Texto permanente e explícito de que o bridge payload foi preparado
 * mas nenhuma execução real ocorreu — e que isso é responsabilidade de G4+.
 */
export const BRIDGE_NOT_EXECUTED_NOTICE =
  "Integração inicial preparada. Execução real ainda NÃO foi iniciada. " +
  "Nenhuma mensagem foi disparada. Nenhum lead foi movido. " +
  "A execução real depende da próxima frente (G4+) que consumirá este payload.";

/**
 * BRIDGE_READY_LABEL — label operacional para o estado bridge pronto.
 */
export const BRIDGE_READY_LABEL = "Integração inicial preparada";

/**
 * BRIDGE_READY_SUPPORT_TEXT — texto de apoio ao operador.
 */
export const BRIDGE_READY_SUPPORT_TEXT =
  "Contrato local: pronto · integração inicial: preparada · execução real: não iniciada";

/**
 * BRIDGE_OUT_OF_SCOPE_NOTICE — declaração explícita do que ficou fora desta fase.
 *
 * [G3.2] Declara formalmente o que está fora do escopo desta camada.
 */
export const BRIDGE_OUT_OF_SCOPE_NOTICE =
  "Fora do escopo desta fase: execução real · persistência real · integração Worker/backend · " +
  "prova/log reais · rollback real · multi-action full · automação em escala · " +
  "suporte a mutirao_docs, pre_plantao, intervencao_humana, campanha_sugerida (G4+).";

/**
 * BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE — aviso quando action_type não é suportado.
 *
 * [G3.2] Texto exibido quando o tipo de ação do contrato não está no subconjunto
 * suportado nesta fase inicial da bridge.
 */
export const BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE =
  "Tipo de ação não suportado nesta fase da bridge. " +
  "Apenas followup_lote e reativacao_lote são suportados na integração inicial. " +
  "Os demais tipos de ação ficam para G4+.";

// ── Builder do payload de bridge ──────────────────────────────────────────

/**
 * buildExecutionBridgePayload — constrói o payload canônico da integração inicial.
 *
 * [G3.2] Transforma um ExecutionContract (G3.1) pronto na primeira ponte
 * segura para uma futura execução real.
 *
 * Deve ser chamado somente quando o status de preparação for
 * "execution_contract_ready" — a transição para "execution_bridge_ready"
 * é gerenciada pela máquina de estados.
 *
 * Quando o action_type não está no subconjunto suportado, o payload ainda
 * é retornado com action_type_supported=false e explicit_notice informando
 * o motivo — para que a UI comunique claramente o estado ao operador.
 *
 * Nunca dispara side effect. Função pura e testável.
 *
 * @param contract  Contrato canônico local de execução futura (G3.1)
 * @returns         Payload de bridge canônico (sempre não-nulo)
 */
export function buildExecutionBridgePayload(
  contract: ExecutionContract,
): ExecutionBridgePayload {
  const supported = (BRIDGE_SUPPORTED_ACTION_TYPES as readonly string[]).includes(
    contract.action_type,
  );

  return {
    action_id:                    contract.action_id,
    action_type:                  contract.action_type,
    bridge_status:                "integration_prepared",
    action_type_supported:        supported,
    supported_action_types:       BRIDGE_SUPPORTED_ACTION_TYPES,
    unsupported_action_types:     BRIDGE_UNSUPPORTED_ACTION_TYPES,
    bridge_guardrails:            BRIDGE_GUARDRAILS,
    execution_contract_ref:       contract.action_id,
    contract_execution_status:    "not_executed",
    execution_real_not_started:   true,
    local_contract_ready:         true,
    integration_initial_prepared: true,
    explicit_notice:              supported
      ? BRIDGE_NOT_EXECUTED_NOTICE
      : BRIDGE_UNSUPPORTED_ACTION_TYPE_NOTICE,
    out_of_scope_notice:          BRIDGE_OUT_OF_SCOPE_NOTICE,
    bridge_prepared_at_local:     new Date().toISOString(),
  };
}
