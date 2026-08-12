-- PawCruz repair: medical records + missing veterinarians
-- Safe to run multiple times after phase1_setup.sql and custom_auth_patch.sql.

create extension if not exists pgcrypto;

-- Required by the custom-login version of PawCruz.
alter table public.profiles alter column auth_user_id drop not null;
alter table public.profiles add column if not exists password text;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Ensure both default veterinarians exist and are active.
do $$
declare
  doctor_id uuid;
begin
  select id into doctor_id
  from public.profiles
  where lower(email) = 'redmond@pawcruz.com'
     or lower(full_name) like '%redmond%'
  order by created_at
  limit 1;

  if doctor_id is null then
    insert into public.profiles (
      auth_user_id, full_name, username, email, password, role, account_status
    ) values (
      null, 'Dr. Redmond Lopez', 'dr.redmond', 'redmond@pawcruz.com',
      'redmond123', 'veterinarian', 'active'
    ) returning id into doctor_id;
  else
    update public.profiles
    set full_name = 'Dr. Redmond Lopez',
        role = 'veterinarian',
        account_status = 'active',
        username = case
          when username is null or trim(username) = '' then 'dr.redmond'
          else username
        end,
        password = coalesce(password, 'redmond123')
    where id = doctor_id;
  end if;
end $$;

do $$
declare
  doctor_id uuid;
begin
  select id into doctor_id
  from public.profiles
  where lower(email) = 'neil@pawcruz.com'
     or lower(full_name) like '%neil%cruz%'
  order by created_at
  limit 1;

  if doctor_id is null then
    insert into public.profiles (
      auth_user_id, full_name, username, email, password, role, account_status
    ) values (
      null, 'Dr. Neil Norman A. Cruz', 'dr.neil', 'neil@pawcruz.com',
      'neil123', 'veterinarian', 'active'
    ) returning id into doctor_id;
  else
    update public.profiles
    set full_name = 'Dr. Neil Norman A. Cruz',
        role = 'veterinarian',
        account_status = 'active',
        username = case
          when username is null or trim(username) = '' then 'dr.neil'
          else username
        end,
        password = coalesce(password, 'neil123')
    where id = doctor_id;
  end if;
end $$;

-- Weekly schedule table, recreated when missing.
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
  check (end_time > start_time)
);

insert into public.veterinarian_schedules
  (veterinarian_id, day_of_week, start_time, end_time, is_available)
select p.id, d.day_number, time '09:00', time '17:00', true
from public.profiles p
cross join generate_series(0, 6) as d(day_number)
where lower(p.full_name) like '%redmond%'
  and p.role = 'veterinarian'
on conflict (veterinarian_id, day_of_week)
do update set start_time = excluded.start_time,
              end_time = excluded.end_time,
              is_available = true,
              updated_at = now();

insert into public.veterinarian_schedules
  (veterinarian_id, day_of_week, start_time, end_time, is_available)
select p.id, d.day_number, time '11:00', time '19:00', true
from public.profiles p
cross join generate_series(0, 6) as d(day_number)
where lower(p.full_name) like '%neil%cruz%'
  and p.role = 'veterinarian'
on conflict (veterinarian_id, day_of_week)
do update set start_time = excluded.start_time,
              end_time = excluded.end_time,
              is_available = true,
              updated_at = now();

-- Recreate/complete the medical_records table.
create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  veterinarian_id uuid not null references public.profiles(id) on delete restrict,
  appointment_id uuid,
  queue_entry_id uuid,
  consultation_date date not null default current_date,
  chief_complaint text,
  symptoms text,
  vital_signs text,
  weight numeric(8,2),
  temperature numeric(5,2),
  diagnosis text,
  treatment text,
  treatment_plan text,
  medication text,
  dosage text,
  frequency text,
  duration text,
  laboratory_request text,
  laboratory_result text,
  vaccination text,
  follow_up_date date,
  veterinarian_notes text,
  attachment_url text,
  record_status text not null default 'Draft',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.medical_records add column if not exists pet_id uuid;
