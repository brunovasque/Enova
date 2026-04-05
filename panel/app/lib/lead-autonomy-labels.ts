// ============================================================
// Lead Autonomy Labels — panel/app/lib/lead-autonomy-labels.ts
//
// PR 9 — Solicitação de Ampliação de Autonomia + Executor Assistido de Baixo Risco
// Helpers de apresentação humana para LeadAutonomyReading.
// Sem side effects, sem persistência, sem automação.
// ============================================================

import type {
  AutonomiaSugerida,
  MotivoPedidoAutonomia,
  NivelRiscoExecucao,
  AcaoBaixoRiscoSugerida,
  ExecutorAssistidoHabilitado,
  PrecisaAprovacaoHumana,
} from "./lead-autonomy";

export function getAutonomiaSugeridaLabel(v: AutonomiaSugerida): string {
  const MAP: Record<AutonomiaSugerida, string> = {
    nenhuma: "Nenhuma",
    followup_assistido: "Follow-up Assistido",
    reativacao_assistida: "Reativação Assistida",
    docs_assistido: "Docs Assistido",
    visita_assistida: "Visita Assistida",
    ajuste_operacional: "Ajuste Operacional",
    intervencao_humana: "Intervenção Humana",
  };
  return MAP[v] ?? v;
}

export function getMotivoPedidoAutonomiaLabel(v: MotivoPedidoAutonomia): string {
  const MAP: Record<MotivoPedidoAutonomia, string> = {
    caso_repetitivo: "Caso repetitivo",
    janela_clara_de_acao: "Janela clara de ação",
    baixo_risco_operacional: "Baixo risco operacional",
    travamento_recorrente: "Travamento recorrente",
    falta_execucao_manual: "Falta de execução manual",
    precisa_decisao_humana: "Precisa decisão humana",
    sem_motivo_claro: "Sem motivo claro",
  };
  return MAP[v] ?? v;
}

export function getNivelRiscoExecucaoLabel(v: NivelRiscoExecucao): string {
  const MAP: Record<NivelRiscoExecucao, string> = {
    baixo: "Baixo",
    medio: "Médio",
    alto: "Alto",
  };
  return MAP[v] ?? v;
}

export function getAcaoBaixoRiscoLabel(v: AcaoBaixoRiscoSugerida): string {
  const MAP: Record<AcaoBaixoRiscoSugerida, string> = {
    abrir_modal_chamar_cliente: "Chamar cliente",
    abrir_modal_followup: "Fazer follow-up",
    nenhuma: "Nenhuma",
  };
  return MAP[v] ?? v;
}

export function getExecutorAssistidoLabel(v: ExecutorAssistidoHabilitado): string {
  const MAP: Record<ExecutorAssistidoHabilitado, string> = {
    sim: "Sim",
    nao: "Não",
    incerto: "Incerto",
  };
  return MAP[v] ?? v;
}

export function getPrecisaAprovacaoHumanaLabel(v: PrecisaAprovacaoHumana): string {
  const MAP: Record<PrecisaAprovacaoHumana, string> = {
    sim: "Sim",
    nao: "Não",
  };
  return MAP[v] ?? v;
}
