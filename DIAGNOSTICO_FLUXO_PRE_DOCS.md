# DIAGNÓSTICO ABSOLUTO + PLANO DE REORGANIZAÇÃO CIRÚRGICA
## Fluxo pré-docs / envio_docs

> **Data:** 2026-03-29  
> **Modo:** READ-ONLY — sem patch, sem implementação  
> **Escopo:** Pente fino completo do fluxo, separação de problemas, proposta de arquitetura

---

## 1. RESUMO EXECUTIVO

### Problema central
O `envio_docs` está contaminado por perguntas puramente informativas (local de moradia, local de trabalho) que são interceptadas **antes** de qualquer lógica de confirmação ou exibição de lista de documentos. Isso causa o seguinte ciclo quebrado:

```
1. Usuário chega em envio_docs
2. Sistema intercepta com pergunta informativa (moradia/trabalho)
3. Usuário responde
4. Sistema re-entra em envio_docs e faz nova pergunta informativa
5. Só depois de todas informativas, sistema mostra confirmação ("Me confirma com sim que já libero a lista")
6. Usuário diz "sim"
7. Sistema re-entra em envio_docs → informativos já respondidos → finalmente libera lista
```

O problema piora porque a mesma função `maybeCaptureEtapa1PreDocsInput` é chamada **também** dentro de `regularizacao_restricao`/`regularizacao_restricao_parceiro`, o que significa que em alguns fluxos as perguntas já foram feitas antes de chegar em `envio_docs`, mas em outros não.

### Segundo problema: escolaridade (curso superior)
A pergunta de escolaridade (`titular_curso_superior_status`) existe **exclusivamente** no stage `ctps_36`, chamada via `maybeHandleTitularCursoSuperiorPreCtps`. Ela:
- Só é ativada para renda ≤ R$ 3.500
- Só é disparada quando a resposta do usuário **não** casa com padrões válidos de CTPS
- Está **viva em runtime** mas com trigger frágil (depende de resposta não-reconhecida)
- **NÃO** está duplicada em outro lugar do funil
- **NÃO** está dentro de `envio_docs`

### Terceiro problema: bug técnico de docs
O bug técnico de docs (target/checklist/pending) é **independente** da contaminação informativa. São dois problemas separados que se manifestam no mesmo stage mas por razões diferentes.

---

## 2. ONDE O `envio_docs` FOI CONTAMINADO

### 2.1 Ponto exato da contaminação

**Arquivo:** `Enova worker.js`  
**Linha:** 26156-26159

```javascript
if (!st._incoming_media) {
  const infoStepPreDocs = await maybeCaptureEtapa1PreDocsInput(env, st, userText, "envio_docs");
  if (infoStepPreDocs) return infoStepPreDocs;
}
```

Este bloco é executado **em TODA entrada de texto** no stage `envio_docs`, **antes de qualquer lógica de documentos**. É a primeira coisa que roda depois da telemetria de entrada (linha 26144) e da verificação de `listaEnviada` (linha 26137).

### 2.2 Cadeia exata de execução

```
MENSAGEM DO USUÁRIO CHEGA → case "envio_docs" (L26095)
  ↓
  Monta dossiê se necessário (L26122-26135)
  ↓
  Verifica listaEnviada (L26137-26139)
  ↓
  Telemetria de entrada (L26144-26154)
  ↓
  *** INTERCEPTAÇÃO INFORMATIVA *** (L26156-26159)
  if (!st._incoming_media) {
    const infoStepPreDocs = await maybeCaptureEtapa1PreDocsInput(...)
    if (infoStepPreDocs) return infoStepPreDocs  ← SAIR CEDO, NÃO CHEGA AOS DOCS
  }
  ↓  (só chega aqui se informativos estão completos ou inativos)
  Seed canal docs se necessário (L26161-26172)
  ↓
  Reconcilia itens e progresso (L26174-26218)
  ↓
  Se mídia → handleDocumentUpload (L26223-26346)
  ↓
  Se texto → parse canal/pronto/negar (L26348-26354)
  ↓
  Se pronto && !listaEnviada → gera e envia lista (L26510-26548)
  ↓
  Se !listaEnviada → prompt de confirmação (L26578-26592)
```

