-- PawCruz: make the database's own "today"/"now" match the clinic's local
-- time (Asia/Manila) instead of the default UTC.
--
-- Why this matters: several functions rely on Postgres's current_date/now()
-- (queue_entries.queue_date default, the check-in duplicate guard, the
-- Q-###/A-### numbering, is_late calculations, etc.). The web app already
-- computes "today" from the browser's local clock. When the server's
-- current_date disagrees with the browser's (which happens for several
-- hours around midnight Manila time, since UTC is 8 hours behind), you get
-- exactly what you just saw: the Live Queue looks empty for "today" while
-- the check-in guard - checking the server's own "today" - still finds and
-- blocks against a ticket filed under the server's different date.
--
-- Run this ONCE in the Supabase SQL Editor. Takes effect for new
-- connections/queries; no data is changed or deleted.

alter database postgres set timezone to 'Asia/Manila';

-- Also apply it to the current session immediately, so you can verify
-- without reconnecting.
set timezone to 'Asia/Manila';
select now() as server_now, current_date as server_today;

-- ============================================================================
-- Optional follow-up: find any "phantom" tickets filed under a mismatched
-- date for TODAY's confirmed appointments (the ones shown on the
-- "ready for check-in" cards). If this returns rows, that's what's blocking
-- them - each row's own appointment/pet/status is shown so you can see
-- exactly what's stuck before deciding what to do with it.
-- ============================================================================
select
  qe.id as queue_entry_id,
  qe.queue_number,
  qe.status,
  qe.queue_date,
  a.id as appointment_id,
  a.appointment_date,
  p.pet_name,
  pr.full_name as owner_name
from public.queue_entries qe
join public.appointments a
  on a.id = qe.appointment_id
     or a.id in (
       select qep.appointment_id from public.queue_entry_pets qep
       where qep.queue_entry_id = qe.id
     )
left join public.pets p on p.id = a.pet_id
left join public.profiles pr on pr.id = a.owner_id
where a.appointment_date = current_date
  and a.status = 'Confirmed'
  and qe.status <> 'Completed'
order by qe.queue_date, qe.queue_number;

-- If that shows rows you don't want (e.g. queue_date is yesterday relative
-- to what you now expect), you can clear just those by id, the same way as
-- cleanup_stuck_test_queue_entries.sql:
--
-- delete from public.queue_entries where id in ('<queue_entry_id>', ...);
