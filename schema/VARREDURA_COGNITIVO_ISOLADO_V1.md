# VARREDURA COGNITIVO ISOLADO — READ-ONLY DEEP SCAN

**WORKFLOW_ACK: ok**

**Data:** 2026-04-01  
**Branch:** copilot/scan-isolated-cognitive  
**Escopo:** Cognitivo isolado (`cognitive/src/run-cognitive.js`) — varredura fiel ao código atual  
**Mecânico:** NÃO tocado  
**Patch:** NÃO feito  

---

## 1. COBERTURA JÁ EXISTENTE NO COGNITIVO ISOLADO

### 1.1 — DOCS

| Sub-bloco | Arquivo / Função | Anchor | Status |
|-----------|-----------------|--------|--------|
| Pedido inteligente de docs por perfil (CLT, autônomo+IR, autônomo-IR, servidor, aposentado) | `run-cognitive.js` → `buildDocsGuidanceByProfile()` | L462–584 | **fechado** |
| Holerite variável vs. fixo (3 vs. 1 holerite) | `buildDocsGuidanceByProfile()` — `holeriteVariavel` + `asksHoleriteQuantity` | L476–558 | **fechado** |
| Docs de composição (parceiro, familiar, p3) | `buildDocsGuidanceByProfile()` — blocos composicao/familiarSlot/p3 | L497–508 | **fechado** |
| Autônomo sem IR: 6 extratos + nota de prazo de declaração | `buildDocsGuidanceByProfile()` — branch `autonomo + irDeclarado=nao` | L483–489, L564–568 | **fechado** |
| Multi renda + multi regime | `buildDocsGuidanceByProfile()` — `multiRenda`, `multiRegime`, renda abaixo/acima de 2550 | L517–534 | **fechado** |
| Detecção de contexto docs | `isDocsContext()` | L361–365 | **fechado** |
| Dúvida holerite: pergunta respondida automaticamente | `doubtNote` em `buildDocsGuidanceByProfile()` | L551–562 | **fechado** |
| Empatia / medo no docs | `FEAR_PATTERN` → `empathyNote` em `buildDocsGuidanceByProfile()` | L571–573 | **fechado** |
| Preferência por site vs. presencial | `channelNote` em `buildDocsGuidanceByProfile()` | L544–549 | **fechado** |
| Dúvida sobre comprovante de residência | `buildDocsGuidanceByProfile()` — `DOCS_HINT_PATTERN` + comprovante regex | L540–542 | **fechado** |
| Dúvida sobre RG/CNH/CPF | `buildDocsGuidanceByProfile()` — `/\brg\b|\bcnh\b|\bcpf\b/` | L537–539 | **fechado** |
| Fixtures docs (11 casos) | `fixtures/read-only-cases.js` — IDs docs* | 11 fixtures | **fechado** |

**Parcial / Faltante:**

| Sub-bloco | Status | Nota |
|-----------|--------|------|
| Reconhecimento de documento fora de ordem (doc recebido antes da hora canônica) | **não existe** | Cognitivo não tem lógica para detectar/reclassificar doc OOO |
| Loop burro: confirmação de tipo quando não reconhece | **não existe** | Não há branch para "não entendi esse documento, pode confirmar o tipo?" |
| Leitura por participante (doc titular vs. doc parceiro vs. doc familiar separados) | **parcial** | `buildDocsGuidanceByProfile()` lista docs por composição mas não diferencia "já mandou o do titular mas falta o do parceiro" |
| PJ / MEI como regime de trabalho | **não existe** | Sem `detectRegime()` para MEI; regime detectado = CLT / autônomo / servidor / aposentado |
| Regras de docs MEI (contrato social + DAS + certidão negativa) | **não existe** | Nenhum branch MEI em `buildDocsGuidanceByProfile()` |

---

### 1.2 — CORRESPONDENTE

