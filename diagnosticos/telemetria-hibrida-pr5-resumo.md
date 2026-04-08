# Telemetria híbrida — PR 5 (Fases 10, 11 e 12: ranking + regressão + rollout)

Data/hora: 2026-04-08
Branch: copilot/pr5-fases-10-11-12

## Objetivo

Transformar a telemetria persistida em ação:
- Identificar automaticamente os principais problemas do funil
- Priorizar por impacto real (frequência × severidade)
- Permitir validação de correções (antes vs depois)
- Criar base para evolução contínua segura com rollout controlado

## Arquivos criados/alterados

### Criados
- `telemetry/hybrid-telemetry-ranking.js` — agregador de sintomas + ranking + endpoint handler
- `telemetry/hybrid-telemetry-regression.js` — baseline snapshot + comparação temporal + endpoint handler
- `telemetry/hybrid-telemetry-rollout.js` — feature flags em memória + modos OFF/SHADOW/ON + endpoint handler
- `schema/hybrid_telemetry_pr5.smoke.mjs` — 49 smoke tests
- `diagnosticos/telemetria-hibrida-pr5-resumo.md` — este arquivo

### Alterados
- `Enova worker.js` — imports dos 3 módulos + 3 novos endpoints admin (ranking, regression, rollout)

---

## Fase 10 — Ranking de problemas

### Como o ranking é calculado

1. **Coleta**: Busca eventos com sintomas ativos no `enova_log` (tag `HYBRID_TELEMETRY`)
2. **Agregação**: Conta frequência de cada sintoma por:
   - Stage (ex: `inicio_nome`, `inicio_cpf`)
   - Tipo de sintoma (ex: `caused_loop`, `did_reask`)
   - Combinação de sintomas simultâneos
   - Volume por lead
3. **Score de severidade**: `score = frequência × peso`

#### Pesos de severidade

| Sintoma | Peso |
|---------|------|
| `caused_loop` | 5 |
| `did_stage_stick` | 4 |
| `blocked_valid_signal` | 3 |
| `override_suspected` | 3 |
| `did_reask` | 2 |
| `plausible_answer_without_advance` | 2 |
| `did_stage_repeat` | 1 |
| `state_unchanged_when_expected` | 1 |

4. **Ordenação**: Problemas ordenados pelo score descendente (maior score = problema mais grave)

### Endpoint

`GET /__admin_prod__/hybrid-telemetry/ranking`

**Params**:
- `lead_id` / `wa_id` (opcional) — filtrar por lead
- `stage` (opcional) — filtrar por stage
- `since` / `until` (ISO timestamp, opcional) — janela temporal
- `limit` (eventos para analisar, default 200)
- `top` (quantos problemas retornar, default 20)

**Retorna**:
- `top_problems` — lista ordenada por score
- `by_stage` — breakdown por stage
- `by_symptom` — frequência por tipo de sintoma
- `by_combination` — combinações de sintomas simultâneos
- `leads_affected` — quantidade de leads afetados
- `severity_weights` — pesos usados no cálculo

**Exemplo**:
```bash
curl -H "x-enova-admin-key: $KEY" \
  "https://worker.url/__admin_prod__/hybrid-telemetry/ranking?since=2026-04-01T00:00:00Z&top=10"
```

---

## Fase 11 — Regressão baseada em evidência

### Como a regressão é medida

1. **Snapshot de baseline**: Captura contagens de cada sintoma, loops, reasks e avanços de stage para uma janela temporal
2. **Comparação temporal**: Compara duas janelas (antes/depois de um deploy)
3. **Deltas**: Calcula diferença absoluta e percentual para cada métrica
4. **Veredicto automático**:
   - `melhorou`: loops diminuíram E (reasks diminuíram OU avanços aumentaram)
   - `piorou`: loops aumentaram OU (reasks aumentaram E avanços diminuíram)
   - `neutro`: sem mudança significativa

### Endpoint

`GET /__admin_prod__/hybrid-telemetry/regression`

**Params (opção 1 — deploy_at)**:
- `deploy_at` (ISO timestamp) — timestamp do deploy
- `window_hours` (default 24) — horas antes/depois para comparar

**Params (opção 2 — janelas manuais)**:
- `before_since` + `before_until` — janela "antes"
- `after_since` + `after_until` — janela "depois"

**Params comuns**:
- `stage` (opcional) — filtrar por stage
- `lead_id` / `wa_id` (opcional) — filtrar por lead
- `limit` (default 200)

**Retorna**:
- `before` / `after` — snapshots das duas janelas
- `deltas` — diferenças por sintoma (before, after, diff, pct)
- `key_metrics` — loops, reasks, stage_advances com deltas
- `verdict` — `melhorou` | `piorou` | `neutro`
- `windows` — janelas temporais usadas

**Exemplos**:
```bash
# Comparar 24h antes/depois de um deploy
curl -H "x-enova-admin-key: $KEY" \
  "https://worker.url/__admin_prod__/hybrid-telemetry/regression?deploy_at=2026-04-08T12:00:00Z"

# Janelas manuais
curl -H "x-enova-admin-key: $KEY" \
  "https://worker.url/__admin_prod__/hybrid-telemetry/regression?before_since=2026-04-01&before_until=2026-04-04&after_since=2026-04-04&after_until=2026-04-07"
```

