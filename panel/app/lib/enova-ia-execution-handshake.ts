// ============================================================
// Enova IA — Execution Handshake (G3.3) — Handshake Controlado
// panel/app/lib/enova-ia-execution-handshake.ts
//
// PR G3.3 — Handshake Controlado com Executor Real (Enova IA)
// Escopo: PANEL-ONLY, estado local, sem side effect, sem persistência.
//
// Propósito:
//   Cria a camada de handshake controlado entre o bridge payload local
//   (G3.2) e uma futura execução real — sem executar nada agora.
//
//   Esta camada define:
//   - O que está sendo entregue para futura execução real
//   - Qual subconjunto de tipos de ação é suportado
//   - Quais guardrails já passaram
//   - O que o executor real precisará devolver como ack mínimo
//   - Que a execução real ainda NÃO ocorreu
//   - Que este é apenas o handshake inicial — não o executor pleno
//
// O que esta camada FAZ:
//   - Tipar o ExecutionHandshakeRequest (o que o painel entrega)
//   - Tipar o ExecutionHandshakeAck (o que o executor real precisará devolver)
//   - Tipar o ControlledExecutionHandshake (contrato completo do handshake)
//   - Definir guardrails canônicos do handshake
//   - Construir o handshake a partir de um ExecutionBridgePayload (G3.2) pronto
//   - Declarar explicitamente que execução real ainda não ocorreu
//   - Declarar explicitamente o que ficou fora do escopo desta fase
//
// O que esta camada NÃO FAZ:
//   - Executar ação
//   - Persistir contrato, bridge, handshake ou estado
//   - Disparar mensagem
//   - Mover lead/base/status
//   - Chamar backend, Worker ou IA externa
//   - Confirmar ack real (isso é responsabilidade do executor real — G4+)
//   - Suportar todos os tipos de ação de uma vez
//   - Automatizar execução sem guardrail
//
// Subconjunto suportado nesta fase (diagnóstico):
//   followup_lote, reativacao_lote
//   → Mesmos da bridge (G3.2) — continuidade do subconjunto controlado
//   → Os demais ficam para G4+
//
// Fluxo canônico:
//   execution_bridge_ready
//     → (preparar_handshake_controlado) → execution_handshake_ready
//
// Dependências:
//   - enova-ia-execution-bridge.ts: ExecutionBridgePayload
//   - enova-ia-action-builder.ts: EnovaIaActionType
// ============================================================

import type { ExecutionBridgePayload } from "./enova-ia-execution-bridge";
import type { EnovaIaActionType } from "./enova-ia-action-builder";

// ── Subconjunto suportado nesta fase ──────────────────────────────────────

/**
 * HANDSHAKE_SUPPORTED_ACTION_TYPES — tipos de ação suportados neste handshake inicial.
 *
 * Continuidade do subconjunto controlado da bridge (G3.2):
 * followup_lote e reativacao_lote.
 * Qualquer expansão além disso requer nova frente (G4+).
 */
export const HANDSHAKE_SUPPORTED_ACTION_TYPES: readonly EnovaIaActionType[] = [
  "followup_lote",
  "reativacao_lote",
] as const;

// ── Guardrails canônicos do handshake ─────────────────────────────────────

/**
 * ExecutionHandshakeGuardrail — guardrail canônico do handshake controlado.
 */
export type ExecutionHandshakeGuardrail = {
  /** Identificador único do guardrail (snake_case). */
  id: string;
  /** Descrição legível da condição que precisa ser satisfeita. */
  rule: string;
  /** Consequência se o guardrail não for atendido. */
  consequence: string;
};

/**
 * HANDSHAKE_GUARDRAILS — guardrails canônicos do handshake controlado.
 *
 * Complementam os guardrails da bridge (G3.2).
 * Definem as condições específicas obrigatórias para o handshake.
 *
 * Mapeamento dos guardrails:
 * 1. Não preparar handshake sem bridge pronta
 * 2. Não preparar handshake para tipo não suportado
 * 3. Não considerar handshake válido sem autorização humana prévia
 * 4. Não considerar handshake válido sem campos mínimos esperados
 * 5. Não confundir handshake com execução
 * 6. Não permitir envio silencioso sem trilha esperada
 */
export const HANDSHAKE_GUARDRAILS: readonly ExecutionHandshakeGuardrail[] = [
  {
    id:          "require_bridge_ready",
    rule:        "Não preparar handshake sem bridge de integração inicial pronta (execution_bridge_ready)",
    consequence: "Handshake bloqueado — bridge local ausente ou não preparada",
  },
  {
    id:          "require_supported_action_type_handshake",
    rule:        "Não preparar handshake para tipo de ação fora do subconjunto suportado nesta fase",
    consequence: "Handshake bloqueado — apenas followup_lote e reativacao_lote são suportados agora",
  },
  {
    id:          "require_human_authorization",
    rule:        "Não considerar handshake válido sem autorização humana prévia confirmada no bridge/contrato",
    consequence: "Handshake bloqueado — autorização humana obrigatória em todas as fases",
  },
  {
    id:          "require_minimum_expected_fields",
    rule:        "Não considerar handshake válido sem campos mínimos esperados (action_id, bridge_status, supported_action_type)",
    consequence: "Handshake bloqueado — estrutura incompleta não pode ser entregue à próxima frente",
  },
  {
    id:          "forbid_confusion_with_execution",
    rule:        "Não confundir handshake com execução — handshake preparado ≠ execução real iniciada",
    consequence: "Handshake é somente contrato de entrega controlada — execução real requer G4+",
  },
  {
    id:          "forbid_silent_delivery",
    rule:        "Não permitir entrega silenciosa sem trilha esperada — o handshake deve registrar expected_ack_fields",
    consequence: "Handshake sem trilha de ack esperado é inválido nesta camada controlada",
  },
] as const;

