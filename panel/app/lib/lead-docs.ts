// ============================================================
// Lead Docs Reader — panel/app/lib/lead-docs.ts
//
// PR 5 — Máquina de Pastas / Leitura de Docs
// Escopo: PANEL-ONLY, read-only/assistido, sem automação, sem IA externa.
//
// Propósito:
//   Recebe LeadSignals (PR 1) e LeadCognitiveState (PR 2) e devolve
//   uma leitura canônica de prontidão do lead para virar pasta/docs.
//
// O que esta camada FAZ:
//   - Ler sinais reais de fase, perfil, feedback humano e estado cognitivo
//   - Classificar prontidão para docs (status_pasta, maturidade_docs)
//   - Identificar o bloqueio principal para virar pasta
//   - Sugerir estratégia e ação operacional (read-only)
//   - Estimar probabilidade de virar pasta com base em sinais reais
//   - Justificar a leitura de forma objetiva e curta
//
// O que esta camada NÃO FAZ:
//   - Enviar cobrança de docs automaticamente
//   - Disparar campanha ou automação
//   - Alterar CRM ou banco de dados
//   - Chamar IA externa
//   - Inventar "pronto para docs" onde não há base
//
// Pronto para consumo em campanhas de docs e programa caça-pastas futuros.
// ============================================================

import type { LeadSignals } from "./lead-signals";
import type { LeadCognitiveState } from "./lead-cognitive";

// ── Tipos canônicos de saída ───────────────────────────────────────────────

/**
 * StatusPasta — situação atual do lead em relação à virada para pasta/docs.
 */
export type StatusPasta =
  | "nao_pronto"
  | "quase_pronto"
  | "pronto_para_docs"
  | "travado_docs"
  | "em_docs"
  | "sem_sinal";

/**
 * MaturidadeDocs — nível de maturidade do lead para iniciar o processo de docs.
 */
export type MaturidadeDocs = "baixa" | "media" | "alta";

/**
 * BloqueioDocsPrincipal — principal obstáculo para virar pasta.
 */
export type BloqueioDocsPrincipal =
  | "sem_bloqueio_claro"
  | "falta_confianca"
  | "falta_tempo"
  | "falta_interesse"
  | "travado_no_funil"
  | "restricao"
  | "renda_fraca"
  | "sem_retorno"
  | "precisa_humano";

/**
 * EstrategiaDocsSugerida — abordagem recomendada para destravar o lead para docs.
 */
export type EstrategiaDocsSugerida =
  | "reforcar_praticidade"
  | "reforcar_urgencia"
  | "reforcar_seguranca"
  | "reforcar_oportunidade"
  | "oferecer_visita"
  | "pedir_humano"
  | "aguardar"
  | "nenhuma";

/**
 * ProbabilidadePasta — probabilidade estimada de virar pasta com base em sinais reais.
 */
export type ProbabilidadePasta = "baixa" | "media" | "alta";

/**
 * AcaoDocsSugerida — ação concreta recomendada para docs (sugestão — sem execução automática).
 */
export type AcaoDocsSugerida =
  | "estimular_docs"
  | "chamar_cliente"
  | "aguardar"
  | "pedir_humano"
  | "oferecer_visita"
  | "sem_acao";

/**
 * LeadDocsReading — saída canônica da Máquina de Pastas.
 *
 * Todos os campos são obrigatórios.
 * Saída read-only — sem escrita em banco, sem automação.
 * Pronto para consumo visual e para evolução em campanhas/programas de docs.
 */
export type LeadDocsReading = {
  /** Situação atual do lead em relação a pasta/docs. */
  status_pasta: StatusPasta;
  /** Nível de maturidade do lead para docs. */
  maturidade_docs: MaturidadeDocs;
  /** Principal obstáculo para virar pasta. */
  bloqueio_docs_principal: BloqueioDocsPrincipal;
  /** Estratégia sugerida para destravar. */
  estrategia_docs_sugerida: EstrategiaDocsSugerida;
  /** Probabilidade estimada de virar pasta. */
  probabilidade_pasta: ProbabilidadePasta;
  /** Ação concreta recomendada (sugestão — sem execução automática). */
  acao_docs_sugerida: AcaoDocsSugerida;
  /** Justificativa objetiva baseada em sinais reais. */
  justificativa_docs: string;
};

// ── Constantes internas ───────────────────────────────────────────────────

/** Fases em que o lead já está no processo de docs. */
const FASES_EM_DOCS = new Set([
  "envio_docs",
  "analise_documentos",
]);

/** Fases em que o processo de docs já foi concluído/enviado. */
const FASES_POS_DOCS = new Set([
  "finalizacao_processo",
  "aguardando_retorno_correspondente",
]);

