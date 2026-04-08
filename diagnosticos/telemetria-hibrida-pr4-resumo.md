# Telemetria híbrida — PR 4 (persistência estruturada + endpoints admin)

Data/hora: 2026-04-08
Branch: copilot/implementacao-pr-4-fases-8-9

## Objetivo

Persistir a telemetria híbrida de forma consultável e criar endpoints admin para leitura operacional dos eventos, sem alterar comportamento do funil.

## Arquivos criados/alterados

### Criados
- `telemetry/hybrid-telemetry-persistence.js` — persistência + query helpers
- `schema/hybrid_telemetry_pr4.smoke.mjs` — 49 smoke tests
- `diagnosticos/telemetria-hibrida-pr4-resumo.md` — este arquivo

### Alterados
- `telemetry/hybrid-telemetry-worker-hooks.js` — persistent emitter registrado nos 7 hooks
- `Enova worker.js` — import + registro do emitter + 4 endpoints admin

## Fase 8 — Persistência estruturada

### Onde a telemetria passou a ser persistida

Todos os 7 hooks de telemetria híbrida agora persistem eventos no `enova_log` via o mecanismo existente de `logger()` → `sbFetch` → Supabase.

- **Nenhuma tabela nova criada**
- **Nenhuma coluna nova criada**
- Reuso total da infraestrutura existente: `enova_log` com campos `tag`, `wa_id`, `details`
- Tag padronizado: `HYBRID_TELEMETRY`
- `details` contém JSON estruturado com todos os blocos da telemetria

### Arquitetura da persistência

```
Hook (emissão) → emitHybridTelemetry({ persistentEmitter })
                       ↓
              _registeredPersistentEmitter (module-level)
                       ↓
              persistHybridTelemetryEvent(logger, env, event)
                       ↓
              buildPersistenceRecord(event) → { tag, wa_id, details }
                       ↓
              logger(env, record) → sbFetch → enova_log INSERT
```

### Registro do emitter

O emitter é registrado uma vez no fetch handler do worker:

```js
registerPersistentEmitter(createPersistentEmitter(logger, env));
```

Se o registro falhar, o worker continua funcionando normalmente.

### Quais eventos passaram a ser gravados

| Hook | Evento | Persistido |
|------|--------|-----------|
| 1 | `funnel.cognitive.turn.start` | ✅ |
| 2 | `funnel.cognitive.turn.result` | ✅ |
| 3 | `funnel.cognitive.post_processing` | ✅ |
| 4 | `funnel.mechanical.parse.result` | ✅ |
| 5 | `funnel.arbitration.conflict` / `override.suspected` | ✅ |
| 6 | `funnel.output.final` | ✅ |
| 7 | `funnel.stage.symptoms` | ✅ |

### Campos persistidos por evento

Cada registro no `enova_log` contém:

- `tag`: `HYBRID_TELEMETRY` (fixo)
- `wa_id`: lead_id/wa_id do evento
- `details`: JSON com:
  - `schema_version`, `event_name`, `timestamp`
  - `lead_id`, `conversation_id`, `turn_id`, `correlation_id`
  - `stage_before`, `stage_after`
  - `cognitive`: bloco cognitivo (intent, confidence, reply, reason_codes, etc.)
  - `mechanical`: bloco mecânico (parser, action, reask, state_diff, etc.)
  - `arbitration`: bloco arbitral (triggered, outcome, winner, override, etc.)
  - `stage_symptoms`: sintomas centrais (9 flags)
  - `contract_meta`: dados do contrato final (before/after/surface_changed)
  - `output_meta`: dados do output final (surface, arbiter_source)

### Isolamento de falha

- Se `logger()` falhar → evento só vai para console.log, atendimento continua
- Se `registerPersistentEmitter` falhar → hooks emitem normalmente sem persistência
- Se `buildPersistenceRecord` falhar → retorna null, nada é gravado, fluxo segue
- Nenhum try/catch da persistência pode propagar exceção para o fluxo decisional

## Fase 9 — Endpoints admin de auditoria

### Endpoints criados

Todos sob `/__admin_prod__/` (protegidos por `ALLOW_ADMIN_PROD` + `x-enova-admin-key`).

#### 1. `GET /__admin_prod__/hybrid-telemetry/by-lead`

Consulta eventos por lead.

