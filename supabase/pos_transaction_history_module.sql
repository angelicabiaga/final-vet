-- PawCruz POS Payment Transaction History
-- Apply after appointment_module.sql and inventory_module.sql.
-- This script is idempotent and preserves existing transactions for audit history.

create extension if not exists pgcrypto;

create sequence if not exists public.pawcruz_pos_or_sequence;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  or_number text unique,
  pet_id uuid not null references public.pets(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  medical_record_id uuid,
  appointment_id uuid,
  staff_id uuid references public.profiles(id) on delete set null,
  checkup_fee numeric(12,2) not null default 0,
  items_subtotal numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  discount_rate numeric(7,4) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  payment_method text not null default 'Cash',
  split_payment_details jsonb,
  payment_status text not null default 'Paid',
  notes text,
  paid_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  refunded_at timestamptz,
  refunded_by uuid references public.profiles(id) on delete set null,
  refund_reason text,
  refunded_amount numeric(12,2) not null default 0,
  paymongo_source_id text,
  paymongo_payment_id text,
  paymongo_checkout_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions add column if not exists or_number text;
alter table public.transactions add column if not exists checkup_fee numeric(12,2) not null default 0;
alter table public.transactions add column if not exists items_subtotal numeric(12,2) not null default 0;
alter table public.transactions add column if not exists subtotal numeric(12,2) not null default 0;
alter table public.transactions add column if not exists discount_amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists discount_rate numeric(7,4) not null default 0;
alter table public.transactions add column if not exists total_amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists amount_paid numeric(12,2) not null default 0;
alter table public.transactions add column if not exists change_amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists payment_method text not null default 'Cash';
alter table public.transactions add column if not exists split_payment_details jsonb;
alter table public.transactions add column if not exists payment_status text not null default 'Paid';
alter table public.transactions add column if not exists paid_at timestamptz;
alter table public.transactions add column if not exists voided_at timestamptz;
alter table public.transactions add column if not exists voided_by uuid references public.profiles(id) on delete set null;
alter table public.transactions add column if not exists void_reason text;
alter table public.transactions add column if not exists refunded_at timestamptz;
alter table public.transactions add column if not exists refunded_by uuid references public.profiles(id) on delete set null;
alter table public.transactions add column if not exists refund_reason text;
alter table public.transactions add column if not exists refunded_amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.transactions add column if not exists created_at timestamptz not null default now();
alter table public.transactions add column if not exists updated_at timestamptz not null default now();

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  item_type text not null default 'Product',
  item_name text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  deduct_inventory boolean not null default true,
  refunded_quantity numeric(12,2) not null default 0,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transaction_item_quantity_positive check (quantity > 0),
  constraint transaction_item_price_nonnegative check (unit_price >= 0)
);

alter table public.transaction_items add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete restrict;
alter table public.transaction_items add column if not exists item_type text not null default 'Product';
alter table public.transaction_items add column if not exists item_name text not null default 'Item';
alter table public.transaction_items add column if not exists quantity numeric(12,2) not null default 1;
alter table public.transaction_items add column if not exists unit_price numeric(12,2) not null default 0;
alter table public.transaction_items add column if not exists line_total numeric(12,2) not null default 0;
alter table public.transaction_items add column if not exists deduct_inventory boolean not null default true;
alter table public.transaction_items add column if not exists refunded_quantity numeric(12,2) not null default 0;
alter table public.transaction_items add column if not exists inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null;
alter table public.transaction_items add column if not exists created_at timestamptz not null default now();

alter table public.inventory_transactions add column if not exists reference_number text;

create table if not exists public.transaction_audit_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  action text not null,
  previous_status text,
  next_status text,
  reason text,
  details jsonb,
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_transactions_or_number on public.transactions(or_number) where or_number is not null;
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
create index if not exists idx_transactions_status_created_at on public.transactions(payment_status, created_at desc);
create index if not exists idx_transactions_payment_method on public.transactions(payment_method);
create index if not exists idx_transactions_owner on public.transactions(owner_id, created_at desc);
create index if not exists idx_transactions_pet on public.transactions(pet_id, created_at desc);
create index if not exists idx_transactions_staff on public.transactions(staff_id, created_at desc);
create index if not exists idx_transaction_items_transaction on public.transaction_items(transaction_id);
create index if not exists idx_transaction_audit_transaction on public.transaction_audit_logs(transaction_id, created_at desc);
create index if not exists idx_inventory_transactions_reference_number on public.inventory_transactions(reference_number);

