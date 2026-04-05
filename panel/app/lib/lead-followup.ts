// ============================================================
// Lead Follow-up Organizer — panel/app/lib/lead-followup.ts
//
// PR 4 — Organizador de Follow-up
// Escopo: PANEL-ONLY, read-only, sem automação, sem IA externa.
//
// Propósito:
//   Recebe sinais canônicos (PR 1 — LeadSignals) e estado cognitivo
//   (PR 2 — LeadCognitiveState) e devolve uma leitura organizada
//   do follow-up atual do lead.
//
// O que esta camada FAZ:
//   - Ler sinais reais de follow-up (prazo, gatilho, dias sem resposta)
//   - Organizar dimensões de follow-up com heurísticas leves
//   - Sugerir janela, tipo, urgência e ação sem executar nada
//   - Justificar a sugestão de forma objetiva e curta
//
// O que esta camada NÃO FAZ:
//   - Enviar follow-up ou mensagem
//   - Criar scheduler ou automação
//   - Alterar CRM ou banco de dados
//   - Chamar IA externa
//   - Gravar regra nova em banco
//
// Pronto para consumo na PR 5 (Máquina de Pastas) e PR 6 (Lead Frio Recuperável).
// ============================================================

import type { LeadSignals } from "./lead-signals";
import type { LeadCognitiveState } from "./lead-cognitive";

// ── Tipos canônicos de saída ───────────────────────────────────────────────

/**
 * StatusFollowup — situação atual do follow-up deste lead.
 */
export type StatusFollowup =
  | "sem_followup"
  | "followup_ativo"
  | "followup_vencido"
  | "aguardando_janela"
  | "concluido"
  | "nao_necessario";

/**
 * JanelaIdealFollowup — quando deve acontecer o próximo contato.
 */
export type JanelaIdealFollowup =
  | "agora"
  | "24h"
  | "48h"
  | "72h"
  | "7d"
  | "observar";

/**
 * TipoFollowupSugerido — natureza do follow-up recomendado.
 */
export type TipoFollowupSugerido =
  | "retomada_leve"
  | "cobranca_docs"
  | "retomada_qualificacao"
  | "reativacao"
  | "visita"
  | "intervencao_humana"
  | "nenhum";

/**
 * UrgenciaFollowup — nível de urgência do follow-up.
 */
export type UrgenciaFollowup = "baixa" | "media" | "alta";

/**
 * AcaoFollowupSugerida — ação concreta recomendada.
 * Sugestão read-only — o operador decide se executa.
 */
export type AcaoFollowupSugerida =
  | "chamar_agora"
  | "aguardar"
  | "agendar_followup"
  | "pedir_humano"
  | "reativar"
  | "sem_acao";

/**
 * LeadFollowupOrganizer — saída canônica do organizador de follow-up.
 *
 * Todos os campos são obrigatórios.
 * Saída read-only — sem escrita em banco, sem automação.
 * Pronto para consumo visual e para evolução em PRs futuras.
 */
export type LeadFollowupOrganizer = {
  /** Situação atual do follow-up. */
  status_followup: StatusFollowup;
  /** Janela temporal ideal para o próximo contato. */
  janela_ideal_followup: JanelaIdealFollowup;
  /** Tipo de follow-up recomendado. */
  tipo_followup_sugerido: TipoFollowupSugerido;
  /** Urgência do follow-up. */
  urgencia_followup: UrgenciaFollowup;
  /** Ação concreta recomendada (sugestão — sem execução automática). */
  acao_followup_sugerida: AcaoFollowupSugerida;
  /** Justificativa objetiva baseada em sinais reais. */
  justificativa_followup: string;
};

// ── Constantes internas ───────────────────────────────────────────────────

/** Milliseconds per day — used for prazo diff calculations. */
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Fases de visita — indicam que o follow-up deve ser focado em visita. */
const FASES_VISITA = new Set([
  "agendamento_visita",
  "visita",
  "visita_confirmada",
]);

/** Fases de documentos — indicam que o follow-up deve cobrar docs. */
const FASES_DOCS = new Set([
  "envio_docs",
  "analise_documentos",
]);

/** Fases arquiváveis — follow-up não necessário. */
const FASES_ARQUIVAVEIS = new Set([
  "fim_inelegivel",
  "fim_ineligivel",
  "arquivado",
  "cancelado",
  "inativo",
]);

// ── Helpers internos ──────────────────────────────────────────────────────

function normalizeFase(fase: string | null): string {
  return (fase ?? "").toLowerCase().trim();
}

function isPrazoVencido(prazo: string | null): boolean {
  if (!prazo) return false;
  return new Date(prazo) < new Date();
}

function isPrazoAtivo(prazo: string | null): boolean {
  if (!prazo) return false;
  return new Date(prazo) >= new Date();
}

// ── Derivações atômicas ───────────────────────────────────────────────────

