# DIAGNÓSTICO ABSOLUTO — INVENTÁRIO COMPLETO DO `envio_docs`
## Pente fino total + Plano de reorganização cirúrgica

> **Data:** 2026-03-29  
> **Modo:** READ-ONLY — sem patch, sem implementação, sem refatoração  
> **Premissa:** `envio_docs` NÃO é "só docs" — contém partes canônicas que devem ficar

---

## 1. RESUMO EXECUTIVO

O stage `envio_docs` (linhas 26095–26708) acumula **20 responsabilidades distintas** dentro de um único case block de ~613 linhas. A grande maioria dessas responsabilidades é **canônica** e **deve permanecer**. Apenas **1 bloco** é intruso comprovado (linhas 26156–26159).

### O que está errado
- A função `maybeCaptureEtapa1PreDocsInput` (L26156–26159) intercepta toda entrada de texto **antes** de qualquer lógica documental, gerando o ciclo: confirmação → pergunta informativa → re-confirmação.
- Essa é a **única contaminação** dentro de `envio_docs`. Todo o resto é responsabilidade legítima do stage.

### O que precisa existir antes
- Um novo bloco lógico pré-docs informativo por onde **todo caminho** que desemboca em `envio_docs` deve passar antes.
- Esse bloco deve coletar moradia/trabalho/escolaridade **antes** da transição para `envio_docs`, e não dentro dele.

### O que continua dentro
- Todo o ciclo de dossiê, canal, checklist, upload, reconciliação, pacote, análise, correspondente, visita documental, status — tudo canônico.

---

## 2. INVENTÁRIO COMPLETO DO `envio_docs`

### Limites do case block
- **Início:** Linha 26095 (`case "envio_docs": {`)
- **Fim:** Linha 26708 (closing `}`)
- **Próximo case:** `agendamento_visita` na linha 26717
- **Total:** ~613 linhas

### Seção por seção

#### SEÇÃO 1 — Helper: parseEnvioDocsCanal (L26096–26120)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Função pura local que classifica o texto do usuário em 7 flags booleanas: `pediuVisita`, `objecaoOnlineForte`, `recusaWhatsapp`, `recusaSite`, `pediuSite`, `pediuResumoPendencias`, `pediuAcompanhamentoStatus` |
| **State lido** | Nenhum (função pura sobre texto) |
| **State escrito** | Nenhum |
| **Canônico?** | ✅ Sim — parseia intenção do canal de envio |
| **Depende de envio_docs?** | ✅ Sim — só faz sentido neste stage |

#### SEÇÃO 2 — Build/persistência de dossiê na entrada (L26122–26136)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `dossie_status !== "pronto"`, chama `buildDocumentDossierFromState(st)` + `persistDocumentDossier(env, st, dossier)`. Try-catch com telemetria de erro (`dossie_build_error`). |
| **State lido** | `st.dossie_status` |
| **State escrito** | Side-effect via persistDocumentDossier |
| **Canônico?** | ✅ Sim — montagem do dossiê é pré-requisito documental |
| **Depende de envio_docs?** | ✅ Sim |

#### SEÇÃO 3 — Computação de `listaEnviada` (L26137–26139)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | `listaEnviada = st.envio_docs_lista_enviada === true \|\| st.docs_lista_enviada === true` |
| **State lido** | `envio_docs_lista_enviada`, `docs_lista_enviada` |
| **Canônico?** | ✅ Sim — gate central do fluxo de docs |

#### SEÇÃO 4 — Telemetria de entrada (L26141–26154)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Emite evento `enter_phase` com `docs_lista_enviada` e `incoming_media` |
| **Canônico?** | ✅ Sim — observabilidade |

#### SEÇÃO 5 — ⚠️ CONTAMINAÇÃO: maybeCaptureEtapa1PreDocsInput (L26156–26159)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se não há mídia, chama `maybeCaptureEtapa1PreDocsInput(env, st, userText, "envio_docs")`. Se retorna truthy → **return imediato**, saindo do handler antes de qualquer lógica documental. |
| **State lido** | `st._incoming_media`, `st.restricao`, `st.regularizacao_restricao`, `st.restricao_parceiro`, campos de `controle.etapa1_informativos` |
| **State escrito** | `controle.etapa1_informativos.informativo_moradia_*`, `controle.etapa1_informativos.informativo_trabalho_*` |
| **Canônico?** | ❌ **INTRUSO** — perguntas informativas não pertencem à fase documental |
| **Depende de envio_docs?** | ❌ Não — é coleta informativa de dossiê que deve ocorrer antes |

#### SEÇÃO 6 — Inicialização do canal docs (L26161–26172)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `!st.canal_docs_status`, seed com `canal_docs_status: "pendente"` e opções de canal (whatsapp/site/visita reativa) |
| **State escrito** | `canal_docs_status`, `canal_docs_opcoes_liberadas_json` |
| **Canônico?** | ✅ Sim — setup do canal de envio |

