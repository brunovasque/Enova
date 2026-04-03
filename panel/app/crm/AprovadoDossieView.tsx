"use client";

/**
 * AprovadoDossieView — Dossiê do Aprovado (full-page detail view)
 *
 * Renders the consolidated dossier of an approved client,
 * organized in 7 canonical blocks per the CRM operational contract.
 *
 * Data contract:
 *   All fields come from the CrmLeadRow type (crm_leads_v1 view).
 *   Fields that don't exist yet show safe fallback ("Não informado").
 *   No mock data — only real fields from the existing view.
 */

import styles from "./aprovado-dossie.module.css";

/* ── Re-use the CrmLeadRow type from CrmUI (inline to avoid circular deps) ── */
export type DossieLeadRow = {
  wa_id: string;
  nome: string | null;
  telefone: string | null;
  origem: string | null;
  lead_pool: string | null;
  lead_temp: string | null;
  fase_funil: string | null;
  status_funil: string | null;
  status_docs_funil: string | null;
  aprovado_funil: boolean | null;
  reprovado_funil: boolean | null;
  visita_confirmada_funil: boolean | null;
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
  tem_incidente_aberto: boolean | null;
  tipo_incidente: string | null;
  severidade_incidente: string | null;
};

/* ── Helpers ── */

const FALLBACK = "Não informado";
const FALLBACK_AGUARDANDO = "Aguardando retorno";

function txt(value: string | null | undefined): string {
  return value ?? FALLBACK;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return FALLBACK;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return FALLBACK;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return FALLBACK;
  }
}

function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return FALLBACK;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return FALLBACK;
  }
}

function boolLabel(value: boolean | null | undefined): { text: string; className: string } {
  if (value === null || value === undefined) return { text: FALLBACK, className: styles.boolUnknown };
  return value
    ? { text: "Sim", className: styles.boolYes }
    : { text: "Não", className: styles.boolNo };
}

function getApprovalLabel(status: string | null): string {
  if (!status) return FALLBACK;
  const labels: Record<string, string> = {
    APPROVED_HIGH: "Aprovado (alto)",
    APPROVED_LOW: "Aprovado (baixo)",
  };
  return labels[status] ?? status;
}

function getBaseLabel(pool: string | null): string {
  if (!pool) return FALLBACK;
  switch (pool) {
    case "COLD_POOL": return "Fria";
    case "WARM_POOL": return "Morna";
    case "HOT_POOL": return "Quente";
    default: return pool;
  }
}

function getCorrespondente(lead: DossieLeadRow): string {
  return lead.correspondente_retorno ?? lead.parceiro_analise ?? FALLBACK;
}

function getFaseLabel(lead: DossieLeadRow): string {
  if (lead.aprovado_funil || lead.status_funil === "aprovado_correspondente") return "Aprovado";
  if (lead.status_analise === "APPROVED_HIGH") return "Aprovado (alto)";
  if (lead.status_analise === "APPROVED_LOW") return "Aprovado (baixo)";
  return lead.fase_funil ?? FALLBACK;
}

function getNextActionLabel(lead: DossieLeadRow): string {
  if (lead.proximo_passo_aprovado) {
    const labels: Record<string, string> = {
      VISIT: "Pronto para visita",
      NEGOTIATION: "Em negociação",
      FOLLOW_UP: "Aguardando follow-up",
      DROP: "Descartado",
    };
    return labels[lead.proximo_passo_aprovado] ?? lead.proximo_passo_aprovado;
  }
  if (lead.proxima_acao_reserva) return lead.proxima_acao_reserva;
  if (lead.status_visita) return `Visita: ${lead.status_visita}`;
  return FALLBACK_AGUARDANDO;
}

/* ── Component ── */

interface AprovadoDossieViewProps {
  lead: DossieLeadRow;
  onBack: () => void;
}

