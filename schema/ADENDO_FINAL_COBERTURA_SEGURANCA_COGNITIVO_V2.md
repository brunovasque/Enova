# ADENDO FINAL DE COBERTURA DE SEGURANÇA — MIGRAÇÃO COGNITIVO V1 → V2

**Data:** 2026-03-31  
**Referência:** DECISAO_PRE_IMPLEMENTACAO_COGNITIVO_V2.md  
**Escopo:** Fechamento dos últimos pontos cegos antes de merge/ativação  
**Regra:** Zero código. Apenas cobertura documental de segurança.

---

## BLOCO 1 — LIMITE EXATO DO QUE O SHADOW EM ENV TEST VALIDA

### O que shadow em env test REALMENTE valida

1. **Execução mecânica do branching:** confirma que o código em runFunnel (L19467-19494) lê `COGNITIVE_V2_MODE`, chama o motor correto, e não lança exception no caminho shadow.
2. **Formato do output do adapter:** confirma que `adaptCognitiveV2Output()` (L2206-2274) retorna os 10 campos esperados (reply_text, intent, entities, stage_signals, still_needs_original_answer, answered_customer_question, safe_stage_signal, suggested_stage, confidence, reason).
3. **Compatibilidade estrutural de safe_stage_signal:** confirma que o formato `"prefixo:valor"` (ex: `"estado_civil:casado"`) passa em `isStageSignalCompatible()` (L2122-2133).
4. **Presença dos campos de telemetria shadow:** confirma que o bloco `telemetryDetails.v2_shadow` (L19518-19527) é populado com os 9 campos de comparação.
5. **Fallback funcional:** confirma que se o motor V2 falha, `buildCognitiveFallback()` retorna fallback seguro e V1 continua respondendo normalmente.
6. **Non-interference:** confirma que em modo shadow, V1 é o primário e V2 apenas gera telemetria — o output V2 NÃO chega ao usuário final.

### O que shadow em env test NÃO valida

1. **Qualidade real das respostas V2:** env test não recebe mensagens reais de WhatsApp com linguagem coloquial, erros de digitação, emojis, áudios transcritos, ou respostas ambíguas.
2. **Distribuição de confidence V2 vs threshold 0.66:** a fórmula matemática do V2 (`base heurística + penalidades`) pode ter distribuição diferente do confidence direto do LLM (V1). Teste não gera volume suficiente para avaliar.
3. **Latência real do V2 em shadow:** env test não simula carga real. O impacto de chamar dois motores (V1 + V2) em paralelo sobre p95 de resposta só é mensurável com tráfego real.
4. **Edge cases de estado do Supabase:** env test não tem estados reais com combinações inesperadas (ex: `st.somar_renda` definido mas `st.estado_civil` null).
5. **Compatibilidade real dos entities entre V1 e V2:** V1 recebe entities como output livre do LLM (nomes arbitrários). V2 usa nomes canônicos de slot. A divergência só é visível com mensagens reais.
6. **Comportamento do `extractCompatibleStageAnswerFromCognitive()` com dados V2 reais:** o alias `composicao_tipo` (L2220-2224) resolve o caminho primário em fixtures, mas com dados reais o LLM do V2 pode produzir valores que não encaixam no normalizer.

### Conclusões que PODEM ser tiradas de env test

- A infraestrutura funciona mecanicamente.
- O branching não quebra.
- O adapter converte o formato.
- A telemetria é emitida.
- O fallback protege.

### Conclusões que NÃO PODEM ser tiradas de env test

- A qualidade da resposta V2 é aceitável.
- O confidence V2 é compatível com o threshold 0.66.
- A extração de stage answers funciona com linguagem real.
- A latência em shadow é tolerável em produção.
- O V2 detecta slots tão bem quanto V1 em runtime real.

**Regra clara:** Shadow em env test é validação de plumbing. NÃO é validação de comportamento. Comportamento só se valida com tráfego real.

