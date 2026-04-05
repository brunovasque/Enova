// ============================================================
// Lead Reclassification — panel/app/lib/lead-reclassification.ts
//
// PR 6 — Reclassificação Assistida de Base + Lead Frio Recuperável
// Escopo: PANEL-ONLY, read-only/assistido, sem automação, sem IA externa.
//
// Propósito:
//   Recebe LeadSignals (PR1), LeadCognitiveState (PR2) e opcionalmente
//   LeadFollowupOrganizer (PR4) e LeadDocsReading (PR5), e devolve uma
//   leitura canônica de calor real, base sugerida, recuperabilidade do
//   lead frio e estratégia de reativação.
//
// O que esta camada FAZ:
//   - Ler o "calor real" do lead com base em sinais reais
//   - Sugerir reclassificação de base com justificativa objetiva
//   - Identificar lead frio recuperável com motivo e estratégia
//   - Diferenciar: frio, morno parado, perdido provável e recuperável
//   - Sugerir a ação de retomada mais coerente
//
// O que esta camada NÃO FAZ:
//   - Mover base automaticamente
//   - Arquivar automaticamente
//   - Disparar campanha de reativação
//   - Escrever no banco de dados
//   - Criar automação
//   - Chamar IA externa
//   - Inventar sinal que não existe no lead
//
// Pronto para futuras campanhas de reativação, feirão, oportunidade, docs, visita.
// ============================================================

import type { LeadSignals } from "./lead-signals";
import type { LeadCognitiveState } from "./lead-cognitive";
import type { LeadFollowupOrganizer } from "./lead-followup";
import type { LeadDocsReading } from "./lead-docs";

// ── Tipos canônicos de saída ───────────────────────────────────────────────

/**
 * CalorRealLead — leitura do "calor real" do lead baseada em sinais reais.
 * Não é sinônimo de temperatura do CRM: é uma leitura cognitiva atual.
 */
export type CalorRealLead = "frio" | "morno" | "quente" | "indefinido";

/**
 * BaseSugerida — base do CRM sugerida com base no calor real e recuperabilidade.
 */
export type BaseSugerida =
  | "base_fria"
  | "base_morna"
  | "base_quente"
  | "reativacao"
  | "manter_atual";

/**
 * ReclassificacaoSugerida — direção da reclassificação de base sugerida.
 */
export type ReclassificacaoSugerida =
  | "subir_base"
  | "descer_base"
  | "mover_para_reativacao"
  | "manter"
  | "arquivavel"
  | "indefinido";

/**
 * LeadFrioRecuperavel — avaliação de recuperabilidade do lead frio/parado.
 */
export type LeadFrioRecuperavel = "sim" | "nao" | "incerto";

/**
 * MotivoRecuperabilidade — principal razão de recuperabilidade (ou perda).
 */
export type MotivoRecuperabilidade =
  | "ja_demonstrou_interesse"
  | "travou_no_timing"
  | "travou_em_docs"
  | "travou_sem_retorno"
  | "lead_antigo_com_sinal"
  | "sem_sinal_recuperavel"
  | "provavel_perda_real"
  | "precisa_humano";

/**
 * EstrategiaReativacaoSugerida — abordagem recomendada para reativar o lead.
 */
export type EstrategiaReativacaoSugerida =
  | "reativacao_leve"
  | "reativacao_oportunidade"
  | "reativacao_urgencia"
  | "reativacao_visita"
  | "reativacao_docs"
  | "pedir_humano"
  | "nenhuma";

/**
 * AcaoReativacaoSugerida — ação concreta para o operador executar (ou não).
 */
export type AcaoReativacaoSugerida =
  | "reativar_agora"
  | "aguardar"
  | "pedir_humano"
  | "manter_observacao"
  | "sem_acao";

/**
 * LeadReclassificationReading — saída canônica da camada de reclassificação.
 *
 * Todos os campos são obrigatórios.
 * Saída read-only — sem escrita em banco, sem automação.
 * Pronto para consumo visual e para evolução em campanhas de reativação.
 */
