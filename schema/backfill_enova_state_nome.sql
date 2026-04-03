-- ============================================================
-- BACKFILL: Sincronizar nome de crm_lead_meta → enova_state
-- ============================================================
-- Contexto:
--   Leads adicionados manualmente ANTES da PR #483 têm nome em
--   crm_lead_meta mas enova_state.nome = NULL. A view
--   enova_attendance_v1 lê e.nome de enova_state, então esses
--   leads aparecem sem nome no painel de Atendimento.
--
-- Regra obrigatória (idêntica ao comportamento de add_lead_manual):
--   Sincroniza nome SOMENTE quando:
--     1. crm_lead_meta.nome está preenchido (não nulo, não vazio/whitespace)
--     2. enova_state.nome está nulo, vazio ou é só whitespace
--
--   NÃO sobrescreve nomes já existentes em enova_state.
--   NÃO toca outros campos além de nome.
--   Idempotente: pode ser executado múltiplas vezes com segurança.
--
-- Pré-requisito: executar schema/enova_attendance_v1.sql antes (view já deve existir).
-- Rollback: ver seção ROLLBACK ao final deste arquivo.
-- ============================================================

BEGIN;

-- ── DRY-RUN (opcional): descomentar para ver quantos registros serão afetados
-- SELECT
--   e.wa_id,
--   m.nome   AS nome_meta,
--   e.nome   AS nome_state_atual
-- FROM   public.enova_state e
-- JOIN   public.crm_lead_meta m ON m.wa_id = e.wa_id
-- WHERE  m.nome  IS NOT NULL
--   AND  trim(m.nome) <> ''
--   AND  (e.nome IS NULL OR trim(e.nome) = '');

UPDATE public.enova_state e
SET    nome = m.nome
FROM   public.crm_lead_meta m
WHERE  e.wa_id = m.wa_id
  AND  m.nome  IS NOT NULL
  AND  trim(m.nome) <> ''
  AND  (e.nome IS NULL OR trim(e.nome) = '');

-- Conferir resultado antes de confirmar:
-- SELECT COUNT(*) FROM public.enova_state WHERE nome IS NOT NULL;

COMMIT;

-- ============================================================
-- ROLLBACK (caso precise desfazer após COMMIT):
--
-- Não há rollback automático após COMMIT. Estratégia recomendada:
--
-- 1. Antes de executar este backfill, tire um snapshot:
--    CREATE TABLE enova_state_nome_backup_pre_backfill AS
--    SELECT wa_id, nome FROM public.enova_state;
--
-- 2. Para reverter (somente os registros que foram backfillados):
--    UPDATE public.enova_state e
--    SET    nome = bkp.nome
--    FROM   enova_state_nome_backup_pre_backfill bkp
--    WHERE  e.wa_id = bkp.wa_id;
--
--    DROP TABLE enova_state_nome_backup_pre_backfill;
--
-- Se não tiver snapshot, o único rollback seguro é restaurar
-- backup completo do banco.
-- ============================================================