### 2.3 O bug em cenário real

**Cenário:** Usuário com restrição (`st.restricao = true`) que chega em `envio_docs` SEM ter respondido informativos na fase anterior.

```
Passo 1: regularizacao_restricao diz "sim" → nextStage = "envio_docs"
Passo 2: Entra em envio_docs
         L26157: maybeCaptureEtapa1PreDocsInput → retorna pergunta de moradia
         Sistema: "Antes de te passar os documentos, me conta rapidinho o local de moradia seu."
Passo 3: Usuário responde "Zona Sul"
         Entra em envio_docs novamente
         L26157: maybeCaptureEtapa1PreDocsInput → retorna pergunta de trabalho
         Sistema: "Perfeito. Agora me conta o local de trabalho seu."
Passo 4: Usuário responde "Centro"
         Entra em envio_docs novamente
         L26157: maybeCaptureEtapa1PreDocsInput → retorna null (tudo preenchido)
         L26578: !listaEnviada → mostra confirmação
         Sistema: "Me confirma com sim que já libero a lista objetiva dos documentos."
Passo 5: Usuário responde "sim"
         Entra em envio_docs novamente
         L26157: maybeCaptureEtapa1PreDocsInput → retorna null (já preenchido)
         L26510: pronto && !listaEnviada → finalmente envia a lista
```

**Resultado:** 3 mensagens extras antes de ver os documentos. O usuário esperava docs e recebeu perguntas sobre moradia/trabalho.

### 2.4 Segundo ponto de chamada: regularizacao_restricao

**Linhas:** 25767, 25770-25771, 25931-25932, 25945-25946, 26021-26022, 26056-26057

```javascript
// L25767
const maybeAskInformativosPreDocs = async () => maybeCaptureEtapa1PreDocsInput(env, st, userText, stage);

// L25770-25771 (quando regularizacao_restricao já foi respondida)
const infoStepAtual = await maybeAskInformativosPreDocs();
if (infoStepAtual) return infoStepAtual;

// L25931-25932 (caso "sim", parceiro sem restrição)
const infoStepParceiro = await maybeAskInformativosPreDocs();
if (infoStepParceiro) return infoStepParceiro;

// L25945-25946 (caso "sim", default)
const infoStepSim = await maybeAskInformativosPreDocs();
if (infoStepSim) return infoStepSim;

// L26021-26022 (caso "não")
const infoStepNao = await maybeAskInformativosPreDocs();
if (infoStepNao) return infoStepNao;

// L26056-26057 (caso "talvez")
const infoStepTalvez = await maybeAskInformativosPreDocs();
if (infoStepTalvez) return infoStepTalvez;
```

### 2.5 Cenários de duplicidade de captura

| Cenário | Perguntado em regularizacao? | Perguntado em envio_docs? | Resultado |
|---------|:---:|:---:|---|
| Tem restrição, responde sim/não/talvez e informativos completam na mesma fase | ✅ | ❌ (null) | OK mas misturado com regularização |
| Tem restrição, responde sim e ainda falta informativo | ✅ parcial | ✅ resíduo | Ruim — re-pergunta em envio_docs |
| Sem restrição (vai direto de restricao → envio_docs) | ❌ | ❌ | OK — shouldCollect retorna false |
| Tem restrição mas informativos nunca perguntados | ❌ | ✅ total | Péssimo — contamina envio_docs inteiro |

### 2.6 Flags/campos causadores

| Campo | Onde causa | Efeito |
|-------|-----------|--------|
| `st.restricao` | `shouldCollectInformativosPreDocs` (L1379) | Se tem valor → habilita informativos |
| `st.regularizacao_restricao` | `shouldCollectInformativosPreDocs` (L1380) | Se tem valor → habilita informativos |
| `st.restricao_parceiro` | `shouldCollectInformativosPreDocs` (L1381) | Se tem valor → habilita informativos |
| `controle.etapa1_informativos.informativo_moradia_p1` | `getNextInformativoPreDocsSlot` (L1354) | Se vazio → pendente |
| `controle.etapa1_informativos.informativo_trabalho_p1` | `getNextInformativoPreDocsSlot` (L1354) | Se vazio → pendente |

