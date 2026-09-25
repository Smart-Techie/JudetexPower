-- ============================================================
-- 012_fix_admin_profile.sql
-- 1. Corrects the specific Admin account 'sheswhite@gmail.com'
-- 2. Implements a secure Pre-Approved onboarding table so future
--    Admins/Staff get their roles explicitly and actively without 
--    trusting arbitrary frontend metadata.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FIX EXISTING ADMIN PROFILE
-- ------------------------------------------------------------
UPDATE public.profiles 
SET role = 'ADMIN', is_active = true 
WHERE email = 'sheswhite@gmail.com';


-- ------------------------------------------------------------
-- 2. SECURE ONBOARDING ARCHITECTURE
-- ------------------------------------------------------------
-- We create a table only Admins can manage.
-- Before inviting a user in Supabase, an Admin inserts their email here.
CREATE TABLE IF NOT EXISTS public.staff_invitations (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage invitations" ON public.staff_invitations 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'ADMIN' AND is_active = true
        )
    );

-- ------------------------------------------------------------
-- 3. UPDATED AUTHENTICATION TRIGGER
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
    v_role TEXT;
    v_is_active BOOLEAN := false;
BEGIN
    -- SECURE ONBOARDING LOOKUP:
    -- We look up the email in our secure pre-approved table.
    -- If they exist there, we trust the assignment completely because
    -- only an existing verified ADMIN could have inserted them.
    SELECT role INTO v_role FROM public.staff_invitations WHERE email = new.email;

    IF v_role IS NOT NULL THEN
        -- Properly invited staff/admins are active immediately
        v_is_active := true;
        
        -- Clean up the invitation so it can't be reused if the user is deleted
        DELETE FROM public.staff_invitations WHERE email = new.email;
    ELSE
        -- ARBITRARY PUBLIC SIGNUP (Hacker or Mistake):
        -- If they were magically able to hit Supabase's signup endpoint with metadata,
        -- we completely ignore it. We default them to STAFF + Inactive so they 
        -- satisfy schema constraints but are mathematically locked out of the system.
        v_role := 'STAFF';
        v_is_active := false;
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role, is_active)
    VALUES (
        new.id, 
        COALESCE(new.raw_user_meta_data->>'full_name', 'New User'), 
        new.email, 
        v_role, 
        v_is_active
    );
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