create or replace function public.pawcruz_next_or_number()
returns text
language sql
volatile
as $$
  select 'OR-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.pawcruz_pos_or_sequence')::text, 6, '0');
$$;

update public.transactions
set subtotal = coalesce(subtotal, checkup_fee, 0) + coalesce(items_subtotal, 0),
    discount_amount = coalesce(discount_amount, 0),
    amount_paid = coalesce(amount_paid, total_amount, 0),
    change_amount = coalesce(change_amount, 0),
    refunded_amount = coalesce(refunded_amount, 0)
where subtotal is null or discount_amount is null or amount_paid is null or change_amount is null or refunded_amount is null;

update public.transactions
set or_number = 'OR-LEGACY-' || upper(left(replace(id::text, '-', ''), 10))
where or_number is null or btrim(or_number) = '';

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

create or replace function public.pawcruz_checkout_pos_transaction(
  p_pet_id uuid,
  p_owner_id uuid,
  p_checkup_fee numeric default 0,
  p_items jsonb default '[]'::jsonb,
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
  v_transaction_id uuid;
  v_or_number text;
  v_owner_id uuid;
  v_item record;
  v_item_id uuid;
  v_inventory_tx_id uuid;
  v_stock_before numeric(12,2);
  v_stock_after numeric(12,2);
  v_items_subtotal numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_line_total numeric(12,2);
begin
  perform public.pawcruz_pos_assert_staff(coalesce(p_staff_id, p_created_by));

  if p_payment_method not in ('Cash', 'GCash', 'Maya', 'Credit Card', 'Debit Card', 'Split Payment') then
    raise exception 'Unsupported payment method';
  end if;
  if p_payment_status not in ('Pending', 'Paid') then
    raise exception 'New POS transactions must be Pending or Paid';
  end if;
  if coalesce(p_checkup_fee, 0) < 0 or coalesce(p_discount_amount, 0) < 0 then
    raise exception 'Fees and discounts cannot be negative';
  end if;

  select owner_id into v_owner_id
  from public.pets
  where id = p_pet_id and coalesce(is_archived, false) = false;
  if v_owner_id is null or v_owner_id <> p_owner_id then
    raise exception 'The selected pet does not belong to the selected pet owner';
  end if;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
      inventory_item_id uuid,
      item_type text,
      item_name text,
      quantity numeric,
      unit_price numeric,
      deduct_inventory boolean
    )
  loop
    if coalesce(v_item.quantity, 0) <= 0 or coalesce(v_item.unit_price, 0) < 0 then
      raise exception 'Every POS item must have a valid quantity and unit price';
    end if;
    if coalesce(v_item.deduct_inventory, false) and v_item.inventory_item_id is null then
      raise exception 'Inventory-linked POS items require an inventory item id';
    end if;
    v_items_subtotal := v_items_subtotal + (v_item.quantity * v_item.unit_price);
  end loop;

  v_subtotal := coalesce(p_checkup_fee, 0) + v_items_subtotal;
  if coalesce(p_discount_amount, 0) > v_subtotal then
    raise exception 'The discount cannot exceed the transaction subtotal';
  end if;
  v_total := v_subtotal - coalesce(p_discount_amount, 0);

  if p_payment_status = 'Paid' and coalesce(p_amount_paid, 0) - coalesce(p_change_amount, 0) < v_total then
    raise exception 'Amount paid is not enough to complete this transaction';
  end if;

  v_or_number := public.pawcruz_next_or_number();
  insert into public.transactions (
    or_number, pet_id, owner_id, medical_record_id, appointment_id, staff_id,
    checkup_fee, items_subtotal, subtotal, discount_amount, discount_rate,
    total_amount, amount_paid, change_amount, payment_method, split_payment_details,
    payment_status, notes, paid_at, created_by
  ) values (
    v_or_number, p_pet_id, p_owner_id, p_medical_record_id, p_appointment_id, p_staff_id,
    coalesce(p_checkup_fee, 0), v_items_subtotal, v_subtotal, coalesce(p_discount_amount, 0),
    case when v_subtotal > 0 then round(coalesce(p_discount_amount, 0) / v_subtotal, 4) else 0 end,
    v_total, coalesce(p_amount_paid, 0), coalesce(p_change_amount, 0), p_payment_method,
    p_split_payment_details, p_payment_status, nullif(btrim(coalesce(p_notes, '')), ''),
    case when p_payment_status = 'Paid' then now() else null end, coalesce(p_created_by, p_staff_id)
  ) returning id into v_transaction_id;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
      inventory_item_id uuid,
      item_type text,
      item_name text,
      quantity numeric,
      unit_price numeric,
      deduct_inventory boolean
    )
  loop
    v_line_total := v_item.quantity * v_item.unit_price;
    insert into public.transaction_items (
      transaction_id, inventory_item_id, item_type, item_name, quantity, unit_price, line_total, deduct_inventory
    ) values (
      v_transaction_id, v_item.inventory_item_id, coalesce(nullif(btrim(v_item.item_type), ''), 'Product'),
      coalesce(nullif(btrim(v_item.item_name), ''), 'Item'), v_item.quantity, v_item.unit_price, v_line_total,
      coalesce(v_item.deduct_inventory, false)
    ) returning id into v_item_id;

    if p_payment_status = 'Paid' and coalesce(v_item.deduct_inventory, false) then
      select quantity into v_stock_before
      from public.inventory_items
      where id = v_item.inventory_item_id and coalesce(is_archived, false) = false
      for update;
      if not found then raise exception 'Inventory item was not found or is archived'; end if;
      v_stock_after := v_stock_before - v_item.quantity;
      if v_stock_after < 0 then raise exception 'Insufficient stock. Available quantity: %', v_stock_before; end if;

      update public.inventory_items set quantity = v_stock_after where id = v_item.inventory_item_id;
      insert into public.inventory_transactions (
        item_id, transaction_type, quantity, quantity_before, quantity_after,
        reason, notes, reference_type, reference_id, reference_number, created_by
      ) values (
        v_item.inventory_item_id, 'Stock Out', v_item.quantity, v_stock_before, v_stock_after,
        'POS sale', 'Deducted by POS transaction ' || v_or_number, 'POS Transaction', v_transaction_id, v_or_number,
        coalesce(p_created_by, p_staff_id)
      ) returning id into v_inventory_tx_id;
      update public.transaction_items set inventory_transaction_id = v_inventory_tx_id where id = v_item_id;
    end if;
  end loop;

  insert into public.transaction_audit_logs (
    transaction_id, action, next_status, details, performed_by
  ) values (
    v_transaction_id, 'POS transaction created', p_payment_status,
    jsonb_build_object('or_number', v_or_number, 'payment_method', p_payment_method, 'discount_amount', coalesce(p_discount_amount, 0)),
    coalesce(p_created_by, p_staff_id)
  );

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
  v_stock_before numeric(12,2);
  v_stock_after numeric(12,2);
  v_inventory_tx_id uuid;
