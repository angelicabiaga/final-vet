-- PawCruz: a failed / cancelled / expired GCash payment must never count as
-- a payment, and the visit must go back to the Pending Billing Queue.
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Fixes:
--  1. pawcruz_cancel_pos_transaction (called by the paymongo-webhook on
--     source.expired / payment.failed, and by the GCash return page on a
--     failed redirect) wrote to a table that doesn't exist
--     (transaction_audit_logs), so it always errored and the transaction was
--     never cancelled. It also didn't undo the prescription quantities
--     checkout had already counted as purchased.
--  2. Nothing moved the visit's billing_status from 'Processing' back to
--     'Pending Billing' when its payment failed. A trigger now does that for
--     any Pending transaction that ends Cancelled or Voided (gateway failure,
--     QR closed/expired, abandoned checkout cleanup).
--
-- Cancelled/Voided transactions with nothing collected are already hidden
-- from Payment Transaction History, so no change is needed there.

begin;

create or replace function public.pawcruz_cancel_pos_transaction(
  p_transaction_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_rx_item public.transaction_items%rowtype;
  v_prescription public.prescriptions%rowtype;
  v_rx_purchased numeric(12,2);
begin
  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status in ('Cancelled', 'Voided', 'Refunded') then return v_transaction.id; end if;
  if v_transaction.payment_status <> 'Pending' then
    raise exception 'Only a pending payment can be cancelled by the payment gateway';
  end if;

  -- Undo the prescription-fulfillment increment checkout made for this
  -- (never-paid) transaction -- same as pawcruz_reverse_pos_transaction.
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

  update public.transactions
  set payment_status = 'Cancelled',
      notes = concat_ws(' ', notes, 'Gateway cancellation:', p_reason),
      updated_at = now()
  where id = v_transaction.id;

  -- The audit trail is best-effort: a logging problem must never stop the
  -- cancellation itself.
  begin
    insert into public.transaction_audit_log (transaction_id, action, previous_status, new_status, reason, performed_by)
    values (v_transaction.id, 'Payment gateway cancelled', 'Pending', 'Cancelled', p_reason, v_transaction.created_by);
  exception when others then
    null;
  end;

  return v_transaction.id;
end;
$$;

grant execute on function public.pawcruz_cancel_pos_transaction(uuid,text) to anon, authenticated;

-- Puts the visit back in the Pending Billing Queue when its in-flight
-- payment fails, unless another payment attempt for it is still pending.
create or replace function public.pawcruz_release_billing_on_failed_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.queue_entry_id is not null
     and old.payment_status = 'Pending'
     and new.payment_status in ('Cancelled', 'Voided')
     and not exists (
       select 1 from public.transactions t
       where t.queue_entry_id = new.queue_entry_id
         and t.id <> new.id
         and t.payment_status = 'Pending'
     ) then
    update public.queue_entries
       set billing_status = 'Pending Billing'
     where id = new.queue_entry_id
       and billing_status = 'Processing';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_release_billing_on_failed_payment on public.transactions;
create trigger trg_pawcruz_release_billing_on_failed_payment
after update of payment_status on public.transactions
for each row execute function public.pawcruz_release_billing_on_failed_payment();

-- Repair: cancel GCash attempts already stuck on Pending for over an hour
-- (PayMongo GCash sources expire well before that), which also sends their
-- visits back to the Pending Billing Queue through the trigger above.
do $$
declare r record;
begin
  for r in
    select id from public.transactions
    where payment_status = 'Pending'
      and paymongo_source_id is not null
      and created_at < now() - interval '1 hour'
  loop
    perform public.pawcruz_cancel_pos_transaction(r.id, 'GCash payment was never completed.');
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
