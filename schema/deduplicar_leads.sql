-- ============================================================
-- deduplicar_leads.sql — Diagnóstico e deduplicação de leads por número
-- Tabela-alvo: public.crm_lead_meta (wa_id = PRIMARY KEY)
--
-- Contexto: crm_lead_meta usa wa_id como chave primária.
-- normalizePhoneToWaId() garante que entradas novas via modal já chegam
-- normalizadas (e.g. 5541987654321). Registros históricos podem ter wa_id
-- sem o prefixo "55" (ex.: 41987654321 em vez de 5541987654321).
-- Esse script identifica pares onde ambas as formas existem simultaneamente.
--
-- ROLLBACK: nenhuma ALTER/DROP executado aqui — somente DELETE/UPDATE.
-- Para reverter: restaurar backup ou reinserir as linhas deletadas.
-- ============================================================

-- ── FUNÇÃO AUXILIAR DE NORMALIZAÇÃO ──
-- Equivalente JavaScript de normalizePhoneToWaId():
--   strip non-digits → se 12-13 dígitos começando com 55, mantém
--                     → se 10-11 dígitos, prepend '55'
--                     → se ≥ 7 dígitos, mantém como está
CREATE OR REPLACE FUNCTION _enova_normalize_phone(raw text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  IF digits = '' OR digits IS NULL THEN RETURN NULL; END IF;
  IF (length(digits) = 12 OR length(digits) = 13) AND digits LIKE '55%' THEN
    RETURN digits;
  END IF;
  IF length(digits) >= 10 AND length(digits) <= 11 THEN
    RETURN '55' || digits;
  END IF;
  IF length(digits) >= 7 THEN RETURN digits; END IF;
  RETURN NULL;
END;
$$;

-- ============================================================
-- PASSO 1 — DIAGNÓSTICO READ-ONLY
-- Listar grupos com mais de 1 wa_id que normaliza para o mesmo número.
-- Execute isso primeiro; zero linhas = nenhuma deduplicação necessária.
-- ============================================================

SELECT
  _enova_normalize_phone(wa_id)                   AS numero_normalizado,
  count(*)                                          AS total_duplicatas,
  array_agg(wa_id ORDER BY created_at ASC)         AS wa_ids,
  array_agg(nome ORDER BY created_at ASC)          AS nomes,
  array_agg(telefone ORDER BY created_at ASC)      AS telefones,
  array_agg(created_at ORDER BY created_at ASC)    AS datas_criacao,
  array_agg(lead_source ORDER BY created_at ASC)   AS origens,
  array_agg(obs_curta ORDER BY created_at ASC)     AS observacoes
FROM public.crm_lead_meta
WHERE _enova_normalize_phone(wa_id) IS NOT NULL
GROUP BY _enova_normalize_phone(wa_id)
HAVING count(*) > 1
ORDER BY total_duplicatas DESC, numero_normalizado;

-- ============================================================
-- PASSO 2 — IDENTIFICAR LEAD MESTRE por grupo duplicado
-- Critério (em ordem de prioridade):
--   1. maior completude (campos não-nulos: nome, telefone, lead_source, obs_curta)
--   2. obs_curta preenchida
--   3. lead_source preenchida
--   4. o mais antigo (created_at ASC)
-- ============================================================

WITH
  normalized_groups AS (
    SELECT
      wa_id,
      _enova_normalize_phone(wa_id) AS numero_normalizado,
      nome,
      telefone,
      lead_source,
      obs_curta,
      created_at,
      updated_at,
      -- completude: soma de campos preenchidos
      (CASE WHEN nome       IS NOT NULL AND nome       <> '' THEN 1 ELSE 0 END +
       CASE WHEN telefone   IS NOT NULL AND telefone   <> '' THEN 1 ELSE 0 END +
       CASE WHEN lead_source IS NOT NULL AND lead_source <> '' THEN 1 ELSE 0 END +
       CASE WHEN obs_curta  IS NOT NULL AND obs_curta  <> '' THEN 1 ELSE 0 END)
        AS completude
    FROM public.crm_lead_meta
    WHERE _enova_normalize_phone(wa_id) IN (
      SELECT _enova_normalize_phone(wa_id)
      FROM public.crm_lead_meta
      GROUP BY _enova_normalize_phone(wa_id)
      HAVING count(*) > 1
    )
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY numero_normalizado
        ORDER BY
          completude DESC,
          (obs_curta IS NOT NULL AND obs_curta <> '') DESC,
          (lead_source IS NOT NULL AND lead_source <> '') DESC,
          created_at ASC
      ) AS rn
    FROM normalized_groups
  )
