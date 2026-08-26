-- PawCruz: auto-generate Unique Unit IDs on the backend at Stock In time,
-- instead of requiring staff to type one per unit afterward.
--
-- Format: {SKU}-{BATCH}-{SEQUENCE}, e.g. TST-003-B2026TST003-001. SKU is the
-- item's own SKU as stored (dashes and all). BATCH is the batch number as
-- entered -- or, when none was entered, a safe internal reference this file
-- generates ('B' + current year + the SKU with every non-alphanumeric
-- character stripped, e.g. B2026TST003). SEQUENCE is a 3+ digit,
-- zero-padded, per-batch counter starting at 001.
--
-- Also adds a trigger making unit_code immutable once set (section 3 below)
-- -- the real backend enforcement behind the read-only Unique Unit ID field
-- in the UI, independent of whatever the frontend does or doesn't allow.
--
-- Apply this once in the Supabase SQL editor, after INVENTORY_UNIT_TRACKING.sql,
-- INVENTORY_UNIT_MANUAL_CODE.sql (defines unit_code and its unique index --
-- unchanged and reused here, not redefined), and
-- INVENTORY_CSV_IMPORT_DEDUPE.sql (this file's batch-reference generator
-- reuses pawcruz_normalize_text from that migration, and CSV imports
-- already create batches through pawcruz_record_inventory_transaction, so
-- redefining it here automatically makes CSV-imported stock generate unit
-- IDs too -- no separate change needed for that path).

-- ---------------------------------------------------------------------
-- 1. pawcruz_record_inventory_transaction: when a Stock In / Adjustment Add
-- batch is created with no batch number, generate one before the insert
-- (rather than storing a blank batch_number and generating it later),
-- checked against this item's existing batches so it can never collide
-- with the uniqueness constraint INVENTORY_CSV_IMPORT_DEDUPE.sql already
-- added on (item_id, normalized batch_number). Everything else in this
-- function (FEFO deduction order, is_active/status filtering, unit
-- flipping on sale/use) is unchanged from INVENTORY_BATCH_ACTIVE_TOGGLE.sql.
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
  v_batch_ref text;
  v_batch_base text;
  v_suffix int;
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

    -- A user-provided batch number is stored exactly as entered (trimmed
    -- only), unchanged from before. Only a blank one is filled in here --
    -- with a reference checked against this item's existing batches so it
    -- can never collide with the uniqueness constraint on (item_id,
    -- normalized batch_number).
    v_batch_ref := nullif(btrim(coalesce(p_batch_number, '')), '');

    if v_batch_ref is null then
      v_batch_base := 'B' || to_char(current_date, 'YYYY') || regexp_replace(upper(coalesce(v_item.sku, 'ITEM')), '[^A-Z0-9]', '', 'g');
      v_batch_ref := v_batch_base;
      v_suffix := 1;

      while exists (
        select 1 from public.inventory_batches
        where item_id = p_item_id
          and public.pawcruz_normalize_text(batch_number) = public.pawcruz_normalize_text(v_batch_ref)
      ) loop
        v_suffix := v_suffix + 1;
        v_batch_ref := v_batch_base || '-' || v_suffix;
      end loop;
    end if;

    insert into public.inventory_batches (item_id, batch_number, quantity_received, quantity_remaining, date_received, expiry_date, created_by)
    values (p_item_id, v_batch_ref, p_quantity, p_quantity, coalesce(p_date_received, current_date), p_expiry_date, p_created_by)
    returning id into v_new_batch_id;
    -- trg_pawcruz_generate_units_for_batch creates the unit rows (with
    -- their auto-generated Unique Unit IDs) for this batch automatically.

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

-- ---------------------------------------------------------------------
-- 2. pawcruz_generate_units_for_batch: by the time this fires, new.batch_number
-- is always set (the function above guarantees it), so every unit this
-- trigger creates gets a real {SKU}-{BATCH}-{SEQUENCE} code immediately --
-- staff never see a blank Unique Unit ID to fill in. Each unit also
-- inherits the batch's own expiry_date/date_received directly, since there
-- is no more per-unit manual override step.
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
  v_sku text;
  v_batch_ref text;
  v_code text;
  v_seq int;
begin
  if exists (select 1 from public.inventory_units where batch_id = new.id) then
    return new;
  end if;

  select sku into v_sku from public.inventory_items where id = new.item_id;
  v_batch_ref := upper(coalesce(nullif(btrim(new.batch_number), ''), 'BATCH'));

  v_count := floor(new.quantity_received)::int;
  v_seq := 0;

  for i in 1..v_count loop
    v_seq := v_seq + 1;
    v_code := upper(coalesce(v_sku, 'ITEM')) || '-' || v_batch_ref || '-' || lpad(v_seq::text, 3, '0');

    -- Structurally these can't collide (globally-unique SKU + a batch
    -- reference already unique per item + a sequence created once per
    -- batch), but check anyway before every insert per the requirement
    -- that generation must verify against the database, not just compute
    -- a formula and trust it.
    while exists (select 1 from public.inventory_units where unit_code = v_code) loop
      v_seq := v_seq + 1;
      v_code := upper(coalesce(v_sku, 'ITEM')) || '-' || v_batch_ref || '-' || lpad(v_seq::text, 3, '0');
    end loop;

    insert into public.inventory_units (item_id, batch_id, status, unit_code, expiry_date, date_received, created_by)
    values (new.item_id, new.id, 'Available', v_code, new.expiry_date, new.date_received, new.created_by);
  end loop;

  return new;
end;
$$;

-- (trigger trg_pawcruz_generate_units_for_batch already attached to this
-- function by INVENTORY_UNIT_TRACKING.sql; create or replace above updates
-- its body in place, no need to redeclare the trigger itself.)

-- ---------------------------------------------------------------------
-- 3. Make unit_code immutable once set, at the database level. The app's
-- own UI never writes unit_code any more (it's assigned only by
-- pawcruz_generate_units_for_batch above), but inventory_units' RLS policy
-- is the project's usual wide-open "demo access" policy -- it does not by
-- itself stop a direct table update from any authenticated/anon client.
-- This trigger is the real backstop: once a unit_code is set, no UPDATE
-- (through the app, the API, or anything else) can change it. A row whose
-- unit_code is still null (there are none going forward, only legacy rows
-- from before this migration) can still be filled in once.
-- ---------------------------------------------------------------------

create or replace function public.pawcruz_lock_inventory_unit_code()
returns trigger
language plpgsql
as $$
begin
  if old.unit_code is not null and new.unit_code is distinct from old.unit_code then
    raise exception 'Unique Unit ID is system-generated and cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pawcruz_lock_inventory_unit_code on public.inventory_units;
create trigger trg_pawcruz_lock_inventory_unit_code
before update on public.inventory_units
for each row execute function public.pawcruz_lock_inventory_unit_code();

notify pgrst, 'reload schema';
