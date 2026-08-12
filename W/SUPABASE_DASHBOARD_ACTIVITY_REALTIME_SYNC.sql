-- PawCruz Dashboard Track Activities Web <-> Mobile Realtime Sync
-- Run once in Supabase SQL Editor.

do $$
begin
  begin
    alter publication supabase_realtime add table public.activity_logs;
  exception when duplicate_object then null;
  end;
end $$;

-- Existing pets, appointments, medical_records and queue_entries realtime
-- setup remains in effect from the previous sync scripts.
