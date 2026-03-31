"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { suggestCallNowMessage } from "./_callNowSuggest";

type LeadPool = "COLD_POOL" | "WARM_POOL" | "HOT_POOL";

type CrmLeadMetaRow = {
  wa_id: string;
  nome: string | null;
  telefone: string | null;
  lead_pool: LeadPool;
  lead_temp: "COLD" | "WARM" | "HOT";
  lead_source: string | null;
  tags: string[];
  obs_curta: string | null;
  import_ref: string | null;
  auto_outreach_enabled: boolean;
  is_paused: boolean;
  created_at: string | null;
  updated_at: string | null;
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
  action?: string;
  lead?: CrmLeadMetaRow;
  imported_count?: number;
  dispatch_mode?: string;
  selected_count?: number;
  sent_count?: number;
  total?: number;
  leads?: CrmLeadMetaRow[];
  [key: string]: unknown;
};

type ModalKind = "add_lead" | "import_base" | "move_base" | "warmup_base" | "call_now" | null;

const POOLS: { pool: LeadPool; label: string; accentColor: string }[] = [
  { pool: "COLD_POOL", label: "Base Fria", accentColor: "#3d7ef6" },
  { pool: "WARM_POOL", label: "Base Morna", accentColor: "#f6a03d" },
  { pool: "HOT_POOL", label: "Base Quente", accentColor: "#f64444" },
];

const POOL_LABEL: Record<LeadPool, string> = {
  COLD_POOL: "Fria",
  WARM_POOL: "Morna",
  HOT_POOL: "Quente",
};

const TEMP_COLOR: Record<string, string> = {
  COLD: "#3d7ef6",
  WARM: "#f6a03d",
  HOT: "#f64444",
};

