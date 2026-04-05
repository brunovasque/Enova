// ============================================================
// Enova IA — Fila Inteligente
// panel/app/lib/enova-ia-fila.ts
//
// PR C — Fila Inteligente (Macro 2 — aba ENOVA IA)
// Escopo: PANEL-ONLY, read-only, sem backend novo, sem schema novo.
//
// Propósito:
//   Recebe o array bruto de leads (enova_attendance_v1) e devolve
//   uma fila priorizada de até MAX_FILA_ITEMS itens, ordenada por
//   prioridade e com justificativa objetiva para cada lead.
//
// Fontes reais usadas:
//   - enova_attendance_v1 (via fetchAttendanceLeadsAction)
//     Campos consumidos:
//       wa_id, nome, telefone,
//       status_atencao, prazo_proxima_acao,
//       fase_funil, pendencia_principal, proxima_acao,
//       lead_temp, tem_incidente_aberto, severidade_incidente,
//       human_next_action, fase_travamento, movido_fase_em,
//       ultima_interacao_cliente, atualizado_em
//
// O que esta camada FAZ:
//   - Classificar cada lead em uma das 5 prioridades canônicas
//   - Produzir contexto e justificativa objetivos a partir de sinais reais
//   - Ordenar a fila por prioridade (agir_agora primeiro)
//   - Limitar a MAX_FILA_ITEMS para não poluir a UI
//   - Resolver link para a ficha do lead (/atendimento/<wa_id>)
//
// O que esta camada NÃO FAZ:
//   - Escrever qualquer dado
//   - Chamar backend externo
//   - Inventar urgência sem base real
//   - Classificar cognitivamente (isso é lead-cognitive.ts)
//   - Criar programas sugeridos ou chat operacional
// ============================================================

// ── Tipos canônicos de saída ──────────────────────────────────────────────

/**
 * PrioridadeFila — taxonomia canônica de priorização da fila inteligente.
 *
 *   agir_agora   — requer ação imediata (overdue, incidente crítico, lead quente parado)
 *   pedir_humano — requer intervenção humana (incidente aberto, ação humana sinalizada)
 *   agir_hoje    — requer ação no dia (prazo próximo, lead quente com pendência)
 *   observar     — monitorar (lead morno, sinal de interesse, sem urgência imediata)
 *   aguardar     — pode esperar (lead frio, sem sinal ativo)
 */
export type PrioridadeFila =
  | "agir_agora"
  | "pedir_humano"
  | "agir_hoje"
  | "observar"
  | "aguardar";

/** Rótulo legível para exibição na UI. */
export const PRIORIDADE_FILA_LABEL: Record<PrioridadeFila, string> = {
  agir_agora:   "Agir agora",
  pedir_humano: "Pedir humano",
  agir_hoje:    "Agir hoje",
  observar:     "Observar",
  aguardar:     "Aguardar",
};

/** Ordem numérica para sort (menor = mais urgente). */
const PRIORIDADE_ORDER: Record<PrioridadeFila, number> = {
  agir_agora:   0,
  pedir_humano: 1,
  agir_hoje:    2,
  observar:     3,
  aguardar:     4,
};

/** Item canônico da Fila Inteligente. */
export type FilaItem = {
  /** Chave de roteamento para a ficha do lead. */
  wa_id: string;
  /** Nome de exibição: nome > telefone > wa_id. */
  nome_display: string;
  /** Prioridade canônica. */
  prioridade: PrioridadeFila;
  /** Contexto curto: descreve em que pé está o lead (fase + pendência). */
  contexto: string;
  /** Justificativa objetiva da prioridade (sinal real que a motivou). */
  justificativa: string;
  /** URL canônica para a ficha do lead no painel. */
  href_ficha: string;
};

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum items shown in the queue to avoid a polluted UI. */
const MAX_FILA_ITEMS = 20;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Keywords that signal a human operator is required (from human_next_action field)
const HUMAN_ACTION_KEYWORDS = ["humano", "human", "corretor", "operador", "manual"] as const;

// Regex for document-related pending items (word-boundary safe)
const RX_PENDENCIA_DOC = /\b(doc(?:umento)?s?|pasta|arquivo)\b/i;

// Fases que indicam atividade operacional avançada (docs, visita, correspondente)
const FASES_OPERACIONAIS = new Set([
  "envio_docs",
  "analise_documentos",
  "finalizacao_processo",
  "aguardando_retorno_correspondente",
  "visita",
  "agendamento_visita",
  "visita_confirmada",
]);

