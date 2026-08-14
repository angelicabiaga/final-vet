-- Run this in the Supabase SQL Editor to deploy Void support.
--
-- This has been rewritten to match your ACTUAL live database schema
-- (verified with live queries), which differs from
-- supabase/pos_transaction_history_module.sql:
--   * transactions has status_reason / status_changed_by / status_changed_at
--     instead of voided_at / voided_by / void_reason / refunded_*
--   * transaction_items has no deduct_inventory or refunded_quantity columns
--   * the audit table is named transaction_audit_log (singular), with a
--     new_status column instead of next_status
--
-- None of these functions existed live before, which is why Void did
-- nothing (confirmed via PGRST202 "function not found" errors).

create or replace function public.pawcruz_pos_assert_staff(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = p_actor_id;
  if coalesce(v_role, '') not in ('staff', 'admin') then
    raise exception 'Only authorized staff or administrators can perform POS actions';
  end if;
end;
$$;

grant execute on function public.pawcruz_pos_assert_staff(uuid) to anon, authenticated;

drop function if exists public.pawcruz_reverse_pos_transaction(uuid, text, text, uuid, uuid[]);
drop function if exists public.pawcruz_reverse_pos_transaction(uuid, text, uuid);

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
  v_item public.transaction_items%rowtype;
  v_stock_before numeric(12,2);
  v_stock_after numeric(12,2);
begin
  perform public.pawcruz_pos_assert_staff(p_actor_id);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A void reason is required'; end if;

  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status in ('Voided', 'Cancelled') then raise exception 'This transaction was already reversed'; end if;

  if v_transaction.payment_status = 'Paid' then
    for v_item in
      select * from public.transaction_items
      where transaction_id = v_transaction.id and inventory_item_id is not null
      for update
    loop
      select quantity into v_stock_before from public.inventory_items where id = v_item.inventory_item_id for update;
      if found then
        v_stock_after := v_stock_before + v_item.quantity;
        update public.inventory_items set quantity = v_stock_after where id = v_item.inventory_item_id;
        insert into public.inventory_transactions (
          item_id, transaction_type, quantity, quantity_before, quantity_after,
          reason, notes, reference_type, reference_id, reference_number, created_by
        ) values (
          v_item.inventory_item_id, 'Stock In', v_item.quantity, v_stock_before, v_stock_after,
          'POS void', 'Restored from void for ' || coalesce(v_transaction.or_number, v_transaction.id::text),
          'POS Transaction', v_transaction.id, v_transaction.or_number, p_actor_id
        );
      end if;
    end loop;
  end if;

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