#### SEÇÃO 7 — Reconciliação de itens + recompute de progresso + consistency de pacote (L26174–26218)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | 3 sub-blocos: (A) reconcilia itens com dossiê via `reconcileEnvioDocsItensWithSavedDossier`, (B) recomputa progresso via `recomputeEnvioDocsProgress`, (C) se status = "completo" mas pacote incoerente → rebuild completo de análise + pacote correspondente |
| **State lido** | `envio_docs_itens_json`, `envio_docs_status`, `pacote_status`, `pacote_participantes_json`, `pacote_documentos_anexados_json` |
| **State escrito** | `envio_docs_itens_json`, `envio_docs_status`, `envio_docs_total_pendentes`, `envio_docs_total_recebidos`, `docs_status_geral`, `analise_docs_status`, `pacote_status` e campos do pacote |
| **Funções chamadas** | `reconcileEnvioDocsItensWithSavedDossier`, `recomputeEnvioDocsProgress`, `buildEnvioDocsPlausiveisPendentesConferenciaFromState`, `buildAnaliseDocsPayloadFromEnvio`, `buildPacoteCorrespondentePayloadFromState`, `buildEnvioDocsLegacySummaryPatch`, `isEnvioDocsAwaitingTypeConfirmation`, `decodeEnvioDocsLegacyPendingConfirmation`, `pickEnvioDocsPersistedPacotePatch`, `mapAnaliseDocsStatusToLegacyStatus` |
| **Canônico?** | ✅ Sim — motor central de reconciliação documental |
| **Bug técnico presente?** | ⚠️ Sim — comparação via `JSON.stringify` (L26176) é frágil |

#### SEÇÃO 8 — Handling de mídia/upload (L26220–26346)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `st._incoming_media` existe: (A) extrai e limpa flag, (B) chama `handleDocumentUpload(env, st, midia, {silent: true})`, (C) telemetria, (D) se erro → retorna com keepStage, (E) se silent mode → build resposta consolidada com matched/unmatched items + guidance, (F) se sem nextStage → computa se pacote ready para avançar para `finalizacao_processo`, (G) se tem nextStage → telemetria exit + step |
| **Funções chamadas** | `handleDocumentUpload`, `buildEnvioDocsUploadGuidanceLines`, `prettyDocLabel`, `envioDocsParticipanteLabel`, `isCorrespondentePacoteReady` |
| **Canônico?** | ✅ Sim — core do upload de documentos |
| **Depende de envio_docs?** | ✅ Absolutamente |

#### SEÇÃO 9 — Parse de texto (L26348–26354)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Normaliza texto, chama `parseEnvioDocsCanal`, computa `pronto` (aceitação) e `negar` (rejeição) |
| **Canônico?** | ✅ Sim — classificação de intenção textual |

#### SEÇÃO 10 — Elegibilidade de visita documental (L26356–26384)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Computa `elegivelVisitaDocumental` com 6 condições: contexto ativo, não enviado, não confirmou visita, não encerrado, mínimo 2 lembretes, sinal compatível com visita |
| **State lido** | `fase_conversa`, `envio_docs_status`, `processo_enviado_correspondente`, `visita_confirmada`, `envio_docs_lembrete_count` |
| **Funções chamadas** | `getOfficialFollowupCounters`, `getPersistedEtapaSignals`, `hasStateValue` |
| **Canônico?** | ✅ Sim — gate para rota presencial de documentos |

#### SEÇÃO 11 — Roteamento para visita (L26386–26442)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `elegivelVisitaDocumental`: monta patch de canal com `visita`, inicializa campos de visita, seta `visita_informativos_etapa1: true`, telemetria exit, retorna `step → "agendamento_visita"` |
| **State escrito** | `canal_docs_*`, `visita_*`, `controle.etapa1_informativos.visita_informativos_etapa1` |
| **Canônico?** | ✅ Sim — rota presencial é parte do fluxo documental |

#### SEÇÃO 12 — Canal site (L26445–26470)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `pediuSite` ou `recusaWhatsapp`: monta patch com `canal_docs_escolhido: "site"`, persiste, responde com orientação. Fica em `envio_docs`. |
| **State escrito** | `canal_docs_*` |
| **Canônico?** | ✅ Sim — rota digital alternativa |

#### SEÇÃO 13 — Resumo de pendências (L26472–26490)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `pediuResumoPendencias`: reconcilia itens, chama `envioDocsResumoPendencias`, responde com lista. Fica em `envio_docs`. |
| **Funções chamadas** | `reconcileEnvioDocsItensWithSavedDossier`, `generateChecklistForDocs`, `envioDocsResumoPendencias` |
| **Canônico?** | ✅ Sim — auto-serviço do cliente sobre pendências |

