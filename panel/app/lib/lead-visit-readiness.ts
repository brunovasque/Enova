// ============================================================
// Lead Visit Readiness — panel/app/lib/lead-visit-readiness.ts
//
// PR 7 — Conversão para Plantão + Leitura de Maturidade Comercial
// Escopo: PANEL-ONLY, read-only/assistido, sem automação, sem IA externa.
//
// Propósito:
//   Recebe LeadSignals (PR1), LeadCognitiveState (PR2) e opcionalmente
//   LeadFollowupOrganizer (PR4), LeadDocsReading (PR5) e
//   LeadReclassificationReading (PR6), e devolve uma leitura canônica
//   de maturidade comercial + prontidão para plantão/visita.
//
// Perguntas que esta camada responde:
//   1. Esse lead já está maduro para avançar para visita/plantão?
//   2. Qual é o nível real de maturidade comercial desse caso?
//
// O que esta camada FAZ:
//   - Ler maturidade comercial do lead com base em sinais reais
//   - Classificar prontidão para visita/plantão
//   - Identificar bloqueio principal para visita
//   - Sugerir estratégia e ação de avanço (read-only)
//   - Diferenciar curiosidade, compra ativa, compra madura e pré-plantão
//   - Justificar a leitura de forma objetiva e curta
//
// O que esta camada NÃO FAZ:
//   - Agendar visita automaticamente
//   - Enviar mensagem automática de plantão
//   - Disparar campanha ou automação
//   - Alterar CRM ou banco de dados
//   - Chamar IA externa
//   - Inventar "pronto para visita" onde não há base suficiente
//
// Pronto para futuras campanhas e programas de visita/plantão/feirão.
// ============================================================

import type { LeadSignals } from "./lead-signals";
import type { LeadCognitiveState } from "./lead-cognitive";
import type { LeadFollowupOrganizer } from "./lead-followup";
import type { LeadDocsReading } from "./lead-docs";
import type { LeadReclassificationReading } from "./lead-reclassification";

// ── Tipos canônicos de saída ───────────────────────────────────────────────

/**
 * MaturidadeComercial — nível real de maturidade do lead no ciclo de venda.
 */
export type MaturidadeComercial = "baixa" | "media" | "alta";

/**
 * StatusPlantao — posição do lead em relação à visita/plantão.
 */
export type StatusPlantao =
  | "longe_de_plantao"
  | "quase_pronto"
  | "pronto_para_visita"
  | "em_visita"
  | "pos_visita"
  | "sem_sinal";

/**
 * LeadProntoParaVisita — resposta direta à pergunta principal da camada.
 */
export type LeadProntoParaVisita = "sim" | "nao" | "incerto";

/**
 * BloqueioPlantaoPrincipal — principal obstáculo para avanço até visita/plantão.
 */
export type BloqueioPlantaoPrincipal =
  | "sem_bloqueio_claro"
  | "falta_maturidade"
  | "falta_docs"
  | "falta_aprovacao"
  | "sem_retorno"
  | "travado_no_funil"
  | "precisa_humano"
  | "restricao"
  | "sem_interesse_claro";

/**
 * EstrategiaPlantaoSugerida — abordagem recomendada para avançar até visita/plantão.
 */
export type EstrategiaPlantaoSugerida =
  | "oferecer_visita"
  | "aquecer_para_visita"
  | "reforcar_oportunidade"
  | "reforcar_urgencia"
  | "avancar_docs_primeiro"
  | "avancar_aprovacao_primeiro"
  | "pedir_humano"
  | "aguardar"
  | "nenhuma";

/**
 * AcaoPlantaoSugerida — ação concreta recomendada (sugestão — sem execução automática).
 */
export type AcaoPlantaoSugerida =
  | "convidar_para_plantao"
  | "chamar_cliente"
  | "aguardar"
  | "pedir_humano"
  | "sem_acao";

/**
 * LeadVisitReadiness — saída canônica da camada de prontidão para plantão.
 *
 * Todos os campos são obrigatórios.
 * Saída read-only — sem escrita em banco, sem automação.
 * Pronto para futuras campanhas/programas de visita, plantão, feirão.
 */
