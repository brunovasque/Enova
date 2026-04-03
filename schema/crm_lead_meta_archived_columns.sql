-- ============================================================
-- Arquivamento de Leads — Migração de Schema crm_lead_meta
-- ============================================================
-- AÇÃO MANUAL OBRIGATÓRIA NO SUPABASE SQL EDITOR
-- Rodar este script ANTES de fazer deploy do painel atualizado.
-- ============================================================
-- Adiciona 4 colunas à crm_lead_meta para suporte a arquivamento.
-- is_archived e archived_at são independentes de is_paused.
-- archive_reason_code e archive_reason_note são opcionais.
-- ============================================================

ALTER TABLE public.crm_lead_meta
  ADD COLUMN IF NOT EXISTS is_archived         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS archive_reason_note TEXT;

-- Índice para listagens eficientes por is_archived
CREATE INDEX IF NOT EXISTS crm_lead_meta_archived_idx
  ON public.crm_lead_meta (is_archived, updated_at DESC);

-- ============================================================
-- Após rodar o ALTER TABLE, atualizar também as views que
-- dependem de crm_lead_meta para expor is_archived:
--
--   1. bases_leads_v1  — add m.is_archived, m.archived_at
--      (schema/bases_leads_v1.sql atualizado — rodar também)
--
--   2. crm_leads_v1    — add m.is_archived
--      (schema/crm_leads_v1.sql atualizado — rodar também)
-- ============================================================
-- ROLLBACK:
--   DROP INDEX  IF EXISTS public.crm_lead_meta_archived_idx;
--   ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS is_archived;
--   ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS archived_at;
--   ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS archive_reason_code;
--   ALTER TABLE public.crm_lead_meta DROP COLUMN IF EXISTS archive_reason_note;
-- ============================================================
