// ============================================================
// Lead Signals Aggregator — panel/app/lib/lead-signals.ts
//
// PR 1 — Agregador de Sinais do Lead
// Escopo: PANEL-ONLY, read-only, sem automação, sem classificação cognitiva.
//
// Propósito:
//   Consolidar, em um objeto canônico único, os sinais já existentes do lead
//   dentro do CRM/painel. Fundação reutilizável para as próximas PRs:
//     PR 2 = Classificador Cognitivo Read-only
//     PR 3 = Estado Cognitivo no CRM
//
// Fontes reais usadas:
//   - LeadSignalsInput      (contrato canônico de entrada — enova_attendance_v1)
//   - LeadSignalMsg[]       (mensagens opcionais — enova_messages, se já carregadas)
//   - ClientProfileRow      (enova_state + enova_prefill_meta, opcional)
//
// O que ficou de fora e por quê:
//   - docs/pasta: sem fonte confiável em enova_attendance_v1;
//     os sinais de docs ficam em crm_lead_meta (domínio CRM separado).
//   - CRM stage details (visita, análise, aprovado): domínio crm_lead_meta,
//     requer fetch separado — fora do escopo desta PR.
//   - Classificação cognitiva: intencionalmente fora — PR 2.
//   - Sugestão de ação: intencionalmente fora — PR 2/3.
// ============================================================

import type { ClientProfileRow } from "../api/client-profile/_shared";

// ── Input types ────────────────────────────────────────────────────────────

/** Mensagem de conversa — espelha ConversaMsg de AtendimentoDetalheUI. */
export type LeadSignalMsg = {
  id: string | null;
  direction: "in" | "out"; // "in" = do cliente; "out" = da Enova
  text: string | null;
  created_at: string | null;
};

/**
 * LeadSignalsInput — contrato canônico de entrada do agregador de sinais.
 *
 * Define exatamente os campos que buildLeadSignals() consome de enova_attendance_v1.
 * Desacoplado do componente de UI: qualquer objeto com estes campos é aceito
 * (duck-typing estrutural do TypeScript).
 * AttendanceDetalheRow é um superconjunto deste tipo e satisfaz o contrato.
 */
export type LeadSignalsInput = {
  // ── Identificação ──
  wa_id: string;
  lead_id: string | null;
  nome: string | null;
  telefone: string | null;
  // ── Interação ──
  ultima_interacao_cliente: string | null;
  ultima_interacao_enova: string | null;
  // ── Funil / operação ──
  fase_funil: string | null;
  fase_atendimento: string | null;
  fase_travamento: string | null;
  status_funil: string | null;
  status_atencao: string | null;
  pendencia_principal: string | null;
  proxima_acao: string | null;
  prazo_proxima_acao: string | null;
  gatilho_proxima_acao: string | null;
  proxima_acao_executavel: boolean | null;
  tem_incidente_aberto: boolean | null;
  tipo_incidente: string | null;
  severidade_incidente: string | null;
  // ── Perfil ──
  nacionalidade: string | null;
  estado_civil: string | null;
  regime_trabalho: string | null;
  renda: number | null;
  renda_total: number | null;
  somar_renda: boolean | null;
  composicao: string | null;
  ctps_36: boolean | null;
  restricao: boolean | null;
  dependentes_qtd: number | null;
  entrada_valor: number | null;
  ir_declarado: boolean | null;
  // ── Feedback humano ──
  responsavel: string | null;
  interesse_atual: string | null;
  objecao_principal: string | null;
  momento_do_cliente: string | null;
  quick_note: string | null;
  human_next_action: string | null;
  // ── Timing ──
  criado_em: string | null;
  atualizado_em: string | null;
  movido_fase_em: string | null;
  movido_base_em: string | null;
  travou_em: string | null;
  arquivado_em: string | null;
  // ── Contexto / CRM ──
  crm_lead_pool: string | null;
  base_atual: string | null;
  base_origem: string | null;
  lead_temp: string | null;
};