export type LeadReclassificationReading = {
  /** Leitura do calor real do lead baseada em sinais reais. */
  calor_real_lead: CalorRealLead;
  /** Base do CRM sugerida para este lead. */
  base_sugerida: BaseSugerida;
  /** Direção da reclassificação de base sugerida. */
  reclassificacao_sugerida: ReclassificacaoSugerida;
  /** O lead frio/parado ainda é recuperável? */
  lead_frio_recuperavel: LeadFrioRecuperavel;
  /** Principal motivo de recuperabilidade (ou provável perda). */
  motivo_recuperabilidade: MotivoRecuperabilidade;
  /** Estratégia de reativação recomendada (sugestão — sem execução automática). */
  estrategia_reativacao_sugerida: EstrategiaReativacaoSugerida;
  /** Ação concreta sugerida ao operador (sugestão — sem execução automática). */
  acao_reativacao_sugerida: AcaoReativacaoSugerida;
  /** Justificativa objetiva baseada em sinais reais. */
  justificativa_reclassificacao: string;
};

// ── Constantes internas ───────────────────────────────────────────────────

/** Fases arquiváveis — lead fora do fluxo ativo. */
const FASES_ARQUIVAVEIS = new Set([
  "fim_inelegivel",
  "fim_ineligivel", // variante alternativa de grafia existente no DB — ambas intencionais
  "arquivado",
  "cancelado",
  "inativo",
]);

/**
 * Fases de compra ativa — lead estava avançando ativamente no funil.
 * Presença em fase_travamento indica que o lead havia progredido até este ponto.
 */
const FASES_COMPRA_ATIVA = new Set([
  "envio_docs",
  "analise_documentos",
  "finalizacao_processo",
  "aguardando_retorno_correspondente",
  "visita",
  "agendamento_visita",
  "visita_confirmada",
]);

/** Fases de visita — lead estava próximo de docs. */
const FASES_VISITA = new Set([
  "agendamento_visita",
  "visita",
  "visita_confirmada",
]);

/** Fases de documentos. */
const FASES_DOCS = new Set([
  "envio_docs",
  "analise_documentos",
]);

/**
 * Fases de qualificação avançada — indicam engajamento real com o processo,
 * mesmo sem ter chegado à fase de compra ativa.
 */
const FASES_QUALIFICACAO_AVANCADA = new Set([
  "verificacao_renda",
  "composicao_familiar",
  "verificacao_restricao",
  "regularizacao_restricao",
  "ctps_36",
  "ctps_36_parceiro",
  "restricao_parceiro",
  "informativo_moradia_atual",
  "informativo_trabalho",
  "informativo_reserva",
  "informativo_fgts",
  "informativo_decisor_visita",
]);

/**
 * Limite de dias sem resposta para considerar lead frio.
 * Abaixo deste valor, o lead pode ainda estar morno.
 */
const DIAS_FRIO = 14;

/**
 * Limite de dias para considerar lead provavelmente perdido
 * (sem sinais de recuperação).
 */
const DIAS_PROVAVEL_PERDA = 45;

/**
 * Mínimo de mensagens para indicar engajamento real
 * (além de uma troca inicial de apresentação).
 */
const MIN_MSGS_ENGAJAMENTO = 5;

// ── Helpers internos ──────────────────────────────────────────────────────

function normalizeFase(fase: string | null): string {
  return (fase ?? "").toLowerCase().trim();
}

function isFaseArquivavel(fase: string | null): boolean {
  return FASES_ARQUIVAVEIS.has(normalizeFase(fase));
}

// ── Derivações atômicas ───────────────────────────────────────────────────

