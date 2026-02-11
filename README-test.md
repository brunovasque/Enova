# Smoke test: /api/health worker check

Pré-requisitos:
- `WORKER_BASE_URL` configurada com URL completa (`https://...`).
- `ENOVA_ADMIN_KEY` configurada.

Passos:
1. Chame `GET /api/health?ts=1`.
2. Verifique no JSON que:
   - `worker_ok` é `true`.
   - `worker.endpointTested` é `"/__admin__/health"`.
   - `worker.status` é `200`.
