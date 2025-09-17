DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype
      AND enumlabel = 'sales'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'sales';
  END IF;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_store_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_store_assignments_unique
  ON public.sales_store_assignments (sales_user_id, store_id);

ALTER TABLE public.sales_store_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_store_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY "Sales reps can view their assignments" ON public.sales_store_assignments
FOR SELECT
USING (
  auth.uid() = sales_user_id
  OR public.current_user_has_role('admin')
);

CREATE POLICY "Admins manage sales assignments" ON public.sales_store_assignments
FOR ALL
USING (public.current_user_has_role('admin'))
WITH CHECK (public.current_user_has_role('admin'));

CREATE POLICY "Sales reps can view assigned stores" ON public.stores
FOR SELECT
USING (
  public.current_user_has_role('sales')
  AND EXISTS (
    SELECT 1
    FROM public.sales_store_assignments ssa
    WHERE ssa.store_id = id
      AND ssa.sales_user_id = auth.uid()
  )
);

CREATE POLICY "Sales reps can view assigned store owners" ON public.users
FOR SELECT
USING (
  public.current_user_has_role('sales')
  AND EXISTS (
    SELECT 1
    FROM public.sales_store_assignments ssa
    JOIN public.stores s ON s.id = ssa.store_id
    WHERE ssa.sales_user_id = auth.uid()
      AND s.owner_id = public.users.id
  )
);

CREATE POLICY "Sales reps can view assigned invite codes" ON public.store_invite_codes
FOR SELECT
USING (
  public.current_user_has_role('sales')
  AND EXISTS (
    SELECT 1
    FROM public.sales_store_assignments ssa
    JOIN public.stores s ON s.id = ssa.store_id
    WHERE ssa.sales_user_id = auth.uid()
      AND s.invite_code_id = public.store_invite_codes.id
  )
);

COMMIT;