---

## BLOCO 2 — O QUE AINDA PODE EXIGIR AJUSTE DE CÓDIGO DEPOIS DOS DADOS REAIS

### O que JÁ está estruturalmente pronto (não deve precisar de mudança)

| Componente | Status | Localização |
|-----------|--------|-------------|
| Feature flag `COGNITIVE_V2_MODE` (off/shadow/on) | ✅ Funcional | L19467 |
| Adapter `adaptCognitiveV2Output()` | ✅ Funcional | L2206-2274 |
| Wrapper `runCognitiveV2WithAdapter()` | ✅ Funcional | L2276-2313 |
| Fallback `buildCognitiveFallback()` | ✅ Funcional | L2185-2198 |
| Shadow telemetria (9 campos) | ✅ Funcional | L19518-19527 |
| `isStageSignalCompatible()` | ✅ Funcional | L2122-2133 |
| `extractCompatibleStageAnswerFromCognitive()` | ✅ Funcional | L2135-2183 |
| Smoke tests (4 suites, 86+ testes) | ✅ Passando | schema/*.smoke.mjs |

### O que PODE exigir ajuste depois dos dados de shadow

| Ajuste potencial | Por que | Quando seria necessário | Tipo |
|-----------------|---------|------------------------|------|
| **Threshold de confidence** | V2 calcula confidence por fórmula matemática; V1 recebe do LLM. Distribuições podem ser incompatíveis com 0.66. | Se ≥20% dos calls V2 ficarem entre 0.55-0.66 enquanto V1 fica acima de 0.66 nos mesmos cenários. | Ajuste de constante |
| **`still_needs_original_answer` derivação** | Derivado de `pendingSlots.length > 0 && confidence < 0.8`. Esse 0.8 é heurístico e pode gerar mais falso-positivo que V1. | Se V2 marcar `still_needs_original_answer=true` em >30% mais casos que V1 para os mesmos inputs. | Ajuste de heurística |
| **`answered_customer_question` derivação** | Derivado de `replyText.length > 20`. Limiar arbitrário. | Se replies curtos mas corretos forem descartados por hasUsefulCognitiveReply (L19545-19553). | Ajuste de heurística |
| **Mapeamento de entities para stages específicos** | V2 usa nomes canônicos (`composicao`), V1 usa nomes livres do LLM. O alias `composicao_tipo` resolve fixtures mas pode não cobrir todos os valores reais. | Se `extractCompatibleStageAnswerFromCognitive()` retornar null para stage `quem_pode_somar`/`interpretar_composicao` em >5% dos calls onde V1 retorna valor. | Ajuste de alias |
| **safe_stage_signal construction** | O adapter prioriza `estado_civil > composicao > renda > ir` quando múltiplos slots existem. Se V2 detectar mais slots que V1, o sinal pode não ser o mais relevante para o stage atual. | Se `isStageSignalCompatible()` retornar false em >10% dos calls onde V2 detectou slots válidos. | Ajuste de prioridade |

### Tipos de ajuste ACEITÁVEIS (sem novo diagnóstico)

- Alterar constante `COGNITIVE_V1_CONFIDENCE_MIN` (uma linha, L2002).
- Ajustar derivação de `still_needs_original_answer` no adapter (ex: mudar 0.8 para 0.7).
- Ajustar limiar de `answered_customer_question` (ex: 20 → 10 chars).
- Adicionar alias extra em entities (padrão já estabelecido em L2220-2224).
- Modificar prioridade de safe_stage_signal no adapter.

**Todos estes são ajustes de calibração dentro da estrutura existente.**

### Tipos de ajuste que EXIGEM novo diagnóstico

- Alterar o contrato de output do adapter (adicionar/remover campos).
- Mudar a lógica de branching em runFunnel (L19467-19494).
- Alterar como `step()` consome `__cognitive_reply_prefix` (L159-168).
- Expandir `COGNITIVE_V1_ALLOWED_STAGES` para incluir novos stages.
- Mudar o fluxo de `extractCompatibleStageAnswerFromCognitive()`.
- Qualquer alteração que afete o path V1/off (que é o default de produção).

**Regra clara:** Infra base pronta ≠ comportamento final garantido. Calibração pós-shadow é esperada e aceitável dentro dos limites acima.

---

## BLOCO 3 — CRITÉRIO EXATO DE LEITURA DOS LOGS DE SHADOW

### Protocolo Operacional de Análise de Shadow

#### Campos obrigatórios a ler em cada evento de telemetria

Todos os eventos `cognitive_v1_signal` com `cognitive_v2_mode: "shadow"` devem ser analisados com estes campos:

**Do V1 (primário):**
| Campo | Onde | Significado |
|-------|------|-------------|
| `confidence` | telemetryDetails.confidence | Confidence do LLM V1 |
| `intent` | telemetryDetails.intent | Intent detectado pelo V1 |
| `safe_stage_signal` | telemetryDetails.safe_stage_signal | Sinal de stage do V1 |
| `signal_compatible` | telemetryDetails.signal_compatible | Resultado de isStageSignalCompatible() no V1 |
| `still_needs_original_answer` | telemetryDetails.still_needs_original_answer | Se V1 indica que falta resposta direta |
| `answered_customer_question` | telemetryDetails.answered_customer_question | Se V1 respondeu dúvida do cliente |

**Do V2 (shadow):**
| Campo | Onde | Significado |
|-------|------|-------------|
| `v2_shadow.confidence` | telemetryDetails.v2_shadow.confidence | Confidence calculada do V2 |
| `v2_shadow.intent` | telemetryDetails.v2_shadow.intent | Intent derivado do V2 |
| `v2_shadow.reason` | telemetryDetails.v2_shadow.reason | "cognitive_v2" (LLM) ou "cognitive_v2_heuristic" |
| `v2_shadow.safe_stage_signal` | telemetryDetails.v2_shadow.safe_stage_signal | Sinal de stage do V2 |
| `v2_shadow.reply_text_length` | telemetryDetails.v2_shadow.reply_text_length | Tamanho da resposta V2 |
| `v2_shadow.still_needs_original_answer` | telemetryDetails.v2_shadow.still_needs_original_answer | Derivação V2 |
| `v2_shadow.answered_customer_question` | telemetryDetails.v2_shadow.answered_customer_question | Derivação V2 |
| `v2_shadow.reply_text_snippet` | telemetryDetails.v2_shadow.reply_text_snippet | Primeiros 80 chars da resposta V2 |
| `v2_shadow.entities_keys` | telemetryDetails.v2_shadow.entities_keys | Nomes dos slots detectados pelo V2 |

#### Comparações mandatórias

| # | Comparação | Cálculo | Significado |
|---|-----------|---------|-------------|
| 1 | **Confidence delta** | `|V1.confidence - V2.confidence|` | Divergência de confiança entre motores |
| 2 | **Signal match** | `V1.safe_stage_signal === V2.safe_stage_signal` (ou ambos null) | Os dois motores concordam no sinal de stage? |
| 3 | **Signal compatibility V2** | `isStageSignalCompatible(stage, V2.safe_stage_signal)` | O sinal V2 seria aceito pelo worker? |
| 4 | **Intent class match** | V1.intent vs V2.intent — mesmo prefixo? | Interpretação semântica concorda? |
| 5 | **Still-needs divergence** | `V1.still_needs !== V2.still_needs` | Os motores discordam sobre se o stage foi respondido? |
| 6 | **Reply length ratio** | `V2.reply_text_length / V1_reply_length` (se ambos > 0) | V2 produz respostas muito curtas ou muito longas? |
| 7 | **Entities coverage** | V2.entities_keys vs V1 entities coverage | V2 detecta mais ou menos slots? |

#### Como julgar divergência

**Divergência COSMÉTICA (aceitável, não bloqueia):**

- V1 confidence 0.82, V2 confidence 0.75 → ambos acima do threshold 0.66. Diferença na margem.
- V1 `safe_stage_signal: "estado_civil:casado"`, V2 `safe_stage_signal: "estado_civil:casado"` → idêntico.
- V1 `intent: "clarify"`, V2 `intent: "cognitive_v2_slot_detected"` → nomes diferentes mas ambos indicam detecção positiva.
- V2 reply_text 20% mais curto que V1 → variação de estilo.
- V1 `still_needs: false`, V2 `still_needs: false` → concordam.

**Divergência PERIGOSA (bloqueia avanço se acima do threshold):**

- V1 confidence > 0.66, V2 confidence < 0.50 → o motor V2 não está calibrado para este tipo de input. **Bloqueia se >10% dos calls.**
- V1 `safe_stage_signal: "estado_civil:casado"`, V2 `safe_stage_signal: null` → V2 não detectou o slot que V1 detectou. **Bloqueia se >10% dos calls onde V1 tem sinal.**
- V2 `safe_stage_signal: "renda:5000"` quando stage é `estado_civil` → `isStageSignalCompatible()` retornará false. **Bloqueia QUALQUER ocorrência — indica bug no adapter.**
- V2 reply_text_length = 0 quando V1 tem reply > 20 chars → V2 falhou silenciosamente. **Bloqueia se >1% dos calls.**
- V1 `still_needs: false` (avançaria), V2 `still_needs: true` (não avançaria) → V2 bloquearia o avanço onde V1 permite. **Bloqueia se >20% dos calls — indica heurística agressiva demais.**
- V2 `still_needs: false` (avançaria), V1 `still_needs: true` (não avançaria) → V2 tentaria avançar onde V1 não permite. **Investigar se >10% — V2 pode estar permissivo demais.**

#### Como avaliar cada campo específico

**entities:** Comparar `V2.entities_keys` com os entities extraídos do V1 (quando disponíveis). V2 deve detectar pelo menos os mesmos slots que V1 quando ambos produzem confidence > 0.66. Se V2 detecta MAIS slots, é informativo (não perigoso). Se V2 detecta MENOS, é sinal de subdetecção.

**stage_signals:** V2 produz `stage_signals` identicamente aos `entities` (ambos flat). Verificar que o campo existe e não é vazio quando V2 detectou slots.

**safe_stage_signal:** Verificar formato `"prefixo:valor"`. Validar que `isStageSignalCompatible(stage_atual, sinal)` retorna true. Se retorna false, é bug — o adapter construiu sinal com prefixo errado para o stage.

**reply_text (via snippet):** Verificar que o snippet faz sentido para o stage atual. Verificar que não contém alucinações (promessas de aprovação, valores de parcela, nomes de bancos). Comparar tom com padrão Enova (acolhedor + consultivo).

**confidence:** Plotar distribuição V2 vs V1. Verificar se V2 produz bimodal (perto de 0 ou perto de 1) vs V1. O threshold 0.66 foi calibrado para V1 — se V2 tem distribuição diferente, precisa recalibrar.

---

## BLOCO 4 — GATE FINAL DE LIBERAÇÃO PARA MERGE

### Com o estado atual, o merge PODE acontecer?

**SIM**, sob as seguintes condições explícitas:

### Condições para merge

1. **Feature flag default DEVE ser "off"** — já é (`env.COGNITIVE_V2_MODE || "off"` em L19467). Verificado.
2. **Nenhuma mudança de comportamento com flag off** — o código V2 inteiro é inerte quando `COGNITIVE_V2_MODE` está ausente ou é "off". O branching (L19472-19494) cai no `else` que executa V1 puro.
3. **Smoke tests devem estar passando** — 4 suites, 86+ testes. Verificado como passando (commit fbb11ab).
4. **Nenhuma alteração em paths existentes** — o path V1/off não foi alterado. Apenas código NOVO foi adicionado (adapter, wrapper, branching, telemetria shadow).

### Risco residual do merge com flag default off

| Risco | Severidade | Probabilidade | Mitigação |
|-------|-----------|---------------|-----------|
| **Bug latente no import/require do motor V2** | BAIXO | BAIXÍSSIMO | Motor V2 já é importado pelo admin endpoint (`/__admin__/cognitive-test`) que existe há mais tempo. Se tivesse erro de import, já teria aparecido. |
| **Aumento marginal do tamanho do bundle** | NULO | CERTO | Adapter e wrapper são ~110 linhas. Irrelevante para Cloudflare Worker de 29k+ linhas. |
| **Código morto confunde manutenção** | BAIXO | BAIXO | Documentação existe. A flag é o mecanismo padrão da Enova (mesma pattern de `OFFTRACK_AI_ENABLED`). |

### Risco que EXISTE mesmo com default off

| Risco | Explicação | Mitigação |
|-------|-----------|-----------|
| **Operador ativa shadow/on sem seguir protocolo** | Alguém configura `COGNITIVE_V2_MODE=on` em produção sem passar por shadow primeiro. | Este documento define o protocolo. Comunicar à equipe. |
| **Regressão no path V1 causada por merge adjacente** | Outro PR altera `runFunnel()` na mesma região (L19460-19570) e causa conflito silencioso. | Merge o quanto antes para reduzir janela de conflito. Review cuidadoso de qualquer conflito de merge. |
| **Motor V2 com bug não detectado por smoke tests** | Smoke tests usam fixtures. Bugs podem existir em paths não cobertos. | Shadow mode existe exatamente para isso. Nunca pular shadow. |

### Resposta honesta

O merge é seguro **porque o código é inerte com flag off**. O risco real não é o merge — é a ativação. E a ativação tem protocolo definido (shadow → análise → on) com rollback instantâneo (remover/mudar env var).

---

## BLOCO 5 — CHECKLIST ÚNICO DE PRÉ-INTEGRAÇÃO

### Fase 1: MERGE

| # | Item | Obrigatório? | Bloqueia merge? | Evidência esperada |
|---|------|-------------|-----------------|-------------------|
| 1 | Feature flag `COGNITIVE_V2_MODE` default = "off" | SIM | SIM | L19467: `env.COGNITIVE_V2_MODE \|\| "off"` |
| 2 | Smoke tests passando (4 suites) | SIM | SIM | `node schema/cognitive_v2_adapter.smoke.mjs && node schema/cognitive_v2_mode_on.smoke.mjs && node schema/cognitive_read_only_runner.smoke.mjs && node schema/cognitive_telemetry.smoke.mjs` — zero falhas |
| 3 | Nenhuma alteração no path V1/off | SIM | SIM | Code review confirma que o `else` branch (V1 puro) não foi alterado |
| 4 | Documentação de decisão completa | SIM | NÃO | DECISAO_PRE_IMPLEMENTACAO_COGNITIVO_V2.md + este adendo existem |
| 5 | Conflitos de merge resolvidos | SIM | SIM | `git merge` limpo em develop/main |

### Fase 2: SHADOW EM TEST

| # | Item | Obrigatório? | Bloqueia avanço? | Evidência esperada |
|---|------|-------------|-----------------|-------------------|
| 6 | Configurar `COGNITIVE_V2_MODE=shadow` em env test | SIM | SIM | Cloudflare dashboard |
| 7 | Confirmar que telemetria shadow é emitida | SIM | SIM | Log com campo `v2_shadow` presente em evento `cognitive_v1_signal` |
| 8 | Confirmar que V1 continua respondendo (não V2) | SIM | SIM | Verificar que `__cognitive_reply_prefix` vem do V1, não do V2 |
| 9 | Confirmar que V2 não gera exception | SIM | SIM | Zero erros de catch no log do V2 shadow |
| 10 | Confirmar que latência não degradou visivelmente | NÃO | NÃO | Observação manual — não é bloqueador em test |

### Fase 3: ON EM TEST

| # | Item | Obrigatório? | Bloqueia avanço? | Evidência esperada |
|---|------|-------------|-----------------|-------------------|
| 11 | Análise de dados shadow completada (critérios Bloco 3 deste adendo) | SIM | SIM | Relatório de análise com métricas dos 7 comparativos mandatórios |
| 12 | Nenhuma divergência PERIGOSA acima dos thresholds definidos | SIM | SIM | Evidência nas métricas do relatório |
| 13 | Configurar `COGNITIVE_V2_MODE=on` em env test | SIM | SIM | Cloudflare dashboard |
| 14 | Testar manualmente 5 conversas (1 por stage cognitivo) | SIM | SIM | Registro das 5 conversas com resultado esperado vs obtido |
| 15 | Confirmar que `extractCompatibleStageAnswerFromCognitive()` retorna valor correto | SIM | SIM | Nas 5 conversas manuais, stage avança corretamente quando esperado |
| 16 | Ajustes de calibração aplicados se necessário | NÃO | NÃO | Se dados de shadow indicaram necessidade (tipos aceitáveis do Bloco 2) |

### Fase 4: SHADOW EM PROD

| # | Item | Obrigatório? | Bloqueia avanço? | Evidência esperada |
|---|------|-------------|-----------------|-------------------|
| 17 | ON em test validado sem regressão | SIM | SIM | 5 conversas manuais OK |
| 18 | Configurar `COGNITIVE_V2_MODE=shadow` em prod | SIM | SIM | Cloudflare dashboard |
| 19 | Coletar ≥500 chamadas shadow | SIM | SIM | Contagem nos logs |
| 20 | Exception rate V2 < 0.5% | SIM | SIM | Contagem de erros / total de calls |
| 21 | safe_stage_signal compatibilidade ≥ 90% | SIM | SIM | Contagem de `isStageSignalCompatible(stage, V2.signal) === true` |
| 22 | \|confidence V1 - V2\| médio ≤ 0.25 | SIM | SIM | Média absoluta dos deltas |
| 23 | V2 reply_text vazio < 1% | SIM | SIM | Contagem de `reply_text_length === 0` |
| 24 | Todos os 5 stages representados nas amostras | SIM | SIM | Contagem por stage nas 500+ calls |
| 25 | Nenhum safe_stage_signal incompatível com isStageSignalCompatible() | SIM | SIM | Zero casos de `signal_compatible === false` quando V2 tem sinal |
| 26 | Análise de qualidade de reply_text (amostragem manual de ≥20 snippets) | SIM | SIM | Registro da amostragem com avaliação OK/NOK |

### Fase 5: ON EM PROD

| # | Item | Obrigatório? | Bloqueia avanço? | Evidência esperada |
|---|------|-------------|-----------------|-------------------|
| 27 | TODOS os critérios de shadow prod (items 19-26) atendidos | SIM | SIM | Relatório com evidências |
| 28 | Configurar `COGNITIVE_V2_MODE=on` em prod | SIM | SIM | Cloudflare dashboard |
| 29 | Monitorar primeiras 100 interações | SIM | SIM | Sem exception, sem stage preso, sem reply vazio |
| 30 | Rollback se qualquer anomalia | SIM | SIM | Reverter para `COGNITIVE_V2_MODE=off` imediatamente |
| 31 | Confirmar estabilidade por ≥500 interações | SIM | SIM | Métricas contínuas por ≥48h |
| 32 | Marcar V2 como motor principal e agendar remoção do legado V1 | NÃO | NÃO | Decisão pós-estabilização |

---

**FIM DO ADENDO. Nenhuma alteração de código foi feita.**
