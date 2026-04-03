"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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

// ── Abas do dossiê ──
type ActiveTab = "visao_geral" | "financeiro" | "documentos" | "retorno";

// ── Helpers de apresentação ──

function formatBRL(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return "—";
  }
}

function formatFaseConversa(fase: string | null): string {
  if (!fase) return "—";
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
  const labels: Record<string, string> = { ON_TIME: "Normal", DUE_SOON: "Atenção", OVERDUE: "Urgente" };
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

function participantLabel(participante: string | null): string {
  if (!participante) return "—";
  const labels: Record<string, string> = { p1: "Titular", p2: "Cônjuge / Parceiro", p3: "Familiar" };
  return labels[participante] ?? participante;
}

function buildDocLabel(item: DocItem): string {
  const tipo = docTipoLabel(item.tipo);
  if (!item.participante || item.participante === "p1") return tipo;
  const partLabels: Record<string, string> = { p1: "Titular", p2: "Cônjuge / Parceiro", p3: "Familiar" };
  const part = partLabels[item.participante] ?? item.participante;
  return `${tipo} — ${part}`;
}

function buildInstrucoes(data: DossieData): string[] {
  if (data.retorno_correspondente_bruto) return [data.retorno_correspondente_bruto];
  if (data.motivo_retorno_analise) return [data.motivo_retorno_analise];
  const pendentes = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  const instrucoes: string[] = [];
  if (pendentes.length > 0) {
    instrucoes.push(`Solicitar ao cliente: ${pendentes.map((d) => buildDocLabel(d)).join(", ")}.`);
    instrucoes.push("Submeter dossiê completo após recebimento de todos os documentos pendentes.");
    instrucoes.push("Verificar validade dos documentos já enviados antes da submissão.");
  }
  if (instrucoes.length === 0) instrucoes.push("Aguardando instruções do correspondente.");
  return instrucoes;
}

function deriveRendaTotal(data: DossieData): number | null {
  return data.renda_total_analise ?? data.renda_familiar_analise ?? data.renda_total_para_fluxo;
}

function derivePendenciasCount(data: DossieData): number {
  return (data.docs_itens_pendentes ?? data.docs_faltantes ?? []).length;
}

function statusAnaliseClass(status: string | null): string {
  if (!status) return styles.badgeInfo;
  if (status.startsWith("APPROVED")) return styles.badgeSuccess;
  if (status.startsWith("REJECTED")) return styles.badgeDanger;
  if (status === "ADJUSTMENT_REQUIRED") return styles.badgeWarning;
  return styles.badgeInfo;
}

function atencaoClass(status: string | null): string {
  if (status === "OVERDUE") return styles.badgeDanger;
  if (status === "DUE_SOON") return styles.badgeWarning;
  return styles.badgeSuccess;
}

// ── SVG Icons ──
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const IconBriefcase = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const IconDoc = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconWarning = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);
const IconLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

