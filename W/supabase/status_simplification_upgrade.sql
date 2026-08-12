-- PawCruz status simplification upgrade
-- Run this entire file in Supabase SQL Editor after backing up your database.

begin;

-- APPOINTMENTS: convert all legacy states into the three supported states.
update public.appointments set status = 'Confirmed'
where status::text in ('Pending','Checked In','In Queue','In Consultation','Ongoing','In Progress','Rescheduled','Rejected','No Show');

-- Keep Completed and Cancelled unchanged. Any unknown remaining state becomes Confirmed.
update public.appointments set status = 'Confirmed'
where status::text not in ('Confirmed','Completed','Cancelled');

alter table public.appointments drop constraint if exists appointments_status_allowed_check;
alter table public.appointments add constraint appointments_status_allowed_check
check (status::text in ('Confirmed','Completed','Cancelled'));

-- QUEUE: remove old constraint before converting legacy values.
alter table public.queue_entries drop constraint if exists queue_entries_status_check;

update public.queue_entries set status = 'Serving'
where status in ('Called','Now Serving','In Progress','Ongoing');
update public.queue_entries set status = 'Waiting'
where status in ('Pending','Confirmed','Temporarily Skipped');
update public.queue_entries set status = 'Completed'
where status in ('Done','Cancelled','No Show');
update public.queue_entries set status = 'Waiting'
where status not in ('Waiting','Serving','Completed');

alter table public.queue_entries add constraint queue_entries_status_check
check (status in ('Waiting','Serving','Completed'));

-- Enforce Waiting -> Serving -> Completed. Inserts must start as Waiting.
create or replace function public.enforce_queue_status_flow()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Waiting' then
      raise exception 'New queue entries must start with Waiting status';
    end if;
  elsif old.status is distinct from new.status then
    if old.status = 'Waiting' and new.status <> 'Serving' then
      raise exception 'Queue status must follow Waiting -> Serving';
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

-- Queue activity keeps an appointment Confirmed until consultation completion.
create or replace function public.sync_queue_appointment_status()
returns trigger language plpgsql as $$
begin
  if new.appointment_id is null then return new; end if;
  if new.status in ('Waiting','Serving') then
    update public.appointments set status='Confirmed' where id=new.appointment_id;
  elsif new.status='Completed' then
    update public.appointments set status='Completed' where id=new.appointment_id;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
