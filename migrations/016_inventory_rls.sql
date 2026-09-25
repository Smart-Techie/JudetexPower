-- ============================================================
-- 016_inventory_rls.sql
-- Allow active ADMIN and STAFF to manage power bank inventory.
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

-- Enable RLS on power_banks (may already be enabled)
ALTER TABLE public.power_banks ENABLE ROW LEVEL SECURITY;

-- Drop any stale policies
DROP POLICY IF EXISTS "Staff read power banks" ON public.power_banks;
DROP POLICY IF EXISTS "Admins manage power banks" ON public.power_banks;
DROP POLICY IF EXISTS "Anyone reads available power banks" ON public.power_banks;

-- Public read for the customer-facing page (available PBs only)
CREATE POLICY "Anyone reads available power banks"
ON public.power_banks FOR SELECT
USING (true); -- All rows readable publicly; frontend filters by status

-- Active staff (ADMIN or STAFF) can INSERT new power banks
CREATE POLICY "Staff insert power banks"
ON public.power_banks FOR INSERT
WITH CHECK (public.is_staff());

-- Active staff can UPDATE power banks
CREATE POLICY "Staff update power banks"
ON public.power_banks FOR UPDATE
USING (public.is_staff());

-- Only active ADMIN can DELETE power banks
CREATE POLICY "Admins delete power banks"
ON public.power_banks FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'ADMIN'
          AND is_active = true
    )
);

-- Verify
SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'power_banks';