// ── Sub-components ──

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`${styles.metricCard} ${accent ? styles.metricCardAccent : ""}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );
}

function SectionCard({ title, icon, children, noPad }: { title: string; icon: ReactNode; children: ReactNode; noPad?: boolean }) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>{icon}</span>
        <h3 className={styles.sectionTitle}>{title}</h3>
      </div>
      <div className={noPad ? styles.sectionBodyNoPad : styles.sectionBody}>{children}</div>
    </div>
  );
}

// ── Loading / Error / NoWaId States ──

function AppShell({ subtitle, children }: { subtitle?: string; children: ReactNode }) {
  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}>
          <Image src="/images/enova-logo.png" alt="Enova" width={100} height={40} className={styles.logo} priority />
          <div className={styles.topbarTitle}>
            <span className={styles.topbarName}>Dossiê do Correspondente</span>
            {subtitle && <span className={styles.topbarSub}>{subtitle}</span>}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <AppShell subtitle="Carregando...">
      <div className={styles.centerState}>
        <div className={styles.spinner} />
        <p className={styles.centerText}>Carregando dados do dossiê...</p>
      </div>
    </AppShell>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <AppShell subtitle="Erro ao carregar">
      <div className={styles.centerState}>
        <div className={styles.errorIcon}><IconWarning /></div>
        <p className={styles.errorText}>{message}</p>
      </div>
    </AppShell>
  );
}

function NoWaIdState() {
  const [inputVal, setInputVal] = useState("");
  return (
    <AppShell subtitle="Visão consolidada do caso">
      <div className={styles.centerState}>
        <div className={styles.searchBox}>
          <p className={styles.searchTitle}>Informe o wa_id do lead para abrir o dossiê.</p>
          <div className={styles.searchRow}>
            <input
              type="text"
              placeholder="Ex: 5541997780518"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className={styles.searchInput}
            />
            <a
              href={inputVal ? `/dossie?wa_id=${encodeURIComponent(inputVal.trim())}` : "#"}
              className={styles.searchBtn}
            >
              Abrir Dossiê
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Tab: Visão Geral ──
function TabVisaoGeral({ data }: { data: DossieData }) {
  const renda = deriveRendaTotal(data);
  const resumo = data.dossie_resumo ?? data.resumo_perfil_analise ?? data.resumo_retorno_analise ?? "Aguardando atualização do resumo do caso.";
  const correspondente = data.correspondente_retorno ?? data.corr_lock_correspondente_wa_id ?? "—";
  const instrucoes = buildInstrucoes(data);

  return (
    <div className={styles.tabContent}>
      {/* Metrics row */}
      <div className={styles.metricsRow}>
        <MetricCard label="Fase Atual" value={formatFaseConversa(data.fase_conversa)} accent />
        <MetricCard label="Renda Total" value={formatBRL(renda)} />
        <MetricCard label="Docs Pendentes" value={String(derivePendenciasCount(data))} />
        <MetricCard label="Correspondente" value={correspondente} />
        <MetricCard label="Base / Origem" value={data.current_base ?? "—"} />
      </div>

      {/* Resumo do caso */}
      <SectionCard title="Resumo do Caso" icon={<IconDoc />}>
        <p className={styles.resumoText}>{resumo}</p>
      </SectionCard>

      {/* Perfil do cliente */}
      <SectionCard title="Perfil do Cliente" icon={<IconUser />}>
        <div className={styles.infoGrid}>
          <InfoRow label="Nome" value={data.nome ?? "—"} />
          <InfoRow label="Estado Civil" value={data.estado_civil ?? "—"} />
          <InfoRow label="Composição" value={data.composicao_pessoa ?? "—"} />
          <InfoRow label="Regime de Trabalho" value={data.regime_trabalho ?? "—"} />
          <InfoRow label="Nacionalidade" value={data.nacionalidade ?? "—"} />
          <InfoRow label="Status Funil" value={data.funil_status ?? "—"} />
        </div>
      </SectionCard>

      {/* Status operacional */}
      <SectionCard title="Status Operacional" icon={<IconClock />}>
        <div className={styles.infoGrid}>
          <InfoRow label="Próxima Ação" value={data.proxima_acao ?? "—"} />
          <InfoRow label="Prazo" value={formatDate(data.prazo_proxima_acao)} />
          <InfoRow label="Atenção" value={formatStatusAtencao(data.status_atencao)} />
          <InfoRow label="Envio Correspondente" value={data.processo_enviado_correspondente ? "Enviado" : "Não enviado"} />
          <InfoRow label="Aguardando Retorno" value={data.aguardando_retorno_correspondente ? "Sim" : "Não"} />
          <InfoRow label="Data Abertura" value={formatDate(data.created_at)} />
        </div>
      </SectionCard>

      {/* Instruções de retorno */}
      <SectionCard title="Instruções de Retorno ao Correspondente" icon={<IconWarning />}>
        <ol className={styles.instrucoesList}>
          {instrucoes.map((instrucao, index) => (
            <li key={index} className={styles.instrucaoItem}>
              <span className={styles.instrucaoNum}>{index + 1}</span>
              <span className={styles.instrucaoText}>{instrucao}</span>
            </li>
          ))}
        </ol>
      </SectionCard>

      {/* Links operacionais */}
      <SectionCard title="Links Operacionais" icon={<IconLink />}>
        <div className={styles.linksGrid}>
          {LINKS_OPERACIONAIS.map((link, index) => (
            <a key={index} href={link.url} className={styles.linkCard} target="_blank" rel="noopener noreferrer">
              <span className={styles.linkTitle}>{link.titulo}</span>
              <span className={styles.linkDesc}>{link.desc} <IconLink /></span>
            </a>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab: Financeiro ──
function TabFinanceiro({ data }: { data: DossieData }) {
  const renda = deriveRendaTotal(data);
  const envioAnalise = data.data_envio_analise ? formatDate(data.data_envio_analise) : "—";
  const retornoAnalise = data.data_retorno_analise ? formatDate(data.data_retorno_analise) : "—";

  return (
    <div className={styles.tabContent}>
      {/* Valores do financiamento */}
      <SectionCard title="Valores do Financiamento" icon={<IconBriefcase />}>
        <div className={styles.financGrid}>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Programa</span>
            <span className={styles.financValue}>{data.faixa_renda_programa ?? data.parceiro_analise ?? "—"}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Ticket / Valor do Imóvel</span>
            <span className={`${styles.financValue} ${styles.financValueHighlight}`}>{formatBRL(data.ticket_desejado_analise)}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Valor do Financiamento</span>
            <span className={`${styles.financValue} ${styles.financValueHighlight}`}>{formatBRL(data.valor_financiamento_aprovado)}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Subsídio Estimado</span>
            <span className={`${styles.financValue} ${styles.financValueAccent}`}>{formatBRL(data.valor_subsidio_aprovado)}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Entrada Informada</span>
            <span className={styles.financValue}>{formatBRL(data.valor_entrada_informada)}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Parcela Estimada</span>
            <span className={styles.financValue}>{formatBRL(data.valor_parcela_informada)}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Renda Familiar (Total)</span>
            <span className={styles.financValue}>{formatBRL(renda)}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Renda para Fluxo</span>
            <span className={styles.financValue}>{formatBRL(data.renda_total_para_fluxo)}</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Taxa de Juros</span>
            <span className={styles.financValue}>Aguardando atualização</span>
          </div>
          <div className={styles.financItem}>
            <span className={styles.financLabel}>Prazo</span>
            <span className={styles.financValue}>Aguardando atualização</span>
          </div>
        </div>
      </SectionCard>

      {/* Análise de crédito */}
      <SectionCard title="Análise de Crédito" icon={<IconDoc />}>
        <div className={styles.infoGrid}>
          <InfoRow label="Status da Análise" value={formatStatusAnalise(data.status_analise)} />
          <InfoRow label="Parceiro / Instituição" value={data.parceiro_analise ?? "—"} />
          <InfoRow label="Score de Perfil" value={data.score_perfil_analise !== null ? String(data.score_perfil_analise) : "—"} />
          <InfoRow label="Faixa de Perfil" value={data.faixa_perfil_analise ?? "—"} />
          <InfoRow label="Nível de Risco" value={data.nivel_risco_reserva ?? "—"} />
          <InfoRow label="Resumo Análise" value={data.resumo_retorno_analise ?? "—"} />
          <InfoRow label="Data Envio" value={envioAnalise} />
          <InfoRow label="Data Retorno" value={retornoAnalise} />
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab: Documentos ──
function TabDocumentos({ data }: { data: DossieData }) {
  const docsRecebidos: DocItem[] = data.docs_itens_recebidos ?? [];
  const docsPendentes: DocItem[] = data.docs_itens_pendentes ?? data.docs_faltantes ?? [];
  const prazoText = data.prazo_proxima_acao ? formatDate(data.prazo_proxima_acao) : (data.data_retorno_analise ? formatDate(data.data_retorno_analise) : "—");

  return (
    <div className={styles.tabContent}>
      {/* Status geral de documentos */}
      <div className={styles.docsStatusBar}>
        <span className={styles.docsStatusItem}>
          <span className={styles.docsStatusDot} data-status="recebido" />
          {docsRecebidos.length} recebido{docsRecebidos.length !== 1 ? "s" : ""}
        </span>
        <span className={styles.docsStatusItem}>
          <span className={styles.docsStatusDot} data-status="pendente" />
          {docsPendentes.length} pendente{docsPendentes.length !== 1 ? "s" : ""}
        </span>
        {data.docs_status && (
          <span className={styles.docsStatusItem}>
            <span className={styles.docsStatusLabel}>Status:</span>
            {data.docs_status}
          </span>
        )}
      </div>

      {/* Documentos Recebidos */}
      <SectionCard title={`Documentos Recebidos (${docsRecebidos.length})`} icon={<IconCheck />} noPad>
        {docsRecebidos.length === 0 ? (
          <p className={styles.emptyMsg}>Nenhum documento recebido registrado.</p>
        ) : (
          <table className={styles.docTable}>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Participante</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {docsRecebidos.map((doc, index) => (
                <tr key={index}>
                  <td className={styles.docNameCell}>
                    <span className={styles.docIcon}><IconDoc /></span>
                    {docTipoLabel(doc.tipo)}
                  </td>
                  <td>{participantLabel(doc.participante)}</td>
                  <td><span className={`${styles.chipSmall} ${styles.badgeSuccess}`}>Recebido</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Documentos Pendentes */}
      <SectionCard title={`Documentos Pendentes (${docsPendentes.length})`} icon={<IconWarning />} noPad>
        {docsPendentes.length === 0 ? (
          <p className={styles.emptyMsg}>Nenhum documento pendente. Pasta completa ✓</p>
        ) : (
          <table className={styles.docTable}>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Participante</th>
                <th>Prazo</th>
              </tr>
            </thead>
            <tbody>
              {docsPendentes.map((doc, index) => (
                <tr key={index}>
                  <td className={styles.docNameCell}>
                    <span className={`${styles.docIcon} ${styles.docIconWarning}`}><IconWarning /></span>
                    {docTipoLabel(doc.tipo)}
                  </td>
                  <td>{participantLabel(doc.participante)}</td>
                  <td><span className={`${styles.chipSmall} ${styles.badgeDanger}`}>{prazoText}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}

// ── Tab: Retorno Correspondente ──
function TabRetorno({ data }: { data: DossieData }) {
  const statusRetorno = data.retorno_correspondente_status ?? data.correspondente_retorno ?? "—";
  return (
    <div className={styles.tabContent}>
      {/* Status do retorno */}
      <SectionCard title="Status do Retorno" icon={<IconRefresh />}>
        <div className={styles.retornoHero}>
          <div className={styles.retornoStatusRow}>
            <span className={styles.retornoLabel}>Status:</span>
            <span className={`${styles.chipMedium} ${data.retorno_correspondente_status ? styles.badgeInfo : styles.badgeNeutral}`}>
              {statusRetorno}
            </span>
          </div>
          {data.aguardando_retorno_correspondente && (
            <div className={`${styles.alertBox} ${styles.alertInfo}`}>
              <IconClock />
              Aguardando retorno do correspondente
            </div>
          )}
          {data.processo_enviado_correspondente && !data.aguardando_retorno_correspondente && (
            <div className={`${styles.alertBox} ${styles.alertSuccess}`}>
              <IconCheck />
              Processo enviado ao correspondente
            </div>
          )}
        </div>
      </SectionCard>

      {/* Detalhes do retorno */}
      <SectionCard title="Detalhes do Retorno" icon={<IconDoc />}>
        <div className={styles.infoGrid}>
          <InfoRow label="Correspondente (wa_id)" value={data.corr_lock_correspondente_wa_id ?? "—"} />
          <InfoRow label="Retorno (CRM)" value={data.correspondente_retorno ?? "—"} />
          <InfoRow label="Status Retorno" value={data.retorno_correspondente_status ?? "—"} />
          <InfoRow label="Motivo" value={data.retorno_correspondente_motivo ?? "—"} />
        </div>
        {data.retorno_correspondente_bruto && (
          <div className={styles.retornoBruto}>
            <span className={styles.retornoBrutoLabel}>Retorno Bruto (Correspondente):</span>
            <p className={styles.retornoBrutoText}>{data.retorno_correspondente_bruto}</p>
          </div>
        )}
        {data.motivo_retorno_analise && (
          <div className={styles.retornoBruto}>
            <span className={styles.retornoBrutoLabel}>Motivo Retorno (Análise):</span>
            <p className={styles.retornoBrutoText}>{data.motivo_retorno_analise}</p>
          </div>
        )}
        {data.resumo_retorno_analise && (
          <div className={styles.retornoBruto}>
            <span className={styles.retornoBrutoLabel}>Resumo do Retorno:</span>
            <p className={styles.retornoBrutoText}>{data.resumo_retorno_analise}</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Componente principal com dados ──

function DossieContent({ data }: { data: DossieData }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("visao_geral");

  const protocolo = data.pre_cadastro_numero ?? data.wa_id;
  const programa = data.faixa_renda_programa ?? data.parceiro_analise;
  const statusLabel = formatStatusAnalise(data.status_analise);
  const atencaoLabel = formatStatusAtencao(data.status_atencao);
  const pendencias = derivePendenciasCount(data);

  const tabs: { id: ActiveTab; label: string; badge?: number }[] = [
    { id: "visao_geral", label: "Visão Geral" },
    { id: "financeiro", label: "Financeiro" },
    { id: "documentos", label: "Documentos", badge: pendencias > 0 ? pendencias : undefined },
    { id: "retorno", label: "Retorno" },
  ];

  return (
    <div className={styles.root}>
      {/* Topbar */}
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}>
          <Image src="/images/enova-logo.png" alt="Enova" width={100} height={40} className={styles.logo} priority />
          <div className={styles.topbarTitle}>
            <span className={styles.topbarName}>Dossiê do Correspondente</span>
            <span className={styles.topbarSub}>Visão consolidada para análise operacional</span>
          </div>
        </div>
        <div className={styles.topbarMeta}>
          <span className={`${styles.chipSmall} ${statusAnaliseClass(data.status_analise)}`}>{statusLabel}</span>
          <span className={`${styles.chipSmall} ${atencaoClass(data.status_atencao)}`}>{atencaoLabel}</span>
          <span className={styles.topbarWaId}>wa_id: {data.wa_id}</span>
        </div>
      </header>

      {/* Hero / Capa */}
      <div className={styles.heroSection}>
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <p className={styles.heroProtocolo}>Protocolo {protocolo}</p>
            <h1 className={styles.heroNome}>{data.nome ?? "Cliente não identificado"}</h1>
            <p className={styles.heroPrograma}>{programa ? `Financiamento Habitacional — ${programa}` : "Financiamento Habitacional"}</p>
          </div>
          <div className={styles.heroRight}>
            <div className={styles.heroBadgeGroup}>
              {data.aguardando_retorno_correspondente && (
                <span className={`${styles.chipMedium} ${styles.badgeWarning}`}>
                  <IconClock /> Aguardando
                </span>
              )}
              {data.processo_enviado_correspondente && (
                <span className={`${styles.chipMedium} ${styles.badgeInfo}`}>
                  <IconCheck /> Enviado
                </span>
              )}
              {pendencias > 0 && (
                <span className={`${styles.chipMedium} ${styles.badgeDanger}`}>
                  <IconWarning /> {pendencias} pendência{pendencias !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabsBar}>
        <div className={styles.tabsInner}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className={styles.tabBadge}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <main className={styles.main}>
        {activeTab === "visao_geral" && <TabVisaoGeral data={data} />}
        {activeTab === "financeiro" && <TabFinanceiro data={data} />}
        {activeTab === "documentos" && <TabDocumentos data={data} />}
        {activeTab === "retorno" && <TabRetorno data={data} />}
      </main>
    </div>
  );
}

// ── Export principal ──

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