---

## 3. INVENTÁRIO COMPLETO DAS PERGUNTAS INFORMATIVAS

### 3.1 Perguntas pré-docs (moradia/trabalho)

| # | Pergunta | Campo no state | Stage(s) onde é feita | Viva em runtime? | Decisória? | Lugar correto? |
|---|----------|---------------|----------------------|:---:|:---:|:---:|
| 1 | Local de moradia (titular) | `informativo_moradia_p1` | `regularizacao_restricao`, `envio_docs` | ✅ | ❌ Informativa | ❌ Errado em envio_docs |
| 2 | Local de trabalho (titular) | `informativo_trabalho_p1` | `regularizacao_restricao`, `envio_docs` | ✅ | ❌ Informativa | ❌ Errado em envio_docs |
| 3 | Local de moradia (parceiro) | `informativo_moradia_p2` | `regularizacao_restricao`, `envio_docs` | ✅ | ❌ Informativa | ❌ Errado em envio_docs |
| 4 | Local de trabalho (parceiro) | `informativo_trabalho_p2` | `regularizacao_restricao`, `envio_docs` | ✅ | ❌ Informativa | ❌ Errado em envio_docs |
| 5 | Local de moradia (P3) | `informativo_moradia_p3` | `regularizacao_restricao`, `envio_docs` | ✅ (se p3) | ❌ Informativa | ❌ Errado em envio_docs |
| 6 | Local de trabalho (P3) | `informativo_trabalho_p3` | `regularizacao_restricao`, `envio_docs` | ✅ (se p3) | ❌ Informativa | ❌ Errado em envio_docs |

**Persistência:** Todas em `controle.etapa1_informativos` (via `buildEtapa1InformativosPatch`).  
**Uso:** Dossiê/correspondente apenas. Não afetam gates.  
**Condição de ativação:** `shouldCollectInformativosPreDocs(st)` — requer pelo menos um de: `restricao`, `regularizacao_restricao`, `restricao_parceiro` com valor.

### 3.2 Perguntas de visita (agendamento_visita)

| # | Pergunta | Campo no state | Stage | Viva? | Decisória? | Lugar correto? |
|---|----------|---------------|-------|:---:|:---:|:---:|
| 7 | Reserva para entrada | `visita_reserva_entrada_tem` | `agendamento_visita` | ✅ | ❌ Informativa | ✅ Correto |
| 8 | FGTS disponível | `visita_fgts_disponivel` | `agendamento_visita` | ✅ | ❌ Informativa | ✅ Correto |
| 9 | Decisor adicional | `visita_decisor_adicional_visita` | `agendamento_visita` | ✅ | ❌ Informativa | ✅ Correto |
| 10 | Nome do decisor | `visita_decisor_adicional_nome` | `agendamento_visita` | ✅ (se decisor=true) | ❌ Informativa | ✅ Correto |

**Persistência:** Todas em `controle.etapa1_informativos`.  
**Condição:** `visita_informativos_etapa1 === true` (flag setada quando visita é ativada, L26409).  
**Nota:** Estas estão no lugar correto (agendamento_visita). Não contaminam envio_docs.

### 3.3 Perguntas de autônomo

| # | Pergunta | Campo no state | Stage | Viva? | Decisória? | Lugar correto? |
|---|----------|---------------|-------|:---:|:---:|:---:|
| 11 | Profissão/atividade | `titular_autonomo_profissao_atividade` | `autonomo_ir_pergunta` | ✅ | ❌ Informativa | ✅ Correto |
| 12 | MEI/PJ status | `titular_autonomo_mei_pj_status` | `autonomo_ir_pergunta` | ✅ | ❌ Informativa | ✅ Correto |
| 13 | Estabilidade da renda | `titular_autonomo_renda_estabilidade` | `autonomo_ir_pergunta` | ✅ | ❌ Informativa | ✅ Correto |

