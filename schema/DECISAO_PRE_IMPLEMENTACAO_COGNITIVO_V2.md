# DECISÃO DE PRÉ-IMPLEMENTAÇÃO — MIGRAÇÃO COGNITIVO V1 → V2

**Data:** 2026-03-31
**Status:** PLANO CONGELADO — AGUARDANDO APROVAÇÃO
**Escopo:** Apenas decisões documentais. Zero código. Zero patch.

---

## BLOCO 1 — O QUE JÁ ESTÁ CONFIRMADO

Cada item abaixo foi verificado diretamente no código fonte atual (commit `ebad71e`).

### 1.1 — Decisões Arquiteturais Confirmadas

| # | Decisão | Evidência | Status |
|---|---------|-----------|--------|
| 1 | Motor V2 isolado (`cognitive/src/run-cognitive.js`) é a fonte canônica de evolução | 1492 linhas, 40+ fixtures, 9+ stages, LLM+heurística | ✅ CONFIRMADO |
| 2 | `cognitiveAssistV1` (worker.js L2315-2360) é legado transitório | ~50 linhas, 5 stages, LLM-only, sem heurística de fallback | ✅ CONFIRMADO |
| 3 | Migração por substituição controlada, não por fusão | Feature flag `COGNITIVE_V2_MODE` com 3 modos (off/shadow/on) em L19467 | ✅ CONFIRMADO |
| 4 | Soberania do trilho mecânico preservada | V2 engine: `should_advance_stage: false` SEMPRE (validado em L1366 do run-cognitive.js) | ✅ CONFIRMADO |
| 5 | Nenhum output cognitivo avança stage sozinho | Adapter força `suggested_stage: stage` (L2270); `should_advance_stage` validado como `false` | ✅ CONFIRMADO |
| 6 | Cognitivo substitui casca conversacional, não o trilho | `__cognitive_reply_prefix` é prepend (L159-163), não substituição; trilho decide nextStage | ✅ CONFIRMADO |

### 1.2 — Ponto de Entrada Confirmado

| Critério | Resultado |
|----------|-----------|
| **Ponto recomendado** | `runFunnel()` L19460-19570, bloco COGNITIVE ASSIST |
| **Motivo** | Já tem feature flag, branching V1/V2/shadow, telemetria, fallback |
| **Alternativa 1 rejeitada** | `handleMetaWebhook()` — quebraria sequência de guards e ignoraria resets |
| **Alternativa 2 rejeitada** | `step()` — 60+ call sites, middleware global, risco CRÍTICO |
| **Alternativa 3 rejeitada** | Admin endpoint — não é ponto de produção |

### 1.3 — Infraestrutura de Código JÁ Implementada

Estes componentes existem no worker.js atual e foram verificados:

| Componente | Localização | Linhas | Status |
|-----------|-------------|--------|--------|
| Feature flag `COGNITIVE_V2_MODE` (off/shadow/on) | L19467 | 1 | ✅ Existe, default "off" |
| Branching V1/shadow/V2 | L19468-19494 | 27 | ✅ Existe |
| Adapter `adaptCognitiveV2Output()` | L2206-2274 | 69 | ✅ Existe |
| Wrapper `runCognitiveV2WithAdapter()` | L2276-2313 | 38 | ✅ Existe |
| Fallback `buildCognitiveFallback()` | L2185-2198 | 14 | ✅ Existe |
| Shadow telemetria comparativa | L19518-19530 | 13 | ✅ Existe |
| `COGNITIVE_HEURISTIC_REASONS` Set | L19548 | 1 | ✅ Cobre reasons V2 |
| Error catch em shadow | L19480-19482 | 3 | ✅ Silencia erros V2 |
| Error catch em V2 "on" | L2302-2308 | 7 | ✅ Retorna fallback |

### 1.4 — Testes JÁ Existentes

