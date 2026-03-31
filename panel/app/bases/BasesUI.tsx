"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./bases.module.css";

type BaseType = "fria" | "morna" | "quente";
type LeadPool = "COLD_POOL" | "WARM_POOL" | "HOT_POOL";
type LeadTemp = "COLD" | "WARM" | "HOT";

type CrmLeadMetaRow = {
  wa_id: string;
  nome: string | null;
  telefone: string | null;
  lead_pool: LeadPool;
  lead_temp: LeadTemp;
  lead_source: string | null;
  tags: string[];
  obs_curta: string | null;
  import_ref: string | null;
  auto_outreach_enabled: boolean;
  is_paused: boolean;
  created_at: string | null;
  updated_at: string | null;
  ultima_acao: string | null;
  ultimo_contato_at: string | null;
  status_operacional: string | null;
};

type ApiLeadsPayload = {
  ok: boolean;
  leads: CrmLeadMetaRow[];
  total: number;
  error?: string;
};

type ApiActionPayload = {
  ok: boolean;
  error?: string;
  imported_count?: number;
  sent_count?: number;
  total?: number;
  selected_count?: number;
  leads?: CrmLeadMetaRow[];
};

type FilterState = {
  origem: string;
  tag: string;
  entrada: string;
  status: "todos" | "ativos" | "pausados";
};

const BASE_TO_POOL: Record<BaseType, LeadPool> = {
  fria: "COLD_POOL",
  morna: "WARM_POOL",
  quente: "HOT_POOL",
};

const POOL_TO_BASE: Record<LeadPool, BaseType> = {
  COLD_POOL: "fria",
  WARM_POOL: "morna",
  HOT_POOL: "quente",
};

function defaultTempForPool(pool: LeadPool): LeadTemp {
  if (pool === "WARM_POOL") return "WARM";
  if (pool === "HOT_POOL") return "HOT";
  return "COLD";
}

function leadLabel(lead: CrmLeadMetaRow): string {
  return lead.nome ?? lead.telefone ?? lead.wa_id;
}

function suggestCallNowMessage(leadPool: LeadPool, nome: string | null): string {
  const firstName = nome && nome.trim() ? nome.trim().split(/\s+/)[0] : null;
  const hi = firstName ? `Oi, ${firstName}!` : "Oi, tudo bem?";

  switch (leadPool) {
    case "COLD_POOL":
      return `${hi} Passando para ver se você ainda tem interesse no financiamento. Posso te ajudar com alguma simulação?`;
    case "WARM_POOL":
      return `${hi} Queria retomar nossa conversa sobre o financiamento. Já tem algo definido ou precisa de mais informações?`;
    case "HOT_POOL":
      return `${hi} Vamos fechar? Me confirma o seu interesse e a gente já avança nos próximos passos.`;
  }
}

function normalizePhoneToWaId(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  if (digits.length >= 7) return digits;
  return null;
}

function parseImportRows(text: string, leadPool: LeadPool, importRef: string): Array<Record<string, unknown>> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    const parts = line
      .split(/[;,\t]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) continue;

    const maybeHeader = parts.join(" ").toLowerCase();
    if (maybeHeader.includes("telefone") || maybeHeader.includes("phone") || maybeHeader.includes("nome")) {
      continue;
    }

    const nome = parts.length > 1 ? parts[0] : null;
    const telefone = parts.length > 1 ? parts[1] : parts[0];
    const waId = normalizePhoneToWaId(telefone);
    if (!waId) continue;

    parsed.push({
      nome,
      telefone,
      wa_id: waId,
      lead_pool: leadPool,
      lead_temp: defaultTempForPool(leadPool),
      lead_source: "import",
      import_ref: importRef,
      auto_outreach_enabled: true,
      is_paused: false,
    });
  }

  return parsed;
}

function onStatKeyDown(event: React.KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate();
  }
}

