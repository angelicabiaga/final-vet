-- PawCruz: Per-device login verification (replaces the old client-side
-- "don't ask again for 30 days" trust, which lived only in localStorage
-- and had no server record at all -- see src/services/authService.js
-- history).
--
-- One physical browser/app install holds exactly one stable device token
-- (the HttpOnly cookie on web, the SecureStore value on mobile -- see
-- register-trusted-device) that never changes just because a different
-- account logs in on it. A row in this table represents one (user_id,
-- device token) PAIR, not the device token alone -- so the same device
-- token can and does appear in multiple rows, one per account that has
-- trusted this device. Logging into a second account and checking "Trust
-- this device" adds a new row for that account without touching,
-- replacing, or regenerating the device token itself or any other
-- account's row -- that's what makes returning to the first account on
-- the same device within its own 30 days still skip OTP.
--
-- A device becomes trusted for a given account only when that account's
-- user checks "Trust this device for 30 days" on the login OTP screen --
-- leaving it unchecked (the default) means the next login for that
-- account always requires OTP again, and no row is written for it at
-- all. When checked, that account's expires_at is fixed at exactly 30
-- days from that moment (set server-side by register-trusted-device, not
-- extended just by using the device again during that window), and that
-- account's trust on this device ends at whichever of these happens
-- first:
--   - expires_at passes (30 days after it was granted), or
--   - the device token is cleared client-side (cookie/SecureStore wiped,
--     e.g. by clearing site data or reinstalling the app -- this affects
--     every account's rows tied to that token, since they all shared it), or
--   - the account's password is changed/reset (see the trigger below,
--     which only ever touches that one account's own rows), or
--   - that specific row is revoked/deleted by some future admin action.
--
-- Only a hash of the device token is ever stored here -- the raw token
-- lives only in the caller's HttpOnly cookie (web) or SecureStore
-- (mobile), and is checked/issued exclusively through the
-- check-trusted-device / register-trusted-device Edge Functions using the
-- service role key. This table intentionally has RLS enabled with NO
-- policies for anon/authenticated, so the anon-key frontend (which this
-- app's custom auth otherwise gives very broad access to, see
-- custom_auth_patch.sql) cannot read, insert, or delete rows here
-- directly -- only the service role (which bypasses RLS) can, i.e. only
-- the two Edge Functions above.
--
-- Apply this once in the Supabase SQL editor, after custom_auth_patch.sql.
-- Safe to re-run on a database created by an earlier copy of this file --
-- see the index migration below, which upgrades the old
-- one-token-globally constraint to the one-token-per-account model.

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

-- Additive column healing, matching this repo's other SQL files (see
-- DATA_PRIVACY_CONSENT.sql) -- a no-op if the table already has this
-- column (the normal case once this file has run once), but heals an
-- earlier copy of this table that predates the 30-day expiry.
alter table public.trusted_devices add column if not exists expires_at timestamptz;

alter table public.trusted_devices enable row level security;
-- No policies are created for anon/authenticated on purpose -- with RLS
-- enabled and zero policies, every role except the RLS-bypassing service
-- role is denied all access by default.

-- Heals an earlier copy of this table, which made token_hash unique
-- GLOBALLY -- meaning only one account in the whole system could ever
-- trust a given device token, so a second account trusting the same
-- browser would fail to insert (or would require reusing the first
-- account's row, overwriting its trust). The correct uniqueness is per
-- (user_id, token_hash) pair: one account can only have one row for a
-- given device token (so re-trusting the same device just extends that
-- one row instead of duplicating it, see the upsert in
-- register-trusted-device), but many different accounts can each hold
-- their own row for that same shared device token.
drop index if exists public.trusted_devices_token_hash_key;

create unique index if not exists trusted_devices_user_token_key
  on public.trusted_devices (user_id, token_hash);

create index if not exists trusted_devices_user_id_idx
  on public.trusted_devices (user_id);

-- Changing or resetting a password must force OTP on every device again,
-- no matter which screen/service performed the update (web forgot-password
-- reset, the forced first-login password change, an admin-issued reset,
-- a future mobile flow, ...). Hanging this off the profiles.password
-- column itself -- instead of adding a revoke call to every place that
-- updates it -- means no future password-change code path can forget to
-- do this.
create or replace function public.pawcruz_revoke_trusted_devices_on_password_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trusted_devices where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists trusted_devices_revoke_on_password_change on public.profiles;
create trigger trusted_devices_revoke_on_password_change
after update of password on public.profiles
for each row
when (old.password is distinct from new.password)
execute function public.pawcruz_revoke_trusted_devices_on_password_change();
