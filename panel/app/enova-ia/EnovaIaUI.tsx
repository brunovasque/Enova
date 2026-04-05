"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import styles from "./enova-ia.module.css";
import type { LeituraGlobal, KPIBloco } from "../lib/enova-ia-leitura";
import type { FilaItem, PrioridadeFila } from "../lib/enova-ia-fila";
import { PRIORIDADE_FILA_LABEL } from "../lib/enova-ia-fila";
import type { ProgramaSugerido, PrioridadePrograma } from "../lib/enova-ia-programas";
import { routeChat, genMsgId } from "../lib/enova-ia-chat";
import type { ChatMsg } from "../lib/enova-ia-chat";

const GARGALOS = [
  { tipo: "Documentação", descricao: "Leitura de gargalos virá da análise cognitiva global" },
  { tipo: "Follow-up", descricao: "Fila de oportunidades conectada na próxima PR" },
];

// ---------------------------------------------------------------------------
// Sub-componente: badge de prioridade da fila
// ---------------------------------------------------------------------------

const PRIORIDADE_BADGE_CLASS: Record<PrioridadeFila, string | undefined> = {
  agir_agora:   styles.filaBadgeAgirAgora,
  pedir_humano: styles.filaBadgePedirHumano,
  agir_hoje:    styles.filaBadgeAgirHoje,
  observar:     styles.filaBadgeObservar,
  aguardar:     styles.filaBadgeAguardar,
};