/** Fases de visita — lead está próximo de docs. */
const FASES_VISITA = new Set([
  "agendamento_visita",
  "visita",
  "visita_confirmada",
]);

/** Fases arquiváveis — docs fora de cogitação. */
const FASES_ARQUIVAVEIS = new Set([
  "fim_inelegivel",
  "fim_ineligivel",
  "arquivado",
  "cancelado",
  "inativo",
]);

/**
 * Renda mínima conservadora para elegibilidade de docs
 * (referência: patamar do programa Minha Casa Minha Vida).
 * Usado apenas quando renda_total é explicitamente preenchida.
 */
const RENDA_MINIMA_DOCS = 1500;

/** Dias sem resposta a partir dos quais o bloqueio "sem_retorno" se aplica. */
const DIAS_SEM_RETORNO = 10;

// ── Helpers internos ──────────────────────────────────────────────────────

function normalizeFase(fase: string | null): string {
  return (fase ?? "").toLowerCase().trim();
}

function isFaseArquivavel(fase: string | null): boolean {
  return FASES_ARQUIVAVEIS.has(normalizeFase(fase));
}

function isFaseEmDocs(fase: string | null): boolean {
  return FASES_EM_DOCS.has(normalizeFase(fase)) || FASES_POS_DOCS.has(normalizeFase(fase));
}

function isFaseVisita(fase: string | null): boolean {
  return FASES_VISITA.has(normalizeFase(fase));
}

// ── Derivações atômicas ───────────────────────────────────────────────────

function deriveStatusPasta(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): StatusPasta {
  const fase = normalizeFase(signals.operacao.fase_funil);

  // Já em docs ou pós-docs
  if (isFaseEmDocs(fase)) return "em_docs";

  // Arquivável → não pronto
  if (isFaseArquivavel(fase) || signals.timing.arquivado_em) return "nao_pronto";

  // Necessita humano urgente → não pronto para docs ainda
  if (cognitiveState.necessita_humano) return "nao_pronto";

  // Restrição ativa → bloqueia prontidão para docs
  if (signals.perfil.restricao === true) return "nao_pronto";

  // Travado no funil → travado_docs se já estava em rota de docs
  if (
    signals.operacao.fase_travamento &&
    (isFaseVisita(normalizeFase(signals.operacao.fase_travamento)) ||
      isFaseEmDocs(normalizeFase(signals.operacao.fase_travamento)))
  ) {
    return "travado_docs";
  }

  // Cognitivo indica estimular documentos com alto interesse → pronto
  if (
    cognitiveState.proxima_melhor_acao === "estimular_documentos" &&
    cognitiveState.nivel_interesse === "alto"
  ) {
    return "pronto_para_docs";
  }

  // Fase de visita + interesse não baixo → quase pronto
  if (isFaseVisita(fase) && cognitiveState.nivel_interesse !== "baixo") {
    return "quase_pronto";
  }

  // Alto interesse + momento agora/curto prazo + não arquivável
  if (
    cognitiveState.nivel_interesse === "alto" &&
    (cognitiveState.momento_compra === "agora" ||
      cognitiveState.momento_compra === "curto_prazo") &&
    cognitiveState.estado_cliente !== "arquivavel" &&
    cognitiveState.estado_cliente !== "reativacao"
  ) {
    return "quase_pronto";
  }

  // Baixo interesse ou arquivável → não pronto
  if (
    cognitiveState.nivel_interesse === "baixo" ||
    cognitiveState.estado_cliente === "arquivavel"
  ) {
    return "nao_pronto";
  }

  return "sem_sinal";
}

function deriveMaturidadeDocs(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): MaturidadeDocs {
  const { nivel_interesse, momento_compra, risco_travamento } = cognitiveState;
  const restricao = signals.perfil.restricao;
  const rendaTotal = signals.perfil.renda_total ?? signals.perfil.renda;

  // Alta: alto interesse + momento imediato/curto + baixo risco + sem restrição + renda OK
  if (
    nivel_interesse === "alto" &&
    (momento_compra === "agora" || momento_compra === "curto_prazo") &&
    risco_travamento !== "alto" &&
    restricao !== true &&
    (rendaTotal === null || rendaTotal >= RENDA_MINIMA_DOCS)
  ) {
    return "alta";
  }

  // Baixa: baixo interesse, ou arquivável, ou restrição com risco alto
  if (
    nivel_interesse === "baixo" ||
    cognitiveState.estado_cliente === "arquivavel" ||
    (restricao === true && risco_travamento === "alto")
  ) {
    return "baixa";
  }

  return "media";
}

