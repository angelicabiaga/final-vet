-- PawCruz final repair for Medical Records API and default veterinarians.
-- Safe to run more than once.

create extension if not exists pgcrypto;

-- Ensure veterinarian schedule columns exist before any seed operation.
create table if not exists public.veterinarian_schedules (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.veterinarian_schedules
  add column if not exists is_available boolean not null default true;
alter table public.veterinarian_schedules
  add column if not exists created_at timestamptz not null default now();
alter table public.veterinarian_schedules
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_veterinarian_schedule_day
  on public.veterinarian_schedules(veterinarian_id, day_of_week);

-- Ensure both veterinarian profiles exist and are active.
do $$
declare
  redmond_id uuid;
  neil_id uuid;
begin
  select id into redmond_id
  from public.profiles
  where lower(coalesce(full_name, '')) like '%redmond%'
     or lower(coalesce(username, '')) = 'dr.redmond'
     or lower(coalesce(email, '')) = 'redmond@pawcruz.com'
  order by created_at nulls last
  limit 1;

  if redmond_id is null then
    insert into public.profiles (
      auth_user_id, full_name, username, email, password, role, account_status
    ) values (
      null, 'Dr. Redmond Lopez', 'dr.redmond', 'redmond@pawcruz.com',
      'redmond123', 'veterinarian', 'active'
    ) returning id into redmond_id;
  else
    update public.profiles
    set full_name = 'Dr. Redmond Lopez',
        role = 'veterinarian',
        account_status = 'active',
        updated_at = now()
    where id = redmond_id;
  end if;

  select id into neil_id
  from public.profiles
  where lower(coalesce(full_name, '')) like '%neil%'
     or lower(coalesce(username, '')) = 'dr.neil'
     or lower(coalesce(email, '')) = 'neil@pawcruz.com'
  order by created_at nulls last
  limit 1;

  if neil_id is null then
    insert into public.profiles (
      auth_user_id, full_name, username, email, password, role, account_status
    ) values (
      null, 'Dr. Neil Norman A. Cruz', 'dr.neil', 'neil@pawcruz.com',
      'neil123', 'veterinarian', 'active'
    ) returning id into neil_id;
  else
    update public.profiles
    set full_name = 'Dr. Neil Norman A. Cruz',
        role = 'veterinarian',
        account_status = 'active',
        updated_at = now()
    where id = neil_id;
  end if;

  insert into public.veterinarian_schedules
    (veterinarian_id, day_of_week, start_time, end_time, is_available)
  select redmond_id, d, time '09:00', time '17:00', true
  from generate_series(0, 6) as d
  on conflict (veterinarian_id, day_of_week)
  do update set start_time = excluded.start_time,
                end_time = excluded.end_time,
                is_available = true,
                updated_at = now();

  insert into public.veterinarian_schedules
    (veterinarian_id, day_of_week, start_time, end_time, is_available)
  select neil_id, d, time '11:00', time '19:00', true
  from generate_series(0, 6) as d
  on conflict (veterinarian_id, day_of_week)
  do update set start_time = excluded.start_time,
                end_time = excluded.end_time,
                is_available = true,
                updated_at = now();
end $$;

-- Create or complete medical_records.
create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid references public.pets(id) on delete restrict,
  owner_id uuid references public.profiles(id) on delete restrict,
  veterinarian_id uuid references public.profiles(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
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
  parasite_treatments jsonb not null default '[]'::jsonb,
  heartworm_tests jsonb not null default '[]'::jsonb,
  vaccination_records jsonb not null default '[]'::jsonb,
  record_template text not null default 'health-record',
  template_data jsonb not null default '{}'::jsonb,
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
alter table public.medical_records add column if not exists parasite_treatments jsonb not null default '[]'::jsonb;
alter table public.medical_records add column if not exists heartworm_tests jsonb not null default '[]'::jsonb;
alter table public.medical_records add column if not exists vaccination_records jsonb not null default '[]'::jsonb;
alter table public.medical_records add column if not exists record_template text not null default 'health-record';
alter table public.medical_records add column if not exists template_data jsonb not null default '{}'::jsonb;
alter table public.medical_records add column if not exists follow_up_date date;
alter table public.medical_records add column if not exists veterinarian_notes text;
alter table public.medical_records add column if not exists attachment_url text;
alter table public.medical_records add column if not exists record_status text default 'Draft';
alter table public.medical_records add column if not exists created_by uuid;
alter table public.medical_records add column if not exists updated_by uuid;
alter table public.medical_records add column if not exists created_at timestamptz default now();
alter table public.medical_records add column if not exists updated_at timestamptz default now();

update public.medical_records
set record_status = 'Draft'
where record_status is null or record_status not in ('Draft', 'Finalized');

alter table public.medical_records
  alter column record_status set default 'Draft';
alter table public.medical_records
  alter column record_status set not null;

alter table public.medical_records
  drop constraint if exists medical_records_record_status_check;
alter table public.medical_records
  add constraint medical_records_record_status_check
  check (record_status in ('Draft', 'Finalized'));

create index if not exists idx_medical_records_pet_date
  on public.medical_records(pet_id, consultation_date desc);
create index if not exists idx_medical_records_owner
  on public.medical_records(owner_id);
create index if not exists idx_medical_records_veterinarian
  on public.medical_records(veterinarian_id);
create index if not exists idx_medical_records_status
  on public.medical_records(record_status);

-- API permissions for the project's custom localStorage authentication.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.medical_records to anon, authenticated, service_role;
grant select, insert, update, delete on public.veterinarian_schedules to anon, authenticated, service_role;
grant select on public.profiles, public.pets, public.appointments to anon, authenticated, service_role;

alter table public.medical_records enable row level security;
alter table public.veterinarian_schedules enable row level security;

drop policy if exists "pawcruz medical records read" on public.medical_records;
create policy "pawcruz medical records read"
  on public.medical_records for select to anon, authenticated using (true);
drop policy if exists "pawcruz medical records insert" on public.medical_records;
create policy "pawcruz medical records insert"
  on public.medical_records for insert to anon, authenticated with check (true);
drop policy if exists "pawcruz medical records update" on public.medical_records;
create policy "pawcruz medical records update"
  on public.medical_records for update to anon, authenticated using (true) with check (true);

drop policy if exists "pawcruz veterinarian schedules read" on public.veterinarian_schedules;
create policy "pawcruz veterinarian schedules read"
  on public.veterinarian_schedules for select to anon, authenticated using (true);
drop policy if exists "pawcruz veterinarian schedules write" on public.veterinarian_schedules;
create policy "pawcruz veterinarian schedules write"
  on public.veterinarian_schedules for all to anon, authenticated using (true) with check (true);

-- RPC fallback. This is used if PostgREST temporarily fails to resolve the table route.
create or replace function public.pawcruz_get_medical_records()
returns setof public.medical_records
language sql
security definer
set search_path = public
as $$
  select *
  from public.medical_records
  order by consultation_date desc, created_at desc;
$$;

create or replace function public.pawcruz_save_medical_record(payload jsonb)
returns public.medical_records
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.medical_records;
  target_id uuid;
begin
  target_id := nullif(payload->>'id', '')::uuid;

  if target_id is null then
    insert into public.medical_records (
      pet_id, owner_id, veterinarian_id, appointment_id,
      consultation_date, chief_complaint, symptoms, vital_signs,
      weight, temperature, diagnosis, treatment, treatment_plan,
      medication, dosage, frequency, duration,
      laboratory_request, laboratory_result, vaccination,
      parasite_treatments, heartworm_tests, vaccination_records,
      record_template, template_data,
      follow_up_date, veterinarian_notes, attachment_url,
      record_status, created_by, updated_by
    ) values (
      nullif(payload->>'pet_id', '')::uuid,
      nullif(payload->>'owner_id', '')::uuid,
      nullif(payload->>'veterinarian_id', '')::uuid,
      nullif(payload->>'appointment_id', '')::uuid,
      coalesce(nullif(payload->>'consultation_date', '')::date, current_date),
      nullif(payload->>'chief_complaint', ''),
      nullif(payload->>'symptoms', ''),
      nullif(payload->>'vital_signs', ''),
      nullif(payload->>'weight', '')::numeric,
      nullif(payload->>'temperature', '')::numeric,
      nullif(payload->>'diagnosis', ''),
      nullif(payload->>'treatment', ''),
      nullif(payload->>'treatment_plan', ''),
      nullif(payload->>'medication', ''),
      nullif(payload->>'dosage', ''),
      nullif(payload->>'frequency', ''),
      nullif(payload->>'duration', ''),
      nullif(payload->>'laboratory_request', ''),
      nullif(payload->>'laboratory_result', ''),
      nullif(payload->>'vaccination', ''),
      coalesce(payload->'parasite_treatments', '[]'::jsonb),
      coalesce(payload->'heartworm_tests', '[]'::jsonb),
      coalesce(payload->'vaccination_records', '[]'::jsonb),
      coalesce(nullif(payload->>'record_template', ''), 'health-record'),
      coalesce(payload->'template_data', '{}'::jsonb),
      nullif(payload->>'follow_up_date', '')::date,
      nullif(payload->>'veterinarian_notes', ''),
      nullif(payload->>'attachment_url', ''),
      coalesce(nullif(payload->>'record_status', ''), 'Draft'),
      nullif(payload->>'created_by', '')::uuid,
      nullif(payload->>'updated_by', '')::uuid
    ) returning * into saved;
  else
    update public.medical_records
    set pet_id = nullif(payload->>'pet_id', '')::uuid,
        owner_id = nullif(payload->>'owner_id', '')::uuid,
        veterinarian_id = nullif(payload->>'veterinarian_id', '')::uuid,
        appointment_id = nullif(payload->>'appointment_id', '')::uuid,
        consultation_date = coalesce(nullif(payload->>'consultation_date', '')::date, consultation_date),
        chief_complaint = nullif(payload->>'chief_complaint', ''),
        symptoms = nullif(payload->>'symptoms', ''),
        vital_signs = nullif(payload->>'vital_signs', ''),
        weight = nullif(payload->>'weight', '')::numeric,
        temperature = nullif(payload->>'temperature', '')::numeric,
        diagnosis = nullif(payload->>'diagnosis', ''),
        treatment = nullif(payload->>'treatment', ''),
        treatment_plan = nullif(payload->>'treatment_plan', ''),
        medication = nullif(payload->>'medication', ''),
        dosage = nullif(payload->>'dosage', ''),
        frequency = nullif(payload->>'frequency', ''),
        duration = nullif(payload->>'duration', ''),
        laboratory_request = nullif(payload->>'laboratory_request', ''),
        laboratory_result = nullif(payload->>'laboratory_result', ''),
        vaccination = nullif(payload->>'vaccination', ''),
        parasite_treatments = coalesce(payload->'parasite_treatments', parasite_treatments),
        heartworm_tests = coalesce(payload->'heartworm_tests', heartworm_tests),
        vaccination_records = coalesce(payload->'vaccination_records', vaccination_records),
        record_template = coalesce(nullif(payload->>'record_template', ''), record_template),
        template_data = coalesce(payload->'template_data', template_data),
        follow_up_date = nullif(payload->>'follow_up_date', '')::date,
        veterinarian_notes = nullif(payload->>'veterinarian_notes', ''),
        attachment_url = nullif(payload->>'attachment_url', ''),
        record_status = coalesce(nullif(payload->>'record_status', ''), record_status),
        updated_by = nullif(payload->>'updated_by', '')::uuid,
        updated_at = now()
    where id = target_id
    returning * into saved;
  end if;

  return saved;
end;
$$;

grant execute on function public.pawcruz_get_medical_records() to anon, authenticated, service_role;
grant execute on function public.pawcruz_save_medical_record(jsonb) to anon, authenticated, service_role;

-- Storage bucket used by the frontend.
insert into storage.buckets (id, name, public)
values ('medical-attachments', 'medical-attachments', true)
on conflict (id) do update set public = true;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
