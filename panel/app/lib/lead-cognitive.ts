// ============================================================
// Lead Cognitive Classifier — panel/app/lib/lead-cognitive.ts
//
// PR 2 — Classificador Cognitivo Read-only
// Escopo: PANEL-ONLY, read-only, sem automação, sem IA externa.
//
// Propósito:
//   Recebe o objeto canônico LeadSignals (PR 1) e devolve uma leitura
//   cognitiva estruturada, determinística e auditável sobre o estado do lead.
//
// O que esta camada FAZ:
//   - Ler sinais reais do lead
//   - Classificar dimensões cognitivas com heurísticas leves
//   - Justificar cada classificação de forma objetiva
//   - Retornar saída estruturada e auditável
//
// O que esta camada NÃO FAZ:
//   - Alterar CRM ou banco de dados
//   - Disparar follow-up, mensagem ou automação
//   - Chamar IA externa
//   - Inventar leitura onde não há sinal suficiente
//
// Pronto para consumo na PR 3 (bloco visual Estado Cognitivo no CRM).
// ============================================================

import type { LeadSignals } from "./lead-signals";

// ── Tipos canônicos de saída ───────────────────────────────────────────────

/**
 * EstadoCliente — posição cognitiva consolidada do lead no ciclo de compra.
 */
export type EstadoCliente =
  | "novo"
  | "em_qualificacao"
  | "compra_ativa"
  | "interessado_sem_acao"
  | "morno"
  | "travado"
  | "aguardando_cliente"
  | "aguardando_enova"
  | "aguardando_documentos"
  | "reativacao"
  | "arquivavel";

/**
 * MomentoCompra — janela de compra percebida.
 */
export type MomentoCompra =
  | "agora"
  | "curto_prazo"
  | "medio_prazo"
  | "sem_janela_clara"
  | "curioso";

/**
 * NivelInteresse — intensidade de interesse observada.
 */
export type NivelInteresse = "alto" | "medio" | "baixo";

/**
 * RiscoTravamento — probabilidade de o lead travar ou parar.
 */
export type RiscoTravamento = "baixo" | "medio" | "alto";

/**
 * BolaCom — quem precisa agir agora para o lead avançar.
 */
export type BolaCom = "lead" | "enova" | "indefinido";

/**
 * ProximaMelhorAcao — ação operacional recomendada para o próximo passo.
 */
export type ProximaMelhorAcao =
  | "chamar_cliente"
  | "aguardar"
  | "enviar_followup"
  | "estimular_documentos"
  | "oferecer_visita"
  | "pedir_intervencao_humana"
  | "reativar"
  | "arquivar"
  | "priorizar";

/**
 * Confianca — nível de confiança da classificação.
 * "alta"   = múltiplos sinais convergentes, baixa ambiguidade
 * "media"  = sinal parcial, uma ou duas dimensões incertas
 * "baixa"  = poucos sinais, inferência conservadora
 */
export type Confianca = "alta" | "media" | "baixa";

/**
 * LeadCognitiveState — saída canônica do classificador cognitivo.
 *
 * Todos os campos são obrigatórios.
 * Campos incertos recebem valor conservador + confianca "baixa".
 * Justificativa é curta, objetiva e baseada em sinais reais.
 */
export type LeadCognitiveState = {
  /** Posição cognitiva consolidada do lead no ciclo de compra. */
  estado_cliente: EstadoCliente;
  /** Janela de compra percebida. */
  momento_compra: MomentoCompra;
  /** Intensidade de interesse observada. */
  nivel_interesse: NivelInteresse;
  /** Probabilidade de o lead travar ou parar. */
  risco_travamento: RiscoTravamento;
  /** Quem precisa agir agora. */
  bola_com: BolaCom;
  /** Ação operacional recomendada para o próximo passo. */
  proxima_melhor_acao: ProximaMelhorAcao;
  /** Se verdadeiro, este lead requer intervenção humana urgente. */
  necessita_humano: boolean;
  /** Nível de confiança da classificação. */
  confianca: Confianca;
  /** Justificativa objetiva da classificação. */
  justificativa: string;
};

// ── Constantes internas ───────────────────────────────────────────────────

/** Dias sem resposta do cliente a partir dos quais o lead é considerado frio. */
const DIAS_FRIO = 7;
/** Dias sem resposta considerados críticos (lead arquivável). */
const DIAS_CRITICO = 21;
/** Dias sem resposta em que o risco de travamento vira alto. */
const DIAS_RISCO_ALTO = 5;

