# PLANO DE MIGRAÇÃO — COGNITIVO ISOLADO → WORKER PRINCIPAL

**Data:** 2026-03-31  
**Decisão arquitetural:** A base isolada (`cognitive/src/run-cognitive.js`) é a fonte canônica de evolução.  
**O `cognitiveAssistV1` no worker é legado transitório.**  
**Estratégia:** Substituição controlada por flag, não fusão híbrida.

---

## STATUS OPERACIONAL — HANDOFF

**Última atualização:** 2026-04-02

| Etapa | Descrição | Status |
|-------|-----------|--------|
| Merge infra V2 | Adapter, wrapper, flag, telemetria shadow no worker | ✅ CONCLUÍDO |
| Smoke tests V2 | 4 suites: adapter, mode_on, runner, telemetria | ✅ PASSANDO |
| Shadow integration smoke | cognitive_shadow_integration.smoke.mjs (18 testes) | ✅ PASSANDO |
| **Shadow TEST ativado** | `COGNITIVE_V2_MODE=shadow` + `TELEMETRIA_LEVEL=verbose` em `[env.test.vars]` | ✅ **ATIVADO** |
| Validação operacional shadow TEST | V1 primário, V2 paralelo, v2_shadow presente, sem erros | ✅ **VALIDADO** |
| Amostragem TEST | estado_civil, quem_pode_somar, interpretar_composicao, renda, ir_declarado | ✅ **5/5 OK** |
| Análise de shadow (≥500 chamadas reais) | Dados comparativos V1 vs V2 com tráfego real | ⏳ PENDENTE |
| On TEST | `COGNITIVE_V2_MODE=on` em TEST | ⏳ AGUARDA ANÁLISE SHADOW |
| Shadow PROD | `COGNITIVE_V2_MODE=shadow` em produção | ⏳ AGUARDA ON TEST |
| On PROD | `COGNITIVE_V2_MODE=on` em produção | ⏳ AGUARDA SHADOW PROD |
| Remover legado V1 | Limpar cognitiveAssistV1, playbook, constantes obsoletas | ⏳ FUTURA |

### Evidências da validação shadow TEST (2026-04-02)

- **cognitive_shadow_integration.smoke.mjs:** 18/18 ✅
  - Grupo 1: v2_shadow presente em todos os blocos (9 stages)
  - Grupo 2: zero COGNITIVE_V2_SHADOW_ERROR
  - Grupo 3: V1 como motor primário confirmado (`"Cognitive v1 acionado"`)
  - Grupo 4: v2_shadow com 9 campos comparativos obrigatórios
  - Grupo 5: should_advance_stage=false via adapter
  - Grupo 6: trilho mecânico preservado (estado_civil avança corretamente)
  - Grupo 7: rollback `COGNITIVE_V2_MODE=off` → v2_shadow ausente confirmado
  - Grupo 8: stages extras (autonomo_compor_renda, agendamento_visita)

- **Amostragem operacional PARTE 4 (5/5 ✅):**
  - `quem_pode_somar`: signals=1, v2_shadow=true, no_errors=true, v1_primary=true, mode=shadow
  - `interpretar_composicao`: signals=1, v2_shadow=true, no_errors=true, v1_primary=true, mode=shadow
  - `estado_civil`: signals=1, v2_shadow=true, no_errors=true, v1_primary=true, mode=shadow
  - `renda`: signals=1, v2_shadow=true, no_errors=true, v1_primary=true, mode=shadow
  - `ir_declarado`: signals=1, v2_shadow=true, no_errors=true, v1_primary=true, mode=shadow

### Próximo passo único e correto

Coletar ≥500 chamadas shadow reais no TEST e analisar critérios do ADENDO_FINAL (Bloco 3/4.1).  
Rollback imediato se necessário: remover `COGNITIVE_V2_MODE` de `[env.test.vars]` no `wrangler.toml`.

---

## BLOCO 1 — PONTO DE ENTRADA CANÔNICO

### Onde a migração deve entrar no worker

**Ponto exato:** `Enova worker.js`, bloco `runFunnel()`, linhas 19349-19417.

**Justificativa técnica:**

O ponto de integração real do cognitivo no worker já existe e está ativo em produção:

