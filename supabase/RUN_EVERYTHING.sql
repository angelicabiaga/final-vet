-- ============================================================================
-- PawCruz -- RUN THIS ONCE in the Supabase SQL Editor.
--
-- This is every SQL change from this entire session, bundled into a single
-- file in the correct dependency order. It is safe to run even if some or
-- all of it is already applied to your database -- every piece uses
-- "create or replace function", "create table if not exists", or
-- "drop trigger/policy if exists" before recreating, so nothing here can
-- duplicate data, error out on a second run, or undo anything you already
-- have working.
--
-- HOW TO RUN THIS:
--   1. Open your project at https://supabase.com/dashboard
--   2. In the left sidebar, click "SQL Editor"
--   3. Click "New query"
--   4. Copy this entire file and paste it into the editor
--   5. Click "Run" (or press Ctrl+Enter)
--   6. You should see a result with no red error banner -- that's it, done.
--
-- What running this unlocks, all at once:
--   * Staff get notified when a pet owner books an appointment online.
--   * Pet owners get notified when staff books an appointment for them.
--   * Pet owners get notified on status changes AND reschedules.
--   * Everyone gets notified when someone sends them a message.
--   * Staff/Admin get Low Stock / Out of Stock / Near Expiry / Expired
--     inventory alerts.
--   * FIFO/FEFO batch-tracked inventory connected to POS (oldest-expiring
--     batch deducted first, spills into the next batch automatically).
--   * Individual unit records (Unit ID, Available/Used/Sold/Expired) under
--     each batch.
--   * The "Deactivate"/"Activate" switch on a batch.
--   * The "Merge into this item" button for duplicate inventory items.
--   * Voiding a transaction correctly rolls back prescriptions, batch
--     quantities, AND individual units it had marked sold.
--   * A permanent log of every "Purchasing Elsewhere" declaration.
-- ============================================================================


-- ============================================================================
-- PART 1 of 10: APPOINTMENT_REALTIME_SYNC.sql
-- ============================================================================

-- PawCruz Appointment Realtime Sync
-- Run this once in the same Supabase project used by both web and mobile.

-- Publish appointment changes to Supabase Realtime.
do $$ begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null;
end $$;

-- Notify Staff/Admin when a Pet Owner books an online appointment.
create or replace function public.notify_staff_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pet_name_value text;
  owner_name_value text;
  vet_name_value text;
begin
  if tg_op = 'INSERT' and new.appointment_source = 'Online' then
    select p.pet_name into pet_name_value from public.pets p where p.id = new.pet_id;
    select pr.full_name into owner_name_value from public.profiles pr where pr.id = new.owner_id;
    select pr.full_name into vet_name_value from public.profiles pr where pr.id = new.veterinarian_id;

    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    )
    select
      staff.id,
      'New Online Appointment',
      coalesce(owner_name_value, 'A pet owner') || ' booked ' ||
      coalesce(pet_name_value, 'a pet') || ' with ' ||
      coalesce(vet_name_value, 'a veterinarian') || ' on ' ||
      to_char(new.appointment_date, 'Mon DD, YYYY') || ' at ' ||
      to_char(new.start_time, 'HH12:MI AM'),
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    from public.profiles staff
    where lower(staff.role) in ('staff','admin')
      and lower(coalesce(staff.account_status, 'active')) = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_staff_new_appointment on public.appointments;
create trigger trg_notify_staff_new_appointment
after insert on public.appointments
for each row execute function public.notify_staff_new_appointment();

-- Notify the owner whenever Staff changes appointment status.
create or replace function public.notify_owner_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment ' || new.status,
      'Your appointment on ' || to_char(new.appointment_date, 'Mon DD, YYYY') ||
      ' at ' || to_char(new.start_time, 'HH12:MI AM') ||
      ' is now ' || new.status || '.',
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_appointment_change on public.appointments;
create trigger trg_notify_owner_appointment_change
after update of status on public.appointments
for each row execute function public.notify_owner_appointment_change();

