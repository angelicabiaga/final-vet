-- =====================================================================
-- PawCruz: Emergency doctor change, confirmed by the pet owner
-- =====================================================================
-- Replaces the instant "Reassign Doctor" in Queue Management.
--
--   1. Staff pick another doctor AND a time that doctor is really free
--      (inside their shift, not booked, not already offered, not in the
--      past; multi-pet visits get consecutive slots). E.g. Dr. Redmond
--      (9–5) has an emergency; the 10:00 AM patient is offered Dr. Neil
--      at 11:00 AM, or 11:10 if 11:00 is already booked.
--   2. The offer can be made from a check-in card (before check-in) or
--      from a waiting ticket. The visit is put on hold and the slot is
--      reserved for the owner.
--   3. The owner sees it in My Queue (web + mobile) and chooses Confirm,
--      Reschedule (another date/time/doctor) or Cancel. Staff can confirm
--      for an owner who is at the counter.
--   4. Only after Confirm does the visit go into the staff Live Queue:
--      the booking moves to the new doctor/time and is checked in (or the
--      waiting ticket switches doctor). The original doctor is kept on the
--      ticket for the medical record ("Originally assigned to ...").
--
-- Run once in the Supabase SQL Editor after VET_LEAVE_REQUESTS.sql,
-- EMERGENCY_DOCTOR_REASSIGNMENT.sql and queue_number_allocation_race_fix.sql.
-- Safe to run more than once.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.queue_doctor_offers (
  id uuid primary key default gen_random_uuid(),
  -- Set when the visit was already checked in (a waiting ticket); null when
  -- the offer was made from a check-in card.
  queue_entry_id uuid references public.queue_entries(id) on delete set null,
  appointment_ids uuid[] not null default '{}',
  pet_ids uuid[] not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  original_veterinarian_id uuid references public.profiles(id) on delete set null,
  proposed_veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  offer_date date not null,
  original_time time,
  proposed_time time not null,
  reason text not null,
  notes text,
  status text not null default 'Pending',
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  response_note text,
  final_veterinarian_id uuid references public.profiles(id) on delete set null,
  final_date date,
  final_time time,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queue_doctor_offers_status_check
    check (status in ('Pending', 'Confirmed', 'Rescheduled', 'Cancelled', 'Withdrawn'))
);

create index if not exists idx_doctor_offers_owner on public.queue_doctor_offers(owner_id, status);
create index if not exists idx_doctor_offers_hold on public.queue_doctor_offers(proposed_veterinarian_id, offer_date, status);
create unique index if not exists uq_doctor_offer_pending_entry
  on public.queue_doctor_offers(queue_entry_id)
  where status = 'Pending' and queue_entry_id is not null;

drop trigger if exists queue_doctor_offers_touch_updated_at on public.queue_doctor_offers;
create trigger queue_doctor_offers_touch_updated_at
before update on public.queue_doctor_offers
for each row execute function public.vet_leave_touch_updated_at();

-- A waiting ticket on hold points at its pending offer; the staff Live
-- Queue leaves it out until the owner answers.
alter table public.queue_entries
  add column if not exists doctor_offer_id uuid
  references public.queue_doctor_offers(id) on delete set null;

-- ---------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------

-- Start times (10-minute grid) where p_count consecutive slots are free
-- for a vet on a date: inside their effective hours (weekly roster or
-- date override, incl. leave), inside clinic hours, not booked, not held
-- by another pending doctor-change offer, and not in the past today.
create or replace function public.get_vet_free_starts(
  p_veterinarian_id uuid,
  p_date date,
  p_count integer default 1,
  p_exclude_appointment_ids uuid[] default '{}',
  p_exclude_offer_id uuid default null
)
returns time[]
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_now time := public.pawcruz_clinic_now();
  v_count integer := greatest(coalesce(p_count, 1), 1);
  v_shift record;
  v_start time;
  v_end time;
  v_slot time;
  v_taken time[];
  v_held time[];
  v_ok boolean;
  v_result time[] := array[]::time[];
  i integer;