| Sub-bloco | Arquivo / Função | Anchor | Status |
|-----------|-----------------|--------|--------|
| "Ainda sem retorno" + cliente ansioso → segura expectativa | `buildCorrespondenteGuidance()` — branch `!approved` | L594–596 | **fechado** |
| Aprovado + insistência em detalhes financeiros → recusa educada | `buildCorrespondenteGuidance()` — branch `approved + insistsFinancial` | L597–600 | **fechado** |
| Aprovado genérico → encaminha para plantão | `buildCorrespondenteGuidance()` — branch `approved` default | L601–603 | **fechado** |
| Detecção de contexto correspondente | `isCorrespondenteContext()` | L367–370 | **fechado** |
| Detecção de aprovação no slot | `hasApprovedCorrespondenteStatus()` | L357–360 | **fechado** |
| Fixtures correspondente (2 casos) | `fixtures/read-only-cases.js` — "Correspondente sem retorno…", "Correspondente aprovado…" | 2 fixtures | **fechado** |

**Parcial / Faltante:**

| Sub-bloco | Status | Nota |
|-----------|--------|------|
| Reprovação pelo correspondente (diferente de restrição BACEN/SCR) | **não existe** | `buildCorrespondenteGuidance()` só trata `!approved` como "ainda sem retorno" — não distingue "aprovado", "em análise", "reprovado pelo correspondente" |
| Documentação adicional requisitada pelo correspondente | **não existe** | Não há orientação cognitiva quando correspondente pede doc complementar |
| Sinalização de documentação pendente pós-análise | **não existe** | Sem ramo "banco pediu mais um doc" |

---

### 1.3 — VISITA

| Sub-bloco | Arquivo / Função | Anchor | Status |
|-----------|-----------------|--------|--------|
| Pedido de remarcação / reagendamento | `buildVisitaGuidance()` — `VISITA_RESCHEDULE_PATTERN` | L617–619 | **fechado** |
| Resistência à visita / "por que visitar?" | `buildVisitaGuidance()` — `VISITA_RESIST_PATTERN` | L620–622 | **fechado** |
| Pergunta sobre horário/dia | `buildVisitaGuidance()` — `/hor[aá]rio|dia|quando/` | L623–625 | **fechado** |
| Expectativa de escolher imóvel / unidade | `buildVisitaGuidance()` — `/escolher im[oó]vel|unidade.../` | L626–628 | **fechado** |
| Aceite de visita | `buildVisitaGuidance()` — `VISITA_ACCEPT_PATTERN` | L629–631 | **fechado** |
| Recusa de envio online + múltiplas tentativas → convida para plantão | `buildVisitaGuidance()` — `recusouOnline + followupAttempts >= 2` | L613–615 | **fechado** |
| Visita default / genérico | `buildVisitaGuidance()` — fallback | L633 | **fechado** |
| Exigência de decisores presentes | `buildNextActionPrompt()` / `buildVisitaGuidance()` | L613–615 | **parcial** |
| Conversão de aluguel → financiamento | `buildAluguelGuidance()` | L636–638 | **fechado** |
| Detecção de contexto visita | `isVisitaContext()` | L373–378 | **fechado** |
| Fixtures visita (4 casos) | `fixtures/read-only-cases.js` — "Visita com pedido…", "Visita com resistência…", "Visita por falta de envio…", "Visita com exigência…" | 4 fixtures | **fechado** |

**Parcial / Faltante:**

| Sub-bloco | Status | Nota |
|-----------|--------|------|
| Condução completa pós-visita (resultado, fechamento, próximo passo) | **não existe** | O cognitivo cobre só até o convite/agendamento. Pós-visita (lead fechado, proposta enviada, etc.) sem cobertura cognitiva |
| Confirmação de presença de decisores (captura estruturada) | **parcial** | Texto trata mas não extrai como slot persistível |
| Visita já confirmada + cliente com dúvida | **parcial** | `VISITA_STAGE_PATTERN` inclui `visita_confirmada` mas sem orientação específica para esse stage |

---

### 1.4 — AUTÔNOMO

| Sub-bloco | Arquivo / Função | Anchor | Status |
|-----------|-----------------|--------|--------|
| Autônomo com IR — renda < 3000 → composição recomendada | `buildAutonomoGuidance()` | L648–651 | **fechado** |
| Autônomo com IR — renda >= 3000 → renda formal ok | `buildAutonomoGuidance()` | L652 | **fechado** |
| Autônomo sem IR — prazo 29/05 + composição | `buildAutonomoGuidance()` | L655–661 | **fechado** |
| Docs autônomo+IR: declaração + recibo | `buildDocsGuidanceByProfile()` — branch `autonomo + irDeclarado=sim` | L484–487 | **fechado** |
| Docs autônomo-IR: 6 extratos + nota complementar | `buildDocsGuidanceByProfile()` — branch `autonomo + irDeclarado=nao` | L488–490 | **fechado** |
| Detecção de contexto autônomo | `isAutonomoContext()` | L384–389 | **fechado** |
| Detecção de regime (CLT/autônomo/servidor/aposentado) | `detectRegime()` | L266–273 | **fechado** |
| Detecção de IR (sim/não) | `detectIr()` | L275–283 | **fechado** |
| Fixtures autônomo (4 casos + 2 de docs) | `fixtures/read-only-cases.js` | 6 fixtures | **fechado** |

