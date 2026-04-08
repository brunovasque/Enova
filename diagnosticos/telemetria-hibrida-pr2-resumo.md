# Telemetria híbrida — PR 2 (instrumentação real)

Data/hora: 2026-04-08
Branch: copilot/telemetria-hibrida-pr2-instrumentacao

## Objetivo

Instrumentar o fluxo real do worker para emitir telemetria híbrida (cognitiva + mecânica + arbitragem) sem alterar regra de negócio, parser, gate, nextStage, fallback ou surface.

## Arquivos criados/alterados

### Criados
- `telemetry/hybrid-telemetry-worker-hooks.js` — 6 hooks de instrumentação + utilitários
- `schema/hybrid_telemetry_pr2.smoke.mjs` — 51 smoke tests
- `diagnosticos/telemetria-hibrida-pr2-resumo.md` — este arquivo

### Alterados
- `Enova worker.js` — 4 pontos de instrumentação (import + 3 blocos de hooks)

## Pontos instrumentados

### 1) Entrada do turno (Hook 1 — `emitTurnEntryTelemetry`)
- **Onde**: `handleMetaWebhook()`, antes de `runFunnel()`
- **Evento**: `funnel.cognitive.turn.start`
- **Campos**: `message_id`, `wa_id`/`lead_id`, `stage_before`, `user_input_raw`, `user_input_normalized`, `correlation_id`

### 2) Decisão cognitiva (Hook 2 — `emitCognitiveDecisionTelemetry`)
- **Onde**: bloco `COGNITIVE ASSIST`, após `emitCognitiveTelemetry()` existente
- **Evento**: `funnel.cognitive.turn.result`
- **Campos**: `ai_detected_intent`, `ai_structured_signal`, `ai_confidence`, `ai_reply_text`, `cognitive_reason_codes`, `ai_offtrack_detected`, `ai_answered_customer_question`, `ai_suggested_stage`, `ai_needs_confirmation`, `correlation_id`

### 3) Pós-processamento / contrato final (Hook 3 — `emitPostProcessingTelemetry`)
- **Onde**: `step()`, após captura de `_outputSurface` e antes de limpar flags transitórias
- **Evento**: `funnel.cognitive.post_processing`
- **Campos**: `reply_before_contract`, `reply_after_contract`, `surface_changed`, `contract_applied`

### 4) Decisão mecânica (Hook 4 — `emitMechanicalDecisionTelemetry`)
- **Onde**: `step()`, após bloco `sovereign_surface_proof`
- **Evento**: `funnel.mechanical.parse.result`
- **Campos**: `stage_before`, `stage_after`, `parser_used`, `parser_result`, `mechanical_action`, `validation_result`, `reask_triggered`, `stage_locked`, `mechanical_reason_codes`, `state_diff`

### 5) Arbitragem (Hook 5 — `emitArbitrationTelemetry`)
- **Onde**: bloco `COGNITIVE ASSIST`, após Hook 2
- **Evento**: `funnel.arbitration.conflict` ou `funnel.arbitration.override.suspected`
- **Campos**: `cognitive_proposed_signal`, `mechanical_parser_result`, `mechanical_action_taken`, `arbitration_triggered`, `arbitration_outcome`, `arbitration_winner`, `arbitration_reason`, `override_detected`, `override_classification`, `override_suspected`

### 6) Output final (Hook 6 — `emitFinalOutputTelemetry`)
- **Onde**: `step()`, após bloco `sovereign_surface_proof`
- **Evento**: `funnel.output.final`
- **Campos**: `output_surface`, `surface_equal_llm`, `mechanical_text_candidate`, `mechanical_text_blocked`, `stage_before`, `stage_after`, `speech_arbiter_source`

## Eventos emitidos por camada

### Cognitivo
| Evento | Hook | Ponto |
|--------|------|-------|
| `funnel.cognitive.turn.start` | 1 | handleMetaWebhook |
| `funnel.cognitive.turn.result` | 2 | COGNITIVE ASSIST |
| `funnel.cognitive.post_processing` | 3 | step() |

### Mecânico
| Evento | Hook | Ponto |
|--------|------|-------|
| `funnel.mechanical.parse.result` | 4 | step() |

### Arbitragem
| Evento | Hook | Ponto |
|--------|------|-------|
| `funnel.arbitration.conflict` | 5 | COGNITIVE ASSIST |
| `funnel.arbitration.override.suspected` | 5 | COGNITIVE ASSIST |

### Output
| Evento | Hook | Ponto |
|--------|------|-------|
| `funnel.output.final` | 6 | step() |

## Correlação por turno

- `correlation_id` é gerado uma vez por turno via `createTurnCorrelationId()`
- Armazenado em `st.__hybrid_correlation_id` (transitório, limpo ao final)
- Todos os 6 hooks de um mesmo turno compartilham o mesmo `correlation_id`
- Formato: `corr-{waId}--{turnId}--{timestamp}-{random8}`

## Garantias de segurança

- Todos os hooks são **fire-and-forget**: usam `try/catch` + `.catch(() => {})` duplo
- Nenhum hook retorna valor que influencia o fluxo
- Nenhum hook modifica `nextStage`, `fase_conversa`, parser ou gate
- Nenhum hook altera copy, fallback ou surface
- Circular references, campos null/undefined e strings longas são tratados
- Se a telemetria falhar, o fluxo continua normalmente

## O que NÃO foi alterado

- ❌ parser
- ❌ gate
- ❌ nextStage
- ❌ fallback
- ❌ surface / copy
- ❌ persistência funcional do funil
- ❌ renderCognitiveSpeech
- ❌ applyFinalSpeechContract
- ❌ schema do Supabase (zero tabelas/colunas novas)

## O que ficou para PR 3

- Endpoint admin para consultar telemetria
- Dashboard / ranking
- Persistência em `enova_log` ou tabela dedicada
- Rollout por blocos
- Telemetria de reask detalhado por stage
- Telemetria de offtrack guard
- Testes de integração end-to-end com runFunnel real
- Métricas agregadas por stage

## Smoke tests

51 testes em `schema/hybrid_telemetry_pr2.smoke.mjs`:

| Seção | Descrição | Testes |
|-------|-----------|--------|
| A | Import e integridade dos módulos | 7 |
| B | Emissão cognitiva sem quebra | 5 |
| C | Emissão mecânica sem quebra | 4 |
| D | Emissão arbitral sem quebra | 4 |
| E | Emissão entrada de turno | 3 |
| F | Emissão pós-processamento | 3 |
| G | Emissão output final | 3 |
| H | Prova de não alteração do worker | 4 |
| I | Prova de nextStage não tocado | 2 |
| J | Prova de parser/gate não alterados | 2 |
| K | Tolerância a campos ausentes | 6 |
| L | Gestão de correlation ID | 3 |
| M | Segurança de sanitização | 5 |
| **Total** | | **51** |
