-- PawCruz FIFO Batch-Tracked Inventory, connected to POS.
-- Run this once in the Supabase SQL Editor. Safe to re-run.
--
-- Verified live before writing this (this session found the repo's SQL
-- files repeatedly drift from what's actually deployed):
--   * inventory_items / inventory_transactions / transactions /
--     transaction_items schemas were read directly from the live database.
--   * pawcruz_record_inventory_transaction(uuid,text,numeric,text,text,text,uuid,uuid)
--     is live and is the only path that mutates inventory_items.quantity today.
--   * pawcruz_checkout_pos_transaction's exact behavior (or_number format,
--     totals math, per-item inventory_transactions logging) was confirmed by
--     running one real test transaction and voiding it immediately.a
--   * pawcruz_settle_pos_transaction (the GCash Pending -> Paid settlement
--     path) does NOT exist live at all -- created fresh here.
--   * transactions.split_payment_details does not exist live even though the
--     app already reads/writes it -- added here as a side-fix, purely
--     additive and harmless.
--   * The notification-on-alert layer (Low Stock / Out of Stock / Near
--     Expiry / Expired) is not live at all today -- shipped here for real.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Batches table
-- ---------------------------------------------------------------------

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  batch_number text,
  quantity_received numeric(12,2) not null check (quantity_received > 0),
  quantity_remaining numeric(12,2) not null check (quantity_remaining >= 0),
  date_received date not null default current_date,
  expiry_date date,
  status text not null default 'Active',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_batches_item on public.inventory_batches(item_id);
create index if not exists idx_inventory_batches_fifo on public.inventory_batches(item_id, date_received);

alter table public.inventory_transactions add column if not exists batch_id uuid references public.inventory_batches(id) on delete set null;
alter table public.transactions add column if not exists split_payment_details jsonb;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.inventory_batches to anon, authenticated;
alter table public.inventory_batches enable row level security;
drop policy if exists "PawCruz inventory batches demo access" on public.inventory_batches;
create policy "PawCruz inventory batches demo access" on public.inventory_batches for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_batches'
  ) then
    alter publication supabase_realtime add table public.inventory_batches;
  end if;
end $$;

-- One-time migration: give every item that currently holds stock a single
-- "legacy" batch carrying over its existing batch_number/expiry_date/quantity,
-- so no stock is lost when FIFO tracking turns on. Guarded so re-running this
-- script never duplicates batches.
insert into public.inventory_batches (item_id, batch_number, quantity_received, quantity_remaining, date_received, expiry_date, created_by)
select id, nullif(btrim(coalesce(batch_number, '')), ''), quantity, quantity, coalesce(created_at::date, current_date), expiry_date, created_by
from public.inventory_items
where coalesce(quantity, 0) > 0
  and not exists (select 1 from public.inventory_batches b where b.item_id = inventory_items.id);

-- ---------------------------------------------------------------------
-- 2. Batch status + parent item sync
-- ---------------------------------------------------------------------

create or replace function public.pawcruz_batch_status(p_quantity_remaining numeric, p_expiry_date date)
returns text
language plpgsql
stable
as $$
begin
  if p_expiry_date is not null and p_expiry_date < current_date then return 'Expired'; end if;
  if coalesce(p_quantity_remaining, 0) <= 0 then return 'Depleted'; end if;
  return 'Active';
end;
$$;

create or replace function public.pawcruz_update_inventory_batch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.status := public.pawcruz_batch_status(new.quantity_remaining, new.expiry_date);
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_inventory_batch_update on public.inventory_batches;
create trigger trg_pawcruz_inventory_batch_update
before insert or update on public.inventory_batches
for each row execute function public.pawcruz_update_inventory_batch();

-- Keeps inventory_items.quantity/expiry_date/batch_number as a maintained
-- aggregate over batches, so every existing reader of those item-level
-- fields (POS picker, Inventory list, CSV export, AI forecasts) keeps
-- working unchanged. The item's own status trigger (already live) then
-- recomputes status from these same fields exactly as it does today.
create or replace function public.pawcruz_sync_item_from_batches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_total numeric(12,2);
  v_next_expiry date;
  v_next_batch text;
begin
  v_item_id := coalesce(new.item_id, old.item_id);

  select coalesce(sum(quantity_remaining), 0) into v_total
  from public.inventory_batches
  where item_id = v_item_id and status = 'Active';

  select expiry_date, batch_number into v_next_expiry, v_next_batch
  from public.inventory_batches
  where item_id = v_item_id and status = 'Active'
  order by expiry_date asc nulls last, date_received asc
  limit 1;

  update public.inventory_items
  set quantity = v_total,
      expiry_date = coalesce(v_next_expiry, expiry_date),
      batch_number = coalesce(v_next_batch, batch_number)
  where id = v_item_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_pawcruz_sync_item_from_batches on public.inventory_batches;
