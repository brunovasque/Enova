// ============================================================
// Lead Autonomy — panel/app/lib/lead-autonomy.ts
//
// PR 9 — Solicitação de Ampliação de Autonomia + Executor Assistido de Baixo Risco
// Escopo: PANEL-ONLY, read-only/assistido, sem automação, sem IA externa.
//
// Propósito:
//   Recebe LeadSignals (PR1), LeadCognitiveState (PR2) e opcionalmente
//   LeadFollowupOrganizer (PR4), LeadDocsReading (PR5),
//   LeadReclassificationReading (PR6), LeadVisitReadiness (PR7) e
//   LeadMetaOpsReading (PR8), e devolve uma leitura canônica de:
//     - autonomia sugerida para este caso
//     - motivo do pedido de autonomia
//     - nível de risco da execução
//     - ação de baixo risco sugerida (apenas se executável no painel)
//     - se executor assistido está habilitado
//     - se precisa aprovação humana
//     - justificativa operacional curta
//
// Perguntas que esta camada responde:
//   1. Este caso pede mais autonomia para a Enova?
//   2. Qual autonomia específica faria sentido pedir?
//   3. Essa autonomia seria segura ou não?
//   4. Existe uma ação de baixo risco que já pode ser executada de forma
//      assistida no CRM?
//   5. Qual é a justificativa operacional para isso?
//
// O que esta camada FAZ:
//   - Ler sinais reais e estados derivados das PRs anteriores
//   - Sugerir autonomia baseada em sinais reais
//   - Identificar e qualificar nível de risco da execução
//   - Habilitar executor assistido somente para ações de baixo risco
//   - Justificar a leitura de forma objetiva e curta
//
// O que esta camada NÃO FAZ:
//   - Executar ação automática sozinha
//   - Mandar mensagem sozinha
//   - Mover base ou escrever no banco
//   - Criar automação real ou scheduler
//   - Mexer em Worker/schema
//   - Chamar IA externa
//   - Inventar autonomia onde não há sinal suficiente
//
// Princípios:
//   - Preferir segurança a criatividade
//   - Sem "autonomia" fake
//   - Sem chamar de executor algo que não executa
//   - Sem falsa precisão
//   - Justificativa curta e operacional
//   - Toda execução continua dependente de gesto humano
// ============================================================

import type { LeadSignals } from "./lead-signals";
import type { LeadCognitiveState } from "./lead-cognitive";
import type { LeadFollowupOrganizer } from "./lead-followup";
import type { LeadDocsReading } from "./lead-docs";
import type { LeadReclassificationReading } from "./lead-reclassification";
import type { LeadVisitReadiness } from "./lead-visit-readiness";
import type { LeadMetaOpsReading } from "./lead-meta-ops";

// ── Tipos canônicos de saída ───────────────────────────────────────────────

/**
 * AutonomiaSugerida — tipo de ampliação de autonomia que faria sentido pedir
 * para este caso específico.
 */
export type AutonomiaSugerida =
  | "nenhuma"
  | "followup_assistido"
  | "reativacao_assistida"
  | "docs_assistido"
  | "visita_assistida"
  | "ajuste_operacional"
  | "intervencao_humana";

/**
 * MotivoPedidoAutonomia — por que a autonomia assistida faria sentido aqui.
 */
export type MotivoPedidoAutonomia =
  | "caso_repetitivo"
  | "janela_clara_de_acao"
  | "baixo_risco_operacional"
  | "travamento_recorrente"
  | "falta_execucao_manual"
  | "precisa_decisao_humana"
  | "sem_motivo_claro";

/**
 * NivelRiscoExecucao — risco operacional de executar a ação sugerida.
 */
export type NivelRiscoExecucao = "baixo" | "medio" | "alto";

/**
 * AcaoBaixoRiscoSugerida — ação concreta de baixo risco que pode ser
 * executada de forma assistida reaproveitando fluxos já validados no painel.
 * "nenhuma" quando não há ação adequada ou o risco não é baixo.
 */
export type AcaoBaixoRiscoSugerida =
  | "abrir_modal_followup"
  | "abrir_modal_chamar_cliente"
  | "abrir_modal_docs"
  | "abrir_modal_visita"
  | "abrir_modal_reativacao"
  | "nenhuma";

/**
 * ExecutorAssistidoHabilitado — se o executor assistido está habilitado
 * para este caso (somente quando nível de risco é baixo e há ação disponível).
 */
export type ExecutorAssistidoHabilitado = "sim" | "nao" | "incerto";

/**
 * PrecisaAprovacaoHumana — se a ação sugerida requer aprovação/gesto humano
 * explícito antes de qualquer execução.
 */
export type PrecisaAprovacaoHumana = "sim" | "nao";

