-- ============================================================
-- Mini-CRM Operacional — Expansão de crm_lead_meta
-- Escopo: análise, aprovados, reprovados, visita, reserva, financeiro
-- Regras: todas as colunas nullable, sem alterar colunas existentes
-- Rollback: ALTER TABLE ... DROP COLUMN IF EXISTS ...
-- ============================================================

-- A) ANÁLISE
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS analysis_status text
  CHECK (analysis_status IN (
    'DOCS_PENDING','DOCS_READY','SENT','UNDER_ANALYSIS',
    'ADJUSTMENT_REQUIRED','APPROVED_HIGH','APPROVED_LOW',
    'REJECTED_RECOVERABLE','REJECTED_HARD'
  ));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS analysis_reason_code text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS analysis_reason_text text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS analysis_last_sent_at timestamptz;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS analysis_last_return_at timestamptz;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS analysis_partner_name text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS analysis_adjustment_note text;

-- B) APROVADOS
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS approved_purchase_band text
  CHECK (approved_purchase_band IN ('HIGH','LOW'));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS approved_target_match text
  CHECK (approved_target_match IN ('FULL','PARTIAL','WEAK'));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS approved_next_step text
  CHECK (approved_next_step IN ('VISIT','NEGOTIATION','FOLLOW_UP','DROP'));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS approved_last_contact_at timestamptz;

-- C) REPROVADOS / RECUPERAÇÃO
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS rejection_reason_code text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS rejection_reason_label text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS recovery_status text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS recovery_strategy_code text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS recovery_note_short text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS last_retry_contact_at timestamptz;

-- D) VISITA
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_status text
  CHECK (visit_status IN (
    'TO_SCHEDULE','SCHEDULED','CONFIRMED','DONE','NO_SHOW','CANCELED'
  ));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_context text
  CHECK (visit_context IN ('FIRST_ATTENDANCE','APPROVED_ALREADY'));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_date timestamptz;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_confirmed_at timestamptz;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_result text
  CHECK (visit_result IN (
    'DONE_WAITING','CLOSED_PURCHASE','FOLLOW_UP','LOST','NO_SHOW'
  ));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_objection_code text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_next_step text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_owner text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS visit_notes_short text;

-- E) RESERVA (mínimo preparatório)
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS reserve_status text
  CHECK (reserve_status IN (
    'OPEN','DOCS_PENDING','UNDER_REVIEW','ADJUSTMENT_REQUIRED',
    'WAITING_CLIENT','WAITING_CORRESPONDENT','WAITING_BUILDER',
    'APPROVED','SIGNED','CANCELED'
  ));
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS reserve_stage_detail text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS reserve_risk_level text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS reserve_next_action_label text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS reserve_next_action_due_at timestamptz;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS reserve_last_movement_at timestamptz;

-- F) FINANCEIRO (preparatório, pode ser evoluído em PR futura)
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS vgv_value numeric;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS commission_value numeric;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS commission_status text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS financial_status text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS financial_note_short text;
ALTER TABLE public.crm_lead_meta ADD COLUMN IF NOT EXISTS financial_last_update_at timestamptz;

-- Índices operacionais
CREATE INDEX IF NOT EXISTS crm_lead_meta_analysis_idx
  ON public.crm_lead_meta (analysis_status) WHERE analysis_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_lead_meta_visit_idx
  ON public.crm_lead_meta (visit_status) WHERE visit_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_lead_meta_reserve_idx
  ON public.crm_lead_meta (reserve_status) WHERE reserve_status IS NOT NULL;

-- ============================================================
-- ROLLBACK (executar manualmente se necessário):
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS analysis_status;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS analysis_reason_code;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS analysis_reason_text;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS analysis_last_sent_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS analysis_last_return_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS analysis_partner_name;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS analysis_adjustment_note;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS approved_purchase_band;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS approved_target_match;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS approved_next_step;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS approved_last_contact_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS rejection_reason_code;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS rejection_reason_label;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS recovery_status;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS recovery_strategy_code;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS recovery_note_short;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS next_retry_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS last_retry_contact_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_status;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_context;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_date;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_confirmed_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_result;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_objection_code;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_next_step;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_owner;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS visit_notes_short;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS reserve_status;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS reserve_stage_detail;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS reserve_risk_level;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS reserve_next_action_label;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS reserve_next_action_due_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS reserve_last_movement_at;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS vgv_value;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS commission_value;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS commission_status;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS financial_status;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS financial_note_short;
-- ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS financial_last_update_at;
-- DROP INDEX IF EXISTS crm_lead_meta_analysis_idx;
-- DROP INDEX IF EXISTS crm_lead_meta_visit_idx;
-- DROP INDEX IF EXISTS crm_lead_meta_reserve_idx;
