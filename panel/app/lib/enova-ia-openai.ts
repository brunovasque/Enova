// ============================================================
// Enova IA — OpenAI Adapter
// panel/app/lib/enova-ia-openai.ts
//
// PR G1 — OpenAI Assistido no Chat da ENOVA IA
// Escopo: PANEL-ONLY, read-only, sem backend novo, sem schema novo.
//
// Responsável por:
//   - Definir o schema estruturado da resposta OpenAI
//   - Montar o system prompt da Enova IA
//   - Construir o contexto a partir dos dados reais do painel
//   - Exportar tipos seguros para o API route e a UI
//
// O que esta camada FAZ:
//   - Definir EnovaIaOpenAIResponse (schema tipado)
//   - Definir ENOVA_IA_JSON_SCHEMA (OpenAI Structured Outputs)
//   - Montar system prompt com papel, limites e liberdades da IA
//   - Serializar contexto real (leitura global + fila + programas + KB)
//
// O que esta camada NÃO FAZ:
//   - Chamar OpenAI diretamente (chamada fica no API route server-side)
//   - Persistir dados
//   - Executar ação
//   - Mexer em Worker/schema/Supabase
// ============================================================

import type { LeituraGlobal } from "./enova-ia-leitura";
import type { FilaItem } from "./enova-ia-fila";
import type { ProgramaSugerido } from "./enova-ia-programas";

// ── Tipos canônicos da resposta estruturada ───────────────────────────────

/** Modos de resposta da Enova IA. */
export type EnovaIaMode =
  | "analise_operacional"
  | "plano_de_acao"
  | "segmentacao"
  | "campanha"
  | "melhoria_crm"
  | "conhecimento"
  | "risco"
  | "precisa_humano";

export type EnovaIaConfidence = "alta" | "media" | "baixa";

export type EnovaIaRelevantLead = {
  name: string;
  reason: string;
};

/** Resposta estruturada da Enova IA via OpenAI Structured Outputs. */
export type EnovaIaOpenAIResponse = {
  mode: EnovaIaMode;
  answer_title: string;
  answer_summary: string;
  analysis_points: string[];
  recommended_actions: string[];
  relevant_leads: EnovaIaRelevantLead[];
  suggested_programs: string[];
  risks: string[];
  should_escalate_human: boolean;
  should_request_system_improvement: boolean;
  system_improvement_suggestion: string | null;
  confidence: EnovaIaConfidence;
  notes: string | null;
};

// ── JSON Schema para OpenAI Structured Outputs ────────────────────────────

export const ENOVA_IA_JSON_SCHEMA: {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
} = {
  name: "enova_ia_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: [
          "analise_operacional",
          "plano_de_acao",
          "segmentacao",
          "campanha",
          "melhoria_crm",
          "conhecimento",
          "risco",
          "precisa_humano",
        ],
      },
      answer_title: { type: "string" },
      answer_summary: { type: "string" },
      analysis_points: { type: "array", items: { type: "string" } },
      recommended_actions: { type: "array", items: { type: "string" } },
      relevant_leads: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            reason: { type: "string" },
          },
          required: ["name", "reason"],
          additionalProperties: false,
        },
      },
      suggested_programs: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      should_escalate_human: { type: "boolean" },
      should_request_system_improvement: { type: "boolean" },
      system_improvement_suggestion: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      confidence: { type: "string", enum: ["alta", "media", "baixa"] },
      notes: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
    required: [
      "mode",
      "answer_title",
      "answer_summary",
      "analysis_points",
      "recommended_actions",
      "relevant_leads",
      "suggested_programs",
      "risks",
      "should_escalate_human",
      "should_request_system_improvement",
      "system_improvement_suggestion",
      "confidence",
      "notes",
    ],
    additionalProperties: false,
  },
};

// ── System Prompt ─────────────────────────────────────────────────────────