// ── Output type ────────────────────────────────────────────────────────────

/**
 * LeadSignals — objeto canônico de sinais do lead.
 *
 * Dividido em seções por domínio semântico.
 * Todos os campos são opcionais/nullable: se o dado não existir, é null.
 * Nenhum campo é inventado ou derivado de forma especulativa.
 */
export type LeadSignals = {
  /**
   * identificacao — quem é este lead.
   * Fonte: AttendanceDetalheRow (enova_attendance_v1).
   */
  identificacao: {
    wa_id: string;
    lead_id: string | null;
    nome: string | null;
    telefone: string | null;
  };

  /**
   * interacao — padrão de comunicação e engajamento.
   * Fonte: AttendanceDetalheRow + LeadSignalMsg[] (opcional).
   */
  interacao: {
    /** Total de mensagens carregadas (0 se msgs não fornecidas). */
    total_mensagens: number;
    /** ISO timestamp da última mensagem recebida do cliente. */
    ultima_interacao_cliente: string | null;
    /** ISO timestamp da última mensagem enviada pela Enova. */
    ultima_interacao_enova: string | null;
    /** Dias desde a última mensagem do cliente (null se não calculável). */
    dias_sem_resposta_cliente: number | null;
    /**
     * Quem tem a "bola" agora (quem precisa agir):
     *   "enova"  = última msg foi do cliente → Enova precisa responder
     *   "lead"   = última msg foi da Enova   → lead precisa responder
     *   null     = sem mensagens ou indeterminado
     */
    bola_com: "lead" | "enova" | null;
    /**
     * Sinal de sentimento/comportamento do cliente nas últimas mensagens.
     * Valores possíveis: "Interessado" | "Objetivo" | "Confuso" |
     *                    "Evasivo" | "Resistente" | "Neutro" | null
     */
    ultimo_sinal_cliente: string | null;
  };

  /**
   * operacao — posição operacional atual no funil.
   * Fonte: AttendanceDetalheRow (enova_attendance_v1).
   */
  operacao: {
    fase_funil: string | null;
    fase_atendimento: string | null;
    /** Fase em que o lead está travado (null = não travado). */
    fase_travamento: string | null;
    status_funil: string | null;
    /** ON_TIME | DUE_SOON | OVERDUE */
    status_atencao: string | null;
    pendencia_principal: string | null;
    proxima_acao: string | null;
    prazo_proxima_acao: string | null;
    gatilho_proxima_acao: string | null;
    proxima_acao_executavel: boolean | null;
    tem_incidente_aberto: boolean | null;
    tipo_incidente: string | null;
    severidade_incidente: string | null;
  };

  /**
   * perfil — dados de qualificação do lead.
   * Fonte primária: AttendanceDetalheRow.
   * Se ClientProfileRow fornecido, campos de perfil são preferidos quando
   * disponíveis no ClientProfileRow (dados mais precisos / rastreados).
   */
  perfil: {
    nome: string | null;
    nacionalidade: string | null;
    estado_civil: string | null;
    regime_trabalho: string | null;
    renda: number | null;
    renda_total: number | null;
    somar_renda: boolean | null;
    composicao: string | null;
    ctps_36: boolean | null;
    restricao: boolean | null;
    dependentes_qtd: number | null;
    entrada_valor: number | null;
    ir_declarado: boolean | null;
  };

  /**
   * feedback_humano — anotações e avaliações do corretor.
   * Fonte: AttendanceDetalheRow (enova_attendance_meta).
   */
  feedback_humano: {
    responsavel: string | null;
    interesse_atual: string | null;
    objecao_principal: string | null;
    momento_do_cliente: string | null;
    quick_note: string | null;
    human_next_action: string | null;
  };

  /**
   * timing — linha do tempo de eventos operacionais relevantes.
   * Fonte: AttendanceDetalheRow.
   */
  timing: {
    criado_em: string | null;
    atualizado_em: string | null;
    movido_fase_em: string | null;
    movido_base_em: string | null;
    travou_em: string | null;
    arquivado_em: string | null;
  };

  /**
   * contexto — posição no CRM e origem do lead.
   * Fonte: AttendanceDetalheRow + ClientProfileRow.origem_lead (opcional).
   */
  contexto: {
    /** Pool canônico (crm_lead_meta.lead_pool, enriquecido panel-side). */
    crm_lead_pool: string | null;
    /** Pool/base atual conforme enova_attendance_meta. */
    base_atual: string | null;
    /** Pool/base de origem do lead. */
    base_origem: string | null;
    /** Temperatura do lead: COLD | WARM | HOT */
    lead_temp: string | null;
    /** Origem do lead (ex.: "campanha", "organico", "lyx"). Vem de ClientProfileRow quando disponível. */
    origem_lead: string | null;
  };
};