function deriveStatusFollowup(signals: LeadSignals): StatusFollowup {
  const fase = normalizeFase(signals.operacao.fase_funil);

  // Fase arquivável → follow-up desnecessário
  if (FASES_ARQUIVAVEIS.has(fase)) return "nao_necessario";
  if (signals.timing.arquivado_em) return "nao_necessario";

  const prazo = signals.operacao.prazo_proxima_acao;
  const statusAtencao = (signals.operacao.status_atencao ?? "").toUpperCase();
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Follow-up vencido: prazo expirado OU status OVERDUE
  if (isPrazoVencido(prazo) || statusAtencao === "OVERDUE") return "followup_vencido";

  // Follow-up ativo: prazo no futuro
  if (isPrazoAtivo(prazo)) return "followup_ativo";

  // Aguardando janela: bola no cliente, esperando resposta
  if (signals.interacao.bola_com === "lead" && dias > 0) return "aguardando_janela";

  return "sem_followup";
}

function deriveJanelaIdeal(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  statusFollowup: StatusFollowup,
): JanelaIdealFollowup {
  const statusAtencao = (signals.operacao.status_atencao ?? "").toUpperCase();
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Vencido → agir agora
  if (statusFollowup === "followup_vencido" || statusAtencao === "OVERDUE") return "agora";

  // Não necessário → observar
  if (statusFollowup === "nao_necessario") return "observar";

  // Momento de compra "agora" → contato imediato
  if (cognitiveState.momento_compra === "agora") return "agora";

  // DUE_SOON → 24h
  if (statusAtencao === "DUE_SOON") return "24h";

  // Baseado em dias sem resposta
  if (dias === 0) return "observar";
  if (dias <= 1) return "24h";
  if (dias <= 2) return "48h";
  if (dias <= 5) return "72h";

  // Muito tempo sem resposta + baixo interesse → observar (não forçar)
  if (cognitiveState.nivel_interesse === "baixo") return "observar";

  return "7d";
}

function deriveTipoFollowup(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): TipoFollowupSugerido {
  const fase = normalizeFase(signals.operacao.fase_funil);
  const proxAcao = cognitiveState.proxima_melhor_acao;

  // Fase arquivável → nenhum
  if (FASES_ARQUIVAVEIS.has(fase)) return "nenhum";

  // Intervenção humana urgente
  if (proxAcao === "pedir_intervencao_humana" || cognitiveState.necessita_humano) {
    return "intervencao_humana";
  }

  // Reativação
  if (proxAcao === "reativar" || cognitiveState.estado_cliente === "reativacao") {
    return "reativacao";
  }

  // Docs
  if (FASES_DOCS.has(fase) || proxAcao === "estimular_documentos") {
    return "cobranca_docs";
  }

  // Visita
  if (FASES_VISITA.has(fase) || proxAcao === "oferecer_visita") {
    return "visita";
  }

  // Qualificação em andamento
  if (cognitiveState.estado_cliente === "em_qualificacao") {
    return "retomada_qualificacao";
  }

  // Retomada leve: interesse ativo, mas sem ação recente
  if (
    cognitiveState.estado_cliente === "interessado_sem_acao" ||
    cognitiveState.estado_cliente === "morno" ||
    cognitiveState.estado_cliente === "aguardando_cliente"
  ) {
    return "retomada_leve";
  }

  // Arquivável
  if (cognitiveState.estado_cliente === "arquivavel") return "nenhum";

  return "retomada_leve";
}

function deriveUrgencia(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
  statusFollowup: StatusFollowup,
): UrgenciaFollowup {
  const statusAtencao = (signals.operacao.status_atencao ?? "").toUpperCase();
  const dias = signals.interacao.dias_sem_resposta_cliente ?? 0;

  // Vencido ou OVERDUE → alta
  if (statusFollowup === "followup_vencido" || statusAtencao === "OVERDUE") return "alta";

  // Necessita humano → alta
  if (cognitiveState.necessita_humano) return "alta";

  // Incidente crítico aberto → alta
  if (
    signals.operacao.tem_incidente_aberto &&
    (signals.operacao.severidade_incidente === "CRITICAL" ||
      signals.operacao.severidade_incidente === "HIGH")
  ) {
    return "alta";
  }

  // DUE_SOON → média
  if (statusAtencao === "DUE_SOON") return "media";

  // Mais de 5 dias sem resposta → média
  if (dias > 5) return "media";

  // Interesse alto + bola com Enova → média (Enova precisa agir)
  if (cognitiveState.nivel_interesse === "alto" && cognitiveState.bola_com === "enova") {
    return "media";
  }

  // Não necessário → baixa
  if (statusFollowup === "nao_necessario") return "baixa";

  return "baixa";
}

