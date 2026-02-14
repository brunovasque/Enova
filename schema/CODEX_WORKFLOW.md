CODEX WORKFLOW — ENOVA (CANÔNICO)
Regras absolutas
1 tarefa = 1 PR = 1 branch até terminar
Nunca misturar escopos no mesmo PR (Worker OU Panel OU Workflows OU Docs)
Toda mudança precisa de commit real (hash obrigatório)
Sem hash = não feito
Resposta final deve incluir: PR#, branch, commit hash, arquivos alterados, smoke tests, rollback
Processo padrão
Fase 1 — Diagnóstico (READ-ONLY)
localizar arquivos e âncoras
explicar causa
plano de patch mínimo
smoke tests
parar e esperar "OK, pode implementar"
Fase 2 — Implementação (após OK)
patch cirúrgico
commit no MESMO branch da PR (não criar PR nova)
rodar smoke tests
report final obrigatório
Prompts canônicos
Prompt de INÍCIO (Diagnóstico → PR)
Roteiro de trabalho (padrão Codex — Enova) Regras fixas (não negociar)
1 tarefa = 1 PR = 1 branch até terminar.
Nunca misturar escopos no mesmo PR:
PR-Worker (Cloudflare Worker) OU PR-Painel (Next.js) OU PR-Workflows.
Toda mudança precisa de commit real no branch da PR.
Se não tiver hash de commit novo, NÃO foi feito.
Cada resposta do Codex tem que terminar com:
hash do commit
lista de arquivos alterados
passos de teste executados
plano de rollback (ex.: git revert )
Prompt Canônico (INÍCIO de tarefa) — “Diagnóstico → PR”
Cole isso inteiro para o Codex:
[CODEx_CANONICAL_V1 — INÍCIO] Você está trabalhando no repositório Enova.
Objetivo
<descreva a tarefa em 1–3 linhas, bem específico>
Escopo (OBRIGATÓRIO)
Este PR é APENAS: (Worker-only OU Panel-only OU Workflows-only).
Proibido editar qualquer coisa fora desse escopo.
Fluxo obrigatório (sem pular) Fase 1 — DIAGNÓSTICO READ-ONLY (sem commits)
Identifique exatamente onde mexer (arquivos + âncoras/trechos).
Explique a causa do problema (1 parágrafo).
Liste o plano de patch mínimo (bullet points).
Liste smoke tests objetivos.
Pare aqui e aguarde eu dizer: “OK, pode implementar”.
Fase 2 — IMPLEMENTAÇÃO (somente após meu OK)
Implementar patch cirúrgico (sem refatorar, sem renomear por estética).
CRUCIAL: criar/usar UMA PR única e manter o mesmo branch até finalizar.
Rodar os smoke tests e registrar o resultado.
Regras de commit/PR (CRÍTICAS)
Você deve fazer commit real de qualquer alteração.
Ao final, você deve responder com:
PR # e branch
hash do commit
arquivos alterados
resumo do diff
smoke tests executados + resultado
rollback: git revert
Proibição
Não criar PR nova para correção pequena.
Não “dizer que fez” sem commit.
[CODEx_CANONICAL_V1 — FIM]
Prompt de FOLLOW-UP (Atualizar PR existente)
Prompt Canônico (FOLLOW-UP) — “Atualize a mesma PR com commit adicional”
Use isso toda vez que precisar de ajuste/alteração dentro da PR já aberta.
[CODEx_CANONICAL_V1 — FOLLOW-UP] Trabalhe na PR # e no mesmo branch dela (não crie PR nova).
Ajuste solicitado Obrigatório
Faça UM NOVO COMMIT no mesmo branch da PR.
No final, me entregue:
hash do novo commit
arquivos alterados
resumo do diff
smoke test(s) executado(s)
rollback: git revert
Regra de verdade
Se você não fornecer hash de commit, considero não aplicado.
[FIM]
Prompt de COMMIT ENFORCER (se ele falar que fez sem commit)
[CODEx_CANONICAL_V1 — COMMIT ENFORCER] Você afirmou que aplicou mudanças, mas não há commit novo visível.
Se você tem permissão de push, faça o commit agora e me dê o hash.
Se você NÃO tem permissão, diga explicitamente: “não consigo commitar/push neste repo/branch” e explique o motivo (ex.: permissões, branch protegido, modo read-only). Sem hash = não feito.
