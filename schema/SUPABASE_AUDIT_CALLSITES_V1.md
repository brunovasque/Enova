# SUPABASE_AUDIT_CALLSITES_V1

Escopo: **Worker-only** (`Enova worker.js`), sem mudanças de runtime.

## Inventário completo de call-sites Supabase no Worker

### A) Call-sites via `sbFetch(...)`

| Função (Worker) | Linha | Tabela | Path atual | Formato de query | Status |
|---|---:|---|---|---|---|
| `logger(env, data)` | 350 | `enova_log` | `/rest/v1/enova_log` | sem query | **OK** |
| `getState(env, wa_id)` | 385 | `enova_state` | `/rest/v1/enova_state` | **objeto** (`query: { select, wa_id }`) | **OK** |
| `saveDocumentStatus(env, st, status)` | 3035 | `enova_docs_status` | `/rest/v1/enova_docs_status` | sem query | **OK** |
| `updateDocsStatusV2(env, st)` | 3067 | `enova_docs` | `/rest/v1/enova_docs` | **objeto** (`query: { wa_id, select }`) | **OK** |
| `findClientByName(env, nome)` | 3443 | `enova_state` | `/rest/v1/enova_state` | **objeto** (`query: { nome, select, order, limit }`) | **OK** |

**Resumo A:** não há casos com query colada no path entre os call-sites de `sbFetch`.

---

### B) Call-sites via `supabaseProxyFetch(...)` (direto)

| Função (Worker) | Linha | Tabela | Path atual | Formato de query | Status |
|---|---:|---|---|---|---|
| `resetTotal(env, wa_id)` | 856 | `enova_state` | `/rest/v1/enova_state` | **objeto** (`query: { wa_id: eq... }`) | **OK** |

---

### C) Helpers que chamam `supabaseProxyFetch(...)`

> Estes pontos também são call-sites de Supabase no Worker, porém com tabela dinâmica (`/rest/v1/${table}`).

| Helper | Linha | Tabela | Path atual | Formato de query | Status |
|---|---:|---|---|---|---|
| `supabaseSelect(env, table, ...)` | 786 | dinâmica | `/rest/v1/${table}` | **objeto** (`query` montada no helper) | **OK** |
| `supabaseUpsert(env, table, rows)` | 804 | dinâmica | `/rest/v1/${table}` | **objeto** (`query.on_conflict` quando `enova_state`) | **OK** |
| `supabaseInsert(env, table, rows)` | 820 | dinâmica | `/rest/v1/${table}` | sem query | **OK** |
| `supabaseUpdate(env, table, filter, patch)` | 839 | dinâmica | `/rest/v1/${table}` | **objeto** (`query` com `eq.` por coluna) | **OK** |
| `sbFetch(env, path, options...)` (wrapper interno) | 368 | dinâmica (via `path`) | repassa `path` recebido | **objeto** (`options.query`) | **OK** |

---

### D) Call-sites com `fetch` direto para Supabase (`${env.SUPABASE_URL}/rest/v1/...`)

| Função (Worker) | Linha | Tabela | Path atual | Formato de query | Status |
|---|---:|---|---|---|---|
| `saveDocumentForParticipant(env, st, participant, docType, url)` | 2316 | `enova_docs` | `/rest/v1/enova_docs` | sem query | **OK** |
| `saveDocumentToSupabase(env, wa_id, data)` | 2728 | `enova_docs` | `/rest/v1/enova_docs` | sem query | **OK** |
| `updateDocumentPendingList(env, st, docType, participant, valid)` | 2746 | `enova_docs_pendencias` | `/rest/v1/enova_docs_pendencias` | sem query | **OK** |

---

## Achados objetivos

- Prefixo `/rest/v1` está correto nos call-sites auditados.
- Não foi encontrado padrão de query colada no path nos call-sites listados.
- `enova_docs_pendencias` aparece como call-site válido e alinhado ao schema documentado.

## Plano de correção cirúrgica

- Manter a lista de call-sites sincronizada com `schema/public_tables.txt` e com as migrações de schema.
- Padronizar os 3 pontos de `fetch` direto para `sbFetch(...)`, mantendo o mesmo payload/semântica.
- Manter regra de query em objeto (`query: { ... }`) e evitar query inline no path.