// ── Tipo: o que o painel entrega ──────────────────────────────────────────

/**
 * ExecutionHandshakeRequest — o que o painel entrega para o executor real futuro.
 *
 * [G3.3] Representa o contrato de entrega do painel para a futura camada real.
 * Declara o que está sendo entregue, o subconjunto suportado, os guardrails
 * que já passaram e as expectativas mínimas de ack.
 */
export type ExecutionHandshakeRequest = {
  /** Identificador único da ação — preservado de ponta a ponta desde G2.1. */
  action_id: string;
  /** Tipo canônico da ação. */
  action_type: EnovaIaActionType;
  /**
   * Status do handshake na camada do painel.
   * "handshake_prepared" — handshake preparado, aguardando executor real.
   *
   * // Future (G4+): "handshake_sent" | "handshake_acked" | "handshake_failed"
   */
  handshake_status: "handshake_prepared";
  /** Status da bridge de origem — sempre "integration_prepared". */
  bridge_status: "integration_prepared";
  /** Indica se o action_type está no subconjunto suportado nesta fase. */
  supported_action_type: boolean;
  /** Tipos de ação suportados neste handshake. */
  handshake_supported_action_types: readonly EnovaIaActionType[];
  /** Guardrails já verificados antes de preparar o handshake. */
  guardrails_passed_summary: readonly string[];
  /**
   * Campos mínimos esperados no ack do executor real.
   * Define o contrato de retorno que a próxima frente (G4+) deve honrar.
   */
  expected_ack_fields: readonly string[];
  /** Referência ao bridge payload de origem (action_id). */
  bridge_payload_ref: string;
  /** Aviso explícito e canônico. Sempre preenchido. */
  explicit_notice: string;
  /**
   * Aviso de não-execução real — explícito e obrigatório.
   * Confirma que nenhuma execução real ocorreu neste handshake.
   */
  real_execution_not_started: true;
  /**
   * Flag canônica — confirma que execução real ainda não foi iniciada.
   * Diferencia handshake de execução de forma explícita.
   */
  requires_executor_confirmation: true;
  /** Timestamp ISO local de quando o handshake request foi preparado. Apenas referência local — não persistido. */
  handshake_prepared_at_local: string;
};

// ── Tipo: o que o executor real precisará devolver ────────────────────────

/**
 * ExecutionHandshakeAck — modelo de ack mínimo esperado do executor real.
 *
 * [G3.3] Define o contrato de retorno que o executor real (G4+) precisará
 * honrar ao receber o handshake. Este modelo é local e declarativo —
 * ainda não existe executor real para preenchê-lo.
 *
 * // Future (G4+): executor real preenche este modelo com confirmação real.
 */
export type ExecutionHandshakeAck = {
  /** Identificador da ação que recebeu o ack — deve bater com action_id do request. */
  action_id: string;
  /**
   * Status do ack do executor real.
   * Nesta fase local, sempre "ack_not_received" — ainda não há executor real.
   *
   * // Future (G4+): "ack_received" | "ack_failed" | "ack_partial"
   */
  ack_status: "ack_not_received";
  /** Confirmação de que o ack real não foi recebido (executor real ausente). Sempre true nesta fase. */
  real_ack_absent: true;
  /** Aviso explícito de que o ack real não existe ainda. Sempre preenchido. */
  ack_notice: string;
};

// ── Tipo canônico do handshake controlado ────────────────────────────────

/**
 * ControlledExecutionHandshake — contrato completo do handshake controlado.
 *
 * [G3.3] Combina o ExecutionHandshakeRequest (o que o painel entrega) com
 * o ExecutionHandshakeAck (modelo do que o executor real precisará devolver).
 *
 * Declara de forma inequívoca:
 * - bridge: pronta
 * - handshake: preparado
 * - execução real: ainda não iniciada
 * - ack real: ainda não recebido
 * - tipo suportado: explícito
 *
 * // Future (G4+): a próxima camada consome este handshake e inicia execução real.
 */
export type ControlledExecutionHandshake = {
  /** Request do painel — o que está sendo entregue. */
  handshake_request: ExecutionHandshakeRequest;
  /** Modelo de ack esperado do executor real — ainda não preenchido. */
  handshake_ack_model: ExecutionHandshakeAck;
  /** Guardrails canônicos do handshake. */
  handshake_guardrails: readonly ExecutionHandshakeGuardrail[];
  /** Declaração explícita do que ficou fora do escopo nesta fase. */
  out_of_scope_notice: string;
};

