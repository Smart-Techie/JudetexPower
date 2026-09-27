-- 025_fix_storage_rls.sql
-- Fixes Storage API upload rejection (new row violates row-level security policy)

-- DROP OLD INSERT POLICY
DROP POLICY IF EXISTS "Staff can upload photos" ON storage.objects;

-- REBUILD WITH MANDATORY OWNER MAPPING NATIVELY REQUIRED BY SUPABASE
CREATE POLICY "Staff can upload photos" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND auth.uid() = owner 
    AND public.is_staff()
);

-- DROP OLD UPDATE POLICY
DROP POLICY IF EXISTS "Staff can update files" ON storage.objects;

-- REBUILD WITH MANDATORY OWNER MAPPING
CREATE POLICY "Staff can update files" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND auth.uid() = owner 
    AND public.is_staff()
);
