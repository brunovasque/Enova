// ============================================================
// Lead Visit Readiness Labels — panel/app/lib/lead-visit-readiness-labels.ts
//
// PR 7 — Conversão para Plantão + Leitura de Maturidade Comercial
// Helpers de apresentação humana para LeadVisitReadiness.
// Sem side effects, sem persistência, sem automação.
// ============================================================

import type {
  MaturidadeComercial,
  StatusPlantao,
  LeadProntoParaVisita,
  BloqueioPlantaoPrincipal,
  EstrategiaPlantaoSugerida,
  AcaoPlantaoSugerida,
} from "./lead-visit-readiness";

export function getMaturidadeComercialLabel(v: MaturidadeComercial): string {
  const MAP: Record<MaturidadeComercial, string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
  };
  return MAP[v] ?? v;
}

export function getStatusPlantaoLabel(v: StatusPlantao): string {
  const MAP: Record<StatusPlantao, string> = {
    longe_de_plantao: "Longe de plantão",
    quase_pronto: "Quase pronto",
    pronto_para_visita: "Pronto para visita",
    em_visita: "Em visita",
    pos_visita: "Pós-visita",
    sem_sinal: "Sem sinal",
  };
  return MAP[v] ?? v;
}

export function getLeadProntoParaVisitaLabel(v: LeadProntoParaVisita): string {
  const MAP: Record<LeadProntoParaVisita, string> = {
    sim: "✅ Sim",
    nao: "✗ Não",
    incerto: "? Incerto",
  };
  return MAP[v] ?? v;
}

export function getBloqueioPlantaoPrincipalLabel(v: BloqueioPlantaoPrincipal): string {
  const MAP: Record<BloqueioPlantaoPrincipal, string> = {
    sem_bloqueio_claro: "Sem bloqueio claro",
    falta_maturidade: "Falta maturidade",
    falta_docs: "Docs pendentes",
    falta_aprovacao: "Falta aprovação",
    sem_retorno: "Sem retorno",
    travado_no_funil: "Travado no funil",
    precisa_humano: "Precisa humano",
    restricao: "Restrição",
    sem_interesse_claro: "Sem interesse claro",
  };
  return MAP[v] ?? v;
}

export function getEstrategiaPlantaoLabel(v: EstrategiaPlantaoSugerida): string {
  const MAP: Record<EstrategiaPlantaoSugerida, string> = {
    oferecer_visita: "Oferecer visita",
    aquecer_para_visita: "Aquecer para visita",
    reforcar_oportunidade: "Reforçar oportunidade",
    reforcar_urgencia: "Reforçar urgência",
    avancar_docs_primeiro: "Avançar docs primeiro",
    avancar_aprovacao_primeiro: "Avançar aprovação primeiro",
    pedir_humano: "Pedir humano",
    aguardar: "Aguardar",
    nenhuma: "Nenhuma",
  };
  return MAP[v] ?? v;
}

export function getAcaoPlantaoLabel(v: AcaoPlantaoSugerida): string {
  const MAP: Record<AcaoPlantaoSugerida, string> = {
    convidar_para_plantao: "🏠 Convidar para plantão",
    chamar_cliente: "📞 Chamar cliente",
    aguardar: "⏳ Aguardar",
    pedir_humano: "⚠️ Pedir humano",
    sem_acao: "— Sem ação",
  };
  return MAP[v] ?? v;
}