/**
 * LeadAutonomyReading — saída canônica da camada de autonomia assistida.
 *
 * Todos os campos são obrigatórios.
 * Saída read-only — sem escrita em banco, sem automação.
 * O executor assistido só é habilitado quando nivel_risco_execucao = "baixo"
 * e há ação de baixo risco disponível.
 */
export type LeadAutonomyReading = {
  /** Tipo de ampliação de autonomia que faria sentido para este caso. */
  autonomia_sugerida: AutonomiaSugerida;
  /** Por que esta autonomia faz sentido agora (baseado em sinais reais). */
  motivo_pedido_autonomia: MotivoPedidoAutonomia;
  /** Nível de risco operacional da execução da ação sugerida. */
  nivel_risco_execucao: NivelRiscoExecucao;
  /**
   * Ação de baixo risco disponível no painel para execução assistida.
   * "nenhuma" quando risco não é baixo ou não há ação adequada.
   */
  acao_baixo_risco_sugerida: AcaoBaixoRiscoSugerida;
  /**
   * Executor assistido habilitado somente quando:
   *   - nivel_risco_execucao = "baixo"
   *   - acao_baixo_risco_sugerida ≠ "nenhuma"
   */
  executor_assistido_habilitado: ExecutorAssistidoHabilitado;
  /**
   * Sempre "sim" — toda ação requer gesto humano explícito.
   * Campo mantido para clareza semântica e contratos futuros.
   */
  precisa_aprovacao_humana: PrecisaAprovacaoHumana;
  /** Justificativa curta e operacional baseada em sinais reais. */
  justificativa_autonomia: string;
};

// ── Constantes internas ───────────────────────────────────────────────────

/** Dias sem resposta a partir dos quais o caso é considerado parado. */
const DIAS_CASO_PARADO = 5;

/** Dias sem resposta a partir dos quais o caso é considerado travado. */
const DIAS_CASO_TRAVADO = 10;

// ── Derivações internas ───────────────────────────────────────────────────

function deriveAutonomiaSugerida(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  followupState: LeadFollowupOrganizer | null,
  docsState: LeadDocsReading | null,
  reclassState: LeadReclassificationReading | null,
  visitReadinessState: LeadVisitReadiness | null,
  metaOpsState: LeadMetaOpsReading | null,
): AutonomiaSugerida {
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  const faseFunil = signals.operacao.fase_funil ?? "";
  const faseTravamento = signals.operacao.fase_travamento;

  // Intervenção humana explícita sempre tem prioridade
  if (
    cognitiveState.proxima_melhor_acao === "pedir_intervencao_humana" ||
    cognitiveState.estado_cliente === "arquivavel" ||
    metaOpsState?.gargalo_principal === "travamento_humano"
  ) {
    return "intervencao_humana";
  }

  // Lead pronto para visita → visita assistida
  if (
    visitReadinessState?.lead_pronto_para_visita === "sim" ||
    visitReadinessState?.acao_plantao_sugerida === "convidar_para_plantao"
  ) {
    return "visita_assistida";
  }

  // Lead com reativação clara → reativação assistida
  if (
    reclassState?.reclassificacao_sugerida === "mover_para_reativacao" ||
    reclassState?.acao_reativacao_sugerida === "reativar_agora" ||
    reclassState?.lead_frio_recuperavel === "sim"
  ) {
    return "reativacao_assistida";
  }

  // Docs bloqueando → docs assistido
  if (
    docsState?.maturidade_docs === "alta" ||
    docsState?.acao_docs_sugerida === "estimular_docs" ||
    (faseFunil.includes("doc") && dias >= DIAS_CASO_PARADO)
  ) {
    return "docs_assistido";
  }

  // Follow-up urgente ou janela clara → follow-up assistido
  if (
    followupState?.urgencia_followup === "alta" ||
    followupState?.acao_followup_sugerida === "chamar_agora" ||
    (dias >= DIAS_CASO_PARADO && cognitiveState.nivel_interesse !== "baixo" && !faseTravamento)
  ) {
    return "followup_assistido";
  }

  // Fase travada por problema operacional simples → ajuste operacional
  if (
    faseTravamento &&
    cognitiveState.nivel_interesse !== "baixo" &&
    metaOpsState?.tipo_melhoria_sugerida === "ajuste_followup"
  ) {
    return "ajuste_operacional";
  }

  return "nenhuma";
}

