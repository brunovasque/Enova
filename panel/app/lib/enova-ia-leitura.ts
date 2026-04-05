// ============================================================
// Enova IA — Leitura Global da Operação
// panel/app/lib/enova-ia-leitura.ts
//
// PR B — Leitura Global da Operação (Macro 2 — aba ENOVA IA)
// Escopo: PANEL-ONLY, read-only, sem backend novo, sem schema novo.
//
// Propósito:
//   Recebe o array bruto de leads já carregado pela view enova_attendance_v1
//   (via fetchAttendanceLeadsAction) e agrega os 4 KPIs da seção
//   "Leitura Global da Operação" da aba ENOVA IA.
//
// Fontes reais usadas:
//   - enova_attendance_v1 (via listAttendanceLeads / fetchAttendanceLeadsAction)
//     Campos consumidos: fase_funil, pendencia_principal,
//                        status_atencao, prazo_proxima_acao
//
// O que esta camada FAZ:
//   - Contar leads_ativos (exato: total dos não-arquivados)
//   - Derivar em_atendimento (inferido: fases operacionais pós-qualificação)
//   - Derivar fila_de_retorno (inferido: OVERDUE ou prazo vencido)
//   - Derivar docs_pendentes (aproximado: fase de docs ou pendência textual)
//
// O que esta camada NÃO FAZ:
//   - Escrever qualquer dado
//   - Chamar backend externo
//   - Inventar número sem base real
//   - Classificar cognitivamente leads individuais
//
// Cada KPIBloco declara sua própria qualidade de dado via campo `precisao`.
// ============================================================

// ── Tipos canônicos de saída ──────────────────────────────────────────────

/**
 * Precisão do indicador:
 *   "exato"     — derivado diretamente de campo estruturado sem heurística
 *   "inferido"  — derivado de conjunto de fases ou campo computado pelo Worker
 *   "aproximado"— inclui matching textual de campo não estruturado
 */
export type PrecisaoKPI = "exato" | "inferido" | "aproximado";

/** Um bloco KPI da Leitura Global da Operação. */
export type KPIBloco = {
  /** Contagem real. */
  total: number;
  /** Rótulo humano visível na UI. */
  label: string;
  /** Nota curta para o usuário sobre a qualidade do dado. */
  hint: string;
  /** Qualidade do cálculo — para registros técnicos e próxima PR. */
  precisao: PrecisaoKPI;
};

/** Resultado agregado da Leitura Global da Operação. */
export type LeituraGlobal = {
  leads_ativos: KPIBloco;
  em_atendimento: KPIBloco;
  fila_de_retorno: KPIBloco;
  docs_pendentes: KPIBloco;
  /** Fonte de dados utilizada. */
  fonte: "enova_attendance_v1";
  /** ISO timestamp de quando a agregação foi executada. */
  agregado_em: string;
};

// ── Fases operacionais que definem "em atendimento" ──────────────────────
//
// Mirrored from lead-cognitive.ts FASES_COMPRA_ATIVA.
// Repetidas aqui intencionalmente para manter esta camada independente:
// lead-cognitive.ts opera sobre um lead individual, este helper opera
// sobre o array global e não deve depender da instância individual.

const FASES_EM_ATENDIMENTO = new Set([
  "envio_docs",
  "analise_documentos",
  "finalizacao_processo",
  "aguardando_retorno_correspondente",
  "visita",
  "agendamento_visita",
  "visita_confirmada",
]);

// ── Fases explicitamente de documentação ─────────────────────────────────

const FASES_DOCS = new Set([
  "envio_docs",
  "analise_documentos",
]);

// ── Helpers de campo ──────────────────────────────────────────────────────

function strField(lead: Record<string, unknown>, key: string): string {
  const v = lead[key];
  return typeof v === "string" ? v.toLowerCase().trim() : "";
}

function strFieldRaw(lead: Record<string, unknown>, key: string): string {
  const v = lead[key];
  return typeof v === "string" ? v : "";
}

// ── Aggregator principal ──────────────────────────────────────────────────

/**
 * agregaLeituraGlobal — computa os 4 KPIs da Leitura Global da Operação.
 *
 * @param leads — Array bruto de rows de enova_attendance_v1.
 *                Já filtrado (não inclui arquivados — view filtra archived_at IS NULL).
 *
 * Qualidade dos dados:
 *   leads_ativos    → exato   (contagem direta do array)
 *   em_atendimento  → inferido (conjunto de fases operacionais conhecidas)
 *   fila_de_retorno → inferido (campo status_atencao = OVERDUE ou prazo_proxima_acao vencido)
 *   docs_pendentes  → aproximado (fase de docs + matching textual de pendencia_principal)
 */
export function agregaLeituraGlobal(
  leads: Record<string, unknown>[],
): LeituraGlobal {
  const now = Date.now();

  let emAtendimento = 0;
  let filaDeRetorno = 0;
  let docsPendentes = 0;

  for (const lead of leads) {
    const faseFunil = strField(lead, "fase_funil");
    const statusAtencao = strField(lead, "status_atencao");
    const prazoProximaAcao = strFieldRaw(lead, "prazo_proxima_acao");
    const pendenciaPrincipal = strField(lead, "pendencia_principal");

    // ── em_atendimento ──────────────────────────────────────────────────
    if (FASES_EM_ATENDIMENTO.has(faseFunil)) {
      emAtendimento += 1;
    }

    // ── fila_de_retorno ─────────────────────────────────────────────────
    // Sinal 1: campo worker-computed status_atencao = "overdue"
    const isOverdue = statusAtencao === "overdue";
    // Sinal 2: prazo_proxima_acao existente e já vencido
    let isPrazoVencido = false;
    if (prazoProximaAcao) {
      const prazoMs = new Date(prazoProximaAcao).getTime();
      isPrazoVencido = Number.isFinite(prazoMs) && prazoMs < now;
    }
    if (isOverdue || isPrazoVencido) {
      filaDeRetorno += 1;
    }

    // ── docs_pendentes ──────────────────────────────────────────────────
    // Sinal 1: fase explícita de documentação (exato)
    const emFaseDocs = FASES_DOCS.has(faseFunil);
    // Sinal 2: pendencia_principal com referência textual a docs/pasta (aproximado)
    const pendenciaDocSinal =
      pendenciaPrincipal.includes("doc") ||
      pendenciaPrincipal.includes("pasta") ||
      pendenciaPrincipal.includes("arquivo");

    if (emFaseDocs || pendenciaDocSinal) {
      docsPendentes += 1;
    }
  }

  return {
    leads_ativos: {
      total: leads.length,
      label: "Leads Ativos",
      hint: "todos os leads não arquivados no painel",
      precisao: "exato",
    },
    em_atendimento: {
      total: emAtendimento,
      label: "Em Atendimento",
      hint: "leads em fases operacionais pós-qualificação",
      precisao: "inferido",
    },
    fila_de_retorno: {
      total: filaDeRetorno,
      label: "Fila de Retorno",
      hint: "leads com follow-up vencido ou prazo expirado",
      precisao: "inferido",
    },
    docs_pendentes: {
      total: docsPendentes,
      label: "Docs Pendentes",
      hint: "leads em fase de docs ou com pendência de documentação",
      precisao: "aproximado",
    },
    fonte: "enova_attendance_v1",
    agregado_em: new Date().toISOString(),
  };
}
