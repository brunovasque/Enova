// ============================================================
// Enova IA — Base de Conhecimento Operacional
// panel/app/lib/enova-ia-knowledge.ts
//
// PR E — Base de Conhecimento Operacional (MCMV + Regras Enova)
// Escopo: PANEL-ONLY, sem backend novo, sem IA externa.
//
// Propósito:
//   Base canônica local de conhecimento operacional.
//   Cobre MCMV básico, regras Enova e diretrizes comerciais seguras.
//
// O que esta camada FAZ:
//   - Armazenar conhecimento operacional local estruturado
//   - Exportar tópicos por intent (kb_*)
//   - Fornecer resposta com título, resumo, bullets e sugestão
//
// O que esta camada NÃO FAZ:
//   - Chamar IA externa
//   - Criar backend ou endpoint
//   - Promover aprovação garantida
//   - Inventar regras de negócio
// ============================================================

/** Resposta de conhecimento estruturada. */
export type KnowledgeEntry = {
  /** Intent canônica (kb_*) */
  intent: KnowledgeIntent;
  /** Título curto */
  titulo: string;
  /** Resumo em 1–2 frases */
  resumo: string;
  /** 2–5 pontos principais */
  bullets: string[];
  /** Sugestão prática opcional */
  sugestao?: string;
};

/** Intents de conhecimento operacional. */
export type KnowledgeIntent =
  | "kb_mcmv_basico"
  | "kb_composicao_renda"
  | "kb_docs"
  | "kb_followup"
  | "kb_lead_frio"
  | "kb_plantao"
  | "kb_humano"
  | "kb_reprovados";

// ── Base canônica ──────────────────────────────────────────────────────────

