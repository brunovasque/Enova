# DIAGNÓSTICO DE PRÉ-IMPLEMENTAÇÃO — MIGRAÇÃO COGNITIVO V1 → V2

**Data:** 2026-03-31
**Escopo:** Análise exaustiva antes de qualquer alteração de código
**Objetivo:** Fechar 100% das decisões para que a implementação seja mecânica

---

## BLOCO A — VALIDAR O PONTO DE ENTRADA

### A.1 — Opções Analisadas

#### Opção 1: Dentro de `runFunnel()`, no bloco COGNITIVE ASSIST (L19453-19567)

- **Arquivo:** `Enova worker.js`
- **Função:** `runFunnel()` (L19253-29216)
- **Bloco exato:** L19460-19567, dentro do `try { if (shouldTriggerCognitiveAssist(...)) { ... } }`
- **Papel técnico:** Ponto onde o V1 já é chamado hoje. O código lê `env.COGNITIVE_V2_MODE` e faz branching.
- **Prós:**
  - Já existe feature flag implementada (L19463)
  - Já existe branching V1/shadow/V2 (L19468-19490)
  - Respeita contrato existente — o output do cognitive vai para `__cognitive_reply_prefix`
  - Não altera o fluxo antes ou depois do bloco
  - Rollback = mudar env var para "off"
  - Telemetria já instrumentada (L19521-19527, L19550-19561)
- **Contras:**
  - Bloco denso (100+ linhas), risco de efeito lateral se editado incorretamente
  - `shouldTriggerCognitiveAssist()` (L2102-2113) filtra por COGNITIVE_V1_ALLOWED_STAGES que são apenas 5 stages — V2 suporta 9+
- **Risco:** BAIXO se não alterar `shouldTriggerCognitiveAssist()` nem a lista de stages
- **Status:** ✅ CONFIRMADO como viável

#### Opção 2: Em `handleMetaWebhook()`, antes de `runFunnel()` (L7056)

- **Arquivo:** `Enova worker.js`
- **Função:** `handleMetaWebhook()` (~L6700)
- **Bloco exato:** L7056 `await runFunnel(env, st, userText)`
- **Papel técnico:** Entry point do webhook; monta state e chama runFunnel
- **Prós:**
  - Acesso completo a env e st antes do funil
  - Poderia enriquecer state com dados cognitivos antes do funil
- **Contras:**
  - **CRÍTICO:** O cognitivo depende de saber o `stage` (L19272), que é `st.fase_conversa`. Chamar antes do runFunnel significaria duplicar a resolução de stage
  - **CRÍTICO:** O funil tem lógica de reset (QA_RESET, reset global) que pode mudar o stage antes do bloco cognitivo (L19276-19413). Chamar fora do runFunnel ignora esses guards
  - **CRÍTICO:** offtrackGuard (L6994-7022) já roda aqui; adicionar cognitivo criaria interferência de decisão
  - Não respeita a posição sequencial das guards (yesNo → cognitive → offtrack)
- **Risco:** ALTO — quebraria a sequência de guards e ignoraria resets
- **Status:** ❌ REJEITADO

#### Opção 3: Em `step()`, antes de montar mensagens (L150-170)

- **Arquivo:** `Enova worker.js`
- **Função:** `step()` (L150-360)
- **Bloco exato:** L159-166 onde `__cognitive_reply_prefix` é consumido
- **Papel técnico:** Monta resposta final e envia ao usuário
- **Prós:**
  - Ponto mais próximo do envio real
  - Poderia interceptar e enriquecer a resposta
- **Contras:**
  - **CRÍTICO:** `step()` é chamado por TODOS os 60+ stages do switch, inclusive os que não são cognitivos
  - **CRÍTICO:** `step()` não tem contexto de `userText` — recebe apenas `messages` e `nextStage`
  - **CRÍTICO:** Tornaria o cognitivo um middleware global, violando o princípio de soberania do trilho
  - `step()` é a função mais chamada do worker (60+ call sites) — qualquer bug aqui derruba o atendimento inteiro
- **Risco:** CRÍTICO — ponto mais perigoso do worker
- **Status:** ❌ REJEITADO

#### Opção 4: Via admin endpoint `/__admin__/cognitive-test` (L5192)

- **Arquivo:** `Enova worker.js`
- **Bloco exato:** L5192-5301
- **Papel técnico:** Endpoint de teste que já chama `runReadOnlyCognitiveEngine`
- **Prós:**
  - Já integra o V2 isolado
  - Completamente separado do fluxo real
- **Contras:**
  - **NÃO É um ponto de entrada para produção** — é apenas teste
  - Não tem acesso ao runtime de atendimento real
  - Não gera `__cognitive_reply_prefix`
- **Risco:** N/A — não é opção para migração de produção
- **Status:** ❌ REJEITADO (não aplicável)

### A.2 — Decisão Final

| Critério | Opção 1 (runFunnel bloco) | Opção 2 (handleMetaWebhook) | Opção 3 (step) | Opção 4 (admin) |
|----------|--------------------------|----------------------------|----------------|-----------------|
| Preserva contrato com trilho | ✅ SIM | ❌ NÃO | ❌ NÃO | N/A |
| Facilita rollback | ✅ env var | ⚠️ revert | ❌ 60+ call sites | N/A |
| Minimiza side effects | ✅ bloco isolado | ⚠️ pré-funil | ❌ global | N/A |
| Menor risco estrutural | ✅ BAIXO | ⚠️ ALTO | ❌ CRÍTICO | N/A |
| Já tem instrumentação | ✅ SIM (flag+telemetria) | ❌ NÃO | ❌ NÃO | ✅ SIM |

**Ponto recomendado:** Opção 1 — `runFunnel()` L19460-19567, bloco COGNITIVE ASSIST
**Pontos rejeitados:** Opções 2, 3, 4
**Motivo técnico da rejeição:**
- Opção 2: Quebraria sequência de guards e ignoraria resets internos do funil
- Opção 3: Tornaria cognitivo middleware global com 60+ pontos de impacto
- Opção 4: Endpoint de teste, não aplicável a produção

---

## BLOCO B — MAPA COMPLETO DE IMPACTO

### B.1 — Matriz de Áreas Impactadas

