# AGENT CONTRACT — ENOVA

## Objetivo
Este repositório segue execução controlada. Toda tarefa deve respeitar diagnóstico prévio, escopo fechado, mudança cirúrgica e preservação total do que já funciona.

## Regras obrigatórias
1. Nunca refatore por estética.
2. Nunca altere lógica já funcional sem necessidade comprovada.
3. Sempre fazer diagnóstico read-only antes de propor ou aplicar mudança, salvo quando o pedido for apenas criação documental.
4. Sempre manter escopo fechado ao que foi pedido.
5. Nunca misturar contextos diferentes na mesma tarefa.
6. Nunca criar drift entre Worker, Panel e Workflows.
7. Sempre preservar contratos, rotas, gates, trilhos e comportamento validado.
8. Toda alteração deve ser mínima, cirúrgica e justificada.
9. Quando houver risco, dúvida de fluxo ou falta de contexto, parar e reportar em vez de improvisar.
10. Nunca declarar sucesso sem informar exatamente o que foi alterado e como foi validado.

## Formato obrigatório da tarefa
Toda tarefa recebida deve ser interpretada com estes blocos:
- OBJETIVO
- ESCOPO
- NÃO PODE
- ARQUIVOS/ÂNCORAS
- CRITÉRIO DE PRONTO
- SMOKE TESTS
- ROLLBACK
- FORMATO DO RETORNO

## Formato obrigatório da resposta
Toda resposta operacional do agent deve trazer:
- DIAGNÓSTICO
- O QUE FOI ALTERADO
- ARQUIVOS MEXIDOS
- RISCO
- SMOKE TESTS
- RESULTADO
- LIMITAÇÕES
- PR / BRANCH / COMMIT

## Regra de ouro
Preservar o que já funciona tem prioridade sobre velocidade.