const KNOWLEDGE_BASE: Record<KnowledgeIntent, KnowledgeEntry> = {

  // ── 1. MCMV BÁSICO ─────────────────────────────────────────────────────

  kb_mcmv_basico: {
    intent: "kb_mcmv_basico",
    titulo: "MCMV — Visão Geral",
    resumo:
      "Minha Casa Minha Vida é um programa habitacional do governo federal com faixas de renda definidas. A aprovação depende de análise completa — nunca é garantida.",
    bullets: [
      "Faixas de renda definem o tipo de subsídio e condições do financiamento.",
      "Renda familiar bruta mensal é o critério base de elegibilidade.",
      "Restrições de crédito (CPF negativado, FGTS pendente) podem bloquear o processo.",
      "Documentação completa é obrigatória antes da análise bancária.",
      "Aprovação depende da CEF/banco — a Enova facilita, não garante.",
    ],
    sugestao: "Para saber mais sobre faixas, pergunte sobre composição de renda ou docs.",
  },

  // ── 2. COMPOSIÇÃO DE RENDA ─────────────────────────────────────────────

  kb_composicao_renda: {
    intent: "kb_composicao_renda",
    titulo: "Composição de Renda",
    resumo:
      "Somar renda de cônjuge ou familiar ampliam o poder de compra e podem mudar a faixa do programa.",
    bullets: [
      "Cônjuge ou companheiro(a) pode compor renda sem restrição.",
      "Familiar de 1º grau (pai, mãe, filho) pode somar quando reside no mesmo imóvel.",
      "Renda informal aceita com documentação: extrato bancário 3 meses ou declaração.",
      "MEI e autônomo apresentam declaração de renda ou IRPF.",
      "Renda somada não garante aprovação — análise de risco continua.",
    ],
    sugestao: "Verifique quem pode somar renda antes de avançar para docs.",
  },

  // ── 3. DOCUMENTAÇÃO ────────────────────────────────────────────────────

  kb_docs: {
    intent: "kb_docs",
    titulo: "Documentação — Quando e Como Pedir",
    resumo:
      "Pedir docs cedo demais afasta o lead; tarde demais trava o processo. O momento certo é quando há intenção clara de avançar.",
    bullets: [
      "Pedir docs quando o lead confirmou interesse real e a renda parece compatível.",
      "Lista básica: RG/CPF, comprovante de renda, comprovante de residência.",
      "Renda informal exige extrato bancário ou declaração própria.",
      "Pasta incompleta trava análise — não adianta enviar parcialmente.",
      "Nunca prometar aprovação ao solicitar docs.",
    ],
    sugestao: "Use a Máquina de Pastas no painel para acompanhar status de cada lead.",
  },

  // ── 4. FOLLOW-UP ───────────────────────────────────────────────────────

  kb_followup: {
    intent: "kb_followup",
    titulo: "Lógica do Follow-up",
    resumo:
      "Follow-up inteligente é o que retoma no momento certo, com contexto, sem parecer spam.",
    bullets: [
      "Lead quente: follow-up em até 24h após último contato sem resposta.",
      "Lead morno: follow-up entre 48h e 72h, com novo argumento ou contexto.",
      "Lead frio: reativar apenas com motivo concreto (nova faixa, novo plantão).",
      "Repetir a mesma mensagem sem variação é sinal de burrice operacional.",
      "Prazo vencido sem resposta → prioridade na fila de retorno.",
    ],
    sugestao: "Veja a fila de retorno para leads com prazo vencido.",
  },

  // ── 5. LEAD FRIO / QUENTE / MORNO ─────────────────────────────────────

  kb_lead_frio: {
    intent: "kb_lead_frio",
    titulo: "Lead Quente, Morno e Frio",
    resumo:
      "A temperatura do lead define urgência e tipo de abordagem. Lead frio recuperável merece estratégia, não abandono.",
    bullets: [
      "Quente: respondeu recentemente, tem interesse claro, renda compatível, sem bloqueio grave.",
      "Morno: respondeu mas sem comprometimento, ou há gap de comunicação de 2–5 dias.",
      "Frio: sem resposta há mais de 7 dias ou bloqueio identificado (restrição, perfil incompatível).",
      "Frio recuperável: perfil válido, mas parou por timing ou hesitação — reativar com gatilho certo.",
      "Frio irrecuperável: restrição grave sem solução no curto prazo — monitorar sem pressão.",
    ],
    sugestao: "Use a Reclassificação Assistida no painel para revisar a temperatura de cada lead.",
  },

  // ── 6. PLANTÃO / VISITA ────────────────────────────────────────────────

  kb_plantao: {
    intent: "kb_plantao",
    titulo: "Quando Oferecer Plantão",
    resumo:
      "Plantão é o passo de maior comprometimento — só faz sentido quando o lead está maduro o suficiente.",
    bullets: [
      "Oferecer plantão quando: renda validada, interesse confirmado, sem bloqueio grave.",
      "Não convidar antes de validar elegibilidade mínima — gera frustração.",
      "Lead com docs pendentes: resolver docs antes de marcar visita.",
      "Lead frio não deve receber convite de plantão como reativação — é invasivo.",
      "Melhor momento: após confirmação de interesse real + renda compatível.",
    ],
    sugestao: "Veja Prontidão para Plantão no painel para leads com sinal de visita.",
  },

  // ── 7. QUANDO PRECISA HUMANO ───────────────────────────────────────────

  kb_humano: {
    intent: "kb_humano",
    titulo: "Quando Chamar Humano",
    resumo:
      "Há situações que exigem julgamento humano — a Enova identifica e sinaliza, mas o corretor decide.",
    bullets: [
      "Lead com restrição grave que precisa de orientação jurídica ou FGTS.",
      "Situação emocional sensível (separação, perda, urgência habitacional extrema).",
      "Negociação acima do padrão ou condição especial não mapeada.",
      "Dúvida sobre elegibilidade que a análise automática não resolve.",
      "Lead VIP ou com histórico especial que merece atenção direta.",
    ],
    sugestao: "Sinalizados como 'Pedir humano' na fila — veja quem está aguardando.",
  },

  // ── 8. REPROVADOS ──────────────────────────────────────────────────────

  kb_reprovados: {
    intent: "kb_reprovados",
    titulo: "Como Tratar Reprovados",
    resumo:
      "Reprovação não é fim — mas exige honestidade, clareza e estratégia de reativação com critério.",
    bullets: [
      "Comunicar a reprovação com clareza, sem culpa e sem promessa falsa de reversão.",
      "Identificar o motivo: restrição, renda insuficiente, docs, score.",
      "Restrição resolvível: orientar caminho e registrar para reativação futura.",
      "Renda insuficiente: verificar composição ou faixa alternativa.",
      "Sem caminho claro: registrar como frio irrecuperável e monitorar sem pressão.",
    ],
    sugestao: "Reprovados recuperáveis devem entrar na lista de reativação com prazo definido.",
  },
};

// ── Lookup ─────────────────────────────────────────────────────────────────

/** Retorna a entrada de conhecimento para um intent KB. */
export function getKnowledgeEntry(intent: KnowledgeIntent): KnowledgeEntry {
  return KNOWLEDGE_BASE[intent];
}

// ── Intent detection patterns ──────────────────────────────────────────────

type KnowledgePattern = {
  intent: KnowledgeIntent;
  patterns: RegExp[];
};

