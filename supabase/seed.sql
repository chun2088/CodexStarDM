--
-- Seed data for development and local testing.
-- The statements are idempotent via ON CONFLICT clauses so they can be rerun safely.
--

begin;

-- Predefined UUIDs make it easy to reference relationships in tests.
with seed_ids as (
  select
    '11111111-1111-1111-1111-111111111111'::uuid as admin_id,
    '22222222-2222-2222-2222-222222222222'::uuid as merchant_id,
    '33333333-3333-3333-3333-333333333333'::uuid as customer_id,
    '44444444-4444-4444-4444-444444444444'::uuid as subscriber_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid as wallet_admin_id,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid as wallet_merchant_id,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid as wallet_customer_id,
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid as wallet_subscriber_id,
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid as plan_monthly_id,
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid as plan_annual_id,
    '11111111-2222-3333-4444-555555555555'::uuid as coupon_welcome_id,
    '22222222-3333-4444-5555-666666666666'::uuid as coupon_free_drink_id,
    '12121212-3434-5656-7878-909090909090'::uuid as qr_coupon_token_id,
    '34343434-5656-7878-9090-121212121212'::uuid as qr_wallet_token_id,
    '55555555-6666-7777-8888-999999999999'::uuid as subscription_customer_id,
    '66666666-7777-8888-9999-000000000000'::uuid as subscription_subscriber_id,
    '77777777-8888-9999-0000-111111111111'::uuid as redemption_id,
    '88888888-9999-0000-1111-222222222222'::uuid as tx_credit_id,
    '99999999-0000-1111-2222-333333333333'::uuid as tx_debit_id
)
insert into public.users as u (id, email, role, full_name, avatar_url, metadata, created_at, updated_at)
select admin_id, 'admin@example.com', 'admin', 'Ada Admin', null, jsonb_build_object('seed', true, 'title', 'Operations Lead'), now(), now() from seed_ids
union all
select merchant_id, 'merchant@example.com', 'merchant', 'Milo Merchant', null, jsonb_build_object('company', 'Galactic Coffee'), now(), now() from seed_ids
union all
select customer_id, 'customer@example.com', 'customer', 'Cora Customer', null, jsonb_build_object('loyalty_level', 'gold'), now(), now() from seed_ids
union all
select subscriber_id, 'subscriber@example.com', 'customer', 'Sam Subscriber', null, jsonb_build_object('loyalty_level', 'silver'), now(), now() from seed_ids
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  full_name = excluded.full_name,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.wallets as w (id, user_id, balance, currency, status, metadata, created_at, updated_at)
select wallet_admin_id, admin_id, 0, 'USD', 'active', jsonb_build_object('label', 'Operations fund'), now(), now() from seed_ids
union all
select wallet_merchant_id, merchant_id, 150, 'USD', 'active', jsonb_build_object('label', 'Merchant rewards pool'), now(), now() from seed_ids
union all
select wallet_customer_id, customer_id, 75, 'USD', 'active', jsonb_build_object('label', 'Customer wallet'), now(), now() from seed_ids
union all
select wallet_subscriber_id, subscriber_id, 120, 'USD', 'active', jsonb_build_object('label', 'Subscriber wallet'), now(), now() from seed_ids
on conflict (id) do update
set
  balance = excluded.balance,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.subscription_plans as sp (id, code, name, description, price, currency, billing_interval, interval_count, trial_period_days, metadata, is_active, created_at, updated_at)
select plan_monthly_id, 'premium-monthly', 'Premium Monthly', 'Monthly membership with complimentary refills and bonus points.', 29.99, 'USD', 'month', 1, 7, jsonb_build_object('benefits', array['bonus_points', 'free_refill']), true, now(), now() from seed_ids
union all
select plan_annual_id, 'vip-annual', 'VIP Annual', 'Annual VIP membership including exclusive events and merch credits.', 299.00, 'USD', 'year', 1, 30, jsonb_build_object('benefits', array['exclusive_events', 'merch_credit']), true, now(), now() from seed_ids
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  billing_interval = excluded.billing_interval,
  interval_count = excluded.interval_count,
  trial_period_days = excluded.trial_period_days,
  metadata = excluded.metadata,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.coupons as c (id, merchant_id, code, name, description, discount_type, discount_value, max_redemptions, redeemed_count, start_at, end_at, is_active, is_stackable, metadata, created_at, updated_at)