// Fases de documentação
const FASES_DOCS = new Set([
  "envio_docs",
  "analise_documentos",
]);

// ── Helpers de campo ──────────────────────────────────────────────────────

function str(lead: Record<string, unknown>, key: string): string {
  const v = lead[key];
  return typeof v === "string" ? v.toLowerCase().trim() : "";
}

function strRaw(lead: Record<string, unknown>, key: string): string {
  const v = lead[key];
  return typeof v === "string" ? v.trim() : "";
}

function bool(lead: Record<string, unknown>, key: string): boolean {
  return lead[key] === true;
}

function isPrazoVencido(prazo: string): boolean {
  const ms = new Date(prazo).getTime();
  return Number.isFinite(ms) && ms < Date.now();
}

function isPrazoDueSoon(prazo: string): boolean {
  const ms = new Date(prazo).getTime();
  if (!Number.isFinite(ms)) return false;
  const diff = ms - Date.now();
  return diff >= 0 && diff < MS_PER_DAY; // vence em menos de 24h
}

function diasSemAtualizar(lead: Record<string, unknown>): number | null {
  const atualizado = strRaw(lead, "atualizado_em") || strRaw(lead, "ultima_interacao_cliente");
  if (!atualizado) return null;
  const ms = Date.now() - new Date(atualizado).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / MS_PER_DAY) : null;
}

function nomeDisplay(lead: Record<string, unknown>): string {
  return strRaw(lead, "nome") || strRaw(lead, "telefone") || strRaw(lead, "wa_id") || "—";
}

// ── Rótulos de contexto ───────────────────────────────────────────────────

/** Format a snake_case phase name for display. */
function formatFase(fase: string): string {
  return fase.replace(/_/g, " ");
}

function buildContexto(lead: Record<string, unknown>): string {
  const fase = strRaw(lead, "fase_funil");
  const pendencia = strRaw(lead, "pendencia_principal");
  const proxima = strRaw(lead, "proxima_acao");

  const parts: string[] = [];
  if (fase) parts.push(formatFase(fase));
  if (pendencia && pendencia.length <= 60) parts.push(pendencia);
  else if (proxima && proxima.length <= 60) parts.push(proxima);

  return parts.join(" · ") || "sem contexto disponível";
}

// ── Classificador de prioridade ───────────────────────────────────────────