| Suite | Arquivo | Testes | Status |
|-------|---------|--------|--------|
| Adapter V2 | `schema/cognitive_v2_adapter.smoke.mjs` | 18 | ✅ Passando |
| V2 Mode "on" | `schema/cognitive_v2_mode_on.smoke.mjs` | 13 | ✅ Passando |
| Runner isolado | `schema/cognitive_read_only_runner.smoke.mjs` | 42+ | ✅ Passando |
| Admin | `schema/cognitive_read_only_admin.smoke.mjs` | 40+ | ✅ Passando |
| Telemetria | `schema/cognitive_telemetry.smoke.mjs` | 3 flows | ✅ Passando |

### 1.5 — Contratos de Código Confirmados

| Função | O que faz | V2 compatível? | Evidência |
|--------|-----------|----------------|-----------|
| `isStageSignalCompatible()` (L2122) | Valida prefixo de safe_stage_signal por stage | ✅ SIM | Adapter constrói sinais em formato "prefixo:valor" |
| `extractCompatibleStageAnswerFromCognitive()` (L2135) | Extrai valor de entities→stage_signals→safe_stage_signal | ✅ SIM (com ressalva C.3) | Adapter preenche entities e safe_stage_signal |
| `sanitizeCognitiveReply()` (L2115) | Substitui "casa"→"imóvel" | ✅ SIM | Função pura, agnóstica ao motor |
| `resolveCognitiveTelemetrySlot()` (L78) | Resolve slot de entities/signals | ✅ SIM | Adapter preenche entities no formato esperado |
| `hasUsefulCognitiveReply` check (L19545) | Verifica intent, answered_customer_question, safe_stage_signal | ✅ SIM | Adapter produz intent e safe_stage_signal válidos |

---

## BLOCO 2 — O QUE AINDA ESTÁ EM ABERTO

### 2.1 — Dúvidas Técnicas Não Fechadas

| # | Dúvida | Severidade | O que falta para fechar | Bloqueador? |
|---|--------|-----------|------------------------|-------------|
| 1 | **Distribuição de confidence V1 vs V2 é compatível com threshold 0.66?** | MÉDIA | Dados reais de shadow mode (≥500 chamadas) | NÃO para shadow; SIM para "on" |
| 2 | **Shadow mode adiciona latência perceptível ao usuário?** | MÉDIA | Medição de p95 em staging | NÃO (shadow é fire-and-catch) |
| 3 | **V2 heurística detecta slots tão bem quanto V1 LLM em runtime real?** | ALTA | Dados reais de shadow mode com mensagens reais (não fixtures) | NÃO para shadow; SIM para "on" |
| 4 | **`answered_customer_question` derivado por `replyText.length > 20` é robusto o suficiente?** | BAIXA | Comparação em shadow V1 vs V2 | NÃO (campo informativo, não decisório para stage) |
| 5 | **Tom/qualidade das respostas V2 heurísticas vs V2 LLM vs V1 LLM é aceitável?** | ALTA | Análise manual de amostras em shadow | NÃO para shadow; SIM para "on" |

### 2.2 — Lacunas na Telemetria Shadow

A telemetria shadow **atual** compara 9 campos (confidence, intent, reason, safe_stage_signal, reply_text_length, still_needs_original_answer, answered_customer_question, reply_text_snippet, entities_keys).

**Campos NÃO comparados que podem ser relevantes:**

| Campo | Por que importa | Risco de não comparar |
|-------|----------------|----------------------|
| `entities` (objeto completo) | Nomes de campo diferentes entre V1 e V2 | MÉDIO — se entities V2 não bater, extractCompatibleStageAnswer pode falhar |
| `stage_signals` (objeto completo) | Backup path para extração de resposta | BAIXO |
| `reply_text` (conteúdo integral vs snippet) | Tom pode divergir significativamente | MÉDIO — apenas 80 chars logados atualmente |

### 2.3 — Decisão Pendente: Expansão de Stages

- V2 suporta 9+ stages (docs, correspondente, visita, etc.)
- V1 está limitado a 5 stages em `COGNITIVE_V1_ALLOWED_STAGES`
- **Decisão atual:** NÃO expandir agora. Fazer em etapa separada pós-migração.
- **Status:** ✅ DECIDIDO, mas precisa confirmação explícita de que esta é a posição final.

