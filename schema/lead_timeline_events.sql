-- ============================================================
-- lead_timeline_events — Timeline real de eventos por lead
-- Escopo: registro imutável de eventos do atendimento por wa_id
-- Separação rígida: NÃO altera enova_state / Worker / funil
-- Rollback: DROP TABLE IF EXISTS public.lead_timeline_events;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_timeline_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wa_id       TEXT        NOT NULL,
  event_type  TEXT        NOT NULL,
  event_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  author      TEXT        NULL,
  author_type TEXT        NULL,
  summary     TEXT        NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice por wa_id: filtragem principal da timeline de um lead
CREATE INDEX IF NOT EXISTS lead_timeline_events_wa_id_idx
  ON public.lead_timeline_events (wa_id);

-- Índice por event_at DESC: ordenação cronológica da timeline
CREATE INDEX IF NOT EXISTS lead_timeline_events_event_at_idx
  ON public.lead_timeline_events (event_at DESC);

-- ============================================================
-- SUPABASE CHANGE NOTICE
-- Nova tabela criada: SIM
-- Nome: public.lead_timeline_events
-- Tipo: tabela de eventos imutáveis (append-only por design)
-- Motivo: timeline real de eventos para a futura página /atendimento/[wa_id]
-- Compatibilidade retroativa: SIM (tabela nova, sem alterar existentes)
-- Exige inclusão/manual no Supabase: SIM (executar este SQL no SQL Editor)
-- Worker alterado: NÃO
-- enova_state alterado: NÃO
-- ============================================================
