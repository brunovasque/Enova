# DIAGNÓSTICO READ-ONLY PESADO — TOPO DO FUNIL (REGRESSÃO)

**Data:** 2026-04-04
**Status:** DIAGNÓSTICO FECHADO — causa raiz identificada com reprodução
**Branch:** copilot/diagnostico-read-only-topo-do-funil
**Tipo:** READ-ONLY — sem correção aplicada

---

## WORKFLOW_ACK
Lido e seguido: `schema/CODEX_WORKFLOW.md`. Fase 1 — DIAGNÓSTICO READ-ONLY.

---

## SUMMARY

A regressão real do topo do funil é causada por **dois problemas encadeados**:

1. **`case "inicio_programa"` resolve corretamente** — "sim, me explique sobre o programa" → `nao=true` (pede explicação). O parser NÃO erra aqui.
2. **O branch `nao` de `inicio_programa` avança para `inicio_nome` E pergunta "Qual seu nome completo?"**
3. **O próximo input do usuário ("Me explique") chega em `case "inicio_nome"`** — que NÃO tem parser semântico, apenas extrai nome bruto.
4. **"Me explique" é tratado como NOME** — salva `nome = "Me explique"`, `primeiroNome = "Me"`.
5. **O bot responde: "Ótimo, Me 👌" e avança para `inicio_nacionalidade`**.

A regressão NÃO é do parser de `inicio_programa`. A causa raiz é que **`inicio_nome` aceita qualquer texto de 2+ caracteres como nome válido**, sem nenhuma validação semântica, e isso transforma pedidos de explicação repetidos em "nomes" falsos.

---

## REPRODUÇÃO EXATA DO CASO OBSERVADO EM PROD

### Sequência observada:
```
Usuário: "Oi Enova, sim, me explique sobre o programa"
  → stage: inicio_programa
  → normalizado: "oi enova sim me explique sobre o programa"
  → sim=false (isYes("oi enova sim me explique sobre o programa") = false — não é exact match)
  → nao=true (contém "explique")
  → RESULTADO: explica o programa + avança para inicio_nome
  → Bot fala: "Perfeito, te explico rapidinho 😊 [...] Pra começarmos, qual o seu *nome completo*?"
  → stage salvo: inicio_nome

Usuário: "Me explique"
  → stage: inicio_nome
  → rawNome = "Me explique"
  → após limpeza de prefixos: NÃO remove nada (o regex de prefixos é: meu nome é|me chamo|me chama|sou|sou o|sou a|aqui é)
  → "me chama" no regex NÃO bate com "Me explique" — "me" sozinho não é prefixo
  → rawNome permanece "Me explique"
  → rawNome.length = 11 >= 2 ✓
  → partes = ["Me", "explique"] — 2 partes, ambas >= 2 chars ✓
  → partes.length = 2, entre 1 e 6 ✓
  → SALVA COMO NOME: nome = "Me explique", primeiroNome = "Me"
  → Bot responde: "Ótimo, Me 👌"
  → Avança para: inicio_nacionalidade
  → Bot pergunta: "Agora me diz: você é brasileiro(a) ou estrangeiro(a)?"
```

**Reprodução confirmada com código real.** O output exato é:
- `nome = "Me explique"`
- `primeiroNome = "Me"`
- Resposta: `"Ótimo, Me 👌"`
- Próximo stage: `inicio_nacionalidade`

---

## DIAGNÓSTICO CASO A CASO

### CASO A — "Oi Enova, sim, me explique sobre o programa"

| Item | Valor |
|---|---|
| **stage de entrada** | `inicio_programa` |
| **normalização** | `"oi enova sim me explique sobre o programa"` |
| **parser que atuou** | Detecção `nao` por substring: `nt.includes("explique")` → true |
| **sim/nao/ambíguo** | sim=false, nao=true |
| **safe_stage_signal** | Não se aplica (nao vence direto) |
| **resposta montada** | Explicação do programa + "Qual o seu nome completo?" |
| **stage final** | `inicio_nome` |
| **houve avanço?** | Sim — correto. O pedido de explicação FOI atendido. |
| **slot preenchido?** | Nenhum |
| **captura indevida de nome?** | NÃO neste step |

