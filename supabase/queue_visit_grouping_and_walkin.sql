-- PawCruz: visit grouping (multi-pet = one queue ticket) + priority-safe ordering support
-- + real-time (no-slot) walk-ins.
-- Run this ONCE in the Supabase SQL Editor, after queue_management.sql,
-- status_simplification_upgrade.sql, and QUEUE_APPOINTMENT_TWO_WAY_STATUS_SYNC_FIX.sql.
-- Purely additive: no existing column, table, or row is removed or renamed.

begin;

-- ============================================================================
-- 1. Let multiple appointment rows (one per pet) be tagged as one visit.
-- ============================================================================
alter table public.appointments add column if not exists visit_group_id uuid;
create index if not exists idx_appointments_visit_group
  on public.appointments(visit_group_id) where visit_group_id is not null;

-- ============================================================================
-- 2. Queue-side multi-pet representation. Every queue ticket (grouped-online
--    check-in OR a true walk-in with no appointment row at all) gets one row
--    here per pet it covers. This is the single source of truth for "which
--    pets does this ticket represent" going forward.
-- ============================================================================
create table if not exists public.queue_entry_pets (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references public.queue_entries(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  pet_id uuid not null references public.pets(id),
  created_at timestamptz not null default now(),
  unique(queue_entry_id, pet_id)
);

create index if not exists idx_queue_entry_pets_entry on public.queue_entry_pets(queue_entry_id);
create index if not exists idx_queue_entry_pets_pet on public.queue_entry_pets(pet_id);

alter table public.queue_entry_pets enable row level security;
do $$ begin
  create policy "demo queue entry pets access" on public.queue_entry_pets
  for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
grant select, insert, update, delete on public.queue_entry_pets to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.queue_entry_pets;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 3. Harden the existing single-pet check-in RPC so it also writes into
--    queue_entry_pets (keeps every ticket, old or new, uniformly readable
--    through the same table) and also checks queue_entry_pets for an
--    already-checked-in appointment. Signature is unchanged, so any existing
--    caller (including the mobile app) keeps working exactly as before.
-- ============================================================================
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
    if exists(
      select 1 from public.queue_entries qe
      where qe.queue_date=current_date and qe.status <> 'Completed'
        and (
          qe.appointment_id = p_appointment_id
          or exists(
            select 1 from public.queue_entry_pets qep
            where qep.queue_entry_id = qe.id and qep.appointment_id = p_appointment_id
          )
        )
    ) then
      raise exception 'Appointment is already checked in';
    end if;
    is_late := now() > ((appt.appointment_date + appt.start_time) at time zone current_setting('TIMEZONE')) + interval '15 minutes';
  end if;
  qnum := public.generate_queue_number(p_source,current_date);
  insert into public.queue_entries(queue_number,appointment_id,pet_id,owner_id,veterinarian_id,source,priority_level,priority_reason,late_arrival,original_appointment_time,created_by)
  values(qnum,p_appointment_id,p_pet_id,p_owner_id,p_veterinarian_id,p_source,coalesce(p_priority_level,3),p_priority_reason,is_late,case when p_appointment_id is null then null else appt.start_time end,p_created_by)
  returning id into qid;
  insert into public.queue_entry_pets(queue_entry_id, appointment_id, pet_id)
  values (qid, p_appointment_id, p_pet_id)
  on conflict (queue_entry_id, pet_id) do nothing;
  if p_appointment_id is not null then update public.appointments set status='Confirmed', updated_at=now() where id=p_appointment_id; end if;
  return qid;
end $$;

grant execute on function public.create_queue_entry(uuid,uuid,uuid,uuid,text,uuid,integer,text) to anon,authenticated;

-- ============================================================================
-- 4. New RPC: check in / queue a whole visit (1..N pets) as ONE ticket.
--    Used for grouped online check-in (p_appointment_ids populated) and for
--    true walk-ins (p_appointment_ids empty, no schedule slot involved).
-- ============================================================================
create or replace function public.create_group_queue_entry(
  p_appointment_ids uuid[],
  p_pet_ids uuid[],
  p_owner_id uuid,
  p_veterinarian_id uuid,
  p_source text,
  p_created_by uuid,
  p_priority_level integer default 3,
  p_priority_reason text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  qid uuid;
  qnum text;
  primary_appointment_id uuid;
  primary_pet_id uuid;
  primary_appt public.appointments%rowtype;
  is_late boolean := false;
  i integer;
  appt_count integer := coalesce(array_length(p_appointment_ids,1),0);
  pet_count integer := coalesce(array_length(p_pet_ids,1),0);
begin
  if pet_count < 1 then
    raise exception 'At least one pet is required';
  end if;
  if appt_count > 0 and appt_count <> pet_count then
    raise exception 'Appointment and pet lists must match in length';
  end if;

  if appt_count > 0 then
    select a.id into primary_appointment_id
    from public.appointments a
    where a.id = any(p_appointment_ids)
    order by a.start_time asc
    limit 1;

    if primary_appointment_id is null then raise exception 'Appointment not found'; end if;

    select * into primary_appt from public.appointments where id = primary_appointment_id;
    primary_pet_id := primary_appt.pet_id;

    if exists (
      select 1 from public.queue_entries qe
      where qe.queue_date = current_date and qe.status <> 'Completed'
        and (
          qe.appointment_id = any(p_appointment_ids)
          or exists(
            select 1 from public.queue_entry_pets qep
            where qep.queue_entry_id = qe.id and qep.appointment_id = any(p_appointment_ids)
          )
        )
    ) then
      raise exception 'One or more of these appointments is already checked in';
    end if;

    is_late := now() > ((primary_appt.appointment_date + primary_appt.start_time) at time zone current_setting('TIMEZONE')) + interval '15 minutes';
  else
    primary_pet_id := p_pet_ids[1];
  end if;

  qnum := public.generate_queue_number(p_source, current_date);

  insert into public.queue_entries(
    queue_number, appointment_id, pet_id, owner_id, veterinarian_id, source,
    priority_level, priority_reason, late_arrival, original_appointment_time, created_by
  ) values (
    qnum, primary_appointment_id, primary_pet_id, p_owner_id, p_veterinarian_id, p_source,
    coalesce(p_priority_level,3), p_priority_reason, is_late,
    case when primary_appointment_id is null then null else primary_appt.start_time end,
    p_created_by
  ) returning id into qid;

  for i in 1 .. pet_count loop
    insert into public.queue_entry_pets(queue_entry_id, appointment_id, pet_id)
    values (
      qid,
      case when appt_count >= i then p_appointment_ids[i] else null end,
      p_pet_ids[i]
    )
    on conflict (queue_entry_id, pet_id) do nothing;
  end loop;

  if appt_count > 0 then
    update public.appointments set status='Confirmed', updated_at=now()
    where id = any(p_appointment_ids);
  end if;

  return qid;
end $$;

grant execute on function public.create_group_queue_entry(uuid[],uuid[],uuid,uuid,text,uuid,integer,text) to anon, authenticated;

-- ============================================================================
-- 5. Completion cascade: when a ticket is marked Completed (or kept
--    Waiting/Serving), apply that to every appointment it covers
--    (queue_entry_pets), not just the single "primary" appointment.
--    For an ungrouped single-pet ticket this covers exactly the same one
--    appointment as before - no behavior change there.
-- ============================================================================
create or replace function public.sync_queue_appointment_status()
returns trigger language plpgsql as $$
declare
  appt_ids uuid[];
begin
  select coalesce(array_agg(distinct appointment_id) filter (where appointment_id is not null), array[]::uuid[])
    into appt_ids
  from public.queue_entry_pets
  where queue_entry_id = new.id;

  if new.appointment_id is not null and not (new.appointment_id = any(appt_ids)) then
    appt_ids := appt_ids || new.appointment_id;
  end if;

  if array_length(appt_ids,1) is null then
    return new;
  end if;

  if new.status in ('Waiting','Serving') then
    update public.appointments
       set status = 'Confirmed', updated_at = now()
     where id = any(appt_ids)
       and status not in ('Completed','Cancelled');
  elsif new.status = 'Completed' then
    update public.appointments
       set status = 'Completed', updated_at = now()
     where id = any(appt_ids)
       and status <> 'Cancelled';
  end if;

  return new;
end $$;

drop trigger if exists queue_sync_appointment on public.queue_entries;
create trigger queue_sync_appointment
after insert or update of status on public.queue_entries
for each row execute function public.sync_queue_appointment_status();

notify pgrst, 'reload schema';
commit;
