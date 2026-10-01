-- =====================================================================
-- PawCruz: Veterinarian Leave & Emergency Requests
-- =====================================================================
-- Adds a corporate-style leave workflow on top of the existing
-- veterinarian_schedules (weekly roster) and
-- veterinarian_schedule_overrides (date exceptions) tables:
--
--   Planned leave   The vet files at least one day ahead -> Pending ->
--                   Staff/Admin Approve (schedule updated right away) or
--                   Reject (with a note).
--   Emergency       The vet files for TODAY only -> applied immediately,
--                   so bookings stop at once -> Staff/Admin are notified,
--                   reassign the affected patients, then Acknowledge.
--   Cancel/Revoke   The vet withdraws a pending request or cancels an
--                   approved one that hasn't ended; Staff/Admin can revoke
--                   an approved one. The regular schedule comes back,
--                   including any adjusted hours the leave had replaced.
--   Staff-filed     Staff/Admin record leave or an emergency for a vet
--                   (e.g. the vet called in sick). Same checks; applied
--                   immediately since staff are the approvers.
--
-- Also: a clinic coverage board (who is on duty each day and the hours
-- nobody covers), a list of bookings that fall outside their vet's
-- current hours (e.g. after a shift change), and default shifts that
-- never overwrite hours staff have set.
--
-- Approving never deletes or moves appointments by itself. It writes date
-- overrides (tagged with leave_request_id) so web + mobile booking stop
-- offering the vet's slots, and the existing validate_appointment_slot
-- trigger rejects any booking inside the leave. Appointments that were
-- already booked come back as conflicts for staff to reassign or cancel.
--
-- Every rule lives in these functions so the web app and PawCruz Mobile
-- behave the same. Direct inserts/updates on veterinarian_leave_requests
-- are blocked by RLS; all writes go through the RPCs below.
--
-- Run once in the Supabase SQL Editor (the project shared by web and
-- mobile), after REPAIR_veterinarian_schedules.sql and
-- EMERGENCY_DOCTOR_REASSIGNMENT.sql. Safe to run more than once.
-- If VET_SCHEDULE_CALENDAR.sql is installed, run it again after re-running
-- this file (it replaces vet_base_shift and the schedule overviews here).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.veterinarian_leave_requests (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null default 'Leave',
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  is_full_day boolean not null default true,
  -- Partial day only: the UNAVAILABLE window. For an emergency this is
  -- "from start_time until the end of the shift".
  start_time time,
  end_time time,
  reason text not null,
  status text not null default 'Pending',
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancel_note text,
  -- Manual date overrides (adjusted hours) this leave overwrote, restored
  -- when the leave is cancelled or revoked.
  replaced_overrides jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vet_leave_request_type_check check (request_type in ('Leave', 'Emergency')),
  constraint vet_leave_status_check check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  constraint vet_leave_reason_check check (length(btrim(reason)) > 0),
  constraint vet_leave_dates_check check (end_date >= start_date and end_date - start_date <= 30),
  constraint vet_leave_partial_check check (
    is_full_day
    or (start_date = end_date and start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint vet_leave_emergency_single_day_check check (request_type <> 'Emergency' or start_date = end_date)
);

create index if not exists idx_vet_leave_vet_dates
  on public.veterinarian_leave_requests(veterinarian_id, start_date, end_date);
create index if not exists idx_vet_leave_status
  on public.veterinarian_leave_requests(status, end_date);

create or replace function public.vet_leave_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vet_leave_requests_touch_updated_at on public.veterinarian_leave_requests;
create trigger vet_leave_requests_touch_updated_at
before update on public.veterinarian_leave_requests
for each row execute function public.vet_leave_touch_updated_at();

-- Date overrides created by a leave request point back at it, so the
-- leave can be revoked cleanly and the staff table can label them.
alter table public.veterinarian_schedule_overrides
  add column if not exists leave_request_id uuid
  references public.veterinarian_leave_requests(id) on delete set null;

create index if not exists idx_vet_override_leave_request
  on public.veterinarian_schedule_overrides(leave_request_id);

-- ---------------------------------------------------------------------
-- 2. Small helpers
-- ---------------------------------------------------------------------

-- The clinic's own "today"/"now", independent of the database timezone
-- setting (see set_clinic_timezone.sql).
create or replace function public.pawcruz_clinic_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

create or replace function public.pawcruz_clinic_now()
returns time language sql stable as $$
  select (now() at time zone 'Asia/Manila')::time;
$$;

create or replace function public.pawcruz_fmt_time(p_time time)
returns text language sql stable as $$
  select case when p_time is null then null
    else to_char(('2000-01-01'::date + p_time)::timestamp, 'FMHH12:MI AM') end;
$$;

create or replace function public.pawcruz_fmt_date(p_date date)
returns text language sql stable as $$
  select case when p_date is null then null else to_char(p_date, 'FMMon FMDD, YYYY') end;
$$;

-- Some profiles already store "Dr." in full_name; never print "Dr. Dr.".
create or replace function public.pawcruz_dr_name(p_name text)
returns text language sql immutable as $$
  select case
    when p_name is null or btrim(p_name) = '' then 'The veterinarian'
    when btrim(p_name) ~* '^dr\.?\s' then btrim(p_name)
    else 'Dr. ' || btrim(p_name)
  end;
$$;

-- Human-readable period used in notifications, e.g.
-- "Oct 3, 2026 – Oct 5, 2026", "Oct 3, 2026, 9:00 AM – 12:00 PM",
-- "today from 2:00 PM".
create or replace function public.pawcruz_leave_period_text(
  p_request_type text, p_start_date date, p_end_date date,
  p_is_full_day boolean, p_start_time time, p_end_time time
)
returns text language sql stable as $$
  select case
    when p_request_type = 'Emergency' and p_is_full_day then 'today (whole day)'
    when p_request_type = 'Emergency' then 'today from ' || public.pawcruz_fmt_time(p_start_time)
    when not p_is_full_day then public.pawcruz_fmt_date(p_start_date) || ', ' ||
      public.pawcruz_fmt_time(p_start_time) || ' – ' || public.pawcruz_fmt_time(p_end_time)
    when p_start_date = p_end_date then public.pawcruz_fmt_date(p_start_date) || ' (whole day)'
    else public.pawcruz_fmt_date(p_start_date) || ' – ' || public.pawcruz_fmt_date(p_end_date)
  end;
$$;

-- The schedule a vet would have on a date WITHOUT a given leave request:
-- the date override first (unless it belongs to p_ignore_request), then
-- the weekly roster. Mirrors validate_appointment_slot's lookup order.
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
  v_weekly public.veterinarian_schedules%rowtype;
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

  select * into v_weekly
  from public.veterinarian_schedules
  where veterinarian_id = p_veterinarian_id
    and day_of_week = extract(dow from p_date)::integer;

  if found then
    return query select
      coalesce(v_weekly.is_available, false) and v_weekly.start_time is not null and v_weekly.end_time is not null,
      v_weekly.start_time, v_weekly.end_time, null::uuid, false, null::text;
    return;
  end if;

  return query select false, null::time, null::time, null::uuid, false, null::text;
end;
$$;

-- What a leave does to one day's shift.
--   effect 'none'    -> not scheduled that day (or an error, see `error`)
--   effect 'off'     -> the whole shift is taken off
--   effect 'partial' -> the vet stays available for [available_start, available_end)
-- A date override can hold only one continuous available window, so a
-- partial leave must touch the start of the shift (arrive late) or its
-- end (leave early). Windows are clamped to clinic hours 9:00 AM–7:00 PM,
-- matching the override table's checks.
create or replace function public.vet_leave_day_effect(
  p_is_working boolean, p_shift_start time, p_shift_end time,
  p_is_full_day boolean, p_leave_start time, p_leave_end time
)
returns table (
  effect text,
  available_start time,
  available_end time,
  unavailable_start time,
  unavailable_end time,
  error text
)
language plpgsql stable
as $$
declare
  v_open constant time := time '09:00';
  v_close constant time := time '19:00';
  v_avail_start time;
  v_avail_end time;
begin
  if not coalesce(p_is_working, false) then
    return query select 'none'::text, null::time, null::time, null::time, null::time, null::text;
    return;
  end if;

  if coalesce(p_is_full_day, true) then
    return query select 'off'::text, null::time, null::time, p_shift_start, p_shift_end, null::text;
    return;
  end if;

  if p_leave_end <= p_shift_start or p_leave_start >= p_shift_end then
    return query select 'none'::text, null::time, null::time, null::time, null::time,
      'The selected time is outside the working hours for that day (' ||
      public.pawcruz_fmt_time(p_shift_start) || ' – ' || public.pawcruz_fmt_time(p_shift_end) || ').';
    return;
  end if;

  if p_leave_start <= p_shift_start and p_leave_end >= p_shift_end then
    return query select 'off'::text, null::time, null::time, p_shift_start, p_shift_end, null::text;
    return;
  end if;

  if p_leave_start <= p_shift_start then
    v_avail_start := greatest(p_leave_end, v_open);          -- arrive late
    v_avail_end := least(p_shift_end, v_close);
  elsif p_leave_end >= p_shift_end then
    v_avail_start := greatest(p_shift_start, v_open);        -- leave early
    v_avail_end := least(p_leave_start, v_close);
  else
    return query select 'none'::text, null::time, null::time, null::time, null::time,
      'A partial-day leave must start when the shift starts (arrive late) or run until the shift ends (leave early). For a break in the middle of the day, file a whole-day leave or talk to staff.'::text;
    return;
  end if;

  if v_avail_end <= v_avail_start then
    return query select 'off'::text, null::time, null::time, p_shift_start, p_shift_end, null::text;
    return;
  end if;

  return query select 'partial'::text, v_avail_start, v_avail_end,
    case when p_leave_start <= p_shift_start then p_shift_start else v_avail_end end,
    case when p_leave_start <= p_shift_start then v_avail_start else p_shift_end end,
    null::text;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Impact / conflict check (read-only; used for previews, submit and
--    approval so every screen applies the same rules)
-- ---------------------------------------------------------------------
-- p_exclude_request_id: evaluate an EXISTING request (staff review, the
-- vet's own list). Its own overrides are ignored when working out the
-- base shift, and the "file one day ahead" rule is skipped.
-- p_filed_by_staff: staff recording leave for a vet may start it today.

-- The first version had no p_filed_by_staff; drop it so PostgREST never
-- sees two overloads.
drop function if exists public.get_vet_leave_impact(uuid, text, date, date, boolean, time, time, uuid);

create or replace function public.get_vet_leave_impact(
  p_veterinarian_id uuid,
  p_request_type text,
  p_start_date date,
  p_end_date date,
  p_is_full_day boolean default true,
  p_start_time time default null,
  p_end_time time default null,
  p_exclude_request_id uuid default null,
  p_filed_by_staff boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_now time := public.pawcruz_clinic_now();
  v_is_new boolean := p_exclude_request_id is null;
  v_type text := coalesce(nullif(btrim(p_request_type), ''), 'Leave');
  v_full boolean := coalesce(p_is_full_day, true);
  v_start date := p_start_date;
  v_end date := p_end_date;
  v_from time := p_start_time;
  v_to time := p_end_time;
  v_vet record;
  v_shift record;
  v_effect record;
  v_day date;
  v_errors text[] := array[]::text[];
  v_warnings text[] := array[]::text[];
  v_days jsonb := '[]'::jsonb;
  v_appointments jsonb := '[]'::jsonb;
  v_day_appointments jsonb;
  v_day_count integer;
  v_queue jsonb := '[]'::jsonb;
  v_own_overlaps jsonb := '[]'::jsonb;
  v_other_requests jsonb := '[]'::jsonb;
  v_no_coverage text[] := array[]::text[];
  v_no_coverage_dates jsonb := '[]'::jsonb;
  v_coverage_gaps jsonb := '[]'::jsonb;
  v_day_gaps jsonb;
  v_cover_from time;
  v_cursor time;
  v_interval record;
  v_replaced jsonb := '[]'::jsonb;
  v_not_working integer := 0;
  v_working_days integer := 0;
  v_appointment_total integer := 0;
  v_other_working integer;
  v_checked_in uuid[] := array[]::uuid[];
  v_checked_in_grouped uuid[];
  v_waiting integer;
  v_serving integer;
  v_item jsonb;
begin
  -- Who the leave is for.
  select p.id, p.full_name, p.role::text as role, p.account_status::text as account_status
    into v_vet
  from public.profiles p
  where p.id = p_veterinarian_id;

  if not found or v_vet.role <> 'veterinarian' then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Leave requests can only be filed for a veterinarian account.'));
  end if;
  if v_vet.account_status <> 'active' then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('This veterinarian account is not active.'));
  end if;
  if v_type not in ('Leave', 'Emergency') then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Unknown request type.'));
  end if;

  -- An emergency is always today; "partial" means from p_start_time until
  -- the end of today's shift.
  if v_type = 'Emergency' then
    if v_is_new then
      v_start := v_today;
      v_end := v_today;
    end if;
    if not v_full then
      if v_from is null then
        v_errors := array_append(v_errors, 'Choose the time you need to leave.');
      else
        select * into v_shift from public.vet_base_shift(p_veterinarian_id, v_start, p_exclude_request_id);
        if v_shift.is_working then
          if v_from <= v_shift.shift_start then
            v_full := true;
          elsif v_from >= v_shift.shift_end then
            v_errors := array_append(v_errors, ('The shift on that day already ended at ' || public.pawcruz_fmt_time(v_shift.shift_end) || '.'));
          else
            v_to := v_shift.shift_end;
          end if;
        end if;
      end if;
    end if;
  end if;

  if v_start is null or v_end is null then
    v_errors := array_append(v_errors, 'Select the leave dates.');
  elsif v_end < v_start then
    v_errors := array_append(v_errors, 'The end date must be on or after the start date.');
  elsif v_end - v_start > 30 then
    v_errors := array_append(v_errors, 'One request can cover at most 31 days. File separate requests for longer leave.');
  elsif v_is_new and v_type = 'Leave' and v_start < v_today then
    v_errors := array_append(v_errors, 'Leave can''t start on a date that has already passed.');
  elsif v_is_new and v_type = 'Leave' and v_start = v_today and not coalesce(p_filed_by_staff, false) then
    v_errors := array_append(v_errors, 'Planned leave must be filed at least one day ahead. For today, use Emergency Leave instead.');
  elsif not v_is_new and v_end < v_today then
    v_errors := array_append(v_errors, 'This leave period has already passed.');
  end if;

  if not v_full and v_type = 'Leave' then
    if v_start is distinct from v_end then
      v_errors := array_append(v_errors, 'A partial-day leave must be for a single date.');
    elsif v_from is null or v_to is null then
      v_errors := array_append(v_errors, 'Choose the time window for the partial-day leave.');
    elsif v_to <= v_from then
      v_errors := array_append(v_errors, 'The leave end time must be after its start time.');
    elsif v_from < time '09:00' or v_to > time '19:00' then
      v_errors := array_append(v_errors, 'Leave times must be within clinic hours (9:00 AM – 7:00 PM).');
    end if;
  end if;

  if v_from is not null and (extract(minute from v_from)::integer % 10 <> 0 or extract(second from v_from) <> 0)
     or v_to is not null and (extract(minute from v_to)::integer % 10 <> 0 or extract(second from v_to) <> 0) then
    v_errors := array_append(v_errors, 'Leave times must follow the 10-minute appointment grid (e.g. 1:00, 1:10, 1:20).');
  end if;

  if v_full then
    v_from := null;
    v_to := null;
  end if;

  if coalesce(array_length(v_errors, 1), 0) > 0 then
    return jsonb_build_object(
      'ok', false, 'errors', to_jsonb(v_errors), 'warnings', '[]'::jsonb,
      'today', v_today, 'now', v_now,
      'normalized', jsonb_build_object('request_type', v_type, 'start_date', v_start, 'end_date', v_end,
        'is_full_day', v_full, 'start_time', v_from, 'end_time', v_to)
    );
  end if;

  -- The same vet can't hold two active requests on the same day (a date
  -- override has room for only one window).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'request_type', r.request_type, 'leave_type', r.leave_type, 'status', r.status,
      'start_date', r.start_date, 'end_date', r.end_date) order by r.start_date), '[]'::jsonb)
    into v_own_overlaps
  from public.veterinarian_leave_requests r
  where r.veterinarian_id = p_veterinarian_id
    and r.status in ('Pending', 'Approved')
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
    and r.start_date <= v_end
    and r.end_date >= v_start;

  if jsonb_array_length(v_own_overlaps) > 0 then
    v_errors := array_append(v_errors, 'Another pending or approved request already covers part of these dates. Cancel it first or choose other dates.');
  end if;

  -- Appointments already checked in are handled through the queue instead.
  select coalesce(array_agg(q.appointment_id), array[]::uuid[]) into v_checked_in
  from public.queue_entries q
  join public.appointments a on a.id = q.appointment_id
  where a.veterinarian_id = p_veterinarian_id
    and a.appointment_date between v_start and v_end;

  if to_regclass('public.queue_entry_pets') is not null then
    execute
      'select coalesce(array_agg(qp.appointment_id), array[]::uuid[])
         from public.queue_entry_pets qp
         join public.appointments a on a.id = qp.appointment_id
        where a.veterinarian_id = $1 and a.appointment_date between $2 and $3'
      into v_checked_in_grouped
      using p_veterinarian_id, v_start, v_end;
    v_checked_in := v_checked_in || coalesce(v_checked_in_grouped, array[]::uuid[]);
  end if;

  for v_day in select g::date from generate_series(v_start, v_end, interval '1 day') as g loop
    select * into v_shift from public.vet_base_shift(p_veterinarian_id, v_day, p_exclude_request_id);
    select * into v_effect from public.vet_leave_day_effect(
      v_shift.is_working, v_shift.shift_start, v_shift.shift_end, v_full, v_from, v_to);

    if v_effect.error is not null then
      v_errors := array_append(v_errors, v_effect.error);
    end if;

    v_day_count := 0;
    v_day_appointments := '[]'::jsonb;
    v_day_gaps := '[]'::jsonb;
    v_other_working := null;

    if v_effect.effect in ('off', 'partial') then
      v_working_days := v_working_days + 1;

      if v_day >= v_today then
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', a.id, 'appointment_date', a.appointment_date,
            'start_time', a.start_time, 'end_time', a.end_time,
            'pet_id', a.pet_id, 'pet_name', p.pet_name,
            'owner_id', a.owner_id, 'owner_name', o.full_name,
            'visit_reason', a.visit_reason) order by a.start_time), '[]'::jsonb),
          count(*)
          into v_day_appointments, v_day_count
        from public.appointments a
        left join public.pets p on p.id = a.pet_id
        left join public.profiles o on o.id = a.owner_id
        where a.veterinarian_id = p_veterinarian_id
          and a.appointment_date = v_day
          and a.status::text = 'Confirmed'
          and a.start_time < v_effect.unavailable_end
          and a.end_time > v_effect.unavailable_start
          and not (a.id = any(v_checked_in));

        v_appointments := v_appointments || v_day_appointments;
        v_appointment_total := v_appointment_total + v_day_count;

        -- Coverage: the parts of the unavailable window (from now on, for
        -- today) that no other active vet works. Sweeps the other vets'
        -- shifts in start order and records every uncovered gap.
        v_other_working := 0;
        v_day_gaps := '[]'::jsonb;
        v_cover_from := case when v_day = v_today
          then greatest(v_effect.unavailable_start, v_now) else v_effect.unavailable_start end;
        if v_cover_from < v_effect.unavailable_end then
          v_cursor := v_cover_from;
          for v_interval in
            select greatest(s2.shift_start, v_cover_from) as from_time,
                   least(s2.shift_end, v_effect.unavailable_end) as to_time
            from public.profiles pv
            cross join lateral public.vet_base_shift(pv.id, v_day, null) s2
            where pv.role::text = 'veterinarian'
              and pv.account_status::text = 'active'
              and pv.id <> p_veterinarian_id
              and s2.is_working
              and s2.shift_start < v_effect.unavailable_end
              and s2.shift_end > v_cover_from
            order by 1
          loop
            v_other_working := v_other_working + 1;
            if v_interval.from_time > v_cursor then
              v_day_gaps := v_day_gaps || jsonb_build_array(jsonb_build_object(
                'date', v_day, 'start', v_cursor, 'end', v_interval.from_time));
            end if;
            v_cursor := greatest(v_cursor, v_interval.to_time);
          end loop;
          if v_cursor < v_effect.unavailable_end then
            v_day_gaps := v_day_gaps || jsonb_build_array(jsonb_build_object(
              'date', v_day, 'start', v_cursor, 'end', v_effect.unavailable_end));
          end if;
        end if;

        if jsonb_array_length(v_day_gaps) > 0 then
          v_coverage_gaps := v_coverage_gaps || v_day_gaps;
          v_no_coverage_dates := v_no_coverage_dates || to_jsonb(v_day);
          for v_item in select * from jsonb_array_elements(v_day_gaps) loop
            v_no_coverage := array_append(v_no_coverage,
              public.pawcruz_fmt_date(v_day) || ' (' ||
              public.pawcruz_fmt_time((v_item->>'start')::time) || ' – ' ||
              public.pawcruz_fmt_time((v_item->>'end')::time) || ')');
          end loop;
        end if;

        -- Patients already in today's queue for this vet.
        if v_day = v_today and v_effect.unavailable_end > v_now then
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', q.id, 'queue_number', q.queue_number, 'status', q.status,
              'pet_name', p.pet_name, 'owner_name', o.full_name, 'arrived_at', q.arrived_at,
              'appointment_id', q.appointment_id) order by q.arrived_at), '[]'::jsonb)
            into v_queue
          from public.queue_entries q
          left join public.pets p on p.id = q.pet_id
          left join public.profiles o on o.id = q.owner_id
          where q.veterinarian_id = p_veterinarian_id
            and q.queue_date = v_today
            and q.status in ('Waiting', 'Serving', 'Now Serving');
        end if;
      end if;

      if v_shift.override_id is not null and not v_shift.override_is_leave then
        v_replaced := v_replaced || jsonb_build_array(jsonb_build_object(
          'schedule_date', v_day, 'start_time', v_shift.shift_start, 'end_time', v_shift.shift_end,
          'reason', v_shift.override_reason));
      end if;
    elsif v_effect.error is null then
      v_not_working := v_not_working + 1;
    end if;

    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'date', v_day,
      'weekday', to_char(v_day, 'FMDay'),
      'past', v_day < v_today,
      'working', coalesce(v_shift.is_working, false),
      'shift_start', v_shift.shift_start,
      'shift_end', v_shift.shift_end,
      'shift_source', case
        when v_shift.override_id is not null and v_shift.override_is_leave then 'leave'
        when v_shift.override_id is not null then 'adjusted'
        when coalesce(v_shift.is_working, false) then 'weekly'
        else 'off' end,
      'effect', v_effect.effect,
      'available_start', v_effect.available_start,
      'available_end', v_effect.available_end,
      'unavailable_start', v_effect.unavailable_start,
      'unavailable_end', v_effect.unavailable_end,
      'appointments', v_day_count,
      'other_vets_working', v_other_working,
      'coverage_gaps', v_day_gaps,
      'replaces_override', v_shift.override_id is not null and not v_shift.override_is_leave
    ));
  end loop;

  if v_working_days = 0 and coalesce(array_length(v_errors, 1), 0) = 0 then
    v_errors := array_append(v_errors, 'There are no scheduled working hours on the selected date(s), so this leave would not change anything.');
  end if;

  -- Other vets' requests on the same dates (coverage planning).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'veterinarian_id', r.veterinarian_id, 'veterinarian_name', pv.full_name,
      'request_type', r.request_type, 'leave_type', r.leave_type, 'status', r.status,
      'start_date', r.start_date, 'end_date', r.end_date) order by r.start_date), '[]'::jsonb)
    into v_other_requests
  from public.veterinarian_leave_requests r
  join public.profiles pv on pv.id = r.veterinarian_id
  where r.veterinarian_id <> p_veterinarian_id
    and r.status in ('Pending', 'Approved')
    and r.start_date <= v_end
    and r.end_date >= v_start;

  -- Warnings (non-blocking), phrased for both the vet and staff.
  if v_appointment_total > 0 then
    v_warnings := array_append(v_warnings, (v_appointment_total || case when v_appointment_total = 1
      then ' booked appointment falls inside this leave. Staff will need to reassign or rebook it.'
      else ' booked appointments fall inside this leave. Staff will need to reassign or rebook them.' end));
  end if;

  if jsonb_array_length(v_queue) > 0 then
    select count(*) filter (where e->>'status' = 'Waiting'),
           count(*) filter (where e->>'status' in ('Serving', 'Now Serving'))
      into v_waiting, v_serving
    from jsonb_array_elements(v_queue) e;
    v_warnings := array_append(v_warnings, (jsonb_array_length(v_queue) || ' patient' ||
      case when jsonb_array_length(v_queue) = 1 then ' is' else 's are' end ||
      ' in today''s queue for this veterinarian (' || v_waiting || ' waiting, ' || v_serving || ' in consultation).'));
  end if;

  if coalesce(array_length(v_no_coverage, 1), 0) > 0 then
    v_warnings := array_append(v_warnings, ('No other veterinarian is scheduled on ' ||
      array_to_string(v_no_coverage, ', ') || '. The clinic would have no available veterinarian then.'));
  end if;

  for v_item in select * from jsonb_array_elements(v_other_requests) loop
    v_warnings := array_append(v_warnings, (public.pawcruz_dr_name(v_item->>'veterinarian_name') || ' also has ' ||
      case when v_item->>'status' = 'Pending' then 'a pending' else 'an approved' end || ' ' ||
      lower(v_item->>'request_type') || ' request on ' ||
      case when v_item->>'start_date' = v_item->>'end_date'
        then public.pawcruz_fmt_date((v_item->>'start_date')::date)
        else public.pawcruz_fmt_date((v_item->>'start_date')::date) || ' – ' || public.pawcruz_fmt_date((v_item->>'end_date')::date)
      end || '.'));
  end loop;

  for v_item in select * from jsonb_array_elements(v_replaced) loop
    v_warnings := array_append(v_warnings, ('Adjusted hours already set for ' ||
      public.pawcruz_fmt_date((v_item->>'schedule_date')::date) ||
      coalesce(' (' || public.pawcruz_fmt_time((v_item->>'start_time')::time) || ' – ' ||
               public.pawcruz_fmt_time((v_item->>'end_time')::time) || ')', '') ||
      ' will be replaced by this leave, and restored if the leave is cancelled.'));
  end loop;

  if v_not_working > 0 and v_working_days > 0 then
    v_warnings := array_append(v_warnings, (v_not_working || case when v_not_working = 1
      then ' day in this range is not a working day and is not affected.'
      else ' days in this range are not working days and are not affected.' end));
  end if;

  return jsonb_build_object(
    'ok', coalesce(array_length(v_errors, 1), 0) = 0,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'today', v_today,
    'now', v_now,
    'normalized', jsonb_build_object('request_type', v_type, 'start_date', v_start, 'end_date', v_end,
      'is_full_day', v_full, 'start_time', v_from, 'end_time', v_to),
    'working_days', v_working_days,
    'appointment_count', v_appointment_total,
    'queue_count', jsonb_array_length(v_queue),
    'days', v_days,
    'appointments', v_appointments,
    'queue', v_queue,
    'overlapping_requests', v_own_overlaps,
    'other_requests', v_other_requests,
    'no_coverage_dates', v_no_coverage_dates,
    'coverage_gaps', v_coverage_gaps,
    'replaced_overrides', v_replaced
  );
