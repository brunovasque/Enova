"use client";

import Link from "next/link";
import { useRef, useState, useMemo, useEffect } from "react";
import styles from "./enova-ia.module.css";
import type { LeituraGlobal, KPIBloco } from "../lib/enova-ia-leitura";
import type { FilaItem, PrioridadeFila } from "../lib/enova-ia-fila";
import { PRIORIDADE_FILA_LABEL } from "../lib/enova-ia-fila";
import type { ProgramaSugerido, PrioridadePrograma } from "../lib/enova-ia-programas";
import { routeChat, genMsgId, buildChatHistoryForApi } from "../lib/enova-ia-chat";
import type { ChatMsg } from "../lib/enova-ia-chat";
import type { EnovaIaOpenAIResponse, EnovaIaMode } from "../lib/enova-ia-openai";
import { buildEnovaIaActionDraft } from "../lib/enova-ia-action-builder";
import { ACTION_TYPE_LABEL, RISK_LEVEL_LABEL } from "../lib/enova-ia-action-builder";
import type { EnovaIaActionDraft } from "../lib/enova-ia-action-builder";
import {
  transitionPreparationStatus,
  PREPARATION_STATUS_LABEL,
  PREPARATION_STATUS_SUPPORT_TEXT,
  PREPARATION_INITIAL_STATUS,
} from "../lib/enova-ia-preparation";
import type { ExecutorPreparationStatus } from "../lib/enova-ia-preparation";
import {
  buildPreExecutionPackage,
  buildExecutionAuthorizationPackage,
  PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE,
  EXECUTION_AUTHORIZATION_NOTICE,
} from "../lib/enova-ia-pre-execution";
import type { PreExecutionPackage, ExecutionAuthorizationPackage } from "../lib/enova-ia-pre-execution";
import {
  buildExecutionContract,
  EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE,
  EXECUTION_CONTRACT_READY_LABEL,
  FUTURE_SCOPE_NOTICE,
} from "../lib/enova-ia-execution-contract";
import type { ExecutionContract } from "../lib/enova-ia-execution-contract";

const GARGALOS = [
  { tipo: "Documentação", descricao: "Leitura de gargalos virá da análise cognitiva global" },
  { tipo: "Follow-up", descricao: "Fila de oportunidades conectada na próxima PR" },
];

// ---------------------------------------------------------------------------
// Sub-componente: badge de prioridade da fila
// ---------------------------------------------------------------------------

const PRIORIDADE_BADGE_CLASS: Record<PrioridadeFila, string | undefined> = {
  agir_agora:   styles.filaBadgeAgirAgora,
  pedir_humano: styles.filaBadgePedirHumano,
  agir_hoje:    styles.filaBadgeAgirHoje,
  observar:     styles.filaBadgeObservar,
  aguardar:     styles.filaBadgeAguardar,
};