| # | Área | Onde fica | O que faz hoje | Impacto da migração | Risco | Precisa mexer? | Precisa testar? | Observações |
|---|------|-----------|----------------|---------------------|-------|----------------|-----------------|-------------|
| 1 | `cognitiveAssistV1()` | L2311-2356 | LLM direto via callOpenAIJson; retorna 10 campos flat | Será bypassada quando V2_MODE="on"; mantida quando "off"/"shadow" | BAIXO | NÃO (manter intacta) | SIM (validar que modo "off" ainda funciona) | Legado transitório — só remover na etapa final |
| 2 | `adaptCognitiveV2Output()` | L2206-2270 | Converte V2 response → formato V1 (10 campos) | Já implementado; precisa validação campo-a-campo | MÉDIO | POSSÍVEL (ver Bloco C) | SIM | Coração da migração |
| 3 | `runCognitiveV2WithAdapter()` | L2272-2309 | Monta input V2, chama `runReadOnlyCognitiveEngine`, adapta output | Já implementado; precisa validação de estado mapeado | MÉDIO | POSSÍVEL (ver Bloco C) | SIM | Wrapper de integração |
| 4 | `shouldTriggerCognitiveAssist()` | L2102-2113 | Gate de ativação: filtra por 5 stages + heurísticas | NÃO deve mudar com migração V1→V2 (mesmos 5 stages) | BAIXO | NÃO | SIM (confirmar que gate funciona igual) | V2 suporta 9+ stages mas gate limita a 5 |
| 5 | `COGNITIVE_V1_ALLOWED_STAGES` | L1994-2000 | Set com 5 stages permitidos | Se V2 for expandir para mais stages, PRECISA mudar aqui | **BLOQUEADOR** se quiser expandir stages | NÃO AGORA | SIM | Expansão deve ser etapa SEPARADA após migração validada |
| 6 | `COGNITIVE_V1_CONFIDENCE_MIN` | L2002 | Threshold 0.66 para reply_text ser usado | V2 pode ter distribuição de confidence diferente | MÉDIO | POSSÍVEL | SIM (comparar distribuições em shadow) | V1: confidence do LLM; V2: calculada matematicamente |
| 7 | `isStageSignalCompatible()` | L2122-2133 | Valida safe_stage_signal por prefixo (estado_civil, composicao, renda, ir) | Adapter já constrói sinais compatíveis (L2233-2241) | BAIXO | NÃO | SIM (validar todos os 5 stages) | Formato: "prefixo:valor" |
| 8 | `extractCompatibleStageAnswerFromCognitive()` | L2135-2183 | Extrai resposta de stage de entities/stage_signals/safe_stage_signal | V2 preenche entities via slot extraction heurística; pode ter nomes diferentes | **ALTO** | POSSÍVEL | SIM (crítico) | V2 usa nomes canônicos de slot, V1 usa nomes livres do LLM |
| 9 | `sanitizeCognitiveReply()` | L2115-2120 | Substitui "casa"→"imóvel" em reply_text | Funciona igual para V1 e V2 | NULO | NÃO | NÃO | Função pura, independe do motor |
| 10 | `buildCognitiveFallback()` | L2185-2198 | Retorna objeto fallback padrão para erro/ausência | Usado por ambos os paths (V1 e adapter) | NULO | NÃO | NÃO | Rede de segurança |
| 11 | `hasClearStageAnswer()` | L2085-2100 | Verifica se userText contém resposta direta parseável | Independe do motor cognitivo | NULO | NÃO | NÃO | Guard pré-cognitivo |
| 12 | `__cognitive_reply_prefix` | L159-166 (step), L19543-19545 (set) | Prefixo prepended à resposta do funil | V2 adapter produz `reply_text` que vai para este campo | BAIXO | NÃO | SIM | Contrato de saída do cognitive → step |
| 13 | `__cognitive_stage_answer` | L19563, L24763 | Resetado para null após cognitive; usado em stage renda | Nenhum impacto direto — já é resetado | NULO | NÃO | NÃO | Sempre null após cognitive block |
| 14 | `__cognitive_telemetry` | L52-120, L19550-19561 | State transitório de telemetria (used_llm, slot_detected, etc.) | V2 produz `reason: "cognitive_v2"/"cognitive_v2_heuristic"` — telemetria já detecta | BAIXO | NÃO | SIM | Verificar que `COGNITIVE_HEURISTIC_REASONS` Set (L19548) cobre os reasons do V2 |
| 15 | `resolveCognitiveTelemetrySlot()` | L78-98 | Resolve slot detectado de entities/stage_signals/safe_stage_signal | V2 adapter preenche entities e safe_stage_signal no formato esperado | BAIXO | NÃO | SIM | Depende do adapter produzir entities corretas |
| 16 | Telemetria event `cognitive_v1_signal` | L19521-19527 | Loga detalhes do cognitive assist + v2_shadow comparativo | Já inclui `cognitive_v2_mode` e bloco `v2_shadow` | NULO | NÃO | SIM (validar que shadow loga corretamente) | — |
| 17 | `offtrackGuard()` | L2376-2413 | Guard IA pós-cognitive (L19573-19612) | Independe do motor cognitivo — roda DEPOIS | NULO | NÃO | NÃO | Sequência: cognitive → offtrackGuard |
| 18 | `callOpenAIJson()` | L2042-2083 | Wrapper OpenAI usado por V1 e offtrackGuard | V1 usa; V2 tem seu próprio `callOpenAIReadOnly()` | NULO (V2 não usa) | NÃO | NÃO | — |
| 19 | `getOpenAIConfig()` | L2035-2040 | Resolve apiKey e model de env vars | V2 usa `getOpenAIConfig()` via adapter (L2291) | NULO | NÃO | NÃO | — |
| 20 | Admin endpoint `/cognitive-test` | L5192-5301 | Testa V2 isolado via HTTP | Independente da migração | NULO | NÃO | NÃO | Continuará funcionando |
| 21 | Smoke test adapter | `schema/cognitive_v2_adapter.smoke.mjs` | 17 testes do adapter | Já existe e passa | NULO | NÃO | SIM (manter passando) | — |
| 22 | Smoke test telemetry | `schema/cognitive_telemetry.smoke.mjs` | 3 flows de telemetria | Roda com V1 — precisa versão V2 | MÉDIO | SIM (adicionar caso V2) | SIM | **Aberto: smoke test falta cobertura V2** |
| 23 | Smoke test runner | `schema/cognitive_read_only_runner.smoke.mjs` | 42+ fixtures do V2 isolado | Independente | NULO | NÃO | NÃO | — |
| 24 | Smoke test admin | `schema/cognitive_read_only_admin.smoke.mjs` | 40+ fixtures via admin endpoint | Independente | NULO | NÃO | NÃO | — |
| 25 | `COGNITIVE_PLAYBOOK_V1` | L2004-2033 | Playbook enviado ao LLM pelo V1 | V2 tem seus próprios prompts; playbook não é usado pelo V2 | NULO | NÃO | NÃO | Legado do V1 |
| 26 | Confidence threshold check | L19493 | `Number(cognitive.confidence) < COGNITIVE_V1_CONFIDENCE_MIN` | **CRÍTICO:** V2 calcula confidence por fórmula matemática; V1 recebe do LLM. Distribuições podem diferir | **ALTO** | POSSÍVEL | SIM (comparar em shadow) | Ver Bloco D |
| 27 | `hasUsefulCognitiveReply` check | L19534-19540 | Verifica se reply é útil (answered_customer_question \|\| intent \|\| safe_stage_signal) | V2 adapter produz intent="cognitive_v2_slot_detected" quando há slots — funciona | BAIXO | NÃO | SIM | — |
| 28 | wrangler.toml | `wrangler.toml` | Config do worker — NÃO tem COGNITIVE_V2_MODE | Var precisa ser definida por env/secrets no dashboard | NULO | NÃO | NÃO | Config via Cloudflare dashboard |

