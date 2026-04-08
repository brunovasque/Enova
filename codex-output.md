# DIAGNÓSTICO READ-ONLY PROFUNDO — Fase Dossiê/Correspondente/Doc

## 1. WORKFLOW_ACK: ok

Lidos e seguidos:
- `schema/CODEX_WORKFLOW.md` ✓
- `schema/CANONICO_GATE_PRESERVATION.md` ✓
- `schema/SUPABASE_CHANGE_GUARD.md` ✓

**"Não implementei patch."**
**"Nenhum gate foi alterado."**
**"Nenhum nextStage foi alterado."**
**"Nenhuma regra de negócio foi alterada."**

---

## 2. Resumo Executivo

Dois problemas confirmados com causas raiz identificadas por anchors no código:

| # | Problema | Causa raiz | Confiança |
|---|----------|------------|-----------|
| 1 | `/correspondente/doc` retorna "Falha ao carregar documento." | URLs de mídia Meta expiradas (graph API media_id ou lookaside temporário) + catch opaco que engole causa real | **Alta (90%)** |
| 2 | Documentos Recebidos e Links operacionais aparecem duplicados | Merge de 3 fontes (enova_docs + pacote + histórico) com chaves de dedup incompatíveis + filtro de excesso insuficiente quando URLs diferem entre fontes | **Alta (85%)** |

Os dois bugs **compartilham uma raiz parcial** (inconsistência de representação de URL entre fontes), mas **têm causas independentes dominantes**.

---

## 3. PARTE 1 — Mapa Completo de `/correspondente/doc`

### 3.1 Fluxograma textual

```
REQUEST GET /correspondente/doc?pre=...&t=...&doc=...
  │
  ├─ [L5831] Dispatch → handleCorrespondenteDocumentAccess(request, env)
  │
  ├─ [L15784-15794] Parse parâmetros:
  │     pre/caseRef → normalizeCorrespondenteCaseRefInput()
  │     t/token    → normalizeAssumirToken()
  │     doc/docId  → String().trim()
  │
  ├─ [L15795] Validação: (!caseRef || !token || !docId) → 400
  │
  ├─ [L15799] Lookup caso: getCorrespondenteCaseByToken(env, token)
  │     [L16014-16048] → consulta enova_state por corr_assumir_token
  │     Se !caso?.wa_id → 404 "Link de documento inválido ou expirado."
  │
  ├─ [L15804-15806] Validação: caseRef do request != caseRef do caso → 403
  │
  ├─ [L15808-15809] Validação: isCorrespondenteEntryAllowed(caso)
  │     [L14904-14913] Checa corr_publicacao_status
  │     Se não permitido → 403
  │
  ├─ [L15812] getState(env, caso.wa_id) → stCaso (estado completo)
  │
  ├─ [L15813] getCaseDocumentLinks(env, caso.wa_id, stCaso)
  │     [L17624-17863] ⬅ MERGE DE 3 FONTES (detalhado na Parte 2)
  │     Retorna array de docs normalizados
  │
  ├─ [L15814] buildCorrespondenteWebDocsModel(docs)
  │     [L15515-15623] Constrói modelo com receivedById Map
  │     Cada doc recebe stable_doc_id e received_access_id
  │
  ├─ [L15815] targetDoc = docsModel.receivedById.get(docId)
  │     Se docId não encontrado no Map → targetDoc = null
  │
  ├─ [L15816] targetUrl = resolveCorrespondenteDocumentUrl(targetDoc)
  │     [L15504-15512] Cadeia: url → link → document_url → download_url → media_url
  │     Se vazio → 404 "Documento não encontrado."
  │
  ├─ [L15821] isMetaProtectedDocumentUrl(targetUrl)
  │     [L15733-15750] Detecta lookaside.fbsbx.com / graph.facebook.com
  │     Se NÃO Meta → Response.redirect(targetUrl, 302) ✅ SUCESSO
  │
  ├─ [L15825] resolveCorrespondenteMetaProtectedFetchTarget(env, targetUrl)
  │     [L15752-15781] Para graph.facebook.com:
  │       ├─ Chama Graph API com Bearer token
  │       ├─ Se 200 + JSON → extrai url/download_url/link
  │       ├─ Se URL resolvida → return { url: resolved, headers }
  │       └─ Se falha/sem URL → catch {} vazio [L15779] → return { url: original, headers }
  │     Para lookaside: return { url: original, headers }
  │
  ├─ [L15826-15827] Se !fetchTargetUrl → ❌ 502 "Falha ao carregar documento." (PONTO 1)
  │
  ├─ [L15830-15833] try { fetch(fetchTargetUrl, { headers }) }
  │     catch → ❌ 502 "Falha ao carregar documento." (PONTO 2)
  │
  ├─ [L15835-15836] Se !upstream?.ok → ❌ 502 "Falha ao carregar documento." (PONTO 3)
  │
  └─ [L15839-15853] Se upstream.ok → ✅ 200 com body proxied
```

