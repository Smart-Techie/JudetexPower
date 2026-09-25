-- ============================================================
-- 017_storage_buckets.sql
-- Create buckets for photos and receipts, and set RLS
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

-- Create buckets if they don't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('customer-photos', 'customer-photos', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ── Admin/Staff upload access ────────────────────────────────
DROP POLICY IF EXISTS "Staff can upload photos" ON storage.objects;
CREATE POLICY "Staff can upload photos" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND public.is_staff()
);

-- ── Admin/Staff read access ──────────────────────────────────
DROP POLICY IF EXISTS "Staff can view files" ON storage.objects;
CREATE POLICY "Staff can view files" 
ON storage.objects FOR SELECT 
USING (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND public.is_staff()
);

-- ── Admin/Staff update access ────────────────────────────────
DROP POLICY IF EXISTS "Staff can update files" ON storage.objects;
CREATE POLICY "Staff can update files" 
ON storage.objects FOR UPDATE 
USING (
    bucket_id IN ('customer-photos', 'payment-receipts') 
    AND public.is_staff()
);

-- ── Public Customer Upload (For customer frontend) ───────────
-- If anonymous users fill out the form, they should be able to upload.
-- (Only allow insert, not select, to prevent data leaks)
DROP POLICY IF EXISTS "Public can upload photos" ON storage.objects;
CREATE POLICY "Public can upload photos" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id IN ('customer-photos', 'payment-receipts') 
);