begin
  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status = 'Paid' then return v_transaction.id; end if;
  if v_transaction.payment_status <> 'Pending' then raise exception 'Only pending transactions can be settled'; end if;

  for v_item in select * from public.transaction_items where transaction_id = v_transaction.id and deduct_inventory = true and inventory_transaction_id is null
  loop
    select quantity into v_stock_before from public.inventory_items where id = v_item.inventory_item_id and coalesce(is_archived, false) = false for update;
    if not found then raise exception 'Inventory item was not found or is archived'; end if;
    v_stock_after := v_stock_before - v_item.quantity;
    if v_stock_after < 0 then raise exception 'Insufficient stock. Available quantity: %', v_stock_before; end if;
    update public.inventory_items set quantity = v_stock_after where id = v_item.inventory_item_id;
    insert into public.inventory_transactions (
      item_id, transaction_type, quantity, quantity_before, quantity_after,
      reason, notes, reference_type, reference_id, reference_number, created_by
    ) values (
      v_item.inventory_item_id, 'Stock Out', v_item.quantity, v_stock_before, v_stock_after,
      'POS payment settled', 'Deducted after successful payment for ' || v_transaction.or_number,
      'POS Transaction', v_transaction.id, v_transaction.or_number, v_transaction.created_by
    ) returning id into v_inventory_tx_id;
    update public.transaction_items set inventory_transaction_id = v_inventory_tx_id where id = v_item.id;
  end loop;

  update public.transactions
  set payment_status = 'Paid', paid_at = now(), amount_paid = total_amount, change_amount = 0,
      paymongo_payment_id = coalesce(p_payment_id, paymongo_payment_id), updated_at = now()
  where id = v_transaction.id;

  insert into public.transaction_audit_logs (transaction_id, action, previous_status, next_status, details, performed_by)
  values (v_transaction.id, 'Payment settled', 'Pending', 'Paid', jsonb_build_object('payment_id', p_payment_id), v_transaction.created_by);

  return v_transaction.id;
