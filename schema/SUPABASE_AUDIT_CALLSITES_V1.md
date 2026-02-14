# SUPABASE AUDIT — Worker call-sites (V1)

## Escopo e método
- Escopo desta auditoria: **apenas Worker** (`Enova worker.js`).
- Foco: `sbFetch(`, referências a `enova_docs_pendencias`, e separação entre acesso direto (`fetch(${env.SUPABASE_URL}/rest/v1/...`) vs proxy (`sbFetch`/`supabaseProxyFetch`).

---

## 1) Call-sites de `sbFetch(` no Worker (lista completa)

### 1.1 `logger(env, data)`
- **Classificação:** **(A) path ok** (`/rest/v1/...` + sem query inline; query em objeto quando existir)
- **Âncora (linhas 350–355):**
```js
await sbFetch(env, "/rest/v1/enova_log", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  // NÃO inventa coluna "ts" aqui. Deixa o banco cuidar do created_at.
  body: JSON.stringify(data),
});
```

### 1.2 `getState(env, wa_id)`
- **Classificação:** **(A) path ok** (`/rest/v1/...` + `query` em objeto)
- **Âncora (linhas 385–392):**
```js
const result = await sbFetch(
  env,
  "/rest/v1/enova_state",
  {
    method: "GET",
    query: {
      select: "*",
      wa_id: `eq.${encodeURIComponent(wa_id)}`
```

### 1.3 `saveDocumentStatus(env, st, status)`
- **Classificação:** **(A) path ok**
- **Âncora (linhas 3035–3041):**
```js
await sbFetch(env, "/rest/v1/enova_docs_status", {
  method: "POST",
  body: JSON.stringify({
    wa_id: st.wa_id,
    status_json: status,
    updated_at: new Date().toISOString()
```

### 1.4 `updateDocsStatusV2(env, st)`
- **Classificação:** **(A) path ok** (`query` em objeto)
- **Âncora (linhas 3067–3072):**
```js
const { data: docsRecebidos } = await sbFetch(env, "/rest/v1/enova_docs", {
  method: "GET",
  query: {
    wa_id: `eq.${st.wa_id}`,
    select: "*"
  }
```

### 1.5 `findClientByName(env, nome)`
- **Classificação:** **(A) path ok** (`query` em objeto)
- **Âncora (linhas 3443–3449):**
```js
const { data } = await sbFetch(env, "/rest/v1/enova_state", {
  method: "GET",
  query: {
    nome: `ilike.${filtro}`,
    select: "wa_id,nome,fase_conversa,funil_status",
    order: "updated_at.desc",
    limit: 1
```

### 1.6 Observação de completude
- Não foram encontrados call-sites `sbFetch(` classificados como:
  - **(B) path curto** (ex.: `"/enova_log"`, `"/enova_docs_status"`)
  - **(C) query colada no path** (ex.: `"/enova_docs?wa_id=...&select=*"`)

---

## 2) Referências a `enova_docs_pendencias` (tabela inexistente)

### 2.1 `updateDocumentPendingList(env, st, docType, participant, valid)`
- **Ocorrência:** 1 referência explícita à tabela inexistente.
- **Âncora (linhas 2746–2753):**
```js
await fetch(`${env.SUPABASE_URL}/rest/v1/enova_docs_pendencias`, {
  method: "POST",
  headers: {
    "apikey": env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type": "application/json"
  },
```
- **Impacto provável:**
  1. Falha HTTP (tipicamente `404`/`42P01`) ao tentar inserir em tabela não existente.
  2. Perda silenciosa de rastreio de pendências (sem persistência de dados esperados).
  3. Possível inconsistência de fluxo: o Worker pode seguir sem refletir corretamente pendências documentais em armazenamento.

---

## 3) Separação: acesso direto vs proxy

## 3.1 Operações com **fetch direto** (`${env.SUPABASE_URL}/rest/v1/...`)

1. `saveDocumentForParticipant(...)` → `POST /rest/v1/enova_docs`
   - Âncora (linhas 2316–2322):
   ```js
   await fetch(`${env.SUPABASE_URL}/rest/v1/enova_docs`, {
     method: "POST",
     headers: {
       "apikey": env.SUPABASE_KEY,
       "Authorization": `Bearer ${env.SUPABASE_KEY}`,
       "Content-Type": "application/json"
   ```

2. `saveDocumentToSupabase(...)` → `POST /rest/v1/enova_docs`
   - Âncora (linhas 2728–2734):
   ```js
   await fetch(`${env.SUPABASE_URL}/rest/v1/enova_docs`, {
     method: "POST",
     headers: {
       "apikey": env.SUPABASE_KEY,
       "Authorization": `Bearer ${env.SUPABASE_KEY}`,
       "Content-Type": "application/json"
   ```

3. `updateDocumentPendingList(...)` → `POST /rest/v1/enova_docs_pendencias`
   - Âncora (linhas 2746–2752):
   ```js
   await fetch(`${env.SUPABASE_URL}/rest/v1/enova_docs_pendencias`, {
     method: "POST",
     headers: {
       "apikey": env.SUPABASE_KEY,
       "Authorization": `Bearer ${env.SUPABASE_KEY}`,
       "Content-Type": "application/json"
   ```

## 3.2 Operações via **proxy** (`sbFetch` / `supabaseProxyFetch`)

1. Via `sbFetch`:
   - `logger(...)` → `/rest/v1/enova_log`
   - `getState(...)` → `/rest/v1/enova_state`
   - `saveDocumentStatus(...)` → `/rest/v1/enova_docs_status`
   - `updateDocsStatusV2(...)` → `/rest/v1/enova_docs`
   - `findClientByName(...)` → `/rest/v1/enova_state`

2. Via `supabaseProxyFetch` diretamente:
   - `resetTotal(...)` → `DELETE /rest/v1/enova_state`
   - Helpers genéricos: `supabaseSelect`, `supabaseUpsert`, `supabaseInsert`, `supabaseUpdate` (todos montando `path: /rest/v1/${table}`)

---

## 4) Plano de Patch mínimo (sem implementar)

- Padronizar `saveDocumentForParticipant(...)` para usar `sbFetch(env, "/rest/v1/enova_docs", { method: "POST", body, ... })`.
- Padronizar `saveDocumentToSupabase(...)` para usar `sbFetch` no mesmo padrão acima (evitar duplicação de acesso direto).
- Padronizar `updateDocumentPendingList(...)` para:
  - migrar de `fetch` direto para `sbFetch`;
  - corrigir destino da tabela atualmente `enova_docs_pendencias` (inexistente) para a tabela válida definida no schema real.
- Manter query sempre em objeto (`query: {...}`), sem query colada em `path`.
- Consolidar headers/autenticação no proxy para reduzir divergência de `SUPABASE_KEY` vs `SUPABASE_SERVICE_ROLE` entre pontos do Worker.
