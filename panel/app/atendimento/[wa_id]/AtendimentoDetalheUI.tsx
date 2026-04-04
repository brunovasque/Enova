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
import styles from "./detalhe.module.css";

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

function deriveFaseGrupo(faseAtendimento: string | null, faseTravamento: string | null): FaseGrupo | null {
  if (faseTravamento) return "TRAVADO";
  const s = faseAtendimento;
  if (!s) return null;
  if (["inicio", "inicio_decisao", "inicio_programa", "inicio_nome",
    "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"].includes(s)) {
    return "ENTRADA";
  }
  if (s.startsWith("renda") || s.startsWith("ctps_36") || s.startsWith("restricao") ||
    s.startsWith("regularizacao") || s.startsWith("verificar") ||
    s === "ir_declarado" || s === "dependente" ||
    s.includes("multi_renda") ||
    ["possui_renda_extra", "renda_mista_detalhe", "clt_renda_perfil_informativo",
      "autonomo_ir_pergunta", "autonomo_sem_ir_ir_este_ano", "autonomo_sem_ir_caminho",
      "autonomo_sem_ir_entrada", "autonomo_compor_renda", "p3_tipo_pergunta",
      "confirmar_avo_familiar"].includes(s)) {
    return "COLETA";
  }
  if (["fim_ineligivel", "fim_inelegivel", "finalizacao"].includes(s)) {
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

/* ── Component ── */

interface AtendimentoDetalheUIProps {
  lead: AttendanceDetalheRow;
}

export function AtendimentoDetalheUI({ lead }: AtendimentoDetalheUIProps) {
  const router = useRouter();

  const faseGrupo = deriveFaseGrupo(lead.fase_atendimento, lead.fase_travamento);
  const irBool = boolLabel(lead.ir_declarado);
  const ctpsBool = boolLabel(lead.ctps_36);
  const restricaoBool = boolLabel(lead.restricao);
  const somarRendaBool = boolLabel(lead.somar_renda);
  const prazoVencido = isPrazoVencido(lead.prazo_proxima_acao);

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
    timelineEvents.push({ ts: new Date(lead.movido_fase_em).getTime(), order: 3, label: `Fase: ${lead.fase_atendimento}`, detail: formatDateTime(lead.movido_fase_em) });
  }
  if (lead.ultima_interacao_enova) {
    timelineEvents.push({ ts: new Date(lead.ultima_interacao_enova).getTime(), order: 4, label: "Última interação Enova", detail: formatDateTime(lead.ultima_interacao_enova) });
  }
  if (lead.ultima_interacao_cliente) {
    timelineEvents.push({ ts: new Date(lead.ultima_interacao_cliente).getTime(), order: 5, label: "Última interação cliente", detail: formatDateTime(lead.ultima_interacao_cliente) });
  }
  timelineEvents.sort((a, b) => b.ts - a.ts || a.order - b.order);

  return (
    <div className={styles.fichaPage}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <Link href="/atendimento" className={styles.backButton}>
          ← Voltar
        </Link>
        <div>
          <h1 className={styles.topBarTitle}>{lead.nome ?? lead.telefone ?? lead.wa_id}</h1>
          <p className={styles.topBarSubtitle}>
            Atendimento · {lead.wa_id}
          </p>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className={styles.fichaBody}>

        {/* ═══════════════════════════════════════
           CABEÇALHO — 4 células de resumo
           ═══════════════════════════════════════ */}
        <div className={styles.headerCard}>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Fase</span>
            {faseGrupo ? (
              <span className={`${styles.faseBadge} ${getFaseBadgeCls(faseGrupo)}`}>
                {lead.fase_atendimento ?? lead.fase_funil ?? faseGrupo}
              </span>
            ) : (
              <span className={styles.headerItemValueMuted}>{txt(lead.fase_funil)}</span>
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
            <span className={styles.headerItemLabel}>Prazo</span>
            <span className={prazoVencido ? styles.fieldValueDanger : (lead.prazo_proxima_acao ? styles.headerItemValue : styles.headerItemValueMuted)}>
              {formatDate(lead.prazo_proxima_acao)}
            </span>
          </div>
        </div>

        {/* ── Blocks grid ── */}
        <div className={styles.blocksGrid}>

          {/* ═══════════════════════════════════════
             BLOCO 1 (full) — PRÓXIMA AÇÃO
             ═══════════════════════════════════════ */}
          {lead.proxima_acao && (
            <div className={`${styles.block} ${styles.blockFull}`}>
              <div className={styles.blockHeader}>
                <span className={styles.blockIcon}>🎯</span>
                <h3 className={styles.blockTitle}>Próxima Ação</h3>
              </div>
              <div className={styles.blockBody}>
                <div className={styles.nextActionCard}>
                  <span className={styles.nextActionIcon}>→</span>
                  <div className={styles.nextActionBody}>
                    <span className={styles.nextActionText}>{lead.proxima_acao}</span>
                    {(lead.gatilho_proxima_acao || lead.prazo_proxima_acao) && (
                      <span className={styles.nextActionMeta}>
                        {lead.gatilho_proxima_acao && `Gatilho: ${lead.gatilho_proxima_acao}`}
                        {lead.gatilho_proxima_acao && lead.prazo_proxima_acao && " · "}
                        {lead.prazo_proxima_acao && `Prazo: ${formatDate(lead.prazo_proxima_acao)}`}
                      </span>
                    )}
                    {lead.dono_pendencia && (
                      <span className={styles.nextActionMeta}>
                        Responsável: {lead.dono_pendencia}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════
             BLOCO 2 — PERFIL DO SOLICITANTE
             ═══════════════════════════════════════ */}
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>👤</span>
              <h3 className={styles.blockTitle}>Perfil do Solicitante</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.detailGrid}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Nome</span>
                  <span className={lead.nome ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.nome)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Telefone</span>
                  <span className={lead.telefone ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.telefone)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Nacionalidade</span>
                  <span className={lead.nacionalidade ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.nacionalidade)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Estado Civil</span>
                  <span className={lead.estado_civil ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.estado_civil)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Regime de Trabalho</span>
                  <span className={lead.regime_trabalho ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.regime_trabalho)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Composição</span>
                  <span className={lead.composicao ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.composicao)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Renda</span>
                  <span className={lead.renda ? styles.fieldValueHighlight : styles.fieldValueMuted}>{formatCurrency(lead.renda)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Renda Total</span>
                  <span className={lead.renda_total ? styles.fieldValueHighlight : styles.fieldValueMuted}>{formatCurrency(lead.renda_total)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Somar renda</span>
                  <span className={`${styles.boolBadge} ${somarRendaBool.cls}`}>{somarRendaBool.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Dependentes</span>
                  <span className={lead.dependentes_qtd !== null ? styles.fieldValue : styles.fieldValueMuted}>
                    {lead.dependentes_qtd !== null ? String(lead.dependentes_qtd) : DASH}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>IR declarado</span>
                  <span className={`${styles.boolBadge} ${irBool.cls}`}>{irBool.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>CTPS 36 meses</span>
                  <span className={`${styles.boolBadge} ${ctpsBool.cls}`}>{ctpsBool.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Restrição</span>
                  <span className={`${styles.boolBadge} ${restricaoBool.cls}`}>{restricaoBool.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Entrada (valor)</span>
                  <span className={lead.entrada_valor ? styles.fieldValueHighlight : styles.fieldValueMuted}>{formatCurrency(lead.entrada_valor)}</span>
                </div>
                {lead.resumo_curto && (
                  <div className={styles.fieldItemFull}>
                    <span className={styles.fieldLabel}>Resumo</span>
                    <span className={styles.fieldValue}>{lead.resumo_curto}</span>
                  </div>
                )}
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
                  <span className={styles.fieldLabel}>Fase funil</span>
                  <span className={lead.fase_funil ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.fase_funil)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Status funil</span>
                  <span className={lead.status_funil ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.status_funil)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Fase atendimento</span>
                  <span className={lead.fase_atendimento ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.fase_atendimento)}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Movido fase em</span>
                  <span className={lead.movido_fase_em ? styles.fieldValue : styles.fieldValueMuted}>{formatDateTime(lead.movido_fase_em)}</span>
                </div>
                {lead.fase_travamento && (
                  <>
                    <div className={styles.fieldItem}>
                      <span className={styles.fieldLabel}>Fase travamento</span>
                      <span className={styles.fieldValueDanger}>{lead.fase_travamento}</span>
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
                {lead.pendencia_principal && (
                  <div className={styles.fieldItemFull}>
                    <span className={styles.fieldLabel}>Pendência principal</span>
                    <span className={styles.fieldValueWarn}>{lead.pendencia_principal}</span>
                  </div>
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
                  <span className={`${styles.baseBadge} ${getBaseBadgeCls(lead.base_origem)}`}>
                    {getBaseLabel(lead.base_origem)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Base atual</span>
                  <span className={`${styles.baseBadge} ${getBaseBadgeCls(lead.base_atual)}`}>
                    {getBaseLabel(lead.base_atual)}
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
                      {lead.severidade_incidente ?? "Aberto"}
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
                  {timelineEvents.map((ev, i) => (
                    <div key={i} className={styles.timelineItem}>
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
          {lead.arquivado_em && (
            <div className={`${styles.block} ${styles.blockFull} ${styles.blockArchived}`}>
              <div className={styles.blockHeader}>
                <span className={styles.blockIcon}>📦</span>
                <h3 className={styles.blockTitle}>Lead Arquivado</h3>
              </div>
              <div className={styles.blockBody}>
                <div className={styles.detailGrid}>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Arquivado em</span>
                    <span className={styles.fieldValueWarn}>{formatDateTime(lead.arquivado_em)}</span>
                  </div>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Código motivo</span>
                    <span className={lead.codigo_motivo_arquivo ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.codigo_motivo_arquivo)}</span>
                  </div>
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
    </div>
  );
}
