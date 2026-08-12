-- PawCruz custom username/password authentication patch
-- Run this ONCE after phase1_setup.sql.
-- This is intended for a school/demo project and stores passwords as plain text.

alter table public.profiles
  alter column auth_user_id drop not null;

alter table public.profiles
  add column if not exists password text;

alter table public.profiles
  drop constraint if exists profiles_password_length_check;

alter table public.profiles
  add constraint profiles_password_length_check
  check (password is null or char_length(password) >= 6);

-- Allow the React app (anon key) to perform the custom login and registration flow.
-- These policies expose profile rows to the frontend and are NOT production-safe.
drop policy if exists "Custom auth can read profiles" on public.profiles;
create policy "Custom auth can read profiles"
on public.profiles for select
to anon, authenticated
using (true);

drop policy if exists "Custom auth can register profiles" on public.profiles;
create policy "Custom auth can register profiles"
on public.profiles for insert
to anon, authenticated
with check (
  role = 'pet_owner'
  and account_status = 'active'
);

drop policy if exists "Custom auth can update profiles" on public.profiles;
create policy "Custom auth can update profiles"
on public.profiles for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Custom auth can create activity logs" on public.activity_logs;
create policy "Custom auth can create activity logs"
on public.activity_logs for insert
to anon, authenticated
with check (true);

drop policy if exists "Custom auth dashboard can read activity logs" on public.activity_logs;
create policy "Custom auth dashboard can read activity logs"
on public.activity_logs for select
to anon, authenticated
using (true);

create index if not exists profiles_username_lower_idx
on public.profiles (lower(username));

create index if not exists profiles_email_lower_idx
on public.profiles (lower(email));
