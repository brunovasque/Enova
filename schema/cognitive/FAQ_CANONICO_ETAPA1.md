# FAQ Canônico Global — Etapa 1

**Status:** Concluído  
**Escopo:** Etapa 1 da reorganização cognitiva da Enova  
**Arquivos criados:**
- `cognitive/src/faq-canonico.js` — catálogo canônico
- `cognitive/src/faq-lookup.js` — helper puro de lookup
- `schema/faq_canonico_global.smoke.mjs` — smoke tests (24 testes)

---

## O que é a Etapa 1

A Etapa 1 estabelece a **camada FAQ canônica global** da Enova: um conjunto único, padronizado e versionado de respostas para as perguntas recorrentes dos leads durante o processo de financiamento imobiliário.

O objetivo é criar uma base auditável, reutilizável e estável que as próximas etapas possam consumir sem redesign — nem do catálogo nem do funil mecânico.

---

## O que entrou

### Catálogo canônico (`cognitive/src/faq-canonico.js`)

10 entradas canônicas, cada uma com:
- `id` — identificador único de lookup
- `pergunta_tipica` — exemplo da pergunta do lead
- `resposta` — resposta padronizada no tom da Enova

| id | Pergunta típica |
|----|----------------|
| `valor_sem_analise` | "quanto vou poder financiar?" |
| `seguranca_docs` | "é seguro mandar documentos por aqui?" |
| `fgts_uso` | "posso usar FGTS?" |
| `entrada_minima` | "qual a entrada mínima?" |
| `prazo_processo` | "quanto tempo demora?" |
| `simulacao_plantao` | "já dá pra simular?" |
| `imovel_escolha` | "já posso escolher o imóvel?" |
| `aprovacao_garantia` | "vou ser aprovado?" |
| `restricao_impede` | "restrição impede tudo?" |
| `composicao_obrigatoria` | "preciso compor renda?" |

### Helper de lookup (`cognitive/src/faq-lookup.js`)

```js
import { getCanonicalFAQ, listCanonicalFAQIds } from "./faq-lookup.js";

const faq = getCanonicalFAQ("restricao_impede");
// => { id, pergunta_tipica, resposta } | null
```

- `getCanonicalFAQ(faqId)` — retorna a entrada ou `null` para chave inexistente/inválida
- `listCanonicalFAQIds()` — retorna todos os IDs disponíveis

---

## O que ainda NÃO entrou

- Integração nos builders cognitivos (Etapa 2)
- Sistema de detecção automática de FAQ por intent (Etapa 2+)
- Objection handling (outra frente)
- Reancoragem cognitiva (outra frente)
- Contrato de fala final (outra frente)
- Knowledge base ampliada (outra frente)

---

## Como as próximas etapas vão consumir isso

Qualquer builder cognitivo pode importar o helper puro:

```js
import { getCanonicalFAQ } from "../src/faq-lookup.js";

// Dentro de um builder de guidance:
const faq = getCanonicalFAQ("restricao_impede");
if (faq) {
  // usa faq.resposta como reply_text ou prefixo
}
```

O catálogo é um módulo ES estático, sem dependência de banco, sem dependência de Supabase e sem qualquer chamada ao mecânico. Ele pode ser importado em qualquer contexto — builder, helper, ou até no panel — sem risco de efeito colateral.

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

Arquivo: `schema/faq_canonico_global.smoke.mjs`  
Resultado: **24/24 passed**

| Grupo | Cobertura |
|-------|-----------|
| 1 | lookup de cada um dos 10 IDs obrigatórios |
| 2 | nenhuma resposta vazia ou muito curta |
| 3 | nenhuma resposta usa "casa" em vez de "imóvel" |
| 4 | nenhuma resposta promete aprovação |
| 5 | helper retorna null para chave inexistente/inválida/vazia |
| 6 | isolamento total do mecânico (sem step/runFunnel/nextStage/Supabase) |
