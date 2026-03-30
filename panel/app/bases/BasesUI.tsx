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
    lote: "LOTE-001",
    paused: false,
    base_atual: "fria",
  },
  {
    id: "2",
    nome: "Maria Santos",
    telefone: "(21) 99876-5432",
    wa_id: "5521998765432",
    origem: "Google",
    tags: ["qualificado"],
    observacao: "Visitou o site 3 vezes",
    lote: "LOTE-001",
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
    lote: "LOTE-002",
    paused: false,
    base_atual: "quente",
  },
  {
    id: "4",
    nome: "Ana Paula",
    telefone: "(31) 92345-6789",
    wa_id: "5531923456789",
    origem: "Facebook",
    tags: ["novo"],
    observacao: "Primeiro contato",
    lote: "LOTE-002",
    paused: false,
    base_atual: "fria",
  },
  {
    id: "5",
    nome: "Carlos Mendes",
    telefone: "(47) 93456-7890",
    wa_id: "5547934567890",
    origem: "WhatsApp",
    tags: ["seguimento"],
    observacao: "Agendado para segunda",
    lote: "LOTE-003",
    paused: false,
    base_atual: "morna",
  },
];

export function BasesUI() {
  const [activeBase, setActiveBase] = useState<BaseType>("fria");
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
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

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => lead.base_atual === activeBase);
  }, [leads, activeBase]);

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
      lote: `LOTE-${String(leads.length + 1).padStart(3, "0")}`,
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

    // Simulando importação
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

  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.headerTitle}>Bases</h1>
            <p className={styles.headerSubtitle}>
              Base operacional de leads em diferentes estágios de aquecimento
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.button}
              onClick={() => setShowAddModal(true)}
            >
              + Adicionar lead
            </button>
            <button
              className={styles.button}
              onClick={() => setShowImportModal(true)}
            >
              ⬆ Importar lote
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Tabs */}
          <div className={styles.tabsContainer}>
            {(["fria", "morna", "quente"] as const).map((base) => (
              <button
                key={base}
                className={`${styles.tab} ${
                  activeBase === base ? styles.tabActive : ""
                }`}
                onClick={() => setActiveBase(base)}
              >
                Base {base.charAt(0).toUpperCase() + base.slice(1)}
              </button>
            ))}
          </div>

          {/* Leads List */}
          <div className={styles.leadsTable}>
            {filteredLeads.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum lead nesta base
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <div key={lead.id} className={styles.leadRow}>
                  {/* Nome */}
                  <div className={styles.leadCell}>
                    <span className={styles.leadCellLabel}>Nome</span>
                    <span className={styles.leadCellContent}>{lead.nome}</span>
                  </div>

                  {/* Telefone */}
                  <div className={styles.leadCell}>
                    <span className={styles.leadCellLabel}>Telefone</span>
                    <span className={styles.leadCellContent}>
                      {lead.telefone}
                    </span>
                    <span className={styles.leadCellMeta}>{lead.wa_id}</span>
                  </div>

                  {/* Origem e Tags */}
                  <div className={styles.leadCell}>
                    <span className={styles.leadCellLabel}>Origem</span>
                    <span className={styles.leadCellContent}>
                      {lead.origem}
                    </span>
                    {lead.tags.length > 0 && (
                      <div className={styles.tagsContainer}>
                        {lead.tags.map((tag, i) => (
                          <span key={i} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Observação */}
                  <div className={styles.leadCell}>
                    <span className={styles.leadCellLabel}>Observação</span>
                    <span className={styles.leadCellContent}>
                      {lead.observacao}
                    </span>
                  </div>

                  {/* Lote e Status */}
                  <div className={styles.leadCell}>
                    <span className={styles.leadCellLabel}>Lote</span>
                    <span className={styles.leadCellContent}>{lead.lote}</span>
                    <span
                      className={
                        lead.paused ? styles.statusPaused : styles.statusActive
                      }
                    >
                      {lead.paused ? "⏸ Pausado" : "✓ Ativo"}
                    </span>
                  </div>

                  {/* Ações */}
                  <div className={styles.leadActions}>
                    <button
                      className={styles.actionButton}
                      title="Chamar agora"
                      onClick={() => console.log("Chamar", lead.nome)}
                    >
                      📞
                    </button>
                    <button
                      className={styles.actionButton}
                      title={`Mover para base ${
                        {
                          fria: "morna",
                          morna: "quente",
                          quente: "fria",
                        }[activeBase]
                      }`}
                      onClick={() => handleMoveLead(lead.id)}
                    >
                      → {
                        {
                          fria: "M",
                          morna: "Q",
                          quente: "F",
                        }[activeBase]
                      }
                    </button>
                    <button
                      className={styles.actionButton}
                      title={lead.paused ? "Retomar" : "Pausar"}
                      onClick={() => handleTogglePause(lead.id)}
                    >
                      {lead.paused ? "▶" : "⏸"}
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
                ✕
              </button>
            </div>
            <form onSubmit={handleAddLead} className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label htmlFor="nome" className={styles.label}>
                  Nome *
                </label>
                <input
                  id="nome"
                  type="text"
                  className={styles.input}
                  value={newLead.nome}
                  onChange={(e) =>
                    setNewLead({ ...newLead, nome: e.target.value })
                  }
                  placeholder="Nome do lead"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="telefone" className={styles.label}>
                  Telefone *
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
                  WhatsApp ID (opcional)
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
                  <option value="Google">Google</option>
                  <option value="Facebook">Facebook</option>
                  <option value="WhatsApp">WhatsApp</option>
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
                onClick={(e) => handleAddLead(e as any)}
              >
                Adicionar
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
                ✕
              </button>
            </div>
            <form
              onSubmit={handleImportBatch}
              className={styles.modalContent}
            >
              <div className={styles.formGroup}>
                <label htmlFor="arquivo" className={styles.label}>
                  Arquivo CSV *
                </label>
                <input
                  id="arquivo"
                  type="file"
                  className={styles.input}
                  value={importData.arquivo}
                  onChange={(e) =>
                    setImportData({ ...importData, arquivo: e.target.value })
                  }
                  accept=".csv"
                  style={{ padding: "8px 12px" }}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="lote" className={styles.label}>
                  Identificação do lote *
                </label>
                <input
                  id="lote"
                  type="text"
                  className={styles.input}
                  value={importData.lote}
                  onChange={(e) =>
                    setImportData({ ...importData, lote: e.target.value })
                  }
                  placeholder="LOTE-001"
                />
              </div>
              <div className={styles.formGroup}>
                <p className={styles.leadCellMeta}>
                  💡 Dica: O lote será criado na base &quot;{activeBase}&quot;.
                  Você pode mover os leads após a importação.
                </p>
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
                onClick={(e) => handleImportBatch(e as any)}
              >
                Importar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