function deriveCalorRealLead(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): CalorRealLead {
  const fase = normalizeFase(signals.operacao.fase_funil);

  // Lead arquivado/finalizado — indefinido (saiu do jogo ativo)
  if (isFaseArquivavel(fase) || signals.timing.arquivado_em) return "indefinido";

  const dias = signals.interacao.dias_sem_resposta_cliente;
  const leadTemp = (signals.contexto.lead_temp ?? "").toUpperCase();
  const nivelInteresse = cognitiveState.nivel_interesse;
  const estadoCliente = cognitiveState.estado_cliente;
  const momentoCompra = cognitiveState.momento_compra;

  // Sem dados de interação — usar lead_temp e nivel_interesse como fallback
  if (dias === null) {
    if (leadTemp === "HOT" || nivelInteresse === "alto") return "quente";
    if (leadTemp === "COLD" || (nivelInteresse === "baixo" && estadoCliente === "arquivavel")) return "frio";
    if (leadTemp === "WARM" || nivelInteresse === "medio") return "morno";
    return "indefinido";
  }

  // ── QUENTE ──────────────────────────────────────────────────────────────
  // Sinais convergentes: alto interesse + momento imediato + atividade recente
  if (
    nivelInteresse === "alto" &&
    (momentoCompra === "agora" || momentoCompra === "curto_prazo") &&
    dias < 7 &&
    estadoCliente !== "arquivavel" &&
    estadoCliente !== "reativacao"
  ) {
    return "quente";
  }
  // Lead_temp HOT explícito + atividade muito recente
  if (leadTemp === "HOT" && dias < 3) return "quente";

  // ── FRIO ─────────────────────────────────────────────────────────────────
  // Longa ausência de resposta
  if (dias >= DIAS_FRIO * 2) return "frio"; // >= 28 dias: frio definitivo
  // Frio com sinal de baixo interesse
  if (dias >= DIAS_FRIO && nivelInteresse === "baixo") return "frio";
  // Arquivável cognitivo com algum tempo parado
  if (dias >= DIAS_FRIO && estadoCliente === "arquivavel") return "frio";
  // Lead_temp COLD explícito + sem resposta há mais de uma semana
  if (leadTemp === "COLD" && dias >= 7) return "frio";
  // Reativação + longamente sem resposta
  if (estadoCliente === "reativacao" && dias >= DIAS_FRIO) return "frio";

  // ── MORNO ────────────────────────────────────────────────────────────────
  // Interesse existente mas sem ação recente
  if (dias < DIAS_FRIO && (nivelInteresse === "medio" || nivelInteresse === "alto")) return "morno";
  if (estadoCliente === "morno" || estadoCliente === "interessado_sem_acao") return "morno";
  if (leadTemp === "WARM") return "morno";
  // Entre DIAS_FRIO e 2x DIAS_FRIO, sem sinal baixo explícito
  if (dias >= DIAS_FRIO && dias < DIAS_FRIO * 2 && nivelInteresse !== "baixo") return "morno";
  // Frio borderline — salvo como morno para não penalizar cedo demais
  if (dias >= DIAS_FRIO && estadoCliente === "reativacao" && nivelInteresse !== "baixo") return "morno";

  return "morno"; // fallback conservador para não classificar indefinido
}

function deriveLeadFrioRecuperavel(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  calor: CalorRealLead,
  docsState: LeadDocsReading | null,
): LeadFrioRecuperavel {
  // Lead quente — não é o caso de verificar recuperabilidade
  if (calor === "quente") return "nao";

  const fase = normalizeFase(signals.operacao.fase_funil);
  const faseTravamento = normalizeFase(signals.operacao.fase_travamento);
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Lead arquivado definitivamente
  if (isFaseArquivavel(fase) || signals.timing.arquivado_em) {
    if (dias >= DIAS_PROVAVEL_PERDA) return "nao";
    return "incerto"; // arquivado recentemente pode ser incerto
  }

  // Muito tempo sem sinal de interesse → não recuperável
  if (dias >= DIAS_PROVAVEL_PERDA && cognitiveState.nivel_interesse === "baixo") return "nao";

  // Requer humano urgente → incerto (não decidir por conta)
  if (cognitiveState.necessita_humano) return "incerto";

  // ── Sinais positivos de recuperabilidade ─────────────────────────────────

  // Foi travado em fase de compra ativa → havia interesse real demonstrado
  if (FASES_COMPRA_ATIVA.has(faseTravamento) && dias < 30) return "sim";

  // Foi travado em fase de visita especificamente
  if (FASES_VISITA.has(faseTravamento) && dias < 30) return "sim";

  // Foi travado em docs
  if (
    FASES_DOCS.has(faseTravamento) ||
    (docsState &&
      (docsState.bloqueio_docs_principal === "travado_no_funil" ||
        docsState.bloqueio_docs_principal === "sem_retorno") &&
      dias < 30)
  ) {
    return "sim";
  }

  // Foi travado em qualificação avançada → demonstrou algum engajamento
  if (FASES_QUALIFICACAO_AVANCADA.has(faseTravamento) && dias < 21) return "sim";

  // Atualmente em fase de compra ativa mas parado → recuperável
  if (FASES_COMPRA_ATIVA.has(normalizeFase(fase)) && dias < 21) return "sim";

  // Problema de timing explícito no feedback humano
  const momento = (signals.feedback_humano.momento_do_cliente ?? "").toLowerCase();
  if (
    (momento.includes("ocupado") ||
      momento.includes("sem tempo") ||
      momento.includes("depois") ||
      momento.includes("corrido")) &&
    dias < 21
  ) {
    return "sim";
  }

  // Engajamento real por histórico de mensagens
  if (
    signals.interacao.total_mensagens >= MIN_MSGS_ENGAJAMENTO &&
    dias < 30 &&
    cognitiveState.nivel_interesse !== "baixo"
  ) {
    return "sim";
  }

  // Sinais intermediários — incerto
  if (dias < 21 && cognitiveState.nivel_interesse === "medio") return "incerto";
  if (dias < 14) return "incerto"; // ainda pode responder
  if (signals.interacao.total_mensagens > 0 && dias < 21) return "incerto";

  return "incerto"; // nunca "nao" a menos que muito antigo ou sem sinal
}

