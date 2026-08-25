-- One-off merge for the "2 WAY TEST" and "3 WAY TEST" duplicates, done via
-- the same pawcruz_merge_inventory_items RPC the app's UI uses. This is the
-- upgraded version of that function (see
-- supabase/INVENTORY_MERGE_DUPLICATES.sql) -- run that file first, in the
-- SQL Editor, before this one. It now moves every batch, unit record,
-- transaction, transaction_items line, and prescription from the old item
-- onto the current one, then deletes the old item outright -- so this time
-- TK-003/TK-004 end up gone entirely, not just archived.
--
-- Step 1: run this first and read the results. It assumes TK-003/TK-004
-- are the old duplicates and TK-08/TK-05 are the current ones to keep --
-- confirm that still looks right before running Step 2. If it's backwards,
-- swap the two id lookups in each call in Step 2. You already ran the old
-- (archive-only) version of the merge on these once -- that's fine, this
-- will just finish the job; the batch/transaction moves are no-ops the
-- second time and only the new repoint-and-delete steps actually do
-- anything.

select id, item_name, sku, quantity, is_archived, created_at
from public.inventory_items
where sku in ('TK-003', 'TK-004', 'TK-08', 'TK-05')
order by item_name, created_at;

-- Step 2: merge TK-003 into TK-08 ("2 WAY TEST"), and TK-004 into TK-05
-- ("3 WAY TEST"). p_actor_id just needs to belong to any staff/admin
-- profile -- it's only used for the RPC's authorization check.

select public.pawcruz_merge_inventory_items(
  (select id from public.inventory_items where sku = 'TK-003'),
  (select id from public.inventory_items where sku = 'TK-08'),
  (select id from public.profiles where role in ('staff', 'admin') limit 1)
);

select public.pawcruz_merge_inventory_items(
  (select id from public.inventory_items where sku = 'TK-004'),
  (select id from public.inventory_items where sku = 'TK-05'),
  (select id from public.profiles where role in ('staff', 'admin') limit 1)
);

-- Step 3: confirm -- this should now return only 2 rows (TK-08 and TK-05),
-- each holding the combined quantity. TK-003/TK-004 no longer exist at all.

select id, item_name, sku, quantity, is_archived
from public.inventory_items
where sku in ('TK-003', 'TK-004', 'TK-08', 'TK-05')
order by item_name, created_at;