end;
$$;

create or replace function public.get_vet_leave_request_impact(p_request_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select public.get_vet_leave_impact(
    r.veterinarian_id, r.request_type, r.start_date, r.end_date,
    r.is_full_day, r.start_time, r.end_time, r.id)
  from public.veterinarian_leave_requests r
  where r.id = p_request_id;
$$;

-- ---------------------------------------------------------------------
-- 4. Applying / restoring the schedule (internal)
-- ---------------------------------------------------------------------

create or replace function public.apply_vet_leave_overrides(p_request_id uuid, p_actor_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_request public.veterinarian_leave_requests%rowtype;
  v_today date := public.pawcruz_clinic_today();
  v_day date;
  v_shift record;
  v_effect record;
  v_existing public.veterinarian_schedule_overrides%rowtype;
  v_replaced jsonb := '[]'::jsonb;
  v_reason text;
  v_count integer := 0;
begin
  select * into v_request from public.veterinarian_leave_requests where id = p_request_id for update;
  if not found then
    raise exception 'Leave request not found.';
  end if;

  v_reason := left(
    case when v_request.request_type = 'Emergency' then 'Emergency leave' else 'Approved leave' end ||
    ' – ' || v_request.leave_type || ': ' || btrim(v_request.reason), 240);

  for v_day in select g::date from generate_series(greatest(v_request.start_date, v_today), v_request.end_date, interval '1 day') as g loop
    select * into v_shift from public.vet_base_shift(v_request.veterinarian_id, v_day, v_request.id);
    select * into v_effect from public.vet_leave_day_effect(
      v_shift.is_working, v_shift.shift_start, v_shift.shift_end,
      v_request.is_full_day, v_request.start_time, v_request.end_time);

    if v_effect.error is not null then
      raise exception '%', v_effect.error;
    end if;
    continue when v_effect.effect not in ('off', 'partial');

    select * into v_existing
    from public.veterinarian_schedule_overrides
    where veterinarian_id = v_request.veterinarian_id and schedule_date = v_day;

    if found and v_existing.leave_request_id is null then
      v_replaced := v_replaced || jsonb_build_array(jsonb_build_object(
        'schedule_date', v_existing.schedule_date,
        'is_available', v_existing.is_available,
        'start_time', v_existing.start_time,
        'end_time', v_existing.end_time,
        'reason', v_existing.reason,
        'created_by', v_existing.created_by));
    end if;

    insert into public.veterinarian_schedule_overrides (
      veterinarian_id, schedule_date, is_available, start_time, end_time, reason, created_by, leave_request_id
    ) values (
      v_request.veterinarian_id, v_day, v_effect.effect = 'partial',
      case when v_effect.effect = 'partial' then v_effect.available_start end,
      case when v_effect.effect = 'partial' then v_effect.available_end end,
      v_reason, p_actor_id, v_request.id
    )
    on conflict (veterinarian_id, schedule_date) do update set
      is_available = excluded.is_available,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      reason = excluded.reason,
      created_by = excluded.created_by,
      leave_request_id = excluded.leave_request_id;

    v_count := v_count + 1;
  end loop;

  update public.veterinarian_leave_requests
  set replaced_overrides = coalesce(replaced_overrides, '[]'::jsonb) || v_replaced
  where id = v_request.id;

  return v_count;
end;
$$;

-- Removes this leave's overrides from today onward and puts back any
-- adjusted hours it had replaced. Past days are left as history.
create or replace function public.restore_vet_leave_overrides(p_request_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_request public.veterinarian_leave_requests%rowtype;
  v_today date := public.pawcruz_clinic_today();
  v_item jsonb;
  v_count integer := 0;
begin
  select * into v_request from public.veterinarian_leave_requests where id = p_request_id for update;
  if not found then
    raise exception 'Leave request not found.';
  end if;

  delete from public.veterinarian_schedule_overrides
  where leave_request_id = v_request.id
    and schedule_date >= v_today;
  get diagnostics v_count = row_count;

  for v_item in select * from jsonb_array_elements(coalesce(v_request.replaced_overrides, '[]'::jsonb)) loop
    continue when (v_item->>'schedule_date')::date < v_today;
    insert into public.veterinarian_schedule_overrides (
      veterinarian_id, schedule_date, is_available, start_time, end_time, reason, created_by, leave_request_id
    ) values (
      v_request.veterinarian_id,
      (v_item->>'schedule_date')::date,
      coalesce((v_item->>'is_available')::boolean, false),
      (v_item->>'start_time')::time,
      (v_item->>'end_time')::time,
      v_item->>'reason',
      (select p.id from public.profiles p where p.id = (v_item->>'created_by')::uuid),
      null
    )
    on conflict (veterinarian_id, schedule_date) do nothing;
  end loop;

  return v_count;
end;
$$;

create or replace function public.pawcruz_notify_schedule_managers(
  p_title text, p_message text, p_record uuid, p_created_by uuid
)
returns void
language sql volatile security definer set search_path = public
as $$
  insert into public.notifications (
    recipient_id, title, message, notification_type, related_module, related_record, created_by
  )
  select p.id, p_title, p_message, 'Leave Request', 'Veterinarian Schedules', p_record, p_created_by
  from public.profiles p
  where p.role::text in ('staff', 'admin')
    and p.account_status::text = 'active'
    and p.id is distinct from p_created_by;
$$;

create or replace function public.pawcruz_notify_vet_schedule(
  p_veterinarian_id uuid, p_title text, p_message text, p_record uuid, p_created_by uuid
)
returns void
language sql volatile security definer set search_path = public
as $$
  insert into public.notifications (
    recipient_id, title, message, notification_type, related_module, related_record, created_by
  ) values (
    p_veterinarian_id, p_title, p_message, 'Schedule Update', 'My Schedule', p_record, p_created_by
  );
$$;

create or replace function public.pawcruz_log_schedule_activity(
  p_user_id uuid, p_action text, p_description text, p_record uuid
)
returns void
language plpgsql volatile security definer set search_path = public
as $$
begin
  insert into public.activity_logs (user_id, role, action, module, related_record, description)
  select p.id, p.role, p_action, 'Veterinarian Schedules', p_record, p_description
  from public.profiles p
  where p.id = p_user_id;
exception when others then
  -- The audit log must never block the schedule change itself.
  null;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RPCs called by the apps
-- ---------------------------------------------------------------------

create or replace function public.submit_vet_leave_request(
  p_veterinarian_id uuid,
  p_request_type text,
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_is_full_day boolean default true,
  p_start_time time default null,
  p_end_time time default null,
  p_reason text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_type text := coalesce(nullif(btrim(p_request_type), ''), 'Leave');
  v_leave_type text := nullif(btrim(p_leave_type), '');
  v_reason text := nullif(btrim(p_reason), '');
  v_impact jsonb;
  v_norm jsonb;
  v_request public.veterinarian_leave_requests%rowtype;
  v_vet_name text;
  v_period text;
  v_message text;
  v_appointments integer;
  v_queue integer;
begin
  if v_leave_type is null then
    raise exception 'Select a leave type.';
  end if;
  if v_type = 'Leave' and v_leave_type not in ('Vacation Leave', 'Sick Leave', 'Personal Leave', 'Training / Seminar', 'Other') then
    raise exception 'Select a valid leave type.';
  end if;
  if v_type = 'Emergency' and v_leave_type not in ('Sudden Illness', 'Family Emergency', 'Personal Emergency', 'Other') then
    raise exception 'Select a valid emergency type.';
  end if;
  if v_reason is null then
    raise exception 'Add a short reason so staff can plan coverage.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.';
  end if;

  -- One filing at a time per vet, so two quick taps can't both pass the
  -- overlap check.
  perform pg_advisory_xact_lock(hashtext('pawcruz-vet-leave:' || p_veterinarian_id::text));

  v_impact := public.get_vet_leave_impact(
    p_veterinarian_id, v_type, p_start_date, p_end_date,
    p_is_full_day, p_start_time, p_end_time, null);
  if not coalesce((v_impact->>'ok')::boolean, false) then
    raise exception '%', coalesce(v_impact->'errors'->>0, 'This leave request is not valid.');
  end if;
  v_norm := v_impact->'normalized';

  insert into public.veterinarian_leave_requests (
    veterinarian_id, request_type, leave_type, start_date, end_date,
    is_full_day, start_time, end_time, reason, status, reviewed_at, review_note
  ) values (
    p_veterinarian_id, v_type, v_leave_type,
    (v_norm->>'start_date')::date, (v_norm->>'end_date')::date,
    (v_norm->>'is_full_day')::boolean, (v_norm->>'start_time')::time, (v_norm->>'end_time')::time,
    v_reason,
    case when v_type = 'Emergency' then 'Approved' else 'Pending' end,
    case when v_type = 'Emergency' then now() end,
    case when v_type = 'Emergency' then 'Applied immediately (same-day emergency).' end
  )
  returning * into v_request;

  if v_type = 'Emergency' then
    perform public.apply_vet_leave_overrides(v_request.id, p_veterinarian_id);
  end if;

  select full_name into v_vet_name from public.profiles where id = p_veterinarian_id;
  v_period := public.pawcruz_leave_period_text(
    v_request.request_type, v_request.start_date, v_request.end_date,
    v_request.is_full_day, v_request.start_time, v_request.end_time);
  v_appointments := coalesce((v_impact->>'appointment_count')::integer, 0);
  v_queue := coalesce((v_impact->>'queue_count')::integer, 0);

  if v_type = 'Emergency' then
    v_message := public.pawcruz_dr_name(v_vet_name) || ' filed an emergency leave (' || v_leave_type ||
      ') and is unavailable ' || v_period || '. New bookings are already blocked.';
    if v_appointments > 0 or v_queue > 0 then
      v_message := v_message || ' ' || v_appointments || ' appointment(s) and ' || v_queue ||
        ' queued patient(s) need to be reassigned.';
    end if;
    perform public.pawcruz_notify_schedule_managers(
      'Emergency Leave: ' || public.pawcruz_dr_name(v_vet_name), v_message, v_request.id, p_veterinarian_id);
    perform public.pawcruz_log_schedule_activity(p_veterinarian_id, 'Emergency Leave Filed',
      public.pawcruz_dr_name(v_vet_name) || ' is unavailable ' || v_period || ' (' || v_leave_type || ').', v_request.id);
  else
    v_message := public.pawcruz_dr_name(v_vet_name) || ' requested ' || v_leave_type || ' for ' || v_period || '.';
    if v_appointments > 0 then
      v_message := v_message || ' ' || v_appointments || ' booked appointment(s) are affected.';
    end if;
    v_message := v_message || ' Review it in Veterinarian Schedules.';
    perform public.pawcruz_notify_schedule_managers(
      'Leave Request: ' || public.pawcruz_dr_name(v_vet_name), v_message, v_request.id, p_veterinarian_id);
    perform public.pawcruz_log_schedule_activity(p_veterinarian_id, 'Leave Requested',
      public.pawcruz_dr_name(v_vet_name) || ' requested ' || v_leave_type || ' for ' || v_period || '.', v_request.id);
  end if;

  select * into v_request from public.veterinarian_leave_requests where id = v_request.id;
  return jsonb_build_object('request', to_jsonb(v_request), 'impact', v_impact);
end;
$$;

-- p_action: 'approve' | 'reject' | 'acknowledge' | 'revoke'
create or replace function public.review_vet_leave_request(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_action text := lower(coalesce(btrim(p_action), ''));
  v_note text := nullif(btrim(p_note), '');
  v_today date := public.pawcruz_clinic_today();
  v_reviewer record;
  v_vet_id uuid;
  v_request public.veterinarian_leave_requests%rowtype;
  v_impact jsonb;
  v_vet_name text;
  v_period text;
  v_by text;
begin
  select p.id, p.full_name, p.role::text as role, p.account_status::text as account_status
    into v_reviewer
  from public.profiles p
  where p.id = p_reviewer_id;
  if not found or v_reviewer.role not in ('staff', 'admin') or v_reviewer.account_status <> 'active' then
    raise exception 'Only active staff or administrators can review leave requests.';
  end if;

  select veterinarian_id into v_vet_id from public.veterinarian_leave_requests where id = p_request_id;
  if not found then
    raise exception 'Leave request not found.';
  end if;
  perform pg_advisory_xact_lock(hashtext('pawcruz-vet-leave:' || v_vet_id::text));
  select * into v_request from public.veterinarian_leave_requests where id = p_request_id for update;

  select full_name into v_vet_name from public.profiles where id = v_request.veterinarian_id;
  v_period := public.pawcruz_leave_period_text(
    v_request.request_type, v_request.start_date, v_request.end_date,
    v_request.is_full_day, v_request.start_time, v_request.end_time);
  v_by := coalesce(v_reviewer.full_name, 'clinic staff');

  if v_action = 'approve' then
    if v_request.status <> 'Pending' then
      raise exception 'Only a pending request can be approved (this one is %).', lower(v_request.status);
    end if;
    v_impact := public.get_vet_leave_impact(
      v_request.veterinarian_id, v_request.request_type, v_request.start_date, v_request.end_date,
      v_request.is_full_day, v_request.start_time, v_request.end_time, v_request.id);
    if not coalesce((v_impact->>'ok')::boolean, false) then
      raise exception '%', coalesce(v_impact->'errors'->>0, 'This leave request can no longer be approved.');
    end if;

    perform public.apply_vet_leave_overrides(v_request.id, p_reviewer_id);
    update public.veterinarian_leave_requests
    set status = 'Approved', reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = v_note,
        acknowledged_by = p_reviewer_id, acknowledged_at = now()
    where id = v_request.id;

    perform public.pawcruz_notify_vet_schedule(v_request.veterinarian_id, 'Leave Approved',
      'Your ' || v_request.leave_type || ' for ' || v_period || ' was approved by ' || v_by || '.' ||
      coalesce(' Note: ' || v_note, '') || ' Your schedule has been updated.',
      v_request.id, p_reviewer_id);
    perform public.pawcruz_log_schedule_activity(p_reviewer_id, 'Leave Approved',
      'Approved ' || v_request.leave_type || ' for ' || public.pawcruz_dr_name(v_vet_name) || ', ' || v_period || '.', v_request.id);

  elsif v_action = 'reject' then
    if v_request.status <> 'Pending' then
      raise exception 'Only a pending request can be declined (this one is %).', lower(v_request.status);
    end if;
    if v_note is null then
      raise exception 'Add a note explaining why the request is declined.';
    end if;
    update public.veterinarian_leave_requests
    set status = 'Rejected', reviewed_by = p_reviewer_id, reviewed_at = now(), review_note = v_note
    where id = v_request.id;

    perform public.pawcruz_notify_vet_schedule(v_request.veterinarian_id, 'Leave Request Declined',
      'Your ' || v_request.leave_type || ' request for ' || v_period || ' was declined by ' || v_by || '. Note: ' || v_note,
      v_request.id, p_reviewer_id);
    perform public.pawcruz_log_schedule_activity(p_reviewer_id, 'Leave Declined',
      'Declined ' || v_request.leave_type || ' for ' || public.pawcruz_dr_name(v_vet_name) || ', ' || v_period || '.', v_request.id);

  elsif v_action = 'acknowledge' then
    if v_request.request_type <> 'Emergency' or v_request.status <> 'Approved' then
      raise exception 'Only an active emergency leave can be acknowledged.';
    end if;
    if v_request.acknowledged_at is null then
      update public.veterinarian_leave_requests
      set acknowledged_by = p_reviewer_id, acknowledged_at = now(),
          review_note = coalesce(v_note, review_note)
      where id = v_request.id;

      perform public.pawcruz_notify_vet_schedule(v_request.veterinarian_id, 'Emergency Leave Acknowledged',
        v_by || ' acknowledged your emergency leave (' || v_period || '). Staff are handling your patients.' ||
        coalesce(' Note: ' || v_note, ''),
        v_request.id, p_reviewer_id);
      perform public.pawcruz_log_schedule_activity(p_reviewer_id, 'Emergency Leave Acknowledged',
        'Acknowledged the emergency leave of ' || public.pawcruz_dr_name(v_vet_name) || ', ' || v_period || '.', v_request.id);
    end if;

  elsif v_action = 'revoke' then
    if v_request.status <> 'Approved' then
      raise exception 'Only an approved leave can be revoked.';
    end if;
    if v_request.end_date < v_today then
      raise exception 'This leave has already ended.';
    end if;
    if v_note is null then
      raise exception 'Add a note explaining why the leave is revoked.';
    end if;

    perform public.restore_vet_leave_overrides(v_request.id);
    update public.veterinarian_leave_requests
    set status = 'Cancelled', cancelled_by = p_reviewer_id, cancelled_at = now(), cancel_note = v_note
    where id = v_request.id;

    perform public.pawcruz_notify_vet_schedule(v_request.veterinarian_id, 'Leave Revoked',
      'Your ' || lower(v_request.request_type) || ' (' || v_request.leave_type || ') for ' || v_period ||
      ' was revoked by ' || v_by || '. Note: ' || v_note || ' Your regular schedule is back.',
      v_request.id, p_reviewer_id);
    perform public.pawcruz_log_schedule_activity(p_reviewer_id, 'Leave Revoked',
      'Revoked the ' || lower(v_request.request_type) || ' of ' || public.pawcruz_dr_name(v_vet_name) || ', ' || v_period || '.', v_request.id);

  else
    raise exception 'Unknown review action "%".', p_action;
  end if;

  select * into v_request from public.veterinarian_leave_requests where id = p_request_id;
  return jsonb_build_object('request', to_jsonb(v_request));
end;
$$;

-- The vet withdrawing their own request. An approved one (including an
-- emergency, e.g. "I'm available again") can be cancelled until it ends.
create or replace function public.cancel_vet_leave_request(
  p_request_id uuid,
  p_veterinarian_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_note text := nullif(btrim(p_note), '');
  v_today date := public.pawcruz_clinic_today();
  v_request public.veterinarian_leave_requests%rowtype;
  v_vet_name text;
  v_period text;
begin
  perform pg_advisory_xact_lock(hashtext('pawcruz-vet-leave:' || p_veterinarian_id::text));
  select * into v_request from public.veterinarian_leave_requests where id = p_request_id for update;
  if not found or v_request.veterinarian_id <> p_veterinarian_id then
    raise exception 'Leave request not found.';
  end if;

  select full_name into v_vet_name from public.profiles where id = p_veterinarian_id;
  v_period := public.pawcruz_leave_period_text(
    v_request.request_type, v_request.start_date, v_request.end_date,
    v_request.is_full_day, v_request.start_time, v_request.end_time);

  if v_request.status = 'Pending' then
    update public.veterinarian_leave_requests
    set status = 'Cancelled', cancelled_by = p_veterinarian_id, cancelled_at = now(), cancel_note = v_note
    where id = v_request.id;
    perform public.pawcruz_log_schedule_activity(p_veterinarian_id, 'Leave Request Withdrawn',
      public.pawcruz_dr_name(v_vet_name) || ' withdrew a ' || v_request.leave_type || ' request for ' || v_period || '.', v_request.id);

  elsif v_request.status = 'Approved' then
    if v_request.end_date < v_today then
      raise exception 'This leave has already ended.';
    end if;
    perform public.restore_vet_leave_overrides(v_request.id);
    update public.veterinarian_leave_requests
    set status = 'Cancelled', cancelled_by = p_veterinarian_id, cancelled_at = now(), cancel_note = v_note
    where id = v_request.id;

    perform public.pawcruz_notify_schedule_managers(
      case when v_request.request_type = 'Emergency'
        then 'Available Again: ' || public.pawcruz_dr_name(v_vet_name)
        else 'Leave Cancelled: ' || public.pawcruz_dr_name(v_vet_name) end,
      public.pawcruz_dr_name(v_vet_name) || ' cancelled their ' || lower(v_request.request_type) ||
        ' (' || v_request.leave_type || ') for ' || v_period ||
        '. Their regular schedule is back and bookings are open again.' || coalesce(' Note: ' || v_note, ''),
      v_request.id, p_veterinarian_id);
    perform public.pawcruz_log_schedule_activity(p_veterinarian_id, 'Leave Cancelled',
      public.pawcruz_dr_name(v_vet_name) || ' cancelled their approved ' || lower(v_request.request_type) || ' for ' || v_period || '.', v_request.id);

  else
    raise exception 'This request is already %.', lower(v_request.status);
  end if;

  select * into v_request from public.veterinarian_leave_requests where id = p_request_id;
  return jsonb_build_object('request', to_jsonb(v_request));
end;
$$;

-- Staff/Admin board: every request that still needs attention, with its
-- live impact (remaining conflicts), in one call.
--   Pending                      -> approve / reject
--   Emergency not acknowledged   -> acknowledge
--   Approved, not ended          -> resolve remaining conflicts / revoke
create or replace function public.get_vet_leave_board()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_result jsonb := '[]'::jsonb;
  v_row record;
begin
  for v_row in
    select r.*, pv.full_name as veterinarian_name, pv.avatar_url as veterinarian_avatar,
           rv.full_name as reviewer_name, ak.full_name as acknowledged_by_name
    from public.veterinarian_leave_requests r
    join public.profiles pv on pv.id = r.veterinarian_id
    left join public.profiles rv on rv.id = r.reviewed_by
    left join public.profiles ak on ak.id = r.acknowledged_by
    where r.status = 'Pending'
       or (r.status = 'Approved' and r.end_date >= v_today)
    order by
      case when r.request_type = 'Emergency' and r.acknowledged_at is null then 0
           when r.status = 'Pending' then 1 else 2 end,
      r.start_date, r.created_at
  loop
    v_result := v_result || jsonb_build_array(
      (to_jsonb(v_row) - 'replaced_overrides') || jsonb_build_object(
        'impact', public.get_vet_leave_impact(
          v_row.veterinarian_id, v_row.request_type, v_row.start_date, v_row.end_date,
          v_row.is_full_day, v_row.start_time, v_row.end_time, v_row.id)));
  end loop;

  return jsonb_build_object('today', v_today, 'now', public.pawcruz_clinic_now(), 'requests', v_result);
end;
$$;

-- The vet's own schedule for the next p_days days (today first): the
-- effective hours per day, where they come from, booked appointments and
-- any request covering the day. Powers "My Schedule" on web and mobile.
create or replace function public.get_vet_schedule_overview(
  p_veterinarian_id uuid,
  p_days integer default 14
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_span integer := greatest(least(coalesce(p_days, 14), 60), 1);
  v_days jsonb := '[]'::jsonb;
  v_day date;
  v_shift record;
  v_request record;
  v_appointments integer;
begin
  for v_day in select g::date from generate_series(v_today, v_today + (v_span - 1), interval '1 day') as g loop
    select * into v_shift from public.vet_base_shift(p_veterinarian_id, v_day, null);

    select count(*) into v_appointments
    from public.appointments a
    where a.veterinarian_id = p_veterinarian_id
      and a.appointment_date = v_day
      and a.status::text = 'Confirmed';

    select r.id, r.request_type, r.leave_type, r.status, r.is_full_day, r.start_time, r.end_time
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
      'working', coalesce(v_shift.is_working, false),
      'start_time', v_shift.shift_start,
      'end_time', v_shift.shift_end,
      'source', case
        when v_shift.override_id is not null and v_shift.override_is_leave then 'leave'
        when v_shift.override_id is not null then 'adjusted'
        when coalesce(v_shift.is_working, false) then 'weekly'
        else 'off' end,
      'note', v_shift.override_reason,
      'appointments', v_appointments,
      'request', case when v_request.id is null then null else jsonb_build_object(
        'id', v_request.id, 'request_type', v_request.request_type, 'leave_type', v_request.leave_type,
        'status', v_request.status, 'is_full_day', v_request.is_full_day,
        'start_time', v_request.start_time, 'end_time', v_request.end_time) end
    ));
  end loop;

  return jsonb_build_object(
    'today', v_today,
    'now', public.pawcruz_clinic_now(),
    'days', v_days,
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week', s.day_of_week, 'is_available', s.is_available,
        'start_time', s.start_time, 'end_time', s.end_time) order by s.day_of_week)
      from public.veterinarian_schedules s
      where s.veterinarian_id = p_veterinarian_id), '[]'::jsonb),
    'queue_today', (
      select count(*) from public.queue_entries q
      where q.veterinarian_id = p_veterinarian_id
        and q.queue_date = v_today
        and q.status in ('Waiting', 'Serving', 'Now Serving'))
  );
end;
$$;

-- Staff/Admin recording leave or an emergency on a vet's behalf (the vet
-- called the front desk). Same checks as the vet's own filing, but a
-- planned leave may start today, and it is approved at once since staff
-- are the approvers.
create or replace function public.staff_file_vet_leave(
  p_staff_id uuid,
  p_veterinarian_id uuid,
  p_request_type text,
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_is_full_day boolean default true,
  p_start_time time default null,
  p_end_time time default null,
  p_reason text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_type text := coalesce(nullif(btrim(p_request_type), ''), 'Leave');
  v_leave_type text := nullif(btrim(p_leave_type), '');
  v_reason text := nullif(btrim(p_reason), '');
  v_staff record;
  v_impact jsonb;
  v_norm jsonb;
  v_request public.veterinarian_leave_requests%rowtype;
  v_vet_name text;
  v_period text;
  v_message text;
  v_appointments integer;
  v_queue integer;
begin
  select p.id, p.full_name, p.role::text as role, p.account_status::text as account_status
    into v_staff
  from public.profiles p
  where p.id = p_staff_id;
  if not found or v_staff.role not in ('staff', 'admin') or v_staff.account_status <> 'active' then
    raise exception 'Only active staff or administrators can file leave for a veterinarian.';
  end if;
  if v_leave_type is null then
    raise exception 'Select a leave type.';
  end if;
  if v_type = 'Leave' and v_leave_type not in ('Vacation Leave', 'Sick Leave', 'Personal Leave', 'Training / Seminar', 'Other') then
    raise exception 'Select a valid leave type.';
  end if;
  if v_type = 'Emergency' and v_leave_type not in ('Sudden Illness', 'Family Emergency', 'Personal Emergency', 'Other') then
    raise exception 'Select a valid emergency type.';
  end if;
  if v_reason is null then
    raise exception 'Add a short reason for the record.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtext('pawcruz-vet-leave:' || p_veterinarian_id::text));

  v_impact := public.get_vet_leave_impact(
    p_veterinarian_id, v_type, p_start_date, p_end_date,
    p_is_full_day, p_start_time, p_end_time, null, true);
  if not coalesce((v_impact->>'ok')::boolean, false) then
    raise exception '%', coalesce(v_impact->'errors'->>0, 'This leave is not valid.');
  end if;
  v_norm := v_impact->'normalized';

  insert into public.veterinarian_leave_requests (
    veterinarian_id, request_type, leave_type, start_date, end_date,
    is_full_day, start_time, end_time, reason, status,
    reviewed_by, reviewed_at, acknowledged_by, acknowledged_at, review_note
  ) values (
    p_veterinarian_id, v_type, v_leave_type,
    (v_norm->>'start_date')::date, (v_norm->>'end_date')::date,
    (v_norm->>'is_full_day')::boolean, (v_norm->>'start_time')::time, (v_norm->>'end_time')::time,
    v_reason, 'Approved',
    p_staff_id, now(), p_staff_id, now(),
    'Filed by ' || coalesce(v_staff.full_name, 'clinic staff') || ' for the veterinarian.'
  )
  returning * into v_request;

  perform public.apply_vet_leave_overrides(v_request.id, p_staff_id);

  select full_name into v_vet_name from public.profiles where id = p_veterinarian_id;
  v_period := public.pawcruz_leave_period_text(
    v_request.request_type, v_request.start_date, v_request.end_date,
    v_request.is_full_day, v_request.start_time, v_request.end_time);
  v_appointments := coalesce((v_impact->>'appointment_count')::integer, 0);
  v_queue := coalesce((v_impact->>'queue_count')::integer, 0);

  perform public.pawcruz_notify_vet_schedule(p_veterinarian_id, 'Leave Recorded For You',
    coalesce(v_staff.full_name, 'Clinic staff') || ' recorded your ' || v_leave_type || ' for ' || v_period ||
    '. Your schedule has been updated.', v_request.id, p_staff_id);

  v_message := coalesce(v_staff.full_name, 'Clinic staff') || ' recorded ' || v_leave_type || ' for ' ||
    public.pawcruz_dr_name(v_vet_name) || ', ' || v_period || '.';
  if v_appointments > 0 or v_queue > 0 then
    v_message := v_message || ' ' || v_appointments || ' appointment(s) and ' || v_queue ||
      ' queued patient(s) need to be reassigned.';
  end if;
  perform public.pawcruz_notify_schedule_managers(
    'Leave Recorded: ' || public.pawcruz_dr_name(v_vet_name), v_message, v_request.id, p_staff_id);
  perform public.pawcruz_log_schedule_activity(p_staff_id, 'Leave Recorded',
    'Recorded ' || v_leave_type || ' for ' || public.pawcruz_dr_name(v_vet_name) || ', ' || v_period || '.', v_request.id);

  select * into v_request from public.veterinarian_leave_requests where id = v_request.id;
  return jsonb_build_object('request', to_jsonb(v_request), 'impact', v_impact);
end;
$$;

-- Clinic-wide coverage for the next p_days days: every active vet's hours
-- per day (same shape as get_vet_schedule_overview) plus, per day, the
-- clinic hours (9:00 AM–7:00 PM) that no vet covers, e.g. 9–11 AM when
-- Dr. Redmond (9–5) is on leave, since Dr. Neil only starts at 11.
create or replace function public.get_clinic_coverage(p_days integer default 14)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_span integer := greatest(least(coalesce(p_days, 14), 60), 1);
  v_open constant time := time '09:00';
  v_close constant time := time '19:00';
  v_days jsonb := '[]'::jsonb;
  v_day date;
  v_gaps jsonb;
  v_cursor time;
  v_interval record;
  v_appointments integer;
  v_vets jsonb;
begin
  for v_day in select g::date from generate_series(v_today, v_today + (v_span - 1), interval '1 day') as g loop
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

    select count(*) into v_appointments
    from public.appointments a
    join public.profiles pv on pv.id = a.veterinarian_id
    where a.appointment_date = v_day
      and a.status::text = 'Confirmed'
      and pv.role::text = 'veterinarian';

    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'date', v_day, 'weekday', to_char(v_day, 'FMDay'), 'is_today', v_day = v_today,
      'gaps', v_gaps, 'appointments', v_appointments));
  end loop;

  -- Vets in shift order (earliest regular start first), then by name.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pv.id, 'full_name', pv.full_name, 'avatar_url', pv.avatar_url,
      'days', public.get_vet_schedule_overview(pv.id, v_span)->'days')
      order by (select min(s.start_time) from public.veterinarian_schedules s
                where s.veterinarian_id = pv.id and s.is_available) nulls last, pv.full_name), '[]'::jsonb)
    into v_vets
  from public.profiles pv
  where pv.role::text = 'veterinarian'
    and pv.account_status::text = 'active';

  return jsonb_build_object(
    'today', v_today, 'now', public.pawcruz_clinic_now(),
    'clinic_open', v_open, 'clinic_close', v_close,
    'vets', v_vets, 'days', v_days);
