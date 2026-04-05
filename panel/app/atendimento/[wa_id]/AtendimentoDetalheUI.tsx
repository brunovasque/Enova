"use client";

/**
 * AtendimentoDetalheUI — Ficha de Atendimento (full-page detail view)
 *
 * Renders the consolidated detail of a single attendance lead,
 * reusing the visual identity established in AprovadoFichaView
 * and the badge/badge patterns from AtendimentoUI.
 *
 * Data contract:
 *   All fields come from enova_attendance_v1 via AttendanceRow type.
 *   Fields that are missing show a safe dash fallback.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useMemo } from "react";
import styles from "./detalhe.module.css";
import type { ClientProfileRow } from "../../api/client-profile/_shared";
import {
  saveClientProfileAction,
  archiveLeadAction,
  unarchiveLeadAction,
  saveAttendanceMetaAction,
} from "../actions";
import { buildLeadSignals } from "../../lib/lead-signals";
import { classifyLeadCognitiveState } from "../../lib/lead-cognitive";
import type { LeadCognitiveState } from "../../lib/lead-cognitive";
import {
  getEstadoClienteLabel,
  getMomentoCompraLabel,
  getNivelInteresseLabel,
  getRiscoTravamentoLabel,
  getBolaComLabel,
  getProximaMelhorAcaoLabel,
  getConfiancaLabel,
} from "../../lib/lead-cognitive-labels";
import { organizeLeadFollowup } from "../../lib/lead-followup";
import type { LeadFollowupOrganizer } from "../../lib/lead-followup";
import {
  getStatusFollowupLabel,
  getJanelaIdealLabel,
  getTipoFollowupLabel,
  getUrgenciaFollowupLabel,
  getAcaoFollowupLabel,
} from "../../lib/lead-followup-labels";
import { readLeadDocs } from "../../lib/lead-docs";
import type { LeadDocsReading } from "../../lib/lead-docs";
import {
  getStatusPastaLabel,
  getMaturidadeDocsLabel,
  getBloqueioDocsPrincipalLabel,
  getEstrategiaDocsSugeridaLabel,
  getProbabilidadePastaLabel,
  getAcaoDocsSugeridaLabel,
} from "../../lib/lead-docs-labels";

/* ── Type — mirrors AttendanceRow in AtendimentoUI ── */
export type AttendanceDetalheRow = {
  wa_id: string;
  lead_id: string | null;
  nome: string | null;
  telefone: string | null;
  fase_funil: string | null;
  status_funil: string | null;
  fase_atendimento: string | null;
  fase_travamento: string | null;
  codigo_motivo_travamento: string | null;
  motivo_travamento: string | null;
  travou_em: string | null;
  dono_pendencia: string | null;
  codigo_pendencia_principal: string | null;
  pendencia_principal: string | null;
  codigo_proxima_acao: string | null;
  proxima_acao: string | null;
  gatilho_proxima_acao: string | null;
  prazo_proxima_acao: string | null;
  proxima_acao_executavel: boolean | null;
  status_atencao: string | null;
  base_origem: string | null;
  base_atual: string | null;
  movido_base_em: string | null;
  movido_fase_em: string | null;
  ultima_interacao_cliente: string | null;
  ultima_interacao_enova: string | null;
  ultima_msg_recebida_raw: string | null;
  estado_civil: string | null;
  regime_trabalho: string | null;
  renda: number | null;
  renda_total: number | null;
  somar_renda: boolean | null;
  composicao: string | null;
  ir_declarado: boolean | null;
  ctps_36: boolean | null;
  restricao: boolean | null;
  dependentes_qtd: number | null;
  nacionalidade: string | null;
  entrada_valor: number | null;
  resumo_curto: string | null;
  // ── Campos operacionais humanos (enova_attendance_meta fase 2) ──
  responsavel: string | null;
  objecao_principal: string | null;
  interesse_atual: string | null;
  momento_do_cliente: string | null;
  quick_note: string | null;
  human_next_action: string | null;
  // ── Temperatura do lead (crm_lead_meta) ──
  lead_temp: string | null;
  // ── Pool canônico do lead (crm_lead_meta.lead_pool — enriquecimento panel-side) ──
  crm_lead_pool: string | null;
  tem_incidente_aberto: boolean | null;
  tipo_incidente: string | null;
  severidade_incidente: string | null;
  arquivado_em: string | null;
  codigo_motivo_arquivo: string | null;
  nota_arquivo: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

/* ── Helpers ── */

const DASH = "—";

function txt(value: string | null | undefined): string {
  return value ?? DASH;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return DASH;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(dateStr));
  } catch {
    return DASH;
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return DASH;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(dateStr));
  } catch {
    return DASH;
  }
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function boolLabel(value: boolean | null | undefined): { text: string; cls: string } {
  if (value === null || value === undefined) return { text: DASH, cls: styles.boolUnknown };
  return value
    ? { text: "Sim", cls: styles.boolYes }
    : { text: "Não", cls: styles.boolNo };
}

function getBaseLabel(pool: string | null | undefined): string {
  switch (pool) {
    case "COLD_POOL": return "Fria";
    case "WARM_POOL": return "Morna";
    case "HOT_POOL": return "Quente";
    default: return pool ?? DASH;
  }
}

function getBaseBadgeCls(pool: string | null | undefined): string {
  switch (pool) {
    case "COLD_POOL": return styles.baseBadgeFria;
    case "WARM_POOL": return styles.baseBadgeMorna;
    case "HOT_POOL": return styles.baseBadgeQuente;
    default: return styles.baseBadgeFria;
  }
}

const STATUS_ATENCAO_LABELS: Record<string, string> = {
  ON_TIME: "Em dia",
  DUE_SOON: "Atenção",
  OVERDUE: "Atrasado",
};

function getAtencaoCls(status: string | null | undefined): string {
  switch (status) {
    case "ON_TIME": return styles.atencaoNormal;
    case "DUE_SOON": return styles.atencaoAlerta;
    case "OVERDUE": return styles.atencaoCritico;
    default: return styles.atencaoNormal;
  }
}

type FaseGrupo = "ENTRADA" | "QUALIFICACAO" | "COLETA" | "AGUARDANDO" | "TRAVADO";

const ENTRADA_STAGES = [
  "inicio", "inicio_decisao", "inicio_programa", "inicio_nome",
  "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade",
];

const COLETA_STAGES_EXACT = [
  "possui_renda_extra", "renda_mista_detalhe", "clt_renda_perfil_informativo",
  "autonomo_ir_pergunta", "autonomo_sem_ir_ir_este_ano", "autonomo_sem_ir_caminho",
  "autonomo_sem_ir_entrada", "autonomo_compor_renda", "p3_tipo_pergunta",
  "confirmar_avo_familiar", "ir_declarado", "dependente",
];

const AGUARDANDO_STAGES = ["fim_ineligivel", "fim_inelegivel", "finalizacao"];

function deriveFaseGrupo(faseAtendimento: string | null, faseTravamento: string | null): FaseGrupo | null {
  if (faseTravamento) return "TRAVADO";
  const s = faseAtendimento;
  if (!s) return null;
  if (ENTRADA_STAGES.includes(s)) {
    return "ENTRADA";
  }
  if (s.startsWith("renda") || s.startsWith("ctps_36") || s.startsWith("restricao") ||
    s.startsWith("regularizacao") || s.startsWith("verificar") ||
    s.includes("multi_renda") || COLETA_STAGES_EXACT.includes(s)) {
    return "COLETA";
  }
  if (AGUARDANDO_STAGES.includes(s)) {
    return "AGUARDANDO";
  }
  return "QUALIFICACAO";
}

function getFaseBadgeCls(grupo: FaseGrupo | null): string {
  switch (grupo) {
    case "ENTRADA":
    case "QUALIFICACAO":
    case "COLETA":
      return styles.faseBadgeActive;
    case "AGUARDANDO":
      return styles.faseBadgeWarning;
    case "TRAVADO":
      return styles.faseBadgeDanger;
    default:
      return styles.faseBadgeDefault;
  }
}

function getIncidenteBadgeCls(severidade: string | null | undefined): string {
  switch (severidade) {
    case "CRITICAL": return styles.incidenteBadgeCritical;
    case "HIGH": return styles.incidenteBadgeHigh;
    case "MEDIUM": return styles.incidenteBadgeMedium;
    case "LOW": return styles.incidenteBadgeLow;
    default: return "";
  }
}

function isPrazoVencido(prazo: string | null | undefined): boolean {
  if (!prazo) return false;
  return new Date(prazo) < new Date();
}

function getTempLabel(temp: string | null | undefined): string {
  switch (temp) {
    case "HOT": return "🔥 Quente";
    case "WARM": return "🌡 Morno";
    case "COLD": return "❄️ Frio";
    default: return temp ?? DASH;
  }
}

function getTempBadgeCls(temp: string | null | undefined): string {
  switch (temp) {
    case "HOT": return styles.tempBadgeHot;
    case "WARM": return styles.tempBadgeWarm;
    case "COLD": return styles.tempBadgeCold;
    default: return styles.tempBadgeUnknown;
  }
}

/* ── Slug humanisation ── */

