-- ============================================================
-- 009_performance_indexes.sql
-- Resolves Supabase Performance Advisor "Unindexed foreign keys"
-- by indexing all high-value FK relationships.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RENTAL_REQUESTS INDEXES
-- ------------------------------------------------------------
-- Frequent lookup for customer dashboard/history
CREATE INDEX IF NOT EXISTS idx_rental_requests_customer_id
ON public.rental_requests (customer_id);

-- Frequent lookup for power bank availability/history
CREATE INDEX IF NOT EXISTS idx_rental_requests_power_bank_id
ON public.rental_requests (power_bank_id);

-- ------------------------------------------------------------
-- 2. RENTALS INDEXES
-- ------------------------------------------------------------
-- Connects the actual rental backward to the request
CREATE INDEX IF NOT EXISTS idx_rentals_rental_request_id
ON public.rentals (rental_request_id);

-- Find all rentals for a specific customer
CREATE INDEX IF NOT EXISTS idx_rentals_customer_id
ON public.rentals (customer_id);

-- Check status/history of a specific power bank
CREATE INDEX IF NOT EXISTS idx_rentals_power_bank_id
ON public.rentals (power_bank_id);

-- ------------------------------------------------------------
-- 3. PAYMENTS INDEXES
-- ------------------------------------------------------------
-- Join to check if a request has a payment
CREATE INDEX IF NOT EXISTS idx_payments_rental_request_id
ON public.payments (rental_request_id);

-- Customer payment history
CREATE INDEX IF NOT EXISTS idx_payments_customer_id
ON public.payments (customer_id);

-- ------------------------------------------------------------
-- 4. ACTIVITY_LOGS INDEXES
-- ------------------------------------------------------------
-- Tracing which staff member performed actions
CREATE INDEX IF NOT EXISTS idx_activity_logs_staff_id
ON public.activity_logs (staff_id);

-- Audit trail for a specific request
CREATE INDEX IF NOT EXISTS idx_activity_logs_rental_request_id
ON public.activity_logs (rental_request_id);

-- Audit trail for a specific rental
CREATE INDEX IF NOT EXISTS idx_activity_logs_rental_id
ON public.activity_logs (rental_id);

-- Audit trail for a specific power bank
CREATE INDEX IF NOT EXISTS idx_activity_logs_power_bank_id
ON public.activity_logs (power_bank_id);


-- ------------------------------------------------------------
-- (Optional/Lower Priority Audit tracking indexes)
-- These satisfy the rule for the remaining staff-action FKs 
-- in case they were part of the flagged set.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_req_verified_by ON public.rental_requests (verified_by);
CREATE INDEX IF NOT EXISTS idx_req_created_by ON public.rental_requests (created_by_user);
CREATE INDEX IF NOT EXISTS idx_req_payment_recorded ON public.rental_requests (payment_recorded_by);

CREATE INDEX IF NOT EXISTS idx_rnt_collected_by ON public.rentals (collected_by);
CREATE INDEX IF NOT EXISTS idx_rnt_returned_by ON public.rentals (returned_by);

CREATE INDEX IF NOT EXISTS idx_pay_recorded_by ON public.payments (recorded_by);
