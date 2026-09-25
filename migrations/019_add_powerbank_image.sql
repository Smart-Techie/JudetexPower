-- migrations/019_add_powerbank_image.sql

-- Add image_url to power_banks to display real power bank assets

ALTER TABLE public.power_banks 
ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.power_banks.image_url IS 'Reference to the real image asset of the power bank';
