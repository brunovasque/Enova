"use client";

import styles from "./enova-ia.module.css";

// ---------------------------------------------------------------------------
// Dados de casca — sem lógica real ainda. Encaixes para as próximas PRs.
// ---------------------------------------------------------------------------

const VISAO_GERAL = [
  { label: "Leads Ativos", value: "—", hint: "leitura global pendente" },
  { label: "Em Atendimento", value: "—", hint: "leitura global pendente" },
  { label: "Fila de Retorno", value: "—", hint: "leitura global pendente" },
  { label: "Docs Pendentes", value: "—", hint: "leitura global pendente" },
];

const FILA_ITEMS = [
  { nome: "Fila inteligente", detalhe: "Será preenchida pela leitura global da operação", status: "aguardando" },
];

const PROGRAMAS = [
  { titulo: "MCMV Faixa 1", desc: "Integração programada para próxima PR" },
  { titulo: "MCMV Faixa 2", desc: "Integração programada para próxima PR" },
  { titulo: "MCMV Faixa 3", desc: "Integração programada para próxima PR" },
];

const GARGALOS = [
  { tipo: "Documentação", descricao: "Leitura de gargalos virá da análise cognitiva global" },
  { tipo: "Follow-up", descricao: "Fila de oportunidades conectada na próxima PR" },
];

// ---------------------------------------------------------------------------

export function EnovaIaUI() {
  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>

        {/* ── HEADER ──────────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerBadge}>Central Cognitiva</div>
            <h1 className={styles.headerTitle}>ENOVA IA</h1>
            <p className={styles.headerSubtitle}>
              Diretoria operacional da esteira — visão global, fila inteligente e suporte decisório
            </p>
          </div>
          <div className={styles.headerStatus}>
            <span className={styles.statusDot} />
            <span className={styles.statusLabel}>Em implantação</span>
          </div>
        </header>

        {/* ── VISÃO GERAL ─────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Leitura Global da Operação</h2>
          <p className={styles.sectionHint}>
            Números reais serão conectados na PR da leitura global.
          </p>
          <div className={styles.statsGrid}>
            {VISAO_GERAL.map((item) => (
              <div key={item.label} className={styles.statCard}>
                <span className={styles.statLabel}>{item.label}</span>
                <span className={styles.statValue}>{item.value}</span>
                <span className={styles.statHint}>{item.hint}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── FILA INTELIGENTE ────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Fila Inteligente</h2>
          <p className={styles.sectionHint}>
            Leads priorizados por urgência e maturidade comercial — lógica conectada na próxima PR.
          </p>
          <div className={styles.filaTable}>
            <div className={styles.filaHeader}>
              <span>Lead</span>
              <span>Contexto</span>
              <span>Status</span>
            </div>
            {FILA_ITEMS.map((item, i) => (
              <div key={i} className={styles.filaRow}>
                <span className={styles.filaName}>{item.nome}</span>
                <span className={styles.filaDetalhe}>{item.detalhe}</span>
                <span className={styles.filaBadgePending}>{item.status}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── GRID INFERIOR: Programas + Gargalos + Chat ──────────── */}
        <div className={styles.bottomGrid}>

          {/* Programas Sugeridos */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Programas Sugeridos</h2>
            <p className={styles.cardHint}>
              Elegibilidade calculada na PR dos programas.
            </p>
            <div className={styles.programaList}>
              {PROGRAMAS.map((p) => (
                <div key={p.titulo} className={styles.programaItem}>
                  <span className={styles.programaTitulo}>{p.titulo}</span>
                  <span className={styles.programaDesc}>{p.desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Gargalos e Oportunidades */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Gargalos e Oportunidades</h2>
            <p className={styles.cardHint}>
              Análise cognitiva global conectada na próxima PR.
            </p>
            <div className={styles.gargaloList}>
              {GARGALOS.map((g) => (
                <div key={g.tipo} className={styles.gargaloItem}>
                  <span className={styles.gargaloTipo}>{g.tipo}</span>
                  <span className={styles.gargaloDesc}>{g.descricao}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Chat Operacional */}
          <section className={`${styles.card} ${styles.cardChat}`}>
            <h2 className={styles.cardTitle}>Chat Operacional</h2>
            <p className={styles.cardHint}>
              Interface de comando direto com a Enova — conectada na PR do chat.
            </p>
            <div className={styles.chatShell}>
              <div className={styles.chatEmpty}>
                <span className={styles.chatEmptyIcon}>⬡</span>
                <span className={styles.chatEmptyText}>
                  Chat operacional disponível na próxima frente
                </span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
