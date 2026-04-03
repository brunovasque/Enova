"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./dossie.module.css";
import { fetchDossieDataAction } from "./actions";
import type { DossieData, DocItem } from "./actions";

// ── Helpers de apresentação ──

function formatBRL(value: number | string | null): string {
  if (value === null || value === undefined) return "Não informado";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Não informado";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return "Não informado";
  }
}

function formatFaseConversa(fase: string | null): string {
  if (!fase) return "Não informado";
  const labels: Record<string, string> = {
    envio_docs: "Envio de Documentos",
    aguardando_retorno_correspondente: "Aguardando Retorno",
    agendamento_visita: "Agendamento de Visita",
    visita_confirmada: "Visita Confirmada",
    finalizacao_processo: "Finalização",
  };
  return labels[fase] ?? fase.replace(/_/g, " ");
}

function formatStatusAnalise(status: string | null): string {
  if (!status) return "—";
  const labels: Record<string, string> = {
    DOCS_PENDING: "Docs Pendentes",
    DOCS_READY: "Docs Prontos",
    SENT: "Enviado",
    UNDER_ANALYSIS: "Em Análise",
    ADJUSTMENT_REQUIRED: "Ajuste Necessário",
    APPROVED_HIGH: "Aprovado",
    APPROVED_LOW: "Aprovado",
    REJECTED_RECOVERABLE: "Reprovado (Recuperável)",
    REJECTED_HARD: "Reprovado",
  };
  return labels[status] ?? status;
}

function boolLabel(value: boolean | null): string {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  return "Não informado";
}

function restrictionLabel(value: string | null): string {
  if (!value) return "Não informado";
  const v = value.toLowerCase().trim();
  if (v === "sim" || v === "true" || v === "com_restricao") return "Com restrição";
  if (v === "nao" || v === "não" || v === "false" || v === "sem_restricao") return "Sem restrição";
  return value.replace(/_/g, " ");
}

function hasRestriction(value: string | null): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return v === "sim" || v === "true" || v === "com_restricao";
}

function docTipoLabel(tipo: string | null): string {
  if (!tipo) return "Documento";
  const labels: Record<string, string> = {
    rg: "RG",
    cpf: "CPF",
    identidade: "Documento de Identidade",
    cnh: "CNH",
    comprovante_renda: "Comprovante de Renda",
    comprovante_residencia: "Comprovante de Residência",
    carteira_trabalho: "Carteira de Trabalho",
    ctps: "CTPS",
    extrato_fgts: "Extrato do FGTS",
    declaracao_ir: "Declaração de IR",
    certidao_casamento: "Certidão de Casamento",
    certidao_nascimento: "Certidão de Nascimento",
    certidao_matricula: "Certidão de Matrícula do Imóvel",
    declaracao_uniao_estavel: "Declaração de União Estável",
    contrato_social: "Contrato Social",
    decore: "DECORE",
    extrato_bancario: "Extrato Bancário",
    outros: "Outros Documentos",
  };
  return labels[tipo.toLowerCase()] ?? tipo.replace(/_/g, " ");
}

function buildDocLabel(item: DocItem): string {
  const tipo = docTipoLabel(item.tipo);
  if (!item.participante || item.participante === "p1") return tipo;
  const partLabels: Record<string, string> = {
    p1: "Titular",
    p2: "Cônjuge / Parceiro",
    p3: "Familiar",
  };
  const part = partLabels[item.participante] ?? item.participante;
  return `${tipo} — ${part}`;
}

function participantLabel(participante: string | null): string {
  if (!participante) return "—";
  const labels: Record<string, string> = {
    p1: "Titular",
    p2: "Cônjuge / Parceiro",
    p3: "Familiar",
  };
  return labels[participante] ?? participante;
}

function papelLabel(papel: string | null): string {
  if (!papel) return "—";
  const labels: Record<string, string> = {
    titular: "Titular",
    conjuge: "Cônjuge",
    parceiro: "Parceiro(a)",
    familiar: "Familiar",
    companheiro: "Companheiro(a)",
  };
  return labels[papel.toLowerCase()] ?? papel.replace(/_/g, " ");
}