---

## BLOCO 3 — O QUE FOI ASSUMIDO CEDO DEMAIS

A sessão anterior (commit `ebad71e`) implementou alterações de código **antes** do plano ser aprovado. Essas alterações precisam ser avaliadas:

### 3.1 — Alterações de Código Já Feitas (SEM aprovação prévia)

| # | O que foi alterado | Arquivo | Linhas | O que fez | Risco introduzido | Deve manter? |
|---|-------------------|---------|--------|-----------|-------------------|--------------|
| 1 | Alias `composicao_tipo` no adapter | `Enova worker.js` | L2220-2224 | Adicionou `entities.composicao_tipo` quando `key === "composicao"` | MÍNIMO — melhora compatibilidade | ✅ SIM — recomendado pelo diagnóstico C.3 |
| 2 | Expansão de shadow telemetria | `Enova worker.js` | L19522-19525 | Adicionou 4 campos ao bloco `v2_shadow` (still_needs, answered, snippet, entities_keys) | MÍNIMO — apenas campos de log | ✅ SIM — recomendado pelo diagnóstico D.2 |
| 3 | Novo smoke test V2 "on" | `schema/cognitive_v2_mode_on.smoke.mjs` | 387 linhas (novo) | 13 testes exercitando path V2 "on" com adapter | NULO — apenas teste | ✅ SIM — preenche lacuna F.3 item 1 |
| 4 | Testes adicionais no adapter smoke | `schema/cognitive_v2_adapter.smoke.mjs` | +31 linhas | Adicionou caso `composicao_tipo` | NULO — apenas teste | ✅ SIM — cobre alias adicionado |
| 5 | Documento diagnóstico completo | `schema/DIAGNOSTICO_PRE_IMPLEMENTACAO_COGNITIVO_V2.md` | 606 linhas (novo) | Blocos A-G do diagnóstico | NULO — documentação | ✅ SIM — diagnóstico válido |

### 3.2 — Avaliação das Alterações Prematuras

**Conclusão objetiva:** As 4 alterações de código (2 no worker.js, 2 em smoke tests) são tecnicamente corretas e de risco mínimo:
- Alteração 1: adiciona 1 campo a um objeto — não quebra nada, melhora compatibilidade
- Alteração 2: adiciona 4 campos a um bloco de telemetria — não afeta runtime
- Alterações 3-4: arquivos de teste novos — zero impacto em produção

**Porém:** O processo correto era aprovar o plano ANTES de implementar. As alterações estão corretas, mas o procedimento não foi.

### 3.3 — Conclusões Ainda Não Comprovadas

| # | Conclusão assumida | O que provaria de verdade | Status |
|---|-------------------|--------------------------|--------|
| 1 | V2 confidence é compatível com threshold 0.66 | Shadow com ≥500 chamadas reais | NÃO COMPROVADO — só verificado com fixtures |
| 2 | V2 heurística detecta slots bem em runtime real | Shadow com mensagens reais (typos, emojis) | NÃO COMPROVADO — fixtures são controladas |
| 3 | Adapter não mascara erros de forma relevante | Shadow comparativo V1 vs V2 em produção | NÃO COMPROVADO — testes unitários passam, mas runtime pode divergir |
| 4 | Latência do shadow é aceitável | Medição de p95 em staging | NÃO COMPROVADO |
| 5 | Tom/qualidade das respostas V2 é equivalente | Análise manual de amostras | NÃO COMPROVADO |

---

## BLOCO 4 — CRITÉRIOS DE FECHAMENTO

### 4.1 — O Que Precisa Estar Fechado Para Liberar Cada Etapa

