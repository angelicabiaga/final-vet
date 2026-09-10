-- Veterinarian Verification — PRC License Number Only.
--
-- Replaces the old ID-photo + live-face-scan verification flow. No photos
-- of any kind (ID card, face scan/selfie) are collected any more -- a
-- veterinarian just types their PRC (Professional Regulation Commission)
-- license number, and an administrator confirms it manually (PRC has no
-- public verification API to check it automatically against). Run this
-- once in the Supabase SQL editor.

-- Supabase blocks direct DELETE on storage.objects/storage.buckets from
-- SQL ("Direct deletion from storage tables is not allowed. Use the
-- Storage API instead.") -- so the actual files and the bucket itself
-- must be removed from the Dashboard: Storage -> veterinarian-verification
-- -> select all files -> Delete, then delete the bucket itself. The app
-- no longer reads or writes this bucket at all after this migration, so
-- that cleanup is optional and can happen whenever you like.
--
-- The RLS policy on storage.objects is plain Postgres metadata (not a row
-- delete), so it can be dropped here.
drop policy if exists "veterinarian_verification_storage_all" on storage.objects;

-- Drop every photo/OCR-only column -- verification is now PRC-license-
-- number-only, typed by the veterinarian, never derived from an image.
alter table public.veterinarian_verifications drop column if exists id_front_path;
alter table public.veterinarian_verifications drop column if exists id_back_path;
alter table public.veterinarian_verifications drop column if exists face_scan_path;
alter table public.veterinarian_verifications drop column if exists consent_given_at;
alter table public.veterinarian_verifications drop column if exists prc_name_on_card;
alter table public.veterinarian_verifications drop column if exists prc_profession;
alter table public.veterinarian_verifications drop column if exists prc_registration_date;
alter table public.veterinarian_verifications drop column if exists prc_expiration_date;
alter table public.veterinarian_verifications drop column if exists ocr_raw_text;
alter table public.veterinarian_verifications drop column if exists ocr_confidence;
alter table public.veterinarian_verifications drop column if exists ocr_detected_dates;

-- ---------------------------------------------------------------------
-- Notify the veterinarian themselves when an admin decides their
-- verification -- today reviewVerification() only writes an admin-facing
-- activity_logs row, so the vet never actually finds out their submission
-- was approved, rejected, or needs a resubmission. Skips 'Pending Review'
-- (that's the vet's own submit, not a decision) and the initial
-- 'Unverified' default. Mirrors notify_owner_appointment_change() /
-- notify_owner_doctor_reassignment()'s pattern elsewhere in this schema.
-- ---------------------------------------------------------------------
create or replace function public.notify_vet_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_message text;
begin
  if new.status is distinct from old.status and new.status in ('Verified','Rejected','Needs Resubmission') then
    if new.status = 'Verified' then
      v_title := 'Verification Approved';
      v_message := 'Your veterinarian account has been verified. Your PRC license number is now on file.';
    elsif new.status = 'Rejected' then
      v_title := 'Verification Rejected';
      v_message := 'Your PRC verification was rejected.' ||
        case when nullif(trim(new.rejection_reason), '') is not null then ' Reason: ' || new.rejection_reason || '.' else '' end ||
        ' Please review and submit again.';
    else
      v_title := 'Resubmission Needed';
      v_message := 'Your PRC verification needs resubmission.' ||
        case when nullif(trim(new.rejection_reason), '') is not null then ' Reason: ' || new.rejection_reason || '.' else '' end ||
        ' Please double-check your PRC license number and submit again.';
    end if;

    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.veterinarian_id, v_title, v_message, 'Verification Update',
      'Verification', new.id, new.reviewed_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_vet_verification_decision on public.veterinarian_verifications;
create trigger trg_notify_vet_verification_decision
after update of status on public.veterinarian_verifications
for each row execute function public.notify_vet_verification_decision();

notify pgrst, 'reload schema';
