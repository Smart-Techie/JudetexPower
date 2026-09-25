-- ============================================================
-- 015_definitive_auth_fix.sql
-- ONE SCRIPT THAT FIXES EVERYTHING.
-- Run this ONCE in Supabase SQL Editor and the auth system is done.
-- ============================================================


-- ── PART 1: SECURE INVITATION TABLE ─────────────────────────
-- Only admins can write to this table.
-- Before inviting a new user in Supabase Auth, an admin inserts
-- their email + intended role here. The trigger reads it and
-- assigns the correct role automatically.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_invitations (
    email       TEXT PRIMARY KEY,
    role        TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
    created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage invitations" ON public.staff_invitations;
CREATE POLICY "Admins manage invitations"
ON public.staff_invitations FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'ADMIN'
          AND is_active = true
    )
);


-- ── PART 2: DEFINITIVE handle_new_user() ─────────────────────
-- Logic:
--   1. Look up new user's email in staff_invitations.
--   2. If found → assign that role, set is_active = TRUE,
--      delete the invitation token so it can't be reused.
--   3. If NOT found → assign role = 'STAFF', is_active = FALSE.
--      This covers accidental/malicious signups. They satisfy
--      the CHECK constraint but are locked out of the system.
-- ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_role      TEXT;
    v_active    BOOLEAN;
BEGIN
    -- Check pre-approved invitation list
    SELECT role INTO v_role
    FROM public.staff_invitations
    WHERE email = new.email;

    IF v_role IS NOT NULL THEN
        -- Invited user: honour the assigned role, activate immediately
        v_active := true;
        DELETE FROM public.staff_invitations WHERE email = new.email;
    ELSE
        -- Unknown signup: lock them out safely
        v_role   := 'STAFF';
        v_active := false;
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role, is_active)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
        new.email,
        v_role,
        v_active
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ── PART 3: FIX PROFILES RLS ─────────────────────────────────
-- Ensure authenticated users can always read their OWN profile row.
-- This is what adminSignIn() in db.js uses for role verification.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users read own profile"    ON public.profiles;
DROP POLICY IF EXISTS "Staff read all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "users_read_own_profile"    ON public.profiles;
DROP POLICY IF EXISTS "staff_read_all_profiles"   ON public.profiles;
DROP POLICY IF EXISTS "staff_manage_profiles"     ON public.profiles;

-- Any authenticated user can read their own row (needed for login check)
CREATE POLICY "users_read_own_profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Active admins/staff can read all profiles (for dashboard)
CREATE POLICY "staff_read_all_profiles"
ON public.profiles FOR SELECT
USING (public.is_staff());

-- Only active admins can update profiles (role changes, activation)
CREATE POLICY "admins_update_profiles"
ON public.profiles FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
          AND p.is_active = true
    )
);


-- ── PART 4: FIX EXISTING ACCOUNTS ────────────────────────────
-- Directly correct the two known accounts.
-- sheswhite@gmail.com  → ADMIN, active
-- ezeoforchioma2@gmail.com → STAFF, active (can be toggled later)
-- ─────────────────────────────────────────────────────────────

UPDATE public.profiles
SET    role = 'ADMIN', is_active = true
WHERE  email = 'sheswhite@gmail.com';

UPDATE public.profiles
SET    role = 'STAFF', is_active = true
WHERE  email = 'ezeoforchioma2@gmail.com';


-- ── PART 5: VERIFY ───────────────────────────────────────────
-- This result must show ADMIN/true for sheswhite@gmail.com
-- ─────────────────────────────────────────────────────────────

SELECT
    u.email,
    p.role,
    p.is_active,
    CASE WHEN u.id = p.id THEN 'MATCH' ELSE 'MISMATCH' END AS id_check
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email IN ('sheswhite@gmail.com', 'ezeoforchioma2@gmail.com');