export type LeadVisitReadiness = {
  /** Nível real de maturidade comercial do lead. */
  maturidade_comercial: MaturidadeComercial;
  /** Posição do lead em relação à visita/plantão. */
  status_plantao: StatusPlantao;
  /** Resposta à pergunta principal: esse lead está pronto para visita? */
  lead_pronto_para_visita: LeadProntoParaVisita;
  /** Principal obstáculo para avanço até visita/plantão. */
  bloqueio_plantao_principal: BloqueioPlantaoPrincipal;
  /** Estratégia sugerida para avançar até visita/plantão. */
  estrategia_plantao_sugerida: EstrategiaPlantaoSugerida;
  /** Ação concreta recomendada (sugestão — sem execução automática). */
  acao_plantao_sugerida: AcaoPlantaoSugerida;
  /** Justificativa curta e operacional baseada em sinais reais. */
  justificativa_plantao: string;
};

// ── Constantes internas ───────────────────────────────────────────────────

/** Fases em que o lead já está em visita/plantão ou confirmado. */
const FASES_EM_VISITA = new Set([
  "agendamento_visita",
  "visita",
  "visita_confirmada",
]);

/** Fases posteriores à visita (processo avançado). */
const FASES_POS_VISITA = new Set([
  "envio_docs",
  "analise_documentos",
  "finalizacao_processo",
  "aguardando_retorno_correspondente",
]);

/** Fases arquiváveis — plantão fora de cogitação. */
const FASES_ARQUIVAVEIS = new Set([
  "fim_inelegivel",
  "fim_ineligivel",
  "arquivado",
  "cancelado",
  "inativo",
]);

/** Dias sem resposta a partir dos quais "sem_retorno" se aplica. */
const DIAS_SEM_RETORNO = 10;

// ── Helpers internos ──────────────────────────────────────────────────────

function normalizeFase(fase: string | null): string {
  return (fase ?? "").toLowerCase().trim();
}

function isFaseArquivavel(fase: string | null): boolean {
  return FASES_ARQUIVAVEIS.has(normalizeFase(fase));
}

function isFaseEmVisita(fase: string | null): boolean {
  return FASES_EM_VISITA.has(normalizeFase(fase));
}

function isFasePosVisita(fase: string | null): boolean {
  return FASES_POS_VISITA.has(normalizeFase(fase));
}

// ── Derivações atômicas ───────────────────────────────────────────────────

function deriveStatusPlantao(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): StatusPlantao {
  const fase = normalizeFase(signals.operacao.fase_funil);

  // Pós-visita (docs/análise/correspondente)
  if (isFasePosVisita(fase)) return "pos_visita";

  // Em visita ou agendando
  if (isFaseEmVisita(fase)) return "em_visita";

  // Arquivável — sem caminho para plantão
  if (isFaseArquivavel(fase) || signals.timing.arquivado_em) return "longe_de_plantao";

  // Necessita humano urgente — não avançar para plantão ainda
  if (cognitiveState.necessita_humano) return "longe_de_plantao";

  // Restrição ativa — bloqueia prontidão
  if (signals.perfil.restricao === true) return "longe_de_plantao";

  // Cognitivo indica oferecer_visita com interesse alto + momento imediato → pronto
  if (
    cognitiveState.proxima_melhor_acao === "oferecer_visita" &&
    cognitiveState.nivel_interesse === "alto" &&
    (cognitiveState.momento_compra === "agora" ||
      cognitiveState.momento_compra === "curto_prazo")
  ) {
    return "pronto_para_visita";
  }

  // Alto interesse + momento agora/curto prazo + sem restrição + estado não arquivável
  if (
    cognitiveState.nivel_interesse === "alto" &&
    (cognitiveState.momento_compra === "agora" ||
      cognitiveState.momento_compra === "curto_prazo") &&
    cognitiveState.estado_cliente !== "arquivavel" &&
    cognitiveState.estado_cliente !== "reativacao"
  ) {
    return "quase_pronto";
  }

  // Interesse médio + momento curto prazo → quase pronto (conservador)
  if (
    cognitiveState.nivel_interesse === "medio" &&
    cognitiveState.momento_compra === "curto_prazo" &&
    cognitiveState.risco_travamento !== "alto"
  ) {
    return "quase_pronto";
  }

  // Baixo interesse ou arquivável → longe
  if (
    cognitiveState.nivel_interesse === "baixo" ||
    cognitiveState.estado_cliente === "arquivavel" ||
    cognitiveState.momento_compra === "curioso"
  ) {
    return "longe_de_plantao";
  }

  return "sem_sinal";
}

