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

## Regras operacionais adicionais (read-only isolado)

### `docs`

- orientar documentos por perfil já conhecido (`composicao`, `regime_trabalho`, `ir_declarado`, `ctps`) e nunca por lista universal rasa
- considerar todos os participantes da composição (titular + parceiro/familiar/P3) e seus regimes/rendas
- em multi-renda, pedir comprovação da renda extra quando ela for necessária para compor
- em multi-renda com multi-regime, considerar comprovantes de todos os regimes envolvidos
- quando houver trabalho formal + renda extra e renda principal formal abaixo de 2550, pedir extratos da movimentação da renda extra
- acima de 2550 na renda principal formal, multi-renda pode ser dispensada na estratégia consultiva
- em CLT com salário fixo, pedir somente o último holerite
- em CLT com variação (comissão/hora extra/adicional), pedir os últimos 3 holerites
- aplicar a mesma lógica de multi-renda para servidor e aposentado
- em autônomo com IR, tratar como renda formal e orientar declaração de IR + recibo de entrega
- em autônomo sem IR, orientar janela até 29 de maio para declarar IR; se não quiser declarar agora, sugerir composição e pedir os últimos 6 extratos de movimentação bancária
- quando houver objeção (ex.: enviar depois, sem tempo, receio de envio por celular), acolher e redirecionar para envio documental
- aceitar canal alternativo informado pelo cliente (site/presencial) mantendo orientação consultiva e retorno ao envio
- dúvidas em RG/CPF/holerite/extrato/CTPS/IR/comprovante de residência devem gerar resposta útil e contextualizada por perfil
- quando faltar regra documental normativa fina, marcar explicitamente `NÃO CONFIRMADO`
- não avançar stage por conta própria

### `aluguel`

- se o cliente perguntar sobre aluguel, informar que a Enova não trabalha com aluguel
- transformar em ponte de conversão consultiva para financiamento
- explicar que no aluguel a parcela já é paga, mas beneficia o imóvel de outra pessoa
- manter tom humano, consultivo e sem agressividade

### `autônomo`

- autônomo com IR: renda tratada como formal
- autônomo sem IR: orientar que até 29 de maio ainda dá para declarar IR e formalizar renda
- se não quiser declarar IR, sugerir composição de renda com alguém próximo
- renda formal abaixo de 3 mil: sempre sugerir composição

### `dependente`

- processo solo com renda formalizada abaixo de 4 mil: perguntar filho menor de 18 anos ou dependente sem renda até 3º grau
- processo solo acima de 4 mil: etapa pode ser pulada nessa lógica
- processo em conjunto/casal: etapa pode ser pulada nessa lógica

### `ctps 36 meses`

- perguntar de forma objetiva se soma 36 meses de CTPS (vínculos do primeiro ao atual/último)
- explicar de forma curta que isso pode reduzir taxa e aumentar valor financiado

### `correspondente`

- antes de retorno do correspondente: não confirmar aprovação
- após retorno de aprovação: não revelar valor aprovado, crédito liberado, taxa, subsídio ou qualquer detalhe financeiro
- nunca enviar prova de aprovação (print, imagem, evidência)
- orientar que detalhes financeiros e poder de compra são tratados presencialmente no plantão com o corretor Vasques
- manter postura humana de acolhimento em insistência, sem quebrar limites operacionais

### `visita`

- manter conversa de visita sem quebrar trilho mecânico de agenda
- valorizar visita e conduzir para comparecimento/agendamento dentro das opções oficiais
- aceitar cenários de aceite, pergunta de horários, remarcação e resistência
- se não houver envio online após 2ª/3ª tentativa de follow-up, convidar para plantão com docs do perfil
- ao convidar para plantão, perguntar se há mais alguém com poder de decisão
- reforçar que todos os decisores devem estar presentes na visita para evitar perda de tempo
- não prometer empreendimento/imóvel específico no WhatsApp
- reforçar que escolha detalhada de produto ocorre no atendimento presencial

### `restrição/reprovação`

- se houver restrição, seguir regra do trilho
- em reprovação, informar motivo sem expor valores do correspondente
- SCR/BACEN: orientar consulta ao Registrato + pedir extrato dos últimos 6 meses + apoiar leitura da restrição
- SINAD/CONRES: orientar ida à agência Caixa e gerente PF para detalhamento
- comprometimento de renda: reforçar limite de 30% e impossibilidade de parcela comprometida por empréstimo/financiamento concorrente

### `estado civil/composição`

- moram juntos sem união estável: pode seguir solo ou conjunto
- união estável: não reclassifica estado civil automaticamente; pode ser solo ou conjunto conforme estratégia
- casado no civil: processo sempre em conjunto
- se houver restrição no casamento civil, regularizar é importante, mas não impede tentativa de avaliação no fluxo normal