**Persistência:** Todas em `controle.etapa1_informativos`.  
**Nota:** Estas estão no lugar correto (autonomo_ir_pergunta). Não contaminam envio_docs.

### 3.4 Pergunta de escolaridade

| # | Pergunta | Campo no state | Stage | Viva? | Decisória? | Lugar correto? |
|---|----------|---------------|-------|:---:|:---:|:---:|
| 14 | Curso superior status | `titular_curso_superior_status` | `ctps_36` | ⚠️ Parcialmente | ❌ Informativa | ⚠️ Ver Bloco 4 |

**Detalhamento no Bloco 4 abaixo.**

---

## 4. MAPA COMPLETO DA ESCOLARIDADE NO FUNIL

### 4.1 Único ponto de existência

**Arquivo:** `Enova worker.js`  
**Função:** `maybeHandleTitularCursoSuperiorPreCtps` — Linhas 1524-1552  
**Chamada em:** Stage `ctps_36` — Linha 24303  
**Campo:** `titular_curso_superior_status`  
**Armazenamento:** `controle.etapa1_informativos`

### 4.2 Condições para disparo

```javascript
// L1524-1527
const rendaTitular = resolveRendaTitularParaCursoSuperior(st);  // st.renda ou st.renda_total_para_fluxo
const jaCapturado = hasStateValue(getEtapa1InformativoValue(st, "titular_curso_superior_status"));
if (!Number.isFinite(rendaTitular) || rendaTitular > 3500 || jaCapturado) return null;
```

**Condições necessárias para perguntar:**
1. `renda` ou `renda_total_para_fluxo` deve ser numérica e finita
2. Valor da renda ≤ R$ 3.500
3. Ainda não capturado

**Condição adicional no caller (L24302):**
```javascript
if (!respostaCtpsValida) {
  const cursoSuperiorInformativo = await maybeHandleTitularCursoSuperiorPreCtps(...);
```

A pergunta **SÓ é feita quando a resposta do usuário NÃO casa com as respostas válidas de CTPS** (que são exatamente `"sim"`, `"nao"`, `"nao sei"`). Isso significa:
- Se o usuário responde "sim" à pergunta CTPS → escolaridade NUNCA é perguntada
- Se o usuário responde "não" → escolaridade NUNCA é perguntada
- Se o usuário responde "não sei" → escolaridade NUNCA é perguntada
- Se o usuário responde qualquer outra coisa (texto livre) → aí sim é perguntada

### 4.3 Status da escolaridade

| Aspecto | Status |
|---------|--------|
| Existe no código? | ✅ Sim, em `ctps_36` |
| Está viva em runtime? | ⚠️ **Parcialmente** — só dispara para renda ≤ 3500 E resposta não-válida de CTPS |
| Está duplicada? | ❌ Não há outro ponto no código |
| Está morta/fantasma? | ⚠️ **Quase morta** — o trigger é tão restritivo que na maioria dos casos não dispara |
| Persiste no state? | ✅ Quando capturada, vai para `controle.etapa1_informativos.titular_curso_superior_status` |
| É lida pelo dossiê? | ✅ Sim, em `getPersistedEtapaSignals` (L1255) |

### 4.4 Análise de risco

**Risco 1: Ponto quase-morto.** A escolaridade depende de:
- Renda ≤ R$ 3.500 (condição de faixa)
- Resposta do usuário não ser "sim"/"nao"/"nao sei" no contexto de CTPS
- A maioria dos usuários responde "sim" ou "não" à pergunta CTPS, então a escolaridade quase nunca é perguntada

**Risco 2: Não está no lugar errado, mas está no lugar frágil.** Estar dentro de `ctps_36` como fallback de resposta não-reconhecida faz sentido contextual (se o usuário está confuso e o sistema aproveita para perguntar), mas é arquiteturalmente fraco.

