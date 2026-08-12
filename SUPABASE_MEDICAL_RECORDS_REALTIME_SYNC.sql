-- PawCruz Medical Records Web <-> Mobile realtime synchronization
-- Run once in the SAME Supabase project used by both the web and mobile apps.

-- Ensure UPDATE/DELETE realtime payloads have enough row identity.
alter table if exists public.medical_records replica identity full;

-- Add medical_records to the Supabase realtime publication only if not already present.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'medical_records'
  ) then
    alter publication supabase_realtime add table public.medical_records;
  end if;
end $$;

-- This script intentionally does NOT replace your existing medical-record RLS policies.
-- The mobile app uses the exact same table/API as the web app:
--   Pet Owner: owner_id = logged-in profile and record_status = 'Finalized'
--   Veterinarian: veterinarian_id = logged-in profile
-- If the web medical-record module already works, keep its existing policies/RPCs.