// ── Regex de sinal do cliente (compilação única) ───────────────────────────

const RX_INTERESSADO = /\b(ótimo|perfeito|quero|excelente|concordo|bora|combinado|vamos|adorei|maravilhoso)\b/i;
const RX_OBJETIVO    = /\b(ok|certo|entendi|entendido|tá|ta|claro|deu|confirmo)\b/i;
const RX_CONFUSO     = /\b(não sei|nao sei|como assim|não entend|nao entend|confuso|qual)\b/i;
const RX_EVASIVO     = /\b(depois|amanhã|amanha|mais tarde|outra hora|não agora|nao agora|semana que vem)\b/i;
// "para" (preposition) omitido — muito comum em PT-BR; usando formas imperativas específicas
const RX_RESISTENTE  = /\b(não quero|nao quero|pare|não tenho interesse|nao tenho interesse|chega|cancela)\b/i;

function deriveUltimoSinalCliente(msgs: LeadSignalMsg[]): string | null {
  const recentClient: LeadSignalMsg[] = [];
  for (let i = msgs.length - 1; i >= 0 && recentClient.length < 3; i--) {
    if (msgs[i].direction === "in") recentClient.push(msgs[i]);
  }

  if (recentClient.length === 0) return null;

  const text = recentClient.map((m) => m.text ?? "").join(" ");

  if (RX_INTERESSADO.test(text)) return "Interessado";
  if (RX_OBJETIVO.test(text))    return "Objetivo";
  if (RX_CONFUSO.test(text))     return "Confuso";
  if (RX_EVASIVO.test(text))     return "Evasivo";
  if (RX_RESISTENTE.test(text))  return "Resistente";
  return "Neutro";
}

// ── Main aggregator ────────────────────────────────────────────────────────

/**
 * buildLeadSignals — constrói o objeto canônico de sinais do lead.
 *
 * Uso:
 *   const signals = buildLeadSignals(lead);
 *   const signals = buildLeadSignals(lead, convMsgs);
 *   const signals = buildLeadSignals(lead, convMsgs, profile);
 *
 * Regras:
 *   - Usa apenas dado real disponível — sem inventar.
 *   - Sem classificação cognitiva (PR 2).
 *   - Sem sugestão de ação (PR 2/3).
 *   - Sem escrita em banco de dados.
 *   - Sem side effects.
 *
 * @param lead    - Campos canônicos de entrada (enova_attendance_v1).
 * @param msgs    - Mensagens de conversa já carregadas (opcional).
 * @param profile - Perfil canônico do cliente (opcional, enriquece `contexto.origem_lead`).
 */