create trigger trg_pawcruz_sync_item_from_batches
after insert or update or delete on public.inventory_batches
for each row execute function public.pawcruz_sync_item_from_batches();

-- ---------------------------------------------------------------------
-- 3. Notifications: Low Stock / Out of Stock / Near Expiry / Expired
-- ---------------------------------------------------------------------

create or replace function public.pawcruz_notify_inventory_alert(
  p_item_id uuid,
  p_item_name text,
  p_status text,
  p_quantity numeric,
  p_reorder_level numeric,
  p_unit text,
  p_expiry_date date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_message text;
  v_qty text;
  v_reorder text;
begin
  v_qty := case when p_quantity = trunc(p_quantity)
    then trim(to_char(p_quantity, 'FM999999990'))
    else trim(to_char(p_quantity, 'FM999999990.99'))
  end;
  v_reorder := case when p_reorder_level = trunc(p_reorder_level)
    then trim(to_char(p_reorder_level, 'FM999999990'))
    else trim(to_char(p_reorder_level, 'FM999999990.99'))
  end;

  if p_status = 'Out of Stock' then
    v_title := 'Out of stock: ' || p_item_name;
    v_message := p_item_name || ' has run out of stock (0 ' || coalesce(p_unit, 'units') || ' on hand). Restock as soon as possible.';
  elsif p_status = 'Low Stock' then
    v_title := 'Low stock: ' || p_item_name;
    v_message := p_item_name || ' is low on stock: ' || v_qty || ' ' || coalesce(p_unit, 'units') || ' left (reorder level ' || v_reorder || '). Consider restocking soon.';
  elsif p_status = 'Expired' then
    v_title := 'Expired: ' || p_item_name;
    v_message := p_item_name || ' expired on ' || to_char(p_expiry_date, 'Mon DD, YYYY') || '. Remove it from usable stock.';
  elsif p_status = 'Near Expiry' then
    v_title := 'Expiring soon: ' || p_item_name;
    v_message := p_item_name || ' expires on ' || to_char(p_expiry_date, 'Mon DD, YYYY') || '. Use or rotate this stock soon.';
  else
    return;
  end if;

  insert into public.notifications (
    recipient_id, title, message, notification_type, related_module, related_record, created_by
  )
  select id, v_title, v_message, 'Inventory Alert', 'Inventory', p_item_id::text, null
  from public.profiles
  where role in ('admin', 'staff');
end;
$$;

create or replace function public.pawcruz_notify_inventory_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_archived, false) = false
     and new.status in ('Low Stock', 'Out of Stock', 'Near Expiry', 'Expired')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.pawcruz_notify_inventory_alert(
      new.id, new.item_name, new.status, new.quantity, new.reorder_level, new.unit, new.expiry_date
    );
  end if;
  return new;
end;
$$;

-- Superseding both older, never-fully-deployed notification designs from
-- supabase/inventory_stock_notifications.sql and
-- supabase/user_reports_notifications.sql so only one trigger ever fires.
drop trigger if exists trg_notify_low_inventory on public.inventory_items;
drop trigger if exists trg_pawcruz_notify_inventory_status on public.inventory_items;
create trigger trg_pawcruz_notify_inventory_status
after insert or update on public.inventory_items
for each row execute function public.pawcruz_notify_inventory_status_change();

-- Re-checks every active item against today's date and nudges any row whose
-- status has drifted purely from time passing (an item silently crossing
-- into Near Expiry/Expired without anyone touching it). The app already
-- calls this client-side every 5 minutes via reconcileInventoryStatus() in
-- inventoryService.js -- it has been silently no-op-ing until now because
-- this function didn't exist live.
create or replace function public.pawcruz_reconcile_inventory_status()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.inventory_items
  set updated_at = now()
  where coalesce(is_archived, false) = false;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.pawcruz_notify_inventory_alert(uuid,text,text,numeric,numeric,text,date) to anon, authenticated;
grant execute on function public.pawcruz_reconcile_inventory_status() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. pawcruz_record_inventory_transaction: FIFO create/consume
-- ---------------------------------------------------------------------

drop function if exists public.pawcruz_record_inventory_transaction(uuid,text,numeric,text,text,text,uuid,uuid);

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

  -- Deduction paths: FIFO oldest date_received first, never touching
  -- expired batches -- except the 'Expired' transaction type itself, which
  -- exists specifically to write off stock a physical check found expired.
  v_remaining := p_quantity;

  for v_batch in
    select * from public.inventory_batches
    where item_id = p_item_id
      and quantity_remaining > 0
      and status = case when p_transaction_type = 'Expired' then 'Expired' else 'Active' end
    order by date_received asc, created_at asc
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

