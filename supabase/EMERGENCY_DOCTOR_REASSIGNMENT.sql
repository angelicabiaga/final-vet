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
alter table public.queue_entries add column if not exists reassignment_notes text;
alter table public.queue_entries add column if not exists reassigned_at timestamptz;
alter table public.queue_entries add column if not exists reassigned_by uuid references public.profiles(id);

alter table public.medical_records add column if not exists original_veterinarian_id uuid references public.profiles(id);

comment on column public.queue_entries.original_veterinarian_id is
  'Set once, at the first reassignment for this visit, to the doctor originally assigned before any emergency substitution. Null for a visit that was never reassigned.';
comment on column public.medical_records.original_veterinarian_id is
  'Carried over from queue_entries.original_veterinarian_id at record save time when this record belongs to a reassigned emergency visit. Null otherwise.';
comment on column public.queue_entries.reassignment_reason is
  'Staff-picked category for why this visit was reassigned (e.g. "Doctor Unavailable (Emergency)"), chosen from a fixed dropdown in the Reassign Doctor modal.';
comment on column public.queue_entries.reassignment_notes is
  'Optional free-typed detail staff add alongside reassignment_reason. This is the text shown to the pet owner in their reassignment notification, not the category.';

-- ---------------------------------------------------------------------
-- Owner notification: tells the pet owner when their pet's doctor for a
-- visit changes because of an emergency reassignment. original_veterinarian_id
-- is only ever set by reassignQueueVeterinarian() (see queueService.js), so
-- this fires exactly on a real reassignment -- never on the normal
-- check-in insert (no OLD row to compare against there), and never on any
-- other veterinarian_id write, since nothing else in the app updates that
-- column. Mirrors the existing notify_owner_appointment_change() pattern
-- in NOTIFICATIONS_APPOINTMENTS_MESSAGES.sql.
-- ---------------------------------------------------------------------
create or replace function public.notify_owner_doctor_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vet_name text;
begin
  if new.veterinarian_id is distinct from old.veterinarian_id and new.original_veterinarian_id is not null then
    select full_name into v_vet_name from public.profiles where id = new.veterinarian_id;

    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Doctor Reassigned',
      'Due to an emergency, your pet''s doctor for visit #' || new.queue_number || ' has been changed to Dr. ' ||
      coalesce(v_vet_name, 'another veterinarian') || '.' ||
      case when nullif(trim(new.reassignment_notes), '') is not null then ' ' || new.reassignment_notes || '.' else '' end,
      'Queue Update',
      'Queue Management',
      new.id,
      new.reassigned_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_doctor_reassignment on public.queue_entries;
create trigger trg_notify_owner_doctor_reassignment
after update of veterinarian_id on public.queue_entries
for each row execute function public.notify_owner_doctor_reassignment();

notify pgrst, 'reload schema';
