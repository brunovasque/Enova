// ============================================================
// Lead Meta-Ops Labels — panel/app/lib/lead-meta-ops-labels.ts
//
// PR 8 — Meta-operação Cognitiva + Sugestões de Melhoria
// Helpers de apresentação humana para LeadMetaOpsReading.
// Sem side effects, sem persistência, sem automação.
// ============================================================

import type {
  GargaloPrincipal,
  TipoMelhoriaSugerida,
  SugestaoOperacional,
  ProgramaSugerido,
  PrioridadeMelhoria,
  PrecisaEvolucaoEstrutura,
} from "./lead-meta-ops";

export function getGargaloPrincipalLabel(v: GargaloPrincipal): string {
  const MAP: Record<GargaloPrincipal, string> = {
    sem_gargalo_claro: "Sem gargalo claro",
    travamento_conversa: "Conversa travada",
    travamento_docs: "Docs travados",
    travamento_followup: "Follow-up travado",
    travamento_reativacao: "Reativação necessária",
    travamento_visita: "Visita bloqueada",
    travamento_humano: "Requer humano",
    lead_sem_janela: "Sem janela de compra",
    lead_sem_interesse_claro: "Interesse não confirmado",
  };
  return MAP[v] ?? v;
}

export function getTipoMelhoriaSugeridaLabel(v: TipoMelhoriaSugerida): string {
  const MAP: Record<TipoMelhoriaSugerida, string> = {
    ajuste_abordagem: "Ajuste de abordagem",
    ajuste_timing: "Ajuste de timing",
    ajuste_followup: "Ajuste de follow-up",
    ajuste_docs: "Ajuste de docs",
    ajuste_reativacao: "Ajuste de reativação",
    ajuste_visita: "Ajuste de visita",
    pedir_humano: "Pedir humano",
    nenhuma: "Nenhuma",
  };
  return MAP[v] ?? v;
}

export function getSugestaoOperacionalLabel(v: SugestaoOperacional): string {
  const MAP: Record<SugestaoOperacional, string> = {
    mudar_tom: "Mudar tom",
    retomar_com_oportunidade: "Retomar com oportunidade",
    retomar_com_urgencia: "Retomar com urgência",
    oferecer_visita: "Oferecer visita",
    estimular_docs: "Estimular docs",
    aguardar_melhor_janela: "Aguardar melhor janela",
    escalar_para_humano: "Escalar para humano",
    sem_sugestao: "Sem sugestão",
  };
  return MAP[v] ?? v;
}

export function getProgramaSugeridoLabel(v: ProgramaSugerido): string {
  const MAP: Record<ProgramaSugerido, string> = {
    nenhum: "Nenhum",
    caca_pastas: "Caça-Pastas",
    reativacao_inteligente: "Reativação Inteligente",
    janela_de_compra: "Janela de Compra",
    pre_plantao: "Pré-Plantão",
    ferirao: "Feirão",
    intervencao_humana: "Intervenção Humana",
  };
  return MAP[v] ?? v;
}

export function getPrioridadeMelhoriaLabel(v: PrioridadeMelhoria): string {
  const MAP: Record<PrioridadeMelhoria, string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
  };
  return MAP[v] ?? v;
}

export function getPrecisaEvolucaoEstruturaLabel(v: PrecisaEvolucaoEstrutura): string {
  const MAP: Record<PrecisaEvolucaoEstrutura, string> = {
    sim: "Sim",
    nao: "Não",
    incerto: "Incerto",
  };
  return MAP[v] ?? v;
}