### 3.2 Análise dos 3 pontos de falha "Falha ao carregar documento."

**PONTO 1 — L15827: `!fetchTargetUrl`**
- Ocorre quando `resolveCorrespondenteMetaProtectedFetchTarget` retorna `url: ""`
- Isso só acontece se `targetUrl` original era vazio (já protegido pelo check L15817)
- **Na prática, este ponto quase nunca é atingido.**
- Único cenário: `targetUrl` não-vazio passa no check L15817, mas `isMetaProtectedDocumentUrl` retorna false para ele → o redirect L15822 é usado. Se `isMetaProtectedDocumentUrl` retorna true → cai no resolver → `resolveCorrespondenteMetaProtectedFetchTarget` retorna `{ url: targetUrl, headers }` no mínimo (L15780).
- **Conclusão: PONTO 1 é praticamente inatingível.**

**PONTO 2 — L15833: fetch throws**
- Ocorre quando o `fetch()` ao URL resolvido lança exceção (DNS, timeout, rede)
- **Possível com URLs de graph.facebook.com quando o host é inalcançável, ou com URLs malformadas.**
- **Provável para lookaside URLs expiradas** que retornam erro de rede.

**PONTO 3 — L15836: `!upstream?.ok` (⬅ CAUSA MAIS PROVÁVEL)**
- Ocorre quando o upstream retorna status HTTP não-2xx
- **Cenário dominante:** Media expirada no Meta.
  - Para graph API URL: o resolver (L15763-15778) chama o Graph API → se a resposta for non-ok OU JSON sem URL, cai no fallback (L15780) que retorna a URL original → handler faz fetch na URL original de novo → Graph API retorna 404/400 → `upstream.ok = false` → 502.
  - Para lookaside URL: link temporário expirado → fetch retorna 403/404/410 → 502.
- **O empty `catch {}` em L15779 engole qualquer exceção da resolução Graph API sem log.**

### 3.3 Caminho de doc que abre vs. doc que falha

| Cenário | URL armazenada | Resolve? | Por quê |
|---------|---------------|----------|---------|
| Doc recente (< minutos) com lookaside URL | `https://lookaside.fbsbx.com/...` | ✅ | URL temporária ainda válida |
| Doc recente com graph URL | `https://graph.facebook.com/v20.0/<mid>` | ✅ | Media ainda disponível no Meta, Graph API retorna download URL |
| Doc antigo com graph URL | `https://graph.facebook.com/v20.0/<mid>` | ❌ | Media expirou no Meta (retenção ~30 dias), Graph API retorna erro |
| Doc antigo com lookaside URL | `https://lookaside.fbsbx.com/...` | ❌ | URL temporária expirou (minutos/horas) |
| Doc com URL pública não-Meta | `https://docs.example.com/...` | ✅ | Redirect 302 direto (L15822), sem proxy Meta |

### 3.4 Logs existentes nesta rota

**Logs existentes: NENHUM.** A função `handleCorrespondenteDocumentAccess` (L15783-15853) não contém nenhuma chamada a `telemetry()`, `logger()` ou `console.log/error`. Os três branches de erro retornam a mesma mensagem genérica sem distinguir a causa.

