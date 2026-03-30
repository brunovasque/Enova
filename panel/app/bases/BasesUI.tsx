"use client";

import { useState, useMemo } from "react";
import styles from "./bases.module.css";

type Lead = {
  id: string;
  nome: string;
  telefone: string;
  wa_id: string;
  origem: string;
  tags: string[];
  observacao: string;
  lote: string;
  paused: boolean;
  base_atual: "fria" | "morna" | "quente";
};

type BaseType = "fria" | "morna" | "quente";

const MOCK_LEADS: Lead[] = [
  {
    id: "1",
    nome: "João Silva",
    telefone: "(11) 98765-4321",
    wa_id: "5511987654321",
    origem: "LinkedIn",
    tags: ["interessado", "seguro"],
    observacao: "Respondeu positivamente ao contato",
    lote: "IMP-2024-001",
    paused: false,
    base_atual: "fria",
  },
  {
    id: "2",
    nome: "Maria Santos",
    telefone: "(21) 99876-5432",
    wa_id: "5521998765432",
    origem: "Google Ads",
    tags: ["qualificado"],
    observacao: "Visitou o site 3 vezes",
    lote: "IMP-2024-001",
    paused: true,
    base_atual: "morna",
  },
  {
    id: "3",
    nome: "Pedro Costa",
    telefone: "(85) 91234-5678",
    wa_id: "5585912345678",
    origem: "Indicação",
    tags: ["hot", "carro na garagem"],
    observacao: "Pronto para fechar",
    lote: "IMP-2024-002",
    paused: false,
    base_atual: "quente",
  },
  {
    id: "4",
    nome: "Ana Paula Rodrigues",
    telefone: "(31) 92345-6789",
    wa_id: "5531923456789",
    origem: "Meta Ads",
    tags: ["novo"],
    observacao: "Primeiro contato realizado",
    lote: "IMP-2024-002",
    paused: false,
    base_atual: "fria",
  },
  {
    id: "5",
    nome: "Carlos Mendes",
    telefone: "(47) 93456-7890",
    wa_id: "5547934567890",
    origem: "Orgânico",
    tags: ["seguimento"],
    observacao: "Agendado para segunda-feira",
    lote: "IMP-2024-003",
    paused: false,
    base_atual: "morna",
  },
  {
    id: "6",
    nome: "Fernanda Lima",
    telefone: "(19) 94567-8901",
    wa_id: "5519945678901",
    origem: "LinkedIn",
    tags: ["decisor"],
    observacao: "CEO da empresa",
    lote: "IMP-2024-003",
    paused: true,
    base_atual: "fria",
  },
  {
    id: "7",
    nome: "Roberto Alves",
    telefone: "(62) 95678-9012",
    wa_id: "5562956789012",
    origem: "Google Ads",
    tags: ["retorno"],
    observacao: "Pediu retorno em 3 dias",
    lote: "IMP-2024-001",
    paused: false,
    base_atual: "quente",
  },
];

type FilterState = {
  origem: string;
  tag: string;
  lote: string;
  status: "todos" | "ativos" | "pausados";
};