**Nota:** `isYes("oi enova sim me explique sobre o programa")` é **false** porque o `isYes` faz match exato em `Set(["sim","s","ss","ok"])` — o texto normalizado completo não é "sim". Os checks de phrase (`includes`) também não batem. Então a palavra "sim" embutida na frase NÃO vence. O `nao` vence por `nt.includes("explique")`.

O parser de `inicio_programa` **está correto** para este caso.

### CASO B — "Me explique" (stage: inicio_nome)

| Item | Valor |
|---|---|
| **stage de entrada** | `inicio_nome` |
| **normalização** | Raw input usado diretamente (não passa por normalizeText) |
| **parser que atuou** | Regex de prefixo NÃO bate ("Me explique" ≠ "me chamo", "me chama", etc.) |
| **rawNome após limpeza** | `"Me explique"` (inalterado) |
| **partes** | `["Me", "explique"]` — 2 partes válidas |
| **validação** | length ≥ 2 ✓, partes entre 1-6 ✓ |
| **resposta montada** | `"Ótimo, Me 👌"` + `"Agora me diz: brasileiro ou estrangeiro?"` |
| **stage final** | `inicio_nacionalidade` |
| **houve avanço?** | SIM — indevido |
| **slot preenchido?** | `nome = "Me explique"` — **INDEVIDO** |
| **captura indevida de nome?** | **SIM** — "Me explique" salvo como nome |

**⚠️ AQUI ESTÁ A CAUSA RAIZ.** `inicio_nome` não tem nenhuma inteligência semântica. Aceita qualquer texto que tenha entre 2 chars e 6 palavras.

### CASO C — "sim" (stage: inicio_programa)

| Item | Valor |
|---|---|
| **stage de entrada** | `inicio_programa` |
| **normalização** | `"sim"` |
| **parser** | `isYes("sim")` → true (exact match) |
| **sim/nao/ambíguo** | sim=true, nao=false |
| **resposta** | `"Ótimo, então vamos direto ao ponto 😉"` + pede nome |
| **stage final** | `inicio_nome` |
| **Correto?** | ✅ Sim |

### CASO D — "não" (stage: inicio_programa)

| Item | Valor |
|---|---|
| **stage de entrada** | `inicio_programa` |
| **normalização** | `"nao"` |
| **parser** | `isNo("nao")` → true (exact match) |
| **sim/nao/ambíguo** | sim=false, nao=true |
| **resposta** | Explicação do programa + pede nome |
| **stage final** | `inicio_nome` |
| **Correto?** | ✅ Sim |

### CASO E — "me explica o programa" (stage: inicio_programa)

| Item | Valor |
|---|---|
| **stage de entrada** | `inicio_programa` |
| **normalização** | `"me explica o programa"` |
| **parser** | `nt.includes("explica")` → true (nao vence) |
| **sim/nao/ambíguo** | sim=false, nao=true |
| **resposta** | Explicação do programa + pede nome |
| **stage final** | `inicio_nome` |
| **Correto?** | ✅ Sim |

### CASO F — "quero que explique" (stage: inicio_programa)

| Item | Valor |
|---|---|
| **stage de entrada** | `inicio_programa` |
| **normalização** | `"quero que explique"` |
| **parser** | `nt.includes("quero que explique")` → true (nao vence) |
| **sim/nao/ambíguo** | sim=false, nao=true |
| **resposta** | Explicação + pede nome |
| **stage final** | `inicio_nome` |
| **Correto?** | ✅ Sim |

### CASO G — "não sei como funciona" (stage: inicio_programa)

