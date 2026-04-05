// ============================================================
// Enova IA — Programas Sugeridos
// panel/app/lib/enova-ia-programas.ts
//
// PR F — Programas Sugeridos (Macro 2 — aba ENOVA IA)
// Escopo: PANEL-ONLY, read-only, sem backend novo, sem schema novo.
//
// Propósito:
//   Recebe LeituraGlobal + FilaItem[] (já computados nas PRs B e C)
//   e sugere programas táticos com base em sinais reais da operação.
//
// Fontes reais usadas:
//   - LeituraGlobal: docs_pendentes.total, fila_de_retorno.total, leads_ativos.total
//   - FilaItem[]: prioridade, contexto, justificativa
//
// Programas canônicos:
//   caca_pastas          — leads urgentes com docs pendentes na fila
//   reativacao_inteligente — leads frios/parados recuperáveis
//   mutirao_docs         — alto volume de docs pendentes (ação em lote)
//   pre_plantao          — leads sinalizando visita ou agendamento
//   intervencao_humana   — casos exigindo ação direta do corretor
//
// O que esta camada FAZ:
//   - Detectar oportunidades táticas a partir de sinais reais
//   - Sugerir apenas programas que fazem sentido pelos dados atuais
//   - Classificar prioridade e estimar tamanho da oportunidade
//   - Explicar o motivo da sugestão com sinal real
//
// O que esta camada NÃO FAZ:
//   - Escrever qualquer dado
//   - Chamar backend externo
//   - Executar campanha
//   - Mover lead
//   - Inventar sinal sem base real
// ============================================================

import type { LeituraGlobal } from "./enova-ia-leitura";
import type { FilaItem } from "./enova-ia-fila";

// ── Tipos canônicos de saída ──────────────────────────────────────────────

export type PrioridadePrograma = "alta" | "media" | "baixa";

export type ProgramaId =
  | "caca_pastas"
  | "reativacao_inteligente"
  | "mutirao_docs"
  | "pre_plantao"
  | "intervencao_humana";

export type ProgramaSugerido = {
  id: ProgramaId;
  /** Título legível do programa. */
  titulo: string;
  /** Resumo curto — o que é este programa. */
  resumo: string;
  /** Motivo da sugestão — sinal real que a sustenta. */
  motivo: string;
  /** Número estimado de leads afetados. */
  oportunidade_estimada: number;
  /** Rótulo legível para a oportunidade. */
  oportunidade_label: string;
  /** Nível de prioridade da intervenção. */
  prioridade: PrioridadePrograma;
  /** Ação curta sugerida ao operador. */
  acao_sugerida: string;
  /**
   * Qualidade do sinal de detecção:
   *   "exato"    — sinal direto de campo estruturado (ex: pedir_humano count)
   *   "inferido" — derivado de heurística sobre texto ou fases
   */
  precisao: "exato" | "inferido";
};

// ── Taxonomia estática dos programas ─────────────────────────────────────

const PROGRAMA_META: Record<
  ProgramaId,
  { titulo: string; resumo: string; acao_sugerida: string }
> = {
  caca_pastas: {
    titulo: "Caça-Pastas",
    resumo: "Leads urgentes com documentação pendente — acionar agora.",
    acao_sugerida: "Contactar leads prioritários e solicitar documentos.",
  },
  reativacao_inteligente: {
    titulo: "Reativação Inteligente",
    resumo: "Leads frios ou parados com potencial de retomada.",
    acao_sugerida: "Enviar follow-up reativador e reavaliar interesse.",
  },
  mutirao_docs: {
    titulo: "Mutirão de Docs",
    resumo: "Alto volume de documentação pendente — mobilização em lote.",
    acao_sugerida: "Organizar ação coordenada para destravar documentação.",
  },
  pre_plantao: {
    titulo: "Pré-Plantão",
    resumo: "Leads próximos de visita ou agendamento identificados.",
    acao_sugerida: "Confirmar plantão e preparar leads para a visita.",
  },
  intervencao_humana: {
    titulo: "Intervenção Humana",
    resumo: "Casos que requerem ação direta do corretor.",
    acao_sugerida: "Revisar casos e acionar corretor responsável.",
  },
};

