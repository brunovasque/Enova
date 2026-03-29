SUPABASE CHANGE GUARD — ENOVA (CANÔNICO)

Objetivo
Blindar o projeto contra drift de schema, reaproveitamento indevido de campos e mudanças silenciosas em persistência.

Regra absoluta
Nenhum agente, PR ou patch pode renomear, reaproveitar, remover ou redefinir tabela/coluna do Supabase sem autorização explícita.

PROIBIÇÕES

É expressamente proibido:
- renomear tabela existente;
- renomear coluna existente;
- alterar o significado funcional de coluna viva;
- reaproveitar coluna existente para outro domínio;
- remover tabela/coluna sem autorização explícita;
- presumir que coluna nova criada no código já existe no Supabase;
- criar persistência paralela “temporária” só para fazer funcionar;
- salvar dados de um domínio em campo de outro domínio.

REGRA DE DOMÍNIO

Cada domínio deve escrever apenas em seus campos canônicos.
Exemplos de domínio:
- docs
- funil
- composição
- renda
- correspondente
- visita
- cognitivo

Se não existir campo canônico adequado para o dado:
- parar;
- reportar;
- propor criação nova de forma explícita;
- nunca improvisar em campo existente.

CRIAÇÃO DE NOVA TABELA/COLUNA

Se a tarefa exigir persistência nova:
- criar nova coluna/tabela, nunca reaproveitar coluna viva;
- declarar explicitamente no diagnóstico e no report final:
  - tabela;
  - coluna;
  - tipo;
  - motivo;
  - compatibilidade retroativa;
  - necessidade de inclusão/manual no Supabase.

Regra de verdade:
Nenhuma tarefa está concluída se tiver criado nova tabela/coluna e isso não tiver sido informado explicitamente para inclusão no Supabase.

MAPEAMENTO OBRIGATÓRIO

Antes de qualquer implementação que toque persistência, o agente deve listar:
- tabelas lidas;
- colunas lidas;
- tabelas escritas;
- colunas escritas;
- criação nova de tabela/coluna: sim/não;
- ação manual necessária no Supabase: sim/não.

Se não souber responder isso com segurança, deve parar em READ-ONLY.

PROVA DE CAMPO VIVO

Não mexer em coluna/tabela só porque existe.
Antes de alterar persistência, confirmar se o campo:
- é lido no fluxo ativo;
- é escrito no fluxo ativo;
- pertence ao trilho real em uso;
- não é legado/resquício sem prova de uso.

Se houver dúvida entre ativo e legado:
- fazer diagnóstico READ-ONLY primeiro.

DOCS / FUNIL — GUARDA EXTRA

Em tarefas que toquem docs ou funil:
- não criar novos status/campos/estruturas paralelas sem autorização;
- não salvar fallback em persistência improvisada;
- não trocar fonte de verdade existente sem autorização;
- não usar campo genérico para “quebrar galho”;
- não alterar contrato do trilho por conveniência de implementação.

AÇÃO OBRIGATÓRIA QUANDO HOUVER MUDANÇA DE SCHEMA

Se houver criação de nova tabela/coluna, a resposta final deve conter obrigatoriamente:

SUPABASE CHANGE NOTICE
- Nova tabela/coluna criada: <sim/não>
- Nome: <tabela/coluna>
- Tipo: <tipo>
- Motivo: <motivo>
- Compatibilidade retroativa: <sim/não>
- Exige inclusão/manual no Supabase: <sim/não>

REGRA FINAL

Na dúvida entre:
- reaproveitar coluna existente; ou
- criar coluna nova;

o agente NÃO pode decidir sozinho.
Deve parar e reportar.
