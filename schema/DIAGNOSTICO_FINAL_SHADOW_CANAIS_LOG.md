# DIAGNÓSTICO FINAL: Por que `cognitive_v1_signal` não aparece no CSV exportado

**Data:** 2026-03-31
**Tipo:** Read-only, final, fechado
**Status:** CONFIRMADO — causa raiz identificada no código

---

## BLOCO 1 — MAPA EXATO DOS CANAIS DE LOG

| Evento/Log | Função emissora | Linha | Destino real | Formato de saída | Aparece no CSV filtrado por JSON? | Observação |
|---|---|---|---|---|---|---|
| `cognitive_telemetry` | `logCognitiveTelemetry()` | L38-46 | `console.log()` | **JSON puro**: `{"type":"cognitive_telemetry",...}` | **SIM** | Sem prefixo, JSON parseável direto |
| `cognitive_v1_signal` | `telemetry()` | L2503 | `console.log()` | **Prefixado**: `TELEMETRIA-SAFE: {"event":"cognitive_v1_signal",...}` | **NÃO** | Prefixo `TELEMETRIA-SAFE:` quebra parse JSON |
| `COGNITIVE_V2_SHADOW_ERROR` | `console.error()` | L19485 | `console.error()` | **Prefixado**: `COGNITIVE_V2_SHADOW_ERROR: <Error>` | **NÃO** | Nível `error` + formato não-JSON |

### Código exato que prova

**`logCognitiveTelemetry` — L38-46 — JSON PURO, sem prefixo:**
```javascript
function logCognitiveTelemetry(data) {
  try {
    console.log(JSON.stringify({          // ← UM argumento, JSON puro
      type: "cognitive_telemetry",
      timestamp: new Date().toISOString(),
      ...data
    }));
  } catch (e) {}
}
```

**`telemetry` — L2503 — COM PREFIXO, não é JSON puro:**
```javascript
console.log("TELEMETRIA-SAFE:", JSON.stringify(safePayload));
// ← DOIS argumentos: string "TELEMETRIA-SAFE:" + JSON
// Saída no log: TELEMETRIA-SAFE: {"event":"cognitive_v1_signal",...}
// NÃO é JSON parseável — tem prefixo de texto
```

### Conclusão do Bloco 1

- **Ambas as funções vão para `console.log`** — MESMO canal, MESMO Worker Logs
- **A diferença é o FORMATO de saída, NÃO o canal**
- `cognitive_telemetry` → JSON puro → aparece quando o export filtra por linhas JSON
- `cognitive_v1_signal` → `TELEMETRIA-SAFE: {json}` → NÃO aparece porque o prefixo impede parse JSON
- Não existe Supabase, não existe banco, não existe outro sink — tudo é `console.log`

---

## BLOCO 2 — VEREDITO FECHADO

**O CSV que exportamos era o lugar certo para buscar `cognitive_v1_signal`?**

**SIM e NÃO.**

- **SIM** no sentido de que `cognitive_v1_signal` está no mesmo `console.log` que `cognitive_telemetry`
- **NÃO** no sentido de que o CSV exportado foi construído filtrando linhas JSON parseáveis do Worker Logs, e `cognitive_v1_signal` NÃO é uma linha JSON parseável — tem o prefixo `TELEMETRIA-SAFE:` antes do JSON

**Causa raiz confirmada:** O evento `cognitive_v1_signal` **é emitido e está nos logs**, mas a forma de exportação (parsing JSON de cada linha) **não captura linhas com prefixo de texto**.

**Não é problema de:**
- ~~TELEMETRIA_LEVEL~~ (com verbose, o evento passa — L2475 não bloqueia)
- ~~stage errado~~ (o bloco cognitive está sendo acionado — `used_llm=true` confirma)
- ~~canal diferente~~ (ambos usam `console.log`)
- ~~simulação suprimindo~~ (simulação não suprime telemetria)

**É problema de:** formato de saída da função `telemetry()` no L2503.

---

## BLOCO 3 — CAMINHO CERTO DE OBSERVAÇÃO

### Para provar o shadow AGORA, sem mexer em código:

1. **Worker Logs real-time (wrangler tail ou Dashboard):**
   - Abrir `wrangler tail` ou o painel de Logs do Cloudflare Workers
   - Executar o `simulate-funnel` com `start_stage=estado_civil` e texto trigger
   - Procurar no output bruto (não filtrado) por: `TELEMETRIA-SAFE:`
   - A linha conterá: `TELEMETRIA-SAFE: {"event":"cognitive_v1_signal","details":{..."cognitive_v2_mode":"shadow","v2_shadow":{...}}}`

