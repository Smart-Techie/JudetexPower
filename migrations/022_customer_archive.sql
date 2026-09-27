-- 022_customer_archive.sql
-- Add archive functionality for customers to protect rental history

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
