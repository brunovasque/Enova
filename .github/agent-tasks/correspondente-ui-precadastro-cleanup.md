# Task — Correspondente UI / pré-cadastro cleanup

Leia e siga estritamente:
- .github/AGENT_CONTRACT.md
- .github/WORKFLOW_GIT_PR_AGENTS.md
- .github/OPERATING_CONTRACT.md
- .github/TASK_HEADER_V1.md

Se não conseguir acessar ou ler esses arquivos, pare e informe isso antes de qualquer alteração.

## Objetivo
Ajustar de forma cirúrgica a UI do dossiê/entrada do correspondente e o texto da mensagem enviada ao correspondente, preservando todo o fluxo de assunção já funcional.

## Escopo fechado
- Tela de entrada/assunção do correspondente.
- Texto/mensagem que a Enova monta/envia ao correspondente com o link do atendimento.
- Validação/renderização do campo de WhatsApp do correspondente.

## Diagnóstico confirmado
1. O input de WhatsApp do correspondente está exibindo `null` quando não há valor.
2. O campo está confundindo com o DDI `55`; quando digitam `55`, ocorre erro. O fluxo deve aceitar apenas DDD + número, sem DDI.
3. No texto visível da tela, onde fizer sentido operacional nesse contexto, substituir `caso` por `pré-cadastro`.
4. A mensagem enviada ao correspondente está poluída com trecho redundante e deve remover integralmente:
   - `CTA principal: abra o link oficial de entrada da Enova para assumir.`
   - `Link oficial de assunção:`
   - `Fallback compatível: ASSUMIR 000028`

## O que fazer
### A) Input de WhatsApp
- Se o valor vier `null`, `undefined` ou vazio, renderizar string vazia.
- Nunca mostrar a palavra `null` na UI.
- Remover qualquer preenchimento, máscara, placeholder, default value ou instrução que injete/indique `55`.
- Manter o entendimento correto: o campo deve aceitar apenas DDD + número.
- Garantir que apagar o campo não reintroduza `55`.
- Ajustar a validação para o formato real do fluxo, sem DDI.

### B) Textos visíveis da tela
- Trocar textos visíveis em contexto operacional de `caso` para `pré-cadastro`.
- Exemplo explícito: `Assumir caso` deve virar `Assumir pré-cadastro`.
- Exemplo explícito: `Caso ref` deve virar `Pré-cadastro` ou `Pré-cadastro ref`, desde que fique limpo.
- Não alterar nomes técnicos, chaves de backend, ids, enums, contracts ou payloads que dependam de `case` internamente.

### C) Mensagem enviada ao correspondente
Deixar o texto limpo e direto. Estrutura alvo:
- saudação de novo pré-cadastro
- número do pré-cadastro
- cliente
- link útil de acesso

Remover integralmente o CTA/fallback redundante citado acima.

## Não pode
- Não refatorar fora do escopo.
- Não quebrar lock/claim/assunção.
- Não alterar contrato do backend além do estritamente necessário para a validação/renderização correta.
- Não mexer em Worker + Panel + Workflows juntos se não for estritamente necessário. Manter escopo fechado no que realmente sustenta essa tela/mensagem.

## Critério de pronto
1. O campo não mostra mais `null`.
2. O campo não injeta, sugere nem exige `55`.
3. Os textos visíveis da UI ficaram limpos com `pré-cadastro` no contexto correto.
4. A mensagem enviada ao correspondente ficou curta, sem CTA/Fallback redundante.
5. Fluxo de assunção continua funcional.

## Smoke tests mínimos
- Abrir a tela com valor vazio/null no WhatsApp e confirmar input vazio.
- Digitar número sem `55` e validar envio/claim.
- Confirmar que apagar o campo não reaplica `55`.
- Confirmar textos visíveis atualizados.
- Confirmar mensagem final ao correspondente sem o bloco redundante.

## Formato do retorno
- DIAGNÓSTICO
- O QUE FOI ALTERADO
- ARQUIVOS MEXIDOS
- RISCO
- SMOKE TESTS
- RESULTADO
- LIMITAÇÕES
- PR / BRANCH / COMMIT
