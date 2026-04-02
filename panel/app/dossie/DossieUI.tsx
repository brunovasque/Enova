"use client";

import Image from "next/image";
import styles from "./dossie.module.css";

// Mock data para o dossiê
const DOSSIE_DATA = {
  protocolo: "ENV-2024-00847",
  titulo: "Financiamento Habitacional — Casa Verde e Amarela",
  subtitulo: "Análise de crédito imobiliário para aquisição de imóvel residencial novo",
  status: "Em Análise",
  prioridade: "Alta",
  cliente: {
    nome: "Maria Aparecida Santos Silva",
    cpf: "***.***.789-00",
  },
  correspondente: {
    nome: "Imobiliária Nova Esperança LTDA",
    codigo: "CORR-2847",
  },
  unidade: "Residencial Jardim das Flores — Unidade 204, Bloco B",
  cidade: "Campinas / SP",
  abertura: "15/03/2024",
  prazo: "29/03/2024",
  resumo: `Cliente interessada na aquisição de apartamento de 2 dormitórios no programa Casa Verde e Amarela (Faixa 2). Renda familiar composta pela proponente e cônjuge totaliza R$ 5.200,00 mensais. Imóvel avaliado em R$ 215.000,00, com entrada de R$ 25.000,00 via FGTS. Financiamento solicitado de R$ 190.000,00 em 360 meses. Documentação pessoal completa, pendente apenas comprovante de estado civil atualizado e certidão de matrícula do imóvel. Simulação preliminar indica parcela estimada de R$ 1.420,00 e subsídio potencial de R$ 12.500,00.`,
  perfilTecnico: {
    processo: "FIN-2024-00847-SP",
    instituicao: "Caixa Econômica Federal",
    programa: "Casa Verde e Amarela — Faixa 2",
    valorImovel: "R$ 215.000,00",
    valorFinanciamento: "R$ 190.000,00",
    subsidioEstimado: "R$ 12.500,00",
    rendaFamiliar: "R$ 5.200,00",
    parcelaEstimada: "R$ 1.420,00",
    taxaJuros: "7,66% a.a.",
    prazoMeses: "360 meses",
    nivelRisco: "Baixo",
  },
  tags: ["MCMV", "Faixa 2", "Primeiro Imóvel", "Subsídio", "FGTS"],
  documentosRecebidos: [
    { nome: "RG e CPF — Proponente", formato: "PDF", paginas: 2, recebido: "15/03/2024" },
    { nome: "RG e CPF — Cônjuge", formato: "PDF", paginas: 2, recebido: "15/03/2024" },
    { nome: "Comprovante de Renda — Proponente", formato: "PDF", paginas: 3, recebido: "16/03/2024" },
    { nome: "Comprovante de Renda — Cônjuge", formato: "PDF", paginas: 2, recebido: "16/03/2024" },
    { nome: "Comprovante de Residência", formato: "PDF", paginas: 1, recebido: "15/03/2024" },
    { nome: "Extrato FGTS", formato: "PDF", paginas: 4, recebido: "17/03/2024" },
    { nome: "Declaração de IR 2023", formato: "PDF", paginas: 12, recebido: "18/03/2024" },
  ],
  documentosPendentes: [
    { nome: "Certidão de Casamento Atualizada", prazo: "25/03/2024", prioridade: "Alta" },
    { nome: "Certidão de Matrícula do Imóvel", prazo: "27/03/2024", prioridade: "Alta" },
    { nome: "Declaração de União Estável (se aplicável)", prazo: "29/03/2024", prioridade: "Média" },
  ],
  linksOperacionais: [
    { titulo: "Simulador Habitacional", desc: "Caixa Econômica Federal", url: "#" },
    { titulo: "Portal do Correspondente", desc: "Enova Banking", url: "#" },
    { titulo: "Consulta FGTS", desc: "Extrato e Saldo", url: "#" },
    { titulo: "CadÚnico", desc: "Consulta de Cadastro", url: "#" },
    { titulo: "Certidão Negativa", desc: "Receita Federal", url: "#" },
    { titulo: "Consulta Matrícula", desc: "Cartório de Registro", url: "#" },
  ],
  instrucoes: [
    "Solicitar ao cliente a Certidão de Casamento atualizada (emitida há menos de 90 dias) junto ao Cartório de Registro Civil.",
    "Requerer junto ao vendedor/incorporadora a Certidão de Matrícula Atualizada do imóvel, com negativa de ônus.",
    "Verificar se há necessidade de Declaração de União Estável, caso o casal não seja oficialmente casado.",
    "Após recebimento dos documentos pendentes, submeter dossiê completo para análise de crédito na instituição.",
    "Acompanhar prazo de validade dos documentos já enviados — alguns podem expirar antes da conclusão.",
    "Manter contato ativo com o cliente para agilizar a entrega e evitar atrasos no processo.",
  ],
};

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