### 3.5 Dados que faltam para fechar o erro sem instrumentação extra

Sem logs, é impossível saber em produção:
- Qual dos 3 pontos de falha foi atingido
- Qual URL estava sendo resolvida
- Qual era o tipo/participante do doc
- Se o Graph API retornou erro ou resposta vazia
- Se o problema é de rede, expiração ou media_id inválido

---

## 4. PARTE 2 — Mapa Completo da Duplicidade Documental

### 4.1 Onde nasce a lista "Documentos Recebidos"

```
[L15091] docsRecebidosUi = docsForUi.filter((doc) => doc.access_link)
```

`docsForUi` vem de `buildCorrespondenteDocsForUi()` (L15625), que recebe os docs de `getCaseDocumentLinks()` (L17624).

### 4.2 Onde nasce a lista "Links operacionais dos documentos"

```
[L15098-15103] linksOperacionaisUi = docsRecebidosUi.map(...)
```

É **a mesma lista** de `docsRecebidosUi`, apenas reformatada. Portanto, se `docsRecebidosUi` tem duplicatas, `linksOperacionaisUi` também tem.

### 4.3 As 3 fontes que alimentam o merge

`getCaseDocumentLinks` (L17624-17863) constrói docs de 3 fontes:

| # | Fonte | Variável | Linhas | Prefixo doc_id |
|---|-------|----------|--------|----------------|
| 1 | `enova_docs` (tabela Supabase) | `persistedReceivedDocs` | L17829-17855 | `"persisted"` |
| 2 | `pacote_documentos_anexados_json` (campo enova_state) | `stateReceivedDocs` | L17775-17778 | `"state"` |
| 3 | `envio_docs_historico_json` (campo enova_state) | `historyReceivedDocs` | L17779-17800 | `"hist"` |

O merge acontece em:
```
[L17856-17860]
mergeReceivedUploadsByDocId([
  ...persistedReceivedDocs,
  ...stateReceivedDocs,
  ...historyReceivedDocs
])
```

### 4.4 A chave de dedup atual e por que falha

`mergeReceivedUploadsByDocId` (L17709-17736) usa `doc_id` como chave:
```javascript
const key = String(doc?.doc_id || "").trim();  // L17721
```

O `doc_id` é gerado por `buildUploadFingerprintId` (L17661-17690):

```
PRIORIDADE 1 (intrinsic): doc_id → id → message_id → wamid → media_id → mid
PRIORIDADE 2 (fingerprint): "{prefix}_{tipo}_{participante}_{url}_{filename}_{created_at}_{mime_type}"
PRIORIDADE 3 (deterministic): "{prefix}_{tipo}_{participante}_{created_at}"
```

**O PROBLEMA CENTRAL:** Cada fonte gera doc_ids com estratégias diferentes:

| Fonte | ID típico gerado | Exemplo |
|-------|------------------|---------|
| `enova_docs` (persisted) | DB UUID do campo `id` | `"a1b2c3d4-..."` |
| `pacote` (state) | `media_id` se presente, ou `"state_rg_p1_..."` fingerprint | `"mid-123"` ou `"state_rg_p1_..."` |
| `histórico` (hist) | `media_id` do media_ref | `"mid-123"` |

**Quando `enova_docs` tem UUID e pacote/histórico tem media_id, as chaves são diferentes → o merge NÃO deduplica → o mesmo documento aparece múltiplas vezes.**

### 4.5 Segunda camada de dedup: `buildCorrespondenteDocsForUi` — e por que é insuficiente

Quando existem checklist items (`envio_docs_itens_json`), `buildCorrespondenteDocsForUi` (L15625-15731) faz:

1. **Match checklist → doc:** Para cada item do checklist, encontra o melhor doc recebido (L15663-15696)
2. **Filtra excess docs** (L15712-15728) com 3 checks:

```
CHECK 1: [L15714] docKey in matchedReceivedIds → SKIP
  └ Falha quando: doc tem ID diferente do que foi matched

CHECK 2: [L15716] docUrl in matchedDocUrls → SKIP
  └ Falha quando: URL diferente entre fontes (ex: graph vs lookaside)

CHECK 3: [L15718-15720] tipo|participante in linkedChecklistPairs (só se !hasOwnLink) → SKIP
  └ Falha quando: doc tem received_access_id (hasOwnLink = true) → CHECK BYPASSADO
```

**O cenário de escape:**
- Doc persisted tem URL A (graph), doc state tem URL B (lookaside ou vice-versa)
- Check 1 falha (IDs diferentes)
- Check 2 falha (URLs diferentes)
- Check 3 bypassado (ambos têm URLs → hasOwnLink = true)
- **Resultado: DUPLICATA visível no dossiê**

### 4.6 Terceiro vetor de duplicação: re-uploads em `enova_docs`

Quando o cliente envia o mesmo tipo de documento múltiplas vezes:
- Cada upload cria uma nova linha em `enova_docs` (L13385-13399)
- O precheck (L13358-13364) usa `wa_id + tipo + participante + url` como chave
- Se o re-upload tem URL diferente (novo media_id) → precheck não encontra → nova linha criada
- Resultado: N linhas em `enova_docs` para o mesmo tipo/participante

### 4.7 Conclusão: onde nasce a duplicidade

A duplicidade nasce em **dois níveis simultâneos:**

| Nível | Mecanismo | Evidência (anchor) |
|-------|-----------|-------------------|
| **Merge** | 3 fontes com chaves de dedup incompatíveis (UUID vs media_id vs fingerprint) | L17661-17690 (buildUploadFingerprintId com prefixos diferentes), L17709-17736 (mergeReceivedUploadsByDocId por doc_id) |
| **Projeção** | Filtro de excess docs insuficiente quando URLs diferem e docs têm link próprio | L15712-15728 (3 checks, check 3 bypassado por hasOwnLink) |
| **Persistência** (agravante) | Re-uploads criam linhas adicionais em `enova_docs` sem superseder anteriores | L13358-13399 (precheck por wa_id+tipo+participante+url, não por wa_id+tipo+participante apenas) |

---

## 5. PARTE 3 — Confronto com Leituras Iniciais do Chat

| # | Leitura inicial | Veredicto | Evidência |
|---|----------------|-----------|-----------|
| 1 | `/correspondente/doc` parece estar entrando na rota e falhando internamente, não por ausência de link | **CONFIRMADO** | A rota existe (L5831), dispatch funciona (L15783), os 3 pontos de falha são todos internos ao handler (L15827, L15833, L15836) |
| 2 | Duplicidade pode vir de `enova_docs` + fallback canônico + projeção sem dedupe suficiente | **CONFIRMADO** | `getCaseDocumentLinks` (L17856-17860) faz merge de 3 fontes; `buildCorrespondenteDocsForUi` (L15712-15728) tem dedup parcial que falha quando URLs diferem |
| 3 | Pode haver diferença entre docs que abrem e docs que falham por tipo/origem/resolução | **CONFIRMADO** | Docs com URLs graph recentes funcionam; docs com URLs lookaside expiradas ou graph antigos falham. A diferença é temporal/tipo de URL, não tipo documental |
| 4 | O `409` em `__corr_case_ref_counter__` pode ser ruído ou indicar concorrência | **CONFIRMADO COMO RUÍDO** | O 409 vem do INSERT inicial em `allocateCorrespondenteCaseRefSequential` (L14622-14631), é tratado como idempotência esperada (catch silencioso L14629). Não tem relação nenhuma com duplicidade documental ou abertura de docs |

---

## 6. Tabela de Hipóteses

