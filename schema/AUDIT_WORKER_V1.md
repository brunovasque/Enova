# AUDIT_WORKER_V1 — Enova worker.js vs schema canônico

## Escopo e fontes
- Worker auditado: `Enova worker.js`.
- Documentos canônicos usados para comparação:
  - `schema/FUNIL_GRAPH_V1.md`
  - `schema/SUPABASE_AUDIT_CALLSITES_V1.md`
  - `schema/SUPABASE_SCHEMA_MAPPING_V1.md`
  - `schema/enova_state.columns.txt`
  - `schema/public_tables.txt`

---

## 1) Rotas/handlers do Worker que leem/escrevem Supabase (com âncoras)

### 1.1 Router principal
- `POST /webhook/meta` e `POST /` despacham para `handleMetaWebhook(...)`.
  - Âncora: `Enova worker.js` linhas ~1123-1128.
- Dentro do fluxo de `handleMetaWebhook`, o estado é lido/gravado por helpers (`getState`, `upsertState`) e pelo fluxo de documentos (`saveDocumentForParticipant`, `saveDocumentToSupabase`, `updateDocsStatusV2`, `saveDocumentStatus`).
  - `getState` (read em `enova_state`): linhas ~384-408.
  - `upsertState` (insert/update em `enova_state`): linhas ~413-495.
  - `saveDocumentForParticipant` (write em `enova_docs`): linhas ~2314-2330.
  - `saveDocumentToSupabase` (write em `enova_docs`): linhas ~2727-2736.
  - `updateDocsStatusV2` (read em `enova_docs` + write em `enova_state`): linhas ~3061-3108.
  - `saveDocumentStatus` (write em `enova_docs_status`): linhas ~3033-3041.

### 1.2 Handler de retorno do correspondente
- `handleCorrespondenteRetorno(...)` usa:
  - `findClientByName(...)` (read em `enova_state` via `ilike`): linhas ~3436-3455.
  - `getState(...)`/`upsertState(...)` para reconciliar estado do cliente: linhas ~3490-3499 e diversos updates no bloco.

### 1.3 Logging técnico
- `logger(...)` escreve em `enova_log` via `sbFetch`.
  - Âncora: linhas ~348-356.

### 1.4 Rotas administrativas
- `GET /__admin__/health` e `POST /__admin__/send` não fazem acesso direto ao Supabase neste bloco (send usa `sendMessage` para Meta API).
  - Âncoras: ~1008-1076.

---

## 2) Tabela -> colunas usadas (nomes exatos) e existência em `enova_state.columns.txt`

> Observação: `enova_state.columns.txt` só cobre colunas da tabela `enova_state`; para outras tabelas (`enova_docs`, `enova_docs_status`, `enova_log`) a checagem de colunas depende de inventário específico dessas tabelas.

### 2.1 `enova_state` (uso no Worker)

#### 2.1.1 Colunas com evidência de uso e **presentes** em `enova_state.columns.txt`
- `wa_id`, `updated_at`, `fase_conversa`, `funil_status`, `nome`
- `estado_civil`, `somar_renda`, `financiamento_conjunto`
- `ctps_36`, `ctps_36_parceiro`
- `nacionalidade`, `rnm_validade`
- `dependente`, `docs_completos`, `docs_lista_enviada`
- `parceiro_tem_renda`, `regime`, `renda`, `renda_parceiro`, `renda_total_para_fluxo`
- `last_user_text`, `last_processed_text`, `last_message_id`, `last_bot_msg`
- `retorno_correspondente_bruto`, `retorno_correspondente_status`, `retorno_correspondente_motivo`
- `processo_enviado_correspondente`, `regularizacao_restricao`
- `multi_renda_flag`, `multi_renda_lista`, `multi_regime_lista`
- `qtd_rendas_informadas`, `qtd_regimes_informados`, `ultima_renda_bruta_informada`, `ultima_regime_informado`

