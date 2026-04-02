-- ============================================================
-- enova_incidents — Camada de telemetria / observabilidade operacional
-- Escopo: registrar falhas internas do sistema (NÃO silêncio de cliente)
-- Separação rígida: NÃO contamina enova_state / enova_attendance_meta
-- Rollback: DROP TABLE IF EXISTS public.enova_incidents;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.enova_incidents (
  incident_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id                        TEXT NOT NULL,

  -- ── Tipo / severidade / status ──
  incident_type                TEXT NOT NULL CHECK (incident_type IN (
    'WORKER_EXCEPTION',
    'FUNNEL_LOOP_DETECTED',
    'STAGE_STALL_INTERNAL',
    'MESSAGE_SEND_FAILURE',
    'PARSER_FAILURE',
    'INVALID_TRANSITION',
    'TIMEOUT',
    'PERSISTENCE_FAILURE',
    'UNKNOWN_INTERNAL_ERROR'
  )),
  incident_severity            TEXT NOT NULL CHECK (incident_severity IN (
    'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  )),
  incident_status              TEXT NOT NULL DEFAULT 'OPEN' CHECK (incident_status IN (
    'OPEN', 'ACKNOWLEDGED', 'RESOLVED'
  )),

  -- ── Contexto do erro ──
  funnel_stage_at_error        TEXT,
  base_at_error                TEXT,
  error_message_short          TEXT,
  error_message_raw            TEXT,
  suspected_trigger            TEXT,

  -- ── Rastreio / correlação ──
  request_id                   TEXT,
  trace_id                     TEXT,
  worker_env                   TEXT,

  -- ── Timestamps de contexto ──
  last_customer_message_at     TIMESTAMPTZ,
  last_enova_action_at         TIMESTAMPTZ,

  -- ── Review / resolução ──
  needs_human_review           BOOLEAN NOT NULL DEFAULT TRUE,
  resolved_at                  TIMESTAMPTZ,
  resolution_note              TEXT,

  -- ── Timestamps de registro ──
  opened_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices para consultas operacionais ──

-- Buscar incidentes abertos por wa_id
CREATE INDEX IF NOT EXISTS enova_incidents_wa_id_open_idx
  ON public.enova_incidents (wa_id, incident_status)
  WHERE incident_status = 'OPEN';

-- Buscar por tipo de incidente
CREATE INDEX IF NOT EXISTS enova_incidents_type_idx
  ON public.enova_incidents (incident_type);

-- Buscar por severidade + status (painel de incidentes)
CREATE INDEX IF NOT EXISTS enova_incidents_severity_status_idx
  ON public.enova_incidents (incident_severity, incident_status);

-- Buscar por data de abertura (timeline)
CREATE INDEX IF NOT EXISTS enova_incidents_opened_at_idx
  ON public.enova_incidents (opened_at DESC);

-- Buscar por fase do funil no momento do erro
CREATE INDEX IF NOT EXISTS enova_incidents_stage_idx
  ON public.enova_incidents (funnel_stage_at_error)
  WHERE funnel_stage_at_error IS NOT NULL;

-- ============================================================
-- SUPABASE CHANGE NOTICE
-- Nova tabela criada: SIM
-- Nome: public.enova_incidents
-- Tipo: tabela de telemetria/observabilidade operacional
-- Motivo: registrar falhas internas do sistema para aba INCIDENTES
-- Compatibilidade retroativa: SIM (tabela nova, sem alterar existentes)
-- Exige inclusão/manual no Supabase: SIM (executar este SQL no SQL Editor)
-- ============================================================
