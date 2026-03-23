# CORRESPONDENTE — CONTRATO REAL (Worker x Schema do Repo x Banco Esperado)

Escopo: **Worker-only**, fase **correspondente/docs/dossiê**.

Fontes usadas:
- `Enova worker.js` (acessos reais em runtime)
- `schema/enova_state.columns.txt` (inventário de colunas de `enova_state`)
- `schema/public_tables.txt` (existência de tabelas públicas)
- erro real informado em produção: `column enova_docs.link does not exist`

---

## Tabela 1 — enova_state (fase correspondente/docs/dossiê)

| coluna | usada no código atual | obrigatória agora | existe no repo/schema | precisa SQL agora |
|---|---|---|---|---|
| wa_id | sim | sim | sim | não |
| nome | sim | sim | sim | não |
| fase_conversa | sim | sim | sim | não |
| funil_status | sim | não | sim | não |
| updated_at | sim | sim | sim | não |
| pre_cadastro_numero | sim | sim | sim | não |
| corr_assumir_token | sim | sim | sim | não |
| corr_publicacao_status | sim | sim | sim | não |
| corr_publicado_grupo_em | sim | não | sim | não |
| corr_lock_correspondente_wa_id | sim | sim | sim | não |
| corr_lock_assumido_em | sim | sim | sim | não |
| corr_entrega_privada_status | sim | sim | sim | não |
| corr_entrega_privada_em | sim | sim | sim | não |
| processo_enviado_correspondente | sim | sim | sim | não |
| aguardando_retorno_correspondente | sim | sim | sim | não |
| dossie_resumo | sim | não | sim | não |
| retorno_correspondente_status | sim | não | sim | não |
| retorno_correspondente_motivo | sim | não | sim | não |
| retorno_correspondente_bruto | sim | não | sim | não |
| processo_pre_analise_status | sim | não | sim | não |
| corr_follow_base_at | sim | sim (follow privado) | **não** (ausente em `enova_state.columns.txt`) | **sim (recomendado)** |
| corr_follow_next_at | sim | sim (follow privado) | **não** (ausente em `enova_state.columns.txt`) | **sim (recomendado)** |
| pacote_documentos_anexados_json | sim | não (há fallback por itens/histórico) | **não** (ausente em `enova_state.columns.txt`) | não |
| envio_docs_itens_json | sim | não (há fallback parcial) | **não** (ausente em `enova_state.columns.txt`) | não |
| envio_docs_historico_json | sim | não (há fallback sem histórico) | **não** (ausente em `enova_state.columns.txt`) | não |

Notas objetivas:
- Os cinco campos acima ausentes no inventário local e usados pelo Worker atual são:
  `corr_follow_base_at`, `corr_follow_next_at`, `pacote_documentos_anexados_json`, `envio_docs_itens_json`, `envio_docs_historico_json`.
- Para disponibilidade imediata da rota de correspondente, os dois campos de follow (`corr_follow_*`) são os únicos desse bloco que influenciam operação de follow/entrega após assunção.

---

## Tabela 2 — enova_docs (fase correspondente/docs/dossiê)

| coluna | usada no código atual | obrigatória agora | existe no repo/schema | precisa SQL agora |
|---|---|---|---|---|
| wa_id | sim (filtro query) | sim | **não comprovado** (repo não inventaria colunas de `enova_docs`) | não |
| created_at | sim (order query) | sim | **não comprovado** | não |
| tipo | sim (montagem de resumo/links) | não | **não comprovado** | não |
| participante | sim (montagem de resumo/links) | não | **não comprovado** | não |
| status | sim (filtro de recebido/pendente) | não | **não comprovado** | não |
| url | sim (fonte principal de link) | não (rota continua sem link) | **não comprovado** | não |
| document_url | sim (fallback de link) | não | **não comprovado** | não |
| download_url | sim (fallback de link) | não | **não comprovado** | não |
| media_url | sim (fallback de link) | não | **não comprovado** | não |
| link | sim (leitura opcional em objeto) | **não** | **não** (erro real: coluna inexistente no banco real) | **não** |

Notas objetivas:
- Após patch, o Worker **não exige mais** a coluna `link` na projeção SQL.
- Ausência de URL por documento individual já é tratada por fallback textual (`link não disponível`), sem derrubar a rota.

---

## Fechamento explícito dos 6 campos suspeitos

| campo | usado no código atual | obrigatório agora | existe no contrato/schema do repo | precisa migration SQL agora |
|---|---|---|---|---|
| corr_follow_base_at (enova_state) | sim | sim | não (inventário local) | não para destravar, **sim recomendado para alinhamento** |
| corr_follow_next_at (enova_state) | sim | sim | não (inventário local) | não para destravar, **sim recomendado para alinhamento** |
| pacote_documentos_anexados_json (enova_state) | sim | não | não (inventário local) | não |
| envio_docs_itens_json (enova_state) | sim | não | não (inventário local) | não |
| envio_docs_historico_json (enova_state) | sim | não | não (inventário local) | não |
| link (enova_docs) | sim (fallback de objeto), **não em query rígida** | não | não (banco real) | não |

---

## SQL A — mínimo para destravar produção agora

Sem migration obrigatória para destravar a rota do correspondente, porque o Worker já foi ajustado para não exigir `enova_docs.link` na query.

```sql
-- SQL A (mínimo): não há ação obrigatória imediata para destravar
-- produção no erro reportado de enova_docs.link.
-- O fix está no código do Worker (query resiliente + fallback seguro).
```

---

## SQL B — recomendado para alinhar schema com o código atual

```sql
-- SQL B (recomendado): alinhar enova_state com campos usados no Worker
-- na fase correspondente/follow.
ALTER TABLE public.enova_state
  ADD COLUMN IF NOT EXISTS corr_follow_base_at timestamptz,
  ADD COLUMN IF NOT EXISTS corr_follow_next_at timestamptz;

-- Opcional de performance para job de follow (somente se necessário):
CREATE INDEX IF NOT EXISTS enova_state_corr_follow_next_at_idx
  ON public.enova_state (corr_follow_next_at);
```

---

## SQL C — opcional / não mexer agora

```sql
-- SQL C: não obrigatório para disponibilidade imediata.
-- Campos documentais em enova_state usados com fallback no Worker.
ALTER TABLE public.enova_state
  ADD COLUMN IF NOT EXISTS pacote_documentos_anexados_json jsonb,
  ADD COLUMN IF NOT EXISTS envio_docs_itens_json jsonb,
  ADD COLUMN IF NOT EXISTS envio_docs_historico_json jsonb;

-- NÃO recomendado agora:
-- adicionar coluna enova_docs.link só para compatibilidade legado.
-- O Worker já não depende dessa coluna na query.
```

---

## Outras faltas obrigatórias encontradas nesta fase

- **Nenhuma tabela obrigatória nova faltante** além de `enova_state`/`enova_docs` já existentes em `schema/public_tables.txt`.
- **Sem outra coluna obrigatória de corte imediato** para destravar a rota agora, além do já corrigido `enova_docs.link` no código.
