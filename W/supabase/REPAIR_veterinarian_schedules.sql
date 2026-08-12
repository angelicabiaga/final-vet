-- PawCruz veterinarian schedule repair and default schedule setup
-- Safe to run multiple times.
-- Run after phase1_setup.sql, custom_auth_patch.sql, appointment_module.sql,
-- and pet_schedule_module.sql (if that file still exists).

create extension if not exists pgcrypto;

-- Recreate the regular weekly schedule table if it was accidentally deleted.
create table if not exists public.veterinarian_schedules (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (veterinarian_id, day_of_week),
  check (end_time > start_time),
  check (start_time >= time '09:00'),
  check (end_time <= time '19:00')
);

alter table public.veterinarian_schedules
  add column if not exists updated_at timestamptz not null default now();

-- Recreate the date-specific override table if it was accidentally deleted.
create table if not exists public.veterinarian_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  schedule_date date not null,
  is_available boolean not null default true,
  start_time time,
  end_time time,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (veterinarian_id, schedule_date),
  check (
    (is_available = false and start_time is null and end_time is null)
    or
    (is_available = true and start_time is not null and end_time is not null and end_time > start_time)
  ),
  check (start_time is null or start_time >= time '09:00'),
  check (end_time is null or end_time <= time '19:00')
);

create index if not exists idx_vet_schedule_day
  on public.veterinarian_schedules(veterinarian_id, day_of_week);
create index if not exists idx_vet_override_date
  on public.veterinarian_schedule_overrides(veterinarian_id, schedule_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists veterinarian_schedules_set_updated_at on public.veterinarian_schedules;
create trigger veterinarian_schedules_set_updated_at
before update on public.veterinarian_schedules
for each row execute function public.set_updated_at();

drop trigger if exists veterinarian_overrides_set_updated_at on public.veterinarian_schedule_overrides;
create trigger veterinarian_overrides_set_updated_at
before update on public.veterinarian_schedule_overrides
for each row execute function public.set_updated_at();

-- Demo policies used by the project's custom localStorage authentication.
alter table public.veterinarian_schedules enable row level security;
alter table public.veterinarian_schedule_overrides enable row level security;

drop policy if exists "demo schedules read" on public.veterinarian_schedules;
drop policy if exists "demo schedules access" on public.veterinarian_schedules;
create policy "demo schedules access"
on public.veterinarian_schedules
for all to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo veterinarian override access" on public.veterinarian_schedule_overrides;
create policy "demo veterinarian override access"
on public.veterinarian_schedule_overrides
for all to anon, authenticated
using (true)
with check (true);

-- Apply the clinic's default schedule to a veterinarian profile by name.
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
  on conflict (veterinarian_id, day_of_week)
  do update set
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    is_available = true,
    updated_at = now();
end;
$$;

-- Seed existing veterinarian profiles.
do $$
declare
  vet_record record;
begin
  for vet_record in
    select id, full_name
    from public.profiles
    where role = 'veterinarian'
      and account_status = 'active'
  loop
    perform public.apply_pawcruz_default_vet_schedule(vet_record.id, vet_record.full_name);
  end loop;
end;
$$;

-- Automatically seed defaults when either veterinarian is created or renamed.
create or replace function public.seed_default_vet_schedule_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'veterinarian' and new.account_status = 'active' then
    perform public.apply_pawcruz_default_vet_schedule(new.id, new.full_name);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_seed_default_vet_schedule on public.profiles;
create trigger profiles_seed_default_vet_schedule
after insert or update of full_name, role, account_status on public.profiles
for each row execute function public.seed_default_vet_schedule_on_profile_change();

-- Appointment validation uses a date override first, then the weekly default.
create or replace function public.validate_appointment_slot()
returns trigger language plpgsql as $$
declare
  weekly_row public.veterinarian_schedules%rowtype;
  override_row public.veterinarian_schedule_overrides%rowtype;
  actual_start time;
  actual_end time;
  available boolean;
  pet_owner uuid;
begin
  if new.appointment_date < current_date then
    raise exception 'Appointment date cannot be in the past';
  end if;

  if new.end_time <> new.start_time + interval '10 minutes' then
    raise exception 'Appointments must use 10-minute slots';
  end if;

  select owner_id into pet_owner
  from public.pets
  where id = new.pet_id and is_archived = false;

  if pet_owner is null or pet_owner <> new.owner_id then
    raise exception 'The selected pet does not belong to the selected owner';
  end if;

  select * into override_row
  from public.veterinarian_schedule_overrides
  where veterinarian_id = new.veterinarian_id
    and schedule_date = new.appointment_date;

  if found then
    available := override_row.is_available;
    actual_start := override_row.start_time;
    actual_end := override_row.end_time;
  else
    select * into weekly_row
    from public.veterinarian_schedules
    where veterinarian_id = new.veterinarian_id
      and day_of_week = extract(dow from new.appointment_date)::integer;

    if not found then
      raise exception 'Veterinarian has no schedule on the selected date';
    end if;

    available := weekly_row.is_available;
    actual_start := weekly_row.start_time;
    actual_end := weekly_row.end_time;
  end if;

  if not available then
    raise exception 'Veterinarian is unavailable on the selected date';
  end if;

  if new.start_time < actual_start or new.end_time > actual_end then
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

-- Ask Supabase PostgREST to refresh its table/relationship cache.
notify pgrst, 'reload schema';
