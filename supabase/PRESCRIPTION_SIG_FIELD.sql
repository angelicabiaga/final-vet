-- Adds "Sig" (pharmacy shorthand for "directions for use") to each
-- prescribed medicine line -- e.g. "Give 1 tablet by mouth every 12 hours
-- for 7 days". Typed by the vet per medication on the medical record (in
-- template_data.inventoryItems[].sig), carried through to this table by
-- syncPrescriptions() at staff checkout, and printed on the Rx PDF.
alter table public.prescriptions add column if not exists sig text;