### B.2 — Resumo de Impacto

- **Áreas que NÃO precisam mexer:** 20 de 28
- **Áreas que POSSÍVEL precisam mexer:** 6 (adapter, wrapper, confidence threshold, extractCompatibleStageAnswer, telemetry smoke test, ALLOWED_STAGES se expandir)
- **Áreas que SIM precisam testar:** 16 de 28
- **Bloqueadores identificados:** 1 (expansão de stages deve ser etapa separada)
- **Abertos:** 1 (smoke test de telemetria V2)

---

## BLOCO C — ADAPTER SOB PENTE-FINO

### C.1 — Campos Consumidos pelo Worker

O worker consome o output do cognitive em 4 pontos:

1. **L19492:** `cognitive.safe_stage_signal` → `isStageSignalCompatible()`
2. **L19493:** `cognitive.confidence` → threshold check
3. **L19530-19532:** `cognitive.reply_text` → `sanitizeCognitiveReply()` → `__cognitive_reply_prefix`
4. **L19534-19540:** `cognitive.answered_customer_question`, `cognitive.intent`, `cognitive.safe_stage_signal` → `hasUsefulCognitiveReply`
5. **L19497-19507:** `cognitive.intent`, `cognitive.confidence`, `cognitive.still_needs_original_answer`, `cognitive.answered_customer_question`, `cognitive.suggested_stage`, `cognitive.safe_stage_signal` → telemetria
6. **L19548-19554:** `cognitive.reason` → `COGNITIVE_HEURISTIC_REASONS` → `usedLlm`
7. **L78-98:** `cognitive.entities`, `cognitive.stage_signals`, `cognitive.safe_stage_signal` → `resolveCognitiveTelemetrySlot()`
8. **L2135-2183:** `cognitive.entities`, `cognitive.stage_signals`, `cognitive.safe_stage_signal` → `extractCompatibleStageAnswerFromCognitive()`

### C.2 — Tabela Campo a Campo

| # | Campo esperado pelo worker | Tipo | Origem no V1 (`cognitiveAssistV1`) | Origem no V2 (`runReadOnlyCognitiveEngine`) | Regra de transformação no adapter | Risco | Fallback | Precisa confirmação? |
|---|---------------------------|------|------------------------------------|--------------------------------------------|----------------------------------|-------|----------|---------------------|
| 1 | `reply_text` | string | `parsed.reply_text` (LLM output) sanitizado | `response.reply_text` (LLM ou heurístico) | Direto, trim, fallback para frase genérica | BAIXO | `buildCognitiveFallback().reply_text` | ✅ CONFIRMADO |
| 2 | `intent` | string | `parsed.intent` (livre, do LLM) | **NÃO EXISTE no V2** | Derivado: slots → "cognitive_v2_slot_detected"; conflicts → "offtrack_contextual"; senão → "fallback_contextual" | **MÉDIO** | "fallback_contextual" | ⚠️ PARCIALMENTE CONFIRMADO — intent é derivado, não nativo |
| 3 | `entities` | object | `parsed.entities` (formato livre do LLM) | `response.slots_detected` (estruturado: `{ slot: { value, confidence, evidence, source } }`) | Achatado: `{ key: slot.value }` para cada slot | **ALTO** | `{}` | ⚠️ VER C.3 ABAIXO |
| 4 | `stage_signals` | object | `parsed.stage_signals` (formato livre) | **NÃO EXISTE no V2** | Derivado de `slots_detected` (mesmo achatamento que entities) | **MÉDIO** | `{}` | ⚠️ Mesmo que entities — duplicação questionável |
| 5 | `still_needs_original_answer` | boolean | `Boolean(parsed.still_needs_original_answer)` | `response.pending_slots.length > 0 && confidence < 0.8` | Inferido de pending_slots e confidence | **MÉDIO** | `true` | ⚠️ Heurística indireta — pode divergir do comportamento V1 |
| 6 | `answered_customer_question` | boolean | `Boolean(parsed.answered_customer_question)` | **NÃO EXISTE no V2** | Derivado: `replyText.length > 20 && !should_request_confirmation` | **MÉDIO** | `true` | ⚠️ Heurística arbitrária (20 chars) |
| 7 | `safe_stage_signal` | string\|null | `String(parsed.safe_stage_signal)` (formato livre do LLM) | **NÃO EXISTE no V2** | Construído: `"prefixo:valor"` baseado em stage + entities detectadas | **ALTO** | `null` | ⚠️ VER C.4 ABAIXO |
| 8 | `suggested_stage` | string | `String(parsed.suggested_stage)` | **NÃO EXISTE no V2** (`should_advance_stage: false` sempre) | Fixo: sempre retorna `stage` atual (nunca sugere outro) | BAIXO | `stage` | ✅ CONFIRMADO — correto pois V2 nunca avança stage |
| 9 | `confidence` | number | `Number(parsed.confidence)` (do LLM) | `response.confidence` (calculada matematicamente) | Direto, clamp [0,1] | **ALTO** | `0` | ⚠️ VER C.5 ABAIXO |
| 10 | `reason` | string | `"cognitive_v1"` (fixo) | Derivado: `engine.llm_used ? "cognitive_v2" : "cognitive_v2_heuristic"` | Direto | BAIXO | `"cognitive_v2_heuristic"` | ✅ CONFIRMADO |

