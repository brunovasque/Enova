# Enova

Worker Cloudflare + painel de atendimento ENOVA (WhatsApp-like dark).

## Diagnóstico READ-ONLY (estado atual)

- Worker principal em `Enova worker.js` (webhook/funil/admin).
- Deploy do Worker via `.github/workflows/deploy.yml` + `wrangler.toml` (`main = "Enova worker.js"`).
- Supabase acessado no Worker via proxy (`VERCEL_PROXY_URL`) e no painel por rotas server-side Next.

## Estrutura

- `Enova worker.js`: worker principal (webhook + funil + admin API)
- `wrangler.toml`: configuração do deploy do worker
- `.github/workflows/deploy.yml`: pipeline de deploy do worker
- `supabase/migrations/*`: migrations SQL oficiais v1
- `panel/`: painel Next.js (dark mode) para inbox/chat/dashboard/health
- `scripts/smoke-tests.ps1`: smoke tests canônicos PowerShell

## Migrations Supabase (v1)

1. Criar `enova_messages` (timeline completa in/out).
2. Adicionar flags em `enova_state` (`bot_paused`, `paused_at`, `paused_by`, `human_notes`, `priority`).
   - Fallback automático: criar `enova_conversation_flags` se `enova_state` não existir.

## Admin API (Worker)

Todas as respostas em JSON.
Header obrigatório: `x-enova-admin-key: <ENOVA_ADMIN_KEY>`.

- `POST /__admin__/pause` body `{ wa_id, paused }`
- `POST /__admin__/send` body `{ wa_id, text }`
- `POST /__admin__/reset` body `{ wa_id }`
- `GET /__build` retorna `{ ok:true, build:"..." }`

## Variáveis de ambiente

### Worker
- `META_API_VERSION`
- `PHONE_NUMBER_ID`
- `META_VERIFY_TOKEN`
- `WHATS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE`
- `ENOVA_ADMIN_KEY`
- `VERCEL_PROXY_URL`

### Painel (`panel/`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE`
- `WORKER_BASE_URL`
- `ENOVA_ADMIN_KEY`

## Rodar painel

```bash
cd panel
npm install
npm run dev
```

## Smoke tests (PowerShell)

```powershell
./scripts/smoke-tests.ps1 -base "https://nv-enova.brunovasque.workers.dev" -key "SUA_ENOVA_ADMIN_KEY" -wa "554188609297"
```

## Checklist funcional

- [ ] Inbox em dark mode com horário da última mensagem
- [ ] Chat com horário em todas as mensagens
- [ ] Pause=true bloqueia resposta do bot no inbound
- [ ] Send manual envia e grava na timeline
- [ ] Resume retoma respostas automáticas
- [ ] Reset funil reinicia estado da conversa

## Rollback

1. Reverter commit da mudança (`git revert <sha>`).
2. Reaplicar deploy worker (`wrangler deploy --keep-vars`).
3. Se necessário, desconsiderar painel (`panel/`) sem impacto no worker atual.
4. Migrations: em incidente, desabilitar uso no app antes de dropar colunas/tabelas em janela controlada.