export function AprovadoDossieView({ lead, onBack }: AprovadoDossieViewProps) {
  const fgtsBool = boolLabel(lead.possui_fgts_analise);
  const restricaoTitular = boolLabel(lead.possui_restricao_analise);
  const restricaoParceiro = boolLabel(lead.possui_restricao_parceiro_analise);
  const irTitular = boolLabel(lead.possui_ir_titular_analise);
  const irParceiro = boolLabel(lead.possui_ir_parceiro_analise);
  const ctps36Titular = boolLabel(lead.ctps_36_titular_analise);
  const ctps36Parceiro = boolLabel(lead.ctps_36_parceiro_analise);

  /* Build timeline items from available dates */
  const timelineItems: { label: string; date: string | null }[] = [];
  if (lead.data_envio_analise) {
    timelineItems.push({ label: "Envio ao correspondente", date: lead.data_envio_analise });
  }
  if (lead.data_retorno_analise) {
    timelineItems.push({ label: "Retorno do correspondente", date: lead.data_retorno_analise });
  }
  if (lead.status_analise?.startsWith("APPROVED")) {
    timelineItems.push({ label: `Aprovação — ${getApprovalLabel(lead.status_analise)}`, date: lead.data_retorno_analise });
  }
  if (lead.ultimo_contato_aprovado) {
    timelineItems.push({ label: "Último contato (aprovado)", date: lead.ultimo_contato_aprovado });
  }
  if (lead.atualizado_em) {
    timelineItems.push({ label: "Última atualização CRM", date: lead.atualizado_em });
  }

  /* Sort timeline by date descending (most recent first) */
  timelineItems.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  return (
    <div className={styles.dossiePage}>
      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          ← Voltar
        </button>
        <div>
          <h1 className={styles.topBarTitle}>Dossiê do Aprovado</h1>
          <p className={styles.topBarSubtitle}>
            {lead.nome ?? lead.wa_id} — Consolidação operacional
          </p>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className={styles.dossieBody}>
        {/* ═══════════════════════════════════════
           BLOCO 1 — CABEÇALHO
           ═══════════════════════════════════════ */}
        <div className={styles.headerCard}>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Cliente</span>
            <span className={styles.headerItemValue}>{lead.nome ?? lead.wa_id}</span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Telefone</span>
            <span className={styles.headerItemValue}>{lead.telefone ?? lead.wa_id}</span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Origem / Base</span>
            <span className={styles.headerItemValue}>
              {lead.origem ?? FALLBACK} · {getBaseLabel(lead.lead_pool)}
            </span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Status</span>
            <span className={`${styles.statusBadge} ${styles.statusApproved}`}>
              ● {getApprovalLabel(lead.status_analise)}
            </span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Data da aprovação</span>
            <span className={lead.data_retorno_analise ? styles.headerItemValue : styles.headerItemValueMuted}>
              {formatDateLong(lead.data_retorno_analise)}
            </span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Correspondente</span>
            <span className={lead.correspondente_retorno || lead.parceiro_analise ? styles.headerItemValue : styles.headerItemValueMuted}>
              {getCorrespondente(lead)}
            </span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Fase atual</span>
            <span className={styles.headerItemValue}>{getFaseLabel(lead)}</span>
          </div>
          <div className={styles.headerItem}>
            <span className={styles.headerItemLabel}>Faixa</span>
            <span className={lead.faixa_aprovacao ? styles.headerItemValue : styles.headerItemValueMuted}>
              {lead.faixa_aprovacao ? `Faixa ${lead.faixa_aprovacao}` : FALLBACK}
            </span>
          </div>
        </div>

        {/* ── Blocks grid ── */}
        <div className={styles.blocksGrid}>

          {/* ═══════════════════════════════════════
             BLOCO 2 — PERFIL DO CLIENTE (ENOVA)
             ═══════════════════════════════════════ */}
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>👤</span>
              <h3 className={styles.blockTitle}>Perfil do Cliente</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.detailGrid}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Tipo de perfil</span>
                  <span className={lead.tipo_perfil_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.tipo_perfil_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Estado civil</span>
                  <span className={lead.estado_civil_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.estado_civil_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Composição</span>
                  <span className={lead.tipo_composicao_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.tipo_composicao_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Dependentes</span>
                  <span className={lead.quantidade_dependentes_analise !== null ? styles.fieldValue : styles.fieldValueMuted}>
                    {lead.quantidade_dependentes_analise !== null && lead.quantidade_dependentes_analise !== undefined
                      ? String(lead.quantidade_dependentes_analise)
                      : FALLBACK}
                  </span>
                </div>

                {/* Participantes */}
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Titular</span>
                  <span className={lead.nome_titular_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.nome_titular_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Parceiro(a)</span>
                  <span className={lead.nome_parceiro_analise_snapshot ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.nome_parceiro_analise_snapshot)}
                  </span>
                </div>

                {/* Regime de trabalho */}
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Regime trabalho (titular)</span>
                  <span className={lead.regime_trabalho_titular_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.regime_trabalho_titular_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Regime trabalho (parceiro)</span>
                  <span className={lead.regime_trabalho_parceiro_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.regime_trabalho_parceiro_analise)}
                  </span>
                </div>

                {/* Renda */}
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Renda titular</span>
                  <span className={lead.renda_titular_analise ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.renda_titular_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Renda parceiro</span>
                  <span className={lead.renda_parceiro_analise ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.renda_parceiro_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Renda familiar</span>
                  <span className={lead.renda_familiar_analise ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.renda_familiar_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Renda total</span>
                  <span className={lead.renda_total_analise ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.renda_total_analise)}
                  </span>
                </div>

                {/* Boolean flags */}
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>IR titular</span>
                  <span className={`${styles.boolBadge} ${irTitular.className}`}>{irTitular.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>IR parceiro</span>
                  <span className={`${styles.boolBadge} ${irParceiro.className}`}>{irParceiro.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Restrição titular</span>
                  <span className={`${styles.boolBadge} ${restricaoTitular.className}`}>{restricaoTitular.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Restrição parceiro</span>
                  <span className={`${styles.boolBadge} ${restricaoParceiro.className}`}>{restricaoParceiro.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>CTPS 36 meses (titular)</span>
                  <span className={`${styles.boolBadge} ${ctps36Titular.className}`}>{ctps36Titular.text}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>CTPS 36 meses (parceiro)</span>
                  <span className={`${styles.boolBadge} ${ctps36Parceiro.className}`}>{ctps36Parceiro.text}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 3 — RESUMO FINANCEIRO
             ═══════════════════════════════════════ */}
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>💰</span>
              <h3 className={styles.blockTitle}>Resumo Financeiro da Aprovação</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.detailGrid}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Valor imóvel desejado</span>
                  <span className={lead.ticket_desejado_analise ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.ticket_desejado_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Valor financiamento aprovado</span>
                  <span className={lead.valor_financiamento_aprovado ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.valor_financiamento_aprovado)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Entrada / Ato</span>
                  <span className={lead.valor_entrada_informada || lead.valor_entrada_analise ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.valor_entrada_informada ?? lead.valor_entrada_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Subsídio federal</span>
                  <span className={lead.valor_subsidio_aprovado ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.valor_subsidio_aprovado)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>FGTS</span>
                  <span className={`${styles.boolBadge} ${fgtsBool.className}`}>
                    {fgtsBool.text}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Parcela estimada</span>
                  <span className={lead.valor_parcela_informada ? styles.fieldValueHighlight : styles.fieldValueMuted}>
                    {formatCurrency(lead.valor_parcela_informada)}
                  </span>
                </div>

                {/* Fields not yet structured — safe fallback */}
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Prazo</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Taxa</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Banco</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Tipo de aprovação</span>
                  <span className={lead.status_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {getApprovalLabel(lead.status_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Objetivo imóvel</span>
                  <span className={lead.objetivo_imovel_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.objetivo_imovel_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Data retorno/aprovação</span>
                  <span className={lead.data_retorno_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {formatDate(lead.data_retorno_analise)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 4 — CONDIÇÕES / PENDÊNCIAS
             ═══════════════════════════════════════ */}
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>📋</span>
              <h3 className={styles.blockTitle}>Condições / Pendências</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.detailGrid}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Status da aprovação</span>
                  <span className={lead.status_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {getApprovalLabel(lead.status_analise)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Aderência ao produto</span>
                  <span className={lead.aderencia_aprovacao ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.aderencia_aprovacao)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Validade da aprovação</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Condicionantes</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Correspondente</span>
                  <span className={lead.correspondente_retorno || lead.parceiro_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {getCorrespondente(lead)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Último contato</span>
                  <span className={lead.ultimo_contato_aprovado ? styles.fieldValue : styles.fieldValueMuted}>
                    {formatDate(lead.ultimo_contato_aprovado)}
                  </span>
                </div>
                <div className={styles.fieldItemFull}>
                  <span className={styles.fieldLabel}>Resumo do retorno</span>
                  <span className={lead.resumo_retorno_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.resumo_retorno_analise)}
                  </span>
                </div>
                <div className={styles.fieldItemFull}>
                  <span className={styles.fieldLabel}>Motivo do retorno</span>
                  <span className={lead.motivo_retorno_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.motivo_retorno_analise)}
                  </span>
                </div>
                <div className={styles.fieldItemFull}>
                  <span className={styles.fieldLabel}>Nota de ajuste</span>
                  <span className={lead.nota_ajuste_analise ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.nota_ajuste_analise)}
                  </span>
                </div>
                {lead.retorno_bruto_correspondente && (
                  <div className={styles.fieldItemFull}>
                    <span className={styles.fieldLabel}>Observações do correspondente (retorno bruto)</span>
                    <span className={styles.fieldValue}>{lead.retorno_bruto_correspondente}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 5 — DOCUMENTAÇÃO / PASTA
             ═══════════════════════════════════════ */}
          <div className={styles.block}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>📁</span>
              <h3 className={styles.blockTitle}>Documentação / Pasta</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.detailGrid}>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Status documentação</span>
                  <span className={lead.status_docs_funil ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.status_docs_funil)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Fase funil (docs)</span>
                  <span className={lead.fase_funil ? styles.fieldValue : styles.fieldValueMuted}>
                    {txt(lead.fase_funil)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Documentos recebidos</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Documentos pendentes</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Última atualização</span>
                  <span className={lead.atualizado_em ? styles.fieldValue : styles.fieldValueMuted}>
                    {formatDate(lead.atualizado_em)}
                  </span>
                </div>
                <div className={styles.fieldItem}>
                  <span className={styles.fieldLabel}>Links / Evidências</span>
                  <span className={styles.fieldValueMuted}>{FALLBACK}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 6 — HISTÓRICO OPERACIONAL
             ═══════════════════════════════════════ */}
          <div className={`${styles.block} ${styles.blockFull}`}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>🕐</span>
              <h3 className={styles.blockTitle}>Histórico Operacional</h3>
            </div>
            <div className={styles.blockBody}>
              {timelineItems.length === 0 ? (
                <p className={styles.timelineEmpty}>Nenhum evento registrado ainda.</p>
              ) : (
                <div className={styles.timeline}>
                  {timelineItems.map((item, idx) => (
                    <div key={idx} className={styles.timelineItem}>
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineContent}>
                        <span className={styles.timelineLabel}>{item.label}</span>
                        <span className={styles.timelineDate}>{formatDateLong(item.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════
             BLOCO 7 — PRÓXIMA AÇÃO
             ═══════════════════════════════════════ */}
          <div className={`${styles.block} ${styles.blockFull}`}>
            <div className={styles.blockHeader}>
              <span className={styles.blockIcon}>▶</span>
              <h3 className={styles.blockTitle}>Próxima Ação</h3>
            </div>
            <div className={styles.blockBody}>
              <div className={styles.nextActionCard}>
                <span className={styles.nextActionIcon}>→</span>
                <span className={lead.proximo_passo_aprovado || lead.proxima_acao_reserva ? styles.nextActionText : styles.nextActionMuted}>
                  {getNextActionLabel(lead)}
                </span>
              </div>
              {lead.proxima_acao_reserva && lead.proximo_passo_aprovado && (
                <div style={{ marginTop: 10 }}>
                  <div className={styles.fieldItem}>
                    <span className={styles.fieldLabel}>Ação reserva</span>
                    <span className={styles.fieldValue}>{lead.proxima_acao_reserva}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