### C.3 — Incompatibilidade de Entities (ALTA)

**Problema:** V1 recebe entities como output livre do LLM. Os nomes dos campos dependem do LLM respeitar o contrato. V2 detecta slots com nomes canônicos:

| Stage | Campo V1 (LLM) | Campo V2 (heurístico) | Adapter mapeia corretamente? |
|-------|----------------|----------------------|------------------------------|
| estado_civil | `entities.estado_civil` | `slots_detected.estado_civil.value` | ✅ SIM — adapter achata para `entities.estado_civil` |
| quem_pode_somar | `entities.composicao_tipo` | `slots_detected.composicao.value` | ⚠️ **DIVERGÊNCIA** — V1 usa `composicao_tipo`, V2 usa `composicao` |
| renda | `entities.renda` | `slots_detected.renda.value` | ✅ SIM |
| ir_declarado | `entities.ir_declarado` | `slots_detected.ir_declarado.value` | ✅ SIM |
| regime | `entities.regime_trabalho` | `slots_detected.regime_trabalho.value` | ✅ SIM |

**Divergência crítica:** `extractCompatibleStageAnswerFromCognitive()` em L2156 busca `entities.composicao_tipo` **OU** `stageSignals.composicao`. O adapter V2 produz `entities.composicao` (não `composicao_tipo`). Portanto:
- Via `entities.composicao_tipo` → **NÃO** vai encontrar (V2 não produz esse campo)
- Via `stageSignals.composicao` → **SIM** vai encontrar (adapter preenche `stage_signals.composicao`)
- Via `safe_stage_signal` match `composicao:*` → **SIM** vai encontrar

**Veredito:** Funciona por fallback, mas **NÃO pelo caminho primário**. Risco: se `stageSignals` estiver vazio por qualquer razão, a extração falha silenciosamente.

**Recomendação:** O adapter deve TAMBÉM produzir `entities.composicao_tipo` quando `slots_detected.composicao` existir. Alteração simples de 1 linha.

### C.4 — safe_stage_signal (ALTA)

**Como V1 produz:** LLM retorna `safe_stage_signal` como string livre. Pode ser qualquer formato.
**Como V2 adapter produz:** Construído deterministicamente em L2232-2241:
- `"estado_civil:" + valor` quando entities.estado_civil existe
- `"composicao:" + valor` quando entities.composicao existe
- `"renda:" + valor` quando entities.renda != null
- `"ir:" + valor` quando entities.ir_declarado existe

**Validação:** `isStageSignalCompatible()` (L2122-2133) verifica por `startsWith`:
- estado_civil → prefixos aceitos: `["estado_civil"]`
- quem_pode_somar → prefixos aceitos: `["composicao"]`
- interpretar_composicao → prefixos aceitos: `["composicao"]`
- renda → prefixos aceitos: `["renda", "regime", "ir_possible"]`
- ir_declarado → prefixos aceitos: `["ir"]`

**Veredito:** O adapter constrói sinais que passam na validação. **CONFIRMADO** compatível.

**Risco residual:** Se o V2 detectar slot `regime_trabalho` no stage `renda`, o adapter NÃO produz `safe_stage_signal` com prefixo `"regime:"` — ele prioriza `renda`. Isso pode causar perda de informação quando o slot primário não é o do stage mas é compatível.

### C.5 — Confidence (ALTA)

**V1:** Confidence vem do LLM (0-1). Distribuição depende do modelo e do prompt. Tipicamente, LLM tende a retornar valores altos (0.7-0.95) ou baixos (0-0.3), com poucos valores intermediários.

**V2:** Confidence calculada matematicamente em `buildHeuristicResponse()` e `normalizeModelResponse()`:
- Base heurística: ~0.58 + 0.1 × min(slots_detected, 4)
- Penalidades: -0.22 por conflito, -0.08 por offtrack
- Range final: [0.05, 0.99]
- Se LLM usado: merge com heurística

**Problema:** O threshold `COGNITIVE_V1_CONFIDENCE_MIN = 0.66` (L2002) foi calibrado para distribuição do LLM, não para a fórmula matemática do V2.

**Cenários de divergência:**
| Cenário | V1 confidence | V2 confidence | Impacto |
|---------|--------------|---------------|---------|
| 1 slot detectado, sem conflito | LLM: ~0.8 | V2: ~0.68 | OK — ambos acima de 0.66 |
| 0 slots, offtrack | LLM: ~0.5 | V2: ~0.50 | OK — ambos abaixo de 0.66 |
| 1 slot + 1 conflito | LLM: ~0.6 | V2: ~0.46 | V1 pode usar reply (perto); V2 não usa |
| 3 slots detectados | LLM: ~0.9 | V2: ~0.88 | OK — ambos bem acima |
| LLM falha, só heurística | N/A (fallback) | V2: ~0.58-0.68 | V2 pode acertar threshold; V1 daria fallback |

**Veredito:** Distribuição é **suficientemente compatível** para os 5 stages atuais. A diferença principal é que V2 produz valores mais calibrados (menos extremos). Em shadow mode, a comparação empírica confirmará.

**Recomendação:** NÃO alterar o threshold agora. Monitorar em shadow e decidir depois.

### C.6 — Perguntas Abertas do Adapter

| # | Pergunta | Status | Impacto |
|---|----------|--------|---------|
| 1 | O adapter deve produzir `entities.composicao_tipo` (alias)? | **ABERTO — RECOMENDADO** | Fallback silencioso em `extractCompatibleStageAnswerFromCognitive()` |
| 2 | `answered_customer_question` derivado por length > 20 é robusto? | **PARCIALMENTE CONFIRMADO** | Heurística aceitável; V1 também não era confiável neste campo |
| 3 | `still_needs_original_answer` derivado por `pending_slots.length > 0 && confidence < 0.8` é correto? | **PARCIALMENTE CONFIRMADO** | Lógica razoável mas não equivalente ao V1 |
| 4 | O adapter mascara erros silenciosamente? | **CONFIRMADO** — L2208: retorna fallback para v2Result inválido | Sem log explícito quando V2 falha parcialmente |
| 5 | O adapter pode quebrar silenciosamente o funil? | **NÃO** — worst case é fallback genérico, que não avança stage | Rede de segurança funciona |

### C.7 — Veredito do Adapter

