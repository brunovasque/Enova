// ============================================================
// Lead Reclassification Labels — panel/app/lib/lead-reclassification-labels.ts
//
// PR 6 — Reclassificação Assistida de Base + Lead Frio Recuperável
// Helpers de apresentação humana para LeadReclassificationReading.
// Sem side effects, sem persistência, sem automação.
// ============================================================

import type {
  CalorRealLead,
  BaseSugerida,
  ReclassificacaoSugerida,
  LeadFrioRecuperavel,
  MotivoRecuperabilidade,
  EstrategiaReativacaoSugerida,
  AcaoReativacaoSugerida,
} from "./lead-reclassification";

export function getCalorRealLeadLabel(v: CalorRealLead): string {
  const MAP: Record<CalorRealLead, string> = {
    frio: "❄️ Frio",
    morno: "🌤️ Morno",
    quente: "🔥 Quente",
    indefinido: "— Indefinido",
  };
  return MAP[v] ?? v;
}

export function getBaseSugeridaLabel(v: BaseSugerida): string {
  const MAP: Record<BaseSugerida, string> = {
    base_fria: "Base fria",
    base_morna: "Base morna",
    base_quente: "Base quente",
    reativacao: "Reativação",
    manter_atual: "Manter atual",
  };
  return MAP[v] ?? v;
}

export function getReclassificacaoSugeridaLabel(v: ReclassificacaoSugerida): string {
  const MAP: Record<ReclassificacaoSugerida, string> = {
    subir_base: "⬆ Subir base",
    descer_base: "⬇ Descer base",
    mover_para_reativacao: "↩ Mover para reativação",
    manter: "= Manter",
    arquivavel: "🗃 Arquivável",
    indefinido: "— Indefinido",
  };
  return MAP[v] ?? v;
}

export function getLeadFrioRecuperavelLabel(v: LeadFrioRecuperavel): string {
  const MAP: Record<LeadFrioRecuperavel, string> = {
    sim: "✅ Sim",
    nao: "✗ Não",
    incerto: "? Incerto",
  };
  return MAP[v] ?? v;
}

export function getMotivoRecuperabilidadeLabel(v: MotivoRecuperabilidade): string {
  const MAP: Record<MotivoRecuperabilidade, string> = {
    ja_demonstrou_interesse: "Já demonstrou interesse",
    travou_no_timing: "Travou no timing",
    travou_em_docs: "Travou em docs",
    travou_sem_retorno: "Parou sem retorno",
    lead_antigo_com_sinal: "Lead antigo com sinal",
    sem_sinal_recuperavel: "Sem sinal recuperável",
    provavel_perda_real: "Provável perda real",
    precisa_humano: "Requer humano",
  };
  return MAP[v] ?? v;
}

export function getEstrategiaReativacaoLabel(v: EstrategiaReativacaoSugerida): string {
  const MAP: Record<EstrategiaReativacaoSugerida, string> = {
    reativacao_leve: "Reativação leve",
    reativacao_oportunidade: "Reativação por oportunidade",
    reativacao_urgencia: "Reativação por urgência",
    reativacao_visita: "Reativação por visita",
    reativacao_docs: "Reativação por docs",
    pedir_humano: "Pedir humano",
    nenhuma: "Nenhuma",
  };
  return MAP[v] ?? v;
}

export function getAcaoReativacaoLabel(v: AcaoReativacaoSugerida): string {
  const MAP: Record<AcaoReativacaoSugerida, string> = {
    reativar_agora: "🔄 Reativar agora",
    aguardar: "⏳ Aguardar",
    pedir_humano: "⚠️ Pedir humano",
    manter_observacao: "👁 Manter observação",
    sem_acao: "— Sem ação",
  };
  return MAP[v] ?? v;
}