**Parcial / Faltante:**

| Sub-bloco | Status | Nota |
|-----------|--------|------|
| PJ / MEI como categoria separada de autônomo | **não existe** | `detectRegime()` retorna "autonomo" para tudo que não é CLT/servidor/aposentado; MEI não tem branch próprio |
| Docs MEI (contrato social + DAS + certidão negativa) | **não existe** | Sem branch em `buildDocsGuidanceByProfile()` |
| "Intenção de declarar IR antes do plantão" (orientação proativa) | **parcial** | Prazo genérico 29/05 existe mas não há ramo "cliente disse que vai declarar — orientar próximo passo" |
| Autônomo sem IR sem intenção de declarar → composição como único caminho | **parcial** | Texto menciona composição mas sem captura de slot `intenção_declarar` |

---

### 1.5 — ESTADO CIVIL / COMPOSIÇÃO

| Sub-bloco | Arquivo / Função | Anchor | Status |
|-----------|-----------------|--------|--------|
| "Mora junto" sem UE → pode seguir solo ou em conjunto | `buildEstadoCivilComposicaoGuidance()` | L709–715 | **fechado** |
| "Mora junto" ambíguo (sem declaração explícita de UE) | `buildEstadoCivilComposicaoGuidance()` | L713–715 | **fechado** |
| União estável explícita → sem reclassificação automática | `buildEstadoCivilComposicaoGuidance()` | L717–719 | **fechado** |
| Casado civil → processo sempre em conjunto | `buildEstadoCivilComposicaoGuidance()` | L721–726 | **fechado** |
| Casado civil + restrição → não impede avaliação | `buildEstadoCivilComposicaoGuidance()` | L722–724 | **fechado** |
| Detecção de estado civil (solteiro/casado/UE) | `detectEstadoCivil()` | L258–264 | **fechado** |
| Detecção de composição (solo/parceiro/familiar) | `detectComposicao()` | L285–294 | **fechado** |
| Detecção de familiar (mãe/pai/irmão/avô/tio/prima) | `detectFamiliar()` | L296–309 | **fechado** |
| Detecção de P3 (terceira pessoa) | `detectP3()` | L311–316 | **fechado** |
| Slots com dependências (contrato canônico) | `COGNITIVE_SLOT_CONTRACT` | L116–152 | **fechado** |
| Fixtures estado civil/composição (9 casos) | `fixtures/read-only-cases.js` | 9 fixtures | **fechado** |

**Parcial / Faltante:**

| Sub-bloco | Status | Nota |
|-----------|--------|------|
| `parceiro_p2` como entidade separada com cobertura dedicada | **parcial** | Slot existe no `COGNITIVE_CONTRACT_V1` e `SLOT_CATALOG_V1.json` mas `buildEstadoCivilComposicaoGuidance()` não tem branch para "parceiro P2 com restrição/conflito específico" |
| Solteiro com UE informal ("moramos juntos, ela tem outro processo") | **parcial** | `SEM_UNIAO_ESTAVEL_PATTERN` cobre o caso mas reply é genérico; sem orientação sobre "outro processo do parceiro" |

---

### 1.6 — REPROVAÇÃO / RESTRIÇÃO

| Sub-bloco | Arquivo / Função | Anchor | Status |
|-----------|-----------------|--------|--------|
| SCR/BACEN → Registrato + extratos 6 meses | `buildReprovacaoGuidance()` | L687–689 | **fechado** |
| SINAD/CONRES → agência Caixa + gerente PF | `buildReprovacaoGuidance()` | L690–692 | **fechado** |
| Comprometimento de renda → regra 30% da Caixa | `buildReprovacaoGuidance()` | L693–695 | **fechado** |
| Reprovação genérica → explica motivo sem expor valores | `buildReprovacaoGuidance()` | L696–698 | **fechado** |
| Detecção de contexto reprovação | `isReprovacaoContext()` | L403–407 | **fechado** |
| Fixtures reprovação (3 casos) | `fixtures/read-only-cases.js` | 3 fixtures | **fechado** |

