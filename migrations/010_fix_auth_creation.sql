-- ============================================================
-- 010_fix_auth_creation.sql
-- Resolves "Failed to create user" database error by aligning
-- the handle_new_user() trigger with the public.profiles 
-- CHECK constraint (role IN ('ADMIN', 'STAFF')).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- Extract role from metadata, if provided
    v_role := new.raw_user_meta_data->>'role';

    -- Safely fallback to STAFF if missing or invalid to avoid constraint violation
    IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'STAFF') THEN
        v_role := 'STAFF';
    END IF;

    -- Insert into profiles.
    -- To prevent rogue uninvited signups from accessing the system,
    -- is_active is hardcoded to FALSE by default. An existing admin must
    -- log in to Supabase and manually flip is_active to TRUE in the profiles table.
    INSERT INTO public.profiles (id, full_name, email, role, is_active)
    VALUES (
        new.id, 
        new.raw_user_meta_data->>'full_name', 
        new.email, 
        v_role, 
        false
    );
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- (The execution grants from 008 are already correct, but re-asserting them is safe)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
