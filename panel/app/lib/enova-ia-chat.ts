// ============================================================
// Enova IA — Chat Operacional (Intent Router Local)
// panel/app/lib/enova-ia-chat.ts
//
// PR D — Chat Operacional da Enova (Macro 2 — aba ENOVA IA)
// Escopo: PANEL-ONLY, read-only, sem backend novo, sem schema novo.
//
// Propósito:
//   Recebe uma mensagem do usuário, detecta a intenção (intent) local
//   e responde com dados reais já disponíveis na aba ENOVA IA.
//
// Fontes reais usadas (somente leitura):
//   - LeituraGlobal   (enova-ia-leitura.ts) — KPIs globais
//   - FilaItem[]      (enova-ia-fila.ts)    — fila inteligente priorizada
//
// O que esta camada FAZ:
//   - Detectar intents por matching de tokens/regex simples
//   - Compor resposta estruturada útil a partir de dados reais
//   - Devolver uma resposta canônica tipada para a UI renderizar
//
// O que esta camada NÃO FAZ:
//   - Chamar OpenAI/Mistral/qualquer IA externa
//   - Criar backend novo
//   - Criar endpoint novo
//   - Mexer em Worker/schema/Supabase
//   - Mandar mensagem
//   - Mover lead
//   - Alterar base
//   - Executar ação
//   - Inventar NLP complexo
// ============================================================

import type { LeituraGlobal } from "./enova-ia-leitura";
import type { FilaItem, PrioridadeFila } from "./enova-ia-fila";
import { PRIORIDADE_FILA_LABEL } from "./enova-ia-fila";
import type { KnowledgeIntent } from "./enova-ia-knowledge";
import { KNOWLEDGE_PATTERNS, getKnowledgeEntry } from "./enova-ia-knowledge";

// ── Tipos canônicos ────────────────────────────────────────────────────────

/** Intents aceitos na v1 do Chat Operacional. */
export type IntentChat =
  | "leads_acao_agora"
  | "docs_pendentes"
  | "precisa_humano"
  | "fila_de_retorno"
  | "em_atendimento"
  | "perto_plantao"
  | "resumo_geral"
  | KnowledgeIntent
  | "desconhecido";

/** Linha de um item da resposta — listagem de leads. */
export type ChatLeadLine = {
  nome: string;
  detalhe: string;
  href: string;
};

/** Resposta estruturada da Enova para o chat. */
export type ChatResponse = {
  intent: IntentChat;
  titulo: string;
  resumo: string;
  linhas?: ChatLeadLine[];
  /** Bullets curtos — usados para respostas de conhecimento */
  bullets?: string[];
  /** Tipo de resposta: dados vivos ou conhecimento operacional */
  tipo?: "operacional" | "conhecimento";
  sugestao?: string;
  sem_dados?: boolean;
};

/** Mensagem no histórico local da conversa. */
export type ChatMsg = {
  id: string;
  origem: "usuario" | "enova";
  texto: string;
  resposta?: ChatResponse;
  ts: number;
};

// ── Intent detection ──────────────────────────────────────────────────────