export function BasesUI() {
  const [activeBase, setActiveBase] = useState<BaseType>("fria");
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    origem: "",
    tag: "",
    lote: "",
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
    arquivo: "",
    lote: "",
  });

  // Contagem por base
  const baseCounts = useMemo(() => {
    return {
      fria: leads.filter((l) => l.base_atual === "fria").length,
      morna: leads.filter((l) => l.base_atual === "morna").length,
      quente: leads.filter((l) => l.base_atual === "quente").length,
    };
  }, [leads]);

  // Opções únicas para filtros
  const filterOptions = useMemo(() => {
    const baseLeads = leads.filter((l) => l.base_atual === activeBase);
    return {
      origens: [...new Set(baseLeads.map((l) => l.origem))],
      tags: [...new Set(baseLeads.flatMap((l) => l.tags))],
      lotes: [...new Set(baseLeads.map((l) => l.lote))],
    };
  }, [leads, activeBase]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (lead.base_atual !== activeBase) return false;
      if (filters.origem && lead.origem !== filters.origem) return false;
      if (filters.tag && !lead.tags.includes(filters.tag)) return false;
      if (filters.lote && lead.lote !== filters.lote) return false;
      if (filters.status === "ativos" && lead.paused) return false;
      if (filters.status === "pausados" && !lead.paused) return false;
      return true;
    });
  }, [leads, activeBase, filters]);

  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.nome || !newLead.telefone) return;

    const lead: Lead = {
      id: Date.now().toString(),
      nome: newLead.nome,
      telefone: newLead.telefone,
      wa_id: newLead.wa_id || newLead.telefone.replace(/\D/g, ""),
      origem: newLead.origem,
      tags: [],
      observacao: newLead.observacao,
      lote: `IMP-${new Date().getFullYear()}-${String(leads.length + 1).padStart(3, "0")}`,
      paused: false,
      base_atual: activeBase,
    };

    setLeads([...leads, lead]);
    setNewLead({ nome: "", telefone: "", wa_id: "", origem: "", observacao: "" });
    setShowAddModal(false);
  };

  const handleImportBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importData.arquivo || !importData.lote) return;

    const newLeads = Array.from({ length: 5 }, (_, i) => ({
      id: `import-${Date.now()}-${i}`,
      nome: `Lead Importado ${i + 1}`,
      telefone: `(11) 9${Math.random().toString().slice(2, 11)}`,
      wa_id: `55${Math.random().toString().slice(2, 14)}`,
      origem: "Importação",
      tags: ["importado"],
      observacao: "Importado em lote",
      lote: importData.lote,
      paused: false,
      base_atual: activeBase,
    }));

    setLeads([...leads, ...newLeads]);
    setImportData({ arquivo: "", lote: "" });
    setShowImportModal(false);
  };

  const handleMoveLead = (leadId: string) => {
    const bases: BaseType[] = ["fria", "morna", "quente"];
    const currentLead = leads.find((l) => l.id === leadId);
    if (!currentLead) return;

    const currentIndex = bases.indexOf(currentLead.base_atual);
    const nextBase = bases[(currentIndex + 1) % bases.length];

    setLeads(
      leads.map((lead) =>
        lead.id === leadId ? { ...lead, base_atual: nextBase } : lead
      )
    );
  };

  const handleTogglePause = (leadId: string) => {
    setLeads(
      leads.map((lead) =>
        lead.id === leadId ? { ...lead, paused: !lead.paused } : lead
      )
    );
  };

  const handleHeatBatch = () => {
    // Move todos os leads filtrados para a próxima base
    const bases: BaseType[] = ["fria", "morna", "quente"];
    const currentIndex = bases.indexOf(activeBase);
    const nextBase = bases[Math.min(currentIndex + 1, bases.length - 1)];

    if (currentIndex === bases.length - 1) return; // Já está na base quente

    const filteredIds = new Set(filteredLeads.map((l) => l.id));
    setLeads(
      leads.map((lead) =>
        filteredIds.has(lead.id) ? { ...lead, base_atual: nextBase } : lead
      )
    );
  };

  const clearFilters = () => {
    setFilters({ origem: "", tag: "", lote: "", status: "todos" });
  };

  const hasActiveFilters =
    filters.origem || filters.tag || filters.lote || filters.status !== "todos";

  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.headerTitle}>Bases</h1>
            <p className={styles.headerSubtitle}>
              Gestão operacional de leads por estágio de relacionamento
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.buttonSecondary}
              onClick={() => setShowAddModal(true)}
            >
              <span className={styles.buttonIcon}>+</span>
              Adicionar lead
            </button>
            <button
              className={styles.buttonSecondary}
              onClick={() => setShowImportModal(true)}
            >
              <span className={styles.buttonIcon}>↑</span>
              Importar lote
            </button>
          </div>
        </header>

        {/* Stats Bar */}
        <div className={styles.statsBar}>
          <div className={styles.statsGroup}>
            <div
              className={`${styles.statItem} ${activeBase === "fria" ? styles.statItemActive : ""}`}
              onClick={() => setActiveBase("fria")}
            >
              <span className={styles.statLabel}>Base Fria</span>
              <span className={styles.statValue}>{baseCounts.fria}</span>
            </div>
            <div className={styles.statDivider} />
            <div
              className={`${styles.statItem} ${activeBase === "morna" ? styles.statItemActive : ""}`}
              onClick={() => setActiveBase("morna")}
            >
              <span className={styles.statLabel}>Base Morna</span>
              <span className={styles.statValue}>{baseCounts.morna}</span>
            </div>
            <div className={styles.statDivider} />
            <div
              className={`${styles.statItem} ${activeBase === "quente" ? styles.statItemActive : ""}`}
              onClick={() => setActiveBase("quente")}
            >
              <span className={styles.statLabel}>Base Quente</span>
              <span className={styles.statValue}>{baseCounts.quente}</span>
            </div>
          </div>
          <div className={styles.statsSummary}>
            <span className={styles.statsSummaryText}>
              Total: {leads.length} leads
            </span>
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Tabs */}
          <div className={styles.tabsSection}>
            <div className={styles.tabsContainer}>
              {(["fria", "morna", "quente"] as const).map((base) => (
                <button
                  key={base}
                  className={`${styles.tab} ${activeBase === base ? styles.tabActive : ""}`}
                  onClick={() => setActiveBase(base)}
                >
                  <span className={styles.tabLabel}>
                    Base {base.charAt(0).toUpperCase() + base.slice(1)}
                  </span>
                  <span className={styles.tabCount}>{baseCounts[base]}</span>
                </button>
              ))}
            </div>

            {/* Heat Batch Action */}
            {activeBase !== "quente" && (
              <button
                className={styles.heatBatchButton}
                onClick={handleHeatBatch}
                disabled={filteredLeads.length === 0}
              >
                <span className={styles.heatIcon}>↗</span>
                Aquecer lote
                <span className={styles.heatBadge}>
                  {filteredLeads.length} leads
                </span>
              </button>
            )}
          </div>

          {/* Filters */}
          <div className={styles.filtersSection}>
            <div className={styles.filtersRow}>
              <select
                className={styles.filterSelect}
                value={filters.origem}
                onChange={(e) =>
                  setFilters({ ...filters, origem: e.target.value })
                }
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
                onChange={(e) =>
                  setFilters({ ...filters, tag: e.target.value })
                }
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
                value={filters.lote}
                onChange={(e) =>
                  setFilters({ ...filters, lote: e.target.value })
                }
              >
                <option value="">Todos os lotes</option>
                {filterOptions.lotes.map((lote) => (
                  <option key={lote} value={lote}>
                    {lote}
                  </option>
                ))}
              </select>

              <div className={styles.statusFilters}>
                <button
                  className={`${styles.statusFilterBtn} ${filters.status === "todos" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, status: "todos" })}
                >
                  Todos
                </button>
                <button
                  className={`${styles.statusFilterBtn} ${filters.status === "ativos" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, status: "ativos" })}
                >
                  Ativos
                </button>
                <button
                  className={`${styles.statusFilterBtn} ${filters.status === "pausados" ? styles.statusFilterActive : ""}`}
                  onClick={() => setFilters({ ...filters, status: "pausados" })}
                >
                  Pausados
                </button>
              </div>

              {hasActiveFilters && (
                <button className={styles.clearFilters} onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </div>

            <div className={styles.resultsInfo}>
              {filteredLeads.length} de {baseCounts[activeBase]} leads
              {hasActiveFilters && " (filtrado)"}
            </div>
          </div>

          {/* Table Header */}
          <div className={styles.tableHeader}>
            <div className={styles.colNome}>Lead</div>
            <div className={styles.colOrigem}>Origem / Tags</div>
            <div className={styles.colObservacao}>Observação</div>
            <div className={styles.colBase}>Base</div>
            <div className={styles.colStatus}>Status</div>
            <div className={styles.colLote}>Lote</div>
            <div className={styles.colAcoes}>Ações</div>
          </div>

          {/* Leads List */}
          <div className={styles.leadsTable}>
            {filteredLeads.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>○</div>
                <p className={styles.emptyTitle}>Nenhum lead encontrado</p>
                <p className={styles.emptySubtitle}>
                  {hasActiveFilters
                    ? "Tente ajustar os filtros"
                    : "Adicione leads ou importe um lote"}
                </p>
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <div
                  key={lead.id}
                  className={`${styles.leadRow} ${lead.paused ? styles.leadRowPaused : ""}`}
                >
                  {/* Nome e Telefone */}
                  <div className={styles.colNome}>
                    <span className={styles.leadName}>{lead.nome}</span>
                    <span className={styles.leadPhone}>{lead.telefone}</span>
                  </div>

                  {/* Origem e Tags */}
                  <div className={styles.colOrigem}>
                    <span className={styles.leadOrigin}>{lead.origem}</span>
                    {lead.tags.length > 0 && (
                      <div className={styles.tagsContainer}>
                        {lead.tags.slice(0, 2).map((tag, i) => (
                          <span key={i} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                        {lead.tags.length > 2 && (
                          <span className={styles.tagMore}>
                            +{lead.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Observação */}
                  <div className={styles.colObservacao}>
                    <span className={styles.leadObs}>{lead.observacao}</span>
                  </div>

                  {/* Base Atual */}
                  <div className={styles.colBase}>
                    <span
                      className={`${styles.baseBadge} ${styles[`baseBadge${lead.base_atual.charAt(0).toUpperCase() + lead.base_atual.slice(1)}`]}`}
                    >
                      {lead.base_atual.charAt(0).toUpperCase() +
                        lead.base_atual.slice(1)}
                    </span>
                  </div>

                  {/* Status */}
                  <div className={styles.colStatus}>
                    <span
                      className={
                        lead.paused ? styles.statusPaused : styles.statusActive
                      }
                    >
                      <span className={styles.statusDot} />
                      {lead.paused ? "Pausado" : "Ativo"}
                    </span>
                  </div>

                  {/* Lote */}
                  <div className={styles.colLote}>
                    <span className={styles.loteBadge}>{lead.lote}</span>
                  </div>

                  {/* Ações */}
                  <div className={styles.colAcoes}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => console.log("Chamar", lead.nome)}
                    >
                      Chamar
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleMoveLead(lead.id)}
                    >
                      Mover
                    </button>
                    <button
                      className={`${styles.actionBtn} ${lead.paused ? styles.actionBtnResume : styles.actionBtnPause}`}
                      onClick={() => handleTogglePause(lead.id)}
                    >
                      {lead.paused ? "Retomar" : "Pausar"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className={styles.overlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Adicionar lead</h2>
              <button
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
            <form onSubmit={handleAddLead} className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label htmlFor="nome" className={styles.label}>
                  Nome <span className={styles.required}>*</span>
                </label>
                <input
                  id="nome"
                  type="text"
                  className={styles.input}
                  value={newLead.nome}
                  onChange={(e) =>
                    setNewLead({ ...newLead, nome: e.target.value })
                  }
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
                    onChange={(e) =>
                      setNewLead({ ...newLead, telefone: e.target.value })
                    }
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
                    onChange={(e) =>
                      setNewLead({ ...newLead, wa_id: e.target.value })
                    }
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
                  onChange={(e) =>
                    setNewLead({ ...newLead, origem: e.target.value })
                  }
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
                  onChange={(e) =>
                    setNewLead({ ...newLead, observacao: e.target.value })
                  }
                  placeholder="Adicione uma observação sobre o lead..."
                />
              </div>
            </form>
            <div className={styles.modalFooter}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowAddModal(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.primaryButton}
                onClick={(e) => handleAddLead(e as React.FormEvent)}
              >
                Adicionar lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div
          className={styles.overlay}
          onClick={() => setShowImportModal(false)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Importar lote</h2>
              <button
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
            <form
              onSubmit={handleImportBatch}
              className={styles.modalContent}
            >
              <div className={styles.formGroup}>
                <label htmlFor="arquivo" className={styles.label}>
                  Arquivo CSV <span className={styles.required}>*</span>
                </label>
                <div className={styles.fileInput}>
                  <input
                    id="arquivo"
                    type="file"
                    className={styles.fileInputHidden}
                    value={importData.arquivo}
                    onChange={(e) =>
                      setImportData({ ...importData, arquivo: e.target.value })
                    }
                    accept=".csv"
                  />
                  <label htmlFor="arquivo" className={styles.fileInputLabel}>
                    <span className={styles.fileInputIcon}>↑</span>
                    <span>Selecionar arquivo CSV</span>
                  </label>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="lote" className={styles.label}>
                  Identificação do lote <span className={styles.required}>*</span>
                </label>
                <input
                  id="lote"
                  type="text"
                  className={styles.input}
                  value={importData.lote}
                  onChange={(e) =>
                    setImportData({ ...importData, lote: e.target.value })
                  }
                  placeholder="IMP-2024-001"
                />
              </div>
              <div className={styles.formHint}>
                O lote será criado na base &quot;{activeBase}&quot;. Você pode
                mover os leads individualmente ou em lote após a importação.
              </div>
            </form>
            <div className={styles.modalFooter}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowImportModal(false)}
              >
                Cancelar
              </button>
              <button
                className={styles.primaryButton}
                onClick={(e) => handleImportBatch(e as React.FormEvent)}
              >
                Importar lote
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
