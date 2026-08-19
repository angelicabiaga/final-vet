-- PawCruz: a permanent, browsable record of every "Purchasing Elsewhere"
-- declaration -- even though no money changes hands and nothing touches
-- the transactions table, staff still need a discoverable, timestamped
-- trail of it (not just a mutable status field on the prescription that
-- could get overwritten with no history).
--
-- Apply this once in the Supabase SQL editor.

create table if not exists public.prescription_activity_log (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  queue_entry_id uuid references public.queue_entries(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  item_name text not null,
  action text not null default 'Purchasing Elsewhere',
  remaining_quantity numeric(12,2),
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prescription_activity_log_created on public.prescription_activity_log(created_at desc);
create index if not exists idx_prescription_activity_log_prescription on public.prescription_activity_log(prescription_id);

grant select, insert on public.prescription_activity_log to anon, authenticated;
alter table public.prescription_activity_log enable row level security;
drop policy if exists "PawCruz prescription activity log demo access" on public.prescription_activity_log;
create policy "PawCruz prescription activity log demo access" on public.prescription_activity_log for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prescription_activity_log'
  ) then
    alter publication supabase_realtime add table public.prescription_activity_log;
  end if;
end $$;

notify pgrst, 'reload schema';