function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeFila }) {
  const label = PRIORIDADE_FILA_LABEL[prioridade];
  const cls = PRIORIDADE_BADGE_CLASS[prioridade] ?? styles.filaBadgeAguardar;
  return <span className={cls}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Bloco "Fila Inteligente"
// ---------------------------------------------------------------------------

function FilaInteligenteSection({ fila }: { fila: FilaItem[] }) {
  const vazia = fila.length === 0;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Fila Inteligente</h2>
      <p className={styles.sectionHint}>
        {vazia
          ? "Sem leads para priorizar no momento."
          : `${fila.length} lead${fila.length > 1 ? "s" : ""} priorizados · fonte: enova_attendance_v1`}
      </p>

      {vazia ? (
        <div className={styles.filaVazia}>Nenhum lead ativo encontrado.</div>
      ) : (
        <div className={styles.filaTable}>
          <div className={styles.filaHeader}>
            <span>Lead</span>
            <span>Contexto · justificativa</span>
            <span>Prioridade</span>
            <span></span>
          </div>
          {fila.map((item) => (
            <div key={item.wa_id} className={styles.filaRow}>
              <span className={styles.filaName}>{item.nome_display}</span>
              <span className={styles.filaDetalhe}>
                <span className={styles.filaContexto}>{item.contexto}</span>
                <span className={styles.filaJustificativa}>{item.justificativa}</span>
              </span>
              <PrioridadeBadge prioridade={item.prioridade} />
              <Link href={item.href_ficha} className={styles.filaLink}>
                Ver ficha →
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function KPICard({ bloco }: { bloco: KPIBloco }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statLabel}>{bloco.label}</span>
      <span className={styles.statValue}>{bloco.total}</span>
      <span className={styles.statHint}>{bloco.hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloco "Leitura Global da Operação"
// ---------------------------------------------------------------------------

function LeituraGlobalSection({ leituraGlobal }: { leituraGlobal: LeituraGlobal | null }) {
  if (!leituraGlobal) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Leitura Global da Operação</h2>
        <p className={styles.sectionHint}>Carregando dados da operação…</p>
        <div className={styles.statsGrid}>
          {["Leads Ativos", "Em Atendimento", "Fila de Retorno", "Docs Pendentes"].map((label) => (
            <div key={label} className={styles.statCard}>
              <span className={styles.statLabel}>{label}</span>
              <span className={styles.statValue}>—</span>
              <span className={styles.statHint}>aguardando leitura</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Leitura Global da Operação</h2>
      <p className={styles.sectionHint}>
        Leitura real — fonte: enova_attendance_v1 ·{" "}
        {new Date(leituraGlobal.agregado_em).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <div className={styles.statsGrid}>
        <KPICard bloco={leituraGlobal.leads_ativos} />
        <KPICard bloco={leituraGlobal.em_atendimento} />
        <KPICard bloco={leituraGlobal.fila_de_retorno} />
        <KPICard bloco={leituraGlobal.docs_pendentes} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bloco "Chat Operacional"
// ---------------------------------------------------------------------------

const CHAT_EXEMPLOS = [
  "monte um plano para reprovados nos últimos 6 meses",
  "o que a operação está errando no follow-up?",
  "há oportunidade de feirão agora?",
  "como você atacaria essa fila hoje?",
  "o que falta no CRM para melhorar essa operação?",
  "quais leads estão mais perto de virar pasta?",
  "onde estamos perdendo dinheiro ou tempo?",
  "quais leads precisam ação agora?",
  "quem está com docs pendentes?",
  "resumo geral da operação",
  "quem precisa de humano?",
  "quem está perto de plantão?",
  "o que você criaria no CRM para vender mais?",
  "identifique os principais gargalos da operação",
];

// ── Mode labels and colors ────────────────────────────────────────────────

const ENOVA_IA_MODE_LABEL: Record<EnovaIaMode, string> = {
  analise_operacional: "Análise Operacional",
  plano_de_acao:       "Plano de Ação",
  segmentacao:         "Segmentação",
  campanha:            "Campanha",
  melhoria_crm:        "Melhoria do CRM",
  conhecimento:        "Conhecimento",
  risco:               "Risco / Cautela",
  precisa_humano:      "Precisa Humano",
};

const ENOVA_IA_MODE_COLOR: Record<EnovaIaMode, string> = {
  analise_operacional: "#5eaead",
  plano_de_acao:       "#3b82f6",
  segmentacao:         "#8b5cf6",
  campanha:            "#f59e0b",
  melhoria_crm:        "#10b981",
  conhecimento:        "#5eaead",
  risco:               "#ef4444",
  precisa_humano:      "#f97316",
};

const ENOVA_IA_CONFIDENCE_LABEL: Record<"alta" | "media" | "baixa", string> = {
  alta:  "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};

// ── OpenAI structured response renderer ──────────────────────────────────

function ChatAIResponseRender({ r }: { r: EnovaIaOpenAIResponse }) {
  const modeLabel = ENOVA_IA_MODE_LABEL[r.mode];
  const modeColor = ENOVA_IA_MODE_COLOR[r.mode];

  return (
    <div className={styles.chatMsgEnova}>
      {/* Mode badge + title */}
      <div className={styles.chatAIHeader}>
        <span
          className={styles.chatAIModeBadge}
          style={{ color: modeColor, borderColor: `${modeColor}33`, background: `${modeColor}12` }}
        >
          {modeLabel}
        </span>
        <span className={styles.chatAITitle}>{r.answer_title}</span>
      </div>

      {/* Summary */}
      <p className={styles.chatAISummary}>{r.answer_summary}</p>

      {/* Analysis points */}
      {r.analysis_points.length > 0 && (
        <div className={styles.chatAISection}>
          <span className={styles.chatAISectionLabel}>Análise</span>
          <ul className={styles.chatAIList}>
            {r.analysis_points.map((pt, i) => (
              <li key={i} className={styles.chatAIListItem}>{pt}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended actions */}
      {r.recommended_actions.length > 0 && (
        <div className={styles.chatAISection}>
          <span className={styles.chatAISectionLabel}>Ações sugeridas</span>
          <ul className={styles.chatAIList}>
            {r.recommended_actions.map((ac, i) => (
              <li key={i} className={`${styles.chatAIListItem} ${styles.chatAIListItemAction}`}>{ac}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {r.risks.length > 0 && (
        <div className={styles.chatAISection}>
          <span className={styles.chatAISectionLabel}>Riscos</span>
          <ul className={styles.chatAIList}>
            {r.risks.map((risk, i) => (
              <li key={i} className={`${styles.chatAIListItem} ${styles.chatAIListItemRisk}`}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Relevant leads */}
      {r.relevant_leads.length > 0 && (
        <div className={styles.chatAISection}>
          <span className={styles.chatAISectionLabel}>Leads relevantes</span>
          <div className={styles.chatAILeadsGrid}>
            {r.relevant_leads.map((lead, i) => (
              <div key={i} className={styles.chatAILeadItem}>
                <span className={styles.chatAILeadName}>{lead.name}</span>
                <span className={styles.chatAILeadReason}>{lead.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested programs */}
      {r.suggested_programs.length > 0 && (
        <div className={styles.chatAISection}>
          <span className={styles.chatAISectionLabel}>Programas sugeridos</span>
          <div className={styles.chatAITagRow}>
            {r.suggested_programs.map((prog, i) => (
              <span key={i} className={styles.chatAITag}>{prog}</span>
            ))}
          </div>
        </div>
      )}

      {/* System improvement suggestion */}
      {r.should_request_system_improvement && r.system_improvement_suggestion && (
        <div className={styles.chatAISystemImprove}>
          <span className={styles.chatAISystemImproveIcon}>⚙️</span>
          <div className={styles.chatAISystemImproveContent}>
            <span className={styles.chatAISystemImproveLabel}>Sugestão de melhoria do CRM</span>
            <span className={styles.chatAISystemImproveText}>{r.system_improvement_suggestion}</span>
          </div>
        </div>
      )}

      {/* Human escalation */}
      {r.should_escalate_human && (
        <div className={styles.chatAIEscalate}>
          <span>🧑‍💼</span>
          <span>Esta situação requer intervenção humana direta.</span>
        </div>
      )}

      {/* Footer: confidence + notes */}
      <div className={styles.chatAIFooter}>
        <span className={styles.chatAIConfidence}>
          {ENOVA_IA_CONFIDENCE_LABEL[r.confidence]}
        </span>
        {r.notes && (
          <span className={styles.chatAINotes}>{r.notes}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// G2.3 — Executor Assistido: estado canônico de preparação
// ---------------------------------------------------------------------------

const MAX_LEADS_VISIBLE = 5;

const EXECUTOR_RISK_BADGE_CLASS: Record<EnovaIaActionDraft["risk_level"], string> = {
  low:    styles.executorBadgeRiskLow,
  medium: styles.executorBadgeRiskMedium,
  high:   styles.executorBadgeRiskHigh,
};

const PREPARATION_STATUS_BADGE_CLASS: Record<ExecutorPreparationStatus, string> = {
  draft:                                styles.executorBadgeStatusDraft,
  review_ready:                         styles.executorBadgeStatusReviewReady,
  approved_for_manual_execution:        styles.executorBadgeStatusApproved,
  pre_execution_ready:                  styles.executorBadgeStatusPreExecutionReady,
  authorized_for_controlled_execution:  styles.executorBadgeStatusAuthorized,
  execution_contract_ready:             styles.executorBadgeStatusContractReady,
  discarded:                            styles.executorBadgeStatusDiscarded,
};

function ExecutorAssistidoBloco({
  draft,
  status,
  authPackage,
  contractPackage,
  onRevisar,
  onDescartar,
  onAprovar,
  onMarcarPreExecucao,
  onAutorizarExecucaoControlada,
  onPrepararContratoExecucao,
}: {
  draft: EnovaIaActionDraft;
  status: ExecutorPreparationStatus;
  authPackage: ExecutionAuthorizationPackage | null;
  contractPackage: ExecutionContract | null;
  onRevisar: () => void;
  onDescartar: () => void;
  onAprovar: () => void;
  onMarcarPreExecucao: () => void;
  onAutorizarExecucaoControlada: () => void;
  onPrepararContratoExecucao: () => void;
}) {
  // [G2.4] Use target_leads_detail when available, fall back to plain target_leads
  const hasDetail = draft.target_leads_detail && draft.target_leads_detail.length > 0;
  const visibleDetail = hasDetail
    ? draft.target_leads_detail.slice(0, MAX_LEADS_VISIBLE)
    : draft.target_leads.slice(0, MAX_LEADS_VISIBLE).map((name, i) => ({ name, reason: "", priority_order: i + 1 }));
  const totalLeads = hasDetail ? draft.target_leads_detail.length : draft.target_leads.length;
  const extraLeads = totalLeads - MAX_LEADS_VISIBLE;

  const blocoClass = [
    styles.executorBloco,
    status === "discarded" ? styles.executorBlocoDiscarded : "",
    status === "approved_for_manual_execution" ? styles.executorBlocoApproved : "",
    status === "review_ready" ? styles.executorBlocoReviewReady : "",
    status === "pre_execution_ready" ? styles.executorBlocoPreExecutionReady : "",
    status === "authorized_for_controlled_execution" ? styles.executorBlocoAuthorized : "",
    status === "execution_contract_ready" ? styles.executorBlocoContractReady : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Status row class driven by preparation state
  const statusRowClass = [
    styles.executorStatusRow,
    status === "approved_for_manual_execution" ? styles.executorStatusRowApproved : "",
    status === "review_ready" ? styles.executorStatusRowReviewReady : "",
    status === "pre_execution_ready" ? styles.executorStatusRowPreExecution : "",
    status === "authorized_for_controlled_execution" ? styles.executorStatusRowAuthorized : "",
    status === "execution_contract_ready" ? styles.executorStatusRowContractReady : "",
  ]
    .filter(Boolean)
    .join(" ");

  // [G2.5] Pre-execution package — built only when armed
  const preExecPackage: PreExecutionPackage | null =
    status === "pre_execution_ready" ? buildPreExecutionPackage(draft) : null;

  const supportText = PREPARATION_STATUS_SUPPORT_TEXT[status];

  return (
    <div className={blocoClass} aria-label="Executor Assistido">
      {/* Header */}
      <div className={styles.executorHeader}>
        <span className={styles.executorHeaderLabel}>⚡ Executor Assistido</span>
        <span className={EXECUTOR_RISK_BADGE_CLASS[draft.risk_level]}>
          Risco {RISK_LEVEL_LABEL[draft.risk_level]}
        </span>
        <span className={styles.executorBadgeType}>
          {ACTION_TYPE_LABEL[draft.action_type]}
        </span>
        {/* Estado de preparação canônico visível no header */}
        <span className={PREPARATION_STATUS_BADGE_CLASS[status]}>
          {PREPARATION_STATUS_LABEL[status]}
        </span>
      </div>

      {/* Body */}
      <div className={styles.executorBody}>
        {/* Título */}
        <p className={styles.executorTitle}>{draft.action_title}</p>

        {/* Resumo */}
        {draft.action_summary && (
          <div className={styles.executorSection}>
            <span className={styles.executorSectionLabel}>Resumo</span>
            <span className={styles.executorSectionValue}>{draft.action_summary}</span>
          </div>
        )}

        {/* [G2.4] Leads por prioridade — com motivo individual quando disponível */}
        {totalLeads > 0 && (
          <div className={styles.executorSection}>
            <span className={styles.executorSectionLabel}>
              Com quem agir ({totalLeads}) — por prioridade
            </span>
            <ol className={styles.executorLeadsDetailList}>
              {visibleDetail.map((lead) => (
                <li key={lead.priority_order} className={styles.executorLeadsDetailItem}>
                  <span className={styles.executorLeadsDetailOrder}>{lead.priority_order}.</span>
                  <span className={styles.executorLeadsDetailName}>{lead.name}</span>
                  {lead.reason && (
                    <span className={styles.executorLeadsDetailReason}>{lead.reason}</span>
                  )}
                </li>
              ))}
              {extraLeads > 0 && (
                <li className={styles.executorLeadsMore}>+{extraLeads} mais</li>
              )}
            </ol>
          </div>
        )}

        {/* [G2.4] Abordagem sugerida */}
        {draft.suggested_approach && (
          <div className={styles.executorSection}>
            <span className={styles.executorSectionLabel}>Abordagem sugerida</span>
            <span className={styles.executorApproachValue}>{draft.suggested_approach}</span>
          </div>
        )}

        {/* Motivo */}
        {draft.reason && (
          <div className={styles.executorSection}>
            <span className={styles.executorSectionLabel}>Justificativa</span>
            <span className={styles.executorSectionValue}>{draft.reason}</span>
          </div>
        )}

        {/* Passos sugeridos */}
        {draft.suggested_steps.length > 0 && (
          <div className={styles.executorSection}>
            <span className={styles.executorSectionLabel}>Sequência de execução</span>
            <ol className={styles.executorStepsList}>
              {draft.suggested_steps.map((step, i) => (
                <li key={i} className={styles.executorStepItem}>
                  <span className={styles.executorStepNum}>{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* [G2.4] Texto sugerido — apenas quando há base suficiente */}
        {draft.suggested_message && (
          <div className={styles.executorSection}>
            <span className={styles.executorSectionLabel}>Texto sugerido</span>
            <div className={styles.executorMessageBox}>
              <span className={styles.executorMessageText}>{draft.suggested_message}</span>
            </div>
          </div>
        )}

        {/* [G2.5] Pacote de pré-execução — visível apenas quando armado */}
        {preExecPackage && (
          <div className={styles.executorPreExecPackage}>
            <span className={styles.executorPreExecPackageLabel}>
              🎯 Pacote de pré-execução
            </span>
            <ul className={styles.executorPreExecChecklist}>
              {preExecPackage.execution_checklist.map((item) => (
                <li key={item} className={styles.executorPreExecCheckItem}>
                  <span className={styles.executorPreExecCheckIcon}>✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className={styles.executorPreExecNotice}>
              🔒 {PRE_EXECUTION_NOT_YET_EXECUTED_NOTICE}
            </p>
          </div>
        )}

        {/* [G2.6] Pacote de autorização final humana — visível apenas quando autorizado */}
        {authPackage && (
          <div className={styles.executorAuthPackage}>
            <span className={styles.executorAuthPackageLabel}>
              🔐 Autorização final humana
            </span>
            <div className={styles.executorAuthPackageRows}>
              <div className={styles.executorAuthPackageRow}>
                <span className={styles.executorAuthPackageKey}>Status</span>
                <span className={styles.executorAuthPackageValue}>Autorizado para execução controlada futura</span>
              </div>
              <div className={styles.executorAuthPackageRow}>
                <span className={styles.executorAuthPackageKey}>Autorizado por humano</span>
                <span className={styles.executorAuthPackageValue}>Sim</span>
              </div>
              <div className={styles.executorAuthPackageRow}>
                <span className={styles.executorAuthPackageKey}>Gesto final cumprido</span>
                <span className={styles.executorAuthPackageValue}>Sim</span>
              </div>
              <div className={styles.executorAuthPackageRow}>
                <span className={styles.executorAuthPackageKey}>Executado agora</span>
                <span className={styles.executorAuthPackageValue}>Não — nenhuma execução ocorreu</span>
              </div>
              <div className={styles.executorAuthPackageRow}>
                <span className={styles.executorAuthPackageKey}>Autorizado em</span>
                <span className={styles.executorAuthPackageValue}>{authPackage.authorized_at_local}</span>
              </div>
            </div>
            <p className={styles.executorAuthNotice}>
              ⚠️ {EXECUTION_AUTHORIZATION_NOTICE}
            </p>
          </div>
        )}

        {/* [G3.1] Contrato local de execução futura — visível apenas quando contrato preparado */}
        {contractPackage && (
          <div className={styles.executorContractPackage}>
            <span className={styles.executorContractPackageLabel}>
              📋 {EXECUTION_CONTRACT_READY_LABEL}
            </span>
            <div className={styles.executorContractRows}>
              <div className={styles.executorContractRow}>
                <span className={styles.executorContractKey}>Autorizado</span>
                <span className={styles.executorContractValue}>Sim</span>
              </div>
              <div className={styles.executorContractRow}>
                <span className={styles.executorContractKey}>Pronto para executor real</span>
                <span className={styles.executorContractValue}>Sim — aguardando próxima frente (G3.2+)</span>
              </div>
              <div className={styles.executorContractRow}>
                <span className={styles.executorContractKey}>Executado</span>
                <span className={styles.executorContractValue}>Não — nenhuma execução ocorreu</span>
              </div>
              <div className={styles.executorContractRow}>
                <span className={styles.executorContractKey}>Status de execução</span>
                <span className={styles.executorContractValue}>{contractPackage.execution_status}</span>
              </div>
              <div className={styles.executorContractRow}>
                <span className={styles.executorContractKey}>Contrato preparado em</span>
                <span className={styles.executorContractValue}>{contractPackage.contract_prepared_at_local}</span>
              </div>
            </div>
            {/* Guardrails canônicos */}
            <div className={styles.executorContractGuardrails}>
              <span className={styles.executorContractGuardrailsLabel}>🛡️ Guardrails canônicos</span>
              <ul className={styles.executorContractGuardrailsList}>
                {contractPackage.execution_guardrails.map((g) => (
                  <li key={g.id} className={styles.executorContractGuardrailItem}>
                    <span className={styles.executorContractGuardrailIcon}>✗</span>
                    <span>{g.rule}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className={styles.executorContractNotice}>
              🔒 {EXECUTION_CONTRACT_NOT_EXECUTED_NOTICE}
            </p>
            <p className={styles.executorContractFutureScope}>
              ℹ️ {FUTURE_SCOPE_NOTICE}
            </p>
          </div>
        )}

        {/* Status row — texto de apoio contextual por estado */}
        {status !== "discarded" && (
          <div className={statusRowClass}>
            {status === "execution_contract_ready" ? (
              <>
                <span className={styles.executorStatusContractReadyDot} />
                <span className={styles.executorStatusContractReadyText}>{supportText}</span>
              </>
            ) : status === "authorized_for_controlled_execution" ? (
              <>
                <span className={styles.executorStatusAuthorizedDot} />
                <span className={styles.executorStatusAuthorizedText}>{supportText}</span>
              </>
            ) : status === "pre_execution_ready" ? (
              <>
                <span className={styles.executorStatusPreExecutionDot} />
                <span className={styles.executorStatusPreExecutionText}>{supportText}</span>
              </>
            ) : status === "approved_for_manual_execution" ? (
              <>
                <span className={styles.executorStatusApprovedDot} />
                <span className={styles.executorStatusApprovedText}>{supportText}</span>
              </>
            ) : status === "review_ready" ? (
              <>
                <span className={styles.executorStatusReviewReadyDot} />
                <span className={styles.executorStatusReviewReadyText}>{supportText}</span>
              </>
            ) : (
              <>
                <span className={styles.executorStatusDot} />
                <span className={styles.executorStatusText}>{supportText}</span>
              </>
            )}
          </div>
        )}

        {/* Botões — coerentes com o estado atual
            draft:                               Revisar ação | Descartar
            review_ready:                        Aprovar preparo | Descartar
            approved_for_manual_execution:       Armar para pré-execução [G2.5]
            pre_execution_ready:                 Autorizar execução controlada futura [G2.6]
            authorized_for_controlled_execution: Preparar contrato de execução [G3.1]
            execution_contract_ready:            badge estático contrato preparado [G3.1]
            discarded:                           não renderizado (bloco ocultado no pai) */}
        {status === "draft" && (
          <div className={styles.executorButtons}>
            <button
              type="button"
              className={styles.executorBtnRevisar}
              onClick={onRevisar}
              aria-label="Revisar ação"
            >
              ✏️ Revisar ação
            </button>
            <button
              type="button"
              className={styles.executorBtnDescartar}
              onClick={onDescartar}
              aria-label="Descartar"
            >
              🗑️ Descartar
            </button>
          </div>
        )}

        {status === "review_ready" && (
          <div className={styles.executorButtons}>
            <button
              type="button"
              className={styles.executorBtnAprovar}
              onClick={onAprovar}
              aria-label="Aprovar para execução manual"
            >
              ✅ Aprovar preparo
            </button>
            <button
              type="button"
              className={styles.executorBtnDescartar}
              onClick={onDescartar}
              aria-label="Descartar"
            >
              🗑️ Descartar
            </button>
          </div>
        )}

        {status === "approved_for_manual_execution" && (
          <div className={styles.executorButtons}>
            <button
              type="button"
              className={styles.executorBtnMarcarPreExecucao}
              onClick={onMarcarPreExecucao}
              aria-label="Armar para pré-execução assistida"
            >
              🎯 Armar para pré-execução
            </button>
          </div>
        )}

        {status === "pre_execution_ready" && (
          <div className={styles.executorButtons}>
            <span className={styles.executorBtnPreExecucaoActive}>
              🎯 Pronta para pré-execução assistida
            </span>
            <button
              type="button"
              className={styles.executorBtnAutorizarExecucao}
              onClick={onAutorizarExecucaoControlada}
              aria-label="Autorizar execução controlada futura"
            >
              🔐 Autorizar execução controlada futura
            </button>
          </div>
        )}

        {status === "authorized_for_controlled_execution" && (
          <div className={styles.executorButtons}>
            <span className={styles.executorBtnAuthorizedActive}>
              🔐 Autorizado — execução controlada futura
            </span>
            <button
              type="button"
              className={styles.executorBtnPrepararContrato}
              onClick={onPrepararContratoExecucao}
              aria-label="Preparar contrato de execução"
            >
              📋 Preparar contrato de execução
            </button>
          </div>
        )}

        {status === "execution_contract_ready" && (
          <div className={styles.executorButtons}>
            <span className={styles.executorBtnContractReadyActive}>
              📋 Contrato local preparado — aguardando executor real (G3.2+)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatResponseRender({ msg }: { msg: ChatMsg }) {
  // OpenAI structured response takes priority
  if (msg.openai_response) {
    return (
      <>
        <ChatAIResponseRender r={msg.openai_response} />
      </>
    );
  }

  const r = msg.resposta;

  if (msg.origem === "usuario") {
    return (
      <div className={styles.chatMsgUsuario}>
        <span className={styles.chatMsgTexto}>{msg.texto}</span>
      </div>
    );
  }

  if (!r) {
    return (
      <div className={styles.chatMsgEnova}>
        <span className={styles.chatMsgTexto}>{msg.texto}</span>
      </div>
    );
  }

  return (
    <div className={styles.chatMsgEnova}>
      <div className={styles.chatRespTitulo}>
        {r.tipo === "conhecimento" && (
          <span className={styles.chatRespKbBadge}>📚 Conhecimento</span>
        )}
        {r.titulo}
      </div>
      <div className={styles.chatRespResumo}>{r.resumo}</div>
      {r.bullets && r.bullets.length > 0 && (
        <ul className={styles.chatRespBullets}>
          {r.bullets.map((b, i) => (
            <li key={i} className={styles.chatRespBullet}>
              {b}
            </li>
          ))}
        </ul>
      )}
      {r.linhas && r.linhas.length > 0 && (
        <ul className={styles.chatRespLinhas}>
          {r.linhas.map((linha, i) => (
            <li key={i} className={styles.chatRespLinha}>
              <Link href={linha.href} className={styles.chatRespNome}>
                {linha.nome}
              </Link>
              <span className={styles.chatRespDetalhe}>{linha.detalhe}</span>
            </li>
          ))}
        </ul>
      )}
      {r.sugestao && (
        <div className={styles.chatRespSugestao}>💡 {r.sugestao}</div>
      )}
    </div>
  );
}

function ChatOperacionalSection({
  fila,
  leituraGlobal,
  programas,
}: {
  fila: FilaItem[];
  leituraGlobal: LeituraGlobal | null;
  programas: ProgramaSugerido[];
}) {
  const [historico, setHistorico] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const [prepStatus, setPrepStatus] = useState<ExecutorPreparationStatus>(PREPARATION_INITIAL_STATUS);
  const [trackedDraftId, setTrackedDraftId] = useState<string | null>(null);
  const [authPackage, setAuthPackage] = useState<ExecutionAuthorizationPackage | null>(null);
  const [contractPackage, setContractPackage] = useState<ExecutionContract | null>(null);

  // Derive activeDraft from the most recent message that has an action_draft.
  // This ensures the executor block always reflects the latest conversation state,
  // regardless of whether enviar() produced an actionable response.
  const activeDraft = useMemo(() => {
    for (let i = historico.length - 1; i >= 0; i--) {
      if (historico[i].action_draft) return historico[i].action_draft;
    }
    return null;
  }, [historico]);

  // Reset prepStatus to initial state whenever a new (different) draft is detected.
  useEffect(() => {
    const newId = activeDraft?.action_id ?? null;
    if (newId !== trackedDraftId) {
      setTrackedDraftId(newId);
      setPrepStatus(PREPARATION_INITIAL_STATUS);
      setAuthPackage(null);
      setContractPackage(null);
    }
  }, [activeDraft, trackedDraftId]);

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || isThinking) return;

    const msgUsuario: ChatMsg = {
      id:     genMsgId(),
      origem: "usuario",
      texto:  t,
      ts:     Date.now(),
    };

    // Snapshot do histórico antes de adicionar a mensagem atual
    const historicoAtual = historico;

    setHistorico((prev) => [...prev, msgUsuario]);
    setInput("");
    setIsThinking(true);

    const SCROLL_DELAY_MS = 50;
    setTimeout(() => {
      listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" });
    }, SCROLL_DELAY_MS);

    let msgEnova: ChatMsg;

    try {
      // Tenta chamar a OpenAI via API route server-side
      const res = await fetch("/api/enova-ia-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: t,
          history: buildChatHistoryForApi(historicoAtual),
          context: {
            leituraGlobal,
            filaInteligente: fila,
            programasSugeridos: programas,
          },
        }),
      });

      const data = await res.json();

      if (data.ok && data.response) {
        // G2.1 — Tentar montar draft de ação assistida a partir da resposta
        const actionDraft = buildEnovaIaActionDraft(data.response, t);

        msgEnova = {
          id:              genMsgId(),
          origem:          "enova",
          texto:           data.response.answer_title,
          openai_response: data.response,
          action_draft:    actionDraft,
          ts:              Date.now(),
        };
      } else {
        // API respondeu mas sem ok — fallback local
        throw new Error(data.error ?? "Resposta inválida");
      }
    } catch {
      // Fallback para o router local se OpenAI falhar ou não estiver configurada
      const resposta = routeChat(t, fila, leituraGlobal);
      msgEnova = {
        id:      genMsgId(),
        origem:  "enova",
        texto:   resposta.titulo,
        resposta,
        ts:      Date.now(),
      };
    } finally {
      setIsThinking(false);
    }

    setHistorico((prev) => [...prev, msgEnova]);

    setTimeout(() => {
      listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight, behavior: "smooth" });
    }, SCROLL_DELAY_MS);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      enviar(input);
    }
  }

  function onExemplo(ex: string) {
    enviar(ex);
  }

  const vazio = historico.length === 0 && !isThinking;

  return (
    <section className={`${styles.card} ${styles.cardChat}`}>
      <h2 className={styles.cardTitle}>Chat Operacional</h2>
      <p className={styles.cardHint}>
        Análise cognitiva assistida pela OpenAI — baseada nos dados reais do painel.
      </p>

      {/* Histórico */}
      <div ref={listaRef} className={styles.chatHistorico}>
        {vazio ? (
          <div className={styles.chatVazio}>
            <span className={styles.chatVazioTitulo}>Como posso ajudar?</span>
            <span className={styles.chatVazioHint}>Exemplos de comandos:</span>
            <div className={styles.chatExemplos}>
              {CHAT_EXEMPLOS.map((ex) => (
                <button
                  key={ex}
                  className={styles.chatExemplo}
                  onClick={() => onExemplo(ex)}
                  type="button"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {historico.map((msg) => <ChatResponseRender key={msg.id} msg={msg} />)}
            {isThinking && (
              <div className={styles.chatThinking}>
                <span className={styles.chatThinkingDot} />
                <span className={styles.chatThinkingDot} />
                <span className={styles.chatThinkingDot} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Input */}
      <div className={styles.chatInputRow}>
        <input
          className={styles.chatInput}
          type="text"
          placeholder="Ex: monte um plano para os reprovados dos últimos 6 meses"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isThinking}
          aria-label="Comando para a Enova"
        />
        <button
          className={styles.chatBotaoEnviar}
          onClick={() => enviar(input)}
          type="button"
          disabled={!input.trim() || isThinking}
          aria-label="Enviar"
        >
          {isThinking ? "…" : "Enviar"}
        </button>
      </div>

      {/* G2.3 — Executor Assistido: estados canônicos de preparação */}
      <hr className={styles.executorSeparator} />
      {activeDraft && prepStatus !== "discarded" ? (
        <ExecutorAssistidoBloco
          draft={activeDraft}
          status={prepStatus}
          authPackage={authPackage}
          contractPackage={contractPackage}
          onRevisar={() => {
            const next = transitionPreparationStatus(prepStatus, "revisar");
            if (next) setPrepStatus(next);
          }}
          onDescartar={() => {
            const next = transitionPreparationStatus(prepStatus, "descartar");
            if (next) setPrepStatus(next);
          }}
          onAprovar={() => {
            const next = transitionPreparationStatus(prepStatus, "aprovar");
            if (next) setPrepStatus(next);
          }}
          onMarcarPreExecucao={() => {
            const next = transitionPreparationStatus(prepStatus, "marcar_pre_execucao");
            if (next) setPrepStatus(next);
          }}
          onAutorizarExecucaoControlada={() => {
            const next = transitionPreparationStatus(prepStatus, "autorizar_execucao_controlada");
            if (next) {
              setPrepStatus(next);
              const preExec = buildPreExecutionPackage(activeDraft);
              setAuthPackage(buildExecutionAuthorizationPackage(preExec));
            }
          }}
          onPrepararContratoExecucao={() => {
            const next = transitionPreparationStatus(prepStatus, "preparar_contrato_execucao");
            if (next && authPackage) {
              setPrepStatus(next);
              setContractPackage(buildExecutionContract(authPackage, activeDraft));
            }
          }}
        />
      ) : (
        <div className={styles.executorVazio}>
          <span className={styles.executorVazioIcone}>⚡</span>
          <span className={styles.executorVazioTexto}>
            Nenhuma ação assistida preparada.{" "}
            Envie um comando acionável ao chat para gerar um plano de execução.
          </span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bloco "Programas Sugeridos"
// ---------------------------------------------------------------------------

const PRIORIDADE_PROGRAMA_BADGE_CLASS: Record<PrioridadePrograma, string> = {
  alta: styles.programaBadgeAlta,
  media: styles.programaBadgeMedia,
  baixa: styles.programaBadgeBaixa,
};

const PRIORIDADE_PROGRAMA_LABEL: Record<PrioridadePrograma, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

function ProgramaCard({ programa }: { programa: ProgramaSugerido }) {
  const badgeCls = PRIORIDADE_PROGRAMA_BADGE_CLASS[programa.prioridade];
  const badgeLabel = PRIORIDADE_PROGRAMA_LABEL[programa.prioridade];
  return (
    <div className={styles.programaCard}>
      <div className={styles.programaCardHeader}>
        <span className={styles.programaCardTitulo}>{programa.titulo}</span>
        <span className={badgeCls}>{badgeLabel}</span>
      </div>
      <span className={styles.programaCardResumo}>{programa.resumo}</span>
      <span className={styles.programaCardMotivo}>{programa.motivo}</span>
      <div className={styles.programaCardFooter}>
        <span className={styles.programaCardOportunidade}>
          {programa.oportunidade_label}
        </span>
        <span className={styles.programaCardAcao}>{programa.acao_sugerida}</span>
      </div>
    </div>
  );
}

function ProgramasSugeridosSection({
  programas,
}: {
  programas: ProgramaSugerido[];
}) {
  const vazio = programas.length === 0;
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Programas Sugeridos</h2>
      <p className={styles.cardHint}>
        {vazio
          ? "Sem oportunidades táticas detectadas no momento."
          : `${programas.length} programa${programas.length > 1 ? "s" : ""} sugerido${programas.length > 1 ? "s" : ""} · baseado em dados reais da operação`}
      </p>
      {vazio ? (
        <div className={styles.programaVazio}>
          Operação sem sinais de oportunidade tática no momento.
        </div>
      ) : (
        <div className={styles.programaList}>
          {programas.map((p) => (
            <ProgramaCard key={p.id} programa={p} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------


export function EnovaIaUI({
  leituraGlobal = null,
  filaInteligente = [],
  programasSugeridos = [],
}: {
  leituraGlobal?: LeituraGlobal | null;
  filaInteligente?: FilaItem[];
  programasSugeridos?: ProgramaSugerido[];
}) {
  return (
    <main className={styles.pageMain}>
      <div className={styles.shell}>

        {/* ── HEADER ──────────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerBadge}>Central Cognitiva</div>
            <h1 className={styles.headerTitle}>ENOVA IA</h1>
            <p className={styles.headerSubtitle}>
              Diretoria operacional da esteira — visão global, fila inteligente e suporte decisório
            </p>
          </div>
          <div className={styles.headerStatus}>
            <span className={styles.statusDot} />
            <span className={styles.statusLabel}>Em implantação</span>
          </div>
        </header>

        {/* ── LEITURA GLOBAL ──────────────────────────────────────── */}
        <LeituraGlobalSection leituraGlobal={leituraGlobal} />

        {/* ── FILA INTELIGENTE ────────────────────────────────────── */}
        <FilaInteligenteSection fila={filaInteligente} />

        {/* ── GRID INFERIOR: Programas + Gargalos + Chat ──────────── */}
        <div className={styles.bottomGrid}>

          {/* Programas Sugeridos */}
          <ProgramasSugeridosSection programas={programasSugeridos} />

          {/* Gargalos e Oportunidades */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Gargalos e Oportunidades</h2>
            <p className={styles.cardHint}>
              Análise cognitiva global conectada na próxima PR.
            </p>
            <div className={styles.gargaloList}>
              {GARGALOS.map((g) => (
                <div key={g.tipo} className={styles.gargaloItem}>
                  <span className={styles.gargaloTipo}>{g.tipo}</span>
                  <span className={styles.gargaloDesc}>{g.descricao}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Chat Operacional */}
          <ChatOperacionalSection
            fila={filaInteligente}
            leituraGlobal={leituraGlobal}
            programas={programasSugeridos}
          />

        </div>
      </div>
    </main>
  );
}
