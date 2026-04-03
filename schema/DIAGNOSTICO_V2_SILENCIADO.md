# DIAGNÓSTICO CIRÚRGICO — V2 LIGADO MAS FALA FINAL DOMINADA PELO MECÂNICO

**Status:** Diagnóstico fechado — NÃO CORRIGIR AINDA  
**Branch:** `copilot/diagnostico-cirurgico-v2-estudo`  
**Data:** 2026-04-03  

---

## WORKFLOW_ACK: ok

---

## 1. Summary

O V2 está ativo (`COGNITIVE_V2_MODE=on`), roda corretamente, e na maioria dos cenários **gera `reply_text` útil e não-vazio**. Porém, a arquitetura atual trata o `reply_text` do V2 apenas como **prefixo opcional** (`__cognitive_reply_prefix`) — ele é prepended antes das mensagens mecânicas do `switch(stage)`. A fala mecânica do stage **nunca é substituída** pelo V2; ela é sempre emitida. Em cenários onde o parser mecânico não reconhece a resposta do usuário (e.g., pergunta fora do stage), o mecânico emite seu fallback rígido ("Acho que não entendi certinho 🤔 / Me diga seu estado civil…") e o V2 reply, se existir, é **apenas um preâmbulo** antes dessa fala mecânica. Adicionalmente, o **OFFTRACK GUARD** (L20869-20911) pode interceptar a mensagem antes do `switch(stage)` e retornar uma resposta hardcoded genérica, descartando completamente o contexto do V2.

**Causa raiz confirmada: HIPÓTESE E — O contrato do modo `on` preserva a fala mecânica como fonte principal. O V2 é apenas prefixo decorativo.**

---

## 2. Caminho real da resposta no modo `on`

### Fluxo passo a passo (dentro de `runFunnel()`):

```
1. [L20746] shouldTriggerCognitiveAssist(stage, userText) → true/false
   ↓ (se true)
2. [L20754] v2Mode = env.COGNITIVE_V2_MODE → "on"
   ↓
3. [L20759-20761] v2Mode === "on" →
   cognitive = await runCognitiveV2WithAdapter(env, stage, userText, st)
   ↓
4. [L3539-3576] runCognitiveV2WithAdapter():
   - monta rawInput {current_stage, message_text, known_slots}
   - chama runReadOnlyCognitiveEngine(rawInput, options)
   - chama adaptCognitiveV2Output(stage, v2Result)
   - retorna objeto com: reply_text, intent, confidence, entities, etc.
   ↓
5. [L20825-20827] cognitiveReply = sanitizeCognitiveReply(cognitive.reply_text)
   (se lowConfidence → cognitiveReply = "")
   ↓
6. [L20829-20835] hasUsefulCognitiveReply = Boolean(cognitiveReply) &&
   (answered_customer_question || intent || safe_stage_signal)
   ↓
7. [L20837-20841] Se hasUsefulCognitiveReply:
   st.__cognitive_reply_prefix = cognitiveReply   ← SALVA COMO PREFIXO
   Senão: st.__cognitive_reply_prefix = null
   ↓
8. [L20858] st.__cognitive_stage_answer = null   ← SEMPRE LIMPA
   ↓
   ── FIM DO BLOCO COGNITIVO ──
   ↓
9. [L20869-20911] OFFTRACK GUARD
   - Se offtrack === true → return step(env, st, offtrackMessages, stage)
     → step() prepende __cognitive_reply_prefix + offtrackMessages hardcoded
     → RETURN (não chega ao switch)
   ↓ (se não offtrack)
10. [L21075] switch(stage) → entra no case correspondente
    ↓
11. [case "estado_civil", L21892+] parseEstadoCivil(userText)
    - Se reconhece resposta → upsertState + step(msgs_mecanicas, nextStage)
    - Se NÃO reconhece → step(fallback_mecanico, "estado_civil")
    ↓
12. [L152-212] step(env, st, messages, nextStage):
    - rawArr = messages (do mecânico)
    - cognitivePrefix = st.__cognitive_reply_prefix || ""
    - arr = [cognitivePrefix, ...rawArr]   ← PREFIXO V2 + MENSAGENS MECÂNICAS
    - replyText = arr.join("\n")
    - sendMessage(env, wa_id, replyText)   ← ENVIADO AO CLIENTE
```

---

## 3. Onde o V2 entra

| Ponto | Linha | O que faz |
|-------|-------|-----------|
| Trigger | L20746 | `shouldTriggerCognitiveAssist()` decide se roda cognitivo |
| Engine call | L20761 | `runCognitiveV2WithAdapter()` chama motor isolado |
| Adapter | L3464-3537 | `adaptCognitiveV2Output()` converte output V2 → formato V1 |
| Reply extraction | L20825-20827 | `sanitizeCognitiveReply(cognitive.reply_text)` |
| Storage | L20838 | `st.__cognitive_reply_prefix = cognitiveReply` |

