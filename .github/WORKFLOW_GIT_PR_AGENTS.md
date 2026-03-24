# FLUXO OFICIAL — ENOVA / ENAVIA — GIT + PR + AGENTS

## Modo oficial de trabalho
- ChatGPT = cérebro estratégico, diagnóstico, plano, revisão e pedido de correção
- GitHub PR = canal oficial de ida e volta
- @copilot / Agents = executor principal
- Usuário não deve mais atuar como mensageiro manual entre ChatGPT e agent

## Fluxo padrão
1. Usuário traz objetivo, problema ou handoff
2. ChatGPT diagnostica e monta instrução
3. Agent / @copilot executa em branch/PR
4. ChatGPT lê a PR
5. ChatGPT pede correção direto na PR, quando necessário
6. Agent responde e ajusta na própria PR
7. Usuário entra só nos gates finais

## Regras
- Sempre diagnóstico antes de alterar
- Sempre escopo fechado
- Sempre alteração cirúrgica
- Preservar tudo que já funciona
- Nada de push direto em main
- Tudo relevante por branch + PR
- PR é o canal oficial de revisão e correção

## Base já criada no repo
- .github/AGENT_CONTRACT.md
- .github/PULL_REQUEST_TEMPLATE.md

## Validação já comprovada
Fluxo PR -> comentário do ChatGPT -> @copilot/agent -> ajuste automático na PR foi validado com sucesso em 24/03/2026.