type IntentPattern = {
  intent: IntentChat;
  patterns: RegExp[];
};

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "leads_acao_agora",
    patterns: [
      /\bação\s*agora\b/i,
      /\bacao\s*agora\b/i,
      /\bprecisam\b.*\bação\b/i,
      /\bnecessitam\b.*\bação\b/i,
      /\bagir\s*agora\b/i,
      /\burgente/i,
      /\bprioritários\b/i,
      /\bprioridade\b/i,
    ],
  },
  {
    intent: "docs_pendentes",
    patterns: [
      /\bdoc(?:umento)?s?\s*pendente/i,
      /\bpendentes?\s*de\s*doc/i,
      /\bpasta/i,
      /\bdocumentação\s*pendente/i,
      /\benvio\s*de\s*doc/i,
      /\bquem\s*(está|esta)\s*(com\s*)?(doc|pasta)/i,
    ],
  },
  {
    intent: "precisa_humano",
    patterns: [
      /\bprecisa[nm]?\s*(?:de\s*)?humano\b/i,
      /\boperador\b/i,
      /\bcorretor\b/i,
      /\bintervenção\s*humana\b/i,
      /\bintervencao\s*humana\b/i,
      /\bmanual\b/i,
      /\bquem\s*(precisa|requer).*humano/i,
    ],
  },
  {
    intent: "fila_de_retorno",
    patterns: [
      /\bfila\s*de\s*retorno\b/i,
      /\bretorno\b/i,
      /\boverdue\b/i,
      /\bvencido/i,
      /\bprazo\s*expirado/i,
      /\bprazo\s*vencido/i,
      /\bquais\s*estão\s*na\s*fila/i,
    ],
  },
  {
    intent: "em_atendimento",
    patterns: [
      /\bem\s*atendimento\b/i,
      /\bquantos?\s*(?:leads?\s*)?(?:estão|esta)\s*em\s*atendimento/i,
      /\bquantos?\s*ativos?\b/i,
      /\bquantos?\s*leads?\s*(?:temos|existem|há|ha)\b/i,
    ],
  },
  {
    intent: "perto_plantao",
    patterns: [
      /\bplantão\b/i,
      /\bplantao\b/i,
      /\bvisita/i,
      /\bagendamento/i,
      /\bperto\s*de\s*visita/i,
      /\bprontos?\s*para\s*visita/i,
    ],
  },
  {
    intent: "resumo_geral",
    patterns: [
      /\bresumo\b/i,
      /\bgeral\b/i,
      /\bsituação\b/i,
      /\bsituacao\b/i,
      /\bstatus\b/i,
      /\bcomo\s*(está|esta|estamos)\b/i,
      /\bvisão\s*geral\b/i,
      /\bvisao\s*geral\b/i,
      /\boverview\b/i,
    ],
  },
];

export function detectIntent(texto: string): IntentChat {
  const t = texto.trim();
  // Knowledge intents checked first (more specific queries)
  for (const { intent, patterns } of KNOWLEDGE_PATTERNS) {
    if (patterns.some((rx) => rx.test(t))) {
      return intent;
    }
  }
  // Operational intents (live data queries)
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((rx) => rx.test(t))) {
      return intent;
    }
  }
  return "desconhecido";
}

// ── Response builders ──────────────────────────────────────────────────────

const MAX_LINHAS = 8;

function toLeadLine(item: FilaItem): ChatLeadLine {
  return {
    nome:    item.nome_display,
    detalhe: `${item.contexto}\u00A0·\u00A0${item.justificativa}`,
    href:    item.href_ficha,
  };
}

function buildLeadsAcaoAgora(fila: FilaItem[]): ChatResponse {
  const urgentes = fila.filter(
    (it) => it.prioridade === "agir_agora" || it.prioridade === "pedir_humano",
  );

  if (urgentes.length === 0) {
    return {
      intent: "leads_acao_agora",
      titulo: "Nenhum lead com ação imediata",
      resumo: "Não há leads classificados como 'Agir agora' ou 'Pedir humano' no momento.",
      sem_dados: true,
    };
  }

  return {
    intent: "leads_acao_agora",
    titulo: `${urgentes.length} lead${urgentes.length > 1 ? "s" : ""} precisam ação agora`,
    resumo: `${urgentes.length} lead${urgentes.length > 1 ? "s" : ""} com prioridade máxima — ${PRIORIDADE_FILA_LABEL.agir_agora} ou ${PRIORIDADE_FILA_LABEL.pedir_humano}.`,
    linhas: urgentes.slice(0, MAX_LINHAS).map(toLeadLine),
    sugestao: urgentes.length > MAX_LINHAS
      ? `Mostrando os ${MAX_LINHAS} primeiros. Acesse a Fila Inteligente para a lista completa.`
      : "Verifique cada ficha para agir.",
  };
}

function buildDocsPendentes(fila: FilaItem[], leitura: LeituraGlobal | null): ChatResponse {
  const total = leitura?.docs_pendentes.total ?? null;

  // Leads with doc-related context from the queue
  const comDocs = fila.filter(
    (it) =>
      /doc|pasta|arquivo/i.test(it.contexto) ||
      /doc|pasta|arquivo/i.test(it.justificativa),
  );

  if (total === 0 && comDocs.length === 0) {
    return {
      intent: "docs_pendentes",
      titulo: "Sem pendências de documentação",
      resumo: "Nenhum lead identificado com docs pendentes no momento.",
      sem_dados: true,
    };
  }

  const resumoParts: string[] = [];
  if (total !== null) {
    resumoParts.push(
      `${total} lead${total !== 1 ? "s" : ""} com documentação pendente (leitura global).`,
    );
  }
  if (comDocs.length > 0) {
    resumoParts.push(
      `${comDocs.length} na fila inteligente com sinal de docs.`,
    );
  }

  return {
    intent: "docs_pendentes",
    titulo: `Documentação pendente: ${total ?? comDocs.length}`,
    resumo: resumoParts.join(" "),
    linhas: comDocs.slice(0, MAX_LINHAS).map(toLeadLine),
    sugestao: "Priorize o envio e validação de pastas.",
  };
}

