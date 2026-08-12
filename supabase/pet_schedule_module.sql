-- PawCruz Pet Management + Veterinarian Date Schedule Module
-- Run after appointment_module.sql.

alter table public.pets add column if not exists microchip_number text;
alter table public.pets add column if not exists allergies text;
alter table public.pets add column if not exists existing_conditions text;
alter table public.pets add column if not exists photo_url text;
alter table public.pets add column if not exists archived_at timestamptz;
create unique index if not exists uq_pets_microchip on public.pets(lower(microchip_number)) where microchip_number is not null and microchip_number <> '';
create index if not exists idx_pets_name on public.pets(lower(pet_name));
create index if not exists idx_pets_species on public.pets(species);

create table if not exists public.veterinarian_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  veterinarian_id uuid not null references public.profiles(id) on delete cascade,
  schedule_date date not null,
  is_available boolean not null default true,
  start_time time,
  end_time time,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(veterinarian_id, schedule_date),
  check (
    (is_available = false and start_time is null and end_time is null)
    or
    (is_available = true and start_time is not null and end_time is not null and end_time > start_time)
  ),
  check (start_time is null or start_time >= time '09:00'),
  check (end_time is null or end_time <= time '19:00')
);

create index if not exists idx_vet_override_date on public.veterinarian_schedule_overrides(veterinarian_id, schedule_date);

drop trigger if exists veterinarian_overrides_set_updated_at on public.veterinarian_schedule_overrides;
create trigger veterinarian_overrides_set_updated_at before update on public.veterinarian_schedule_overrides
for each row execute function public.set_updated_at();

alter table public.veterinarian_schedule_overrides enable row level security;
do $$ begin
  create policy "demo veterinarian override access" on public.veterinarian_schedule_overrides
  for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Public demo bucket for pet photos. Do not use this permissive setup for real patient data.
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', true)
on conflict (id) do update set public = true;

do $$ begin
  create policy "demo pet photo read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'pet-photos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "demo pet photo upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'pet-photos');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "demo pet photo update" on storage.objects for update to anon, authenticated
  using (bucket_id = 'pet-photos') with check (bucket_id = 'pet-photos');
exception when duplicate_object then null; end $$;

-- Date-specific schedules override the normal weekly schedule during appointment validation.
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
  select owner_id into pet_owner from public.pets where id = new.pet_id and is_archived = false;
  if pet_owner is null or pet_owner <> new.owner_id then
    raise exception 'The selected pet does not belong to the selected owner';
  end if;

  select * into override_row from public.veterinarian_schedule_overrides
  where veterinarian_id = new.veterinarian_id and schedule_date = new.appointment_date;

  if found then
    available := override_row.is_available;
    actual_start := override_row.start_time;
    actual_end := override_row.end_time;
  else
    select * into weekly_row from public.veterinarian_schedules
    where veterinarian_id = new.veterinarian_id
      and day_of_week = extract(dow from new.appointment_date)::integer;
    if not found then raise exception 'Veterinarian has no schedule on the selected date'; end if;
    available := weekly_row.is_available;
    actual_start := weekly_row.start_time;
    actual_end := weekly_row.end_time;
  end if;

  if not available then raise exception 'Veterinarian is unavailable on the selected date'; end if;
  if new.start_time < actual_start or new.end_time > actual_end then
    raise exception 'Selected time is outside the veterinarian schedule';
  end if;
  return new;
end; $$;