const FASE_LABEL_MAP: Record<string, string> = {
  inicio: "Início",
  inicio_decisao: "Tipo de imóvel",
  inicio_programa: "Programa habitacional",
  inicio_nome: "Coleta de nome",
  inicio_nacionalidade: "Nacionalidade",
  inicio_rnm: "RNM / documentação",
  inicio_rnm_validade: "Validade do RNM",
  estado_civil: "Estado civil",
  confirmar_casamento: "Confirmação do estado civil",
  financiamento_conjunto: "Financiamento conjunto",
  somar_renda_solteiro: "Somar renda (solteiro)",
  somar_renda_familiar: "Somar renda (familiar)",
  quem_pode_somar: "Quem pode somar",
  interpretar_composicao: "Composição de renda",
  regime_trabalho: "Regime de trabalho",
  clt_renda_perfil_informativo: "Perfil CLT",
  autonomo_ir_pergunta: "IR / autônomo",
  autonomo_sem_ir_ir_este_ano: "IR este ano (autônomo)",
  autonomo_sem_ir_caminho: "Caminho autônomo sem IR",
  autonomo_sem_ir_entrada: "Entrada autônomo sem IR",
  autonomo_compor_renda: "Composição renda autônomo",
  renda: "Renda",
  renda_mista_detalhe: "Detalhes renda mista",
  possui_renda_extra: "Renda extra",
  multi_renda_detalhe: "Detalhes renda composta",
  multi_renda_valor_clt: "Renda CLT (composição)",
  multi_renda_valor_autonomo: "Renda autônomo (composição)",
  multi_renda_valor_servidor: "Renda servidor (composição)",
  multi_renda_valor_empresario: "Renda empresário (composição)",
  multi_renda_valor_aposentado: "Renda aposentado (composição)",
  ir_declarado: "IR declarado",
  ctps_36: "CTPS 36 meses",
  ctps_36_parceiro: "CTPS 36 meses (cônjuge)",
  ctps_36_parceiro_p3: "CTPS 36 meses (comp. P3)",
  restricao: "Restrição",
  restricao_parceiro: "Restrição (cônjuge)",
  restricao_parceiro_p3: "Restrição (comp. P3)",
  regularizacao_restricao: "Regularização de restrição",
  regularizacao_restricao_parceiro: "Regularização (cônjuge)",
  regularizacao_restricao_p3: "Regularização (comp. P3)",
  parceiro_tem_renda: "Renda do cônjuge",
  regime_trabalho_parceiro: "Regime do cônjuge",
  renda_parceiro: "Valor renda cônjuge",
  parceiro_possui_renda_extra: "Renda extra cônjuge",
  p3_tipo_pergunta: "Tipo de composição P3",
  confirmar_avo_familiar: "Composição familiar",
  informativo_moradia_atual: "Moradia atual",
  informativo_trabalho: "Informações de trabalho",
  informativo_moradia: "Informações de moradia",
  informativo_parcela_mensal: "Parcela mensal estimada",
  informativo_reserva: "Reserva financeira",
  informativo_reserva_valor: "Valor da reserva",
  informativo_fgts: "FGTS",
  informativo_fgts_valor: "Valor do FGTS",
  informativo_escolaridade: "Escolaridade",
  informativo_profissao_atividade: "Profissão / atividade",
  informativo_mei_pj_status: "MEI / PJ",
  informativo_renda_estabilidade: "Estabilidade de renda",
  informativo_decisor_visita: "Decisor para visita",
  informativo_decisor_nome: "Nome do decisor",
  visita: "Agendamento de visita",
  visita_confirmada: "Visita confirmada",
  envio_docs: "Envio de documentação",
  finalizacao_processo: "Finalização do pacote",
  finalizacao: "Finalização",
  aguardando_retorno_correspondente: "Aguardando correspondente",
  // Both spellings exist in DB (Worker typo variants)
  fim_ineligivel: "Inelegível",
  fim_inelegivel: "Inelegível",
  dependente: "Dependentes",
  verificar_composicao: "Verificar composição",
};

function humanizeSlug(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getFaseLabel(fase: string | null | undefined): string {
  if (!fase) return DASH;
  return FASE_LABEL_MAP[fase] ?? humanizeSlug(fase);
}

const STATUS_FUNIL_LABELS: Record<string, string> = {
  ATIVO: "Ativo",
  TRAVADO: "Travado",
  FINALIZADO: "Finalizado",
  INELEGIVEL: "Inelegível",
  ARQUIVADO: "Arquivado",
  QUALIFICACAO: "Qualificação",
  COLETA: "Coleta de dados",
  ANALISE: "Em análise",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  AGUARDANDO: "Aguardando",
  ENTRADA: "Início",
};

function getStatusFunilLabel(status: string | null | undefined): string {
  if (!status) return DASH;
  return STATUS_FUNIL_LABELS[status] ?? humanizeSlug(status);
}

const SEVERIDADE_LABELS: Record<string, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
  LOW: "Baixo",
};

function getSeveridadeLabel(sev: string | null | undefined): string {
  if (!sev) return "Aberto";
  return SEVERIDADE_LABELS[sev] ?? humanizeSlug(sev);
}

const MOTIVO_ARQUIVO_LABELS: Record<string, string> = {
  ja_comprou: "Já comprou",
  sem_interesse: "Sem interesse",
  desistiu: "Desistiu",
  nao_responde: "Não responde",
  outro: "Outro",
};

function getMotivoArquivoLabel(code: string | null | undefined): string {
  if (!code) return DASH;
  return MOTIVO_ARQUIVO_LABELS[code] ?? humanizeSlug(code);
}

const GATILHO_LABELS: Record<string, string> = {
  "New Lead Entry": "Novo lead recebido",
  "new_lead_entry": "Novo lead recebido",
  "nova_entrada": "Novo lead recebido",
  "follow_up_1d": "Follow-up em 1 dia",
  "follow_up_2d": "Follow-up em 2 dias",
  "follow_up_3d": "Follow-up em 3 dias",
  "follow_up_5d": "Follow-up em 5 dias",
  "follow_up_7d": "Follow-up em 7 dias",
  "follow_up_14d": "Follow-up em 14 dias",
  "follow_up_24h": "Follow-up em 24h",
  "follow_up_48h": "Follow-up em 48h",
  "apos_visita": "Após visita",
  "apos_docs": "Após envio de docs",
  "apos_analise": "Após análise",
  "retorno_correspondente": "Retorno do correspondente",
  "sem_resposta": "Sem resposta",
  "manual": "Manual",
  "automatico": "Automático",
  "sistema": "Sistema",
  "cliente_respondeu": "Cliente respondeu",
  "prazo_vencido": "Prazo vencido",
};

function getGatilhoLabel(gatilho: string | null | undefined): string {
  if (!gatilho) return DASH;
  return GATILHO_LABELS[gatilho] ?? humanizeSlug(gatilho);
}

function deriveUltimoFalante(
  ultimaCliente: string | null | undefined,
  ultimaEnova: string | null | undefined,
): string {
  if (!ultimaCliente && !ultimaEnova) return DASH;
  if (!ultimaCliente) return "Enova";
  if (!ultimaEnova) return "Cliente";
  return new Date(ultimaCliente) > new Date(ultimaEnova) ? "Cliente" : "Enova";
}

function hasTimestamps(
  ultimaCliente: string | null | undefined,
  ultimaEnova: string | null | undefined,
): boolean {
  return !!(ultimaCliente || ultimaEnova);
}

// Returns false if resumo_curto looks like an auto-generated stage marker
// (e.g. "inicio_programa", "fase: ctps_36") rather than a real human summary.
const MIN_USEFUL_RESUMO_LENGTH = 12;
// Matches a single lowercase token with underscores — typical auto-generated stage name
const STAGE_NAME_PATTERN = /^[a-z][a-z0-9_]{3,}$/;

function isResumoUtil(resumo: string | null | undefined): boolean {
  if (!resumo) return false;
  const s = resumo.trim();
  if (!s || s.length < MIN_USEFUL_RESUMO_LENGTH) return false;
  // Stage name pattern: single token with underscores, no spaces
  if (STAGE_NAME_PATTERN.test(s)) return false;
  // "fase: something" prefix
  if (/^fase:\s*/i.test(s)) return false;
  return true;
}

/* ── Human feedback edit state ── */

type HumanFeedbackState = {
  interesse_atual: string;
  objecao_principal: string;
  momento_do_cliente: string;
  responsavel: string;
  quick_note: string;
};

function leadToFeedbackState(lead: AttendanceDetalheRow): HumanFeedbackState {
  return {
    interesse_atual: lead.interesse_atual ?? "",
    objecao_principal: lead.objecao_principal ?? "",
    momento_do_cliente: lead.momento_do_cliente ?? "",
    responsavel: lead.responsavel ?? "",
    quick_note: lead.quick_note ?? "",
  };
}

/* ── Profile editing types (mirrors AtendimentoUI) ── */

type ProfileEditState = {
  nome: string;
  nacionalidade: string;
  estado_civil: string;
  regime_trabalho: string;
  renda: string;
  ctps_36: string;
  dependentes_qtd: string;
  entrada_valor: string;
  restricao: string;
  origem_lead: string;
  observacoes_admin: string;
};

function profileToEditState(row: ClientProfileRow | null): ProfileEditState {
  return {
    nome: row?.nome ?? "",
    nacionalidade: row?.nacionalidade ?? "",
    estado_civil: row?.estado_civil ?? "",
    regime_trabalho: row?.regime_trabalho ?? "",
    renda: row?.renda != null ? String(row.renda) : "",
    ctps_36: row?.ctps_36 != null ? String(row.ctps_36) : "",
    dependentes_qtd: row?.dependentes_qtd != null ? String(row.dependentes_qtd) : "",
    entrada_valor: row?.entrada_valor != null ? String(row.entrada_valor) : "",
    restricao: row?.restricao != null ? String(row.restricao) : "",
    origem_lead: row?.origem_lead ?? "",
    observacoes_admin: row?.observacoes_admin ?? "",
  };
}

function profileTextOrNull(v: string) { return v.trim() ? v.trim() : null; }
function profileNumOrNull(v: string) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function profileBoolOrNull(v: string): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

type ProfileSource = ClientProfileRow["nome_source"];

function sourceLabel(source: ProfileSource): string {
  switch (source) {
    case "funil": return "funil";
    case "admin":
    case "admin_inicial": return "admin";
    case "manual": return "manual";
    default: return "—";
  }
}

function sourceBadgeClass(source: ProfileSource): string {
  switch (source) {
    case "funil": return styles.prefillStatusConfirmed;
    case "admin":
    case "admin_inicial":
    case "manual": return styles.prefillStatusPending;
    default: return styles.prefillStatusEmpty;
  }
}

/* ── Conversa read-only ── */

type ConversaMsg = {
  id: string | null;
  direction: "in" | "out";
  text: string | null;
  created_at: string | null;
};