**Params**:
- `lead_id` ou `wa_id` (obrigatório)
- `event_name` (opcional)
- `stage` (opcional)
- `reason_code` (opcional)
- `since` / `until` (ISO timestamp, opcional)
- `limit` (default 50, max 200)
- `order` (asc/desc, default desc)

**Exemplo**: `/__admin_prod__/hybrid-telemetry/by-lead?lead_id=5511999999999&limit=20`

#### 2. `GET /__admin_prod__/hybrid-telemetry/recent`

Últimos eventos/falhas persistidos.

**Params**: mesmos filtros acima (exceto `lead_id` é opcional).

**Exemplo**: `/__admin_prod__/hybrid-telemetry/recent?limit=30`

#### 3. `GET /__admin_prod__/hybrid-telemetry/conflicts`

Eventos com conflito de arbitragem (override/suspeita/bloqueio).

**Params**:
- `lead_id` / `wa_id` (opcional)
- `stage` (opcional)
- `conflict_type`: `override` | `override_suspected` | `blocked` | `loop` (opcional)
- `since` / `until` (opcional)
- `limit` (default 100)

**Exemplo**: `/__admin_prod__/hybrid-telemetry/conflicts?conflict_type=override_suspected`

#### 4. `GET /__admin_prod__/hybrid-telemetry/symptoms`

Eventos com sintomas de stage ativos.

**Params**:
- `lead_id` / `wa_id` (opcional)
- `stage` (opcional)
- `symptom`: `did_stage_repeat` | `did_stage_stick` | `did_reask` | `plausible_answer_without_advance` | `blocked_valid_signal` | `caused_loop` | `override_suspected` | `state_unchanged_when_expected` (opcional)
- `since` / `until` (opcional)
- `limit` (default 100)

**Exemplo**: `/__admin_prod__/hybrid-telemetry/symptoms?symptom=caused_loop&stage=inicio_nome`

### Segurança dos endpoints

- Todos sob `/__admin_prod__/` → requer `ALLOW_ADMIN_PROD=true` no env
- Auth via `x-enova-admin-key` (mesmo padrão admin existente)
- Todos são GET-only (leitura pura, zero escrita)
- Não afetam parser, gate, nextStage, fallback ou surface
- Se falharem, retornam JSON com `ok: false` + erro descritivo

### Como consultar por lead

```bash
curl -H "x-enova-admin-key: $KEY" \
  "https://worker.url/__admin_prod__/hybrid-telemetry/by-lead?lead_id=5511999999999"
```

### Como consultar conflitos/sintomas

```bash
# Conflitos de arbitragem
curl -H "x-enova-admin-key: $KEY" \
  "https://worker.url/__admin_prod__/hybrid-telemetry/conflicts"

# Sintomas de loop
curl -H "x-enova-admin-key: $KEY" \
  "https://worker.url/__admin_prod__/hybrid-telemetry/symptoms?symptom=caused_loop"
```

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
- `enova_log`: `tag`, `wa_id`, `details` (INSERT via `logger()` existente)

### Novas tabelas/colunas
- **Não**. Zero criação nova.

### Ação manual no Supabase
- **Não**. Nenhuma.

## Smoke tests

49 testes em `schema/hybrid_telemetry_pr4.smoke.mjs`:

| Seção | Descrição | Testes |
|-------|-----------|--------|
| A | Integridade do módulo de persistência | 7 |
| B | buildPersistenceRecord correctness | 5 |
| C | persistHybridTelemetryEvent fire-and-forget | 4 |
| D | createPersistentEmitter integration | 2 |
| E | queryHybridTelemetryEvents post-filtering | 5 |
| F | queryArbitrationConflicts | 2 |
| G | queryStageSymptoms | 4 |
| H | registerPersistentEmitter / getRegisteredPersistentEmitter | 4 |
| I | Prova: parser/gate/nextStage não alterados | 4 |
| J | Prova: comportamento do worker intacto | 5 |
| K | Prova: falha de persistência não derruba atendimento | 7 |
| **Total** | | **49** |

Testes de PRs anteriores: 51 (PR2) + 43 (PR3) = 94 testes passando com zero regressão.

## O que ficou para PR 5

- Ranking consolidado
- Dashboard bonito
- Regressão ampla de casos reais
- Rollout controlado por blocos
- Métricas agregadas por stage
- Expansão profunda de blocos por domínio
- Testes de integração end-to-end com runFunnel real
