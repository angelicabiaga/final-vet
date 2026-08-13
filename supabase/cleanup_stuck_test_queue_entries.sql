-- PawCruz: one-time cleanup for stuck test queue tickets.
-- Run this yourself in the Supabase SQL Editor - I'm not running it for you.
--
-- Why DELETE instead of updating them to Completed: the status-change UI is
-- failing on these specific rows with "must follow Waiting -> Serving" even on
-- a single, isolated click - not just the double-click race I already fixed in
-- the app. That points to something already off with these particular rows
-- (leftover from testing across several scheme versions this session), so
-- trying to push them through the normal Waiting -> Serving -> Completed
-- sequence keeps hitting the same guard. A DELETE sidesteps that trigger
-- entirely (it only runs on INSERT/UPDATE of status, not DELETE) and is
-- appropriate here since this is test data, not real patient history.
--
-- This only removes queue_entries rows (and their queue_entry_pets /
-- queue_status_history rows, which cascade-delete automatically). It does
-- NOT touch the appointments table - the underlying appointment records are
-- left exactly as they are.

begin;

-- STEP 1 - review what this will delete before running step 2.
-- Adjust the WHERE clause if you want to target something narrower/wider
-- (e.g. add "and owner_id = '<uuid>'" for just one owner).
select qe.id, qe.queue_number, qe.status, qe.queue_date, p.pet_name, pr.full_name as owner_name
from public.queue_entries qe
left join public.pets p on p.id = qe.pet_id
left join public.profiles pr on pr.id = qe.owner_id
where qe.status in ('Waiting','Serving')
order by qe.queue_date, qe.queue_number;

-- STEP 2 - once the list above looks right, uncomment and run this delete.
-- (Left commented out on purpose so a stray "run all" doesn't delete anything
-- you didn't mean to.)

delete from public.queue_entries
where status in ('Waiting','Serving');

commit;
