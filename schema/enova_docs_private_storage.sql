alter table public.enova_docs
  add column if not exists private_object_key text;

alter table public.enova_docs
  add column if not exists private_materialized_at timestamptz;