function deriveMotivoRecuperabilidade(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  recuperavel: LeadFrioRecuperavel,
  docsState: LeadDocsReading | null,
): MotivoRecuperabilidade {
  const fase = normalizeFase(signals.operacao.fase_funil);
  const faseTravamento = normalizeFase(signals.operacao.fase_travamento);
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Provável perda real
  if (recuperavel === "nao") {
    if (isFaseArquivavel(fase)) return "provavel_perda_real";
    if (dias >= DIAS_PROVAVEL_PERDA && cognitiveState.nivel_interesse === "baixo") {
      return "provavel_perda_real";
    }
    return "sem_sinal_recuperavel";
  }

  // Requer humano urgente
  if (cognitiveState.necessita_humano) return "precisa_humano";

  // Travou em docs especificamente
  if (
    FASES_DOCS.has(faseTravamento) ||
    (docsState && docsState.bloqueio_docs_principal === "travado_no_funil")
  ) {
    return "travou_em_docs";
  }

  // Já demonstrou interesse real: fase de compra ativa ou visita
  if (
    FASES_COMPRA_ATIVA.has(faseTravamento) ||
    FASES_VISITA.has(faseTravamento) ||
    FASES_QUALIFICACAO_AVANCADA.has(faseTravamento)
  ) {
    return "ja_demonstrou_interesse";
  }

  // Atualmente em fase de compra ativa mas parado
  if (FASES_COMPRA_ATIVA.has(normalizeFase(fase))) return "ja_demonstrou_interesse";

  // Problema de timing
  const momento = (signals.feedback_humano.momento_do_cliente ?? "").toLowerCase();
  if (
    momento.includes("ocupado") ||
    momento.includes("sem tempo") ||
    momento.includes("depois") ||
    momento.includes("corrido")
  ) {
    return "travou_no_timing";
  }

  // Parou sem retorno mas havia engajamento
  if (signals.interacao.total_mensagens >= MIN_MSGS_ENGAJAMENTO) {
    return "travou_sem_retorno";
  }

  // Lead antigo com algum sinal
  if (signals.interacao.total_mensagens > 0) return "lead_antigo_com_sinal";

  return "sem_sinal_recuperavel";
}

function deriveEstrategiaReativacao(
  signals: LeadSignals,
  recuperavel: LeadFrioRecuperavel,
  motivo: MotivoRecuperabilidade,
  calor: CalorRealLead,
  cognitiveState: LeadCognitiveState,
): EstrategiaReativacaoSugerida {
  // Lead ativo — sem necessidade de reativação
  if (calor === "quente") return "nenhuma";

  // Genuinamente irrecuperável
  if (recuperavel === "nao") return "nenhuma";

  // Requer humano
  if (cognitiveState.necessita_humano || motivo === "precisa_humano") return "pedir_humano";

  const faseTravamento = normalizeFase(signals.operacao.fase_travamento);

  switch (motivo) {
    case "travou_em_docs":
      return "reativacao_docs";

    case "ja_demonstrou_interesse":
      // Se travou em fase de visita → tentar visita novamente
      if (FASES_VISITA.has(faseTravamento)) return "reativacao_visita";
      return "reativacao_oportunidade";

    case "travou_no_timing":
      // Timing issue → abordagem leve, sem pressão
      return "reativacao_leve";

    case "travou_sem_retorno":
      return "reativacao_leve";

    case "lead_antigo_com_sinal":
      return "reativacao_oportunidade";

    case "provavel_perda_real":
    case "sem_sinal_recuperavel":
      return "nenhuma";
  }
}