end;
$$;

-- Upcoming bookings that no longer fit their vet's hours for a reason
-- OTHER than a leave (leave conflicts live on the leave board): e.g. staff
-- changed a vet's weekly hours while they still had bookings outside the
-- new ones, or set adjusted hours / a day off on a date with bookings.
create or replace function public.get_schedule_conflicts(p_days integer default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.pawcruz_clinic_today();
  v_now time := public.pawcruz_clinic_now();
  v_until date := v_today + greatest(least(coalesce(p_days, 60), 180), 1);
  v_checked_in uuid[];
  v_checked_in_grouped uuid[];
  v_result jsonb;
begin
  select coalesce(array_agg(q.appointment_id), array[]::uuid[]) into v_checked_in
  from public.queue_entries q
  join public.appointments a on a.id = q.appointment_id
  where a.appointment_date between v_today and v_until;

  if to_regclass('public.queue_entry_pets') is not null then
    execute
      'select coalesce(array_agg(qp.appointment_id), array[]::uuid[])
         from public.queue_entry_pets qp
         join public.appointments a on a.id = qp.appointment_id
        where a.appointment_date between $1 and $2'
      into v_checked_in_grouped
      using v_today, v_until;
    v_checked_in := v_checked_in || coalesce(v_checked_in_grouped, array[]::uuid[]);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'appointment_date', a.appointment_date,
      'start_time', a.start_time, 'end_time', a.end_time,
      'veterinarian_id', a.veterinarian_id, 'veterinarian_name', pv.full_name,
      'pet_id', a.pet_id, 'pet_name', p.pet_name,
      'owner_id', a.owner_id, 'owner_name', o.full_name,
      'visit_reason', a.visit_reason,
      'shift_start', s.shift_start, 'shift_end', s.shift_end,
      'problem', case when not s.is_working then 'Not scheduled that day'
        else 'Outside ' || public.pawcruz_fmt_time(s.shift_start) || ' – ' || public.pawcruz_fmt_time(s.shift_end) end)
      order by a.appointment_date, a.start_time), '[]'::jsonb)
    into v_result
  from public.appointments a
  join public.profiles pv on pv.id = a.veterinarian_id
  left join public.pets p on p.id = a.pet_id
  left join public.profiles o on o.id = a.owner_id
  cross join lateral public.vet_base_shift(a.veterinarian_id, a.appointment_date, null) s
  where a.status::text = 'Confirmed'
    and a.appointment_date between v_today and v_until
    and (a.appointment_date > v_today or a.start_time > v_now)
    and not coalesce(s.override_is_leave, false)
    and (not s.is_working or a.start_time < s.shift_start or a.end_time > s.shift_end)
    and not (a.id = any(v_checked_in));

  return jsonb_build_object('today', v_today, 'appointments', v_result);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Tell the pet owner when only the veterinarian changes
