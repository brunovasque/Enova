"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./incidentes.module.css";
import { fetchIncidentsAction } from "./actions";

/* ===========================================
   TIPOS - baseados em enova_incidents_v1
   =========================================== */

type StatusIncidente = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
type SeveridadeIncidente = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type IncidentRow = {
  id_incidente: string;
  wa_id: string;
  tipo_incidente: string | null;
  severidade: SeveridadeIncidente | string | null;
  status_incidente: StatusIncidente | string | null;
  fase_no_erro: string | null;
  base_no_erro: string | null;
  erro_resumo: string | null;
  erro_bruto: string | null;
  gatilho_suspeito: string | null;
  request_id: string | null;
  trace_id: string | null;
  ambiente_worker: string | null;
  ultima_msg_cliente: string | null;
  ultima_acao_enova: string | null;
  requer_revisao_humana: boolean | null;
  resolvido_em: string | null;
  nota_resolucao: string | null;
  aberto_em: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
  nome: string | null;
  fase_funil_atual: string | null;
  status_funil: string | null;
};

type FilterState = {
  busca: string;
  statusIncidente: string;
  severidade: string;
  tipoIncidente: string;
  faseNoErro: string;
  revisaoHumana: "todos" | "requer" | "nao_requer";
};

type StatusTab = "TODOS" | StatusIncidente;

const STATUS_LABELS: Record<string, string> = {
  TODOS: "Todos",
  OPEN: "Aberto",
  ACKNOWLEDGED: "Em análise",
  RESOLVED: "Resolvido",
};

const SEVERIDADE_LABELS: Record<string, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Médio",
  LOW: "Baixo",
};

const TIPO_LABELS: Record<string, string> = {
  WORKER_EXCEPTION: "Worker Exception",
  MESSAGE_SEND_FAILURE: "Falha de Envio",
  PERSISTENCE_FAILURE: "Falha de Persistência",
  FUNNEL_LOOP_DETECTED: "Loop de Funil",
  STAGE_STALL_INTERNAL: "Trava Interna",
  PARSER_FAILURE: "Falha de Parser",
  INVALID_TRANSITION: "Transição Inválida",
  TIMEOUT: "Timeout",
  UNKNOWN_INTERNAL_ERROR: "Erro Interno",
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return "—";
  }
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

function incidentLabel(inc: IncidentRow): string {
  return inc.nome ?? inc.wa_id;
}

function getSeveridadeClass(sev: string | null): string {
  switch (sev) {
    case "CRITICAL": return styles.severidadeCritical;
    case "HIGH": return styles.severidadeHigh;
    case "MEDIUM": return styles.severidadeMedium;
    case "LOW": return styles.severidadeLow;
    default: return styles.severidadeLow;
  }
}

function getStatusClass(status: string | null): string {
  switch (status) {
    case "OPEN": return styles.statusOpen;
    case "ACKNOWLEDGED": return styles.statusAcknowledged;
    case "RESOLVED": return styles.statusResolved;
    default: return styles.statusOpen;
  }
}

function onStatKeyDown(event: React.KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate();
  }
}

