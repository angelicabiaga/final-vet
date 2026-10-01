-- =====================================================================
-- PawCruz: vet hours -- Dr. Redmond 9:00 AM–5:00 PM, Dr. Neil 11:00 AM–7:00 PM
-- =====================================================================
-- Puts both vets' weekly roster back to the clinic's real hours, every
-- day of the week (both on duty 11:00 AM – 5:00 PM):
--   Dr. Redmond Lopez         9:00 AM – 5:00 PM
--   Dr. Neil Norman A. Cruz  11:00 AM – 7:00 PM
-- This undoes VET_SHIFTS_NEIL_MORNING_REDMOND_AFTERNOON.sql (9–2 / 2–7),
-- which was based on the wrong hours, and fixes the default hours used
-- for new vet accounts.
--
-- Run once in the Supabase SQL Editor. Running it again resets both vets
-- to these hours, so make later changes on the Veterinarian Schedules page.
-- Bookings are never moved; the last query lists any upcoming booking that
-- falls outside its vet's hours (empty = none).
-- =====================================================================

insert into public.veterinarian_schedules (veterinarian_id, day_of_week, start_time, end_time, is_available)
select
  p.id,
  d.day_number,
  case when lower(p.full_name) like '%redmond%' then time '09:00' else time '11:00' end,
  case when lower(p.full_name) like '%redmond%' then time '17:00' else time '19:00' end,
  true
from public.profiles p
cross join generate_series(0, 6) as d(day_number)
where p.role::text = 'veterinarian'
  and (lower(p.full_name) like '%redmond%' or lower(p.full_name) like '%neil%')
on conflict (veterinarian_id, day_of_week) do update set
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  is_available = true;

-- Default hours for a vet account by name. Only fills days that have no
-- row yet, so it never overwrites hours staff have set (it also runs from
-- the profile trigger on every profile save).
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

-- The roster, for a quick visual check.
select p.full_name, s.day_of_week, s.start_time, s.end_time, s.is_available
from public.veterinarian_schedules s
join public.profiles p on p.id = s.veterinarian_id
where p.role::text = 'veterinarian'
order by p.full_name, s.day_of_week;

-- Upcoming bookings that fall outside their vet's hours (empty = none).
select *
from jsonb_to_recordset(public.get_schedule_conflicts(60)->'appointments') as x(
  appointment_date date, start_time time, veterinarian_name text,
  pet_name text, owner_name text, problem text
);
