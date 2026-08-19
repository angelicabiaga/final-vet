-- ============================================================================
-- PawCruz -- RUN THIS ONCE in the Supabase SQL Editor.
--
-- This is the individual-unit tracking + batch active/inactive toggle work,
-- bundled into one file in the correct order. Run this AFTER RUN_THIS_ONCE.sql
-- (the earlier bundle) has already been applied.
--
-- HOW TO RUN THIS:
--   1. Open your project at https://supabase.com/dashboard
--   2. In the left sidebar, click "SQL Editor"
--   3. Click "New query"
--   4. Copy this entire file and paste it into the editor
--   5. Click "Run" (or press Ctrl+Enter)
--   6. You should see a result at the bottom with no red error banner -- that's it.
--
-- What this fixes / unlocks:
--   * The "Unable to load batch records for this item" error and
--     "0 active batches" you're seeing right now -- that's the app already
--     asking your database for a column (is_active) that doesn't exist
--     there yet. This file creates it.
--   * Individual unit records (Unit ID, Status: Available/Used/Sold/Expired)
--     under each batch, auto-created whenever stock comes in.
--   * The "Deactivate"/"Activate" button on each batch.
--   * Buying "2 WAY TEST" (or anything else) through POS should work again
--     once this is applied.
-- ============================================================================


-- ============================================================================
-- PART 1 of 2: INVENTORY_UNIT_TRACKING.sql
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
-- PART 2 of 2: INVENTORY_BATCH_ACTIVE_TOGGLE.sql
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