SELECT
  numero_normalizado,
  wa_id,
  rn,
  CASE WHEN rn = 1 THEN 'MESTRE' ELSE 'DUPLICADO' END AS papel,
  nome,
  telefone,
  lead_source,
  obs_curta,
  completude,
  created_at
FROM ranked
ORDER BY numero_normalizado, rn;

-- ============================================================
-- PASSO 3 — CONSOLIDAÇÃO: atualizar MESTRE com dados dos duplicados
-- (preservar o melhor de cada campo antes de deletar os duplicados)
-- Execute APÓS revisar o diagnóstico acima.
-- ============================================================

WITH
  normalized_groups AS (
    SELECT
      wa_id,
      _enova_normalize_phone(wa_id) AS numero_normalizado,
      nome, telefone, lead_source, obs_curta, created_at,
      (CASE WHEN nome        IS NOT NULL AND nome        <> '' THEN 1 ELSE 0 END +
       CASE WHEN telefone    IS NOT NULL AND telefone    <> '' THEN 1 ELSE 0 END +
       CASE WHEN lead_source IS NOT NULL AND lead_source <> '' THEN 1 ELSE 0 END +
       CASE WHEN obs_curta   IS NOT NULL AND obs_curta   <> '' THEN 1 ELSE 0 END)
        AS completude
    FROM public.crm_lead_meta
    WHERE _enova_normalize_phone(wa_id) IN (
      SELECT _enova_normalize_phone(wa_id)
      FROM public.crm_lead_meta
      GROUP BY _enova_normalize_phone(wa_id)
      HAVING count(*) > 1
    )
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY numero_normalizado
        ORDER BY completude DESC,
          (obs_curta IS NOT NULL AND obs_curta <> '') DESC,
          (lead_source IS NOT NULL AND lead_source <> '') DESC,
          created_at ASC
      ) AS rn
    FROM normalized_groups
  ),
  masters AS (SELECT * FROM ranked WHERE rn = 1),
  -- best non-null value per group for each field
  best_nome AS (
    SELECT numero_normalizado, (array_agg(nome ORDER BY completude DESC, created_at ASC)
      FILTER (WHERE nome IS NOT NULL AND nome <> ''))[1] AS best_nome
    FROM normalized_groups GROUP BY numero_normalizado
  ),
  best_telefone AS (
    SELECT numero_normalizado, (array_agg(telefone ORDER BY completude DESC, created_at ASC)
      FILTER (WHERE telefone IS NOT NULL AND telefone <> ''))[1] AS best_telefone
    FROM normalized_groups GROUP BY numero_normalizado
  ),
  best_lead_source AS (
    SELECT numero_normalizado, (array_agg(lead_source ORDER BY completude DESC, created_at ASC)
      FILTER (WHERE lead_source IS NOT NULL AND lead_source <> ''))[1] AS best_lead_source
    FROM normalized_groups GROUP BY numero_normalizado
  ),
  best_obs AS (
    SELECT numero_normalizado, (array_agg(obs_curta ORDER BY completude DESC, created_at ASC)
      FILTER (WHERE obs_curta IS NOT NULL AND obs_curta <> ''))[1] AS best_obs
    FROM normalized_groups GROUP BY numero_normalizado
  )
