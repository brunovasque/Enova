-- ============================================================
-- crm_leads_v1 — View consolidada para consumo do painel CRM
-- Junta enova_state (microfase/funil) + crm_lead_meta (status macro CRM)
--      + enova_attendance_meta (incidente aberto — read-only, badge operacional)
--      + crm_stage_history (histórico permanente de passagem por etapa)
-- Aliases voltados à interface em PORTUGUÊS
-- Separação por abas: pasta, análise, aprovados, reprovados, visita
-- REGRA: painel NUNCA altera fase_conversa via esta view
-- ============================================================
-- DIAGNÓSTICO (2026-04-01):
-- A view ORIGINAL dirigia FROM crm_lead_meta → invisibilizava todos os leads
-- que nunca tiveram uma ação CRM explícita, mesmo que o funil real já estivesse
-- em aguardando_retorno_correspondente, agendamento_visita, etc.
-- CORREÇÃO: agora dirige FROM enova_state, LEFT JOIN crm_lead_meta.
-- Leads visíveis = todos que estão em fase ≥ envio_docs no funil real
--                 + qualquer lead com status CRM já registrado pelo operador.
-- Rollback: DROP VIEW IF EXISTS public.crm_leads_v1;
-- ============================================================

CREATE OR REPLACE VIEW public.crm_leads_v1 AS
SELECT
  -- Identificação (e.wa_id é sempre não-nulo pois enova_state é o lado esquerdo)
  e.wa_id,
  COALESCE(m.nome, e.nome)             AS nome,
  COALESCE(m.telefone, e.wa_id)        AS telefone,

  -- Origem / base (Bases module, read-only here; null para leads só no funil)
  m.lead_pool,
  m.lead_temp,
  m.lead_source                        AS origem,

  -- Fase do funil (read-only, ownership ENOVA)
  e.fase_conversa                      AS fase_funil,
  e.funil_status                       AS status_funil,
  e.docs_status                        AS status_docs_funil,
  e.processo_aprovado                  AS aprovado_funil,
  e.processo_reprovado                 AS reprovado_funil,
  e.visita_confirmada                  AS visita_confirmada_funil,
  e.visita_dia_hora                    AS visita_agendada_funil,

  -- ── ABA ANÁLISE ──
  m.analysis_status                    AS status_analise,
  m.analysis_reason_code               AS codigo_motivo_analise,
  m.analysis_reason_text               AS motivo_analise,
  m.analysis_last_sent_at              AS data_envio_analise,
  m.analysis_last_return_at            AS data_retorno_analise,
  m.analysis_partner_name              AS parceiro_analise,
  m.analysis_adjustment_note           AS nota_ajuste_analise,

  -- ── RETORNO DO CORRESPONDENTE ──
  m.analysis_return_summary            AS resumo_retorno_analise,
  m.analysis_return_reason             AS motivo_retorno_analise,
  m.analysis_financing_amount          AS valor_financiamento_aprovado,
  m.analysis_subsidy_amount            AS valor_subsidio_aprovado,
  m.analysis_entry_amount              AS valor_entrada_informada,
  m.analysis_monthly_payment           AS valor_parcela_informada,
  m.analysis_return_raw                AS retorno_bruto_correspondente,
  m.analysis_returned_by               AS correspondente_retorno,

  -- ── SNAPSHOT DO PERFIL ANALISADO ──
  m.analysis_profile_type              AS tipo_perfil_analise,
  m.analysis_holder_name               AS nome_titular_analise,
  m.analysis_partner_name_snapshot     AS nome_parceiro_analise_snapshot,
  m.analysis_marital_status            AS estado_civil_analise,
  m.analysis_composition_type          AS tipo_composicao_analise,
  m.analysis_income_total              AS renda_total_analise,
  m.analysis_income_holder             AS renda_titular_analise,
  m.analysis_income_partner            AS renda_parceiro_analise,
  m.analysis_income_family             AS renda_familiar_analise,
  m.analysis_holder_work_regime        AS regime_trabalho_titular_analise,
  m.analysis_partner_work_regime       AS regime_trabalho_parceiro_analise,
  m.analysis_family_work_regime        AS regime_trabalho_familiar_analise,
  m.analysis_has_fgts                  AS possui_fgts_analise,
  m.analysis_has_down_payment          AS possui_entrada_analise,
  m.analysis_down_payment_amount       AS valor_entrada_analise,
  m.analysis_has_restriction           AS possui_restricao_analise,
  m.analysis_partner_has_restriction   AS possui_restricao_parceiro_analise,
  m.analysis_holder_has_ir             AS possui_ir_titular_analise,
  m.analysis_partner_has_ir            AS possui_ir_parceiro_analise,
  m.analysis_ctps_36                   AS ctps_36_titular_analise,
  m.analysis_partner_ctps_36           AS ctps_36_parceiro_analise,
  m.analysis_dependents_count          AS quantidade_dependentes_analise,
  m.analysis_ticket_target             AS ticket_desejado_analise,
  m.analysis_property_goal             AS objetivo_imovel_analise,
  m.analysis_profile_summary           AS resumo_perfil_analise,
  m.analysis_snapshot_raw              AS snapshot_bruto_analise,

  -- ── SCORE OPERACIONAL ──
  m.analysis_profile_score             AS score_perfil_analise,
  m.analysis_profile_band              AS faixa_perfil_analise,
  m.analysis_work_score_label          AS label_score_trabalho,
  m.analysis_work_score_reason         AS motivo_score_trabalho,

  -- ── ABA APROVADOS ──
  m.approved_purchase_band             AS faixa_aprovacao,
  m.approved_target_match              AS aderencia_aprovacao,
  m.approved_next_step                 AS proximo_passo_aprovado,
  m.approved_last_contact_at           AS ultimo_contato_aprovado,

  -- ── ABA REPROVADOS ──
  m.rejection_reason_code              AS codigo_motivo_reprovacao,
  m.rejection_reason_label             AS motivo_reprovacao,
  m.recovery_status                    AS status_recuperacao,
  m.recovery_strategy_code             AS estrategia_recuperacao,
  m.recovery_note_short                AS nota_recuperacao,
  m.next_retry_at                      AS proxima_tentativa,
  m.last_retry_contact_at              AS ultimo_contato_recuperacao,

  -- ── ABA VISITA ──
  m.visit_status                       AS status_visita,
  m.visit_context                      AS contexto_visita,
  m.visit_date                         AS data_visita,
  m.visit_confirmed_at                 AS data_confirmacao_visita,
  m.visit_result                       AS resultado_visita,
  m.visit_objection_code               AS codigo_objecao_visita,
  m.visit_next_step                    AS proximo_passo_visita,
  m.visit_owner                        AS responsavel_visita,
  m.visit_notes_short                  AS observacao_visita,

  -- ── RESERVA ──
  m.reserve_status                     AS status_reserva,
  m.reserve_stage_detail               AS detalhe_etapa_reserva,
  m.reserve_risk_level                 AS nivel_risco_reserva,
  m.reserve_next_action_label          AS proxima_acao_reserva,
  m.reserve_next_action_due_at         AS prazo_proxima_acao_reserva,
  m.reserve_last_movement_at           AS ultimo_movimento_reserva,

  -- ── FINANCEIRO (preparatório) ──
  m.vgv_value                          AS valor_vgv,
  m.commission_value                   AS valor_comissao,
  m.commission_status                  AS status_comissao,
  m.financial_status                   AS status_financeiro,
  m.financial_note_short               AS nota_financeiro,
  m.financial_last_update_at           AS ultima_atualizacao_financeiro,


  -- ── INCIDENTE ABERTO (read-only — fonte: enova_attendance_meta) ──
  a.has_open_incident                  AS tem_incidente_aberto,
  a.open_incident_type                 AS tipo_incidente,
  a.open_incident_severity             AS severidade_incidente,

  -- ── HISTÓRICO PERMANENTE DE PASSAGEM POR ETAPA CRM ──
  -- entered_at  = data/hora da primeira entrada na etapa (imutável)
  -- last_interaction_at = última interação relevante naquela etapa
  csh_pasta.entered_at                 AS pasta_entered_at,
  csh_pasta.last_interaction_at        AS pasta_last_interaction_at,
  csh_analise.entered_at               AS analise_entered_at,
  csh_analise.last_interaction_at      AS analise_last_interaction_at,
  csh_aprovado.entered_at              AS aprovado_entered_at,
  csh_aprovado.last_interaction_at     AS aprovado_last_interaction_at,
  csh_reprovado.entered_at             AS reprovado_entered_at,
  csh_reprovado.last_interaction_at    AS reprovado_last_interaction_at,
  csh_visita.entered_at                AS visita_entered_at,
  csh_visita.last_interaction_at       AS visita_last_interaction_at,

  -- Timestamps
  m.created_at                         AS criado_em,
  COALESCE(m.updated_at, e.updated_at) AS atualizado_em