function deriveMotivoPedido(
  autonomia: AutonomiaSugerida,
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  metaOpsState: LeadMetaOpsReading | null,
): MotivoPedidoAutonomia {
  if (autonomia === "nenhuma") return "sem_motivo_claro";

  if (autonomia === "intervencao_humana") return "precisa_decisao_humana";

  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  const faseTravamento = signals.operacao.fase_travamento;

  // Travamento recorrente detectado via sinais e meta-ops
  if (
    faseTravamento ||
    metaOpsState?.gargalo_principal === "travamento_followup" ||
    metaOpsState?.gargalo_principal === "travamento_reativacao" ||
    dias >= DIAS_CASO_TRAVADO
  ) {
    return "travamento_recorrente";
  }

  // Janela clara de ação (momento de compra imediato)
  if (
    cognitiveState.momento_compra === "agora" ||
    cognitiveState.momento_compra === "curto_prazo"
  ) {
    return "janela_clara_de_acao";
  }

  // Caso com padrão repetitivo (follow-up esperado sem execução)
  if (dias >= DIAS_CASO_PARADO && signals.interacao.bola_com === "enova") {
    return "falta_execucao_manual";
  }

  // Baixo risco operacional geral
  if (cognitiveState.risco_travamento === "baixo") {
    return "baixo_risco_operacional";
  }

  return "caso_repetitivo";
}

function deriveNivelRisco(
  autonomia: AutonomiaSugerida,
  cognitiveState: LeadCognitiveState,
  signals: LeadSignals,
  reclassState: LeadReclassificationReading | null,
): NivelRiscoExecucao {
  // Intervenção humana = risco alto (não deve ser executado automaticamente)
  if (autonomia === "intervencao_humana" || autonomia === "nenhuma") return "alto";

  // Estado do cliente arquivável ou interesse baixo aumenta risco
  if (
    cognitiveState.estado_cliente === "arquivavel" ||
    cognitiveState.nivel_interesse === "baixo"
  ) {
    return "alto";
  }

  // Reclassificação complexa aumenta risco
  if (
    reclassState?.reclassificacao_sugerida === "arquivavel" ||
    reclassState?.calor_real_lead === "frio"
  ) {
    return "medio";
  }

  // Risco de travamento alto/médio eleva risco de execução
  if (cognitiveState.risco_travamento === "alto") return "alto";
  if (cognitiveState.risco_travamento === "medio") return "medio";

  // Follow-up e chamar cliente são as ações de menor risco
  if (
    autonomia === "followup_assistido" ||
    autonomia === "ajuste_operacional"
  ) {
    return "baixo";
  }

  // Docs e reativação são baixo risco quando há sinal claro
  if (
    autonomia === "docs_assistido" ||
    autonomia === "reativacao_assistida"
  ) {
    const diasSem = signals.interacao.dias_sem_resposta_cliente ?? 0;
    return diasSem >= DIAS_CASO_TRAVADO ? "medio" : "baixo";
  }

  // Visita tem nível de risco médio por padrão (envolve agenda externa)
  if (autonomia === "visita_assistida") return "medio";

  return "baixo";
}

function deriveAcaoBaixoRisco(
  autonomia: AutonomiaSugerida,
  nivelRisco: NivelRiscoExecucao,
  followupState: LeadFollowupOrganizer | null,
  docsState: LeadDocsReading | null,
  reclassState: LeadReclassificationReading | null,
  visitReadinessState: LeadVisitReadiness | null,
): AcaoBaixoRiscoSugerida {
  // Somente ações de baixo risco são habilitadas
  if (nivelRisco !== "baixo") return "nenhuma";

  switch (autonomia) {
    case "followup_assistido":
      // Reaproveitamos o modal "Chamar cliente" já validado no painel
      return followupState?.acao_followup_sugerida === "chamar_agora"
        ? "abrir_modal_chamar_cliente"
        : "abrir_modal_followup";

    case "docs_assistido":
      return docsState?.acao_docs_sugerida === "estimular_docs" ||
        docsState?.acao_docs_sugerida === "chamar_cliente"
        ? "abrir_modal_docs"
        : "nenhuma";

    case "reativacao_assistida":
      return reclassState?.acao_reativacao_sugerida === "reativar_agora"
        ? "abrir_modal_reativacao"
        : "nenhuma";

    case "visita_assistida":
      // Visita só é baixo risco em casos específicos (verificado antes)
      return visitReadinessState?.acao_plantao_sugerida === "convidar_para_plantao"
        ? "abrir_modal_visita"
        : "nenhuma";

    case "ajuste_operacional":
      return "abrir_modal_followup";

    default:
      return "nenhuma";
  }
}

function deriveExecutorAssistido(
  nivelRisco: NivelRiscoExecucao,
  acao: AcaoBaixoRiscoSugerida,
): ExecutorAssistidoHabilitado {
  if (nivelRisco === "baixo" && acao !== "nenhuma") return "sim";
  if (nivelRisco === "medio") return "incerto";
  return "nao";
}