function deriveBloqueio(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): BloqueioDocsPrincipal {
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Necessita humano urgente → prioridade máxima
  if (cognitiveState.necessita_humano) return "precisa_humano";

  // Restrição real (campo explícito)
  if (signals.perfil.restricao === true) return "restricao";

  // Travado no funil (campo fase_travamento preenchido)
  if (signals.operacao.fase_travamento) return "travado_no_funil";

  // Renda abaixo do mínimo (somente quando campo explicitamente preenchido)
  const rendaTotal = signals.perfil.renda_total ?? signals.perfil.renda;
  if (rendaTotal !== null && rendaTotal < RENDA_MINIMA_DOCS) return "renda_fraca";

  // Sem retorno por muitos dias
  if (dias >= DIAS_SEM_RETORNO) return "sem_retorno";

  // Falta de interesse
  if (cognitiveState.nivel_interesse === "baixo") return "falta_interesse";

  // Falta de confiança — leitura do feedback humano
  const objecao = (signals.feedback_humano.objecao_principal ?? "").toLowerCase();
  if (
    objecao.includes("confian") ||
    objecao.includes("medo") ||
    objecao.includes("segur") ||
    objecao.includes("dúvida") ||
    objecao.includes("duvida")
  ) {
    return "falta_confianca";
  }

  // Falta de tempo — leitura do momento do cliente
  const momento = (signals.feedback_humano.momento_do_cliente ?? "").toLowerCase();
  if (
    momento.includes("ocupado") ||
    momento.includes("sem tempo") ||
    momento.includes("depois") ||
    momento.includes("corrido")
  ) {
    return "falta_tempo";
  }

  return "sem_bloqueio_claro";
}

function deriveEstrategia(
  bloqueio: BloqueioDocsPrincipal,
  status: StatusPasta,
  signals: LeadSignals,
): EstrategiaDocsSugerida {
  // Fases arquiváveis → nenhuma estratégia
  if (isFaseArquivavel(signals.operacao.fase_funil)) return "nenhuma";

  switch (bloqueio) {
    case "precisa_humano":
    case "restricao":
    case "renda_fraca":
      return "pedir_humano";

    case "travado_no_funil":
      // Se estava em rota de visita → oferecer visita presencial para destravar
      if (isFaseVisita(normalizeFase(signals.operacao.fase_travamento))) {
        return "oferecer_visita";
      }
      return "pedir_humano";

    case "sem_retorno":
      return "aguardar";

    case "falta_interesse":
      return "reforcar_oportunidade";

    case "falta_confianca":
      return "reforcar_seguranca";

    case "falta_tempo":
      return "reforcar_praticidade";

    case "sem_bloqueio_claro":
      if (status === "pronto_para_docs" || status === "quase_pronto") {
        return "reforcar_urgencia";
      }
      if (status === "em_docs") return "nenhuma";
      return "reforcar_oportunidade";
  }
}

function deriveProbabilidade(
  status: StatusPasta,
  bloqueio: BloqueioDocsPrincipal,
  maturidade: MaturidadeDocs,
): ProbabilidadePasta {
  // Em docs já → contexto passado; probabilidade real não se aplica da mesma forma
  if (status === "em_docs") return "alta";

  if (
    (status === "pronto_para_docs") &&
    bloqueio === "sem_bloqueio_claro" &&
    maturidade === "alta"
  ) {
    return "alta";
  }

  if (
    status === "quase_pronto" ||
    (status === "pronto_para_docs" && bloqueio !== "sem_bloqueio_claro")
  ) {
    return "media";
  }

  if (status === "nao_pronto" || status === "travado_docs" || status === "sem_sinal") {
    return "baixa";
  }

  return "media";
}

function deriveAcaoDocs(
  status: StatusPasta,
  bloqueio: BloqueioDocsPrincipal,
  cognitiveState: LeadCognitiveState,
  signals: LeadSignals,
): AcaoDocsSugerida {
  // Arquivável → sem ação
  if (isFaseArquivavel(signals.operacao.fase_funil) || signals.timing.arquivado_em) {
    return "sem_acao";
  }

  // Necessita humano ou bloqueio humano/restricao
  if (
    cognitiveState.necessita_humano ||
    bloqueio === "restricao" ||
    bloqueio === "renda_fraca" ||
    bloqueio === "precisa_humano"
  ) {
    return "pedir_humano";
  }

  // Não pronto e sem caminho → sem ação
  if (status === "nao_pronto") return "sem_acao";

  // Já em docs → aguardar
  if (status === "em_docs") return "aguardar";

  // Sem retorno → aguardar
  if (bloqueio === "sem_retorno") return "aguardar";

  // Pronto para docs → estimular
  if (status === "pronto_para_docs") return "estimular_docs";

  // Quase pronto → oferecer visita se ainda não está em fase de visita
  if (
    status === "quase_pronto" &&
    !isFaseVisita(normalizeFase(signals.operacao.fase_funil))
  ) {
    return "oferecer_visita";
  }

  // Quase pronto + bola com Enova → chamar
  if (status === "quase_pronto" && cognitiveState.bola_com === "enova") {
    return "chamar_cliente";
  }

  // Fallback quase pronto
  if (status === "quase_pronto") return "chamar_cliente";

  // Travado em docs → chamar para destravar
  if (status === "travado_docs") return "chamar_cliente";

  return "sem_acao";
}

