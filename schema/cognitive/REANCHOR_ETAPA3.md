# Helper Global de Reancoragem — Etapa 3

**Status:** Concluído  
**Escopo:** Etapa 3 da reorganização cognitiva da Enova  
**Arquivos criados:**
- `cognitive/src/reanchor-variants.js` — catálogo canônico de variantes por fase
- `cognitive/src/reanchor-helper.js` — helper puro de construção de reancoragem
- `schema/reanchor_etapa3.smoke.mjs` — smoke tests (37 testes)

**Arquivos modificados:**
- `Enova worker.js` — integração mínima: 3 pontos de reancoragem hardcoded substituídos

---

## O que é a Etapa 3

A Etapa 3 estabelece a **camada global de reancoragem** da Enova: um conjunto padronizado de variantes de bridge por fase do funil, junto com um helper puro que monta a mensagem de reancoragem completa.

O objetivo é eliminar as frases repetitivas e mecânicas do offtrack guard, substituindo-as por variantes naturais e contextuais — sem quebrar o funil, sem tocar no mecânico, sem alterar nenhuma regra de negócio.

---

## O que entrou

### Catálogo canônico (`cognitive/src/reanchor-variants.js`)

4 fases × 4 variantes de bridge + frase fixa de pull-back:

| Fase | Intenção |
|------|----------|
| `topo` | "Já já eu te explico melhor, mas pra eu te orientar certo preciso fechar essa informação primeiro." |
| `meio` | "Pra eu não te direcionar errado, só preciso confirmar esse ponto antes de responder." |
| `gates_finais` | "Pra te dar uma resposta segura nessa etapa, preciso que a gente feche isso primeiro." |
| `operacional` | "Pra gente avançar sem travar seu processo, só preciso fechar essa etapa com você." |

**Exportações:**
- `REANCHOR_VARIANTS` — objeto com arrays por fase (imutável)
- `REANCHOR_PULL_BACK` — frase fixa de retorno ao stage: `"Me responde só a pergunta anterior, tá? 🙏"`

### Helper puro (`cognitive/src/reanchor-helper.js`)

```js
import { buildReanchor, getReanchorVariants, stageToPhase } from "./reanchor-helper.js";

// Uso básico (fase derivada do stage)
const result = buildReanchor({ currentStage: "renda_trabalho" });
// => { text: "Pra eu não te direcionar errado...\nMe responde só a pergunta anterior, tá? 🙏",
//      lines: ["Pra eu não te direcionar errado...", "Me responde só a pergunta anterior, tá? 🙏"] }

// Uso com fase explícita
const result = buildReanchor({ phase: "gates_finais", variantIndex: 0 });

// Uso com resposta parcial (partialReply prefixado à bridge phrase)
const result = buildReanchor({ partialReply: "Entendido.", phase: "topo", variantIndex: 0 });
// => lines[0] = "Entendido. Já já eu te explico melhor..."

// Lookup direto de variantes
const variants = getReanchorVariants("operacional"); // readonly string[]

// Derivação de fase por stage
const phase = stageToPhase("ctps_36"); // => "gates_finais"
const phase = stageToPhase("envio_docs"); // => "operacional"
const phase = stageToPhase("renda_trabalho"); // => "meio"
const phase = stageToPhase("inicio"); // => "topo"
```

**API pública:**
- `buildReanchor({ partialReply?, currentStage?, phase?, variantIndex? })` → `{ text: string, lines: string[] }`
  - `text` — string única para `sendMessage` direto
  - `lines` — array para `step()` multi-message
  - Seleciona variante aleatória por padrão; determinística se `variantIndex` for fornecido
- `getReanchorVariants(phase)` → `readonly string[]` (fallback para `topo` se fase inválida)
- `stageToPhase(stage)` → `'topo' | 'meio' | 'gates_finais' | 'operacional'`

---

## Onde foi integrada

A integração ocorreu em **3 pontos do `Enova worker.js`** onde existiam frases hardcoded de reancoragem:

### 1. Offtrack guard externo (`handleMetaWebhook`)
Roda antes de chamar `runFunnel()`. Usava uma string hardcoded dupla, substituída por:
```js
const msg = buildReanchor({ currentStage: st?.fase_conversa || "inicio" }).text;
```

### 2. Offtrack guard interno (`runFunnel`)
Roda dentro do funil quando o guard de IA detecta pergunta fora do trilho. Usava um array hardcoded, substituído por:
```js
const offtrackMessages = v2HasReply
  ? []
  : buildReanchor({ currentStage: stage }).lines;
```

### 3. Offtrack determinístico (`yesNoStages`)
Roda dentro do funil para stages que esperam sim/não. Usava um array hardcoded, substituído por:
```js
return step(env, st, buildReanchor({ currentStage: stage }).lines, stage);
```

Em todos os casos: **somente o texto foi alterado**. O comportamento estrutural (gate, stage mantido, step() chamado da mesma forma) permanece idêntico.

---

## O que foi preservado do mecânico

- `step()` — intocado
- `runFunnel()` — estrutura intocada
- `nextStage` — intocado
- Gates — intocados
- `yesNoStages` — lógica de gate intocada (apenas o texto da resposta mudou)
- Persistência — intocada
- Comportamento de runtime — **nenhuma mudança funcional**, apenas a casca textual

---

## O que ainda NÃO entrou nesta etapa

- Integração nos builders cognitivos (próximas etapas)
- Uso de `partialReply` nos pontos de integração atuais (reservado para builders futuros)
- Detecção automática de fase por contexto mais amplo
- Contrato de fala final (outra frente)
- Knowledge base ampliada (outra frente)
- Integração com Etapa 1 (FAQ) e Etapa 2 (Objeções) em fluxo único

---

## Como as próximas etapas vão consumir isso

Qualquer builder cognitivo pode importar o helper sem dependência de banco:

```js
import { buildReanchor } from "../src/reanchor-helper.js";

// Dentro de um builder de guidance, após responder parcialmente:
const reanchor = buildReanchor({
  partialReply: "Bom ponto sobre entrada.",
  currentStage: request.current_stage
});
// reanchor.lines[0] = "Bom ponto sobre entrada. Pra eu não te direcionar errado..."
// reanchor.lines[1] = "Me responde só a pergunta anterior, tá? 🙏"
```

O módulo é ES estático, sem efeito colateral, sem banco — pode ser importado em qualquer contexto sem risco para o mecânico.

---

## Smoke tests

Arquivo: `schema/reanchor_etapa3.smoke.mjs`

| Grupo | Cobertura |
|-------|-----------|
| 1 | lookup de variantes por fase (4 fases + fallback para inválida) |
| 2 | no mínimo 3 variantes por fase |
| 3 | `buildReanchor` com `partialReply` + topo (shape, prefix, pull-back) |
| 4 | `buildReanchor` sem `partialReply` + topo (shape, variante do catálogo, pull-back, sem args) |
| 5 | `buildReanchor` com fase meio (explícita + derivada de stage) |
| 6 | `buildReanchor` com fase gates_finais (explícita + derivada de ctps_36/restricao) |
| 7 | `buildReanchor` com fase operacional (explícita + derivada de envio_docs/agendamento_visita) |
| 8 | nenhuma variante usa "casa" em vez de "imóvel" |
| 9 | nenhuma variante promete aprovação |
| 10 | offtrack guard consome o helper global (import, ausência de hardcoded, uso de `.lines`) |
| 11 | mecânico intocado (sem step/runFunnel/nextStage nos módulos novos, step ainda existe no worker, yesNoStages intacto) |

**Resultado:** 37 passed, 0 failed
