-- ============================================================
-- enova_attendance_v1 — View consolidada para consumo do painel ATENDIMENTO
-- Junta enova_state (fase_conversa mecânica) + enova_attendance_meta (operacional)
-- Cobre leads em fluxo ativo ANTES de envio_docs
-- Aliases voltados à interface em PORTUGUÊS
-- REGRA: painel NUNCA altera fase_conversa via esta view (read-only ownership: ENOVA funil)
-- Rollback: DROP VIEW IF EXISTS public.enova_attendance_v1;
-- ============================================================
-- ARQUITETURA:
-- enova_state  → dados mecânicos do trilho (fase_conversa, campos de perfil, timestamps)
-- enova_attendance_meta → campos operacionais derivados (próxima ação, pendência, atenção)
-- A view consolida ambas para o painel consumir de forma unificada.
-- ============================================================

CREATE OR REPLACE VIEW public.enova_attendance_v1 AS
SELECT
  -- ── Identificação ──
  e.wa_id,
  e.nome,
  e.wa_id                                        AS telefone,

  -- ── Fase mecânica do funil (read-only, ownership ENOVA) ──
  e.fase_conversa                                 AS fase_funil,
  e.funil_status                                  AS status_funil,

  -- ── Camada operacional Atendimento ──
  a.current_funnel_stage                          AS fase_atendimento,
  a.stalled_stage                                 AS fase_travamento,
  a.stalled_reason_code                           AS codigo_motivo_travamento,
  a.stalled_reason_label                          AS motivo_travamento,
  a.stalled_at                                    AS travou_em,
  a.pending_owner                                 AS dono_pendencia,
  a.main_pending_code                             AS codigo_pendencia_principal,
  a.main_pending_label                            AS pendencia_principal,
  a.enova_next_action_code                        AS codigo_proxima_acao,
  a.enova_next_action_label                       AS proxima_acao,
  a.enova_next_action_trigger                     AS gatilho_proxima_acao,
  a.enova_next_action_due_at                      AS prazo_proxima_acao,
  a.enova_next_action_executable                  AS proxima_acao_executavel,
  a.attention_status                              AS status_atencao,

  -- ── Origem / base ──
  a.origin_base                                   AS base_origem,
  a.current_base                                  AS base_atual,
  a.moved_to_current_base_at                      AS movido_base_em,
  a.moved_to_current_stage_at                     AS movido_fase_em,

  -- ── Timestamps operacionais ──
  a.last_customer_interaction_at                  AS ultima_interacao_cliente,
  a.last_enova_interaction_at                     AS ultima_interacao_enova,
  e.last_incoming_at                              AS ultima_msg_recebida_raw,

  -- ── Perfil parcial confirmado (sinais do funil mecânico, read-only) ──
  e.estado_civil,
  e.regime_trabalho,
  e.renda_total_para_fluxo                        AS renda_total,
  e.somar_renda,
  e.composicao_pessoa                             AS composicao,
  e.ir_declarado,
  e.ctps_36,
  e.restricao,
  e.dependentes_qtd,

  -- ── Resumo curto ──
  a.enova_summary_short                           AS resumo_curto,

  -- ── Incidentes ──
  a.has_open_incident                             AS tem_incidente_aberto,
  a.open_incident_type                            AS tipo_incidente,
  a.open_incident_severity                        AS severidade_incidente,

  -- ── Arquivamento ──
  a.archived_at                                   AS arquivado_em,
  a.archive_reason_code                           AS codigo_motivo_arquivo,
  a.archive_reason_note                           AS nota_arquivo,

  -- ── Timestamps de registro ──
  a.created_at                                    AS criado_em,
  -- a.updated_at has NOT NULL DEFAULT now(); fallback to e.updated_at only when
  -- no attendance_meta row exists yet (LEFT JOIN produces NULL)
  COALESCE(a.updated_at, e.updated_at)            AS atualizado_em

FROM public.enova_state e
LEFT JOIN public.enova_attendance_meta a ON a.wa_id = e.wa_id
WHERE (
  -- ── Leads em fluxo ativo ANTES de envio_docs ──
  e.fase_conversa IN (
    'inicio',
    'inicio_programa',
    'inicio_nome',
    'inicio_nacionalidade',
    'inicio_rnm',
    'inicio_rnm_validade',
    'estado_civil',
    'regime_trabalho',
    'inicio_multi_regime',
    'inicio_multi_regime_detalhe',
    'renda',
    'renda_parceiro',
    'possui_renda_extra',
    'renda_mista_detalhe',
    'inicio_multi_renda',
    'inicio_multi_renda_detalhe',
    'somar_renda_solteiro',
    'parceiro_tem_renda',
    'somar_renda_familiar',
    'regime_trabalho_parceiro_familiar',
    'dependente',
    'ctps_36',
    'ctps_36_parceiro',
    'restricao',
    'regularizacao_restricao',
    'quem_pode_somar',
    'interpretar_composicao',
    'ir_declarado'
  )
  -- ── Também leads que o operacional marcou como atendimento ──
  -- (any non-archived attendance_meta row qualifies the lead)
  OR (
    a.wa_id IS NOT NULL
    AND a.archived_at IS NULL
  )
)
-- ── Exclui leads já em envio_docs ou além (esses vão para CRM) ──
AND e.fase_conversa NOT IN (
  'envio_docs',
  'aguardando_retorno_correspondente',
  'agendamento_visita',
  'visita_confirmada',
  'finalizacao_processo'
)
-- ── Exclui leads arquivados ──
AND (a.archived_at IS NULL OR a.wa_id IS NULL);

-- ============================================================
-- ROLLBACK:
-- DROP VIEW IF EXISTS public.enova_attendance_v1;
--
-- Para aplicar no Supabase SQL Editor:
-- 1. Executar schema/enova_attendance_meta.sql primeiro (tabela)
-- 2. Depois executar este arquivo (view)
-- ============================================================
