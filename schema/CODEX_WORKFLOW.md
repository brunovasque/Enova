CODEX WORKFLOW — ENOVA (CANÔNICO)

HEADER FIXO (colar antes de qualquer tarefa)
Leia schema/CODEX_WORKFLOW.md, CANONICO_GATE_PRESERVATION.md e schema/SUPABASE_CHANGE_GUARD.md e siga como regra absoluta.
Confirme que leu e diga: WORKFLOW_ACK: ok.

SUPORTE DE CONTRATO
Este workflow depende também de: schema/SUPABASE_CHANGE_GUARD.md.
As regras desse arquivo são obrigatórias e têm o mesmo peso deste workflow.

Regras:

1 tarefa = 1 PR = 1 branch até terminar.
Se já existir PR aberta para o assunto, reusar o MESMO branch e fazer commits adicionais na mesma PR (não criar PR nova).
Se você não conseguir commitar/push, você deve declarar isso explicitamente.
Todo follow-up deve gerar commit adicional no mesmo branch da PR.
Resposta final deve incluir sempre: PR#, branch, commit hash, smoke tests, rollback.
Nunca misturar escopos no mesmo PR (Worker OU Panel OU Workflows OU Docs).
Toda mudança precisa de commit real (hash obrigatório). Sem hash = não feito.

CAMADA 3 — BLOQUEIO AUTOMÁTICO (merge bloqueado se não cumprir)
Regra: PR que não cumprir checklist NÃO passa.

O repositório tem:

GitHub Action: PR Checklist Guard (valida o CORPO/descrição da PR)
Template padrão: .github/PULL_REQUEST_TEMPLATE.md (ajuda você a preencher)

Campos obrigatórios no corpo da PR:

PR:
Branch:
Commit:
Smoke tests:
Rollback:

Importante:

Se o check falhar, geralmente NÃO precisa novo commit. Basta EDITAR A DESCRIÇÃO (corpo) DA PR, preencher os campos e salvar.
Não confundir comentário com descrição da PR. Comentário não resolve o check; a validação lê o corpo/descrição.

PROCESSO PADRÃO

Fase 1 — Diagnóstico (READ-ONLY)
- localizar arquivos e âncoras
- explicar causa
- plano de patch mínimo
- smoke tests
- parar e esperar: "OK, pode implementar"

Fase 2 — Implementação (após OK)
- patch cirúrgico (sem refatorar, sem renomear por estética)
- commit no MESMO branch da PR (não criar PR nova)
- rodar smoke tests
- report final obrigatório

DOMAIN ISOLATION GUARD — OBRIGATÓRIO

É proibido:
- salvar dados de documentos em campos de outro domínio;
- salvar dados de visita, composição, renda, correspondente ou funil em colunas reaproveitadas;
- criar campos paralelos/temporários “só para funcionar” sem contrato canônico;
- duplicar fonte de verdade para o mesmo estado sem autorização explícita.

Regra:
- cada domínio escreve apenas em seus campos canônicos;
- se não existir campo canônico adequado, parar e reportar;
- só criar novo campo com autorização e declaração explícita de impacto.

MAPEAMENTO OBRIGATÓRIO DE LEITURA/ESCRITA

Antes de implementar qualquer patch que toque persistência, o agente deve listar:
- quais tabelas serão lidas;
- quais colunas serão lidas;
- quais tabelas serão escritas;
- quais colunas serão escritas;
- se existe criação nova de tabela/coluna;
- se existe necessidade de migração/manual action no Supabase.

Se não souber responder com segurança, deve parar em READ-ONLY e declarar a incerteza.

PROVA DE CAMPO VIVO — OBRIGATÓRIO

Não mexer em coluna/tabela só porque ela existe.
Antes de alterar persistência, confirmar se o campo está:
- realmente sendo lido;
- realmente sendo escrito;
- pertencendo ao fluxo ativo atual.

Se houver dúvida entre legado/resquício e trilho ativo, fazer diagnóstico READ-ONLY primeiro.

FUNIL / DOCS SAFETY GUARD — OBRIGATÓRIO