/** Fases de funil que indicam avanço operacional ativo. */
const FASES_COMPRA_ATIVA = new Set([
  "envio_docs",
  "analise_documentos",
  "finalizacao_processo",
  "aguardando_retorno_correspondente",
  "visita",
  "agendamento_visita",
  "visita_confirmada",
]);

/** Fases de qualificação (coletar dados do lead). */
const FASES_QUALIFICACAO = new Set([
  "inicio_programa",
  "qualificacao",
  "verificacao_renda",
  "composicao_familiar",
  "verificacao_restricao",
  "regularizacao_restricao",
  "ctps_36",
  "ctps_36_parceiro",
  "ctps_36_parceiro_p3",
  "restricao_parceiro",
  "restricao_parceiro_p3",
  "regularizacao_restricao_p3",
  "estado_civil",
  "regime_trabalho",
  "renda",
  "informativo_moradia_atual",
  "informativo_trabalho",
  "informativo_moradia",
  "informativo_parcela_mensal",
  "informativo_reserva",
  "informativo_reserva_valor",
  "informativo_fgts",
  "informativo_fgts_valor",
  "informativo_escolaridade",
  "informativo_profissao_atividade",
  "informativo_mei_pj_status",
  "informativo_renda_estabilidade",
  "informativo_decisor_visita",
  "informativo_decisor_nome",
]);

/** Fases finais/arquiváveis. */
const FASES_ARQUIVAVEIS = new Set([
  "fim_inelegivel",
  "fim_ineligivel",
  "arquivado",
  "cancelado",
  "inativo",
]);

/** Valores de interesse_atual que indicam alto interesse. */
const INTERESSE_ALTO = new Set(["alto", "Alta", "high", "quente", "hot"]);
/** Valores de interesse_atual que indicam baixo interesse. */
const INTERESSE_BAIXO = new Set(["baixo", "Baixo", "low", "frio", "cold", "sem_interesse"]);

// ── Helpers internos ──────────────────────────────────────────────────────

function normalizeFase(fase: string | null): string {
  return (fase ?? "").toLowerCase().trim();
}

function isFaseArquivavel(fase: string | null): boolean {
  return FASES_ARQUIVAVEIS.has(normalizeFase(fase));
}

function isFaseCompraAtiva(fase: string | null): boolean {
  return FASES_COMPRA_ATIVA.has(normalizeFase(fase));
}

function isFaseQualificacao(fase: string | null): boolean {
  return FASES_QUALIFICACAO.has(normalizeFase(fase));
}

/**
 * Deriva nivel_interesse a partir dos sinais disponíveis.
 * Prioridade: feedback humano > lead_temp > sinal da conversa > dias_sem_resposta.
 */
function deriveNivelInteresse(signals: LeadSignals): NivelInteresse {
  const interesse = (signals.feedback_humano.interesse_atual ?? "").toLowerCase();
  if (INTERESSE_ALTO.has(interesse)) return "alto";
  if (INTERESSE_BAIXO.has(interesse)) return "baixo";

  const temp = (signals.contexto.lead_temp ?? "").toUpperCase();
  if (temp === "HOT") return "alto";
  if (temp === "COLD") return "baixo";
  if (temp === "WARM") return "medio";

  const sinal = signals.interacao.ultimo_sinal_cliente;
  if (sinal === "Interessado") return "alto";
  if (sinal === "Resistente" || sinal === "Evasivo") return "baixo";

  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  if (dias >= DIAS_FRIO) return "baixo";
  if (dias >= 3) return "medio";

  return "medio";
}

/**
 * Deriva momento_compra a partir dos sinais disponíveis.
 */
function deriveMomentoCompra(signals: LeadSignals): MomentoCompra {
  const momento = (signals.feedback_humano.momento_do_cliente ?? "").toLowerCase();
  if (momento.includes("agora") || momento.includes("imediato") || momento.includes("urgente")) return "agora";
  if (momento.includes("curto") || momento.includes("semana") || momento.includes("mês")) return "curto_prazo";
  if (momento.includes("medio") || momento.includes("médio") || momento.includes("trimestre")) return "medio_prazo";
  if (momento.includes("curioso") || momento.includes("pesquisando") || momento.includes("só vendo")) return "curioso";

  const fase = normalizeFase(signals.operacao.fase_funil);
  if (isFaseCompraAtiva(fase)) return "agora";
  if (isFaseQualificacao(fase) && fase !== "inicio_programa") return "curto_prazo";

  const temp = (signals.contexto.lead_temp ?? "").toUpperCase();
  if (temp === "HOT") return "agora";
  if (temp === "WARM") return "curto_prazo";
  if (temp === "COLD") return "sem_janela_clara";

  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  if (dias >= DIAS_FRIO) return "sem_janela_clara";

  return "sem_janela_clara";
}