FROM public.enova_state e
LEFT JOIN public.crm_lead_meta m ON m.wa_id = e.wa_id
LEFT JOIN public.enova_attendance_meta a ON a.wa_id = e.wa_id
LEFT JOIN public.crm_stage_history csh_pasta     ON csh_pasta.wa_id     = e.wa_id AND csh_pasta.etapa_crm     = 'PASTA'
LEFT JOIN public.crm_stage_history csh_analise   ON csh_analise.wa_id   = e.wa_id AND csh_analise.etapa_crm   = 'ANALISE'
LEFT JOIN public.crm_stage_history csh_aprovado  ON csh_aprovado.wa_id  = e.wa_id AND csh_aprovado.etapa_crm  = 'APROVADO'
LEFT JOIN public.crm_stage_history csh_reprovado ON csh_reprovado.wa_id = e.wa_id AND csh_reprovado.etapa_crm = 'REPROVADO'
LEFT JOIN public.crm_stage_history csh_visita    ON csh_visita.wa_id    = e.wa_id AND csh_visita.etapa_crm    = 'VISITA'
-- NOTE: 5 separate joins each resolve via UNIQUE index on (wa_id, etapa_crm) — O(log n) per join.
WHERE (
  -- Inclui leads que já chegaram em envio_docs ou além (fonte de verdade do funil)
  e.fase_conversa IN (
    'envio_docs',
    'aguardando_retorno_correspondente',
    'agendamento_visita',
    'visita_confirmada',
    'finalizacao_processo'
  )
  -- Inclui leads com retorno definitivo do correspondente (aprovado/reprovado)
  OR e.processo_aprovado   IS TRUE
  OR e.processo_reprovado  IS TRUE
  -- Inclui leads com status de visita confirmada no funil
  OR e.visita_confirmada   IS TRUE
  -- Ou leads com qualquer status CRM registrado pelo operador (independente da fase)
  OR m.analysis_status IS NOT NULL
  OR m.visit_status    IS NOT NULL
  OR m.reserve_status  IS NOT NULL
);

