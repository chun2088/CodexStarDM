--
-- Initial schema for application domain resources: users, wallets, coupons,
-- QR tokens, subscriptions, and supporting entities.
--

begin;

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'merchant', 'customer');

create type public.coupon_discount_type as enum ('percentage', 'fixed');

create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'canceled');

create type public.subscription_interval as enum ('day', 'week', 'month', 'year');

create type public.wallet_transaction_type as enum ('credit', 'debit');

create table public.users (
  id uuid primary key,
  email text not null unique,
  role public.user_role not null default 'customer',
  full_name text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_not_empty check (char_length(email) > 0)
);

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  currency text not null default 'USD',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_currency_not_empty check (char_length(currency) > 0)
);

create unique index wallets_user_id_key on public.wallets(user_id);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  transaction_type public.wallet_transaction_type not null,
  description text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index wallet_transactions_wallet_id_idx on public.wallet_transactions(wallet_id);
create index wallet_transactions_created_at_idx on public.wallet_transactions(created_at);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'USD',
  billing_interval public.subscription_interval not null default 'month',
  interval_count integer not null default 1 check (interval_count > 0),
  trial_period_days integer check (trial_period_days >= 0),
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.users(id) on delete cascade,
  code text not null unique,
  name text,
  description text,
  discount_type public.coupon_discount_type not null default 'percentage',
  discount_value numeric(12, 2) not null check (discount_value >= 0),
  max_redemptions integer check (max_redemptions >= 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  start_at timestamptz,
  end_at timestamptz,
  is_active boolean not null default true,
  is_stackable boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_valid_window check (end_at is null or start_at is null or end_at > start_at),
  constraint coupons_percent_limit check (
    discount_type <> 'percentage' or discount_value <= 100
  )
);

create index coupons_merchant_id_idx on public.coupons(merchant_id);
create index coupons_active_window_idx on public.coupons(is_active, start_at, end_at);

create table public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  coupon_id uuid references public.coupons(id) on delete set null,
  token text not null unique,
  expires_at timestamptz,
  redeemed_at timestamptz,
  is_single_use boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_tokens_expiration_check check (expires_at is null or expires_at > created_at)
);

