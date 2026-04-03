# ETAPA 7 — Ajuste de Precedência & Prioridade da Camada Cognitiva

**Status:** Concluída  
**Blocos ativos:** topo · docs · visita  
**Módulo novo:** `cognitive/src/precedence-policy.js`

---

## O que é a Etapa 7

A Etapa 7 organiza a ordem de decisão das camadas cognitivas já criadas nas etapas anteriores (FAQ, objeções, knowledge base, reancoragem, guidance local), de modo que a Enova responda a coisa certa no momento certo.

Antes da Etapa 7, a prioridade era fixa (FAQ → Objeção → KB) independentemente do contexto da mensagem. Agora a prioridade é dinâmica, ajustando-se ao sinal dominante da mensagem.

---

## Política de precedência definida

A ordem de resolução é:

| Prioridade | Camada | Quando ativa |
|---|---|---|
| 1 | **Guidance local** (stage context) | Mensagem claramente sobre a tarefa do stage atual (cooperando, confirmando, prosseguindo) |
| 2 | **Objeção** | Sinal emocional/resistência dominante (medo, receio, vou pensar, não confio, etc.) |
| 3 | **FAQ** | Pergunta informacional clara, sem sinal emocional |
| 4 | **KB** | Dado factual necessário quando FAQ e objeção não são o melhor caminho |
| 5 | **Reancoragem** | Sempre aplicada em respostas da camada global (para voltar ao stage) |
| 6 | **Contrato de fala final** | Sempre aplicado por último (Etapa 6, não alterada) |

### Comportamento chave

- **Guidance local NÃO é esmagado por FAQ genérico**: se a mensagem é cooperativa ("bora", "vamos lá", "rapidinho"), a camada global NÃO intercepta.
- **Objeção ganha prioridade sobre FAQ quando o sinal é emocional**: "tenho medo de mandar dados" → objeção; "é seguro mandar docs?" → FAQ.
- **KB é usado quando nenhuma das camadas acima é o melhor caminho**, especialmente para perguntas factuais.

---

## Onde foi integrada

### Novo módulo: `cognitive/src/precedence-policy.js`

Exporta:
- `resolveWithPrecedence(normalizedMessage, layerMap, phase)` — resolver com precedência dinâmica
- `isStageContextMessage(normalizedMessage, phase)` — guarda de contexto do stage
- `hasObjectionSignal(normalizedMessage)` — detecção de sinal emocional
- `PRECEDENCE` — enum de labels de precedência
- Padrões regex exportados para teste

### Integração em `cognitive/src/run-cognitive.js`

Substituídas 5 chamadas de `resolveGlobalLayerReply` por `resolveWithPrecedence`:
- 3 chamadas em `buildTopoFunilGuidance` (inicio, inicio_decisao, inicio_programa)
- 1 chamada em `buildDocsGuidanceByProfile`
- 1 chamada em `buildVisitaGuidance`

A função original `resolveGlobalLayerReply` permanece intacta para uso em `buildOperacionalFinalGuidance` (fora do escopo da Etapa 7).

---

## Blocos cobertos

| Bloco | Builders ajustados |
|---|---|
| Topo | `buildTopoFunilGuidance` (inicio, inicio_decisao, inicio_programa) |
| Docs | `buildDocsGuidanceByProfile` |
| Visita | `buildVisitaGuidance` |

---

## O que NÃO entrou nesta etapa

- Composição, renda, gates finais, correspondente, restrição, CTPS, P3, multi-renda/multi-regime
- Bloco operacional final (continua usando `resolveGlobalLayerReply`)
- Refatoração do mecânico (step, runFunnel, nextStage, gates, persistência)
- Redesign do funil
- Mudança de runtime
- Novas tabelas/colunas/SQL

---

## Smoke tests

48 testes em `schema/cognitive_etapa7_precedence.smoke.mjs`:

- TOPO (1-5): FAQ puro, objeção pura, KB factual, stage context guard, reancoragem
- DOCS (6-9): precedência FAQ/objeção, KB factual, objeção "sem docs", stage context guard
- VISITA (10-13): KB horários/local, objeção presencial, FAQ imóvel, stage context guard
- REGRESSÃO (14-18): contrato de fala final, mecânico soberano, nextStage, persistência, texto base

Etapa 5 (48 testes) e Etapa 6 (64 testes) continuam passando sem regressão.

---

## Rollback

```bash
git revert <commit-hash>
```

Nenhuma mudança de banco, SQL, tabela ou coluna. Rollback é puramente de código.