function deriveAcaoReativacao(
  recuperavel: LeadFrioRecuperavel,
  estrategia: EstrategiaReativacaoSugerida,
  calor: CalorRealLead,
): AcaoReativacaoSugerida {
  // Lead ativo — sem ação de reativação
  if (calor === "quente") return "sem_acao";

  if (estrategia === "nenhuma") return "sem_acao";
  if (estrategia === "pedir_humano") return "pedir_humano";

  if (recuperavel === "sim") return "reativar_agora";
  if (recuperavel === "incerto") return "manter_observacao";

  return "sem_acao";
}

function deriveBaseSugerida(
  calor: CalorRealLead,
  recuperavel: LeadFrioRecuperavel,
): BaseSugerida {
  // Frio e recuperável → mover para reativação
  if (calor === "frio" && recuperavel === "sim") return "reativacao";

  switch (calor) {
    case "quente":    return "base_quente";
    case "morno":     return "base_morna";
    case "frio":      return "base_fria";
    case "indefinido": return "manter_atual";
  }
}

/**
 * Infere o tier numérico da base atual a partir do texto do campo.
 * 3 = quente, 2 = morna, 1 = fria, 0 = reativação, -1 = desconhecido.
 */
function inferBaseTier(base: string | null): number {
  const b = (base ?? "").toLowerCase();
  if (b.includes("quente") || b.includes("hot")) return 3;
  if (b.includes("morna") || b.includes("warm")) return 2;
  if (b.includes("fria") || b.includes("cold") || b.includes("frio")) return 1;
  if (b.includes("reativa")) return 0;
  return -1; // desconhecido
}

function deriveReclassificacao(
  baseSugerida: BaseSugerida,
  signals: LeadSignals,
  calor: CalorRealLead,
  cognitiveState: LeadCognitiveState,
  recuperavel: LeadFrioRecuperavel,
): ReclassificacaoSugerida {
  // Sem sinal suficiente para sugerir mudança
  if (calor === "indefinido" || baseSugerida === "manter_atual") return "indefinido";

  // Sugerir reativação → mover para reativação
  if (baseSugerida === "reativacao") return "mover_para_reativacao";

  // Condições muito fortes para arquivar:
  // dias >= 30 + nivel_interesse baixo + estado arquivavel + não recuperável
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  if (
    dias >= 30 &&
    cognitiveState.nivel_interesse === "baixo" &&
    cognitiveState.estado_cliente === "arquivavel" &&
    recuperavel === "nao"
  ) {
    return "arquivavel";
  }

  // Comparar tier sugerido vs atual
  const baseAtual = signals.contexto.crm_lead_pool ?? signals.contexto.base_atual;
  const currentTier = inferBaseTier(baseAtual);

  const SUGGESTED_TIER: Record<BaseSugerida, number> = {
    base_quente: 3,
    base_morna: 2,
    base_fria: 1,
    reativacao: 0,
    manter_atual: -1,
  };
  const suggestedTier = SUGGESTED_TIER[baseSugerida];

  // Não é possível comparar sem saber a base atual
  if (currentTier === -1) return "manter";

  if (suggestedTier > currentTier) return "subir_base";
  if (suggestedTier < currentTier) return "descer_base";
  return "manter";
}

function buildJustificativaReclassificacao(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  calor: CalorRealLead,
  recuperavel: LeadFrioRecuperavel,
  motivo: MotivoRecuperabilidade,
): string {
  const partes: string[] = [];
  const dias = signals.interacao.dias_sem_resposta_cliente;

  // Calor real
  const CALOR_TEXTO: Record<CalorRealLead, string> = {
    quente: "calor real: quente",
    morno: "calor real: morno",
    frio: "calor real: frio",
    indefinido: "calor indefinido",
  };
  partes.push(CALOR_TEXTO[calor]);

  // Dias sem resposta (quando relevante)
  if (dias !== null && dias > 0) {
    partes.push(`${dias}d sem resposta`);
  } else if (dias === 0) {
    partes.push("respondeu hoje");
  }

  // Nível de interesse (quando não óbvio pelo calor)
  if (calor === "morno" || (calor === "frio" && cognitiveState.nivel_interesse !== "baixo")) {
    if (cognitiveState.nivel_interesse === "alto") partes.push("interesse alto");
    else if (cognitiveState.nivel_interesse === "medio") partes.push("interesse médio");
  }

  // Motivo de recuperabilidade (para leads frios e mornos parados)
  if (calor === "frio" || (calor === "morno" && recuperavel !== "nao")) {
    const MOTIVO_CURTO: Record<MotivoRecuperabilidade, string> = {
      ja_demonstrou_interesse: "já demonstrou interesse",
      travou_no_timing: "travou no timing",
      travou_em_docs: "travou em docs",
      travou_sem_retorno: "parou sem retorno claro",
      lead_antigo_com_sinal: "lead antigo com sinal",
      sem_sinal_recuperavel: "sem sinal de recuperação",
      provavel_perda_real: "provável perda real",
      precisa_humano: "requer humano",
    };
    partes.push(MOTIVO_CURTO[motivo]);
  }

  // Recuperabilidade (quando relevante e não óbvio)
  if (calor !== "quente" && calor !== "indefinido") {
    if (recuperavel === "sim") partes.push("recuperável");
    else if (recuperavel === "incerto") partes.push("recuperabilidade incerta");
    else if (recuperavel === "nao" && calor === "frio") partes.push("não recuperável");
  }

  if (partes.length === 0) return "sinais insuficientes para leitura";

  return partes.join("; ");
}