export const KNOWLEDGE_PATTERNS: KnowledgePattern[] = [
  {
    intent: "kb_composicao_renda",
    patterns: [
      /\bcomposição\s*de\s*renda\b/i,
      /\bcomposicao\s*de\s*renda\b/i,
      /\bsomar\s*renda\b/i,
      /\bcomo\s*(funciona|é|e)\s*(a\s*)?composição/i,
      /\bcomo\s*(funciona|é|e)\s*(a\s*)?composicao/i,
      /\bquem\s*(pode|consegue)\s*somar/i,
      /\bcompor\s*renda\b/i,
      /\brenda\s*(familiar|conjunta|composta)\b/i,
    ],
  },
  {
    intent: "kb_docs",
    patterns: [
      /\bquando\s+\w+(?:\s+\w+)?\s+docs?\b/i,
      /\bcomo\s*(funciona|é|e)\s*(os?\s*)?docs?\b/i,
      /\bcomo\s*funciona\s*(a\s*)?documentação\b/i,
      /\bquando\s*(pedir|solicitar)\s*document/i,
      /\bdocs?\s*no\s*processo\b/i,
      /\blógica\s*d[oa]s?\s*docs?\b/i,
      /\blogica\s*d[oa]s?\s*docs?\b/i,
    ],
  },
  {
    intent: "kb_followup",
    patterns: [
      /\bqual\s*(a\s*)?lógica\s*do\s*follow.?up\b/i,
      /\bqual\s*(a\s*)?logica\s*do\s*follow.?up\b/i,
      /\bcomo\s*(funciona|é|e)\s*(o\s*)?follow.?up\b/i,
      /\bquando\s*fazer\s*follow.?up\b/i,
      /\bfollow.?up\s*(inteligente|sem\s*burrice|com\s*critério)\b/i,
      /\bcritério\s*de\s*follow.?up\b/i,
      /\bcomo\s*reativar\b/i,
    ],
  },
  {
    intent: "kb_lead_frio",
    patterns: [
      /\bo\s*que\s*(é|e)\s*(um?\s*)?lead\s*frio\b/i,
      /\blead\s*(frio\s*recuperável|frio\s*recuperavel)\b/i,
      /\bo\s*que\s*(é|e)\s*(um?\s*)?lead\s*(quente|morno)\b/i,
      /\bdiferença\s*entre\s*lead\s*(quente|morno|frio)\b/i,
      /\bcomo\s*(a\s*)?enova\s*(entende|classifica)\s*(um?\s*)?lead\s*quente\b/i,
      /\btemperatura\s*d[oa]\s*lead\b/i,
      /\bclassificação\s*de\s*lead\b/i,
      /\bclassificacao\s*de\s*lead\b/i,
    ],
  },
  {
    intent: "kb_plantao",
    patterns: [
      /\bquando\s*oferecer\s*plantão\b/i,
      /\bquando\s*oferecer\s*plantao\b/i,
      /\bquando\s*(marcar|agendar)\s*(um?\s*)?visita\b/i,
      /\bcomo\s*(a\s*)?enova\s*usa\s*(o\s*)?plantão\b/i,
      /\bplantão\s*no\s*momento\s*certo\b/i,
      /\bquando\s*convidar\s*(para\s*)?(o\s*)?plantão\b/i,
    ],
  },
  {
    intent: "kb_humano",
    patterns: [
      /\bquando\s*(precisa|é\s*necessário|necessario)\s*(de\s*)?humano\b/i,
      /\bquando\s*chamar\s*(um?\s*)?humano\b/i,
      /\bquando\s*(pedir|acionar)\s*(o\s*)?(corretor|operador)\b/i,
      /\bcritério\s*para\s*humano\b/i,
      /\bcriterio\s*para\s*humano\b/i,
      /\bquando\s*(é|e)\s*necessário\s*intervenção\b/i,
    ],
  },
  {
    intent: "kb_reprovados",
    patterns: [
      /\bcomo\s*(a\s*)?enova\s*(deve\s*)?(tratar?|trata)\s*reprovados?\b/i,
      /\bo\s*que\s*fazer\s*com\s*(lead\s*)?reprovado\b/i,
      /\bquando\s*o\s*lead\s*(é|e|foi)\s*reprovado\b/i,
      /\breprovação\b/i,
      /\breprovacao\b/i,
      /\bleads?\s*reprovados?\b/i,
    ],
  },
  {
    intent: "kb_mcmv_basico",
    patterns: [
      /\bcomo\s*funciona\s*(o\s*)?mcmv\b/i,
      /\bo\s*que\s*(é|e)\s*(o\s*)?mcmv\b/i,
      /\bminha\s*casa\s*minha\s*vida\b/i,
      /\bfaixas?\s*do\s*mcmv\b/i,
      /\bmcmv\s*(básico|basico|visão|visao)\b/i,
      /\bcomo\s*funciona\s*(o\s*)?programa\b/i,
      /\bvisão\s*geral\s*(do\s*)?mcmv\b/i,
      /\bvisao\s*geral\s*(do\s*)?mcmv\b/i,
    ],
  },
];
