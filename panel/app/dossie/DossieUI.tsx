"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./dossie.module.css";
import { fetchDossieDataAction } from "./actions";
import type { DossieData, DocItem, DocLink } from "./actions";

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
    ctps_completa: "CTPS Completa",
    holerite_ultimo: "Holerite (último)",
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

function buildDocLabel(item: DocItem | DocLink): string {
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

function formatComposicao(composicao: string | null): string {
  if (!composicao) return "Não informado";
  const labels: Record<string, string> = {
    individual: "Individual",
    casal: "Casal",
    casal_p3: "Casal + Familiar",
    familiar: "Familiar",
    solteiro: "Solteiro(a)",
    solo: "Solo",
    titular: "Titular",
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

function formatDependentes(qtd: number | null): string {
  if (qtd === null || qtd === undefined) return "Não informado";
  if (qtd > 0) return String(qtd);
  return "não";
}

function formatBoolSinal(val: string | null, trueLabel = "sim", falseLabel = "não"): string {
  if (val === null) return "Não informado";
  const v = val.toLowerCase();
  if (v === "true" || v === "sim" || v === "1" || v === "yes") return trueLabel;
  if (v === "false" || v === "não" || v === "nao" || v === "0" || v === "no") return falseLabel;
  return val;
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
  if (composicao === "individual" || composicao === "solteiro" || composicao === "solo" || composicao === "titular") return 1;
  if (composicao === "casal") return 2;
  if (composicao.includes("p3") || composicao === "familiar") return 3;
  return 1;
}

function buildResumo(data: DossieData): string {
  if (data.dossie_resumo) return data.dossie_resumo;
  if (data.resumo_perfil_analise) return data.resumo_perfil_analise;
  if (data.resumo_retorno_analise) return data.resumo_retorno_analise;
  return "Aguardando atualização do resumo do caso.";
}

function buildInstrucoes(data: DossieData): string[] {
  const instrucoes: string[] = [];
  if (data.retorno_correspondente_bruto) {
    instrucoes.push(data.retorno_correspondente_bruto);
  }
  if (data.motivo_retorno_analise && data.motivo_retorno_analise !== data.retorno_correspondente_bruto) {
    instrucoes.push(data.motivo_retorno_analise);
  }
  if (
    data.resumo_retorno_analise &&
    data.resumo_retorno_analise !== data.retorno_correspondente_bruto &&
    data.resumo_retorno_analise !== data.motivo_retorno_analise
  ) {
    instrucoes.push(data.resumo_retorno_analise);
  }
  const pendentes = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  if (pendentes.length > 0) {
    instrucoes.push(
      `Solicitar ao cliente os seguintes documentos pendentes: ${pendentes.map((d) => buildDocLabel(d)).join(", ")}.`,
    );
  }
  if (instrucoes.length === 0) {
    instrucoes.push("Aguardando atualização das instruções pelo correspondente.");
  }
  return instrucoes;
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
  const protocolo = data.pre_cadastro_numero ?? data.wa_id;
  const correspondente = data.correspondente_retorno ?? data.corr_lock_correspondente_wa_id ?? "Não informado";
  const prazo = data.prazo_proxima_acao ? formatDate(data.prazo_proxima_acao) : (data.data_retorno_analise ? formatDate(data.data_retorno_analise) : "Aguardando atualização");
  const resumo = buildResumo(data);
  const instrucoes = buildInstrucoes(data);

  const rendaRef = data.renda_total_analise ?? data.renda_familiar_analise ?? data.renda_total_para_fluxo;

  const docsRecebidos: DocItem[] = data.docs_itens_recebidos ?? [];
  const docsPendentes: DocItem[] = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  const docLinks: DocLink[] = data.doc_links ?? [];

  const prontoPreAnalise = deriveProntoPreAnalise(data);
  const participantesTotais = deriveParticipantesTotais(data.composicao_pessoa);
  const pendenciasTotais = docsPendentes.length;

  // badges for hero
  const statusRaw = data.fase_conversa ?? data.status_analise ?? null;
  const retornoRaw = data.retorno_correspondente_status ?? "sem retorno";

  const statusBadgeColor =
    data.status_analise?.startsWith("APPROVED") ? "#4ade80"
    : data.status_analise?.startsWith("REJECTED") ? "#f87171"
    : "#2dd4bf";

  const retornoBadgeColor =
    retornoRaw === "sem retorno" || retornoRaw === "aguardando" ? "#f59e0b"
    : retornoRaw === "aprovado" ? "#4ade80"
    : "#f87171";

  // sinais pré-docs: only show cards with actual values
  const sinais: Array<{ label: string; value: string | null }> = [
    { label: "Moradia atual P1", value: data.sinal_moradia_atual_p1 },
    { label: "Preferência de moradia P1", value: data.sinal_moradia_p1 },
    { label: "Trabalho P1", value: data.sinal_trabalho_p1 },
    { label: "Parcela mensal", value: data.sinal_parcela_mensal },
    { label: "Reserva para entrada", value: data.sinal_reserva_entrada !== null ? formatBoolSinal(data.sinal_reserva_entrada) : null },
    { label: "Reserva para entrada - valor", value: data.sinal_reserva_entrada_valor },
    { label: "FGTS disponível", value: data.sinal_fgts_disponivel !== null ? formatBoolSinal(data.sinal_fgts_disponivel) : null },
    { label: "FGTS disponível - valor", value: data.sinal_fgts_valor },
    { label: "Curso superior", value: data.sinal_curso_superior !== null ? formatBoolSinal(data.sinal_curso_superior) : null },
  ].filter((s) => s.value !== null);

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

      <main className={styles.main}>

        {/* ── Capa do pré-cadastro ── */}
        <section className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <span className={styles.heroProtocol}>Dossiê Premium</span>
              <h2 className={styles.heroTitle}>Capa do pré-cadastro</h2>
            </div>
            <div className={styles.heroBadges}>
              <span className={styles.badge} style={{ background: "rgba(45,212,191,0.12)", color: statusBadgeColor, border: `1px solid ${statusBadgeColor}44` }}>
                Status: {statusRaw ?? "—"}
              </span>
              <span className={styles.badge} style={{ background: "rgba(245,158,11,0.12)", color: retornoBadgeColor, border: `1px solid ${retornoBadgeColor}44` }}>
                Retorno: {retornoRaw}
              </span>
            </div>
          </div>

          <div className={styles.heroMeta}>
            <span className={styles.heroMetaLine}><strong>Referência:</strong> {protocolo}</span>
            <span className={styles.heroMetaLine}><strong>Cliente:</strong> {data.nome ?? "Não informado"}</span>
          </div>

          {data.dossie_resumo && (
            <div className={styles.heroTextBlock}>{data.dossie_resumo}</div>
          )}

          <div className={styles.heroGrid}>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Case ref</span>
              <span className={styles.heroGridValue}>{protocolo}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Pré-cadastro</span>
              <span className={styles.heroGridValue}>{data.pre_cadastro_numero ?? "—"}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Lock correspondente</span>
              <span className={styles.heroGridValue}>{correspondente}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Gerado em</span>
              <span className={styles.heroGridValue}>{data.created_at ?? "—"}</span>
            </div>
          </div>
        </section>

        {/* ── Resumo Executivo ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><FileTextIcon /></div>
            <h3 className={styles.sectionTitle}>Resumo executivo</h3>
          </div>
          <div className={styles.infoList}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Pronto para pré-análise:</span>
              <span className={styles.infoValue} style={{ color: prontoPreAnalise ? "#2dd4bf" : "#f59e0b" }}>
                {prontoPreAnalise ? "sim" : "não"}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Status documental:</span>
              <span className={styles.infoValue}>{data.docs_status ?? "Não informado"}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Pendências totais:</span>
              <span className={styles.infoValue} style={{ color: pendenciasTotais > 0 ? "#f59e0b" : "#2dd4bf" }}>
                {pendenciasTotais}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Renda total:</span>
              <span className={styles.infoValue}>{formatBRL(rendaRef)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Participantes totais:</span>
              <span className={styles.infoValue}>{participantesTotais}</span>
            </div>
          </div>
          <p className={styles.resumoSubheader}>Resumo</p>
          <div className={styles.resumoBox}>{resumo}</div>
        </section>

        {/* ── Perfil Técnico Consolidado ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ChartIcon /></div>
            <h3 className={styles.sectionTitle}>Perfil Técnico Consolidado</h3>
          </div>
          <div className={styles.infoList}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Nome:</span>
              <span className={styles.infoValue}>{data.nome ?? "Não informado"}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Estado civil:</span>
              <span className={styles.infoValue}>{data.estado_civil ?? "Não informado"}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Tipo de processo:</span>
              <span className={styles.infoValue}>{formatComposicao(data.composicao_pessoa)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Renda:</span>
              <span className={styles.infoValue}>{formatBRL(rendaRef)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Composição:</span>
              <span className={styles.infoValue}>{data.composicao_pessoa ?? "Não informado"}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>CTPS 36 meses:</span>
              <span className={styles.infoValue} style={{ color: data.ctps_36 === true ? "#2dd4bf" : data.ctps_36 === false ? "#f59e0b" : undefined }}>
                {data.ctps_36 === true ? "sim" : data.ctps_36 === false ? "não" : "Não informado"}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Dependente:</span>
              <span className={styles.infoValue}>
                {formatDependentes(data.dependentes_qtd)}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Restrição:</span>
              <span className={styles.infoValue} style={{ color: data.restricao === true ? "#e86c6c" : data.restricao === false ? "#2dd4bf" : undefined }}>
                {data.restricao === true ? "sim" : data.restricao === false ? "não" : "Não informado"}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Regime de trabalho:</span>
              <span className={styles.infoValue}>{formatRegimeTrabalho(data.regime_trabalho)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Nacionalidade:</span>
              <span className={styles.infoValue}>{data.nacionalidade ?? "Não informado"}</span>
            </div>
          </div>

          {/* Sinais técnicos PRÉ-DOCS */}
          {sinais.length > 0 && (
            <>
              <p className={styles.sinaisPreDocsTitle}>Sinais técnicos PRÉ-DOCS</p>
              <div className={styles.sinaisGrid}>
                {sinais.map((s, i) => (
                  <div key={i} className={styles.sinaisCard}>
                    <span className={styles.sinaisCardLabel}>{s.label}</span>
                    <span className={styles.sinaisCardValue}>{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── Documentos Recebidos + Pendentes + Links ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><DocumentIcon /></div>
            <h3 className={styles.sectionTitle}>Documentos Recebidos</h3>
          </div>

          {docsRecebidos.length === 0 ? (
            <p style={{ color: "#6b7c93", padding: "4px 0 12px" }}>Nenhum documento recebido registrado.</p>
          ) : (
            <ul style={{ listStyle: "disc", paddingLeft: "20px", margin: "0 0 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {docsRecebidos.map((doc, index) => (
                <li key={index} style={{ color: "#b6c2cf", fontSize: "0.9rem" }}>
                  {docTipoLabel(doc.tipo)} — {participantLabel(doc.participante)}
                </li>
              ))}
            </ul>
          )}

          {/* Documentos Pendentes sub-section */}
          <div className={styles.sectionHeader} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px", borderBottom: "none", marginTop: "4px", marginBottom: "12px", paddingBottom: "0" }}>
            <div className={styles.sectionIcon}><ClockIcon /></div>
            <h3 className={styles.sectionTitle}>Documentos Pendentes</h3>
          </div>

          {docsPendentes.length === 0 ? (
            <p style={{ color: "#2dd4bf", fontSize: "0.875rem", margin: "0 0 16px" }}>Sem pendências documentais ativas.</p>
          ) : (
            <div className={styles.pendentesList} style={{ marginBottom: "16px" }}>
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

          {/* Links operacionais dos documentos */}
          {docLinks.length > 0 && (
            <>
              <p className={styles.docLinksHeader}>Links operacionais dos documentos</p>
              <div className={styles.docLinksList}>
                {docLinks.map((link, index) => (
                  <div key={index} className={styles.docLinksItem}>
                    {buildDocLabel(link)} —{" "}
                    <a
                      href={link.url ?? "#"}
                      className={styles.docLinksLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      abrir documento
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── Instrução/estado de retorno do correspondente ── */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}><ListIcon /></div>
            <h3 className={styles.sectionTitle}>Instrução/estado de retorno do correspondente</h3>
          </div>

          {/* Status contextual */}
          {(data.processo_enviado_correspondente !== null || data.aguardando_retorno_correspondente !== null || data.retorno_correspondente_status) && (
            <div className={styles.infoList} style={{ marginBottom: "16px" }}>
              {data.processo_enviado_correspondente !== null && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Processo enviado:</span>
                  <span className={styles.infoValue} style={{ color: data.processo_enviado_correspondente ? "#2dd4bf" : undefined }}>
                    {data.processo_enviado_correspondente ? "sim" : "não"}
                  </span>
                </div>
              )}
              {data.aguardando_retorno_correspondente !== null && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Aguardando retorno:</span>
                  <span className={styles.infoValue} style={{ color: data.aguardando_retorno_correspondente ? "#f59e0b" : undefined }}>
                    {data.aguardando_retorno_correspondente ? "sim" : "não"}
                  </span>
                </div>
              )}
              {data.retorno_correspondente_status && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Status do retorno:</span>
                  <span className={styles.infoValue}>{data.retorno_correspondente_status}</span>
                </div>
              )}
              {data.retorno_correspondente_motivo && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Motivo:</span>
                  <span className={styles.infoValue}>{data.retorno_correspondente_motivo}</span>
                </div>
              )}
            </div>
          )}

          <p className={styles.instrucaoOperacionalLabel}>Instrução operacional:</p>
          <div className={styles.instrucoesList}>
            {instrucoes.map((instrucao, index) => (
              <pre key={index} className={styles.instrucaoPreBox}>{instrucao}</pre>
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