function formatMsgTime(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(dateStr));
  } catch {
    return "";
  }
}

function formatMsgDayLabel(dateStr: string | null): string {
  if (!dateStr) return "Sem data";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const dayFmt = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
    const dStr = dayFmt.format(d);
    const todayStr = dayFmt.format(now);
    const yDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yStr = dayFmt.format(yDate);
    if (dStr === todayStr) return "Hoje";
    if (dStr === yStr) return "Ontem";
    return dStr;
  } catch {
    return "Sem data";
  }
}

function groupMsgsByDay(msgs: ConversaMsg[]): Array<{ label: string; msgs: ConversaMsg[] }> {
  const groups: { key: string; label: string; msgs: ConversaMsg[] }[] = [];
  const keyIdx = new Map<string, number>();
  for (const msg of msgs) {
    let key = "sem_data";
    if (msg.created_at) {
      try {
        key = new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "America/Sao_Paulo",
        }).format(new Date(msg.created_at));
      } catch {
        key = "sem_data";
      }
    }
    const idx = keyIdx.get(key);
    if (idx !== undefined) {
      groups[idx].msgs.push(msg);
    } else {
      keyIdx.set(key, groups.length);
      groups.push({ key, label: formatMsgDayLabel(msg.created_at), msgs: [msg] });
    }
  }
  return groups;
}

/* ── Sinais da Conversa — heurística leve, 100% client-side ── */

type SinaisConversa = {
  bolaComLabel: string;
  ultimoTema: string;
  pendenciaAberta: string;
  riscoTravamento: "BAIXO" | "MEDIO" | "ALTO" | null;
  ultimoSinalCliente: string;
  proximaAbordagem: string;
};

const FASE_TEMA_MAP: Record<string, string> = {
  inicio: "Qualificação inicial",
  inicio_nome: "Nome",
  inicio_nacionalidade: "Nacionalidade",
  inicio_rnm: "RNM / documentação",
  estado_civil: "Estado civil",
  confirmar_casamento: "Estado civil",
  financiamento_conjunto: "Composição",
  somar_renda: "Composição de renda",
  parceiro_tem_renda: "Composição de renda",
  regime_trabalho: "Regime de trabalho",
  renda: "Renda",
  possui_renda_extra: "Renda complementar",
  autonomo_ir_pergunta: "IR / autonomo",
  ir_declarado: "IR declarado",
  ctps_36: "Carteira de trabalho",
  restricao: "Restrição",
  regularizacao_restricao: "Regularização",
  visita: "Visita",
  visita_confirmada: "Visita confirmada",
  envio_docs: "Documentação",
  finalizacao_processo: "Finalização do pacote",
  aguardando_retorno_correspondente: "Retorno do correspondente",
};

const FASE_ABORDAGEM_MAP: Record<string, string> = {
  inicio: "Confirmar nome e dados iniciais",
  renda: "Confirmar regime e valor de renda",
  ir_declarado: "Perguntar sobre IR declarado",
  ctps_36: "Verificar CTPS com 36 meses",
  restricao: "Avaliar pendência de restrição",
  visita: "Confirmar disponibilidade para visita",
  envio_docs: "Orientar envio de documentação",
  finalizacao_processo: "Confirmar envio do pacote ao correspondente",
  aguardando_retorno_correspondente: "Acompanhar retorno do correspondente",
};

// Pre-sorted keys (longest first) for reliable prefix-match: "envio_docs" must not match before "envio_docs_complementar" etc.
const FASE_TEMA_KEYS = Object.keys(FASE_TEMA_MAP).sort((a, b) => b.length - a.length);
const FASE_ABORDAGEM_KEYS = Object.keys(FASE_ABORDAGEM_MAP).sort((a, b) => b.length - a.length);

// Module-level compiled regexes — avoid recompilation on every deriveSinaisConversa call
const RX_INTERESSADO = /\b(ótimo|perfeito|quero|excelente|concordo|bora|combinado|vamos|adorei|maravilhoso)\b/;
const RX_OBJETIVO    = /\b(ok|certo|entendi|entendido|tá|ta|claro|deu|confirmo)\b/;
const RX_CONFUSO     = /\b(não sei|nao sei|como assim|não entend|nao entend|confuso|qual)\b/;
const RX_EVASIVO     = /\b(depois|amanhã|amanha|mais tarde|outra hora|não agora|nao agora|semana que vem)\b/;
const RX_RESISTENTE  = /\b(não quero|nao quero|pare|para|não tenho interesse|nao tenho|chega|cancela)\b/;

function deriveSinaisConversa(
  msgs: ConversaMsg[],
  lead: AttendanceDetalheRow,
): SinaisConversa {
  const DASH = "—";

  // 1. Bola com — último remetente determina de quem é a vez
  const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
  const bolaComLabel = lastMsg
    ? lastMsg.direction === "in"
      ? "Enova"
      : "Cliente"
    : DASH;

  // 2. Último tema tratado — do mapa de fases, com fallback prefix-match (longer keys first)
  const fase = lead.fase_funil ?? "";
  const temaKey = FASE_TEMA_KEYS.find((k) => fase === k || fase.startsWith(k + "_") || fase.startsWith(k));
  const ultimoTema = FASE_TEMA_MAP[fase] ?? (temaKey ? FASE_TEMA_MAP[temaKey] : null) ?? getFaseLabel(fase || null);

  // 3. Pendência aberta — campo operacional canônico já disponível no lead
  const pendenciaAberta = lead.pendencia_principal ?? DASH;

  // 4. Risco de travamento — travamento ativo = alto; gap de dias = médio/baixo
  let riscoTravamento: SinaisConversa["riscoTravamento"] = null;
  if (lead.fase_travamento) {
    riscoTravamento = "ALTO";
  } else {
    // Use the most recent interaction timestamp available
    const lastMsgAt = lastMsg?.created_at ?? null;
    const lastInteraction = lead.ultima_interacao_cliente ?? lastMsgAt;
    if (lastInteraction) {
      const daysSince = (Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24);
      riscoTravamento = daysSince > 7 ? "MEDIO" : "BAIXO";
    } else if (msgs.length > 0) {
      riscoTravamento = "BAIXO";
    }
  }

  // 5. Último sinal do cliente — keyword matching nos últimos 3 msgs do cliente
  const recentClientMsgs = [...msgs]
    .reverse()
    .filter((m) => m.direction === "in")
    .slice(0, 3);
  const recentText = recentClientMsgs
    .map((m) => (m.text ?? "").toLowerCase())
    .join(" ");
  let ultimoSinalCliente = DASH;
  if (recentClientMsgs.length > 0) {
    if (RX_INTERESSADO.test(recentText))     ultimoSinalCliente = "Interessado";
    else if (RX_OBJETIVO.test(recentText))   ultimoSinalCliente = "Objetivo";
    else if (RX_CONFUSO.test(recentText))    ultimoSinalCliente = "Confuso";
    else if (RX_EVASIVO.test(recentText))    ultimoSinalCliente = "Evasivo";
    else if (RX_RESISTENTE.test(recentText)) ultimoSinalCliente = "Resistente";
    else                                      ultimoSinalCliente = "Neutro";
  }

  // 6. Próxima abordagem sugerida — do mapa de fases (longer keys first) ou resumo_curto
  const abordagemKey = FASE_ABORDAGEM_KEYS.find((k) => fase === k || fase.startsWith(k + "_") || fase.startsWith(k));
  const proximaAbordagem =
    (abordagemKey ? FASE_ABORDAGEM_MAP[abordagemKey] : null) ??
    (lead.resumo_curto ? lead.resumo_curto.slice(0, 80) : DASH);

  return {
    bolaComLabel,
    ultimoTema,
    pendenciaAberta,
    riscoTravamento,
    ultimoSinalCliente,
    proximaAbordagem,
  };
}

/* ── Chamar cliente — suggested message ── */

function suggestCallMessage(lead: AttendanceDetalheRow): string {
  const firstName = lead.nome?.trim().split(/\s+/)[0] ?? null;
  const hi = firstName ? `Oi, ${firstName}!` : "Oi, tudo bem?";
  const pool = lead.crm_lead_pool ?? lead.base_atual ?? "";
  if (pool.startsWith("HOT")) return `${hi} Vamos avançar? Me confirma o interesse e a gente parte para os próximos passos.`;
  if (pool.startsWith("WARM")) return `${hi} Queria dar continuidade à nossa conversa sobre o financiamento. Tem alguma dúvida ou posso ajudar com algo?`;
  return `${hi} Passando para ver se ainda tem interesse no financiamento. Posso tirar alguma dúvida?`;
}

/* ── Archive reason options ── */

const ARCHIVE_REASON_OPTIONS = [
  { value: "ja_comprou", label: "Já comprou" },
  { value: "sem_interesse", label: "Sem interesse" },
  { value: "desistiu", label: "Desistiu" },
  { value: "nao_responde", label: "Não responde" },
  { value: "outro", label: "Outro" },
] as const;

/* ── Component ── */

interface AtendimentoDetalheUIProps {
  lead: AttendanceDetalheRow;
  initialProfile: ClientProfileRow | null;
}

