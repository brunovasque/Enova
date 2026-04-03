"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./atendimento.module.css";
import { fetchAttendanceLeadsAction, fetchClientProfileAction, saveClientProfileAction } from "./actions";
import type { ClientProfileRow, ProfileSource } from "../api/client-profile/_shared";

/* ===========================================
   TIPOS - baseados em enova_attendance_v1
   =========================================== */

type FaseGrupo =
  | "ENTRADA"
  | "QUALIFICACAO"
  | "COLETA"
  | "AGUARDANDO"
  | "TRAVADO";

// Real values from enova_attendance_meta.attention_status
type StatusAtencao = "ON_TIME" | "DUE_SOON" | "OVERDUE";

type AttendanceRow = {
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
  status_atencao: StatusAtencao | string | null;
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

type FilterState = {
  busca: string;
  fase: string;
  baseAtual: string;
  donoPendencia: string;
  statusAtencao: string;
  incidente: "todos" | "com_incidente" | "sem_incidente";
  travamento: "todos" | "travados" | "nao_travados";
};

// Visual group labels for the tabs
const FASE_GRUPO_LABELS: Record<FaseGrupo, string> = {
  ENTRADA: "Entrada",
  QUALIFICACAO: "Qualificacao",
  COLETA: "Coleta",
  AGUARDANDO: "Aguardando",
  TRAVADO: "Travado",
};

// Real attention_status values from enova_attendance_meta
const STATUS_ATENCAO_LABELS: Record<string, string> = {
  ON_TIME: "Em dia",
  DUE_SOON: "Atencao",
  OVERDUE: "Atrasado",
};

// Maps real fase_conversa stage names to visual tab groups
function deriveFaseGrupo(faseAtendimento: string | null, faseTravamento: string | null): FaseGrupo | null {
  if (faseTravamento) return "TRAVADO";
  const s = faseAtendimento;
  if (!s) return null;
  // ENTRADA: initial/setup stages
  if (["inicio", "inicio_decisao", "inicio_programa", "inicio_nome",
    "inicio_nacionalidade", "inicio_rnm", "inicio_rnm_validade"].includes(s)) {
    return "ENTRADA";
  }
  // COLETA: income/document collection stages
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
  // AGUARDANDO: terminal pre-docs stages
  if (["fim_ineligivel", "fim_inelegivel", "finalizacao"].includes(s)) {
    return "AGUARDANDO";
  }
  // QUALIFICACAO: state/composition/regime stages (default for remaining pre-docs)
  return "QUALIFICACAO";
}



function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(dateStr));
  } catch {
    return "—";
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(dateStr));
  } catch {
    return "—";
  }
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function leadLabel(lead: AttendanceRow): string {
  return lead.nome ?? lead.telefone ?? lead.wa_id;
}

function getBaseLabel(pool: string | null): string {
  if (!pool) return "—";
  switch (pool) {
    case "COLD_POOL": return "Fria";
    case "WARM_POOL": return "Morna";
    case "HOT_POOL": return "Quente";
    default: return pool;
  }
}

function getBaseBadgeClass(pool: string | null): string {
  switch (pool) {
    case "COLD_POOL": return styles.baseBadgeFria;
    case "WARM_POOL": return styles.baseBadgeMorna;
    case "HOT_POOL": return styles.baseBadgeQuente;
    default: return "";
  }
}

function getAtencaoClass(status: string | null): string {
  switch (status) {
    case "ON_TIME": return styles.atencaoNormal;
    case "DUE_SOON": return styles.atencaoAlerta;
    case "OVERDUE": return styles.atencaoCritico;
    default: return styles.atencaoNormal;
  }
}

function getFaseBadgeClass(grupo: FaseGrupo | null): string {
  switch (grupo) {
    case "ENTRADA": return styles.faseBadgeActive;
    case "QUALIFICACAO": return styles.faseBadgeActive;
    case "COLETA": return styles.faseBadgeActive;
    case "AGUARDANDO": return styles.faseBadgeWarning;
    case "TRAVADO": return styles.faseBadgeDanger;
    default: return styles.faseBadgeDefault;
  }
}