UPDATE public.crm_lead_meta AS m
SET
  nome        = COALESCE(m.nome,        bn.best_nome),
  telefone    = COALESCE(m.telefone,    bt.best_telefone),
  lead_source = COALESCE(m.lead_source, bs.best_lead_source),
  obs_curta   = COALESCE(m.obs_curta,   bo.best_obs),
  wa_id       = masters.numero_normalizado,   -- normalize wa_id to canonical form
  updated_at  = now()
FROM masters
JOIN best_nome    bn ON bn.numero_normalizado = masters.numero_normalizado
JOIN best_telefone bt ON bt.numero_normalizado = masters.numero_normalizado
JOIN best_lead_source bs ON bs.numero_normalizado = masters.numero_normalizado
JOIN best_obs     bo ON bo.numero_normalizado = masters.numero_normalizado
WHERE m.wa_id = masters.wa_id;

-- ============================================================
-- PASSO 4 — DELETAR os duplicados (não-mestres) por grupo
-- ATENÇÃO: execute somente após confirmar PASSO 3 com sucesso.
-- Verificar se há referências em outras tabelas antes de deletar:
--   - enova_state (wa_id) → se há referência, o lead existe lá também
--   - enova_attendance_meta (wa_id) → incidentes
--   - crm_override_log (wa_id) → histórico de override
--   - crm_stage_history (wa_id) → histórico de etapas
-- Se existirem referências, NÃO deletar — marcar como is_archived=true.
-- ============================================================

-- [SEGURANÇA] Verificar referências antes do delete:
SELECT
  r.wa_id,
  _enova_normalize_phone(r.wa_id) AS numero_normalizado,
  (SELECT count(*) FROM public.enova_state          WHERE wa_id = r.wa_id) AS refs_enova_state,
  (SELECT count(*) FROM public.enova_attendance_meta WHERE wa_id = r.wa_id) AS refs_atendimento,
  (SELECT count(*) FROM public.crm_override_log     WHERE wa_id = r.wa_id) AS refs_override_log,
  (SELECT count(*) FROM public.crm_stage_history    WHERE wa_id = r.wa_id) AS refs_stage_history
FROM (
  SELECT wa_id FROM (
    SELECT
      wa_id,
      _enova_normalize_phone(wa_id) AS numero_normalizado,
      (CASE WHEN nome IS NOT NULL AND nome <> '' THEN 1 ELSE 0 END +
       CASE WHEN telefone IS NOT NULL AND telefone <> '' THEN 1 ELSE 0 END +
       CASE WHEN lead_source IS NOT NULL AND lead_source <> '' THEN 1 ELSE 0 END +
       CASE WHEN obs_curta IS NOT NULL AND obs_curta <> '' THEN 1 ELSE 0 END) AS completude,
      created_at,
      obs_curta,
      lead_source,
      ROW_NUMBER() OVER (
        PARTITION BY _enova_normalize_phone(wa_id)
        ORDER BY
          (CASE WHEN nome IS NOT NULL AND nome <> '' THEN 1 ELSE 0 END +
           CASE WHEN telefone IS NOT NULL AND telefone <> '' THEN 1 ELSE 0 END +
           CASE WHEN lead_source IS NOT NULL AND lead_source <> '' THEN 1 ELSE 0 END +
           CASE WHEN obs_curta IS NOT NULL AND obs_curta <> '' THEN 1 ELSE 0 END) DESC,
          (obs_curta IS NOT NULL AND obs_curta <> '') DESC,
          (lead_source IS NOT NULL AND lead_source <> '') DESC,
          created_at ASC
      ) AS rn
    FROM public.crm_lead_meta
    WHERE _enova_normalize_phone(wa_id) IN (
      SELECT _enova_normalize_phone(wa_id)
      FROM public.crm_lead_meta
      GROUP BY _enova_normalize_phone(wa_id)
      HAVING count(*) > 1
    )
  ) ranked
  WHERE rn > 1   -- somente duplicados (não-mestres)
) r
ORDER BY numero_normalizado;

