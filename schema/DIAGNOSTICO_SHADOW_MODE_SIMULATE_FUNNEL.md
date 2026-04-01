# DIAGNÓSTICO: Por que o Shadow Mode do Cognitivo V2 não aparece no simulate-funnel

**Data:** 2026-03-31
**Tipo:** Read-only, cirúrgico
**Objetivo:** Descobrir por que `cognitive_v1_signal`, `v2_shadow`, e `COGNITIVE_V2_SHADOW_ERROR` não aparecem nos logs ao usar `__admin__/simulate-funnel` com `COGNITIVE_V2_MODE=shadow`.

---

## BLOCO 1 — CAMINHO REAL DO `__admin__/simulate-funnel`

### Cadeia de chamadas confirmada

```
POST /__admin__/simulate-funnel
│
├─ [L4908] Route handler
│  ├─ isAdminAuthorized() check
│  ├─ Payload parsing: wa_id, start_stage (default "inicio"), script[], dry_run (default true)
│  │
│  └──▶ simulateFunnel(env, { wa_id, startStage, script, dryRun })  [L3260]
│       │
│       ├─ Cria env.__enovaSimulationCtx com:
│       │   active: true, dryRun: true, suppressExternalSend: true
│       │
│       └─ Para cada entrada em script[]:
│          │
│          └──▶ runFunnel(env, currentState, userText)  [L19257]   ← CORE ENGINE
│               │
│               ├─ telemetry "funnel_enter" [L19264]
│               ├─ Resolução de stage e switch principal [L19327+]
│               ├─ 🧠 COGNITIVE ASSIST [L19457-19575] (se condições atendidas)
│               ├─ offtrackGuard [L19581]
│               └─ step() [L150] → messages, state transition, cognitive_telemetry
```

### CONFIRMADO: `simulate-funnel` CHEGA no `runFunnel()`

- **Arquivo:** `Enova worker.js`
- **Chamada direta:** `simulateFunnel()` chama `runFunnel()` na linha 3291
- O `runFunnel()` executado é **exatamente o mesmo** do runtime de produção
- A simulação **não** cria um caminho alternativo para o funil

### CONFIRMADO: O bloco cognitive assist NÃO é bypassado pela simulação

- Não existe nenhum check de `isSim` ou `simCtx` dentro do bloco cognitive (L19457-19575)
- O cognitive assist **executa normalmente** em contexto de simulação
- O que é suprimido pela simulação: envio Meta API (`suppressExternalSend`), escrita no DB (`dryRun`)

---

## BLOCO 2 — ONDE O SHADOW DEVERIA APARECER

### Evento correto: `cognitive_v1_signal`

- **Emitido em:** `Enova worker.js` L19529-19536
- **Via:** `telemetry(env, { event: "cognitive_v1_signal", ... })`
- **Campo de shadow:** `details.v2_shadow` (objeto com 9 campos comparativos)
- **Campo de modo:** `details.cognitive_v2_mode` (valor: `"shadow"`)

### Condições necessárias para o evento aparecer

**Condição 1 — Stage gate (`shouldTriggerCognitiveAssist`)** [L19465, L2102-2113]

O cognitive assist só é acionado se `shouldTriggerCognitiveAssist(stage, userText)` retornar `true`. Isso requer:

1. `stage` deve estar em `COGNITIVE_V1_ALLOWED_STAGES` [L1994-2000]:
   - `"estado_civil"`
   - `"quem_pode_somar"`
   - `"interpretar_composicao"`
   - `"renda"`
   - `"ir_declarado"`

2. `userText` deve conter pelo menos um padrão trigger:
   - Interrogação: `?`
   - Conectores: `mas`, `porém`, `só que`, `ao mesmo tempo`
   - Off-track hints: `imóvel`, `casa`, `apartamento`, `bairro`, `região`, `entrada`, `parcela`, `fgts`, `valor`, `preço`
   - Fear hints: `medo`, `receio`, `reprovado`, `enganado`, `vergonha`, `não quero passar`

