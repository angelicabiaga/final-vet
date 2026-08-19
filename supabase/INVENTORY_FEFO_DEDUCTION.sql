-- PawCruz: switch batch deduction from FIFO (oldest received) to FEFO
-- (nearest expiration first), matching what the item-level sync trigger
-- already assumes ("next batch" is picked by soonest expiry) and what a
-- clinic actually wants -- use stock before it expires, not just in the
-- order it arrived.
--
-- Everything else in pawcruz_record_inventory_transaction (defined in
-- FIFO_INVENTORY_BATCHES.sql) is unchanged; only the deduction loop's
-- ORDER BY changes. Apply this once in the Supabase SQL editor, after
-- FIFO_INVENTORY_BATCHES.sql.

create or replace function public.pawcruz_record_inventory_transaction(
  p_item_id uuid,
  p_transaction_type text,
  p_quantity numeric,
  p_reason text default null,
  p_notes text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_created_by uuid default null,
  p_batch_number text default null,
  p_date_received date default null,
  p_expiry_date date default null,
  p_reference_number text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_batch public.inventory_batches%rowtype;
  v_remaining numeric(12,2);
  v_take numeric(12,2);
  v_transaction_id uuid;
  v_first_transaction_id uuid;
  v_new_batch_id uuid;
  v_creates boolean;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_item from public.inventory_items where id = p_item_id and coalesce(is_archived, false) = false for update;
  if not found then raise exception 'Inventory item was not found or is archived'; end if;

  v_creates := p_transaction_type in ('Stock In', 'Adjustment Add');

  if v_creates then
    if p_expiry_date is null then
      raise exception 'Expiry date is required for stock-in batches';
    end if;

    insert into public.inventory_batches (item_id, batch_number, quantity_received, quantity_remaining, date_received, expiry_date, created_by)
    values (p_item_id, nullif(btrim(coalesce(p_batch_number, '')), ''), p_quantity, p_quantity, coalesce(p_date_received, current_date), p_expiry_date, p_created_by)
    returning id into v_new_batch_id;

    insert into public.inventory_transactions (
      item_id, batch_id, transaction_type, quantity, quantity_before, quantity_after,
      reason, notes, reference_type, reference_id, reference_number, created_by
    ) values (
      p_item_id, v_new_batch_id, p_transaction_type, p_quantity, v_item.quantity, v_item.quantity + p_quantity,
      p_reason, p_notes, p_reference_type, p_reference_id, p_reference_number, p_created_by
    ) returning id into v_transaction_id;

    return v_transaction_id;
  end if;

  -- Deduction paths: FEFO -- nearest expiration first (batches with no
  -- expiry date are used last, since they carry no expiry urgency), tied
  -- broken by whichever arrived earlier. Never touches expired batches --
  -- except the 'Expired' transaction type itself, which exists specifically
  -- to write off stock a physical check found expired.
  v_remaining := p_quantity;

  for v_batch in
    select * from public.inventory_batches
    where item_id = p_item_id
      and quantity_remaining > 0
      and status = case when p_transaction_type = 'Expired' then 'Expired' else 'Active' end
    order by expiry_date asc nulls last, date_received asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;

    v_take := least(v_batch.quantity_remaining, v_remaining);

    update public.inventory_batches
    set quantity_remaining = quantity_remaining - v_take
    where id = v_batch.id;

    insert into public.inventory_transactions (
      item_id, batch_id, transaction_type, quantity, quantity_before, quantity_after,
      reason, notes, reference_type, reference_id, reference_number, created_by
    ) values (
      p_item_id, v_batch.id, p_transaction_type, v_take, v_batch.quantity_remaining, v_batch.quantity_remaining - v_take,
      p_reason, p_notes, p_reference_type, p_reference_id, p_reference_number, p_created_by
    ) returning id into v_transaction_id;

    if v_first_transaction_id is null then v_first_transaction_id := v_transaction_id; end if;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Insufficient stock. Available quantity: %', (p_quantity - v_remaining);
  end if;

  return v_first_transaction_id;
end;
$$;

grant execute on function public.pawcruz_record_inventory_transaction(uuid,text,numeric,text,text,text,uuid,uuid,text,date,date,text) to anon, authenticated;

notify pgrst, 'reload schema';