Em qualquer tarefa que toque docs ou funil:
- não alterar gates, nextStage, ordem do trilho ou regra de negócio sem autorização explícita;
- não trocar pendência principal automaticamente por documento fora de ordem;
- documento fora de ordem reconhecido deve entrar no checklist correto, sem reordenar o funil por conta própria;
- se OCR/parser não tiver confiança suficiente, solicitar confirmação textual do cliente antes de persistir o tipo do documento;
- não criar novos status, campos, estruturas paralelas ou JSONs de docs sem mapear primeiro os campos canônicos já vivos;
- não transformar fallback em persistência improvisada;
- não salvar “provisoriamente” em campo inadequado.

PATCH SAFETY GUARD — OBRIGATÓRIO

É proibido:
- refatorar fora do necessário;
- renomear por estética;
- mover bloco funcional sem necessidade comprovada;
- alterar comportamento de algo já funcional sem prova de causa;
- misturar correção com melhoria opcional no mesmo PR.

Toda correção deve seguir:
diagnóstico -> prova da causa -> patch mínimo -> smoke test -> report final.

PROMPT CANÔNICO (INÍCIO de tarefa) — “Diagnóstico → PR”

Cole isso inteiro para o Codex:

[CODEx_CANONICAL_V1 — INÍCIO]
Você está trabalhando no repositório Enova.

Objetivo
<descreva a tarefa em 1–3 linhas, bem específico>

Escopo (OBRIGATÓRIO)
Este PR é APENAS: (Worker-only OU Panel-only OU Workflows-only OU Docs-only).
Proibido editar qualquer coisa fora desse escopo.

Fluxo obrigatório (sem pular)

Fase 1 — DIAGNÓSTICO READ-ONLY (sem commits)

1. Identifique exatamente onde mexer (arquivos + âncoras/trechos).
2. Explique a causa do problema (1 parágrafo).
3. Liste o plano de patch mínimo (bullet points).
4. Liste smoke tests objetivos.
5. Liste explicitamente:
   - tabelas/colunas lidas;
   - tabelas/colunas escritas;
   - se haverá criação nova de tabela/coluna;
   - se haverá ação manual necessária no Supabase.
6. Pare aqui e aguarde eu dizer: “OK, pode implementar”.

Fase 2 — IMPLEMENTAÇÃO (somente após meu OK)

1. Implementar patch cirúrgico (sem refatorar, sem renomear por estética).
2. CRUCIAL: criar/usar UMA PR única e manter o mesmo branch até finalizar.
3. Rodar os smoke tests e registrar o resultado.
4. Entregar report final (obrigatório):
   - PR # e branch
   - hash do commit
   - arquivos alterados
   - resumo do diff
   - smoke tests executados + resultado
   - rollback: git revert
   - tabelas/colunas lidas/escritas
   - novas colunas/tabelas criadas: sim/não
   - precisa ação manual no Supabase: sim/não
   - houve mudança de contrato/schema: sim/não

Proibição

- Não criar PR nova para correção pequena.
- Não “dizer que fez” sem commit.
- Não renomear tabela/coluna de Supabase sem autorização explícita.
- Não criar coluna/tabela nova sem declarar explicitamente isso no diagnóstico e no report final.
- Não salvar dados de docs/funil em campos improvisados ou fora do contrato canônico.
[CODEx_CANONICAL_V1 — FIM]

PROMPT DE FOLLOW-UP (Atualizar PR existente)

Use isso toda vez que precisar de ajuste dentro da PR já aberta.

[CODEx_CANONICAL_V1 — FOLLOW-UP]
Trabalhe na PR #<NÚMERO> e no mesmo branch dela (não crie PR nova).

Ajuste solicitado
<descreva>

Obrigatório

Faça UM NOVO COMMIT no mesmo branch da PR.

No final, me entregue:
- hash do novo commit
- arquivos alterados
- resumo do diff
- smoke test(s) executado(s)
- rollback: git revert
- tabelas/colunas lidas/escritas
- novas colunas/tabelas criadas: sim/não
- precisa ação manual no Supabase: sim/não
- houve mudança de contrato/schema: sim/não

Regra de verdade
Se você não fornecer hash de commit, considero não aplicado.
[FIM]

PROMPT DE COMMIT ENFORCER (se ele falar que fez sem commit)

[CODEx_CANONICAL_V1 — COMMIT ENFORCER]
Você afirmou que aplicou mudanças, mas não há commit novo visível.

Se você tem permissão de push, faça o commit agora e me dê o hash.
Se você NÃO tem permissão, diga explicitamente:
“não consigo commitar/push neste repo/branch”
e explique o motivo (ex.: permissões, branch protegido, modo read-only).

Sem hash = não feito.