```
runFunnel(env, st, userText)   // L19142
  ├── initializeCognitiveTelemetryState(st, stage)  // L19163
  ├── yesNoStages guard   // L19305-19340
  ├── shouldTriggerCognitiveAssist(stage, userText)  // L19349  ← PONTO DE ENTRADA
  │   ├── cognitiveAssistV1(env, {...})   // L19351  ← LEGADO (substituir)
  │   ├── isStageSignalCompatible(...)    // L19357
  │   ├── telemetry "cognitive_v1_signal" // L19362
  │   └── st.__cognitive_reply_prefix = cognitiveReply  // L19393  ← CONTRATO DE SAÍDA
  ├── offtrackGuard(env, {...})   // L19424
  └── switch(stage) {...}   // L19629
```

**A substituição acontece dentro do bloco `if (shouldTriggerCognitiveAssist(...))` (L19349-19417):**

1. `cognitiveAssistV1()` (L19351) será substituído por chamada ao motor isolado via adapter
2. O adapter transforma o output do motor isolado no formato que o worker já consome
3. Tudo que vem DEPOIS (telemetria, prefix, signal check) continua inalterado
4. O `shouldTriggerCognitiveAssist()` (L2102) pode ser mantido inicialmente para não alterar o trigger

**Por que este ponto e não outro:**

- É o ÚNICO ponto onde o cognitivo já entra no fluxo real
- O contrato de saída já está definido: `st.__cognitive_reply_prefix` (L159-168 no `step()`)
- A telemetria já está instrumentada (L19362-19410)
- Alterar aqui NÃO toca em gates, nextStage, switch cases, nem step()
- É cirúrgico: substituir UMA função dentro de UM bloco condicional

**Arquivos impactados:**

| Arquivo | Mudança | Risco |
|---------|---------|-------|
| `Enova worker.js` L19349-19417 | Trocar chamada `cognitiveAssistV1` por `adaptedCognitiveV2` | BAIXO — mesma posição, mesmo contrato de saída |
| `Enova worker.js` L2200-2245 | `cognitiveAssistV1` marcada como legado, protegida por flag | ZERO — função permanece, só não é chamada |
| `cognitive/src/run-cognitive.js` | ZERO alterações — fonte canônica não muda | ZERO |

---

## BLOCO 2 — ADAPTER DE COMPATIBILIDADE

### O Problema

Os dois motores têm contratos de saída **incompatíveis**:

**Output do legado `cognitiveAssistV1` (10 campos):**
```javascript
{
  reply_text: string,                    // Texto de resposta
  intent: string,                        // Intent detectado
  entities: {},                          // Entidades extraídas
  stage_signals: {},                     // Sinais por stage
  still_needs_original_answer: boolean,  // Ainda precisa da resposta original
  answered_customer_question: boolean,   // Respondeu dúvida do cliente
  safe_stage_signal: string | null,      // Sinal seguro compatível
  suggested_stage: string,               // Stage sugerido
  confidence: number,                    // 0-1
  reason: string                         // Motivo da resposta
}
```

**Output do isolado `runReadOnlyCognitiveEngine` (wrapper completo):**
```javascript
{
  ok: boolean,
  mode: "read_only_test",
  request: {...},
  response: {
    reply_text: string,
    slots_detected: { [slot]: { value, confidence, evidence, source } },
    pending_slots: string[],
    conflicts: [{ slot, reason }],
    suggested_next_slot: string | null,
    consultive_notes: string[],
    should_request_confirmation: boolean,
    should_advance_stage: false,
    confidence: number
  },
  llm_raw_response: string | null,
  llm_parsed_response: object | null,
  validation: { valid, errors },
  engine: { llm_attempted, llm_used, llm_error, fallback_used, provider, model, fallback_reason }
}
```

### O Adapter

O adapter (`adaptCognitiveV2Output`) faz a conversão do output isolado para o formato que o worker já consome:

**Entrada:** Output completo de `runReadOnlyCognitiveEngine`  
**Saída:** Objeto compatível com o formato de `cognitiveAssistV1`

**Mapeamento campo-a-campo:**

| Campo Worker (legado) | Fonte no Isolado | Transformação |
|----------------------|------------------|---------------|
| `reply_text` | `response.reply_text` | Direto, depois `sanitizeCognitiveReply()` |
| `intent` | Derivado de `response.slots_detected` | Se tem slots → "cognitive_v2_slot_detected"; se offtrack → "offtrack_contextual"; senão → "fallback_contextual" |
| `entities` | `response.slots_detected` | Converte `{ slot: { value } }` → `{ slot: value }` |
| `stage_signals` | Derivado de `slots_detected` | Converte para sinais de stage usando mapa de compatibilidade |
| `still_needs_original_answer` | `response.pending_slots.length > 0 && response.confidence < 0.8` | Inferido do estado pendente |
| `answered_customer_question` | `response.reply_text.length > 20 && !response.should_request_confirmation` | Inferido do conteúdo |
| `safe_stage_signal` | Derivado do slot mais relevante para o stage | Construído com formato `"slot_key:value"` |
| `suggested_stage` | Sempre o stage atual (cognitivo não decide funil) | `stage` passado como parâmetro |
| `confidence` | `response.confidence` | Direto |
| `reason` | `engine.llm_used ? "cognitive_v2" : "cognitive_v2_heuristic"` | Indica versão |