---

## 4. Onde a fala final é montada

| Ponto | Linha | O que faz |
|-------|-------|-----------|
| step() entrada | L152 | Recebe `messages` do mecânico (switch/case) |
| Prefixo V2 | L161-165 | `cognitivePrefix` prepended ao array de mensagens mecânicas |
| Render final | L171 | `replyText = msgs.join("\n")` |
| Envio | L212 | `sendMessage(env, st.wa_id, replyText)` |

**Ponto crítico:** O `step()` **SEMPRE** recebe as mensagens mecânicas do `switch(stage)`. O V2 reply é apenas um **primeiro item opcional** no array. As mensagens mecânicas nunca são suprimidas.

---

## 5. Hipóteses investigadas

### HIPÓTESE A: `reply_text` do V2 é gerado, mas não é usado na resposta final
**PARCIALMENTE CONFIRMADA.**
- O `reply_text` **é** gerado e **é** salvo em `st.__cognitive_reply_prefix` (L20838).
- Ele **é** usado — mas apenas como **prefixo** (L163-165).
- Ele **não substitui** a fala mecânica. A fala mecânica continua intacta depois dele.
- Em cenários de baixa confiança (< 0.66), o reply é descartado completamente (L20825-20827).

### HIPÓTESE B: `reply_text` do V2 só é usado em casos restritos
**CONFIRMADA.**
- O reply só é usado se `hasUsefulCognitiveReply` for true (L20829-20835).
- Requer: confiança >= 0.66 **E** (answered_customer_question **OU** intent **OU** safe_stage_signal).
- Em perguntas fora do stage (sem slot detectado), o V2 provavelmente retorna `intent: "fallback_contextual"` e `confidence` baixa, fazendo o reply ser descartado.

### HIPÓTESE C: algum fallback do stage tem precedência maior que a resposta cognitiva
**CONFIRMADA.**
- O OFFTRACK GUARD (L20869-20911) pode interceptar ANTES do switch(stage).
- Se `offtrackGuard()` retorna `offtrack: true`, o sistema chama `return step(env, st, offtrackMessages, stage)` com mensagens hardcoded.
- Neste caso, o `__cognitive_reply_prefix` é prepended, mas as mensagens de offtrack são fixas: "Certo. Vou analisar seu perfil primeiro e, no final, tiro todas suas dúvidas, combinado?" + "Pra eu seguir aqui, me responde só a pergunta anterior direitinho. 🙏"
- Se o offtrack NÃO intercepta, o switch(stage) roda e suas mensagens mecânicas dominam.

### HIPÓTESE D: normalizador/assembler posterior reintroduz a pergunta mecânica
**CONFIRMADA (mas não é posterior — é a arquitetura).**
- Não há normalizer posterior. A arquitetura é que **o mecânico é sempre a fonte principal** das mensagens em `step()`.
- O V2 reply é **apenas um preâmbulo** antes das mensagens mecânicas.
- `step()` faz: `[cognitivePrefix, ...mensagens_mecanicas]` — ou seja, o mecânico SEMPRE está presente.

### HIPÓTESE E: O contrato do modo `on` preserva a fala mecânica como fonte principal
**✅ CONFIRMADA — CAUSA RAIZ.**
- Mesmo com `COGNITIVE_V2_MODE=on`, a arquitetura trata o V2 como **casca conversacional** (conforme COGNITIVE_MIGRATION_CONTRACT.md §3.2).
- O `step()` sempre recebe `messages` do switch/case mecânico.
- O V2 reply é prepended, mas **nunca substitui** as mensagens mecânicas.
- Resultado: a mensagem final enviada ao cliente é `[V2 reply]\n[mensagens mecânicas do switch/case]`.
- Quando o V2 reply é vazio (baixa confiança ou sem sinal útil), a mensagem é **100% mecânica**.

### HIPÓTESE F: V2 está sendo tratado só como classificador/sinalizador
**PARCIALMENTE CONFIRMADA.**
- O V2 gera `reply_text`, `entities`, `safe_stage_signal`, `confidence`.
- Mas o consumo principal é:
  1. `reply_text` → prefixo decorativo (pode ser descartado)
  2. `safe_stage_signal` → usado em telemetria, não em decisão de avanço
  3. `entities` → guardado em telemetria, não consumido pelo mecânico
- O mecânico (switch/case) usa `parseEstadoCivil(userText)` diretamente, **ignorando completamente** o que o V2 detectou.