**Risco 3: Sem duplicidade.** Não há outro ponto no funil que pergunte sobre escolaridade. A pergunta existe **apenas** em `ctps_36`.

### 4.5 Lugar correto para escolaridade na nova arquitetura

A escolaridade deve migrar para o **trilho pré-docs informativo** proposto no Bloco 5. Razões:
- É puramente informativa (não bloqueia gates)
- Enriquece o dossiê
- Atualmente quase nunca é perguntada (trigger frágil)
- No trilho próprio, terá trigger confiável e previsível

---

## 5. ARQUITETURA CORRETA DO NOVO TRILHO PRÉ-DOCS INFORMATIVO

### 5.1 Princípio

Criar um **bloco lógico** (não necessariamente um novo stage) que:
- Executa DEPOIS de todos os gates decisórios (restrição, regularização, parceiro, P3)
- Executa ANTES da confirmação da lista de documentos
- É transparente para o trilho mecânico (não muda nextStage, não muda gates)
- Captura informações **somente informativas** para dossiê/correspondente

### 5.2 Posição exata no funil

```
... 
→ restricao (decisório ✅)
→ restricao_parceiro (decisório ✅)
→ regularizacao_restricao (decisório ✅)
→ regularizacao_restricao_parceiro (decisório ✅)
→ regularizacao_restricao_p3 (decisório ✅)
───────────────────────────────────
│                                 │
│  ★ TRILHO PRÉ-DOCS INFORMATIVO │  ← AQUI
│     (moradia, trabalho,         │
│      escolaridade, FGTS,        │
│      reserva entrada)           │
│                                 │
───────────────────────────────────
→ envio_docs: confirmação da lista (mecânico ✅)
→ envio_docs: exibição da lista (mecânico ✅)
→ envio_docs: upload de documentos (mecânico ✅)
→ finalizacao_processo / agendamento_visita
```

### 5.3 Perguntas que entram no trilho informativo

| # | Pergunta | Campo | Obrigatória? | Condição |
|---|----------|-------|:---:|----------|
| 1 | Local de moradia (titular) | `informativo_moradia_p1` | Sim | Sempre |
| 2 | Local de trabalho (titular) | `informativo_trabalho_p1` | Sim | Sempre |
| 3 | Local de moradia (parceiro/P2) | `informativo_moradia_p2` | Condicional | Se `financiamento_conjunto` ou `somar_renda` |
| 4 | Local de trabalho (parceiro/P2) | `informativo_trabalho_p2` | Condicional | Se `financiamento_conjunto` ou `somar_renda` |
| 5 | Local de moradia (P3) | `informativo_moradia_p3` | Condicional | Se `p3_required && p3_done` |
| 6 | Local de trabalho (P3) | `informativo_trabalho_p3` | Condicional | Se `p3_required && p3_done` |
| 7 | Escolaridade (titular) | `titular_curso_superior_status` | Condicional | Se renda ≤ R$ 3.500 |
| 8 | FGTS disponível | `fgts_disponivel_pre_docs` | Opcional | Sempre (se não capturado em visita) |
| 9 | Reserva para entrada | `reserva_entrada_tem_pre_docs` | Opcional | Sempre (se não capturado em visita) |

### 5.4 Ordem de execução

```
1. moradia_p1 → trabalho_p1
2. moradia_p2 → trabalho_p2 (se aplicável)
3. moradia_p3 → trabalho_p3 (se aplicável)
4. escolaridade (se renda ≤ 3500)
5. reserva_entrada (se não capturado em agendamento_visita)
6. fgts_disponivel (se não capturado em agendamento_visita)
```

### 5.5 Detalhes de implementação (conceitual)

**Opção A: Novo stage `pre_docs_informativos`**
- Mais limpo, mais isolado
- Requer ajustar nextStage de `regularizacao_restricao` → `pre_docs_informativos` → `envio_docs`
- Impacto médio nos gates