function buildPrecisaHumano(fila: FilaItem[]): ChatResponse {
  const precisam = fila.filter((it) => it.prioridade === "pedir_humano");

  if (precisam.length === 0) {
    return {
      intent: "precisa_humano",
      titulo: "Nenhum lead requer intervenção humana agora",
      resumo: "Sem leads classificados como 'Pedir humano' no momento.",
      sem_dados: true,
    };
  }

  return {
    intent: "precisa_humano",
    titulo: `${precisam.length} lead${precisam.length > 1 ? "s" : ""} precisam de humano`,
    resumo: `${precisam.length} lead${precisam.length > 1 ? "s" : ""} com sinal de intervenção humana necessária.`,
    linhas: precisam.slice(0, MAX_LINHAS).map(toLeadLine),
    sugestao: "Acione o corretor ou operador responsável.",
  };
}

function buildFilaRetorno(fila: FilaItem[], leitura: LeituraGlobal | null): ChatResponse {
  const total = leitura?.fila_de_retorno.total ?? null;

  // From the intelligent queue: overdue = agir_agora leads with "overdue" or "prazo" justification
  const emRetorno = fila.filter(
    (it) =>
      (it.prioridade === "agir_agora" || it.prioridade === "agir_hoje") &&
      (/overdue|vencido|prazo/i.test(it.justificativa) ||
        /retorno/i.test(it.contexto)),
  );

  if (total === 0 && emRetorno.length === 0) {
    return {
      intent: "fila_de_retorno",
      titulo: "Fila de retorno vazia",
      resumo: "Nenhum lead com prazo vencido ou overdue no momento.",
      sem_dados: true,
    };
  }

  const resumoParts: string[] = [];
  if (total !== null) {
    resumoParts.push(
      `${total} lead${total !== 1 ? "s" : ""} com follow-up vencido ou prazo expirado (leitura global).`,
    );
  }

  return {
    intent: "fila_de_retorno",
    titulo: `Fila de retorno: ${total ?? emRetorno.length}`,
    resumo: resumoParts.join(" ") || `${emRetorno.length} leads identificados com sinal de retorno.`,
    linhas: emRetorno.slice(0, MAX_LINHAS).map(toLeadLine),
    sugestao: "Estes leads precisam de contato o quanto antes.",
  };
}

function buildEmAtendimento(fila: FilaItem[], leitura: LeituraGlobal | null): ChatResponse {
  const totalAtivos = leitura?.leads_ativos.total ?? null;
  const totalAtend = leitura?.em_atendimento.total ?? null;

  const partes: string[] = [];
  if (totalAtivos !== null) {
    partes.push(`${totalAtivos} leads ativos no painel.`);
  }
  if (totalAtend !== null) {
    partes.push(`${totalAtend} em fases operacionais (docs, visita, correspondente).`);
  }

  if (partes.length === 0) {
    return {
      intent: "em_atendimento",
      titulo: "Dados de atendimento indisponíveis",
      resumo: "Não foi possível carregar os dados de atendimento.",
      sem_dados: true,
    };
  }

  const topoFila = fila.slice(0, 5);

  return {
    intent: "em_atendimento",
    titulo: `${totalAtend ?? fila.length} em atendimento`,
    resumo: partes.join(" "),
    linhas: topoFila.map(toLeadLine),
    sugestao: `Top ${topoFila.length} leads priorizados pela fila inteligente.`,
  };
}

function buildPertoPlantao(fila: FilaItem[]): ChatResponse {
  const prontos = fila.filter(
    (it) =>
      /visit|agendamento|plantão|plantao/i.test(it.contexto) ||
      /visit|agendamento/i.test(it.justificativa),
  );

  if (prontos.length === 0) {
    return {
      intent: "perto_plantao",
      titulo: "Nenhum lead próximo de plantão",
      resumo: "Sem leads identificados com agendamento ou visita iminente.",
      sem_dados: true,
    };
  }

  return {
    intent: "perto_plantao",
    titulo: `${prontos.length} lead${prontos.length > 1 ? "s" : ""} perto de plantão`,
    resumo: `${prontos.length} lead${prontos.length > 1 ? "s" : ""} com sinal de visita ou agendamento.`,
    linhas: prontos.slice(0, MAX_LINHAS).map(toLeadLine),
    sugestao: "Confirme datas e prepare materiais de visita.",
  };
}

