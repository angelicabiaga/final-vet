-- Diagnostic + backfill for "Continue redirects to Animal Patients" on a
-- draft. Confirmed cause: these 5 drafts were all saved BEFORE
-- supabase/FINAL_REPAIR_medical_records_api.sql was applied, back when the
-- pawcruz_save_medical_record RPC silently dropped queue_entry_id. The fix
-- only stops *new* saves from breaking this way -- it can't repair rows
-- already broken, so these 5 need a one-time manual backfill.

-- Step 1: every draft with a missing link, together with the pet/owner/vet
-- NAMES (not just raw ids) and every candidate queue_entries row for that
-- same pet+owner+vet, ordered so the closest-in-time match is obvious. A
-- draft's own created_at should sit very close in time to (usually just
-- after) the queue_entries row it belongs to.
select
  mr.id as draft_id,
  mr.record_template,
  mr.created_at as draft_created_at,
  mr.updated_at as draft_updated_at,
  p.pet_name,
  o.full_name as owner_name,
  v.full_name as veterinarian_name,
  qe.id as candidate_queue_entry_id,
  qe.queue_number,
  qe.status as queue_status,
  qe.created_at as queue_created_at
from public.medical_records mr
join public.pets p on p.id = mr.pet_id
join public.profiles o on o.id = mr.owner_id
join public.profiles v on v.id = mr.veterinarian_id
left join public.queue_entries qe
  on qe.pet_id = mr.pet_id
  and qe.owner_id = mr.owner_id
  and qe.veterinarian_id = mr.veterinarian_id
where mr.record_status = 'Draft' and mr.queue_entry_id is null
order by p.pet_name, mr.created_at, qe.created_at;

-- Step 2: for each draft_id above, pick the candidate_queue_entry_id whose
-- queue_created_at is closest to (just before) that draft's own
-- draft_created_at, then backfill it. Copy one line per draft, filling in
-- both ids from Step 1's output, and run them together.

-- update public.medical_records set queue_entry_id = '<candidate_queue_entry_id>' where id = '<draft_id>';
-- update public.medical_records set queue_entry_id = '<candidate_queue_entry_id>' where id = '<draft_id>';
-- update public.medical_records set queue_entry_id = '<candidate_queue_entry_id>' where id = '<draft_id>';
-- update public.medical_records set queue_entry_id = '<candidate_queue_entry_id>' where id = '<draft_id>';
-- update public.medical_records set queue_entry_id = '<candidate_queue_entry_id>' where id = '<draft_id>';