#### SEÇÃO 14 — Confirmação de tipo de documento (text signal) (L26492–26505)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `isEnvioDocsAwaitingTypeConfirmation(st)` e lista já enviada: trata texto como `text_signal` para `handleDocumentUpload`. Avança para `finalizacao_processo` se pacote ready. |
| **Canônico?** | ✅ Sim — confirmação de classificação de doc |

#### SEÇÃO 15 — Cliente aceita receber lista (L26507–26549)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `pronto && !listaEnviada`: reconcilia/gera checklist, chama `buildEnvioDocsListaMensagens`, seta `docs_lista_enviada: true`, `envio_docs_lista_enviada: true`, `canal_docs_escolhido: "whatsapp"`. Fica em `envio_docs`. |
| **State escrito** | `docs_lista_enviada`, `envio_docs_lista_enviada`, `envio_docs_lembrete_count`, `envio_docs_ultimo_pedido_em`, `canal_docs_*`, `envio_docs_itens_json` |
| **Funções chamadas** | `reconcileEnvioDocsItensWithSavedDossier`, `generateChecklistForDocs`, `buildEnvioDocsListaMensagens` |
| **Canônico?** | ✅ Sim — momento central do envio da lista |

#### SEÇÃO 16 — Cliente adia (L26551–26573)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `negar`: seta `docs_lista_enviada: false`, telemetria, responde "Sem problema". Fica em `envio_docs`. |
| **Canônico?** | ✅ Sim — tratamento de adiamento |

#### SEÇÃO 17 — Primeira vez no stage (L26575–26593)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `!listaEnviada` (e não casou com nenhum path anterior): telemetria `prompt_first_time`, responde "Me confirma com *sim* que já libero a lista objetiva dos documentos." |
| **Canônico?** | ✅ Sim — prompt de abertura |

#### SEÇÃO 18 — Telemetria de texto sem mídia + lembrete (L26595–26612)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Emite `text_without_media`, incrementa `envio_docs_lembrete_count`, atualiza `envio_docs_ultimo_pedido_em` |
| **State escrito** | `envio_docs_lembrete_count`, `envio_docs_ultimo_pedido_em` |
| **Canônico?** | ✅ Sim — contagem de interações / observabilidade |

#### SEÇÃO 19 — Acompanhamento de status (L26614–26702)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Se `pediuAcompanhamentoStatus`: reconcilia itens, verifica pendências. Se sem pendências → verifica status de correspondente/retorno. Branches: (A) docs em análise, (B) aguardando correspondente, (C) aprovado → `agendamento_visita`, (D) reprovado, (E) pendência documental, (F) pendência risco, (G) status genérico |
| **State lido** | `envio_docs_itens_json`, `corr_publicacao_status`, `retorno_correspondente_status`, `retorno_correspondente_motivo`, `processo_enviado_correspondente`, `aguardando_retorno_correspondente` |
| **State escrito** | Campos de visita (só no branch C - aprovado) |
| **Canônico?** | ✅ Sim — auto-serviço de status + integração com correspondente |

#### SEÇÃO 20 — Fallback (L26704–26708)
| Aspecto | Detalhe |
|---------|---------|
| **O que faz** | Catch-all: "Pode me enviar os documentos por aqui mesmo". Fica em `envio_docs`. |
| **Canônico?** | ✅ Sim — fallback obrigatório |

---

## 3. CONTAMINAÇÕES COMPROVADAS

### 3.1 Contaminação única confirmada

**Onde:** Linhas 26156–26159

```javascript
if (!st._incoming_media) {
  const infoStepPreDocs = await maybeCaptureEtapa1PreDocsInput(env, st, userText, "envio_docs");
  if (infoStepPreDocs) return infoStepPreDocs;
}
```

**Por que contamina:**
1. É executada **em toda entrada de texto** no stage `envio_docs`
2. Roda **antes** de: seed de canal (S6), reconciliação (S7), parse de texto (S9), confirmação de lista (S15), primeiro prompt (S17)
3. Se `shouldCollectInformativosPreDocs(st)` retorna `true` (tem restrição/regularização) e há slots pendentes → **retorna cedo**, o handler inteiro é abortado
4. O `"sim"` do usuário (que deveria acionar S15 ou já acionar S17 na vez anterior) nunca chega ao parse — é interpretado como `isGenericAckText` e pula o slot, mas na próxima mensagem volta ao loop