// ── Regex de detecção de contexto ────────────────────────────────────────

const RX_DOCS = /\b(doc(?:umento)?s?|pasta|arquivo)\b/i;
const RX_VISITA = /\b(visita|agendamento|plantão|plantao|confirmad[ao])\b/i;

// ── Thresholds mínimos para sugestão ─────────────────────────────────────

const THRESHOLD_INTERVENCAO_HUMANA = 1; // ≥1 pedir_humano → sugerir
const THRESHOLD_MUTIRAO_DOCS = 5;       // ≥5 docs pendentes (KPI global) → mutirão
const THRESHOLD_CACA_PASTAS = 2;        // ≥2 leads docs urgentes na fila → caça-pastas
const THRESHOLD_PRE_PLANTAO = 2;        // ≥2 leads com visita na fila → pré-plantão
const THRESHOLD_REATIVACAO = 4;         // ≥4 leads aguardar+retorno → reativação

// ── Função principal ──────────────────────────────────────────────────────

/**
 * sugereProgramas — detecta oportunidades táticas e retorna lista de
 * programas sugeridos ordenados por prioridade (alta → baixa).
 *
 * Retorna apenas os programas que fazem sentido pelos dados atuais.
 * Se nenhum sinal for suficiente, retorna array vazio.
 *
 * @param leituraGlobal — KPIs globais (PR B). Pode ser null se dados não carregados.
 * @param fila          — Fila inteligente (PR C). Pode ser vazio.
 */
