# Enova Cognitive Engine

## O que é

`cognitive/` é a base inicial do **Enova Cognitive Engine**, a camada cognitiva separada logicamente do motor mecânico atual.

Nesta fase, o módulo existe para:

- documentar contratos e responsabilidades
- materializar placeholders seguros
- preparar a futura integração controlada pelo **Enova Orchestrator**

## O que não é

Este módulo não é:

- substituto do `Enova worker.js`
- integração ativa com Meta
- persistência oficial no Supabase
- mudança de funil, gate, nextStage ou lógica operacional

## Estado atual

O módulo cognitivo **ainda não está plugado em produção**.

Os arquivos em `cognitive/src/` são apenas esqueleto inicial:

- sem side effects
- sem deploy behavior
- sem rotas
- sem integração ativa

## Relação canônica entre camadas

- **Enova Orchestrator**: continua sendo o motor mecânico/orquestrador oficial
- **Enova Cognitive Engine**: interpreta linguagem natural e devolve JSON estruturado
- **CEF Knowledge Base**: oferece base normativa consultiva versionada em `knowledge/cef/`

## Estrutura relacionada

- `schema/cognitive/` → arquitetura e contratos V1
- `knowledge/cef/` → placeholders temáticos da base normativa CEF
- `cognitive/src/` → esqueleto técnico inicial do módulo cognitivo
