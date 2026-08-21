-- PawCruz: repair inventory_items.status auto-sync.
--
-- inventory_module.sql defines trg_pawcruz_inventory_item_update, which is
-- supposed to recompute inventory_items.status from quantity/reorder_level/
-- expiry_date on every insert or update. On this project that trigger does
-- not actually exist (only the separate notification trigger does), so
-- status has been frozen at whatever it was set to when each row was first
-- created -- it never updates again as stock changes. That's why items can
-- show "In Stock" at 0 quantity, and why filtering/clicking the Low Stock /
-- Out of Stock summary cards can miss items whose status never caught up.
--
-- Apply this once in the Supabase SQL editor. Safe to re-run.

create or replace function public.pawcruz_update_inventory_item()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.status := public.pawcruz_inventory_status(new.quantity, new.reorder_level, new.expiry_date);
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_inventory_item_update on public.inventory_items;
create trigger trg_pawcruz_inventory_item_update
before insert or update on public.inventory_items
for each row execute function public.pawcruz_update_inventory_item();

-- One-time backfill: recompute every existing row's status right now
-- instead of waiting for its next update.
update public.inventory_items
set status = public.pawcruz_inventory_status(quantity, reorder_level, expiry_date);

notify pgrst, 'reload schema';