**Cadeia de execução do ciclo quebrado:**
```
1. Usuário chega em envio_docs (vindo de regularizacao ou restricao)
2. L26157: maybeCaptureEtapa1PreDocsInput → retorna pergunta de moradia
3. Usuário responde com texto (ex: "Zona Sul")
4. Re-entra em envio_docs → L26157 → retorna pergunta de trabalho
5. Usuário responde com texto (ex: "Centro")
6. Re-entra em envio_docs → L26157 → retorna null (slots preenchidos)
7. Cai em S17 (prompt "Me confirma com sim...")
8. Usuário responde "sim"
9. Re-entra em envio_docs → L26157 → retorna null → cai em S15 → lista enviada
```

**Resultado:** 3–4 mensagens extras antes de ver os documentos.

### 3.2 Existe outra interceptação informativa indevida?

**Não.** Fora do bloco L26156–26159, não há nenhuma outra chamada a funções informativas dentro do case `envio_docs`. As demais chamadas a `buildEtapa1InformativosPatch` dentro de `envio_docs` (linhas 26409, 26669) são para setar a flag `visita_informativos_etapa1: true` — o que é **canônico** (ativa informativos de visita no `agendamento_visita`, não aqui).

### 3.3 Localização da mesma função nos stages corretos

`maybeCaptureEtapa1PreDocsInput` também é chamada em `regularizacao_restricao` / `regularizacao_restricao_parceiro`:

| Linha | Contexto | Quando chama |
|-------|----------|-------------|
| L25770 | `regularizacao_restricao` entry, se `regularizacao_restricao` já respondida | Antes de qualquer branch |
| L25931 | Caso "sim" (parceiro sem restrição do titular) | Após gateAntesEnvioDocs() |
| L25945 | Caso "sim" (default) | Após gateAntesEnvioDocs() |
| L26021 | Caso "não" | Após gateAntesEnvioDocs() |
| L26056 | Caso "talvez" | Após gateAntesEnvioDocs() |

Estes pontos são **parcialmente corretos** — estão no lugar certo do funil (pós-gate, pré-envio_docs), mas nem todos os caminhos para envio_docs passam por eles (ver Bloco 5).

---

## 4. MAPA COMPLETO DA ESCOLARIDADE

### 4.1 Único ponto de existência

| Aspecto | Detalhe |
|---------|---------|
| **Função** | `maybeHandleTitularCursoSuperiorPreCtps` (L1524–1552) |
| **Parser** | `parseTitularCursoSuperiorStatus` (L1515–1522) |
| **Renda resolver** | `resolveRendaTitularParaCursoSuperior` (L1499–1513) |
| **Chamada em** | Stage `ctps_36` (L24302–24304) |
| **Campo** | `titular_curso_superior_status` em `controle.etapa1_informativos` |
| **Valores** | `"concluido"`, `"cursando"`, `"nao"` |

### 4.2 Condições de disparo

```javascript
// L24302-24304 (dentro de ctps_36)
if (!respostaCtpsValida) {
  const cursoSuperiorInformativo = await maybeHandleTitularCursoSuperiorPreCtps(env, st, userText, "ctps_36");
  if (cursoSuperiorInformativo) return cursoSuperiorInformativo;
}

// L1527 (dentro da função)
if (!Number.isFinite(rendaTitular) || rendaTitular > 3500 || jaCapturado) return null;
```

**Trigger triplo:**
1. Resposta do usuário **não** casa com `"sim"` / `"nao"` / `"nao sei"` (respostas válidas de CTPS)
2. Renda do titular ≤ R$ 3.500
3. Ainda não capturado

### 4.3 Status

| Verificação | Resultado |
|-------------|-----------|
| Existe no código? | ✅ Sim, em `ctps_36` |
| Está viva em runtime? | ⚠️ **Parcialmente** — trigger muito restritivo |
| Está duplicada? | ❌ Não existe em nenhum outro lugar |
| Está em lugar errado? | ⚠️ Está em lugar **frágil** — depende de resposta inválida de CTPS |
| Persiste no state? | ✅ Via `buildEtapa1InformativosPatch` |
| É lida pelo dossiê? | ✅ Via `getPersistedEtapaSignals` (L1255) |

### 4.4 Problema real

A escolaridade quase nunca é perguntada porque:
- A maioria dos usuários responde "sim", "não" ou "não sei" à pergunta CTPS → `respostaCtpsValida = true` → escolaridade nem é tentada
- Mesmo se resposta inválida, precisa de renda ≤ 3500
- É efetivamente um **ponto quase-morto** no funil

### 4.5 Onde deve ficar na nova arquitetura

A escolaridade deve migrar para o **bloco pré-docs informativo**. Razões:
- É puramente informativa (não bloqueia gates, não afeta decisão)
- Enriquece dossiê/correspondente
- No bloco próprio terá trigger confiável (não depende de resposta inválida)
- Pode ter condição simplificada: perguntar quando renda ≤ 3500 (sem depender de CTPS)

