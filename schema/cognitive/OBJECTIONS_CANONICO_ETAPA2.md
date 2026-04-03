# Catálogo Canônico de Objeções — Etapa 2

**Status:** Concluído  
**Escopo:** Etapa 2 da reorganização cognitiva da Enova  
**Arquivos criados:**
- `cognitive/src/objections-canonico.js` — catálogo canônico
- `cognitive/src/objections-lookup.js` — helper puro de lookup
- `schema/objections_canonico.smoke.mjs` — smoke tests (32 testes)

---

## O que é a Etapa 2

A Etapa 2 estabelece a **camada de objeções canônicas global** da Enova: um conjunto único, padronizado e versionado de respostas para as objeções recorrentes dos leads durante o processo de financiamento imobiliário.

O objetivo é criar uma base auditável, reutilizável e estável — pronta para ser consumida pelas próximas etapas sem redesign do funil mecânico.

---

## O que entrou

### Catálogo canônico (`cognitive/src/objections-canonico.js`)

10 entradas canônicas, cada uma com:
- `id` — identificador único de lookup
- `frase_tipica` — exemplo da objeção do lead
- `resposta_canonica` — resposta padronizada no tom da Enova
- `variantes_tom` — ao menos 2 alternativas curtas de tom

| id | Frase típica |
|----|--------------|
| `medo_golpe` | "tenho medo de golpe, isso é confiável?" |
| `sem_tempo` | "agora não dá, tô sem tempo" |
| `presencial_preferido` | "prefiro ir presencialmente, quero no plantão" |
| `vou_pensar` | "vou pensar, depois eu vejo" |
| `ja_fiz_em_outro_lugar` | "já fiz com outro corretor, já tô vendo em outro lugar" |
| `vergonha_renda` | "tenho vergonha de falar da renda" |
| `medo_reprovacao` | "tenho medo de ser reprovado" |
| `nao_quero_online` | "não quero fazer online" |
| `sem_documentos_agora` | "não tô com os documentos agora" |
| `duvida_seguranca_dados` | "meus dados ficam seguros?" |

### Helper de lookup (`cognitive/src/objections-lookup.js`)

```js
import {
  getCanonicalObjection,
  listCanonicalObjectionIds,
  getCanonicalObjectionVariant
} from "./objections-lookup.js";

const obj = getCanonicalObjection("medo_golpe");
// => { id, frase_tipica, resposta_canonica, variantes_tom } | null

const ids = listCanonicalObjectionIds();
// => ["medo_golpe", "sem_tempo", ...]

const variante = getCanonicalObjectionVariant("medo_golpe", 1);
// => string | null  (segunda variante de tom)
```

- `getCanonicalObjection(id)` — retorna a entrada ou `null` para chave inexistente/inválida
- `listCanonicalObjectionIds()` — retorna todos os IDs disponíveis
- `getCanonicalObjectionVariant(id, variantIndex?)` — retorna a variante de tom pelo índice (padrão 0); `null` para chave inexistente

---

## O que ainda NÃO entrou

- Integração nos builders cognitivos (próxima etapa)
- Detecção automática de objeção por intent (próxima etapa)
- Reancoragem cognitiva (outra frente)
- Contrato de fala final (outra frente)
- Knowledge base ampliada (outra frente)
- Integração com a Etapa 1 (FAQ Canônico) em fluxo único

---

## Como as próximas etapas vão consumir isso

Qualquer builder cognitivo pode importar o helper puro, sem dependência de banco ou Supabase:

```js
import { getCanonicalObjection } from "../src/objections-lookup.js";

// Dentro de um builder de guidance:
const obj = getCanonicalObjection("medo_golpe");
if (obj) {
  // usa obj.resposta_canonica como reply_text
  // ou obj.variantes_tom[0] para variação de tom
}
```

O catálogo é um módulo ES estático. Pode ser importado em qualquer contexto — builder, helper, ou panel — sem risco de efeito colateral no mecânico.

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

Arquivo: `schema/objections_canonico.smoke.mjs`

| Grupo | Cobertura |
|-------|-----------|
| 1 | lookup de cada um dos 10 IDs obrigatórios |
| 2 | nenhuma resposta vazia (resposta_canonica, frase_tipica, variantes_tom) |
| 3 | cada objeção tem ao menos 2 variantes de tom; getCanonicalObjectionVariant funciona |
| 4 | nenhuma resposta usa "casa" em vez de "imóvel" |
| 5 | nenhuma resposta promete aprovação |
| 6 | helper retorna null para chave inexistente/inválida/vazia/null |
| 7 | isolamento total do mecânico (sem step/runFunnel/nextStage/Supabase no worker) |
