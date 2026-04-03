"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./dossie.module.css";
import { fetchDossieDataAction } from "./actions";
import type { DossieData, DocItem } from "./actions";

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
  const instrucoes: string[] = [];

  // Retorno bruto do correspondente — fonte primária
  if (data.retorno_correspondente_bruto) {
    instrucoes.push(data.retorno_correspondente_bruto);
  }
  // Motivo de retorno da análise — complementar se diferente
  if (data.motivo_retorno_analise && data.motivo_retorno_analise !== data.retorno_correspondente_bruto) {
    instrucoes.push(data.motivo_retorno_analise);
  }
  // Resumo do retorno da análise — se disponível e diferente
  if (data.resumo_retorno_analise && data.resumo_retorno_analise !== data.retorno_correspondente_bruto && data.resumo_retorno_analise !== data.motivo_retorno_analise) {
    instrucoes.push(data.resumo_retorno_analise);
  }
  // Documentos pendentes — instrução operacional
  const pendentes = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
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

function formatComposicao(composicao: string | null): string {
  if (!composicao) return "Não informado";
  const labels: Record<string, string> = {
    individual: "Individual",
    casal: "Casal",
    casal_p3: "Casal + Familiar",
    familiar: "Familiar",
    solteiro: "Solteiro(a)",
  };
  return labels[composicao] ?? composicao.replace(/_/g, " ");
}

function formatRegimeTrabalho(regime: string | null): string {
  if (!regime) return "Não informado";
  const labels: Record<string, string> = {
    clt: "CLT",
    autonomo: "Autônomo",
    mei: "MEI",
    servidor_publico: "Servidor Público",
    aposentado: "Aposentado / Pensionista",
    desempregado: "Desempregado",
    empresario: "Empresário",
  };
  return labels[regime.toLowerCase()] ?? regime.replace(/_/g, " ");
}

function deriveProntoPreAnalise(data: DossieData): boolean {
  const pendentes = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  if (pendentes.length > 0) return false;
  const stage = data.fase_conversa;
  const prontoStages = [
    "aguardando_retorno_correspondente",
    "agendamento_visita",
    "visita_confirmada",
    "finalizacao_processo",
  ];
  if (stage && prontoStages.includes(stage)) return true;
  if (data.docs_status === "pronto" || data.docs_status === "completo" || data.docs_status === "ready") return true;
  return false;
}