export function IncidentesUI() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>("TODOS");
  const [selectedIncident, setSelectedIncident] = useState<IncidentRow | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    busca: "",
    statusIncidente: "",
    severidade: "",
    tipoIncidente: "",
    faseNoErro: "",
    revisaoHumana: "todos",
  });

  const refreshIncidents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchIncidentsAction();
      if (!data.ok) {
        throw new Error(data.error ?? "Erro ao carregar incidentes");
      }
      setIncidents((data.incidents ?? []) as unknown as IncidentRow[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os incidentes");
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshIncidents();
  }, [refreshIncidents]);

  const tabCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = {
      TODOS: incidents.length,
      OPEN: 0,
      ACKNOWLEDGED: 0,
      RESOLVED: 0,
    };
    incidents.forEach((inc) => {
      const s = inc.status_incidente as StatusIncidente | null;
      if (s && counts[s] !== undefined) {
        counts[s]++;
      }
    });
    return counts;
  }, [incidents]);

  const tabIncidents = useMemo(() => {
    if (activeTab === "TODOS") return incidents;
    return incidents.filter((inc) => inc.status_incidente === activeTab);
  }, [incidents, activeTab]);

  const filterOptions = useMemo(() => ({
    tipos: Array.from(new Set(tabIncidents.map((i) => i.tipo_incidente).filter(Boolean) as string[])),
    severidades: Array.from(new Set(tabIncidents.map((i) => i.severidade).filter(Boolean) as string[])),
    fases: Array.from(new Set(tabIncidents.map((i) => i.fase_no_erro).filter(Boolean) as string[])),
    statuses: Array.from(new Set(tabIncidents.map((i) => i.status_incidente).filter(Boolean) as string[])),
  }), [tabIncidents]);

  const filteredIncidents = useMemo(() => {
    const q = filters.busca.trim().toLowerCase();
    return tabIncidents.filter((inc) => {
      if (q) {
        const nameMatch = inc.nome?.toLowerCase().includes(q) ?? false;
        const waIdMatch = inc.wa_id.toLowerCase().includes(q);
        const idMatch = inc.id_incidente.toLowerCase().includes(q);
        if (!nameMatch && !waIdMatch && !idMatch) return false;
      }
      if (filters.statusIncidente && (inc.status_incidente ?? "") !== filters.statusIncidente) return false;
      if (filters.severidade && (inc.severidade ?? "") !== filters.severidade) return false;
      if (filters.tipoIncidente && (inc.tipo_incidente ?? "") !== filters.tipoIncidente) return false;
      if (filters.faseNoErro && (inc.fase_no_erro ?? "") !== filters.faseNoErro) return false;
      if (filters.revisaoHumana === "requer" && !inc.requer_revisao_humana) return false;
      if (filters.revisaoHumana === "nao_requer" && inc.requer_revisao_humana) return false;
      return true;
    });
  }, [tabIncidents, filters]);

  const clearFilters = useCallback(() => {
    setFilters({
      busca: "",
      statusIncidente: "",
      severidade: "",
      tipoIncidente: "",
      faseNoErro: "",
      revisaoHumana: "todos",
    });
  }, []);

  const hasActiveFilters =
    filters.busca ||
    filters.statusIncidente ||
    filters.severidade ||
    filters.tipoIncidente ||
    filters.faseNoErro ||
    filters.revisaoHumana !== "todos";

  const openDetail = useCallback((inc: IncidentRow) => {
    setSelectedIncident(inc);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedIncident(null);
  }, []);

  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.headerTitle}>Incidentes</h1>
            <p className={styles.headerSubtitle}>
              Telemetria operacional — falhas internas do sistema registradas pelo worker
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.buttonSecondary}
              disabled={loading}
              onClick={() => void refreshIncidents()}
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
            {(["TODOS", "OPEN", "ACKNOWLEDGED", "RESOLVED"] as const).map((tab, idx) => (
              <div key={tab} style={{ display: "flex", alignItems: "center" }}>
                {idx > 0 && <div className={styles.statDivider} />}
                <div
                  className={`${styles.statItem} ${activeTab === tab ? styles.statItemActive : ""}`}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={(event) => onStatKeyDown(event, () => setActiveTab(tab))}
                  role="button"
                  tabIndex={0}
                >
                  <span className={styles.statLabel}>{STATUS_LABELS[tab] ?? tab}</span>
                  <span className={styles.statValue}>{tabCounts[tab]}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.statsSummary}>
            <span className={styles.statsSummaryText}>Total: {incidents.length} incidentes</span>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.filtersSection}>
            <div className={styles.filtersRow}>
              <input
                className={styles.input}
                style={{ flex: "1 1 auto", minWidth: 200 }}
                value={filters.busca}
                onChange={(e) => setFilters({ ...filters, busca: e.target.value })}
                placeholder="Buscar por nome, wa_id ou id do incidente"
              />

              <select
                className={styles.filterSelect}
                value={filters.statusIncidente}
                onChange={(e) => setFilters({ ...filters, statusIncidente: e.target.value })}
              >
                <option value="">Status</option>
                {filterOptions.statuses.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.severidade}
                onChange={(e) => setFilters({ ...filters, severidade: e.target.value })}
              >
                <option value="">Severidade</option>
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
                  .filter((s) => filterOptions.severidades.includes(s))
                  .map((s) => (
                    <option key={s} value={s}>{SEVERIDADE_LABELS[s]}</option>
                  ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.tipoIncidente}
                onChange={(e) => setFilters({ ...filters, tipoIncidente: e.target.value })}
              >
                <option value="">Tipo</option>
                {filterOptions.tipos.map((t) => (
                  <option key={t} value={t}>{TIPO_LABELS[t] ?? t}</option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.faseNoErro}
                onChange={(e) => setFilters({ ...filters, faseNoErro: e.target.value })}
              >
                <option value="">Fase no erro</option>
                {filterOptions.fases.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.revisaoHumana}
                onChange={(e) => setFilters({ ...filters, revisaoHumana: e.target.value as FilterState["revisaoHumana"] })}
              >
                <option value="todos">Revisão humana</option>
                <option value="requer">Requer revisão</option>
                <option value="nao_requer">Sem revisão</option>
              </select>

              {hasActiveFilters && (
                <button type="button" className={styles.clearFilters} onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>
            <div className={styles.resultsInfo}>
              {filteredIncidents.length} de {tabIncidents.length} incidentes
            </div>
          </div>

          <div className={styles.tableHeader}>
            <span>Lead</span>
            <span>Tipo</span>
            <span>Severidade</span>
            <span>Status</span>
            <span>Fase / Base</span>
            <span>Erro Resumido</span>
            <span>Aberto em</span>
          </div>

          <div className={styles.leadsTable}>
            {loading ? (
              <div className={styles.loadingState}>
                <div className={styles.loadingSpinner} />
                <span className={styles.loadingText}>Carregando incidentes...</span>
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>○</div>
                <h3 className={styles.emptyTitle}>Nenhum incidente encontrado</h3>
                <p className={styles.emptySubtitle}>
                  {hasActiveFilters
                    ? "Tente ajustar os filtros de busca"
                    : "Não há incidentes registrados neste período"}
                </p>
              </div>
            ) : (
              filteredIncidents.map((inc) => (
                <div
                  key={inc.id_incidente}
                  className={`${styles.leadRow} ${selectedIncident?.id_incidente === inc.id_incidente ? styles.leadRowSelected : ""}`}
                  onClick={() => openDetail(inc)}
                >
                  <div className={styles.colNome}>
                    <span className={styles.leadName}>{incidentLabel(inc)}</span>
                    <span className={styles.leadPhone}>{inc.wa_id}</span>
                  </div>

                  <div className={styles.colTipo}>
                    <span className={styles.tipoText}>{TIPO_LABELS[inc.tipo_incidente ?? ""] ?? inc.tipo_incidente ?? "—"}</span>
                  </div>

                  <div className={styles.colSeveridade}>
                    <span className={`${styles.severidadeBadge} ${getSeveridadeClass(inc.severidade)}`}>
                      <span className={styles.severidadeDot} />
                      {SEVERIDADE_LABELS[inc.severidade ?? ""] ?? inc.severidade ?? "—"}
                    </span>
                  </div>

                  <div className={styles.colStatus}>
                    <span className={`${styles.statusBadge} ${getStatusClass(inc.status_incidente)}`}>
                      {STATUS_LABELS[inc.status_incidente ?? ""] ?? inc.status_incidente ?? "—"}
                    </span>
                  </div>

                  <div className={styles.colFaseBase}>
                    <span className={styles.faseFunil}>{inc.fase_no_erro ?? "—"}</span>
                    {inc.base_no_erro && (
                      <span className={styles.baseNoErro}>{inc.base_no_erro}</span>
                    )}
                  </div>

                  <div className={styles.colErro}>
                    {inc.erro_resumo ? (
                      <span className={styles.erroResumo}>{inc.erro_resumo}</span>
                    ) : (
                      <span className={styles.erroNone}>—</span>
                    )}
                  </div>

                  <div className={styles.colAberto}>
                    <span className={styles.abertoEm}>{formatDateTime(inc.aberto_em)}</span>
                    {inc.requer_revisao_humana && (
                      <span className={styles.revisaoBadge}>Revisão</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedIncident && (
          <>
            <div className={styles.overlay} onClick={closeDetail} />
            <div className={styles.detailPanel}>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>{incidentLabel(selectedIncident)}</h2>
                <button type="button" className={styles.closeButton} onClick={closeDetail}>
                  ✕
                </button>
              </div>
              <div className={styles.detailContent}>

                {/* Identificação */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Identificação</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Nome</span>
                      <span className={styles.detailValue}>{selectedIncident.nome ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>WA ID</span>
                      <span className={styles.detailValue}>{selectedIncident.wa_id}</span>
                    </div>
                    <div className={styles.detailItemFull}>
                      <span className={styles.detailLabel}>ID do Incidente</span>
                      <span className={styles.detailValueMono}>{selectedIncident.id_incidente}</span>
                    </div>
                  </div>
                </div>

                {/* Tipo / Severidade / Status */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Tipo / Severidade / Status</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Tipo</span>
                      <span className={styles.detailValue}>
                        {TIPO_LABELS[selectedIncident.tipo_incidente ?? ""] ?? selectedIncident.tipo_incidente ?? "—"}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Severidade</span>
                      <span className={
                        selectedIncident.severidade === "CRITICAL" ? styles.detailValueDanger :
                        selectedIncident.severidade === "HIGH" ? styles.detailValueWarning :
                        selectedIncident.severidade === "MEDIUM" ? styles.detailValueWarning :
                        styles.detailValue
                      }>
                        {SEVERIDADE_LABELS[selectedIncident.severidade ?? ""] ?? selectedIncident.severidade ?? "—"}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Status</span>
                      <span className={
                        selectedIncident.status_incidente === "OPEN" ? styles.detailValueDanger :
                        selectedIncident.status_incidente === "ACKNOWLEDGED" ? styles.detailValueWarning :
                        styles.detailValue
                      }>
                        {STATUS_LABELS[selectedIncident.status_incidente ?? ""] ?? selectedIncident.status_incidente ?? "—"}
                      </span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Requer Revisão Humana</span>
                      <span className={selectedIncident.requer_revisao_humana ? styles.detailValueWarning : styles.detailValue}>
                        {selectedIncident.requer_revisao_humana === null ? "—" : selectedIncident.requer_revisao_humana ? "Sim" : "Não"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contexto do Erro */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Contexto do Erro</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Fase no Erro</span>
                      <span className={styles.detailValue}>{selectedIncident.fase_no_erro ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Base no Erro</span>
                      <span className={styles.detailValue}>{selectedIncident.base_no_erro ?? "—"}</span>
                    </div>
                    {selectedIncident.gatilho_suspeito && (
                      <div className={styles.detailItemFull}>
                        <span className={styles.detailLabel}>Gatilho Suspeito</span>
                        <span className={styles.detailValueWarning}>{selectedIncident.gatilho_suspeito}</span>
                      </div>
                    )}
                    <div className={styles.detailItemFull}>
                      <span className={styles.detailLabel}>Erro Resumido</span>
                      <span className={styles.detailValueDanger}>{selectedIncident.erro_resumo ?? "—"}</span>
                    </div>
                    {selectedIncident.erro_bruto && (
                      <div className={styles.detailItemFull}>
                        <span className={styles.detailLabel}>Erro Bruto</span>
                        <span className={styles.detailValueMono}>{selectedIncident.erro_bruto}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Contexto do Lead */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Contexto do Lead</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Fase Funil Atual</span>
                      <span className={styles.detailValue}>{selectedIncident.fase_funil_atual ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Status Funil</span>
                      <span className={styles.detailValue}>{selectedIncident.status_funil ?? "—"}</span>
                    </div>
                    {selectedIncident.ultima_msg_cliente && (
                      <div className={styles.detailItemFull}>
                        <span className={styles.detailLabel}>Ultima Msg Cliente</span>
                        <span className={styles.detailValue}>{formatDateTime(selectedIncident.ultima_msg_cliente)}</span>
                      </div>
                    )}
                    {selectedIncident.ultima_acao_enova && (
                      <div className={styles.detailItemFull}>
                        <span className={styles.detailLabel}>Ultima Acao Enova</span>
                        <span className={styles.detailValue}>{formatDateTime(selectedIncident.ultima_acao_enova)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Rastreio */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Rastreio</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Ambiente Worker</span>
                      <span className={styles.detailValue}>{selectedIncident.ambiente_worker ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Request ID</span>
                      <span className={styles.detailValueMono}>{selectedIncident.request_id ?? "—"}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Trace ID</span>
                      <span className={styles.detailValueMono}>{selectedIncident.trace_id ?? "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Timestamps */}
                <div className={styles.detailBlock}>
                  <h3 className={styles.detailBlockTitle}>Timestamps</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Aberto em</span>
                      <span className={styles.detailValueHighlight}>{formatDateTime(selectedIncident.aberto_em)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Criado em</span>
                      <span className={styles.detailValue}>{formatDate(selectedIncident.criado_em)}</span>
                    </div>
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Atualizado em</span>
                      <span className={styles.detailValue}>{formatDateTime(selectedIncident.atualizado_em)}</span>
                    </div>
                    {selectedIncident.resolvido_em && (
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Resolvido em</span>
                        <span className={styles.detailValue}>{formatDateTime(selectedIncident.resolvido_em)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resolução */}
                {selectedIncident.nota_resolucao && (
                  <div className={styles.detailBlock}>
                    <h3 className={styles.detailBlockTitle}>Resolução</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailItemFull}>
                        <span className={styles.detailLabel}>Nota de Resolução</span>
                        <span className={styles.detailValue}>{selectedIncident.nota_resolucao}</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