-- ============================================================
-- OPÇÃO A — DELETAR (somente se refs_* = 0 para todas as tabelas acima)
-- ============================================================

/*
DELETE FROM public.crm_lead_meta
WHERE wa_id IN (
  SELECT wa_id FROM (
    SELECT
      wa_id,
      _enova_normalize_phone(wa_id) AS numero_normalizado,
      ROW_NUMBER() OVER (
        PARTITION BY _enova_normalize_phone(wa_id)
        ORDER BY
          (CASE WHEN nome IS NOT NULL AND nome <> '' THEN 1 ELSE 0 END +
           CASE WHEN telefone IS NOT NULL AND telefone <> '' THEN 1 ELSE 0 END +
           CASE WHEN lead_source IS NOT NULL AND lead_source <> '' THEN 1 ELSE 0 END +
           CASE WHEN obs_curta IS NOT NULL AND obs_curta <> '' THEN 1 ELSE 0 END) DESC,
          (obs_curta IS NOT NULL AND obs_curta <> '') DESC,
          (lead_source IS NOT NULL AND lead_source <> '') DESC,
          created_at ASC
      ) AS rn
    FROM public.crm_lead_meta
    WHERE _enova_normalize_phone(wa_id) IN (
      SELECT _enova_normalize_phone(wa_id)
      FROM public.crm_lead_meta
      GROUP BY _enova_normalize_phone(wa_id)
      HAVING count(*) > 1
    )
  ) ranked
  WHERE rn > 1
);
*/

-- ============================================================
-- OPÇÃO B — ARQUIVAR (seguro quando há referências em outras tabelas)
-- Marca os duplicados como is_archived=true sem apagar dados.
-- ============================================================

/*
UPDATE public.crm_lead_meta
SET
  is_archived         = true,
  archived_at         = now(),
  archive_reason_code = 'DEDUP_MERGED',
  archive_reason_note = 'Lead duplicado por número. Mantido em lead mestre.',
  updated_at          = now()
WHERE wa_id IN (
  SELECT wa_id FROM (
    SELECT
      wa_id,
      ROW_NUMBER() OVER (
        PARTITION BY _enova_normalize_phone(wa_id)
        ORDER BY
          (CASE WHEN nome IS NOT NULL AND nome <> '' THEN 1 ELSE 0 END +
           CASE WHEN telefone IS NOT NULL AND telefone <> '' THEN 1 ELSE 0 END +
           CASE WHEN lead_source IS NOT NULL AND lead_source <> '' THEN 1 ELSE 0 END +
           CASE WHEN obs_curta IS NOT NULL AND obs_curta <> '' THEN 1 ELSE 0 END) DESC,
          (obs_curta IS NOT NULL AND obs_curta <> '') DESC,
          (lead_source IS NOT NULL AND lead_source <> '') DESC,
          created_at ASC
      ) AS rn
    FROM public.crm_lead_meta
    WHERE _enova_normalize_phone(wa_id) IN (
      SELECT _enova_normalize_phone(wa_id)
      FROM public.crm_lead_meta
      GROUP BY _enova_normalize_phone(wa_id)
      HAVING count(*) > 1
    )
  ) ranked
  WHERE rn > 1
);
*/

-- ============================================================
-- PASSO 5 — VERIFICAÇÃO PÓS-DEDUPLICAÇÃO
-- Deve retornar zero linhas.
-- ============================================================

SELECT
  _enova_normalize_phone(wa_id) AS numero_normalizado,
  count(*) AS total
FROM public.crm_lead_meta
WHERE NOT is_archived   -- se usou OPÇÃO B, duplicados arquivados não contam
GROUP BY _enova_normalize_phone(wa_id)
HAVING count(*) > 1;

-- ============================================================
-- ROLLBACK (se necessário):
-- DROP FUNCTION IF EXISTS _enova_normalize_phone(text);
-- Restaurar linhas deletadas a partir de backup do Supabase.
-- ============================================================
