-- PawCruz Web <-> Mobile Live Queue synchronization
-- Run once in Supabase SQL Editor.

-- Make sure authenticated/mobile clients can read the shared queue table.
alter table public.queue_entries enable row level security;

do $$
begin
  create policy "queue read for authenticated users"
    on public.queue_entries
    for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

grant select on public.queue_entries to authenticated;
grant select on public.pets to authenticated;
grant select on public.profiles to authenticated;
grant select on public.appointments to authenticated;

-- Enable queue INSERT/UPDATE/DELETE events for Supabase Realtime.
do $$
begin
  alter publication supabase_realtime add table public.queue_entries;
exception
  when duplicate_object then null;
end $$;

-- Ensure updated_at changes whenever Staff updates queue status/order.
create or replace function public.queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists queue_set_updated_at on public.queue_entries;
create trigger queue_set_updated_at
before update on public.queue_entries
for each row execute function public.queue_updated_at();

-- Queue statuses remain strictly aligned with the PawCruz web flow:
-- Waiting -> Serving -> Completed