**Implementação em `Enova worker.js`:**

```javascript
function adaptCognitiveV2Output(stage, v2Result) {
  // ... conversão campo-a-campo
  // Retorna objeto no formato cognitiveAssistV1
}
```

**Localização:** Será inserido logo abaixo do `buildCognitiveFallback` (L2198), mantendo proximidade com o código legado.

### Contrato Mínimo de Entrada

O worker precisa montar o input para `runReadOnlyCognitiveEngine`:

```javascript
const rawInput = {
  current_stage: stage,
  message_text: userText,
  known_slots: {
    estado_civil: st.estado_civil ? { value: st.estado_civil } : undefined,
    composicao: st.somar_renda ? { value: st.somar_renda } : undefined,
    renda: st.renda ? { value: st.renda } : undefined,
    regime_trabalho: st.regime ? { value: st.regime } : undefined
  },
  pending_slots: [],  // O motor isolado calcula pendências sozinho
  recent_messages: [] // Opcional, pode ser expandido depois
};
```

**Options:**
```javascript
const options = {
  openaiApiKey: getOpenAIConfig(env).apiKey,
  model: String(env.COGNITIVE_AI_MODEL || "gpt-4.1-mini"),
  fetchImpl: typeof env.__COGNITIVE_OPENAI_FETCH === "function"
    ? env.__COGNITIVE_OPENAI_FETCH
    : typeof fetch === "function" ? fetch.bind(globalThis) : null
};
```

---

## BLOCO 3 — ESTRATÉGIA DE SUBSTITUIÇÃO

### Convivência Temporária

A convivência usa **flag de runtime** com 3 modos:

| Modo (`COGNITIVE_V2_MODE`) | Comportamento |
|---------------------------|---------------|
| `"off"` (default) | Usa `cognitiveAssistV1` — comportamento atual, zero mudança |
| `"shadow"` | Chama AMBOS: legado responde no fluxo, isolado roda em paralelo e loga telemetria para comparação |
| `"on"` | Usa motor isolado via adapter — legado desligado |

**Proteção por flag:** `env.COGNITIVE_V2_MODE || "off"`

**Fluxo com flag:**
```
if (shouldTriggerCognitiveAssist(stage, userText)) {
  const v2Mode = String(env.COGNITIVE_V2_MODE || "off").toLowerCase();

  if (v2Mode === "on") {
    // Motor isolado via adapter
    cognitive = await runCognitiveV2WithAdapter(env, stage, userText, st);
  } else if (v2Mode === "shadow") {
    // Legado responde, isolado roda em paralelo para telemetria
    cognitive = await cognitiveAssistV1(env, { stage, text: userText, stateSnapshot: st });
    runCognitiveV2Shadow(env, stage, userText, st); // fire-and-forget
  } else {
    // Legado puro (default)
    cognitive = await cognitiveAssistV1(env, { stage, text: userText, stateSnapshot: st });
  }

  // ... resto do bloco continua IGUAL (telemetria, prefix, etc.)
}
```

### Caminho para Desligamento Final do Legado

| Etapa | Condição | Ação |
|-------|----------|------|
| 1 | Deploy com `COGNITIVE_V2_MODE=off` | Tudo como hoje — zero risco |
| 2 | `COGNITIVE_V2_MODE=shadow` em staging | Comparar telemetria V1 vs V2 — sem impacto no fluxo |
| 3 | `COGNITIVE_V2_MODE=on` em staging | Motor isolado respondendo — validar com fixtures |
| 4 | `COGNITIVE_V2_MODE=on` em produção | Motor isolado em produção — monitorar telemetria |
| 5 | Remover flag + código legado | Apagar `cognitiveAssistV1`, `buildCognitiveFallback`, `COGNITIVE_PLAYBOOK_V1`, constantes obsoletas |

**Condição para desligar o legado:**
- Modo `"on"` rodando em produção por ≥7 dias
- Telemetria cognitiva mostra confidence média ≥ V1
- Nenhum spike de offtrack ou fallback
- Smoke tests V2 passando em 100% dos cenários

---

## BLOCO 4 — PLANO CIRÚRGICO DE IMPLEMENTAÇÃO

