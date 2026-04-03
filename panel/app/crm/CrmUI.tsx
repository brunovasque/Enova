"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./crm.module.css";
import { fetchCrmLeadsAction, postCrmActionAction } from "./actions";
import { AprovadoFichaView } from "./AprovadoFichaView";
import type { FichaLeadRow } from "./AprovadoFichaView";

/* ===========================================
   TIPOS - baseados em crm_leads_v1
   =========================================== */

type FaseFunil = "PASTA" | "ANALISE" | "APROVADO" | "REPROVADO" | "VISITA";

type CrmLeadRow = {
  wa_id: string;
  nome: string | null;
  telefone: string | null;
  origem: string | null;
  lead_pool: string | null;
  lead_temp: string | null;
  // enova_state funnel fields (read-only, source of truth for phase classification)
  // fase_funil can be any funnel stage string (envio_docs, aguardando_retorno_correspondente, etc.)
  fase_funil: string | null;
  status_funil: string | null;
  status_docs_funil: string | null;
  aprovado_funil: boolean | null;
  reprovado_funil: boolean | null;
  visita_confirmada_funil: boolean | null;
  // crm_lead_meta analysis fields
  status_analise: string | null;
  codigo_motivo_analise: string | null;
  motivo_analise: string | null;
  data_envio_analise: string | null;
  data_retorno_analise: string | null;
  parceiro_analise: string | null;
  nota_ajuste_analise: string | null;
  resumo_retorno_analise: string | null;
  motivo_retorno_analise: string | null;
  valor_financiamento_aprovado: number | null;
  valor_subsidio_aprovado: number | null;
  valor_entrada_informada: number | null;
  valor_parcela_informada: number | null;
  correspondente_retorno: string | null;
  retorno_bruto_correspondente: string | null;
  tipo_perfil_analise: string | null;
  nome_titular_analise: string | null;
  nome_parceiro_analise_snapshot: string | null;
  estado_civil_analise: string | null;
  tipo_composicao_analise: string | null;
  renda_total_analise: number | null;
  renda_titular_analise: number | null;
  renda_parceiro_analise: number | null;
  renda_familiar_analise: number | null;
  regime_trabalho_titular_analise: string | null;
  regime_trabalho_parceiro_analise: string | null;
  regime_trabalho_familiar_analise: string | null;
  possui_fgts_analise: boolean | null;
  possui_entrada_analise: boolean | null;
  valor_entrada_analise: number | null;
  possui_restricao_analise: boolean | null;
  possui_restricao_parceiro_analise: boolean | null;
  possui_ir_titular_analise: boolean | null;
  possui_ir_parceiro_analise: boolean | null;
  ctps_36_titular_analise: boolean | null;
  ctps_36_parceiro_analise: boolean | null;
  quantidade_dependentes_analise: number | null;
  ticket_desejado_analise: number | null;
  objetivo_imovel_analise: string | null;
  resumo_perfil_analise: string | null;
  snapshot_bruto_analise: string | null;
  score_perfil_analise: number | null;
  faixa_perfil_analise: string | null;
  label_score_trabalho: string | null;
  motivo_score_trabalho: string | null;
  faixa_aprovacao: string | null;
  aderencia_aprovacao: string | null;
  proximo_passo_aprovado: string | null;
  ultimo_contato_aprovado: string | null;
  codigo_motivo_reprovacao: string | null;
  motivo_reprovacao: string | null;
  status_recuperacao: string | null;
  estrategia_recuperacao: string | null;
  nota_recuperacao: string | null;
  proxima_tentativa: string | null;
  ultimo_contato_recuperacao: string | null;
  status_visita: string | null;
  contexto_visita: string | null;
  data_visita: string | null;
  data_confirmacao_visita: string | null;
  resultado_visita: string | null;
  codigo_objecao_visita: string | null;
  proximo_passo_visita: string | null;
  responsavel_visita: string | null;
  observacao_visita: string | null;
  proxima_acao_reserva: string | null;
  atualizado_em: string | null;
  // Incidente aberto — lido de enova_attendance_meta via crm_leads_v1
  tem_incidente_aberto: boolean | null;
  tipo_incidente: string | null;
  severidade_incidente: string | null;
};

type ApiCrmPayload = {
  ok: boolean;
  leads: CrmLeadRow[];
  total: number;
  error?: string;
};

type ApiActionPayload = {
  ok: boolean;
  error?: string;
};

type FilterState = {
  busca: string;
  origem: string;
  base: string;
  statusAnalise: string;
  statusVisita: string;
  faixaPerfil: string;
  recuperacao: string;
  retornoCorrespondente: "todos" | "com_retorno" | "sem_retorno";
};

const FASE_LABELS: Record<FaseFunil, string> = {
  PASTA: "Pasta incompleta",
  ANALISE: "Análise",
  APROVADO: "Aprovados",
  REPROVADO: "Reprovados",
  VISITA: "Visita",
};

const STATUS_ANALISE_OPTIONS = [
  "DOCS_PENDING",
  "DOCS_READY",
  "SENT",
  "UNDER_ANALYSIS",
  "ADJUSTMENT_REQUIRED",
  "APPROVED_HIGH",
  "APPROVED_LOW",
  "REJECTED_RECOVERABLE",
  "REJECTED_HARD",
];

const STATUS_VISITA_OPTIONS = [
  "TO_SCHEDULE",
  "SCHEDULED",
  "CONFIRMED",
  "DONE",
  "NO_SHOW",
  "CANCELED",
];

const FAIXA_PERFIL_OPTIONS = [
  "A",
  "B",
  "C",
  "D",
  "E",
];

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return "—";
  }
}

function leadLabel(lead: CrmLeadRow): string {
  return lead.nome ?? lead.telefone ?? lead.wa_id;
}

