# Enova

# BINDINGS

## Secrets (Cloudflare Worker)
- `CLOUDFLARE_ACCOUNT_ID` (GitHub Actions secret)
- `CLOUDFLARE_API_TOKEN` (GitHub Actions secret)
- `WHATS_TOKEN`
- `SUPABASE_SERVICE_ROLE`

## Vars (Worker)
- `META_API_VERSION`
- `PHONE_NUMBER_ID`
- `META_VERIFY_TOKEN`
- `SUPABASE_URL`
- `ENOVA_DELAY_MS`
- `TELEMETRIA_LEVEL`

- # CRON

## Produção (PROD)
- Agendamento: `0 12 * * *`
- Objetivo: follow-up base fria.

## Teste (TEST)
- Cron desligado.

## Dependência técnica
- O cron depende do handler `scheduled()` já existente no worker.
- O `scheduled()` atual apenas loga execução e chama `runColdFollowupBatch()` em modo stub, sem impactar o `fetch()`.
- A ativação/desativação de cron será feita pela Cloudflare UI (não via `wrangler.toml`).

# SMOKE TESTS

## GET webhook verification (curl)
```bash
curl -i "https://<worker-url>/webhook/meta?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123"
```

## POST webhook (curl)
```bash
curl -i -X POST "https://<worker-url>/webhook/meta" \
  -H "Content-Type: application/json" \
  -d '{"entry":[]}'
```

## PowerShell
```powershell
Invoke-WebRequest -Method GET "https://<worker-url>/webhook/meta?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123"

Invoke-WebRequest -Method POST "https://<worker-url>/webhook/meta" -ContentType "application/json" -Body '{"entry":[]}'