notify pgrst, 'reload schema';


-- ============================================================================
-- PART 2 of 10: VOID_TRANSACTION_FUNCTION.sql
-- ============================================================================

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


-- ============================================================================
-- PART 3 of 10: FIFO_INVENTORY_BATCHES.sql
-- ============================================================================

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


-- ============================================================================
-- PART 4 of 10: INVENTORY_FEFO_DEDUCTION.sql
-- ============================================================================

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


-- ============================================================================
-- PART 5 of 10: PRESCRIPTION_VOID_ROLLBACK.sql
-- ============================================================================

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


-- ============================================================================
-- PART 6 of 10: INVENTORY_MERGE_DUPLICATES.sql
-- ============================================================================

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


-- ============================================================================
-- PART 7 of 10: INVENTORY_UNIT_TRACKING.sql
-- ============================================================================

-- PawCruz: Item -> Batch -> Individual Unit Records.
--
-- Adds a third tracking level under the existing inventory_batches: every
-- batch's quantity_received is exploded into that many individual
-- inventory_units rows (Unique Unit ID, inherited Batch Number/Expiration,
-- Status: Available/Used/Sold/Expired). Selling or using stock through POS
-- now also flips the specific unit rows consumed, not just the batch's
-- quantity_remaining counter -- and voiding a transaction restores them,
-- the same way it already restores quantity_remaining.
--
-- Apply this once in the Supabase SQL editor, after FIFO_INVENTORY_BATCHES.sql,
-- INVENTORY_FEFO_DEDUCTION.sql, and PRESCRIPTION_VOID_ROLLBACK.sql.

-- ---------------------------------------------------------------------
-- 1. Units table
-- ---------------------------------------------------------------------

create table if not exists public.inventory_units (
  id uuid primary key default gen_random_uuid(),
  unit_no bigserial not null unique,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  batch_id uuid not null references public.inventory_batches(id) on delete cascade,
  status text not null default 'Available' check (status in ('Available', 'Used', 'Sold', 'Expired')),
  transaction_id uuid references public.transactions(id) on delete set null,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_units_batch on public.inventory_units(batch_id, status, created_at);
create index if not exists idx_inventory_units_item on public.inventory_units(item_id);
create index if not exists idx_inventory_units_transaction on public.inventory_units(transaction_id);

grant select, insert, update, delete on public.inventory_units to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter table public.inventory_units enable row level security;
drop policy if exists "PawCruz inventory units demo access" on public.inventory_units;
create policy "PawCruz inventory units demo access" on public.inventory_units for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_units'
  ) then
    alter publication supabase_realtime add table public.inventory_units;
  end if;
end $$;

create or replace function public.pawcruz_update_inventory_unit()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_update_inventory_unit on public.inventory_units;
create trigger trg_pawcruz_update_inventory_unit
before update on public.inventory_units
for each row execute function public.pawcruz_update_inventory_unit();

-- ---------------------------------------------------------------------
-- 2. Auto-generate one unit row per piece received, whenever a batch is
--    created (Stock In / Adjustment Add already insert a new
--    inventory_batches row -- this is the only place batches are created).
-- ---------------------------------------------------------------------

create or replace function public.pawcruz_generate_units_for_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  v_count int;
begin
  if exists (select 1 from public.inventory_units where batch_id = new.id) then
    return new;
  end if;

  v_count := floor(new.quantity_received)::int;
  for i in 1..v_count loop
    insert into public.inventory_units (item_id, batch_id, status, created_by)
    values (new.item_id, new.id, 'Available', new.created_by);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_pawcruz_generate_units_for_batch on public.inventory_batches;
create trigger trg_pawcruz_generate_units_for_batch
after insert on public.inventory_batches
for each row execute function public.pawcruz_generate_units_for_batch();