---

## 5. ARQUITETURA CORRETA DO NOVO BLOCO PRÉ-DOCS

### 5.1 Requisito obrigatório

**Todo caminho que hoje desemboca em `envio_docs` deve primeiro passar pelo bloco informativo.** Não apenas os que vêm de regularização/restrição.

### 5.2 Mapa completo de TODOS os entry points em `envio_docs` (externos)

| # | Linha | Stage de origem | Condição | Passa por informativos hoje? |
|---|-------|----------------|----------|:---:|
| 1 | L25242 | `restricao` | Modo familiar + restrições coletadas | ❌ **NÃO** |
| 2 | L25674 | `restricao_parceiro` | Parceiro sem restrição (nao) | ❌ **NÃO** |
| 3 | L25720 | `restricao_parceiro` | Parceiro incerto | ❌ **NÃO** |
| 4 | L25939 | `regularizacao_restricao_parceiro` | "sim" + titular sem restrição | ✅ Sim (L25931) |
| 5 | L25954 | `regularizacao_restricao` | "sim" (default) | ✅ Sim (L25945) |
| 6 | L26031 | `regularizacao_restricao` | "não" + valor ≤ 1000 | ✅ Sim (L26021) |
| 7 | L26065 | `regularizacao_restricao` | "talvez" | ✅ Sim (L26056) |
| 8 | L22546 | `regularizacao_restricao_p3` | titular já fechado | ❌ **NÃO** |
| 9 | L2537 | seed/init | Estado inicial semeado | N/A (bootstrap) |
| 10 | L3093–3120 | test fixtures | Fixtures de teste | N/A (teste) |

