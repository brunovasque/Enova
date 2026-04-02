-- ============================================================
-- enova_incidents_v1 — View consolidada para consumo do painel INCIDENTES
-- Junta enova_incidents (incidente) + enova_state (contexto mecânico)
-- Aliases voltados à interface em PORTUGUÊS
-- Rollback: DROP VIEW IF EXISTS public.enova_incidents_v1;
-- ============================================================

CREATE OR REPLACE VIEW public.enova_incidents_v1 AS
SELECT
  -- ── Identificação do incidente ──
  i.incident_id                                    AS id_incidente,
  i.wa_id,
  i.incident_type                                  AS tipo_incidente,
  i.incident_severity                              AS severidade,
  i.incident_status                                AS status_incidente,

  -- ── Contexto do erro ──
  i.funnel_stage_at_error                          AS fase_no_erro,
  i.base_at_error                                  AS base_no_erro,
  i.error_message_short                            AS erro_resumo,
  i.error_message_raw                              AS erro_bruto,
  i.suspected_trigger                              AS gatilho_suspeito,

  -- ── Rastreio / correlação ──
  i.request_id,
  i.trace_id,
  i.worker_env                                     AS ambiente_worker,

  -- ── Timestamps de contexto ──
  i.last_customer_message_at                       AS ultima_msg_cliente,
  i.last_enova_action_at                           AS ultima_acao_enova,

  -- ── Review / resolução ──
  i.needs_human_review                             AS requer_revisao_humana,
  i.resolved_at                                    AS resolvido_em,
  i.resolution_note                                AS nota_resolucao,

  -- ── Timestamps ──
  i.opened_at                                      AS aberto_em,
  i.created_at                                     AS criado_em,
  i.updated_at                                     AS atualizado_em,

  -- ── Dados do lead (join com enova_state, read-only) ──
  e.nome,
  e.fase_conversa                                  AS fase_funil_atual,
  e.funil_status                                   AS status_funil

FROM public.enova_incidents i
LEFT JOIN public.enova_state e ON e.wa_id = i.wa_id
ORDER BY i.opened_at DESC;

-- ============================================================
-- ROLLBACK:
-- DROP VIEW IF EXISTS public.enova_incidents_v1;
--
-- Para aplicar no Supabase SQL Editor:
-- 1. Executar schema/enova_incidents.sql primeiro (tabela)
-- 2. Depois executar este arquivo (view)
-- ============================================================