- **O adapter proposto é suficiente?** SIM, com 1 ajuste recomendado (alias composicao_tipo)
- **Ele está simplificando demais?** PARCIALMENTE — perde informação de conflicts, pending_slots, consultive_notes que poderiam ser úteis em telemetria futura
- **Ele está permitindo acoplamento perigoso?** NÃO — mantém interface compatível sem expor internals do V2
- **Existe forma melhor?** Não sem alterar o consumidor (runFunnel). O adapter é a solução correta para migração incremental.

---

## BLOCO D — SHADOW MODE SOB PENTE-FINO

### D.1 — O Que Será Comparado

O shadow mode (L19471-19482) roda V1 como primário e V2 em paralelo, logando V2 em telemetria:

| Campo comparado | V1 (primário) | V2 (shadow) | Onde logado |
|----------------|---------------|-------------|-------------|
| `confidence` | Direto | Via adapter | `telemetryDetails.v2_shadow.confidence` (L19513) |
| `intent` | Direto | Via adapter | `telemetryDetails.v2_shadow.intent` (L19514) |
| `reason` | Direto | Via adapter | `telemetryDetails.v2_shadow.reason` (L19515) |
| `safe_stage_signal` | Direto | Via adapter | `telemetryDetails.v2_shadow.safe_stage_signal` (L19516) |
| `reply_text` length | — | Via adapter | `telemetryDetails.v2_shadow.reply_text_length` (L19517) |

### D.2 — O Que NÃO Está Sendo Comparado (Lacunas)

| Campo não comparado | Por que importa | Risco |
|--------------------|-----------------|-------|
| `entities` | Diferentes formatos podem causar divergência em `extractCompatibleStageAnswer` | MÉDIO |
| `stage_signals` | Pode afetar `resolveCognitiveTelemetrySlot()` | BAIXO |
| `still_needs_original_answer` | Afeta se reply é usado ou descartado | MÉDIO |
| `answered_customer_question` | Afeta `hasUsefulCognitiveReply` | MÉDIO |
| `reply_text` (conteúdo, não só length) | Tom e qualidade da resposta podem divergir | ALTO |

**Recomendação:** Adicionar comparação de `still_needs_original_answer`, `answered_customer_question`, e hash/snippet do `reply_text` ao bloco v2_shadow.

### D.3 — Critérios Objetivos para Shadow Mode

#### Divergência Tolerável
| Métrica | Tolerância | Motivo |
|---------|-----------|--------|
| Confidence delta (V1 - V2) | |delta| ≤ 0.3 | Distribuições diferentes são esperadas |
| safe_stage_signal match | ≥ 80% dos casos onde V1 produz sinal, V2 também produz | V2 é mais restrito (só detecta via regex) |
| reply_text length ratio | V2/V1 entre 0.3 e 3.0 | Respostas muito curtas ou longas indicam problema |
| intent divergência | V1="fallback_contextual" enquanto V2="cognitive_v2_slot_detected" é aceitável | V2 mais preciso que V1 |

#### Divergência Grave (requer investigação)
| Métrica | Limite | Ação |
|---------|--------|------|
| V2 confidence < 0.3 quando V1 > 0.7 | > 5% dos casos | Investigar calibração |
| V2 safe_stage_signal incompatível | QUALQUER caso | Bug no adapter |
| V2 reply_text vazio quando V1 tem reply | > 2% dos casos | Bug no adapter ou no motor |
| V2 exception rate | > 1% dos calls | Bug no wrapper |

#### Condição de Avanço para "on"
Todos os critérios devem ser atendidos:
1. ≥ 500 chamadas shadow processadas sem exception
2. V2 exception rate < 0.5%
3. safe_stage_signal compatibilidade ≥ 90%
4. Nenhum caso de safe_stage_signal incompatível com `isStageSignalCompatible()`
5. Confidence delta média |V1-V2| ≤ 0.25
6. V2 reply_text vazio rate < 1%
7. Smoke tests do adapter passando 100%

#### Condição de Rollback para "off"
Qualquer um destes:
1. V2 exception rate > 2%
2. safe_stage_signal incompatível detectado em produção
3. V2 reply_text vazio > 5%
4. Qualquer evidência de stage avançando incorretamente (should_advance_stage !== false)

### D.4 — Como Evitar Falso Positivo

- **Shadow não deve afetar o runtime:** V2 roda DEPOIS do V1 retornar, resultado V2 é apenas logado (L19478-19482)
- **Shadow errors são silenciados:** `catch (shadowErr)` em L19480 impede que V2 crash afete V1
- **Comparação deve ser feita OFFLINE:** Analisar logs de telemetria externamente, não em runtime

### D.5 — Como Evitar Falsa Sensação de Segurança

- **Tempo sozinho não basta:** 7 dias com 10 chamadas é irrelevante. Volume mínimo (500) é obrigatório.
- **Distribuição de stages importa:** Garantir que shadow cobre todos os 5 stages, não só estado_civil
- **Fixtures ≠ runtime:** Sucesso em fixtures não garante sucesso em produção. Shadow é o teste real.
- **Confidence calibrada ≠ comportamento final:** Mesmo com confidence próxima, o V2 pode produzir reply_text com tom diferente

---

## BLOCO E — MODOS DE FALHA E REGRESSÃO

### E.1 — Matriz de Risco

