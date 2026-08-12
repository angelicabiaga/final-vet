-- PawCruz Appointment Module (custom localStorage authentication demo)
-- Run after phase1_setup.sql and custom_auth_patch.sql.

create extension if not exists pgcrypto;

do $$ begin
  create type public.appointment_status as enum (
    'Confirmed','Completed','Cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_source as enum ('Online','Walk-In');
exception when duplicate_object then null; end $$;

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pet_name text not null,
  species text not null,
  breed text,
  sex text check (sex is null or sex in ('Male','Female','Unknown')),
  date_of_birth date,
  weight numeric(8,2),
  color text,
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.veterinarian_schedules (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  unique(veterinarian_id, day_of_week),
  check (end_time > start_time)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id),
  owner_id uuid not null references public.profiles(id),
  veterinarian_id uuid not null references public.profiles(id),
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  appointment_source public.appointment_source not null default 'Online',
  consultation_type text not null default 'General Consultation'
    check (consultation_type = 'General Consultation'),
  visit_reason text,
  notes text,
  status public.appointment_status not null default 'Confirmed',
  created_by uuid references public.profiles(id),
  rescheduled_from uuid references public.appointments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (start_time >= time '09:00' and end_time <= time '19:00')
);

create table if not exists public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  old_status public.appointment_status,
  new_status public.appointment_status not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pets_owner on public.pets(owner_id) where is_archived = false;
create index if not exists idx_appointments_owner_date on public.appointments(owner_id, appointment_date desc);
create index if not exists idx_appointments_vet_date on public.appointments(veterinarian_id, appointment_date, start_time);
create index if not exists idx_appointments_status on public.appointments(status);

-- Prevent two active appointments from using the same veterinarian/time.
create unique index if not exists uq_active_vet_slot
on public.appointments(veterinarian_id, appointment_date, start_time)
where status = 'Confirmed';

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists pets_set_updated_at on public.pets;
create trigger pets_set_updated_at before update on public.pets
for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

create or replace function public.validate_appointment_slot()
returns trigger language plpgsql as $$
declare
  schedule_row public.veterinarian_schedules%rowtype;
  pet_owner uuid;
begin
  if new.appointment_date < current_date then
    raise exception 'Appointment date cannot be in the past';
  end if;

  if new.end_time <> new.start_time + interval '10 minutes' then
    raise exception 'Appointments must use 10-minute slots';
  end if;

  select owner_id into pet_owner from public.pets where id = new.pet_id and is_archived = false;
  if pet_owner is null or pet_owner <> new.owner_id then
    raise exception 'The selected pet does not belong to the selected owner';
  end if;

  select * into schedule_row
  from public.veterinarian_schedules
  where veterinarian_id = new.veterinarian_id
    and day_of_week = extract(dow from new.appointment_date)::integer
    and is_available = true;

  if not found then raise exception 'Veterinarian is unavailable on the selected date'; end if;
  if new.start_time < schedule_row.start_time or new.end_time > schedule_row.end_time then
    raise exception 'Selected time is outside the veterinarian schedule';
  end if;

  return new;
end; $$;

drop trigger if exists appointments_validate_slot on public.appointments;
create trigger appointments_validate_slot before insert or update of pet_id,owner_id,veterinarian_id,appointment_date,start_time,end_time
on public.appointments for each row execute function public.validate_appointment_slot();

create or replace function public.log_appointment_status_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_status_history(appointment_id,new_status,changed_by,reason)
    values(new.id,new.status,new.created_by,'Appointment created');
  elsif old.status is distinct from new.status then
    insert into public.appointment_status_history(appointment_id,old_status,new_status,changed_by)
    values(new.id,old.status,new.status,new.created_by);
  end if;
  return new;
end; $$;

drop trigger if exists appointments_status_history on public.appointments;
create trigger appointments_status_history after insert or update of status on public.appointments
for each row execute function public.log_appointment_status_change();

-- Demo/custom-auth policies. These are permissive because localStorage sessions are not visible to PostgreSQL.
alter table public.pets enable row level security;
alter table public.veterinarian_schedules enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_status_history enable row level security;

do $$ begin
  create policy "demo pets access" on public.pets for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "demo schedules read" on public.veterinarian_schedules for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "demo appointments access" on public.appointments for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "demo status history access" on public.appointment_status_history for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Create veterinarian accounts first, then run these examples with their actual emails:
-- update public.profiles set full_name='Dr. Redmond Lopez', role='veterinarian', account_status='active' where email='redmond@pawcruz.com';
-- update public.profiles set full_name='Dr. Neil Norman A. Cruz', role='veterinarian', account_status='active' where email='neil@pawcruz.com';

insert into public.veterinarian_schedules(veterinarian_id,day_of_week,start_time,end_time)
select p.id, d.day_no, time '09:00', time '17:00'
from public.profiles p cross join generate_series(0,6) as d(day_no)
where p.role='veterinarian' and lower(p.full_name) like '%redmond%'
on conflict(veterinarian_id,day_of_week) do update set start_time=excluded.start_time,end_time=excluded.end_time,is_available=true;

insert into public.veterinarian_schedules(veterinarian_id,day_of_week,start_time,end_time)
select p.id, d.day_no, time '11:00', time '19:00'
from public.profiles p cross join generate_series(0,6) as d(day_no)
where p.role='veterinarian' and (lower(p.full_name) like '%neil%' or lower(p.full_name) like '%cruz%')
on conflict(veterinarian_id,day_of_week) do update set start_time=excluded.start_time,end_time=excluded.end_time,is_available=true;