alter table public.medical_records add column if not exists owner_id uuid;
alter table public.medical_records add column if not exists veterinarian_id uuid;
alter table public.medical_records add column if not exists appointment_id uuid;
alter table public.medical_records add column if not exists queue_entry_id uuid;
alter table public.medical_records add column if not exists consultation_date date default current_date;
alter table public.medical_records add column if not exists chief_complaint text;
alter table public.medical_records add column if not exists symptoms text;
alter table public.medical_records add column if not exists vital_signs text;
alter table public.medical_records add column if not exists weight numeric(8,2);
alter table public.medical_records add column if not exists temperature numeric(5,2);
alter table public.medical_records add column if not exists diagnosis text;
alter table public.medical_records add column if not exists treatment text;
alter table public.medical_records add column if not exists treatment_plan text;
alter table public.medical_records add column if not exists medication text;
alter table public.medical_records add column if not exists dosage text;
alter table public.medical_records add column if not exists frequency text;
alter table public.medical_records add column if not exists duration text;
alter table public.medical_records add column if not exists laboratory_request text;
alter table public.medical_records add column if not exists laboratory_result text;
alter table public.medical_records add column if not exists vaccination text;
alter table public.medical_records add column if not exists follow_up_date date;
alter table public.medical_records add column if not exists veterinarian_notes text;
alter table public.medical_records add column if not exists attachment_url text;
alter table public.medical_records add column if not exists record_status text default 'Draft';
alter table public.medical_records add column if not exists created_by uuid;
alter table public.medical_records add column if not exists updated_by uuid;
alter table public.medical_records add column if not exists created_at timestamptz default now();
alter table public.medical_records add column if not exists updated_at timestamptz default now();

update public.medical_records set record_status = 'Draft'
where record_status is null or record_status not in ('Draft', 'Finalized');

alter table public.medical_records drop constraint if exists medical_records_record_status_check;
alter table public.medical_records add constraint medical_records_record_status_check
check (record_status in ('Draft', 'Finalized'));

create index if not exists idx_medical_records_pet
on public.medical_records(pet_id, consultation_date desc);
create index if not exists idx_medical_records_owner
on public.medical_records(owner_id);
create index if not exists idx_medical_records_veterinarian
on public.medical_records(veterinarian_id);
create index if not exists idx_medical_records_status
on public.medical_records(record_status);

-- Add optional appointment FK only when appointments exists and the FK is absent.
do $$
begin
  if to_regclass('public.appointments') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'medical_records_appointment_id_fkey'
         and conrelid = 'public.medical_records'::regclass
     ) then
    alter table public.medical_records
      add constraint medical_records_appointment_id_fkey
      foreign key (appointment_id) references public.appointments(id) on delete set null;
  end if;
exception when others then
  raise notice 'Appointment foreign key was skipped: %', sqlerrm;
end $$;

drop trigger if exists set_medical_records_updated_at on public.medical_records;
create trigger set_medical_records_updated_at
before update on public.medical_records
for each row execute function public.set_updated_at();

alter table public.medical_records enable row level security;
alter table public.veterinarian_schedules enable row level security;

drop policy if exists "custom app medical read" on public.medical_records;
create policy "custom app medical read"
on public.medical_records for select to anon, authenticated using (true);

drop policy if exists "custom app medical insert" on public.medical_records;
create policy "custom app medical insert"
on public.medical_records for insert to anon, authenticated with check (true);

drop policy if exists "custom app medical update" on public.medical_records;
create policy "custom app medical update"
on public.medical_records for update to anon, authenticated using (true) with check (true);

drop policy if exists "custom app schedule read" on public.veterinarian_schedules;
create policy "custom app schedule read"
on public.veterinarian_schedules for select to anon, authenticated using (true);

drop policy if exists "custom app schedule write" on public.veterinarian_schedules;
create policy "custom app schedule write"
on public.veterinarian_schedules for all to anon, authenticated using (true) with check (true);

-- Ensure custom-login frontend can read the veterinarian profiles.
alter table public.profiles enable row level security;
drop policy if exists "Custom auth can read profiles" on public.profiles;
create policy "Custom auth can read profiles"
on public.profiles for select to anon, authenticated using (true);

-- Attachment bucket and policies.
insert into storage.buckets (id, name, public)
values ('medical-attachments', 'medical-attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "medical attachment read" on storage.objects;
create policy "medical attachment read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'medical-attachments');

drop policy if exists "medical attachment upload" on storage.objects;
create policy "medical attachment upload"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'medical-attachments');

drop policy if exists "medical attachment update" on storage.objects;
create policy "medical attachment update"
on storage.objects for update to anon, authenticated
using (bucket_id = 'medical-attachments')
with check (bucket_id = 'medical-attachments');

-- Refresh PostgREST schema cache.
notify pgrst, 'reload schema';

-- Verification result.
select id, full_name, username, email, role, account_status
from public.profiles
where role = 'veterinarian'
order by full_name;
