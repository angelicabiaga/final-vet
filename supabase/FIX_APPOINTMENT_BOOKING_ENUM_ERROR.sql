-- PawCruz: fixes "function lower(user_role) does not exist" that was
-- breaking every pet-owner online booking.
--
-- Root cause: public.profiles.role and public.profiles.account_status are
-- custom enum types, not plain text -- lower() has no overload for enums,
-- only text. The original notify_staff_new_appointment() called
-- lower(staff.role) directly, which throws and rolls back the ENTIRE
-- appointment insert whenever a pet owner books online (appointment_source
-- = 'Online' is exactly what makes this trigger fire).
--
-- This got reintroduced when APPOINTMENT_REALTIME_SYNC.sql's original
-- (pre-fix) body was re-run as part of RUN_EVERYTHING.sql -- this file
-- re-applies the already-correct fix from FIX_USER_ROLE_LOWER_ERROR.sql,
-- and defensively adds the same ::text cast to appointments.status
-- (also an enum) in notify_owner_appointment_change, which concatenates
-- it into a message string.
--
-- Safe to run standalone, any time, as many times as needed.

create or replace function public.notify_staff_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pet_name_value text;
  owner_name_value text;
  vet_name_value text;
begin
  if tg_op = 'INSERT' and new.appointment_source::text = 'Online' then
    select p.pet_name into pet_name_value from public.pets p where p.id = new.pet_id;
    select pr.full_name into owner_name_value from public.profiles pr where pr.id = new.owner_id;
    select pr.full_name into vet_name_value from public.profiles pr where pr.id = new.veterinarian_id;

    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    )
    select
      staff.id,
      'New Online Appointment',
      coalesce(owner_name_value, 'A pet owner') || ' booked ' ||
      coalesce(pet_name_value, 'a pet') || ' with ' ||
      coalesce(vet_name_value, 'a veterinarian') || ' on ' ||
      to_char(new.appointment_date, 'Mon DD, YYYY') || ' at ' ||
      to_char(new.start_time, 'HH12:MI AM'),
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    from public.profiles staff
    where lower(staff.role::text) in ('staff','admin','administrator')
      and lower(coalesce(staff.account_status::text, 'active')) = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_staff_new_appointment on public.appointments;
create trigger trg_notify_staff_new_appointment
after insert on public.appointments
for each row execute function public.notify_staff_new_appointment();

-- Defensive: same enum-vs-text issue, different column
-- (appointments.status is a public.appointment_status enum).
create or replace function public.notify_owner_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment ' || new.status::text,
      'Your appointment on ' || to_char(new.appointment_date, 'Mon DD, YYYY') ||
      ' at ' || to_char(new.start_time, 'HH12:MI AM') ||
      ' is now ' || new.status::text || '.',
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  elsif tg_op = 'UPDATE' and old.status = new.status and (
    old.appointment_date is distinct from new.appointment_date or
    old.start_time is distinct from new.start_time
  ) then
    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment Rescheduled',
      'Your appointment has been rescheduled to ' ||
      to_char(new.appointment_date, 'Mon DD, YYYY') || ' at ' ||
      to_char(new.start_time, 'HH12:MI AM') || '.',
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_appointment_change on public.appointments;
create trigger trg_notify_owner_appointment_change
after update of status, appointment_date, start_time on public.appointments
for each row execute function public.notify_owner_appointment_change();

notify pgrst, 'reload schema';
