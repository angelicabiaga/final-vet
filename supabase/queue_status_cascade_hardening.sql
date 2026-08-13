-- PawCruz: scope the appointment -> queue auto-close cascade to TODAY's queue only.
-- Run this ONCE in the Supabase SQL Editor, after appointment_queue_numbering.sql.
--
-- Why: sync_appointment_queue_status() force-closes any Waiting/Serving queue_entries
-- row sharing the completed appointment's id, with no date filter. A queue ticket for
-- "today" should only ever affect today's rows - scoping by queue_date makes the
-- cascade precise and prevents it from ever reaching an unrelated/older test row that
-- happens to reference the same appointment_id.

begin;

create or replace function public.sync_appointment_queue_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('Completed','Cancelled') then
    update public.queue_entries
       set status = 'Completed',
           consultation_ended_at = coalesce(consultation_ended_at, now()),
           updated_at = now()
     where appointment_id = new.id
       and queue_date = current_date
       and status in ('Waiting','Serving');
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_sync_queue_status on public.appointments;
create trigger appointment_sync_queue_status
after update of status on public.appointments
for each row execute function public.sync_appointment_queue_status();

notify pgrst, 'reload schema';
commit;
