"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./dossie.module.css";
import { fetchDossieDataAction } from "./actions";
import type { DossieData, DocItem } from "./actions";

// ── Links operacionais fixos (config, não é dado de negócio) ──
const LINKS_OPERACIONAIS = [
  { titulo: "Simulador Habitacional", desc: "Caixa Econômica Federal", url: "https://habitacao.caixa.gov.br/simulador" },
  { titulo: "Portal do Correspondente", desc: "Enova Banking", url: "#" },
  { titulo: "Consulta FGTS", desc: "Extrato e Saldo", url: "https://www.fgts.gov.br" },
  { titulo: "CadÚnico", desc: "Consulta de Cadastro", url: "https://meucadunico.cidadania.gov.br" },
  { titulo: "Certidão Negativa", desc: "Receita Federal", url: "https://servicos.receita.fazenda.gov.br" },
  { titulo: "Consulta Matrícula", desc: "Cartório de Registro", url: "#" },
];

// ── Helpers de apresentação ──

function formatBRL(value: number | null): string {
  if (value === null || value === undefined) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Não informado";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
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
  if (!status) return "Em Análise";
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

function formatStatusAtencao(status: string | null): string {
  if (!status) return "Normal";
  const labels: Record<string, string> = {
    ON_TIME: "Normal",
    DUE_SOON: "Atenção",
    OVERDUE: "Alta",
  };
  return labels[status] ?? status;
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

function buildTitulo(data: DossieData): string {
  const programa = data.faixa_renda_programa ?? data.parceiro_analise;
  if (programa) return `Financiamento Habitacional — ${programa}`;
  return "Financiamento Habitacional";
}

function buildInstrucoes(data: DossieData): string[] {
  // Usa retorno_correspondente_bruto/motivo se disponível
  if (data.retorno_correspondente_bruto) {
    return [data.retorno_correspondente_bruto];
  }
  if (data.motivo_retorno_analise) {
    return [data.motivo_retorno_analise];
  }
  // Gera instruções a partir dos documentos pendentes reais
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

function buildTags(data: DossieData): string[] {
  const tags: string[] = [];
  if (data.faixa_renda_programa) tags.push(data.faixa_renda_programa);
  if (data.composicao_pessoa === "casal" || data.composicao_pessoa?.includes("parceiro")) {
    tags.push("Composição de Renda");
  }
  const rendaRef = data.renda_total_para_fluxo ?? data.renda_total_analise ?? data.renda_familiar_analise;
  if (rendaRef && rendaRef > 0) tags.push("Renda Comprovada");
  if (data.retorno_correspondente_status === "aprovado") tags.push("Aprovado");
  if (data.aguardando_retorno_correspondente) tags.push("Aguardando Retorno");
  if (data.processo_enviado_correspondente) tags.push("Enviado ao Correspondente");
  if (tags.length === 0) tags.push("Financiamento Habitacional");
  return tags;
}

function buildResumo(data: DossieData): string {
  if (data.dossie_resumo) return data.dossie_resumo;
  if (data.resumo_perfil_analise) return data.resumo_perfil_analise;
  if (data.resumo_retorno_analise) return data.resumo_retorno_analise;
  return "Aguardando atualização do resumo do caso.";
}

// Icons como componentes inline
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

const ClipboardIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
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

const LinkIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const ListIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const TagIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
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
  const status = formatStatusAnalise(data.status_analise) || formatFaseConversa(data.fase_conversa);
  const prioridade = formatStatusAtencao(data.status_atencao);
  const protocolo = data.pre_cadastro_numero ?? data.wa_id;
  const correspondente = data.correspondente_retorno ?? data.corr_lock_correspondente_wa_id ?? "Não informado";
  const abertura = formatDate(data.created_at);
  const prazo = data.prazo_proxima_acao ? formatDate(data.prazo_proxima_acao) : (data.data_retorno_analise ? formatDate(data.data_retorno_analise) : "Aguardando atualização");
  const resumo = buildResumo(data);
  const tags = buildTags(data);
  const instrucoes = buildInstrucoes(data);

  const rendaRef = data.renda_total_analise ?? data.renda_familiar_analise ?? data.renda_total_para_fluxo;
  const nivelRisco = data.faixa_perfil_analise ?? data.nivel_risco_reserva ?? "Não informado";

  const docsRecebidos: DocItem[] = data.docs_itens_recebidos ?? [];
  const docsPendentes: DocItem[] = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];

  const badgeStatusClass = (() => {
    if (!data.status_analise) return styles.badgeAnalise;
    if (data.status_analise.startsWith("APPROVED")) return styles.badgeAprovado;
    if (data.status_analise.startsWith("REJECTED")) return styles.badgeReprovado;
    return styles.badgeAnalise;
  })();

  const badgePrioClass =
    data.status_atencao === "OVERDUE" ? styles.badgePrioridade
    : data.status_atencao === "DUE_SOON" ? styles.badgeMedia
    : styles.badgeAprovado;

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
        {/* Hero Card */}
        <section className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <span className={styles.heroProtocol}>Protocolo {protocolo}</span>
              <h2 className={styles.heroTitle}>{titulo}</h2>
              <p className={styles.heroSubtitle}>{data.fase_conversa ? formatFaseConversa(data.fase_conversa) : "Aguardando atualização"}</p>
            </div>
            <div className={styles.heroBadges}>
              <span className={`${styles.badge} ${badgeStatusClass}`}>{status}</span>
              <span className={`${styles.badge} ${badgePrioClass}`}>Prioridade {prioridade}</span>
            </div>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Cliente</span>
              <span className={styles.heroGridValue}>{data.nome ?? "Não informado"}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Correspondente</span>
              <span className={styles.heroGridValue}>{correspondente}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Base / Origem</span>
              <span className={styles.heroGridValue}>{data.current_base ?? "Não informado"}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Abertura / Prazo</span>
              <span className={styles.heroGridValue}>{abertura} — {prazo}</span>
            </div>
          </div>
        </section>

        {/* Resumo do Caso */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><FileTextIcon /></div>
            <h3 className={styles.sectionTitle}>Resumo do Caso</h3>
          </div>
          <p className={styles.resumoText}>{resumo}</p>
        </section>

        {/* Perfil Técnico Consolidado */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ChartIcon /></div>
            <h3 className={styles.sectionTitle}>Perfil Técnico Consolidado</h3>
          </div>
          <div className={styles.perfilGrid}>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Nº do Processo / wa_id</span>
              <span className={styles.perfilValue}>{data.pre_cadastro_numero ?? data.wa_id}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Instituição</span>
              <span className={styles.perfilValue}>Aguardando atualização</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Programa</span>
              <span className={styles.perfilValue}>{data.faixa_renda_programa ?? data.parceiro_analise ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Valor do Imóvel (Ticket)</span>
              <span className={styles.perfilValue}>{formatBRL(data.ticket_desejado_analise)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Valor do Financiamento</span>
              <span className={styles.perfilValue}>{formatBRL(data.valor_financiamento_aprovado)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Subsídio Estimado</span>
              <span className={styles.perfilValue}>{formatBRL(data.valor_subsidio_aprovado)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Renda Mensal Familiar</span>
              <span className={styles.perfilValue}>{formatBRL(rendaRef)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Parcela Estimada</span>
              <span className={styles.perfilValue}>{formatBRL(data.valor_parcela_informada)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Taxa de Juros</span>
              <span className={styles.perfilValue}>Aguardando atualização</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Prazo</span>
              <span className={styles.perfilValue}>Aguardando atualização</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Nível de Risco / Faixa</span>
              <span className={styles.perfilValue}>{nivelRisco}</span>
            </div>
          </div>
          <div className={styles.perfilTags}>
            {tags.map((tag, index) => (
              <span key={index} className={styles.perfilTag}>
                <TagIcon />
                {tag}
              </span>
            ))}
          </div>
        </section>

        {/* Documentos Recebidos */}
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
                  <th>Documento</th>
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

        {/* Documentos Pendentes */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ClockIcon /></div>
            <h3 className={styles.sectionTitle}>Documentos Pendentes</h3>
          </div>
          {docsPendentes.length === 0 ? (
            <p style={{ color: "#6b7c93", padding: "12px 0" }}>Nenhum documento pendente. Pasta completa.</p>
          ) : (
            <div className={styles.pendentesList}>
              {docsPendentes.map((doc, index) => (
                <div key={index} className={styles.pendenteItem}>
                  <div className={styles.pendenteInfo}>
                    <div className={styles.pendenteIcon}><ClipboardIcon /></div>
                    <div className={styles.pendenteTexts}>
                      <span className={styles.pendenteName}>{buildDocLabel(doc)}</span>
                      <span className={styles.pendentePrazo}>Prazo: {prazo}</span>
                    </div>
                  </div>
                  <span className={`${styles.badge} ${styles.badgePrioridade}`}>Pendente</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Links Operacionais */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><LinkIcon /></div>
            <h3 className={styles.sectionTitle}>Links Operacionais</h3>
          </div>
          <div className={styles.linksGrid}>
            {LINKS_OPERACIONAIS.map((link, index) => (
              <a key={index} href={link.url} className={styles.linkCard} target="_blank" rel="noopener noreferrer">
                <div className={styles.linkIcon}><LinkIcon /></div>
                <div className={styles.linkTexts}>
                  <span className={styles.linkTitle}>{link.titulo}</span>
                  <span className={styles.linkDesc}>{link.desc}</span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Instruções de Retorno */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ListIcon /></div>
            <h3 className={styles.sectionTitle}>Instruções de Retorno ao Correspondente</h3>
          </div>
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
