// ============================================================
// Lead Cognitive Labels — panel/app/lib/lead-cognitive-labels.ts
//
// PR 3 — Bloco Visual Estado Cognitivo no CRM
// Helpers de apresentação humana para LeadCognitiveState.
// Sem side effects, sem persistência, sem automação.
// ============================================================

import type {
  EstadoCliente,
  MomentoCompra,
  NivelInteresse,
  RiscoTravamento,
  BolaCom,
  ProximaMelhorAcao,
  Confianca,
} from "./lead-cognitive";

export function getEstadoClienteLabel(v: EstadoCliente): string {
  const MAP: Record<EstadoCliente, string> = {
    novo: "Novo lead",
    em_qualificacao: "Em qualificação",
    compra_ativa: "Compra ativa",
    interessado_sem_acao: "Interessado sem ação",
    morno: "Morno",
    travado: "Travado",
    aguardando_cliente: "Aguardando cliente",
    aguardando_enova: "Aguardando Enova",
    aguardando_documentos: "Aguardando documentos",
    reativacao: "Reativação",
    arquivavel: "Arquivável",
  };
  return MAP[v] ?? v;
}

export function getMomentoCompraLabel(v: MomentoCompra): string {
  const MAP: Record<MomentoCompra, string> = {
    agora: "Agora",
    curto_prazo: "Curto prazo",
    medio_prazo: "Médio prazo",
    sem_janela_clara: "Sem janela clara",
    curioso: "Curiosidade",
  };
  return MAP[v] ?? v;
}

export function getNivelInteresseLabel(v: NivelInteresse): string {
  const MAP: Record<NivelInteresse, string> = {
    alto: "Alto",
    medio: "Médio",
    baixo: "Baixo",
  };
  return MAP[v] ?? v;
}

export function getRiscoTravamentoLabel(v: RiscoTravamento): string {
  const MAP: Record<RiscoTravamento, string> = {
    baixo: "Baixo",
    medio: "Médio",
    alto: "Alto",
  };
  return MAP[v] ?? v;
}

export function getBolaComLabel(v: BolaCom): string {
  const MAP: Record<BolaCom, string> = {
    lead: "👤 Cliente",
    enova: "🤖 Enova",
    indefinido: "—",
  };
  return MAP[v] ?? v;
}

export function getProximaMelhorAcaoLabel(v: ProximaMelhorAcao): string {
  const MAP: Record<ProximaMelhorAcao, string> = {
    chamar_cliente: "📞 Chamar cliente",
    aguardar: "⏳ Aguardar",
    enviar_followup: "💬 Enviar follow-up",
    estimular_documentos: "📄 Estimular documentos",
    oferecer_visita: "🏠 Oferecer visita",
    pedir_intervencao_humana: "⚠️ Intervenção humana",
    reativar: "🔄 Reativar",
    arquivar: "📦 Arquivar",
    priorizar: "🚀 Priorizar",
  };
  return MAP[v] ?? v;
}

export function getConfiancaLabel(v: Confianca): string {
  const MAP: Record<Confianca, string> = {
    alta: "Alta",
    media: "Média",
    baixa: "Baixa",
  };
  return MAP[v] ?? v;
}
