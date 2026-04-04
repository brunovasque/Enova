-- ============================================================
-- enova_attendance_meta — Camada operacional da aba ATENDIMENTO
-- Escopo: pré-envio_docs, visão operacional 1:1 por wa_id
-- Separação rígida: NÃO contamina enova_state / trilho mecânico
-- Rollback: DROP TABLE IF EXISTS public.enova_attendance_meta;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.enova_attendance_meta (
  wa_id                        TEXT PRIMARY KEY,

  -- ── Fase / travamento ──
  current_funnel_stage         TEXT,
  stalled_stage                TEXT,
  stalled_reason_code          TEXT CHECK (stalled_reason_code IN (
    'NO_REPLY',
    'AMBIGUOUS_ANSWER',
    'MISSING_REQUIRED_DATA',
    'WAITING_ENOVA_ACTION',
    'WAITING_HUMAN_ACTION',
    'WAITING_SYSTEM_PROCESS',
    'INTERNAL_INCIDENT_OPEN'
  )),
  stalled_reason_label         TEXT,
  stalled_at                   TIMESTAMPTZ,

  -- ── Dono da pendência ──
  pending_owner                TEXT CHECK (pending_owner IN (
    'CLIENTE',
    'ENOVA',
    'HUMANO',
    'SISTEMA'
  )),
  main_pending_code            TEXT,
  main_pending_label           TEXT,

  -- ── Próxima ação ENOVA ──
  enova_next_action_code       TEXT,
  enova_next_action_label      TEXT,
  enova_next_action_trigger    TEXT,
  enova_next_action_due_at     TIMESTAMPTZ,
  enova_next_action_executable BOOLEAN DEFAULT FALSE,

  -- ── Status de atenção ──
  attention_status             TEXT CHECK (attention_status IN (
    'ON_TIME',
    'DUE_SOON',
    'OVERDUE'
  )),

  -- ── Origem / base ──
  origin_base                  TEXT,
  current_base                 TEXT,
  moved_to_current_base_at     TIMESTAMPTZ,
  moved_to_current_stage_at    TIMESTAMPTZ,

  -- ── Timestamps operacionais ──
  last_customer_interaction_at TIMESTAMPTZ,
  last_enova_interaction_at    TIMESTAMPTZ,

  -- ── Resumo curto ──
  enova_summary_short          TEXT,

  -- ── Incidentes (preparatório) ──
  has_open_incident            BOOLEAN DEFAULT FALSE,
  open_incident_type           TEXT,
  open_incident_severity       TEXT CHECK (open_incident_severity IN (
    'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  )),

  -- ── Arquivamento ──
  archived_at                  TIMESTAMPTZ,
  archive_reason_code          TEXT,
  archive_reason_note          TEXT,

  -- ── Campos operacionais humanos (fase 2 — página de atendimento) ──
  responsavel                  TEXT NULL,
  objecao_principal            TEXT NULL,
  interesse_atual              TEXT NULL,
  momento_do_cliente           TEXT NULL,
  quick_note                   TEXT NULL,
  human_next_action            TEXT NULL,

  -- ── Timestamps de registro ──
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas operacionais do painel
CREATE INDEX IF NOT EXISTS enova_attendance_meta_stage_idx
  ON public.enova_attendance_meta (current_funnel_stage);

CREATE INDEX IF NOT EXISTS enova_attendance_meta_attention_idx
  ON public.enova_attendance_meta (attention_status, pending_owner);

CREATE INDEX IF NOT EXISTS enova_attendance_meta_stalled_idx
  ON public.enova_attendance_meta (stalled_reason_code)
  WHERE stalled_reason_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS enova_attendance_meta_archived_idx
  ON public.enova_attendance_meta (archived_at)
  WHERE archived_at IS NULL;

-- ============================================================
-- SUPABASE CHANGE NOTICE
-- Nova tabela criada: SIM
-- Nome: public.enova_attendance_meta
-- Tipo: tabela operacional 1:1 por wa_id
-- Motivo: camada operacional da aba ATENDIMENTO (pré-envio_docs)
-- Compatibilidade retroativa: SIM (tabela nova, sem alterar existentes)
-- Exige inclusão/manual no Supabase: SIM (executar este SQL no SQL Editor)
-- ============================================================

-- Se a tabela já existir, adicionar as novas colunas manualmente:
-- ALTER TABLE public.enova_attendance_meta ADD COLUMN IF NOT EXISTS responsavel TEXT NULL;
-- ALTER TABLE public.enova_attendance_meta ADD COLUMN IF NOT EXISTS objecao_principal TEXT NULL;
-- ALTER TABLE public.enova_attendance_meta ADD COLUMN IF NOT EXISTS interesse_atual TEXT NULL;
-- ALTER TABLE public.enova_attendance_meta ADD COLUMN IF NOT EXISTS momento_do_cliente TEXT NULL;
-- ALTER TABLE public.enova_attendance_meta ADD COLUMN IF NOT EXISTS quick_note TEXT NULL;
-- ALTER TABLE public.enova_attendance_meta ADD COLUMN IF NOT EXISTS human_next_action TEXT NULL;