-- One-time backfill for batches that already existed before this migration:
-- create their units now, marking (received - remaining) of them as
-- 'Used' so the unit count already reconciles with today's
-- quantity_remaining (history doesn't distinguish Used vs Sold for stock
-- consumed before unit tracking existed, so 'Used' is the neutral choice).
do $$
declare
  v_batch record;
  i int;
  v_already_gone int;
begin
  for v_batch in
    select * from public.inventory_batches b
    where not exists (select 1 from public.inventory_units u where u.batch_id = b.id)
  loop
    v_already_gone := floor(v_batch.quantity_received)::int - floor(v_batch.quantity_remaining)::int;
    for i in 1..floor(v_batch.quantity_received)::int loop
      insert into public.inventory_units (item_id, batch_id, status, used_at, created_by, created_at)
      values (
        v_batch.item_id, v_batch.id,
        case when i <= v_already_gone then 'Used' else 'Available' end,
        case when i <= v_already_gone then v_batch.updated_at else null end,
        v_batch.created_by, v_batch.created_at
      );
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. When a batch's status turns Expired, expire its still-Available
--    units too (Used/Sold units are a settled historical fact and never
--    flip back retroactively).
-- ---------------------------------------------------------------------

create or replace function public.pawcruz_update_inventory_batch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.status := public.pawcruz_batch_status(new.quantity_remaining, new.expiry_date);

  if new.status = 'Expired' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.inventory_units
    set status = 'Expired'
    where batch_id = new.id and status = 'Available';
  end if;

  return new;
end;
$$;

-- (trigger trg_pawcruz_inventory_batch_update already attached to this
-- function by FIFO_INVENTORY_BATCHES.sql; create or replace above updates
-- its body in place, no need to redeclare the trigger itself.)

-- ---------------------------------------------------------------------
-- 4. Extend pawcruz_record_inventory_transaction: every batch the FEFO
--    loop deducts from also flips that many of its Available units to the
--    status matching what happened to them.
-- ---------------------------------------------------------------------

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
  v_unit_status text;
  v_pos_transaction_id uuid;
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
    -- trg_pawcruz_generate_units_for_batch creates the unit rows for this
    -- batch automatically.

    insert into public.inventory_transactions (
      item_id, batch_id, transaction_type, quantity, quantity_before, quantity_after,
      reason, notes, reference_type, reference_id, reference_number, created_by
    ) values (
      p_item_id, v_new_batch_id, p_transaction_type, p_quantity, v_item.quantity, v_item.quantity + p_quantity,
      p_reason, p_notes, p_reference_type, p_reference_id, p_reference_number, p_created_by
    ) returning id into v_transaction_id;

    return v_transaction_id;
  end if;

  -- Which unit status this deduction settles into, and (for POS sales
  -- only) which transactions.id to stamp on the units so a later void can
  -- find and restore exactly these units.
  v_unit_status := case
    when p_transaction_type = 'Stock Out' then 'Sold'
    when p_transaction_type = 'Expired' then 'Expired'
    else 'Used'
  end;
  v_pos_transaction_id := case when p_reference_type = 'POS Transaction' then p_reference_id else null end;

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

    -- Flip exactly v_take of this batch's Available units. Units are
    -- fungible within a batch (no serial-number distinction), so the
    -- oldest-created Available rows are picked deterministically.
    update public.inventory_units
    set status = v_unit_status,
        transaction_id = v_pos_transaction_id,
        inventory_transaction_id = v_transaction_id,
        used_at = now()
    where id in (
      select id from public.inventory_units
      where batch_id = v_batch.id and status = 'Available'
      order by created_at asc, unit_no asc
      limit v_take::int
      for update
    );

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
-- 5. Voiding a POS transaction restores the units it sold back to
--    Available, the same way it already restores quantity_remaining --
--    matched by the transaction_id stamped on them above.
-- ---------------------------------------------------------------------

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

  -- Restore any individual units this transaction sold back to Available.
  update public.inventory_units
  set status = 'Available',
      transaction_id = null,
      inventory_transaction_id = null,
      used_at = null
  where transaction_id = v_transaction.id;

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


