-- Diagnostic for the "Continue doesn't go anywhere" bug on drafts.
--
-- Root cause: the pawcruz_save_medical_record RPC (a fallback path used only
-- when the direct table write fails with a schema-cache error) never wrote
-- queue_entry_id or consultation_fee on insert or update -- see
-- supabase/FINAL_REPAIR_medical_records_api.sql, now fixed. Any draft saved
-- through that fallback before the fix has queue_entry_id = null, which is
-- exactly why clicking it silently redirected away instead of opening.
--
-- Step 1: apply the updated supabase/FINAL_REPAIR_medical_records_api.sql
-- in the Supabase SQL editor first, so no *new* draft can be affected.
--
-- Step 2: run this to see if any existing drafts are already broken.

select id, pet_id, record_template, record_status, queue_entry_id, created_at
from public.medical_records
where record_status = 'Draft' and queue_entry_id is null
order by created_at desc;

-- Step 3: there is no way to recover the correct queue_entry_id for a row
-- that never had one saved -- it was never recorded. If Step 2 returned any
-- rows, they can never be opened via "Continue" (the visit link is gone).
-- The only options are to leave them (harmless clutter, just permanently
-- unreachable) or delete them since they hold no real data.
--
-- Uncomment and run only if you want to delete them, after reviewing the
-- Step 2 output:

-- delete from public.medical_records
-- where record_status = 'Draft' and queue_entry_id is null;