**Condição 2 — TELEMETRIA_LEVEL** [L2464-2477]

⚠️ **CAUSA RAIZ PRINCIPAL IDENTIFICADA:**

O evento `cognitive_v1_signal` é emitido com:
```javascript
severity: "info"    // L19533
// NÃO tem force: true
```

A função `telemetry()` faz filtering em L2475:
```javascript
const level = (env.TELEMETRIA_LEVEL || "basic").toLowerCase();  // L2466
if (level === "basic" && isInfo && !force) {
  return;  // ← DESCARTA SILENCIOSAMENTE o evento
}
```

**Se `TELEMETRIA_LEVEL` estiver no default `"basic"`, o evento `cognitive_v1_signal` é DESCARTADO SILENCIOSAMENTE antes de ser logado.** Não aparece no console, não aparece em nenhum log.

**Condição 3 — APIs externas** [L2341, L2307]

- `cognitiveAssistV1()` chama OpenAI em L2341
- `runCognitiveV2WithAdapter()` chama o motor isolado em L2307
- Se a API OpenAI falhar, o try-catch em L19573 captura o erro e loga como `COGNITIVE_V1_RUNFUNNEL_ERROR`, mas o bloco inteiro (incluindo telemetria) é skippado
- No shadow mode, o erro V2 é capturado separadamente em L19484-19486 como `COGNITIVE_V2_SHADOW_ERROR`

### Por que NÃO apareceu no teste

| # | Causa | Tipo | Impacto |
|---|-------|------|---------|
| 1 | `TELEMETRIA_LEVEL` no default `"basic"` filtra o evento `cognitive_v1_signal` (severity=info, sem force) | **CONFIRMADA** | Evento é descartado silenciosamente na L2475 |
| 2 | `start_stage` possivelmente era `"inicio"` (default), que NÃO está em `COGNITIVE_V1_ALLOWED_STAGES` | **HIPÓTESE FORTE** | Cognitive block nem é acionado |
| 3 | Script de teste pode não conter texto com padrão trigger (sem `?`, `mas`, `imóvel`, etc.) | **HIPÓTESE** | `shouldTriggerCognitiveAssist` retorna false |
| 4 | API OpenAI falhou silenciosamente no test env | **HIPÓTESE** | Erro capturado em L19573, block skippado |

---

## BLOCO 3 — O QUE O CSV QUE CAPTURAMOS REPRESENTA

### Diferença entre os 4 tipos de telemetria

| Tipo | Origem | Função | Prefixo no log | Filtragem | Quando aparece |
|------|--------|--------|-----------------|-----------|----------------|
| **`cognitive_telemetry`** | `logCognitiveTelemetry()` L38-46 via `emitCognitiveTelemetry()` | `console.log(JSON.stringify({type: "cognitive_telemetry", ...}))` | Nenhum (JSON puro) | **NENHUMA** — sempre loga | Em TODAS as transições de step(), para QUALQUER stage |
| **`cognitive_v1_signal`** | `telemetry()` L19529-19536 | `console.log("TELEMETRIA-SAFE:", JSON.stringify(...))` | `"TELEMETRIA-SAFE:"` | **TELEMETRIA_LEVEL** — filtrado em `basic` se severity=info e force≠true | Somente quando o cognitive assist é acionado E a telemetria não é filtrada |
| **`v2_shadow`** | Subcampo de `cognitive_v1_signal` | Dentro de `details.v2_shadow` do evento acima | (incluso no payload acima) | Mesma do evento pai | Somente quando V2 shadow executou com sucesso E o evento pai não é filtrado |
| **`COGNITIVE_V2_SHADOW_ERROR`** | `console.error()` L19485 | `console.error("COGNITIVE_V2_SHADOW_ERROR:", shadowErr)` | `"COGNITIVE_V2_SHADOW_ERROR:"` | **NENHUMA** — sempre loga | Quando `runCognitiveV2WithAdapter()` lança exceção no shadow |