-- ---------------------------------------------------------------------
-- 5. POS checkout + GCash settlement: same confirmed-live behavior,
--    FIFO deduction via pawcruz_record_inventory_transaction above.
-- ---------------------------------------------------------------------

drop function if exists public.pawcruz_checkout_pos_transaction(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb,text,uuid);

create or replace function public.pawcruz_checkout_pos_transaction(
  p_pet_id uuid,
  p_owner_id uuid,
  p_checkup_fee numeric,
  p_items jsonb,
  p_medical_record_id uuid default null,
  p_appointment_id uuid default null,
  p_staff_id uuid default null,
  p_payment_method text default 'Cash',
  p_payment_status text default 'Paid',
  p_discount_amount numeric default 0,
  p_amount_paid numeric default 0,
  p_change_amount numeric default 0,
  p_split_payment_details jsonb default null,
  p_notes text default null,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_or_number text;
  v_transaction_id uuid;
  v_items_subtotal numeric(12,2) := 0;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_item jsonb;
  v_item_id uuid;
  v_line_total numeric(12,2);
  v_inventory_tx_id uuid;
begin
  perform public.pawcruz_pos_assert_staff(coalesce(p_staff_id, p_created_by));

  if not exists (select 1 from public.pets where id = p_pet_id and owner_id = p_owner_id) then
    raise exception 'The selected pet does not belong to the selected owner';
  end if;

  select coalesce(sum(round((item->>'quantity')::numeric * (item->>'unit_price')::numeric, 2)), 0)
  into v_items_subtotal
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;

  v_subtotal := coalesce(p_checkup_fee, 0) + v_items_subtotal;
  v_total := greatest(v_subtotal - coalesce(p_discount_amount, 0), 0);
  v_or_number := 'OR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.transactions (
    pet_id, owner_id, medical_record_id, appointment_id, staff_id, checkup_fee,
    items_subtotal, subtotal, discount_amount, total_amount, amount_paid, change_amount,
    payment_method, payment_status, split_payment_details, notes, or_number, created_by
  ) values (
    p_pet_id, p_owner_id, p_medical_record_id, p_appointment_id, p_staff_id, coalesce(p_checkup_fee, 0),
    v_items_subtotal, v_subtotal, coalesce(p_discount_amount, 0), v_total, coalesce(p_amount_paid, 0), coalesce(p_change_amount, 0),
    coalesce(p_payment_method, 'Cash'), coalesce(p_payment_status, 'Paid'), p_split_payment_details, p_notes, v_or_number, coalesce(p_created_by, p_staff_id)
  ) returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_item_id := nullif(v_item->>'inventory_item_id', '')::uuid;
    v_line_total := round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2);
    v_inventory_tx_id := null;

    if v_item_id is not null and coalesce(p_payment_status, 'Paid') = 'Paid' then
      v_inventory_tx_id := public.pawcruz_record_inventory_transaction(
        v_item_id, 'Stock Out', (v_item->>'quantity')::numeric,
        'POS sale', 'Deducted by POS transaction ' || v_or_number,
        'POS Transaction', v_transaction_id, coalesce(p_created_by, p_staff_id),
        null, null, null, v_or_number
      );
    end if;

    insert into public.transaction_items (
      transaction_id, inventory_item_id, item_type, item_name, quantity, unit_price, line_total, inventory_transaction_id
    ) values (
      v_transaction_id, v_item_id, coalesce(v_item->>'item_type', 'Product'), v_item->>'item_name',
      (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric, v_line_total, v_inventory_tx_id
    );
  end loop;

  return v_transaction_id;
end;
$$;

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

  update public.transactions
  set payment_status = 'Paid', amount_paid = total_amount, change_amount = 0,
      paymongo_payment_id = coalesce(p_payment_id, paymongo_payment_id), updated_at = now()
  where id = v_transaction.id;

  return v_transaction.id;
end;
$$;

grant execute on function public.pawcruz_checkout_pos_transaction(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb,text,uuid) to anon, authenticated;
grant execute on function public.pawcruz_settle_pos_transaction(uuid,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Void: restore stock to the exact original batch
-- ---------------------------------------------------------------------

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
  v_inv_tx public.inventory_transactions%rowtype;
  v_batch_before numeric(12,2);
  v_batch_after numeric(12,2);
begin
  perform public.pawcruz_pos_assert_staff(p_actor_id);
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A void reason is required'; end if;

  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status in ('Voided', 'Cancelled') then raise exception 'This transaction was already reversed'; end if;

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

-- Bring every item's stored status up to date immediately and send alerts
-- for anything already sitting in an alert state.
select public.pawcruz_reconcile_inventory_status();

notify pgrst, 'reload schema';