function buildJustificativaAutonomia(
  autonomia: AutonomiaSugerida,
  motivo: MotivoPedidoAutonomia,
  nivelRisco: NivelRiscoExecucao,
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): string {
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  const nome = signals.identificacao.nome ?? "Lead";

  if (autonomia === "nenhuma") {
    return `${nome}: sem sinal suficiente para sugerir ampliação de autonomia agora.`;
  }

  if (autonomia === "intervencao_humana") {
    return `${nome}: caso requer decisão humana — autonomia assistida não é adequada neste momento.`;
  }

  const diasStr = dias > 0 ? ` (${dias}d sem resposta)` : "";
  const riscoStr = nivelRisco === "baixo" ? "baixo risco" : nivelRisco === "medio" ? "risco médio" : "alto risco";

  switch (autonomia) {
    case "followup_assistido":
      if (motivo === "janela_clara_de_acao") {
        return `${nome}: janela clara de ação${diasStr} — follow-up assistido de ${riscoStr} indicado.`;
      }
      if (motivo === "travamento_recorrente") {
        return `${nome}: travamento recorrente${diasStr} — follow-up assistido de ${riscoStr} pode destravar.`;
      }
      return `${nome}: caso parado${diasStr} — follow-up assistido de ${riscoStr} recomendado.`;

    case "reativacao_assistida":
      return `${nome}: lead com perfil de reativação${diasStr} — reativação assistida de ${riscoStr} disponível.`;

    case "docs_assistido":
      return `${nome}: documentação pendente${diasStr} — envio assistido de checklist de ${riscoStr}.`;

    case "visita_assistida":
      return `${nome}: perfil pronto para visita — agendamento assistido de ${riscoStr}.`;

    case "ajuste_operacional":
      return `${nome}: travamento operacional${diasStr} — ajuste assistido de ${riscoStr} pode resolver.`;

    default:
      return `${nome}: sinal detectado — ${riscoStr} — autonomia assistida disponível.`;
  }
}

// ── Função principal exportada ─────────────────────────────────────────────

/**
 * readLeadAutonomy — Camada canônica de Autonomia Assistida (read-only).
 *
 * Recebe sinais reais e estados derivados das PRs anteriores e devolve uma
 * leitura canônica de autonomia sugerida + executor assistido de baixo risco.
 *
 * Regras de segurança:
 *   - Executor assistido SOMENTE quando nivel_risco_execucao = "baixo"
 *   - Ação sugerida SOMENTE quando há fluxo já validado no painel
 *   - precisa_aprovacao_humana = "sim" sempre (gesto humano obrigatório)
 *   - Sem automação, sem escrita em banco, sem side effects
 *
 * @param signals             - Objeto canônico de sinais do lead (buildLeadSignals).
 * @param cognitiveState      - Estado cognitivo classificado (classifyLeadCognitiveState).
 * @param followupState       - Organização de follow-up (PR4, opcional).
 * @param docsState           - Leitura de docs (PR5, opcional).
 * @param reclassState        - Reclassificação assistida (PR6, opcional).
 * @param visitReadinessState - Prontidão para plantão (PR7, opcional).
 * @param metaOpsState        - Meta-operação cognitiva (PR8, opcional).
 * @returns LeadAutonomyReading — leitura canônica de autonomia assistida.
 */
export function readLeadAutonomy(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  followupState: LeadFollowupOrganizer | null = null,
  docsState: LeadDocsReading | null = null,
  reclassState: LeadReclassificationReading | null = null,
  visitReadinessState: LeadVisitReadiness | null = null,
  metaOpsState: LeadMetaOpsReading | null = null,
): LeadAutonomyReading {
  const autonomia_sugerida = deriveAutonomiaSugerida(
    signals,
    cognitiveState,
    followupState,
    docsState,
    reclassState,
    visitReadinessState,
    metaOpsState,
  );

  const motivo_pedido_autonomia = deriveMotivoPedido(
    autonomia_sugerida,
    signals,
    cognitiveState,
    metaOpsState,
  );

  const nivel_risco_execucao = deriveNivelRisco(
    autonomia_sugerida,
    cognitiveState,
    signals,
    reclassState,
  );

  const acao_baixo_risco_sugerida = deriveAcaoBaixoRisco(
    autonomia_sugerida,
    nivel_risco_execucao,
    followupState,
    docsState,
    reclassState,
    visitReadinessState,
  );

  const executor_assistido_habilitado = deriveExecutorAssistido(
    nivel_risco_execucao,
    acao_baixo_risco_sugerida,
  );

  // Sempre exige gesto humano — invariante de segurança
  const precisa_aprovacao_humana: PrecisaAprovacaoHumana = "sim";

  const justificativa_autonomia = buildJustificativaAutonomia(
    autonomia_sugerida,
    motivo_pedido_autonomia,
    nivel_risco_execucao,
    signals,
    cognitiveState,
  );

  return {
    autonomia_sugerida,
    motivo_pedido_autonomia,
    nivel_risco_execucao,
    acao_baixo_risco_sugerida,
    executor_assistido_habilitado,
    precisa_aprovacao_humana,
    justificativa_autonomia,
  };
}