export function sugereProgramas(
  leituraGlobal: LeituraGlobal | null,
  fila: FilaItem[],
): ProgramaSugerido[] {
  const resultado: ProgramaSugerido[] = [];

  // ── Agregação de sinais da fila ───────────────────────────────────────
  let contPedirHumano = 0;
  let contAguardar = 0;
  let contDocsNaFila = 0;
  let contDocsUrgenteNaFila = 0; // docs + (agir_agora | agir_hoje)
  let contVisitaNaFila = 0;

  for (const item of fila) {
    const textoFila = `${item.contexto} ${item.justificativa}`;
    const ehDocsRelacionado = RX_DOCS.test(textoFila);
    const ehUrgente =
      item.prioridade === "agir_agora" || item.prioridade === "agir_hoje";

    if (item.prioridade === "pedir_humano") contPedirHumano += 1;
    if (item.prioridade === "aguardar") contAguardar += 1;
    if (ehDocsRelacionado) contDocsNaFila += 1;
    if (ehDocsRelacionado && ehUrgente) contDocsUrgenteNaFila += 1;
    if (RX_VISITA.test(textoFila)) contVisitaNaFila += 1;
  }

  // ── Sinais do KPI global ──────────────────────────────────────────────
  const docsPendentesTotal = leituraGlobal?.docs_pendentes.total ?? 0;
  const filaDeRetornoTotal = leituraGlobal?.fila_de_retorno.total ?? 0;

  // ── 1. Intervenção Humana ─────────────────────────────────────────────
  // Sinal: leads com prioridade pedir_humano na fila (exato)
  if (contPedirHumano >= THRESHOLD_INTERVENCAO_HUMANA) {
    const meta = PROGRAMA_META.intervencao_humana;
    const prioridade: PrioridadePrograma = contPedirHumano >= 3 ? "alta" : "media";
    const plural = contPedirHumano > 1 ? "s" : "";
    resultado.push({
      id: "intervencao_humana",
      titulo: meta.titulo,
      resumo: meta.resumo,
      motivo: `${contPedirHumano} lead${plural} com incidente aberto ou ação humana sinalizada`,
      oportunidade_estimada: contPedirHumano,
      oportunidade_label: `${contPedirHumano} lead${plural}`,
      prioridade,
      acao_sugerida: meta.acao_sugerida,
      precisao: "exato",
    });
  }

  // ── 2. Mutirão de Docs ────────────────────────────────────────────────
  // Sinal: docs_pendentes.total alto (≥5) — ação em lote
  if (docsPendentesTotal >= THRESHOLD_MUTIRAO_DOCS) {
    const meta = PROGRAMA_META.mutirao_docs;
    const prioridade: PrioridadePrograma = docsPendentesTotal >= 10 ? "alta" : "media";
    resultado.push({
      id: "mutirao_docs",
      titulo: meta.titulo,
      resumo: meta.resumo,
      motivo: `${docsPendentesTotal} leads com documentação pendente na operação`,
      oportunidade_estimada: docsPendentesTotal,
      oportunidade_label: `${docsPendentesTotal} leads`,
      prioridade,
      acao_sugerida: meta.acao_sugerida,
      precisao: "inferido",
    });
  }

  // ── 3. Caça-Pastas ────────────────────────────────────────────────────
  // Sinal: leads com docs urgentes (agir_agora/agir_hoje) na fila — caça individual
  // Complementa o mutirão: identifica os leads quentes dentro da fila
  if (contDocsUrgenteNaFila >= THRESHOLD_CACA_PASTAS) {
    const meta = PROGRAMA_META.caca_pastas;
    const jaTemMutirao = resultado.some((p) => p.id === "mutirao_docs");
    const motivoSufixo = jaTemMutirao
      ? "leads prioritários dentro do volume de docs pendentes"
      : "leads com docs urgentes identificados na fila";
    resultado.push({
      id: "caca_pastas",
      titulo: meta.titulo,
      resumo: meta.resumo,
      motivo: `${contDocsUrgenteNaFila} ${motivoSufixo}`,
      oportunidade_estimada: contDocsUrgenteNaFila,
      oportunidade_label: `${contDocsUrgenteNaFila} leads`,
      prioridade: jaTemMutirao ? "alta" : "media",
      acao_sugerida: meta.acao_sugerida,
      precisao: "inferido",
    });
  }

  // ── 4. Pré-Plantão ────────────────────────────────────────────────────
  // Sinal: leads com "visita" ou "agendamento" no contexto da fila
  if (contVisitaNaFila >= THRESHOLD_PRE_PLANTAO) {
    const meta = PROGRAMA_META.pre_plantao;
    resultado.push({
      id: "pre_plantao",
      titulo: meta.titulo,
      resumo: meta.resumo,
      motivo: `${contVisitaNaFila} leads com visita ou agendamento identificados na fila`,
      oportunidade_estimada: contVisitaNaFila,
      oportunidade_label: `${contVisitaNaFila} leads`,
      prioridade: "media",
      acao_sugerida: meta.acao_sugerida,
      precisao: "inferido",
    });
  }

  // ── 5. Reativação Inteligente ─────────────────────────────────────────
  // Sinal: leads aguardando na fila + fila de retorno (leads frios/parados)
  const sinalReativacao = Math.max(contAguardar, filaDeRetornoTotal);
  if (sinalReativacao >= THRESHOLD_REATIVACAO) {
    const meta = PROGRAMA_META.reativacao_inteligente;
    const prioridade: PrioridadePrograma = sinalReativacao >= 10 ? "media" : "baixa";
    const partes: string[] = [];
    if (filaDeRetornoTotal > 0) partes.push(`${filaDeRetornoTotal} na fila de retorno`);
    if (contAguardar > 0) partes.push(`${contAguardar} aguardando`);
    resultado.push({
      id: "reativacao_inteligente",
      titulo: meta.titulo,
      resumo: meta.resumo,
      motivo: partes.join(" · "),
      oportunidade_estimada: sinalReativacao,
      oportunidade_label: `~${sinalReativacao} leads`,
      prioridade,
      acao_sugerida: meta.acao_sugerida,
      precisao: "inferido",
    });
  }

  // ── Ordenar por prioridade (alta → media → baixa) ─────────────────────
  const PRIORIDADE_ORDER: Record<PrioridadePrograma, number> = {
    alta: 0,
    media: 1,
    baixa: 2,
  };
  resultado.sort(
    (a, b) => PRIORIDADE_ORDER[a.prioridade] - PRIORIDADE_ORDER[b.prioridade],
  );

  return resultado;
}
