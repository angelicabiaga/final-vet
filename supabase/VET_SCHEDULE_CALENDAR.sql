-- =====================================================================
-- PawCruz: Created vet schedules (staff publish each vet's calendar ahead)
-- =====================================================================
-- Staff use "Create Schedule" to publish a vet's working days and hours
-- for a whole month (or a date range), e.g. November or December ahead of
-- time. Pet owners can only book a vet on a date that has a created
-- schedule; the web app, PawCruz Mobile and the database booking trigger
-- all check it.
--
--   veterinarian_schedule_days  One row per vet per date. is_available =
--                               false is a scheduled day off.
--
--   A vet's hours on a date, in order:
--     1. leave or adjusted hours (veterinarian_schedule_overrides)
--     2. the created schedule (veterinarian_schedule_days)
--     3. otherwise "no schedule yet": nothing can be booked.
--   The weekly roster (veterinarian_schedules) stays as the vet's usual
--   hours; Create Schedule prefills from it and keeps it up to date.
--
-- Also: the staff "Schedule" board and the vet's My Schedule can show any
-- week, including past weeks (hours worked and leave reasons as history).
--
-- First run only: copies each vet's weekly roster into created schedules
-- from 60 days ago through the end of next month, plus any later date that
-- already has a booking, so nothing already booked breaks. Later months
-- must be created with Create Schedule.
--
-- Run in the Supabase SQL Editor after VET_LEAVE_REQUESTS.sql and
-- QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql. Safe to run more than once. If an
-- older script that redefines validate_appointment_slot is run again later
-- (REPAIR_veterinarian_schedules.sql, appointment_module.sql,
-- pet_schedule_module.sql), run this file again afterwards.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.veterinarian_schedule_days (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  schedule_date date not null,
  is_available boolean not null default true,
  start_time time,
  end_time time,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vet_schedule_days_unique unique (veterinarian_id, schedule_date),
  constraint vet_schedule_days_hours_check check (
    (is_available = false and start_time is null and end_time is null)
    or (is_available = true and start_time is not null and end_time is not null and end_time > start_time
        and start_time >= time '09:00' and end_time <= time '19:00')
  )
);

create index if not exists idx_vet_schedule_days_date on public.veterinarian_schedule_days(schedule_date);

drop trigger if exists vet_schedule_days_touch_updated_at on public.veterinarian_schedule_days;
create trigger vet_schedule_days_touch_updated_at
before update on public.veterinarian_schedule_days
for each row execute function public.vet_leave_touch_updated_at();

-- ---------------------------------------------------------------------
-- First run: copy the weekly roster so the clinic keeps running.
-- ---------------------------------------------------------------------
do $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_until date := (date_trunc('month', v_today) + interval '2 months' - interval '1 day')::date;
begin
  if exists (select 1 from public.veterinarian_schedule_days) then
    return;
  end if;

  with roster as (
    select s.veterinarian_id, s.day_of_week,
           greatest(s.start_time, time '09:00') as start_time,
           least(s.end_time, time '19:00') as end_time,
           coalesce(s.is_available, false) as is_available
    from public.veterinarian_schedules s
    join public.profiles p on p.id = s.veterinarian_id and p.role::text = 'veterinarian'
  ), wanted as (
    select r.veterinarian_id, d::date as schedule_date, r.is_available, r.start_time, r.end_time
    from roster r
    cross join generate_series(v_today - 60, v_until, interval '1 day') d
    where extract(dow from d)::integer = r.day_of_week
    union
    select r.veterinarian_id, a.appointment_date, r.is_available, r.start_time, r.end_time
    from public.appointments a
    join roster r on r.veterinarian_id = a.veterinarian_id
                 and r.day_of_week = extract(dow from a.appointment_date)::integer
    where a.appointment_date > v_until
      and a.status::text = 'Confirmed'
  )
  insert into public.veterinarian_schedule_days (veterinarian_id, schedule_date, is_available, start_time, end_time)
  select w.veterinarian_id, w.schedule_date,
         w.is_available and w.end_time > w.start_time,
         case when w.is_available and w.end_time > w.start_time then w.start_time end,
         case when w.is_available and w.end_time > w.start_time then w.end_time end
  from (select distinct on (veterinarian_id, schedule_date) veterinarian_id, schedule_date, is_available, start_time, end_time
        from wanted) w
  on conflict (veterinarian_id, schedule_date) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Effective hours
-- ---------------------------------------------------------------------

-- Has a schedule been created for this vet on this date (a created
-- schedule day, or adjusted hours)? Leave alone doesn't count.
create or replace function public.vet_schedule_created(p_veterinarian_id uuid, p_date date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
      select 1 from public.veterinarian_schedule_days
      where veterinarian_id = p_veterinarian_id and schedule_date = p_date)
    or exists (
      select 1 from public.veterinarian_schedule_overrides
      where veterinarian_id = p_veterinarian_id and schedule_date = p_date and leave_request_id is null);
$$;

-- The schedule a vet would have on a date WITHOUT a given leave request:
-- the date override first (unless it belongs to p_ignore_request), then the
-- created schedule. No created schedule means not working.
create or replace function public.vet_base_shift(
  p_veterinarian_id uuid, p_date date, p_ignore_request uuid default null
)
returns table (
  is_working boolean,
  shift_start time,
  shift_end time,
  override_id uuid,
  override_is_leave boolean,
  override_reason text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_override public.veterinarian_schedule_overrides%rowtype;
  v_day public.veterinarian_schedule_days%rowtype;
begin
  select * into v_override
  from public.veterinarian_schedule_overrides
  where veterinarian_id = p_veterinarian_id and schedule_date = p_date;

  if found and (p_ignore_request is null or v_override.leave_request_id is distinct from p_ignore_request) then
    return query select
      coalesce(v_override.is_available, false) and v_override.start_time is not null and v_override.end_time is not null,
      v_override.start_time, v_override.end_time, v_override.id,
      v_override.leave_request_id is not null, v_override.reason;
    return;
  end if;

  select * into v_day
  from public.veterinarian_schedule_days
  where veterinarian_id = p_veterinarian_id and schedule_date = p_date;

  if found then
    return query select
      coalesce(v_day.is_available, false) and v_day.start_time is not null and v_day.end_time is not null,
      v_day.start_time, v_day.end_time, null::uuid, false, null::text;
    return;
  end if;

  return query select false, null::time, null::time, null::uuid, false, null::text;
end;
$$;

-- Booking check (web, mobile and anything else writing appointments).
-- Same rules as before, but the vet's hours come from the created schedule
-- instead of the weekly roster.
create or replace function public.validate_appointment_slot()
returns trigger language plpgsql as $$
declare
  v_shift record;
  v_pet_owner uuid;
  v_vet_name text;
begin
  if new.appointment_date < current_date then
    raise exception 'Appointment date cannot be in the past';
  end if;

  if new.end_time <> new.start_time + interval '10 minutes' then
    raise exception 'Appointments must use 10-minute slots';
  end if;

  select owner_id into v_pet_owner
  from public.pets
  where id = new.pet_id and is_archived = false;

  if v_pet_owner is null or v_pet_owner <> new.owner_id then
    raise exception 'The selected pet does not belong to the selected owner';
  end if;

  if not public.vet_schedule_created(new.veterinarian_id, new.appointment_date) then
    select full_name into v_vet_name from public.profiles where id = new.veterinarian_id;
    raise exception '%''s schedule for % has not been created yet. Please choose another date.',
      public.pawcruz_dr_name(v_vet_name), public.pawcruz_fmt_date(new.appointment_date);
  end if;

  select * into v_shift from public.vet_base_shift(new.veterinarian_id, new.appointment_date, null);
  if not coalesce(v_shift.is_working, false) then
    raise exception 'Veterinarian is unavailable on the selected date';
  end if;

  if new.start_time < v_shift.shift_start or new.end_time > v_shift.shift_end then
    raise exception 'Selected time is outside the veterinarian schedule';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_validate_slot on public.appointments;
create trigger appointments_validate_slot
before insert or update of pet_id, owner_id, veterinarian_id, appointment_date, start_time, end_time
on public.appointments
for each row execute function public.validate_appointment_slot();

-- ---------------------------------------------------------------------
-- Create Schedule (staff/admin)
-- ---------------------------------------------------------------------

-- Publishes a vet's schedule from p_start_date to p_end_date: the chosen
-- weekdays (0 = Sunday … 6 = Saturday) with the given hours, every other
-- day in the range a day off. Days already created in the range are
-- replaced; leave and adjusted hours stay on top. The chosen hours also
-- become the vet's usual hours for those weekdays.
create or replace function public.create_vet_schedule(
  p_staff_id uuid,
  p_veterinarian_id uuid,
  p_start_date date,
  p_end_date date,
  p_weekdays integer[],
  p_start_time time,
  p_end_time time
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_staff record;
  v_vet record;
  v_days integer[];
  v_replaced integer;
  v_working integer;
  v_off integer;
  v_conflicts integer;
  v_period text;
begin
  select p.id, p.role::text as role, p.account_status::text as account_status into v_staff
  from public.profiles p where p.id = p_staff_id;
  if not found or v_staff.role not in ('staff', 'admin') or v_staff.account_status <> 'active' then
    raise exception 'Only active staff or administrators can create schedules.';
  end if;

  select p.id, p.full_name, p.role::text as role, p.account_status::text as account_status into v_vet
  from public.profiles p where p.id = p_veterinarian_id;
  if not found or v_vet.role <> 'veterinarian' or v_vet.account_status <> 'active' then
    raise exception 'Choose an active veterinarian.';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Choose the schedule dates.';
  end if;
  if p_start_date < v_today then
    raise exception 'A schedule can''t start on a date that has already passed.';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date must be on or after the start date.';
  end if;
  if p_end_date - p_start_date > 92 then
    raise exception 'Create at most 3 months at a time.';
  end if;
  if p_end_date > v_today + 366 then
    raise exception 'Schedules can be created up to a year ahead.';
  end if;

  select coalesce(array_agg(distinct d order by d), array[]::integer[]) into v_days
  from unnest(coalesce(p_weekdays, array[]::integer[])) d
  where d between 0 and 6;
  if cardinality(v_days) = 0 then
    raise exception 'Choose at least one working day.';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'The end time must be after the start time.';
  end if;
  if p_start_time < time '09:00' or p_end_time > time '19:00' then
    raise exception 'Hours must be within clinic hours (9:00 AM – 7:00 PM).';
  end if;
  if extract(minute from p_start_time)::integer % 10 <> 0 or extract(minute from p_end_time)::integer % 10 <> 0
     or extract(second from p_start_time) <> 0 or extract(second from p_end_time) <> 0 then
    raise exception 'Times must follow the 10-minute appointment grid (e.g. 9:00, 9:10, 9:20).';
  end if;

  select count(*) into v_replaced
  from public.veterinarian_schedule_days
  where veterinarian_id = p_veterinarian_id and schedule_date between p_start_date and p_end_date;

  insert into public.veterinarian_schedule_days (veterinarian_id, schedule_date, is_available, start_time, end_time, created_by)
  select p_veterinarian_id, d::date,
         extract(dow from d)::integer = any(v_days),
         case when extract(dow from d)::integer = any(v_days) then p_start_time end,
         case when extract(dow from d)::integer = any(v_days) then p_end_time end,
         p_staff_id
  from generate_series(p_start_date, p_end_date, interval '1 day') d
  on conflict (veterinarian_id, schedule_date) do update
    set is_available = excluded.is_available,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        created_by = excluded.created_by;

  select count(*) filter (where is_available), count(*) filter (where not is_available)
    into v_working, v_off
  from public.veterinarian_schedule_days
  where veterinarian_id = p_veterinarian_id and schedule_date between p_start_date and p_end_date;

  -- Keep the usual hours (used to prefill the next schedule) in step.
  insert into public.veterinarian_schedules (veterinarian_id, day_of_week, start_time, end_time, is_available)
  select p_veterinarian_id, d, p_start_time, p_end_time, true from unnest(v_days) d
  on conflict (veterinarian_id, day_of_week) do update
    set start_time = excluded.start_time, end_time = excluded.end_time, is_available = true;

  -- Bookings in the range the new schedule no longer covers (they show
  -- under "Booked outside current hours" for staff to offer another doctor).
  select count(*) into v_conflicts
  from public.appointments a
  cross join lateral public.vet_base_shift(a.veterinarian_id, a.appointment_date, null) s
  where a.veterinarian_id = p_veterinarian_id
    and a.appointment_date between p_start_date and p_end_date
    and a.status::text = 'Confirmed'
    and (not s.is_working or a.start_time < s.shift_start or a.end_time > s.shift_end);

  v_period := case when p_start_date = p_end_date then public.pawcruz_fmt_date(p_start_date)
    else public.pawcruz_fmt_date(p_start_date) || ' – ' || public.pawcruz_fmt_date(p_end_date) end;

  perform public.pawcruz_notify_vet_schedule(p_veterinarian_id,
    'Your schedule is ready',
    'Your schedule for ' || v_period || ' is ready: ' || v_working || ' working day' ||
      case when v_working = 1 then '' else 's' end || ', ' || public.pawcruz_fmt_time(p_start_time) || ' – ' ||
      public.pawcruz_fmt_time(p_end_time) || '. Pet owners can now book you on these dates.',
    null, p_staff_id);
  perform public.pawcruz_log_schedule_activity(p_staff_id, 'Schedule Created',
    'Created ' || public.pawcruz_dr_name(v_vet.full_name) || '''s schedule for ' || v_period || ' (' ||
      v_working || ' working days, ' || public.pawcruz_fmt_time(p_start_time) || ' – ' || public.pawcruz_fmt_time(p_end_time) || ').',
    null);

  return jsonb_build_object(
    'veterinarian_id', p_veterinarian_id, 'start_date', p_start_date, 'end_date', p_end_date,
    'working_days', v_working, 'days_off', v_off, 'replaced', v_replaced, 'conflicts', v_conflicts);
end;
$$;

-- ---------------------------------------------------------------------
-- Any week (past weeks are history)
-- ---------------------------------------------------------------------

drop function if exists public.get_vet_schedule_overview(uuid, integer);

-- A vet's schedule for p_days days from p_start_date (default today): the
-- effective hours per day, where they come from ('none' = no schedule
-- created yet), bookings, and any leave covering the day with its reason.
-- Powers "My Schedule" (web + mobile) and the staff Schedule board.
create or replace function public.get_vet_schedule_overview(
  p_veterinarian_id uuid,
  p_days integer default 14,
  p_start_date date default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_start date := greatest(coalesce(p_start_date, v_today), v_today - 366);
  v_span integer := greatest(least(coalesce(p_days, 14), 60), 1);
  v_days jsonb := '[]'::jsonb;
  v_day date;
  v_shift record;
  v_request record;
  v_scheduled boolean;
  v_appointments integer;
begin
  for v_day in select g::date from generate_series(v_start, v_start + (v_span - 1), interval '1 day') as g loop
    select * into v_shift from public.vet_base_shift(p_veterinarian_id, v_day, null);
    v_scheduled := public.vet_schedule_created(p_veterinarian_id, v_day);

    -- Past days count every visit that wasn't cancelled (history); from
    -- today on, only active bookings.
    select count(*) into v_appointments
    from public.appointments a
    where a.veterinarian_id = p_veterinarian_id
      and a.appointment_date = v_day
      and (case when v_day < v_today then a.status::text <> 'Cancelled' else a.status::text = 'Confirmed' end);

    select r.id, r.request_type, r.leave_type, r.status, r.is_full_day, r.start_time, r.end_time, r.reason
      into v_request
    from public.veterinarian_leave_requests r
    where r.veterinarian_id = p_veterinarian_id
      and r.status in ('Pending', 'Approved')
      and v_day between r.start_date and r.end_date
    order by case when r.status = 'Approved' then 0 else 1 end
    limit 1;

    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'date', v_day,
      'weekday', to_char(v_day, 'FMDay'),
      'is_today', v_day = v_today,
      'is_past', v_day < v_today,
      'working', coalesce(v_shift.is_working, false),
      'start_time', v_shift.shift_start,
      'end_time', v_shift.shift_end,
      'scheduled', v_scheduled or v_shift.override_id is not null,
      'source', case
        when v_shift.override_id is not null and v_shift.override_is_leave then 'leave'
        when v_shift.override_id is not null then 'adjusted'
        when not v_scheduled then 'none'
        when coalesce(v_shift.is_working, false) then 'weekly'
        else 'off' end,
      'note', v_shift.override_reason,
      'appointments', v_appointments,
      'request', case when v_request.id is null then null else jsonb_build_object(
        'id', v_request.id, 'request_type', v_request.request_type, 'leave_type', v_request.leave_type,
        'status', v_request.status, 'is_full_day', v_request.is_full_day,
        'start_time', v_request.start_time, 'end_time', v_request.end_time, 'reason', v_request.reason) end
    ));
  end loop;

  return jsonb_build_object(
    'today', v_today,
    'now', public.pawcruz_clinic_now(),
    'start_date', v_start,
    'days', v_days,
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week', s.day_of_week, 'is_available', s.is_available,
        'start_time', s.start_time, 'end_time', s.end_time) order by s.day_of_week)
      from public.veterinarian_schedules s
      where s.veterinarian_id = p_veterinarian_id), '[]'::jsonb),
    'scheduled_until', (
      select max(schedule_date) from public.veterinarian_schedule_days where veterinarian_id = p_veterinarian_id),
    'queue_today', (
      select count(*) from public.queue_entries q
      where q.veterinarian_id = p_veterinarian_id
        and q.queue_date = v_today
        and q.status in ('Waiting', 'Serving', 'Now Serving'))
  );
end;
$$;

drop function if exists public.get_clinic_coverage(integer);

-- Clinic-wide schedule for p_days days from p_start_date (default today):
-- every active vet's hours per day plus, per day, the clinic hours
-- (9:00 AM–7:00 PM) no vet covers, and whether any schedule was created.
create or replace function public.get_clinic_coverage(p_days integer default 14, p_start_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_start date := greatest(coalesce(p_start_date, v_today), v_today - 366);
  v_span integer := greatest(least(coalesce(p_days, 14), 60), 1);
  v_open constant time := time '09:00';
  v_close constant time := time '19:00';
  v_days jsonb := '[]'::jsonb;
  v_day date;
  v_gaps jsonb;
  v_cursor time;
  v_interval record;
  v_appointments integer;
  v_scheduled boolean;
  v_vets jsonb;
begin
  for v_day in select g::date from generate_series(v_start, v_start + (v_span - 1), interval '1 day') as g loop
    v_gaps := '[]'::jsonb;
    v_cursor := v_open;
    for v_interval in
      select greatest(s.shift_start, v_open) as from_time, least(s.shift_end, v_close) as to_time
      from public.profiles pv
      cross join lateral public.vet_base_shift(pv.id, v_day, null) s
      where pv.role::text = 'veterinarian'
        and pv.account_status::text = 'active'
        and s.is_working
        and s.shift_start < v_close
        and s.shift_end > v_open
      order by 1
    loop
      if v_interval.from_time > v_cursor then
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('start', v_cursor, 'end', v_interval.from_time));
      end if;
      v_cursor := greatest(v_cursor, v_interval.to_time);
    end loop;
    if v_cursor < v_close then
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('start', v_cursor, 'end', v_close));
    end if;

    select exists (
      select 1 from public.profiles pv
      where pv.role::text = 'veterinarian' and pv.account_status::text = 'active'
        and public.vet_schedule_created(pv.id, v_day)) into v_scheduled;

    select count(*) into v_appointments
    from public.appointments a
    join public.profiles pv on pv.id = a.veterinarian_id
    where a.appointment_date = v_day
      and (case when v_day < v_today then a.status::text <> 'Cancelled' else a.status::text = 'Confirmed' end)
      and pv.role::text = 'veterinarian';

    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'date', v_day, 'weekday', to_char(v_day, 'FMDay'), 'is_today', v_day = v_today, 'is_past', v_day < v_today,
      'scheduled', v_scheduled, 'gaps', v_gaps, 'appointments', v_appointments));
  end loop;

  -- Vets in shift order (earliest usual start first), then by name.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'full_name', o.full_name, 'avatar_url', o.avatar_url,
      'days', o.overview->'days', 'weekly', o.overview->'weekly', 'scheduled_until', o.overview->'scheduled_until')
      order by o.first_start nulls last, o.full_name), '[]'::jsonb)
    into v_vets
  from (
    select pv.id, pv.full_name, pv.avatar_url,
           public.get_vet_schedule_overview(pv.id, v_span, v_start) as overview,
           (select min(s.start_time) from public.veterinarian_schedules s
             where s.veterinarian_id = pv.id and s.is_available) as first_start
    from public.profiles pv
    where pv.role::text = 'veterinarian'
      and pv.account_status::text = 'active'
  ) o;

  return jsonb_build_object(
    'today', v_today, 'now', public.pawcruz_clinic_now(), 'start_date', v_start,
    'clinic_open', v_open, 'clinic_close', v_close,
    'vets', v_vets, 'days', v_days);
end;
$$;

-- ---------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------

alter table public.veterinarian_schedule_days enable row level security;
drop policy if exists "pawcruz schedule days read" on public.veterinarian_schedule_days;
create policy "pawcruz schedule days read"
on public.veterinarian_schedule_days
for select to anon, authenticated
using (true);

grant select on public.veterinarian_schedule_days to anon, authenticated;
revoke insert, update, delete on public.veterinarian_schedule_days from anon, authenticated;

grant execute on function public.vet_schedule_created(uuid, date) to anon, authenticated;
grant execute on function public.create_vet_schedule(uuid, uuid, date, date, integer[], time, time) to anon, authenticated;
grant execute on function public.get_vet_schedule_overview(uuid, integer, date) to anon, authenticated;
grant execute on function public.get_clinic_coverage(integer, date) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'veterinarian_schedule_days'
     ) then
    alter publication supabase_realtime add table public.veterinarian_schedule_days;
  end if;
end $$;

notify pgrst, 'reload schema';
