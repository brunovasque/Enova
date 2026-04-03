# ETAPA 6 — CONTRATO GLOBAL DE FALA FINAL

**Status:** Implementado  
**Escopo:** Padronização do tom, acolhimento, clareza e proteção contra promessas indevidas na camada cognitiva  
**Blocos integrados:** topo, docs, visita  

---

## O que é

A Etapa 6 cria um pós-processador global que ajusta **como** a Enova fala com o cliente.  
Toda resposta cognitiva passa por esse contrato antes de ser entregue.

O contrato não inventa conteúdo novo: ele **ajusta, protege e padroniza** o que já foi construído pelas etapas anteriores (FAQ, objeções, KB, reancoragem, phase guidance).

---

## O que o contrato aplica

### 1. Substituição terminológica
- "casa" → "imóvel" (exceto em compostos como "casado", "casamento", "casal")

### 2. Bloqueio de promessas proibidas
O contrato detecta e substitui automaticamente:
- Promessa de aprovação garantida
- Promessa de valor de financiamento sem análise
- Promessa de subsídio
- Promessa de uso de FGTS sem validação
- Promessa de prazo fechado de banco

Substituição por frase segura contextual (ex: "isso depende da análise do seu perfil").

### 3. Acolhimento emocional
Quando o texto do cliente indica medo, insegurança, vergonha ou confusão, o contrato pode adicionar um prefixo empático se a resposta ainda não for naturalmente acolhedora.

Prefixos variáveis, sem repetição mecânica, sem melodrama.

### 4. Controle de tamanho
Respostas acima de 600 caracteres são encurtadas no limite de sentença mais próximo.

### 5. Normalização final
Espaços duplicados, espaços antes de pontuação e whitespace residual são limpos.

---

## Onde foi integrado

O contrato é aplicado em `cognitive/src/run-cognitive.js`, na função `runReadOnlyCognitiveEngine()`, logo após a normalização da resposta e **antes** da validação.

### Integração mínima obrigatória (Etapa 6):
- **Topo** (stages: `inicio`, `inicio_decisao`, `inicio_programa`)
- **Docs** (stages: `envio_docs`)
- **Visita** (stages: `agendamento_visita`)

A integração cobre todas as respostas cognitivas (heurística e LLM), pois o contrato é aplicado no ponto final unificado.

---

## O que o contrato protege

| Regra | Proteção |
|---|---|
| Nunca prometer aprovação | Regex + substituição segura |
| Nunca prometer valor sem análise | Regex + substituição segura |
| Nunca prometer subsídio | Regex + substituição segura |
| Nunca prometer FGTS sem validação | Regex + substituição segura |
| Nunca prometer prazo fechado | Regex + substituição segura |
| Sempre usar "imóvel" | Substituição automática |
| Tamanho controlado | Truncagem em limite de sentença |
| Tom acolhedor quando necessário | Detecção emocional + prefixo |

---

## O que foi preservado

- `step()` — intacto
- `runFunnel()` — intacto
- `nextStage` — intacto
- gates — intactos
- persistência — intacta
- texto mecânico base — intacto
- builders existentes — sem alteração de lógica

---

## O que NÃO entrou nesta etapa

- Precedência global ampla (expansão para outros blocos)
- Redesign do funil
- Alteração de runtime do worker
- Alteração de `step()`, `runFunnel()`, gates ou persistência
- Contrato de tom para LLM prompt (ajuste de system prompt)
- Expansão do contrato para composição, renda, gates, correspondente
- Métricas / observabilidade do contrato

---

## Arquivos criados/alterados

| Arquivo | Ação |
|---|---|
| `cognitive/src/final-speech-contract.js` | Criado — módulo do contrato |
| `cognitive/src/run-cognitive.js` | Alterado — integração do contrato |
| `schema/cognitive/ETAPA6_FINAL_SPEECH_CONTRACT.md` | Criado — este documento |
| `schema/cognitive_etapa6_final_speech_contract.smoke.mjs` | Criado — smoke tests |
