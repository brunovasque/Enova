-- ============================================================
-- enova_prefill_meta — Camada de pré-preenchimento administrativo
-- Escopo: dados inseridos manualmente por admin antes ou durante o atendimento
-- REGRA CANÔNICA: todo valor aqui é pré-dado, não validado, sujeito a confirmação pelo cliente
-- Separação rígida: NÃO é enova_state; NÃO é dado confirmado pelo funil
-- Worker pode ler (somente leitura); NUNCA deve assumir como verdade final sem confirmação do cliente
-- Rollback: DROP TABLE IF EXISTS public.enova_prefill_meta;
-- ============================================================

-- Status possíveis por campo
-- empty                       → campo não preenchido
-- prefilled_pending_confirmation → admin preencheu, cliente ainda não confirmou
-- confirmed                   → cliente confirmou via funil (worker fez match)
-- divergent                   → valor confirmado pelo cliente difere do prefill admin

CREATE TABLE IF NOT EXISTS public.enova_prefill_meta (
  wa_id                              TEXT PRIMARY KEY,

  -- ── nome ──
  nome_prefill                       TEXT,
  nome_source                        TEXT DEFAULT 'manual',
  nome_status                        TEXT DEFAULT 'empty' CHECK (nome_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── nacionalidade ──
  nacionalidade_prefill              TEXT,
  nacionalidade_source               TEXT DEFAULT 'manual',
  nacionalidade_status               TEXT DEFAULT 'empty' CHECK (nacionalidade_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── estado_civil ──
  estado_civil_prefill               TEXT,
  estado_civil_source                TEXT DEFAULT 'manual',
  estado_civil_status                TEXT DEFAULT 'empty' CHECK (estado_civil_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── regime_trabalho ──
  regime_trabalho_prefill            TEXT,
  regime_trabalho_source             TEXT DEFAULT 'manual',
  regime_trabalho_status             TEXT DEFAULT 'empty' CHECK (regime_trabalho_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── renda (valor numérico) ──
  renda_prefill                      NUMERIC,
  renda_source                       TEXT DEFAULT 'manual',
  renda_status                       TEXT DEFAULT 'empty' CHECK (renda_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── 36_meses (equivale a ctps_36 no enova_state) ──
  meses_36_prefill                   BOOLEAN,
  meses_36_source                    TEXT DEFAULT 'manual',
  meses_36_status                    TEXT DEFAULT 'empty' CHECK (meses_36_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── dependentes ──
  dependentes_prefill                INTEGER,
  dependentes_source                 TEXT DEFAULT 'manual',
  dependentes_status                 TEXT DEFAULT 'empty' CHECK (dependentes_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── valor_entrada ──
  valor_entrada_prefill              NUMERIC,
  valor_entrada_source               TEXT DEFAULT 'manual',
  valor_entrada_status               TEXT DEFAULT 'empty' CHECK (valor_entrada_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── restricao ──
  restricao_prefill                  BOOLEAN,
  restricao_source                   TEXT DEFAULT 'manual',
  restricao_status                   TEXT DEFAULT 'empty' CHECK (restricao_status IN (
    'empty', 'prefilled_pending_confirmation', 'confirmed', 'divergent'
  )),

  -- ── origem_lead (admin-only, sem confirmação) ──
  origem_lead                        TEXT,

  -- ── detalhamento de campanha (admin-only, preenchido quando origem_lead = 'campanha') ──
  campaign_platform                  TEXT,
  campaign_name                      TEXT,
  campaign_adset                     TEXT,
  campaign_ad                        TEXT,

  -- ── observacoes_admin (admin-only, sem confirmação) ──
  observacoes_admin                  TEXT,

  -- ── Auditoria ──
  updated_by                         TEXT,
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para busca por wa_id (já é PK, mas documentado)
-- Índice extra não necessário além da PK para MVP

-- ============================================================
-- ROLLBACK:
-- DROP TABLE IF EXISTS public.enova_prefill_meta;
--
-- Para aplicar no Supabase SQL Editor:
-- 1. Executar este arquivo inteiro no SQL Editor
-- 2. Não há dependências com outras tabelas (sem FK obrigatória)
--
-- MAPEAMENTO DE LEITURA/ESCRITA:
-- Lê: enova_prefill_meta (todos os campos)
-- Escreve: enova_prefill_meta (todos os campos via upsert)
-- Não toca: enova_state, enova_attendance_meta, crm_lead_meta
--
-- NOVA TABELA: sim — enova_prefill_meta
-- AÇÃO MANUAL NO SUPABASE: sim — executar este SQL no editor
--
-- REGRA DE NÃO-USO AUTOMÁTICO:
-- O worker pode ler esta tabela via getPrefillMeta().
-- Nenhum valor desta tabela deve ser usado para avançar stage,
-- mudar nextStage, ou assumir dado como confirmado sem interação do cliente.
-- ============================================================