| # | Falha | Como quebraria | Sintoma visível | Sintoma invisível | Impacto no funil | Impacto no atendimento | Detecção | Mitigação | Rollback |
|---|-------|---------------|-----------------|-------------------|------------------|----------------------|----------|-----------|----------|
| 1 | V2 resposta vazia | `runReadOnlyCognitiveEngine` retorna `ok: false` | — | Log `COGNITIVE_V2_ADAPTER_ERROR` | Fallback genérico usado | Mensagem genérica ao invés de contextual | Console log | `buildCognitiveFallback()` já cobre | `COGNITIVE_V2_MODE=off` |
| 2 | Adapter formato inválido | `adaptCognitiveV2Output` retorna campos faltando | — | `hasUsefulCognitiveReply` = false → reply descartado | `__cognitive_reply_prefix = null` | Sem reply cognitivo, funil segue normal | Telemetria (intent=null, confidence=0) | Fallback em cada campo | `COGNITIVE_V2_MODE=off` |
| 3 | safe_stage_signal incompatível | Adapter constrói sinal com prefixo errado | — | `isStageSignalCompatible()` retorna false | `compatibleSignal = false` → logado mas não usado para decisão atualmente | Nenhum imediato (sinal é informativo) | Telemetria `signal_compatible: false` | isStageSignalCompatible já protege | `COGNITIVE_V2_MODE=off` |
| 4 | Conflito V1 vs V2 em shadow | V1 e V2 produzem respostas muito diferentes | — | Telemetria mostra divergência alta | Nenhum (shadow é read-only) | Nenhum | Análise de logs shadow | Não ativar "on" até entender | Manter "shadow" |
| 5 | V2 interpreta algo que mecânico não aceita | V2 detecta slot com valor inválido para o stage | — | `extractCompatibleStageAnswer` retorna null | Stage não avança, reply usado como prefix | Resposta cognitiva sem efeito estrutural | Telemetria (slot_detected=null quando deveria ter) | Funções de extração já validam valores | `COGNITIVE_V2_MODE=off` |
| 6 | Regressão em fallback | V2 fallback (heurístico) tem tom diferente do V1 fallback | Resposta com tom diferente | — | Nenhum estrutural | Percepção do cliente diferente | Análise manual de logs | `sanitizeCognitiveReply()` normaliza | `COGNITIVE_V2_MODE=off` |
| 7 | Regressão em telemetria | V2 `reason` não reconhecido por `COGNITIVE_HEURISTIC_REASONS` Set | — | `used_llm` incorreto na telemetria | Nenhum estrutural | Nenhum | Auditoria de telemetria | Set em L19548 já cobre "cognitive_v2_heuristic" | — |
| 8 | Regressão silenciosa de stage | V2 produz `suggested_stage` != stage atual | — | Adapter força `suggested_stage: stage` (L2266) | Nenhum — adapter protege | Nenhum | — | Adapter hardcode `stage` | — |
| 9 | Dependência de estado faltando | `st.regime` ou `st.somar_renda` não definido → V2 recebe known_slots incompleto | — | V2 detecta via heurística mesmo sem known_slots | V2 pode detectar slot que V1 não detectaria | Possível reply cognitivo a mais (inofensivo) | Telemetria (slot_detected não esperado) | V2 heurística é independente de known_slots | — |
| 10 | Diferença entre fixture e runtime | Fixtures são mensagens controladas; runtime tem typos, emojis, multilíngue | — | V2 pode não detectar slots em mensagens reais que V1 (via LLM) detectaria | Fallback usado com mais frequência | Menos respostas cognitivas contextuais | Shadow comparação | V2 tem fallback heurístico robusto | `COGNITIVE_V2_MODE=off` |
| 11 | V2 OpenAI timeout / rate limit | Chamada ao OpenAI falha | — | `engine.llm_error` no resultado | V2 usa fallback heurístico | Resposta heurística ao invés de LLM | Console log + telemetria | V2 tem 5 níveis de fallback | — |
| 12 | Shadow mode duplica latência | Shadow roda V2 APÓS V1, somando latência | Resposta mais lenta ao cliente | — | Nenhum estrutural | Percepção de lentidão | Monitorar p95 de response time | Shadow V2 pode falhar sem impacto (catch silencia) | Desativar shadow |
| 13 | `entities.composicao_tipo` ausente | Adapter não produz alias `composicao_tipo` | — | `extractCompatibleStageAnswer` busca `entities.composicao_tipo` e não encontra | Fallback para `stageSignals.composicao` ou `safe_stage_signal` | Funciona por caminho alternativo | Teste unitário | Adicionar alias no adapter | — |

### E.2 — Classificação de Severidade

| Severidade | Falhas | Ação |
|-----------|--------|------|
| **CRÍTICA** (derruba atendimento) | Nenhuma identificada | — |
| **ALTA** (degrada qualidade) | #10 (fixture vs runtime), #12 (latência shadow) | Monitorar em shadow |
| **MÉDIA** (funcional mas subótimo) | #1, #2, #5, #6, #13 | Cobrir com testes |
| **BAIXA** (informativa) | #3, #4, #7, #8, #9, #11 | Logs suficientes |

---

## BLOCO F — PRÉ-REQUISITOS DE IMPLEMENTAÇÃO

### F.1 — Status dos Pré-requisitos

| # | Categoria | Requisito | Status | Evidência | Bloqueador? |
|---|-----------|-----------|--------|-----------|------------|
| 1 | Decisão arquitetural | Ponto de entrada definido (runFunnel) | ✅ PRONTO | Bloco A deste documento | NÃO |
| 2 | Decisão arquitetural | Motor V2 é fonte canônica | ✅ PRONTO | Decisão do handoff | NÃO |
| 3 | Decisão arquitetural | Estratégia por substituição, não fusão | ✅ PRONTO | Decisão do handoff | NÃO |
| 4 | Contrato de input | Mapeamento state → known_slots | ✅ PRONTO | `runCognitiveV2WithAdapter()` L2275-2281 | NÃO |
| 5 | Contrato de output | Adapter V2→V1 format | ✅ PRONTO com ressalva | `adaptCognitiveV2Output()` L2206-2270 | NÃO (ressalva: alias composicao_tipo) |
| 6 | Feature flag | `COGNITIVE_V2_MODE` com 3 modos | ✅ PRONTO | L19463 | NÃO |
| 7 | Feature flag default | Default = "off" | ✅ PRONTO | L19463: `env.COGNITIVE_V2_MODE \|\| "off"` | NÃO |
| 8 | Rollback validado | Rollback = set COGNITIVE_V2_MODE=off | ✅ PRONTO | Flag com default seguro | NÃO |
| 9 | Smoke test adapter | 17 testes cobrindo adapter | ✅ PRONTO | `schema/cognitive_v2_adapter.smoke.mjs` | NÃO |
| 10 | Smoke test telemetry | Cobertura V1 | ✅ PRONTO | `schema/cognitive_telemetry.smoke.mjs` | NÃO |
| 11 | Smoke test telemetry V2 | Cobertura V2 (modo "on") | ❌ NÃO PRONTO | Falta | SIM — bloqueador parcial |
| 12 | Shadow telemetria | Log de comparação V1 vs V2 | ✅ PRONTO (parcial) | L19510-19519 | NÃO (mas lacunas D.2) |
| 13 | Critério shadow avanço | Métricas para decidir "on" | ✅ PRONTO | Bloco D deste documento | NÃO |
| 14 | Critério shadow rollback | Métricas para decidir "off" | ✅ PRONTO | Bloco D deste documento | NÃO |
| 15 | Caso crítico: composicao_tipo | Alias no adapter | ❌ NÃO PRONTO | Falta 1 linha | NÃO (funciona por fallback) |
| 16 | Caso crítico: shadow latência | Monitoramento de p95 | ❌ NÃO PRONTO | Não instrumentado | NÃO (shadow é opcional) |
| 17 | Estratégia de ativação | Ambiente → shadow → validar → on | ✅ PRONTO | Bloco G deste documento | NÃO |
| 18 | Logs/telemetria mínimos | Console log de erros V2 | ✅ PRONTO | L2306, L19481 | NÃO |
| 19 | Expansão de stages | Decisão se V2 cobre mais que 5 stages | ✅ DECIDIDO: NÃO AGORA | Manter COGNITIVE_V1_ALLOWED_STAGES inalterado | NÃO |