### Por que só `cognitive_telemetry` apareceu

Os eventos `cognitive_telemetry` são emitidos pelo `step()` em **3 pontos** que rodam para QUALQUER stage:

| Local | Ponto | Linha |
|-------|-------|-------|
| `step()` | `"after_response_assembled"` | L172 |
| `step()` | `"before_return_response"` (sim mode) | L301 |
| `step()` | `"before_return_response"` (non-sim) | L316 |

Esses pontos executam para **qualquer transição de fase no funil**, independente de o cognitive assist ter rodado. E `logCognitiveTelemetry()` **não tem filtragem** — sempre loga.

### Diagnóstico do CSV

**O CSV capturado contém eventos de `cognitive_telemetry` que vêm do `step()`, NÃO do bloco de cognitive assist.** Esses eventos representam transições genéricas do funil (com campos como `point`, `stage`, `used_llm`, `slot_detected`), não a execução do shadow.

O evento que conteria a evidência do shadow (`cognitive_v1_signal` com `details.v2_shadow`) é um evento DIFERENTE, emitido por uma função DIFERENTE (`telemetry()` vs `logCognitiveTelemetry()`), com um prefixo DIFERENTE no log (`"TELEMETRIA-SAFE:"` vs JSON puro).

**Estamos exportando o dataset correto (console logs), mas filtrando pelo evento errado (`cognitive_telemetry` em vez de `cognitive_v1_signal`) E o evento correto está sendo suprimido pela configuração `TELEMETRIA_LEVEL=basic`.**

---

## BLOCO 4 — VEREDITO

### `__admin__/simulate-funnel` serve para validar shadow? **SIM, com ressalvas.**

O endpoint **serve** para validar o shadow mode porque:
1. ✅ Chama `runFunnel()` diretamente (L3291)
2. ✅ O bloco cognitive NÃO é bypassado pela simulação
3. ✅ O branching shadow (V1 + V2 paralelo) é executado normalmente
4. ✅ Telemetria de console não é suprimida pela simulação

**Porém, 3 condições precisam ser atendidas simultaneamente:**

| Condição | Status atual provável | Correção |
|----------|-----------------------|----------|
| `start_stage` em stage cognitivo | ❌ Provavelmente `"inicio"` (default) | Usar `"estado_civil"` ou outro allowed stage |
| `script` com texto que aciona trigger | ❓ Incerto | Usar texto com `?` (ex: `"Sou solteiro, posso financiar?"`) |
| `TELEMETRIA_LEVEL` != `"basic"` | ❌ Provavelmente `"basic"` (default) | Configurar `TELEMETRIA_LEVEL=verbose` no env |

### O que estamos olhando errado

1. **Evento errado no export:** Estamos filtrando `cognitive_telemetry` (vem do step genérico), mas o shadow está em `cognitive_v1_signal` (vem do bloco cognitive via `telemetry()`)
2. **Prefixo errado no log:** `cognitive_v1_signal` aparece como `TELEMETRIA-SAFE: {...}`, não como JSON puro
3. **TELEMETRIA_LEVEL bloqueando:** Com `TELEMETRIA_LEVEL=basic` (default), o evento é descartado ANTES de logar — não importa se olhamos no lugar certo

---

## BLOCO 5 — PRÓXIMO PASSO ÚNICO

### Recomendação: Executar uma chamada ao `simulate-funnel` com as 3 condições corretas

**Sem mexer em código**, executar o seguinte request no ambiente de teste:

```bash
# <test-worker-url> = URL do Worker de teste no Cloudflare (ver dashboard Cloudflare Workers → Enova test)
# <admin-token> = token de admin configurado na env var do Worker
curl -X POST https://<test-worker-url>/__admin__/simulate-funnel \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "wa_id": "5511999990001",
    "start_stage": "estado_civil",
    "script": ["Sou solteiro, posso financiar um imóvel?"],
    "dry_run": true
  }'
```