function buildJustificativaDocs(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  status: StatusPasta,
  bloqueio: BloqueioDocsPrincipal,
): string {
  const partes: string[] = [];
  const fase = normalizeFase(signals.operacao.fase_funil);
  const dias = signals.interacao.dias_sem_resposta_cliente;

  // Fase atual (quando relevante)
  if (isFaseEmDocs(fase)) {
    partes.push("em processo de documentação");
  } else if (isFaseVisita(fase)) {
    partes.push("fase de visita concluída ou em andamento");
  } else if (isFaseArquivavel(fase)) {
    partes.push("lead arquivado");
  }

  // Status cognitivo relevante
  if (cognitiveState.nivel_interesse === "alto") {
    partes.push("interesse alto");
  } else if (cognitiveState.nivel_interesse === "baixo") {
    partes.push("interesse baixo");
  }

  // Momento de compra
  if (cognitiveState.momento_compra === "agora") {
    partes.push("momento de compra: agora");
  } else if (cognitiveState.momento_compra === "curto_prazo") {
    partes.push("janela curto prazo");
  }

  // Bloqueio
  switch (bloqueio) {
    case "restricao":
      partes.push("restrição ativa");
      break;
    case "renda_fraca":
      partes.push("renda abaixo do mínimo");
      break;
    case "travado_no_funil":
      partes.push("travado no funil");
      break;
    case "sem_retorno":
      if (dias !== null && dias >= DIAS_SEM_RETORNO) {
        partes.push(`${dias}d sem retorno`);
      }
      break;
    case "falta_interesse":
      partes.push("interesse insuficiente");
      break;
    case "falta_confianca":
      partes.push("objeção: confiança");
      break;
    case "falta_tempo":
      partes.push("cliente sem tempo");
      break;
    case "precisa_humano":
      partes.push("requer intervenção humana");
      break;
    case "sem_bloqueio_claro":
      if (status === "pronto_para_docs" || status === "quase_pronto") {
        partes.push("sem bloqueio identificado");
      }
      break;
  }

  // Restrição explícita (mesmo que não seja o bloqueio principal)
  if (signals.perfil.restricao === true && bloqueio !== "restricao") {
    partes.push("restrição presente");
  }

  if (partes.length === 0) {
    return "sinais insuficientes para leitura";
  }

  return partes.join("; ");
}

// ── Leitura principal ─────────────────────────────────────────────────────

/**
 * readLeadDocs — Máquina de Pastas canônica (read-only/assistida).
 *
 * Recebe LeadSignals (PR 1) e LeadCognitiveState (PR 2) e devolve
 * uma leitura estruturada de prontidão do lead para virar pasta/docs.
 *
 * Princípios:
 *   - Sem automação, sem side effects, sem escrita em banco.
 *   - Sem IA externa — lógica puramente determinística/heurística.
 *   - Preferir segurança a criatividade.
 *   - Sem falsa precisão: campos derivados apenas de sinais reais.
 *   - Justificativa objetiva e operacional.
 *
 * @param signals        - Objeto canônico de sinais do lead (buildLeadSignals).
 * @param cognitiveState - Estado cognitivo classificado (classifyLeadCognitiveState).
 * @returns LeadDocsReading — leitura canônica de prontidão para pasta/docs.
 */
export function readLeadDocs(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): LeadDocsReading {
  const status_pasta = deriveStatusPasta(signals, cognitiveState);
  const maturidade_docs = deriveMaturidadeDocs(signals, cognitiveState);
  const bloqueio_docs_principal = deriveBloqueio(signals, cognitiveState);
  const estrategia_docs_sugerida = deriveEstrategia(bloqueio_docs_principal, status_pasta, signals);
  const probabilidade_pasta = deriveProbabilidade(status_pasta, bloqueio_docs_principal, maturidade_docs);
  const acao_docs_sugerida = deriveAcaoDocs(status_pasta, bloqueio_docs_principal, cognitiveState, signals);
  const justificativa_docs = buildJustificativaDocs(signals, cognitiveState, status_pasta, bloqueio_docs_principal);

  return {
    status_pasta,
    maturidade_docs,
    bloqueio_docs_principal,
    estrategia_docs_sugerida,
    probabilidade_pasta,
    acao_docs_sugerida,
    justificativa_docs,
  };
}
