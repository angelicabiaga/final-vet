-- PawCruz: Veterinarian profile fields (license number, specialization,
-- and Background in Veterinary Medicine details).
-- Additive only -- every column is nullable, so all existing profiles rows
-- (every role) are completely unaffected until a veterinarian's profile is
-- edited through the new Veterinarians module. Safe to run multiple times.

alter table public.profiles add column if not exists license_number text;
alter table public.profiles add column if not exists specialization text;
alter table public.profiles add column if not exists years_experience integer;
alter table public.profiles add column if not exists education text;
alter table public.profiles add column if not exists certifications_training text;
alter table public.profiles add column if not exists previous_practice text;
alter table public.profiles add column if not exists professional_interests text;
alter table public.profiles add column if not exists biography text;

-- License numbers must be unique per veterinarian, but NULL is allowed to
-- repeat (every non-veterinarian profile, and any veterinarian who hasn't
-- had a license number recorded yet).
create unique index if not exists idx_profiles_license_number
  on public.profiles(license_number)
  where license_number is not null;
