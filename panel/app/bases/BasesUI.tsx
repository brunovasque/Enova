"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./bases.module.css";
import { savePrefillOnLeadCreateAction } from "./actions";

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
  busca: string;
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

const STATUS_OPERACIONAL_VALUES = [
  "SEM_CONTATO",
  "CONTATADO",
  "AGUARDANDO_RETORNO",
] as const;

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

function parseImportRows(text: string, leadPool: LeadPool, importRef: string, sourceType: string): Array<Record<string, unknown>> {
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
      source_type: sourceType,
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
  const [showWarmupModal, setShowWarmupModal] = useState(false);
  const [callNowTarget, setCallNowTarget] = useState<CrmLeadMetaRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<CrmLeadMetaRow | null>(null);
  const [editingObsWaId, setEditingObsWaId] = useState<string | null>(null);
  const [editingObsText, setEditingObsText] = useState("");
  const [busyStatusWaId, setBusyStatusWaId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    busca: "",
    origem: "",
    tag: "",
    entrada: "",
    status: "todos",
  });
  const [newLead, setNewLead] = useState({
    nome: "",
    telefone: "",
    wa_id: "",
    source_type: "fria",
    observacao: "",
  });
  const [newPrefill, setNewPrefill] = useState({
    showPrefill: false,
    nacionalidade_prefill: "",
    estado_civil_prefill: "",
    regime_trabalho_prefill: "",
    renda_prefill: "",
    meses_36_prefill: "",
    dependentes_prefill: "",
    valor_entrada_prefill: "",
    restricao_prefill: "",
    observacoes_admin: "",
  });
  const [importData, setImportData] = useState({
    arquivo: null as File | null,
    entrada: "",
    source_type: "fria",
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
    const q = filters.busca.trim().toLowerCase();
    return activeLeads.filter((lead) => {
      if (q) {
        const nameMatch = lead.nome?.toLowerCase().includes(q) ?? false;
        const phoneMatch = (lead.telefone ?? lead.wa_id).toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch) return false;
      }
      if (filters.origem && (lead.lead_source ?? "") !== filters.origem) return false;
      if (filters.tag && !(lead.tags ?? []).includes(filters.tag)) return false;
      if (filters.entrada && (lead.import_ref ?? "") !== filters.entrada) return false;
      if (filters.status === "ativos" && lead.is_paused) return false;
      if (filters.status === "pausados" && !lead.is_paused) return false;
      return true;
    });
  }, [activeLeads, filters]);

  const clearFilters = () => {
    setFilters({ busca: "", origem: "", tag: "", entrada: "", status: "todos" });
  };

  const hasActiveFilters =
    filters.busca || filters.origem || filters.tag || filters.entrada || filters.status !== "todos";

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
          source_type: newLead.source_type || "fria",
          obs_curta: newLead.observacao || null,
          auto_outreach_enabled: true,
          is_paused: false,
        }),
      `Lead ${newLead.nome} adicionado.`,
    );

    if (!result) return;

    // Save optional prefill data if any field was provided
    const hasPrefill =
      newPrefill.nacionalidade_prefill.trim() ||
      newPrefill.estado_civil_prefill.trim() ||
      newPrefill.regime_trabalho_prefill.trim() ||
      newPrefill.renda_prefill.trim() ||
      newPrefill.meses_36_prefill.trim() ||
      newPrefill.dependentes_prefill.trim() ||
      newPrefill.valor_entrada_prefill.trim() ||
      newPrefill.restricao_prefill.trim() ||
      newPrefill.observacoes_admin.trim();

    if (hasPrefill) {
      try {
        type PrefillPayload = Parameters<typeof savePrefillOnLeadCreateAction>[0];
        const payload: PrefillPayload = { wa_id: waId, updated_by: "admin_panel" };
        const p = payload as Record<string, unknown>;
        const addTextField = (key: keyof PrefillPayload, statusKey: keyof PrefillPayload, val: string) => {
          if (!val.trim()) return;
          p[key] = val.trim();
          p[statusKey] = "prefilled_pending_confirmation";
        };
        const addNumField = (key: keyof PrefillPayload, statusKey: keyof PrefillPayload, val: string) => {
          const n = parseFloat(val);
          if (isNaN(n)) return;
          p[key] = n;
          p[statusKey] = "prefilled_pending_confirmation";
        };
        const addBoolField = (key: keyof PrefillPayload, statusKey: keyof PrefillPayload, val: string) => {
          if (val !== "true" && val !== "false") return;
          p[key] = val === "true";
          p[statusKey] = "prefilled_pending_confirmation";
        };
        addTextField("nacionalidade_prefill", "nacionalidade_status", newPrefill.nacionalidade_prefill);
        addTextField("estado_civil_prefill", "estado_civil_status", newPrefill.estado_civil_prefill);
        addTextField("regime_trabalho_prefill", "regime_trabalho_status", newPrefill.regime_trabalho_prefill);
        addNumField("renda_prefill", "renda_status", newPrefill.renda_prefill);
        addBoolField("meses_36_prefill", "meses_36_status", newPrefill.meses_36_prefill);
        addNumField("dependentes_prefill", "dependentes_status", newPrefill.dependentes_prefill);
        addNumField("valor_entrada_prefill", "valor_entrada_status", newPrefill.valor_entrada_prefill);
        addBoolField("restricao_prefill", "restricao_status", newPrefill.restricao_prefill);
        if (newPrefill.observacoes_admin.trim()) payload.observacoes_admin = newPrefill.observacoes_admin.trim();
        payload.origem_lead = newLead.source_type || null;
        await savePrefillOnLeadCreateAction(payload);
      } catch {
        // Non-blocking: prefill save failure does not block lead creation
      }
    }

    setNewLead({ nome: "", telefone: "", wa_id: "", source_type: "fria", observacao: "" });
    setNewPrefill({ showPrefill: false, nacionalidade_prefill: "", estado_civil_prefill: "", regime_trabalho_prefill: "", renda_prefill: "", meses_36_prefill: "", dependentes_prefill: "", valor_entrada_prefill: "", restricao_prefill: "", observacoes_admin: "" });
    setShowAddModal(false);
  };

  const handleImportBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importData.arquivo || !importData.entrada.trim()) return;

    const text = await importData.arquivo.text();
    const leadPool = BASE_TO_POOL[activeBase];
    const sourceType = importData.source_type || "fria";
    const leads = parseImportRows(text, leadPool, importData.entrada.trim(), sourceType);

    if (leads.length === 0) {
      setActionError("Arquivo sem leads válidos para importação");
      return;
    }

    const result = await runAndRefresh(
      async () =>
        callAction({
          action: "import_base",
          import_ref: importData.entrada.trim(),
          source_type: sourceType,
          leads,
        }),
      `${leads.length} leads importados.`,
    );

    if (!result) return;
    setImportData({ arquivo: null, entrada: "", source_type: "fria" });
    setShowImportModal(false);
  };

  const openMoveModal = useCallback((lead: CrmLeadMetaRow) => {
    setMoveTarget(lead);
  }, []);

  const handleMoveConfirm = async (lead: CrmLeadMetaRow, targetBase: BaseType) => {
    const nextPool = BASE_TO_POOL[targetBase];
    await runAndRefresh(
      async () =>
        callAction({
          action: "move_base",
          wa_id: lead.wa_id,
          lead_pool: nextPool,
          lead_temp: defaultTempForPool(nextPool),
        }),
      `Lead ${leadLabel(lead)} movido para base ${targetBase}.`,
    );
    setMoveTarget(null);
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

  const handleCallNowSubmit = async (lead: CrmLeadMetaRow, text: string) => {
    await runAndRefresh(
      async () => callAction({ action: "call_now", wa_id: lead.wa_id, text }),
      `Lead ${leadLabel(lead)} acionado.`,
    );
    setCallNowTarget(null);
  };

  const handleUpdateObs = useCallback(
    async (lead: CrmLeadMetaRow, newObs: string) => {
      const result = await callAction({ action: "update_obs", wa_id: lead.wa_id, obs_curta: newObs });
      if (!result) return;
      setLeadsByBase((prev) => ({
        ...prev,
        [activeBase]: prev[activeBase].map((l) =>
          l.wa_id === lead.wa_id ? { ...l, obs_curta: newObs.trim() || null } : l,
        ),
      }));
      setEditingObsWaId(null);
      setEditingObsText("");
    },
    [callAction, activeBase],
  );

  const handleUpdateStatus = useCallback(
    async (lead: CrmLeadMetaRow, newStatus: string) => {
      setBusyStatusWaId(lead.wa_id);
      const result = await callAction({
        action: "update_obs",
        wa_id: lead.wa_id,
        status_operacional: newStatus,
      });
      setBusyStatusWaId(null);
      if (!result) return;
      setLeadsByBase((prev) => ({
        ...prev,
        [activeBase]: prev[activeBase].map((l) =>
          l.wa_id === lead.wa_id
            ? {
                ...l,
                status_operacional: newStatus,
              }
            : l,
        ),
      }));
    },
    [callAction, activeBase],
  );

  const handleCancelEditObs = useCallback(() => {
    setEditingObsWaId(null);
    setEditingObsText("");
  }, []);

  const handleCloseWarmup = useCallback(() => {
    setShowWarmupModal(false);
  }, []);

  const handleCloseCallNow = useCallback(() => {
    setCallNowTarget(null);
  }, []);

  const handleWarmupDone = useCallback(
    async (msg: string) => {
      setFeedback(msg);
      setActionError(null);
      setShowWarmupModal(false);
      await refreshLeads();
    },
    [refreshLeads],
  );

  const openCallNowModal = useCallback((lead: CrmLeadMetaRow) => {
    setCallNowTarget(lead);
  }, []);

  const activePool = BASE_TO_POOL[activeBase];

  const renderStatusLabel = (lead: CrmLeadMetaRow) => {
    if (lead.is_paused) return "Pausado";
    switch (lead.status_operacional) {
      case "CONTATADO":
        return "Contatado";
      case "AGUARDANDO_RETORNO":
        return "Aguardando";
      case "SEM_CONTATO":
        return "Sem contato";
      default:
        return "Ativo";
    }
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
                onClick={() => setShowWarmupModal(true)}
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
              <input
                className={styles.input}
                style={{ flex: "1 1 auto", minWidth: 240 }}
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
                      {editingObsWaId === lead.wa_id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            className={styles.input}
                            style={{ minWidth: 0 }}
                            value={editingObsText}
                            maxLength={200}
                            onChange={(e) => setEditingObsText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleUpdateObs(lead, editingObsText);
                              if (e.key === "Escape") handleCancelEditObs();
                            }}
                          />
                          <button type="button" className={styles.actionBtn} onClick={() => void handleUpdateObs(lead, editingObsText)}>
                            ✓
                          </button>
                          <button type="button" className={styles.actionBtn} onClick={handleCancelEditObs}>
                            ✕
                          </button>
                        </div>
                      ) : (
                        <span
                          className={styles.leadObs}
                          onClick={() => {
                            setEditingObsWaId(lead.wa_id);
                            setEditingObsText(lead.obs_curta ?? "");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setEditingObsWaId(lead.wa_id);
                              setEditingObsText(lead.obs_curta ?? "");
                            }
                          }}
                          tabIndex={0}
                          style={{ cursor: "text" }}
                        >
                          {lead.obs_curta ?? "—"}
                        </span>
                      )}
                    </div>

                    <div className={styles.colBase}>
                      <span className={`${styles.baseBadge} ${badgeClass}`}>
                        {rowBase.charAt(0).toUpperCase() + rowBase.slice(1)}
                      </span>
                    </div>

                    <div className={styles.colStatus}>
                      {lead.is_paused ? (
                        <span className={styles.statusPaused}>
                          <span className={styles.statusDot} />
                          Pausado
                        </span>
                      ) : (
                        <select
                          className={styles.filterSelect}
                          style={{ minWidth: 128 }}
                          value={lead.status_operacional ?? "SEM_CONTATO"}
                          disabled={busyStatusWaId === lead.wa_id || actionBusy}
                          onChange={(e) => void handleUpdateStatus(lead, e.target.value)}
                        >
                          {STATUS_OPERACIONAL_VALUES.map((st) => (
                            <option key={st} value={st}>{statusOptionLabel(st)}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className={styles.colEntrada}>
                      <span className={styles.entradaBadge}>{lead.import_ref ?? "Manual"}</span>
                    </div>

                    <div className={styles.colAcoes}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => openCallNowModal(lead)}
                        disabled={actionBusy}
                      >
                        Chamar
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => openMoveModal(lead)}
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
                  Origem do lead
                </label>
                <select
                  id="origem"
                  className={styles.select}
                  value={newLead.source_type}
                  onChange={(e) => setNewLead({ ...newLead, source_type: e.target.value })}
                >
                  <option value="fria">Fria (sem definição)</option>
                  <option value="campanha">Campanha</option>
                  <option value="morna">Morna</option>
                  <option value="lyx">Lyx</option>
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

              {/* Informações já conhecidas (opcional) */}
              <div className={styles.prefillSection}>
                <button
                  type="button"
                  className={styles.prefillToggle}
                  onClick={() => setNewPrefill({ ...newPrefill, showPrefill: !newPrefill.showPrefill })}
                >
                  {newPrefill.showPrefill ? "▾" : "▸"} Informações já conhecidas (opcional)
                </button>

                {newPrefill.showPrefill && (
                  <>
                    <p className={styles.prefillHint}>
                      Estes dados são pré-preenchidos. Não substituem a confirmação pelo cliente no funil.
                    </p>
                    <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Nacionalidade</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={newPrefill.nacionalidade_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, nacionalidade_prefill: e.target.value })}
                        placeholder="Ex: brasileira"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Estado Civil</label>
                      <select
                        className={styles.select}
                        value={newPrefill.estado_civil_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, estado_civil_prefill: e.target.value })}
                      >
                        <option value="">— não informado —</option>
                        <option value="solteiro">Solteiro(a)</option>
                        <option value="casado">Casado(a)</option>
                        <option value="divorciado">Divorciado(a)</option>
                        <option value="viuvo">Viúvo(a)</option>
                        <option value="uniao_estavel">União Estável</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Regime Trabalho</label>
                      <select
                        className={styles.select}
                        value={newPrefill.regime_trabalho_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, regime_trabalho_prefill: e.target.value })}
                      >
                        <option value="">— não informado —</option>
                        <option value="clt">CLT</option>
                        <option value="autonomo">Autônomo</option>
                        <option value="servidor_publico">Servidor Público</option>
                        <option value="empresario">Empresário</option>
                        <option value="aposentado">Aposentado/Pensionista</option>
                        <option value="misto">Misto</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Renda (R$)</label>
                      <input
                        type="number"
                        className={styles.input}
                        value={newPrefill.renda_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, renda_prefill: e.target.value })}
                        placeholder="Ex: 3500"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>36 Meses (CTPS)</label>
                      <select
                        className={styles.select}
                        value={newPrefill.meses_36_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, meses_36_prefill: e.target.value })}
                      >
                        <option value="">— não informado —</option>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </select>
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Dependentes</label>
                      <input
                        type="number"
                        className={styles.input}
                        value={newPrefill.dependentes_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, dependentes_prefill: e.target.value })}
                        placeholder="Ex: 0"
                        min="0"
                      />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Valor Entrada (R$)</label>
                      <input
                        type="number"
                        className={styles.input}
                        value={newPrefill.valor_entrada_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, valor_entrada_prefill: e.target.value })}
                        placeholder="Ex: 10000"
                        min="0"
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Restrição</label>
                      <select
                        className={styles.select}
                        value={newPrefill.restricao_prefill}
                        onChange={(e) => setNewPrefill({ ...newPrefill, restricao_prefill: e.target.value })}
                      >
                        <option value="">— não informado —</option>
                        <option value="true">Sim (tem restrição)</option>
                        <option value="false">Não (sem restrição)</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Observações Admin</label>
                    <textarea
                      className={styles.textarea}
                      value={newPrefill.observacoes_admin}
                      onChange={(e) => setNewPrefill({ ...newPrefill, observacoes_admin: e.target.value })}
                      placeholder="Observações internas (não visível ao cliente)"
                    />
                  </div>
                  </>
                )}
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
              <div className={styles.formGroup}>
                <label htmlFor="import-source-type" className={styles.label}>
                  Origem dos leads
                </label>
                <select
                  id="import-source-type"
                  className={styles.select}
                  value={importData.source_type}
                  onChange={(e) => setImportData({ ...importData, source_type: e.target.value })}
                >
                  <option value="fria">Fria (sem definição)</option>
                  <option value="campanha">Campanha</option>
                  <option value="morna">Morna</option>
                  <option value="lyx">Lyx</option>
                </select>
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
      {showWarmupModal && (
        <WarmupModal
          activePool={activePool}
          callAction={callAction}
          onClose={handleCloseWarmup}
          onDone={(msg) => void handleWarmupDone(msg)}
        />
      )}
      {moveTarget && (
        <div className={styles.overlay} onClick={() => setMoveTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Mover lead</h2>
              <button type="button" className={styles.closeButton} onClick={() => setMoveTarget(null)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.formHint}>
                Mover <strong>{leadLabel(moveTarget)}</strong> para:
              </div>
              <div className={styles.modalFooter} style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
                {(["fria", "morna", "quente"] as BaseType[])
                  .filter((b) => b !== POOL_TO_BASE[moveTarget.lead_pool])
                  .map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={styles.primaryButton}
                      disabled={actionBusy}
                      onClick={() => void handleMoveConfirm(moveTarget, b)}
                    >
                      Base {b.charAt(0).toUpperCase() + b.slice(1)}
                    </button>
                  ))}
                <button type="button" className={styles.secondaryButton} onClick={() => setMoveTarget(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {callNowTarget && (
        <CallNowModal
          lead={callNowTarget}
          onClose={handleCloseCallNow}
          onSubmit={(text) => handleCallNowSubmit(callNowTarget, text)}
        />
      )}
    </main>
  );
}

function statusOptionLabel(value: (typeof STATUS_OPERACIONAL_VALUES)[number]): string {
  switch (value) {
    case "SEM_CONTATO":
      return "Sem contato";
    case "CONTATADO":
      return "Contatado";
    case "AGUARDANDO_RETORNO":
      return "Aguardando retorno";
  }
}

function WarmupModal({
  activePool,
  callAction,
  onClose,
  onDone,
}: {
  activePool: LeadPool;
  callAction: (payload: Record<string, unknown>) => Promise<ApiActionPayload | null>;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [leadPool, setLeadPool] = useState<LeadPool>(activePool);
  const [limit, setLimit] = useState("20");
  const [previewLeads, setPreviewLeads] = useState<CrmLeadMetaRow[] | null>(null);
  const [dispatchText, setDispatchText] = useState(suggestCallNowMessage(activePool, null));
  const [validationError, setValidationError] = useState<string | null>(null);
  const canDispatch = (previewLeads?.length ?? 0) > 0 && dispatchText.trim().length > 0;

  const runPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setValidationError(null);
    const safeLimit = Number(limit);
    if (!Number.isFinite(safeLimit) || safeLimit < 1 || safeLimit > 50) {
      setBusy(false);
      setValidationError("Informe um limite válido entre 1 e 50.");
      return;
    }
    const result = await callAction({ action: "warmup_base", lead_pool: leadPool, limit: safeLimit });
    setBusy(false);
    if (!result) return;
    const leads = Array.isArray(result.leads) ? result.leads : [];
    setPreviewLeads(leads);
    setDispatchText(suggestCallNowMessage(leadPool, null));
  };

  const runDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDispatch || !previewLeads) return;
    setBusy(true);
    const result = await callAction({
      action: "warmup_dispatch",
      wa_ids: previewLeads.map((lead) => lead.wa_id),
      text: dispatchText.trim(),
    });
    setBusy(false);
    if (!result) return;
    const sent = typeof result.sent_count === "number" ? result.sent_count : 0;
    onDone(`Aquecimento executado para ${sent} de ${previewLeads.length} lead(s).`);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Aquecer base</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {previewLeads === null ? (
          <form onSubmit={runPreview} className={styles.modalContent}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Base</label>
              <select className={styles.select} value={leadPool} onChange={(e) => setLeadPool(e.target.value as LeadPool)}>
                <option value="COLD_POOL">Base Fria</option>
                <option value="WARM_POOL">Base Morna</option>
                <option value="HOT_POOL">Base Quente</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Limite de leads (1-50)</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => {
                  const inputValue = e.currentTarget.valueAsNumber;
                  if (Number.isNaN(inputValue)) {
                    setLimit("");
                    return;
                  }
                  const clamped = Math.max(1, Math.min(50, inputValue));
                  setLimit(String(clamped));
                }}
              />
            </div>
            {validationError && <div className={styles.formHint}>{validationError}</div>}
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Buscando..." : "Buscar elegíveis"}</button>
            </div>
          </form>
        ) : (
          <form onSubmit={runDispatch} className={styles.modalContent}>
            <div className={styles.formHint}>
              {previewLeads.length === 0
                ? "Nenhum lead elegível encontrado."
                : `${previewLeads.length} lead(s) elegível(is). Revise e confirme o envio.`}
            </div>
            {previewLeads.length > 0 && (
              <>
                <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 8 }}>
                  {previewLeads.map((lead) => (
                    <div key={lead.wa_id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                      <span>{leadLabel(lead)}</span>
                      <span>{lead.telefone ?? lead.wa_id}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Mensagem</label>
                  <textarea className={styles.textarea} value={dispatchText} onChange={(e) => setDispatchText(e.target.value)} />
                </div>
              </>
            )}
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setPreviewLeads(null)} disabled={busy}>Voltar</button>
              <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>Cancelar</button>
              {previewLeads.length > 0 && (
                <button type="submit" className={styles.primaryButton} disabled={busy || !canDispatch}>
                  {busy ? "Enviando..." : "Confirmar envio"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function CallNowModal({
  lead,
  onClose,
  onSubmit,
}: {
  lead: CrmLeadMetaRow;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const suggested = suggestCallNowMessage(lead.lead_pool, lead.nome);
  const [text, setText] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const canSubmit = text.trim().length > 0 && !lead.is_paused && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    await onSubmit(text.trim());
    setBusy(false);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Chamar lead</h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className={styles.modalContent}>
          <div className={styles.formHint}>Revise a mensagem antes de enviar para {leadLabel(lead)}.</div>
          {lead.is_paused && <div className={styles.formHint}>Lead pausado — retome antes de chamar.</div>}
          <div className={styles.formGroup}>
            <label className={styles.label}>Mensagem</label>
            <textarea className={styles.textarea} value={text} onChange={(e) => setText(e.target.value)} disabled={lead.is_paused || busy} />
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.secondaryButton} onClick={() => setText(suggested)} disabled={busy || lead.is_paused}>Restaurar sugestão</button>
            <button type="submit" className={styles.primaryButton} disabled={!canSubmit}>{busy ? "Enviando..." : "Enviar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
