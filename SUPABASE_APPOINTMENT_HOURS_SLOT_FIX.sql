-- PawCruz Appointment Hours + One-Booking-Per-Slot Fix
-- Run once in Supabase SQL Editor.
-- Clinic booking hours: 9:00 AM–7:00 PM.
-- Each confirmed veterinarian/date/start-time slot can belong to only one appointment.

-- Extend currently active weekly veterinarian schedules to clinic closing time.
update public.veterinarian_schedules
set end_time = time '19:00'
where is_available = true
  and end_time is not null
  and end_time < time '19:00';

-- Extend active date-specific overrides only when they currently end earlier.
update public.veterinarian_schedule_overrides
set end_time = time '19:00'
where is_available = true
  and end_time is not null
  and end_time < time '19:00';

-- Keep the unique index when the database has no existing duplicate confirmed slots.
do $$
begin
  if not exists (
    select 1
    from public.appointments
    where status = 'Confirmed'
    group by veterinarian_id, appointment_date, start_time
    having count(*) > 1
  ) then
    create unique index if not exists uq_active_vet_slot
      on public.appointments(veterinarian_id, appointment_date, start_time)
      where status = 'Confirmed';
  end if;
end $$;

-- Serialize attempts to reserve the same veterinarian/date/time and reject a duplicate.
create or replace function public.prevent_duplicate_confirmed_appointment_slot()
returns trigger
language plpgsql
as $$
declare
  slot_key text;
begin
  if new.status <> 'Confirmed' then
    return new;
  end if;

  if new.start_time < time '09:00'
     or new.end_time > time '19:00'
     or new.end_time <= new.start_time then
    raise exception 'Appointment must be within clinic hours, 09:00 to 19:00.';
  end if;

  slot_key :=
    new.veterinarian_id::text || '|' ||
    new.appointment_date::text || '|' ||
    new.start_time::text;

  perform pg_advisory_xact_lock(hashtext(slot_key));

  if exists (
    select 1
    from public.appointments a
    where a.veterinarian_id = new.veterinarian_id
      and a.appointment_date = new.appointment_date
      and a.start_time = new.start_time
      and a.status = 'Confirmed'
      and a.id is distinct from new.id
  ) then
    raise exception 'That appointment time is already booked. Please choose another slot.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_confirmed_appointment_slot
on public.appointments;

create trigger trg_prevent_duplicate_confirmed_appointment_slot
before insert or update of veterinarian_id, appointment_date, start_time, end_time, status
on public.appointments
for each row
execute function public.prevent_duplicate_confirmed_appointment_slot();

notify pgrst, 'reload schema';
