-- ============================================================
-- Migration: adicionar campos de detalhamento de campanha em enova_prefill_meta
-- Scope: enova_prefill_meta — colunas admin-only, nullable, sem FK
-- Compatibilidade retroativa: sim — colunas nullable, registros antigos ficam com NULL
-- Ação manual no Supabase: executar este arquivo no SQL Editor
-- Rollback: ver seção ROLLBACK abaixo
-- ============================================================

-- Adiciona campo: plataforma de mídia da campanha (ex: Facebook, Instagram, Google)
ALTER TABLE public.enova_prefill_meta
  ADD COLUMN IF NOT EXISTS campaign_platform TEXT;

-- Adiciona campo: nome da campanha
ALTER TABLE public.enova_prefill_meta
  ADD COLUMN IF NOT EXISTS campaign_name TEXT;

-- Adiciona campo: nome do conjunto de anúncios (adset)
ALTER TABLE public.enova_prefill_meta
  ADD COLUMN IF NOT EXISTS campaign_adset TEXT;

-- Adiciona campo: nome/identificador do anúncio (ad)
ALTER TABLE public.enova_prefill_meta
  ADD COLUMN IF NOT EXISTS campaign_ad TEXT;

-- ============================================================
-- ROLLBACK:
--   ALTER TABLE public.enova_prefill_meta DROP COLUMN IF EXISTS campaign_platform;
--   ALTER TABLE public.enova_prefill_meta DROP COLUMN IF EXISTS campaign_name;
--   ALTER TABLE public.enova_prefill_meta DROP COLUMN IF EXISTS campaign_adset;
--   ALTER TABLE public.enova_prefill_meta DROP COLUMN IF EXISTS campaign_ad;
--
-- MAPEAMENTO DE LEITURA/ESCRITA:
-- Lê: enova_prefill_meta (via getPrefillMeta / getClientProfile)
-- Escreve: enova_prefill_meta (via writeClientProfile / upsertPrefillMeta)
-- Não toca: enova_state, enova_attendance_meta, crm_lead_meta
--
-- NOVA TABELA: não
-- NOVAS COLUNAS: sim — 4 colunas em enova_prefill_meta
-- AÇÃO MANUAL NO SUPABASE: sim — executar este SQL no editor
-- ============================================================