function deriveMaturidadeComercial(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  docsState: LeadDocsReading | null,
): MaturidadeComercial {
  const { nivel_interesse, momento_compra, risco_travamento, estado_cliente } = cognitiveState;
  const restricao = signals.perfil.restricao;

  // Baixa: curiosidade, baixo interesse, arquivável, restrição com risco alto
  if (
    nivel_interesse === "baixo" ||
    estado_cliente === "arquivavel" ||
    momento_compra === "curioso" ||
    (restricao === true && risco_travamento === "alto")
  ) {
    return "baixa";
  }

  // Alta: alto interesse + momento imediato/curto + sem restrição + risco não alto
  // Critério conservador: exige combinação de sinais favoráveis sem sinais bloqueantes
  if (
    nivel_interesse === "alto" &&
    (momento_compra === "agora" || momento_compra === "curto_prazo") &&
    risco_travamento !== "alto" &&
    restricao !== true &&
    estado_cliente !== "reativacao"
  ) {
    // Bônus: já avançou na camada de docs (sinais de comprometimento)
    if (docsState) {
      if (
        docsState.maturidade_docs === "alta" ||
        docsState.status_pasta === "em_docs" ||
        docsState.status_pasta === "pronto_para_docs"
      ) {
        return "alta";
      }
    }
    // Sem confirmação de docs mas sinais cognitivos fortes → alta mesmo assim
    return "alta";
  }

  return "media";
}

function deriveProntoParaVisita(
  status: StatusPlantao,
  maturidade: MaturidadeComercial,
  bloqueio: BloqueioPlantaoPrincipal,
): LeadProntoParaVisita {
  if (status === "em_visita" || status === "pos_visita") return "sim";
  if (status === "pronto_para_visita" && bloqueio === "sem_bloqueio_claro") return "sim";
  if (status === "pronto_para_visita" && maturidade === "alta") return "sim";

  if (status === "quase_pronto" && maturidade === "alta" && bloqueio === "sem_bloqueio_claro") {
    return "incerto";
  }
  if (status === "quase_pronto") return "incerto";

  if (status === "longe_de_plantao") return "nao";
  if (status === "sem_sinal") return "incerto";

  return "nao";
}

function deriveBloqueioPlantao(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  docsState: LeadDocsReading | null,
): BloqueioPlantaoPrincipal {
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Precisa humano — prioridade máxima
  if (cognitiveState.necessita_humano) return "precisa_humano";

  // Restrição real (campo explícito)
  if (signals.perfil.restricao === true) return "restricao";

  // Travado no funil
  if (signals.operacao.fase_travamento) return "travado_no_funil";

  // Sem retorno prolongado
  if (dias >= DIAS_SEM_RETORNO) return "sem_retorno";

  // Falta de docs (inferida da camada de docs quando disponível)
  if (
    docsState &&
    (docsState.status_pasta === "nao_pronto" ||
      docsState.status_pasta === "travado_docs") &&
    docsState.bloqueio_docs_principal !== "sem_bloqueio_claro"
  ) {
    return "falta_docs";
  }

  // Sem interesse claro
  if (cognitiveState.nivel_interesse === "baixo" || cognitiveState.momento_compra === "curioso") {
    return "sem_interesse_claro";
  }

  // Falta maturidade geral (interesse médio + momento distante)
  if (
    cognitiveState.nivel_interesse === "medio" &&
    (cognitiveState.momento_compra === "medio_prazo" ||
      cognitiveState.momento_compra === "sem_janela_clara")
  ) {
    return "falta_maturidade";
  }

  return "sem_bloqueio_claro";
}

