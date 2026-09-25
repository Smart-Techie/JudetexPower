-- ============================================================
-- 014_fix_profiles_rls_and_admin.sql
-- Resolves "Your account is disabled or unauthorized" by:
-- 1. Ensuring the profile SELECT policy is not blocked
-- 2. Force-upsetting sheswhite@gmail.com as ADMIN + active
-- ============================================================

-- Step 1: Drop ALL old profile SELECT policies to clear conflicts
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins manage invitations" ON public.staff_invitations;

-- Step 2: Clean unified policies
-- ANY authenticated user can read THEIR OWN profile row.
-- This is critical for adminSignIn profile lookup to work.
CREATE POLICY "users_read_own_profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Staff/Admins can read ALL profiles (for admin dashboard)
CREATE POLICY "staff_read_all_profiles"
ON public.profiles FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('ADMIN', 'STAFF')
          AND p.is_active = true
    )
);

-- Staff/Admins can update profiles (for is_active toggling etc)
CREATE POLICY "staff_manage_profiles"
ON public.profiles FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'ADMIN'
          AND p.is_active = true
    )
);

-- Step 3: Force upsert sheswhite@gmail.com as ADMIN/active
INSERT INTO public.profiles (id, full_name, email, role, is_active)
SELECT 
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', 'Admin'),
    u.email,
    'ADMIN',
    true
FROM auth.users u
WHERE u.email = 'sheswhite@gmail.com'
ON CONFLICT (id) DO UPDATE
    SET role      = 'ADMIN',
        is_active = true;

-- Step 4: Confirm — this should show role=ADMIN, is_active=true
SELECT id, email, role, is_active FROM public.profiles WHERE email = 'sheswhite@gmail.com';