select coupon_welcome_id, merchant_id, 'WELCOME10', 'Welcome 10% Off', 'Get 10% off your first purchase with the app.', 'percentage', 10, 100, 1, now() - interval '7 days', now() + interval '30 days', true, false, jsonb_build_object('category', 'onboarding'), now(), now() from seed_ids
union all
select coupon_free_drink_id, merchant_id, 'FREEDRINK', 'Free Drink Credit', 'Apply for a complimentary drink credit.', 'fixed', 5, 50, 0, now() - interval '1 days', now() + interval '14 days', true, true, jsonb_build_object('category', 'loyalty'), now(), now() from seed_ids
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  max_redemptions = excluded.max_redemptions,
  redeemed_count = excluded.redeemed_count,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  is_active = excluded.is_active,
  is_stackable = excluded.is_stackable,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.qr_tokens as qt (id, user_id, wallet_id, coupon_id, token, expires_at, redeemed_at, is_single_use, metadata, created_at, updated_at)
select qr_coupon_token_id, customer_id, wallet_customer_id, coupon_welcome_id, 'tok_welcome_coupon', now() + interval '2 days', now() - interval '1 days', true, jsonb_build_object('redeemed_with', 'mobile_checkout'), now(), now() from seed_ids
union all
select qr_wallet_token_id, customer_id, wallet_customer_id, null, 'tok_wallet_topup', now() + interval '1 days', null, false, jsonb_build_object('purpose', 'wallet_top_up'), now(), now() from seed_ids
on conflict (id) do update
set
  wallet_id = excluded.wallet_id,
  coupon_id = excluded.coupon_id,
  token = excluded.token,
  expires_at = excluded.expires_at,
  redeemed_at = excluded.redeemed_at,
  is_single_use = excluded.is_single_use,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.subscriptions as s (id, user_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, cancel_at, canceled_at, metadata, created_at, updated_at)
select subscription_customer_id, customer_id, plan_monthly_id, 'active', now() - interval '5 days', now() + interval '25 days', now() - interval '2 days', null, null, jsonb_build_object('auto_renew', true), now(), now() from seed_ids
union all
select subscription_subscriber_id, subscriber_id, plan_annual_id, 'trialing', now() - interval '1 days', now() + interval '364 days', now() + interval '13 days', null, null, jsonb_build_object('auto_renew', false), now(), now() from seed_ids
on conflict (id) do update
set
  plan_id = excluded.plan_id,
  status = excluded.status,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end,
  trial_ends_at = excluded.trial_ends_at,
  cancel_at = excluded.cancel_at,
  canceled_at = excluded.canceled_at,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.coupon_redemptions as cr (id, coupon_id, user_id, wallet_id, qr_token_id, redeemed_at, metadata)
select redemption_id, coupon_welcome_id, customer_id, wallet_customer_id, qr_coupon_token_id, now() - interval '1 days', jsonb_build_object('order_id', 'order-1001', 'channel', 'in_app') from seed_ids
on conflict (id) do update
set
  wallet_id = excluded.wallet_id,
  qr_token_id = excluded.qr_token_id,
  redeemed_at = excluded.redeemed_at,
  metadata = excluded.metadata;

insert into public.wallet_transactions as wt (id, wallet_id, amount, transaction_type, description, reference_id, metadata, created_at)
select tx_credit_id, wallet_customer_id, 100, 'credit', 'Initial wallet top-up', null, jsonb_build_object('source', 'seed_data'), now() - interval '6 days' from seed_ids
union all
select tx_debit_id, wallet_customer_id, 25, 'debit', 'Coupon redemption spend', redemption_id, jsonb_build_object('coupon_code', 'WELCOME10'), now() - interval '1 days' from seed_ids
on conflict (id) do update
set
  wallet_id = excluded.wallet_id,
  amount = excluded.amount,
  transaction_type = excluded.transaction_type,
  description = excluded.description,
  reference_id = excluded.reference_id,
  metadata = excluded.metadata,
  created_at = excluded.created_at;

-- Ensure wallet balances reflect the sample ledger data.
update public.wallets w
set balance = sub.balance,
    updated_at = now()
from (
  select wallet_customer_id as wallet_id, 75::numeric(12,2) as balance from seed_ids
  union all
  select wallet_subscriber_id, 120::numeric(12,2) from seed_ids
  union all
  select wallet_merchant_id, 150::numeric(12,2) from seed_ids
  union all
  select wallet_admin_id, 0::numeric(12,2) from seed_ids
) as sub
where w.id = sub.wallet_id;

commit;