-- ============================================================================
-- PART 8 of 10: INVENTORY_BATCH_ACTIVE_TOGGLE.sql
-- ============================================================================

-- PawCruz: manual Active/Inactive switch on a whole batch.
--
-- Separate from the existing auto-computed batch `status` column
-- (Active/Expired/Depleted, driven by quantity_remaining and expiry_date --
-- do not touch that here). This adds a second, staff-controlled flag: a
-- batch can be manually taken out of POS rotation (e.g. pulled for a
-- quality check) without it being expired or empty, and put back later.
-- FEFO deduction skips inactive batches entirely.
--
-- Apply this once in the Supabase SQL editor, after FIFO_INVENTORY_BATCHES.sql,
-- INVENTORY_FEFO_DEDUCTION.sql, and INVENTORY_UNIT_TRACKING.sql.

alter table public.inventory_batches add column if not exists is_active boolean not null default true;

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
  v_unit_status text;
  v_pos_transaction_id uuid;
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

  v_unit_status := case
    when p_transaction_type = 'Stock Out' then 'Sold'
    when p_transaction_type = 'Expired' then 'Expired'
    else 'Used'
  end;
  v_pos_transaction_id := case when p_reference_type = 'POS Transaction' then p_reference_id else null end;

  -- Deduction paths: FEFO -- nearest expiration first (batches with no
  -- expiry date are used last, since they carry no expiry urgency), tied
  -- broken by whichever arrived earlier. Never touches expired, depleted,
  -- or manually-deactivated batches -- except the 'Expired' transaction
  -- type itself, which exists specifically to write off stock a physical
  -- check found expired.
  v_remaining := p_quantity;

  for v_batch in
    select * from public.inventory_batches
    where item_id = p_item_id
      and quantity_remaining > 0
      and is_active = true
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

    update public.inventory_units
    set status = v_unit_status,
        transaction_id = v_pos_transaction_id,
        inventory_transaction_id = v_transaction_id,
        used_at = now()
    where id in (
      select id from public.inventory_units
      where batch_id = v_batch.id and status = 'Available'
      order by created_at asc, unit_no asc
      limit v_take::int
      for update
    );

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


-- ============================================================================
-- PART 9 of 10: PRESCRIPTION_ELSEWHERE_LOG.sql
-- ============================================================================

-- PawCruz: a permanent, browsable record of every "Purchasing Elsewhere"
-- declaration -- even though no money changes hands and nothing touches
-- the transactions table, staff still need a discoverable, timestamped
-- trail of it (not just a mutable status field on the prescription that
-- could get overwritten with no history).
--
-- Apply this once in the Supabase SQL editor.

