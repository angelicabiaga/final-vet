-- PawCruz: bring the digital medical record closer to the clinic's physical
-- "Health Record" card - structured Parasite Prevention entries, Heartworm
-- Test results, and a per-vaccine Vaccination Record table (instead of one
-- free-text vaccination box). Run this ONCE in the Supabase SQL Editor.
-- Purely additive: existing columns (including the old `vaccination` text
-- field) are untouched, new structured fields use safe defaults.

begin;

alter table public.medical_records
  add column if not exists parasite_treatments jsonb not null default '[]'::jsonb,
  add column if not exists heartworm_tests jsonb not null default '[]'::jsonb,
  add column if not exists vaccination_records jsonb not null default '[]'::jsonb,
  add column if not exists record_template text not null default 'health-record',
  add column if not exists template_data jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
commit;