function isPrazoVencido(prazo: string | null): boolean {
  if (!prazo) return false;
  return new Date(prazo) < new Date();
}

function isPrazoProximo(prazo: string | null): boolean {
  if (!prazo) return false;
  const prazoDate = new Date(prazo);
  const now = new Date();
  const diff = prazoDate.getTime() - now.getTime();
  const hoursUntil = diff / (1000 * 60 * 60);
  return hoursUntil > 0 && hoursUntil <= 24;
}

function onStatKeyDown(event: React.KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate();
  }
}

function getIncidenteBadgeClass(severidade: string | null): string {
  switch (severidade) {
    case "CRITICAL": return styles.incidenteBadgeCritical;
    case "HIGH": return styles.incidenteBadgeHigh;
    case "MEDIUM": return styles.incidenteBadgeMedium;
    case "LOW": return styles.incidenteBadgeLow;
    default: return "";
  }
}

/* ===========================================
   LEAD HISTORY HELPERS — histórico inferido de timestamps existentes
   =========================================== */

type LeadHistoryEvent = {
  ts: number;
  order: number;
  label: string;
  detail: string;
};

// Tie-breaking precedence for events sharing the same timestamp:
// 1=criado, 2=base, 3=fase, 4=enova, 5=cliente
function buildLeadHistory(lead: AttendanceRow): LeadHistoryEvent[] {
  const events: LeadHistoryEvent[] = [];

  if (lead.criado_em) {
    events.push({ ts: new Date(lead.criado_em).getTime(), order: 1, label: "Lead criado", detail: formatDateTime(lead.criado_em) });
  }
  if (lead.movido_base_em && lead.base_atual) {
    events.push({ ts: new Date(lead.movido_base_em).getTime(), order: 2, label: `Base: ${getBaseLabel(lead.base_atual)}`, detail: formatDateTime(lead.movido_base_em) });
  }
  if (lead.movido_fase_em && lead.fase_atendimento) {
    events.push({ ts: new Date(lead.movido_fase_em).getTime(), order: 3, label: `Fase: ${lead.fase_atendimento}`, detail: formatDateTime(lead.movido_fase_em) });
  }
  if (lead.ultima_interacao_enova) {
    events.push({ ts: new Date(lead.ultima_interacao_enova).getTime(), order: 4, label: "Última interação Enova", detail: formatDateTime(lead.ultima_interacao_enova) });
  }
  if (lead.ultima_interacao_cliente) {
    events.push({ ts: new Date(lead.ultima_interacao_cliente).getTime(), order: 5, label: "Última interação cliente", detail: formatDateTime(lead.ultima_interacao_cliente) });
  }
  // Incidente: sem timestamp confiável disponível na view (opened_at não é exposto)
  // Não incluir na timeline para evitar ordem temporal falsa.

  events.sort((a, b) => a.ts - b.ts || a.order - b.order);
  return events;
}

/* ===========================================
   PROFILE HELPERS — campo operacional único
   =========================================== */

// Labels discretos de origem do campo operacional
function sourceLabel(source: ProfileSource | null | undefined): string {
  switch (source) {
    case "admin": return "atualizado por admin";
    case "admin_inicial": return "origem: cadastro manual";
    case "funil": return "confirmado pelo cliente";
    case "manual": return "origem: cadastro manual";
    default: return "";
  }
}

function sourceBadgeClass(source: ProfileSource | null | undefined): string {
  switch (source) {
    case "funil": return styles.prefillStatusConfirmed;
    case "admin":
    case "admin_inicial":
    case "manual": return styles.prefillStatusPending;
    default: return styles.prefillStatusEmpty;
  }
}

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

