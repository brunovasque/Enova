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

  -- ── RETORNO DO CORRESPONDENTE ──
  m.analysis_return_summary           AS resumo_retorno_analise,
  m.analysis_return_reason            AS motivo_retorno_analise,
  m.analysis_financing_amount         AS valor_financiamento_aprovado,
  m.analysis_subsidy_amount           AS valor_subsidio_aprovado,
  m.analysis_entry_amount             AS valor_entrada_informada,
  m.analysis_monthly_payment          AS valor_parcela_informada,
  m.analysis_return_raw               AS retorno_bruto_correspondente,
  m.analysis_returned_by              AS correspondente_retorno,

  -- ── SNAPSHOT DO PERFIL ANALISADO ──
  m.analysis_profile_type             AS tipo_perfil_analise,
  m.analysis_holder_name              AS nome_titular_analise,
  m.analysis_partner_name_snapshot    AS nome_parceiro_analise_snapshot,
  m.analysis_marital_status           AS estado_civil_analise,
  m.analysis_composition_type         AS tipo_composicao_analise,
  m.analysis_income_total             AS renda_total_analise,
  m.analysis_income_holder            AS renda_titular_analise,
  m.analysis_income_partner           AS renda_parceiro_analise,
  m.analysis_income_family            AS renda_familiar_analise,
  m.analysis_holder_work_regime       AS regime_trabalho_titular_analise,
  m.analysis_partner_work_regime      AS regime_trabalho_parceiro_analise,
  m.analysis_family_work_regime       AS regime_trabalho_familiar_analise,
  m.analysis_has_fgts                 AS possui_fgts_analise,
  m.analysis_has_down_payment         AS possui_entrada_analise,
  m.analysis_down_payment_amount      AS valor_entrada_analise,
  m.analysis_has_restriction          AS possui_restricao_analise,
  m.analysis_partner_has_restriction  AS possui_restricao_parceiro_analise,
  m.analysis_holder_has_ir            AS possui_ir_titular_analise,
  m.analysis_partner_has_ir           AS possui_ir_parceiro_analise,
  m.analysis_ctps_36                  AS ctps_36_titular_analise,
  m.analysis_partner_ctps_36          AS ctps_36_parceiro_analise,
  m.analysis_dependents_count         AS quantidade_dependentes_analise,
  m.analysis_ticket_target            AS ticket_desejado_analise,
  m.analysis_property_goal            AS objetivo_imovel_analise,
  m.analysis_profile_summary          AS resumo_perfil_analise,
  m.analysis_snapshot_raw             AS snapshot_bruto_analise,

  -- ── SCORE OPERACIONAL ──
  m.analysis_profile_score            AS score_perfil_analise,
  m.analysis_profile_band             AS faixa_perfil_analise,
  m.analysis_work_score_label         AS label_score_trabalho,
  m.analysis_work_score_reason        AS motivo_score_trabalho,

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
