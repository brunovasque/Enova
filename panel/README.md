# Enova Panel

Painel em **Next.js (App Router)** localizado em `/panel`.

## Requisitos

- Node.js 18+
- npm 9+

## Instalação

```bash
cd panel
npm install
```

## Execução local

```bash
npm run dev
```

## Build de produção

```bash
npm run build
npm run start
```

## Variáveis de ambiente

Crie `.env.local` em `/panel` e defina:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE`
- `WORKER_BASE_URL`
- `ENOVA_ADMIN_KEY`

> Não commitar valores sensíveis.
