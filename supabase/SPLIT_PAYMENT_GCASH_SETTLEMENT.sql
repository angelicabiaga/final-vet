-- Run this once in the Supabase SQL Editor.
--
-- Lets a Split Payment's GCash portion go through a real PayMongo QR, the
-- same way the standalone "GCash" payment method already does.
--
-- pawcruz_settle_pos_transaction (called by the paymongo-webhook edge
-- function once PayMongo confirms a GCash source was paid) previously
-- always assumed the ENTIRE total_amount was just collected via GCash, and
-- hard-coded amount_paid = total_amount / payment_status = 'Paid'. That's
-- wrong for a Split Payment: only the GCash *portion* went through
-- PayMongo -- the Cash portion was already collected by staff up front.
--
-- This replaces the function in place (same name, same two parameters), so
-- the already-deployed webhook needs no redeploy or code change at all --
-- it keeps calling pawcruz_settle_pos_transaction exactly as before, and
-- just gets the corrected behavior automatically.
--
-- For a non-split (pure GCash) transaction, behavior is unchanged: the full
-- total_amount is what settles, status becomes 'Paid'.
--
-- For a Split Payment transaction, the settled amount is the declared split
-- total (Cash + GCash, read back from split_payment_details) -- which may
-- be less than total_amount for a deliberate partial payment, in which case
-- it settles as 'Partially Paid' instead of 'Paid', matching how a partial
-- Cash payment already behaves elsewhere in this app.

create or replace function public.pawcruz_settle_pos_transaction(
  p_transaction_id uuid,
  p_payment_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_item public.transaction_items%rowtype;
  v_inventory_tx_id uuid;
  v_declared_total numeric(12,2);
  v_final_status text;
  v_change numeric(12,2);
begin
  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status = 'Paid' then return v_transaction.id; end if;
  if v_transaction.payment_status <> 'Pending' then raise exception 'Only pending transactions can be settled'; end if;

  for v_item in
    select * from public.transaction_items
    where transaction_id = v_transaction.id and inventory_item_id is not null and inventory_transaction_id is null
    for update
  loop
    v_inventory_tx_id := public.pawcruz_record_inventory_transaction(
      v_item.inventory_item_id, 'Stock Out', v_item.quantity,
      'POS sale', 'Deducted by POS transaction ' || v_transaction.or_number,
      'POS Transaction', v_transaction.id, v_transaction.created_by,
      null, null, null, v_transaction.or_number
    );
    update public.transaction_items set inventory_transaction_id = v_inventory_tx_id where id = v_item.id;
  end loop;

  if v_transaction.payment_method = 'Split Payment' then
    select coalesce(sum(value::numeric), 0) into v_declared_total
    from jsonb_each_text(coalesce(v_transaction.split_payment_details, '{}'::jsonb));
  else
    v_declared_total := v_transaction.total_amount;
  end if;

  v_final_status := case when v_declared_total >= v_transaction.total_amount then 'Paid' else 'Partially Paid' end;
  v_change := greatest(v_declared_total - v_transaction.total_amount, 0);

  update public.transactions
  set payment_status = v_final_status, amount_paid = v_declared_total, change_amount = v_change,
      paymongo_payment_id = coalesce(p_payment_id, paymongo_payment_id), updated_at = now()
  where id = v_transaction.id;

  if v_final_status = 'Paid' and v_transaction.queue_entry_id is not null then
    update public.queue_entries set billing_status = 'Billed' where id = v_transaction.queue_entry_id;
    update public.queue_entries
    set status = 'Completed', consultation_ended_at = coalesce(consultation_ended_at, now())
    where id = v_transaction.queue_entry_id and status = 'Serving';
  end if;

  return v_transaction.id;
end;
$$;

grant execute on function public.pawcruz_settle_pos_transaction(uuid,text) to anon, authenticated;
