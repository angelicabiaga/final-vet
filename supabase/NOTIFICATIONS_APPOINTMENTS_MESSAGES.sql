-- PawCruz: fill the remaining notification gaps for real-time push +
-- sound/popup (the front-end sound/toast system reacts to ANY insert into
-- public.notifications -- this file is what actually creates the rows for
-- the events that didn't have one yet).
--
-- Covers:
--   1. A pet owner is notified when someone ELSE (staff/admin) creates an
--      appointment on their behalf -- today only the reverse direction
--      (owner books online -> staff notified) existed.
--   2. Rescheduling an appointment (date/time change with status staying
--      "Confirmed", per rescheduleAppointment() in appointmentService.js)
--      now notifies the owner -- today only a STATUS change did.
--   3. A new chat message notifies every other participant in the
--      conversation -- today messaging was completely disconnected from
--      the notifications table.
--
-- Apply this once in the Supabase SQL editor, after
-- APPOINTMENT_REALTIME_SYNC.sql and FINAL_REPAIR_messages_api.sql.

-- ---------------------------------------------------------------------
-- 1. Notify the owner when someone else books an appointment for them.
-- ---------------------------------------------------------------------

create or replace function public.notify_owner_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pet_name_value text;
  vet_name_value text;
begin
  if tg_op = 'INSERT' and new.created_by is distinct from new.owner_id then
    select p.pet_name into pet_name_value from public.pets p where p.id = new.pet_id;
    select pr.full_name into vet_name_value from public.profiles pr where pr.id = new.veterinarian_id;

    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment Booked',
      'An appointment for ' || coalesce(pet_name_value, 'your pet') || ' with ' ||
      coalesce(vet_name_value, 'a veterinarian') || ' was booked for ' ||
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

drop trigger if exists trg_notify_owner_new_appointment on public.appointments;
create trigger trg_notify_owner_new_appointment
after insert on public.appointments
for each row execute function public.notify_owner_new_appointment();

-- ---------------------------------------------------------------------
-- 2. Extend the owner-appointment-change notification to also cover
--    reschedules (date/time changed, status unchanged) -- previously only
--    a status change (Confirmed/Completed/Cancelled) fired anything.
-- ---------------------------------------------------------------------

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
      'Appointment ' || new.status,
      'Your appointment on ' || to_char(new.appointment_date, 'Mon DD, YYYY') ||
      ' at ' || to_char(new.start_time, 'HH12:MI AM') ||
      ' is now ' || new.status || '.',
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

-- ---------------------------------------------------------------------
-- 3. Notify every other conversation participant on a new message.
-- ---------------------------------------------------------------------

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
  v_preview text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  v_preview := coalesce(nullif(btrim(new.body), ''), 'Sent an attachment.');
  if length(v_preview) > 140 then
    v_preview := left(v_preview, 137) || '...';
  end if;

  insert into public.notifications (
    recipient_id, title, message, notification_type,
    related_module, related_record, created_by
  )
  select
    cp.profile_id,
    'New message from ' || coalesce(v_sender_name, 'PawCruz'),
    v_preview,
    'Message',
    'Messages',
    new.conversation_id,
    new.sender_id
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.profile_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
after insert on public.messages
for each row execute function public.notify_new_message();

notify pgrst, 'reload schema';