#### Para liberar SHADOW em staging:
| # | Critério | Status atual | O que falta |
|---|----------|-------------|-------------|
| 1 | Todos os smoke tests passando | ✅ ATENDIDO | — |
| 2 | Feature flag default = "off" | ✅ ATENDIDO | — |
| 3 | Adapter produz 10 campos corretos | ✅ ATENDIDO | — |
| 4 | Shadow telemetria captura comparação | ✅ ATENDIDO | — |
| 5 | Rollback = remover env var | ✅ ATENDIDO | — |
| **Veredicto** | **PODE liberar shadow em staging** | | |

#### Para liberar "ON" em staging (V2 como primário):
| # | Critério | Status atual | O que falta |
|---|----------|-------------|-------------|
| 1 | ≥500 chamadas shadow sem exception V2 | ❌ NÃO ATENDIDO | Dados de shadow staging |
| 2 | Exception rate V2 < 0.5% | ❌ NÃO ATENDIDO | Dados de shadow staging |
| 3 | safe_stage_signal compatibilidade ≥ 90% | ❌ NÃO ATENDIDO | Dados de shadow staging |
| 4 | Nenhum safe_stage_signal incompatível com isStageSignalCompatible() | ❌ NÃO ATENDIDO | Dados de shadow staging |
| 5 | |confidence V1-V2| média ≤ 0.25 | ❌ NÃO ATENDIDO | Dados de shadow staging |
| 6 | V2 reply_text vazio < 1% | ❌ NÃO ATENDIDO | Dados de shadow staging |
| 7 | Todos os 5 stages cobertos nas amostras | ❌ NÃO ATENDIDO | Dados de shadow staging |
| **Veredicto** | **NÃO pode liberar "on" ainda** | Depende de dados reais de shadow | |

#### Para liberar "ON" em produção:
| # | Critério | Status atual | O que falta |
|---|----------|-------------|-------------|
| 1 | Todos os critérios do "on staging" atendidos | ❌ | Shadow staging primeiro |
| 2 | Teste manual de 5 conversas em staging (1 por stage) | ❌ | Staging com "on" primeiro |
| 3 | Shadow em produção com ≥500 chamadas reais | ❌ | Shadow produção primeiro |
| 4 | Critérios D.3 reavaliados com dados de produção | ❌ | Shadow produção primeiro |
| **Veredicto** | **NÃO pode liberar em produção ainda** | Múltiplas etapas pendentes | |

#### Para remover código V1 legado:
| # | Critério | Status atual | O que falta |
|---|----------|-------------|-------------|
| 1 | V2 "on" em produção estável por ≥2000 interações | ❌ | V2 "on" em produção primeiro |
| 2 | Zero casos de safe_stage_signal incompatível | ❌ | V2 "on" em produção primeiro |
| 3 | Smoke tests V2 cobrindo todos os cenários V1 | ✅ ATENDIDO | — |
| **Veredicto** | **NÃO pode remover V1 ainda** | Longe disso | |

### 4.2 — Condições de Rollback

| Gatilho | Ação | Tempo de efeito |
|---------|------|-----------------|
| V2 exception rate > 2% | `COGNITIVE_V2_MODE=off` | Instantâneo (próximo request) |
| safe_stage_signal incompatível detectado | `COGNITIVE_V2_MODE=off` | Instantâneo |
| V2 reply_text vazio > 5% | `COGNITIVE_V2_MODE=off` | Instantâneo |
| `should_advance_stage !== false` detectado | `COGNITIVE_V2_MODE=off` + investigar | Instantâneo |
| Latência p95 degradada > 2x | `COGNITIVE_V2_MODE=off` | Instantâneo |
| Reclamação de qualidade de atendimento | `COGNITIVE_V2_MODE=off` + análise | Instantâneo |

---

## BLOCO 5 — PLANO CONGELADO FINAL

### Premissa Fundamental

O código de infraestrutura (adapter, wrapper, flag, branching, telemetria) **já existe** no worker. As alterações de código da sessão anterior (alias composicao_tipo, shadow expandido, smoke tests) são tecnicamente corretas. O plano abaixo NÃO requer mais código — apenas configuração e validação.