### F.2 — O Que Já Está Pronto

1. ✅ Feature flag `COGNITIVE_V2_MODE` com 3 modos (off/shadow/on) — L19463
2. ✅ Adapter `adaptCognitiveV2Output()` — L2206-2270
3. ✅ Wrapper `runCognitiveV2WithAdapter()` — L2272-2309
4. ✅ Shadow telemetria comparativa — L19510-19519
5. ✅ Smoke test adapter (17 testes) — `schema/cognitive_v2_adapter.smoke.mjs`
6. ✅ Smoke test telemetria V1 — `schema/cognitive_telemetry.smoke.mjs`
7. ✅ Smoke test runner V2 isolado (42+ fixtures) — `schema/cognitive_read_only_runner.smoke.mjs`
8. ✅ Rollback por env var com default "off"
9. ✅ Fallback genérico (`buildCognitiveFallback`) em todos os error paths
10. ✅ `COGNITIVE_HEURISTIC_REASONS` Set cobre reasons do V2 — L19548

### F.3 — O Que Ainda NÃO Está Pronto

1. ❌ Smoke test de telemetria em modo V2 "on" (testar que telemetria emite corretamente quando V2 é primário)
2. ❌ Alias `entities.composicao_tipo` no adapter (1 linha)
3. ❌ Shadow telemetria expandida (campos D.2 faltando)
4. ❌ Monitoramento de latência p95 em shadow mode

### F.4 — O Que Bloqueia Implementação

**Nada bloqueia a implementação.** Os itens pendentes são melhorias que podem ser feitas incrementalmente:
- Item 1 (smoke test V2 telemetria): RECOMENDADO antes de ativar "on", mas não bloqueia "shadow"
- Item 2 (alias composicao_tipo): RECOMENDADO, funciona por fallback sem ele
- Item 3 (shadow expandido): RECOMENDADO para análise mais rica, não bloqueia
- Item 4 (latência): NICE-TO-HAVE, monitorável externamente

---

## BLOCO G — PLANO DE IMPLEMENTAÇÃO CONGELADO

### Premissa

O código de infraestrutura (adapter, wrapper, flag, branching, telemetria shadow) **já está implementado no worker**. O plano abaixo foca em: (a) correções pontuais, (b) testes faltando, (c) sequência de ativação segura.

### Etapa 1 — Corrigir Alias de Entities no Adapter

| Campo | Valor |
|-------|-------|
| **Objetivo** | Garantir que `extractCompatibleStageAnswerFromCognitive()` encontre `composicao_tipo` por caminho primário |
| **Arquivo/bloco** | `Enova worker.js` L2217-2222 (entities loop no adapter) |
| **Dependência anterior** | Nenhuma |
| **Risco** | MÍNIMO — adiciona 1 campo ao objeto entities |
| **O que NÃO pode ser alterado** | Formato do objeto entities; campos existentes; lógica do adapter |
| **Critério de aceite** | `extractCompatibleStageAnswerFromCognitive("quem_pode_somar", adapted)` retorna valor correto |
| **Smoke test** | Adicionar caso ao `cognitive_v2_adapter.smoke.mjs` testando composicao_tipo |
| **Rollback** | Remover a linha adicionada |

**Alteração exata:**
```javascript
// Em adaptCognitiveV2Output(), dentro do loop de entities (L2217-2222):
// Após: if (slot && slot.value != null) entities[key] = slot.value;
// Adicionar: if (key === "composicao") entities.composicao_tipo = slot.value;
```

### Etapa 2 — Expandir Shadow Telemetria

| Campo | Valor |
|-------|-------|
| **Objetivo** | Logar campos comparativos adicionais para análise offline |
| **Arquivo/bloco** | `Enova worker.js` L19510-19519 (bloco v2_shadow) |
| **Dependência anterior** | Nenhuma |
| **Risco** | MÍNIMO — apenas adiciona campos ao log |
| **O que NÃO pode ser alterado** | Campos existentes no v2_shadow; fluxo do runtime |
| **Critério de aceite** | Telemetria v2_shadow inclui campos adicionais |
| **Smoke test** | Verificar no log que campos extras aparecem |
| **Rollback** | Remover campos adicionados |

**Campos a adicionar ao bloco `telemetryDetails.v2_shadow`:**
```javascript
still_needs_original_answer: v2Shadow.still_needs_original_answer ?? null,
answered_customer_question: v2Shadow.answered_customer_question ?? null,
reply_text_snippet: String(v2Shadow.reply_text || "").slice(0, 80) || null,
entities_keys: Object.keys(v2Shadow.entities || {})
```

### Etapa 3 — Smoke Test para Modo V2 "on"

| Campo | Valor |
|-------|-------|
| **Objetivo** | Validar que telemetria emite corretamente quando V2 é primário |
| **Arquivo/bloco** | `schema/cognitive_v2_mode_on.smoke.mjs` (novo arquivo) |
| **Dependência anterior** | Etapa 1 (alias) |
| **Risco** | NULO — apenas teste |
| **O que NÃO pode ser alterado** | Nada — arquivo novo |
| **Critério de aceite** | Teste passa exercitando path COGNITIVE_V2_MODE="on" com mock OpenAI |
| **Smoke test** | O próprio arquivo |
| **Rollback** | Deletar arquivo |

**Cenários mínimos:**
1. V2 "on" com fixture `casado_civil` → validar reply_text não vazio, confidence > 0, reason contém "cognitive_v2"
2. V2 "on" com fixture `composicao_familiar` → validar `entities.composicao_tipo` presente
3. V2 "on" com OpenAI mock fallback → validar reason="cognitive_v2_heuristic"
4. V2 "on" → validar telemetria emitida com `cognitive_v2_mode: "on"`

### Etapa 4 — Ativar Shadow em Staging