export function AtendimentoDetalheUI({ lead, initialProfile }: AtendimentoDetalheUIProps) {
  const router = useRouter();

  const faseGrupo = deriveFaseGrupo(lead.fase_atendimento, lead.fase_travamento);
  const irBool = boolLabel(lead.ir_declarado);
  const ctpsBool = boolLabel(lead.ctps_36);
  const restricaoBool = boolLabel(lead.restricao);
  const somarRendaBool = boolLabel(lead.somar_renda);
  const prazoVencido = isPrazoVencido(lead.prazo_proxima_acao);

  /* ── Profile editing state ── */
  const [clientProfile, setClientProfile] = useState<ClientProfileRow | null>(initialProfile);
  const [profileEdit, setProfileEdit] = useState<ProfileEditState>(profileToEditState(initialProfile));
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  /* ── Archive state ── */
  const [isArchived, setIsArchived] = useState<boolean>(!!lead.arquivado_em);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReasonCode, setArchiveReasonCode] = useState("");
  const [archiveNote, setArchiveNote] = useState("");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveFeedback, setArchiveFeedback] = useState<string | null>(null);

  /* ── Human feedback edit state ── */
  const [feedbackEdit, setFeedbackEdit] = useState<HumanFeedbackState>(leadToFeedbackState(lead));
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackFeedback, setFeedbackFeedback] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  /* ── Chamar cliente state ── */
  const [callOpen, setCallOpen] = useState(false);
  const [callText, setCallText] = useState("");
  const [callBusy, setCallBusy] = useState(false);
  const [callFeedback, setCallFeedback] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  /* ── Conversa read-only state ── */
  const [convMsgs, setConvMsgs] = useState<ConversaMsg[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);

  /* ── Sinais da Conversa — derived client-side, never throws ── */
  const sinais = useMemo(() => {
    try {
      return deriveSinaisConversa(convMsgs, lead);
    } catch {
      return {
        bolaComLabel: "—",
        ultimoTema: "—",
        pendenciaAberta: "—",
        riscoTravamento: null,
        ultimoSinalCliente: "—",
        proximaAbordagem: "—",
      } satisfies SinaisConversa;
    }
  }, [convMsgs, lead]);

  /* ── Estado Cognitivo — leitura consolidada (PR1 + PR2), never throws ── */
  const cognitiveState = useMemo((): LeadCognitiveState | null => {
    try {
      const signals = buildLeadSignals(lead, convMsgs, clientProfile);
      return classifyLeadCognitiveState(signals);
    } catch {
      return null;
    }
  }, [lead, convMsgs, clientProfile]);

  /* ── Organização de Follow-up (PR4) — leitura read-only, never throws ── */
  const followupState = useMemo((): LeadFollowupOrganizer | null => {
    if (!cognitiveState) return null;
    try {
      const signals = buildLeadSignals(lead, convMsgs, clientProfile);
      return organizeLeadFollowup(signals, cognitiveState);
    } catch {
      return null;
    }
  }, [lead, convMsgs, clientProfile, cognitiveState]);

  /* ── Máquina de Pastas (PR5) — leitura read-only, never throws ── */
  const docsState = useMemo((): LeadDocsReading | null => {
    if (!cognitiveState) return null;
    try {
      const signals = buildLeadSignals(lead, convMsgs, clientProfile);
      return readLeadDocs(signals, cognitiveState);
    } catch {
      return null;
    }
  }, [lead, convMsgs, clientProfile, cognitiveState]);

  useEffect(() => {
    let cancelled = false;
    async function loadMsgs() {
      setConvLoading(true);
      setConvError(null);
      try {
        const resp = await fetch(
          `/api/messages?wa_id=${encodeURIComponent(lead.wa_id)}&limit=200`,
          { cache: "no-store" },
        );
        const data = (await resp.json()) as {
          ok: boolean;
          messages?: ConversaMsg[];
          error?: string | null;
        };
        if (!cancelled) {
          if (data.ok && Array.isArray(data.messages)) {
            setConvMsgs(data.messages);
          } else {
            setConvError(data.error ?? "Erro ao carregar conversa");
          }
        }
      } catch {
        if (!cancelled) setConvError("Erro ao carregar conversa");
      } finally {
        if (!cancelled) setConvLoading(false);
      }
    }
    void loadMsgs();
    return () => { cancelled = true; };
  }, [lead.wa_id]);

  /* ── Profile save handler ── */
  const handleSaveProfile = useCallback(async () => {
    setProfileBusy(true);
    setProfileFeedback(null);
    setProfileError(null);

    const payload = {
      wa_id: lead.wa_id,
      nome: profileTextOrNull(profileEdit.nome),
      nacionalidade: profileTextOrNull(profileEdit.nacionalidade),
      estado_civil: profileTextOrNull(profileEdit.estado_civil),
      regime_trabalho: profileTextOrNull(profileEdit.regime_trabalho),
      renda: profileNumOrNull(profileEdit.renda),
      ctps_36: profileBoolOrNull(profileEdit.ctps_36),
      dependentes_qtd: profileNumOrNull(profileEdit.dependentes_qtd),
      entrada_valor: profileNumOrNull(profileEdit.entrada_valor),
      restricao: profileBoolOrNull(profileEdit.restricao),
      origem_lead: profileTextOrNull(profileEdit.origem_lead),
      observacoes_admin: profileTextOrNull(profileEdit.observacoes_admin),
      updated_by: "admin_panel",
      source: "admin" as const,
    };

    const result = await saveClientProfileAction(payload);
    if (result.ok) {
      const saved = result.profile ?? null;
      setClientProfile(saved);
      setProfileEdit(profileToEditState(saved));
      setProfileFeedback("Perfil salvo com sucesso.");
    } else {
      setProfileError(result.error ?? "Erro ao salvar");
    }
    setProfileBusy(false);
  }, [lead.wa_id, profileEdit]);

  /* ── Human feedback save handler ── */
  const handleSaveFeedback = useCallback(async () => {
    setFeedbackBusy(true);
    setFeedbackFeedback(null);
    setFeedbackError(null);
    const t = (v: string) => v.trim() || null;
    const result = await saveAttendanceMetaAction({
      wa_id: lead.wa_id,
      interesse_atual: t(feedbackEdit.interesse_atual),
      objecao_principal: t(feedbackEdit.objecao_principal),
      momento_do_cliente: t(feedbackEdit.momento_do_cliente),
      responsavel: t(feedbackEdit.responsavel),
      quick_note: t(feedbackEdit.quick_note),
    });
    setFeedbackBusy(false);
    if (result.ok) {
      setFeedbackFeedback("Feedback salvo.");
    } else {
      setFeedbackError(result.error ?? "Erro ao salvar");
    }
  }, [lead.wa_id, feedbackEdit]);

  /* ── Archive handlers ── */
  const handleArchive = useCallback(async () => {
    if (!archiveReasonCode) {
      setArchiveError("Selecione um motivo de arquivamento.");
      return;
    }
    setArchiveBusy(true);
    setArchiveError(null);
    const result = await archiveLeadAction(
      lead.wa_id,
      archiveReasonCode || null,
      archiveNote.trim() || null,
    );
    setArchiveBusy(false);
    if (result.ok) {
      setIsArchived(true);
      setArchiveOpen(false);
      setArchiveFeedback("Lead arquivado com sucesso.");
    } else {
      setArchiveError(result.error ?? "Erro ao arquivar");
    }
  }, [lead.wa_id, archiveReasonCode, archiveNote]);

  const handleUnarchive = useCallback(async () => {
    setArchiveBusy(true);
    setArchiveError(null);
    const result = await unarchiveLeadAction(lead.wa_id);
    setArchiveBusy(false);
    if (result.ok) {
      setIsArchived(false);
      setArchiveFeedback("Lead desarquivado com sucesso.");
    } else {
      setArchiveError(result.error ?? "Erro ao desarquivar");
    }
  }, [lead.wa_id]);

  /* ── Chamar cliente handler ── */
  const handleCallSubmit = useCallback(async () => {
    if (!callText.trim()) return;
    setCallBusy(true);
    setCallError(null);
    try {
      const res = await fetch("/api/bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "call_now", wa_id: lead.wa_id, text: callText.trim() }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setCallOpen(false);
        setCallFeedback("Mensagem enviada ao cliente.");
      } else {
        setCallError(data.error ?? "Erro ao enviar mensagem");
      }
    } catch {
      setCallError("Erro de rede ao enviar mensagem");
    } finally {
      setCallBusy(false);
    }
  }, [lead.wa_id, callText]);

  /* Build timeline */
  type TimelineEvent = { ts: number; order: number; label: string; detail: string };
  const timelineEvents: TimelineEvent[] = [];
  if (lead.criado_em) {
    timelineEvents.push({ ts: new Date(lead.criado_em).getTime(), order: 1, label: "Lead criado", detail: formatDateTime(lead.criado_em) });
  }
  if (lead.movido_base_em && lead.base_atual) {
    timelineEvents.push({ ts: new Date(lead.movido_base_em).getTime(), order: 2, label: `Base: ${getBaseLabel(lead.base_atual)}`, detail: formatDateTime(lead.movido_base_em) });
  }
  if (lead.movido_fase_em && lead.fase_atendimento) {
    timelineEvents.push({ ts: new Date(lead.movido_fase_em).getTime(), order: 3, label: `Fase: ${getFaseLabel(lead.fase_atendimento)}`, detail: formatDateTime(lead.movido_fase_em) });
  }
  if (lead.ultima_interacao_enova) {
    timelineEvents.push({ ts: new Date(lead.ultima_interacao_enova).getTime(), order: 4, label: "Última interação Enova", detail: formatDateTime(lead.ultima_interacao_enova) });
  }
  if (lead.ultima_interacao_cliente) {
    timelineEvents.push({ ts: new Date(lead.ultima_interacao_cliente).getTime(), order: 5, label: "Última interação cliente", detail: formatDateTime(lead.ultima_interacao_cliente) });
  }
  timelineEvents.sort((a, b) => b.ts !== a.ts ? (b.ts > a.ts ? 1 : -1) : a.order - b.order);

  return (
    <div className={styles.fichaPage}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <Link href="/atendimento" className={styles.backButton}>
          ← Voltar
        </Link>
        <div className={styles.topBarInfo}>
          <h1 className={styles.topBarTitle}>{lead.nome ?? lead.telefone ?? lead.wa_id}</h1>
          <div className={styles.topBarMeta}>
            {lead.telefone && (
              <span className={styles.topBarMetaItem}>{lead.telefone}</span>
            )}
            <span className={styles.topBarMetaItem}>{lead.wa_id}</span>
            {lead.base_atual && (
              <span className={`${styles.baseBadge} ${getBaseBadgeCls(lead.base_atual)} ${styles.topBarBaseBadge}`}>
                {getBaseLabel(lead.base_atual)}
              </span>
            )}
            {isArchived && (
              <span className={styles.topBarArchivedBadge}>Arquivado</span>
            )}
          </div>
        </div>
        <div className={styles.topBarActions}>
          {!isArchived ? (
            <button
              type="button"
              className={styles.archiveToggleBtn}
              onClick={() => { setArchiveOpen((v) => !v); setArchiveError(null); }}
            >
              📦 Arquivar lead
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.archiveToggleBtn} ${styles.archiveToggleBtnUnarchive}`}
              disabled={archiveBusy}
              onClick={() => void handleUnarchive()}
            >
              {archiveBusy ? "Aguarde…" : "↩ Desarquivar"}
            </button>
          )}
        </div>
      </div>

      {/* ── Inline archive panel ── */}
      {archiveOpen && !isArchived && (
        <div className={styles.archivePanel}>
          <div className={styles.archivePanelInner}>
            <span className={styles.archivePanelTitle}>Arquivar lead</span>
            <div className={styles.archivePanelRow}>
              <select
                className={styles.prefillSelect}
                value={archiveReasonCode}
                onChange={(e) => setArchiveReasonCode(e.target.value)}
              >
                <option value="">— Selecione o motivo —</option>
                {ARCHIVE_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <textarea
                className={`${styles.prefillTextarea} ${styles.archiveNoteTextarea}`}
                placeholder="Observação complementar (opcional)"
                value={archiveNote}
                onChange={(e) => setArchiveNote(e.target.value)}
              />
            </div>
            {archiveError && <p className={styles.archivePanelError}>{archiveError}</p>}
            <div className={styles.archivePanelFooter}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => { setArchiveOpen(false); setArchiveError(null); setArchiveReasonCode(""); setArchiveNote(""); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.archiveConfirmBtn}
                disabled={archiveBusy || !archiveReasonCode}
                onClick={() => void handleArchive()}
              >
                {archiveBusy ? "Aguarde…" : "Confirmar arquivamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback global (archive) ── */}
      {archiveFeedback && (
        <div className={styles.globalFeedback}>{archiveFeedback}</div>
      )}
      {archiveError && !archiveOpen && (
        <div className={styles.globalFeedbackError}>{archiveError}</div>
      )}

      {/* ── Scrollable body ── */}
      <div className={styles.fichaBody}>

        {/* ═══════════════════════════════════════
           CABEÇALHO — 4 células de resumo + Temperatura (quando disponível)
           ═══════════════════════════════════════ */}
        <div className={styles.headerCard}>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Fase</span>
            {faseGrupo ? (
              <span className={`${styles.faseBadge} ${getFaseBadgeCls(faseGrupo)}`}>
                {getFaseLabel(lead.fase_atendimento ?? lead.fase_funil)}
              </span>
            ) : (
              <span className={styles.headerItemValueMuted}>{getFaseLabel(lead.fase_funil)}</span>
            )}
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Atenção</span>
            <span className={`${styles.atencaoBadge} ${getAtencaoCls(lead.status_atencao)}`}>
              <span className={styles.atencaoDot} />
              {STATUS_ATENCAO_LABELS[lead.status_atencao ?? ""] ?? lead.status_atencao ?? DASH}
            </span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Próxima ação</span>
            <span className={lead.proxima_acao ? styles.headerItemValue : styles.headerItemValueMuted}>
              {txt(lead.proxima_acao)}
            </span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Follow-up</span>
            <span className={prazoVencido ? styles.fieldValueDanger : (lead.prazo_proxima_acao ? styles.headerItemValue : styles.headerItemValueMuted)}>
              {formatDate(lead.prazo_proxima_acao)}
            </span>
          </div>
          {lead.lead_temp && (
            <div className={styles.headerItem}>
              <span className={styles.headerItemLabel}>Temperatura</span>
              <span className={`${styles.tempBadge} ${getTempBadgeCls(lead.lead_temp)}`}>
                {getTempLabel(lead.lead_temp)}
              </span>
            </div>
          )}
        </div>

        {/* ── Blocks grid ── */}
        <div className={styles.blocksGrid}>

          {/* ═══════════════════════════════════════
             BLOCO COGNITIVO — Estado Cognitivo do Lead (read-only)
             Leitura consolidada via PR1 (buildLeadSignals) + PR2 (classifyLeadCognitiveState).
             Sem automação, sem persistência.
             CTA "Chamar cliente" aqui: o cognitivo interpreta, o operador executa.
             ═══════════════════════════════════════ */}
          {cognitiveState && (
            <div className={`${styles.block} ${styles.blockFull} ${styles.blockCognitivo}`}>
              <div className={styles.blockHeader}>
                <span className={styles.blockIcon}>🧠</span>
                <h3 className={styles.blockTitle}>Estado Cognitivo</h3>
                <span
                  className={`${styles.cognitiConfBadge} ${
                    cognitiveState.confianca === "alta"
                      ? styles.cognitiConfAlta
                      : cognitiveState.confianca === "media"
                      ? styles.cognitiConfMedia
                      : styles.cognitiConfBaixa
                  }`}
                >
                  Confiança: {getConfiancaLabel(cognitiveState.confianca)}
                </span>
                {/* Chamar cliente — reutiliza /api/bases call_now (mesmo padrão de Bases) */}
                <button
                  type="button"
                  className={styles.callHeaderBtn}
                  onClick={() => { setCallText(suggestCallMessage(lead)); setCallOpen(true); setCallFeedback(null); setCallError(null); }}
                >
                  📞 Chamar cliente
                </button>
              </div>
              {callFeedback && <div className={styles.callBannerOk}>{callFeedback}</div>}
              {callError && <div className={styles.callBannerErr}>{callError}</div>}
              <div className={styles.blockBody}>
                <div className={styles.cognitiGrid}>
                  {/* Estado do cliente */}
                  <div className={styles.cognitiItem}>
                    <span className={styles.cognitiLabel}>Estado do cliente</span>
                    <span className={`${styles.cognitiBadge} ${styles.cognitiEstado}`}>
                      {getEstadoClienteLabel(cognitiveState.estado_cliente)}
                    </span>
                  </div>

                  {/* Momento de compra */}
                  <div className={styles.cognitiItem}>
                    <span className={styles.cognitiLabel}>Momento de compra</span>
                    <span
                      className={`${styles.cognitiBadge} ${
                        cognitiveState.momento_compra === "agora"
                          ? styles.cognitiMomentoAgora
                          : cognitiveState.momento_compra === "curto_prazo"
                          ? styles.cognitiMomentoCurto
                          : cognitiveState.momento_compra === "medio_prazo"
                          ? styles.cognitiMomentoMedio
                          : cognitiveState.momento_compra === "curioso"
                          ? styles.cognitiMomentoCurioso
                          : styles.cognitiMomentoSem
                      }`}
                    >
                      {getMomentoCompraLabel(cognitiveState.momento_compra)}
                    </span>
                  </div>

                  {/* Nível de interesse */}
                  <div className={styles.cognitiItem}>
                    <span className={styles.cognitiLabel}>Nível de interesse</span>
                    <span
                      className={`${styles.cognitiBadge} ${
                        cognitiveState.nivel_interesse === "alto"
                          ? styles.cognitiInteresseAlto
                          : cognitiveState.nivel_interesse === "baixo"
                          ? styles.cognitiInteresseBaixo
                          : styles.cognitiInteresseMedio
                      }`}
                    >
                      {getNivelInteresseLabel(cognitiveState.nivel_interesse)}
                    </span>
                  </div>

                  {/* Risco de travamento */}
                  <div className={styles.cognitiItem}>
                    <span className={styles.cognitiLabel}>Risco de travamento</span>
                    <span
                      className={`${styles.cognitiBadge} ${
                        cognitiveState.risco_travamento === "alto"
                          ? styles.cognitiRiscoAlto
                          : cognitiveState.risco_travamento === "medio"
                          ? styles.cognitiRiscoMedio
                          : styles.cognitiRiscoBaixo
                      }`}
                    >
                      {getRiscoTravamentoLabel(cognitiveState.risco_travamento)}
                    </span>
                  </div>

                  {/* Bola com */}
                  <div className={styles.cognitiItem}>
                    <span className={styles.cognitiLabel}>Bola com</span>
                    <span
                      className={`${styles.cognitiValue} ${
                        cognitiveState.bola_com === "enova"
                          ? styles.cognitiBolaEnova
                          : cognitiveState.bola_com === "lead"
                          ? styles.cognitiBolaLead
                          : ""
                      }`}
                    >
                      {getBolaComLabel(cognitiveState.bola_com)}
                    </span>
                  </div>

                  {/* Próxima melhor ação */}
                  <div className={styles.cognitiItem}>
                    <span className={styles.cognitiLabel}>Próxima melhor ação</span>
                    <span
                      className={`${styles.cognitiBadge} ${
                        cognitiveState.proxima_melhor_acao === "pedir_intervencao_humana"
                          ? styles.cognitiAcaoUrgente
                          : styles.cognitiAcaoPadrao
                      }`}
                    >
                      {getProximaMelhorAcaoLabel(cognitiveState.proxima_melhor_acao)}
                    </span>
                  </div>
                </div>

                {/* Justificativa */}
                <div className={styles.cognitiJustificativaRow}>
                  <span className={styles.cognitiLabel}>Justificativa</span>
                  <span className={styles.cognitiJustificativa}>
                    {cognitiveState.justificativa}
                  </span>
                </div>

                {/* ── Organização de Follow-up (PR4) — sub-bloco read-only ── */}
                {followupState && (
                  <div className={styles.followupSubBloco}>
                    <div className={styles.followupSubHeader}>
                      <span className={styles.followupSubIcon}>📋</span>
                      <span className={styles.followupSubTitle}>Organização de Follow-up</span>
                      <span
                        className={`${styles.followupUrgBadge} ${
                          followupState.urgencia_followup === "alta"
                            ? styles.followupUrgAlta
                            : followupState.urgencia_followup === "media"
                            ? styles.followupUrgMedia
                            : styles.followupUrgBaixa
                        }`}
                      >
                        {getUrgenciaFollowupLabel(followupState.urgencia_followup)}
                      </span>
                    </div>

                    <div className={styles.followupGrid}>
                      {/* Status */}
                      <div className={styles.followupItem}>
                        <span className={styles.followupLabel}>Status</span>
                        <span
                          className={`${styles.followupBadge} ${
                            followupState.status_followup === "followup_vencido"
                              ? styles.followupStatusVencido
                              : followupState.status_followup === "followup_ativo"
                              ? styles.followupStatusAtivo
                              : followupState.status_followup === "aguardando_janela"
                              ? styles.followupStatusAguardando
                              : followupState.status_followup === "nao_necessario"
                              ? styles.followupStatusNulo
                              : styles.followupStatusSem
                          }`}
                        >
                          {getStatusFollowupLabel(followupState.status_followup)}
                        </span>
                      </div>

                      {/* Janela ideal */}
                      <div className={styles.followupItem}>
                        <span className={styles.followupLabel}>Janela ideal</span>
                        <span
                          className={`${styles.followupBadge} ${
                            followupState.janela_ideal_followup === "agora"
                              ? styles.followupJanelaAgora
                              : followupState.janela_ideal_followup === "observar"
                              ? styles.followupJanelaObservar
                              : styles.followupJanelaBreve
                          }`}
                        >
                          {getJanelaIdealLabel(followupState.janela_ideal_followup)}
                        </span>
                      </div>

                      {/* Tipo sugerido */}
                      <div className={styles.followupItem}>
                        <span className={styles.followupLabel}>Tipo</span>
                        <span className={styles.followupValue}>
                          {getTipoFollowupLabel(followupState.tipo_followup_sugerido)}
                        </span>
                      </div>

                      {/* Ação sugerida */}
                      <div className={styles.followupItem}>
                        <span className={styles.followupLabel}>Ação sugerida</span>
                        <span
                          className={`${styles.followupBadge} ${
                            followupState.acao_followup_sugerida === "chamar_agora" ||
                            followupState.acao_followup_sugerida === "pedir_humano"
                              ? styles.followupAcaoUrgente
                              : followupState.acao_followup_sugerida === "sem_acao"
                              ? styles.followupAcaoNula
                              : styles.followupAcaoPadrao
                          }`}
                        >
                          {getAcaoFollowupLabel(followupState.acao_followup_sugerida)}
                        </span>
                      </div>
                    </div>

                    {/* Justificativa do follow-up */}
                    <div className={styles.followupJustificativaRow}>
                      <span className={styles.followupJustificativa}>
                        {followupState.justificativa_followup}
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Máquina de Pastas (PR5) — sub-bloco read-only ── */}
                {docsState && (
                  <div className={styles.docsSubBloco}>
                    <div className={styles.docsSubHeader}>
                      <span className={styles.docsSubIcon}>📁</span>
                      <span className={styles.docsSubTitle}>Máquina de Pastas</span>
                      <span
                        className={`${styles.docsProbBadge} ${
                          docsState.probabilidade_pasta === "alta"
                            ? styles.docsProbAlta
                            : docsState.probabilidade_pasta === "media"
                            ? styles.docsProbMedia
                            : styles.docsProbBaixa
                        }`}
                      >
                        {getProbabilidadePastaLabel(docsState.probabilidade_pasta)}
                      </span>
                    </div>

                    <div className={styles.docsGrid}>
                      {/* Status pasta */}
                      <div className={styles.docsItem}>
                        <span className={styles.docsLabel}>Status pasta</span>
                        <span
                          className={`${styles.docsBadge} ${
                            docsState.status_pasta === "em_docs"
                              ? styles.docsStatusEmDocs
                              : docsState.status_pasta === "pronto_para_docs"
                              ? styles.docsStatusPronto
                              : docsState.status_pasta === "quase_pronto"
                              ? styles.docsStatusQuase
                              : docsState.status_pasta === "travado_docs"
                              ? styles.docsStatusTravado
                              : docsState.status_pasta === "nao_pronto"
                              ? styles.docsStatusNaoPronto
                              : styles.docsStatusSemSinal
                          }`}
                        >
                          {getStatusPastaLabel(docsState.status_pasta)}
                        </span>
                      </div>

                      {/* Maturidade */}
                      <div className={styles.docsItem}>
                        <span className={styles.docsLabel}>Maturidade</span>
                        <span
                          className={`${styles.docsBadge} ${
                            docsState.maturidade_docs === "alta"
                              ? styles.docsMaturidadeAlta
                              : docsState.maturidade_docs === "media"
                              ? styles.docsMaturidadeMedia
                              : styles.docsMaturidadeBaixa
                          }`}
                        >
                          {getMaturidadeDocsLabel(docsState.maturidade_docs)}
                        </span>
                      </div>

                      {/* Bloqueio */}
                      <div className={styles.docsItem}>
                        <span className={styles.docsLabel}>Bloqueio</span>
                        <span className={styles.docsValue}>
                          {getBloqueioDocsPrincipalLabel(docsState.bloqueio_docs_principal)}
                        </span>
                      </div>

                      {/* Ação sugerida */}
                      <div className={styles.docsItem}>
                        <span className={styles.docsLabel}>Ação sugerida</span>
                        <span
                          className={`${styles.docsBadge} ${
                            docsState.acao_docs_sugerida === "estimular_docs" ||
                            docsState.acao_docs_sugerida === "chamar_cliente"
                              ? styles.docsAcaoAtiva
                              : docsState.acao_docs_sugerida === "pedir_humano"
                              ? styles.docsAcaoUrgente
                              : docsState.acao_docs_sugerida === "sem_acao"
                              ? styles.docsAcaoNula
                              : styles.docsAcaoPadrao
                          }`}
                        >
                          {getAcaoDocsSugeridaLabel(docsState.acao_docs_sugerida)}
                        </span>
                      </div>
                    </div>

                    {/* Estratégia e justificativa */}
                    <div className={styles.docsEstrategiaRow}>
                      <span className={styles.docsEstrategiaLabel}>Estratégia:</span>
                      <span className={styles.docsEstrategiaValue}>
                        {getEstrategiaDocsSugeridaLabel(docsState.estrategia_docs_sugerida)}
                      </span>
                    </div>
                    <div className={styles.docsJustificativaRow}>
                      <span className={styles.docsJustificativa}>
                        {docsState.justificativa_docs}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             BLOCO 3 (full) — FEEDBACK HUMANO DO CORRETOR
             Formulário editável — persiste em enova_attendance_meta.
             Campos: interesse_atual, objecao_principal,
             momento_do_cliente, responsavel, quick_note.
             Sem placeholders ociosos.
             ═══════════════════════════════════════ */}
          <div className={`${styles.block} ${styles.blockFull} ${styles.blockFeedback}`}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>💬</span>
              <h3 className={styles.blockTitle}>Feedback do Corretor</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.feedbackGrid}>
                <div className={styles.prefillFieldRow}>
                  <span className={styles.fieldLabel}>Interesse atual</span>
                  <input
                    type="text"
                    className={styles.prefillInput}
                    value={feedbackEdit.interesse_atual}
                    onChange={(e) => setFeedbackEdit({ ...feedbackEdit, interesse_atual: e.target.value })}
                    placeholder="Ex: comprar imóvel nos próximos 3 meses"
                  />
                </div>
                <div className={styles.prefillFieldRow}>
                  <span className={styles.fieldLabel}>Objeção principal</span>
                  <input
                    type="text"
                    className={styles.prefillInput}
                    value={feedbackEdit.objecao_principal}
                    onChange={(e) => setFeedbackEdit({ ...feedbackEdit, objecao_principal: e.target.value })}
                    placeholder="Ex: renda informal, restrição no CPF"
                  />
                </div>
                <div className={styles.prefillFieldRow}>
                  <span className={styles.fieldLabel}>Momento do cliente</span>
                  <input
                    type="text"
                    className={styles.prefillInput}
                    value={feedbackEdit.momento_do_cliente}
                    onChange={(e) => setFeedbackEdit({ ...feedbackEdit, momento_do_cliente: e.target.value })}
                    placeholder="Ex: aguardando aprovação, buscando entrada"
                  />
                </div>
                <div className={styles.prefillFieldRow}>
                  <span className={styles.fieldLabel}>Responsável</span>
                  <input
                    type="text"
                    className={styles.prefillInput}
                    value={feedbackEdit.responsavel}
                    onChange={(e) => setFeedbackEdit({ ...feedbackEdit, responsavel: e.target.value })}
                    placeholder="Nome do corretor responsável"
                  />
                </div>
                <div className={styles.prefillFieldRowFull}>
                  <span className={styles.fieldLabel}>
                    Nota do corretor
                    <span className={styles.feedbackFieldHint}> · leitura comercial livre</span>
                  </span>
                  <textarea
                    className={styles.prefillTextarea}
                    value={feedbackEdit.quick_note}
                    onChange={(e) => setFeedbackEdit({ ...feedbackEdit, quick_note: e.target.value })}
                    placeholder="Leitura do caso, observação operacional, próximo passo…"
                  />
                </div>
              </div>
              <div className={styles.profileSaveRow}>
                <button
                  type="button"
                  className={styles.profileSaveBtn}
                  disabled={feedbackBusy}
                  onClick={() => void handleSaveFeedback()}
                >
                  {feedbackBusy ? "Salvando…" : "Salvar feedback"}
                </button>
                {feedbackFeedback && <span className={styles.profileFeedback}>{feedbackFeedback}</span>}
                {feedbackError && <span className={styles.profileFeedbackError}>{feedbackError}</span>}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO CONVERSA — Interação AI (read-only)
             + Sinais da Conversa (painel lateral)
             Fonte: enova_log via /api/messages
             Tags: meta_minimal (in) · DECISION_OUTPUT/SEND_OK (out)
             100% read-only — sem input, sem botão, sem ação
             ═══════════════════════════════════════ */}
          <div className={`${styles.blockFull} ${styles.convSinaisWrapper}`}>
            {/* ── Conversa: ~65% ── */}
            <div className={`${styles.block} ${styles.blockConversa} ${styles.convMainPanel}`}>
              <div className={styles.blockHeader}>
                <span className={styles.blockIcon}>🗨️</span>
                <h3 className={styles.blockTitle}>Interação AI</h3>
              </div>
              <div className={styles.blockBody}>
                {convLoading ? (
                  <p className={styles.convLoading}>Carregando conversa…</p>
                ) : convError ? (
                  <p className={styles.convEmpty}>{convError}</p>
                ) : convMsgs.length === 0 ? (
                  <p className={styles.convEmpty}>
                    Sem mensagens registradas para este atendimento.
                  </p>
                ) : (
                  <div className={styles.convScroll}>
                    {groupMsgsByDay(convMsgs).map(({ label, msgs: dayMsgs }) => (
                      <div key={label}>
                        <div className={styles.convDateDivider}>
                          <span className={styles.convDateLabel}>{label}</span>
                        </div>
                        {dayMsgs.map((msg, idx) => (
                          <div
                            key={msg.id ?? `${label}-${idx}`}
                            className={`${styles.convBubbleRow} ${
                              msg.direction === "in"
                                ? styles.convBubbleRowIn
                                : styles.convBubbleRowOut
                            }`}
                          >
                            <div className={styles.convMeta}>
                              <span
                                className={`${styles.convSender} ${
                                  msg.direction === "in"
                                    ? styles.convSenderIn
                                    : styles.convSenderOut
                                }`}
                              >
                                {msg.direction === "in" ? "Cliente" : "Enova"}
                              </span>
                              {msg.created_at && (
                                <span className={styles.convTime}>
                                  {formatMsgTime(msg.created_at)}
                                </span>
                              )}
                            </div>
                            <div
                              className={`${styles.convBubble} ${
                                msg.direction === "in"
                                  ? styles.convBubbleIn
                                  : styles.convBubbleOut
                              }`}
                            >
                              {msg.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Sinais da Conversa: ~35% ── */}
            <div className={`${styles.block} ${styles.blockSinais}`}>
              <div className={styles.blockHeader}>
                <span className={styles.blockIcon}>📡</span>
                <h3 className={styles.blockTitle}>Sinais da Conversa</h3>
              </div>
              <div className={styles.blockBody}>
                <div className={styles.sinaisList}>
                  <div className={styles.sinaisItem}>
                    <span className={styles.sinaisLabel}>Bola com</span>
                    <span
                      className={`${styles.sinaisValue} ${
                        sinais.bolaComLabel === "Cliente"
                          ? styles.sinaisBolaCliente
                          : sinais.bolaComLabel === "Enova"
                          ? styles.sinaisBolaEnova
                          : ""
                      }`}
                    >
                      {sinais.bolaComLabel === "Enova"
                        ? "🤖 Enova"
                        : sinais.bolaComLabel === "Cliente"
                        ? "👤 Cliente"
                        : "—"}
                    </span>
                  </div>
                  <div className={styles.sinaisItem}>
                    <span className={styles.sinaisLabel}>Último tema</span>
                    <span className={styles.sinaisValue}>{sinais.ultimoTema}</span>
                  </div>
                  <div className={styles.sinaisItem}>
                    <span className={styles.sinaisLabel}>Pendência aberta</span>
                    <span className={styles.sinaisValue}>{sinais.pendenciaAberta}</span>
                  </div>
                  <div className={styles.sinaisItem}>
                    <span className={styles.sinaisLabel}>Risco de travamento</span>
                    {sinais.riscoTravamento ? (
                      <span
                        className={`${styles.sinaisBadge} ${
                          sinais.riscoTravamento === "ALTO"
                            ? styles.sinaisRiscoAlto
                            : sinais.riscoTravamento === "MEDIO"
                            ? styles.sinaisRiscoMedio
                            : styles.sinaisRiscoBaixo
                        }`}
                      >
                        {sinais.riscoTravamento === "ALTO"
                          ? "Alto"
                          : sinais.riscoTravamento === "MEDIO"
                          ? "Médio"
                          : "Baixo"}
                      </span>
                    ) : (
                      <span className={styles.sinaisValue}>—</span>
                    )}
                  </div>
                  <div className={styles.sinaisItem}>
                    <span className={styles.sinaisLabel}>Sinal do cliente</span>
                    <span className={styles.sinaisValue}>{sinais.ultimoSinalCliente}</span>
                  </div>
                  <div className={`${styles.sinaisItem} ${styles.sinaisItemFull}`}>
                    <span className={styles.sinaisLabel}>Próxima abordagem</span>
                    <span className={`${styles.sinaisValue} ${styles.sinaisAbordagem}`}>
                      {sinais.proximaAbordagem}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 4 — PERFIL EDITÁVEL DO SOLICITANTE
             ═══════════════════════════════════════ */}
          <div className={`${styles.block} ${styles.blockFull}`}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>👤</span>
              <h3 className={styles.blockTitle}>Perfil do Solicitante</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.profileGrid}>
                {/* nome */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Nome</span>
                    {clientProfile?.nome_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.nome_source)}`}>
                        {sourceLabel(clientProfile.nome_source)}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    className={styles.prefillInput}
                    value={profileEdit.nome}
                    onChange={(e) => setProfileEdit({ ...profileEdit, nome: e.target.value })}
                    placeholder="Nome do cliente"
                  />
                </div>
                {/* nacionalidade */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Nacionalidade</span>
                    {clientProfile?.nacionalidade_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.nacionalidade_source)}`}>
                        {sourceLabel(clientProfile.nacionalidade_source)}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    className={styles.prefillInput}
                    value={profileEdit.nacionalidade}
                    onChange={(e) => setProfileEdit({ ...profileEdit, nacionalidade: e.target.value })}
                    placeholder="Ex: brasileira"
                  />
                </div>
                {/* estado_civil */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Estado Civil</span>
                    {clientProfile?.estado_civil_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.estado_civil_source)}`}>
                        {sourceLabel(clientProfile.estado_civil_source)}
                      </span>
                    )}
                  </div>
                  <select
                    className={styles.prefillSelect}
                    value={profileEdit.estado_civil}
                    onChange={(e) => setProfileEdit({ ...profileEdit, estado_civil: e.target.value })}
                  >
                    <option value="">— não informado —</option>
                    <option value="solteiro">Solteiro(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="viuvo">Viúvo(a)</option>
                    <option value="uniao_estavel">União Estável</option>
                  </select>
                </div>
                {/* regime_trabalho */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Regime de Trabalho</span>
                    {clientProfile?.regime_trabalho_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.regime_trabalho_source)}`}>
                        {sourceLabel(clientProfile.regime_trabalho_source)}
                      </span>
                    )}
                  </div>
                  <select
                    className={styles.prefillSelect}
                    value={profileEdit.regime_trabalho}
                    onChange={(e) => setProfileEdit({ ...profileEdit, regime_trabalho: e.target.value })}
                  >
                    <option value="">— não informado —</option>
                    <option value="clt">CLT</option>
                    <option value="autonomo">Autônomo</option>
                    <option value="servidor_publico">Servidor Público</option>
                    <option value="empresario">Empresário</option>
                    <option value="aposentado">Aposentado / Pensionista</option>
                    <option value="misto">Misto</option>
                  </select>
                </div>
                {/* renda */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Renda (R$)</span>
                    {clientProfile?.renda_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.renda_source)}`}>
                        {sourceLabel(clientProfile.renda_source)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    className={styles.prefillInput}
                    value={profileEdit.renda}
                    onChange={(e) => setProfileEdit({ ...profileEdit, renda: e.target.value })}
                    placeholder="Ex: 2800"
                    min="0"
                  />
                </div>
                {/* ctps_36 */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>CTPS 36 meses</span>
                    {clientProfile?.meses_36_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.meses_36_source)}`}>
                        {sourceLabel(clientProfile.meses_36_source)}
                      </span>
                    )}
                  </div>
                  <select
                    className={styles.prefillSelect}
                    value={profileEdit.ctps_36}
                    onChange={(e) => setProfileEdit({ ...profileEdit, ctps_36: e.target.value })}
                  >
                    <option value="">— não informado —</option>
                    <option value="true">Sim (tem CTPS 36 meses)</option>
                    <option value="false">Não</option>
                  </select>
                </div>
                {/* dependentes_qtd */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Dependentes</span>
                    {clientProfile?.dependentes_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.dependentes_source)}`}>
                        {sourceLabel(clientProfile.dependentes_source)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    className={styles.prefillInput}
                    value={profileEdit.dependentes_qtd}
                    onChange={(e) => setProfileEdit({ ...profileEdit, dependentes_qtd: e.target.value })}
                    placeholder="Ex: 0"
                    min="0"
                  />
                </div>
                {/* entrada_valor */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Valor Entrada (R$)</span>
                    {clientProfile?.valor_entrada_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.valor_entrada_source)}`}>
                        {sourceLabel(clientProfile.valor_entrada_source)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    className={styles.prefillInput}
                    value={profileEdit.entrada_valor}
                    onChange={(e) => setProfileEdit({ ...profileEdit, entrada_valor: e.target.value })}
                    placeholder="Ex: 10000"
                    min="0"
                  />
                </div>
                {/* restricao */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Restrição</span>
                    {clientProfile?.restricao_source && (
                      <span className={`${styles.prefillStatusBadge} ${sourceBadgeClass(clientProfile.restricao_source)}`}>
                        {sourceLabel(clientProfile.restricao_source)}
                      </span>
                    )}
                  </div>
                  <select
                    className={styles.prefillSelect}
                    value={profileEdit.restricao}
                    onChange={(e) => setProfileEdit({ ...profileEdit, restricao: e.target.value })}
                  >
                    <option value="">— não informado —</option>
                    <option value="true">Sim (tem restrição)</option>
                    <option value="false">Não (sem restrição)</option>
                  </select>
                </div>
                {/* origem_lead */}
                <div className={styles.prefillFieldRow}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Origem do Lead</span>
                  </div>
                  <input
                    type="text"
                    className={styles.prefillInput}
                    value={profileEdit.origem_lead}
                    onChange={(e) => setProfileEdit({ ...profileEdit, origem_lead: e.target.value })}
                    placeholder="Ex: lyx, campanha-x"
                  />
                </div>
                {/* observacoes_admin — full width */}
                <div className={styles.prefillFieldRowFull}>
                  <div className={styles.prefillFieldHeader}>
                    <span className={styles.fieldLabel}>Observações Admin</span>
                  </div>
                  <textarea
                    className={styles.prefillTextarea}
                    value={profileEdit.observacoes_admin}
                    onChange={(e) => setProfileEdit({ ...profileEdit, observacoes_admin: e.target.value })}
                    placeholder="Observações internas (não visível ao cliente)"
                  />
                </div>
              </div>
              <div className={styles.profileSaveRow}>
                <button
                  type="button"
                  className={styles.profileSaveBtn}
                  disabled={profileBusy}
                  onClick={() => void handleSaveProfile()}
                >
                  {profileBusy ? "Salvando…" : "Salvar perfil"}
                </button>
                {profileFeedback && <span className={styles.profileFeedback}>{profileFeedback}</span>}
                {profileError && <span className={styles.profileFeedbackError}>{profileError}</span>}
              </div>
              {/* Dados apurados pelo funil — read-only, dentro do Perfil */}
              <div className={styles.perfilSubSection}>
                <p className={styles.perfilSubTitle}>Dados Apurados</p>
                <div className={styles.detailGrid}>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Somar renda</span>
                    <span className={`${styles.boolBadge} ${somarRendaBool.cls}`}>{somarRendaBool.text}</span>
                  </div>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Renda total</span>
                    <span className={lead.renda_total ? styles.fieldValueHighlight : styles.fieldValueMuted}>{formatCurrency(lead.renda_total)}</span>
                  </div>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>IR declarado</span>
                    <span className={`${styles.boolBadge} ${irBool.cls}`}>{irBool.text}</span>
                  </div>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Composição</span>
                    <span className={lead.composicao ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.composicao)}</span>
                  </div>
                  {isResumoUtil(lead.resumo_curto) && (
                    <div className={styles.fieldItemFull}>
                      <span className={styles.fieldLabel}>Resumo</span>
                      <span className={styles.fieldValue}>{lead.resumo_curto}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 3 — STATUS FUNIL / TRAVAMENTO
             ═══════════════════════════════════════ */}
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>🔄</span>
              <h3 className={styles.blockTitle}>Status Funil</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.detailGrid}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Fase do funil</span>
                  <span className={lead.fase_funil ? styles.fieldValue : styles.fieldValueMuted}>{getFaseLabel(lead.fase_funil)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Status do funil</span>
                  <span className={lead.status_funil ? styles.fieldValue : styles.fieldValueMuted}>{getStatusFunilLabel(lead.status_funil)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Etapa de atendimento</span>
                  <span className={lead.fase_atendimento ? styles.fieldValue : styles.fieldValueMuted}>{getFaseLabel(lead.fase_atendimento)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Atualizado em</span>
                  <span className={lead.movido_fase_em ? styles.fieldValue : styles.fieldValueMuted}>{formatDateTime(lead.movido_fase_em)}</span>
                </div>
                {lead.pendencia_principal && (
                  <div className={styles.fieldItemFull}>
                    <span className={styles.fieldLabel}>Pendência principal</span>
                    <span className={styles.fieldValueWarn}>{lead.pendencia_principal}</span>
                  </div>
                )}
                {lead.dono_pendencia && (
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Responsável pela pendência</span>
                    <span className={styles.fieldValue}>{lead.dono_pendencia}</span>
                  </div>
                )}
                {lead.gatilho_proxima_acao && (
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Gatilho da ação</span>
                    <span className={styles.fieldValue}>{getGatilhoLabel(lead.gatilho_proxima_acao)}</span>
                  </div>
                )}
                {lead.fase_travamento && (
                  <>
                    <div className={styles.fieldItem}>
                      <span className={styles.fieldLabel}>Fase de travamento</span>
                      <span className={styles.fieldValueDanger}>{getFaseLabel(lead.fase_travamento)}</span>
                    </div>
                    <div className={styles.fieldItem}>
                      <span className={styles.fieldLabel}>Travou em</span>
                      <span className={styles.fieldValueWarn}>{formatDateTime(lead.travou_em)}</span>
                    </div>
                    <div className={styles.fieldItemFull}>
                      <span className={styles.fieldLabel}>Motivo travamento</span>
                      <span className={styles.fieldValueDanger}>{txt(lead.motivo_travamento)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 4 — BASE E ORIGEM
             ═══════════════════════════════════════ */}
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>📋</span>
              <h3 className={styles.blockTitle}>Base e Origem</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.detailGrid}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Base origem</span>
                  {/* base_origem vem de attendance_meta — único registro confiável de origem */}
                  <span className={`${styles.baseBadge} ${getBaseBadgeCls(lead.base_origem)}`}>
                    {getBaseLabel(lead.base_origem)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Base atual</span>
                  {/* crm_lead_pool é a fonte canônica — base_atual (attendance_meta) pode ser null */}
                  <span className={`${styles.baseBadge} ${getBaseBadgeCls(lead.crm_lead_pool ?? lead.base_atual)}`}>
                    {getBaseLabel(lead.crm_lead_pool ?? lead.base_atual)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Movido base em</span>
                  <span className={lead.movido_base_em ? styles.fieldValue : styles.fieldValueMuted}>{formatDateTime(lead.movido_base_em)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Criado em</span>
                  <span className={lead.criado_em ? styles.fieldValue : styles.fieldValueMuted}>{formatDateTime(lead.criado_em)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Última interação cliente</span>
                  <span className={lead.ultima_interacao_cliente ? styles.fieldValue : styles.fieldValueMuted}>{formatDateTime(lead.ultima_interacao_cliente)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Última interação Enova</span>
                  <span className={lead.ultima_interacao_enova ? styles.fieldValue : styles.fieldValueMuted}>{formatDateTime(lead.ultima_interacao_enova)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 5 — INCIDENTE (se houver)
             ═══════════════════════════════════════ */}
          {lead.tem_incidente_aberto && (
            <div className={styles.block}>
              <div className={styles.blockHeader}>
                <span className={styles.blockIcon}>⚠️</span>
                <h3 className={styles.blockTitle}>Incidente Aberto</h3>
              </div>
              <div className={styles.blockBody}>
                <div className={styles.detailGrid}>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Tipo</span>
                    <span className={lead.tipo_incidente ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.tipo_incidente)}</span>
                  </div>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Severidade</span>
                    <span className={`${styles.incidenteBadge} ${getIncidenteBadgeCls(lead.severidade_incidente)}`}>
                      {getSeveridadeLabel(lead.severidade_incidente)}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: "12px" }}>
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => router.push(`/incidentes?wa_id=${encodeURIComponent(lead.wa_id)}`)}
                  >
                    Ver incidentes →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             BLOCO 6 (full) — TIMELINE DE HISTÓRICO
             ═══════════════════════════════════════ */}
          <div className={`${styles.block} ${styles.blockFull}`}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>📅</span>
              <h3 className={styles.blockTitle}>Histórico</h3>
            </div>
            <div className={styles.blockBody}>
              {timelineEvents.length === 0 ? (
                <p className={styles.timelineEmpty}>Sem eventos registrados.</p>
              ) : (
                <div className={styles.timeline}>
                  {timelineEvents.map((ev) => (
                    <div key={`${ev.ts}-${ev.order}`} className={styles.timelineItem}>
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineContent}>
                        <span className={styles.timelineLabel}>{ev.label}</span>
                        <span className={styles.timelineDate}>{ev.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 7 — ARQUIVO (se arquivado)
             ═══════════════════════════════════════ */}
          {(isArchived || lead.arquivado_em) && (
            <div className={`${styles.block} ${styles.blockFull} ${styles.blockArchived}`}>
              <div className={styles.blockHeader}>
                <span className={styles.blockIcon}>📦</span>
                <h3 className={styles.blockTitle}>Lead Arquivado</h3>
              </div>
              <div className={styles.blockBody}>
                <div className={styles.detailGrid}>
                  {lead.arquivado_em && (
                    <div className={styles.fieldItem}>
                      <span className={styles.fieldLabel}>Arquivado em</span>
                      <span className={styles.fieldValueWarn}>{formatDateTime(lead.arquivado_em)}</span>
                    </div>
                  )}
                  {lead.codigo_motivo_arquivo && (
                    <div className={styles.fieldItem}>
                      <span className={styles.fieldLabel}>Código motivo</span>
                      <span className={lead.codigo_motivo_arquivo ? styles.fieldValue : styles.fieldValueMuted}>{getMotivoArquivoLabel(lead.codigo_motivo_arquivo)}</span>
                    </div>
                  )}
                  {lead.nota_arquivo && (
                    <div className={styles.fieldItemFull}>
                      <span className={styles.fieldLabel}>Nota</span>
                      <span className={styles.fieldValue}>{lead.nota_arquivo}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Chamar cliente overlay modal ── */}
      {callOpen && (
        <div className={styles.callOverlay} onClick={() => setCallOpen(false)}>
          <div className={styles.callModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.callModalHeader}>
              <span className={styles.callModalTitle}>📞 Chamar cliente</span>
              <button type="button" className={styles.callModalClose} onClick={() => setCallOpen(false)}>✕</button>
            </div>
            <div className={styles.callModalBody}>
              <p className={styles.callModalHint}>
                Revise a mensagem antes de enviar para{" "}
                <strong>{lead.nome ?? lead.telefone ?? lead.wa_id}</strong>.
              </p>
              <textarea
                className={styles.callModalTextarea}
                value={callText}
                onChange={(e) => setCallText(e.target.value)}
                disabled={callBusy}
                rows={4}
              />
              {callError && <p className={styles.callModalError}>{callError}</p>}
            </div>
            <div className={styles.callModalFooter}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setCallOpen(false)}>Cancelar</button>
              <button
                type="button"
                className={styles.callSendBtn}
                disabled={callBusy || !callText.trim()}
                onClick={() => void handleCallSubmit()}
              >
                {callBusy ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

