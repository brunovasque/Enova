create extension if not exists pgcrypto;

create table if not exists public.enova_messages (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  direction text not null check (direction in ('in', 'out')),
  text text,
  ts timestamptz not null default now(),
  stage text,
  source text,
  meta jsonb
);

create index if not exists idx_enova_messages_wa_id_ts_desc
  on public.enova_messages (wa_id, ts desc);

create index if not exists idx_enova_messages_ts_desc
  on public.enova_messages (ts desc);