function buildTitulo(data: DossieData): string {
  const programa = data.faixa_renda_programa ?? data.parceiro_analise;
  if (programa) return `Financiamento Habitacional — ${programa}`;
  return "Financiamento Habitacional";
}

function buildInstrucoes(data: DossieData): string[] {
  if (data.retorno_correspondente_bruto) {
    return [data.retorno_correspondente_bruto];
  }
  if (data.motivo_retorno_analise) {
    return [data.motivo_retorno_analise];
  }
  const pendentes = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  const instrucoes: string[] = [];
  if (pendentes.length > 0) {
    instrucoes.push(
      `Solicitar ao cliente os seguintes documentos pendentes: ${pendentes.map((d) => buildDocLabel(d)).join(", ")}.`,
    );
    instrucoes.push(
      "Após recebimento dos documentos pendentes, submeter dossiê completo para análise de crédito na instituição.",
    );
    instrucoes.push(
      "Acompanhar prazo de validade dos documentos já enviados — alguns podem expirar antes da conclusão.",
    );
  }
  if (instrucoes.length === 0) {
    instrucoes.push("Aguardando atualização das instruções pelo correspondente.");
  }
  return instrucoes;
}

function buildResumo(data: DossieData): string {
  if (data.dossie_resumo) return data.dossie_resumo;
  if (data.resumo_perfil_analise) return data.resumo_perfil_analise;
  if (data.resumo_retorno_analise) return data.resumo_retorno_analise;
  return "Aguardando atualização do resumo do caso.";
}

// ── Derive helpers ──

function deriveTipoProcesso(data: DossieData): string {
  const c = data.composicao_pessoa?.toLowerCase();
  if (!c) return "Solo";
  if (c === "solo" || c === "solteiro" || c === "individual") return "Solo";
  if (c === "casal" || c === "conjuge" || c.includes("parceiro")) return "Conjunto";
  if (c.includes("familiar") || c.includes("familia")) return "Composição familiar";
  return c.replace(/_/g, " ");
}

function deriveParticipantesTotal(data: DossieData): number {
  const c = data.composicao_pessoa?.toLowerCase();
  if (!c || c === "solo" || c === "solteiro" || c === "individual") return 1;
  if (c === "casal" || c === "conjuge" || c.includes("parceiro")) return 2;
  return 1;
}

function derivePendenciasTotal(data: DossieData): number {
  const pendentes = data.docs_itens_pendentes?.length ?? 0;
  const faltantes = data.docs_faltantes?.length ?? 0;
  return pendentes + faltantes;
}

function deriveProntoPreAnalise(data: DossieData): boolean {
  return data.docs_status === "completo";
}

function deriveRendaTotal(data: DossieData): number | null {
  if (data.renda_total_para_fluxo !== null) return data.renda_total_para_fluxo;
  if (data.renda_total_analise !== null) return data.renda_total_analise;
  if (data.renda_familiar_analise !== null) return data.renda_familiar_analise;
  if (data.renda !== null) {
    const parsed = parseFloat(data.renda);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// ── SVG Icons ──

const CheckCircleIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const FileTextIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ChartIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const DocumentIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ListIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const UsersIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// ── Estado de loading / erro ──

function LoadingState() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Image src="/images/enova-logo.png" alt="Enova" width={120} height={48} className={styles.logo} priority />
          <div className={styles.headerTitle}>
            <h1>Dossiê do Correspondente</h1>
            <span>Carregando...</span>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#6b7c93" }}>
          Carregando dados do dossiê...
        </div>
      </main>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Image src="/images/enova-logo.png" alt="Enova" width={120} height={48} className={styles.logo} priority />
          <div className={styles.headerTitle}>
            <h1>Dossiê do Correspondente</h1>
            <span>Erro ao carregar</span>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#e86c6c" }}>
          {message}
        </div>
      </main>
    </div>
  );
}

