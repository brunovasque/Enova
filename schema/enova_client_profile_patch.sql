-- ============================================================
-- enova_client_profile_patch — Metadados de origem por campo de perfil
-- Escopo: adiciona {campo}_updated_at a enova_prefill_meta para rastreamento
--         discreto de quando e por quem cada campo de perfil foi atualizado.
--
-- REGRA CANÔNICA pós-patch:
--   - enova_state.{campo} = valor operacional único (funil + admin escrevem aqui)
--   - enova_prefill_meta.{campo}_source = quem atualizou por último
--     ('admin' | 'admin_inicial' | 'funil' | 'manual')
--   - enova_prefill_meta.{campo}_updated_at = quando foi atualizado por último
--   - enova_prefill_meta.{campo}_prefill = NÃO mais usado como valor canônico
--     (mantido para compatibilidade retroativa, porém ignorado pela UI nova)
--
-- Rollback: ver bloco ROLLBACK abaixo
-- ============================================================

ALTER TABLE public.enova_prefill_meta
  ADD COLUMN IF NOT EXISTS nome_updated_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nacionalidade_updated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estado_civil_updated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS regime_trabalho_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renda_updated_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meses_36_updated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dependentes_updated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_entrada_updated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restricao_updated_at         TIMESTAMPTZ;

-- ============================================================
-- ROLLBACK:
-- ALTER TABLE public.enova_prefill_meta
--   DROP COLUMN IF EXISTS nome_updated_at,
--   DROP COLUMN IF EXISTS nacionalidade_updated_at,
--   DROP COLUMN IF EXISTS estado_civil_updated_at,
--   DROP COLUMN IF EXISTS regime_trabalho_updated_at,
--   DROP COLUMN IF EXISTS renda_updated_at,
--   DROP COLUMN IF EXISTS meses_36_updated_at,
--   DROP COLUMN IF EXISTS dependentes_updated_at,
--   DROP COLUMN IF EXISTS valor_entrada_updated_at,
--   DROP COLUMN IF EXISTS restricao_updated_at;
--
-- SUPABASE CHANGE NOTICE
-- Nova coluna criada: SIM (9 colunas)
-- Tabela: public.enova_prefill_meta
-- Colunas: nome_updated_at, nacionalidade_updated_at, estado_civil_updated_at,
--   regime_trabalho_updated_at, renda_updated_at, meses_36_updated_at,
--   dependentes_updated_at, valor_entrada_updated_at, restricao_updated_at
-- Tipo: TIMESTAMPTZ nullable
-- Motivo: rastreamento discreto de última atualização por campo de perfil
-- Compatibilidade retroativa: SIM (colunas novas, nullable, sem breaking change)
-- Exige inclusão/manual no Supabase: SIM — executar este SQL no SQL Editor
-- ============================================================