export function buildLeadSignals(
  lead: LeadSignalsInput,
  msgs: LeadSignalMsg[] = [],
  profile: ClientProfileRow | null = null,
): LeadSignals {
  // ── interacao ────────────────────────────────────────────────────────────
  const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

  const bolaCom: LeadSignals["interacao"]["bola_com"] = lastMsg
    ? lastMsg.direction === "in"
      ? "enova"  // cliente enviou último → Enova precisa responder
      : "lead"   // Enova enviou último → lead precisa responder
    : null;

  const ultimaInteracaoCliente = lead.ultima_interacao_cliente ?? null;
  let diasSemResposta: number | null = null;
  if (ultimaInteracaoCliente) {
    const ms = Date.now() - new Date(ultimaInteracaoCliente).getTime();
    diasSemResposta = Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  const ultimoSinalCliente = msgs.length > 0 ? deriveUltimoSinalCliente(msgs) : null;

  // ── perfil — preferir ClientProfileRow quando disponível ─────────────────
  // ClientProfileRow.renda vem de enova_state (mesma fonte que AttendanceDetalheRow.renda).
  // Para campos que existem nos dois, preferimos o valor de AttendanceDetalheRow
  // porque é o que a view já agrega, mantendo consistência com o restante da ficha.
  // origem_lead só existe em ClientProfileRow (enova_prefill_meta), então vem de lá.
  const perfil: LeadSignals["perfil"] = {
    nome:            lead.nome,
    nacionalidade:   lead.nacionalidade,
    estado_civil:    lead.estado_civil,
    regime_trabalho: lead.regime_trabalho,
    renda:           lead.renda,
    renda_total:     lead.renda_total,
    somar_renda:     lead.somar_renda,
    composicao:      lead.composicao,
    ctps_36:         lead.ctps_36,
    restricao:       lead.restricao,
    dependentes_qtd: lead.dependentes_qtd,
    entrada_valor:   lead.entrada_valor,
    ir_declarado:    lead.ir_declarado,
  };

  // ── contexto ─────────────────────────────────────────────────────────────
  const origemLead = profile?.origem_lead ?? null;

  return {
    identificacao: {
      wa_id:    lead.wa_id,
      lead_id:  lead.lead_id,
      nome:     lead.nome,
      telefone: lead.telefone,
    },

    interacao: {
      total_mensagens:           msgs.length,
      ultima_interacao_cliente:  ultimaInteracaoCliente,
      ultima_interacao_enova:    lead.ultima_interacao_enova ?? null,
      dias_sem_resposta_cliente: diasSemResposta,
      bola_com:                  bolaCom,
      ultimo_sinal_cliente:      ultimoSinalCliente,
    },

    operacao: {
      fase_funil:               lead.fase_funil,
      fase_atendimento:         lead.fase_atendimento,
      fase_travamento:          lead.fase_travamento,
      status_funil:             lead.status_funil,
      status_atencao:           lead.status_atencao,
      pendencia_principal:      lead.pendencia_principal,
      proxima_acao:             lead.proxima_acao,
      prazo_proxima_acao:       lead.prazo_proxima_acao,
      gatilho_proxima_acao:     lead.gatilho_proxima_acao,
      proxima_acao_executavel:  lead.proxima_acao_executavel,
      tem_incidente_aberto:     lead.tem_incidente_aberto,
      tipo_incidente:           lead.tipo_incidente,
      severidade_incidente:     lead.severidade_incidente,
    },

    perfil,

    feedback_humano: {
      responsavel:        lead.responsavel,
      interesse_atual:    lead.interesse_atual,
      objecao_principal:  lead.objecao_principal,
      momento_do_cliente: lead.momento_do_cliente,
      quick_note:         lead.quick_note,
      human_next_action:  lead.human_next_action,
    },

    timing: {
      criado_em:      lead.criado_em,
      atualizado_em:  lead.atualizado_em,
      movido_fase_em: lead.movido_fase_em,
      movido_base_em: lead.movido_base_em,
      travou_em:      lead.travou_em,
      arquivado_em:   lead.arquivado_em,
    },

    contexto: {
      crm_lead_pool: lead.crm_lead_pool,
      base_atual:    lead.base_atual,
      base_origem:   lead.base_origem,
      lead_temp:     lead.lead_temp,
      origem_lead:   origemLead,
    },
  };
}
