-- PawCruz: document the "pet_owner_address_required" check constraint.
--
-- This constraint already exists on the live database (it was added
-- directly in the Supabase SQL editor at some point and was never
-- captured in a migration file here). It requires every pet_owner
-- profile to have a non-empty address. The Guest Walk-In registration
-- form did not collect an address, so every guest registration failed
-- this constraint and surfaced as "Unable to register the guest."
--
-- This file is purely additive documentation so a fresh Supabase
-- project can reproduce the same schema. It is safe to run again on
-- the existing database -- it redefines the same constraint.
-- Run this ONCE in the Supabase SQL Editor.

begin;

alter table public.profiles
  drop constraint if exists pet_owner_address_required;

alter table public.profiles
  add constraint pet_owner_address_required
  check (role <> 'pet_owner' or (address is not null and length(trim(address)) > 0));

commit;
