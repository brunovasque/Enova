// ============================================================
// Lead Meta-Ops — panel/app/lib/lead-meta-ops.ts
//
// PR 8 — Meta-operação Cognitiva + Sugestões de Melhoria
// Escopo: PANEL-ONLY, read-only/assistido, sem automação, sem IA externa.
//
// Propósito:
//   Recebe LeadSignals (PR1), LeadCognitiveState (PR2) e opcionalmente
//   LeadFollowupOrganizer (PR4), LeadDocsReading (PR5),
//   LeadReclassificationReading (PR6) e LeadVisitReadiness (PR7),
//   e devolve uma leitura canônica de:
//     - gargalo principal da operação
//     - tipo de melhoria sugerida
//     - sugestão operacional concreta
//     - programa sugerido (futuro)
//     - prioridade da melhoria
//     - se precisa evolução de estrutura
//     - justificativa meta-operacional
//
// Perguntas que esta camada responde:
//   1. Onde a operação está travando neste caso?
//   2. O que pode ser melhorado na condução deste lead?
//   3. Há algum programa/mecanismo que faria sentido aqui?
//
// O que esta camada FAZ:
//   - Ler a operação atual e identificar gargalo real
//   - Sugerir melhoria baseada em sinais reais
//   - Identificar programas futuros que seriam úteis
//   - Justificar a leitura de forma objetiva e curta
//   - Preparar terreno para PR 9 de autonomia assistida
//
// O que esta camada NÃO FAZ:
//   - Criar programa real
//   - Criar automação real
//   - Mover base ou enviar mensagem
//   - Escrever no banco ou abrir tarefa automática
//   - Alterar Worker/schema
//   - Chamar IA externa
//   - Inventar gargalo onde não há sinal suficiente
//
// Princípios:
//   - Preferir segurança a criatividade
//   - Sem sugerir evolução estrutural à toa
//   - Sem falsa precisão
//   - Leitura voltada à melhoria real da conversão
// ============================================================

import type { LeadSignals } from "./lead-signals";
import type { LeadCognitiveState } from "./lead-cognitive";
import type { LeadFollowupOrganizer } from "./lead-followup";
import type { LeadDocsReading } from "./lead-docs";
import type { LeadReclassificationReading } from "./lead-reclassification";
import type { LeadVisitReadiness } from "./lead-visit-readiness";

// ── Tipos canônicos de saída ───────────────────────────────────────────────

/**
 * GargaloPrincipal — onde a operação está travando neste caso.
 */
export type GargaloPrincipal =
  | "sem_gargalo_claro"
  | "travamento_conversa"
  | "travamento_docs"
  | "travamento_followup"
  | "travamento_reativacao"
  | "travamento_visita"
  | "travamento_humano"
  | "lead_sem_janela"
  | "lead_sem_interesse_claro";

/**
 * TipoMelhoriaSugerida — categoria da melhoria que faz mais sentido agora.
 */
export type TipoMelhoriaSugerida =
  | "ajuste_abordagem"
  | "ajuste_timing"
  | "ajuste_followup"
  | "ajuste_docs"
  | "ajuste_reativacao"
  | "ajuste_visita"
  | "pedir_humano"
  | "nenhuma";

/**
 * SugestaoOperacional — ação operacional concreta sugerida (read-only).
 */
export type SugestaoOperacional =
  | "mudar_tom"
  | "retomar_com_oportunidade"
  | "retomar_com_urgencia"
  | "oferecer_visita"
  | "estimular_docs"
  | "aguardar_melhor_janela"
  | "escalar_para_humano"
  | "sem_sugestao";

/**
 * ProgramaSugerido — programa/mecanismo futuro que seria útil neste caso.
 */
export type ProgramaSugerido =
  | "nenhum"
  | "caca_pastas"
  | "reativacao_inteligente"
  | "janela_de_compra"
  | "pre_plantao"
  | "ferirao"
  | "intervencao_humana";

/**
 * PrioridadeMelhoria — urgência da melhoria sugerida.
 */
export type PrioridadeMelhoria = "baixa" | "media" | "alta";

/**
 * PrecisaEvolucaoEstrutura — se este caso evidencia necessidade de novo mecanismo.
 */
export type PrecisaEvolucaoEstrutura = "sim" | "nao" | "incerto";