function classifyLead(lead: Record<string, unknown>): { prioridade: PrioridadeFila; justificativa: string } {
  const statusAtencao   = str(lead, "status_atencao");
  const prazoStr        = strRaw(lead, "prazo_proxima_acao");
  const leadTemp        = str(lead, "lead_temp");
  const faseFunil       = str(lead, "fase_funil");
  const temIncidente    = bool(lead, "tem_incidente_aberto");
  const severidade      = str(lead, "severidade_incidente");
  const humanNext       = str(lead, "human_next_action");
  const pendencia       = str(lead, "pendencia_principal");
  const faseTravamento  = str(lead, "fase_travamento");

  // ── pedir_humano ─────────────────────────────────────────────────────
  // Sinal: incidente aberto de alta/crítica severidade ou ação humana explícita
  if (temIncidente && (severidade === "alta" || severidade === "critica" || severidade === "crítica")) {
    return { prioridade: "pedir_humano", justificativa: `incidente ${severidade} aberto` };
  }
  if (humanNext && HUMAN_ACTION_KEYWORDS.some((kw) => humanNext.includes(kw))) {
    return { prioridade: "pedir_humano", justificativa: "ação humana sinalizada pelo corretor" };
  }
  if (temIncidente) {
    return { prioridade: "pedir_humano", justificativa: "incidente aberto — requer revisão" };
  }

  // ── agir_agora ───────────────────────────────────────────────────────
  // Sinal: follow-up vencido (OVERDUE) ou prazo vencido com lead quente/morno
  if (statusAtencao === "overdue") {
    return { prioridade: "agir_agora", justificativa: "follow-up vencido (OVERDUE)" };
  }
  if (prazoStr && isPrazoVencido(prazoStr) && (leadTemp === "hot" || leadTemp === "warm")) {
    return { prioridade: "agir_agora", justificativa: "prazo vencido — lead " + (leadTemp === "hot" ? "quente" : "morno") };
  }
  if (faseTravamento && (leadTemp === "hot" || leadTemp === "warm")) {
    return { prioridade: "agir_agora", justificativa: `travado em "${formatFase(faseTravamento)}" — lead ${leadTemp === "hot" ? "quente" : "morno"}` };
  }

  // ── agir_hoje ────────────────────────────────────────────────────────
  // Sinal: prazo dentro de 24h, lead quente com docs pendentes, fase avançada sem movimento
  if (statusAtencao === "due_soon") {
    return { prioridade: "agir_hoje", justificativa: "prazo próximo (DUE_SOON)" };
  }
  if (prazoStr && isPrazoDueSoon(prazoStr)) {
    return { prioridade: "agir_hoje", justificativa: "prazo vence em menos de 24h" };
  }
  if (leadTemp === "hot" && FASES_DOCS.has(faseFunil)) {
    return { prioridade: "agir_hoje", justificativa: "lead quente aguardando documentação" };
  }
  if (leadTemp === "hot" && (RX_PENDENCIA_DOC.test(pendencia))) {
    return { prioridade: "agir_hoje", justificativa: "lead quente com docs pendentes" };
  }
  if (leadTemp === "hot" && FASES_OPERACIONAIS.has(faseFunil)) {
    return { prioridade: "agir_hoje", justificativa: "lead quente em fase operacional avançada" };
  }
  if (prazoStr && isPrazoVencido(prazoStr)) {
    return { prioridade: "agir_hoje", justificativa: "prazo vencido" };
  }

  // ── observar ─────────────────────────────────────────────────────────
  // Sinal: lead morno, interação recente, fase ativa
  if (leadTemp === "warm") {
    return { prioridade: "observar", justificativa: "lead morno — manter atenção" };
  }
  const dias = diasSemAtualizar(lead);
  if (FASES_OPERACIONAIS.has(faseFunil)) {
    return { prioridade: "observar", justificativa: "em fase operacional — acompanhar" };
  }
  if (dias !== null && dias <= 3) {
    return { prioridade: "observar", justificativa: `última interação há ${dias}d — monitorar` };
  }

  // ── aguardar ─────────────────────────────────────────────────────────
  return { prioridade: "aguardar", justificativa: leadTemp === "cold" ? "lead frio — sem sinal ativo" : "sem urgência identificada" };
}

// ── Aggregator principal ──────────────────────────────────────────────────

/**
 * buildFilaInteligente — constrói a fila priorizada de leads.
 *
 * @param leads — Array bruto de rows de enova_attendance_v1.
 *                Já filtrado (não inclui arquivados — view filtra archived_at IS NULL).
 *
 * Retorna até MAX_FILA_ITEMS itens ordenados por prioridade (mais urgente primeiro).
 * Dentro da mesma prioridade, mantém a ordem original do array (atualizado_em desc).
 *
 * O que é exato:
 *   - status_atencao = OVERDUE   → sinal exato do Worker
 *   - tem_incidente_aberto       → sinal exato do Worker
 *   - prazo_proxima_acao vencido → sinal exato de data
 *
 * O que é inferido:
 *   - lead_temp (HOT/WARM/COLD)  → campo Worker-computed, lido como string
 *   - fase_funil em FASES_DOCS   → conjunto estável mas passível de expansão
 *
 * O que é aproximado:
 *   - pendencia_principal textual → matching por substring
 *   - human_next_action textual   → matching por substring
 */
export function buildFilaInteligente(
  leads: Record<string, unknown>[],
): FilaItem[] {
  const items: FilaItem[] = leads.map((lead) => {
    const waId = strRaw(lead, "wa_id") || String(lead["wa_id"] ?? "");
    const { prioridade, justificativa } = classifyLead(lead);

    return {
      wa_id:        waId,
      nome_display: nomeDisplay(lead),
      prioridade,
      contexto:     buildContexto(lead),
      justificativa,
      href_ficha:   `/atendimento/${waId}`,
    };
  });

  // Ordenar por prioridade (estável: dentro da mesma prioridade, mantém ordem original)
  items.sort((a, b) => PRIORIDADE_ORDER[a.prioridade] - PRIORIDADE_ORDER[b.prioridade]);

  // Excluir leads sem wa_id válido (segurança)
  return items.filter((it) => it.wa_id).slice(0, MAX_FILA_ITEMS);
}
