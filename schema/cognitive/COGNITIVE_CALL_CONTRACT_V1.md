# COGNITIVE_CALL_CONTRACT_V1

WORKFLOW_ACK: ok

Escopo: **Docs-only / contrato canônico de chamada do Enova Cognitive Engine**.

## Objetivo

Definir o input e o output mínimos do **Enova Cognitive Engine**, deixando explícito que o retorno cognitivo é validado pelo **Enova Orchestrator** antes de qualquer persistência oficial.

## Princípios obrigatórios

- a chamada é feita pelo **Enova Orchestrator**
- a resposta é devolvida ao **Enova Orchestrator**
- a validação final acontece fora do cognitivo
- `should_advance_stage=false` é a regra inicial
- a configuração de modelo do cognitivo isolado deve permanecer separada da IA offtrack existente (`COGNITIVE_AI_MODEL`)

## Input canônico

Payload mínimo esperado:

```json
{
  "version": "V1",
  "channel": "meta_whatsapp",
  "conversation_id": "string",
  "message": {
    "id": "string",
    "text": "string",
    "timestamp": "ISO-8601"
  },
  "context": {
    "current_stage": "string",
    "known_slots": {},
    "pending_slots": [],
    "recent_messages": []
  },
  "policy": {
    "allow_direct_meta": false,
    "allow_official_supabase_write": false
  }
}
```

## Campo `known_slots`

`known_slots` representa o retrato dos slots já reconhecidos e aceitos pelo **Enova Orchestrator** no momento da chamada.

Uso esperado:

- informar ao cognitivo o que já é conhecido
- evitar perguntas redundantes
- permitir interpretação contextual
- servir de base para detectar conflito ou pendência

## Output canônico

```json
{
  "version": "V1",
  "human_response": "string",
  "known_slots": {},
  "pending_slots": [],
  "conflicts": [],
  "suggested_next_slot": "string|null",
  "consultive_notes": [],
  "should_request_confirmation": false,
  "should_advance_stage": false
}
```

## Campo `pending_slots`

`pending_slots` lista os slots ainda necessários para continuar a coleta cognitiva ou orientar a próxima pergunta.

Uso esperado:

- indicar o que ainda falta
- ajudar o orquestrador a decidir a próxima pergunta
- registrar pendências sem alterar o fluxo mecânico sozinho

## Campo `conflicts`

`conflicts` lista divergências detectadas entre:

- informação nova vs. slot já conhecido
- respostas incompatíveis entre si
- interpretação atual vs. dependências esperadas

Cada conflito deve ser tratado como sinal consultivo para revisão do **Enova Orchestrator**.

## Campo `suggested_next_slot`

`suggested_next_slot` indica qual slot seria a melhor próxima pergunta do ponto de vista cognitivo.

Regras:

- é apenas sugestão
- não muda estágio sozinho
- pode ser `null` quando não houver recomendação clara

## Campo `consultive_notes`

`consultive_notes` carrega observações consultivas, inclusive referência temática à **CEF Knowledge Base**.

Exemplos esperados:

- justificativa curta para pedir confirmação
- observação de dependência normativa
- alerta de interpretação ambígua

## Campo `should_request_confirmation`

`should_request_confirmation` indica que o cognitivo sugere confirmação explícita antes de considerar um slot como confiável.

Casos típicos:

- conflito relevante
- dado sensível
- resposta ambígua
- informação normativa com impacto operacional

## Campo `should_advance_stage`

Regra inicial obrigatória:

- `should_advance_stage=false`

Nesta fase, o cognitivo:

- não comanda avanço de estágio
- não altera o funil mecânico
- não define persistência oficial

## Regra de validação antes da persistência

O **Enova Orchestrator** deve:

1. validar o retorno cognitivo
2. decidir quais campos podem ser aceitos
3. decidir se alguma confirmação adicional é necessária
4. decidir se algo pode ser persistido oficialmente

## Exemplo canônico resumido

```json
{
  "version": "V1",
  "human_response": "Entendi. Para seguir com segurança, preciso confirmar se a composição é somente você e mais um parceiro.",
  "known_slots": {
    "titular": {
      "nome_inferido": "Maria"
    },
    "composicao": {
      "tipo": "casal"
    }
  },
  "pending_slots": [
    "parceiro_p2",
    "docs"
  ],
  "conflicts": [],
  "suggested_next_slot": "parceiro_p2",
  "consultive_notes": [
    "Solicitar confirmação explícita da composição antes de consolidar dependências."
  ],
  "should_request_confirmation": true,
  "should_advance_stage": false
}
```