| # | Hipótese | Evidência | Status |
|---|----------|-----------|--------|
| H1 | Falha intermitente na resolução da URL final da mídia | L15752-15781: resolver Graph API pode falhar se media expirou; empty catch L15779 engole erro | **CONFIRMADA** |
| H2 | Falha ao trocar token/URL protegida da Meta por URL temporária baixável | L15763-15778: se Graph API retorna erro, cai no fallback que re-tenta a mesma URL original → falha dupla | **CONFIRMADA** |
| H3 | Doc inconsistente na fonte (existe no dossiê mas não resolve operacionalmente) | Pacote pode ter doc "recebido" sem URL utilizável; `withHistoryFallbackUrl` (L17764) tenta resolver mas pode falhar | **CONFIRMADA** |
| H4 | Rota mistura fontes diferentes e algumas têm materialidade e outras não | L17856-17860: merge de 3 fontes; docs de pacote podem não ter URL real → aparecem sem materialidade | **CONFIRMADA** |
| H5 | Bug de diferença entre tipos de doc (alguns abrem, outros não) | Não há evidência no código de tratamento diferenciado por tipo documental na rota `/correspondente/doc` | **REFUTADA** — a falha é por URL/idade, não por tipo |
| H6 | Bug de diferença entre docs antigos e novos | Media IDs expiram no Meta após período de retenção; lookaside URLs expiram em minutos | **CONFIRMADA** — idade é fator determinante |
| H7 | Bug de diferença entre `doc_<id lógico>` e `media_id`/URL direta | L15815: lookup por `received_access_id` no Map; se o docId do link não bate com nenhum key no Map → 404, não 502 | **PARCIAL** — pode causar 404 mas não 502 |
| H8 | Catch genérico engolindo causa real | L15779: `catch {}` vazio no resolver; L15832-15836: 3 branches retornando mesma mensagem sem distinção | **CONFIRMADA** |
| H9 | Mesmo doc salvo mais de uma vez na origem (enova_docs) | L13358-13364: precheck usa wa_id+tipo+participante+url; re-uploads com URL diferente criam novas linhas | **CONFIRMADA** como agravante |
| H10 | Deduplicação não usa chave certa | L17721: dedup por doc_id; prefixos diferentes por fonte (persisted/state/hist) geram chaves incompatíveis | **CONFIRMADA** — causa principal da duplicidade |
| H11 | Mesmo item entra 2x por tipo bruto e tipo canônico | L9613-9625: envioDocsHintTipoMatchesItemTipo já faz match entre bruto↔canônico; isso gera projeção correta, não duplicação | **REFUTADA** — equivalência funciona mas não duplica |
| H12 | Mesmo item entra 2x por origem diferente (enova_docs + pacote + hist) | L17856-17860: 3 fontes com doc_ids incompatíveis → merge não deduplica | **CONFIRMADA** |
| H13 | `409` em `__corr_case_ref_counter__` gera duplicidade | L14622-14631: 409 é da alocação de pre_cadastro_numero, domínio completamente separado de docs | **REFUTADA** — sem relação |

---

## 7. Causa Mais Provável — Problema 1 (Falha ao carregar documento)

**URLs de mídia Meta expiradas** chegando à rota `/correspondente/doc`.

Fluxo de falha dominante:
1. Doc armazenado com URL `https://graph.facebook.com/v20.0/<media_id>`
2. Media expirou no Meta (retenção limitada)
3. `resolveCorrespondenteMetaProtectedFetchTarget` chama Graph API → resposta não-ok ou sem URL no JSON
4. Fallback retorna URL original (que é a mesma que acabou de falhar)
5. Handler faz `fetch(originalUrl)` de novo → falha → `!upstream.ok` → 502

**Agravante:** `catch {}` vazio em L15779 e ausência total de logs na rota impedem diagnóstico em produção.

**Grau de confiança: 90%**

---

## 8. Causa Mais Provável — Problema 2 (Documentos Duplicados)

**Merge de 3 fontes com chaves de dedup incompatíveis** + **filtro de excess insuficiente**.

O mesmo documento físico aparece com doc_ids diferentes dependendo da fonte:
- `enova_docs`: usa UUID do DB como doc_id
- `pacote`: usa media_id ou fingerprint com prefixo "state_"
- `histórico`: usa media_id ou fingerprint com prefixo "hist_"