**Opção B: Sub-bloco dentro de `regularizacao_restricao` (antes do envio para envio_docs)**
- Menos invasivo
- Já existe parcialmente (linhas 25770, 25931, 25945, 26021, 26056)
- Bastaria:
  1. Remover os informativos de dentro de `envio_docs` (L26156-26159)
  2. Garantir que `regularizacao_restricao` sempre pergunta os informativos antes de transicionar para `envio_docs`
  3. Mover escolaridade para o mesmo bloco

**Recomendação:** Opção B (sub-bloco no gate de saída de regularizacao/restricao). Razões:
- Já existe parcialmente implementado
- Não cria novo stage (menos risco de quebrar routing)
- Mantém o trilho mecânico inalterado
- `envio_docs` fica limpo

### 5.6 Condição crítica: fluxo SEM restrição

Hoje, `shouldCollectInformativosPreDocs` só retorna `true` se o usuário **tem** restrição. Usuários sem restrição passam direto para `envio_docs` sem informativos.

**Na nova arquitetura**, se quisermos que TODOS os usuários respondam informativos:
- Remover a condição `shouldCollectInformativosPreDocs` ou torná-la `true` sempre
- OU criar um gate explícito antes de `envio_docs` para todos os caminhos

Se quisermos manter apenas para usuários com restrição:
- A lógica atual de `shouldCollectInformativosPreDocs` já serve
- Basta mover a chamada para FORA de `envio_docs`

### 5.7 O que NÃO pode mais ficar dentro de `envio_docs`

| O que remover | Linha atual | Motivo |
|---------------|-------------|--------|
| `maybeCaptureEtapa1PreDocsInput` | L26156-26159 | Contamina a fase de documentos com perguntas informativas |

**Soberano em `envio_docs` (deve permanecer):**
- Toda lógica de canal docs (L26096-26120, L26161-26172)
- Reconciliação de itens (L26174-26218)
- handleDocumentUpload (L26223-26346)
- Parse de texto/confirmação (L26348-26592)
- Lógica de visita documental (L26356-26442)
- Status/pendências/acompanhamento (L26444-26708)

---

## 6. SEPARAÇÃO ENTRE ARQUITETURA ERRADA E BUG TÉCNICO DE DOCS

### Problema A — Arquitetura errada (contaminação informativa)

| Aspecto | Detalhe |
|---------|---------|
| **O que é** | Perguntas informativas (moradia/trabalho) dentro de `envio_docs` |
| **Onde está** | L26156-26159 (call site em envio_docs) |
| **O que causa** | Usuário diz "sim" para ver docs → recebe pergunta de moradia em vez de lista |
| **Quem afeta** | Todos os usuários com restrição que chegam em envio_docs sem ter respondido informativos |
| **Gravidade** | Alta — experiência quebrada, impressão de loop |
| **Independente do bug B?** | ✅ Totalmente independente |

### Problema B — Bug técnico de docs (target/checklist/pending)

| Aspecto | Detalhe |
|---------|---------|
| **O que é** | Problemas na reconciliação de checklist, target resolution, e status de pendentes |
| **Onde está** | L26174-26218 (reconciliação), L12256+ (handleDocumentUpload), L8441+ (reconcile function) |
| **Manifestações conhecidas** | |
| B.1 | `JSON.stringify` comparison (L26176) — frágil a ordem de propriedades |
| B.2 | Target pode ser null em `handleDocumentUpload` (L12803) |
| B.3 | Sync in-memory de `envio_docs_itens_json` acontece dentro de `handleDocumentUpload` (L12321-12322), criando timing issue |
| B.4 | `pacote_status` incoerente quando `envio_docs_status === "completo"` mas pacote não está montado (L26189-26217) |
| **Quem afeta** | Todos os usuários na fase de upload de documentos |
| **Gravidade** | Média-alta — docs podem parecer não recebidos ou lista inconsistente |
| **Independente do problema A?** | ✅ Totalmente independente |

### Problema A é agravado por B?