export default function DossieUI() {
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
            Atualizado há 2 horas
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Hero Card - Card Principal do Caso */}
        <section className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <span className={styles.heroProtocol}>Protocolo {DOSSIE_DATA.protocolo}</span>
              <h2 className={styles.heroTitle}>{DOSSIE_DATA.titulo}</h2>
              <p className={styles.heroSubtitle}>{DOSSIE_DATA.subtitulo}</p>
            </div>
            <div className={styles.heroBadges}>
              <span className={`${styles.badge} ${styles.badgeAnalise}`}>{DOSSIE_DATA.status}</span>
              <span className={`${styles.badge} ${styles.badgePrioridade}`}>Prioridade {DOSSIE_DATA.prioridade}</span>
            </div>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Cliente</span>
              <span className={styles.heroGridValue}>{DOSSIE_DATA.cliente.nome}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Correspondente</span>
              <span className={styles.heroGridValue}>{DOSSIE_DATA.correspondente.nome}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Unidade / Cidade</span>
              <span className={styles.heroGridValue}>{DOSSIE_DATA.cidade}</span>
            </div>
            <div className={styles.heroGridItem}>
              <span className={styles.heroGridLabel}>Abertura / Prazo</span>
              <span className={styles.heroGridValue}>{DOSSIE_DATA.abertura} — {DOSSIE_DATA.prazo}</span>
            </div>
          </div>
        </section>

        {/* Resumo do Caso */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <FileTextIcon />
            </div>
            <h3 className={styles.sectionTitle}>Resumo do Caso</h3>
          </div>
          <p className={styles.resumoText}>{DOSSIE_DATA.resumo}</p>
        </section>

        {/* Perfil Técnico Consolidado */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <ChartIcon />
            </div>
            <h3 className={styles.sectionTitle}>Perfil Técnico Consolidado</h3>
          </div>
          <div className={styles.perfilGrid}>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Nº do Processo</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.processo}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Instituição</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.instituicao}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Programa</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.programa}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Valor do Imóvel</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.valorImovel}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Valor do Financiamento</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.valorFinanciamento}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Subsídio Estimado</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.subsidioEstimado}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Renda Mensal Familiar</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.rendaFamiliar}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Parcela Estimada</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.parcelaEstimada}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Taxa de Juros</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.taxaJuros}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Prazo</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.prazoMeses}</span>
            </div>
            <div className={styles.perfilItem}>
              <span className={styles.perfilLabel}>Nível de Risco</span>
              <span className={styles.perfilValue}>{DOSSIE_DATA.perfilTecnico.nivelRisco}</span>
            </div>
          </div>
          <div className={styles.perfilTags}>
            {DOSSIE_DATA.tags.map((tag, index) => (
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
            <div className={styles.sectionIcon}>
              <DocumentIcon />
            </div>
            <h3 className={styles.sectionTitle}>Documentos Recebidos</h3>
          </div>
          <table className={styles.docTable}>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Formato</th>
                <th>Páginas</th>
                <th>Recebido em</th>
              </tr>
            </thead>
            <tbody>
              {DOSSIE_DATA.documentosRecebidos.map((doc, index) => (
                <tr key={index}>
                  <td>
                    <div className={styles.docName}>
                      <div className={`${styles.docIcon} ${styles.docIconPdf}`}>
                        <DocumentIcon />
                      </div>
                      {doc.nome}
                    </div>
                  </td>
                  <td>{doc.formato}</td>
                  <td>{doc.paginas}</td>
                  <td>{doc.recebido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Documentos Pendentes */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <ClockIcon />
            </div>
            <h3 className={styles.sectionTitle}>Documentos Pendentes</h3>
          </div>
          <div className={styles.pendentesList}>
            {DOSSIE_DATA.documentosPendentes.map((doc, index) => (
              <div key={index} className={styles.pendenteItem}>
                <div className={styles.pendenteInfo}>
                  <div className={styles.pendenteIcon}>
                    <ClipboardIcon />
                  </div>
                  <div className={styles.pendenteTexts}>
                    <span className={styles.pendenteName}>{doc.nome}</span>
                    <span className={styles.pendentePrazo}>Prazo: {doc.prazo}</span>
                  </div>
                </div>
                <span className={`${styles.badge} ${doc.prioridade === "Alta" ? styles.badgePrioridade : styles.badgeMedia}`}>
                  {doc.prioridade}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Links Operacionais */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <LinkIcon />
            </div>
            <h3 className={styles.sectionTitle}>Links Operacionais</h3>
          </div>
          <div className={styles.linksGrid}>
            {DOSSIE_DATA.linksOperacionais.map((link, index) => (
              <a key={index} href={link.url} className={styles.linkCard} target="_blank" rel="noopener noreferrer">
                <div className={styles.linkIcon}>
                  <LinkIcon />
                </div>
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
            <div className={styles.sectionIcon}>
              <ListIcon />
            </div>
            <h3 className={styles.sectionTitle}>Instruções de Retorno ao Correspondente</h3>
          </div>
          <div className={styles.instrucoesList}>
            {DOSSIE_DATA.instrucoes.map((instrucao, index) => (
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