-- ---------------------------------------------------------------------
-- notify_owner_appointment_change() already covers status and date/time
-- changes, but a staff reassignment to another vet at the SAME date/time
-- (the usual fix for a leave conflict) sent the owner nothing.

create or replace function public.notify_owner_appointment_vet_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_pet text;
  v_new_vet text;
  v_old_vet text;
begin
  if new.veterinarian_id is distinct from old.veterinarian_id
     and new.status::text = 'Confirmed'
     and old.status::text = 'Confirmed'
     and new.appointment_date = old.appointment_date
     and new.start_time = old.start_time then
    select pet_name into v_pet from public.pets where id = new.pet_id;
    select full_name into v_new_vet from public.profiles where id = new.veterinarian_id;
    select full_name into v_old_vet from public.profiles where id = old.veterinarian_id;

    insert into public.notifications (
      recipient_id, title, message, notification_type, related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Veterinarian Changed',
      'Your appointment for ' || coalesce(v_pet, 'your pet') || ' on ' ||
        public.pawcruz_fmt_date(new.appointment_date) || ' at ' || public.pawcruz_fmt_time(new.start_time) ||
        ' is now with ' || public.pawcruz_dr_name(v_new_vet) || ' because ' ||
        public.pawcruz_dr_name(v_old_vet) || ' is unavailable. The date and time stay the same.',
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_appointment_vet_change on public.appointments;
create trigger trg_notify_owner_appointment_vet_change
after update of veterinarian_id on public.appointments
for each row execute function public.notify_owner_appointment_vet_change();

-- ---------------------------------------------------------------------
-- 7. Default shifts that never overwrite staff-set hours
-- ---------------------------------------------------------------------
-- REPAIR_veterinarian_schedules.sql seeds a vet's weekly hours from their
-- name, and its profile trigger re-ran that on every profile save (any
-- update listing full_name), silently resetting hours staff had changed.
-- Now it only fills days that have no row yet, using the clinic's hours:
-- Dr. Redmond 9:00 AM–5:00 PM, Dr. Neil 11:00 AM–7:00 PM.

create or replace function public.apply_pawcruz_default_vet_schedule(profile_id uuid, profile_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  default_start time;
  default_end time;
begin
  if lower(coalesce(profile_name, '')) like '%redmond%' then
    default_start := time '09:00';
    default_end := time '17:00';
  elsif lower(coalesce(profile_name, '')) like '%neil%' then
    default_start := time '11:00';
    default_end := time '19:00';
  else
    return;
  end if;

  insert into public.veterinarian_schedules (
    veterinarian_id, day_of_week, start_time, end_time, is_available
  )
  select profile_id, day_number, default_start, default_end, true
  from generate_series(0, 6) as days(day_number)
  on conflict (veterinarian_id, day_of_week) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Access
-- ---------------------------------------------------------------------
-- Reads are open to the app's anon key like the other schedule tables;
-- writes only happen inside the SECURITY DEFINER functions above.

alter table public.veterinarian_leave_requests enable row level security;

drop policy if exists "pawcruz leave requests read" on public.veterinarian_leave_requests;
create policy "pawcruz leave requests read"
on public.veterinarian_leave_requests
for select to anon, authenticated
using (true);

grant select on public.veterinarian_leave_requests to anon, authenticated;
revoke insert, update, delete on public.veterinarian_leave_requests from anon, authenticated;

grant execute on function public.get_vet_leave_impact(uuid, text, date, date, boolean, time, time, uuid, boolean) to anon, authenticated;
grant execute on function public.get_vet_leave_request_impact(uuid) to anon, authenticated;
grant execute on function public.get_vet_leave_board() to anon, authenticated;
grant execute on function public.get_vet_schedule_overview(uuid, integer) to anon, authenticated;
grant execute on function public.submit_vet_leave_request(uuid, text, text, date, date, boolean, time, time, text) to anon, authenticated;
grant execute on function public.review_vet_leave_request(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.cancel_vet_leave_request(uuid, uuid, text) to anon, authenticated;
grant execute on function public.staff_file_vet_leave(uuid, uuid, text, text, date, date, boolean, time, time, text) to anon, authenticated;
grant execute on function public.get_clinic_coverage(integer) to anon, authenticated;
grant execute on function public.get_schedule_conflicts(integer) to anon, authenticated;

revoke execute on function public.apply_vet_leave_overrides(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.restore_vet_leave_overrides(uuid) from public, anon, authenticated;
revoke execute on function public.pawcruz_notify_schedule_managers(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pawcruz_notify_vet_schedule(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pawcruz_log_schedule_activity(uuid, text, text, uuid) from public, anon, authenticated;

-- Live updates for both apps (leave board, My Schedule, booking screens).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'veterinarian_leave_requests'
    ) then
      alter publication supabase_realtime add table public.veterinarian_leave_requests;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'veterinarian_schedule_overrides'
    ) then
      alter publication supabase_realtime add table public.veterinarian_schedule_overrides;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'veterinarian_schedules'
    ) then
      alter publication supabase_realtime add table public.veterinarian_schedules;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
