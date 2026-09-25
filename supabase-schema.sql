-- ============================================================
--  JudeTex Power — Supabase Schema
--  Paste this into the Supabase SQL editor and run it.
-- ============================================================

-- 1. POWER BANKS table
create table if not exists public.power_banks (
    id        text primary key,
    status    text not null default 'AVAILABLE',
    condition text not null default 'GOOD'
);

-- Public read (anyone can see available banks), no anon writes beyond seeding
alter table public.power_banks enable row level security;

create policy "Public read power_banks"
    on public.power_banks for select
    using (true);

create policy "Anon can insert power_banks (seed)"
    on public.power_banks for insert
    with check (true);

create policy "Anon can update power_banks status"
    on public.power_banks for update
    using (true);


-- 2. RENTALS table
create table if not exists public.rentals (
    id              text primary key,
    power_bank_id   text references public.power_banks(id) on delete set null,
    status          text not null default 'AWAITING VERIFICATION',
    amount          integer default 500,
    timestamp       timestamptz default now(),
    customer_name   text,
    customer_phone  text,
    market_line     text,
    photo_url       text,
    receipt_url     text,
    charging_cord_provided boolean default false,
    charging_cord_returned boolean default false,
    charging_cord_condition text,
    payment_method  text default 'TRANSFER',
    receipt_bypassed boolean default false,
    creation_source text default 'CUSTOMER',
    created_by      text
);

alter table public.rentals enable row level security;

-- Customers can insert & read their own rentals (no auth required for MVP)
create policy "Public insert rentals"
    on public.rentals for insert
    with check (true);

create policy "Public read rentals"
    on public.rentals for select
    using (true);

-- Only authenticated admins can update status
create policy "Authenticated can update rentals"
    on public.rentals for update
    using ( auth.role() = 'authenticated' );


-- 3. STORAGE bucket: judetex-uploads
--    Run this in the Storage section OR via the API.
--    (You can also create it in the Supabase UI: Storage → New bucket → judetex-uploads → Public)
insert into storage.buckets (id, name, public)
values ('judetex-uploads', 'judetex-uploads', true)
on conflict (id) do nothing;

-- Allow anon users to upload to the bucket
create policy "Anon can upload"
    on storage.objects for insert
    with check ( bucket_id = 'judetex-uploads' );

-- Allow public to read uploaded files
create policy "Public read uploads"
    on storage.objects for select
    using ( bucket_id = 'judetex-uploads' );

-- ============================================================
-- NOTE: If you already created the rentals table from the 
-- older schema, run these ALTER TABLE commands to add the 
-- new charging cord & admin registration feature columns:
-- ============================================================
-- alter table public.rentals add column if not exists charging_cord_provided boolean default false;
-- alter table public.rentals add column if not exists charging_cord_returned boolean default false;
-- alter table public.rentals add column if not exists charging_cord_condition text;
-- alter table public.rentals add column if not exists payment_method text default 'TRANSFER';
-- alter table public.rentals add column if not exists receipt_bypassed boolean default false;
-- alter table public.rentals add column if not exists creation_source text default 'CUSTOMER';
-- alter table public.rentals add column if not exists created_by text;

-- ============================================================
-- 4. AUDIT LOGS table
-- ============================================================
create table if not exists public.audit_logs (
    id          uuid primary key default gen_random_uuid(),
    admin_email text,
    action      text not null,
    rental_id   text,
    details     jsonb,
    timestamp   timestamptz default now()
);

alter table public.audit_logs enable row level security;

-- Admin can insert and select audit logs
create policy "Authenticated can manage audit_logs"
    on public.audit_logs for all
    using ( auth.role() = 'authenticated' );

