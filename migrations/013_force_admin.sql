-- ============================================================
-- 013_force_admin.sql
-- Bulletproof upsert for sheswhite@gmail.com.
-- Works whether the profile row exists or not.
-- ============================================================

-- Step 1: upsert the profile row. This handles both cases:
--   (a) profile exists but has wrong role/is_active
--   (b) profile never got created due to earlier trigger crash
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
        is_active = true,
        updated_at = now();

-- Step 2: confirm result
SELECT id, email, role, is_active FROM public.profiles WHERE email = 'sheswhite@gmail.com';