function deriveEstrategiaPlantao(
  status: StatusPlantao,
  bloqueio: BloqueioPlantaoPrincipal,
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): EstrategiaPlantaoSugerida {
  // Fases arquiváveis → nenhuma estratégia
  if (isFaseArquivavel(signals.operacao.fase_funil)) return "nenhuma";

  // Já em visita ou pós-visita → nenhuma (já avançado)
  if (isFaseEmVisita(signals.operacao.fase_funil)) return "nenhuma";
  if (isFasePosVisita(signals.operacao.fase_funil)) return "nenhuma";

  switch (bloqueio) {
    case "precisa_humano":
    case "restricao":
      return "pedir_humano";

    case "travado_no_funil":
      return "pedir_humano";

    case "sem_retorno":
      return "aguardar";

    case "falta_docs":
      return "avancar_docs_primeiro";

    case "falta_aprovacao":
      return "avancar_aprovacao_primeiro";

    case "sem_interesse_claro":
      return "reforcar_oportunidade";

    case "falta_maturidade":
      return "aquecer_para_visita";

    case "sem_bloqueio_claro":
      if (status === "pronto_para_visita") return "oferecer_visita";
      if (status === "quase_pronto") {
        if (
          cognitiveState.nivel_interesse === "alto" &&
          (cognitiveState.momento_compra === "agora" ||
            cognitiveState.momento_compra === "curto_prazo")
        ) {
          return "reforcar_urgencia";
        }
        return "aquecer_para_visita";
      }
      return "reforcar_oportunidade";
  }
}

function deriveAcaoPlantao(
  status: StatusPlantao,
  bloqueio: BloqueioPlantaoPrincipal,
  cognitiveState: LeadCognitiveState,
  signals: LeadSignals,
): AcaoPlantaoSugerida {
  // Arquivável → sem ação
  if (isFaseArquivavel(signals.operacao.fase_funil) || signals.timing.arquivado_em) {
    return "sem_acao";
  }

  // Já em visita ou pós → sem ação (já está no caminho)
  if (isFaseEmVisita(signals.operacao.fase_funil)) return "sem_acao";
  if (isFasePosVisita(signals.operacao.fase_funil)) return "sem_acao";

  // Necessita humano ou restrição → pedir humano
  if (
    cognitiveState.necessita_humano ||
    bloqueio === "restricao" ||
    bloqueio === "precisa_humano" ||
    bloqueio === "travado_no_funil"
  ) {
    return "pedir_humano";
  }

  // Sem retorno → aguardar
  if (bloqueio === "sem_retorno") return "aguardar";

  // Pronto para visita → convidar
  if (status === "pronto_para_visita" && bloqueio === "sem_bloqueio_claro") {
    return "convidar_para_plantao";
  }

  // Quase pronto ou sem bloqueio claro + interesse alto → chamar
  if (
    (status === "quase_pronto" || status === "pronto_para_visita") &&
    cognitiveState.nivel_interesse === "alto"
  ) {
    return "chamar_cliente";
  }

  // Longe ou sem sinal → sem ação
  if (status === "longe_de_plantao") return "sem_acao";

  return "sem_acao";
}

function buildJustificativaPlantao(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  status: StatusPlantao,
  bloqueio: BloqueioPlantaoPrincipal,
  maturidade: MaturidadeComercial,
): string {
  const partes: string[] = [];
  const fase = normalizeFase(signals.operacao.fase_funil);
  const dias = signals.interacao.dias_sem_resposta_cliente;

  // Situação da fase
  if (isFaseEmVisita(fase)) {
    partes.push("em visita/plantão");
  } else if (isFasePosVisita(fase)) {
    partes.push("pós-visita");
  } else if (isFaseArquivavel(fase)) {
    partes.push("lead arquivado");
  }

  // Maturidade
  if (maturidade === "alta") {
    partes.push("maturidade alta");
  } else if (maturidade === "baixa") {
    partes.push("maturidade baixa");
  }

  // Interesse e momento
  if (cognitiveState.nivel_interesse === "alto") {
    partes.push("interesse alto");
  } else if (cognitiveState.nivel_interesse === "baixo") {
    partes.push("interesse baixo");
  }

  if (cognitiveState.momento_compra === "agora") {
    partes.push("momento: agora");
  } else if (cognitiveState.momento_compra === "curioso") {
    partes.push("curiosidade apenas");
  } else if (cognitiveState.momento_compra === "curto_prazo") {
    partes.push("janela curto prazo");
  }

  // Bloqueio principal
  switch (bloqueio) {
    case "restricao":
      partes.push("restrição ativa");
      break;
    case "travado_no_funil":
      partes.push("travado no funil");
      break;
    case "sem_retorno":
      if (dias !== null && dias >= DIAS_SEM_RETORNO) {
        partes.push(`${dias}d sem retorno`);
      }
      break;
    case "falta_docs":
      partes.push("docs pendentes");
      break;
    case "falta_maturidade":
      partes.push("maturidade insuficiente");
      break;
    case "sem_interesse_claro":
      partes.push("interesse não confirmado");
      break;
    case "precisa_humano":
      partes.push("requer intervenção humana");
      break;
    case "sem_bloqueio_claro":
      if (status === "pronto_para_visita" || status === "quase_pronto") {
        partes.push("sem bloqueio identificado");
      }
      break;
    default:
      break;
  }

  if (partes.length === 0) {
    return "sinais insuficientes para leitura";
  }

  return partes.join("; ");
}

