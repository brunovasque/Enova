-- ============================================================
-- crm_override_log — Log de alterações manuais do mini-CRM
-- Toda mudança manual relevante de status macro é auditada aqui.
-- Rollback: DROP TABLE IF EXISTS public.crm_override_log;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_override_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wa_id text NOT NULL,
  field text NOT NULL,
  from_value text,
  to_value text,
  reason_code text,
  reason_text text,
  operator text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_override_log_wa_idx
  ON public.crm_override_log (wa_id, created_at DESC);

-- ============================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.crm_override_log;
