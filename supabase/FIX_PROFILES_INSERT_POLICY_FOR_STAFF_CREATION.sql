-- Fixes: "Unable to create account: new row violates row-level security
-- policy for table 'profiles'" when an Admin creates a Staff or Veterinarian
-- account from User Management (createManagedUser() in
-- src/services/userManagementService.js).
--
-- Root cause: the INSERT policy added in custom_auth_patch.sql was written
-- only for the public pet-owner self-registration flow, so its check
-- hard-codes role = 'pet_owner'. Any other role (staff, veterinarian, admin)
-- is rejected by RLS before the row is ever written -- this was never
-- updated when admin-created accounts were added.
--
-- Fix: widen the check to the actual set of roles the app can create
-- accounts for, still requiring account_status = 'active' like the
-- original policy did.

drop policy if exists "Custom auth can register profiles" on public.profiles;
create policy "Custom auth can register profiles"
on public.profiles for insert
to anon, authenticated
with check (
  role in ('pet_owner', 'staff', 'veterinarian', 'admin')
  and account_status = 'active'
);

notify pgrst, 'reload schema';
