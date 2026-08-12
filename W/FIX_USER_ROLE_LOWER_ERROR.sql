-- PawCruz fix: function lower(user_role) does not exist
-- Run this in Supabase SQL Editor. Safe to run more than once.

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

notify pgrst, 'reload schema';