#### 2.1.2 Colunas com evidência de uso e **não encontradas** em `enova_state.columns.txt`
- `rnm_status`
- `multi_rendas`, `multi_rendas_parceiro`
- `multi_regimes`, `multi_regimes_parceiro`
- `renda_individual_calculada`, `renda_parceiro_calculada`, `renda_total_composicao`, `faixa_renda_programa`
- `casamento_formal`
- `dependentes_qtd`
- `docs_pendentes`
- `familiar_tipo`
- `regime_trabalho_parceiro`
- `autonomo_comprova`
- `avo_beneficio`
- `ir_declarado_por`
- `_incoming_media`
- `primeiro_nome`
- `processo_aprovado`, `processo_reprovado`
- `visita_confirmada`, `visita_dia_hora`

#### 2.1.3 Coluna explicitamente removida antes do write
- `renda_familiar` aparece no código, porém é removida de `patch` antes de persistir (`delete patch.renda_familiar`).
  - Âncora: linhas ~420-422.

### 2.2 `enova_docs` (uso no Worker)
- Escrita observada:
  - fluxo 1 (`saveDocumentForParticipant`): `wa_id`, `participante`, `tipo`, `url`, `created_at`.
  - fluxo 2 (`saveDocumentToSupabase`): `wa_id` + payload dinâmico (`participant`, `tipo`, `url`, `valido`, `precisa_refazer`, `motivo`, `ocr_text`, `created_at`).
- Leitura observada:
  - `select: "*"` em `updateDocsStatusV2` e comparação por `d.tipo` e `d.participante`.

### 2.3 `enova_docs_status` (uso no Worker)
- Escrita observada em `saveDocumentStatus`: `wa_id`, `status_json`, `updated_at`.

### 2.4 `enova_log` (uso no Worker)
- Escrita observada em `logger`: payload dinâmico (`JSON.stringify(data)` sem schema estático local).

---

## 3) Dependência de tabela inexistente (ex.: `enova_docs_pendencias`)

- **Não encontrado no Worker atual** qualquer acesso a `enova_docs_pendencias`.
- Tabelas com acesso explícito em `/rest/v1/...`: `enova_state`, `enova_docs`, `enova_docs_status`, `enova_log`.
- Todas as quatro tabelas constam em `schema/public_tables.txt`.

---

## 4) Chamadas `sbFetch` que não usem `/rest/v1/`

- **Nenhuma encontrada**.
- Chamadas `sbFetch` identificadas:
  - `/rest/v1/enova_log`
  - `/rest/v1/enova_docs_status`
  - `/rest/v1/enova_docs`
  - `/rest/v1/enova_state`

---

## 5) Inconsistências de retorno/estado (apontar, sem corrigir)

1. Fluxo documental retorna `ok: true` mesmo quando o documento é marcado como não legível.
   - Em `processDocumentAdvanced`, o resultado final retorna `ok: true` sempre após salvar, enquanto `readable` pode ser `false` (quando `valid.refazer === true`).
   - Âncoras: validação (`valid`) linhas ~2590-2601 e retorno final linhas ~2614-2623.

2. Divergência de nomenclatura de participante no payload de `enova_docs`.
   - Um fluxo grava `participante` (`saveDocumentForParticipant`), outro grava `participant` (`saveDocumentToSupabase`), enquanto a leitura compara `d.participante`.
   - Âncoras: `participante` linhas ~2325 e `participant` linha ~2596; leitura por `d.participante` linha ~3088.

3. `saveDocumentStatus(...)` grava em `enova_docs_status`, mas `updateDocsStatusV2(...)` também grava sinalização resumida em `enova_state` (`docs_pendentes`, `docs_completos`).
   - Potencial duplicidade de “fonte de verdade” para status documental (não necessariamente bug, mas ponto de atenção de consistência).
   - Âncoras: `saveDocumentStatus` linhas ~3033-3041 e `upsertState` de docs linhas ~3096-3099.

---

## 6) Conclusão objetiva

- A camada de acesso Supabase do Worker está majoritariamente padronizada em `/rest/v1/...` (inclusive no `sbFetch`).
- Não há referência ativa a tabela inexistente `enova_docs_pendencias` no Worker atual.
- O principal desvio técnico identificado é o conjunto de colunas usadas em `enova_state` que não aparece no inventário `schema/enova_state.columns.txt`, além de inconsistências semânticas no fluxo de documentos (`ok: true` com `readable: false` e `participant` vs `participante`).