function formatDate(input: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function s(style: React.CSSProperties): React.CSSProperties {
  return style;
}

/** Mirrors the server-side normalizePhoneToWaId logic for client-side preview. */
function phoneToWaId(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return "55" + digits;
  if (digits.length >= 7) return digits;
  return null;
}

/** Returns the best human-readable label for a lead: nome > telefone > wa_id. */
function leadLabel(lead: CrmLeadMetaRow): string {
  return lead.nome ?? lead.telefone ?? lead.wa_id;
}

export default function BasesPage() {
  const [activePool, setActivePool] = useState<LeadPool>("COLD_POOL");
  const [leads, setLeads] = useState<CrmLeadMetaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [moveTarget, setMoveTarget] = useState<CrmLeadMetaRow | null>(null);
  const [callNowTarget, setCallNowTarget] = useState<CrmLeadMetaRow | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Operational filters ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  const allOrigins = useMemo(() => {
    const seen = new Set<string>();
    for (const lead of leads) {
      if (lead.lead_source) seen.add(lead.lead_source);
    }
    return Array.from(seen).sort();
  }, [leads]);

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const lead of leads) {
      for (const tag of lead.tags ?? []) seen.add(tag);
    }
    return Array.from(seen).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (q) {
        const nameMatch = lead.nome?.toLowerCase().includes(q) ?? false;
        const phoneMatch = (lead.telefone ?? lead.wa_id).toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch) return false;
      }
      if (statusFilter === "active" && lead.is_paused) return false;
      if (statusFilter === "paused" && !lead.is_paused) return false;
      if (originFilter !== "all" && lead.lead_source !== originFilter) return false;
      if (tagFilter !== "all" && !(lead.tags ?? []).includes(tagFilter)) return false;
      return true;
    });
  }, [leads, searchQuery, statusFilter, originFilter, tagFilter]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setActionError(null);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 4000);
  }, []);

  const showActionError = useCallback((msg: string) => {
    setActionError(msg);
    setFeedback(null);
  }, []);

  const fetchLeads = useCallback(async (pool: LeadPool) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/bases?lead_pool=${pool}&limit=100`, { cache: "no-store" });
      const data = (await res.json()) as ApiLeadsPayload;
      if (!data.ok) {
        setLoadError(data.error ?? "Erro ao carregar leads");
        setLeads([]);
      } else {
        setLeads(data.leads ?? []);
      }
    } catch {
      setLoadError("Não foi possível carregar os leads");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeads(activePool);
  }, [activePool, fetchLeads]);

  const callAction = useCallback(
    async (payload: Record<string, unknown>): Promise<ApiActionPayload | null> => {
      try {
        const res = await fetch("/api/bases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        const data = (await res.json()) as ApiActionPayload;
        if (!data.ok) {
          showActionError(data.error ?? "Ação falhou");
          return null;
        }
        return data;
      } catch {
        showActionError("Erro de rede ao executar ação");
        return null;
      }
    },
    [showActionError],
  );

  const handlePauseResume = useCallback(
    async (lead: CrmLeadMetaRow) => {
      const action = lead.is_paused ? "resume_lead" : "pause_lead";
      const result = await callAction({ action, wa_id: lead.wa_id });
      if (result) {
        const lbl = leadLabel(lead);
        showFeedback(
          lead.is_paused ? `Lead ${lbl} retomado.` : `Lead ${lbl} pausado.`,
        );
        await fetchLeads(activePool);
      }
    },
    [callAction, showFeedback, fetchLeads, activePool],
  );

  const handleMoveOpen = useCallback((lead: CrmLeadMetaRow) => {
    setMoveTarget(lead);
    setModal("move_base");
    setActionError(null);
  }, []);

  const handleCallNowOpen = useCallback((lead: CrmLeadMetaRow) => {
    setCallNowTarget(lead);
    setModal("call_now");
    setActionError(null);
  }, []);

  const accent = POOLS.find((p) => p.pool === activePool)?.accentColor ?? "#3d7ef6";

  return (
    <main style={s({ display: "block", padding: "24px", minHeight: "100vh" })}>
      <div style={s({ width: "min(1200px, 100%)", margin: "0 auto" })}>
        {/* Header */}
        <div style={s({ marginBottom: "24px" })}>
          <div
            style={s({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            })}
          >
            <div>
              <h1 style={s({ margin: "0 0 4px", fontSize: "1.7rem", fontWeight: 700 })}>Bases</h1>
              <p style={s({ margin: 0, color: "#8896a7", fontSize: "0.9rem" })}>
                Gestão de leads por pool — Fase 1
              </p>
            </div>
            <div style={s({ display: "flex", gap: "8px", flexWrap: "wrap" })}>
              <a
                href="/dashboard"
                style={s({
                  color: "#8896a7",
                  textDecoration: "none",
                  fontSize: "0.85rem",
                  padding: "6px 10px",
                  border: "1px solid #2b3440",
                  borderRadius: "6px",
                  background: "#111821",
                })}
              >
                ← Dashboard
              </a>
              <ActionButton
                label="+ Adicionar Lead"
                onClick={() => {
                  setModal("add_lead");
                  setActionError(null);
                }}
                accent={accent}
              />
              <ActionButton
                label="↑ Importar Base"
                onClick={() => {
                  setModal("import_base");
                  setActionError(null);
                }}
                accent={accent}
              />
              <ActionButton
                label="🔥 Aquecer Base"
                onClick={() => {
                  setModal("warmup_base");
                  setActionError(null);
                }}
                accent={accent}
              />
            </div>
          </div>
        </div>

        {/* Feedback / Error */}
        {feedback && (
          <div
            style={s({
              background: "#0d2a18",
              border: "1px solid #1a5c33",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "16px",
              color: "#5ce89c",
              fontSize: "0.88rem",
            })}
          >
            {feedback}
          </div>
        )}
        {actionError && (
          <div
            style={s({
              background: "#2a0d0d",
              border: "1px solid #5c1a1a",
              borderRadius: "8px",
              padding: "10px 16px",
              marginBottom: "16px",
              color: "#f66",
              fontSize: "0.88rem",
            })}
          >
            Erro: {actionError}
          </div>
        )}

        {/* Tab Bar */}
        <div
          style={s({
            display: "flex",
            gap: "4px",
            marginBottom: "20px",
            borderBottom: "1px solid #2b3440",
            paddingBottom: "0",
          })}
        >
          {POOLS.map(({ pool, label, accentColor }) => {
            const isActive = pool === activePool;
            return (
              <button
                key={pool}
                onClick={() => setActivePool(pool)}
                style={s({
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${accentColor}` : "2px solid transparent",
                  color: isActive ? "#e6edf3" : "#8896a7",
                  cursor: "pointer",
                  fontSize: "0.93rem",
                  fontWeight: isActive ? 600 : 400,
                  padding: "10px 18px",
                  marginBottom: "-1px",
                  transition: "color 0.15s",
                })}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Operational Filters */}
        <div
          style={s({
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: "16px",
          })}
        >
          <input
            style={s({
              background: "#0f1620",
              border: "1px solid #2b3440",
              borderRadius: "6px",
              color: "#e6edf3",
              fontSize: "0.84rem",
              padding: "6px 10px",
              outline: "none",
              minWidth: "180px",
              flex: "1 1 180px",
              maxWidth: "260px",
            })}
            placeholder="Buscar nome ou telefone…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            style={s({
              background: "#0f1620",
              border: "1px solid #2b3440",
              borderRadius: "6px",
              color: "#e6edf3",
              fontSize: "0.84rem",
              padding: "6px 10px",
              cursor: "pointer",
              outline: "none",
            })}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "paused")}
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="paused">Pausados</option>
          </select>
          <select
            style={s({
              background: "#0f1620",
              border: "1px solid #2b3440",
              borderRadius: "6px",
              color: "#e6edf3",
              fontSize: "0.84rem",
              padding: "6px 10px",
              cursor: "pointer",
              outline: "none",
            })}
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
          >
            <option value="all">Todas as origens</option>
            {allOrigins.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select
            style={s({
              background: "#0f1620",
              border: "1px solid #2b3440",
              borderRadius: "6px",
              color: "#e6edf3",
              fontSize: "0.84rem",
              padding: "6px 10px",
              cursor: "pointer",
              outline: "none",
            })}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="all">Todas as tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {(searchQuery || statusFilter !== "all" || originFilter !== "all" || tagFilter !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setOriginFilter("all");
                setTagFilter("all");
              }}
              style={s({
                background: "none",
                border: "1px solid #2b3440",
                borderRadius: "6px",
                color: "#8896a7",
                cursor: "pointer",
                fontSize: "0.82rem",
                padding: "6px 10px",
              })}
            >
              ✕ Limpar filtros
            </button>
          )}
        </div>

        {/* Content */}
        <div
          style={s({
            border: "1px solid #2b3440",
            borderRadius: "10px",
            background: "#111821",
            overflow: "hidden",
          })}
        >
          {loading ? (
            <div
              style={s({
                padding: "48px",
                textAlign: "center",
                color: "#8896a7",
                fontSize: "0.9rem",
              })}
            >
              Carregando leads…
            </div>
          ) : loadError ? (
            <div
              style={s({
                padding: "48px",
                textAlign: "center",
                color: "#f66",
                fontSize: "0.9rem",
              })}
            >
              {loadError}
              <br />
              <button
                onClick={() => fetchLeads(activePool)}
                style={s({
                  marginTop: "12px",
                  background: "none",
                  border: "1px solid #2b3440",
                  borderRadius: "6px",
                  color: "#e6edf3",
                  cursor: "pointer",
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                })}
              >
                Tentar novamente
              </button>
            </div>
          ) : leads.length === 0 ? (
            <div
              style={s({
                padding: "48px",
                textAlign: "center",
                color: "#8896a7",
                fontSize: "0.9rem",
              })}
            >
              Nenhum lead nesta base ainda.
            </div>
          ) : filteredLeads.length === 0 ? (
            <div
              style={s({
                padding: "48px",
                textAlign: "center",
                color: "#8896a7",
                fontSize: "0.9rem",
              })}
            >
              Nenhum lead encontrado com os filtros atuais.
            </div>
          ) : (
            <div style={s({ overflowX: "auto" })}>
              <table
                style={s({ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" })}
              >
                <thead>
                  <tr style={s({ textAlign: "left", borderBottom: "1px solid #2b3440" })}>
                    <Th>Nome</Th>
                    <Th>Telefone</Th>
                    <Th>Temp.</Th>
                    <Th>Origem</Th>
                    <Th>Tags</Th>
                    <Th>Obs.</Th>
                    <Th>Status</Th>
                    <Th>Atualizado</Th>
                    <Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr key={lead.wa_id} style={s({ borderBottom: "1px solid #1a2230" })}>
                      <td style={s({ padding: "9px 10px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                        {lead.nome ? (
                          <span style={s({ color: "#e6edf3" })}>{lead.nome}</span>
                        ) : (
                          <span style={s({ color: "#3d4d5d" })}>—</span>
                        )}
                      </td>
                      <td style={s({ padding: "9px 10px", fontFamily: "monospace", fontSize: "0.83rem" })}>
                        {lead.telefone ?? (
                          <span style={s({ color: "#5d6e7e", fontSize: "0.78rem" })} title={lead.wa_id}>
                            {lead.wa_id}
                          </span>
                        )}
                      </td>
                      <td style={s({ padding: "9px 10px" })}>
                        <span
                          style={s({
                            color: TEMP_COLOR[lead.lead_temp] ?? "#e6edf3",
                            fontWeight: 600,
                            fontSize: "0.8rem",
                          })}
                        >
                          {lead.lead_temp}
                        </span>
                      </td>
                      <td style={s({ padding: "9px 10px", color: "#8896a7" })}>
                        {lead.lead_source ?? "—"}
                      </td>
                      <td style={s({ padding: "9px 10px" })}>
                        {lead.tags?.length > 0 ? (
                          <span
                            style={s({
                              fontSize: "0.78rem",
                              color: "#9aabba",
                              background: "#1a2230",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              display: "inline-block",
                              maxWidth: "140px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            })}
                            title={lead.tags.join(", ")}
                          >
                            {lead.tags.join(", ")}
                          </span>
                        ) : (
                          <span style={s({ color: "#3d4d5d" })}>—</span>
                        )}
                      </td>
                      <td
                        style={s({
                          padding: "9px 10px",
                          color: "#8896a7",
                          maxWidth: "160px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        })}
                        title={lead.obs_curta ?? ""}
                      >
                        {lead.obs_curta ?? "—"}
                      </td>
                      <td style={s({ padding: "9px 10px" })}>
                        <span
                          style={s({
                            color: lead.is_paused ? "#f6a03d" : "#5ce89c",
                            fontWeight: 600,
                            fontSize: "0.8rem",
                          })}
                        >
                          {lead.is_paused ? "pausado" : "ativo"}
                        </span>
                      </td>
                      <td style={s({ padding: "9px 10px", color: "#5d6e7e", fontSize: "0.78rem" })}>
                        {formatDate(lead.updated_at)}
                      </td>
                      <td style={s({ padding: "9px 10px" })}>
                        <div style={s({ display: "flex", gap: "6px" })}>
                          <button
                            onClick={() => handleMoveOpen(lead)}
                            style={s({
                              background: "none",
                              border: "1px solid #2b3440",
                              borderRadius: "5px",
                              color: "#e6edf3",
                              cursor: "pointer",
                              fontSize: "0.78rem",
                              padding: "3px 8px",
                            })}
                          >
                            Mover
                          </button>
                          <button
                            onClick={() => handlePauseResume(lead)}
                            style={s({
                              background: "none",
                              border: `1px solid ${lead.is_paused ? "#1a5c33" : "#5c2a00"}`,
                              borderRadius: "5px",
                              color: lead.is_paused ? "#5ce89c" : "#f6a03d",
                              cursor: "pointer",
                              fontSize: "0.78rem",
                              padding: "3px 8px",
                            })}
                          >
                            {lead.is_paused ? "Retomar" : "Pausar"}
                          </button>
                          <button
                            onClick={() => handleCallNowOpen(lead)}
                            disabled={lead.is_paused}
                            title={lead.is_paused ? "Lead pausado — retome antes de chamar" : "Chamar agora"}
                            style={s({
                              background: "none",
                              border: `1px solid ${lead.is_paused ? "#2b3440" : "#1a5c33"}`,
                              borderRadius: "5px",
                              color: lead.is_paused ? "#3d4d5d" : "#5ce89c",
                              cursor: lead.is_paused ? "not-allowed" : "pointer",
                              fontSize: "0.78rem",
                              padding: "3px 8px",
                              opacity: lead.is_paused ? 0.5 : 1,
                            })}
                          >
                            Chamar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !loadError && (
            <div
              style={s({
                padding: "10px 16px",
                borderTop: leads.length > 0 ? "1px solid #1a2230" : "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.82rem",
                color: "#5d6e7e",
              })}
            >
              <span>
                {filteredLeads.length !== leads.length
                  ? `${filteredLeads.length} de ${leads.length} lead${leads.length !== 1 ? "s" : ""}`
                  : `${leads.length} lead${leads.length !== 1 ? "s" : ""}`}{" "}
                — {POOLS.find((p) => p.pool === activePool)?.label}
              </span>
              <button
                onClick={() => fetchLeads(activePool)}
                style={s({
                  background: "none",
                  border: "none",
                  color: "#8896a7",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  padding: "4px 8px",
                })}
              >
                ↺ Atualizar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal === "add_lead" && (
        <AddLeadModal
          activePool={activePool}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            const result = await callAction({ action: "add_lead_manual", ...payload });
            if (result) {
              const lbl = (payload.nome as string | undefined) ?? (payload.telefone as string | undefined) ?? (payload.wa_id as string | undefined) ?? "Lead";
              showFeedback(`${lbl} adicionado com sucesso.`);
              setModal(null);
              await fetchLeads(activePool);
            }
          }}
        />
      )}
      {modal === "import_base" && (
        <ImportBaseModal
          activePool={activePool}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            const result = await callAction({ action: "import_base", ...payload });
            if (result) {
              showFeedback(
                `Importação concluída: ${result.imported_count ?? 0} lead(s) importado(s).`,
              );
              setModal(null);
              await fetchLeads(activePool);
            }
          }}
        />
      )}
      {modal === "move_base" && moveTarget && (
        <MoveBaseModal
          lead={moveTarget}
          onClose={() => {
            setModal(null);
            setMoveTarget(null);
          }}
          onSubmit={async (payload) => {
            const result = await callAction({
              action: "move_base",
              wa_id: moveTarget.wa_id,
              ...payload,
            });
            if (result) {
              showFeedback(
                `Lead ${leadLabel(moveTarget)} movido para ${POOL_LABEL[payload.lead_pool as LeadPool] ?? payload.lead_pool}.`,
              );
              setModal(null);
              setMoveTarget(null);
              await fetchLeads(activePool);
            }
          }}
        />
      )}
      {modal === "warmup_base" && (
        <WarmupBaseModal
          activePool={activePool}
          onClose={() => setModal(null)}
          callAction={callAction}
          onDone={(msg) => {
            showFeedback(msg);
            setModal(null);
          }}
        />
      )}
      {modal === "call_now" && callNowTarget && (
        <CallNowModal
          lead={callNowTarget}
          onClose={() => {
            setModal(null);
            setCallNowTarget(null);
          }}
          onSubmit={async (text) => {
            const result = await callAction({ action: "call_now", wa_id: callNowTarget.wa_id, text });
            if (result) {
              showFeedback(`Mensagem enviada para ${leadLabel(callNowTarget)}.`);
              setModal(null);
              setCallNowTarget(null);
            }
          }}
        />
      )}
    </main>
  );
}

// ─── Small shared components ────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "10px 10px",
        fontWeight: 600,
        fontSize: "0.8rem",
        color: "#8896a7",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        background: "#0f1620",
      }}
    >
      {children}
    </th>
  );
}

function ActionButton({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: `1px solid ${accent}`,
        borderRadius: "7px",
        color: accent,
        cursor: "pointer",
        fontSize: "0.85rem",
        fontWeight: 600,
        padding: "7px 14px",
        transition: "background 0.12s",
      }}
    >
      {label}
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "24px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#111821",
          border: "1px solid #2b3440",
          borderRadius: "12px",
          padding: "24px",
          width: "min(480px, 100%)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#8896a7",
              cursor: "pointer",
              fontSize: "1.2rem",
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.82rem",
          color: "#8896a7",
          marginBottom: "4px",
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0f1620",
  border: "1px solid #2b3440",
  borderRadius: "6px",
  color: "#e6edf3",
  fontSize: "0.88rem",
  padding: "8px 10px",
  outline: "none",
};

const submitStyle: React.CSSProperties = {
  background: "#1a2d4a",
  border: "1px solid #3d7ef6",
  borderRadius: "7px",
  color: "#3d7ef6",
  cursor: "pointer",
  fontSize: "0.88rem",
  fontWeight: 600,
  padding: "9px 20px",
  marginTop: "6px",
};

// ─── Add Lead Modal ──────────────────────────────────────────────────────────

function AddLeadModal({
  activePool,
  onClose,
  onSubmit,
}: {
  activePool: LeadPool;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [leadPool, setLeadPool] = useState<LeadPool>(activePool);
  const [tags, setTags] = useState("");
  const [obsCurta, setObsCurta] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [busy, setBusy] = useState(false);

  const derivedWaId = telefone.trim() ? phoneToWaId(telefone.trim()) : null;
  const canSubmit = telefone.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    await onSubmit({
      nome: nome.trim() || undefined,
      telefone: telefone.trim(),
      lead_pool: leadPool,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      obs_curta: obsCurta.trim() || undefined,
      lead_source: leadSource.trim() || undefined,
    });
    setBusy(false);
  };

  return (
    <ModalShell title="Adicionar Lead" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Nome">
          <input
            style={inputStyle}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo (opcional)"
          />
        </Field>
        <Field label="Telefone *">
          <input
            style={inputStyle}
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="11 99999-0001"
            required
          />
          {derivedWaId && (
            <span style={{ fontSize: "0.78rem", color: "#5d6e7e", marginTop: "3px", display: "block" }}>
              WA ID: <code style={{ color: "#8896a7" }}>{derivedWaId}</code>
            </span>
          )}
        </Field>
        <Field label="Base">
          <select
            style={inputStyle}
            value={leadPool}
            onChange={(e) => setLeadPool(e.target.value as LeadPool)}
          >
            {POOLS.map(({ pool, label }) => (
              <option key={pool} value={pool}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tags (separadas por vírgula)">
          <input
            style={inputStyle}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="manual, frio"
          />
        </Field>
        <Field label="Observação curta">
          <input
            style={inputStyle}
            value={obsCurta}
            onChange={(e) => setObsCurta(e.target.value)}
            placeholder="Opcional"
          />
        </Field>
        <Field label="Origem">
          <input
            style={inputStyle}
            value={leadSource}
            onChange={(e) => setLeadSource(e.target.value)}
            placeholder="manual / indicação / etc."
          />
        </Field>
        <button type="submit" style={submitStyle} disabled={busy || !canSubmit}>
          {busy ? "Salvando…" : "Adicionar Lead"}
        </button>
      </form>
    </ModalShell>
  );
}

// ─── Import Base Modal ───────────────────────────────────────────────────────

const IMPORT_POOL_NAMES = new Set<string>(["COLD_POOL", "WARM_POOL", "HOT_POOL"]);
const IMPORT_HEADER_TOKENS = new Set<string>(["nome", "name", "telefone", "phone", "fone", "wa_id", "waid"]);

/**
 * Parse import text into lead records.
 *
 * Supported line formats (one per line, CSV or plain):
 *   Format A (backward compat): wa_id_or_phone[,POOL]
 *     e.g. "5511999990001" or "5511999990001,HOT_POOL"
 *   Format B (human-friendly):  nome,telefone[,POOL][,origem][,tags separadas por ;]
 *     e.g. "João Silva,11 99999-0001" or "Maria,11988880002,WARM_POOL,indicação"
 *
 * Header rows (first token matches common header words) are automatically skipped.
 */
function parseImportLines(text: string, defaultPool: LeadPool): Array<Record<string, unknown>> {
  const leads: Array<Record<string, unknown>> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const firstLower = (parts[0] ?? "").toLowerCase();
    // Skip header rows
    if (IMPORT_HEADER_TOKENS.has(firstLower)) continue;

    const firstDigits = parts[0].replace(/\D/g, "");
    const firstLooksLikePhone = firstDigits.length >= 7 && /^[\d\s\-\(\)\+\.]+$/.test(parts[0]);

    if (parts.length === 1 || firstLooksLikePhone) {
      // Format A: bare phone/wa_id [,POOL]
      const poolRaw = parts[1] ?? "";
      const pool = IMPORT_POOL_NAMES.has(poolRaw) ? (poolRaw as LeadPool) : defaultPool;
      leads.push({ wa_id: parts[0], lead_pool: pool });
    } else {
      // Format B: nome,telefone[,POOL][,origem][,tags;separadas;por;ponto-e-vírgula]
      const nome = parts[0];
      const telefone = parts[1] ?? "";
      const poolRaw = parts[2] ?? "";
      const pool = IMPORT_POOL_NAMES.has(poolRaw) ? (poolRaw as LeadPool) : defaultPool;
      const origem = parts[3] ?? "";
      const tagsRaw = parts[4] ?? "";
      leads.push({
        nome: nome || undefined,
        telefone: telefone || undefined,
        lead_pool: pool,
        lead_source: origem || undefined,
        tags: tagsRaw ? tagsRaw.split(";").map((t) => t.trim()).filter(Boolean) : [],
      });
    }
  }
  return leads;
}

function ImportBaseModal({
  activePool,
  onClose,
  onSubmit,
}: {
  activePool: LeadPool;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [importRef, setImportRef] = useState(`import-${new Date().toISOString().slice(0, 10)}`);
  const [rawLeads, setRawLeads] = useState("");
  const [defaultPool, setDefaultPool] = useState<LeadPool>(activePool);
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") setRawLeads(text);
    };
    reader.readAsText(file, "utf-8");
    // Reset so the same file can be re-selected after clearing
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setParseError(null);

    const leads = parseImportLines(rawLeads, defaultPool);

    if (leads.length === 0) {
      setParseError("Insira pelo menos um lead (telefone ou wa_id)");
      return;
    }

    setBusy(true);
    await onSubmit({ import_ref: importRef.trim() || undefined, leads });
    setBusy(false);
  };

  return (
    <ModalShell title="Importar Base" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Field label="Referência de importação">
          <input
            style={inputStyle}
            value={importRef}
            onChange={(e) => setImportRef(e.target.value)}
            placeholder="import-2026-03-30"
          />
        </Field>
        <Field label="Base padrão">
          <select
            style={inputStyle}
            value={defaultPool}
            onChange={(e) => setDefaultPool(e.target.value as LeadPool)}
          >
            {POOLS.map(({ pool, label }) => (
              <option key={pool} value={pool}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Arquivo .txt ou .csv">
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              style={{
                ...inputStyle,
                cursor: "pointer",
                width: "auto",
                padding: "7px 14px",
                color: "#8896a7",
                fontSize: "0.82rem",
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              Escolher arquivo…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <span style={{ fontSize: "0.78rem", color: "#5d6e7e" }}>
              O conteúdo do arquivo será carregado abaixo
            </span>
          </div>
        </Field>
        <Field label="Leads (cole o texto ou use o arquivo acima)">
          <textarea
            style={{ ...inputStyle, height: "120px", resize: "vertical", fontFamily: "monospace", fontSize: "0.8rem" }}
            value={rawLeads}
            onChange={(e) => setRawLeads(e.target.value)}
            placeholder={
              "Formatos aceitos (um por linha):\n" +
              "  nome,telefone          → João Silva,11 99999-0001\n" +
              "  nome,telefone,BASE     → Maria,11988880002,WARM_POOL\n" +
              "  telefone               → 5511999990001\n" +
              "  telefone,BASE          → 5511999990003,HOT_POOL"
            }
          />
        </Field>
        {parseError && (
          <p style={{ color: "#f66", fontSize: "0.83rem", margin: "0 0 10px" }}>{parseError}</p>
        )}
        <button type="submit" style={submitStyle} disabled={busy}>
          {busy ? "Importando…" : "Importar Base"}
        </button>
      </form>
    </ModalShell>
  );
}

// ─── Move Base Modal ─────────────────────────────────────────────────────────

function MoveBaseModal({
  lead,
  onClose,
  onSubmit,
}: {
  lead: CrmLeadMetaRow;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const otherPools = POOLS.filter((p) => p.pool !== lead.lead_pool);
  const [targetPool, setTargetPool] = useState<LeadPool>(otherPools[0]?.pool ?? "WARM_POOL");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onSubmit({ lead_pool: targetPool });
    setBusy(false);
  };

  return (
    <ModalShell title={`Mover Lead — ${leadLabel(lead)}`} onClose={onClose}>
      <p style={{ color: "#8896a7", fontSize: "0.87rem", margin: "0 0 16px" }}>
        Base atual:{" "}
        <strong style={{ color: "#e6edf3" }}>{POOL_LABEL[lead.lead_pool] ?? lead.lead_pool}</strong>
      </p>
      <form onSubmit={handleSubmit}>
        <Field label="Mover para">
          <select
            style={inputStyle}
            value={targetPool}
            onChange={(e) => setTargetPool(e.target.value as LeadPool)}
          >
            {otherPools.map(({ pool, label }) => (
              <option key={pool} value={pool}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" style={submitStyle} disabled={busy}>
          {busy ? "Movendo…" : "Confirmar Mover"}
        </button>
      </form>
    </ModalShell>
  );
}

// ─── Warmup Base Modal ───────────────────────────────────────────────────────

type WarmupStep = "config" | "preview" | "result";

type WarmupSummary = {
  baseName: string;
  selected: number;
  sent: number;
  failed: number;
};

function warmupStateLabel(summary: WarmupSummary): { label: string; color: string } {
  if (summary.selected === 0) return { label: "Nenhuma elegibilidade", color: "#f6a03d" };
  if (summary.sent === 0) return { label: "Falha total", color: "#f66" };
  if (summary.failed === 0) return { label: "Sucesso total", color: "#5ce89c" };
  return { label: "Sucesso parcial", color: "#f6a03d" };
}

function WarmupBaseModal({
  activePool,
  onClose,
  callAction,
  onDone,
}: {
  activePool: LeadPool;
  onClose: () => void;
  callAction: (payload: Record<string, unknown>) => Promise<ApiActionPayload | null>;
  onDone: (message: string) => void;
}) {
  const [step, setStep] = useState<WarmupStep>("config");
  const [leadPool, setLeadPool] = useState<LeadPool>(activePool);
  const [limit, setLimit] = useState("10");
  const [busy, setBusy] = useState(false);
  const [previewLeads, setPreviewLeads] = useState<CrmLeadMetaRow[]>([]);
  const [dispatchText, setDispatchText] = useState("");
  const [summary, setSummary] = useState<WarmupSummary | null>(null);

  const handleSelect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await callAction({ action: "warmup_base", lead_pool: leadPool, limit: Number(limit) });
    setBusy(false);
    if (!result) return;
    const leads = (result.leads ?? []) as CrmLeadMetaRow[];
    setPreviewLeads(leads);
    setDispatchText(suggestCallNowMessage(leadPool, null));
    setStep("preview");
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const waIds = previewLeads.map((l) => l.wa_id);
    const result = await callAction({ action: "warmup_dispatch", wa_ids: waIds, text: dispatchText.trim() });
    setBusy(false);
    if (!result) return;
    const sentCount = typeof result.sent_count === "number" ? result.sent_count : 0;
    const totalCount = typeof result.total === "number" ? result.total : waIds.length;
    setSummary({
      baseName: POOL_LABEL[leadPool] ?? leadPool,
      selected: previewLeads.length,
      sent: sentCount,
      failed: totalCount - sentCount,
    });
    setStep("result");
  };

  return (
    <ModalShell title="Aquecer Base" onClose={onClose}>
      {step === "config" && (
        <form onSubmit={handleSelect}>
          <p style={{ color: "#8896a7", fontSize: "0.87rem", margin: "0 0 16px" }}>
            Selecione os parâmetros para buscar leads elegíveis.
          </p>
          <Field label="Base">
            <select
              style={inputStyle}
              value={leadPool}
              onChange={(e) => setLeadPool(e.target.value as LeadPool)}
            >
              {POOLS.map(({ pool, label }) => (
                <option key={pool} value={pool}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Limite de leads (1–50)">
            <input
              style={inputStyle}
              type="number"
              min="1"
              max="50"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
          <button type="submit" style={submitStyle} disabled={busy}>
            {busy ? "Buscando…" : "Buscar Leads Elegíveis"}
          </button>
        </form>
      )}

      {step === "preview" && (
        <form onSubmit={handleDispatch}>
          <p style={{ color: "#8896a7", fontSize: "0.87rem", margin: "0 0 12px" }}>
            {previewLeads.length === 0
              ? "Nenhum lead elegível encontrado para esta base."
              : `${previewLeads.length} lead(s) elegível(is) — revise a mensagem e confirme o envio.`}
          </p>

          {previewLeads.length > 0 && (
            <div
              style={{
                background: "#0a1420",
                border: "1px solid #1e2d3d",
                borderRadius: "6px",
                padding: "8px 10px",
                marginBottom: "14px",
                maxHeight: "140px",
                overflowY: "auto",
              }}
            >
              {previewLeads.map((lead) => (
                <div
                  key={lead.wa_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderBottom: "1px solid #1a2230",
                    fontSize: "0.82rem",
                    color: "#c8d4e0",
                  }}
                >
                  <span>{leadLabel(lead)}</span>
                  <span style={{ color: TEMP_COLOR[lead.lead_temp] ?? "#8896a7" }}>
                    {lead.lead_temp}
                  </span>
                </div>
              ))}
            </div>
          )}

          {previewLeads.length > 0 && (
            <Field label="Mensagem *">
              <textarea
                style={{ ...inputStyle, resize: "vertical", minHeight: "90px" }}
                value={dispatchText}
                onChange={(e) => setDispatchText(e.target.value)}
                placeholder="Digite a mensagem a ser enviada…"
                disabled={busy}
              />
            </Field>
          )}

          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              type="button"
              style={{ ...submitStyle, color: "#8896a7", borderColor: "#2b3440" }}
              onClick={() => setStep("config")}
              disabled={busy}
            >
              ← Voltar
            </button>
            {previewLeads.length > 0 && (
              <button
                type="submit"
                style={submitStyle}
                disabled={busy || dispatchText.trim().length === 0}
              >
                {busy ? "Enviando…" : `Confirmar e Enviar ${previewLeads.length} lead(s)`}
              </button>
            )}
          </div>
        </form>
      )}

      {step === "result" && summary && (() => {
        const { label: stateLabel, color: stateColor } = warmupStateLabel(summary);
        const doneMsg = `Warmup base ${summary.baseName}: ${summary.sent} de ${summary.selected} enviados.`;
        return (
          <div>
            <div
              style={{
                background: "#0a1420",
                border: "1px solid #1e2d3d",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "0.82rem",
                  color: "#8896a7",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Resultado do aquecimento
              </div>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: stateColor,
                  marginBottom: "14px",
                }}
              >
                {stateLabel}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.87rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#8896a7" }}>Base aquecida</span>
                  <span style={{ color: "#e6edf3", fontWeight: 600 }}>{summary.baseName}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#8896a7" }}>Leads selecionados</span>
                  <span style={{ color: "#e6edf3" }}>{summary.selected}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#8896a7" }}>Enviados com sucesso</span>
                  <span style={{ color: "#5ce89c", fontWeight: 600 }}>{summary.sent}</span>
                </div>
                {summary.failed > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#8896a7" }}>Falhas no envio</span>
                    <span style={{ color: "#f66", fontWeight: 600 }}>{summary.failed}</span>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              style={submitStyle}
              onClick={() => onDone(doneMsg)}
            >
              Fechar
            </button>
          </div>
        );
      })()}
    </ModalShell>
  );
}

// ─── Call Now Modal ──────────────────────────────────────────────────────────

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
  const isDirty = text !== suggested;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    await onSubmit(text.trim());
    setBusy(false);
  };

  return (
    <ModalShell title={`Chamar agora — ${leadLabel(lead)}`} onClose={onClose}>
      {lead.is_paused && (
        <div
          style={{
            background: "#2a1a00",
            border: "1px solid #5c3a00",
            borderRadius: "6px",
            padding: "10px 14px",
            marginBottom: "14px",
            color: "#f6a03d",
            fontSize: "0.85rem",
          }}
        >
          Lead pausado — retome o lead antes de chamar.
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <Field label="Mensagem *">
          <textarea
            style={{ ...inputStyle, resize: "vertical", minHeight: "90px" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite a mensagem a ser enviada…"
            disabled={lead.is_paused || busy}
          />
        </Field>
        {isDirty && !lead.is_paused && (
          <button
            type="button"
            onClick={() => setText(suggested)}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: "0.8rem",
              padding: "0 0 12px 0",
              textDecoration: "underline",
            }}
          >
            Restaurar sugestão
          </button>
        )}
        <button
          type="submit"
          style={{
            ...submitStyle,
            ...(lead.is_paused ? { opacity: 0.5, cursor: "not-allowed" } : {}),
          }}
          disabled={busy || !canSubmit || lead.is_paused}
        >
          {busy ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </ModalShell>
  );
}