function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeFila }) {
  const label = PRIORIDADE_FILA_LABEL[prioridade];
  const cls = PRIORIDADE_BADGE_CLASS[prioridade] ?? styles.filaBadgeAguardar;
  return <span className={cls}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Bloco "Fila Inteligente"
// ---------------------------------------------------------------------------

function FilaInteligenteSection({ fila }: { fila: FilaItem[] }) {
  const vazia = fila.length === 0;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Fila Inteligente</h2>
      <p className={styles.sectionHint}>
        {vazia
          ? "Sem leads para priorizar no momento."
          : `${fila.length} lead${fila.length > 1 ? "s" : ""} priorizados · fonte: enova_attendance_v1`}
      </p>

      {vazia ? (
        <div className={styles.filaVazia}>Nenhum lead ativo encontrado.</div>
      ) : (
        <div className={styles.filaTable}>
          <div className={styles.filaHeader}>
            <span>Lead</span>
            <span>Contexto · justificativa</span>
            <span>Prioridade</span>
            <span></span>
          </div>
          {fila.map((item) => (
            <div key={item.wa_id} className={styles.filaRow}>
              <span className={styles.filaName}>{item.nome_display}</span>
              <span className={styles.filaDetalhe}>
                <span className={styles.filaContexto}>{item.contexto}</span>
                <span className={styles.filaJustificativa}>{item.justificativa}</span>
              </span>
              <PrioridadeBadge prioridade={item.prioridade} />
              <Link href={item.href_ficha} className={styles.filaLink}>
                Ver ficha →
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

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
// Bloco "Chat Operacional"
// ---------------------------------------------------------------------------

const CHAT_EXEMPLOS = [
  "quais leads precisam ação agora?",
  "quem está com docs pendentes?",
  "quem precisa de humano?",
  "quais estão na fila de retorno?",
  "quantos leads estão em atendimento?",
  "quem está perto de plantão?",
  "resumo geral",
  "como funciona composição de renda?",
  "quando vale pedir docs?",
  "qual a lógica do follow-up?",
  "o que é lead frio recuperável?",
  "quando oferecer plantão?",
  "como a Enova trata reprovados?",
  "quando precisa humano?",
];

function ChatResponseRender({ msg }: { msg: ChatMsg }) {
  const r = msg.resposta;

  if (msg.origem === "usuario") {
    return (
      <div className={styles.chatMsgUsuario}>
        <span className={styles.chatMsgTexto}>{msg.texto}</span>
      </div>
    );
  }

  if (!r) {
    return (
      <div className={styles.chatMsgEnova}>
        <span className={styles.chatMsgTexto}>{msg.texto}</span>
      </div>
    );
  }

  return (
    <div className={styles.chatMsgEnova}>
      <div className={styles.chatRespTitulo}>
        {r.tipo === "conhecimento" && (
          <span className={styles.chatRespKbBadge}>📚 Conhecimento</span>
        )}
        {r.titulo}
      </div>
      <div className={styles.chatRespResumo}>{r.resumo}</div>
      {r.bullets && r.bullets.length > 0 && (
        <ul className={styles.chatRespBullets}>
          {r.bullets.map((b, i) => (
            <li key={i} className={styles.chatRespBullet}>
              {b}
            </li>
          ))}
        </ul>
      )}
      {r.linhas && r.linhas.length > 0 && (
        <ul className={styles.chatRespLinhas}>
          {r.linhas.map((linha, i) => (
            <li key={i} className={styles.chatRespLinha}>
              <Link href={linha.href} className={styles.chatRespNome}>
                {linha.nome}
              </Link>
              <span className={styles.chatRespDetalhe}>{linha.detalhe}</span>
            </li>
          ))}
        </ul>
      )}
      {r.sugestao && (
        <div className={styles.chatRespSugestao}>💡 {r.sugestao}</div>
      )}
    </div>
  );
}

function ChatOperacionalSection({
  fila,
  leituraGlobal,
}: {
  fila: FilaItem[];
  leituraGlobal: LeituraGlobal | null;
}) {
  const [historico, setHistorico] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);

  function enviar(texto: string) {
    const t = texto.trim();
    if (!t) return;

    const msgUsuario: ChatMsg = {
      id:      genMsgId(),
      origem:  "usuario",
      texto:   t,
      ts:      Date.now(),
    };

    const resposta = routeChat(t, fila, leituraGlobal);
    const msgEnova: ChatMsg = {
      id:      genMsgId(),
      origem:  "enova",
      texto:   resposta.titulo,
      resposta,
      ts:      Date.now(),
    };

    setHistorico((prev) => [...prev, msgUsuario, msgEnova]);
    setInput("");

    // Wait for the DOM to update before scrolling so the new messages are in the layout
    const SCROLL_DELAY_MS = 50;
    setTimeout(() => {
      listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" });
    }, SCROLL_DELAY_MS);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      enviar(input);
    }
  }

  function onExemplo(ex: string) {
    enviar(ex);
  }

  const vazio = historico.length === 0;

  return (
    <section className={`${styles.card} ${styles.cardChat}`}>
      <h2 className={styles.cardTitle}>Chat Operacional</h2>
      <p className={styles.cardHint}>
        Comando direto com a Enova — leitura baseada nos dados reais do painel.
      </p>

      {/* Histórico */}
      <div ref={listaRef} className={styles.chatHistorico}>
        {vazio ? (
          <div className={styles.chatVazio}>
            <span className={styles.chatVazioTitulo}>Como posso ajudar?</span>
            <span className={styles.chatVazioHint}>Exemplos de comandos:</span>
            <div className={styles.chatExemplos}>
              {CHAT_EXEMPLOS.map((ex) => (
                <button
                  key={ex}
                  className={styles.chatExemplo}
                  onClick={() => onExemplo(ex)}
                  type="button"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          historico.map((msg) => <ChatResponseRender key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Input */}
      <div className={styles.chatInputRow}>
        <input
          className={styles.chatInput}
          type="text"
          placeholder="Ex: quais leads precisam ação agora?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Comando para a Enova"
        />
        <button
          className={styles.chatBotaoEnviar}
          onClick={() => enviar(input)}
          type="button"
          disabled={!input.trim()}
          aria-label="Enviar"
        >
          Enviar
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bloco "Programas Sugeridos"
// ---------------------------------------------------------------------------

const PRIORIDADE_PROGRAMA_BADGE_CLASS: Record<PrioridadePrograma, string> = {
  alta: styles.programaBadgeAlta,
  media: styles.programaBadgeMedia,
  baixa: styles.programaBadgeBaixa,
};

const PRIORIDADE_PROGRAMA_LABEL: Record<PrioridadePrograma, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

function ProgramaCard({ programa }: { programa: ProgramaSugerido }) {
  const badgeCls = PRIORIDADE_PROGRAMA_BADGE_CLASS[programa.prioridade];
  const badgeLabel = PRIORIDADE_PROGRAMA_LABEL[programa.prioridade];
  return (
    <div className={styles.programaCard}>
      <div className={styles.programaCardHeader}>
        <span className={styles.programaCardTitulo}>{programa.titulo}</span>
        <span className={badgeCls}>{badgeLabel}</span>
      </div>
      <span className={styles.programaCardResumo}>{programa.resumo}</span>
      <span className={styles.programaCardMotivo}>{programa.motivo}</span>
      <div className={styles.programaCardFooter}>
        <span className={styles.programaCardOportunidade}>
          {programa.oportunidade_label}
        </span>
        <span className={styles.programaCardAcao}>{programa.acao_sugerida}</span>
      </div>
    </div>
  );
}

function ProgramasSugeridosSection({
  programas,
}: {
  programas: ProgramaSugerido[];
}) {
  const vazio = programas.length === 0;
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Programas Sugeridos</h2>
      <p className={styles.cardHint}>
        {vazio
          ? "Sem oportunidades táticas detectadas no momento."
          : `${programas.length} programa${programas.length > 1 ? "s" : ""} sugerido${programas.length > 1 ? "s" : ""} · baseado em dados reais da operação`}
      </p>
      {vazio ? (
        <div className={styles.programaVazio}>
          Operação sem sinais de oportunidade tática no momento.
        </div>
      ) : (
        <div className={styles.programaList}>
          {programas.map((p) => (
            <ProgramaCard key={p.id} programa={p} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------


export function EnovaIaUI({
  leituraGlobal = null,
  filaInteligente = [],
  programasSugeridos = [],
}: {
  leituraGlobal?: LeituraGlobal | null;
  filaInteligente?: FilaItem[];
  programasSugeridos?: ProgramaSugerido[];
}) {
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
        <FilaInteligenteSection fila={filaInteligente} />

        {/* ── GRID INFERIOR: Programas + Gargalos + Chat ──────────── */}
        <div className={styles.bottomGrid}>

          {/* Programas Sugeridos */}
          <ProgramasSugeridosSection programas={programasSugeridos} />

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
          <ChatOperacionalSection
            fila={filaInteligente}
            leituraGlobal={leituraGlobal}
          />

        </div>
      </div>
    </main>
  );
}