/**
 * Deriva risco_travamento a partir dos sinais disponíveis.
 */
function deriveRiscoTravamento(signals: LeadSignals): RiscoTravamento {
  // Travamento explícito registrado
  if (signals.operacao.fase_travamento) return "alto";

  // Incidente crítico aberto
  if (
    signals.operacao.tem_incidente_aberto &&
    (signals.operacao.severidade_incidente === "CRITICAL" ||
      signals.operacao.severidade_incidente === "HIGH")
  ) {
    return "alto";
  }

  // Restrição ou documentação em aberto
  if (signals.perfil.restricao === true) return "alto";

  // Muitos dias sem resposta
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  if (dias >= DIAS_RISCO_ALTO) return "alto";
  if (dias >= 3) return "medio";

  // Objeção registrada
  if (signals.feedback_humano.objecao_principal) return "medio";

  // Sinal evasivo ou resistente
  const sinal = signals.interacao.ultimo_sinal_cliente;
  if (sinal === "Resistente") return "alto";
  if (sinal === "Evasivo" || sinal === "Confuso") return "medio";

  // Incidente menor aberto
  if (signals.operacao.tem_incidente_aberto) return "medio";

  return "baixo";
}

/**
 * Deriva bola_com unificando interacao.bola_com e sinais operacionais.
 */
function deriveBolaCom(signals: LeadSignals): BolaCom {
  // Sinal direto das mensagens
  if (signals.interacao.bola_com === "enova") return "enova";
  if (signals.interacao.bola_com === "lead") return "lead";

  // Pendência registrada
  const pendencia = (signals.operacao.pendencia_principal ?? "").toLowerCase();
  if (pendencia.includes("cliente") || pendencia.includes("aguardando")) return "lead";
  if (pendencia.includes("enova") || pendencia.includes("corretor") || pendencia.includes("retorno")) return "enova";

  // Proxima ação registrada
  const proxima = (signals.operacao.proxima_acao ?? "").toLowerCase();
  if (proxima.includes("aguardar") || proxima.includes("cliente")) return "lead";
  if (proxima.includes("ligar") || proxima.includes("enviar") || proxima.includes("chamar")) return "enova";

  return "indefinido";
}

/**
 * Deriva necessita_humano a partir dos sinais de urgência ou incidente.
 */
function deriveNecessitaHumano(signals: LeadSignals): boolean {
  // Incidente crítico ou severo
  if (
    signals.operacao.tem_incidente_aberto &&
    (signals.operacao.severidade_incidente === "CRITICAL" ||
      signals.operacao.severidade_incidente === "HIGH")
  ) {
    return true;
  }

  // Objeção forte + interesse baixo
  if (
    signals.feedback_humano.objecao_principal &&
    deriveNivelInteresse(signals) === "baixo"
  ) {
    return true;
  }

  // Muitos dias sem resposta — lead perdendo calor
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;
  if (dias >= DIAS_CRITICO) return true;

  // Human next action explícita (corretor anotou que precisa agir)
  if (signals.feedback_humano.human_next_action) return true;

  return false;
}

/**
 * Classifica estado_cliente a partir dos demais sinais derivados.
 */
