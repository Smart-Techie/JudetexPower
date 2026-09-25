-- ============================================================
-- 002_security_hardening.sql
-- Run this in the Supabase SQL Editor to resolve all security warnings.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FIX FUNCTION SEARCH PATHS
-- ------------------------------------------------------------
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.reserve_power_bank(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.release_expired_reservations() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_staff() SET search_path = public, pg_temp;

-- ------------------------------------------------------------
-- 2. DROP OVERLY PERMISSIVE RLS POLICIES
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Anon insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anon read own customer by phone" ON public.customers;

DROP POLICY IF EXISTS "Anon insert requests" ON public.rental_requests;
DROP POLICY IF EXISTS "Anon read requests by ref" ON public.rental_requests;

DROP POLICY IF EXISTS "Anon read rentals" ON public.rentals;

DROP POLICY IF EXISTS "Anon insert payments" ON public.payments;


-- ------------------------------------------------------------
-- 3. APPLY TIGHTER RLS POLICIES (No USING true for sensitive tables)
-- ------------------------------------------------------------
-- (Staff ALL policies are already active and safe. We only need strictly defined Anon policies if any)

-- Power Banks: We can safely allow public to view AVAILABLE/RESERVED power banks. 
-- But instead of `USING (true)`, let's strictly limit it so they can't see MAINTENANCE notes.
DROP POLICY IF EXISTS "Public read power_banks" ON public.power_banks;
CREATE POLICY "Public read available power_banks" ON public.power_banks 
FOR SELECT USING (status IN ('AVAILABLE', 'RESERVED', 'RENTED')); 


-- ------------------------------------------------------------
-- 4. CREATE SECURE RPC FOR CUSTOMER RENTAL SUBMISSION
-- ------------------------------------------------------------
-- This removes the need for Anon to have INSERT/SELECT on customers/requests/payments
CREATE OR REPLACE FUNCTION public.submit_rental_request(
    p_ref_id TEXT,
    p_pb_id UUID,
    p_creation_source TEXT,
    p_amount NUMERIC,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_market TEXT,
    p_photo_path TEXT,
    p_receipt_path TEXT,
    p_payment_method TEXT,
    p_req_status TEXT,
    p_receipt_bypassed BOOLEAN DEFAULT false
) RETURNS BOOLEAN AS $$
DECLARE
    v_cust_id UUID;
    v_req_id UUID;
    v_staff_id UUID := auth.uid(); -- Extracts the caller's JWT ID (if any)
BEGIN
    -- Only Staff/Admin can bypass receipts
    IF p_receipt_bypassed = true AND NOT public.is_staff() THEN
        RAISE EXCEPTION 'Unauthorized receipt bypass';
    END IF;

    -- 1. Reserve PB (Assuming Frontend sent the UUID)
    UPDATE public.power_banks
    SET status = 'RESERVED', reserved_until = now() + interval '15 minutes', updated_at = now()
    WHERE id = p_pb_id AND (status = 'AVAILABLE' OR (status = 'RESERVED' AND reserved_until < now()));
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- 2. Upsert Customer securely without exposing entire table
    SELECT id INTO v_cust_id FROM public.customers WHERE phone = p_customer_phone;
    IF v_cust_id IS NULL THEN
        INSERT INTO public.customers (full_name, phone, market_line, photo_url)
        VALUES (p_customer_name, p_customer_phone, p_customer_market, p_photo_path)
        RETURNING id INTO v_cust_id;
    ELSE
        UPDATE public.customers 
        SET full_name = p_customer_name, market_line = p_customer_market, photo_url = COALESCE(p_photo_path, photo_url)
        WHERE id = v_cust_id;
    END IF;

    -- 3. Create Rental Request
    INSERT INTO public.rental_requests (
        rental_reference, customer_id, power_bank_id, creation_source, 
        payment_amount, payment_method, payment_status, 
        payment_receipt_url, payment_receipt_bypassed, request_status,
        created_by_user
    ) VALUES (
        p_ref_id, v_cust_id, p_pb_id, p_creation_source,
        p_amount, p_payment_method, CASE WHEN p_receipt_bypassed THEN 'VERIFIED' ELSE 'PENDING' END, 
        p_receipt_path, p_receipt_bypassed, p_req_status,
        v_staff_id
    ) RETURNING id INTO v_req_id;

    -- 4. Create Payment Log
    INSERT INTO public.payments (
        rental_request_id, customer_id, amount, payment_method, payment_status, 
        receipt_url, receipt_required, receipt_bypassed, recorded_by, recorded_at
    ) VALUES (
        v_req_id, v_cust_id, p_amount, p_payment_method, CASE WHEN p_receipt_bypassed THEN 'VERIFIED' ELSE 'PENDING' END, 
        p_receipt_path, NOT p_receipt_bypassed, p_receipt_bypassed, 
        CASE WHEN p_receipt_bypassed THEN v_staff_id ELSE NULL END,
        CASE WHEN p_receipt_bypassed THEN now() ELSE NULL END
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ------------------------------------------------------------
-- 5. CREATE SECURE RPC FOR PUBLIC TRACKING
-- ------------------------------------------------------------
-- Resolves the need for Anon to selectively query rentals without RLS bypass
CREATE OR REPLACE FUNCTION public.get_public_tracking_status(p_ref_id TEXT)
RETURNS TABLE (
    ref_id TEXT,
    pb_number TEXT,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT r.rental_reference, pb.power_bank_number, (r.status)::TEXT
    FROM public.rentals r
    JOIN public.power_banks pb ON r.power_bank_id = pb.id
    WHERE r.rental_reference = p_ref_id
    UNION ALL
    SELECT req.rental_reference, pb.power_bank_number, (req.request_status)::TEXT
    FROM public.rental_requests req
    JOIN public.power_banks pb ON req.power_bank_id = pb.id
    WHERE req.rental_reference = p_ref_id
      AND NOT EXISTS (
          SELECT 1 FROM public.rentals r2 WHERE r2.rental_reference = req.rental_reference
      )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