### Etapa 1 — Feature Flag `COGNITIVE_V2_MODE`

| Campo | Valor |
|-------|-------|
| **Objetivo** | Controlar qual motor cognitivo é usado no fluxo real |
| **Onde mexer** | `Enova worker.js` L19349-19417 (bloco `shouldTriggerCognitiveAssist`) |
| **Risco** | MÍNIMO — default `"off"` preserva comportamento atual |
| **Critério de aceite** | Com `COGNITIVE_V2_MODE` ausente ou `"off"`, comportamento idêntico ao atual. Smoke test de telemetria passa. |
| **Rollback** | Remover leitura da env var; código volta ao path direto do legado. |

### Etapa 2 — Adapter `adaptCognitiveV2Output`

| Campo | Valor |
|-------|-------|
| **Objetivo** | Converter output do motor isolado para formato compatível com o worker |
| **Onde mexer** | `Enova worker.js` — nova função entre L2198 e L2200 (entre `buildCognitiveFallback` e `cognitiveAssistV1`) |
| **Risco** | BAIXO — função pura sem side effects, testável isoladamente |
| **Critério de aceite** | Dado output real do motor isolado, adapter produz objeto que passa por todas as verificações existentes (`isStageSignalCompatible`, `extractCompatibleStageAnswerFromCognitive`, `sanitizeCognitiveReply`) |
| **Rollback** | Remover a função. Sem impacto se flag está `"off"`. |

### Etapa 3 — Função `runCognitiveV2WithAdapter`

| Campo | Valor |
|-------|-------|
| **Objetivo** | Encapsular chamada ao motor isolado + adapter em função limpa |
| **Onde mexer** | `Enova worker.js` — nova função logo após adapter |
| **Risco** | BAIXO — é wrapper que combina motor isolado (já testado) com adapter (etapa 2) |
| **Critério de aceite** | Retorna output no formato cognitiveAssistV1 ou fallback em caso de erro |
| **Rollback** | Remover a função. Flag `"off"` garante que nunca é chamada. |

### Etapa 4 — Modo Shadow (`COGNITIVE_V2_MODE=shadow`)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Rodar motor isolado em paralelo ao legado para coletar telemetria comparativa |
| **Onde mexer** | `Enova worker.js` L19349 — dentro do bloco de flag |
| **Risco** | BAIXO — shadow não afeta resposta ao cliente, apenas loga |
| **Critério de aceite** | Telemetria mostra comparação V1 vs V2 (confidence, reply_text length, slots) |
| **Rollback** | Setar `COGNITIVE_V2_MODE=off`. |

### Etapa 5 — Ativação Full (`COGNITIVE_V2_MODE=on`)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Motor isolado respondendo no fluxo real |
| **Onde mexer** | Apenas env var — zero alteração de código |
| **Risco** | MÉDIO — primeiro momento que motor isolado gera respostas reais |
| **Critério de aceite** | Smoke tests passam. Telemetria shadow mostra paridade. Respostas em produção são coerentes. |
| **Rollback** | Setar `COGNITIVE_V2_MODE=off` — restaura legado instantaneamente. |

### Etapa 6 — Remoção do Legado

| Campo | Valor |
|-------|-------|
| **Objetivo** | Limpar código morto após validação completa |
| **Onde mexer** | `Enova worker.js` — remover `cognitiveAssistV1`, `buildCognitiveFallback`, `COGNITIVE_PLAYBOOK_V1`, `COGNITIVE_V1_ALLOWED_STAGES`, `COGNITIVE_V1_CONFIDENCE_MIN`, flag de modo |
| **Risco** | BAIXO após 7+ dias de modo `"on"` estável |
| **Critério de aceite** | Todos os smoke tests passam. Nenhuma referência ao legado resta. |
| **Rollback** | Git revert. |

---

## BLOCO 5 — VEREDITO FINAL

### Qual é a implementação mais correta

A substituição controlada por flag com adapter de compatibilidade. O motor isolado (`runReadOnlyCognitiveEngine`) já está maduro o suficiente (1492 linhas, 40+ fixtures, contratos canônicos, integração OpenAI testada). O legado (`cognitiveAssistV1`) é ~50 linhas que fazem chamada direta ao OpenAI sem heurística, sem slot extraction, sem validação de output, sem fallback sofisticado.

O adapter é a peça-chave: converte o output rico do motor isolado para o formato flat que o worker já consome via `__cognitive_reply_prefix`. Isso permite que o ponto de inserção (L19349-19417) continue funcionando exatamente como hoje — mesma telemetria, mesmo prefix, mesmo threshold de confiança.