**Não diretamente**, mas a contaminação informativa **atrasa** a entrada real na lógica de docs, o que pode mascarar quando o bug B se manifesta. Se o usuário passa 3-4 mensagens respondendo informativos antes de ver a lista, e depois encontra um bug de checklist, a experiência total é muito pior.

### Problema B é agravado por A?

**Sim, indiretamente.** Como o informativo intercepta ANTES da reconciliação de itens (L26174), o usuário pode entrar e sair de `envio_docs` múltiplas vezes sem que a reconciliação seja executada com contexto atualizado. Isso não causa o bug B diretamente, mas pode expor edge cases.

---

## 7. PLANO CIRÚRGICO DE IMPLEMENTAÇÃO POSTERIOR (sem aplicar)

### Etapa 1: Mover perguntas informativas para trilho próprio

**Ação:**
1. **REMOVER** a chamada `maybeCaptureEtapa1PreDocsInput` de dentro de `envio_docs` (L26156-26159)
2. **GARANTIR** que todas as saídas de `regularizacao_restricao`/`regularizacao_restricao_parceiro` para `envio_docs` passam pelo informativo antes de transicionar
3. Nos caminhos que vão direto de `restricao` → `envio_docs` (sem regularização), adicionar a chamada informativa antes da transição

**Locais a modificar:**
- L26156-26159: **REMOVER** (envio_docs)
- L25770-25771: **MANTER** (já está no lugar certo — regularizacao_restricao quando já respondida)
- L25931-25932: **MANTER** (caso sim, parceiro)
- L25945-25946: **MANTER** (caso sim, default)
- L26021-26022: **MANTER** (caso não)
- L26056-26057: **MANTER** (caso talvez)
- Caminhos diretos restricao → envio_docs: **ADICIONAR** chamada informativa

**Risco:** Baixo. O trilho mecânico não muda. Apenas muda onde as perguntas são feitas.
**Impacto:** Usuários com restrição respondem informativos ANTES de chegar em envio_docs. Envio_docs fica limpo.

**Cuidado crítico:**
- Verificar TODOS os caminhos que levam a `envio_docs`:
  - De `restricao` (L25242 — modo familiar, restrição coletada)
  - De `restricao_parceiro` (L25674, L25720 — sem restrição/incerto)
  - De `regularizacao_restricao`/`regularizacao_restricao_parceiro` (L25939, L25954, L26031, L26065)
  - De `regularizacao_restricao_p3` (L22546)
- Em cada caminho, garantir que os informativos são perguntados ANTES do `step(..., "envio_docs")`

### Etapa 2: Limpar duplicidades (incluindo escolaridade)

**Ação:**
1. **MOVER** `maybeHandleTitularCursoSuperiorPreCtps` de `ctps_36` para o trilho informativo pré-docs
2. **REMOVER** a chamada em `ctps_36` (L24302-24304)
3. **AJUSTAR** `getNextInformativoPreDocsSlot` para incluir escolaridade na sequência
4. **AJUSTAR** `shouldCollectInformativosPreDocs` se necessário (escolaridade não depende de restrição, depende de renda)
5. **VERIFICAR** que `getPersistedEtapaSignals` (L1255) continua lendo o campo corretamente

**Risco:** Médio. Mudar o ponto onde escolaridade é perguntada requer testar:
- Que não há efeito colateral em `ctps_36` (a pergunta de CTPS deve funcionar sem o fallback de escolaridade)
- Que o campo persiste corretamente no novo ponto

**Impacto:** Escolaridade passa a ser perguntada de forma confiável (não mais dependente de resposta inválida de CTPS).

### Etapa 3: Validar que `envio_docs` volta a ser só docs

**Ação:**
1. Confirmar que `envio_docs` **não** chama nenhuma função informativa
2. Testar o fluxo completo:
   - restricao → regularizacao → informativos → envio_docs → confirmação → lista → upload
3. Testar cenários:
   - Com restrição (titular)
   - Com restrição (parceiro)
   - Sem restrição
   - Modo familiar
   - Modo conjunto

**Risco:** Baixo (é validação).
**Impacto:** Garantia de que a reorganização não quebrou nada.

