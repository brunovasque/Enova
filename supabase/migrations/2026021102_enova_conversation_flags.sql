do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'enova_state'
  ) then
    alter table public.enova_state
      add column if not exists bot_paused boolean default false,
      add column if not exists paused_at timestamptz null,
      add column if not exists paused_by text null,
      add column if not exists human_notes text null,
      add column if not exists priority text null;
  else
    create table if not exists public.enova_conversation_flags (
      wa_id text primary key,
      bot_paused boolean default false,
      paused_at timestamptz null,
      paused_by text null,
      human_notes text null,
      priority text null,
      updated_at timestamptz not null default now()
    );
  end if;
end $$;
