-- PawCruz: adds OCR-extraction fields to veterinarian_verifications so the
-- license number, profession, and supporting raw text can be recorded
-- from the PRC ID scan instead of anyone typing them in. Additive only --
-- every column is nullable, and the table/bucket/RLS from
-- veterinarian_verification.sql are unchanged. Safe to run multiple times.

alter table public.veterinarian_verifications add column if not exists prc_profession text;
alter table public.veterinarian_verifications add column if not exists ocr_raw_text text;
alter table public.veterinarian_verifications add column if not exists ocr_confidence numeric;

-- OCR reads dates as loose, ambiguous text (no guarantee of a parseable
-- day/month/year order) -- kept here as text for the administrator to read
-- visually, rather than risking a cast error by forcing them into the
-- existing prc_registration_date/prc_expiration_date "date" columns.
alter table public.veterinarian_verifications add column if not exists ocr_detected_dates text;