/**
 * LeadMetaOpsReading — saída canônica da camada de meta-operação cognitiva.
 *
 * Todos os campos são obrigatórios.
 * Saída read-only — sem escrita em banco, sem automação.
 * Pronto para PR 9 de autonomia assistida.
 */
export type LeadMetaOpsReading = {
  /** Onde a operação está travando neste caso (baseado em sinais reais). */
  gargalo_principal: GargaloPrincipal;
  /** Categoria da melhoria que faz mais sentido agora. */
  tipo_melhoria_sugerida: TipoMelhoriaSugerida;
  /** Ação operacional concreta sugerida (read-only — sem execução automática). */
  sugestao_operacional: SugestaoOperacional;
  /** Programa/mecanismo futuro que seria útil neste caso (sugestão). */
  programa_sugerido: ProgramaSugerido;
  /** Urgência da melhoria sugerida. */
  prioridade_melhoria: PrioridadeMelhoria;
  /** Se este caso evidencia necessidade de novo mecanismo ou evolução estrutural. */
  precisa_evolucao_estrutura: PrecisaEvolucaoEstrutura;
  /** Justificativa curta e operacional baseada em sinais reais. */
  justificativa_meta_operacao: string;
};

// ── Constantes internas ───────────────────────────────────────────────────

/** Dias sem resposta a partir dos quais "travamento_conversa" se aplica. */
const DIAS_TRAVAMENTO_CONVERSA = 7;

/** Dias sem resposta que elevam prioridade para alta. */
const DIAS_PRIORIDADE_ALTA = 14;

/** Fases arquiváveis — sem diagnóstico de gargalo operacional. */
const FASES_ARQUIVAVEIS = new Set([
  "fim_inelegivel",
  "fim_ineligivel",
  "arquivado",
  "cancelado",
  "inativo",
]);

/** Fases pós-visita onde a operação já avançou além de plantão. */
const FASES_POS_VISITA = new Set([
  "envio_docs",
  "analise_documentos",
  "finalizacao_processo",
  "aguardando_retorno_correspondente",
]);

// ── Helpers internos ──────────────────────────────────────────────────────

function normalizeFase(fase: string | null): string {
  return (fase ?? "").toLowerCase().trim();
}

function isFaseArquivavel(fase: string | null): boolean {
  return FASES_ARQUIVAVEIS.has(normalizeFase(fase));
}

function isFasePosVisita(fase: string | null): boolean {
  return FASES_POS_VISITA.has(normalizeFase(fase));
}

// ── Derivações atômicas ───────────────────────────────────────────────────

function deriveGargaloPrincipal(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  followupState: LeadFollowupOrganizer | null,
  docsState: LeadDocsReading | null,
  reclassState: LeadReclassificationReading | null,
  visitReadinessState: LeadVisitReadiness | null,
): GargaloPrincipal {
  const fase = normalizeFase(signals.operacao.fase_funil);
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Fases arquiváveis ou pós-visita → sem diagnóstico operacional de gargalo
  if (isFaseArquivavel(fase) || signals.timing.arquivado_em) return "sem_gargalo_claro";
  if (isFasePosVisita(fase)) return "sem_gargalo_claro";

  // 1) Precisa humano urgente — travamento_humano tem prioridade máxima
  if (cognitiveState.necessita_humano) return "travamento_humano";

  // 2) Travamento explícito no funil
  if (signals.operacao.fase_travamento) {
    // Subdividir por contexto quando possível
    if (
      docsState &&
      (docsState.status_pasta === "travado_docs" ||
        docsState.bloqueio_docs_principal !== "sem_bloqueio_claro")
    ) {
      return "travamento_docs";
    }
    return "travamento_followup";
  }

  // 3) Docs bloqueando (sinal real da camada de docs)
  if (
    docsState &&
    docsState.status_pasta === "travado_docs" &&
    docsState.bloqueio_docs_principal !== "sem_bloqueio_claro"
  ) {
    return "travamento_docs";
  }

  // 4) Follow-up vencido (sinal real da camada de follow-up)
  if (
    followupState &&
    followupState.status_followup === "followup_vencido"
  ) {
    return "travamento_followup";
  }

  // 5) Conversa travada (sem retorno prolongado)
  if (dias >= DIAS_TRAVAMENTO_CONVERSA) {
    // Distinguir entre frio (sem janela) e simplesmente sem retorno
    if (
      cognitiveState.momento_compra === "sem_janela_clara" ||
      cognitiveState.momento_compra === "medio_prazo"
    ) {
      return "lead_sem_janela";
    }
    return "travamento_conversa";
  }

  // 6) Lead precisa reativação (sinal real de reclassificação)
  if (
    reclassState &&
    reclassState.lead_frio_recuperavel === "sim" &&
    reclassState.calor_real === "frio"
  ) {
    return "travamento_reativacao";
  }

  // 7) Lead sem interesse claro (sinais cognitivos + calor frio)
  if (
    cognitiveState.nivel_interesse === "baixo" ||
    cognitiveState.momento_compra === "curioso" ||
    (reclassState && reclassState.calor_real === "frio" && reclassState.lead_frio_recuperavel === "nao")
  ) {
    return "lead_sem_interesse_claro";
  }

  // 8) Lead sem janela de compra clara (sem urgência)
  if (
    cognitiveState.momento_compra === "sem_janela_clara" ||
    (cognitiveState.momento_compra === "medio_prazo" && cognitiveState.nivel_interesse !== "alto")
  ) {
    return "lead_sem_janela";
  }

  // 9) Prontidão para visita mas algo bloqueando (sinal real de visit-readiness)
  if (
    visitReadinessState &&
    visitReadinessState.status_plantao === "quase_pronto" &&
    visitReadinessState.bloqueio_plantao_principal !== "sem_bloqueio_claro"
  ) {
    return "travamento_visita";
  }

  // 10) Docs pendentes mas sem trava explícita
  if (
    docsState &&
    docsState.status_pasta === "nao_pronto" &&
    docsState.maturidade_docs !== "baixa" &&
    docsState.bloqueio_docs_principal !== "sem_bloqueio_claro"
  ) {
    return "travamento_docs";
  }

  return "sem_gargalo_claro";
}