### Etapa 1 — Validar Que Código Atual Está Correto (TESTES EXISTENTES)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Confirmar que as 4 suites de smoke test passam sem regressão |
| **Ação** | `node schema/cognitive_v2_adapter.smoke.mjs && node schema/cognitive_v2_mode_on.smoke.mjs && node schema/cognitive_read_only_runner.smoke.mjs && node schema/cognitive_telemetry.smoke.mjs` |
| **Critério de aceite** | Todos os testes passam |
| **O que NÃO alterar** | Nenhum arquivo de código |
| **Risco** | NULO |
| **Rollback** | N/A |

### Etapa 2 — Ativar Shadow em Staging

| Campo | Valor |
|-------|-------|
| **Objetivo** | Coletar dados comparativos V1 vs V2 em ambiente real |
| **Ação** | Definir `COGNITIVE_V2_MODE=shadow` no Cloudflare dashboard (env test) |
| **Critério de aceite** | Logs de telemetria mostram bloco `v2_shadow` com dados de comparação |
| **O que NÃO alterar** | Código do worker; config de produção |
| **Risco** | BAIXO — shadow não afeta fluxo real; pode adicionar latência ao request |
| **Rollback** | Remover var `COGNITIVE_V2_MODE` do dashboard (volta ao default "off") |
| **Smoke test** | Verificar nos logs que evento `cognitive_v1_signal` inclui campo `v2_shadow` |

### Etapa 3 — Análise de Shadow (Offline, Sem Código)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Validar critérios do Bloco 4.1 com dados reais de staging |
| **Ação** | Analisar logs de telemetria externamente |
| **Dependência** | ≥500 chamadas shadow em staging |
| **O que NÃO alterar** | Nada |
| **Risco** | NULO |

**Checklist de validação (todos obrigatórios para prosseguir):**
- [ ] ≥500 chamadas shadow sem exception V2
- [ ] Exception rate V2 < 0.5%
- [ ] safe_stage_signal compatibilidade ≥ 90% (V1 produz sinal → V2 também produz)
- [ ] ZERO casos de safe_stage_signal incompatível com `isStageSignalCompatible()`
- [ ] |confidence V1 - V2| média ≤ 0.25
- [ ] V2 reply_text vazio < 1%
- [ ] Todos os 5 stages representados nas amostras (estado_civil, quem_pode_somar, interpretar_composicao, renda, ir_declarado)

### Etapa 4 — Ativar V2 em Staging

| Campo | Valor |
|-------|-------|
| **Objetivo** | V2 como motor primário em staging |
| **Ação** | Definir `COGNITIVE_V2_MODE=on` no Cloudflare dashboard (env test) |
| **Dependência** | Etapa 3 concluída com TODOS os critérios atendidos |
| **Critério de aceite** | Atendimentos em staging funcionam normalmente |
| **O que NÃO alterar** | Código do worker; config de produção |
| **Risco** | MÉDIO — V2 respondendo ao invés de V1 |
| **Rollback** | `COGNITIVE_V2_MODE=shadow` ou `COGNITIVE_V2_MODE=off` |
| **Smoke test** | Testar manualmente 5 conversações (1 por stage cognitivo) |

### Etapa 5 — Shadow em Produção

| Campo | Valor |
|-------|-------|
| **Objetivo** | Coletar dados comparativos com tráfego real de produção |
| **Ação** | Definir `COGNITIVE_V2_MODE=shadow` no Cloudflare dashboard (env prod) |
| **Dependência** | Etapa 4 validada em staging |
| **Critério de aceite** | Shadow dados em produção confirmam padrões de staging |
| **O que NÃO alterar** | Código do worker; modo do motor (V1 continua primário) |
| **Risco** | BAIXO — shadow apenas loga |
| **Rollback** | Remover `COGNITIVE_V2_MODE` do dashboard (volta ao default "off") |

### Etapa 6 — Análise de Shadow Produção (Offline, Sem Código)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Reaplicar critérios Bloco 4.1 com dados de produção |
| **Ação** | Analisar logs de telemetria externamente |
| **Dependência** | ≥500 chamadas shadow em produção |
| **O que NÃO alterar** | Nada |
| **Risco** | NULO |

