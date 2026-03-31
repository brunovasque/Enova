-- ============================================================
-- crm_leads_v1 — View consolidada para consumo do painel futuro
-- Junta enova_state (microfase/funil) + crm_lead_meta (status macro CRM)
-- Aliases voltados à interface em PORTUGUÊS
-- Separação por abas: análise, aprovados, reprovados, visita
-- REGRA: painel NUNCA altera fase_conversa via esta view
-- Rollback: DROP VIEW IF EXISTS public.crm_leads_v1;
-- ============================================================

CREATE OR REPLACE VIEW public.crm_leads_v1 AS
SELECT
  -- Identificação
  m.wa_id,
  m.nome,
  m.telefone,

  -- Origem / base (Bases module, read-only here)
  m.lead_pool,
  m.lead_temp,
  m.lead_source                       AS origem,

  -- Fase do funil (read-only, ownership ENOVA)
  e.fase_conversa                     AS fase_funil,
  e.funil_status                      AS status_funil,
  e.docs_status                       AS status_docs_funil,
  e.processo_aprovado                 AS aprovado_funil,
  e.processo_reprovado                AS reprovado_funil,
  e.visita_confirmada                 AS visita_confirmada_funil,
  e.visita_dia_hora                   AS visita_agendada_funil,

  -- ── ABA ANÁLISE ──
  m.analysis_status                   AS status_analise,
  m.analysis_reason_code              AS codigo_motivo_analise,
  m.analysis_reason_text              AS motivo_analise,
  m.analysis_last_sent_at             AS data_envio_analise,
  m.analysis_last_return_at           AS data_retorno_analise,
  m.analysis_partner_name             AS parceiro_analise,
  m.analysis_adjustment_note          AS nota_ajuste_analise,

  -- ── ABA APROVADOS ──
  m.approved_purchase_band            AS faixa_aprovacao,
  m.approved_target_match             AS aderencia_aprovacao,
  m.approved_next_step                AS proximo_passo_aprovado,
  m.approved_last_contact_at          AS ultimo_contato_aprovado,

  -- ── ABA REPROVADOS ──
  m.rejection_reason_code             AS codigo_motivo_reprovacao,
  m.rejection_reason_label            AS motivo_reprovacao,
  m.recovery_status                   AS status_recuperacao,
  m.recovery_strategy_code            AS estrategia_recuperacao,
  m.recovery_note_short               AS nota_recuperacao,
  m.next_retry_at                     AS proxima_tentativa,
  m.last_retry_contact_at             AS ultimo_contato_recuperacao,

  -- ── ABA VISITA ──
  m.visit_status                      AS status_visita,
  m.visit_context                     AS contexto_visita,
  m.visit_date                        AS data_visita,
  m.visit_confirmed_at                AS data_confirmacao_visita,
  m.visit_result                      AS resultado_visita,
  m.visit_objection_code              AS codigo_objecao_visita,
  m.visit_next_step                   AS proximo_passo_visita,
  m.visit_owner                       AS responsavel_visita,
  m.visit_notes_short                 AS observacao_visita,

  -- ── RESERVA ──
  m.reserve_status                    AS status_reserva,
  m.reserve_stage_detail              AS detalhe_etapa_reserva,
  m.reserve_risk_level                AS nivel_risco_reserva,
  m.reserve_next_action_label         AS proxima_acao_reserva,
  m.reserve_next_action_due_at        AS prazo_proxima_acao_reserva,
  m.reserve_last_movement_at          AS ultimo_movimento_reserva,

  -- ── FINANCEIRO (preparatório) ──
  m.vgv_value                         AS valor_vgv,
  m.commission_value                  AS valor_comissao,
  m.commission_status                 AS status_comissao,
  m.financial_status                  AS status_financeiro,
  m.financial_note_short              AS nota_financeiro,
  m.financial_last_update_at          AS ultima_atualizacao_financeiro,

  -- Timestamps
  m.created_at                        AS criado_em,
  m.updated_at                        AS atualizado_em

FROM public.crm_lead_meta m
LEFT JOIN public.enova_state e ON e.wa_id = m.wa_id;

-- ============================================================
-- ROLLBACK:
-- DROP VIEW IF EXISTS public.crm_leads_v1;
