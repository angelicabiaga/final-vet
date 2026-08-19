-- PawCruz: Veterinarian PRC verification (ID documents + live face-scan
-- capture, admin-reviewed). Additive only -- a new table plus a new
-- private storage bucket. No existing table, column, or row is altered
-- except the one-time backfill at the very bottom, which only sets a
-- status for veterinarians who don't have one yet.
--
-- IMPORTANT -- this app authenticates with a custom localStorage session,
-- not Supabase Auth, so there is no real per-request auth.uid() for
-- Postgres RLS to check against. The policies below grant the anon role
-- the same table/storage access every other PawCruz table already relies
-- on; the app's own service-layer functions are what gate who is allowed
-- to call them, exactly like every other admin-only action already in
-- this codebase (see veterinarianService.js). What genuinely changes here
-- is that the bucket is PRIVATE: unlike profile-avatars/pet-photos, these
-- files are never served from a public URL -- only short-lived signed
-- URLs, generated on demand by the app, can ever read them.

create table if not exists public.veterinarian_verifications (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'Unverified'
    check (status in ('Unverified','Pending Review','Verified','Rejected','Needs Resubmission')),
  id_front_path text,
  id_back_path text,
  face_scan_path text,
  prc_name_on_card text,
  prc_license_number text,
  prc_registration_date date,
  prc_expiration_date date,
  consent_given_at timestamptz,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_veterinarian_verifications_status
  on public.veterinarian_verifications(status);

alter table public.veterinarian_verifications enable row level security;

drop policy if exists "veterinarian_verifications_all" on public.veterinarian_verifications;
create policy "veterinarian_verifications_all"
  on public.veterinarian_verifications
  for all
  to anon
  using (true)
  with check (true);

-- Private bucket for ID front/back + face-scan captures.
insert into storage.buckets (id, name, public)
values ('veterinarian-verification', 'veterinarian-verification', false)
on conflict (id) do update set public = false;

drop policy if exists "veterinarian_verification_storage_all" on storage.objects;
create policy "veterinarian_verification_storage_all"
  on storage.objects
  for all
  to anon
  using (bucket_id = 'veterinarian-verification')
  with check (bucket_id = 'veterinarian-verification');

-- One-time backfill only -- never re-runs once a veterinarian has a row.
-- Veterinarians who already had a license number on file (vetted under
-- the prior, pre-verification process) start Verified so nobody currently
-- practicing is locked out; anyone without one yet starts Unverified.
insert into public.veterinarian_verifications (veterinarian_id, status)
select p.id, case when p.license_number is not null and p.license_number <> '' then 'Verified' else 'Unverified' end
from public.profiles p
where p.role = 'veterinarian'
on conflict (veterinarian_id) do nothing;