/** Retorna o system prompt canônico da Enova IA. */
export function buildEnovaIaSystemPrompt(): string {
  return `Você é a ENOVA IA — diretoria cognitiva operacional do CRM de vendas MCMV (Minha Casa Minha Vida) da Enova Correspondente.

## SEU PAPEL
Você é uma analista operacional cognitiva de verdade. Você:
- Analisa o CRM como operação de vendas de crédito habitacional MCMV
- Pensa em cima do contexto real fornecido (leads, fila, KPIs, programas)
- Identifica gargalos, oportunidades, riscos e padrões operacionais
- Propõe estratégias concretas de conversão para pasta/aprovação/plantão
- Sugere melhorias no sistema/CRM quando faz sentido real
- Age como analista de conversão, analista de docs, analista de follow-up e analista comercial MCMV

## LIBERDADES
- Interpretar pedidos livres sem se limitar a intents fixas
- Propor planos táticos e estratégias baseadas nos dados
- Sugerir campanhas, segmentações e programas táticos
- Sugerir melhorias do CRM: novas abas, controles, lógicas, fluxos, automações assistidas
- Dizer o que está faltando no sistema, o que está redundante, o que deveria existir
- Dizer o que ajudaria a vender mais, pegar mais pastas, levar mais aprovados ao plantão
- Identificar padrões que o humano não percebe olhando lead a lead

## REGRAS DURAS — SEM EXCEÇÃO
- NÃO executar qualquer ação automática
- NÃO disparar mensagem para leads
- NÃO alterar, criar ou deletar dados no banco
- NÃO chamar Worker ou processo externo
- NÃO prometer aprovação de financiamento
- NÃO inventar número ou dado ausente do contexto fornecido
- NÃO fingir que executou algo
- SE não tiver dados suficientes, diga explicitamente o que falta

## CONTEXTO DA OPERAÇÃO MCMV
- MCMV: programa habitacional federal com faixas de renda definidas pela CEF
- Enova atua como correspondente bancário — facilita o processo, não garante aprovação
- Funil: qualificação → composição de renda → documentação → análise → visita/plantão → aprovação → pasta enviada
- Pasta = documentação completa pronta para envio ao banco
- Plantão = visita ao empreendimento com equipe de vendas
- Lead quente: respondeu, interesse claro, renda compatível, sem bloqueio grave
- Lead morno: respondeu mas sem comprometimento ou gap de 2-5 dias
- Lead frio: sem resposta há 7+ dias ou bloqueio grave identificado
- Lead frio recuperável: perfil válido, parou por timing ou hesitação
- Pedir humano: corretor/operador deve intervir (restrição grave, situação emocional, negociação fora do padrão)

## FORMATO OBRIGATÓRIO
Sempre responda no schema JSON estruturado. Seja objetivo, operacional e útil.
- mode: modo que melhor descreve a resposta
- answer_title: título direto (máx 10 palavras)
- answer_summary: 2-3 frases operacionais
- analysis_points: pontos de análise (máx 6 bullets curtos)
- recommended_actions: ações concretas sugeridas — nunca automáticas (máx 5)
- relevant_leads: leads do contexto mencionados, se aplicável
- suggested_programs: nomes de programas táticos relevantes
- risks: riscos identificados (máx 4)
- should_escalate_human: true se situação requer decisão humana imediata
- should_request_system_improvement: true se você está sugerindo melhoria de sistema
- system_improvement_suggestion: descreva a melhoria sugerida com especificidade
- confidence: confiança na análise baseada nos dados disponíveis
- notes: observação adicional relevante ou null`;
}

// ── Context Builder ────────────────────────────────────────────────────────

const MAX_FILA_CONTEXT = 20;

/**
 * buildEnovaIaContext — serializa o contexto real do painel para envio ao modelo.
 *
 * Inclui:
 *   - KPIs globais (leitura global)
 *   - Top leads da fila inteligente (limitado a MAX_FILA_CONTEXT)
 *   - Programas sugeridos ativos
 *   - Knowledge base operacional compacta
 *   - Lembrete dos limites absolutos
 */