// ── Avisos e labels canônicos ─────────────────────────────────────────────

/**
 * HANDSHAKE_NOT_EXECUTED_NOTICE — aviso canônico de não-execução no handshake.
 *
 * [G3.3] Texto permanente e explícito de que o handshake foi preparado
 * mas nenhuma execução real ocorreu — e que isso é responsabilidade de G4+.
 */
export const HANDSHAKE_NOT_EXECUTED_NOTICE =
  "Handshake controlado preparado. Execução real ainda NÃO foi iniciada. " +
  "Nenhuma mensagem foi disparada. Nenhum lead foi movido. " +
  "O executor real (G4+) precisará receber este handshake e devolver o ack mínimo esperado.";

/**
 * HANDSHAKE_READY_LABEL — label operacional para o estado handshake pronto.
 */
export const HANDSHAKE_READY_LABEL = "Handshake controlado preparado";

/**
 * HANDSHAKE_READY_SUPPORT_TEXT — texto de apoio ao operador.
 */
export const HANDSHAKE_READY_SUPPORT_TEXT =
  "Bridge: pronta · handshake: preparado · execução real: não iniciada · ack real: não recebido";

/**
 * HANDSHAKE_ACK_NOT_RECEIVED_NOTICE — aviso de que o ack real não existe ainda.
 */
export const HANDSHAKE_ACK_NOT_RECEIVED_NOTICE =
  "Ack mínimo esperado definido. Executor real (G4+) ainda não retornou confirmação. " +
  "Nenhuma execução real ocorreu nesta fase.";

/**
 * HANDSHAKE_OUT_OF_SCOPE_NOTICE — declaração explícita do que ficou fora desta fase.
 *
 * [G3.3] Declara formalmente o que está fora do escopo desta camada.
 */
export const HANDSHAKE_OUT_OF_SCOPE_NOTICE =
  "Fora do escopo desta fase: execução real · ack real do executor · persistência real · " +
  "integração Worker/backend · prova/log reais · rollback real · multi-action full · " +
  "automação em escala · personalização por lead · expansão de tipos suportados (G4+).";

/**
 * HANDSHAKE_EXPECTED_ACK_FIELDS — campos mínimos esperados no ack do executor real.
 *
 * [G3.3] Define o contrato de retorno que a próxima frente (G4+) deve honrar.
 */
export const HANDSHAKE_EXPECTED_ACK_FIELDS: readonly string[] = [
  "action_id",
  "ack_status",
  "execution_started",
  "execution_timestamp",
  "executor_ref",
  "guardrails_respected",
] as const;

// ── Builder do handshake controlado ──────────────────────────────────────

/**
 * buildControlledExecutionHandshake — constrói o handshake controlado canônico.
 *
 * [G3.3] Transforma um ExecutionBridgePayload (G3.2) pronto no handshake
 * controlado que representa a camada entre a bridge local e o executor real futuro.
 *
 * Deve ser chamado somente quando o status de preparação for
 * "execution_bridge_ready" — a transição para "execution_handshake_ready"
 * é gerenciada pela máquina de estados.
 *
 * Nunca dispara side effect. Função pura e testável.
 *
 * @param bridge  Bridge payload canônico local (G3.2)
 * @returns       Handshake controlado canônico (sempre não-nulo)
 */
export function buildControlledExecutionHandshake(
  bridge: ExecutionBridgePayload,
): ControlledExecutionHandshake {
  const supported = bridge.action_type_supported;

  const request: ExecutionHandshakeRequest = {
    action_id:                        bridge.action_id,
    action_type:                      bridge.action_type,
    handshake_status:                 "handshake_prepared",
    bridge_status:                    "integration_prepared",
    supported_action_type:            supported,
    handshake_supported_action_types: HANDSHAKE_SUPPORTED_ACTION_TYPES,
    guardrails_passed_summary:        HANDSHAKE_GUARDRAILS.map((g) => g.rule),
    expected_ack_fields:              HANDSHAKE_EXPECTED_ACK_FIELDS,
    bridge_payload_ref:               bridge.action_id,
    explicit_notice:                  HANDSHAKE_NOT_EXECUTED_NOTICE,
    real_execution_not_started:       true,
    requires_executor_confirmation:   true,
    handshake_prepared_at_local:      new Date().toISOString(),
  };

  const ackModel: ExecutionHandshakeAck = {
    action_id:       bridge.action_id,
    ack_status:      "ack_not_received",
    real_ack_absent: true,
    ack_notice:      HANDSHAKE_ACK_NOT_RECEIVED_NOTICE,
  };

  return {
    handshake_request:    request,
    handshake_ack_model:  ackModel,
    handshake_guardrails: HANDSHAKE_GUARDRAILS,
    out_of_scope_notice:  HANDSHAKE_OUT_OF_SCOPE_NOTICE,
  };
}