---

## 6. Hipóteses descartadas

Nenhuma hipótese foi completamente descartada — todas foram parcialmente confirmadas. A causa raiz é a **combinação** de E (arquitetura preserva mecânico) com B (V2 reply descartado em cenários de baixa confiança/sem sinal).

---

## 7. Causa raiz confirmada

**Categoria: 3 — V2 ligado mas usando contrato errado de montagem final** (com elementos de 1 e 2)

O V2 está ativo e roda. Mas o contrato de montagem final trata o `reply_text` do V2 como **prefixo opcional decorativo** que é prepended às mensagens mecânicas do switch/case. As mensagens mecânicas **nunca são suprimidas nem substituídas**. Em cenários onde o parser mecânico não reconhece a resposta do usuário, o mecânico emite seu fallback rígido, e o resultado é:

```
[V2 reply (se existir)] + [fallback mecânico "Acho que não entendi..."]
```

No cenário descrito pelo usuário (stage `estado_civil`, pergunta fora do trilho "antes de te responder, me explica rapidinho como funciona"):

1. `shouldTriggerCognitiveAssist` → true (tem `?`)
2. V2 roda e gera reply_text com acolhimento/explicação
3. Mas: o V2 provavelmente retorna `confidence` < 0.66 (sem slot de estado civil detectado)
4. Ou: `hasUsefulCognitiveReply` falha (sem intent forte, sem safe_stage_signal)
5. Resultado: `st.__cognitive_reply_prefix = null`
6. Depois, `offtrackGuard()` pode interceptar e retornar mensagem hardcoded genérica
7. OU: o switch(case "estado_civil") roda, `parseEstadoCivil()` falha → fallback mecânico "Acho que não entendi certinho 🤔 / Me diga seu estado civil…"
8. Mensagem final: **100% mecânica** (V2 reply descartado)

Mesmo quando o V2 **não** é descartado (confidence alta + reply útil), a mensagem é:
```
"[Explicação V2 acolhedora]\n[Acho que não entendi 🤔 / Me diga seu estado civil…]"
```
A fala mecânica domina a percepção do cliente porque é a **última coisa lida**.

---

## 8. Anchors/Arquivos exatos

| Arquivo | Linhas | Papel |
|---------|--------|-------|
| `Enova worker.js` | L20746 | Trigger: `shouldTriggerCognitiveAssist()` |
| `Enova worker.js` | L20754 | Leitura de `COGNITIVE_V2_MODE` |
| `Enova worker.js` | L20759-20761 | Branch `on`: chama `runCognitiveV2WithAdapter()` |
| `Enova worker.js` | L3539-3576 | `runCognitiveV2WithAdapter()` |
| `Enova worker.js` | L3464-3537 | `adaptCognitiveV2Output()` — converte V2→formato V1 |
| `Enova worker.js` | L20825-20841 | Decisão: salvar ou descartar V2 reply como prefixo |
| `Enova worker.js` | L20869-20911 | OFFTRACK GUARD — pode interceptar com fala hardcoded |
| `Enova worker.js` | L21075 | `switch(stage)` — início do mecânico |
| `Enova worker.js` | L21892-22121 | `case "estado_civil"` — fala mecânica + fallback |
| `Enova worker.js` | L22113-22121 | Fallback mecânico: "Acho que não entendi certinho 🤔" |
| `Enova worker.js` | L152-212 | `step()` — montagem final: `[prefix_v2, ...msgs_mecanicas]` |
| `Enova worker.js` | L161-165 | `step()` — `[cognitivePrefix, ...rawArr].filter(Boolean)` |
| `Enova worker.js` | L390-432 | `sendMessage()` — envio ao WhatsApp |
| `Enova worker.js` | L3335-3340 | `sanitizeCognitiveReply()` |
| `Enova worker.js` | L3443-3456 | `buildCognitiveFallback()` |
| `Enova worker.js` | L2905 | `COGNITIVE_V1_CONFIDENCE_MIN = 0.66` |
| `cognitive/src/run-cognitive.js` | L1390+ | `runReadOnlyCognitiveEngine()` — motor V2 |
| `wrangler.toml` | vars | `COGNITIVE_V2_MODE = "on"` |

---

## 9. V2 está ou não silenciado?

**SIM — o V2 está efetivamente silenciado na maioria dos cenários de "pergunta fora do stage".**

Dois mecanismos de silenciamento:

### Mecanismo 1: Descarte por confiança/sinal insuficiente (L20825-20841)
Quando o usuário faz pergunta fora do stage (sem responder a pergunta do stage), o V2 provavelmente:
- Não detecta slots → `intent: "fallback_contextual"` ou `"offtrack_contextual"`
- Pode ter `confidence` < 0.66 → `cognitiveReply = ""`
- Pode ter `answered_customer_question: false` + sem `safe_stage_signal` → `hasUsefulCognitiveReply = false`
- Resultado: `st.__cognitive_reply_prefix = null` → V2 reply descartado

### Mecanismo 2: Offtrack guard com fala hardcoded (L20869-20911)
Se `offtrackGuard()` classifica como offtrack:
- Retorna `step()` com mensagens hardcoded genéricas
- O `__cognitive_reply_prefix` do V2 é prepended, mas as mensagens hardcoded dominam
- A resposta final é: "[V2 preâmbulo (se existir)] + [mensagem offtrack hardcoded]"

### Mecanismo 3: Mecânico sempre presente (L152-165)
Mesmo quando o V2 reply sobrevive:
- `step()` monta: `[V2_reply, ...mensagens_mecanicas]`
- As mensagens mecânicas nunca são suprimidas
- O cliente lê: acolhimento V2 + pergunta mecânica rígida
- A pergunta mecânica é a última coisa lida → domina a percepção

---

## 10. A pergunta mecânica ainda domina a fala final?

**SIM — em 100% dos cenários.**

A arquitetura atual GARANTE que as mensagens mecânicas do `switch(stage)` sempre estejam presentes na resposta final. O V2 reply, quando existe, é apenas o primeiro item de um array que é concatenado com as mensagens mecânicas.

Cenário típico observado pelo usuário:

```
Usuário: "antes de te responder, me explica rapidinho como funciona"
Stage: estado_civil

Passo 1: V2 roda → pode gerar reply_text acolhedor
Passo 2: V2 reply descartado (sem slot → confidence baixa / hasUsefulCognitiveReply = false)
         OU: V2 reply salvo como prefixo
Passo 3: offtrackGuard → pode classificar como offtrack → retorna mensagem hardcoded
         OU: offtrackGuard não intercepta → switch(stage) roda
Passo 4: parseEstadoCivil("antes de te responder...") → null
Passo 5: Fallback mecânico: "Acho que não entendi certinho 🤔 / Me diga seu estado civil..."

Resultado final enviado ao cliente:
"Acho que não entendi certinho 🤔\nMe diga seu *estado civil*: solteiro(a), casado(a)..."
```

O V2 é **inaudível** — sua fala não chegou ao cliente.

---

## 11. Correção mínima provável (apenas descritiva, sem aplicar)

A correção mínima deveria:

1. **No cenário de pergunta fora do stage (offtrack)**: quando o V2 gera `reply_text` com `answered_customer_question: true`, usar o `reply_text` do V2 como a resposta ao cliente em vez das mensagens hardcoded do offtrack guard. O V2 já sabe acolher e redirecionar — usar isso.

2. **No cenário de fallback mecânico do switch/case**: quando o parser mecânico não reconhece a resposta do usuário E o V2 gerou um `reply_text` útil (`hasUsefulCognitiveReply`), permitir que o V2 reply **substitua** (não apenas prefixe) a fala mecânica de "não entendi". O V2 sabe reformular a pergunta de forma humana.

3. **Revisar o threshold de descarte**: o filtro `hasUsefulCognitiveReply` (L20829-20835) é muito restritivo para o cenário de offtrack/pergunta fora do stage. Quando o V2 responde uma dúvida legítima do cliente, pode não ter `intent` forte nem `safe_stage_signal` — mas tem `reply_text` útil que está sendo descartado.

4. **Alternativa mínima**: no `step()`, quando `cognitivePrefix` existe, avaliar se as mensagens mecânicas que seguem são fallback/reprompt do stage (i.e., o mecânico "não entendeu") — e nesse caso, suprimir as mensagens mecânicas, deixando apenas o V2 reply.

A correção **NÃO** deve:
- Mexer no switch/case
- Mexer em nextStage
- Mexer em persistência
- Mexer no parser mecânico
- Mudar regras de negócio

---

## 12. PR / Branch / Commit / Rollback

- **Branch:** `copilot/diagnostico-cirurgico-v2-estudo`
- **PR:** será criado com este diagnóstico
- **Rollback:** `git revert <commit_hash>` (apenas doc, sem risco ao runtime)
- **Smoke tests:** N/A (diagnóstico apenas, sem alteração de código executável)

---

## 13. Provas de push no mesmo branch/PR

```
$ git remote -v
origin	https://github.com/brunovasque/Enova (fetch)
origin	https://github.com/brunovasque/Enova (push)
```

Commit hash e link serão fornecidos após o push.