| Item | Valor |
|---|---|
| **stage de entrada** | `inicio_programa` |
| **normalização** | `"nao sei como funciona"` |
| **parser** | `nt.includes("nao sei")` → true E `nt.includes("como funciona")` → true (nao vence) |
| **sim/nao/ambíguo** | sim=false, nao=true |
| **resposta** | Explicação + pede nome |
| **stage final** | `inicio_nome` |
| **Correto?** | ✅ Sim |

---

## RESPOSTAS ÀS PERGUNTAS DO DIAGNÓSTICO

### 1) "sim, me explique sobre o programa" está sendo resolvido como quê exatamente?

Como `nao=true` (pediu explicação). O parser resolve corretamente. `isYes` retorna false porque faz exact match e o texto completo normalizado `"sim me explique sobre o programa"` não é `"sim"`. O `nt.includes("explique")` vence no lado `nao`. **O parser de inicio_programa NÃO é o problema.**

### 2) O "sim" está vencendo o "quero explicação"?

**NÃO.** No parser de `inicio_programa`, `isYes` faz exact match — `"sim me explique sobre o programa"` ≠ `"sim"`. O "explique" como substring vence no lado `nao`. O parser está correto.

### 3) Por que "Me explique" não gera a explicação do programa?

Porque "Me explique" chega como input em `case "inicio_nome"` (NÃO em `inicio_programa`). O `inicio_nome` não tem parser semântico — trata QUALQUER texto como candidato a nome. "Me explique" passa todos os filtros:
- Length ≥ 2: `"Me explique"` tem 11 chars ✓
- Partes entre 1-6: `["Me", "explique"]` = 2 partes ✓
- Prefixo "me chama"/"me chamo" NÃO bate com "Me explique" (regex exige `me chama` ou `me chamo`)

### 4) Por que depois disso o sistema já foi para nacionalidade?

Porque `inicio_nome` SEMPRE avança para `inicio_nacionalidade` quando aceita o "nome". Ao aceitar "Me explique" como nome, salva e avança.

### 5) O nome "Me" ou parte do texto está sendo salvo indevidamente como nome?

**SIM.** `nome = "Me explique"` salvo via `upsertState(env, st.wa_id, { nome: "Me explique" })`.
`primeiroNome = "Me"` usado na resposta: `"Ótimo, Me 👌"`.

### 6) Houve pulo estrutural real de stage ou só superfície errada?

**Houve pulo estrutural real.** O stage avança de `inicio_nome` para `inicio_nacionalidade` indevidamente, salvando um nome falso no processo. Não é só superfície.

### 7) Qual foi a regressão introduzida pelas últimas mudanças do topo?

