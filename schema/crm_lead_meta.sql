create table if not exists public.crm_lead_meta (
  wa_id text primary key,
  nome text,
  telefone text,
  lead_pool text not null check (lead_pool in ('COLD_POOL', 'WARM_POOL', 'HOT_POOL')),
  lead_temp text not null check (lead_temp in ('COLD', 'WARM', 'HOT')),
  lead_source text,
  tags jsonb not null default '[]'::jsonb,
  obs_curta text,
  import_ref text,
  auto_outreach_enabled boolean not null default true,
  is_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_meta_tags_array check (jsonb_typeof(tags) = 'array')
);

-- manual action required in Supabase if table already exists:
-- alter table public.crm_lead_meta add column if not exists nome text;
-- alter table public.crm_lead_meta add column if not exists telefone text;
-- legacy leads migration (one-time): enable existing leads for outreach
-- update public.crm_lead_meta set auto_outreach_enabled = true where auto_outreach_enabled = false;

create index if not exists crm_lead_meta_pool_idx
  on public.crm_lead_meta (lead_pool);

create index if not exists crm_lead_meta_warmup_idx
  on public.crm_lead_meta (is_paused, auto_outreach_enabled, lead_pool, lead_temp, updated_at);
