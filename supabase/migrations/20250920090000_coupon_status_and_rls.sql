begin;

create type public.coupon_status as enum ('draft', 'pending', 'active', 'paused', 'archived');

alter table public.coupons
  add column status public.coupon_status not null default 'draft';

update public.coupons
set status = case when is_active then 'active' else 'draft' end;

alter table public.coupons
  alter column is_active set default false;

alter table public.coupons
  add constraint coupons_status_is_active_consistency
    check (
      (status = 'active' and is_active = true)
      or (status <> 'active' and is_active = false)
    );

create or replace function public.store_belongs_to_auth(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and (
        s.owner_id = auth.uid()
        or public.current_user_has_role('admin')
      )
  );
$$;

drop policy if exists "Merchants can create coupons" on public.coupons;
create policy "Merchants can create coupons" on public.coupons
for insert
with check (
  public.current_user_has_role('admin')
  or (
    public.current_user_has_role('merchant')
    and merchant_id = auth.uid()
    and (store_id is null or public.store_belongs_to_auth(store_id))
  )
);

drop policy if exists "Merchants can update coupons" on public.coupons;
create policy "Merchants can update coupons" on public.coupons
for update
using (
  public.current_user_has_role('admin')
  or (
    public.current_user_has_role('merchant')
    and merchant_id = auth.uid()
    and (store_id is null or public.store_belongs_to_auth(store_id))
  )
)
with check (
  public.current_user_has_role('admin')
  or (
    public.current_user_has_role('merchant')
    and merchant_id = auth.uid()
    and (store_id is null or public.store_belongs_to_auth(store_id))
  )
);

commit;
