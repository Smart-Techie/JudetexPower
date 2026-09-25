-- ============================================================
-- 008_master_security_fix.sql
-- COMPREHENSIVE SECURITY AUDIT FIX
-- Applies strictly empty search paths, explicit parameter grants without PUBLIC,
-- and strict RLS policies according to Judetex Power Auth model.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DROP EXISTING TO ENSURE CLEAN STATE
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_staff() CASCADE;
DROP FUNCTION IF EXISTS public.release_expired_reservations() CASCADE;
DROP FUNCTION IF EXISTS public.reserve_power_bank(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.submit_rental_request(text, uuid, text, numeric, text, text, text, text, text, text, text, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_tracking_status(text) CASCADE;

-- ------------------------------------------------------------
-- 2. CREATE SECURE FUNCTIONS (search_path = '')
-- ------------------------------------------------------------

-- A. handle_new_user
CREATE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- Strict isolation: new signups are UNAUTHORIZED by default.
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

-- B. is_staff
CREATE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
      SELECT 1 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role IN ('ADMIN', 'STAFF') 
        AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

-- C. reserve_power_bank
CREATE FUNCTION public.reserve_power_bank(pb_id UUID)
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

-- D. release_expired_reservations
CREATE FUNCTION public.release_expired_reservations()
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

-- E. submit_rental_request
CREATE FUNCTION public.submit_rental_request(
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

-- F. get_public_tracking_status
CREATE FUNCTION public.get_public_tracking_status(p_ref_id TEXT)
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
-- 3. REVOKE ALL EXECUTION FROM PUBLIC
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_power_bank(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_expired_reservations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_rental_request(text, uuid, text, numeric, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_tracking_status(text) FROM PUBLIC;


-- ------------------------------------------------------------
-- 4. GRANT PRECISE EXECUTION ROLES
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_rental_request(text, uuid, text, numeric, text, text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_tracking_status(text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_power_bank(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;


-- ------------------------------------------------------------
-- 5. RE-ATTACH AUTH TRIGGER
-- ------------------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ------------------------------------------------------------
-- 6. RESET ALL RLS POLICIES TO RESOLVE "RLS ENABLED NO POLICY" INFO SUGGESTIONS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Staff all activity" ON public.activity_logs;
DROP POLICY IF EXISTS "Staff read activity" ON public.activity_logs;
DROP POLICY IF EXISTS "Staff insert activity" ON public.activity_logs;

DROP POLICY IF EXISTS "Anon insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anon read own customer by phone" ON public.customers;
DROP POLICY IF EXISTS "Staff all customers" ON public.customers;

DROP POLICY IF EXISTS "Staff all payments" ON public.payments;
DROP POLICY IF EXISTS "Anon insert payments" ON public.payments;

DROP POLICY IF EXISTS "Staff all requests" ON public.rental_requests;
DROP POLICY IF EXISTS "Anon insert requests" ON public.rental_requests;
DROP POLICY IF EXISTS "Anon read requests by ref" ON public.rental_requests;

DROP POLICY IF EXISTS "Staff all rentals" ON public.rentals;
DROP POLICY IF EXISTS "Anon read rentals" ON public.rentals;

DROP POLICY IF EXISTS "Public read power_banks" ON public.power_banks;
DROP POLICY IF EXISTS "Public read available power_banks" ON public.power_banks;
DROP POLICY IF EXISTS "Staff all power_banks" ON public.power_banks;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff read all profiles" ON public.profiles;


-- RESTORE STRICT POLICIES
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Staff read all profiles" ON public.profiles FOR SELECT USING (public.is_staff());

CREATE POLICY "Public read available power_banks" ON public.power_banks FOR SELECT USING (status IN ('AVAILABLE', 'RESERVED', 'RENTED'));
CREATE POLICY "Staff all power_banks" ON public.power_banks FOR ALL USING (public.is_staff());

CREATE POLICY "Staff all customers" ON public.customers FOR ALL USING (public.is_staff());
CREATE POLICY "Staff all requests" ON public.rental_requests FOR ALL USING (public.is_staff());
CREATE POLICY "Staff all rentals" ON public.rentals FOR ALL USING (public.is_staff());
CREATE POLICY "Staff all payments" ON public.payments FOR ALL USING (public.is_staff());

CREATE POLICY "Staff read activity" ON public.activity_logs FOR SELECT USING (public.is_staff());
CREATE POLICY "Staff insert activity" ON public.activity_logs FOR INSERT WITH CHECK (public.is_staff());

