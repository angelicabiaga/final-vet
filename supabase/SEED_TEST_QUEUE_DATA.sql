-- Seeds a handful of test rows into today's Live Queue, for staff-side
-- testing of QueueManagementModule.jsx. Uses real, already-existing pets
-- (and their real owners) plus one real active veterinarian -- no fake
-- foreign keys. Queue numbers are prefixed "TEST-" so they're easy to spot
-- and remove afterward (see the cleanup query at the bottom).
--
-- Produces: 3 Waiting, 1 Serving, 1 Completed, and 1 Waiting-but-late-arrival
-- entry, spread across your 6 most recently created active pets.
--
-- Every row must be INSERTed as 'Waiting' -- a database trigger
-- (enforce_queue_status_flow) rejects any new row that doesn't start
-- there, and only allows Waiting -> Serving -> Completed one step at a
-- time -- so rows 3 and 4 are walked forward with separate UPDATEs right
-- after the insert, in the same transaction.
--
-- Safe to re-run -- "on conflict do nothing" skips rows that already exist
-- for today.

begin;

with picked_pets as (
  select p.id as pet_id, p.owner_id, row_number() over (order by p.created_at desc) as rn
  from public.pets p
  where p.is_archived = false
  limit 6
),
picked_vet as (
  select id as veterinarian_id
  from public.profiles
  where role = 'veterinarian' and account_status = 'active'
  order by full_name
  limit 1
)
insert into public.queue_entries (
  queue_date, queue_number, pet_id, owner_id, veterinarian_id, source, status,
  priority_level, late_arrival, original_appointment_time, arrived_at, estimated_wait_minutes
)
select
  current_date,
  'TEST-' || pp.rn,
  pp.pet_id,
  pp.owner_id,
  pv.veterinarian_id,
  'Walk-In',
  'Waiting',
  3,
  pp.rn = 5,
  case when pp.rn = 5 then (now() - interval '45 minutes')::time else null end,
  now() - make_interval(mins => (pp.rn * 4)::int),
  pp.rn * 5
from picked_pets pp
cross join picked_vet pv
on conflict (queue_date, queue_number) do nothing;

-- Walk TEST-3 forward to Serving.
update public.queue_entries
set status = 'Serving'
where queue_number = 'TEST-3' and queue_date = current_date and status = 'Waiting';

-- Walk TEST-4 forward through Serving to Completed (one step at a time).
update public.queue_entries
set status = 'Serving'
where queue_number = 'TEST-4' and queue_date = current_date and status = 'Waiting';

update public.queue_entries
set status = 'Completed'
where queue_number = 'TEST-4' and queue_date = current_date and status = 'Serving';

commit;

-- Review what was inserted:
select queue_number, status, late_arrival, veterinarian_id, pet_id
from public.queue_entries
where queue_number like 'TEST-%' and queue_date = current_date
order by queue_number;

-- To remove all this test data afterward, run:
-- delete from public.queue_entries where queue_number like 'TEST-%';
