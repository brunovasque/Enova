// ============================================================
// Lead Follow-up Labels — panel/app/lib/lead-followup-labels.ts
//
// PR 4 — Organizador de Follow-up
// Helpers de apresentação humana para LeadFollowupOrganizer.
// Sem side effects, sem persistência, sem automação.
// ============================================================

import type {
  StatusFollowup,
  JanelaIdealFollowup,
  TipoFollowupSugerido,
  UrgenciaFollowup,
  AcaoFollowupSugerida,
} from "./lead-followup";

export function getStatusFollowupLabel(v: StatusFollowup): string {
  const MAP: Record<StatusFollowup, string> = {
    sem_followup: "Sem follow-up",
    followup_ativo: "Ativo",
    followup_vencido: "Vencido",
    aguardando_janela: "Aguardando",
    concluido: "Concluído",
    nao_necessario: "Não necessário",
  };
  return MAP[v] ?? v;
}

export function getJanelaIdealLabel(v: JanelaIdealFollowup): string {
  const MAP: Record<JanelaIdealFollowup, string> = {
    agora: "Agora",
    "24h": "Em 24h",
    "48h": "Em 48h",
    "72h": "Em 72h",
    "7d": "Em 7 dias",
    observar: "Observar",
  };
  return MAP[v] ?? v;
}

export function getTipoFollowupLabel(v: TipoFollowupSugerido): string {
  const MAP: Record<TipoFollowupSugerido, string> = {
    retomada_leve: "Retomada leve",
    cobranca_docs: "Cobrança de docs",
    retomada_qualificacao: "Retomada qualificação",
    reativacao: "Reativação",
    visita: "Visita",
    intervencao_humana: "Intervenção humana",
    nenhum: "Nenhum",
  };
  return MAP[v] ?? v;
}

export function getUrgenciaFollowupLabel(v: UrgenciaFollowup): string {
  const MAP: Record<UrgenciaFollowup, string> = {
    baixa: "Baixa",
    media: "Média",
    alta: "Alta",
  };
  return MAP[v] ?? v;
}

export function getAcaoFollowupLabel(v: AcaoFollowupSugerida): string {
  const MAP: Record<AcaoFollowupSugerida, string> = {
    chamar_agora: "📞 Chamar agora",
    aguardar: "⏳ Aguardar",
    agendar_followup: "📅 Agendar follow-up",
    pedir_humano: "⚠️ Pedir humano",
    reativar: "🔄 Reativar",
    sem_acao: "— Sem ação",
  };
  return MAP[v] ?? v;
}