**Resultado:** 4 caminhos reais (#1, #2, #3, #8) chegam em `envio_docs` **sem passar por informativos**. Os caminhos #4–#7 passam, mas a chamada está no lugar errado (retorna com `stageForPrompt = stage` — ou seja, o informativo roda com o stage de regularizacao, não de envio_docs, e potencialmente re-entra em loop).

### 5.3 Caminhos internos (loop em envio_docs)

Estes são step() calls que mantêm o usuário em `envio_docs`:

| Linha | Contexto | Detalhe |
|-------|----------|---------|
| L26245 | Upload falhou | `resposta.keepStage \|\| "envio_docs"` |
| L26323 | Upload OK, pacote não ready | Fica em envio_docs |
| L26332 | Upload OK, sem nextStage | Fica em envio_docs |
| L26469 | Canal site definido | Fica em envio_docs |
| L26484/26489 | Resumo pendências | Fica em envio_docs |
| L26504 | Type confirmation | Fica em envio_docs (ou finalizacao) |
| L26548 | Lista aceita | Fica em envio_docs |
| L26572 | Adiado | Fica em envio_docs |
| L26592 | Primeiro prompt | Fica em envio_docs |
| L26627/46/53 | Status pendente | Fica em envio_docs |
| L26683/89/96/700 | Retorno correspondente | Fica em envio_docs |
| L26707 | Fallback | Fica em envio_docs |

Estes NÃO precisam de bloco pré-docs — o usuário já está dentro da fase documental.

### 5.4 Arquitetura proposta

**Implementação recomendada:** Sub-bloco nos pontos de saída, não um novo stage.

```
ANTES (hoje):
  regularizacao_restricao → [informativos misturados] → step("envio_docs")
  restricao (familiar)    → step("envio_docs")  // SEM informativos
  restricao_parceiro      → step("envio_docs")  // SEM informativos
  regularizacao_p3        → step("envio_docs")  // SEM informativos

DEPOIS (proposta):
  regularizacao_restricao → [informativos no gate de saída] → step("envio_docs")
  restricao (familiar)    → [informativos no gate de saída] → step("envio_docs")
  restricao_parceiro      → [informativos no gate de saída] → step("envio_docs")
  regularizacao_p3        → [informativos no gate de saída] → step("envio_docs")
  
  envio_docs              → [SEM informativos — apenas docs]
```

### 5.5 Perguntas do bloco pré-docs

| # | Pergunta | Campo | Obrigatória? | Condição |
|---|----------|-------|:---:|----------|
| 1 | Local de moradia (titular) | `informativo_moradia_p1` | Sim | Sempre |
| 2 | Local de trabalho (titular) | `informativo_trabalho_p1` | Sim | Sempre |
| 3 | Local de moradia (P2) | `informativo_moradia_p2` | Cond. | Se composição conjunta/familiar |
| 4 | Local de trabalho (P2) | `informativo_trabalho_p2` | Cond. | Se composição conjunta/familiar |
| 5 | Local de moradia (P3) | `informativo_moradia_p3` | Cond. | Se `p3_required && p3_done` |
| 6 | Local de trabalho (P3) | `informativo_trabalho_p3` | Cond. | Se `p3_required && p3_done` |
| 7 | Escolaridade (titular) | `titular_curso_superior_status` | Cond. | Se renda ≤ R$ 3.500 |

### 5.6 Pontos exatos que precisam de injeção do bloco

| # | Linha | Stage | Ação necessária |
|---|-------|-------|-----------------|
| 1 | L25242 | `restricao` | Adicionar chamada informativa ANTES do `step("envio_docs")` |
| 2 | L25674 | `restricao_parceiro` (não) | Adicionar chamada informativa ANTES do `step("envio_docs")` |
| 3 | L25720 | `restricao_parceiro` (incerto) | Adicionar chamada informativa ANTES do `step("envio_docs")` |
| 4 | L25939 | `regularizacao_restricao_parceiro` (sim) | **Já tem** (L25931) — manter |
| 5 | L25954 | `regularizacao_restricao` (sim) | **Já tem** (L25945) — manter |
| 6 | L26031 | `regularizacao_restricao` (não) | **Já tem** (L26021) — manter |
| 7 | L26065 | `regularizacao_restricao` (talvez) | **Já tem** (L26056) — manter |
| 8 | L22546 | `regularizacao_restricao_p3` | Adicionar chamada informativa ANTES do `step("envio_docs")` |

### 5.7 Condição `shouldCollectInformativosPreDocs`

Hoje (L1377–1383):
```javascript
function shouldCollectInformativosPreDocs(st = {}) {
  return (
    hasStateValue(st.restricao) ||
    hasStateValue(st.regularizacao_restricao) ||
    hasStateValue(st.restricao_parceiro)
  );
}
```

**Decisão de design:**
- Se informativos devem ser perguntados para **TODOS** os leads → mudar para `return true;`
- Se devem ser perguntados apenas para leads com restrição → manter como está
- **Recomendação:** Manter como está inicialmente (menor risco). Se necessário ampliar, fazer em etapa separada.

---

## 6. TABELA: FICA / SAI / MIGRA

### Responsabilidades do `envio_docs`

| # | Responsabilidade | Seção | Linhas | Veredicto | Justificativa |
|---|-----------------|-------|--------|:---------:|---------------|
| 1 | Helper parseEnvioDocsCanal | S1 | 26096–26120 | **FICA** | Parseia intenção de canal — exclusivo de envio_docs |
| 2 | Build/persist dossiê | S2 | 26122–26136 | **FICA** | Pré-requisito documental |
| 3 | Computação listaEnviada | S3 | 26137–26139 | **FICA** | Gate central do fluxo |
| 4 | Telemetria de entrada | S4 | 26141–26154 | **FICA** | Observabilidade |
| 5 | maybeCaptureEtapa1PreDocsInput | S5 | 26156–26159 | **SAI** | ❌ Intruso — perguntas informativas não são docs |
| 6 | Seed canal docs | S6 | 26161–26172 | **FICA** | Setup de canal |
| 7 | Reconciliação + progresso + pacote | S7 | 26174–26218 | **FICA** | Motor de reconciliação documental |
| 8 | Handling de mídia/upload | S8 | 26220–26346 | **FICA** | Core do upload |
| 9 | Parse de texto | S9 | 26348–26354 | **FICA** | Classificação de intenção |
| 10 | Elegibilidade visita documental | S10 | 26356–26384 | **FICA** | Gate de rota presencial |
| 11 | Roteamento para visita | S11 | 26386–26442 | **FICA** | Transição canônica para agendamento |
| 12 | Canal site | S12 | 26445–26470 | **FICA** | Rota digital alternativa |
| 13 | Resumo pendências | S13 | 26472–26490 | **FICA** | Auto-serviço do cliente |
| 14 | Confirmação tipo doc | S14 | 26492–26505 | **FICA** | Classificação de doc |
| 15 | Aceitar lista | S15 | 26507–26549 | **FICA** | Momento central do envio |
| 16 | Adiar lista | S16 | 26551–26573 | **FICA** | Tratamento de rejeição |
| 17 | Primeiro prompt | S17 | 26575–26593 | **FICA** | Prompt de abertura |
| 18 | Telemetria texto + lembrete | S18 | 26595–26612 | **FICA** | Observabilidade + contagem |
| 19 | Acompanhamento status | S19 | 26614–26702 | **FICA** | Auto-serviço + correspondente |
| 20 | Fallback | S20 | 26704–26708 | **FICA** | Catch-all obrigatório |

### Resumo

| Veredicto | Contagem | Itens |
|-----------|:--------:|-------|
| **FICA** em envio_docs | 19 | Seções 1–4, 6–20 |
| **SAI** de envio_docs | 1 | Seção 5 (L26156–26159) |
| **MIGRA** para bloco pré-docs | 0 | Nada migra — a chamada que sai (S5) já existe nos stages anteriores |

### O que vai para o bloco pré-docs

| Item | Onde está hoje | Para onde vai |
|------|---------------|---------------|
| `maybeCaptureEtapa1PreDocsInput` | L26156–26159 em `envio_docs` | REMOVIDO daqui. Já existe em `regularizacao_restricao` (L25770, 25931, 25945, 26021, 26056) |
| Cobertura dos caminhos sem informativos | Não existe | ADICIONADO em `restricao` (L25242), `restricao_parceiro` (L25674, L25720), `regularizacao_restricao_p3` (L22546) |
| Escolaridade | L24302–24304 em `ctps_36` | MIGRADO para `getNextInformativoPreDocsSlot` (adicionado à sequência) |

---

## 7. SEPARAÇÃO ENTRE ARQUITETURA E BUG TÉCNICO DE DOCS

### Problema A — Arquitetura errada (contaminação informativa)

| Aspecto | Detalhe |
|---------|---------|
| **O que é** | `maybeCaptureEtapa1PreDocsInput` dentro de `envio_docs` (L26156–26159) |
| **Efeito** | Perguntas de moradia/trabalho interceptam antes da lógica documental |
| **Quem afeta** | Leads com restrição que chegam em envio_docs sem informativos preenchidos |
| **Gravidade** | Alta — experiência quebrada, impressão de loop |
| **Solução** | Remover de envio_docs, garantir cobertura nos 8 entry points |

### Problema B — Bugs técnicos de docs

| Sub-bug | Onde | O que | Gravidade |
|---------|------|-------|-----------|
| B.1 | L26176 | `JSON.stringify` comparison para detectar mudança em itens reconciliados — frágil a ordem de propriedades | Média |
| B.2 | L12803 (dentro de `handleDocumentUpload`) | `target?.tipo` pode ser null se target não resolvido | Média |
| B.3 | L12321–12322 (dentro de `handleDocumentUpload`) | Sync in-memory de `envio_docs_itens_json` acontece dentro da função, criando timing issue se chamada múltiplas vezes | Média |
| B.4 | L26189–26217 | Quando `envio_docs_status === "completo"` mas pacote incoerente → rebuild completo. Pode mascarar inconsistências | Baixa |

### São independentes?

| Pergunta | Resposta |
|----------|---------|
| A causa B? | ❌ Não — a contaminação não causa bugs de checklist |
| B causa A? | ❌ Não — bugs de docs não causam perguntas informativas |
| A agrava B? | ⚠️ **Indiretamente** — o informativo intercepta antes da reconciliação (S7), então o usuário pode entrar e sair de envio_docs sem que reconciliação execute |
| B agrava A? | ❌ Não |
| Podem ser tratados separadamente? | ✅ **Sim** — são completamente independentes |

### Recomendação

Resolver A primeiro (arquitetura), validar, depois resolver B (bugs técnicos). Não misturar.

---

## 8. PLANO CIRÚRGICO POSTERIOR (sem aplicar)

### Etapa 1 — Remover intruso de envio_docs

**Ação:** Deletar linhas 26156–26159 de `envio_docs`

```javascript
// REMOVER ESTAS 4 LINHAS:
if (!st._incoming_media) {
  const infoStepPreDocs = await maybeCaptureEtapa1PreDocsInput(env, st, userText, "envio_docs");
  if (infoStepPreDocs) return infoStepPreDocs;
}
```

**Risco:** Baixo — os 5 call sites em regularizacao_restricao já cobrem a maioria dos caminhos.  
**Impacto se falhar:** Informativos param de ser perguntados para leads que passam por regularizacao sem ter respondido. Reversível.

### Etapa 2 — Cobrir caminhos sem informativos

**Ação:** Adicionar `maybeCaptureEtapa1PreDocsInput` antes de cada `step("envio_docs")` nos 4 caminhos descobertos:

| # | Linha | Stage | O que adicionar |
|---|-------|-------|-----------------|
| 1 | Antes de L25242 | `restricao` | `const infoStep = await maybeCaptureEtapa1PreDocsInput(env, st, userText, stage); if (infoStep) return infoStep;` |
| 2 | Antes de L25674 | `restricao_parceiro` (não) | Idem |
| 3 | Antes de L25720 | `restricao_parceiro` (incerto) | Idem |
| 4 | Antes de L22546 | `regularizacao_restricao_p3` | Idem |

**Risco:** Baixo — adiciona cobertura onde não existia.  
**Impacto se falhar:** Leads destes caminhos ficam sem informativos (mesmo comportamento de hoje). Reversível.

### Etapa 3 — Migrar escolaridade

**Ação:**
1. Adicionar `titular_curso_superior_status` à sequência de `getNextInformativoPreDocsSlot` (L1348–1360), com condição `renda ≤ 3500`
2. Adicionar builder de pergunta em `buildInformativoPreDocsQuestion` (L1362–1375)
3. Remover chamada em `ctps_36` (L24302–24304)
4. Manter parser `parseTitularCursoSuperiorStatus` intacto

**Risco:** Médio — muda o ponto onde escolaridade é perguntada.  
**Impacto se falhar:** Escolaridade para de ser capturada temporariamente. Reversível.

### Etapa 4 — Validação completa

**Ação:**
1. Testar fluxo: restricao → informativos → envio_docs → confirmação → lista → upload
2. Cenários: com restrição (titular), com restrição (parceiro), sem restrição, modo familiar, modo conjunto, P3
3. Confirmar que envio_docs **não** chama funções informativas
4. Confirmar que todos os 8 entry points passam por informativos

**Risco:** Zero (é validação).

### Etapa 5 — Tratar bugs técnicos de docs (independente)

**Ação:**
1. B.1: Substituir `JSON.stringify` comparison (L26176) por comparação estrutural
2. B.2: Tratar target null em handleDocumentUpload
3. B.3: Avaliar timing de sync
4. B.4: Avaliar rebuild de pacote

**Risco:** Médio — mexe na lógica de docs.  
**Ordem:** Pode ser paralelizado com Etapas 1–3.

### Ordem segura

```
Etapa 1 (remover intruso) → Etapa 2 (cobrir caminhos) → Etapa 4 (validar) → Etapa 3 (escolaridade) → Etapa 5 (bugs)
```

**Por que esta ordem:**
- Etapa 1 é cirúrgica (4 linhas removidas) e de menor risco
- Etapa 2 fecha a cobertura antes que qualquer lead fique sem informativos
- Etapa 4 valida que o ciclo quebrado sumiu
- Etapa 3 é de risco médio e pode esperar a validação
- Etapa 5 é independente e pode ser feita em paralelo

---

## APÊNDICE: Referência rápida de funções

| Função | Linha | Papel |
|--------|-------|-------|
| `shouldCollectInformativosPreDocs` | 1377–1383 | Gate: decide se informativos devem ser coletados |
| `getNextInformativoPreDocsSlot` | 1348–1360 | Retorna próximo slot pendente (moradia/trabalho) |
| `getComposicaoParticipantesInformativos` | 1325–1340 | Lista participantes do informativo |
| `informativoPreDocsField` | 1342–1346 | Gera nome do campo |
| `buildInformativoPreDocsQuestion` | 1362–1375 | Monta mensagem da pergunta |
| `maybeCaptureEtapa1PreDocsInput` | 1403–1419 | Orquestra captura de informativo |
| `isGenericAckText` | 1395–1401 | Filtra respostas genéricas |
| `maybeHandleTitularCursoSuperiorPreCtps` | 1524–1552 | Pergunta escolaridade |
| `parseTitularCursoSuperiorStatus` | 1515–1522 | Parse resposta escolaridade |
| `resolveRendaTitularParaCursoSuperior` | 1499–1513 | Resolve renda para condição escolaridade |
| `getEtapa1InformativosBag` | 1204–1209 | Acessa bag de informativos |
| `getEtapa1InformativoValue` | 1301–1305 | Lê valor de informativo |
| `buildEtapa1InformativosPatch` | 1307–1319 | Monta patch para persistência |
| `getPersistedEtapaSignals` | 1231–1270 | Lê todos sinais persistidos (dossiê) |
| `parseEnvioDocsCanal` | 26096–26120 | Classifica intenção de canal (local a envio_docs) |
| `reconcileEnvioDocsItensWithSavedDossier` | 8441+ | Reconcilia checklist com dossiê |
| `generateChecklistForDocs` | 8341+ | Gera checklist baseado no perfil |
| `recomputeEnvioDocsProgress` | 8707–8730 | Recalcula progresso de docs |
| `handleDocumentUpload` | 12256+ | Processa upload de documento |
| `buildEnvioDocsListaMensagens` | 8243+ | Formata lista de docs para envio |
| `envioDocsResumoPendencias` | — | Gera resumo de pendências |
| `isCorrespondentePacoteReady` | — | Verifica se pacote pronto para correspondente |
| `isEnvioDocsAwaitingTypeConfirmation` | — | Verifica se aguarda confirmação de tipo |
| `isEnvioDocsConversationalFlowComplete` | — | Verifica completude semântica |
| `gateAntesEnvioDocs` | 25845–25897 | Gate único antes de envio_docs (em regularizacao) |
| `buildDocumentDossierFromState` | — | Monta dossiê a partir do state |
| `persistDocumentDossier` | — | Persiste dossiê |
