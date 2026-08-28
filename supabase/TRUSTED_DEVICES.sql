-- PawCruz: Per-device login verification (replaces the old client-side
-- "don't ask again for 30 days" trust, which lived only in localStorage
-- and had no server record at all -- see src/services/authService.js
-- history).
--
-- A device becomes trusted only when the user checks "Trust this device
-- for 30 days" on the login OTP screen -- leaving it unchecked (the
-- default) means the next login always requires OTP again, and no row is
-- written here at all. When checked, expires_at is fixed at exactly 30
-- days from that moment (set server-side by register-trusted-device, not
-- extended just by using the device again during that window), and trust
-- ends at whichever of these happens first:
--   - expires_at passes (30 days after it was granted), or
--   - the browser/app clears its stored token (cookie / SecureStore), or
--   - the account's password is changed/reset (see the trigger below), or
--   - a trusted_devices row is revoked/deleted by some future admin action.
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

create unique index if not exists trusted_devices_token_hash_key
  on public.trusted_devices (token_hash);

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