// Module-level helpers for form value parsing (used in handleSaveProfile)
function profileTextOrNull(v: string) { return v.trim() ? v.trim() : null; }
function profileNumOrNull(v: string) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function profileBoolOrNull(v: string): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export function AtendimentoUI() {
  const router = useRouter();
  const [leads, setLeads] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFase, setActiveFase] = useState<FaseGrupo | "TODOS">("TODOS");
  const [selectedLead, setSelectedLead] = useState<AttendanceRow | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    busca: "",
    fase: "",
    baseAtual: "",
    donoPendencia: "",
    statusAtencao: "",
    incidente: "todos",
    travamento: "todos",
  });

  // Profile state — loaded on demand when detail opens
  const [clientProfile, setClientProfile] = useState<ClientProfileRow | null>(null);
  const [profileEdit, setProfileEdit] = useState<ProfileEditState | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // History block toggle state
  const [historyOpen, setHistoryOpen] = useState(false);

  const refreshLeads = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAttendanceLeadsAction();
      if (!data.ok) {
        throw new Error(data.error ?? "Erro ao carregar leads de atendimento");
      }
      setLeads((data.leads ?? []) as unknown as AttendanceRow[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Nao foi possivel carregar os leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLeads();
  }, [refreshLeads]);

  const faseCounts = useMemo(() => {
    const counts: Record<FaseGrupo | "TODOS", number> = {
      TODOS: 0,
      ENTRADA: 0,
      QUALIFICACAO: 0,
      COLETA: 0,
      AGUARDANDO: 0,
      TRAVADO: 0,
    };
    leads.forEach((lead) => {
      counts.TODOS++;
      const grupo = deriveFaseGrupo(lead.fase_atendimento, lead.fase_travamento);
      if (grupo && counts[grupo] !== undefined) {
        counts[grupo]++;
      }
    });
    return counts;
  }, [leads]);

  const faseLeads = useMemo(() => {
    if (activeFase === "TODOS") return leads;
    return leads.filter((lead) => deriveFaseGrupo(lead.fase_atendimento, lead.fase_travamento) === activeFase);
  }, [leads, activeFase]);

  const filterOptions = useMemo(() => {
    return {
      fases: Array.from(new Set(faseLeads.map((l) => l.fase_atendimento).filter(Boolean) as string[])),
      bases: Array.from(new Set(faseLeads.map((l) => l.base_atual).filter(Boolean) as string[])),
      donos: Array.from(new Set(faseLeads.map((l) => l.dono_pendencia).filter(Boolean) as string[])),
      atencoes: Array.from(new Set(faseLeads.map((l) => l.status_atencao).filter(Boolean) as string[])),
    };
  }, [faseLeads]);

  const filteredLeads = useMemo(() => {
    const q = filters.busca.trim().toLowerCase();
    return faseLeads.filter((lead) => {
      if (q) {
        const nameMatch = lead.nome?.toLowerCase().includes(q) ?? false;
        const phoneMatch = (lead.telefone ?? lead.wa_id).toLowerCase().includes(q);
        const waIdMatch = lead.wa_id.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !waIdMatch) return false;
      }
      if (filters.fase && (lead.fase_atendimento ?? "") !== filters.fase) return false;
      if (filters.baseAtual && (lead.base_atual ?? "") !== filters.baseAtual) return false;
      if (filters.donoPendencia && (lead.dono_pendencia ?? "") !== filters.donoPendencia) return false;
      if (filters.statusAtencao && (lead.status_atencao ?? "") !== filters.statusAtencao) return false;
      if (filters.incidente === "com_incidente" && !lead.tem_incidente_aberto) return false;
      if (filters.incidente === "sem_incidente" && lead.tem_incidente_aberto) return false;
      if (filters.travamento === "travados" && !lead.fase_travamento) return false;
      if (filters.travamento === "nao_travados" && lead.fase_travamento) return false;
      return true;
    });
  }, [faseLeads, filters]);

  const clearFilters = useCallback(() => {
    setFilters({
      busca: "",
      fase: "",
      baseAtual: "",
      donoPendencia: "",
      statusAtencao: "",
      incidente: "todos",
      travamento: "todos",
    });
  }, []);

  const hasActiveFilters =
    filters.busca ||
    filters.fase ||
    filters.baseAtual ||
    filters.donoPendencia ||
    filters.statusAtencao ||
    filters.incidente !== "todos" ||
    filters.travamento !== "todos";

  const openDetail = useCallback((lead: AttendanceRow) => {
    setSelectedLead(lead);
    setClientProfile(null);
    setProfileEdit(null);
    setProfileFeedback(null);
    setProfileError(null);
    setHistoryOpen(false);
    // Load client profile async — non-blocking
    void fetchClientProfileAction(lead.wa_id).then((result) => {
      if (result.ok) {
        const row = result.profile ?? null;
        setClientProfile(row);
        setProfileEdit(profileToEditState(row));
      }
    });
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedLead(null);
    setClientProfile(null);
    setProfileEdit(null);
    setProfileBusy(false);
    setProfileFeedback(null);
    setProfileError(null);
  }, []);

  // ESC to close detail panel
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDetail();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDetail]);

  const handleSaveProfile = useCallback(async () => {
    if (!selectedLead || !profileEdit) return;
    setProfileBusy(true);
    setProfileFeedback(null);
    setProfileError(null);

    const payload = {
      wa_id: selectedLead.wa_id,
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
  }, [selectedLead, profileEdit]);

  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.headerTitle}>Atendimento</h1>
            <p className={styles.headerSubtitle}>
              Operacao pre-envio de documentos — acompanhamento do funil antes do CRM
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={loading}
              onClick={() => void refreshLeads()}
            >
              <span className={styles.buttonIcon}>↻</span>
              Atualizar
            </button>
          </div>
        </header>

        {loadError && (
          <div className={styles.filtersSection}>
            <div className={styles.resultsInfo} style={{ color: "#fca5a5" }}>
              {loadError}
            </div>
          </div>
        )}

        <div className={styles.statsBar}>
          <div className={styles.statsGroup}>
            {(["TODOS", "ENTRADA", "QUALIFICACAO", "COLETA", "AGUARDANDO", "TRAVADO"] as const).map((fase, idx) => (
              <div key={fase} style={{ display: "flex", alignItems: "center" }}>
                {idx > 0 && <div className={styles.statDivider} />}
                <div
                  className={`${styles.statItem} ${activeFase === fase ? styles.statItemActive : ""}`}
                  onClick={() => setActiveFase(fase)}
                  onKeyDown={(event) => onStatKeyDown(event, () => setActiveFase(fase))}
                  role="button"
                  tabIndex={0}
                >
                  <span className={styles.statLabel}>
                    {fase === "TODOS" ? "Todos" : FASE_GRUPO_LABELS[fase] ?? fase}
                  </span>
                  <span className={styles.statValue}>{faseCounts[fase]}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.statsSummary}>
            <span className={styles.statsSummaryText}>Total: {leads.length} leads</span>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.tabsSection}>
            <div className={styles.tabsContainer}>
              {(["TODOS", "ENTRADA", "QUALIFICACAO", "COLETA", "AGUARDANDO", "TRAVADO"] as const).map((fase) => (
                <button
                  type="button"
                  key={fase}
                  className={`${styles.tab} ${activeFase === fase ? styles.tabActive : ""}`}
                  onClick={() => setActiveFase(fase)}
                >
                  <span className={styles.tabLabel}>
                    {fase === "TODOS" ? "Todos" : FASE_GRUPO_LABELS[fase] ?? fase}
                  </span>
                  <span className={styles.tabCount}>{faseCounts[fase]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filtersSection}>
            <div className={styles.filtersRow}>
              <input
                className={styles.input}
                style={{ flex: "1 1 auto", minWidth: 200 }}
                value={filters.busca}
                onChange={(e) => setFilters({ ...filters, busca: e.target.value })}
                placeholder="Buscar por nome, telefone ou wa_id"
              />

              <select
                className={styles.filterSelect}
                value={filters.baseAtual}
                onChange={(e) => setFilters({ ...filters, baseAtual: e.target.value })}
              >
                <option value="">Todas as bases</option>
                {filterOptions.bases.map((base) => (
                  <option key={base} value={base}>{getBaseLabel(base)}</option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.donoPendencia}
                onChange={(e) => setFilters({ ...filters, donoPendencia: e.target.value })}
              >
                <option value="">Dono da pendencia</option>
                {filterOptions.donos.map((dono) => (
                  <option key={dono} value={dono}>{dono}</option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.statusAtencao}
                onChange={(e) => setFilters({ ...filters, statusAtencao: e.target.value })}
              >
                <option value="">Status de atencao</option>
                {filterOptions.atencoes.map((atencao) => (
                  <option key={atencao} value={atencao}>
                    {STATUS_ATENCAO_LABELS[atencao] ?? atencao}
                  </option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.incidente}
                onChange={(e) => setFilters({ ...filters, incidente: e.target.value as FilterState["incidente"] })}
              >
                <option value="todos">Incidentes</option>
                <option value="com_incidente">Com incidente</option>
                <option value="sem_incidente">Sem incidente</option>
              </select>

              <select
                className={styles.filterSelect}
                value={filters.travamento}
                onChange={(e) => setFilters({ ...filters, travamento: e.target.value as FilterState["travamento"] })}
              >
                <option value="todos">Travamento</option>
                <option value="travados">Travados</option>
                <option value="nao_travados">Nao travados</option>
              </select>

              {hasActiveFilters && (
                <button type="button" className={styles.clearFilters} onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>
            <div className={styles.resultsInfo}>
              {filteredLeads.length} de {faseLeads.length} leads
            </div>
          </div>

          <div className={styles.tableHeader}>
            <span>Lead</span>
            <span>Fase</span>
            <span>Travamento</span>
            <span>Pendencia</span>
            <span>Atencao</span>
            <span>Base</span>
            <span>Prazo</span>
          </div>

          <div className={styles.leadsTable}>
            {loading ? (
              <div className={styles.loadingState}>
                <div className={styles.loadingSpinner} />
                <span className={styles.loadingText}>Carregando leads...</span>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>○</div>
                <h3 className={styles.emptyTitle}>Nenhum lead encontrado</h3>
                <p className={styles.emptySubtitle}>
                  {hasActiveFilters
                    ? "Tente ajustar os filtros de busca"
                    : "Nao ha leads nesta fase de atendimento"}
                </p>
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <div
                  key={lead.wa_id}
                  className={`${styles.leadRow} ${selectedLead?.wa_id === lead.wa_id ? styles.leadRowSelected : ""}`}
                  onClick={() => openDetail(lead)}
                >
                  <div className={styles.colNome}>
                    <span className={styles.leadName}>{leadLabel(lead)}</span>
                    <span className={styles.leadPhone}>{lead.telefone ?? lead.wa_id}</span>
                  </div>

                  <div className={styles.colFase}>
                    <span className={`${styles.faseBadge} ${getFaseBadgeClass(deriveFaseGrupo(lead.fase_atendimento, lead.fase_travamento))}`}>
                      {lead.fase_atendimento ?? lead.fase_funil ?? "—"}
                    </span>
                    {lead.fase_travamento && (
                      <span className={styles.faseTravada}>
                        Travou: {lead.fase_travamento}
                      </span>
                    )}
                  </div>

                  <div className={styles.colTravamento}>
                    {lead.motivo_travamento ? (
                      <span className={styles.travamentoMotivo}>{lead.motivo_travamento}</span>
                    ) : (
                      <span className={styles.travamentoNone}>—</span>
                    )}
                  </div>

                  <div className={styles.colPendencia}>
                    <span className={styles.pendenciaDono}>{lead.dono_pendencia ?? "—"}</span>
                    <span className={styles.pendenciaAcao}>{lead.proxima_acao ?? "—"}</span>
                  </div>

                  <div className={styles.colAtencao}>
                    <span className={`${styles.atencaoBadge} ${getAtencaoClass(lead.status_atencao)}`}>
                      <span className={styles.atencaoDot} />
                      {STATUS_ATENCAO_LABELS[lead.status_atencao ?? ""] ?? lead.status_atencao ?? "—"}
                    </span>
                  </div>

                  <div className={styles.colBase}>
                    <span className={`${styles.baseBadge} ${getBaseBadgeClass(lead.base_atual)}`}>
                      {getBaseLabel(lead.base_atual)}
                    </span>
                  </div>

                  <div className={styles.colPrazo}>
                    <span
                      className={`${styles.prazoText} ${
                        isPrazoVencido(lead.prazo_proxima_acao)
                          ? styles.prazoVencido
                          : isPrazoProximo(lead.prazo_proxima_acao)
                          ? styles.prazoProximo
                          : ""
                      }`}
                    >
                      {formatDateTime(lead.prazo_proxima_acao)}
                    </span>
                    {lead.tem_incidente_aberto && (
                      <button
                        type="button"
                        aria-label={`Ver incidentes deste lead na aba Incidentes${lead.severidade_incidente ? ` — severidade ${lead.severidade_incidente}` : ""}`}
                        className={`${styles.incidenteBadge} ${getIncidenteBadgeClass(lead.severidade_incidente)}`}
                        title={`Incidente aberto${lead.tipo_incidente ? ` — ${lead.tipo_incidente}` : ""}${lead.severidade_incidente ? ` (${lead.severidade_incidente})` : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/incidentes?wa_id=${encodeURIComponent(lead.wa_id)}`);
                        }}
                      >
                        ⚠ {lead.severidade_incidente ?? "Incidente"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedLead && (
          <div className={styles.overlay} onClick={closeDetail}>
            <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>{leadLabel(selectedLead)}</h2>
                <button type="button" className={styles.closeButton} onClick={closeDetail}>
                  ✕
                </button>
              </div>
              <div className={styles.detailContent}>
                {/* Identificacao */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Identificacao</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Nome</span>
                      <span className={styles.detailValue}>{selectedLead.nome ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Telefone</span>
                      <span className={styles.detailValue}>{selectedLead.telefone ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>WA ID</span>
                      <span className={styles.detailValue}>{selectedLead.wa_id}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Base Origem</span>
                      <span className={styles.detailValue}>{getBaseLabel(selectedLead.base_origem)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Base Atual</span>
                      <span className={styles.detailValueHighlight}>{getBaseLabel(selectedLead.base_atual)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Movido Base em</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.movido_base_em)}</span>
                    </div>
                  </div>
                </div>

                {/* Perfil do Cliente — campo operacional único */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Perfil do Cliente</h3>
                  {profileEdit !== null ? (
                    <>
                      <div className={styles.detailGrid} style={{ marginTop: "8px" }}>
                        {/* nome */}
                        <div className={styles.prefillFieldRow}>
                          <div className={styles.prefillFieldHeader}>
                            <span className={styles.detailLabel}>Nome</span>
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
                            <span className={styles.detailLabel}>Nacionalidade</span>
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
                            <span className={styles.detailLabel}>Estado Civil</span>
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
                            <span className={styles.detailLabel}>Regime de Trabalho</span>
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
                            <span className={styles.detailLabel}>Renda (R$)</span>
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
                            <span className={styles.detailLabel}>CTPS 36 meses</span>
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
                            <span className={styles.detailLabel}>Dependentes</span>
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
                            <span className={styles.detailLabel}>Valor Entrada (R$)</span>
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
                            <span className={styles.detailLabel}>Restrição</span>
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
                            <span className={styles.detailLabel}>Origem do Lead</span>
                          </div>
                          <input
                            type="text"
                            className={styles.prefillInput}
                            value={profileEdit.origem_lead}
                            onChange={(e) => setProfileEdit({ ...profileEdit, origem_lead: e.target.value })}
                            placeholder="Ex: lyx, campanha-x"
                          />
                        </div>
                        {/* observacoes_admin */}
                        <div className={styles.detailItemFull}>
                          <div className={styles.prefillFieldHeader}>
                            <span className={styles.detailLabel}>Observações Admin</span>
                          </div>
                          <textarea
                            className={styles.prefillTextarea}
                            value={profileEdit.observacoes_admin}
                            onChange={(e) => setProfileEdit({ ...profileEdit, observacoes_admin: e.target.value })}
                            placeholder="Observações internas (não visível ao cliente)"
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" }}>
                        <button
                          type="button"
                          className={styles.prefillSaveButton}
                          onClick={() => void handleSaveProfile()}
                          disabled={profileBusy}
                        >
                          {profileBusy ? "Salvando..." : "Salvar perfil"}
                        </button>
                        {profileFeedback && <span className={styles.prefillFeedback}>{profileFeedback}</span>}
                        {profileError && <span className={styles.prefillError}>{profileError}</span>}
                      </div>
                    </>
                  ) : (
                    <p className={styles.prefillDisclaimer} style={{ marginTop: 8 }}>
                      Carregando perfil do cliente...
                    </p>
                  )}
                </div>

                {/* Status Operacional */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Status Operacional</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Fase Atual</span>
                      <span className={styles.detailValueHighlight}>
                        {selectedLead.fase_atendimento ?? selectedLead.fase_funil ?? "—"}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Status Atencao</span>
                      <span className={
                        selectedLead.status_atencao === "OVERDUE"
                          ? styles.detailValueDanger
                          : selectedLead.status_atencao === "DUE_SOON"
                          ? styles.detailValueWarning
                          : styles.detailValue
                      }>
                        {STATUS_ATENCAO_LABELS[selectedLead.status_atencao ?? ""] ?? selectedLead.status_atencao ?? "—"}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Fase Funil</span>
                      <span className={styles.detailValue}>{selectedLead.fase_funil ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Status Funil</span>
                      <span className={styles.detailValue}>{selectedLead.status_funil ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Fase Travada</span>
                      <span className={selectedLead.fase_travamento ? styles.detailValueDanger : styles.detailValue}>
                        {selectedLead.fase_travamento ?? "—"}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Travou em</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.travou_em)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Cod. Motivo Travamento</span>
                      <span className={styles.detailValue}>{selectedLead.codigo_motivo_travamento ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Movido Fase em</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.movido_fase_em)}</span>
                    </div>
                    <div className={styles.detailItemFull}>
                      <span className={styles.detailLabel}>Motivo do Travamento</span>
                      <span className={selectedLead.motivo_travamento ? styles.detailValueDanger : styles.detailValue}>
                        {selectedLead.motivo_travamento ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pendencia e Proxima Acao */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Pendencia e Proxima Acao</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Dono da Pendencia</span>
                      <span className={styles.detailValueHighlight}>{selectedLead.dono_pendencia ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Prazo Proxima Acao</span>
                      <span className={
                        isPrazoVencido(selectedLead.prazo_proxima_acao)
                          ? styles.detailValueDanger
                          : isPrazoProximo(selectedLead.prazo_proxima_acao)
                          ? styles.detailValueWarning
                          : styles.detailValue
                      }>
                        {formatDateTime(selectedLead.prazo_proxima_acao)}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Cod. Pendencia Principal</span>
                      <span className={styles.detailValue}>{selectedLead.codigo_pendencia_principal ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Cod. Proxima Acao</span>
                      <span className={styles.detailValue}>{selectedLead.codigo_proxima_acao ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Gatilho Proxima Acao</span>
                      <span className={styles.detailValue}>{selectedLead.gatilho_proxima_acao ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Acao Executavel</span>
                      <span className={styles.detailValue}>
                        {selectedLead.proxima_acao_executavel === null ? "—" : selectedLead.proxima_acao_executavel ? "Sim" : "Nao"}
                      </span>
                    </div>
                    <div className={styles.detailItemFull}>
                      <span className={styles.detailLabel}>Pendencia Principal</span>
                      <span className={styles.detailValue}>{selectedLead.pendencia_principal ?? "—"}</span>
                    </div>
                    <div className={styles.detailItemFull}>
                      <span className={styles.detailLabel}>Proxima Acao</span>
                      <span className={styles.detailValueHighlight}>{selectedLead.proxima_acao ?? "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Registros do Lead</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Lead ID</span>
                      <span className={styles.detailValue}>{selectedLead.lead_id ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>WA ID</span>
                      <span className={styles.detailValue}>{selectedLead.wa_id}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Criado em</span>
                      <span className={styles.detailValue}>{formatDate(selectedLead.criado_em)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Atualizado em</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.atualizado_em)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Base atual desde</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.movido_base_em)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Última mudança de fase</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.movido_fase_em)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Última interação cliente</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.ultima_interacao_cliente)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Última interação Enova</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedLead.ultima_interacao_enova)}</span>
                    </div>
                    {selectedLead.ultima_msg_recebida_raw && (
                      <div className={styles.detailItemFull}>
                        <span className={styles.detailLabel}>Última msg recebida (raw)</span>
                        <span className={styles.detailValue}>{selectedLead.ultima_msg_recebida_raw}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Historico do Lead */}
                <div className={styles.detailBlock}>
                  <button
                    type="button"
                    className={styles.historyToggle}
                    onClick={() => setHistoryOpen((prev) => !prev)}
                    aria-expanded={historyOpen}
                  >
                    <span className={styles.historyToggleLabel}>Histórico do Lead</span>
                    <span className={`${styles.historyToggleChevron} ${historyOpen ? styles.historyToggleChevronOpen : ""}`}>›</span>
                  </button>
                  {historyOpen && (() => {
                    const events = buildLeadHistory(selectedLead);
                    return events.length === 0 ? (
                      <p className={styles.historyEmpty}>Sem eventos registrados.</p>
                    ) : (
                      <ol className={styles.historyTimeline}>
                        {events.map((ev) => (
                          <li key={`${ev.ts}-${ev.order}`} className={styles.historyEvent}>
                            <span className={styles.historyDot} />
                            <span className={styles.historyEventLabel}>{ev.label}</span>
                            <span className={styles.historyEventDetail}>{ev.detail}</span>
                          </li>
                        ))}
                      </ol>
                    );
                  })()}
                </div>

                {/* Incidente */}
                {selectedLead.tem_incidente_aberto && (
                  <div className={styles.detailBlock}>
                    <h3 className={styles.detailBlockTitle}>Incidente Aberto</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Tipo</span>
                        <span className={styles.detailValueDanger}>{selectedLead.tipo_incidente ?? "—"}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Severidade</span>
                        <span className={styles.detailValueWarning}>{selectedLead.severidade_incidente ?? "—"}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={`/incidentes?wa_id=${encodeURIComponent(selectedLead.wa_id)}`}
                        aria-label={`Ver todos os incidentes deste lead na aba Incidentes`}
                        className={styles.incidenteLink}
                      >
                        Ver na aba Incidentes →
                      </a>
                    </div>
                  </div>
                )}

                {/* Arquivamento */}
                {selectedLead.arquivado_em && (
                  <div className={styles.detailBlock}>
                    <h3 className={styles.detailBlockTitle}>Arquivamento</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Arquivado em</span>
                        <span className={styles.detailValue}>{formatDateTime(selectedLead.arquivado_em)}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Cod. Motivo Arquivo</span>
                        <span className={styles.detailValue}>{selectedLead.codigo_motivo_arquivo ?? "—"}</span>
                      </div>
                      {selectedLead.nota_arquivo && (
                        <div className={styles.detailItemFull}>
                          <span className={styles.detailLabel}>Nota de Arquivo</span>
                          <span className={styles.detailValue}>{selectedLead.nota_arquivo}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