create table if not exists public.prescription_activity_log (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  queue_entry_id uuid references public.queue_entries(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  item_name text not null,
  action text not null default 'Purchasing Elsewhere',
  remaining_quantity numeric(12,2),
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prescription_activity_log_created on public.prescription_activity_log(created_at desc);
create index if not exists idx_prescription_activity_log_prescription on public.prescription_activity_log(prescription_id);

grant select, insert on public.prescription_activity_log to anon, authenticated;
alter table public.prescription_activity_log enable row level security;
drop policy if exists "PawCruz prescription activity log demo access" on public.prescription_activity_log;
create policy "PawCruz prescription activity log demo access" on public.prescription_activity_log for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prescription_activity_log'
  ) then
    alter publication supabase_realtime add table public.prescription_activity_log;
  end if;
end $$;

notify pgrst, 'reload schema';


-- ============================================================================
-- PART 10 of 10: NOTIFICATIONS_APPOINTMENTS_MESSAGES.sql
-- ============================================================================

-- PawCruz: fill the remaining notification gaps for real-time push +
-- sound/popup (the front-end sound/toast system reacts to ANY insert into
-- public.notifications -- this file is what actually creates the rows for
-- the events that didn't have one yet).
--
-- Covers:
--   1. A pet owner is notified when someone ELSE (staff/admin) creates an
--      appointment on their behalf -- today only the reverse direction
--      (owner books online -> staff notified) existed.
--   2. Rescheduling an appointment (date/time change with status staying
--      "Confirmed", per rescheduleAppointment() in appointmentService.js)
--      now notifies the owner -- today only a STATUS change did.
--   3. A new chat message notifies every other participant in the
--      conversation -- today messaging was completely disconnected from
--      the notifications table.
--
-- Apply this once in the Supabase SQL editor, after
-- APPOINTMENT_REALTIME_SYNC.sql and FINAL_REPAIR_messages_api.sql.

-- ---------------------------------------------------------------------
-- 1. Notify the owner when someone else books an appointment for them.
-- ---------------------------------------------------------------------

create or replace function public.notify_owner_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pet_name_value text;
  vet_name_value text;
begin
  if tg_op = 'INSERT' and new.created_by is distinct from new.owner_id then
    select p.pet_name into pet_name_value from public.pets p where p.id = new.pet_id;
    select pr.full_name into vet_name_value from public.profiles pr where pr.id = new.veterinarian_id;

    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment Booked',
      'An appointment for ' || coalesce(pet_name_value, 'your pet') || ' with ' ||
      coalesce(vet_name_value, 'a veterinarian') || ' was booked for ' ||
      to_char(new.appointment_date, 'Mon DD, YYYY') || ' at ' ||
      to_char(new.start_time, 'HH12:MI AM') || '.',
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_new_appointment on public.appointments;
create trigger trg_notify_owner_new_appointment
after insert on public.appointments
for each row execute function public.notify_owner_new_appointment();

-- ---------------------------------------------------------------------
-- 2. Extend the owner-appointment-change notification to also cover
--    reschedules (date/time changed, status unchanged) -- previously only
--    a status change (Confirmed/Completed/Cancelled) fired anything.
-- ---------------------------------------------------------------------

create or replace function public.notify_owner_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment ' || new.status,
      'Your appointment on ' || to_char(new.appointment_date, 'Mon DD, YYYY') ||
      ' at ' || to_char(new.start_time, 'HH12:MI AM') ||
      ' is now ' || new.status || '.',
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  elsif tg_op = 'UPDATE' and old.status = new.status and (
    old.appointment_date is distinct from new.appointment_date or
    old.start_time is distinct from new.start_time
  ) then
    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment Rescheduled',
      'Your appointment has been rescheduled to ' ||
      to_char(new.appointment_date, 'Mon DD, YYYY') || ' at ' ||
      to_char(new.start_time, 'HH12:MI AM') || '.',
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_appointment_change on public.appointments;
create trigger trg_notify_owner_appointment_change
after update of status, appointment_date, start_time on public.appointments
for each row execute function public.notify_owner_appointment_change();

-- ---------------------------------------------------------------------
-- 3. Notify every other conversation participant on a new message.
-- ---------------------------------------------------------------------

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_name text;
  v_preview text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  v_preview := coalesce(nullif(btrim(new.body), ''), 'Sent an attachment.');
  if length(v_preview) > 140 then
    v_preview := left(v_preview, 137) || '...';
  end if;

  insert into public.notifications (
    recipient_id, title, message, notification_type,
    related_module, related_record, created_by
  )
  select
    cp.profile_id,
    'New message from ' || coalesce(v_sender_name, 'PawCruz'),
    v_preview,
    'Message',
    'Messages',
    new.conversation_id,
    new.sender_id
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.profile_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
after insert on public.messages
for each row execute function public.notify_new_message();

notify pgrst, 'reload schema';
