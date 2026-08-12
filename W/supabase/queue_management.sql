-- PawCruz Queue Management Module
-- Run after appointment_module.sql and schedule repair scripts.
create extension if not exists pgcrypto;

create table if not exists public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  queue_date date not null default current_date,
  queue_number text not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  pet_id uuid not null references public.pets(id),
  owner_id uuid not null references public.profiles(id),
  veterinarian_id uuid not null references public.profiles(id),
  source text not null default 'Appointment' check (source in ('Appointment','Walk-In')),
  status text not null default 'Waiting' check (status in ('Waiting','Serving','Completed')),
  priority_level integer not null default 3 check (priority_level between 1 and 5),
  priority_reason text,
  late_arrival boolean not null default false,
  original_appointment_time time,
  arrived_at timestamptz not null default now(),
  called_at timestamptz,
  consultation_started_at timestamptz,
  consultation_ended_at timestamptz,
  estimated_wait_minutes integer not null default 0,
  manual_order integer,
  reorder_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(queue_date, queue_number)
);

create table if not exists public.queue_status_history (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references public.queue_entries(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_queue_date_vet on public.queue_entries(queue_date, veterinarian_id, status);
create index if not exists idx_queue_owner on public.queue_entries(owner_id, queue_date desc);
create index if not exists idx_queue_order on public.queue_entries(queue_date, veterinarian_id, priority_level, manual_order, arrived_at);

create or replace function public.queue_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists queue_set_updated_at on public.queue_entries;
create trigger queue_set_updated_at before update on public.queue_entries for each row execute function public.queue_updated_at();

create or replace function public.generate_queue_number(p_source text, p_date date default current_date)
returns text language plpgsql security definer set search_path=public as $$
declare prefix text; next_no integer;
begin
  prefix := case when p_source='Walk-In' then 'W' else 'A' end;
  perform pg_advisory_xact_lock(hashtext(prefix || p_date::text));
  select coalesce(max(substring(queue_number from 3)::integer),0)+1 into next_no
  from public.queue_entries where queue_date=p_date and queue_number like prefix || '-%';
  return prefix || '-' || lpad(next_no::text,3,'0');
end $$;

grant execute on function public.generate_queue_number(text,date) to anon, authenticated;

create or replace function public.create_queue_entry(
  p_appointment_id uuid,
  p_pet_id uuid,
  p_owner_id uuid,
  p_veterinarian_id uuid,
  p_source text,
  p_created_by uuid,
  p_priority_level integer default 3,
  p_priority_reason text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare qid uuid; qnum text; appt public.appointments%rowtype; is_late boolean:=false;
begin
  if p_appointment_id is not null then
    select * into appt from public.appointments where id=p_appointment_id;
    if not found then raise exception 'Appointment not found'; end if;
    if exists(select 1 from public.queue_entries where appointment_id=p_appointment_id and queue_date=current_date and status <> 'Completed') then
      raise exception 'Appointment is already checked in';
    end if;
    is_late := now() > ((appt.appointment_date + appt.start_time) at time zone current_setting('TIMEZONE')) + interval '15 minutes';
  end if;
  qnum := public.generate_queue_number(p_source,current_date);
  insert into public.queue_entries(queue_number,appointment_id,pet_id,owner_id,veterinarian_id,source,priority_level,priority_reason,late_arrival,original_appointment_time,created_by)
  values(qnum,p_appointment_id,p_pet_id,p_owner_id,p_veterinarian_id,p_source,coalesce(p_priority_level,3),p_priority_reason,is_late,case when p_appointment_id is null then null else appt.start_time end,p_created_by)
  returning id into qid;
  if p_appointment_id is not null then update public.appointments set status='Confirmed', updated_at=now() where id=p_appointment_id; end if;
  return qid;
end $$;

grant execute on function public.create_queue_entry(uuid,uuid,uuid,uuid,text,uuid,integer,text) to anon,authenticated;

create or replace function public.log_queue_status()
returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then
    insert into public.queue_status_history(queue_entry_id,new_status,changed_by,reason) values(new.id,new.status,new.created_by,'Queue entry created');
  elsif old.status is distinct from new.status then
    insert into public.queue_status_history(queue_entry_id,old_status,new_status,changed_by,reason) values(new.id,old.status,new.status,new.created_by,new.reorder_reason);
  end if;
  return new;
end $$;
drop trigger if exists queue_status_log on public.queue_entries;
create trigger queue_status_log after insert or update of status on public.queue_entries for each row execute function public.log_queue_status();

create or replace function public.sync_queue_appointment_status()
returns trigger language plpgsql as $$
begin
  if new.appointment_id is null then return new; end if;
  if new.status in ('Waiting','Serving') then update public.appointments set status='Confirmed' where id=new.appointment_id;
  elsif new.status='Completed' then update public.appointments set status='Completed' where id=new.appointment_id;
  end if;
  return new;
end $$;
drop trigger if exists queue_sync_appointment on public.queue_entries;
create trigger queue_sync_appointment after insert or update of status on public.queue_entries for each row execute function public.sync_queue_appointment_status();

alter table public.queue_entries enable row level security;
alter table public.queue_status_history enable row level security;
do $$ begin create policy "demo queue access" on public.queue_entries for all to anon,authenticated using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "demo queue history access" on public.queue_status_history for all to anon,authenticated using(true) with check(true); exception when duplicate_object then null; end $$;
grant select,insert,update,delete on public.queue_entries to anon,authenticated;
grant select,insert,update,delete on public.queue_status_history to anon,authenticated;

do $$ begin
  alter publication supabase_realtime add table public.queue_entries;
exception when duplicate_object then null; end $$;
notify pgrst,'reload schema';
