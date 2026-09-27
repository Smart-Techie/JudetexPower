-- 021_internal_shop_migration.sql
-- Adapts schema for internal shop management (Phase 1)

-- 1. Add notes to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
-- Ensure photo_url can be used as photo_path (Keep photo_url name to avoid breaking existing bindings if they exist)

-- 2. Modify rentals table for direct shop rentals
ALTER TABLE public.rentals ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('CASH', 'TRANSFER'));
ALTER TABLE public.rentals ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 500;
ALTER TABLE public.rentals ADD COLUMN IF NOT EXISTS rented_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.rentals ADD COLUMN IF NOT EXISTS rented_by UUID REFERENCES public.profiles(id);

-- Drop constraints on rentals to allow new direct creation statuses
ALTER TABLE public.rentals DROP CONSTRAINT IF EXISTS rentals_status_check;
ALTER TABLE public.rentals ADD CONSTRAINT rentals_status_check CHECK (status IN ('READY_FOR_COLLECTION', 'COLLECTED', 'RENTED', 'RETURNED', 'OVERDUE', 'CANCELLED'));

-- 3. Modify power_banks statuses
ALTER TABLE public.power_banks DROP CONSTRAINT IF EXISTS power_banks_status_check;
ALTER TABLE public.power_banks ADD CONSTRAINT power_banks_status_check CHECK (status IN ('AVAILABLE', 'RESERVED', 'PAYMENT_PENDING', 'READY_FOR_COLLECTION', 'RENTED', 'OVERDUE', 'RETURNED', 'MAINTENANCE'));