**Mesma checklist da Etapa 3, reavaliada com dados de produção.**

### Etapa 7 — Ativar V2 em Produção

| Campo | Valor |
|-------|-------|
| **Objetivo** | V2 como motor primário em produção |
| **Ação** | Definir `COGNITIVE_V2_MODE=on` no Cloudflare dashboard (env prod) |
| **Dependência** | Etapa 6 concluída com TODOS os critérios atendidos |
| **Critério de aceite** | ≥500 interações sem regressão |
| **O que NÃO alterar** | Código do worker |
| **Risco** | ALTO — afeta atendimentos reais |
| **Rollback** | `COGNITIVE_V2_MODE=off` — **rollback instantâneo** via env var |
| **Monitoramento** | Telemetria contínua (intent, confidence, safe_stage_signal) |

### Etapa 8 — Remover Legado (FUTURA — NÃO AGORA)

| Campo | Valor |
|-------|-------|
| **Objetivo** | Limpar código V1 morto após estabilização |
| **Dependência** | V2 "on" em produção estável por ≥2000 interações + zero safe_stage_signal incompatíveis |
| **Risco** | BAIXO após validação extensa |
| **O que remover** | `cognitiveAssistV1`, `COGNITIVE_PLAYBOOK_V1`, branching de flag, simplificar bloco |
| **Rollback** | Git revert |

---

## BLOCO 6 — GATE DE LIBERAÇÃO

### Já pode implementar?

**NÃO.** As alterações de código necessárias **já foram feitas** na sessão anterior. O que falta não é código — é **validação com dados reais**.

### O que falta exatamente?

1. **Aprovação formal** de que as alterações de código da sessão anterior (commit `ebad71e`) estão corretas e podem ser mergeadas
2. **Ativação de shadow em staging** (`COGNITIVE_V2_MODE=shadow` no Cloudflare dashboard)
3. **Coleta de ≥500 chamadas shadow** com dados reais
4. **Análise offline** dos dados contra critérios do Bloco 4.1
5. **Decisão baseada em dados** para avançar de shadow para "on"

### Qual é o próximo passo único e correto?

**Aprovar o merge da branch `copilot/diagnostico-migracao-cognitivo` para develop.**

Essa branch contém:
- Diagnóstico completo (documentação, zero risco)
- Alias `composicao_tipo` no adapter (1 campo adicionado, risco mínimo)
- Shadow telemetria expandida (4 campos de log, zero impacto em runtime)
- Smoke test V2 "on" (13 testes, zero impacto em produção)
- Testes adapter atualizados (1 caso adicionado)

Nada nessa branch altera o comportamento do worker em produção. O default é `COGNITIVE_V2_MODE=off`. O código V2 inteiro é inerte até que a env var seja explicitamente definida.

### Sequência completa pós-merge:

```
Merge → Shadow staging → Análise → On staging → Shadow prod → Análise → On prod → Remover legado
```

Cada transição depende de critérios mensuráveis do Bloco 4.1.
Cada transição tem rollback instantâneo via env var.
Zero código necessário entre etapas — apenas configuração no dashboard.

---

## RESUMO EXECUTIVO

| Pergunta | Resposta |
|----------|---------|
| **O plano está fechado?** | SIM — código de infraestrutura existe, testes passam, critérios definidos |
| **Falta código?** | NÃO — tudo que é código já foi feito |
| **Falta validação?** | SIM — dados reais de shadow mode |
| **Pode implementar agora?** | O código já está implementado. Falta ATIVAR (config) e VALIDAR (dados) |
| **Qual o risco do merge?** | MÍNIMO — default "off", código V2 inerte sem env var |
| **Qual o próximo passo?** | Aprovar merge → ativar shadow em staging |
| **Rollback se qualquer problema?** | `COGNITIVE_V2_MODE=off` ou remover env var — instantâneo |