function deriveParticipantesTotais(composicao: string | null): number {
  if (!composicao) return 1;
  if (composicao === "individual" || composicao === "solteiro") return 1;
  if (composicao === "casal") return 2;
  if (composicao.includes("p3") || composicao === "familiar") return 3;
  return 1;
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

const ListIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
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
  const instrucoes = buildInstrucoes(data);

  const rendaRef = data.renda_total_analise ?? data.renda_familiar_analise ?? data.renda_total_para_fluxo;
  const nivelRisco = data.faixa_perfil_analise ?? data.nivel_risco_reserva ?? "Não informado";

  const docsRecebidos: DocItem[] = data.docs_itens_recebidos ?? [];
  const docsPendentes: DocItem[] = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];

  const prontoPreAnalise = deriveProntoPreAnalise(data);
  const participantesTotais = deriveParticipantesTotais(data.composicao_pessoa);
  const pendenciasTotais = docsPendentes.length;

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

        {/* ── Topo: Financiamento Habitacional ── */}
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

        {/* ── Resumo Executivo ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><FileTextIcon /></div>
            <h3 className={styles.sectionTitle}>Resumo Executivo</h3>
          </div>
          <div className={styles.perfilGrid} style={{ marginBottom: "16px" }}>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Pronto para Pré-análise</span>
              <span className={styles.perfilValue} style={{ color: prontoPreAnalise ? "#2dd4bf" : "#f59e0b" }}>
                {prontoPreAnalise ? "✓ Sim" : "Pendente"}
              </span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Status Documental</span>
              <span className={styles.perfilValue}>{data.docs_status ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Pendências Totais</span>
              <span className={styles.perfilValue} style={{ color: pendenciasTotais > 0 ? "#f59e0b" : "#2dd4bf" }}>
                {pendenciasTotais} {pendenciasTotais === 1 ? "documento" : "documentos"}
              </span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Renda Total</span>
              <span className={styles.perfilValue}>{formatBRL(rendaRef)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Participantes</span>
              <span className={styles.perfilValue}>{participantesTotais}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Retorno Correspondente</span>
              <span className={styles.perfilValue}>{data.retorno_correspondente_status ?? "Aguardando"}</span>
            </div>
          </div>
          <p className={styles.resumoText}>{resumo}</p>
        </section>

        {/* ── Perfil Técnico Consolidado ── */}
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
              <span className={styles.perfilLabel}>Programa</span>
              <span className={styles.perfilValue}>{data.faixa_renda_programa ?? data.parceiro_analise ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Estado Civil</span>
              <span className={styles.perfilValue}>{data.estado_civil ?? "Não informado"}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Composição do Grupo</span>
              <span className={styles.perfilValue}>{formatComposicao(data.composicao_pessoa)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Regime de Trabalho</span>
              <span className={styles.perfilValue}>{formatRegimeTrabalho(data.regime_trabalho)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Nacionalidade</span>
              <span className={styles.perfilValue}>{data.nacionalidade ?? "Não informado"}</span>
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
              <span className={styles.perfilLabel}>Parcela Estimada</span>
              <span className={styles.perfilValue}>{formatBRL(data.valor_parcela_informada)}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Nível de Risco / Faixa</span>
              <span className={styles.perfilValue}>{nivelRisco}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>CTPS 36 Meses</span>
              <span className={styles.perfilValue} style={{ color: data.ctps_36 === true ? "#2dd4bf" : data.ctps_36 === false ? "#f59e0b" : undefined }}>
                {data.ctps_36 === true ? "✓ Confirmado" : data.ctps_36 === false ? "Não confirmado" : "Não informado"}
              </span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Dependentes</span>
              <span className={styles.perfilValue}>
                {data.dependentes_qtd !== null && data.dependentes_qtd !== undefined
                  ? String(data.dependentes_qtd)
                  : "Não informado"}
              </span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Restrição</span>
              <span className={styles.perfilValue} style={{ color: data.restricao === true ? "#e86c6c" : data.restricao === false ? "#2dd4bf" : undefined }}>
                {data.restricao === true ? "⚠ Possui restrição" : data.restricao === false ? "✓ Sem restrição" : "Não informado"}
              </span>
            </div>
          </div>
        </section>

        {/* ── Documentos Recebidos ── */}
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

        {/* ── Documentos Pendentes ── */}
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

        {/* ── Instruções de Retorno ao Correspondente ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ListIcon /></div>
            <h3 className={styles.sectionTitle}>Instruções de Retorno ao Correspondente</h3>
          </div>
          {/* Estado atual do retorno */}
          {(data.processo_enviado_correspondente !== null || data.aguardando_retorno_correspondente !== null || data.retorno_correspondente_status) && (
            <div className={styles.perfilGrid} style={{ marginBottom: "16px" }}>
              {data.processo_enviado_correspondente !== null && (
                <div className={styles.perfilItem}>
                  <span className={styles.perfilLabel}>Processo Enviado</span>
                  <span className={styles.perfilValue} style={{ color: data.processo_enviado_correspondente ? "#2dd4bf" : undefined }}>
                    {data.processo_enviado_correspondente ? "✓ Sim" : "Não"}
                  </span>
                </div>
              )}
              {data.aguardando_retorno_correspondente !== null && (
                <div className={styles.perfilItem}>
                  <span className={styles.perfilLabel}>Aguardando Retorno</span>
                  <span className={styles.perfilValue} style={{ color: data.aguardando_retorno_correspondente ? "#f59e0b" : undefined }}>
                    {data.aguardando_retorno_correspondente ? "✓ Sim" : "Não"}
                  </span>
                </div>
              )}
              {data.retorno_correspondente_status && (
                <div className={styles.perfilItem}>
                  <span className={styles.perfilLabel}>Status do Retorno</span>
                  <span className={styles.perfilValue}>{data.retorno_correspondente_status}</span>
                </div>
              )}
              {data.retorno_correspondente_motivo && (
                <div className={styles.perfilItem}>
                  <span className={styles.perfilLabel}>Motivo</span>
                  <span className={styles.perfilValue}>{data.retorno_correspondente_motivo}</span>
                </div>
              )}
            </div>
          )}
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