export function BasesUI() {
  const [activeBase, setActiveBase] = useState<BaseType>("fria");
  const [leadsByBase, setLeadsByBase] = useState<Record<BaseType, CrmLeadMetaRow[]>>({
    fria: [],
    morna: [],
    quente: [],
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    origem: "",
    tag: "",
    entrada: "",
    status: "todos",
  });
  const [newLead, setNewLead] = useState({
    nome: "",
    telefone: "",
    wa_id: "",
    origem: "",
    observacao: "",
  });
  const [importData, setImportData] = useState({
    arquivo: null as File | null,
    entrada: "",
  });

  const fetchLeadsForPool = useCallback(async (pool: LeadPool): Promise<CrmLeadMetaRow[]> => {
    const res = await fetch(`/api/bases?lead_pool=${pool}&limit=100`, { cache: "no-store" });
    const data = (await res.json()) as ApiLeadsPayload;
    if (!data.ok) {
      throw new Error(data.error ?? "Erro ao carregar leads");
    }
    return data.leads ?? [];
  }, []);

  const refreshLeads = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cold, warm, hot] = await Promise.all([
        fetchLeadsForPool("COLD_POOL"),
        fetchLeadsForPool("WARM_POOL"),
        fetchLeadsForPool("HOT_POOL"),
      ]);
      setLeadsByBase({ fria: cold, morna: warm, quente: hot });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os leads");
      setLeadsByBase({ fria: [], morna: [], quente: [] });
    } finally {
      setLoading(false);
    }
  }, [fetchLeadsForPool]);

  useEffect(() => {
    void refreshLeads();
  }, [refreshLeads]);

  const callAction = useCallback(async (payload: Record<string, unknown>): Promise<ApiActionPayload | null> => {
    try {
      const res = await fetch("/api/bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = (await res.json()) as ApiActionPayload;
      if (!data.ok) {
        setActionError(data.error ?? "Ação falhou");
        setFeedback(null);
        return null;
      }
      return data;
    } catch {
      setActionError("Erro de rede ao executar ação");
      setFeedback(null);
      return null;
    }
  }, []);

  const allLeads = useMemo(
    () => [...leadsByBase.fria, ...leadsByBase.morna, ...leadsByBase.quente],
    [leadsByBase],
  );

  const baseCounts = useMemo(
    () => ({
      fria: leadsByBase.fria.length,
      morna: leadsByBase.morna.length,
      quente: leadsByBase.quente.length,
    }),
    [leadsByBase],
  );

  const activeLeads = useMemo(() => leadsByBase[activeBase], [leadsByBase, activeBase]);

  const filterOptions = useMemo(() => {
    return {
      origens: Array.from(new Set(activeLeads.map((l) => l.lead_source).filter(Boolean) as string[])),
      tags: Array.from(new Set(activeLeads.flatMap((l) => l.tags ?? []))),
      entradas: Array.from(new Set(activeLeads.map((l) => l.import_ref).filter(Boolean) as string[])),
    };
  }, [activeLeads]);

  const filteredLeads = useMemo(() => {
    return activeLeads.filter((lead) => {
      if (filters.origem && (lead.lead_source ?? "") !== filters.origem) return false;
      if (filters.tag && !(lead.tags ?? []).includes(filters.tag)) return false;
      if (filters.entrada && (lead.import_ref ?? "") !== filters.entrada) return false;
      if (filters.status === "ativos" && lead.is_paused) return false;
      if (filters.status === "pausados" && !lead.is_paused) return false;
      return true;
    });
  }, [activeLeads, filters]);

  const clearFilters = () => {
    setFilters({ origem: "", tag: "", entrada: "", status: "todos" });
  };

  const hasActiveFilters =
    filters.origem || filters.tag || filters.entrada || filters.status !== "todos";

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

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.nome || !newLead.telefone) return;

    const waId = newLead.wa_id.trim() || normalizePhoneToWaId(newLead.telefone);
    if (!waId) {
      setActionError("Telefone inválido para gerar wa_id");
      return;
    }

    const leadPool = BASE_TO_POOL[activeBase];
    const result = await runAndRefresh(
      async () =>
        callAction({
          action: "add_lead_manual",
          nome: newLead.nome,
          telefone: newLead.telefone,
          wa_id: waId,
          lead_pool: leadPool,
          lead_temp: defaultTempForPool(leadPool),
          lead_source: newLead.origem || "manual",
          obs_curta: newLead.observacao || null,
          auto_outreach_enabled: true,
          is_paused: false,
        }),
      `Lead ${newLead.nome} adicionado.`,
    );

    if (!result) return;
    setNewLead({ nome: "", telefone: "", wa_id: "", origem: "", observacao: "" });
    setShowAddModal(false);
  };

  const handleImportBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importData.arquivo || !importData.entrada.trim()) return;

    const text = await importData.arquivo.text();
    const leadPool = BASE_TO_POOL[activeBase];
    const leads = parseImportRows(text, leadPool, importData.entrada.trim());

    if (leads.length === 0) {
      setActionError("Arquivo sem leads válidos para importação");
      return;
    }

    const result = await runAndRefresh(
      async () =>
        callAction({
          action: "import_base",
          import_ref: importData.entrada.trim(),
          leads,
        }),
      `${leads.length} leads importados.`,
    );

    if (!result) return;
    setImportData({ arquivo: null, entrada: "" });
    setShowImportModal(false);
  };

  const handleMoveLead = async (lead: CrmLeadMetaRow) => {
    const bases: BaseType[] = ["fria", "morna", "quente"];
    const current = POOL_TO_BASE[lead.lead_pool];
    const nextBase = bases[(bases.indexOf(current) + 1) % bases.length];
    const nextPool = BASE_TO_POOL[nextBase];

    await runAndRefresh(
      async () =>
        callAction({
          action: "move_base",
          wa_id: lead.wa_id,
          lead_pool: nextPool,
          lead_temp: defaultTempForPool(nextPool),
        }),
      `Lead ${leadLabel(lead)} movido para base ${nextBase}.`,
    );
  };

  const handleTogglePause = async (lead: CrmLeadMetaRow) => {
    await runAndRefresh(
      async () =>
        callAction({
          action: lead.is_paused ? "resume_lead" : "pause_lead",
          wa_id: lead.wa_id,
        }),
      lead.is_paused ? `Lead ${leadLabel(lead)} retomado.` : `Lead ${leadLabel(lead)} pausado.`,
    );
  };

  const handleCallLead = async (lead: CrmLeadMetaRow) => {
    await runAndRefresh(
      async () =>
        callAction({
          action: "call_now",
          wa_id: lead.wa_id,
          text: suggestCallNowMessage(lead.lead_pool, lead.nome),
        }),
      `Lead ${leadLabel(lead)} acionado.`,
    );
  };

  const handleHeatBatch = async () => {
    if (filteredLeads.length === 0) return;
    const leadPool = BASE_TO_POOL[activeBase];
    const warmupSelection = await callAction({
      action: "warmup_base",
      lead_pool: leadPool,
      limit: Math.min(filteredLeads.length, 50),
    });

    if (!warmupSelection) return;

    const selected = Array.isArray(warmupSelection.leads) ? warmupSelection.leads : [];
    if (selected.length === 0) {
      setFeedback("Nenhum lead elegível para aquecimento.");
      setActionError(null);
      return;
    }

    const filteredIds = new Set(filteredLeads.map((lead) => lead.wa_id));
    const waIds = selected
      .map((lead) => lead.wa_id)
      .filter((waId) => filteredIds.has(waId));

    const dispatchIds = waIds.length > 0 ? waIds : selected.map((lead) => lead.wa_id);

    await runAndRefresh(
      async () =>
        callAction({
          action: "warmup_dispatch",
          wa_ids: dispatchIds,
          text: suggestCallNowMessage(leadPool, null),
        }),
      `Aquecimento executado para ${dispatchIds.length} lead(s).`,
    );
  };

  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.headerTitle}>Bases</h1>
            <p className={styles.headerSubtitle}>
              Gestão operacional de leads por estágio de relacionamento
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => setShowAddModal(true)}
              disabled={actionBusy}
            >
              <span className={styles.buttonIcon}>+</span>
              Adicionar lead
            </button>
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => setShowImportModal(true)}
              disabled={actionBusy}
            >
              <span className={styles.buttonIcon}>↑</span>
              Importar base
            </button>
          </div>
        </header>

        <div className={styles.statsBar}>
          <div className={styles.statsGroup}>
            <div
              className={`${styles.statItem} ${activeBase === "fria" ? styles.statItemActive : ""}`}
              onClick={() => setActiveBase("fria")}
              onKeyDown={(event) => onStatKeyDown(event, () => setActiveBase("fria"))}
              role="button"
              tabIndex={0}
            >
              <span className={styles.statLabel}>Base Fria</span>
              <span className={styles.statValue}>{baseCounts.fria}</span>
            </div>
            <div className={styles.statDivider} />
            <div
              className={`${styles.statItem} ${activeBase === "morna" ? styles.statItemActive : ""}`}
              onClick={() => setActiveBase("morna")}
              onKeyDown={(event) => onStatKeyDown(event, () => setActiveBase("morna"))}
              role="button"
              tabIndex={0}
            >
              <span className={styles.statLabel}>Base Morna</span>
              <span className={styles.statValue}>{baseCounts.morna}</span>
            </div>
            <div className={styles.statDivider} />
            <div
              className={`${styles.statItem} ${activeBase === "quente" ? styles.statItemActive : ""}`}
              onClick={() => setActiveBase("quente")}
              onKeyDown={(event) => onStatKeyDown(event, () => setActiveBase("quente"))}
              role="button"
              tabIndex={0}
            >
              <span className={styles.statLabel}>Base Quente</span>
              <span className={styles.statValue}>{baseCounts.quente}</span>
            </div>
          </div>
          <div className={styles.statsSummary}>
            <span className={styles.statsSummaryText}>Total: {allLeads.length} leads</span>
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
              {(["fria", "morna", "quente"] as const).map((base) => (
                <button
                  type="button"
                  key={base}
                  className={`${styles.tab} ${activeBase === base ? styles.tabActive : ""}`}
                  onClick={() => setActiveBase(base)}
                >
                  <span className={styles.tabLabel}>Base {base.charAt(0).toUpperCase() + base.slice(1)}</span>
                  <span className={styles.tabCount}>{baseCounts[base]}</span>
                </button>
              ))}
            </div>

            {activeBase !== "quente" && (
              <button
                type="button"
                className={styles.heatBatchButton}
                onClick={() => void handleHeatBatch()}
                disabled={filteredLeads.length === 0 || actionBusy}
              >
                <span className={styles.heatIcon}>↗</span>
                Aquecer base
                <span className={styles.heatBadge}>{filteredLeads.length} leads</span>
              </button>
            )}
          </div>

          <div className={styles.filtersSection}>
            <div className={styles.filtersRow}>
              <select
                className={styles.filterSelect}
                value={filters.origem}
                onChange={(e) => setFilters({ ...filters, origem: e.target.value })}
              >
                <option value="">Todas as origens</option>
                {filterOptions.origens.map((origem) => (
                  <option key={origem} value={origem}>
                    {origem}
                  </option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.tag}
                onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
              >
                <option value="">Todas as tags</option>
                {filterOptions.tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>

              <select
                className={styles.filterSelect}
                value={filters.entrada}
                onChange={(e) => setFilters({ ...filters, entrada: e.target.value })}
              >
                <option value="">Todas as importações</option>
                {filterOptions.entradas.map((entrada) => (
                  <option key={entrada} value={entrada}>
                    {entrada}
                  </option>
                ))}
              </select>

              <div className={styles.statusFilters}>
                <button
                  type="button"
                  className={`${styles.statusFilterBtn} ${filters.status === "todos" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, status: "todos" })}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`${styles.statusFilterBtn} ${filters.status === "ativos" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, status: "ativos" })}
                >
                  Ativos
                </button>
                <button
                  type="button"
                  className={`${styles.statusFilterBtn} ${filters.status === "pausados" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, status: "pausados" })}
                >
                  Pausados
                </button>
              </div>

              {hasActiveFilters && (
                <button type="button" className={styles.clearFilters} onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>

            <div className={styles.resultsInfo}>
              {filteredLeads.length} de {baseCounts[activeBase]} leads
              {hasActiveFilters && " (filtrado)"}
            </div>
          </div>

          <div className={styles.tableHeader}>
            <div className={styles.colNome}>Lead</div>
            <div className={styles.colOrigem}>Origem / Tags</div>
            <div className={styles.colObservacao}>Observação</div>
            <div className={styles.colBase}>Base</div>
            <div className={styles.colStatus}>Status</div>
            <div className={styles.colEntrada}>Entrada</div>
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
                  {hasActiveFilters ? "Tente ajustar os filtros" : "Adicione leads ou importe uma base"}
                </p>
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const rowBase = POOL_TO_BASE[lead.lead_pool];
                const badgeClass =
                  rowBase === "fria"
                    ? styles.baseBadgeFria
                    : rowBase === "morna"
                      ? styles.baseBadgeMorna
                      : styles.baseBadgeQuente;

                return (
                  <div
                    key={lead.wa_id}
                    className={`${styles.leadRow} ${lead.is_paused ? styles.leadRowPaused : ""}`}
                  >
                    <div className={styles.colNome}>
                      <span className={styles.leadName}>{lead.nome ?? lead.wa_id}</span>
                      <span className={styles.leadPhone}>{lead.telefone ?? lead.wa_id}</span>
                    </div>

                    <div className={styles.colOrigem}>
                      <span className={styles.leadOrigin}>{lead.lead_source ?? "—"}</span>
                      {(lead.tags ?? []).length > 0 && (
                        <div className={styles.tagsContainer}>
                          {(lead.tags ?? []).slice(0, 2).map((tag) => (
                            <span key={tag} className={styles.tag}>
                              {tag}
                            </span>
                          ))}
                          {(lead.tags ?? []).length > 2 && (
                            <span className={styles.tagMore}>+{(lead.tags ?? []).length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className={styles.colObservacao}>
                      <span className={styles.leadObs}>{lead.obs_curta ?? "—"}</span>
                    </div>

                    <div className={styles.colBase}>
                      <span className={`${styles.baseBadge} ${badgeClass}`}>
                        {rowBase.charAt(0).toUpperCase() + rowBase.slice(1)}
                      </span>
                    </div>

                    <div className={styles.colStatus}>
                      <span className={lead.is_paused ? styles.statusPaused : styles.statusActive}>
                        <span className={styles.statusDot} />
                        {lead.is_paused ? "Pausado" : "Ativo"}
                      </span>
                    </div>

                    <div className={styles.colEntrada}>
                      <span className={styles.entradaBadge}>{lead.import_ref ?? "Manual"}</span>
                    </div>

                    <div className={styles.colAcoes}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => void handleCallLead(lead)}
                        disabled={actionBusy}
                      >
                        Chamar
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => void handleMoveLead(lead)}
                        disabled={actionBusy}
                      >
                        Mover
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${lead.is_paused ? styles.actionBtnResume : styles.actionBtnPause}`}
                        onClick={() => void handleTogglePause(lead)}
                        disabled={actionBusy}
                      >
                        {lead.is_paused ? "Retomar" : "Pausar"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className={styles.overlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Adicionar lead</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setShowAddModal(false)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1 1L13 13M1 13L13 1"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <form id="add-lead-form" onSubmit={handleAddLead} className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label htmlFor="nome" className={styles.label}>
                  Nome <span className={styles.required}>*</span>
                </label>
                <input
                  id="nome"
                  type="text"
                  className={styles.input}
                  value={newLead.nome}
                  onChange={(e) => setNewLead({ ...newLead, nome: e.target.value })}
                  placeholder="Nome completo do lead"
                />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="telefone" className={styles.label}>
                    Telefone <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="telefone"
                    type="tel"
                    className={styles.input}
                    value={newLead.telefone}
                    onChange={(e) => setNewLead({ ...newLead, telefone: e.target.value })}
                    placeholder="(11) 98765-4321"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="wa_id" className={styles.label}>
                    WhatsApp ID
                  </label>
                  <input
                    id="wa_id"
                    type="text"
                    className={styles.input}
                    value={newLead.wa_id}
                    onChange={(e) => setNewLead({ ...newLead, wa_id: e.target.value })}
                    placeholder="5511987654321"
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="origem" className={styles.label}>
                  Origem
                </label>
                <select
                  id="origem"
                  className={styles.select}
                  value={newLead.origem}
                  onChange={(e) => setNewLead({ ...newLead, origem: e.target.value })}
                >
                  <option value="">Selecionar origem</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="Meta Ads">Meta Ads</option>
                  <option value="Orgânico">Orgânico</option>
                  <option value="Indicação">Indicação</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="observacao" className={styles.label}>
                  Observação
                </label>
                <textarea
                  id="observacao"
                  className={styles.textarea}
                  value={newLead.observacao}
                  onChange={(e) => setNewLead({ ...newLead, observacao: e.target.value })}
                  placeholder="Adicione uma observação sobre o lead..."
                />
              </div>
            </form>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowAddModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" form="add-lead-form" className={styles.primaryButton} disabled={actionBusy}>
                Adicionar lead
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className={styles.overlay} onClick={() => setShowImportModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Importar base</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setShowImportModal(false)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M1 1L13 13M1 13L13 1"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <form id="import-base-form" onSubmit={handleImportBatch} className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label htmlFor="arquivo" className={styles.label}>
                  Arquivo CSV <span className={styles.required}>*</span>
                </label>
                <div className={styles.fileInput}>
                  <input
                    id="arquivo"
                    type="file"
                    className={styles.fileInputHidden}
                    onChange={(e) =>
                      setImportData({ ...importData, arquivo: e.target.files?.[0] ?? null })
                    }
                    accept=".csv,.txt"
                  />
                  <label htmlFor="arquivo" className={styles.fileInputLabel}>
                    <span className={styles.fileInputIcon}>↑</span>
                    <span>{importData.arquivo?.name ?? "Selecionar arquivo CSV"}</span>
                  </label>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="entrada" className={styles.label}>
                  Nome da importação <span className={styles.required}>*</span>
                </label>
                <input
                  id="entrada"
                  type="text"
                  className={styles.input}
                  placeholder="Ex: Importação 001"
                  value={importData.entrada}
                  onChange={(e) => setImportData({ ...importData, entrada: e.target.value })}
                />
              </div>
              <div className={styles.formHint}>
                Os leads serão adicionados à base &quot;{activeBase}&quot; com dados reais do painel.
              </div>
            </form>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowImportModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" form="import-base-form" className={styles.primaryButton} disabled={actionBusy}>
                Importar base
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