**Parcial / Faltante:**

| Sub-bloco | Status | Nota |
|-----------|--------|------|
| Reprovação pelo correspondente (sem restrição BACEN — simplesmente não aprovado pelo banco) | **não existe** | `buildReprovacaoGuidance()` cobre restrições ativas no cadastro, não a recusa do banco após análise de correspondente |
| Orientação de "como limpar restrição antes do plantão" (passo a passo) | **parcial** | Orienta para Registrato/agência mas sem fluxo de acompanhamento |
| Restrição + composição como saída alternativa | **não existe** | Não há branch cognitivo para "tem restrição mas pode compor com alguém sem restrição" |

---

### 1.7 — DOSSIÊ / CORRESPONDENTE / FOLLOW-UP

| Sub-bloco | Arquivo / Função | Anchor | Status |
|-----------|-----------------|--------|--------|
| Sinalização de dependência docs→correspondente→visita | `COGNITIVE_SLOT_DEPENDENCIES` | L73–82 | **fechado** (grafo documental) |
| Follow-up passivo: "sigo acompanhando, aviso quando tiver retorno" | `SLOT_ACTION_PROMPTS.correspondente` | L113 | **fechado** |
| Proteção contra expectativa prematura de aprovação | `buildCorrespondenteGuidance()` — `!approved` branch | L594–596 | **fechado** |
| Proteção contra divulgação de detalhes financeiros | `buildCorrespondenteGuidance()` — `insistsFinancial` branch | L597–600 | **fechado** |

**Parcial / Faltante:**

| Sub-bloco | Status | Nota |
|-----------|--------|------|
| Enriquecimento de perfil pré-correspondente (score estimado, faixa de renda consolidada, composição final) | **não existe** | Cognitivo não gera um "snapshot de perfil" para o dossiê antes de enviar ao correspondente |
| Follow-up cognitivo pós-visita (decidiu? próximo passo? data proposta?) | **não existe** | Sem cobertura cognitiva para o pós-visita no dossiê |
| Sinalização de "documentação adicional pedida pelo banco" | **não existe** | Sem orientação cognitiva quando banco pede complemento durante análise |

---

## 2. LACUNAS REAIS AINDA ABERTAS

| Bloco | O que falta exatamente | Impacto | Prioridade |
|-------|----------------------|---------|------------|
| **Autônomo / MEI** | `detectRegime()` não distingue MEI de autônomo puro; sem docs CEF para MEI (contrato social, DAS, certidão negativa) | Cliente MEI recebe orientação de autônomo simples — erro de orientação | **alta** |
| **Reprovação pelo correspondente** | `buildCorrespondenteGuidance()` só trata "ainda sem retorno" vs. "aprovado" — sem ramo "banco reprovou" | Sem orientação cognitiva para o caso mais crítico do pós-correspondente | **alta** |
| **Documento fora de ordem** | Nenhuma lógica de detecção/orientação para doc recebido antes do stage correto | Loop ou silêncio quando cliente manda doc num momento indevido | **média** |
| **Restrição + composição como saída** | `buildReprovacaoGuidance()` não orienta "compor com alguém sem restrição como alternativa" | Oportunidade perdida de conduzir caso com restrição | **média** |
| **parceiro_p2 dedicado** | Sem guidance específica para parceiro P2 com situação particular (restrição, renda, docs) | Orientação genérica de composição para caso que merecia tratamento dedicado | **média** |
| **Pós-visita / dossiê** | Sem cobertura cognitiva para follow-up pós-visita e captura de sinais de decisão | Fim da trilha cognitiva antes do fechamento real | **média** |
| **Loop burro / confirmação de tipo de doc** | Sem branch "não reconheci esse documento, pode confirmar o tipo?" | Silêncio ou resposta genérica quando cliente manda doc desconhecido | **baixa** |
| **Leitura por participante (docs por pessoa)** | `buildDocsGuidanceByProfile()` lista tudo junto, não diferencia "doc do titular já tem, falta o do parceiro" | Orientação menos precisa no loop de coleta | **baixa** |
| **Intenção de declarar IR (captura de slot)** | Prazo 29/05 existe mas sem slot `intencao_declarar` capturável | Não persiste decisão do cliente para guiar próximo passo | **baixa** |

