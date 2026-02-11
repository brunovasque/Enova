# Diagnóstico READ-ONLY (estado inicial)

## Arquivos existentes e deploy

- `Enova worker.js` já era o entrypoint do worker e concentrava webhook/funil.
- `wrangler.toml` define `main = "Enova worker.js"`, mantendo deploy de worker único.
- `.github/workflows/deploy.yml` faz deploy em push na `main` com `wrangler deploy --keep-vars`.

## Lacunas encontradas

- Não havia migrations versionadas para timeline de mensagens e flags de pausa.
- Não havia rotas admin protegidas para pause/send/reset.
- Não havia painel web no repositório.

## Estratégia aplicada

1. Adicionar migrations SQL sem tocar no fluxo de deploy existente do worker.
2. Incluir rotas admin e gate de pausa diretamente no worker atual, com respostas JSON.
3. Criar app `panel/` (Next.js dark) isolado, sem alterar pipeline de deploy do worker.