| Campo | Valor |
|-------|-------|
| **Objetivo** | Coletar dados comparativos V1 vs V2 em ambiente real |
| **Arquivo/bloco** | Cloudflare dashboard → env vars do worker test |
| **Dependência anterior** | Etapas 1-3 concluídas e smoke tests passando |
| **Risco** | BAIXO — shadow não afeta fluxo real, apenas duplica latência |
| **O que NÃO pode ser alterado** | Código do worker; config de produção |
| **Critério de aceite** | Logs de telemetria mostram bloco `v2_shadow` com dados de comparação |
| **Smoke test** | Verificar manualmente nos logs do Cloudflare |
| **Rollback** | Remover var `COGNITIVE_V2_MODE` do dashboard (volta ao default "off") |

**Ação:** `COGNITIVE_V2_MODE=shadow` no ambiente test

### Etapa 5 — Análise de Shadow (NÃO É código)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Validar critérios D.3 com dados reais |
| **Arquivo/bloco** | N/A — análise de logs |
| **Dependência anterior** | Etapa 4 ativada + ≥500 chamadas shadow |
| **Risco** | NULO — análise offline |
| **O que NÃO pode ser alterado** | N/A |
| **Critério de aceite** | Todos os critérios de avanço do Bloco D.3 atendidos |
| **Smoke test** | N/A |
| **Rollback** | N/A |

**Checklist de validação:**
- [ ] ≥500 chamadas shadow sem exception
- [ ] Exception rate V2 < 0.5%
- [ ] safe_stage_signal compatibilidade ≥ 90%
- [ ] Nenhum safe_stage_signal incompatível
- [ ] |confidence V1 - V2| média ≤ 0.25
- [ ] V2 reply_text vazio < 1%
- [ ] Todos os 5 stages cobertos nas amostras
- [ ] Smoke tests passando 100%

### Etapa 6 — Ativar V2 em Staging

| Campo | Valor |
|-------|-------|
| **Objetivo** | V2 como motor primário em staging |
| **Arquivo/bloco** | Cloudflare dashboard → env vars do worker test |
| **Dependência anterior** | Etapa 5 concluída com critérios atendidos |
| **Risco** | MÉDIO — V2 respondendo ao invés de V1 em staging |
| **O que NÃO pode ser alterado** | Código do worker; config de produção |
| **Critério de aceite** | Atendimentos em staging funcionam com reply cognitivo contextual |
| **Smoke test** | Testar manualmente 5 conversações (1 por stage) |
| **Rollback** | `COGNITIVE_V2_MODE=shadow` ou `COGNITIVE_V2_MODE=off` |

**Ação:** `COGNITIVE_V2_MODE=on` no ambiente test

### Etapa 7 — Shadow em Produção

| Campo | Valor |
|-------|-------|
| **Objetivo** | Coletar dados comparativos com tráfego real de produção |
| **Arquivo/bloco** | Cloudflare dashboard → env vars do worker prod |
| **Dependência anterior** | Etapa 6 validada em staging |
| **Risco** | BAIXO — shadow apenas loga, V1 responde |
| **O que NÃO pode ser alterado** | Código do worker; modo de operação (V1 primário) |
| **Critério de aceite** | Shadow dados em produção confirmam padrões observados em staging |
| **Smoke test** | Verificar logs de produção |
| **Rollback** | Remover `COGNITIVE_V2_MODE` do dashboard |

### Etapa 8 — Ativar V2 em Produção

| Campo | Valor |
|-------|-------|
| **Objetivo** | V2 como motor primário em produção |
| **Arquivo/bloco** | Cloudflare dashboard → env vars do worker prod |
| **Dependência anterior** | Etapa 7 concluída + critérios D.3 reavaliados com dados de produção |
| **Risco** | ALTO — afeta atendimentos reais |
| **O que NÃO pode ser alterado** | Código do worker |
| **Critério de aceite** | Atendimentos reais com V2 sem regressão por ≥500 interações |
| **Smoke test** | Monitorar telemetria contínua |
| **Rollback** | `COGNITIVE_V2_MODE=off` — **rollback instantâneo** |

### Etapa 9 — Remover Legado (FUTURA)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Limpar código V1 morto |
| **Arquivo/bloco** | `Enova worker.js` — remover `cognitiveAssistV1`, `COGNITIVE_PLAYBOOK_V1`, flag branching, simplificar bloco |
| **Dependência anterior** | V2 em produção estável por ≥ 2000 interações + critérios D.3 mantidos |
| **Risco** | BAIXO (após validação extensa) |
| **O que NÃO pode ser alterado** | Nada que não seja legado V1 |
| **Critério de aceite** | Todos os smoke tests passam; worker compila; nenhuma referência ao V1 exceto comments |
| **Smoke test** | Todos os existentes + novos V2 |
| **Rollback** | Git revert |

---

## APÊNDICE — CHECKLIST DE IMPLEMENTAÇÃO

### Itens de Código (Etapas 1-3)

- [ ] **Etapa 1:** Adicionar alias `entities.composicao_tipo` no adapter (1 linha, `Enova worker.js` L~2221)
- [ ] **Etapa 1:** Adicionar teste do alias em `cognitive_v2_adapter.smoke.mjs`
- [ ] **Etapa 2:** Expandir bloco v2_shadow com campos adicionais (`Enova worker.js` L~19517)
- [ ] **Etapa 3:** Criar `schema/cognitive_v2_mode_on.smoke.mjs` com 4 cenários
- [ ] Rodar TODOS os smoke tests cognitivos (adapter, telemetry, runner, admin)
- [ ] Validar que modo "off" continua funcionando identicamente

### Itens de Configuração (Etapas 4-8)

- [ ] **Etapa 4:** Definir `COGNITIVE_V2_MODE=shadow` em staging
- [ ] **Etapa 5:** Analisar ≥500 chamadas shadow contra critérios D.3
- [ ] **Etapa 6:** Definir `COGNITIVE_V2_MODE=on` em staging + testar 5 conversas
- [ ] **Etapa 7:** Definir `COGNITIVE_V2_MODE=shadow` em produção
- [ ] **Etapa 8:** Definir `COGNITIVE_V2_MODE=on` em produção após validação

### Itens Futuros (Pós-migração)

- [ ] **Etapa 9:** Remover código legado V1 após estabilização
- [ ] Expandir `COGNITIVE_V1_ALLOWED_STAGES` para incluir stages adicionais do V2
- [ ] Considerar renomear para `COGNITIVE_ALLOWED_STAGES` (remover V1 do nome)