function deriveEstadoCliente(
  signals: LeadSignals,
  nivelInteresse: NivelInteresse,
  riscoTravamento: RiscoTravamento,
  bolaCom: BolaCom,
): EstadoCliente {
  const fase = normalizeFase(signals.operacao.fase_funil);
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Arquivável
  if (isFaseArquivavel(fase)) return "arquivavel";
  if (dias >= DIAS_CRITICO && nivelInteresse === "baixo") return "arquivavel";

  // Travado
  if (signals.operacao.fase_travamento) return "travado";
  if (riscoTravamento === "alto" && dias >= DIAS_RISCO_ALTO) return "travado";

  // Compra ativa
  if (isFaseCompraAtiva(fase)) {
    // Dentro de compra ativa, refinar por pendência
    const pendencia = (signals.operacao.pendencia_principal ?? "").toLowerCase();
    if (pendencia.includes("document") || pendencia.includes("doc")) return "aguardando_documentos";
    if (bolaCom === "lead") return "aguardando_cliente";
    if (bolaCom === "enova") return "aguardando_enova";
    return "compra_ativa";
  }

  // Qualificação em andamento
  if (isFaseQualificacao(fase)) return "em_qualificacao";

  // Novo (sem fase relevante + sem interação)
  if (!fase || fase === "inicio_programa") {
    const totalMsgs = signals.interacao.total_mensagens;
    if (totalMsgs === 0) return "novo";
    return "em_qualificacao";
  }

  // Reativação — lead estava frio e há sinal de retorno
  const sinal = signals.interacao.ultimo_sinal_cliente;
  if (
    dias < DIAS_FRIO &&
    (sinal === "Interessado" || sinal === "Objetivo") &&
    signals.timing.arquivado_em
  ) {
    return "reativacao";
  }

  // Morno — interesse médio, sem avanço
  if (nivelInteresse === "medio" && dias >= 3) return "morno";

  // Interessado sem ação — interesse alto mas sem movimento operacional
  if (nivelInteresse === "alto" && bolaCom === "indefinido") return "interessado_sem_acao";

  // Aguardando cliente/enova
  if (bolaCom === "lead") return "aguardando_cliente";
  if (bolaCom === "enova") return "aguardando_enova";

  // Conservador: morno
  return "morno";
}

/**
 * Deriva proxima_melhor_acao a partir do estado e sinais operacionais.
 */
function deriveProximaMelhorAcao(
  signals: LeadSignals,
  estadoCliente: EstadoCliente,
  nivelInteresse: NivelInteresse,
  riscoTravamento: RiscoTravamento,
  necessitaHumano: boolean,
): ProximaMelhorAcao {
  // Intervenção humana urgente
  if (necessitaHumano) return "pedir_intervencao_humana";

  // Arquivável
  if (estadoCliente === "arquivavel") return "arquivar";

  // Reativação
  if (estadoCliente === "reativacao") return "reativar";

  // Travado — depende do tipo de travamento
  if (estadoCliente === "travado") {
    if (signals.perfil.restricao) return "pedir_intervencao_humana";
    return "chamar_cliente";
  }

  // Compra ativa — aguardando documentos
  if (estadoCliente === "aguardando_documentos") return "estimular_documentos";

  // Aguardando Enova — Enova precisa agir
  if (estadoCliente === "aguardando_enova") {
    const fase = normalizeFase(signals.operacao.fase_funil);
    if (FASES_COMPRA_ATIVA.has(fase)) return "priorizar";
    return "chamar_cliente";
  }

  // Aguardando cliente — lead precisa responder
  if (estadoCliente === "aguardando_cliente") return "enviar_followup";

  // Compra ativa em andamento
  if (estadoCliente === "compra_ativa") {
    const fase = normalizeFase(signals.operacao.fase_funil);
    if (fase === "agendamento_visita" || fase === "visita") return "oferecer_visita";
    return "priorizar";
  }

  // Qualificação em andamento — avançar com ligação
  if (estadoCliente === "em_qualificacao") {
    const bolaCom = deriveBolaCom(signals);
    if (bolaCom === "lead") return "enviar_followup";
    return "chamar_cliente";
  }

  // Novo lead
  if (estadoCliente === "novo") return "chamar_cliente";

  // Interessado sem ação ou morno
  if (nivelInteresse === "alto") return "chamar_cliente";
  if (riscoTravamento === "alto") return "chamar_cliente";
  if (nivelInteresse === "medio") return "enviar_followup";

  // Baixo interesse — aguardar ou follow-up leve
  return "aguardar";
}

/**
 * Calcula confiança da classificação baseado na quantidade e qualidade de sinais disponíveis.
 */
function deriveConfianca(signals: LeadSignals): Confianca {
  let score = 0;

  // Sinais fortes
  if (signals.operacao.fase_funil) score += 2;
  if (signals.interacao.bola_com !== null) score += 2;
  if (signals.interacao.dias_sem_resposta_cliente !== null) score += 1;
  if (signals.feedback_humano.interesse_atual) score += 2;
  if (signals.feedback_humano.momento_do_cliente) score += 2;
  if (signals.contexto.lead_temp) score += 1;
  if (signals.interacao.ultimo_sinal_cliente) score += 1;
  if (signals.operacao.pendencia_principal) score += 1;
  if (signals.operacao.proxima_acao) score += 1;

  if (score >= 8) return "alta";
  if (score >= 4) return "media";
  return "baixa";
}