// ── Classificador principal ───────────────────────────────────────────────

/**
 * classifyLeadReclassification — classificador canônico de reclassificação
 * assistida de base e lead frio recuperável (read-only/assistido).
 *
 * Recebe LeadSignals (PR1) e LeadCognitiveState (PR2), opcionalmente
 * LeadFollowupOrganizer (PR4) e LeadDocsReading (PR5), e devolve uma
 * leitura estruturada de calor real, base sugerida, reclassificação,
 * recuperabilidade, estratégia e ação sugerida.
 *
 * Princípios:
 *   - Sem automação, sem side effects, sem escrita em banco.
 *   - Sem IA externa — lógica puramente determinística/heurística.
 *   - Preferir segurança a criatividade.
 *   - Sem declarar lead morto cedo demais.
 *   - Sem tratar todo lead frio como perdido.
 *   - Sem classificar "quente" sem base real.
 *   - Sem falsa precisão.
 *   - Justificativa curta e operacional.
 *
 * @param signals        - Objeto canônico de sinais do lead (buildLeadSignals).
 * @param cognitiveState - Estado cognitivo classificado (classifyLeadCognitiveState).
 * @param followupState  - Organização de follow-up (organizeLeadFollowup) — opcional.
 * @param docsState      - Leitura de docs (readLeadDocs) — opcional.
 * @returns LeadReclassificationReading — leitura canônica de reclassificação.
 */
export function classifyLeadReclassification(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  followupState: LeadFollowupOrganizer | null = null,
  docsState: LeadDocsReading | null = null,
): LeadReclassificationReading {
  // Suprimir unused-variable warning — followupState reservado para expansão futura
  void followupState;

  const calor_real_lead = deriveCalorRealLead(signals, cognitiveState);

  const lead_frio_recuperavel = deriveLeadFrioRecuperavel(
    signals,
    cognitiveState,
    calor_real_lead,
    docsState,
  );

  const motivo_recuperabilidade = deriveMotivoRecuperabilidade(
    signals,
    cognitiveState,
    lead_frio_recuperavel,
    docsState,
  );

  const base_sugerida = deriveBaseSugerida(calor_real_lead, lead_frio_recuperavel);

  const reclassificacao_sugerida = deriveReclassificacao(
    base_sugerida,
    signals,
    calor_real_lead,
    cognitiveState,
    lead_frio_recuperavel,
  );

  const estrategia_reativacao_sugerida = deriveEstrategiaReativacao(
    signals,
    lead_frio_recuperavel,
    motivo_recuperabilidade,
    calor_real_lead,
    cognitiveState,
  );

  const acao_reativacao_sugerida = deriveAcaoReativacao(
    lead_frio_recuperavel,
    estrategia_reativacao_sugerida,
    calor_real_lead,
  );

  const justificativa_reclassificacao = buildJustificativaReclassificacao(
    signals,
    cognitiveState,
    calor_real_lead,
    lead_frio_recuperavel,
    motivo_recuperabilidade,
  );

  return {
    calor_real_lead,
    base_sugerida,
    reclassificacao_sugerida,
    lead_frio_recuperavel,
    motivo_recuperabilidade,
    estrategia_reativacao_sugerida,
    acao_reativacao_sugerida,
    justificativa_reclassificacao,
  };
}