function deriveAcao(
  cognitiveState: LeadCognitiveState,
  statusFollowup: StatusFollowup,
  urgencia: UrgenciaFollowup,
  janela: JanelaIdealFollowup,
): AcaoFollowupSugerida {
  // Não necessário → sem ação
  if (statusFollowup === "nao_necessario") return "sem_acao";

  // Necessita humano
  if (cognitiveState.necessita_humano) return "pedir_humano";

  // Reativação
  if (cognitiveState.estado_cliente === "reativacao") return "reativar";

  // Urgência alta + janela "agora" → chamar agora
  if (urgencia === "alta" && janela === "agora") return "chamar_agora";

  // Follow-up vencido → chamar agora
  if (statusFollowup === "followup_vencido") return "chamar_agora";

  // Aguardando janela (bola no cliente) → aguardar
  if (statusFollowup === "aguardando_janela") return "aguardar";

  // Sem follow-up agendado → agendar
  if (statusFollowup === "sem_followup") return "agendar_followup";

  // Follow-up ativo + janela agora → chamar agora
  if (statusFollowup === "followup_ativo" && janela === "agora") return "chamar_agora";

  // Follow-up ativo + janela futura → aguardar
  if (statusFollowup === "followup_ativo") return "aguardar";

  return "agendar_followup";
}

function buildJustificativaFollowup(
  signals: LeadSignals,
  statusFollowup: StatusFollowup,
  janela: JanelaIdealFollowup,
): string {
  const partes: string[] = [];
  const dias = signals.interacao.dias_sem_resposta_cliente;
  const prazo = signals.operacao.prazo_proxima_acao;
  const gatilho = signals.operacao.gatilho_proxima_acao;
  const statusAtencao = signals.operacao.status_atencao;

  // Status atual do follow-up
  if (statusFollowup === "nao_necessario") return "lead arquivado — sem ação necessária";
  if (statusFollowup === "aguardando_janela") partes.push("aguardando resposta do cliente");

  // Prazo com diferença em dias
  if (prazo) {
    const diffDays = Math.round(
      (new Date(prazo).getTime() - Date.now()) / MS_PER_DAY,
    );
    if (diffDays < 0) {
      partes.push(`prazo venceu há ${Math.abs(diffDays)}d`);
    } else if (diffDays === 0) {
      partes.push("prazo: hoje");
    } else {
      partes.push(`prazo em ${diffDays}d`);
    }
  }

  // Gatilho (quando não há informação de prazo)
  if (gatilho && !partes.some((p) => p.includes("prazo"))) {
    partes.push(`gatilho: ${gatilho}`);
  }

  // Dias sem resposta
  if (dias !== null && dias > 0) {
    partes.push(`${dias}d sem resposta`);
  } else if (dias === 0) {
    partes.push("respondeu hoje");
  }

  // Status de atenção
  if (statusAtencao === "OVERDUE") partes.push("fora do prazo");
  else if (statusAtencao === "DUE_SOON") partes.push("prazo próximo");

  // Fallback
  if (partes.length === 0) {
    if (janela === "observar") return "sem sinais ativos de follow-up";
    return "verificar estado do caso";
  }

  return partes.join("; ");
}

// ── Organizador principal ─────────────────────────────────────────────────

/**
 * organizeLeadFollowup — organizador canônico de follow-up read-only.
 *
 * Recebe LeadSignals (PR 1) e LeadCognitiveState (PR 2) e devolve
 * uma leitura organizada do follow-up atual do lead.
 *
 * Princípios:
 *   - Sem automação, sem side effects, sem escrita em banco.
 *   - Sem IA externa — lógica puramente determinística/heurística.
 *   - Preferir segurança a criatividade.
 *   - Justificativa objetiva baseada em sinais reais.
 *
 * @param signals        - Objeto canônico de sinais do lead (buildLeadSignals).
 * @param cognitiveState - Estado cognitivo classificado (classifyLeadCognitiveState).
 * @returns LeadFollowupOrganizer — leitura organizada de follow-up.
 */
export function organizeLeadFollowup(
  signals: LeadSignals,
  cognitiveState: LeadCognitiveState,
): LeadFollowupOrganizer {
  const statusFollowup = deriveStatusFollowup(signals);
  const janela = deriveJanelaIdeal(signals, cognitiveState, statusFollowup);
  const tipo = deriveTipoFollowup(signals, cognitiveState);
  const urgencia = deriveUrgencia(signals, cognitiveState, statusFollowup);
  const acao = deriveAcao(cognitiveState, statusFollowup, urgencia, janela);
  const justificativa = buildJustificativaFollowup(signals, statusFollowup, janela);

  return {
    status_followup: statusFollowup,
    janela_ideal_followup: janela,
    tipo_followup_sugerido: tipo,
    urgencia_followup: urgencia,
    acao_followup_sugerida: acao,
    justificativa_followup: justificativa,
  };
}
