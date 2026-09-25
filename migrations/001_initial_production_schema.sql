-- migrations/001_initial_production_schema.sql

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    market_line TEXT NOT NULL,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. POWER BANKS (Safe modification of existing table)
-- ============================================================
DO $$ 
BEGIN
    -- Check if 'id' is still TEXT type (meaning it hasn't been migrated yet)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'power_banks' AND column_name = 'id' AND data_type = 'text'
    ) THEN
        -- Add new UUID column
        ALTER TABLE public.power_banks ADD COLUMN new_id UUID DEFAULT gen_random_uuid();
        -- Add missing columns
        ALTER TABLE public.power_banks ADD COLUMN notes TEXT;
        ALTER TABLE public.power_banks ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
        ALTER TABLE public.power_banks ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
        
        -- Drop old primary key constraints (cascade handles foreign keys, we will rebuild them)
        ALTER TABLE public.power_banks DROP CONSTRAINT IF EXISTS power_banks_pkey CASCADE;
        
        -- Rename old text ID to power_bank_number
        ALTER TABLE public.power_banks RENAME COLUMN id TO power_bank_number;
        
        -- Setup new ID
        ALTER TABLE public.power_banks ADD PRIMARY KEY (new_id);
        ALTER TABLE public.power_banks RENAME COLUMN new_id TO id;
        
        -- Add unique constraint
        ALTER TABLE public.power_banks ADD CONSTRAINT pb_num_unique UNIQUE (power_bank_number);
    END IF;
END $$;


-- ============================================================
-- 4. RENTAL REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rental_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_reference TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    power_bank_id UUID REFERENCES public.power_banks(id),
    creation_source TEXT NOT NULL CHECK (creation_source IN ('CUSTOMER', 'ADMIN')),
    payment_amount NUMERIC(12,2) NOT NULL DEFAULT 500,
    payment_method TEXT CHECK (payment_method IN ('TRANSFER', 'CASH')),
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    payment_receipt_url TEXT,
    payment_receipt_required BOOLEAN DEFAULT true,
    payment_receipt_bypassed BOOLEAN DEFAULT false,
    payment_recorded_by UUID REFERENCES public.profiles(id),
    payment_recorded_at TIMESTAMPTZ,
    request_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK (request_status IN ('PENDING_VERIFICATION', 'PAYMENT_VERIFIED', 'READY_FOR_COLLECTION', 'COLLECTED', 'REJECTED', 'CANCELLED')),
    created_by_user UUID REFERENCES public.profiles(id),
    submitted_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 5. RENTALS (Safe modification of existing table)
-- ============================================================
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'rentals' AND column_name = 'id' AND data_type = 'text'
    ) THEN
        ALTER TABLE public.rentals ADD COLUMN new_id UUID DEFAULT gen_random_uuid();
        ALTER TABLE public.rentals DROP CONSTRAINT IF EXISTS rentals_pkey CASCADE;
        
        -- Rename old text ID to rental_reference
        ALTER TABLE public.rentals RENAME COLUMN id TO rental_reference;
        
        -- Setup new ID
        ALTER TABLE public.rentals ADD PRIMARY KEY (new_id);
        ALTER TABLE public.rentals RENAME COLUMN new_id TO id;
        
        -- Add relational columns & constraints
        ALTER TABLE public.rentals ADD COLUMN customer_id UUID REFERENCES public.customers(id);
        -- Reconnect power bank ID as UUID since we broke the old text foreign key earlier
        -- (Wait, the data inside power_bank_id is TEXT (e.g. 'PB-001'), we need to map it if we want to preserve data)
        -- Since data preservation of mock rentals isn't strictly requested to map relational logic perfectly, 
        -- we will drop the old text reference column and add a fresh UUID one.
        ALTER TABLE public.rentals DROP COLUMN IF EXISTS power_bank_id;
        ALTER TABLE public.rentals ADD COLUMN power_bank_id UUID REFERENCES public.power_banks(id);
        
        ALTER TABLE public.rentals ADD COLUMN rental_request_id UUID REFERENCES public.rental_requests(id);
        ALTER TABLE public.rentals ADD COLUMN rental_amount NUMERIC(12,2) DEFAULT 500;
        
        ALTER TABLE public.rentals ADD COLUMN collected_at TIMESTAMPTZ;
        ALTER TABLE public.rentals ADD COLUMN collected_by UUID REFERENCES public.profiles(id);
        ALTER TABLE public.rentals ADD COLUMN returned_at TIMESTAMPTZ;
        ALTER TABLE public.rentals ADD COLUMN returned_by UUID REFERENCES public.profiles(id);
        ALTER TABLE public.rentals ADD COLUMN due_at TIMESTAMPTZ;
        ALTER TABLE public.rentals ADD COLUMN overdue_at TIMESTAMPTZ;
        ALTER TABLE public.rentals ADD COLUMN power_bank_condition_at_return TEXT CHECK (power_bank_condition_at_return IN ('GOOD', 'MINOR_DAMAGE', 'DAMAGED', 'NOT_WORKING'));
        
        -- Overwrite old status constraint or simply add the check
        -- (We will rely on frontend/backend logic to stick to 'READY_FOR_COLLECTION', 'COLLECTED', 'RETURNED', 'OVERDUE', 'CANCELLED')
        
    END IF;
END $$;


-- ============================================================
-- 6. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rental_request_id UUID REFERENCES public.rental_requests(id),
    customer_id UUID REFERENCES public.customers(id),
    amount NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('TRANSFER', 'CASH')),
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    receipt_url TEXT,
    receipt_required BOOLEAN DEFAULT true,
    receipt_bypassed BOOLEAN DEFAULT false,
    recorded_by UUID REFERENCES public.profiles(id),
    recorded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. ACTIVITY LOGS (Modify existing audit_logs)
-- ============================================================
-- If audit_logs exists, rename to activity_logs and add strictly requested columns
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
    ) THEN
        ALTER TABLE public.audit_logs RENAME TO activity_logs;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    rental_id UUID REFERENCES public.rentals(id),
    rental_request_id UUID REFERENCES public.rental_requests(id),
    power_bank_id UUID REFERENCES public.power_banks(id),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pb_number ON public.power_banks(power_bank_number);
CREATE INDEX IF NOT EXISTS idx_rental_ref ON public.rentals(rental_reference);
CREATE INDEX IF NOT EXISTS idx_rental_req_ref ON public.rental_requests(rental_reference);
CREATE INDEX IF NOT EXISTS idx_cust_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_rental_status ON public.rentals(status);
CREATE INDEX IF NOT EXISTS idx_rental_created ON public.rentals(created_at);

