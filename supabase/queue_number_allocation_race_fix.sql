-- PawCruz: serialise queue-number allocation for appointments and queue tickets.
--
-- Run this ONCE in Supabase SQL Editor after, in order:
--   1. queue_management.sql
--   2. status_simplification_upgrade.sql
--   3. QUEUE_APPOINTMENT_TWO_WAY_STATUS_SYNC_FIX.sql
--   4. queue_visit_grouping_and_walkin.sql
--   5. appointment_queue_numbering.sql
--   6. queue_number_scheme_v2.sql
--   7. queue_status_cascade_hardening.sql
--
-- Why this is needed:
-- The previous next_queue_number() implementation only counted appointments.
-- A true walk-in has no appointment row, so two walk-ins could both receive the
-- same Q-... value even though queue_entries requires (queue_date, queue_number)
-- to be unique. This replacement uses one transaction-scoped advisory lock for
-- each queue date and checks both appointment reservations and queue tickets.
--
-- This migration leaves queue status constraints, status-flow guards, and
-- queue-to-appointment completion triggers untouched.

begin;

-- Fail early with a useful message instead of installing RPCs that cannot retain
-- the existing grouped-visit behaviour.
do $$
begin
  if to_regclass('public.queue_entries') is null then
    raise exception 'Missing public.queue_entries. Run queue_management.sql first.';
  end if;

  if to_regclass('public.queue_entry_pets') is null then
    raise exception 'Missing public.queue_entry_pets. Run queue_visit_grouping_and_walkin.sql first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'queue_number'
  ) then
    raise exception 'Missing public.appointments.queue_number. Run appointment_queue_numbering.sql first.';
  end if;
end $$;

-- Shared allocator for all automatic numbers. The lock is deliberately per
-- queue DATE (not just per hour): the legacy compact Q-H## form can become
-- textually ambiguous after 99 tickets, so allocation must be serial across
-- every hour/prefix that can write to the same unique queue_entries namespace.
create or replace function public.allocate_queue_number(
  p_source text,
  p_date date,
  p_start_time time,
  p_preferred_number text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_date, current_date);
  v_prefix text;
  v_hour24 integer;
  v_hour12 integer;
  v_sequence integer := 1;
  v_candidate text;
  v_preferred text := nullif(btrim(p_preferred_number), '');
begin
  if coalesce(p_source, '') = 'Walk-In' or v_date = current_date then
    v_prefix := 'Q';
  else
    v_prefix := 'A';
  end if;

  v_hour24 := extract(hour from coalesce(p_start_time, localtime))::integer;
  v_hour12 := v_hour24 % 12;
  if v_hour12 = 0 then
    v_hour12 := 12;
  end if;

  -- Hold the lock until the caller's insert commits or rolls back.
  perform pg_advisory_xact_lock(hashtext('pawcruz-queue-number-' || v_date::text));

  -- A booked appointment normally keeps its reserved display number. If that
  -- number was already used by an old/completed ticket, allocate a fresh one
  -- instead of failing the new queue insert with a duplicate-key error.
  if v_preferred is not null and not exists (
    select 1
    from public.queue_entries qe
    where qe.queue_date = v_date
      and qe.queue_number = v_preferred
  ) then
    return v_preferred;
  end if;

  loop
    v_candidate := v_prefix || '-' || v_hour12::text || lpad(v_sequence::text, 2, '0');

    if not exists (
      select 1
      from public.appointments a
      where a.appointment_date = v_date
        and a.queue_number = v_candidate
    ) and not exists (
      select 1
      from public.queue_entries qe
      where qe.queue_date = v_date
        and qe.queue_number = v_candidate
    ) then
      return v_candidate;
    end if;

    v_sequence := v_sequence + 1;
    if v_sequence > 999999 then
      raise exception 'No queue number is available for %', v_date;
    end if;
  end loop;
end;
$$;

