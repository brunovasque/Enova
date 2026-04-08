# Resumo — Fix Cirúrgico Telemetria Híbrida: Sintomas

**Branch:** `fix/telemetria-hibrida-sintomas-callsite`
**Data:** 2026-04-08

---

## Causa Raiz Confirmada

O Hook 7 (`emitStageSymptomsHook`) era chamado em `step()` com **payload morto**:

```js
// Callsite ANTES do fix — todos os valores diagnósticos eram hardcoded:
reaskTriggered: false,
stageLocked: false,
cognitiveSignal: null,       // ← nunca chegava o sinal real
cognitiveConfidence: null,   // ← nunca chegava a confiança real
overrideSuspected: false,
stateDiff: null
```

Isso tornava estruturalmente impossível acender os sintomas centrais:
- `did_reask`
- `did_stage_stick`
- `blocked_valid_signal`
- `caused_loop`
- `state_unchanged_when_expected`
- `plausible_answer_without_advance`

A função `computeStageSymptoms()` estava correta. O problema era no callsite — contexto morto entrava, zero sintomas saíam.

---

## O Que Foi Corrigido no Callsite

### 1) Flags efêmeras no bloco COGNITIVE ASSIST (`Enova worker.js`)

Após computar `_arbCogSignal`, `cognitive?.confidence` e `_arbOverride` no bloco COGNITIVE ASSIST (antes do `step()` ser chamado), agora se define flags efêmeras em `st`:

```js
st.__tel_cognitive_signal = cognitive?.safe_stage_signal || cognitive?.intent || null;
st.__tel_cognitive_confidence = cognitive?.confidence ?? null;
st.__tel_override_suspected = Boolean(
  hasUsefulCognitiveReply && !st.__cognitive_v2_takes_final && Boolean(_telCogSignalVal)
);
```

### 2) Leitura e limpeza no Hook 7 callsite (`step()`)

Em `step()`, antes de chamar `emitStageSymptomsHook`, os flags são lidos e imediatamente zerados para não vazar para o próximo turno:

```js
const _telCogSignal = st.__tel_cognitive_signal || null;
const _telCogConf   = st.__tel_cognitive_confidence ?? null;
const _telOverride  = Boolean(st.__tel_override_suspected);
st.__tel_cognitive_signal = null;
st.__tel_cognitive_confidence = null;
st.__tel_override_suspected = null;
// Agora passados para o hook com contexto real:
emitStageSymptomsHook({ ..., cognitiveSignal: _telCogSignal, cognitiveConfidence: _telCogConf, overrideSuspected: _telOverride, ... });
```

Esse padrão é idêntico ao já usado em `st.__speech_arbiter_source`, `st.__cognitive_reply_prefix`, etc.

---

## Como a Durabilidade Foi Ajustada

**Problema:** Em Cloudflare Workers, Promises fire-and-forget podem ser descartadas quando o runtime encerra após enviar a Response.

**Fix:** Adicionado suporte a `ctx.waitUntil` no módulo `hybrid-telemetry-worker-hooks.js`:

1. Nova função `registerWaitUntil(fn)` — análoga à `registerPersistentEmitter`.
2. Novo helper interno `_safeEmitWithDurability(promise)` — registra o Promise com `waitUntil` antes de aguardar.
3. `emitStageSymptomsHook` usa `_safeEmitWithDurability` internamente.
4. No fetch handler (`Enova worker.js`), após registrar o persistent emitter: `registerWaitUntil(ctx.waitUntil.bind(ctx))`.

Sem `waitUntil`, continua funcionando (fallback ao `await` normal). Sem atraso perceptível ao cliente — o worker entrega a Response e o runtime mantém vivo apenas o telemetry promise.

---

## Como o `wa_id` Foi Estabilizado

**Problema:** Hooks 2–7 dependiam apenas de `st?.wa_id || null`. Se `wa_id` estivesse `null` no `st`, o evento era persistido com `wa_id = null`, mesmo que `lead_id` ou `conversation_id` estivessem disponíveis.

