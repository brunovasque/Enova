# COGNITIVE_CONTRACT_V1

WORKFLOW_ACK: ok

Escopo: **Docs-only / consolidação do contrato cognitivo V1**.

## Objetivo

Consolidar a primeira versão do contrato da camada cognitiva da Enova, definindo slots, dependências, estados, cobertura mínima, regras de confirmação e limites operacionais em relação ao funil mecânico atual.

## Slots cobertos em V1

- `titular`
- `composicao`
- `parceiro_p2`
- `familiar`
- `p3`
- `docs`
- `correspondente`
- `visita`

## Estados canônicos dos slots

Cada slot pode circular entre os seguintes estados canônicos:

- `unknown`
- `inferred`
- `pending_confirmation`
- `confirmed`
- `conflicted`
- `blocked`
- `not_applicable`

## Dependências centrais

- `composicao` influencia `parceiro_p2`, `familiar` e `p3`
- `estado_civil` influencia leitura de `composicao`
- `autonomo_ir` pode reclassificar pendências documentais
- `ctps` influencia avaliação documental e de trilha
- `restricao` pode bloquear avanço consultivo recomendado
- `docs` depende do quadro consolidado de participantes e pendências
- `correspondente` depende de qualificação prévia do caso mecânico
- `visita` depende do retorno mecânico e da validação operacional

## Coverage mínima de V1

Cobertura mínima esperada da camada cognitiva nesta fase:

1. interpretar linguagem natural do usuário
2. devolver resposta humana consultiva
3. extrair ou atualizar slots em formato estruturado
4. listar pendências
5. apontar conflitos
6. sugerir o próximo slot
7. indicar necessidade de confirmação
8. referenciar uso consultivo da base normativa CEF

## Skip rules

As skip rules do cognitivo são consultivas e nunca substituem o orquestrador.

Regras mínimas:

- pular `parceiro_p2` quando `composicao` confirmar ausência de parceiro
- pular `familiar` quando a composição não exigir núcleo familiar adicional
- pular `p3` quando não houver terceiro participante aplicável
- pular `docs` específicos quando o slot estiver marcado como `not_applicable`
- nunca pular validação mecânica já existente no worker atual

## Confirmation rules

Regras mínimas de confirmação:

- confirmar dados sensíveis, ambíguos ou conflitantes
- confirmar composição quando impactar dependências
- confirmar interpretação documental quando houver reflexo operacional
- confirmar retorno que possa reclassificar `docs`, `correspondente` ou `visita`

## Limites do cognitivo

O cognitivo V1:

- não fala com Meta direto
- não grava no Supabase oficial sozinho
- não muda gates
- não muda nextStage
- não altera o funil mecânico
- não decide avanço de estágio sozinho
- não substitui regras de produção do `Enova worker.js`

## Relação com o funil mecânico atual

Relação canônica:

- o funil mecânico atual permanece soberano
- o cognitivo funciona como camada de interpretação estruturada
- o orquestrador pode aceitar, rejeitar ou pedir confirmação adicional sobre o retorno cognitivo
- a integração futura deve preservar contratos, gates, stages e persistência oficial já validados

## Matriz resumida por slot

| slot | objetivo | depende de | pode exigir confirmação |
|---|---|---|---|
| `titular` | consolidar identidade e contexto do titular | mensagem atual + contexto oficial | sim |
| `composicao` | entender estrutura familiar/participantes | estado civil + narrativa | sim |
| `parceiro_p2` | consolidar dados do parceiro/P2 | composição | sim |
| `familiar` | consolidar familiar aplicável | composição | sim |
| `p3` | consolidar terceiro participante quando aplicável | composição | sim |
| `docs` | mapear pendências documentais | composição + autonomo_ir + ctps + restricao | sim |
| `correspondente` | estruturar visão consultiva para encaminhamento | docs + qualificação mecânica | sim |
| `visita` | estruturar visão consultiva de visita | correspondente + retorno mecânico | sim |
