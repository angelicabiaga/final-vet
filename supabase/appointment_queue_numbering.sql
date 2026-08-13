-- PawCruz: assign the display queue number at BOOKING time (not check-in time),
-- using a source-specific scheme, and have check-in reuse that same number.
-- Run this ONCE in the Supabase SQL Editor, after queue_visit_grouping_and_walkin.sql.
-- Purely additive: no existing column, table, or row is removed or renamed.
--
-- Scheme:
--   appointment_source = 'Online'   -> "E-001", "E-002", ... sequential per day.
--   appointment_source = 'Walk-In'  -> "#H01", "#H02", ... per hour-block per day,
--                                      where H is the 12-hour clock hour of start_time
--                                      (e.g. 3:xx PM -> "#301", "#302"; 4:xx PM -> "#401").
-- A multi-pet visit (shared visit_group_id) gets ONE number, reused by every pet's
-- appointment row in that visit - it's one ticket, not one number per pet.

begin;

alter table public.appointments add column if not exists queue_number text;
create index if not exists idx_appointments_queue_number on public.appointments(appointment_date, queue_number);

create or replace function public.next_queue_number(p_source text, p_date date, p_start_time time)
returns text language plpgsql security definer set search_path=public as $$
declare
  hour24 integer;
  hour12 integer;
  seq integer;
begin
  if p_source = 'Online' then
    perform pg_advisory_xact_lock(hashtext('queuenum-E-' || p_date::text));
    select count(*) + 1 into seq
    from public.appointments
    where appointment_date = p_date
      and appointment_source = 'Online'
      and queue_number is not null;
    return 'E-' || lpad(seq::text, 3, '0');
  else
    hour24 := extract(hour from coalesce(p_start_time, localtime))::integer;
    hour12 := hour24 % 12;
    if hour12 = 0 then hour12 := 12; end if;
    perform pg_advisory_xact_lock(hashtext('queuenum-W-' || p_date::text || '-' || hour24::text));
    select count(*) + 1 into seq
    from public.appointments
    where appointment_date = p_date
      and appointment_source = 'Walk-In'
      and queue_number is not null
      and extract(hour from start_time)::integer = hour24;
    return '#' || hour12::text || lpad(seq::text, 2, '0');
  end if;
end $$;

grant execute on function public.next_queue_number(text,date,time) to anon, authenticated;

create or replace function public.assign_appointment_queue_number()
returns trigger language plpgsql as $$
declare existing_number text;
begin
  if new.queue_number is not null then
    return new;
  end if;

  if new.visit_group_id is not null then
    select queue_number into existing_number
    from public.appointments
    where visit_group_id = new.visit_group_id and queue_number is not null
    limit 1;
    if existing_number is not null then
      new.queue_number := existing_number;
      return new;
    end if;
  end if;

  new.queue_number := public.next_queue_number(new.appointment_source::text, new.appointment_date, new.start_time);
  return new;
end $$;

drop trigger if exists appointments_assign_queue_number on public.appointments;
create trigger appointments_assign_queue_number
before insert on public.appointments
for each row execute function public.assign_appointment_queue_number();