export function buildEnovaIaContext(
  leituraGlobal: LeituraGlobal | null,
  fila: FilaItem[],
  programas: ProgramaSugerido[],
): string {
  const parts: string[] = [];

  // ── KPIs Globais
  if (leituraGlobal) {
    const hora = new Date(leituraGlobal.agregado_em).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    parts.push(
      `## LEITURA GLOBAL DA OPERAÇÃO (atualizado ${hora})`,
      `- Leads ativos: ${leituraGlobal.leads_ativos.total}`,
      `- Em atendimento: ${leituraGlobal.em_atendimento.total}`,
      `- Fila de retorno: ${leituraGlobal.fila_de_retorno.total}`,
      `- Docs pendentes: ${leituraGlobal.docs_pendentes.total}`,
    );
  } else {
    parts.push("## LEITURA GLOBAL DA OPERAÇÃO\nDados não disponíveis no momento.");
  }

  // ── Fila Inteligente
  parts.push("");
  const totalFila = fila.length;
  const filaSlice = fila.slice(0, MAX_FILA_CONTEXT);
  if (totalFila === 0) {
    parts.push("## FILA INTELIGENTE\nFila vazia no momento.");
  } else {
    parts.push(
      `## FILA INTELIGENTE (${totalFila} leads priorizados${totalFila > MAX_FILA_CONTEXT ? `, mostrando top ${MAX_FILA_CONTEXT}` : ""})`,
    );
    filaSlice.forEach((item, i) => {
      parts.push(
        `${i + 1}. [${item.prioridade.toUpperCase()}] ${item.nome_display} — ${item.contexto} · ${item.justificativa}`,
      );
    });
    if (totalFila > MAX_FILA_CONTEXT) {
      parts.push(`... e mais ${totalFila - MAX_FILA_CONTEXT} leads na fila.`);
    }
  }

  // ── Programas Sugeridos
  parts.push("");
  if (programas.length === 0) {
    parts.push("## PROGRAMAS SUGERIDOS\nNenhum programa ativo detectado no momento.");
  } else {
    parts.push(`## PROGRAMAS SUGERIDOS (${programas.length})`);
    programas.forEach((p) => {
      parts.push(
        `- [${p.prioridade.toUpperCase()}] ${p.titulo}: ${p.motivo} (${p.oportunidade_label})`,
      );
    });
  }

  // ── Knowledge Base Operacional (compacta)
  parts.push(
    "",
    "## KNOWLEDGE BASE OPERACIONAL (referência compacta)",
    "- MCMV: programa habitacional federal, faixas de renda, CEF/banco analisa, Enova facilita não garante",
    "- Composição de renda: cônjuge ou familiar 1º grau, renda informal aceita com extrato 3 meses ou declaração",
    "- Documentação: pedir quando interesse real confirmado + renda compatível; pasta incompleta trava análise bancária",
    "- Follow-up: quente <24h; morno 48-72h com novo argumento; frio só com gatilho concreto; repetir msg = erro operacional",
    "- Lead frio recuperável: perfil válido mas parou por timing ou hesitação — reativar com estratégia certa",
    "- Plantão: oferecer quando renda validada + interesse confirmado + sem bloqueio grave",
    "- Quando pedir humano: restrição grave, situação emocional, negociação especial, elegibilidade duvidosa, lead VIP",
    "- Reprovados: comunicar com clareza, identificar motivo, orientar caminho, reativar com critério e prazo",
  );

  // ── Limites absolutos (reforço)
  parts.push(
    "",
    "## LEMBRETE DOS LIMITES",
    "Você NÃO pode executar ação, disparar mensagem, alterar base, criar registro ou chamar Worker.",
    "Você PODE analisar, sugerir, priorizar, planejar e apontar melhorias do sistema e da operação.",
  );

  return parts.join("\n");
}
