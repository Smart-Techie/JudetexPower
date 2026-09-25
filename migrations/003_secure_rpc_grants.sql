-- ============================================================
-- 003_secure_rpc_grants.sql
-- Run this in the Supabase SQL Editor to resolve SECURITY DEFINER warnings.
-- ============================================================

-- ------------------------------------------------------------
-- 1. REVOKE DEFAULT PUBLIC EXECUTION
-- By default PostgreSQL grants EXECUTE to PUBLIC for all functions. 
-- We must revoke this to secure the execution footprint.
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_expired_reservations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_power_bank(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_rental_request(text, uuid, text, numeric, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_tracking_status(text) FROM PUBLIC;

-- ------------------------------------------------------------
-- 2. APPLY PRECISE EXECUTION GRANTS
-- ------------------------------------------------------------

-- A. is_staff() 
-- Used extensively in RLS execution which is triggered contextually by both anon and authenticated users reading tables. 
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;

-- B. submit_rental_request()
-- Needs to be called by anon (customers renting) and authenticated (staff registering users)
GRANT EXECUTE ON FUNCTION public.submit_rental_request(text, uuid, text, numeric, text, text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;

-- C. get_public_tracking_status()
-- Needs to be called by anon for public tracking verification
GRANT EXECUTE ON FUNCTION public.get_public_tracking_status(text) TO anon, authenticated, service_role;

-- D. release_expired_reservations()
-- Should ONLY be executed by a secure internal cron/timer via service_role OR by staff explicitly triggering it.
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;

-- E. reserve_power_bank()
-- (If there is a legacy use case where staff needs direct reservation bypassing the full submit flow)
GRANT EXECUTE ON FUNCTION public.reserve_power_bank(uuid) TO authenticated, service_role;

-- F. handle_new_user()
-- This is executed implicitly by the PostgreSQL Trigger mechanism. It does not need execution rights manually granted.
-- Keep completely locked to postgres/service_role.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ------------------------------------------------------------
-- 3. ENSURE SECURITY POSTURE 
-- Search paths are already explicit from 002.
-- Server-side validation is enforced natively within submit_rental_request (rejecting spoofed receipt bypass directly on server).
-- Minimum tracking information is enforced natively returning just (Ref ID, PB Number, Status).
-- ------------------------------------------------------------
