-- ============================================================
-- 026_public_customer_photos.sql (REVERTED TO PRIVATE)
-- Customer photos bucket must remain strictly private.
-- ============================================================

-- 1. Revert customer-photos bucket to private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'customer-photos';

-- 2. Drop any public SELECT access policy
DROP POLICY IF EXISTS "Public can view customer photos" ON storage.objects;