function onStatKeyDown(event: React.KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate();
  }
}

// ── Classificação CRM: deriva aba operacional a partir do estado real do lead ──
// Regra de prioridade:
//   1. CRM-terminal (estado explícito definido pelo operador CRM) → máxima prioridade
//   2. Estado real do funil (enova_state.fase_conversa, aprovado_funil, etc.) → fonte de verdade
//   3. States CRM in-progress (DOCS_READY, SENT, etc.)
//   4. Pasta (envio_docs ou DOCS_PENDING)
//   5. null → excluído (lead anterior a envio_docs, sem status CRM)
// Stages posteriores a envio_docs (funil real):
// aguardando_retorno_correspondente = waiting for correspondent's return → Análise
// agendamento_visita / visita_confirmada / finalizacao_processo = visit stages → Visita
// envio_docs = client entered docs flow but has not completed yet → Pasta
const FASE_FUNIL_ANALISE = ["aguardando_retorno_correspondente"];
const FASE_FUNIL_VISITA = ["agendamento_visita", "visita_confirmada", "finalizacao_processo"];
const FASE_FUNIL_PASTA = ["envio_docs"];
function getEtapaCrm(lead: CrmLeadRow): FaseFunil | null {
  const analise = lead.status_analise ?? "";

  // ── P1: CRM-terminal states (operator has explicitly set) ──
  if (lead.status_visita) return "VISITA";
  if (["APPROVED_HIGH", "APPROVED_LOW"].includes(analise)) return "APROVADO";
  if (["REJECTED_RECOVERABLE", "REJECTED_HARD"].includes(analise)) return "REPROVADO";

  // ── P2: Real funnel state (enova_state) ──
  const fase = lead.fase_funil ?? "";
  if (lead.aprovado_funil === true || lead.status_funil === "aprovado_correspondente") return "APROVADO";
  if (lead.reprovado_funil === true || lead.status_funil === "reprovado_correspondente") return "REPROVADO";
  if (FASE_FUNIL_VISITA.includes(fase) || lead.visita_confirmada_funil === true) return "VISITA";
  if (FASE_FUNIL_ANALISE.includes(fase)) return "ANALISE";

  // ── P3: CRM in-progress analysis states ──
  if (["DOCS_READY", "SENT", "UNDER_ANALYSIS", "ADJUSTMENT_REQUIRED"].includes(analise)) return "ANALISE";

  // ── P4: Pasta states (incomplete docs) ──
  if (analise === "DOCS_PENDING" || FASE_FUNIL_PASTA.includes(fase)) return "PASTA";

  // ── Excluded: no CRM status and before envio_docs ──
  return null;
}