As últimas mudanças do topo (PR #510, commits recentes) focaram em:
- Expandir a detecção de `nao` no `inicio_programa` para cobrir frases como "explique", "me explica", "quero entender"
- Isso **resolveu** o loop de reprompt em `inicio_programa`

Porém, a correção **criou um novo caminho de regressão**: ao resolver corretamente o pedido de explicação e avançar para `inicio_nome`, o cenário onde o usuário envia um SEGUNDO pedido de explicação agora atinge `inicio_nome` — que não tem parser semântico e aceita tudo como nome.

A regressão NÃO é do parser, mas do **encadeamento**: o fix correto em `inicio_programa` expôs a fragilidade de `inicio_nome`.

### 8) Qual é a causa raiz exata, com anchor de código?

**Causa raiz: `case "inicio_nome"` (L22321-L22429) aceita qualquer texto de 2+ chars e 1-6 palavras como nome válido, sem validação semântica.**

Anchors exatos:
- **L22336**: `let rawNome = (userText || "").trim();` — usa texto cru
- **L22339**: Regex de prefixo só remove "meu nome é", "me chamo", "me chama", "sou", "aqui é" — NÃO remove "me" sozinho
- **L22349**: `if (!rawNome || rawNome.length < 2)` — "Me explique" tem 11 chars, passa
- **L22375**: `if (partes.length < 1 || partes.length > 6)` — 2 partes, passa
- **L22397-L22398**: `nomeCompleto = rawNome; primeiroNome = partes[0]` → "Me explique", "Me"
- **L22401-L22405**: `upsertState(env, st.wa_id, { nome: nomeCompleto })` — persiste nome falso
- **L22424**: `Ótimo, ${primeiroNome} 👌` → "Ótimo, Me 👌"
- **L22427**: `"inicio_nacionalidade"` — avança indevidamente

---

## FLUXO DETALHADO DO CENÁRIO PROD

```
Msg 1: "Oi Enova, sim, me explique sobre o programa"
  ├─ runFunnel(env, st, userText)
  │  ├─ stage = st.fase_conversa = "inicio_programa"
  │  ├─ isReset? NO
  │  ├─ global greeting interceptor? NO (stage === "inicio_programa" — excluído)
  │  ├─ shouldTriggerCognitiveAssist("inicio_programa", text)?
  │  │  ├─ greetingHints: /^(oi+|...).test("oi enova sim...") → YES
  │  │  └─ returns TRUE → cognitive assist fires
  │  │  └─ sets st.__cognitive_reply_prefix (se LLM reply útil)
  │  ├─ offtrackGuard? shouldConsiderOfftrack? "programa"→ no heuristic match, no "?"
  │  │  └─ offtrack = false
  │  ├─ switch (stage) → case "inicio_programa"
  │  │  ├─ nt = "oi enova sim me explique sobre o programa"
  │  │  ├─ sim: isYes(nt)? NO (not exact match). ja sei? NO. sei sim? NO.
  │  │  │   → sim = FALSE
  │  │  ├─ nao: isNo(nt)? NO. nao sei? NO. explica? YES (nt.includes("explica")? → NO actually)
  │  │  │   Wait: "oi enova sim me explique sobre o programa" → contains "explica"? NO
  │  │  │   But contains "explique"? YES → nao = TRUE
  │  │  ├─ !sim && !nao → NO (nao is true)
  │  │  ├─ nao is true → branch "NÃO conhece → explica"
  │  │  ├─ step(env, st, [explicação + "Qual nome completo?"], "inicio_nome")
  │  │  └─ stage persistido: inicio_nome
  │  └─ Bot envia: explicação do programa + pede nome

Msg 2: "Me explique"
  ├─ runFunnel(env, st, userText)
  │  ├─ stage = st.fase_conversa = "inicio_nome"
  │  ├─ isReset? NO
  │  ├─ global greeting interceptor? NO (isGreeting = false para "me explique")
  │  ├─ shouldTriggerCognitiveAssist("inicio_nome", "Me explique")?
  │  │  ├─ nomeHints: /depois eu mando|...|porque/.test("me explique") → NO
  │  │  └─ returns FALSE → cognitive NOT triggered
  │  ├─ offtrackGuard? shouldConsiderOfftrack("Me explique")?
  │  │  ├─ nt = "me explique". Contains "?"? NO
  │  │  ├─ Heuristic regex match? NO (no fgts/valor/preco/etc.)
  │  │  └─ offtrack = false
  │  ├─ switch (stage) → case "inicio_nome"
  │  │  ├─ rawNome = "Me explique"
  │  │  ├─ prefix regex test: /^(meu nome e|me chamo|me chama|sou|...)/i.test("Me explique")?
  │  │  │   "me chamo" → NO ("Me explique" doesn't start with "me chamo")
  │  │  │   "me chama" → NO ("Me explique" doesn't start with "me chama")
  │  │  │   NO PREFIX REMOVED
  │  │  ├─ rawNome = "Me explique" (unchanged)
  │  │  ├─ rawNome.length = 11 >= 2 → PASSES
  │  │  ├─ partes = ["Me", "explique"] → length 2, between 1-6 → PASSES
  │  │  ├─ nomeCompleto = "Me explique"
  │  │  ├─ primeiroNome = "Me"
  │  │  ├─ upsertState({nome: "Me explique"}) → PERSISTS FALSE NAME
  │  │  ├─ step(env, st, ["Ótimo, Me 👌", "brasileiro ou estrangeiro?"], "inicio_nacionalidade")
  │  │  └─ stage persistido: inicio_nacionalidade
  │  └─ Bot envia: "Ótimo, Me 👌" + "brasileiro ou estrangeiro?"
```

---

## ONDE HOUVE REGRESSÃO

A regressão é **indireta**. O fix de `inicio_programa` (expandir "explique"/"quero entender" no `nao` detector) está correto e resolve o loop que existia antes. Porém:

1. **Antes do fix**: "me explique" em `inicio_programa` caía no bloco ambíguo (`!sim && !nao`) e fazia reprompt — o usuário ficava preso em loop, mas NÃO salvava nome falso.
2. **Depois do fix**: "me explique" é corretamente resolvido como `nao` → explica programa → avança para `inicio_nome` → o PRÓXIMO "me explique" é capturado como nome.

O fix corrigiu o loop mas **expôs a fragilidade pré-existente de `inicio_nome`**.

---

## PONTOS INVESTIGADOS QUE NÃO SÃO CAUSA

- `hasClearStageAnswer` — funciona corretamente; para "inicio_nome", retorna true para "Me explique" (raw.length ≥ 2, 2 partes), o que é parte do problema
- `shouldTriggerCognitiveAssist` — para `inicio_nome`, NÃO dispara para "Me explique" (não bate nos nomeHints)
- `buildNextActionPrompt` / `ensureReplyHasNextAction` — não relevante para este cenário
- `safe_stage_signal` — não relevante (o cenário não envolve cognitive taking control)
- `offtrackGuard` — NÃO dispara para "Me explique" em `inicio_nome` (sem "?" e sem palavras-chave de offtrack)
- Interceptador global de saudação — NÃO dispara para "Me explique" (não é saudação)
- `step()` — funciona corretamente, apenas persiste o stage que recebe

---

## O QUE PRECISARÁ SER CORRIGIDO (SEM CORRIGIR AGORA)

### Correção necessária em `case "inicio_nome"` (L22321-L22429):

1. **Adicionar validação semântica antes de aceitar como nome.** Rejeitar textos que contenham palavras como "explica", "explique", "programa", "funciona", "entender", etc.

2. **Possível abordagem**: criar uma lista negativa (deny-list) de tokens que indicam que o texto é um pedido/comando e não um nome. Exemplo:
   ```
   const DENY_TOKENS = /\b(explica|explique|programa|funciona|entender|saber|ajuda|como|sobre|quero)\b/i;
   if (DENY_TOKENS.test(rawNome)) → reprompt "Não consegui pegar seu nome..."
   ```

3. **Alternativa**: redirecionar para `inicio_programa` quando o texto em `inicio_nome` parecer um pedido de explicação (re-route).

4. **Adicionar `shouldTriggerCognitiveAssist` trigger** para `inicio_nome` que cubra frases de explicação (o bloco B de triggers NÃO cobre "explica/explique").

5. **Considerar** tratar `hasClearStageAnswer("inicio_nome", ...)` de forma mais restritiva — atualmente aceita qualquer 2+ chars com 1-6 partes, sem nenhuma validação de que é realmente um nome.

---

## O QUE NÃO FOI ALTERADO

- Nenhum código foi alterado neste diagnóstico.
- Nenhuma tabela/coluna foi lida ou escrita.
- Nenhuma migração necessária.
- Este é um diagnóstico READ-ONLY.

---

## PROVAS

```
Branch: copilot/diagnostico-read-only-topo-do-funil
Remote: origin  https://github.com/brunovasque/Enova (push)
```

---

## REGRESSÃO ESTRUTURAL vs FALA INDEVIDA

**Ambos:**
- Houve **avanço estrutural indevido** — stage avança de `inicio_nome` para `inicio_nacionalidade` sem nome real.
- Houve **persistência indevida** — `nome = "Me explique"` salvo no Supabase.
- Houve **fala indevida** — "Ótimo, Me 👌" usando texto como nome.