function deriveTipoMelhoria(
  gargalo: GargaloPrincipal,
  cognitiveState: LeadCognitiveState,
  dias: number,
): TipoMelhoriaSugerida {
  switch (gargalo) {
    case "travamento_humano":
      return "pedir_humano";
    case "travamento_conversa":
      // Muitos dias → ajuste de abordagem; poucos dias → ajuste de followup
      return dias >= DIAS_PRIORIDADE_ALTA ? "ajuste_abordagem" : "ajuste_followup";
    case "travamento_docs":
      return "ajuste_docs";
    case "travamento_followup":
      return cognitiveState.risco_travamento === "alto" ? "ajuste_timing" : "ajuste_followup";
    case "travamento_reativacao":
      return "ajuste_reativacao";
    case "travamento_visita":
      return "ajuste_visita";
    case "lead_sem_janela":
      return "ajuste_timing";
    case "lead_sem_interesse_claro":
      return "ajuste_abordagem";
    case "sem_gargalo_claro":
      return "nenhuma";
  }
}

function deriveSugestaoOperacional(
  gargalo: GargaloPrincipal,
  tipo: TipoMelhoriaSugerida,
  cognitiveState: LeadCognitiveState,
  dias: number,
): SugestaoOperacional {
  switch (gargalo) {
    case "travamento_humano":
      return "escalar_para_humano";

    case "travamento_conversa":
      // Com urgência real → retomar com urgência; caso contrário, com oportunidade
      if (
        dias >= DIAS_PRIORIDADE_ALTA ||
        cognitiveState.momento_compra === "agora" ||
        cognitiveState.nivel_interesse === "alto"
      ) {
        return "retomar_com_urgencia";
      }
      return "retomar_com_oportunidade";

    case "travamento_docs":
      return "estimular_docs";

    case "travamento_followup":
      return "retomar_com_oportunidade";

    case "travamento_reativacao":
      return "retomar_com_oportunidade";

    case "travamento_visita":
      return "oferecer_visita";

    case "lead_sem_janela":
      return "aguardar_melhor_janela";

    case "lead_sem_interesse_claro":
      return "mudar_tom";

    case "sem_gargalo_claro":
      return "sem_sugestao";
  }
}