function buildResumoGeral(
  fila: FilaItem[],
  leitura: LeituraGlobal | null,
): ChatResponse {
  if (!leitura && fila.length === 0) {
    return {
      intent: "resumo_geral",
      titulo: "Dados indisponíveis",
      resumo: "A leitura global ainda não foi carregada. Recarregue a página.",
      sem_dados: true,
    };
  }

  const partes: string[] = [];
  if (leitura) {
    partes.push(`Leads ativos: ${leitura.leads_ativos.total}.`);
    partes.push(`Em atendimento: ${leitura.em_atendimento.total}.`);
    partes.push(`Fila de retorno: ${leitura.fila_de_retorno.total}.`);
    partes.push(`Docs pendentes: ${leitura.docs_pendentes.total}.`);
  }

  // Count by priority
  const countsByPriority = fila.reduce<Record<PrioridadeFila, number>>(
    (acc, it) => {
      acc[it.prioridade] = (acc[it.prioridade] ?? 0) + 1;
      return acc;
    },
    {} as Record<PrioridadeFila, number>,
  );

  const urgentes = (countsByPriority["agir_agora"] ?? 0) + (countsByPriority["pedir_humano"] ?? 0);
  if (urgentes > 0) {
    partes.push(`${urgentes} com ação urgente (Agir agora + Pedir humano).`);
  }

  const topFila = fila.slice(0, 3);

  return {
    intent: "resumo_geral",
    titulo: "Resumo da Operação",
    resumo: partes.join(" "),
    linhas: topFila.map(toLeadLine),
    sugestao: topFila.length > 0 ? "Top 3 leads por prioridade." : undefined,
  };
}

// ── Knowledge builder ──────────────────────────────────────────────────────

function buildKnowledgeResponse(intent: KnowledgeIntent): ChatResponse {
  const entry = getKnowledgeEntry(intent);
  return {
    intent,
    titulo: entry.titulo,
    resumo: entry.resumo,
    bullets: entry.bullets,
    sugestao: entry.sugestao,
    tipo: "conhecimento",
  };
}

// ── Main router ────────────────────────────────────────────────────────────

/**
 * Router principal do Chat Operacional.
 *
 * Recebe o texto do usuário + dados reais já carregados (leitura global + fila)
 * e devolve uma ChatResponse estruturada sem chamar qualquer backend externo.
 */
export function routeChat(
  texto: string,
  fila: FilaItem[],
  leitura: LeituraGlobal | null,
): ChatResponse {
  const intent = detectIntent(texto);

  switch (intent) {
    case "leads_acao_agora":   return buildLeadsAcaoAgora(fila);
    case "docs_pendentes":     return buildDocsPendentes(fila, leitura);
    case "precisa_humano":     return buildPrecisaHumano(fila);
    case "fila_de_retorno":    return buildFilaRetorno(fila, leitura);
    case "em_atendimento":     return buildEmAtendimento(fila, leitura);
    case "perto_plantao":      return buildPertoPlantao(fila);
    case "resumo_geral":       return buildResumoGeral(fila, leitura);

    // Knowledge base intents
    case "kb_mcmv_basico":
    case "kb_composicao_renda":
    case "kb_docs":
    case "kb_followup":
    case "kb_lead_frio":
    case "kb_plantao":
    case "kb_humano":
    case "kb_reprovados":
      return buildKnowledgeResponse(intent);

    case "desconhecido":
    default:
      return {
        intent: "desconhecido",
        titulo: "Comando não reconhecido",
        resumo:
          "Não entendi o pedido. Tente um dos comandos abaixo.",
        sugestao:
          "dados vivos: ação agora · docs pendentes · precisa humano · fila de retorno · em atendimento · perto de plantão · resumo geral\u00A0·\u00A0\u00A0conhecimento: composição de renda · docs no processo · follow-up · lead frio · plantão · precisa humano · reprovados · MCMV",
        sem_dados: true,
      };
  }
}

// ── ID generator ───────────────────────────────────────────────────────────

let _seq = 0;
export function genMsgId(): string {
  return `msg-${Date.now()}-${++_seq}`;
}
