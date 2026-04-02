-- ============================================================
-- bases_leads_v1 — View consolidada para consumo do painel BASES
-- Junta crm_lead_meta (dados operacionais da base)
--      + enova_attendance_meta (incidente aberto — read-only, badge operacional)
-- Aliases: mesmos campos de crm_lead_meta + 3 campos de incidente
-- REGRA: painel NUNCA altera crm_lead_meta via esta view (read-only para incidente)
-- Rollback: DROP VIEW IF EXISTS public.bases_leads_v1;
-- ============================================================
-- MOTIVAÇÃO:
-- crm_lead_meta é a fonte canônica de Bases. enova_attendance_meta é a fonte
-- canônica de flags de incidente aberto. Esta view une as duas sem duplicar dado,
-- seguindo o mesmo padrão de crm_leads_v1 (CRM) e enova_attendance_v1 (Atendimento).
-- ============================================================

CREATE OR REPLACE VIEW public.bases_leads_v1 AS
SELECT
  -- ── Identificação e dados operacionais (crm_lead_meta) ──
  m.wa_id,
  m.nome,
  m.telefone,
  m.lead_pool,
  m.lead_temp,
  m.lead_source,
  m.tags,
  m.obs_curta,
  m.import_ref,
  m.auto_outreach_enabled,
  m.is_paused,
  m.created_at,
  m.updated_at,
  m.ultima_acao,
  m.ultimo_contato_at,
  m.status_operacional,

  -- ── INCIDENTE ABERTO (read-only — fonte: enova_attendance_meta) ──
  a.has_open_incident                  AS tem_incidente_aberto,
  a.open_incident_type                 AS tipo_incidente,
  a.open_incident_severity             AS severidade_incidente

FROM public.crm_lead_meta m
LEFT JOIN public.enova_attendance_meta a ON a.wa_id = m.wa_id;

-- ============================================================
-- ROLLBACK:
-- DROP VIEW IF EXISTS public.bases_leads_v1;
--
-- Para aplicar no Supabase SQL Editor:
-- 1. Colar este arquivo inteiro e executar.
-- ============================================================

-- ============================================================
-- DIAGNÓSTICO — query para validar incidente no Supabase:
-- (substitua <SEU_WA_ID> pelo número real)
--
-- SELECT m.wa_id, m.lead_pool, m.nome,
--        a.has_open_incident, a.open_incident_type, a.open_incident_severity
-- FROM public.crm_lead_meta m
-- LEFT JOIN public.enova_attendance_meta a ON a.wa_id = m.wa_id
-- WHERE m.wa_id = '<SEU_WA_ID>';
-- ============================================================
