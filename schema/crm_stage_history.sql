-- ============================================================
-- crm_stage_history — Histórico permanente de passagem por etapa CRM
-- Regra: 1 registro por (wa_id, etapa_crm).
--   entered_at  = data/hora da PRIMEIRA entrada naquela etapa (imutável).
--   last_interaction_at = última interação relevante naquela etapa (atualizável).
-- Não quebra estado atual do lead nem mexe no funil mecânico.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_stage_history (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wa_id                 text NOT NULL,
  etapa_crm             text NOT NULL
    CHECK (etapa_crm IN ('PASTA', 'ANALISE', 'APROVADO', 'REPROVADO', 'VISITA')),
  entered_at            timestamptz NOT NULL DEFAULT now(),
  last_interaction_at   timestamptz,
  CONSTRAINT crm_stage_history_wa_etapa_unique UNIQUE (wa_id, etapa_crm)
);

-- ── Trigger: entered_at é imutável — nunca sobrescrito em UPDATE ──
CREATE OR REPLACE FUNCTION public.crm_stage_history_protect_entered_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.entered_at := OLD.entered_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_stage_history_entered_at_guard
  ON public.crm_stage_history;

CREATE TRIGGER crm_stage_history_entered_at_guard
  BEFORE UPDATE ON public.crm_stage_history
  FOR EACH ROW EXECUTE FUNCTION public.crm_stage_history_protect_entered_at();

-- ── Índices operacionais ──
CREATE INDEX IF NOT EXISTS crm_stage_history_wa_idx
  ON public.crm_stage_history (wa_id);

CREATE INDEX IF NOT EXISTS crm_stage_history_etapa_idx
  ON public.crm_stage_history (etapa_crm, entered_at DESC);

-- ============================================================
-- ROLLBACK (executar manualmente se necessário):
-- DROP TRIGGER IF EXISTS crm_stage_history_entered_at_guard ON public.crm_stage_history;
-- DROP FUNCTION IF EXISTS public.crm_stage_history_protect_entered_at();
-- DROP TABLE IF EXISTS public.crm_stage_history;
-- ============================================================

-- ============================================================
-- MANUAL ACTION REQUIRED IN SUPABASE:
-- Execute este arquivo inteiro no Supabase SQL Editor.
-- ============================================================
