-- PawCruz Queue <-> Appointment status synchronization repair
-- Run ONCE in Supabase SQL Editor.
--
-- Fixes the case where an appointment is already Completed/Cancelled but its
-- queue entry is still Waiting/Serving, causing Pet Owner mobile to keep showing
-- an old queue number.

begin;

-- Keep the strict normal flow, but permit the database to close an active queue
-- immediately when its linked appointment has already been Completed/Cancelled.
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
    if new.appointment_id is not null then
      select exists(
        select 1
        from public.appointments a
        where a.id = new.appointment_id
          and a.status in ('Completed','Cancelled')
      ) into linked_appointment_closed;
    end if;

    if old.status = 'Waiting' then
      if new.status = 'Serving' then
        null;
      elsif new.status = 'Completed' and linked_appointment_closed then
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

-- Queue -> Appointment sync. Never turn a Cancelled appointment into Completed,
-- and never reopen a Completed/Cancelled appointment when a queue row changes.
create or replace function public.sync_queue_appointment_status()
returns trigger
language plpgsql
as $$
begin
  if new.appointment_id is null then
    return new;
  end if;

  if new.status in ('Waiting','Serving') then
    update public.appointments
       set status = 'Confirmed', updated_at = now()
     where id = new.appointment_id
       and status not in ('Completed','Cancelled');
  elsif new.status = 'Completed' then
    update public.appointments
       set status = 'Completed', updated_at = now()
     where id = new.appointment_id
       and status <> 'Cancelled';
  end if;

  return new;
end;
$$;

drop trigger if exists queue_sync_appointment on public.queue_entries;
create trigger queue_sync_appointment
after insert or update of status on public.queue_entries
for each row execute function public.sync_queue_appointment_status();

-- Appointment -> Queue sync. Once the appointment closes, its active queue entry
-- also closes so it disappears from Pet Owner mobile and the active web queue.
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
       and status in ('Waiting','Serving');
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_sync_queue_status on public.appointments;
create trigger appointment_sync_queue_status
after update of status on public.appointments
for each row execute function public.sync_appointment_queue_status();

-- Repair queue rows that are already stale right now.
update public.queue_entries q
   set status = 'Completed',
       consultation_ended_at = coalesce(q.consultation_ended_at, now()),
       updated_at = now()
  from public.appointments a
 where q.appointment_id = a.id
   and q.status in ('Waiting','Serving')
   and a.status in ('Completed','Cancelled');

-- Ensure both tables emit realtime changes to web/mobile clients.
do $$
begin
  alter publication supabase_realtime add table public.queue_entries;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
