# Telemetria híbrida — PR 1 (fundação)

Data/hora: 2026-04-08
Branch alvo: copilot/implementacao-fase-estrutural-again

## Arquivos criados

- `telemetry/hybrid-telemetry-contract.js`
- `telemetry/hybrid-telemetry.js`
- `schema/hybrid_telemetry_pr1.smoke.mjs`

## Contrato criado

O contrato canônico define:

- schema version `hybrid-telemetry.v1`
- taxonomy oficial de eventos do funil
- reason codes cognitivos, mecânicos e de arbitragem
- classificação oficial de override
- field groups e defaults para base, cognitivo, mecânico e arbitragem

## Helpers criados

- `createTurnCorrelationId(...)`
- `sanitizeTelemetryPayload(...)`
- `buildCognitiveTelemetryEvent(...)`
- `buildMechanicalTelemetryEvent(...)`
- `buildArbitrationTelemetryEvent(...)`
- `buildHybridTelemetryEvent(...)`
- `emitHybridTelemetry(...)`
- `emitCognitiveTelemetrySafe(...)`
- `emitMechanicalTelemetrySafe(...)`
- `emitArbitrationTelemetrySafe(...)`

## Como gerar `correlation_id`

`createTurnCorrelationId(...)` monta um ID por turno a partir de:

- `conversation_id` / `lead_id`
- `turn_id` / `message_id`
- `timestamp`

O helper normaliza os segmentos e adiciona um sufixo curto para evitar colisão.

## Emissão segura

A emissão segura:

- sanitiza o payload antes de emitir
- tolera campos ausentes
- tolera objetos circulares
- suporta truncamento de strings longas
- captura falha de cada sink separadamente
- nunca lança exceção para o chamador

## O que ficou deliberadamente para a PR 2

- plugar a base nos pontos reais do worker
- decidir quais eventos vão para `telemetry()`
- decidir quais eventos vão para `logger()`
- decidir persistência reaproveitada em `enova_log`
- telemetria por stage/turno real
- smokes de integração com `handleMetaWebhook()`, `runFunnel()` e `step()`
