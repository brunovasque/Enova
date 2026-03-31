# DIAGNÓSTICO PROFUNDO — MIGRAÇÃO DO COGNITIVO PARA O WORKER PRINCIPAL

**Data:** 2026-03-31  
**Escopo:** Auditoria comparativa exaustiva entre worker principal e base isolada do cognitivo  
**Objetivo:** Preparar migração segura sem quebrar trilho mecânico

---

## BLOCO 1 — RAIO-X DO ESTADO ATUAL

### 1.1 — Verificação das Hipóteses do Handoff

| Hipótese | Status | Prova |
|----------|--------|-------|
| O cognitivo já saiu da fase de ideia e entrou na fase de produto | **CONFIRMADO** | `cognitive/src/run-cognitive.js` (1492 linhas), 40+ fixtures em `cognitive/fixtures/read-only-cases.js`, 6 contratos canônicos em `schema/cognitive/` |
| Já existe base documental canônica do cognitivo | **CONFIRMADO** | `schema/cognitive/COGNITIVE_ARCHITECTURE_V1.md`, `COGNITIVE_CALL_CONTRACT_V1.md`, `COGNITIVE_CONTRACT_V1.md`, `CONFIRMATION_RULES_V1.json`, `DEPENDENCIES_V1.json`, `SLOT_CATALOG_V1.json` |
| Já existe motor cognitivo isolado/read-only com runner próprio | **CONFIRMADO** | `runReadOnlyCognitiveEngine()` em `cognitive/src/run-cognitive.js:1390-1435`, CLI runner em linhas 1447-1483 |
| Já existe endpoint admin `/__admin__/cognitive-test` | **CONFIRMADO** | `Enova worker.js:5081-5195`, gated por `ENV_MODE=test` + admin auth |
| Já existe schema de resposta canônico | **CONFIRMADO** | `cognitive/src/response-schema.ts` — `CognitiveRequest`, `CognitiveResponse`, `CognitiveSlotValue`, `CognitiveConflict` |
| Isolamento do fluxo real funciona | **CONFIRMADO** | `should_advance_stage: false` hard-coded e validado em `validateReadOnlyCognitiveResponse()` (linhas 1344-1375) |
| Já houve integração com OpenAI real no modo read-only | **CONFIRMADO** | `callOpenAIReadOnly()` em `run-cognitive.js:1061-1114`, usa `gpt-4.1-mini`, `temperature: 0.2`, `response_format: json_object` |
| Já houve correção do bug de reply_text | **CONFIRMADO** | `sanitizeReplyText()` em `run-cognitive.js:328-336`, `REPLY_TEXT_REPLACEMENTS` regex em linhas 83-91 |
| Já existe evolução de tom/comercial/condução | **CONFIRMADO** | `COGNITIVE_PLAYBOOK_V1` em `worker.js:2004-2033`, `buildPhaseGuidanceReply()` com 9 regras determinísticas em `run-cognitive.js:730-749` |
| Já existe telemetria cognitiva passiva no worker principal | **CONFIRMADO** | `__cognitive_telemetry` state tracking: `initializeCognitiveTelemetryState()` (L52-62), `updateCognitiveTelemetryState()` (L64-71), `emitCognitiveTelemetry()` (L100-120), `resolveCognitiveTelemetrySlot()` (L78-98) |
| O cognitivo ainda NÃO responde no fluxo real do WhatsApp | **PARCIALMENTE CONFIRMADO — COM RESSALVA IMPORTANTE** | O `cognitiveAssistV1()` ESTÁ ativo no fluxo real para 5 stages (L19349-19410), mas funciona como **camada informativa/prefix** que NÃO controla o funil. O motor isolado (`runReadOnlyCognitiveEngine`) NÃO está no fluxo real. |

### 1.2 — DESCOBERTA CRÍTICA: Dois Motores Cognitivos Separados

O projeto tem **dois sistemas cognitivos distintos** com propósitos diferentes:

#### Motor 1 — `cognitiveAssistV1` (ATIVO no worker)
- **Arquivo:** `Enova worker.js`, linhas 2200-2245
- **Tamanho:** ~50 linhas de lógica
- **Stages cobertos:** 5 (`estado_civil`, `quem_pode_somar`, `interpretar_composicao`, `renda`, `ir_declarado`)
- **Integração:** Ativo na produção, chamado em `runFunnel()` (L19349-19410)
- **Efeito:** Gera `__cognitive_reply_prefix` que é prepended na resposta do `step()` (L159-168)
- **Contrato de saída:** 10 campos (reply_text, intent, entities, stage_signals, still_needs_original_answer, answered_customer_question, safe_stage_signal, suggested_stage, confidence, reason)
- **Threshold:** `COGNITIVE_V1_CONFIDENCE_MIN = 0.66` — abaixo disso, reply é descartado
- **Segurança:** Nunca avança stage sozinho; apenas prepend conversacional