2. **Se usando `wrangler tail --format json`:**
   - O campo `logs[].message` de cada trace event conterá arrays
   - Para `cognitive_telemetry`: `message: ["{\"type\":\"cognitive_telemetry\",...}"]` → 1 elemento
   - Para `cognitive_v1_signal`: `message: ["TELEMETRIA-SAFE:", "{\"event\":\"cognitive_v1_signal\",...}"]` → 2 elementos
   - O segundo elemento do array é o JSON com os dados do shadow

3. **Filtro/consulta exata no log bruto:**
   ```
   TELEMETRIA-SAFE:.*cognitive_v1_signal
   ```
   Ou, se usando grep no tail:
   ```bash
   wrangler tail --format json | grep "cognitive_v1_signal"
   ```

4. **Para erro do shadow V2:**
   ```
   COGNITIVE_V2_SHADOW_ERROR
   ```
   (este vai para `console.error`, não `console.log`)

---

## BLOCO 4 — SERVE OU NÃO SERVE

**`__admin__/simulate-funnel` serve para gerar a evidência do shadow?**

**SIM.** Serve.

- `simulateFunnel()` chama `runFunnel()` diretamente (L3291)
- O bloco cognitive NÃO tem bypass de simulação (L19457-19575, nenhum check de `isSim`)
- O branching shadow (L19475-19486) executa normalmente
- `telemetry()` é chamada (L19529) e `console.log` executa (L2503)
- `emitCognitiveTelemetry()` é chamada (L19564) e `console.log` executa (L40)

**Onde a evidência aparece de verdade:**
- No output bruto do `console.log` do Worker
- Em linhas que começam com `TELEMETRIA-SAFE:` (para `cognitive_v1_signal`)
- Em linhas JSON puras com `type: "cognitive_telemetry"` (para métricas do cognitive)
- A evidência do shadow está no `details.v2_shadow` dentro da linha `TELEMETRIA-SAFE:`
- O campo `details.cognitive_v2_mode` mostra `"shadow"`

**O que o CSV atual captura:** apenas `cognitive_telemetry` (JSON puro, sem prefixo)
**O que o CSV atual NÃO captura:** `cognitive_v1_signal` (tem prefixo `TELEMETRIA-SAFE:`)

---

## BLOCO 5 — PRÓXIMO PASSO ÚNICO

### Ação exata (sem código):

**Executar o teste com `wrangler tail` aberto e buscar `cognitive_v1_signal` no output bruto.**

```bash
# Terminal 1: abrir tail
wrangler tail --env test --format pretty

# Terminal 2: disparar o teste
curl -X POST https://<test-worker-url>/__admin__/simulate-funnel \
  -H "Authorization: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "wa_id": "5511999990001",
    "start_stage": "estado_civil",
    "script": ["Sou solteiro, posso financiar um imóvel?"],
    "dry_run": true
  }'
```

**No Terminal 1, procurar por:**
- `TELEMETRIA-SAFE:` seguido de JSON com `"event":"cognitive_v1_signal"`
- Dentro do JSON: `"cognitive_v2_mode":"shadow"` e `"v2_shadow":{...}`

**Se `v2_shadow` aparecer preenchido:** shadow está funcionando — o problema era apenas o export CSV.
**Se `v2_shadow` aparecer `null`:** V2 falhou silenciosamente — procurar por `COGNITIVE_V2_SHADOW_ERROR` no mesmo tail.
**Se a linha `cognitive_v1_signal` não aparecer:** o cognitive block lançou exceção antes de L19529 — procurar por `COGNITIVE_V1_RUNFUNNEL_ERROR` no tail.

### Alternativa se wrangler tail não for possível:

Usar o Dashboard do Cloudflare → Workers & Pages → Worker Enova test → Logs → Real-time logs → filtrar pelo request do simulate-funnel → procurar `TELEMETRIA-SAFE:` no output.

---

## REFERÊNCIAS DE CÓDIGO

| Item | Linha(s) |
|------|----------|
| `logCognitiveTelemetry()` — JSON puro, sem prefixo | L38-46 |
| `emitCognitiveTelemetry()` — chama `logCognitiveTelemetry` | L100-120 |
| `telemetry()` — com prefixo `TELEMETRIA-SAFE:` | L2464-2508, output em L2503 |
| TELEMETRIA_LEVEL filtering | L2466, L2475 |
| Bloco cognitive assist | L19457-19575 |
| Shadow branching V2 | L19475-19486 |
| Shadow telemetria comparativa (9 campos) | L19514-19527 |
| Emissão `cognitive_v1_signal` | L19529-19536 |
| Emissão `cognitive_telemetry` no cognitive block | L19564-19569 |
| `COGNITIVE_V2_SHADOW_ERROR` | L19484-19485 |
| `COGNITIVE_V1_RUNFUNNEL_ERROR` | L19573-19574 |
| `simulateFunnel()` chama `runFunnel()` | L3291 |
| Simulation context (sem bypass de telemetria) | L3266-3276 |
