# Knowledge Base Factual — Etapa 4

**Status:** Concluído  
**Escopo:** Etapa 4 da reorganização cognitiva da Enova  
**Arquivos criados:**
- `cognitive/src/knowledge-base.js` — knowledge base factual canônica
- `cognitive/src/knowledge-lookup.js` — helper puro de lookup
- `schema/knowledge_base_etapa4.smoke.mjs` — smoke tests

---

## O que é a Etapa 4

A Etapa 4 estabelece a **knowledge base factual global** da Enova: um conjunto canônico, estático e versionado de informações factuais sobre o processo de financiamento imobiliário.

O objetivo é criar uma base auditável, estruturada e estável — com chaves canônicas, pronta para ser consumida por FAQ, objection handlers, reancoragem e builders cognitivos nas etapas seguintes, sem redesign do funil mecânico.

---

## O que entrou

### Knowledge base factual (`cognitive/src/knowledge-base.js`)

10 blocos factuais canônicos, cada um com:
- `id` — identificador único de lookup
- `titulo` — título descritivo do bloco
- `conteudo` — texto factual limpo, curto, sem promessa de aprovação e sem uso de "casa"

| id | Título |
|----|--------|
| `elegibilidade_basica` | Elegibilidade Básica |
| `composicao_renda` | Composição de Renda |
| `autonomo_ir` | Autônomo e Declaração de IR |
| `ctps_36` | CTPS e 36 Meses de Registro |
| `restricao_credito` | Restrição de Crédito |
| `docs_por_perfil` | Documentos por Perfil |
| `visita_plantao` | Visita Presencial e Plantão |
| `correspondente_fluxo` | Correspondente Bancário e Fluxo |
| `simulacao_aprovacao` | Simulação e Aprovação |
| `fgts_entrada` | FGTS como Entrada |

### Helper de lookup (`cognitive/src/knowledge-lookup.js`)

```js
import { getKnowledgeBaseItem, listKnowledgeBaseIds } from "./knowledge-lookup.js";

const item = getKnowledgeBaseItem("elegibilidade_basica");
// => { id, titulo, conteudo } | null

const ids = listKnowledgeBaseIds();
// => ["elegibilidade_basica", "composicao_renda", ...]
```

- `getKnowledgeBaseItem(id)` — retorna o item ou `null` para chave inexistente/inválida
- `listKnowledgeBaseIds()` — retorna todos os IDs disponíveis na knowledge base

---

## O que ainda NÃO entrou

- Integração nos builders cognitivos (próxima etapa)
- Integração com FAQ Canônico (Etapa 1) em fluxo único
- Integração com catálogo de objeções (Etapa 2)
- Integração com helper de reancoragem (Etapa 3)
- Plug do normative-loader
- Plug da dependency engine
- Detecção automática de domínio por intent
- Contrato de fala final

---

## Como as próximas etapas vão consumir isso

Qualquer builder cognitivo pode importar o helper puro, sem dependência de banco ou Supabase:

```js
import { getKnowledgeBaseItem } from "../src/knowledge-lookup.js";

// Dentro de um builder de guidance ou objection handler:
const item = getKnowledgeBaseItem("restricao_credito");
if (item) {
  // usa item.conteudo como base factual para o reply
}
```

O módulo é um ES module estático. Pode ser importado em qualquer contexto — builder, helper ou panel — sem risco de efeito colateral no mecânico.

---

## O que foi preservado

- `step()` — intocado
- `runFunnel()` — intocado
- `nextStage` — intocado
- Gates — intocados
- Persistência — intocada
- Textos mecânicos — intocados
- Nenhum comportamento de runtime foi alterado

---

## Smoke tests

Arquivo: `schema/knowledge_base_etapa4.smoke.mjs`

| Grupo | Cobertura |
|-------|-----------|
| 1 | lookup de cada um dos 10 IDs mínimos obrigatórios |
| 2 | nenhum conteúdo vazio (titulo, conteudo) |
| 3 | nenhum conteúdo usa "casa" em vez de "imóvel" |
| 4 | nenhum conteúdo promete aprovação |
| 5 | helper retorna null para chave inexistente/inválida/vazia/null/tipo errado |
| 6 | isolamento total do mecânico (sem step/runFunnel/nextStage/Supabase; worker não importado) |
| 7 | KB tem exatamente os 10 blocos mínimos obrigatórios; KNOWLEDGE_BASE frozen; schema correto |