-- Keep the existing public function signature used by the appointment trigger,
-- but route it through the serialized allocator above.
create or replace function public.next_queue_number(
  p_source text,
  p_date date,
  p_start_time time
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.allocate_queue_number(p_source, p_date, p_start_time, null);
end;
$$;

grant execute on function public.next_queue_number(text, date, time) to anon, authenticated;

-- Older integrations may still call the pre-v2 helper directly. Keep that
-- signature safe as well so no active allocation path bypasses the shared lock.
create or replace function public.generate_queue_number(
  p_source text,
  p_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.allocate_queue_number(
    p_source,
    p_date,
    (now() at time zone current_setting('TIMEZONE'))::time,
    null
  );
end;
$$;

grant execute on function public.generate_queue_number(text, date) to anon, authenticated;

-- Keep one display number for every pet in a visit group, including concurrent
-- inserts of the same group. The group-specific lock is acquired before looking
-- for an existing sibling appointment, so the second insert reuses the first
-- number instead of racing to allocate another one.
create or replace function public.assign_appointment_queue_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_number text;
begin
  if nullif(btrim(new.queue_number), '') is not null then
    return new;
  end if;

  if new.visit_group_id is not null then
    perform pg_advisory_xact_lock(hashtext('pawcruz-visit-group-' || new.visit_group_id::text));

    select a.queue_number
      into v_existing_number
      from public.appointments a
     where a.visit_group_id = new.visit_group_id
       and nullif(btrim(a.queue_number), '') is not null
     order by a.created_at, a.id
     limit 1;

    if v_existing_number is not null then
      new.queue_number := v_existing_number;
      return new;
    end if;
  end if;

  new.queue_number := public.next_queue_number(
    new.appointment_source::text,
    new.appointment_date,
    new.start_time
  );
  return new;
end;
$$;

drop trigger if exists appointments_assign_queue_number on public.appointments;
create trigger appointments_assign_queue_number
before insert on public.appointments
for each row execute function public.assign_appointment_queue_number();

-- Single-pet queue creation is retained for existing/mobile callers. It now
-- shares the allocator with grouped check-in and locks an appointment while it
-- verifies the appointment has not already been checked in.
create or replace function public.create_queue_entry(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_owner_id uuid,
  p_veterinarian_id uuid,
  p_source text,
  p_created_by uuid,
  p_priority_level integer default 3,
  p_priority_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  qid uuid;
  qnum text;
  appt public.appointments%rowtype;
  is_late boolean := false;
  allocation_time time := (now() at time zone current_setting('TIMEZONE'))::time;
begin
  if p_pet_id is null then
    raise exception 'A pet is required';
  end if;

  if p_appointment_id is not null then
    perform pg_advisory_xact_lock(hashtext('pawcruz-checkin-appointment-' || p_appointment_id::text));

    select * into appt
    from public.appointments
    where id = p_appointment_id;

    if not found then
      raise exception 'Appointment not found';
    end if;

    if exists (
      select 1
      from public.queue_entries qe
      where qe.queue_date = current_date
        and (
          qe.appointment_id = p_appointment_id
          or exists (
            select 1
            from public.queue_entry_pets qep
            where qep.queue_entry_id = qe.id
              and qep.appointment_id = p_appointment_id
          )
        )
    ) then
      raise exception 'Appointment is already checked in';
    end if;

    is_late := now() > ((appt.appointment_date + appt.start_time) at time zone current_setting('TIMEZONE')) + interval '15 minutes';
    allocation_time := appt.start_time;
  end if;

  qnum := public.allocate_queue_number(
    p_source,
    current_date,
    allocation_time,
    case when p_appointment_id is null then null else appt.queue_number end
  );

  insert into public.queue_entries(
    queue_number, appointment_id, pet_id, owner_id, veterinarian_id, source,
    priority_level, priority_reason, late_arrival, original_appointment_time, created_by
  ) values (
    qnum, p_appointment_id, p_pet_id, p_owner_id, p_veterinarian_id, p_source,
    coalesce(p_priority_level, 3), p_priority_reason, is_late,
    case when p_appointment_id is null then null else appt.start_time end,
    p_created_by
  ) returning id into qid;

  insert into public.queue_entry_pets(queue_entry_id, appointment_id, pet_id)
  values (qid, p_appointment_id, p_pet_id)
  on conflict (queue_entry_id, pet_id) do nothing;

  if p_appointment_id is not null then
    update public.appointments
       set status = 'Confirmed', updated_at = now()
     where id = p_appointment_id;
  end if;

  return qid;
end;
$$;

grant execute on function public.create_queue_entry(uuid, uuid, uuid, uuid, text, uuid, integer, text)
  to anon, authenticated;

-- Current web callers use this grouped RPC for both scheduled visits and true
-- walk-ins. It preserves one queue ticket per visit while atomically assigning
-- a number that cannot collide with any existing ticket for that queue date.
create or replace function public.create_group_queue_entry(
  p_appointment_ids uuid[],
  p_pet_ids uuid[],
  p_owner_id uuid,
  p_veterinarian_id uuid,
  p_source text,
  p_created_by uuid,
  p_priority_level integer default 3,
  p_priority_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  qid uuid;
  qnum text;
  primary_appointment_id uuid;
  primary_pet_id uuid;
  primary_appt public.appointments%rowtype;
  is_late boolean := false;
  i integer;
  locked_appointment_id uuid;
  appt_count integer := coalesce(array_length(p_appointment_ids, 1), 0);
  pet_count integer := coalesce(array_length(p_pet_ids, 1), 0);
  allocation_time time := (now() at time zone current_setting('TIMEZONE'))::time;
begin
  if pet_count < 1 then
    raise exception 'At least one pet is required';
  end if;

  if appt_count > 0 and appt_count <> pet_count then
    raise exception 'Appointment and pet lists must match in length';
  end if;

  if appt_count > 0 then
    -- Sorting locks prevents overlapping grouped check-ins from deadlocking.
    for locked_appointment_id in
      select distinct appointment_id
      from unnest(p_appointment_ids) as ids(appointment_id)
      where appointment_id is not null
      order by appointment_id
    loop
      perform pg_advisory_xact_lock(
        hashtext('pawcruz-checkin-appointment-' || locked_appointment_id::text)
      );
    end loop;

    select a.* into primary_appt
    from public.appointments a
    where a.id = any(p_appointment_ids)
    order by a.start_time asc
    limit 1;

    if not found then
      raise exception 'Appointment not found';
    end if;

    primary_appointment_id := primary_appt.id;
    primary_pet_id := primary_appt.pet_id;

    if exists (
      select 1
      from public.queue_entries qe
      where qe.queue_date = current_date
        and (
          qe.appointment_id = any(p_appointment_ids)
          or exists (
            select 1
            from public.queue_entry_pets qep
            where qep.queue_entry_id = qe.id
              and qep.appointment_id = any(p_appointment_ids)
          )
        )
    ) then
      raise exception 'One or more of these appointments is already checked in';
    end if;

    is_late := now() > ((primary_appt.appointment_date + primary_appt.start_time) at time zone current_setting('TIMEZONE')) + interval '15 minutes';
    allocation_time := primary_appt.start_time;
  else
    primary_pet_id := p_pet_ids[1];
  end if;

  qnum := public.allocate_queue_number(
    p_source,
    current_date,
    allocation_time,
    case when primary_appointment_id is null then null else primary_appt.queue_number end
  );

  insert into public.queue_entries(
    queue_number, appointment_id, pet_id, owner_id, veterinarian_id, source,
    priority_level, priority_reason, late_arrival, original_appointment_time, created_by
  ) values (
    qnum, primary_appointment_id, primary_pet_id, p_owner_id, p_veterinarian_id, p_source,
    coalesce(p_priority_level, 3), p_priority_reason, is_late,
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
    update public.appointments
       set status = 'Confirmed', updated_at = now()
     where id = any(p_appointment_ids);
  end if;

  return qid;
end;
$$;

grant execute on function public.create_group_queue_entry(uuid[], uuid[], uuid, uuid, text, uuid, integer, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
