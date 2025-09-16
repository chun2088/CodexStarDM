begin;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_type_idx on public.events (type);
create index if not exists events_created_at_idx on public.events (created_at);

commit;
