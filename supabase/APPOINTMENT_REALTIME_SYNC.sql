-- PawCruz Appointment Realtime Sync
-- Run this once in the same Supabase project used by both web and mobile.

-- Publish appointment changes to Supabase Realtime.
do $$ begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null;
end $$;

-- Notify Staff/Admin when a Pet Owner books an online appointment.
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
  if tg_op = 'INSERT' and new.appointment_source = 'Online' then
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
    where lower(staff.role) in ('staff','admin')
      and lower(coalesce(staff.account_status, 'active')) = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_staff_new_appointment on public.appointments;
create trigger trg_notify_staff_new_appointment
after insert on public.appointments
for each row execute function public.notify_staff_new_appointment();

-- Notify the owner whenever Staff changes appointment status.
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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_appointment_change on public.appointments;
create trigger trg_notify_owner_appointment_change
after update of status on public.appointments
for each row execute function public.notify_owner_appointment_change();

notify pgrst, 'reload schema';
