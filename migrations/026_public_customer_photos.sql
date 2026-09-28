-- ============================================================
-- 026_public_customer_photos.sql
-- Ensures customer-photos storage bucket is public and readable
-- ============================================================

-- 1. Set customer-photos bucket to public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'customer-photos';

-- 2. Allow public SELECT (read) access on customer-photos objects
DROP POLICY IF EXISTS "Public can view customer photos" ON storage.objects;
CREATE POLICY "Public can view customer photos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'customer-photos');