create index qr_tokens_user_id_idx on public.qr_tokens(user_id);
create index qr_tokens_coupon_id_idx on public.qr_tokens(coupon_id);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  qr_token_id uuid references public.qr_tokens(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index coupon_redemptions_coupon_id_idx on public.coupon_redemptions(coupon_id);
create index coupon_redemptions_user_id_idx on public.coupon_redemptions(user_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status public.subscription_status not null default 'trialing',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_check check (
    current_period_end is null or current_period_end > current_period_start
  )
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);
create index subscriptions_plan_id_idx on public.subscriptions(plan_id);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_public_users_updated_at
before update on public.users
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_wallets_updated_at
before update on public.wallets
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_subscription_plans_updated_at
before update on public.subscription_plans
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_coupons_updated_at
before update on public.coupons
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_qr_tokens_updated_at
before update on public.qr_tokens
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger set_public_subscriptions_updated_at
before update on public.subscriptions
for each row
execute procedure public.set_current_timestamp_updated_at();

create or replace function public.current_user_role()
returns public.user_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  matched_role public.user_role;
begin
  select u.role
    into matched_role
  from public.users u
  where u.id = auth.uid()
  limit 1;

  return matched_role;
end;
$$;

create or replace function public.current_user_has_role(target_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = target_role, false);
$$;

create or replace function public.current_user_has_any_role(target_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(target_roles), false);
$$;

create or replace function public.wallet_belongs_to_auth(p_wallet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wallets w
    where w.id = p_wallet_id
      and w.user_id = auth.uid()
  );
$$;

create or replace function public.coupon_belongs_to_auth(p_coupon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coupons c
    where c.id = p_coupon_id
      and (
        c.merchant_id = auth.uid()
        or public.current_user_has_role('admin')
      )
  );
$$;

alter table public.users enable row level security;
alter table public.users force row level security;

create policy "Users can view their own profile" on public.users
for select
using (auth.uid() = id);

create policy "Admins can view all profiles" on public.users
for select
using (public.current_user_has_role('admin'));

create policy "Users can insert their own profile" on public.users
for insert
with check (auth.uid() = id);

create policy "Admins can insert profiles" on public.users
for insert
with check (public.current_user_has_role('admin'));

create policy "Users can update their own profile" on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Admins can manage all profiles" on public.users
for update
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

create policy "Admins can delete users" on public.users
for delete
using (public.current_user_has_role('admin'));

alter table public.wallets enable row level security;
alter table public.wallets force row level security;

create policy "Wallet owners can read" on public.wallets
for select
using (auth.uid() = user_id);

create policy "Admins can read all wallets" on public.wallets
for select
using (public.current_user_has_role('admin'));

create policy "Wallet owners can insert" on public.wallets
for insert
with check (auth.uid() = user_id);

create policy "Wallet owners can update" on public.wallets
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Admins can manage wallets" on public.wallets
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

alter table public.wallet_transactions enable row level security;
alter table public.wallet_transactions force row level security;

create policy "Wallet owners can read transactions" on public.wallet_transactions
for select
using (public.wallet_belongs_to_auth(wallet_id));

create policy "Wallet owners can create transactions" on public.wallet_transactions
for insert
with check (public.wallet_belongs_to_auth(wallet_id));

create policy "Wallet owners can update transactions" on public.wallet_transactions
for update
using (public.wallet_belongs_to_auth(wallet_id))
with check (public.wallet_belongs_to_auth(wallet_id));

create policy "Admins can manage transactions" on public.wallet_transactions
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

alter table public.subscription_plans enable row level security;
alter table public.subscription_plans force row level security;

create policy "Public can view subscription plans" on public.subscription_plans
for select
using (true);

create policy "Admins can manage subscription plans" on public.subscription_plans
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

alter table public.coupons enable row level security;
alter table public.coupons force row level security;

create policy "Coupon visibility" on public.coupons
for select
using (
  public.current_user_has_role('admin')
  or (public.current_user_has_role('merchant') and merchant_id = auth.uid())
  or (
    public.current_user_has_role('customer')
    and is_active
    and (start_at is null or start_at <= now())
    and (end_at is null or end_at >= now())
  )
);

create policy "Merchants can create coupons" on public.coupons
for insert
with check (
  public.current_user_has_role('admin')
  or (public.current_user_has_role('merchant') and merchant_id = auth.uid())
);

create policy "Merchants can update coupons" on public.coupons
for update
using (
  public.current_user_has_role('admin')
  or (public.current_user_has_role('merchant') and merchant_id = auth.uid())
)
with check (
  public.current_user_has_role('admin')
  or (public.current_user_has_role('merchant') and merchant_id = auth.uid())
);

create policy "Admins and merchants can delete coupons" on public.coupons
for delete
using (
  public.current_user_has_role('admin')
  or (public.current_user_has_role('merchant') and merchant_id = auth.uid())
);

alter table public.qr_tokens enable row level security;
alter table public.qr_tokens force row level security;

create policy "Users can read their QR tokens" on public.qr_tokens
for select
using (
  auth.uid() = user_id
  or public.current_user_has_role('admin')
  or (coupon_id is not null and public.coupon_belongs_to_auth(coupon_id))
);

create policy "Users can create QR tokens" on public.qr_tokens
for insert
with check (
  auth.uid() = user_id
  or public.current_user_has_role('admin')
  or (coupon_id is not null and public.coupon_belongs_to_auth(coupon_id))
);

create policy "Users can update their QR tokens" on public.qr_tokens
for update
using (
  auth.uid() = user_id
  or public.current_user_has_role('admin')
  or (coupon_id is not null and public.coupon_belongs_to_auth(coupon_id))
)
with check (
  auth.uid() = user_id
  or public.current_user_has_role('admin')
  or (coupon_id is not null and public.coupon_belongs_to_auth(coupon_id))
);

create policy "Admins can delete QR tokens" on public.qr_tokens
for delete
using (public.current_user_has_role('admin'));

alter table public.coupon_redemptions enable row level security;
alter table public.coupon_redemptions force row level security;

create policy "Users can read coupon redemptions" on public.coupon_redemptions
for select
using (
  public.current_user_has_role('admin')
  or auth.uid() = user_id
  or public.coupon_belongs_to_auth(coupon_id)
);

create policy "Users can create coupon redemptions" on public.coupon_redemptions
for insert
with check (
  public.current_user_has_role('admin')
  or auth.uid() = user_id
  or public.coupon_belongs_to_auth(coupon_id)
);

create policy "Admins can manage coupon redemptions" on public.coupon_redemptions
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

create policy "Users can read their subscriptions" on public.subscriptions
for select
using (auth.uid() = user_id);

create policy "Users can create subscriptions" on public.subscriptions
for insert
with check (auth.uid() = user_id);

create policy "Users can update their subscriptions" on public.subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Admins can manage subscriptions" on public.subscriptions
for all
using (public.current_user_has_role('admin'))
with check (public.current_user_has_role('admin'));

commit;
