-- Fixes "Unable to create inventory item" when adding a brand-new item
-- from Staff/Admin > Inventory.
--
-- Root cause: inventory_items.expiry_date was created NOT NULL back when
-- expiry lived on the item itself (see inventory_module.sql). FIFO_INVENTORY_BATCHES.sql
-- later moved expiry tracking to the per-batch level (inventory_batches.expiry_date) --
-- a brand-new item now starts with zero batches and gets its expiry_date
-- filled in later by pawcruz_sync_item_from_batches once real stock (with a
-- real expiry) comes in via Stock In. The Add Item form was updated to match
-- (it no longer has an Expiry Date field), but this column's NOT NULL
-- constraint was never relaxed to match, so every insert of a new item
-- fails a not-null violation on expiry_date.
--
-- Safe to run more than once.

alter table public.inventory_items alter column expiry_date drop not null;

notify pgrst, 'reload schema';