**E ANTES de executar, configurar no ambiente (Cloudflare Worker env vars):**

```
TELEMETRIA_LEVEL=verbose
COGNITIVE_V2_MODE=shadow
```

### Justificativa técnica

1. **`start_stage: "estado_civil"`** → Garante que o `shouldTriggerCognitiveAssist` passa no gate de stage (L2103)
2. **Script com `?` e `imóvel`** → Garante que o texto contém padrões trigger: `hasQuestion` (/\?/) E `offtrackHints` (/imovel/) (L2107-2109)
3. **`TELEMETRIA_LEVEL=verbose`** → Garante que o evento `cognitive_v1_signal` (severity=info) NÃO é filtrado (L2475 não retorna early)
4. **`COGNITIVE_V2_MODE=shadow`** → Aciona o branching shadow (L19475) que executa V1 + V2 em paralelo

### Onde procurar a evidência

Nos logs do Worker (Cloudflare Workers → Logs → Real-time ou Tail), procurar por:

1. **Shadow completo:**
   ```
   TELEMETRIA-SAFE: {"event":"cognitive_v1_signal","details":{..."cognitive_v2_mode":"shadow","v2_shadow":{...}}}
   ```

2. **Erro do shadow (se V2 falhar):**
   ```
   COGNITIVE_V2_SHADOW_ERROR: ...
   ```

3. **Erro geral do cognitive (se V1 falhar):**
   ```
   COGNITIVE_V1_RUNFUNNEL_ERROR: ...
   ```

### Se TELEMETRIA_LEVEL não puder ser alterado

Se a alteração de env var não for possível imediatamente, uma alternativa é procurar nos logs já existentes por:

- `COGNITIVE_V1_RUNFUNNEL_ERROR` — indica que o bloco cognitive entrou mas falhou (API)
- `COGNITIVE_V2_SHADOW_ERROR` — indica que o V2 shadow especificamente falhou

Esses são `console.error()` e **não são filtrados** por TELEMETRIA_LEVEL. Se NENHUM deles aparecer, significa que o cognitive block nunca foi acionado (causa 2 ou 3 da tabela do Bloco 2).

---

## REFERÊNCIAS DE CÓDIGO

| Item | Arquivo | Linha(s) |
|------|---------|----------|
| Route handler `/__admin__/simulate-funnel` | `Enova worker.js` | L4908-4950 |
| `simulateFunnel()` | `Enova worker.js` | L3260-3365 |
| Chamada `runFunnel()` no simulate | `Enova worker.js` | L3291 |
| `runFunnel()` | `Enova worker.js` | L19257+ |
| `COGNITIVE_V1_ALLOWED_STAGES` | `Enova worker.js` | L1994-2000 |
| `shouldTriggerCognitiveAssist()` | `Enova worker.js` | L2102-2113 |
| Bloco cognitive assist | `Enova worker.js` | L19457-19575 |
| V2 shadow branching | `Enova worker.js` | L19475-19486 |
| Shadow telemetria comparativa | `Enova worker.js` | L19514-19527 |
| Emissão `cognitive_v1_signal` | `Enova worker.js` | L19529-19536 |
| `telemetry()` com filtragem LEVEL | `Enova worker.js` | L2464-2508 |
| Filtragem info em basic | `Enova worker.js` | L2475 |
| `logCognitiveTelemetry()` (sem filtro) | `Enova worker.js` | L38-46 |
| `emitCognitiveTelemetry()` no step() | `Enova worker.js` | L172, L301, L316 |
| `emitCognitiveTelemetry()` no cognitive block | `Enova worker.js` | L19564 |
| `cognitiveAssistV1()` (chama OpenAI) | `Enova worker.js` | L2315-2360, L2341 |
| `runCognitiveV2WithAdapter()` | `Enova worker.js` | L2276-2313 |
| Try-catch do cognitive block | `Enova worker.js` | L19464, L19573 |
| Simulation context setup | `Enova worker.js` | L3266-3276 |
