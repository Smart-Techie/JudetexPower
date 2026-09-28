-- ============================================================
-- 027_private_storage_rls.sql
-- SECURE PRIVATE BUCKET & STABLE RLS POLICIES FOR CUSTOMER PHOTOS
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

-- 1. Ensure customer-photos bucket is strictly PRIVATE
UPDATE storage.buckets 
SET public = false 
WHERE id = 'customer-photos';

-- 2. Drop any legacy or public policies on storage.objects
DROP POLICY IF EXISTS "Public can view customer photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view files" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update files" ON storage.objects;

-- 3. Allow authenticated staff to SELECT (read files / generate signed URLs)
CREATE POLICY "Staff can view files" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND public.is_staff()
);

-- 4. Allow authenticated staff to INSERT (upload photos)
CREATE POLICY "Staff can upload photos" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND public.is_staff()
);

-- 5. Allow authenticated staff to UPDATE (for upsert: true operations)
CREATE POLICY "Staff can update files" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND public.is_staff()
);