**Fix:** Fallback consistente em todos os hooks:
```js
const _waIdHN = st?.wa_id || st?.lead_id || st?.conversation_id || null;
```
Aplicado em Hooks 2 (`emitCognitiveDecisionTelemetry`), 3 (`emitPostProcessingTelemetry`), 4 (`emitMechanicalDecisionTelemetry`), 5 (`emitArbitrationTelemetry`), 6 (`emitFinalOutputTelemetry`), 7 (`emitStageSymptomsHook`).

Hook 1 (`emitTurnEntryTelemetry`) já recebia `waId` explícito e estava correto.

---

## Como `/symptoms` Passou a Refletir os Sinais Corretamente

**Problema:** `queryStageSymptoms` filtrava apenas por `e.stage_symptoms.*`. Mas `blocked_valid_signal` e `caused_loop` podiam existir apenas no bloco `arbitration` (emitido pelo Hook 5), especialmente antes do fix do callsite do Hook 7.

**Fix (Opção B — mínima e compatível):** Em `queryStageSymptoms` (persistence.js), o filtro agora inclui também:
```js
arb.blocked_valid_signal === true || arb.caused_loop === true
```

E no filtro por `symptom` específico:
```js
if (filters.symptom === "blocked_valid_signal" && arb.blocked_valid_signal === true) return true;
if (filters.symptom === "caused_loop" && arb.caused_loop === true) return true;
```

Sem endpoint novo, sem tabela nova, sem coluna nova. Apenas lógica de agregação na leitura.

---

## Arquivos Alterados

| Arquivo | Natureza da mudança |
|---|---|
| `telemetry/hybrid-telemetry-worker-hooks.js` | `registerWaitUntil`, `_safeEmitWithDurability`, fallback `wa_id` em hooks 2–7 |
| `telemetry/hybrid-telemetry-persistence.js` | `queryStageSymptoms` agrega sinais do bloco `arbitration` |
| `Enova worker.js` | Import `registerWaitUntil`, `registerWaitUntil(ctx.waitUntil.bind(ctx))` no fetch handler, flags `__tel_*` no COGNITIVE ASSIST, callsite real do Hook 7 em `step()` |
| `diagnosticos/telemetria-hibrida-sintomas-fix-resumo.md` | Este arquivo |

---

## Regras Duras — Verificação

- ✅ parser não alterado
- ✅ gate não alterado
- ✅ nextStage não alterado
- ✅ fallback não alterado
- ✅ surface não alterado
- ✅ copy não alterado
- ✅ worker não refatorado
- ✅ tabela nova: não
- ✅ coluna nova: não
- ✅ frente paralela: não
- ✅ heurística nova: não

---

## Tabelas/Colunas Lidas/Escritas

- **Lidas:** `enova_log` (tag, wa_id, details) — somente nos endpoints `/symptoms`, `/by-lead`, `/recent`, `/conflicts`
- **Escritas:** `enova_log` (tag, wa_id, details) — via `logger()` existente, sem mudança de schema
- **Tabela nova:** não
- **Coluna nova:** não
- **Ação manual no Supabase:** não

---

## Risco Residual

1. **`reaskTriggered` e `stageLocked`** continuam sendo `false` hardcoded no Hook 7. Esses sinais dependem de contexto interno dos stage handlers (switch case) que não é facilmente exposto via `st.__tel_*` sem tocar em dezenas de callsites. O impacto é parcial: `blocked_valid_signal`, `plausible_answer_without_advance` e `override_suspected` agora acendem corretamente. `did_reask` e `did_stage_stick` ainda dependem de future work (fase 2, se indicado).

2. **`stateDiff`** continua `null`. O before-state do `st` não está disponível no ponto do Hook 7 em `step()` sem snapshot explícito. `state_unchanged_when_expected` pode acender via `plausible_answer_without_advance && !stateDiff`, mas somente quando `stateDiff` for `null` (zero diff = state unchanged — isso é correto para o caso mais comum).

3. **`waitUntil`** só está ativo para `emitStageSymptomsHook` (Hook 7). Os demais hooks (1–6) continuam fire-and-forget puro no callsite de `step()`. A durabilidade máxima exigiria aplicar `_safeEmitWithDurability` em todos, mas o escopo desta correção é o Hook 7.
