# ETAPA 5 — Consumo de Camadas Globais nos Builders (topo/docs/visita)

**Status:** Implementada (primeira PR)  
**Escopo:** Fazer os builders de topo, docs e visita consumirem FAQ, Objeções, KB e Reancoragem global.  
**Arquivo alterado:** `cognitive/src/run-cognitive.js`  
**Worker alterado:** Nenhum (mecânico intocado)

---

## Objetivo

Fazer a camada cognitiva usar de verdade as bases globais criadas nas etapas anteriores:
- FAQ canônico (Etapa 1)
- Catálogo de objeções (Etapa 2)
- Helper de reancoragem (Etapa 3)
- Knowledge base factual (Etapa 4)

Sem redesign do funil, sem mexer no mecânico, sem refatoração ampla.

---

## Blocos autorizados nesta PR

| Bloco | Stages | Global layers consumidos |
|-------|--------|--------------------------|
| **Topo** | `inicio`, `inicio_decisao`, `inicio_programa` | FAQ, Objections, KB, Reanchor |
| **Docs** | `envio_docs` (via `buildOperacionalFinalGuidance` e `buildDocsGuidanceByProfile`) | FAQ, Objections, KB, Reanchor |
| **Visita** | `agendamento_visita` (via `buildOperacionalFinalGuidance` e `buildVisitaGuidance`) | FAQ, Objections, KB, Reanchor |

---

## Blocos NÃO tocados

- composição
- renda
- gates finais
- correspondente
- restrição
- CTPS
- P3
- multi-renda/multi-regime

---

## Arquitetura da integração

### Imports adicionados
```js
import { getCanonicalFAQ } from "./faq-lookup.js";
import { getCanonicalObjection } from "./objections-lookup.js";
import { getKnowledgeBaseItem } from "./knowledge-lookup.js";
import { buildReanchor } from "./reanchor-helper.js";
```

### Mapas de intent-matching
- `_TOPO_FAQ_MAP` — mapeia padrões de topo para FAQ/Objection/KB IDs
- `_DOCS_FAQ_MAP` — mapeia padrões de docs para FAQ/Objection/KB IDs
- `_VISITA_FAQ_MAP` — mapeia padrões de visita para FAQ/Objection/KB IDs

### Helpers novos
- `resolveGlobalLayerReply(normalizedMessage, layerMap)` — resolve FAQ→Objection→KB por prioridade
- `wrapWithReanchor(reply, currentStage)` — concatena resposta + reancoragem canônica

### Fluxo de resolução
1. Identificar se é FAQ
2. Se não for FAQ, ver se é objeção
3. Se precisar de dado factual, usar KB
4. Responder com texto canônico
5. Reancorar naturalmente no stage atual
6. Manter o trilho intacto

---

## Comportamento esperado

Quando o cliente perguntar algo fora do stage atual (dentro dos 3 blocos autorizados):
- Resposta vem do catálogo canônico (FAQ, objeção ou KB)
- Resposta é mais humana e informativa
- Reancoragem natural puxa de volta ao trilho
- O mecânico continua soberano sobre stage, nextStage, gates e persistência

---

## O que foi preservado

- `step()` — intocado
- `runFunnel()` — intocado
- `nextStage` — intocado
- Gates — intocados
- Persistência — intocada
- Texto mecânico base de saudação — preservado
- Builders não autorizados — intocados

---

## Smoke tests

Arquivo: `schema/cognitive_etapa5_global_layers.smoke.mjs`  
Total: 48 testes

| Grupo | Cobertura | Testes |
|-------|-----------|--------|
| 1 | TOPO — FAQ canônico | 5 |
| 2 | TOPO — objeção canônica | 5 |
| 3 | TOPO — KB factual | 4 |
| 4 | TOPO — reancoragem | 4 |
| 5 | DOCS — segurança FAQ/objeção | 4 |
| 6 | DOCS — KB factual | 2 |
| 7 | DOCS — objeção sem docs + reanchor | 3 |
| 8 | VISITA — KB factual | 3 |
| 9 | VISITA — objeção presencial | 3 |
| 10 | VISITA — reanchor | 2 |
| 11 | REGRESSÃO — mecânico soberano | 3 |
| 12 | REGRESSÃO — nextStage intacto | 2 |
| 13 | REGRESSÃO — persistência intacta | 2 |
| 14 | REGRESSÃO — texto mecânico base intacto | 6 |

---

## O que ficou fora desta PR (propositalmente)

- Contrato de fala final global
- Precedence global ampla
- Consumo global em builders de composição/renda/gates/correspondente
- Refatoração ampla de builders
- Redesign do funil
- Mudança no runtime do worker
