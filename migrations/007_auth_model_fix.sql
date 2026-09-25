-- ============================================================
-- 007_auth_model_fix.sql
-- Resolves the major vulnerability of self-assigned STAFF roles via client-side signUp.
-- Enforces strict separation between 'authenticated' and 'authorized staff'.
-- Utilizes SET search_path = '' for ultimate Security Advisor compliance.
-- ============================================================

-- 1. PATCH: handle_new_user
-- Fixes vulnerability where an attacker calling supabase.auth.signUp() 
-- could inject raw_user_meta_data->>'role' = 'STAFF' and gain instant backend access.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- We completely ignore client-provided roles. 
  -- Every organic signup is fundamentally 'UNAUTHORIZED' and inactive by default.
  -- A database admin MUST manually change their role to STAFF/ADMIN via the backend dashboard.
  INSERT INTO public.profiles (id, full_name, email, role, is_active)
  VALUES (
      new.id, 
      new.raw_user_meta_data->>'full_name', 
      new.email, 
      'UNAUTHORIZED', 
      false
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 2. PATCH: is_staff
-- Fully qualified names with blank search path
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
      SELECT 1 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role IN ('ADMIN', 'STAFF') 
        AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';


-- 3. PATCH: release_expired_reservations
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INT AS $$
DECLARE
    affected_rows INT;
BEGIN
    UPDATE public.power_banks
    SET status = 'AVAILABLE',
        reserved_until = NULL,
        updated_at = now()
    WHERE status = 'RESERVED' AND reserved_until < now();
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 4. PATCH: reserve_power_bank
CREATE OR REPLACE FUNCTION public.reserve_power_bank(pb_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    affected_rows INT;
BEGIN
    UPDATE public.power_banks
    SET status = 'RESERVED',
        reserved_until = now() + interval '15 minutes',
        updated_at = now()
    WHERE id = pb_id AND (status = 'AVAILABLE' OR (status = 'RESERVED' AND reserved_until < now()));
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 5. PATCH: submit_rental_request
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
    v_staff_id UUID := auth.uid();
BEGIN
    -- Server-side verify that if receipt is bypassed, the caller is fully authorized STAFF,
    -- NOT just some random 'authenticated' user.
    IF p_receipt_bypassed = true AND NOT public.is_staff() THEN
        RAISE EXCEPTION 'Unauthorized receipt bypass';
    END IF;

    UPDATE public.power_banks
    SET status = 'RESERVED', reserved_until = now() + interval '15 minutes', updated_at = now()
    WHERE id = p_pb_id AND (status = 'AVAILABLE' OR (status = 'RESERVED' AND reserved_until < now()));
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- 6. PATCH: get_public_tracking_status
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ------------------------------------------------------------
-- 7. LOCK DOWN GRANTS FURTHER
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM authenticated;
-- (It remains granted ONLY to service_role, allowing cron jobs/webhooks to trigger it, but preventing ANY rogue authenticated user from running it).

-- (The rest of the grants from 006 are perfectly aligned with this model, 
-- as they all rely on is_staff() to guard sensitive logic inside).