function NoWaIdState() {
  const [inputVal, setInputVal] = useState("");
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Image src="/images/enova-logo.png" alt="Enova" width={120} height={48} className={styles.logo} priority />
          <div className={styles.headerTitle}>
            <h1>Dossiê do Correspondente</h1>
            <span>Visão consolidada do caso para análise operacional</span>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#6b7c93" }}>
          <p style={{ marginBottom: "24px", fontSize: "1rem" }}>Informe o wa_id do lead para abrir o dossiê.</p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Ex: 5511999990000"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              style={{
                background: "#1a2332",
                border: "1px solid #2d4060",
                borderRadius: "8px",
                color: "#e6edf3",
                padding: "10px 16px",
                fontSize: "0.95rem",
                minWidth: "240px",
              }}
            />
            <a
              href={inputVal ? `/dossie?wa_id=${encodeURIComponent(inputVal.trim())}` : "#"}
              style={{
                background: "#1a4080",
                color: "#e6edf3",
                borderRadius: "8px",
                padding: "10px 20px",
                textDecoration: "none",
                fontSize: "0.95rem",
              }}
            >
              Abrir Dossiê
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Componente principal com dados reais ──

function DossieContent({ data }: { data: DossieData }) {
  const titulo = buildTitulo(data);
  const protocolo = data.pre_cadastro_numero ?? data.wa_id;
  const resumo = buildResumo(data);
  const instrucoes = buildInstrucoes(data);
  const rendaTotal = deriveRendaTotal(data);
  const pendenciasTotal = derivePendenciasTotal(data);
  const participantesTotal = deriveParticipantesTotal(data);
  const prontoPreAnalise = deriveProntoPreAnalise(data);

  const docsRecebidos: DocItem[] = data.docs_itens_recebidos ?? [];
  const docsPendentes: DocItem[] = [
    ...(data.docs_itens_pendentes ?? []),
    ...(data.docs_faltantes ?? []),
  ];

  // Badge helpers for hero
  const corrPubBadgeClass = (() => {
    if (!data.corr_publicacao_status) return styles.badgeAnalise;
    if (data.corr_publicacao_status === "publicado") return styles.badgeAprovado;
    return styles.badgeAnalise;
  })();

  const retornoBadgeClass = (() => {
    if (!data.retorno_correspondente_status) return styles.badgeAnalise;
    if (data.retorno_correspondente_status === "aprovado") return styles.badgeAprovado;
    if (data.retorno_correspondente_status === "reprovado") return styles.badgeReprovado;
    return styles.badgeMedia;
  })();

  // Fallback parceiro: show partner section when partner fields exist
  const hasFallbackParceiro =
    data.renda_parceiro !== null ||
    data.ctps_36_parceiro !== null;

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Image
            src="/images/enova-logo.png"
            alt="Enova"
            width={120}
            height={48}
            className={styles.logo}
            priority
          />
          <div className={styles.headerTitle}>
            <h1>Dossiê do Correspondente</h1>
            <span>Visão consolidada do caso para análise operacional</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.headerBadge}>
            <CheckCircleIcon />
            wa_id: {data.wa_id}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {/* ── SECTION 1: Capa do pré-cadastro ── */}
        <section className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <span className={styles.heroProtocol}>Protocolo {protocolo}</span>
              <h2 className={styles.heroTitle}>{titulo}</h2>
              <p className={styles.heroSubtitle}>
                {data.nome ?? "Cliente"} · {formatFaseConversa(data.fase_conversa)}
              </p>
            </div>
            <div className={styles.heroBadges}>
              {data.corr_publicacao_status && (
                <span className={`${styles.badge} ${corrPubBadgeClass}`}>
                  {data.corr_publicacao_status}
                </span>
              )}
              {data.retorno_correspondente_status && (
                <span className={`${styles.badge} ${retornoBadgeClass}`}>
                  Retorno: {data.retorno_correspondente_status}
                </span>
              )}
              {data.aguardando_retorno_correspondente && (
                <span className={`${styles.badge} ${styles.badgeMedia}`}>
                  Aguardando Retorno
                </span>
              )}
            </div>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Referência</span>
              <span className={styles.heroGridValue}>{data.faixa_renda_programa ?? data.parceiro_analise ?? "—"}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Cliente</span>
              <span className={styles.heroGridValue}>{data.nome ?? "Não informado"}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Pré-cadastro</span>
              <span className={styles.heroGridValue}>{data.pre_cadastro_numero ?? "—"}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Lock Correspondente</span>
              <span className={styles.heroGridValue}>{data.corr_lock_correspondente_wa_id ?? "Não atribuído"}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Status</span>
              <span className={styles.heroGridValue}>{formatStatusAnalise(data.status_analise)}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Gerado em</span>
              <span className={styles.heroGridValue}>{formatDate(data.created_at)}</span>
            </div>
          </div>
        </section>

        {/* ── SECTION 2: Resumo Executivo ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><FileTextIcon /></div>
            <h3 className={styles.sectionTitle}>Resumo Executivo</h3>
          </div>

          {/* Metrics row */}
          <div className={styles.resumoMetrics}>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Pronto para pré-análise</span>
              <span className={`${styles.metricValue} ${prontoPreAnalise ? styles.metricPositive : styles.metricWarning}`}>
                {prontoPreAnalise ? "Sim" : "Não"}
              </span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Status documental</span>
              <span className={`${styles.metricValue} ${data.docs_status === "completo" ? styles.metricPositive : styles.metricNeutral}`}>
                {data.docs_status ?? "—"}
              </span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Pendências totais</span>
              <span className={`${styles.metricValue} ${pendenciasTotal === 0 ? styles.metricPositive : styles.metricWarning}`}>
                {pendenciasTotal}
              </span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Renda total</span>
              <span className={`${styles.metricValue} ${styles.metricNeutral}`}>
                {formatBRL(rendaTotal)}
              </span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricLabel}>Participantes totais</span>
              <span className={`${styles.metricValue} ${styles.metricNeutral}`}>
                {participantesTotal}
              </span>
            </div>
          </div>

          {/* Full resumo text */}
          <div className={styles.resumoTextBlock}>
            <p className={styles.resumoText}>{resumo}</p>
          </div>
        </section>

        {/* ── SECTION 3: Perfil Técnico Consolidado ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ChartIcon /></div>
            <h3 className={styles.sectionTitle}>Perfil Técnico Consolidado</h3>
          </div>
          <div className={styles.perfilGrid}>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Nome</span>
              <span className={styles.perfilValue}>{data.nome ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Estado civil</span>
              <span className={styles.perfilValue}>{data.estado_civil ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Tipo de processo</span>
              <span className={styles.perfilValue}>{deriveTipoProcesso(data)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Renda</span>
              <span className={styles.perfilValue}>{formatBRL(data.renda ?? rendaTotal)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Composição</span>
              <span className={styles.perfilValue}>{data.composicao_pessoa ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Regime de trabalho</span>
              <span className={styles.perfilValue}>{data.regime_trabalho ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>CTPS ≥ 36m</span>
              <span className={styles.perfilValue}>{boolLabel(data.ctps_36)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Dependente</span>
              <span className={styles.perfilValue}>{boolLabel(data.dependente)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Restrição</span>
              <span className={styles.perfilValue}>{restrictionLabel(data.restricao)}</span>
            </div>
            {data.regularizacao_restricao && (
              <div className={styles.perfilItem}>
                <span className={styles.perfilLabel}>Regularização restrição</span>
                <span className={styles.perfilValue}>{data.regularizacao_restricao}</span>
              </div>
            )}
            {data.somar_renda !== null && (
              <div className={styles.perfilItem}>
                <span className={styles.perfilLabel}>Somar renda</span>
                <span className={styles.perfilValue}>{boolLabel(data.somar_renda)}</span>
              </div>
            )}
            {data.nacionalidade && (
              <div className={styles.perfilItem}>
                <span className={styles.perfilLabel}>Nacionalidade</span>
                <span className={styles.perfilValue}>{data.nacionalidade}</span>
              </div>
            )}
          </div>

          {/* Fallback parceiro */}
          {hasFallbackParceiro && (
            <div className={styles.participantesSection}>
              <div className={styles.participantesTitle}>
                <UsersIcon />
                Parceiro(a)
              </div>
              <div className={styles.perfilGrid}>
                {data.renda_parceiro !== null && (
                  <div className={styles.perfilItem}>
                    <span className={styles.perfilLabel}>Renda parceiro</span>
                    <span className={styles.perfilValue}>{formatBRL(data.renda_parceiro)}</span>
                  </div>
                )}
                {data.ctps_36_parceiro !== null && (
                  <div className={styles.perfilItem}>
                    <span className={styles.perfilLabel}>CTPS ≥ 36m parceiro</span>
                    <span className={styles.perfilValue}>{boolLabel(data.ctps_36_parceiro)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 4: Documentos (two cards) ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><DocumentIcon /></div>
            <h3 className={styles.sectionTitle}>Documentos Recebidos</h3>
          </div>
          {docsRecebidos.length === 0 ? (
            <p style={{ color: "#6b7c93", padding: "12px 0" }}>Nenhum documento recebido registrado.</p>
          ) : (
            <table className={styles.docTable}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Participante</th>
                </tr>
              </thead>
              <tbody>
                {docsRecebidos.map((doc, index) => (
                  <tr key={index}>
                    <td>
                      <div className={styles.docName}>
                        <div className={`${styles.docIcon} ${styles.docIconPdf}`}>
                          <DocumentIcon />
                        </div>
                        {docTipoLabel(doc.tipo)}
                      </div>
                    </td>
                    <td>{participantLabel(doc.participante)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ClockIcon /></div>
            <h3 className={styles.sectionTitle}>Documentos Pendentes</h3>
          </div>
          {docsPendentes.length === 0 ? (
            <p style={{ color: "#6b7c93", padding: "12px 0" }}>Nenhum documento pendente. Pasta completa.</p>
          ) : (
            <table className={styles.docTable}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Participante</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {docsPendentes.map((doc, index) => (
                  <tr key={index}>
                    <td>
                      <div className={styles.docName}>
                        <div className={styles.docIcon}>
                          <DocumentIcon />
                        </div>
                        {docTipoLabel(doc.tipo)}
                      </div>
                    </td>
                    <td>{participantLabel(doc.participante)}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgePrioridade}`}>Pendente</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── SECTION 5: Instrução / Estado de Retorno do Correspondente ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ListIcon /></div>
            <h3 className={styles.sectionTitle}>Instrução / Estado de Retorno do Correspondente</h3>
          </div>

          {/* Retorno flags */}
          <div className={styles.retornoFlags}>
            <div className={styles.retornoFlagItem}>
              <span className={styles.retornoFlagLabel}>Retorno correspondente</span>
              <span className={styles.retornoFlagValue}>
                {data.retorno_correspondente_status ? (
                  <span className={`${styles.badge} ${retornoBadgeClass}`}>
                    {data.retorno_correspondente_status}
                  </span>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className={styles.retornoFlagItem}>
              <span className={styles.retornoFlagLabel}>Motivo</span>
              <span className={styles.retornoFlagValue}>
                {data.retorno_correspondente_motivo ?? data.motivo_retorno_analise ?? "—"}
              </span>
            </div>
            <div className={styles.retornoFlagItem}>
              <span className={styles.retornoFlagLabel}>Valor financiamento</span>
              <span className={styles.retornoFlagValue}>
                {formatBRL(data.valor_financiamento_aprovado)}
              </span>
            </div>
            <div className={styles.retornoFlagItem}>
              <span className={styles.retornoFlagLabel}>Subsídio federal</span>
              <span className={styles.retornoFlagValue}>
                {formatBRL(data.valor_subsidio_aprovado)}
              </span>
            </div>
            <div className={styles.retornoFlagItem}>
              <span className={styles.retornoFlagLabel}>Pendências</span>
              <span className={styles.retornoFlagValue}>{pendenciasTotal}</span>
            </div>
          </div>

          {/* Instrução operacional */}
          <div className={styles.instrucoesList}>
            {instrucoes.map((instrucao, index) => (
              <div key={index} className={styles.instrucaoItem}>
                <span className={styles.instrucaoNum}>{index + 1}</span>
                <span className={styles.instrucaoText}>{instrucao}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function DossieUI() {
  const searchParams = useSearchParams();
  const waId = (searchParams.get("wa_id") || "").trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DossieData | null>(null);

  const fetchDossie = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDossieDataAction(id);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Erro ao carregar dossiê.");
      } else {
        setData(result.data);
      }
    } catch {
      setError("Falha ao carregar dossiê.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (waId) {
      void fetchDossie(waId);
    }
  }, [waId, fetchDossie]);

  if (!waId) return <NoWaIdState />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  return <DossieContent data={data} />;
}
