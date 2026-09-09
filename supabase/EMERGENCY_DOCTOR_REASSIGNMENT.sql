-- Emergency Doctor Reassignment.
--
-- Lets staff hand a Waiting queue entry to a different, available
-- veterinarian for that visit (e.g. the originally assigned doctor is out
-- for an emergency). The substitute doctor treats the patient as normal;
-- the original doctor is preserved on the row so it can be shown later in
-- the pet's medical history ("Originally assigned to Dr. X").
--
-- Purely additive -- both tables are already queried with select("*") in
-- the app (getQueue() in queueService.js, getMedicalRecords() in
-- medicalRecordService.js), so these new columns flow through with no
-- select-string changes; only the client-side enrich/attach helpers need
-- to pick them up.
--
-- Apply this once in the Supabase SQL editor.

alter table public.queue_entries add column if not exists original_veterinarian_id uuid references public.profiles(id);
alter table public.queue_entries add column if not exists reassignment_reason text;
alter table public.queue_entries add column if not exists reassigned_at timestamptz;
alter table public.queue_entries add column if not exists reassigned_by uuid references public.profiles(id);

alter table public.medical_records add column if not exists original_veterinarian_id uuid references public.profiles(id);

comment on column public.queue_entries.original_veterinarian_id is
  'Set once, at the first reassignment for this visit, to the doctor originally assigned before any emergency substitution. Null for a visit that was never reassigned.';
comment on column public.medical_records.original_veterinarian_id is
  'Carried over from queue_entries.original_veterinarian_id at record save time when this record belongs to a reassigned emergency visit. Null otherwise.';

notify pgrst, 'reload schema';
