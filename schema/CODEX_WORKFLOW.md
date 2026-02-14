# CODEX WORKFLOW — ENOVA (CANÔNICO)

## HEADER FIXO (colar antes de qualquer tarefa)
Leia `schema/CODEX_WORKFLOW.md` e siga como regra absoluta.  
Confirme que leu e diga: **WORKFLOW_ACK: ok**.

Regras:
- **1 tarefa = 1 PR = 1 branch** até terminar.
- Se já existir PR aberta para o assunto, **reusar o MESMO branch** e fazer commits adicionais na mesma PR (não criar PR nova).
- Se você não conseguir commitar/push, você deve declarar isso explicitamente.
- Todo follow-up deve gerar commit adicional no mesmo branch da PR.
- Resposta final deve incluir sempre: **PR#, branch, commit hash, smoke tests, rollback**.
- Nunca misturar escopos no mesmo PR (**Worker OU Panel OU Workflows OU Docs**).
- Toda mudança precisa de commit real (hash obrigatório). **Sem hash = não feito**.

---

## CAMADA 3 — BLOQUEIO AUTOMÁTICO (merge bloqueado se não cumprir)
Regra: PR que não cumprir checklist **NÃO passa**.

O repositório tem:
- GitHub Action: **PR Checklist Guard** (valida o CORPO/descrição da PR)
- Template padrão: `.github/PULL_REQUEST_TEMPLATE.md` (ajuda você a preencher)

Campos obrigatórios no corpo da PR:
- PR:
- Branch:
- Commit:
- Smoke tests:
- Rollback:

Importante:
- Se o check falhar, geralmente **NÃO precisa novo commit**.
  Basta **EDITAR A DESCRIÇÃO (corpo) DA PR**, preencher os campos e salvar.
- Não confundir **comentário** com **descrição da PR**.
  Comentário não resolve o check; a validação lê o corpo/descrição.

---

## Processo padrão

### Fase 1 — Diagnóstico (READ-ONLY)
- localizar arquivos e âncoras
- explicar causa
- plano de patch mínimo
- smoke tests
- parar e esperar: **"OK, pode implementar"**

### Fase 2 — Implementação (após OK)
- patch cirúrgico (sem refatorar, sem renomear por estética)
- commit no MESMO branch da PR (não criar PR nova)
- rodar smoke tests
- report final obrigatório

---

## Prompt Canônico (INÍCIO de tarefa) — “Diagnóstico → PR”
Cole isso inteiro para o Codex:

[CODEx_CANONICAL_V1 — INÍCIO] Você está trabalhando no repositório Enova.

Objetivo
<descreva a tarefa em 1–3 linhas, bem específico>

Escopo (OBRIGATÓRIO)
Este PR é APENAS: (Worker-only OU Panel-only OU Workflows-only OU Docs-only).
Proibido editar qualquer coisa fora desse escopo.

Fluxo obrigatório (sem pular)

Fase 1 — DIAGNÓSTICO READ-ONLY (sem commits)
1) Identifique exatamente onde mexer (arquivos + âncoras/trechos).
2) Explique a causa do problema (1 parágrafo).
3) Liste o plano de patch mínimo (bullet points).
4) Liste smoke tests objetivos.
5) Pare aqui e aguarde eu dizer: “OK, pode implementar”.

Fase 2 — IMPLEMENTAÇÃO (somente após meu OK)
1) Implementar patch cirúrgico (sem refatorar, sem renomear por estética).
2) CRUCIAL: criar/usar UMA PR única e manter o mesmo branch até finalizar.
3) Rodar os smoke tests e registrar o resultado.
4) Entregar report final (obrigatório):
   - PR # e branch
   - hash do commit
   - arquivos alterados
   - resumo do diff
   - smoke tests executados + resultado
   - rollback: git revert <hash>

Proibição
- Não criar PR nova para correção pequena.
- Não “dizer que fez” sem commit.

[CODEx_CANONICAL_V1 — FIM]

---

## Prompt de FOLLOW-UP (Atualizar PR existente)
Use isso toda vez que precisar de ajuste dentro da PR já aberta.

[CODEx_CANONICAL_V1 — FOLLOW-UP] Trabalhe na PR #<NÚMERO> e no mesmo branch dela (não crie PR nova).

Ajuste solicitado
<descreva o ajuste>

Obrigatório
- Faça UM NOVO COMMIT no mesmo branch da PR.

No final, me entregue:
- hash do novo commit
- arquivos alterados
- resumo do diff
- smoke test(s) executado(s)
- rollback: git revert <hash>

Regra de verdade
Se você não fornecer hash de commit, considero não aplicado.

[FIM]

---

## Prompt de COMMIT ENFORCER (se ele falar que fez sem commit)
[CODEx_CANONICAL_V1 — COMMIT ENFORCER]
Você afirmou que aplicou mudanças, mas não há commit novo visível.

Se você tem permissão de push, faça o commit agora e me dê o hash.
Se você NÃO tem permissão, diga explicitamente:
“não consigo commitar/push neste repo/branch”
e explique o motivo (ex.: permissões, branch protegido, modo read-only).

Sem hash = não feito.