begin
  if p_date is null or p_date < v_today then
    return v_result;
  end if;

  select * into v_shift from public.vet_base_shift(p_veterinarian_id, p_date, null);
  if not coalesce(v_shift.is_working, false) then
    return v_result;
  end if;
  v_start := greatest(v_shift.shift_start, time '09:00');
  v_end := least(v_shift.shift_end, time '19:00');

  select coalesce(array_agg(a.start_time), array[]::time[]) into v_taken
  from public.appointments a
  where a.veterinarian_id = p_veterinarian_id
    and a.appointment_date = p_date
    and a.status::text = 'Confirmed'
    and not (a.id = any(coalesce(p_exclude_appointment_ids, array[]::uuid[])));

  select coalesce(array_agg((o.proposed_time + make_interval(mins => 10 * k))::time), array[]::time[]) into v_held
  from public.queue_doctor_offers o
  cross join lateral generate_series(0, greatest(cardinality(o.pet_ids), 1) - 1) as k
  where o.status = 'Pending'
    and o.proposed_veterinarian_id = p_veterinarian_id
    and o.offer_date = p_date
    and (p_exclude_offer_id is null or o.id <> p_exclude_offer_id);
  v_taken := v_taken || v_held;

  v_slot := v_start;
  while v_slot < v_end and (v_slot + make_interval(mins => 10 * v_count))::time <= v_end loop
    if p_date > v_today or v_slot > v_now then
      v_ok := true;
      for i in 0 .. v_count - 1 loop
        if (v_slot + make_interval(mins => 10 * i))::time = any(v_taken) then
          v_ok := false;
          exit;
        end if;
      end loop;
      if v_ok then
        v_result := array_append(v_result, v_slot);
      end if;
    end if;
    v_slot := (v_slot + interval '10 minutes')::time;
  end loop;

  return v_result;
end;
$$;

-- Every active vet's free start times for a visit of p_count pets.
create or replace function public.pawcruz_visit_slot_options(
  p_date date,
  p_count integer,
  p_exclude_appointment_ids uuid[],
  p_exclude_veterinarian_id uuid,
  p_exclude_offer_id uuid
)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'veterinarian_id', pv.id,
      'full_name', pv.full_name,
      'working', coalesce(s.is_working, false),
      'shift_start', s.shift_start,
      'shift_end', s.shift_end,
      'starts', to_jsonb(public.get_vet_free_starts(pv.id, p_date, p_count, p_exclude_appointment_ids, p_exclude_offer_id)))
      order by s.shift_start nulls last, pv.full_name), '[]'::jsonb)
  from public.profiles pv
  cross join lateral public.vet_base_shift(pv.id, p_date, null) s
  where pv.role::text = 'veterinarian'
    and pv.account_status::text = 'active'
    and (p_exclude_veterinarian_id is null or pv.id <> p_exclude_veterinarian_id);
$$;

-- Why a vet can't see a visit as booked, or null when they can.
create or replace function public.pawcruz_doctor_problem(
  p_veterinarian_id uuid, p_date date, p_start time, p_end time
)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_shift record;
begin
  select * into v_shift from public.vet_base_shift(p_veterinarian_id, p_date, null);
  if not coalesce(v_shift.is_working, false) then
    return case when v_shift.override_is_leave then 'On leave' else 'Not on duty that day' end;
  end if;
  if p_start < v_shift.shift_start or p_end > v_shift.shift_end then
    return 'Only on duty ' || public.pawcruz_fmt_time(v_shift.shift_start) || ' – ' || public.pawcruz_fmt_time(v_shift.shift_end) ||
      case when v_shift.override_is_leave then ' (leave)' else '' end;
  end if;
  return null;
end;
$$;

-- Why a vet can't see a visit of p_count pets booked at p_start, or null
-- when they can. Today, a time that has already passed is checked from now,
-- since that is when the patient would actually be seen.
create or replace function public.pawcruz_visit_problem(
  p_veterinarian_id uuid, p_date date, p_start time, p_count integer default 1
)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_start time := coalesce(p_start, public.pawcruz_clinic_now());
begin
  if p_date = public.pawcruz_clinic_today() then
    v_start := greatest(v_start, public.pawcruz_clinic_now());
  end if;
  return public.pawcruz_doctor_problem(p_veterinarian_id, p_date, v_start,
    (v_start + make_interval(mins => 10 * greatest(coalesce(p_count, 1), 1)))::time);
end;
$$;