export function CrmUI() {
  const [activeFase, setActiveFase] = useState<FaseFunil>("PASTA");
  const [leads, setLeads] = useState<CrmLeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedLead, setSelectedLead] = useState<CrmLeadRow | null>(null);
  const [fichaAprovado, setFichaAprovado] = useState<CrmLeadRow | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    busca: "",
    origem: "",
    base: "",
    statusAnalise: "",
    statusVisita: "",
    faixaPerfil: "",
    recuperacao: "",
    retornoCorrespondente: "todos",
  });

  const fetchLeads = useCallback(async (): Promise<CrmLeadRow[]> => {
    const data = (await fetchCrmLeadsAction()) as ApiCrmPayload;
    if (!data.ok) {
      throw new Error(data.error ?? "Erro ao carregar leads do CRM");
    }
    return data.leads ?? [];
  }, []);

  const refreshLeads = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchLeads();
      setLeads(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [fetchLeads]);

  useEffect(() => {
    void refreshLeads();
  }, [refreshLeads]);

  const callAction = useCallback(async (payload: Record<string, unknown>): Promise<ApiActionPayload | null> => {
    try {
      const data = (await postCrmActionAction(payload as Parameters<typeof postCrmActionAction>[0])) as ApiActionPayload;
      if (!data.ok) {
        setActionError(data.error ?? "Ação falhou");
        setFeedback(null);
        return null;
      }
      return data;
    } catch {
      setActionError("Erro ao executar ação");
      setFeedback(null);
      return null;
    }
  }, []);

  const runAndRefresh = useCallback(
    async (runner: () => Promise<ApiActionPayload | null>, successMessage: string) => {
      setActionBusy(true);
      setActionError(null);
      const result = await runner();
      if (result) {
        setFeedback(successMessage);
        await refreshLeads();
      }
      setActionBusy(false);
      return result;
    },
    [refreshLeads],
  );

  const faseCounts = useMemo(() => {
    const counts: Record<FaseFunil, number> = { PASTA: 0, ANALISE: 0, APROVADO: 0, REPROVADO: 0, VISITA: 0 };
    leads.forEach((lead) => {
      const fase = getEtapaCrm(lead);
      if (fase !== null) counts[fase]++;
    });
    return counts;
  }, [leads]);

  const faseLeads = useMemo(() => {
    return leads.filter((lead) => getEtapaCrm(lead) === activeFase);
  }, [leads, activeFase]);

  const filterOptions = useMemo(() => {
    return {
      origens: Array.from(new Set(faseLeads.map((l) => l.origem).filter(Boolean) as string[])),
      bases: Array.from(new Set(faseLeads.map((l) => l.lead_pool).filter(Boolean) as string[])),
      statusAnalise: Array.from(new Set(faseLeads.map((l) => l.status_analise).filter(Boolean) as string[])),
      statusVisita: Array.from(new Set(faseLeads.map((l) => l.status_visita).filter(Boolean) as string[])),
      faixaPerfil: Array.from(new Set(faseLeads.map((l) => l.faixa_perfil_analise).filter(Boolean) as string[])),
    };
  }, [faseLeads]);

  const filteredLeads = useMemo(() => {
    const q = filters.busca.trim().toLowerCase();
    return faseLeads.filter((lead) => {
      if (q) {
        const nameMatch = lead.nome?.toLowerCase().includes(q) ?? false;
        const phoneMatch = (lead.telefone ?? lead.wa_id).toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch) return false;
      }
      if (filters.origem && (lead.origem ?? "") !== filters.origem) return false;
      if (filters.base && (lead.lead_pool ?? "") !== filters.base) return false;
      if (filters.statusAnalise && (lead.status_analise ?? "") !== filters.statusAnalise) return false;
      if (filters.statusVisita && (lead.status_visita ?? "") !== filters.statusVisita) return false;
      if (filters.faixaPerfil && (lead.faixa_perfil_analise ?? "") !== filters.faixaPerfil) return false;
      if (filters.recuperacao === "com_recuperacao" && !lead.status_recuperacao) return false;
      if (filters.recuperacao === "sem_recuperacao" && lead.status_recuperacao) return false;
      if (filters.retornoCorrespondente === "com_retorno" && !lead.resumo_retorno_analise) return false;
      if (filters.retornoCorrespondente === "sem_retorno" && lead.resumo_retorno_analise) return false;
      return true;
    });
  }, [faseLeads, filters]);

  const clearFilters = () => {
    setFilters({
      busca: "",
      origem: "",
      base: "",
      statusAnalise: "",
      statusVisita: "",
      faixaPerfil: "",
      recuperacao: "",
      retornoCorrespondente: "todos",
    });
  };

  const hasActiveFilters =
    filters.busca ||
    filters.origem ||
    filters.base ||
    filters.statusAnalise ||
    filters.statusVisita ||
    filters.faixaPerfil ||
    filters.recuperacao ||
    filters.retornoCorrespondente !== "todos";

  const openDetail = (lead: CrmLeadRow) => {
    setSelectedLead(lead);
  };

  const closeDetail = () => {
    setSelectedLead(null);
  };

  const openModal = (modalName: string) => {
    setActiveModal(modalName);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  const getBaseLabel = (pool: string | null): string => {
    if (!pool) return "—";
    switch (pool) {
      case "COLD_POOL": return "Fria";
      case "WARM_POOL": return "Morna";
      case "HOT_POOL": return "Quente";
      default: return pool;
    }
  };

  const getStatusAnaliseLabel = (status: string | null): string => {
    if (!status) return "—";
    const labels: Record<string, string> = {
      DOCS_PENDING: "Docs pendente",
      DOCS_READY: "Docs prontos",
      SENT: "Enviado",
      UNDER_ANALYSIS: "Em análise",
      ADJUSTMENT_REQUIRED: "Ajuste solicitado",
      APPROVED_HIGH: "Aprovado (alto)",
      APPROVED_LOW: "Aprovado (baixo)",
      REJECTED_RECOVERABLE: "Reprovado (recuperável)",
      REJECTED_HARD: "Reprovado (hard)",
    };
    return labels[status] ?? status;
  };

  const getStatusVisitaLabel = (status: string | null): string => {
    if (!status) return "—";
    const labels: Record<string, string> = {
      TO_SCHEDULE: "A agendar",
      SCHEDULED: "Agendada",
      CONFIRMED: "Confirmada",
      DONE: "Realizada",
      NO_SHOW: "Não compareceu",
      CANCELED: "Cancelada",
    };
    return labels[status] ?? status;
  };

  const getFaixaPerfilBadgeClass = (faixa: string | null): string => {
    if (!faixa) return "";
    switch (faixa.toUpperCase()) {
      case "A": return styles.faixaA;
      case "B": return styles.faixaB;
      case "C": return styles.faixaC;
      case "D": return styles.faixaD;
      case "E": return styles.faixaE;
      default: return "";
    }
  };

  /* ── If a ficha is open, render the full-page detail view ── */
  if (fichaAprovado) {
    return (
      <AprovadoFichaView
        lead={fichaAprovado as FichaLeadRow}
        onBack={() => setFichaAprovado(null)}
      />
    );
  }

  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.headerTitle}>CRM Operacional</h1>
            <p className={styles.headerSubtitle}>
              Controle de análise, retorno, aprovação, reprovação e visita
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => void refreshLeads()}
              disabled={loading || actionBusy}
            >
              <span className={styles.buttonIcon}>↻</span>
              Atualizar
            </button>
          </div>
        </header>

        <div className={styles.statsBar}>
          <div className={styles.statsGroup}>
            {(["PASTA", "ANALISE", "APROVADO", "REPROVADO", "VISITA"] as const).map((fase, idx) => (
              <div key={fase} style={{ display: "flex", alignItems: "center" }}>
                {idx > 0 && <div className={styles.statDivider} />}
                <div
                  className={`${styles.statItem} ${activeFase === fase ? styles.statItemActive : ""}`}
                  onClick={() => setActiveFase(fase)}
                  onKeyDown={(event) => onStatKeyDown(event, () => setActiveFase(fase))}
                  role="button"
                  tabIndex={0}
                >
                  <span className={styles.statLabel}>{FASE_LABELS[fase]}</span>
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
          {(feedback || actionError) && (
            <div className={styles.filtersSection}>
              <div className={styles.resultsInfo} style={{ color: feedback ? "#7dd3d3" : "#fca5a5" }}>
                {feedback ?? actionError}
              </div>
            </div>
          )}

          <div className={styles.tabsSection}>
            <div className={styles.tabsContainer}>
              {(["PASTA", "ANALISE", "APROVADO", "REPROVADO", "VISITA"] as const).map((fase) => (
                <button
                  type="button"
                  key={fase}
                  className={`${styles.tab} ${activeFase === fase ? styles.tabActive : ""}`}
                  onClick={() => setActiveFase(fase)}
                >
                  <span className={styles.tabLabel}>{FASE_LABELS[fase]}</span>
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
                placeholder="Buscar por nome ou telefone"
              />

              <select
                className={styles.filterSelect}
                value={filters.origem}
                onChange={(e) => setFilters({ ...filters, origem: e.target.value })}
              >
                <option value="">Todas as origens</option>
                {filterOptions.origens.map((origem) => (
                  <option key={origem} value={origem}>{origem}</option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.base}
                onChange={(e) => setFilters({ ...filters, base: e.target.value })}
              >
                <option value="">Todas as bases</option>
                {filterOptions.bases.map((base) => (
                  <option key={base} value={base}>{getBaseLabel(base)}</option>
                ))}
              </select>

              {(activeFase === "PASTA" || activeFase === "ANALISE" || activeFase === "APROVADO" || activeFase === "REPROVADO") && (
                <select
                  className={styles.filterSelect}
                  value={filters.statusAnalise}
                  onChange={(e) => setFilters({ ...filters, statusAnalise: e.target.value })}
                >
                  <option value="">Status da análise</option>
                  {filterOptions.statusAnalise.map((st) => (
                    <option key={st} value={st}>{getStatusAnaliseLabel(st)}</option>
                  ))}
                </select>
              )}

              {activeFase === "VISITA" && (
                <select
                  className={styles.filterSelect}
                  value={filters.statusVisita}
                  onChange={(e) => setFilters({ ...filters, statusVisita: e.target.value })}
                >
                  <option value="">Status da visita</option>
                  {filterOptions.statusVisita.map((st) => (
                    <option key={st} value={st}>{getStatusVisitaLabel(st)}</option>
                  ))}
                </select>
              )}

              <select
                className={styles.filterSelect}
                value={filters.faixaPerfil}
                onChange={(e) => setFilters({ ...filters, faixaPerfil: e.target.value })}
              >
                <option value="">Faixa de perfil</option>
                {filterOptions.faixaPerfil.map((faixa) => (
                  <option key={faixa} value={faixa}>Faixa {faixa}</option>
                ))}
              </select>

              <div className={styles.statusFilters}>
                <button
                  type="button"
                  className={`${styles.statusFilterBtn} ${filters.retornoCorrespondente === "todos" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, retornoCorrespondente: "todos" })}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`${styles.statusFilterBtn} ${filters.retornoCorrespondente === "com_retorno" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, retornoCorrespondente: "com_retorno" })}
                >
                  Com retorno
                </button>
                <button
                  type="button"
                  className={`${styles.statusFilterBtn} ${filters.retornoCorrespondente === "sem_retorno" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, retornoCorrespondente: "sem_retorno" })}
                >
                  Sem retorno
                </button>
              </div>

              {hasActiveFilters && (
                <button type="button" className={styles.clearFilters} onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>

            <div className={styles.resultsInfo}>
              {filteredLeads.length} de {faseCounts[activeFase]} leads
              {hasActiveFilters && " (filtrado)"}
            </div>
          </div>

          <div className={styles.tableHeader}>
            <div className={styles.colNome}>Lead</div>
            <div className={styles.colOrigem}>Origem / Base</div>
            <div className={styles.colObservacao}>Retorno / Score</div>
            <div className={styles.colBase}>Fase</div>
            <div className={styles.colStatus}>Status</div>
            <div className={styles.colEntrada}>Faixa</div>
            <div className={styles.colAcoes}>Ações</div>
          </div>

          <div className={styles.leadsTable}>
            {loading ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>Carregando leads...</p>
              </div>
            ) : loadError ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>Erro ao carregar leads</p>
                <p className={styles.emptySubtitle}>{loadError}</p>
                <button type="button" className={styles.secondaryButton} onClick={() => void refreshLeads()}>
                  Tentar novamente
                </button>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>○</div>
                <p className={styles.emptyTitle}>Nenhum lead encontrado</p>
                <p className={styles.emptySubtitle}>
                  {hasActiveFilters ? "Tente ajustar os filtros" : "Não há leads nesta fase do funil"}
                </p>
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const etapa = getEtapaCrm(lead);
                const faseBadgeClass =
                  etapa === "APROVADO"
                    ? styles.faseBadgeAprovado
                    : etapa === "REPROVADO"
                      ? styles.faseBadgeReprovado
                      : etapa === "VISITA"
                        ? styles.faseBadgeVisita
                        : styles.faseBadgeAnalise;

                return (
                  <div
                    key={lead.wa_id}
                    className={styles.leadRow}
                    onClick={() => openDetail(lead)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={styles.colNome}>
                      <span className={styles.leadName}>{lead.nome ?? lead.wa_id}</span>
                      <span className={styles.leadPhone}>{lead.telefone ?? lead.wa_id}</span>
                    </div>

                    <div className={styles.colOrigem}>
                      <span className={styles.leadOrigin}>{lead.origem ?? "—"}</span>
                      <span className={styles.leadPhone}>{getBaseLabel(lead.lead_pool)}</span>
                    </div>

                    <div className={styles.colObservacao}>
                      <span className={styles.leadObs}>
                        {lead.resumo_retorno_analise ?? lead.label_score_trabalho ?? "—"}
                      </span>
                    </div>

                    <div className={styles.colBase}>
                      <span className={`${styles.baseBadge} ${faseBadgeClass}`}>
                        {etapa ? FASE_LABELS[etapa] : "—"}
                      </span>
                    </div>

                    <div className={styles.colStatus}>
                      {etapa === "VISITA" ? (
                        <span className={lead.status_visita === "DONE" ? styles.statusActive : styles.statusPaused}>
                          <span className={styles.statusDot} />
                          {getStatusVisitaLabel(lead.status_visita)}
                        </span>
                      ) : (
                        <span className={["APPROVED_HIGH", "APPROVED_LOW"].includes(lead.status_analise ?? "") ? styles.statusActive : ["REJECTED_RECOVERABLE", "REJECTED_HARD"].includes(lead.status_analise ?? "") ? styles.statusPaused : styles.statusActive}>
                          <span className={styles.statusDot} />
                          {getStatusAnaliseLabel(lead.status_analise)}
                        </span>
                      )}
                    </div>

                    <div className={styles.colEntrada}>
                      {lead.faixa_perfil_analise ? (
                        <span className={`${styles.entradaBadge} ${getFaixaPerfilBadgeClass(lead.faixa_perfil_analise)}`}>
                          Faixa {lead.faixa_perfil_analise}
                        </span>
                      ) : (
                        <span className={styles.entradaBadge}>—</span>
                      )}
                    </div>

                    <div className={styles.colAcoes} onClick={(e) => e.stopPropagation()}>
                      {lead.tem_incidente_aberto && (
                        <a
                          href={`/incidentes?wa_id=${encodeURIComponent(lead.wa_id)}`}
                          aria-label={`Ver incidentes deste lead na aba Incidentes${lead.severidade_incidente ? ` — severidade ${lead.severidade_incidente}` : ""}`}
                          className={styles.incidenteBadge}
                          title={`Incidente aberto${lead.tipo_incidente ? ` — ${lead.tipo_incidente}` : ""}${lead.severidade_incidente ? ` (${lead.severidade_incidente})` : ""}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          ⚠ {lead.severidade_incidente ?? "Incidente"}
                        </a>
                      )}
                      {etapa === "APROVADO" && (
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnResume}`}
                          onClick={() => setFichaAprovado(lead)}
                        >
                          Ver ficha
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => openDetail(lead)}
                      >
                        Detalhe
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Painel lateral de detalhe */}
      {selectedLead && (
        <div className={styles.overlay} onClick={closeDetail}>
          <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{leadLabel(selectedLead)}</h2>
              <button type="button" className={styles.closeButton} onClick={closeDetail}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className={styles.detailContent}>
              {/* Bloco: Identificação */}
              <div className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>Identificação</h3>
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
                    <span className={styles.detailLabel}>Origem</span>
                    <span className={styles.detailValue}>{selectedLead.origem ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Base</span>
                    <span className={styles.detailValue}>{getBaseLabel(selectedLead.lead_pool)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Temperatura</span>
                    <span className={styles.detailValue}>{selectedLead.lead_temp ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Fase do funil</span>
                    <span className={styles.detailValue}>{(() => { const e = getEtapaCrm(selectedLead); return e ? FASE_LABELS[e] : "—"; })()}</span>
                  </div>
                </div>
              </div>

              {/* Bloco: Análise */}
              <div className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>Análise</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Status da análise</span>
                    <span className={styles.detailValue}>{getStatusAnaliseLabel(selectedLead.status_analise)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Código motivo</span>
                    <span className={styles.detailValue}>{selectedLead.codigo_motivo_analise ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Motivo</span>
                    <span className={styles.detailValue}>{selectedLead.motivo_analise ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Data envio</span>
                    <span className={styles.detailValue}>{formatDate(selectedLead.data_envio_analise)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Data retorno</span>
                    <span className={styles.detailValue}>{formatDate(selectedLead.data_retorno_analise)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Parceiro</span>
                    <span className={styles.detailValue}>{selectedLead.parceiro_analise ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Nota ajuste</span>
                    <span className={styles.detailValue}>{selectedLead.nota_ajuste_analise ?? "—"}</span>
                  </div>
                </div>
              </div>

              {/* Bloco: Retorno do correspondente */}
              <div className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>Retorno do correspondente</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItemFull}>
                    <span className={styles.detailLabel}>Resumo do retorno</span>
                    <span className={styles.detailValue}>{selectedLead.resumo_retorno_analise ?? "—"}</span>
                  </div>
                  <div className={styles.detailItemFull}>
                    <span className={styles.detailLabel}>Motivo do retorno</span>
                    <span className={styles.detailValue}>{selectedLead.motivo_retorno_analise ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Valor financiamento</span>
                    <span className={styles.detailValueHighlight}>{formatCurrency(selectedLead.valor_financiamento_aprovado)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Valor subsídio</span>
                    <span className={styles.detailValueHighlight}>{formatCurrency(selectedLead.valor_subsidio_aprovado)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Valor entrada</span>
                    <span className={styles.detailValue}>{formatCurrency(selectedLead.valor_entrada_informada)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Valor parcela</span>
                    <span className={styles.detailValue}>{formatCurrency(selectedLead.valor_parcela_informada)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Correspondente</span>
                    <span className={styles.detailValue}>{selectedLead.correspondente_retorno ?? "—"}</span>
                  </div>
                </div>
              </div>

              {/* Bloco: Score operacional */}
              <div className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>Score operacional</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Score perfil</span>
                    <span className={styles.detailValue}>{selectedLead.score_perfil_analise ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Faixa perfil</span>
                    <span className={`${styles.detailValue} ${getFaixaPerfilBadgeClass(selectedLead.faixa_perfil_analise)}`}>
                      {selectedLead.faixa_perfil_analise ? `Faixa ${selectedLead.faixa_perfil_analise}` : "—"}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Label score trabalho</span>
                    <span className={styles.detailValue}>{selectedLead.label_score_trabalho ?? "—"}</span>
                  </div>
                  <div className={styles.detailItemFull}>
                    <span className={styles.detailLabel}>Motivo score trabalho</span>
                    <span className={styles.detailValue}>{selectedLead.motivo_score_trabalho ?? "—"}</span>
                  </div>
                </div>
              </div>

              {/* Bloco: Aprovado / Reprovado / Recuperação */}
              <div className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>Aprovação / Reprovação</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Faixa aprovação</span>
                    <span className={styles.detailValue}>{selectedLead.faixa_aprovacao ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Aderência</span>
                    <span className={styles.detailValue}>{selectedLead.aderencia_aprovacao ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Próximo passo aprovado</span>
                    <span className={styles.detailValue}>{selectedLead.proximo_passo_aprovado ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Último contato aprovado</span>
                    <span className={styles.detailValue}>{formatDate(selectedLead.ultimo_contato_aprovado)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Código motivo reprovação</span>
                    <span className={styles.detailValue}>{selectedLead.codigo_motivo_reprovacao ?? "—"}</span>
                  </div>
                  <div className={styles.detailItemFull}>
                    <span className={styles.detailLabel}>Motivo reprovação</span>
                    <span className={styles.detailValue}>{selectedLead.motivo_reprovacao ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Status recuperação</span>
                    <span className={styles.detailValue}>{selectedLead.status_recuperacao ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Estratégia recuperação</span>
                    <span className={styles.detailValue}>{selectedLead.estrategia_recuperacao ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Nota recuperação</span>
                    <span className={styles.detailValue}>{selectedLead.nota_recuperacao ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Próxima tentativa</span>
                    <span className={styles.detailValue}>{formatDate(selectedLead.proxima_tentativa)}</span>
                  </div>
                </div>
              </div>

              {/* Bloco: Visita */}
              <div className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>Visita</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Status visita</span>
                    <span className={styles.detailValue}>{getStatusVisitaLabel(selectedLead.status_visita)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Contexto</span>
                    <span className={styles.detailValue}>{selectedLead.contexto_visita ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Data visita</span>
                    <span className={styles.detailValue}>{formatDate(selectedLead.data_visita)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Confirmação</span>
                    <span className={styles.detailValue}>{formatDate(selectedLead.data_confirmacao_visita)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Resultado</span>
                    <span className={styles.detailValue}>{selectedLead.resultado_visita ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Código objeção</span>
                    <span className={styles.detailValue}>{selectedLead.codigo_objecao_visita ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Próximo passo</span>
                    <span className={styles.detailValue}>{selectedLead.proximo_passo_visita ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Responsável</span>
                    <span className={styles.detailValue}>{selectedLead.responsavel_visita ?? "—"}</span>
                  </div>
                  <div className={styles.detailItemFull}>
                    <span className={styles.detailLabel}>Observação</span>
                    <span className={styles.detailValue}>{selectedLead.observacao_visita ?? "—"}</span>
                  </div>
                </div>
              </div>

              {/* Bloco: Próxima ação */}
              <div className={styles.detailBlock}>
                <h3 className={styles.detailBlockTitle}>Próxima ação</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItemFull}>
                    <span className={styles.detailLabel}>Próxima ação reserva</span>
                    <span className={styles.detailValue}>{selectedLead.proxima_acao_reserva ?? "—"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Atualizado em</span>
                    <span className={styles.detailValue}>{formatDate(selectedLead.atualizado_em)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações rápidas */}
            <div className={styles.detailFooter}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => openModal("analise")}
                disabled={actionBusy}
              >
                Atualizar análise
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnResume}`}
                onClick={() => openModal("aprovar")}
                disabled={actionBusy}
              >
                Marcar aprovado
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnPause}`}
                onClick={() => openModal("reprovar")}
                disabled={actionBusy}
              >
                Marcar reprovado
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => openModal("visita")}
                disabled={actionBusy}
              >
                Atualizar visita
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => openModal("score")}
                disabled={actionBusy}
              >
                Atualizar score
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Atualizar análise */}
      {activeModal === "analise" && selectedLead && (
        <ModalAtualizarAnalise
          lead={selectedLead}
          onClose={closeModal}
          callAction={callAction}
          runAndRefresh={runAndRefresh}
          setSelectedLead={setSelectedLead}
        />
      )}

      {/* Modal: Marcar aprovado */}
      {activeModal === "aprovar" && selectedLead && (
        <ModalMarcarAprovado
          lead={selectedLead}
          onClose={closeModal}
          callAction={callAction}
          runAndRefresh={runAndRefresh}
          setSelectedLead={setSelectedLead}
        />
      )}

      {/* Modal: Marcar reprovado */}
      {activeModal === "reprovar" && selectedLead && (
        <ModalMarcarReprovado
          lead={selectedLead}
          onClose={closeModal}
          callAction={callAction}
          runAndRefresh={runAndRefresh}
          setSelectedLead={setSelectedLead}
        />
      )}

      {/* Modal: Atualizar visita */}
      {activeModal === "visita" && selectedLead && (
        <ModalAtualizarVisita
          lead={selectedLead}
          onClose={closeModal}
          callAction={callAction}
          runAndRefresh={runAndRefresh}
          setSelectedLead={setSelectedLead}
        />
      )}

      {/* Modal: Atualizar score */}
      {activeModal === "score" && selectedLead && (
        <ModalAtualizarScore
          lead={selectedLead}
          onClose={closeModal}
          callAction={callAction}
          runAndRefresh={runAndRefresh}
          setSelectedLead={setSelectedLead}
        />
      )}
    </main>
  );
}

/* ===========================================
   MODAIS
   =========================================== */

interface ModalProps {
  lead: CrmLeadRow;
  onClose: () => void;
  callAction: (payload: Record<string, unknown>) => Promise<ApiActionPayload | null>;
  runAndRefresh: (runner: () => Promise<ApiActionPayload | null>, msg: string) => Promise<ApiActionPayload | null>;
  setSelectedLead: (lead: CrmLeadRow | null) => void;
}

function ModalAtualizarAnalise({ lead, onClose, callAction, runAndRefresh }: ModalProps) {
  const [form, setForm] = useState({
    status_analise: lead.status_analise ?? "",
    codigo_motivo_analise: lead.codigo_motivo_analise ?? "",
    motivo_analise: lead.motivo_analise ?? "",
    nota_ajuste_analise: lead.nota_ajuste_analise ?? "",
    parceiro_analise: lead.parceiro_analise ?? "",
    resumo_retorno_analise: lead.resumo_retorno_analise ?? "",
    motivo_retorno_analise: lead.motivo_retorno_analise ?? "",
    valor_financiamento_aprovado: lead.valor_financiamento_aprovado?.toString() ?? "",
    valor_subsidio_aprovado: lead.valor_subsidio_aprovado?.toString() ?? "",
    valor_entrada_informada: lead.valor_entrada_informada?.toString() ?? "",
    valor_parcela_informada: lead.valor_parcela_informada?.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await runAndRefresh(
      () => callAction({
        action: "atualizar_analise",
        wa_id: lead.wa_id,
        ...form,
        valor_financiamento_aprovado: form.valor_financiamento_aprovado ? Number(form.valor_financiamento_aprovado) : null,
        valor_subsidio_aprovado: form.valor_subsidio_aprovado ? Number(form.valor_subsidio_aprovado) : null,
        valor_entrada_informada: form.valor_entrada_informada ? Number(form.valor_entrada_informada) : null,
        valor_parcela_informada: form.valor_parcela_informada ? Number(form.valor_parcela_informada) : null,
      }),
      `Análise de ${leadLabel(lead)} atualizada.`
    );
    setBusy(false);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Atualizar análise</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Status da análise</label>
              <select className={styles.select} value={form.status_analise} onChange={(e) => setForm({ ...form, status_analise: e.target.value })}>
                <option value="">Selecionar</option>
                {STATUS_ANALISE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Código motivo</label>
              <input className={styles.input} value={form.codigo_motivo_analise} onChange={(e) => setForm({ ...form, codigo_motivo_analise: e.target.value })} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Motivo</label>
            <textarea className={styles.textarea} value={form.motivo_analise} onChange={(e) => setForm({ ...form, motivo_analise: e.target.value })} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nota de ajuste</label>
              <input className={styles.input} value={form.nota_ajuste_analise} onChange={(e) => setForm({ ...form, nota_ajuste_analise: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Correspondente</label>
              <input className={styles.input} value={form.parceiro_analise} onChange={(e) => setForm({ ...form, parceiro_analise: e.target.value })} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Resumo do retorno</label>
            <textarea className={styles.textarea} value={form.resumo_retorno_analise} onChange={(e) => setForm({ ...form, resumo_retorno_analise: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Motivo do retorno</label>
            <textarea className={styles.textarea} value={form.motivo_retorno_analise} onChange={(e) => setForm({ ...form, motivo_retorno_analise: e.target.value })} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valor financiamento</label>
              <input className={styles.input} type="number" value={form.valor_financiamento_aprovado} onChange={(e) => setForm({ ...form, valor_financiamento_aprovado: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valor subsídio</label>
              <input className={styles.input} type="number" value={form.valor_subsidio_aprovado} onChange={(e) => setForm({ ...form, valor_subsidio_aprovado: e.target.value })} />
            </div>
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valor entrada</label>
              <input className={styles.input} type="number" value={form.valor_entrada_informada} onChange={(e) => setForm({ ...form, valor_entrada_informada: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valor parcela</label>
              <input className={styles.input} type="number" value={form.valor_parcela_informada} onChange={(e) => setForm({ ...form, valor_parcela_informada: e.target.value })} />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalMarcarAprovado({ lead, onClose, callAction, runAndRefresh }: ModalProps) {
  const [form, setForm] = useState({
    faixa_aprovacao: lead.faixa_aprovacao ?? "",
    aderencia_aprovacao: lead.aderencia_aprovacao ?? "",
    proximo_passo_aprovado: lead.proximo_passo_aprovado ?? "",
    resumo_retorno_analise: lead.resumo_retorno_analise ?? "",
    valor_financiamento_aprovado: lead.valor_financiamento_aprovado?.toString() ?? "",
    valor_subsidio_aprovado: lead.valor_subsidio_aprovado?.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await runAndRefresh(
      () => callAction({
        action: "marcar_aprovado",
        wa_id: lead.wa_id,
        ...form,
        valor_financiamento_aprovado: form.valor_financiamento_aprovado ? Number(form.valor_financiamento_aprovado) : null,
        valor_subsidio_aprovado: form.valor_subsidio_aprovado ? Number(form.valor_subsidio_aprovado) : null,
      }),
      `Lead ${leadLabel(lead)} marcado como aprovado.`
    );
    setBusy(false);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Marcar aprovado</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Faixa aprovação</label>
              <select className={styles.select} value={form.faixa_aprovacao} onChange={(e) => setForm({ ...form, faixa_aprovacao: e.target.value })}>
                <option value="">Selecionar</option>
                {FAIXA_PERFIL_OPTIONS.map((opt) => <option key={opt} value={opt}>Faixa {opt}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Aderência</label>
              <input className={styles.input} value={form.aderencia_aprovacao} onChange={(e) => setForm({ ...form, aderencia_aprovacao: e.target.value })} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Próximo passo</label>
            <input className={styles.input} value={form.proximo_passo_aprovado} onChange={(e) => setForm({ ...form, proximo_passo_aprovado: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Resumo do retorno</label>
            <textarea className={styles.textarea} value={form.resumo_retorno_analise} onChange={(e) => setForm({ ...form, resumo_retorno_analise: e.target.value })} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valor financiamento</label>
              <input className={styles.input} type="number" value={form.valor_financiamento_aprovado} onChange={(e) => setForm({ ...form, valor_financiamento_aprovado: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Valor subsídio</label>
              <input className={styles.input} type="number" value={form.valor_subsidio_aprovado} onChange={(e) => setForm({ ...form, valor_subsidio_aprovado: e.target.value })} />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Salvando..." : "Marcar aprovado"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalMarcarReprovado({ lead, onClose, callAction, runAndRefresh }: ModalProps) {
  const [form, setForm] = useState({
    codigo_motivo_reprovacao: lead.codigo_motivo_reprovacao ?? "",
    motivo_reprovacao: lead.motivo_reprovacao ?? "",
    status_recuperacao: lead.status_recuperacao ?? "",
    estrategia_recuperacao: lead.estrategia_recuperacao ?? "",
    nota_recuperacao: lead.nota_recuperacao ?? "",
    proxima_tentativa: lead.proxima_tentativa ?? "",
  });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await runAndRefresh(
      () => callAction({
        action: "marcar_reprovado",
        wa_id: lead.wa_id,
        ...form,
      }),
      `Lead ${leadLabel(lead)} marcado como reprovado.`
    );
    setBusy(false);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Marcar reprovado</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Código motivo</label>
              <input className={styles.input} value={form.codigo_motivo_reprovacao} onChange={(e) => setForm({ ...form, codigo_motivo_reprovacao: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Status recuperação</label>
              <input className={styles.input} value={form.status_recuperacao} onChange={(e) => setForm({ ...form, status_recuperacao: e.target.value })} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Motivo reprovação</label>
            <textarea className={styles.textarea} value={form.motivo_reprovacao} onChange={(e) => setForm({ ...form, motivo_reprovacao: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Estratégia recuperação</label>
            <textarea className={styles.textarea} value={form.estrategia_recuperacao} onChange={(e) => setForm({ ...form, estrategia_recuperacao: e.target.value })} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Nota recuperação</label>
              <input className={styles.input} value={form.nota_recuperacao} onChange={(e) => setForm({ ...form, nota_recuperacao: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Próxima tentativa</label>
              <input className={styles.input} type="date" value={form.proxima_tentativa} onChange={(e) => setForm({ ...form, proxima_tentativa: e.target.value })} />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Salvando..." : "Marcar reprovado"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalAtualizarVisita({ lead, onClose, callAction, runAndRefresh }: ModalProps) {
  const [form, setForm] = useState({
    status_visita: lead.status_visita ?? "",
    contexto_visita: lead.contexto_visita ?? "",
    data_visita: lead.data_visita ?? "",
    resultado_visita: lead.resultado_visita ?? "",
    proximo_passo_visita: lead.proximo_passo_visita ?? "",
    responsavel_visita: lead.responsavel_visita ?? "",
    observacao_visita: lead.observacao_visita ?? "",
  });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await runAndRefresh(
      () => callAction({
        action: "atualizar_visita",
        wa_id: lead.wa_id,
        ...form,
      }),
      `Visita de ${leadLabel(lead)} atualizada.`
    );
    setBusy(false);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Atualizar visita</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Status da visita</label>
              <select className={styles.select} value={form.status_visita} onChange={(e) => setForm({ ...form, status_visita: e.target.value })}>
                <option value="">Selecionar</option>
                {STATUS_VISITA_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Data da visita</label>
              <input className={styles.input} type="date" value={form.data_visita} onChange={(e) => setForm({ ...form, data_visita: e.target.value })} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Contexto</label>
            <input className={styles.input} value={form.contexto_visita} onChange={(e) => setForm({ ...form, contexto_visita: e.target.value })} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Resultado</label>
              <input className={styles.input} value={form.resultado_visita} onChange={(e) => setForm({ ...form, resultado_visita: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Responsável</label>
              <input className={styles.input} value={form.responsavel_visita} onChange={(e) => setForm({ ...form, responsavel_visita: e.target.value })} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Próximo passo</label>
            <input className={styles.input} value={form.proximo_passo_visita} onChange={(e) => setForm({ ...form, proximo_passo_visita: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Observação</label>
            <textarea className={styles.textarea} value={form.observacao_visita} onChange={(e) => setForm({ ...form, observacao_visita: e.target.value })} />
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalAtualizarScore({ lead, onClose, callAction, runAndRefresh }: ModalProps) {
  const [form, setForm] = useState({
    score_perfil_analise: lead.score_perfil_analise?.toString() ?? "",
    faixa_perfil_analise: lead.faixa_perfil_analise ?? "",
    label_score_trabalho: lead.label_score_trabalho ?? "",
    motivo_score_trabalho: lead.motivo_score_trabalho ?? "",
  });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await runAndRefresh(
      () => callAction({
        action: "atualizar_score",
        wa_id: lead.wa_id,
        ...form,
        score_perfil_analise: form.score_perfil_analise ? Number(form.score_perfil_analise) : null,
      }),
      `Score de ${leadLabel(lead)} atualizado.`
    );
    setBusy(false);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Atualizar score</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Score perfil</label>
              <input className={styles.input} type="number" value={form.score_perfil_analise} onChange={(e) => setForm({ ...form, score_perfil_analise: e.target.value })} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Faixa perfil</label>
              <select className={styles.select} value={form.faixa_perfil_analise} onChange={(e) => setForm({ ...form, faixa_perfil_analise: e.target.value })}>
                <option value="">Selecionar</option>
                {FAIXA_PERFIL_OPTIONS.map((opt) => <option key={opt} value={opt}>Faixa {opt}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Label score trabalho</label>
            <input className={styles.input} value={form.label_score_trabalho} onChange={(e) => setForm({ ...form, label_score_trabalho: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Motivo score trabalho</label>
            <textarea className={styles.textarea} value={form.motivo_score_trabalho} onChange={(e) => setForm({ ...form, motivo_score_trabalho: e.target.value })} />
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
