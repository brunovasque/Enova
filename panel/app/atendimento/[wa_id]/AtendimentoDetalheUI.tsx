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
import { useState, useCallback } from "react";
import styles from "./detalhe.module.css";
import type { ClientProfileRow } from "../../api/client-profile/_shared";
import {
  saveClientProfileAction,
  archiveLeadAction,
  unarchiveLeadAction,
} from "../actions";

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
            <span className={styles.headerItemLabel}>Follow-up</span>
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
                        {lead.prazo_proxima_acao && `Follow-up: ${formatDate(lead.prazo_proxima_acao)}`}
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
             BLOCO 2 — PERFIL EDITÁVEL DO SOLICITANTE
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
              {/* Read-only complementary fields */}
              <div className={styles.detailGrid} style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Somar renda</span>
                  <span className={`${styles.boolBadge} ${somarRendaBool.cls}`}>{somarRendaBool.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Renda Total</span>
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
                {lead.pendencia_principal && (
                  <div className={styles.fieldItemFull}>
                    <span className={styles.fieldLabel}>Pendência principal</span>
                    <span className={styles.fieldValueWarn}>{lead.pendencia_principal}</span>
                  </div>
                )}
                {lead.dono_pendencia && (
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Dono pendência</span>
                    <span className={styles.fieldValue}>{lead.dono_pendencia}</span>
                  </div>
                )}
                {lead.gatilho_proxima_acao && (
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Gatilho próx. ação</span>
                    <span className={styles.fieldValue}>{lead.gatilho_proxima_acao}</span>
                  </div>
                )}
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
                      <span className={lead.codigo_motivo_arquivo ? styles.fieldValue : styles.fieldValueMuted}>{txt(lead.codigo_motivo_arquivo)}</span>
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
    </div>
  );
}