function deriveProgramaSugerido(
  gargalo: GargaloPrincipal,
  cognitiveState: LeadCognitiveState,
  visitReadinessState: LeadVisitReadiness | null,
  reclassState: LeadReclassificationReading | null,
): ProgramaSugerido {
  switch (gargalo) {
    case "travamento_humano":
      return "intervencao_humana";

    case "travamento_reativacao":
      return "reativacao_inteligente";

    case "travamento_docs":
      return "caca_pastas";

    case "lead_sem_janela":
      return "janela_de_compra";

    case "travamento_visita":
      // Quase pronto → pré-plantão; com maturidade alta → feirão
      if (visitReadinessState) {
        if (visitReadinessState.maturidade_comercial === "alta") return "ferirao";
        if (visitReadinessState.status_plantao === "quase_pronto") return "pre_plantao";
      }
      return "pre_plantao";

    case "travamento_conversa":
      // Frio recuperável → reativação; caso geral → sem programa específico
      if (reclassState && reclassState.lead_frio_recuperavel === "sim") {
        return "reativacao_inteligente";
      }
      return "nenhum";

    case "travamento_followup":
    case "lead_sem_interesse_claro":
    case "sem_gargalo_claro":
      return "nenhum";
  }
}

function derivePrioridade(
  gargalo: GargaloPrincipal,
  cognitiveState: LeadCognitiveState,
  followupState: LeadFollowupOrganizer | null,
  dias: number,
): PrioridadeMelhoria {
  // Travamento humano → sempre alta
  if (gargalo === "travamento_humano") return "alta";

  // Incidente aberto e severo
  if (
    cognitiveState.necessita_humano ||
    (cognitiveState.risco_travamento === "alto" &&
      (gargalo === "travamento_conversa" || gargalo === "travamento_followup"))
  ) {
    return "alta";
  }

  // Muitos dias sem resposta → alta
  if (dias >= DIAS_PRIORIDADE_ALTA) return "alta";

  // Follow-up urgente
  if (followupState && followupState.urgencia_followup === "alta") return "alta";

  // Sem gargalo → baixa
  if (gargalo === "sem_gargalo_claro") return "baixa";

  // Sem interesse claro ou sem janela → baixa (não forçar)
  if (gargalo === "lead_sem_interesse_claro" || gargalo === "lead_sem_janela") return "baixa";

  // Demais casos com gargalo real → média
  return "media";
}

function derivePrecisaEvolucao(
  gargalo: GargaloPrincipal,
  programaSugerido: ProgramaSugerido,
  cognitiveState: LeadCognitiveState,
): PrecisaEvolucaoEstrutura {
  // Sem gargalo → não precisa
  if (gargalo === "sem_gargalo_claro") return "nao";

  // Travamento humano → já há mecanismo (intervenção humana)
  if (gargalo === "travamento_humano") return "nao";

  // Programa existente cobre o caso → não precisa evolução nova
  if (
    programaSugerido === "reativacao_inteligente" ||
    programaSugerido === "caca_pastas" ||
    programaSugerido === "janela_de_compra" ||
    programaSugerido === "pre_plantao" ||
    programaSugerido === "ferirao"
  ) {
    return "nao";
  }

  // Travamento recorrente sem programa mapeado → incerto (pode precisar)
  if (
    gargalo === "travamento_conversa" ||
    gargalo === "travamento_followup"
  ) {
    return "incerto";
  }

  return "nao";
}

function buildJustificativaMetaOps(
  gargalo: GargaloPrincipal,
  tipo: TipoMelhoriaSugerida,
  sugestao: SugestaoOperacional,
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  dias: number,
): string {
  const partes: string[] = [];

  // Gargalo base
  switch (gargalo) {
    case "travamento_humano":
      partes.push("incidente ativo ou situação que requer humano");
      break;
    case "travamento_conversa":
      if (dias > 0) {
        partes.push(`${dias}d sem retorno do lead`);
      } else {
        partes.push("conversa travada");
      }
      break;
    case "travamento_docs":
      partes.push("docs pendentes bloqueando avanço");
      break;
    case "travamento_followup":
      partes.push("follow-up vencido ou travado no funil");
      break;
    case "travamento_reativacao":
      partes.push("lead frio com potencial de recuperação");
      break;
    case "travamento_visita":
      partes.push("lead quase pronto para visita mas com bloqueio");
      break;
    case "lead_sem_janela":
      partes.push("sem janela de compra clara");
      break;
    case "lead_sem_interesse_claro":
      partes.push("interesse não confirmado");
      break;
    case "sem_gargalo_claro":
      partes.push("sem gargalo identificado");
      break;
  }

  // Enriquecimento por interesse/momento quando relevante
  if (
    gargalo !== "sem_gargalo_claro" &&
    gargalo !== "travamento_humano"
  ) {
    if (cognitiveState.nivel_interesse === "alto") {
      partes.push("interesse alto — vale ação rápida");
    } else if (cognitiveState.nivel_interesse === "baixo") {
      partes.push("interesse baixo — cautela");
    }
    if (cognitiveState.momento_compra === "agora") {
      partes.push("momento: agora");
    }
  }

  // Sugestão resumida
  if (sugestao !== "sem_sugestao") {
    switch (sugestao) {
      case "escalar_para_humano":
        partes.push("→ escalar para humano");
        break;
      case "retomar_com_urgencia":
        partes.push("→ retomar com urgência");
        break;
      case "retomar_com_oportunidade":
        partes.push("→ retomar com oportunidade");
        break;
      case "estimular_docs":
        partes.push("→ estimular documentação");
        break;
      case "oferecer_visita":
        partes.push("→ oferecer visita");
        break;
      case "aguardar_melhor_janela":
        partes.push("→ aguardar janela");
        break;
      case "mudar_tom":
        partes.push("→ mudar abordagem");
        break;
    }
  }

  if (partes.length === 0) {
    return "operação sem gargalo identificado com os sinais disponíveis";
  }

  return partes.join("; ");
}

