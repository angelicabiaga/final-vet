-- One-off correction for VANGUARD 6 IN 1 (VAC-002), which is showing
-- "0.14 pcs" from a fractional batch left over from before quantities
-- were locked to whole numbers in the app.
--
-- Step 1: run this SELECT first and check the results before touching
-- anything. If there is more than one Active batch, you must decide which
-- row is the one holding the correct future stock and edit the id used in
-- Step 2 accordingly (do not run Step 2 blindly if there's more than one
-- row here).

select b.id, b.batch_number, b.quantity_received, b.quantity_remaining,
       b.status, b.is_active, b.expiry_date, b.date_received
from public.inventory_batches b
join public.inventory_items i on i.id = b.item_id
where i.sku = 'VAC-002'
order by b.date_received;

-- Step 2: Step 1 confirmed there's exactly one batch
-- (ba887c45-fb41-4b47-ac4d-3edc485c2a7a), so this is safe to run as-is.

update public.inventory_batches
set quantity_remaining = 1,
    updated_at = now()
where id = 'ba887c45-fb41-4b47-ac4d-3edc485c2a7a';

-- Step 3: resync the item's cached quantity (the number the Inventory
-- list actually displays) from its batches, so it matches Step 2.

update public.inventory_items
set quantity = coalesce((
  select sum(quantity_remaining) from public.inventory_batches
  where item_id = (select id from public.inventory_items where sku = 'VAC-002')
    and status = 'Active'
), 0)
where sku = 'VAC-002';

-- Step 4: also correct the batch's original received amount (historical
-- record-keeping only -- doesn't affect what the Inventory list shows,
-- but tidies it up to match).

update public.inventory_batches
set quantity_received = 1,
    updated_at = now()
where id = 'ba887c45-fb41-4b47-ac4d-3edc485c2a7a';