/**
 * Gera justificativa objetiva baseada nos sinais reais.
 * Sem texto floreado. Curta e auditável.
 */
function buildJustificativa(
  signals: LeadSignals,
  estadoCliente: EstadoCliente,
  bolaCom: BolaCom,
  riscoTravamento: RiscoTravamento,
): string {
  const partes: string[] = [];
  const dias = signals.interacao.dias_sem_resposta_cliente;
  const fase = signals.operacao.fase_funil;
  const pendencia = signals.operacao.pendencia_principal;
  const objecao = signals.feedback_humano.objecao_principal;
  const sinal = signals.interacao.ultimo_sinal_cliente;
  const travamento = signals.operacao.fase_travamento;

  if (fase) partes.push(`fase: ${fase}`);

  if (travamento) {
    partes.push(`travado em: ${travamento}`);
  } else if (dias !== null) {
    if (dias === 0) partes.push("respondeu hoje");
    else if (dias === 1) partes.push("último contato há 1 dia");
    else partes.push(`sem resposta há ${dias} dias`);
  }

  if (bolaCom === "lead") partes.push("aguardando resposta do cliente");
  if (bolaCom === "enova") partes.push("Enova ainda não retomou");

  if (pendencia) partes.push(`pendência: ${pendencia}`);
  if (objecao) partes.push(`objeção: ${objecao}`);

  if (sinal && sinal !== "Neutro") partes.push(`sinal do cliente: ${sinal.toLowerCase()}`);

  if (signals.perfil.restricao === true) partes.push("restrição ativa no perfil");
  if (signals.operacao.tem_incidente_aberto) {
    const sev = signals.operacao.severidade_incidente;
    partes.push(`incidente aberto${sev ? ` (${sev.toLowerCase()})` : ""}`);
  }

  // Fallback conservador
  if (partes.length === 0) {
    return "sinais insuficientes para classificação precisa";
  }

  return partes.join("; ");
}

// ── Classificador principal ───────────────────────────────────────────────

/**
 * classifyLeadCognitiveState — classificador cognitivo read-only.
 *
 * Recebe o objeto canônico LeadSignals e devolve uma leitura cognitiva
 * estruturada, determinística e auditável.
 *
 * Princípios:
 *   - Sem automação, sem side effects, sem escrita em banco.
 *   - Sem IA externa — lógica puramente determinística/heurística.
 *   - Preferir segurança a criatividade: se não há sinal suficiente,
 *     retorna valor conservador + confiança "baixa".
 *   - Justificativa sempre objetiva, baseada em sinais reais.
 *
 * @param signals - Objeto canônico de sinais do lead (buildLeadSignals).
 * @returns LeadCognitiveState — leitura cognitiva estruturada.
 */
export function classifyLeadCognitiveState(signals: LeadSignals): LeadCognitiveState {
  // ── Derivações atômicas (sem dependência circular) ─────────────────────
  const nivelInteresse = deriveNivelInteresse(signals);
  const riscoTravamento = deriveRiscoTravamento(signals);
  const bolaCom = deriveBolaCom(signals);
  const momentoCompra = deriveMomentoCompra(signals);
  const necessitaHumano = deriveNecessitaHumano(signals);
  const confianca = deriveConfianca(signals);

  // ── Estado do cliente (depende das anteriores) ─────────────────────────
  const estadoCliente = deriveEstadoCliente(
    signals,
    nivelInteresse,
    riscoTravamento,
    bolaCom,
  );

  // ── Próxima melhor ação (depende do estado) ────────────────────────────
  const proximaMelhorAcao = deriveProximaMelhorAcao(
    signals,
    estadoCliente,
    nivelInteresse,
    riscoTravamento,
    necessitaHumano,
  );

  // ── Justificativa ──────────────────────────────────────────────────────
  const justificativa = buildJustificativa(signals, estadoCliente, bolaCom, riscoTravamento);

  return {
    estado_cliente: estadoCliente,
    momento_compra: momentoCompra,
    nivel_interesse: nivelInteresse,
    risco_travamento: riscoTravamento,
    bola_com: bolaCom,
    proxima_melhor_acao: proximaMelhorAcao,
    necessita_humano: necessitaHumano,
    confianca,
    justificativa,
  };
}
