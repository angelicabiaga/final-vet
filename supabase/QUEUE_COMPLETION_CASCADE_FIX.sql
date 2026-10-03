-- PawCruz: fix "Queue status must follow Waiting -> Serving" when a vet
-- clicks Complete on a medical record.
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Why: completing a ticket marks its appointment(s) Completed, and
-- sync_appointment_queue_status() then force-closes every other Waiting
-- ticket for that appointment straight to Completed. The older
-- enforce_queue_status_flow() rejected that Waiting -> Completed jump, which
-- rolled back the vet's own Serving -> Completed update too.
--
-- The strict Waiting -> Serving -> Completed flow still applies to every
-- direct update from the app. Only these database-internal close-outs may
-- skip Serving:
--   * the update comes from another trigger (pg_trigger_depth() > 1), or
--   * any appointment the ticket covers is already Completed/Cancelled.

begin;

create or replace function public.enforce_queue_status_flow()
returns trigger
language plpgsql
as $$
declare
  linked_appointment_closed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Waiting' then
      raise exception 'New queue entries must start with Waiting status';
    end if;
  elsif old.status is distinct from new.status then
    if old.status = 'Waiting' and new.status = 'Completed' then
      select exists(
        select 1
        from public.appointments a
        where a.status in ('Completed','Cancelled')
          and (
            a.id = new.appointment_id
            or a.id in (
              select qep.appointment_id
              from public.queue_entry_pets qep
              where qep.queue_entry_id = new.id
            )
          )
      ) into linked_appointment_closed;
    end if;

    if old.status = 'Waiting' then
      if new.status = 'Serving' then
        null;
      elsif new.status = 'Completed'
            and (pg_trigger_depth() > 1 or linked_appointment_closed) then
        null;
      else
        raise exception 'Queue status must follow Waiting -> Serving';
      end if;
    elsif old.status = 'Serving' and new.status <> 'Completed' then
      raise exception 'Queue status must follow Serving -> Completed';
    elsif old.status = 'Completed' then
      raise exception 'Completed queue entries cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_status_flow_guard on public.queue_entries;
create trigger queue_status_flow_guard
before insert or update of status on public.queue_entries
for each row execute function public.enforce_queue_status_flow();

-- Re-assert the today-scoped appointment -> queue cascade
-- (same as queue_status_cascade_hardening.sql) so it is in place too.
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
