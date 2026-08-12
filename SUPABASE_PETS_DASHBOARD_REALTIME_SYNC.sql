-- PawCruz Pets + Pet Owner Dashboard Web ↔ Mobile Sync
-- Run once in Supabase SQL Editor.

do $$
begin
  begin
    alter publication supabase_realtime add table public.pets;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.appointments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.medical_records;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.queue_entries;
  exception when duplicate_object then null;
  end;
end $$;