#### Motor 2 — `runReadOnlyCognitiveEngine` (ISOLADO)
- **Arquivo:** `cognitive/src/run-cognitive.js`, linhas 1390-1435
- **Tamanho:** 1492 linhas de lógica
- **Stages cobertos:** 9+ (estado_civil, composicao, familiar, regime_trabalho, autonomo_ir, ctps, restricao, docs, correspondente, visita)
- **Integração:** NÃO está no fluxo real — apenas via `/__admin__/cognitive-test` (L5081-5195)
- **Efeito:** Retorna JSON completo com slots, conflitos, pendências, sugestões
- **Contrato de saída:** 12+ campos + metadados debug (llm_attempted, llm_used, fallback_used, provider, model, fallback_reason)
- **Segurança:** `should_advance_stage: false` hard-coded e validado

### 1.3 — O Que Existe no Worker Relacionado ao Cognitivo

| Componente | Linhas | Status | Papel |
|-----------|--------|--------|-------|
| Import de `cognitive/src/run-cognitive.js` | 1-5 | ATIVO | Importa 3 funções (getFixtureById, listFixtures, runEngine) |
| `hasCognitiveTelemetryState()` | 47-49 | ATIVO | Checa se telemetria cognitiva existe no state |
| `initializeCognitiveTelemetryState()` | 52-62 | ATIVO | Inicializa tracking (stage, used_llm, used_heuristic, offtrack, slot) |
| `updateCognitiveTelemetryState()` | 64-71 | ATIVO | Atualiza patch no estado de telemetria |
| `clearCognitiveTelemetryState()` | 73-76 | ATIVO | Limpa estado de telemetria |
| `resolveCognitiveTelemetrySlot()` | 78-98 | ATIVO | Resolve qual slot foi detectado pelo cognitivo |
| `emitCognitiveTelemetry()` | 100-120 | ATIVO | Emite telemetria via `logCognitiveTelemetry()` |
| `__cognitive_reply_prefix` | 159-168, 19393-19396 | ATIVO | Armazena e usa reply prefix do cognitivo no step() |
| `COGNITIVE_V1_ALLOWED_STAGES` | 1994-2000 | ATIVO | Set de 5 stages permitidos |
| `COGNITIVE_V1_CONFIDENCE_MIN` | 2002 | ATIVO | Threshold de confiança (0.66) |
| `COGNITIVE_PLAYBOOK_V1` | 2004-2033 | ATIVO | Regras de tom, limites duros, intents por stage |
| `shouldTriggerCognitiveAssist()` | 2102-2113 | ATIVO | Decide se LLM deve ser acionado (patterns: ?, conectores, offtrack, medo) |
| `sanitizeCognitiveReply()` | 2115-2120 | ATIVO | Limpa reply (troca "casa" por "imóvel", fallback genérico) |
| `isStageSignalCompatible()` | 2122-2133 | ATIVO | Valida se signal é compatível com stage |
| `extractCompatibleStageAnswerFromCognitive()` | 2135-2183 | ATIVO | Extrai resposta de stage de entities/signals do cognitivo |
| `buildCognitiveFallback()` | 2185-2198 | ATIVO | Fallback quando LLM falha |
| `cognitiveAssistV1()` | 2200-2245 | ATIVO | Motor cognitivo principal — chama OpenAI |
| `callOpenAIJson()` | 2042-2083 | ATIVO | Wrapper de chamada OpenAI (shared com offtrackGuard) |
| `/__admin__/cognitive-test` | 5081-5195 | ATIVO (test only) | Endpoint admin para teste do motor isolado |
| Chamada em `runFunnel()` | 19349-19410 | ATIVO | Ponto de integração real no fluxo |

### 1.4 — O Que Existe Exclusivamente na Base Isolada

