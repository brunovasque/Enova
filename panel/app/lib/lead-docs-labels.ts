// ============================================================
// Lead Docs Labels — panel/app/lib/lead-docs-labels.ts
//
// PR 5 — Máquina de Pastas / Leitura de Docs
// Helpers de apresentação humana para LeadDocsReading.
// Sem side effects, sem persistência, sem automação.
// ============================================================

import type {
  StatusPasta,
  MaturidadeDocs,
  BloqueioDocsPrincipal,
  EstrategiaDocsSugerida,
  ProbabilidadePasta,
  AcaoDocsSugerida,
} from "./lead-docs";

export function getStatusPastaLabel(v: StatusPasta): string {
  const MAP: Record<StatusPasta, string> = {
    nao_pronto: "Não pronto",
    quase_pronto: "Quase pronto",
    pronto_para_docs: "Pronto para docs",
    travado_docs: "Travado em docs",
    em_docs: "Em docs",
    sem_sinal: "Sem sinal",
  };
  return MAP[v] ?? v;
}

export function getMaturidadeDocsLabel(v: MaturidadeDocs): string {
  const MAP: Record<MaturidadeDocs, string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
  };
  return MAP[v] ?? v;
}

export function getBloqueioDocsPrincipalLabel(v: BloqueioDocsPrincipal): string {
  const MAP: Record<BloqueioDocsPrincipal, string> = {
    sem_bloqueio_claro: "Sem bloqueio claro",
    falta_confianca: "Falta confiança",
    falta_tempo: "Falta de tempo",
    falta_interesse: "Falta interesse",
    travado_no_funil: "Travado no funil",
    restricao: "Restrição",
    renda_fraca: "Renda fraca",
    sem_retorno: "Sem retorno",
    precisa_humano: "Precisa humano",
  };
  return MAP[v] ?? v;
}

export function getEstrategiaDocsSugeridaLabel(v: EstrategiaDocsSugerida): string {
  const MAP: Record<EstrategiaDocsSugerida, string> = {
    reforcar_praticidade: "Reforçar praticidade",
    reforcar_urgencia: "Reforçar urgência",
    reforcar_seguranca: "Reforçar segurança",
    reforcar_oportunidade: "Reforçar oportunidade",
    oferecer_visita: "Oferecer visita",
    pedir_humano: "Pedir humano",
    aguardar: "Aguardar",
    nenhuma: "Nenhuma",
  };
  return MAP[v] ?? v;
}

export function getProbabilidadePastaLabel(v: ProbabilidadePasta): string {
  const MAP: Record<ProbabilidadePasta, string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
  };
  return MAP[v] ?? v;
}

export function getAcaoDocsSugeridaLabel(v: AcaoDocsSugerida): string {
  const MAP: Record<AcaoDocsSugerida, string> = {
    estimular_docs: "📄 Estimular docs",
    chamar_cliente: "📞 Chamar cliente",
    aguardar: "⏳ Aguardar",
    pedir_humano: "⚠️ Pedir humano",
    oferecer_visita: "🏠 Oferecer visita",
    sem_acao: "— Sem ação",
  };
  return MAP[v] ?? v;
}