-- Check-in now carries the appointment's already-assigned number forward instead
-- of generating a fresh one. Only a true walk-in with no appointment row at all
-- (no scheduled slot) still falls back to generating one on the spot.
create or replace function public.create_queue_entry(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_owner_id uuid,
  p_veterinarian_id uuid,
  p_source text,
  p_created_by uuid,
  p_priority_level integer default 3,
  p_priority_reason text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare qid uuid; qnum text; appt public.appointments%rowtype; is_late boolean:=false;
begin
  if p_appointment_id is not null then
    select * into appt from public.appointments where id=p_appointment_id;
    if not found then raise exception 'Appointment not found'; end if;
    if exists(
      select 1 from public.queue_entries qe
      where qe.queue_date=current_date and qe.status <> 'Completed'
        and (
          qe.appointment_id = p_appointment_id
          or exists(
            select 1 from public.queue_entry_pets qep
            where qep.queue_entry_id = qe.id and qep.appointment_id = p_appointment_id
          )
        )
    ) then
      raise exception 'Appointment is already checked in';
    end if;
    is_late := now() > ((appt.appointment_date + appt.start_time) at time zone current_setting('TIMEZONE')) + interval '15 minutes';
  end if;
  qnum := coalesce(appt.queue_number, public.next_queue_number(p_source, current_date, (now() at time zone current_setting('TIMEZONE'))::time));
  insert into public.queue_entries(queue_number,appointment_id,pet_id,owner_id,veterinarian_id,source,priority_level,priority_reason,late_arrival,original_appointment_time,created_by)
  values(qnum,p_appointment_id,p_pet_id,p_owner_id,p_veterinarian_id,p_source,coalesce(p_priority_level,3),p_priority_reason,is_late,case when p_appointment_id is null then null else appt.start_time end,p_created_by)
  returning id into qid;
  insert into public.queue_entry_pets(queue_entry_id, appointment_id, pet_id)
  values (qid, p_appointment_id, p_pet_id)
  on conflict (queue_entry_id, pet_id) do nothing;
  if p_appointment_id is not null then update public.appointments set status='Confirmed', updated_at=now() where id=p_appointment_id; end if;
  return qid;
end $$;

grant execute on function public.create_queue_entry(uuid,uuid,uuid,uuid,text,uuid,integer,text) to anon,authenticated;

create or replace function public.create_group_queue_entry(
  p_appointment_ids uuid[],
  p_pet_ids uuid[],
  p_owner_id uuid,
  p_veterinarian_id uuid,
  p_source text,
  p_created_by uuid,
  p_priority_level integer default 3,
  p_priority_reason text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  qid uuid;
  qnum text;
  primary_appointment_id uuid;
  primary_pet_id uuid;
  primary_appt public.appointments%rowtype;
  is_late boolean := false;
  i integer;
  appt_count integer := coalesce(array_length(p_appointment_ids,1),0);
  pet_count integer := coalesce(array_length(p_pet_ids,1),0);
begin
  if pet_count < 1 then
    raise exception 'At least one pet is required';
  end if;
  if appt_count > 0 and appt_count <> pet_count then
    raise exception 'Appointment and pet lists must match in length';
  end if;

  if appt_count > 0 then
    select a.id into primary_appointment_id
    from public.appointments a
    where a.id = any(p_appointment_ids)
    order by a.start_time asc
    limit 1;

    if primary_appointment_id is null then raise exception 'Appointment not found'; end if;

    select * into primary_appt from public.appointments where id = primary_appointment_id;
    primary_pet_id := primary_appt.pet_id;

    if exists (
      select 1 from public.queue_entries qe
      where qe.queue_date = current_date and qe.status <> 'Completed'
        and (
          qe.appointment_id = any(p_appointment_ids)
          or exists(
            select 1 from public.queue_entry_pets qep
            where qep.queue_entry_id = qe.id and qep.appointment_id = any(p_appointment_ids)
          )
        )
    ) then
      raise exception 'One or more of these appointments is already checked in';
    end if;

    is_late := now() > ((primary_appt.appointment_date + primary_appt.start_time) at time zone current_setting('TIMEZONE')) + interval '15 minutes';
  else
    primary_pet_id := p_pet_ids[1];
  end if;

  qnum := coalesce(primary_appt.queue_number, public.next_queue_number(p_source, current_date, (now() at time zone current_setting('TIMEZONE'))::time));

  insert into public.queue_entries(
    queue_number, appointment_id, pet_id, owner_id, veterinarian_id, source,
    priority_level, priority_reason, late_arrival, original_appointment_time, created_by
  ) values (
    qnum, primary_appointment_id, primary_pet_id, p_owner_id, p_veterinarian_id, p_source,
    coalesce(p_priority_level,3), p_priority_reason, is_late,
    case when primary_appointment_id is null then null else primary_appt.start_time end,
    p_created_by
  ) returning id into qid;

  for i in 1 .. pet_count loop
    insert into public.queue_entry_pets(queue_entry_id, appointment_id, pet_id)
    values (
      qid,
      case when appt_count >= i then p_appointment_ids[i] else null end,
      p_pet_ids[i]
    )
    on conflict (queue_entry_id, pet_id) do nothing;
  end loop;

  if appt_count > 0 then
    update public.appointments set status='Confirmed', updated_at=now()
    where id = any(p_appointment_ids);
  end if;

  return qid;
end $$;

grant execute on function public.create_group_queue_entry(uuid[],uuid[],uuid,uuid,text,uuid,integer,text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