-- ============================================================
-- ROLLBACK:
-- DROP VIEW IF EXISTS public.crm_leads_v1;
--
-- Para aplicar no Supabase SQL Editor:
-- 1. Colar este arquivo inteiro e executar.
-- 2. Ou: DROP VIEW IF EXISTS public.crm_leads_v1; (depois CREATE OR REPLACE VIEW ...)
-- ============================================================

-- ============================================================
-- DIAGNÓSTICO — query para validar o wa_id real no Supabase:
-- (substitua <SEU_WA_ID> pelo número real)
--
-- SELECT e.wa_id, e.fase_conversa, e.funil_status,
--        e.processo_aprovado, e.processo_reprovado,
--        m.analysis_status, m.visit_status,
--        a.has_open_incident, a.open_incident_type, a.open_incident_severity
-- FROM public.enova_state e
-- LEFT JOIN public.crm_lead_meta m ON m.wa_id = e.wa_id
-- LEFT JOIN public.enova_attendance_meta a ON a.wa_id = e.wa_id
-- WHERE e.wa_id = '<SEU_WA_ID>';
--
-- LEFT JOIN public.crm_lead_meta m ON m.wa_id = e.wa_id
-- WHERE e.wa_id = '<SEU_WA_ID>';
--
-- Se retornar linha com fase_conversa = 'aguardando_retorno_correspondente'
-- e analysis_status = null, a causa ERA a inversão do JOIN (já corrigida aqui).
-- Após aplicar esta view, o lead aparecerá automaticamente na aba Análise.
-- ============================================================
