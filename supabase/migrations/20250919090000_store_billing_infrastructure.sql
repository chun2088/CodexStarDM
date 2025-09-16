begin;

create type public.store_subscription_status as enum ('active', 'grace', 'canceled');

create table public.store_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references public.users(id) on delete set null,
  max_uses integer check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_invite_codes_valid_expiration check (
    expires_at is null or expires_at > created_at
  )
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  invite_code_id uuid references public.store_invite_codes(id) on delete set null,
  name text not null,
  slug text,
  subscription_status public.store_subscription_status not null default 'grace',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_name_not_empty check (char_length(name) > 0)
);

create unique index stores_owner_id_key on public.stores(owner_id);
create unique index stores_slug_key on public.stores(slug) where slug is not null;

create table public.store_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null default 'toss',
  billing_key text not null unique,
  customer_key text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index store_billing_profiles_store_id_idx on public.store_billing_profiles(store_id);
create index store_billing_profiles_status_idx on public.store_billing_profiles(status);

create table public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  billing_profile_id uuid references public.store_billing_profiles(id) on delete set null,
  status public.store_subscription_status not null default 'grace',
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_subscriptions_period_check check (
    current_period_end is null or current_period_start is null or current_period_end > current_period_start
  )
);

create unique index store_subscriptions_store_id_key on public.store_subscriptions(store_id);

alter table public.coupons
  add column store_id uuid references public.stores(id) on delete set null;

create index coupons_store_id_idx on public.coupons(store_id);

create trigger set_public_store_invite_codes_updated_at
before update on public.store_invite_codes
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_stores_updated_at
before update on public.stores
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_store_billing_profiles_updated_at
before update on public.store_billing_profiles
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_store_subscriptions_updated_at
before update on public.store_subscriptions
for each row
execute procedure public.set_current_timestamp_updated_at();

alter table public.store_invite_codes enable row level security;
alter table public.store_invite_codes force row level security;

create policy "Admins can manage invite codes" on public.store_invite_codes
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

alter table public.stores enable row level security;
alter table public.stores force row level security;

create policy "Store owners can read their store" on public.stores
for select
using (auth.uid() = owner_id);

create policy "Store owners can update their store" on public.stores
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Admins can manage stores" on public.stores
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

alter table public.store_billing_profiles enable row level security;
alter table public.store_billing_profiles force row level security;

create policy "Admins can manage billing profiles" on public.store_billing_profiles
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

alter table public.store_subscriptions enable row level security;
alter table public.store_subscriptions force row level security;

create policy "Admins can manage store subscriptions" on public.store_subscriptions
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

commit;
