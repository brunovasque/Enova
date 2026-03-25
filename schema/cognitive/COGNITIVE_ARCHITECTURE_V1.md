# COGNITIVE_ARCHITECTURE_V1

WORKFLOW_ACK: ok

Escopo: **Docs-only / arquitetura canônica da camada cognitiva**.

## Objetivo

Materializar a separação oficial entre o **Enova Orchestrator**, o **Enova Cognitive Engine** e a **CEF Knowledge Base** dentro do mesmo repositório, sem alterar o comportamento mecânico atual do `Enova worker.js`.

## Componentes canônicos

### 1) Enova Orchestrator

Papel oficial do motor mecânico/orquestrador:

- recebe a mensagem do canal real (Meta)
- lê o estado oficial no Supabase
- grava o estado oficial no Supabase
- chama o Enova Cognitive Engine
- valida a resposta estruturada devolvida pelo cognitivo
- decide o que pode ou não ser persistido oficialmente
- responde no canal real

### 2) Enova Cognitive Engine

Papel oficial da camada cognitiva:

- interpretar linguagem natural
- responder de forma humana
- extrair slots
- identificar pendências
- identificar conflitos
- consultar a CEF Knowledge Base
- sugerir a próxima melhor pergunta
- devolver JSON estruturado para a Enova

### 3) CEF Knowledge Base

Papel oficial da base normativa consultiva:

- concentrar conhecimento versionado da normativa CEF
- servir como fonte consultiva para o cognitivo
- permanecer separada da lógica mecânica e da persistência oficial
- evoluir por arquivos temáticos e versionados dentro do repositório

## Regra de ouro

No estágio inicial da arquitetura cognitiva:

- o cognitivo **não fala com Meta direto**
- o cognitivo **não grava sozinho no Supabase oficial**
- a Enova mecânica continua sendo a **fonte oficial de estado e integração**

Frase canônica do projeto:

> “Enova mecânica orquestra. Cognitivo interpreta. Supabase oficial persiste. Meta continua centralizada na Enova.”

## Separação de responsabilidades

| camada | responsabilidade permitida | responsabilidade proibida nesta fase |
|---|---|---|
| Enova Orchestrator | integração real, estado oficial, validação final, decisão operacional | terceirizar persistência oficial para o cognitivo |
| Enova Cognitive Engine | interpretação, extração, sugestão, consulta consultiva | falar direto com Meta, gravar no Supabase oficial sozinho |
| CEF Knowledge Base | armazenar conteúdo normativo consultivo versionado | agir como integração ativa ou executar regras operacionais sozinha |

## Fluxo oficial de chamada

1. A mensagem chega ao **Enova Orchestrator**.
2. O **Enova Orchestrator** lê o estado oficial atual.
3. O **Enova Orchestrator** monta o payload canônico de chamada.
4. O **Enova Orchestrator** chama o **Enova Cognitive Engine**.
5. O **Enova Cognitive Engine** consulta, quando necessário, a **CEF Knowledge Base**.
6. O **Enova Cognitive Engine** devolve JSON estruturado.
7. O **Enova Orchestrator** valida o retorno cognitivo.
8. O **Enova Orchestrator** decide o que persiste oficialmente.
9. O **Enova Orchestrator** responde no canal real.

## Convenção de nomes e pastas

- `Enova worker.js` = implementação atual do **Enova Orchestrator**
- `cognitive/` = módulo do **Enova Cognitive Engine**
- `schema/cognitive/` = contratos e documentação canônica do cognitivo
- `knowledge/cef/` = **CEF Knowledge Base**

Convenções adicionais:

- contratos cognitivos em markdown usam prefixo `COGNITIVE_`
- contratos materializados usam sufixo `_V1`
- conteúdo normativo fica separado do código e dos contratos

## Regra de persistência

- o estado oficial continua centralizado na camada mecânica
- o retorno cognitivo é **consultivo e estruturado**
- persistência oficial só acontece após validação do **Enova Orchestrator**
- qualquer persistência futura fora desse modelo exige nova fase arquitetural explícita

## Regra de evolução por fases

### Fase 1 — documental e isolada

- documentação canônica
- contratos V1
- placeholders seguros
- sem integração ativa

### Fase 2 — integração controlada

- chamada interna pelo orquestrador
- validação estrita do retorno cognitivo
- sem autonomia de persistência oficial

### Fase 3 — expansão supervisionada

- refinamento de prompts, slots e dependências
- ampliação da base normativa
- novas capacidades apenas com contratos versionados

## Limites explícitos desta base

Esta base canônica:

- não altera gates
- não altera nextStage
- não altera mudanças de fase
- não altera integrações reais
- não substitui o funil mecânico atual

## Relação com o worker atual

- `Enova worker.js` permanece intacto como motor mecânico/orquestrador oficial
- a camada cognitiva nasce no mesmo repositório, mas isolada logicamente
- qualquer plugar futuro deve preservar a soberania operacional do fluxo mecânico existente
