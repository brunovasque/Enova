## REGRA MESTRA
Toda alteração via Copilot/Codex deve respeitar integralmente os gates, nextStage, mudanças de fase e regras de negócio já existentes no Worker PROD.

## FONTE DE VERDADE
A única fonte de verdade dos gates é o Worker PROD atual.
Não usar inferência própria.
Não usar expectativa de teste como fonte primária.
Não usar JSON exportado de stages como fonte primária de gate.
O gate real é o nextStage definido no fluxo do Worker PROD.

## PROIBIÇÕES ABSOLUTAS
É proibido:
- alterar gates sem autorização explícita
- alterar nextStage sem autorização explícita
- alterar mudança de fase sem autorização explícita
- alterar regras de elegibilidade/ineligibilidade sem autorização explícita
- alterar trilho mecânico sem autorização explícita
- reinterpretar regra de negócio por conta própria
- “corrigir” fluxo com base em lógica inventada
- simplificar fluxo
- refatorar blocos que já funcionam sem autorização explícita
- remover stages existentes do trilho sem autorização explícita
- trocar destino de fase para “melhorar” conversa sem autorização explícita
- abrir nova PR ou sub-PR sem autorização explícita

## PERMITIDO
Só é permitido alterar:
- parsing conversacional
- regex
- fallback textual
- mensagem/resposta dentro do stage atual
- testes, quando a expectativa do teste estiver desalinhada do gate canônico já existente
- pequenos ajustes estruturais apenas se forem comprovadamente necessários para manter sintaxe válida, sem afetar comportamento do funil

## OBRIGAÇÃO ANTES DE QUALQUER PATCH
Antes de alterar qualquer linha, fazer diagnóstico READ-ONLY e informar:
1. qual é o gate real atual no Worker PROD
2. qual é o nextStage real atual
3. se o problema está no parser/conversacional ou no teste
4. confirmação explícita de que não haverá mudança de gate

## CONTRATO DE PRESERVAÇÃO
Toda resposta do Copilot/Codex deve assumir:
- gates do PROD são soberanos
- nextStage do PROD é soberano
- regra de negócio já consolidada pelo usuário não pode ser alterada
- se o teste contrariar o gate real do PROD, corrige-se o teste, não o gate
- se houver dúvida entre conversa e fluxo, preserva-se o fluxo

## CONTRATO CANÔNICO DE GATES DO PROD

### inicio_rnm
- se resposta = nao possui RNM -> fim_ineligivel
- se resposta = possui RNM -> inicio_rnm_validade
- se não entender -> permanece em inicio_rnm

### inicio_rnm_validade
- se RNM = prazo indeterminado -> segue fluxo
- se RNM = temporário / renovação / definida / protocolo / andamento / fora do enquadramento -> fim_ineligivel

### ir_declarado
- gate é contextual conforme o fluxo já existente no PROD
- proibido fixar destino único sem ler o Worker atual

### restricao
- gate é contextual conforme o fluxo já existente no PROD
- se não entender -> permanece em restricao

### restricao_parceiro
- gate é contextual conforme o fluxo já existente no PROD
- se não entender -> permanece em restricao_parceiro

### regularizacao_restricao
- gate é contextual conforme o fluxo já existente no PROD
- proibido alterar destino sem confirmação no Worker PROD

### regularizacao_restricao_parceiro
- gate é contextual conforme o fluxo já existente no PROD
- proibido alterar destino sem confirmação no Worker PROD

### ctps_36
- stage existente e obrigatório no trilho
- gate é contextual conforme o fluxo já existente no PROD
- se não entender, só repetir/permanecer se isso já for o comportamento real do stage no PROD

### ctps_36_parceiro
- stage existente e obrigatório no trilho
- gate é contextual conforme o fluxo já existente no PROD
- se não entender, só repetir/permanecer se isso já for o comportamento real do stage no PROD

### fim_ineligivel
- stage canônico de encerramento
- não alterar condições de entrada sem autorização explícita

## REGRA ESPECIAL PARA RNM
RNM é regra fechada:
- sem RNM = fim_ineligivel
- RNM sem prazo indeterminado = fim_ineligivel
É proibido suavizar essa regra por interpretação conversacional.

## REGRA ESPECIAL PARA CTPS
ctps_36 e ctps_36_parceiro fazem parte do trilho.
É proibido remover, matar, pular ou tratar como bloco residual sem prova concreta no Worker PROD.

## REGRA ESPECIAL PARA TESTES
Se um teste falhar, primeiro verificar:
1. o gate do PROD está correto?
2. o teste está esperando destino errado?
3. o parser está lendo a frase errada?
Só depois corrigir.
Ordem obrigatória:
diagnóstico -> comparação com gate do PROD -> correção mínima

## FORMATO OBRIGATÓRIO DE RESPOSTA DO COPILOT/CODEX
Toda execução deve responder neste formato:

WORKFLOW_ACK: ok

Summary:
- diagnóstico READ-ONLY
- gate real atual de cada caso afetado
- parser/bloco analisado
- confirmação explícita de que nenhum gate/nextStage foi alterado

PR/Branch/Commit/Rollback:
- PR:
- branch:
- commits:
- hash final:
- rollback:

Smoke tests:
- testes executados
- resultado
- confirmação de não regressão

Provas:
- git remote -v
- git rev-parse HEAD
- link do commit não-404

Push obrigatório:
- comando git push usado
- confirmação de push no mesmo branch/PR

## FRASE OBRIGATÓRIA EM TODO PROMPT
"Não altere gates, não altere nextStage, não altere mudanças de fase, não altere regra de negócio. Preserve integralmente o Worker PROD. Corrija somente parsing conversacional, fallback textual ou expectativa de teste desalinhada com o gate real já existente."