Como `mergeReceivedUploadsByDocId` deduplica por `doc_id`, chaves diferentes = merge falha.

Na camada de projeção, o filtro de excess (L15712-15728) captura duplicatas por URL, mas falha quando URLs diferem entre fontes (graph vs lookaside, ou URLs de re-uploads).

**Grau de confiança: 85%**

---

## 9. Relação Entre os Dois Bugs

| Aspecto | Bug 1 (Doc falha) | Bug 2 (Duplicidade) |
|---------|-------------------|---------------------|
| Causa principal | URLs Meta expiradas | Merge 3 fontes com dedup fraco |
| Causa compartilhada | Inconsistência de representação de URL entre fontes |
| Independentes? | Parcialmente — podem ser corrigidos separadamente |
| Um depende do outro? | Não — correção de um não resolve o outro |

**Recomendação: podem ir na mesma PR** (são do mesmo domínio: correspondente/doc), mas como **commits separados** para facilitar rollback individual.

---

## 10. Plano de Correção Mínimo (NÃO IMPLEMENTADO)

### Problema 1 — `/correspondente/doc` falha

**Commit 1a — Logs cirúrgicos:**
- Antes de `resolveCorrespondenteMetaProtectedFetchTarget`: logar docId, targetUrl, tipo, participante
- Dentro do resolver: logar resposta do Graph API (status, content-type, URL resolvida ou erro)
- Substituir `catch {}` vazio (L15779) por log de erro
- Nos 3 pontos de 502: logar qual branch foi atingido + URL envolvida

**Commit 1b — Fallback para media_id quando lookaside expira:**
- Se targetUrl é lookaside E fetch falha → extrair media_id do doc → tentar graph URL como fallback
- Isso dá uma segunda chance para docs com URLs temporárias expiradas

### Problema 2 — Duplicidade

**Commit 2a — Dedup por tipo+participante+URL normalizada em `mergeReceivedUploadsByDocId`:**
- Além de dedup por doc_id, adicionar dedup secundária por `tipo:participante:url_normalizada`
- URL normalizada = `origin+pathname` (sem query params)
- Quando dois docs têm mesmo tipo+participante+URL normalizada, manter o mais recente/completo

**Commit 2b — Reforçar filtro de excess em `buildCorrespondenteDocsForUi`:**
- No check 3 (L15718-15720), remover a condição `!hasOwnLink`
- Ou: adicionar check 4 que deduplica por `tipo|participante` mesmo quando hasOwnLink = true, mantendo apenas o melhor link

---

## 11. Logs Mínimos Propostos (para eventual PR)

| Ponto | Log proposto | Dados |
|-------|-------------|-------|
| Antes de resolver Meta URL | `corr_doc_access_resolving` | docId, targetUrl, tipo, participante, isMetaProtected |
| Dentro do resolver (Graph API) | `corr_doc_access_meta_resolve` | graphStatus, graphContentType, resolvedUrl |
| Catch vazio L15779 | `corr_doc_access_meta_resolve_error` | error.message, targetUrl |
| Ponto 1 (L15827) | `corr_doc_access_no_url` | docId, targetUrl |
| Ponto 2 (L15833) | `corr_doc_access_fetch_error` | docId, fetchTargetUrl, error.message |
| Ponto 3 (L15836) | `corr_doc_access_upstream_fail` | docId, fetchTargetUrl, upstream.status |
| Antes de merge em getCaseDocumentLinks | `corr_doc_links_pre_merge` | persistedCount, stateCount, historyCount |
| Depois de merge | `corr_doc_links_post_merge` | mergedCount, duplicatesRemoved |

---

## 12. Declarações Obrigatórias

- **"Não implementei patch."**
- **"Nenhum gate foi alterado."**
- **"Nenhum nextStage foi alterado."**
- **"Nenhuma regra de negócio foi alterada."**
- **Este documento é puramente diagnóstico READ-ONLY.**
- **Nenhuma tabela Supabase foi lida, escrita, criada ou alterada.**
- **Nenhum arquivo do worker foi modificado.**