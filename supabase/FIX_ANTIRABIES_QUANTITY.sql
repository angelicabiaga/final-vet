-- One-off correction for ANTI RABIES 10DS (VAC-005), which is showing
-- "9.9 pcs" from a fractional batch left over from before quantities were
-- locked to whole numbers in the app.
--
-- Step 1: run this SELECT first and check the results. If there is more
-- than one Active batch, you must decide which row is the one holding the
-- correct future stock and edit the id used in Step 2 accordingly (do not
-- run Step 2 blindly if there's more than one row here).

select b.id, b.batch_number, b.quantity_received, b.quantity_remaining,
       b.status, b.is_active, b.expiry_date, b.date_received
from public.inventory_batches b
join public.inventory_items i on i.id = b.item_id
where i.sku = 'VAC-005'
order by b.date_received;

-- Step 2: Step 1 confirmed there's exactly one batch
-- (93064533-e4c7-4c70-aae5-a6072b76b385). Correcting both quantity_received
-- and quantity_remaining to 20, as confirmed.

update public.inventory_batches
set quantity_received = 20,
    quantity_remaining = 20,
    updated_at = now()
where id = '93064533-e4c7-4c70-aae5-a6072b76b385';

-- Step 3: resync the item's cached quantity (the number the Inventory
-- list actually displays) from its batches, so it matches Step 2.

update public.inventory_items
set quantity = coalesce((
  select sum(quantity_remaining) from public.inventory_batches
  where item_id = (select id from public.inventory_items where sku = 'VAC-005')
    and status = 'Active'
), 0)
where sku = 'VAC-005';
