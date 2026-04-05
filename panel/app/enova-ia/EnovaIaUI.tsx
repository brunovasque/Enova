"use client";

import styles from "./enova-ia.module.css";
import type { LeituraGlobal, KPIBloco } from "../lib/enova-ia-leitura";

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
// Sub-componente: card individual de KPI
// ---------------------------------------------------------------------------

function KPICard({ bloco }: { bloco: KPIBloco }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statLabel}>{bloco.label}</span>
      <span className={styles.statValue}>{bloco.total}</span>
      <span className={styles.statHint}>{bloco.hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloco "Leitura Global da Operação"
// ---------------------------------------------------------------------------

function LeituraGlobalSection({ leituraGlobal }: { leituraGlobal: LeituraGlobal | null }) {
  if (!leituraGlobal) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Leitura Global da Operação</h2>
        <p className={styles.sectionHint}>Carregando dados da operação…</p>
        <div className={styles.statsGrid}>
          {["Leads Ativos", "Em Atendimento", "Fila de Retorno", "Docs Pendentes"].map((label) => (
            <div key={label} className={styles.statCard}>
              <span className={styles.statLabel}>{label}</span>
              <span className={styles.statValue}>—</span>
              <span className={styles.statHint}>aguardando leitura</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Leitura Global da Operação</h2>
      <p className={styles.sectionHint}>
        Leitura real — fonte: enova_attendance_v1 ·{" "}
        {new Date(leituraGlobal.agregado_em).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <div className={styles.statsGrid}>
        <KPICard bloco={leituraGlobal.leads_ativos} />
        <KPICard bloco={leituraGlobal.em_atendimento} />
        <KPICard bloco={leituraGlobal.fila_de_retorno} />
        <KPICard bloco={leituraGlobal.docs_pendentes} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

// null = dados não disponíveis (erro de fetch ou env ausente) → UI renderiza estado de espera.
export function EnovaIaUI({ leituraGlobal = null }: { leituraGlobal?: LeituraGlobal | null }) {
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

        {/* ── LEITURA GLOBAL ──────────────────────────────────────── */}
        <LeituraGlobalSection leituraGlobal={leituraGlobal} />

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