---

## 3. O QUE NÃO DEVE SER REABERTO AGORA

| Item | Por quê |
|------|---------|
| Fluxo mecânico até `envio_docs` | Fechado e validado. O cognitivo não toca aqui. |
| Pós-`envio_docs` mecânico (correspondente/dossiê/visita mecânica) | Funcional em produção. Cognitivo é camada conversacional, não mecânica. |
| Feature flag `COGNITIVE_V2_MODE` (off/shadow/on) | Já implementada em `worker.js` L19484. Não reabrir. |
| `adaptCognitiveV2Output()` + `runCognitiveV2WithAdapter()` | Já implementadas em `worker.js` L2213 + L2283. Smoke tests passando (18+13 casos). Não reabrir. |
| Shadow telemetria (9 campos de comparação V1 vs V2) | Já implementada em `worker.js` L19518–19527. Não reabrir. |
| Smoke tests (4 suites: adapter, mode_on, read_only_runner, telemetry) | Todos passando. Não reabrir. |
| `cognitiveAssistV1` (V1 legado no worker) | Legado transitório, default `"off"`. Não reabrir antes de shadow completo. |
| Matriz de state civil (parseEstadoCivil, confirmar_casamento, etc.) | Fechada mecanicamente com PR#420/#419. Não reabrir no cognitivo. |
| `COGNITIVE_SLOT_CONTRACT` / `COGNITIVE_SLOT_DEPENDENCIES` | Contratos documentais fechados. Não alterar sem diagnóstico. |

---

## 4. PRÓXIMA ORDEM RECOMENDADA (COGNITIVO ISOLADO)

Sequência estritamente dentro do cognitivo isolado, sem tocar mecânico:

1. **[ALTA] MEI como regime separado**  
   - Adicionar `"mei"` em `detectRegime()` com regex para "MEI", "microempreendedor", "CNPJ"  
   - Adicionar branch MEI em `buildDocsGuidanceByProfile()` (contrato social + DAS + certidão negativa)  
   - Adicionar 2–3 fixtures MEI  

2. **[ALTA] Reprovação pelo correspondente**  
   - Adicionar estado `"reprovado"` em `hasApprovedCorrespondenteStatus()` e `buildCorrespondenteGuidance()`  
   - Orientação cognitiva: "Infelizmente houve reprovação. O próximo passo é [regularizar restrição / compor renda / aguardar orientação do corretor]."  
   - Adicionar 1–2 fixtures  

3. **[MÉDIA] Restrição + composição como saída alternativa**  
   - Em `buildReprovacaoGuidance()`, adicionar branch: quando há restrição isolada do titular, sugerir composição com co-participante sem restrição  

4. **[MÉDIA] parceiro_p2 dedicado**  
   - Adicionar guidance específica para `parceiro_p2` em `buildEstadoCivilComposicaoGuidance()` ou função nova  
   - Cobrir: parceiro com restrição, parceiro sem renda formal, parceiro com IR  

5. **[MÉDIA] Pós-visita cognitivo**  
   - Adicionar stage `"finalizacao_processo"` em `buildVisitaGuidance()` (já está em `VISITA_STAGE_PATTERN` mas sem orientação específica)  
   - Orientação: fechamento, proposta, próximo passo operacional  

6. **[BAIXA] Doc fora de ordem / loop de confirmação**  
   - Lógica de detecção simples no cognitivo: se stage não é `envio_docs` mas mensagem contém DOCS_HINT_PATTERN → orientação específica  

**Sem mexer no mecânico já validado. Sem alterar feature flag, adapter ou shadow.**

---

## 5. PR / BRANCH / COMMIT

| Campo | Valor |
|-------|-------|
| **PR** | a ser atualizado com o commit deste documento |
| **Branch** | `copilot/scan-isolated-cognitive` |
| **Rollback** | `git revert <hash>` — documento apenas, zero impacto funcional |
| **Smoke tests** | N/A (varredura read-only, zero alteração de código) |
| **Tabelas lidas** | nenhuma |
| **Tabelas escritas** | nenhuma |
| **Nova tabela/coluna** | não |
| **Ação manual Supabase** | não |
| **Mudança de contrato/schema** | não |