// ── Leitura principal ─────────────────────────────────────────────────────

/**
 * readLeadMetaOps — Camada canônica de Meta-operação Cognitiva (read-only/assistida).
 *
 * Recebe LeadSignals (PR1) e LeadCognitiveState (PR2), opcionalmente
 * LeadFollowupOrganizer (PR4), LeadDocsReading (PR5),
 * LeadReclassificationReading (PR6) e LeadVisitReadiness (PR7).
 *
 * Devolve leitura estruturada de gargalo, melhoria, sugestão operacional,
 * programa sugerido, prioridade e necessidade de evolução estrutural.
 *
 * Princípios:
 *   - Sem automação, sem side effects, sem escrita em banco.
 *   - Sem IA externa — lógica determinística/heurística.
 *   - Preferir segurança a criatividade.
 *   - Sem inventar gargalo onde não há sinal suficiente.
 *   - Sem falsa precisão.
 *   - Justificativa curta e operacional.
 *   - Pronto para PR 9 de autonomia assistida.
 *
 * @param signals             - Objeto canônico de sinais do lead (buildLeadSignals).
 * @param cognitiveState      - Estado cognitivo classificado (classifyLeadCognitiveState).
 * @param followupState       - Organização de follow-up (PR4, opcional).
 * @param docsState           - Leitura de docs (PR5, opcional).
 * @param reclassState        - Reclassificação assistida (PR6, opcional).
 * @param visitReadinessState - Prontidão para plantão (PR7, opcional).
 * @returns LeadMetaOpsReading — leitura canônica de meta-operação cognitiva.
 */
export function readLeadMetaOps(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  followupState: LeadFollowupOrganizer | null = null,
  docsState: LeadDocsReading | null = null,
  reclassState: LeadReclassificationReading | null = null,
  visitReadinessState: LeadVisitReadiness | null = null,
): LeadMetaOpsReading {
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  const gargalo_principal = deriveGargaloPrincipal(
    signals,
    cognitiveState,
    followupState,
    docsState,
    reclassState,
    visitReadinessState,
  );

  const tipo_melhoria_sugerida = deriveTipoMelhoria(gargalo_principal, cognitiveState, dias);

  const sugestao_operacional = deriveSugestaoOperacional(
    gargalo_principal,
    tipo_melhoria_sugerida,
    cognitiveState,
    dias,
  );

  const programa_sugerido = deriveProgramaSugerido(
    gargalo_principal,
    cognitiveState,
    visitReadinessState,
    reclassState,
  );

  const prioridade_melhoria = derivePrioridade(
    gargalo_principal,
    cognitiveState,
    followupState,
    dias,
  );

  const precisa_evolucao_estrutura = derivePrecisaEvolucao(
    gargalo_principal,
    programa_sugerido,
    cognitiveState,
  );

  const justificativa_meta_operacao = buildJustificativaMetaOps(
    gargalo_principal,
    tipo_melhoria_sugerida,
    sugestao_operacional,
    signals,
    cognitiveState,
    dias,
  );

  return {
    gargalo_principal,
    tipo_melhoria_sugerida,
    sugestao_operacional,
    programa_sugerido,
    prioridade_melhoria,
    precisa_evolucao_estrutura,
    justificativa_meta_operacao,
  };
}
