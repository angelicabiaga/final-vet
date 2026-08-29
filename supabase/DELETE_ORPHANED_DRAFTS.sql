-- Deletes the 5 drafts confirmed (via CHECK_DRAFT_QUEUE_LINK.sql) to have
-- no queue_entry_id and no matching queue_entries row left to reconnect to
-- -- their original visits no longer exist in the table, so "Continue" can
-- never work for them. All 5 predate the fix in
-- FINAL_REPAIR_medical_records_api.sql; new drafts saved from now on get
-- queue_entry_id set correctly and won't end up in this state.

-- Step 1: review one more time before deleting.
select id, pet_id, record_template, record_status, created_at
from public.medical_records
where record_status = 'Draft' and queue_entry_id is null
order by created_at;

-- Step 2: delete them.
delete from public.medical_records
where record_status = 'Draft' and queue_entry_id is null;