### Etapa 4: Tratar bug técnico de docs restante

**Ação (independente das etapas 1-3):**
1. Substituir `JSON.stringify` comparison (L26176) por comparação estrutural robusta
2. Tratar target null em `handleDocumentUpload` (L12803)
3. Avaliar timing de sync de `envio_docs_itens_json` (L12321-12322)
4. Testar reconciliação de checklist com cenários de edge (itens fora de ordem, participantes removidos)

**Risco:** Médio (mexe na lógica de docs).
**Impacto:** Resolve bugs de checklist/upload que são independentes da contaminação.

### Ordem segura de execução

```
Etapa 1 → Etapa 3 → Etapa 2 → Etapa 4
```

**Por quê esta ordem:**
- Etapa 1 (mover informativos) é a mais urgente e de menor risco
- Etapa 3 (validação) confirma que Etapa 1 funcionou
- Etapa 2 (escolaridade) é de risco médio e pode ser feita depois da validação
- Etapa 4 (bug técnico) é independente e pode ser paralelizada com Etapa 2

### Resumo de risco por etapa

| Etapa | Risco | Impacto se falhar | Reversível? |
|-------|-------|-------------------|:-----------:|
| 1: Mover informativos | Baixo | Informativos param de ser perguntados | ✅ |
| 2: Escolaridade | Médio | Escolaridade para de ser capturada temporariamente | ✅ |
| 3: Validação | Zero | N/A | N/A |
| 4: Bug técnico | Médio | Upload pode falhar em edge cases | ✅ |

---

## APÊNDICE: Funções e linhas-chave referenciadas

| Função | Linha | Propósito |
|--------|-------|-----------|
| `shouldCollectInformativosPreDocs` | 1377-1383 | Decide se informativos devem ser coletados |
| `getNextInformativoPreDocsSlot` | 1348-1360 | Retorna próximo slot informativo pendente |
| `getComposicaoParticipantesInformativos` | 1325-1340 | Lista participantes do informativo |
| `informativoPreDocsField` | 1342-1346 | Gera nome do campo no state |
| `buildInformativoPreDocsQuestion` | 1362-1375 | Monta mensagem da pergunta |
| `maybeCaptureEtapa1PreDocsInput` | 1403-1419 | Orquestra captura de informativo |
| `isGenericAckText` | 1395-1401 | Filtra respostas genéricas |
| `parseInformativoBoolean` | 1385-1393 | Parse sim/não |
| `maybeHandleTitularCursoSuperiorPreCtps` | 1524-1552 | Pergunta escolaridade |
| `parseTitularCursoSuperiorStatus` | 1515-1522 | Parse resposta escolaridade |
| `resolveRendaTitularParaCursoSuperior` | 1499-1513 | Resolve renda para condição escolaridade |
| `nextVisitaInformativoPendente` | 1554-1563 | Retorna próximo informativo de visita |
| `buildVisitaInformativoQuestion` | 1565-1594 | Monta pergunta de visita |
| `maybeHandleEtapa1VisitaInformativoInput` | 1596-1623 | Orquestra captura de informativo de visita |
| `getEtapa1InformativosBag` | 1204-1209 | Acessa bag de informativos |
| `getEtapa1InformativoValue` | 1301-1305 | Lê valor de informativo |
| `buildEtapa1InformativosPatch` | 1307-1319 | Monta patch para persistência |
| `getPersistedEtapaSignals` | 1231-1270 | Lê todos sinais persistidos (dossiê) |
| `reconcileEnvioDocsItensWithSavedDossier` | 8441-8465 | Reconcilia checklist com dossiê |
| `generateChecklistForDocs` | 8341-8393 | Gera checklist baseado no perfil |
| `recomputeEnvioDocsProgress` | 8707-8730 | Recalcula progresso de docs |
| `handleDocumentUpload` | 12256+ | Processa upload de documento |
| `gateAntesEnvioDocs` | 25845-25897 | Gate único antes de envio_docs |
