# CABEÇALHO CANÔNICO V1 — TAREFAS DO AGENT

Use este cabeçalho no início de toda tarefa nova enviada ao agent.

```text
Leia e siga estritamente:
- .github/AGENT_CONTRACT.md
- .github/WORKFLOW_GIT_PR_AGENTS.md
- .github/OPERATING_CONTRACT.md

Se houver outro arquivo canônico de instruções já adotado neste repositório para tarefas do agent, leia e siga também.

Se não conseguir acessar ou ler esses arquivos, pare e informe isso antes de qualquer alteração.

OBJETIVO:
[descrever objetivo]

ESCOPO:
[descrever escopo fechado]

NÃO PODE:
[listar o que é proibido]

ARQUIVOS / ÂNCORAS:
[listar arquivos e pontos exatos]

CRITÉRIO DE PRONTO:
[descrever como saber que terminou]

SMOKE TESTS:
[listar testes mínimos obrigatórios]

ROLLBACK:
[descrever como reverter]

FORMATO DO RETORNO:
- DIAGNÓSTICO
- O QUE FOI ALTERADO
- ARQUIVOS MEXIDOS
- RISCO
- SMOKE TESTS
- RESULTADO
- LIMITAÇÕES
- PR / BRANCH / COMMIT
```

## Regra de uso
- Este cabeçalho deve ser usado antes de qualquer tarefa nova.
- Para ajustes dentro da mesma PR, manter o contexto da PR e iterar por comentário.
- Se a mudança de objetivo fugir da natureza da PR atual, abrir nova branch + nova PR.
