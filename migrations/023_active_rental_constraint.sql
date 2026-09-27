-- 023_active_rental_constraint.sql
-- Enforce database-level restriction so a customer can only have ONE active/unreturned rental at a time.

-- Drop if inherently corrupted
DROP INDEX IF EXISTS one_active_rental_per_customer;

-- Create partial unique index
CREATE UNIQUE INDEX one_active_rental_per_customer 
ON public.rentals (customer_id) 
WHERE status IN ('READY_FOR_COLLECTION', 'COLLECTED', 'RENTED', 'OVERDUE');
