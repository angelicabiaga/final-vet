-- PawCruz: track accounts that must change their password on next login
-- (used by the Guest walk-in flow, which now issues a real temporary
-- password instead of leaving the account passwordless).
-- Run this ONCE in the Supabase SQL Editor. Purely additive.

begin;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

commit;