// ── Leitura principal ─────────────────────────────────────────────────────

/**
 * readLeadVisitReadiness — Camada canônica de Prontidão para Plantão (read-only/assistida).
 *
 * Recebe LeadSignals (PR1) e LeadCognitiveState (PR2), opcionalmente
 * LeadFollowupOrganizer (PR4), LeadDocsReading (PR5) e
 * LeadReclassificationReading (PR6).
 *
 * Devolve leitura estruturada de maturidade comercial + prontidão para visita/plantão.
 *
 * Princípios:
 *   - Sem automação, sem side effects, sem escrita em banco.
 *   - Sem IA externa — lógica determinística/heurística.
 *   - Preferir segurança a criatividade.
 *   - Sem declarar "pronto para visita" cedo demais.
 *   - Sem tratar curiosidade como compra madura.
 *   - Sem falsa precisão: campos derivados apenas de sinais reais.
 *   - Justificativa curta e operacional.
 *
 * @param signals        - Objeto canônico de sinais do lead (buildLeadSignals).
 * @param cognitiveState - Estado cognitivo classificado (classifyLeadCognitiveState).
 * @param followupState  - Organização de follow-up (PR4, opcional).
 * @param docsState      - Leitura de docs (PR5, opcional).
 * @param reclassState   - Reclassificação assistida (PR6, opcional).
 * @returns LeadVisitReadiness — leitura canônica de prontidão para plantão/visita.
 */
export function readLeadVisitReadiness(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  followupState: LeadFollowupOrganizer | null = null,
  docsState: LeadDocsReading | null = null,
  reclassState: LeadReclassificationReading | null = null,
): LeadVisitReadiness {
  // followupState and reclassState are accepted for future enrichment;
  // currently not directly consumed to keep logic minimal and auditable.
  void followupState;
  void reclassState;

  const status_plantao = deriveStatusPlantao(signals, cognitiveState);
  const maturidade_comercial = deriveMaturidadeComercial(signals, cognitiveState, docsState);
  const bloqueio_plantao_principal = deriveBloqueioPlantao(signals, cognitiveState, docsState);
  const lead_pronto_para_visita = deriveProntoParaVisita(
    status_plantao,
    maturidade_comercial,
    bloqueio_plantao_principal,
  );
  const estrategia_plantao_sugerida = deriveEstrategiaPlantao(
    status_plantao,
    bloqueio_plantao_principal,
    signals,
    cognitiveState,
  );
  const acao_plantao_sugerida = deriveAcaoPlantao(
    status_plantao,
    bloqueio_plantao_principal,
    cognitiveState,
    signals,
  );
  const justificativa_plantao = buildJustificativaPlantao(
    signals,
    cognitiveState,
    status_plantao,
    bloqueio_plantao_principal,
    maturidade_comercial,
  );

  return {
    maturidade_comercial,
    status_plantao,
    lead_pronto_para_visita,
    bloqueio_plantao_principal,
    estrategia_plantao_sugerida,
    acao_plantao_sugerida,
    justificativa_plantao,
  };
}