end;
$$;

create or replace function public.pawcruz_reverse_pos_transaction(
  p_transaction_id uuid,
  p_action text,
  p_reason text,
  p_actor_id uuid,
  p_item_ids uuid[] default null
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
  v_restore_quantity numeric(12,2);
  v_inventory_tx_id uuid;
  v_refund_value numeric(12,2) := 0;
  v_is_full_refund boolean := p_item_ids is null;
begin
  perform public.pawcruz_pos_assert_staff(p_actor_id);
  if p_action not in ('Void', 'Refund') then raise exception 'Only Void or Refund actions are permitted'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A void or refund reason is required'; end if;

  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status in ('Voided', 'Refunded', 'Cancelled') then raise exception 'This transaction was already reversed'; end if;
  if p_action = 'Refund' and v_transaction.payment_status <> 'Paid' then raise exception 'Only paid transactions can be refunded'; end if;

  if p_action = 'Void' and v_transaction.payment_status = 'Pending' then
    update public.transactions set payment_status = 'Voided', voided_at = now(), voided_by = p_actor_id, void_reason = p_reason, updated_at = now() where id = v_transaction.id;
    insert into public.transaction_audit_logs (transaction_id, action, previous_status, next_status, reason, performed_by)
    values (v_transaction.id, 'Transaction voided', 'Pending', 'Voided', p_reason, p_actor_id);
    return v_transaction.id;
  end if;

  for v_item in
    select * from public.transaction_items
    where transaction_id = v_transaction.id
      and (p_item_ids is null or id = any(p_item_ids))
      and refunded_quantity < quantity
    for update
  loop
    v_restore_quantity := v_item.quantity - v_item.refunded_quantity;
    if v_restore_quantity <= 0 then continue; end if;

    if v_item.deduct_inventory and v_item.inventory_item_id is not null then
      select quantity into v_stock_before from public.inventory_items where id = v_item.inventory_item_id for update;
      if not found then raise exception 'Inventory item for this transaction was not found'; end if;
      v_stock_after := v_stock_before + v_restore_quantity;
      update public.inventory_items set quantity = v_stock_after where id = v_item.inventory_item_id;
      insert into public.inventory_transactions (
        item_id, transaction_type, quantity, quantity_before, quantity_after,
        reason, notes, reference_type, reference_id, reference_number, created_by
      ) values (
        v_item.inventory_item_id, 'Stock In', v_restore_quantity, v_stock_before, v_stock_after,
        'POS ' || lower(p_action), 'Restored from ' || lower(p_action) || ' for ' || v_transaction.or_number,
        'POS Transaction', v_transaction.id, v_transaction.or_number, p_actor_id
      ) returning id into v_inventory_tx_id;
    end if;

    update public.transaction_items set refunded_quantity = quantity where id = v_item.id;
    v_refund_value := v_refund_value + round(v_item.line_total * case when v_transaction.subtotal > 0 then (1 - (v_transaction.discount_amount / v_transaction.subtotal)) else 1 end, 2);
  end loop;

  if p_action = 'Void' then
    update public.transactions
    set payment_status = 'Voided', voided_at = now(), voided_by = p_actor_id, void_reason = p_reason, updated_at = now()
    where id = v_transaction.id;
    insert into public.transaction_audit_logs (transaction_id, action, previous_status, next_status, reason, details, performed_by)
    values (v_transaction.id, 'Transaction voided', v_transaction.payment_status, 'Voided', p_reason, jsonb_build_object('restored_amount', v_transaction.total_amount - v_transaction.refunded_amount), p_actor_id);
  elsif v_is_full_refund then
    update public.transactions
    set payment_status = 'Refunded', refunded_at = now(), refunded_by = p_actor_id, refund_reason = p_reason,
        refunded_amount = total_amount, updated_at = now()
    where id = v_transaction.id;
    insert into public.transaction_audit_logs (transaction_id, action, previous_status, next_status, reason, details, performed_by)
    values (v_transaction.id, 'Transaction refunded', v_transaction.payment_status, 'Refunded', p_reason, jsonb_build_object('refund_amount', v_transaction.total_amount), p_actor_id);
  else
    update public.transactions
    set refunded_amount = least(total_amount, refunded_amount + v_refund_value), refund_reason = p_reason,
        refunded_at = now(), refunded_by = p_actor_id, updated_at = now()
    where id = v_transaction.id;
    insert into public.transaction_audit_logs (transaction_id, action, previous_status, next_status, reason, details, performed_by)
    values (v_transaction.id, 'POS item refund', v_transaction.payment_status, v_transaction.payment_status, p_reason, jsonb_build_object('refund_amount', v_refund_value, 'item_ids', p_item_ids), p_actor_id);
  end if;

  return v_transaction.id;
end;
$$;

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
begin
  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found'; end if;
  if v_transaction.payment_status = 'Paid' then raise exception 'A paid transaction cannot be cancelled by the payment gateway'; end if;
  if v_transaction.payment_status in ('Cancelled', 'Voided', 'Refunded') then return v_transaction.id; end if;

  update public.transactions
  set payment_status = 'Cancelled', notes = concat_ws(' ', notes, 'Gateway cancellation:', p_reason), updated_at = now()
  where id = v_transaction.id;
  insert into public.transaction_audit_logs (transaction_id, action, previous_status, next_status, reason, performed_by)
  values (v_transaction.id, 'Payment gateway cancelled', v_transaction.payment_status, 'Cancelled', p_reason, v_transaction.created_by);
  return v_transaction.id;
end;
$$;

create or replace function public.pawcruz_touch_transaction()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_touch_transaction on public.transactions;
create trigger trg_pawcruz_touch_transaction
before update on public.transactions
for each row execute function public.pawcruz_touch_transaction();

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.transactions to anon, authenticated;
grant select, insert, update on public.transaction_items to anon, authenticated;
grant select, insert on public.transaction_audit_logs to anon, authenticated;
grant execute on function public.pawcruz_checkout_pos_transaction(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb,text,uuid) to anon, authenticated;
grant execute on function public.pawcruz_settle_pos_transaction(uuid,text) to anon, authenticated;
grant execute on function public.pawcruz_reverse_pos_transaction(uuid,text,text,uuid,uuid[]) to anon, authenticated;
grant execute on function public.pawcruz_cancel_pos_transaction(uuid,text) to anon, authenticated;

alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.transaction_audit_logs enable row level security;

drop policy if exists "PawCruz POS transactions demo access" on public.transactions;
create policy "PawCruz POS transactions demo access" on public.transactions for all to anon, authenticated using (true) with check (true);
drop policy if exists "PawCruz POS transaction items demo access" on public.transaction_items;
create policy "PawCruz POS transaction items demo access" on public.transaction_items for all to anon, authenticated using (true) with check (true);
drop policy if exists "PawCruz POS transaction audit demo access" on public.transaction_audit_logs;
create policy "PawCruz POS transaction audit demo access" on public.transaction_audit_logs for all to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
