-- PawCruz: merge two inventory_items that are really the same product
-- (e.g. "3 WAY TEST" created twice through "Add Item" instead of "Stock").
--
-- Moves every batch (and its historical inventory_transactions) from the
-- source item onto the target item, recomputes both items' cached
-- quantity (the batch-move trigger in FIFO_INVENTORY_BATCHES.sql only
-- recomputes the NEW item_id side of an UPDATE, so the source would
-- otherwise be left showing stale stock), then archives the source so it
-- drops out of the active list. The source row itself is never deleted --
-- old transaction_items/prescriptions rows that still reference its id by
-- foreign key stay valid.
--
-- Apply this once in the Supabase SQL editor, after FIFO_INVENTORY_BATCHES.sql.

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

  -- Carry historical stock-movement rows over too, so the target's
  -- Stock Movement History shows the product's complete trail.
  update public.inventory_transactions
  set item_id = p_target_item_id
  where item_id = p_source_item_id;

  -- The trigger that fired from the batch UPDATE above only recomputed the
  -- target side (new.item_id); recompute both explicitly so nothing is left
  -- stale.
  update public.inventory_items
  set quantity = coalesce((
    select sum(quantity_remaining) from public.inventory_batches
    where item_id = p_target_item_id and status = 'Active'
  ), 0)
  where id = p_target_item_id;

  update public.inventory_items
  set quantity = 0,
      is_archived = true,
      updated_at = now()
  where id = p_source_item_id;

  return p_target_item_id;
end;
$$;

grant execute on function public.pawcruz_merge_inventory_items(uuid,uuid,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
