-- ============================================================
-- 011_final_auth_fix.sql
-- Resolves constraint violation: "profiles_role_check"
-- Elegantly handles missing/invalid role metadata during Auth creation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- 1. Extract role from metadata, if it was supplied (e.g. by an Admin API call)
    v_role := new.raw_user_meta_data->>'role';

    -- 2. Validate against schema constraint strictly. 
    -- If created directly from the Supabase Dashboard, raw_user_meta_data is empty/null.
    -- We default gracefully to 'STAFF' to satisfy the strict ('ADMIN', 'STAFF') CHECK constraint.
    IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'STAFF') THEN
        v_role := 'STAFF';
    END IF;

    -- 3. Insert into profiles with SECURITY: 
    -- To prevent arbitrary web sign-ups from granting themselves active access,
    -- is_active is ALWAYS false upon initial creation.
    -- An authorized superadmin MUST verify the user in the database and flip is_active = true.
    INSERT INTO public.profiles (id, full_name, email, role, is_active)
    VALUES (
        new.id, 
        COALESCE(new.raw_user_meta_data->>'full_name', 'New Staff'), 
        new.email, 
        v_role, 
        false
    );
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
