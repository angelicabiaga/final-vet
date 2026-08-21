-- PawCruz: add a manually-entered Unique Unit ID to inventory_units, plus
-- per-unit expiry_date/date_received.
--
-- inventory_units already has unit_no (an auto-incrementing internal
-- sequence, formatted as UNIT-000001 in the UI) -- that's a system id, not
-- something staff can type. unit_code is the staff-entered identifier
-- (e.g. a printed serial/lot code on the physical item) captured at
-- Stock In time: one per unit for a single-item entry, one per piece for a
-- batch entry.
--
-- expiry_date/date_received let an individual unit's dates diverge from
-- its batch's dates (e.g. two physical items received together but printed
-- with different expiry dates). The Stock In / Add Batch form defaults
-- every unit to the batch-level dates already entered above, with a
-- "copy from above" toggle -- these columns are what an unchecked override
-- actually persists to. Both nullable and left null when not overridden,
-- so the batch's own date_received/expiry_date stay the single source of
-- truth for the common case.
--
-- All three columns are nullable because units created before this
-- migration, and any future auto-generated units (e.g. backfills), won't
-- have them set.
--
-- Apply this once in the Supabase SQL editor, after INVENTORY_UNIT_TRACKING.sql.

alter table public.inventory_units
  add column if not exists unit_code text,
  add column if not exists expiry_date date,
  add column if not exists date_received date;

create unique index if not exists idx_inventory_units_unit_code
  on public.inventory_units (unit_code)
  where unit_code is not null;

notify pgrst, 'reload schema';