-- A visit to change doctor for: a waiting ticket, or not-yet-checked-in
-- appointments (all for the same owner, doctor and date).
create or replace function public.pawcruz_offer_visit(p_queue_entry_id uuid, p_appointment_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_entry public.queue_entries%rowtype;
  v_appointments uuid[];
  v_pets uuid[];
  v_first record;
  v_mixed integer;
begin
  if p_queue_entry_id is not null then
    select * into v_entry from public.queue_entries where id = p_queue_entry_id;
    if not found then
      raise exception 'Queue ticket not found.';
    end if;
    select coalesce(array_agg(x.appointment_id order by a.start_time), array[]::uuid[])
      into v_appointments
    from (
      select distinct qp.appointment_id from public.queue_entry_pets qp
      where qp.queue_entry_id = v_entry.id and qp.appointment_id is not null
      union
      select v_entry.appointment_id where v_entry.appointment_id is not null
    ) x
    join public.appointments a on a.id = x.appointment_id;
    select coalesce(array_agg(qp.pet_id), array[v_entry.pet_id]) into v_pets
    from public.queue_entry_pets qp where qp.queue_entry_id = v_entry.id;
    return jsonb_build_object(
      'queue_entry_id', v_entry.id, 'status', v_entry.status, 'owner_id', v_entry.owner_id,
      'veterinarian_id', v_entry.veterinarian_id, 'date', v_entry.queue_date,
      'original_time', v_entry.original_appointment_time, 'appointment_ids', to_jsonb(v_appointments),
      'pet_ids', to_jsonb(v_pets), 'doctor_offer_id', v_entry.doctor_offer_id);
  end if;

  if coalesce(cardinality(p_appointment_ids), 0) = 0 then
    raise exception 'Choose the visit to change.';
  end if;
  select a.* into v_first from public.appointments a where a.id = any(p_appointment_ids) order by a.start_time limit 1;
  if not found then
    raise exception 'Appointment not found.';
  end if;
  select count(*) into v_mixed from public.appointments a
  where a.id = any(p_appointment_ids)
    and (a.owner_id <> v_first.owner_id or a.veterinarian_id <> v_first.veterinarian_id
         or a.appointment_date <> v_first.appointment_date or a.status::text <> 'Confirmed');
  if v_mixed > 0 or (select count(*) from public.appointments where id = any(p_appointment_ids)) <> cardinality(p_appointment_ids) then
    raise exception 'These appointments are not one active visit.';
  end if;
  select array_agg(a.id order by a.start_time), array_agg(a.pet_id order by a.start_time)
    into v_appointments, v_pets
  from public.appointments a where a.id = any(p_appointment_ids);
  return jsonb_build_object(
    'queue_entry_id', null, 'status', 'Booked', 'owner_id', v_first.owner_id,
    'veterinarian_id', v_first.veterinarian_id, 'date', v_first.appointment_date,
    'original_time', v_first.start_time, 'appointment_ids', to_jsonb(v_appointments),
    'pet_ids', to_jsonb(v_pets), 'doctor_offer_id', null);
end;
$$;

-- For the staff "Change doctor" window: the visit, why the doctor can't
-- see it, and every other doctor's validated start times that day.
create or replace function public.get_doctor_change_options(
  p_queue_entry_id uuid default null,
  p_appointment_ids uuid[] default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_visit jsonb := public.pawcruz_offer_visit(p_queue_entry_id, p_appointment_ids);
  v_count integer := greatest(jsonb_array_length(v_visit->'pet_ids'), 1);
  v_date date := (v_visit->>'date')::date;
  v_vet uuid := (v_visit->>'veterinarian_id')::uuid;
  v_appointments uuid[] := array(select jsonb_array_elements_text(v_visit->'appointment_ids')::uuid);
begin
  return v_visit || jsonb_build_object(
    'pet_count', v_count,
    'current_veterinarian_name', (select full_name from public.profiles where id = v_vet),
    'problem', public.pawcruz_visit_problem(v_vet, v_date, (v_visit->>'original_time')::time, v_count),
    'today', public.pawcruz_clinic_today(),
    'now', public.pawcruz_clinic_now(),
    'vets', public.pawcruz_visit_slot_options(v_date, v_count, v_appointments, v_vet, null));
end;
$$;

-- For the owner's Reschedule picker: every doctor's free start times on a
-- date for this visit (its own booking and hold don't count as taken).
create or replace function public.get_doctor_offer_reschedule_options(p_offer_id uuid, p_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_offer public.queue_doctor_offers%rowtype;
begin
  select * into v_offer from public.queue_doctor_offers where id = p_offer_id;
  if not found then
    raise exception 'This request no longer exists.';
  end if;
  return jsonb_build_object(
    'date', p_date,
    'vets', public.pawcruz_visit_slot_options(p_date, greatest(cardinality(v_offer.pet_ids), 1),
      v_offer.appointment_ids, null, v_offer.id));
end;
$$;

-- Which check-in cards and waiting tickets have a doctor who can't see
-- them as booked (leave, emergency, outside their hours).
create or replace function public.get_queue_doctor_alerts(p_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_date date := coalesce(p_date, public.pawcruz_clinic_today());
begin
  return jsonb_build_object(
    'date', v_date,
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object('appointment_id', x.id, 'veterinarian_id', x.veterinarian_id, 'problem', x.problem))
      from (
        select a.id, a.veterinarian_id, public.pawcruz_visit_problem(a.veterinarian_id, a.appointment_date, a.start_time, 1) as problem
        from public.appointments a
        where a.appointment_date = v_date and a.status::text = 'Confirmed'
      ) x
      where x.problem is not null), '[]'::jsonb),
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object('queue_entry_id', x.id, 'veterinarian_id', x.veterinarian_id, 'problem', x.problem))
      from (
        select q.id, q.veterinarian_id, public.pawcruz_visit_problem(q.veterinarian_id, q.queue_date, q.original_appointment_time, 1) as problem
        from public.queue_entries q
        where q.queue_date = v_date and q.status = 'Waiting' and v_date = public.pawcruz_clinic_today()
      ) x
      where x.problem is not null), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Offer / answer
-- ---------------------------------------------------------------------

create or replace function public.pawcruz_offer_pet_names(p_pet_ids uuid[])
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(string_agg(p.pet_name, ', ' order by p.pet_name), 'your pet')
  from public.pets p where p.id = any(p_pet_ids);
$$;

create or replace function public.pawcruz_offer_when(p_date date, p_time time)
returns text
language sql stable
as $$
  select public.pawcruz_fmt_time(p_time) ||
    case when p_date = public.pawcruz_clinic_today() then ' today' else ' on ' || public.pawcruz_fmt_date(p_date) end;
$$;

create or replace function public.propose_doctor_change(
  p_staff_id uuid,
  p_queue_entry_id uuid,
  p_appointment_ids uuid[],
  p_new_veterinarian_id uuid,
  p_start_time time,
  p_reason text,
  p_notes text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_staff record;
  v_visit jsonb;
  v_appointments uuid[];
  v_pets uuid[];
  v_date date;
  v_old_vet uuid;
  v_offer public.queue_doctor_offers%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_notes text := nullif(btrim(p_notes), '');
  v_new_vet record;
  v_pet_names text;
begin
  select p.id, p.full_name, p.role::text as role, p.account_status::text as account_status into v_staff
  from public.profiles p where p.id = p_staff_id;
  if not found or v_staff.role not in ('staff', 'admin') or v_staff.account_status <> 'active' then
    raise exception 'Only active staff or administrators can change a visit''s doctor.';
  end if;
  if v_reason is null then
    raise exception 'Choose a reason for the change.';
  end if;
  if length(coalesce(v_notes, '')) > 500 then
    raise exception 'Keep the message to the owner under 500 characters.';
  end if;

  if p_queue_entry_id is not null then
    perform 1 from public.queue_entries where id = p_queue_entry_id for update;
  end if;
  v_visit := public.pawcruz_offer_visit(p_queue_entry_id, p_appointment_ids);
  v_appointments := array(select jsonb_array_elements_text(v_visit->'appointment_ids')::uuid);
  v_pets := array(select jsonb_array_elements_text(v_visit->'pet_ids')::uuid);
  v_date := (v_visit->>'date')::date;
  v_old_vet := (v_visit->>'veterinarian_id')::uuid;

  perform pg_advisory_xact_lock(hashtext('pawcruz-doctor-offer:' || coalesce(p_queue_entry_id::text, array_to_string(v_appointments, ','))));

  if p_queue_entry_id is not null then
    if v_visit->>'status' <> 'Waiting' then
      raise exception 'Only a waiting patient can be moved to another doctor.';
    end if;
    if v_visit->>'doctor_offer_id' is not null then
      raise exception 'This visit already has a doctor change waiting for the owner.';
    end if;
    if v_date <> public.pawcruz_clinic_today() then
      raise exception 'Only today''s queue can be changed.';
    end if;
  else
    if v_date < public.pawcruz_clinic_today() then
      raise exception 'This appointment''s date has passed.';
    end if;
    if exists (
      select 1 from public.queue_entries q
      where q.queue_date = public.pawcruz_clinic_today()
        and (q.appointment_id = any(v_appointments)
             or exists (select 1 from public.queue_entry_pets qp where qp.queue_entry_id = q.id and qp.appointment_id = any(v_appointments)))
    ) then
      raise exception 'This visit is already checked in. Change the doctor from the Live Queue.';
    end if;
    if exists (
      select 1 from public.queue_doctor_offers o
      where o.status = 'Pending' and o.appointment_ids && v_appointments
    ) then
      raise exception 'This visit already has a doctor change waiting for the owner.';
    end if;
  end if;

  -- A check-in card only when the booked doctor really can't see the visit
  -- (leave, emergency, outside their hours); otherwise it's checked in as
  -- booked. A waiting ticket in the Live Queue can always be reassigned.
  if p_queue_entry_id is null
     and public.pawcruz_visit_problem(v_old_vet, v_date, (v_visit->>'original_time')::time, greatest(cardinality(v_pets), 1)) is null then
    raise exception '% is available for this visit, so the doctor can''t be changed.',
      public.pawcruz_dr_name((select full_name from public.profiles where id = v_old_vet));
  end if;

  select p.id, p.full_name, p.role::text as role, p.account_status::text as account_status into v_new_vet
  from public.profiles p where p.id = p_new_veterinarian_id;
  if not found or v_new_vet.role <> 'veterinarian' or v_new_vet.account_status <> 'active' then
    raise exception 'Choose an active veterinarian.';
  end if;
  if p_new_veterinarian_id = v_old_vet then
    raise exception 'The visit is already with that doctor.';
  end if;

  perform pg_advisory_xact_lock(hashtext('pawcruz-doctor-slots:' || p_new_veterinarian_id::text || v_date::text));
  if p_start_time is null or not (p_start_time = any(public.get_vet_free_starts(
      p_new_veterinarian_id, v_date, greatest(cardinality(v_pets), 1), v_appointments, null))) then
    raise exception '% isn''t free at % for this visit. Pick one of the listed times.',
      public.pawcruz_dr_name(v_new_vet.full_name), coalesce(public.pawcruz_fmt_time(p_start_time), 'that time');
  end if;

  insert into public.queue_doctor_offers (
    queue_entry_id, appointment_ids, pet_ids, owner_id, original_veterinarian_id, proposed_veterinarian_id,
    offer_date, original_time, proposed_time, reason, notes, created_by
  ) values (
    p_queue_entry_id, v_appointments, v_pets, (v_visit->>'owner_id')::uuid, v_old_vet, p_new_veterinarian_id,
    v_date, (v_visit->>'original_time')::time, p_start_time, v_reason, v_notes, p_staff_id
  )
  returning * into v_offer;

  if p_queue_entry_id is not null then
    update public.queue_entries set doctor_offer_id = v_offer.id where id = p_queue_entry_id;
  end if;

  v_pet_names := public.pawcruz_offer_pet_names(v_pets);
  insert into public.notifications (recipient_id, title, message, notification_type, related_module, related_record, created_by)
  values (
    v_offer.owner_id,
    'Please confirm your visit',
    public.pawcruz_dr_name((select full_name from public.profiles where id = v_old_vet)) || ' can''t see ' || v_pet_names ||
      ' as planned (' || v_reason || ').' || coalesce(' ' || v_notes, '') || ' ' ||
      public.pawcruz_dr_name(v_new_vet.full_name) || ' can see ' || v_pet_names || ' at ' ||
      public.pawcruz_offer_when(v_date, p_start_time) || '. Open My Queue to confirm, reschedule, or cancel.',
    'Queue Update', 'Queue', v_offer.id, p_staff_id
  );
  perform public.pawcruz_log_schedule_activity(p_staff_id, 'Doctor Change Offered',
    'Offered ' || public.pawcruz_dr_name(v_new_vet.full_name) || ' at ' || public.pawcruz_offer_when(v_date, p_start_time) ||
    ' for ' || v_pet_names || ' (' || v_reason || ').', v_offer.id);

  return to_jsonb(v_offer);
end;
$$;

-- p_action: 'confirm' | 'reschedule' | 'cancel'. The owner answers from My
-- Queue; staff may answer for an owner who is at the counter.
create or replace function public.respond_doctor_offer(
  p_offer_id uuid,
  p_actor_id uuid,
  p_action text,
  p_new_date date default null,
  p_new_veterinarian_id uuid default null,
  p_new_time time default null,
  p_note text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_action text := lower(coalesce(btrim(p_action), ''));
  v_offer public.queue_doctor_offers%rowtype;
  v_actor record;
  v_is_staff boolean;
  v_today date := public.pawcruz_clinic_today();
  v_now time := public.pawcruz_clinic_now();
  v_count integer;
  v_vet uuid;
  v_date date;
  v_time time;
  v_first_time time;
  v_old_vet uuid;
  v_ids uuid[];
  v_id uuid;
  v_i integer;
  v_qid uuid;
  v_pet_names text;
  v_vet_name text;
  v_title text;
  v_message text;
begin
  select * into v_offer from public.queue_doctor_offers where id = p_offer_id for update;
  if not found then
    raise exception 'This request no longer exists.';
  end if;
  select p.id, p.full_name, p.role::text as role, p.account_status::text as account_status into v_actor
  from public.profiles p where p.id = p_actor_id;
  v_is_staff := found and v_actor.role in ('staff', 'admin') and v_actor.account_status = 'active';
  if not v_is_staff and p_actor_id is distinct from v_offer.owner_id then
    raise exception 'Only the pet owner or clinic staff can answer this.';
  end if;
  if v_offer.status <> 'Pending' then
    raise exception 'This request was already answered (%).', lower(v_offer.status);
  end if;

  v_count := greatest(cardinality(v_offer.pet_ids), 1);
  v_pet_names := public.pawcruz_offer_pet_names(v_offer.pet_ids);

  if v_action in ('confirm', 'reschedule') then
    if v_action = 'confirm' then
      v_vet := v_offer.proposed_veterinarian_id;
      v_date := v_offer.offer_date;
      v_time := v_offer.proposed_time;
      if v_date < v_today or (v_date = v_today and v_time <= v_now) then
        raise exception 'That time has already passed. Choose Reschedule, or ask the front desk for another time.';
      end if;
    else
      if cardinality(v_offer.appointment_ids) = 0 then
        raise exception 'A walk-in visit can''t be rescheduled here. Confirm it or cancel it.';
      end if;
      v_vet := p_new_veterinarian_id;
      v_date := p_new_date;
      v_time := p_new_time;
      if v_vet is null or v_date is null or v_time is null then
        raise exception 'Choose a date, doctor and time.';
      end if;
      if not exists (select 1 from public.profiles where id = v_vet and role::text = 'veterinarian' and account_status::text = 'active') then
        raise exception 'Choose an active veterinarian.';
      end if;
    end if;

    perform pg_advisory_xact_lock(hashtext('pawcruz-doctor-slots:' || v_vet::text || v_date::text));
    if not (v_time = any(public.get_vet_free_starts(v_vet, v_date, v_count, v_offer.appointment_ids, v_offer.id))) then
      raise exception '%', case when v_action = 'confirm'
        then 'That time was just taken. Choose Reschedule to pick another time.'
        else 'That time is no longer free. Pick another time.' end;
    end if;

    -- Move the booking(s) to consecutive slots. Shifting later on the same
    -- doctor/day goes last-first so the visit never collides with itself.
    if cardinality(v_offer.appointment_ids) > 0 then
      select min(start_time) into v_first_time from public.appointments where id = any(v_offer.appointment_ids);
      v_ids := v_offer.appointment_ids;
      for v_i in 1 .. cardinality(v_ids) loop
        v_id := case when v_time > v_first_time then v_ids[cardinality(v_ids) - v_i + 1] else v_ids[v_i] end;
        update public.appointments
        set veterinarian_id = v_vet,
            appointment_date = v_date,
            start_time = (v_time + make_interval(mins => 10 * (array_position(v_ids, v_id) - 1)))::time,
            end_time = (v_time + make_interval(mins => 10 * array_position(v_ids, v_id)))::time,
            created_by = p_actor_id
        where id = v_id and status::text = 'Confirmed';
        if not found then
          raise exception 'This appointment is no longer active.';
        end if;
      end loop;
    end if;

    if v_offer.queue_entry_id is not null then
      if v_date = v_today then
        select veterinarian_id into v_old_vet from public.queue_entries where id = v_offer.queue_entry_id;
        update public.queue_entries
        set veterinarian_id = v_vet,
            original_veterinarian_id = case when v_vet <> veterinarian_id
              then coalesce(original_veterinarian_id, veterinarian_id) else original_veterinarian_id end,
            reassignment_reason = case when v_vet <> veterinarian_id then v_offer.reason else reassignment_reason end,
            reassignment_notes = case when v_vet <> veterinarian_id then v_offer.notes else reassignment_notes end,
            reassigned_at = case when v_vet <> veterinarian_id then now() else reassigned_at end,
            reassigned_by = case when v_vet <> veterinarian_id then v_offer.created_by else reassigned_by end,
            original_appointment_time = case when cardinality(v_offer.appointment_ids) > 0 then v_time else original_appointment_time end,
            manual_order = null,
            doctor_offer_id = null
        where id = v_offer.queue_entry_id;
      else
        -- Rescheduled to another day: today's ticket no longer applies.
        delete from public.queue_entries where id = v_offer.queue_entry_id;
      end if;
    elsif v_action = 'confirm' and v_date = v_today then
      -- Confirmed from a check-in card: check the visit in with the new
      -- doctor so it shows in the Live Queue.
      v_qid := public.create_group_queue_entry(
        v_offer.appointment_ids, v_offer.pet_ids, v_offer.owner_id, v_vet, 'Appointment', p_actor_id, 3, null);
      update public.queue_entries
      set original_veterinarian_id = v_offer.original_veterinarian_id,
          reassignment_reason = v_offer.reason,
          reassignment_notes = v_offer.notes,
          reassigned_at = now(),
          reassigned_by = v_offer.created_by
      where id = v_qid;
    end if;

    update public.queue_doctor_offers
    set status = case when v_action = 'confirm' then 'Confirmed' else 'Rescheduled' end,
        responded_by = p_actor_id, responded_at = now(), response_note = nullif(btrim(p_note), ''),
        final_veterinarian_id = v_vet, final_date = v_date, final_time = v_time,
        queue_entry_id = coalesce(queue_entry_id, v_qid)
    where id = v_offer.id;

    select full_name into v_vet_name from public.profiles where id = v_vet;
    v_title := case when v_action = 'confirm' then 'Doctor change confirmed: ' else 'Visit rescheduled: ' end || v_pet_names;
    v_message := case when v_is_staff then coalesce(v_actor.full_name, 'Staff') || ' confirmed at the counter: '
                      else 'The owner ' || case when v_action = 'confirm' then 'confirmed: ' else 'rescheduled to ' end end ||
      v_pet_names || ' with ' || public.pawcruz_dr_name(v_vet_name) || ' at ' || public.pawcruz_offer_when(v_date, v_time) || '.' ||
      case when v_action = 'confirm' and v_date = v_today then ' The visit is now in the Live Queue.' else '' end;

  elsif v_action = 'cancel' then
    if cardinality(v_offer.appointment_ids) > 0 then
      -- Cancelling also closes today's ticket (appointment -> queue sync).
      update public.appointments set status = 'Cancelled', created_by = p_actor_id
      where id = any(v_offer.appointment_ids) and status::text = 'Confirmed';
      update public.queue_entries set doctor_offer_id = null where id = v_offer.queue_entry_id;
    elsif v_offer.queue_entry_id is not null then
      delete from public.queue_entries where id = v_offer.queue_entry_id;
    end if;
    update public.queue_doctor_offers
    set status = 'Cancelled', responded_by = p_actor_id, responded_at = now(), response_note = nullif(btrim(p_note), '')
    where id = v_offer.id;
    v_title := 'Visit cancelled: ' || v_pet_names;
    v_message := case
      when v_offer.reason = 'Owner request' then 'The owner cancelled their visit for ' || v_pet_names || ' from My Queue.'
      when v_is_staff then coalesce(v_actor.full_name, 'Staff') || ' cancelled the visit at the counter instead of the doctor change for ' || v_pet_names || '.'
      else 'The owner cancelled the visit instead of the doctor change for ' || v_pet_names || '.' end;
  else
    raise exception 'Unknown answer "%".', p_action;
  end if;

  perform public.pawcruz_notify_schedule_managers(v_title, v_message, v_offer.id, p_actor_id);
  perform public.pawcruz_log_schedule_activity(p_actor_id, 'Doctor Change Answered', v_message, v_offer.id);

  select * into v_offer from public.queue_doctor_offers where id = p_offer_id;
  return to_jsonb(v_offer);
end;
$$;

-- Staff take back an unanswered offer (e.g. the doctor is available again,
-- or they want to offer a different time). The visit stays as booked.
create or replace function public.withdraw_doctor_offer(p_offer_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_offer public.queue_doctor_offers%rowtype;
  v_staff record;
begin
  select p.id, p.role::text as role, p.account_status::text as account_status into v_staff
  from public.profiles p where p.id = p_staff_id;
  if not found or v_staff.role not in ('staff', 'admin') or v_staff.account_status <> 'active' then
    raise exception 'Only active staff or administrators can withdraw a doctor change.';
  end if;
  select * into v_offer from public.queue_doctor_offers where id = p_offer_id for update;
  if not found then
    raise exception 'This request no longer exists.';
  end if;
  if v_offer.status <> 'Pending' then
    raise exception 'The owner already answered (%).', lower(v_offer.status);
  end if;

  update public.queue_doctor_offers
  set status = 'Withdrawn', responded_by = p_staff_id, responded_at = now()
  where id = v_offer.id;
  update public.queue_entries set doctor_offer_id = null where id = v_offer.queue_entry_id and doctor_offer_id = v_offer.id;

  insert into public.notifications (recipient_id, title, message, notification_type, related_module, related_record, created_by)
  values (
    v_offer.owner_id, 'Doctor change withdrawn',
    'The clinic withdrew the doctor change for ' || public.pawcruz_offer_pet_names(v_offer.pet_ids) ||
      '. The visit stays with ' || public.pawcruz_dr_name((select full_name from public.profiles where id = v_offer.original_veterinarian_id)) ||
      ' as booked. The front desk may send you a new option.',
    'Queue Update', 'Queue', v_offer.id, p_staff_id
  );

  select * into v_offer from public.queue_doctor_offers where id = p_offer_id;
  return to_jsonb(v_offer);
end;
$$;

-- ---------------------------------------------------------------------
-- Owner self-service from My Queue (checked in, still waiting)
-- ---------------------------------------------------------------------

-- Free start times on a date for a waiting ticket's visit, with every
-- doctor (the visit's own booking doesn't count as taken).
create or replace function public.get_queue_visit_reschedule_options(p_queue_entry_id uuid, p_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_visit jsonb := public.pawcruz_offer_visit(p_queue_entry_id, null);
  v_appointments uuid[] := array(select jsonb_array_elements_text(v_visit->'appointment_ids')::uuid);
begin
  return jsonb_build_object(
    'date', p_date,
    'vets', public.pawcruz_visit_slot_options(p_date, greatest(jsonb_array_length(v_visit->'pet_ids'), 1),
      v_appointments, null, null));
end;
$$;

-- The owner cancels or rebooks their own waiting visit from My Queue (e.g.
-- their doctor had a sudden leave). Recorded as an owner-made doctor-change
-- request and answered at once, so it follows the same rules as answering a
-- clinic offer: free times only, multi-pet visits move together, a rebook
-- to another day leaves today's queue, and staff are notified.
create or replace function public.owner_change_queue_visit(
  p_owner_id uuid,
  p_queue_entry_id uuid,
  p_action text,
  p_new_date date default null,
  p_new_veterinarian_id uuid default null,
  p_new_time time default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_action text := lower(coalesce(btrim(p_action), ''));
  v_entry public.queue_entries%rowtype;
  v_visit jsonb;
  v_offer_id uuid;
begin
  if v_action not in ('cancel', 'reschedule') then
    raise exception 'Unknown action "%".', p_action;
  end if;

  select * into v_entry from public.queue_entries where id = p_queue_entry_id for update;
  if not found or v_entry.owner_id is distinct from p_owner_id then
    raise exception 'This queue ticket was not found.';
  end if;
  if v_entry.status <> 'Waiting' then
    raise exception 'Only a visit that is still waiting can be changed. Please ask the front desk.';
  end if;
  if v_entry.doctor_offer_id is not null or exists (
    select 1 from public.queue_doctor_offers o where o.queue_entry_id = v_entry.id and o.status = 'Pending'
  ) then
    raise exception 'The clinic already sent you a doctor change for this visit. Please answer it above.';
  end if;

  v_visit := public.pawcruz_offer_visit(p_queue_entry_id, null);
  insert into public.queue_doctor_offers (
    queue_entry_id, appointment_ids, pet_ids, owner_id, original_veterinarian_id, proposed_veterinarian_id,
    offer_date, original_time, proposed_time, reason, notes, created_by
  ) values (
    v_entry.id,
    array(select jsonb_array_elements_text(v_visit->'appointment_ids')::uuid),
    array(select jsonb_array_elements_text(v_visit->'pet_ids')::uuid),
    p_owner_id,
    v_entry.veterinarian_id,
    coalesce(p_new_veterinarian_id, v_entry.veterinarian_id),
    v_entry.queue_date,
    v_entry.original_appointment_time,
    coalesce(p_new_time, v_entry.original_appointment_time, date_trunc('minute', public.pawcruz_clinic_now())::time),
    'Owner request',
    null,
    p_owner_id
  )
  returning id into v_offer_id;

  return public.respond_doctor_offer(v_offer_id, p_owner_id, v_action, p_new_date, p_new_veterinarian_id, p_new_time,
    'Changed by the owner from My Queue.');
end;
$$;

-- ---------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------

alter table public.queue_doctor_offers enable row level security;
drop policy if exists "pawcruz doctor offers read" on public.queue_doctor_offers;
create policy "pawcruz doctor offers read"
on public.queue_doctor_offers
for select to anon, authenticated
using (true);

grant select on public.queue_doctor_offers to anon, authenticated;
revoke insert, update, delete on public.queue_doctor_offers from anon, authenticated;

-- The "Doctor Reassigned" notification from EMERGENCY_DOCTOR_REASSIGNMENT.sql
-- fires when a confirmed change moves the ticket. Some profiles store "Dr."
-- in full_name, so name the doctor through pawcruz_dr_name (no "Dr. Dr.").
create or replace function public.notify_owner_doctor_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vet_name text;
begin
  if new.veterinarian_id is distinct from old.veterinarian_id and new.original_veterinarian_id is not null then
    select full_name into v_vet_name from public.profiles where id = new.veterinarian_id;

    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Doctor Reassigned',
      'Due to an emergency, your pet''s doctor for visit #' || new.queue_number || ' has been changed to ' ||
      case when nullif(btrim(v_vet_name), '') is null then 'another veterinarian' else public.pawcruz_dr_name(v_vet_name) end || '.' ||
      case when nullif(trim(new.reassignment_notes), '') is not null then ' ' || new.reassignment_notes || '.' else '' end,
      'Queue Update',
      'Queue Management',
      new.id,
      new.reassigned_by
    );
  end if;
  return new;
end;
$$;

grant execute on function public.get_vet_free_starts(uuid, date, integer, uuid[], uuid) to anon, authenticated;
grant execute on function public.get_doctor_change_options(uuid, uuid[]) to anon, authenticated;
grant execute on function public.get_doctor_offer_reschedule_options(uuid, date) to anon, authenticated;
grant execute on function public.get_queue_doctor_alerts(date) to anon, authenticated;
grant execute on function public.propose_doctor_change(uuid, uuid, uuid[], uuid, time, text, text) to anon, authenticated;
grant execute on function public.respond_doctor_offer(uuid, uuid, text, date, uuid, time, text) to anon, authenticated;
grant execute on function public.withdraw_doctor_offer(uuid, uuid) to anon, authenticated;
grant execute on function public.get_queue_visit_reschedule_options(uuid, date) to anon, authenticated;
grant execute on function public.owner_change_queue_visit(uuid, uuid, text, date, uuid, time) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_doctor_offers'
     ) then
    alter publication supabase_realtime add table public.queue_doctor_offers;
  end if;
end $$;

notify pgrst, 'reload schema';
