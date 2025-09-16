-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Enum types
create type public.user_role as enum ('admin', 'merchant', 'customer', 'support');
create type public.coupon_status as enum ('draft', 'scheduled', 'active', 'expired', 'suspended', 'redeemed_out');
create type public.coupon_discount_type as enum ('percentage', 'fixed_amount', 'bogo', 'free_item');
create type public.wallet_status as enum ('active', 'suspended', 'closed');
create type public.wallet_transaction_type as enum ('credit', 'debit', 'hold', 'release');
create type public.qr_token_status as enum ('issued', 'redeemed', 'expired', 'revoked');
create type public.redemption_status as enum ('pending', 'redeemed', 'rejected');

-- Timestamp maintenance helper
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- Core tables
create table public.users (
  id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  display_name text,
  phone text,
  role public.user_role not null default 'customer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_users_updated_at
before update on public.users
for each row
execute function public.touch_updated_at();

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  currency text not null default 'USD',
  status public.wallet_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, currency)
);

create trigger trg_wallets_updated_at
before update on public.wallets
for each row execute function public.touch_updated_at();

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.users(id) on delete cascade,
  code text not null unique,
  title text not null,
  description text,
  discount_type public.coupon_discount_type not null,
  discount_value numeric(12,2) check (discount_value >= 0),
  min_spend numeric(12,2) check (min_spend >= 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  check (end_at > start_at),
  total_available integer check (total_available is null or total_available >= 0),
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
  metadata jsonb not null default '{}'::jsonb,
  status public.coupon_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_coupons_updated_at
before update on public.coupons
for each row execute function public.touch_updated_at();

create table public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  issued_to uuid references public.users(id) on delete set null,
  token text not null unique,
  status public.qr_token_status not null default 'issued',
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  qr_token_id uuid references public.qr_tokens(id) on delete set null,
  status public.redemption_status not null default 'pending',
  redeemed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  coupon_id uuid references public.coupons(id) on delete set null,
  redemption_id uuid references public.coupon_redemptions(id) on delete set null,
  txn_type public.wallet_transaction_type not null,
  amount numeric(12,2) not null check (amount >= 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_wallet_transactions_wallet_id on public.wallet_transactions(wallet_id);
create index idx_wallet_transactions_redemption_id on public.wallet_transactions(redemption_id);
create index idx_coupons_merchant_id on public.coupons(merchant_id);
create index idx_qr_tokens_coupon_id on public.qr_tokens(coupon_id);
create index idx_coupon_redemptions_coupon_id on public.coupon_redemptions(coupon_id);
create index idx_coupon_redemptions_user_id on public.coupon_redemptions(user_id);

-- Role helper functions
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
as $$
  select role
  from public.users
  where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

create or replace function public.is_merchant()
returns boolean
language sql
stable
as $$
  select coalesce((select role in ('merchant', 'admin', 'support') from public.users where id = auth.uid()), false);
$$;

create or replace function public.is_customer()
returns boolean
language sql
stable
as $$
  select coalesce((select role = 'customer' from public.users where id = auth.uid()), false);
$$;

-- Row Level Security configuration
alter table public.users enable row level security;
alter table public.wallets enable row level security;
alter table public.coupons enable row level security;
alter table public.qr_tokens enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.wallet_transactions enable row level security;

-- Users policies
create policy "Users can read own profile or admins can read all" on public.users
  for select
  using (
    auth.uid() = id or public.is_admin() or auth.role() = 'service_role'
  );

create policy "Users can insert their own profile" on public.users
  for insert
  with check (
    auth.uid() = id or public.is_admin() or auth.role() = 'service_role'
  );

create policy "Users can update self or admin" on public.users
  for update
  using (
    auth.uid() = id or public.is_admin() or auth.role() = 'service_role'
  )
  with check (
    auth.uid() = id or public.is_admin() or auth.role() = 'service_role'
  );

-- Wallet policies
create policy "Wallet owners can view their wallets" on public.wallets
  for select
  using (
    auth.uid() = user_id or public.is_admin() or auth.role() = 'service_role'
  );

create policy "Wallet owners can manage balances" on public.wallets
  for update
  using (
    auth.uid() = user_id or public.is_admin() or auth.role() = 'service_role'
  )
  with check (
    auth.uid() = user_id or public.is_admin() or auth.role() = 'service_role'
  );

create policy "Admins or service role can create wallets" on public.wallets
  for insert
  with check (
    public.is_admin() or auth.role() = 'service_role'
  );

-- Coupon policies
create policy "Authenticated users can view active coupons" on public.coupons
  for select using (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_customer() and status in ('active', 'scheduled') and start_at <= timezone('utc', now())
    ) or (
      public.is_merchant() and (auth.uid() = merchant_id)
    )
  );

create policy "Merchants manage their coupons" on public.coupons
  for insert
  with check (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = merchant_id
    )
  );

create policy "Merchants update their coupons" on public.coupons
  for update
  using (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = merchant_id
    )
  )
  with check (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = merchant_id
    )
  );

create policy "Merchants delete their coupons" on public.coupons
  for delete
  using (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = merchant_id
    )
  );

-- QR token policies
create policy "QR tokens readable by stakeholders" on public.qr_tokens
  for select
  using (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = (
        select merchant_id from public.coupons where id = coupon_id
      )
    ) or (
      auth.uid() is not null and auth.uid() = issued_to
    )
  );

create policy "Merchants issue QR tokens" on public.qr_tokens
  for insert
  with check (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = (
        select merchant_id from public.coupons where id = coupon_id
      )
    )
  );

create policy "Merchants update QR tokens" on public.qr_tokens
  for update
  using (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = (
        select merchant_id from public.coupons where id = coupon_id
      )
    ) or (
      auth.uid() is not null and auth.uid() = issued_to
    )
  )
  with check (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = (
        select merchant_id from public.coupons where id = coupon_id
      )
    ) or (
      auth.uid() is not null and auth.uid() = issued_to
    )
  );

-- Coupon redemption policies
create policy "Participants can view coupon redemptions" on public.coupon_redemptions
  for select
  using (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = (
        select merchant_id from public.coupons where id = coupon_id
      )
    ) or (
      auth.uid() = user_id
    )
  );

create policy "Customers can create redemption records" on public.coupon_redemptions
  for insert
  with check (
    public.is_admin() or auth.role() = 'service_role' or (
      auth.uid() = user_id and public.is_customer()
    )
  );

create policy "Merchants or admins manage redemption status" on public.coupon_redemptions
  for update
  using (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = (
        select merchant_id from public.coupons where id = coupon_id
      )
    ) or auth.uid() = user_id
  )
  with check (
    public.is_admin() or auth.role() = 'service_role' or (
      public.is_merchant() and auth.uid() = (
        select merchant_id from public.coupons where id = coupon_id
      )
    ) or auth.uid() = user_id
  );

-- Wallet transactions policies
create policy "Wallet owners view their transactions" on public.wallet_transactions
  for select
  using (
    public.is_admin() or auth.role() = 'service_role' or (
      auth.uid() = (
        select user_id from public.wallets where id = wallet_id
      )
    )
  );

create policy "System managed creation of wallet transactions" on public.wallet_transactions
  for insert
  with check (
    public.is_admin() or auth.role() = 'service_role' or (
      auth.uid() = (
        select user_id from public.wallets where id = wallet_id
      )
    )
  );

create policy "Admins manage wallet transactions" on public.wallet_transactions
  for delete
  using (
    public.is_admin() or auth.role() = 'service_role'
  );
