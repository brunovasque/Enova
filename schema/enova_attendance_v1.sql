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
  e.lead_id,
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

  -- ── Campos operacionais humanos (fase 2) ──
  a.responsavel,
  a.objecao_principal,
  a.interesse_atual,
  a.momento_do_cliente,
  a.quick_note,
  a.human_next_action,

  -- ── Temperatura do lead (crm_lead_meta, join seguro por wa_id) ──
  m.lead_temp,

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
  e.renda,
  e.renda_total_para_fluxo                        AS renda_total,
  e.somar_renda,
  e.composicao_pessoa                             AS composicao,
  e.ir_declarado,
  e.ctps_36,
  e.restricao,
  e.dependentes_qtd,
  e.nacionalidade,
  e.entrada_valor,

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
LEFT JOIN public.crm_lead_meta m ON m.wa_id = e.wa_id
WHERE (
  -- ── Leads em fluxo ativo ANTES de envio_docs ──
  e.fase_conversa IN (
    -- Início / setup
    'inicio', 'inicio_decisao', 'inicio_programa', 'inicio_nome',
    'inicio_nacionalidade', 'inicio_rnm', 'inicio_rnm_validade',
    -- Estado civil / casamento
    'estado_civil', 'confirmar_casamento', 'financiamento_conjunto',
    'pais_casados_civil_pergunta',
    -- Composição de renda
    'somar_renda_solteiro', 'somar_renda_familiar',
    'quem_pode_somar', 'interpretar_composicao', 'sugerir_composicao_mista',
    'parceiro_tem_renda',
    -- Regime de trabalho (titular + multi)
    'regime_trabalho',
    'inicio_multi_regime_pergunta', 'inicio_multi_regime_coletar',
    -- Regime de trabalho (parceiro)
    'regime_trabalho_parceiro',
    'inicio_multi_regime_pergunta_parceiro', 'inicio_multi_regime_coletar_parceiro',
    -- Regime de trabalho (familiar / P3)
    'regime_trabalho_parceiro_familiar', 'regime_trabalho_parceiro_familiar_p3',
    'inicio_multi_regime_familiar_pergunta', 'inicio_multi_regime_familiar_loop',
    'inicio_multi_regime_p3_pergunta', 'inicio_multi_regime_p3_loop',
    -- Renda (titular + multi)
    'renda', 'possui_renda_extra', 'renda_mista_detalhe',
    'inicio_multi_renda_pergunta', 'inicio_multi_renda_coletar',
    'clt_renda_perfil_informativo',
    -- Renda (parceiro + multi)
    'renda_parceiro',
    'inicio_multi_renda_pergunta_parceiro', 'inicio_multi_renda_coletar_parceiro',
    -- Renda (familiar / P3)
    'renda_familiar_valor', 'renda_parceiro_familiar', 'renda_parceiro_familiar_p3',
    'confirmar_avo_familiar',
    'inicio_multi_renda_familiar_pergunta', 'inicio_multi_renda_familiar_loop',
    'inicio_multi_renda_p3_pergunta', 'inicio_multi_renda_p3_loop',
    -- P3
    'p3_tipo_pergunta',
    -- Autônomo / IR
    'autonomo_ir_pergunta', 'autonomo_sem_ir_ir_este_ano',
    'autonomo_sem_ir_caminho', 'autonomo_sem_ir_entrada',
    'autonomo_compor_renda',
    'ir_declarado',
    -- Dependente
    'dependente',
    -- CTPS 36 meses
    'ctps_36', 'ctps_36_parceiro', 'ctps_36_parceiro_p3',
    -- Restrição
    'restricao', 'regularizacao_restricao',
    'restricao_parceiro', 'regularizacao_restricao_parceiro',
    'restricao_parceiro_p3', 'regularizacao_restricao_p3',
    -- Verificação / elegibilidade
    'verificar_averbacao', 'verificar_inventario',
    -- Terminal pré-docs
    'fim_ineligivel', 'fim_inelegivel', 'finalizacao'
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