| Componente | Arquivo | Status |
|-----------|--------|--------|
| `detectSlotsFromConversation()` | run-cognitive.js:877-942 | ISOLADO — 7 slots com regex avançado |
| `detectEstadoCivil()` | run-cognitive.js:258-264 | ISOLADO — Pattern matching estado civil |
| `detectRegime()` | run-cognitive.js:266-273 | ISOLADO — CLT/autônomo/servidor/aposentado |
| `detectIr()` | run-cognitive.js:275-283 | ISOLADO — IR sim/não |
| `detectComposicao()` | run-cognitive.js:285-294 | ISOLADO — Composição familiar |
| `detectFamiliar()` | run-cognitive.js:296-309 | ISOLADO — Mãe/pai/irmão/avô/tio etc. |
| `detectP3()` | run-cognitive.js:311-316 | ISOLADO — Terceira pessoa |
| `detectMoney()` | run-cognitive.js:243-256 | ISOLADO — BRL currency parsing |
| `detectKnownSlotConflicts()` | run-cognitive.js:~950+ | ISOLADO — Conflitos entre slots conhecidos e detectados |
| `buildHeuristicResponse()` | run-cognitive.js:1195-1239 | ISOLADO — Resposta heurística completa com cálculo de confiança |
| `normalizeModelResponse()` | run-cognitive.js:1241-1342 | ISOLADO — Merge LLM + heurística com 5 níveis de fallback |
| `buildPhaseGuidanceReply()` | run-cognitive.js:730-749 | ISOLADO — 9 regras determinísticas de orientação |
| `buildDocsGuidanceByProfile()` | run-cognitive.js:462-584 | ISOLADO — Checklist de docs por perfil (CLT/autônomo/servidor) |
| `buildCorrespondenteGuidance()` | run-cognitive.js:586-603 | ISOLADO — Orientação correspondente |
| `buildVisitaGuidance()` | run-cognitive.js:605-634 | ISOLADO — Orientação visita |
| `buildReprovacaoGuidance()` | run-cognitive.js:685-700 | ISOLADO — Orientação reprovação |
| `buildAluguelGuidance()` | run-cognitive.js:636 | ISOLADO — "Enova não trabalha com aluguel" |
| `buildEstadoCivilComposicaoGuidance()` | run-cognitive.js:702-728 | ISOLADO — Clarificação "mora junto" vs "união estável" |
| `COGNITIVE_SLOT_CONTRACT` | run-cognitive.js:116-152 | ISOLADO — 7 slots com dependências |
| `COGNITIVE_SLOT_DEPENDENCIES` | run-cognitive.js:73-82 | ISOLADO — Grafo de dependências de slots |
| `CONFIDENCE_RULES` | run-cognitive.js:64-71 | ISOLADO — Regras matemáticas de confiança |
| `STAGE_DEFAULT_PENDING_SLOTS` | run-cognitive.js:15-22 | ISOLADO — Slots pendentes por stage |
| `validateReadOnlyCognitiveResponse()` | run-cognitive.js:1344-1375 | ISOLADO — Validação de resposta |
| `normalizeText()` | run-cognitive.js:170-177 | ISOLADO — Normalização com UTF-8 repair |
| `repairTextEncoding()` | run-cognitive.js:158-168 | ISOLADO — Encoding repair |
| `sanitizeReplyText()` | run-cognitive.js:328-336 | ISOLADO — Limpeza de reply |
| `callOpenAIReadOnly()` | run-cognitive.js:1061-1114 | ISOLADO — Wrapper OpenAI com error handling detalhado |
| 40+ regexes especializados | run-cognitive.js:24-59 | ISOLADO — OFFTRACK_HINTS, AMBIGUOUS_HINTS, etc. |
| 40+ fixtures de teste | cognitive/fixtures/read-only-cases.js | ISOLADO |
| CLI runner | run-cognitive.js:1437-1492 | ISOLADO |
| TypeScript contracts | cognitive/src/*.ts (6 arquivos) | ISOLADO (stubs Phase 1) |

### 1.5 — Base de Conhecimento Normativa (CEF)

| Arquivo | Conteúdo | Usado por |
|---------|----------|-----------|
| `knowledge/cef/01_elegibilidade.md` | Regras de elegibilidade | Motor isolado (normative loader) |
| `knowledge/cef/02_composicao.md` | Regras de composição | Motor isolado (normative loader) |
| `knowledge/cef/03_autonomo_ir.md` | Regras IR autônomo | Motor isolado (normative loader) |
| `knowledge/cef/04_ctps.md` | Regras CTPS | Motor isolado (normative loader) |
| `knowledge/cef/05_restricao.md` | Regras de restrição | Motor isolado (normative loader) |
| `knowledge/cef/06_docs.md` | Regras de documentos | Motor isolado (normative loader) |
| `knowledge/cef/07_correspondente.md` | Regras correspondente | Motor isolado (normative loader) |
| `knowledge/cef/08_visita.md` | Regras de visita | Motor isolado (normative loader) |

**Status:** Existem no repo, mas o `normative-loader.ts` é apenas stub (`createNullNormativeLoader`) — não carrega documentos de verdade ainda.

---

## BLOCO 2 — MATRIZ COMPARATIVA

### 2.1 — Componentes e Sua Localização

| Componente | Worker (`cognitiveAssistV1`) | Isolado (`runReadOnly`) | Status | Risco | Obs. |
|-----------|----------------------------|-------------------------|--------|-------|------|
| **Chamada OpenAI** | `callOpenAIJson()` L2042 | `callOpenAIReadOnly()` L1061 | DUPLICADO | Médio | Dois wrappers OpenAI com contratos diferentes |
| **Prompt system** | Inline em `cognitiveAssistV1` L2203-2211 | `buildOpenAISystemPrompt()` L~1020 | DIVERGENTE | Alto | Worker usa prompt flat; isolado usa prompt estruturado |
| **Prompt user** | `JSON.stringify({stage, customer_text, playbook, known_state})` L2213 | `buildOpenAIUserPrompt()` com analysis seed | DIVERGENTE | Alto | Isolado envia muito mais contexto |
| **Contrato de saída** | 10 campos (reply_text, intent, entities...) | 12+ campos (human_response, known_slots, pending_slots, conflicts...) | INCOMPATÍVEL | Alto | Schemas são estruturalmente diferentes |
| **Slot extraction** | Nenhum — depende do LLM | `detectSlotsFromConversation()` + 7 detectores | SÓ NO ISOLADO | — | Worker não tem heurística de slots |
| **Conflict detection** | Nenhum | `detectKnownSlotConflicts()` | SÓ NO ISOLADO | — | Worker não detecta conflitos |
| **Confidence calculation** | Vem do LLM (campo confidence) | `CONFIDENCE_RULES` + fórmula matemática | DIVERGENTE | Médio | Worker confia no LLM; isolado calcula |
| **Heuristic fallback** | `buildCognitiveFallback()` — 1 resposta genérica | `buildHeuristicResponse()` — resposta completa | DIVERGENTE | Baixo | Isolado muito mais rico |
| **Reply sanitization** | `sanitizeCognitiveReply()` — troca "casa→imóvel" | `sanitizeReplyText()` + `REPLY_TEXT_REPLACEMENTS` | PARCIAL | Baixo | Worker faz sanitização mínima |
| **Stage coverage** | 5 stages | 9+ stages | PARCIAL | — | Isolado cobre mais stages |
| **Phase guidance** | Nenhum | 9 regras determinísticas | SÓ NO ISOLADO | — | Worker não tem orientação por fase |
| **Docs guidance** | Nenhum | `buildDocsGuidanceByProfile()` — por perfil | SÓ NO ISOLADO | — | Worker não tem checklist de docs |
| **Correspondent guidance** | Nenhum | `buildCorrespondenteGuidance()` | SÓ NO ISOLADO | — | |
| **Visit guidance** | Nenhum | `buildVisitaGuidance()` | SÓ NO ISOLADO | — | |
| **Text normalization** | `normalizeText()` — provavelmente redefinido no worker | `normalizeText()` + `repairTextEncoding()` | POTENCIAL DUPLICADO | Baixo | Verificar se são iguais |
| **Telemetria** | Completa (`__cognitive_telemetry`, emit, resolve) | Nenhuma no isolado | SÓ NO WORKER | — | |
| **Fixtures** | Nenhum | 40+ test cases | SÓ NO ISOLADO | — | |
| **Validação de resposta** | Nenhuma — aceita output do LLM | `validateReadOnlyCognitiveResponse()` | SÓ NO ISOLADO | Alto | Worker não valida output |
| **Offtrack detection** | `offtrackGuard()` L2265 — com LLM | 40+ regex patterns (OFFTRACK_HINTS etc.) | DIVERGENTE | Médio | Abordagens complementares |
| **Modelo AI** | `gpt-4.1-mini` (via getOpenAIConfig) | `gpt-4.1-mini` (via options.model) | ALINHADO | — | Mesmo modelo |
| **Temperature** | 0.2 | 0.2 | ALINHADO | — | |
| **Response format** | `json_object` | `json_object` | ALINHADO | — | |

### 2.2 — Classificação por Categoria Obrigatória

| Item | Classificação |
|------|--------------|
| `cognitiveAssistV1()` + telemetria + prefix | **ATIVO NO WORKER** |
| `runReadOnlyCognitiveEngine()` + fixtures + CLI | **ISOLADO NO COGNITIVO** |
| `/__admin__/cognitive-test` endpoint | **PARCIALMENTE INTEGRADO** (conecta isolado ao worker, mas só em test mode) |
| Import das 3 funções do isolado no worker | **PARCIALMENTE INTEGRADO** (importa mas só usa no admin endpoint) |
| `buildCognitiveFallback()` no worker | **ATIVO NO WORKER** (fallback mínimo) |
| `callOpenAIJson()` no worker | **ATIVO NO WORKER** (shared com offtrackGuard) |
| `callOpenAIReadOnly()` no isolado | **ISOLADO NO COGNITIVO** (mais robusto, com error handling detalhado) |
| TypeScript stubs (orchestrator, slot-engine, dependency-engine, normative-loader, prompts) | **LEGADO / RESQUÍCIO** (Phase 1 stubs, `getDependentSlots()` retorna `[]`) |
| 40+ regex patterns do isolado | **PRONTO PARA MIGRAR** (maduros, testados, independentes) |
| `buildDocsGuidanceByProfile()` | **PRONTO PARA MIGRAR** (lógica madura por perfil) |
| `buildVisitaGuidance()` / `buildCorrespondenteGuidance()` | **NÃO MEXER AGORA** (stages de correspondente/visita têm lógica mecânica densa) |
| `detectSlotsFromConversation()` | **PRONTO PARA MIGRAR** (core da extração, testado com fixtures) |
| `CONFIDENCE_RULES` + fórmula de confiança | **PRONTO PARA MIGRAR** (mais confiável que confiar no LLM) |
| `normalizeModelResponse()` (merge LLM + heurística) | **PRONTO PARA MIGRAR** (5 níveis de fallback) |
| Merge dos dois motores cognitivos | **RISCO ALTO** (schemas incompatíveis, contratos diferentes) |

---

## BLOCO 3 — GAPS REAIS PARA MIGRAÇÃO

### 3.1 — Gaps Estruturais

| # | Gap | Severidade | Descrição |
|---|-----|-----------|-----------|
| G1 | **Schema de saída incompatível** | CRÍTICO | Worker usa `{reply_text, intent, entities, stage_signals, ...}`. Isolado usa `{human_response, known_slots, pending_slots, conflicts, ...}`. Não são intercambiáveis. |
| G2 | **Sem validação de output no worker** | ALTO | `cognitiveAssistV1()` aceita qualquer JSON do LLM sem validar. O isolado tem `validateReadOnlyCognitiveResponse()` que verifica todos os campos. |
| G3 | **Confidence vem só do LLM no worker** | MÉDIO | Worker depende 100% do campo `confidence` do LLM. Isolado calcula confiança com fórmula matemática baseada em slots detectados, conflitos e offtrack. |
| G4 | **Nenhum slot extraction no worker** | ALTO | Worker não faz pattern matching local. Toda extração é delegada ao LLM. Se LLM falhar, nenhum slot é detectado. |
| G5 | **Nenhum conflict detection no worker** | MÉDIO | Worker não cruza slots conhecidos com detectados. Não sabe se LLM contradiz estado existente. |
| G6 | **Sem orientação por perfil no worker** | MÉDIO | Worker não tem `buildDocsGuidanceByProfile()` nem regras phase-specific. |
| G7 | **Sem normative loader operacional** | BAIXO | `createNullNormativeLoader()` retorna vazio. Knowledge base CEF (8 docs) existe mas não é carregada. |
| G8 | **Dependency engine é stub** | BAIXO | `getDependentSlots()` retorna `[]`. Slot dependencies definidas em JSON mas não usadas. |

### 3.2 — Gaps de Integração

| # | Gap | Severidade | Descrição |
|---|-----|-----------|-----------|
| G9 | **Sem feature flag para cognitivo** | ALTO | Não existe `COGNITIVE_ENABLED` ou `COGNITIVE_MODE` env var. `cognitiveAssistV1` roda sempre para stages permitidos quando há trigger. Precisa de kill switch. |
| G10 | **Sem rollback automático** | ALTO | Se o cognitivo produzir resposta ruim, não há mecanismo de rollback — prefix já foi adicionado. |
| G11 | **Sem A/B testing** | MÉDIO | Não há infraestrutura para comparar mecânico-only vs mecânico+cognitivo. |
| G12 | **Sem rate limiting do cognitivo** | MÉDIO | Não há limite de chamadas OpenAI por conversa/minuto. |
| G13 | **Sem circuit breaker** | MÉDIO | Se OpenAI estiver fora, cada mensagem tenta e falha. Sem cache de falhas recentes. |

### 3.3 — Gaps de Teste

| # | Gap | Severidade | Descrição |
|---|-----|-----------|-----------|
| G14 | **Fixtures do isolado não testam integração com worker** | ALTO | 40+ fixtures validam o motor isolado, mas nenhuma testa o fluxo real `runFunnel() → cognitiveAssistV1()`. |
| G15 | **Sem smoke test do fluxo cognitivo no worker** | ALTO | `cognitive_telemetry.smoke.mjs` testa telemetria; `cognitive_read_only_runner.smoke.mjs` testa motor isolado. Nenhum testa o fluxo E2E no worker. |

---

## BLOCO 4 — ESTRATÉGIA DE ENTRADA

### 4.1 — Análise de Pontos de Entrada Possíveis

| Ponto de Entrada | Viabilidade | Risco | Justificativa |
|-----------------|------------|-------|---------------|
| **Offtrack only** | ALTA | BAIXO | Já existe `offtrackGuard()` com LLM. Trocar/enriquecer com regex patterns do isolado é cirúrgico. |
| **Estado civil** | ALTA | BAIXO | Já coberto por `cognitiveAssistV1`. Enriquecer com slot extraction heurístico do isolado. |
| **Resposta aberta em stages específicos** | MÉDIA | MÉDIO | Já funciona como prefix, mas sem validação. Precisa de validação primeiro. |
| **Docs** | BAIXA | ALTO | Stage `envio_docs` tem lógica mecânica densa de checklist, Meta media, e URL resolution. |
| **Visita** | BAIXA | ALTO | Stage `agendamento_visita` tem lógica de scheduling, correspondente, e retorno. |
| **Follow-up** | BAIXA | ALTO | Não existe infraestrutura de follow-up no worker. Seria feature nova. |
| **Correspondente** | MUITO BAIXA | MUITO ALTO | Lógica mais densa do worker — dossier, docs R2, case ref, templates. |

### 4.2 — Recomendação: PRIMEIRA ENTRADA = Enriquecimento Heurístico dos 5 Stages Já Ativos

**Justificativa técnica:**

1. `cognitiveAssistV1()` JÁ ESTÁ ATIVO para 5 stages. Não precisa criar novo ponto de integração.
2. O gap mais perigoso é G4 (sem slot extraction local). Se OpenAI falhar, o worker fica cego.
3. O isolado tem `detectSlotsFromConversation()` com 7 detectores maduros e testados.
4. Trazer a heurística de extração de slots do isolado para ANTES da chamada LLM no worker dá fallback real.
5. Não muda nada no funil mecânico — apenas enriquece o que já existe.

**Ordem de prioridade real:**

1. **Primeiro:** Trazer `detectSlotsFromConversation()` e seus 7 detectores como fallback heurístico para `cognitiveAssistV1`
2. **Segundo:** Trazer `CONFIDENCE_RULES` + fórmula de confiança como backup do campo `confidence` do LLM
3. **Terceiro:** Trazer `validateReadOnlyCognitiveResponse()` adaptada para validar output do LLM antes de usar
4. **Quarto:** Adicionar feature flag `COGNITIVE_V1_ENABLED` (env var) como kill switch
5. **Quinto:** Unificar `callOpenAIJson()` e `callOpenAIReadOnly()` em wrapper único com error handling do isolado

### 4.3 — O Que NÃO Deve Ser Migrado Agora

- `buildDocsGuidanceByProfile()` — requer integração com checklist de docs do mecânico
- `buildVisitaGuidance()` — requer integração com scheduling
- `buildCorrespondenteGuidance()` — requer integração com dossier/case-ref
- TypeScript stubs (`orchestrator.ts`, `slot-engine.ts`, `dependency-engine.ts`) — são placeholder sem implementação
- `normalizeModelResponse()` completo — requer compatibilização de schemas primeiro
- CLI runner — é ferramenta de desenvolvimento, não produção

---

## BLOCO 5 — PLANO DE AÇÃO CIRÚRGICO

### Etapa 1 — Feature Flag (Kill Switch)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Adicionar `COGNITIVE_V1_ENABLED` env var para habilitar/desabilitar cognitivo no fluxo real |
| **Onde mexer** | `Enova worker.js` — `shouldTriggerCognitiveAssist()` (L2102) |
| **Mudança** | Adicionar check na primeira linha: se `env.COGNITIVE_V1_ENABLED` for `"false"`, retornar `false`. Default (ausente ou qualquer outro valor) mantém comportamento atual. Exemplo: `if (!env.COGNITIVE_V1_ENABLED || env.COGNITIVE_V1_ENABLED === "false") return false;` — ajustar conforme convenção do projeto. |
| **Risco** | MÍNIMO — é uma guarda adicional, não altera lógica existente |
| **Critério de aceite** | Com `COGNITIVE_V1_ENABLED=false`, nenhuma chamada OpenAI é feita pelo cognitivo. Com `true` ou ausente, comportamento atual é mantido. |
| **Rollback** | Remover a linha da guarda. |

### Etapa 2 — Slot Extraction Heurístico no Worker

| Campo | Valor |
|-------|-------|
| **Objetivo** | Trazer `detectSlotsFromConversation()` + detectores do isolado para o worker como camada heurística pré-LLM |
| **Onde mexer** | `Enova worker.js` — dentro de `cognitiveAssistV1()` (L2200), antes da chamada `callOpenAIJson()` |
| **Mudança** | Importar ou copiar as funções de detecção do isolado. Executar detecção heurística. Incluir resultado como `heuristic_seed` no payload do LLM. Se LLM falhar, usar heurística como fallback. |
| **Risco** | BAIXO — não altera decisão do funil; apenas enriquece dados enviados ao LLM e dá fallback |
| **Critério de aceite** | Se LLM responder, output não muda. Se LLM falhar, `buildCognitiveFallback()` agora retorna slots detectados por heurística em vez de objeto vazio. |
| **Rollback** | Remover chamada heurística; `buildCognitiveFallback()` volta ao comportamento atual. |

### Etapa 3 — Confidence Calculation Local

| Campo | Valor |
|-------|-------|
| **Objetivo** | Trazer `CONFIDENCE_RULES` e fórmula de confiança como validação secundária do confidence do LLM |
| **Onde mexer** | `Enova worker.js` — após parsing do resultado OpenAI em `cognitiveAssistV1()` |
| **Mudança** | Calcular `heuristicConfidence` localmente. Se LLM confidence e heuristic confidence divergirem muito (>0.3), logar warning e usar o menor dos dois. |
| **Risco** | BAIXO — pode ser mais conservador que o atual, nunca mais permissivo |
| **Critério de aceite** | Telemetria mostra `heuristic_confidence` e `llm_confidence` lado a lado. Nenhum reply com confiança artificialmente alta. |
| **Rollback** | Remover cálculo heurístico; voltar a usar só confidence do LLM. |

### Etapa 4 — Validação de Output LLM

| Campo | Valor |
|-------|-------|
| **Objetivo** | Adaptar `validateReadOnlyCognitiveResponse()` para validar output do LLM no worker antes de usar |
| **Onde mexer** | `Enova worker.js` — após `callOpenAIJson()` em `cognitiveAssistV1()` |
| **Mudança** | Validar que output tem campos obrigatórios e tipos corretos. Se validação falhar, cair no fallback. |
| **Risco** | BAIXO — rejeitar output malformado é mais seguro que aceitar |
| **Critério de aceite** | Output malformado do LLM cai no fallback silenciosamente em vez de produzir resposta quebrada. |
| **Rollback** | Remover validação; aceitar output como hoje. |

### Etapa 5 — Unificar Error Handling OpenAI

| Campo | Valor |
|-------|-------|
| **Objetivo** | Melhorar `callOpenAIJson()` com error handling detalhado do isolado (`callOpenAIReadOnly()`) |
| **Onde mexer** | `Enova worker.js` — `callOpenAIJson()` (L2042) |
| **Mudança** | Adicionar categorização de erros (missing_config, fetch_failed, http_error, invalid_json, empty_content, parse_failed). Logar categoria em telemetria. |
| **Risco** | BAIXO — melhora observabilidade sem mudar lógica |
| **Critério de aceite** | Telemetria mostra tipo exato de falha do OpenAI em vez de `null` genérico. |
| **Rollback** | Reverter para `callOpenAIJson()` original. |

---

## BLOCO 6 — VEREDITO HONESTO

### Estamos prontos para começar a migração?

**SIM, condicionalmente.**

O projeto está em posição favorável para iniciar uma migração incremental e cirúrgica. As razões:

1. **O `cognitiveAssistV1()` já está ativo no fluxo real.** Isso significa que a integração LLM já passou pelo teste de fogo da produção para 5 stages. O caminho de integração já existe.

2. **O motor isolado (`runReadOnlyCognitiveEngine`) é significativamente mais maduro** que o `cognitiveAssistV1`. Tem 1492 linhas contra ~50, com slot extraction, conflict detection, confidence calculation, e 40+ fixtures testados. A migração não é "trazer algo novo" — é "enriquecer o que já funciona".

3. **Os contratos canônicos estão bem documentados** (`COGNITIVE_ARCHITECTURE_V1.md`, `COGNITIVE_CALL_CONTRACT_V1.md`, `SLOT_CATALOG_V1.json`, `DEPENDENCIES_V1.json`, `CONFIRMATION_RULES_V1.json`). A arquitetura foi pensada antes da implementação.

4. **O trilho mecânico NÃO precisa ser alterado.** Toda a migração proposta opera dentro do espaço já existente (`cognitiveAssistV1` → prefix → `step()`). Nenhum gate, nextStage, ou regra de negócio é modificado.

### O que precisa fechar antes:

1. **Feature flag é pré-requisito obrigatório** (Etapa 1). Sem kill switch, não há rollback rápido em produção.
2. **Validação de output do LLM** (Etapa 4). Hoje o worker aceita qualquer JSON do LLM sem validar — isso é risco real.
3. **Schema compatibility** — antes de qualquer merge dos motores, precisa resolver a incompatibilidade de schemas (o worker usa `reply_text`, o isolado usa `human_response`; o worker usa `entities`, o isolado usa `known_slots`).

### Por onde exatamente:

**Etapa 1 (Feature Flag) → Etapa 2 (Slot Extraction) → Etapa 4 (Validação)**

Essas três etapas, nessa ordem, representam o **menor patch estratégico possível** que:
- Não altera o funil mecânico
- Não muda a experiência do usuário final
- Adiciona segurança (kill switch + validação)
- Traz a primeira capacidade real do isolado para o worker (slot extraction heurístico)
- Pode ser rollback em < 5 minutos

### Contradições Encontradas

| Handoff diz | Código mostra | Classificação |
|------------|--------------|--------------|
| "O cognitivo ainda NÃO está respondendo no fluxo real" | `cognitiveAssistV1()` ESTÁ ATIVO em 5 stages (L19349), produzindo `__cognitive_reply_prefix` que é enviado ao usuário | **DIVERGENTE** — o cognitivo JÁ responde no fluxo real, mas como prefix informativo, não como decisor de funil |
| "Motor cognitivo isolado/read-only" | O worker importa e usa funções do isolado (`listReadOnlyCognitiveFixtures`, `getReadOnlyCognitiveFixtureById`, `runReadOnlyCognitiveEngine`) no endpoint admin | **PARCIALMENTE CONFIRMADO** — isolado é read-only mas já está plugado no worker via admin endpoint |
| Contratos documentam `should_advance_stage: false` como regra canônica | `cognitiveAssistV1()` no worker NÃO retorna esse campo — usa `suggested_stage` em vez disso | **DIVERGENTE** — o motor do worker não segue o contrato canônico do isolado |
| Arquitetura diz "cognitive engine cannot talk directly with Meta" | `cognitiveAssistV1()` é chamado dentro do fluxo que RESPONDE no Meta, mas o cognitivo em si não chama Meta diretamente | **CONFIRMADO** — o cognitivo não chama Meta, mas o orquestrador usa seu output para enviar mensagem |

### Riscos Concretos de Quebrar o Mecânico

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Slot extraction heurístico produz falso positivo | MÉDIA | BAIXO | Heurística é usada como seed, não como decisão; threshold de confiança protege |
| LLM retorna JSON malformado que passa como válido | ALTA (já acontece) | MÉDIO | Etapa 4 (validação) resolve |
| Feature flag mal configurada desabilita cognitivo sem querer | BAIXA | BAIXO | Default é `true` (comportamento atual preservado) |
| Merge de schemas causa break no contrato existente | MÉDIA | ALTO | NÃO propor merge de schemas na primeira fase |
| Race condition entre heurística e LLM | MUITO BAIXA | BAIXO | Execução sequencial (heurística → LLM → merge) |

---

## APÊNDICE A — Pontos Sagrados do Funil Mecânico (NÃO TOCAR)

Estes componentes são soberanos e **NÃO devem ser modificados** pela migração cognitiva:

| Componente | Linhas | Motivo |
|-----------|--------|--------|
| `step()` | 150-360 | Core de envio de mensagem + persistência de estado |
| `upsertState()` | 671-820 | Persistência oficial em Supabase |
| `getState()` | 637-666 | Leitura de estado oficial |
| `handleMetaWebhook()` | 6073-6970 | Entry point de webhook |
| `runFunnel()` switch cases | 19629-29061 | Lógica de cada stage individual |
| `parseMoneyBR()` | — | Parsing de renda |
| `parseEstadoCivil()` | — | Parsing de estado civil |
| `isYes()` / `isNo()` | — | Parsing sim/não |
| `sendMessage()` | — | Envio real via Meta |
| Stage transitions (nextStage) | Dentro de cada case | Lógica de progressão do funil |
| `atendimento_manual` bypass | 6806-6830 | Modo humano |
| `offtrackGuard()` | 2265-2302 | Guard de offtrack (pode ser enriquecido, não substituído) |

## APÊNDICE B — Mapa de Env Vars Cognitivas

| Var | Onde | Obrigatória | Default |
|-----|------|------------|---------|
| `OPENAI_API_KEY_PROD` | worker.js:5164 | Sim para LLM | — |
| `OPENAI_API_KEY_TEST` | worker.js:2037 | Sim para test | — |
| `COGNITIVE_AI_MODEL` | worker.js:5165 | Não | `gpt-4.1-mini` |
| `__COGNITIVE_OPENAI_FETCH` | worker.js:5167 | Não | `globalThis.fetch` |
| `ENV_MODE` | worker.js:5091 | Não | — |
| `OFFTRACK_AI_ENABLED` | worker.js:2267 | Não | `true` |
| `TELEMETRIA_LEVEL` | worker.js:2351 | Não | `basic` |
| `COGNITIVE_V1_ENABLED` | **NÃO EXISTE** | **PRECISA SER CRIADA** | — |

## APÊNDICE C — Testes Existentes

| Teste | Arquivo | O que testa |
|-------|---------|------------|
| Telemetria cognitiva | `schema/cognitive_telemetry.smoke.mjs` | Captura e estrutura de telemetria |
| Motor read-only (runner) | `schema/cognitive_read_only_runner.smoke.mjs` | 40+ cenários via runner direto |
| Motor read-only (admin) | `schema/cognitive_read_only_admin.smoke.mjs` | 40+ cenários via endpoint admin |
| Mock OpenAI | `schema/cognitive_openai_mock.mjs` | Mock de chamada OpenAI para testes |
| **AUSENTE:** Fluxo E2E worker | — | Nenhum teste do cognitivo integrado no runFunnel |
