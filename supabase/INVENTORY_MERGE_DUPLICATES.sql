-- PawCruz: merge two inventory_items that are really the same product
-- (e.g. "3 WAY TEST" created twice through "Add Item" instead of "Stock").
--
-- Moves every batch (and its individual units, if unit-tracked) and every
-- historical inventory_transactions row from the source item onto the
-- target item, then repoints past transaction_items (sales) and
-- prescriptions rows the same way. With nothing left referencing the
-- source item, it is deleted outright -- the product ends up as one row,
-- not an empty duplicate sitting in the Deactivated list forever.
--
-- A prescriptions row is unique per (queue_entry_id, inventory_item_id), so
-- if one visit somehow prescribed both the source and target already, the
-- repoint would collide -- that case raises a clear error instead of
-- silently losing a row, and the merge is rolled back entirely (nothing
-- changes) so it can be resolved by hand first.
--
-- Apply this once in the Supabase SQL editor, after FIFO_INVENTORY_BATCHES.sql
-- (and INVENTORY_UNIT_TRACKING.sql if you've applied unit tracking).
-- Safe to re-run over the original version of this function -- create or
-- replace just swaps its behavior in place.

create or replace function public.pawcruz_merge_inventory_items(
  p_source_item_id uuid,
  p_target_item_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.inventory_items%rowtype;
  v_target public.inventory_items%rowtype;
begin
  perform public.pawcruz_pos_assert_staff(p_actor_id);

  if p_source_item_id = p_target_item_id then
    raise exception 'Cannot merge an item into itself.';
  end if;

  select * into v_source from public.inventory_items where id = p_source_item_id for update;
  if not found then raise exception 'Source item was not found.'; end if;

  select * into v_target from public.inventory_items where id = p_target_item_id for update;
  if not found then raise exception 'Target item was not found.'; end if;

  -- Move every batch onto the surviving item.
  update public.inventory_batches
  set item_id = p_target_item_id, updated_at = now()
  where item_id = p_source_item_id;

  -- Individual unit records follow their batch to the new owner (only
  -- relevant if unit tracking is in use).
  update public.inventory_units
  set item_id = p_target_item_id, updated_at = now()
  where item_id = p_source_item_id;

  -- Carry historical stock-movement rows over too, so the target's
  -- Stock Movement History shows the product's complete trail.
  update public.inventory_transactions
  set item_id = p_target_item_id
  where item_id = p_source_item_id;

  -- Repoint past sales onto the surviving item -- required before the
  -- source can be deleted (transaction_items.inventory_item_id is
  -- on delete restrict).
  update public.transaction_items
  set inventory_item_id = p_target_item_id
  where inventory_item_id = p_source_item_id;

  -- Repoint past prescriptions the same way.
  update public.prescriptions
  set inventory_item_id = p_target_item_id
  where inventory_item_id = p_source_item_id;

  -- The trigger that fired from the batch UPDATE above only recomputed the
  -- target side (new.item_id); recompute explicitly so nothing is left
  -- stale.
  update public.inventory_items
  set quantity = coalesce((
    select sum(quantity_remaining) from public.inventory_batches
    where item_id = p_target_item_id and status = 'Active'
  ), 0)
  where id = p_target_item_id;

  -- Nothing references the source item anymore -- remove it outright
  -- instead of leaving an archived duplicate behind.
  delete from public.inventory_items where id = p_source_item_id;

  return p_target_item_id;
exception
  when unique_violation then
    raise exception 'Cannot merge: one visit already has a prescription for both the duplicate and the target item. Resolve that prescription by hand first, then try again.';
end;
$$;

grant execute on function public.pawcruz_merge_inventory_items(uuid,uuid,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