### Qual é a primeira alteração real

1. Adicionar a função `adaptCognitiveV2Output()` no worker
2. Adicionar a função `runCognitiveV2WithAdapter()` no worker
3. Adicionar leitura de `env.COGNITIVE_V2_MODE` no bloco L19349
4. Adicionar branching: `"off"` → legado, `"shadow"` → ambos, `"on"` → isolado via adapter

**Nenhuma dessas alterações muda o comportamento atual** porque o default é `"off"`.

### Qual é a condição para desligar o legado

1. Modo `"on"` rodando em produção ≥7 dias sem regressão
2. Telemetria comparativa (shadow) mostra que V2 tem confidence ≥ V1
3. Todos os 40+ fixtures do motor isolado passam via adapter
4. Nenhum spike de offtrack, fallback ou erro em produção
5. Smoke tests do adapter cobrem todos os 5 stages permitidos

### Riscos residuais

| Risco | Mitigação |
|-------|-----------|
| Motor isolado mais lento que legado (heurística + LLM vs só LLM) | Medir latência no shadow mode antes de ativar |
| Adapter produz `safe_stage_signal` incompatível | Testar com `isStageSignalCompatible()` para todos os 5 stages |
| `reply_text` do isolado com tom diferente do legado | `sanitizeCognitiveReply()` já aplica sanitização; comparar no shadow |
| `COGNITIVE_AI_MODEL` env var conflita com `OFFTRACK_AI_MODEL` | São independentes — `getOpenAIConfig` usa `OFFTRACK_AI_MODEL`; adapter passa `COGNITIVE_AI_MODEL` |

---

## APÊNDICE — REFERÊNCIA DE CÓDIGO

### Funções do Legado (Candidatas a Remoção na Etapa 6)

| Função | Linhas | Papel | Usado por |
|--------|--------|-------|-----------|
| `cognitiveAssistV1()` | 2200-2245 | Motor LLM direto | runFunnel L19351 |
| `buildCognitiveFallback()` | 2185-2198 | Fallback genérico | cognitiveAssistV1 L2201 |
| `sanitizeCognitiveReply()` | 2115-2120 | Sanitização "casa→imóvel" | cognitiveAssistV1 L2231, runFunnel L19382 |
| `COGNITIVE_PLAYBOOK_V1` | 2004-2033 | Playbook V1 | cognitiveAssistV1 L2216 |
| `COGNITIVE_V1_ALLOWED_STAGES` | 1994-2000 | Set de stages | shouldTriggerCognitiveAssist L2103 |
| `COGNITIVE_V1_CONFIDENCE_MIN` | 2002 | Threshold 0.66 | runFunnel L19358 |

### Funções que PERMANECEM (Não são legado)

| Função | Linhas | Papel | Por que permanece |
|--------|--------|-------|-------------------|
| `shouldTriggerCognitiveAssist()` | 2102-2113 | Gate de ativação | Heurística de trigger independe do motor |
| `isStageSignalCompatible()` | 2122-2133 | Validação de sinal | Usada após qualquer motor |
| `extractCompatibleStageAnswerFromCognitive()` | 2135-2183 | Extração de resposta | Usada pela telemetria |
| `sanitizeCognitiveReply()` | 2115-2120 | Sanitização | Usada por ambos os motores |
| `hasClearStageAnswer()` | 2085-2100 | Detecção de resposta clara | Guard pré-cognitivo |
| Telemetria cognitiva | 48-120 | Tracking | Independe do motor |
| `callOpenAIJson()` | 2042-2083 | Wrapper OpenAI | Usado por offtrackGuard também |

### Funções do Motor Isolado (Fonte Canônica)

| Função | Arquivo | Papel |
|--------|---------|-------|
| `runReadOnlyCognitiveEngine()` | cognitive/src/run-cognitive.js:1390 | Motor principal |
| `detectSlotsFromConversation()` | cognitive/src/run-cognitive.js:877 | Extração heurística de slots |
| `buildHeuristicResponse()` | cognitive/src/run-cognitive.js:1195 | Resposta heurística completa |
| `normalizeModelResponse()` | cognitive/src/run-cognitive.js:1241 | Merge LLM + heurística |
| `validateReadOnlyCognitiveResponse()` | cognitive/src/run-cognitive.js:1344 | Validação canônica |
| `callOpenAIReadOnly()` | cognitive/src/run-cognitive.js:1061 | Wrapper OpenAI com error handling |
| `buildPhaseGuidanceReply()` | cognitive/src/run-cognitive.js:730 | 9 regras determinísticas |
