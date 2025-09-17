begin;

create table if not exists public.magic_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  redirect_to text,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint magic_link_tokens_email_not_empty check (char_length(email) > 0)
);

create index if not exists magic_link_tokens_email_idx on public.magic_link_tokens (email);
create index if not exists magic_link_tokens_expires_at_idx on public.magic_link_tokens (expires_at);
create index if not exists magic_link_tokens_consumed_at_idx on public.magic_link_tokens (consumed_at);

commit;
