# Telemetria híbrida — PR 3 (fechamento do contrato dos sintomas centrais)

Data/hora: 2026-04-08
Branch: copilot/implementacao-pr-3-fechamento-contrato

## Objetivo

Fechar o contrato operacional dos sintomas centrais da telemetria híbrida,
sem alterar regra de negócio, parser, gate, nextStage, fallback ou surface.

## Arquivos criados/alterados

### Alterados
- `telemetry/hybrid-telemetry-contract.js` — novos tipos de evento, STAGE_SYMPTOM_CODES, grupos e defaults
- `telemetry/hybrid-telemetry.js` — re-exporta STAGE_SYMPTOM_CODES
- `telemetry/hybrid-telemetry-worker-hooks.js` — helpers de sintoma, Hook 7, arbitragem enriquecida
- `Enova worker.js` — import de emitStageSymptomsHook + chamada do Hook 7 em step()

### Criados
- `schema/hybrid_telemetry_pr3.smoke.mjs` — 43 smoke tests
- `diagnosticos/telemetria-hibrida-pr3-resumo.md` — este arquivo

## Sintomas centrais agora emitidos

### `did_stage_advance / did_stage_repeat / did_stage_stick`

Calculados pela função pura `computeStageDiff(stageBefore, stageAfter, reaskTriggered, stageLocked)`:

| Symptom | Condição |
|---------|----------|
| `did_stage_advance` | `stageAfter !== stageBefore` (ambos não-nulos) |
| `did_stage_repeat` | `stageAfter === stageBefore && !reaskTriggered && !stageLocked` |
| `did_stage_stick` | `stageAfter === stageBefore && stageLocked === true` |

### `did_reask`

`Boolean(reaskTriggered)` — propagado direto do parâmetro `reaskTriggered` do hook.

### `plausible_answer_without_advance`

Detectado quando:
- `cognitiveSignal` presente (não-nulo/vazio)
- `cognitiveConfidence >= 0.5`
- `did_stage_advance === false`

Indica que o cognitivo sinalizou algo plausível mas o estágio não avançou.

### `override_suspected` (no contexto de sintomas)

Verdadeiro quando:
- O parâmetro `overrideSuspected` foi passado como `true`, OU
- `hasPlausibleSignal && !did_stage_advance && mechanicalAction` presente

No contexto de arbitragem, o campo `override_suspected` já existia e foi mantido.
Na camada de sintomas, reflete se houve indício de override nessa rodada.

### `blocked_valid_signal`

Verdadeiro quando:
- `hasPlausibleSignal === true` (sinal cognitivo forte)
- `did_stage_advance === false`
- `did_reask === false`

Distingue de `plausible_answer_without_advance`: aqui o reask não foi emitido,
sugerindo que o sinal foi bloqueado silenciosamente.

### `state_unchanged_when_expected`

Verdadeiro quando:
- `plausible_answer_without_advance === true`
- `stateDiff === null` (estado não mudou de fato)

Indica que, mesmo com sinal plausível, o estado persistido não refletiu mudança alguma.

### `caused_loop`

Verdadeiro quando:
- `did_reask === true` E
- (`did_stage_repeat === true` OR `override_suspected === true` OR `blocked_valid_signal === true`)

Sintoma de loop: o sistema ficou preso em reask combinado com repetição de stage,
override suspeito ou sinal bloqueado.

## Como a arbitragem foi enriquecida

Novos campos adicionados ao grupo `arbitration` no contrato e nos defaults:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `blocked_valid_signal` | boolean | Sinal cognitivo válido bloqueado pelo mecânico |
| `caused_loop` | boolean | Esta resolução causou sintoma de loop |
| `requires_confirmation` | boolean | Resultado precisa de confirmação do usuário |

Na função `emitArbitrationTelemetry`:
- Aceita opcionalmente `blockedValidSignal`, `causedLoop`, `requiresConfirmation`
- Se não fornecidos, infere `blocked_valid_signal` automaticamente:
  `overrideDetected && cognitiveSignal && arbitrationWinner === "mechanical"`
- `caused_loop` e `requires_confirmation` padrão para `false` se não fornecidos
- **Retrocompatível**: chamadas anteriores sem os novos params continuam funcionando

## Novo Hook 7 — emitStageSymptomsHook

Ponto de emissão: `step()` em `Enova worker.js`, junto com os Hooks 4 e 6.

Evento emitido: `funnel.stage.symptoms`

Payload:
- `_stage_symptoms` com todos os 9 sintomas centrais calculados
- `stage_before` e `stage_after` no campo `base`
- `correlation_id` compartilhado com os outros hooks do turno

## Funções puras adicionadas ao worker-hooks

| Função | Visibilidade | Descrição |
|--------|-------------|-----------|
| `computeStageDiff(...)` | interna | Calcula advance/repeat/stick |
| `computeStageSymptoms(...)` | interna | Calcula todos os 9 sintomas centrais |

Ambas são puras (sem side effects), tolerantes a exceção e não influenciam o fluxo.

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
- ❌ lógica de negócio do worker

## Garantias de segurança mantidas

- Hook 7 é fire-and-forget: `try/catch` externo + `.catch(() => {})` no callsite
- Se falhar, o atendimento segue normalmente
- `computeStageSymptoms` tem try/catch interno com fallback para todos `false`
- Retrocompatibilidade total com chamadas existentes de `emitArbitrationTelemetry`

## Smoke tests

43 testes em `schema/hybrid_telemetry_pr3.smoke.mjs`:

| Seção | Descrição | Testes |
|-------|-----------|--------|
| A | Contrato: STAGE_SYMPTOM_CODES e novos campos | 17 |
| B | Emissão did_stage_advance | 2 |
| C | Emissão did_stage_repeat | 1 |
| D | Emissão did_stage_stick | 1 |
| E | Emissão did_reask | 1 |
| F | Emissão plausible_answer_without_advance | 1 |
| G | Emissão override_suspected | 1 |
| H | Emissão blocked_valid_signal | 1 |
| I | Emissão state_unchanged_when_expected | 1 |
| J | Emissão caused_loop | 1 |
| K | Enriquecimento da arbitragem | 4 |
| L | Prova de não alteração de parser/gate/nextStage | 4 |
| M | Comportamento do worker intacto | 5 |
| N | Re-export chain STAGE_SYMPTOM_CODES | 3 |
| **Total** | | **43** |

Todos os 51 testes da PR 2 continuam passando (zero regressão).

## O que ficou para PR 4

- Expansão profunda por blocos: civil/composição, renda/IR, parceiro/P3, CTPS/dependente/restrição, docs
- Endpoint admin para consultar telemetria
- Dashboard / ranking
- Persistência em `enova_log` ou tabela dedicada
- Rollout por blocos do funil inteiro
- Métricas agregadas por stage
- Testes de integração end-to-end com runFunnel real