---

## Fase 12 — Rollout controlado

### Como o rollout funciona

1. **Flags em memória**: Estrutura `{ "dimension:identifier": "MODE" }`
2. **Dimensões**: `stage`, `type`, `feature`
3. **Modos**:
   - `OFF` (default) — não executa lógica nova
   - `SHADOW` — executa lógica nova mas NÃO aplica resultado (observa apenas)
   - `ON` — executa e aplica lógica nova

### APIs de controle disponíveis no módulo

```js
import {
  setRolloutFlag,        // (dimension, identifier, mode) → resultado
  getRolloutFlag,        // (dimension, identifier) → "OFF"|"SHADOW"|"ON"
  isRolloutActive,       // (dim, id) → boolean (true se ON)
  isRolloutShadow,       // (dim, id) → boolean (true se SHADOW)
  shouldExecuteNewLogic, // (dim, id) → boolean (ON ou SHADOW)
  shouldApplyNewLogic,   // (dim, id) → boolean (somente ON)
  getAllRolloutFlags,     // () → todas as flags
  resetAllRolloutFlags,  // () → limpa tudo
  bulkSetRolloutFlags    // (flags[]) → set em lote
} from "./telemetry/hybrid-telemetry-rollout.js";
```

### Endpoint

**GET** `/__admin_prod__/hybrid-telemetry/rollout` — ver status atual

**POST** `/__admin_prod__/hybrid-telemetry/rollout` — modificar flags

**Payloads POST**:

```json
// Ativar um flag
{ "dimension": "stage", "identifier": "inicio_nome", "mode": "ON" }

// Bulk set
{ "flags": [
  { "dimension": "stage", "identifier": "s1", "mode": "SHADOW" },
  { "dimension": "feature", "identifier": "new_parser", "mode": "ON" }
]}

// Reset tudo
{ "action": "reset" }
```

**Exemplos**:
```bash
# Ver status
curl -H "x-enova-admin-key: $KEY" \
  "https://worker.url/__admin_prod__/hybrid-telemetry/rollout"

# Ativar rollout para inicio_nome em modo shadow
curl -X POST -H "x-enova-admin-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"dimension":"stage","identifier":"inicio_nome","mode":"SHADOW"}' \
  "https://worker.url/__admin_prod__/hybrid-telemetry/rollout"
```

### Segurança

- Flag com modo inválido é rejeitado
- Default conservador: tudo é OFF se não configurado
- `resetAllRolloutFlags()` disponível para emergência
- Nenhuma flag persiste entre deploys (memória volátil = seguro)
- Protegido por `ALLOW_ADMIN_PROD` + `x-enova-admin-key`

---

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

## Tabelas/colunas

### Lidas
- `enova_log`: `wa_id`, `details`, `created_at`, `tag` (SELECT com filtro `tag=eq.HYBRID_TELEMETRY`)

### Escritas
- **Nenhuma** — ranking e regressão são read-only; rollout usa memória

### Novas tabelas/colunas
- **Não**. Zero criação nova.

### Ação manual no Supabase
- **Não**. Nenhuma.

## Smoke tests

49 testes em `schema/hybrid_telemetry_pr5.smoke.mjs`:

| Seção | Descrição | Testes |
|-------|-----------|--------|
| A | Ranking module integrity | 5 |
| B | aggregateSymptoms correctness | 3 |
| C | buildRanking ordering (severity-based) | 3 |
| D | Regression module integrity | 3 |
| E | captureBaseline correctness | 2 |
| F | compareBaselines deltas & verdicts | 4 |
| G | Rollout module integrity | 3 |
| H | Rollout flag CRUD operations | 6 |
| I | Rollout modes (OFF/SHADOW/ON) behavior | 3 |
| J | handleRolloutEndpoint (GET/POST) | 5 |
| K | Proof: parser/gate/nextStage NOT altered | 4 |
| L | Proof: worker behavior intact | 5 |
| M | Endpoints protection proof | 3 |
| **Total** | | **49** |

PRs anteriores: 49 (PR4) + 43 (PR3) + 51 (PR2) = 143 testes passando com zero regressão.

## Próximos passos recomendados

1. **Usar o ranking** para identificar os stages com mais problemas e atacar primeiro os de maior score
2. **Criar baseline** antes de qualquer correção e comparar depois para validar com evidência
3. **Usar rollout SHADOW** para testar mudanças sem risco antes de ativar ON
4. **Expandir** os módulos com métricas adicionais conforme necessidade operacional
5. **Considerar persistência de flags** via env vars ou config se necessário entre deploys
6. **Dashboard** visual pode consumir os endpoints admin para visualização humana

---

**Esta PR fecha o contrato de telemetria híbrida (PRs 1-5, Fases 0-12).**

A partir daqui, toda evolução do funil deve ser guiada por:
- Ranking de problemas (o que atacar)
- Regressão baseada em evidência (se melhorou ou piorou)
- Rollout controlado (aplicar mudanças com segurança)
