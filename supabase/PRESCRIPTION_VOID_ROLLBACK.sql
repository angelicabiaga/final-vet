-- PawCruz: roll back prescription purchased-quantity on void/cancel.
--
-- Bug: pawcruz_checkout_pos_transaction increments
-- prescriptions.total_quantity_purchased at CHECKOUT-CREATION time for
-- every payment method, including GCash (which starts as
-- payment_status = 'Pending'). If that pending GCash session later expires
-- or the transaction is voided before ever being paid, nothing rolled that
-- increment back -- the medicine could stay shown as (partially) purchased
-- forever even though no money was ever actually collected for it.
--
-- Fix: pawcruz_reverse_pos_transaction (defined in FIFO_INVENTORY_BATCHES.sql)
-- now also decrements total_quantity_purchased for every transaction_items
-- row linked to a prescription, and recomputes fulfillment_status, before
-- doing anything else. This runs for both the "still Pending" early-return
-- path and the full (already paid) reversal path, since the prescription
-- increment happens unconditionally at checkout regardless of payment
-- method/status.
--
-- Apply this once in the Supabase SQL editor, after FIFO_INVENTORY_BATCHES.sql
-- and STAFF_POS_PARTIAL_PAYMENTS_AND_PRESCRIPTIONS.sql have already been run.

create or replace function public.pawcruz_reverse_pos_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_inv_tx public.inventory_transactions%rowtype;
  v_batch_before numeric(12,2);
  v_batch_after numeric(12,2);
  v_rx_item public.transaction_items%rowtype;
  v_prescription public.prescriptions%rowtype;
  v_rx_purchased numeric(12,2);
begin
  perform public.pawcruz_pos_assert_staff(p_actor_id);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A void reason is required'; end if;

  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status in ('Voided', 'Cancelled') then raise exception 'This transaction was already reversed'; end if;

  -- Undo the prescription-fulfillment increment made at checkout time, for
  -- every invoiced line tied to a prescription -- regardless of whether this
  -- transaction ever actually collected payment.
  for v_rx_item in
    select * from public.transaction_items
    where transaction_id = v_transaction.id and prescription_id is not null
  loop
    select * into v_prescription from public.prescriptions where id = v_rx_item.prescription_id for update;
    if found then
      v_rx_purchased := greatest(0, v_prescription.total_quantity_purchased - v_rx_item.quantity);
      update public.prescriptions
      set total_quantity_purchased = v_rx_purchased,
          fulfillment_status = case
            when fulfillment_status = 'Purchasing Elsewhere' then fulfillment_status
            when v_rx_purchased >= prescribed_quantity and v_rx_purchased > 0 then 'Fully Purchased'
            when v_rx_purchased > 0 then 'Partially Purchased'
            else 'Not Purchased'
          end
      where id = v_rx_item.prescription_id;
    end if;
  end loop;

  if v_transaction.payment_status = 'Pending' then
    update public.transactions set payment_status = 'Voided', status_reason = p_reason, status_changed_by = p_actor_id, status_changed_at = now(), updated_at = now() where id = v_transaction.id;
    insert into public.transaction_audit_log (transaction_id, action, previous_status, new_status, reason, performed_by)
    values (v_transaction.id, 'Transaction voided', 'Pending', 'Voided', p_reason, p_actor_id);
    return v_transaction.id;
  end if;

  -- Restore each FIFO batch this checkout/settlement actually drew from.
  for v_inv_tx in
    select * from public.inventory_transactions
    where reference_type = 'POS Transaction' and reference_id = v_transaction.id and transaction_type = 'Stock Out'
  loop
    if v_inv_tx.batch_id is not null then
      select quantity_remaining into v_batch_before from public.inventory_batches where id = v_inv_tx.batch_id for update;
      v_batch_after := coalesce(v_batch_before, 0) + v_inv_tx.quantity;
      update public.inventory_batches set quantity_remaining = v_batch_after where id = v_inv_tx.batch_id;
    else
      -- Pre-FIFO transaction (no batch on record) -- fall back to the old
      -- behavior of restoring straight onto the item.
      update public.inventory_items set quantity = coalesce(quantity, 0) + v_inv_tx.quantity where id = v_inv_tx.item_id;
    end if;

    insert into public.inventory_transactions (
      item_id, batch_id, transaction_type, quantity, quantity_before, quantity_after,
      reason, notes, reference_type, reference_id, reference_number, created_by
    ) values (
      v_inv_tx.item_id, v_inv_tx.batch_id, 'Stock In', v_inv_tx.quantity, v_batch_before, v_batch_after,
      'POS void', 'Restored from void for ' || coalesce(v_transaction.or_number, v_transaction.id::text),
      'POS Transaction', v_transaction.id, v_transaction.or_number, p_actor_id
    );
  end loop;

  update public.transactions
  set payment_status = 'Voided',
      status_reason = p_reason,
      status_changed_by = p_actor_id,
      status_changed_at = now(),
      updated_at = now()
  where id = v_transaction.id;

  insert into public.transaction_audit_log (transaction_id, action, previous_status, new_status, reason, details, performed_by)
  values (v_transaction.id, 'Transaction voided', v_transaction.payment_status, 'Voided', p_reason, jsonb_build_object('restored_amount', v_transaction.total_amount), p_actor_id);

  return v_transaction.id;
end;
$$;

grant execute on function public.pawcruz_reverse_pos_transaction(uuid,text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
