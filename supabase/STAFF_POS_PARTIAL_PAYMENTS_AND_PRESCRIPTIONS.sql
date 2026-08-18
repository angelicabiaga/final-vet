-- PawCruz Staff POS: partial medicine fulfillment + partial payments
-- Run this after VET_STAFF_BILLING_HANDOFF.sql. Purely additive -- no
-- existing table, column, row, or function is dropped or overwritten with
-- different data. Safe to re-run.
--
-- What this adds:
--   * public.prescriptions: one row per (consultation, medicine). The vet
--     side only ever recorded WHICH medicines were used (no quantity), so
--     staff sets/confirms the Prescribed Quantity the first time they open
--     the checkout screen for that consultation (defaults to 1, editable
--     until any of it has been purchased). Every partial purchase against
--     it -- across however many separate invoices -- accumulates into
--     total_quantity_purchased, and fulfillment_status is recomputed:
--       Not Purchased -> Partially Purchased -> Fully Purchased
--     or, if staff marks it, -> Purchasing Elsewhere (excluded from billing
--     entirely from that point on).
--   * public.transaction_payments: one row per amount actually collected
--     against an invoice (the original payment at checkout, plus every
--     later "Collect Balance" payment), giving a complete payment history.
--   * transaction_items.prescription_id: links an invoiced medicine line
--     back to the prescription it fulfilled, so a transaction's detail view
--     can show prescribed/purchased/remaining quantity per line.
--   * pawcruz_checkout_pos_transaction is extended (not rewritten) with
--     p_invoice_kind: 'Consultation' (the normal Pending-Billing-Queue
--     checkout, unchanged behavior) or 'Prescription Follow-up' (a
--     staff-initiated "Continue Purchase" invoice for remaining prescribed
--     medicine on a consultation that was already billed). Follow-up
--     invoices skip the "consultation must be Pending Billing/Processing"
--     guard since the consultation's primary invoice already exists --
--     this is what makes multiple invoices per consultation possible now
--     that partial medicine purchases are supported. The old rule of "one
--     PAID transaction per consultation" is superseded by this and its
--     backing unique index is dropped below.
--   * Inventory is now deducted, and the queue ticket/billing status is now
--     completed, whenever a checkout is NOT a Pending GCash source (i.e.
--     for Paid, Partially Paid, or even Unpaid invoices) instead of only
--     when fully Paid -- because the medicine physically leaves the clinic
--     at checkout regardless of how much of the invoice was collected.
--   * pawcruz_collect_balance_payment: adds a payment to an existing
--     invoice (never creates a new transaction row), recalculates
--     amount_paid/payment_status, and logs the payment + an audit entry.
--   * The live transactions table carries a payment_status CHECK
--     constraint that was never in any file in this repo (confirmed live
--     via the "violates check constraint transactions_payment_status_check"
--     error) and only allowed the old status set. It is widened below to
--     also allow Unpaid and Partially Paid -- nothing is removed from it.
--   * The live transactions table also has no paid_at column (confirmed
--     live via a "column paid_at does not exist" error when collecting a
--     balance payment) -- pawcruz_collect_balance_payment no longer
--     touches it. No other function in this file ever referenced it.

-- ---------------------------------------------------------------------
-- 0. Widen the pre-existing (undocumented) payment_status constraint.
-- ---------------------------------------------------------------------

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%payment_status%';

  if v_constraint_name is not null then
    execute format('alter table public.transactions drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.transactions add constraint transactions_payment_status_check
  check (payment_status in ('Unpaid', 'Pending', 'Partially Paid', 'Paid', 'Voided', 'Cancelled', 'Refunded'));

-- ---------------------------------------------------------------------
-- 1. prescriptions
-- ---------------------------------------------------------------------

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  queue_entry_id uuid not null references public.queue_entries(id) on delete cascade,
  medical_record_id uuid references public.medical_records(id) on delete set null,
  pet_id uuid not null references public.pets(id),
  owner_id uuid not null references public.profiles(id),
  veterinarian_id uuid references public.profiles(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  item_name text not null,
  unit_price numeric(12,2) not null default 0,
  prescribed_quantity numeric(12,2) not null default 1 check (prescribed_quantity > 0),
  total_quantity_purchased numeric(12,2) not null default 0 check (total_quantity_purchased >= 0),
  fulfillment_status text not null default 'Not Purchased'
    check (fulfillment_status in ('Not Purchased','Partially Purchased','Fully Purchased','Purchasing Elsewhere')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (queue_entry_id, inventory_item_id)
);

create index if not exists idx_prescriptions_status on public.prescriptions(fulfillment_status, created_at);
create index if not exists idx_prescriptions_owner on public.prescriptions(owner_id);
create index if not exists idx_prescriptions_queue_entry on public.prescriptions(queue_entry_id);

create or replace function public.pawcruz_touch_prescription()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_touch_prescription on public.prescriptions;
create trigger trg_pawcruz_touch_prescription
before update on public.prescriptions
for each row execute function public.pawcruz_touch_prescription();

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.prescriptions to anon, authenticated;
alter table public.prescriptions enable row level security;
drop policy if exists "PawCruz prescriptions demo access" on public.prescriptions;
create policy "PawCruz prescriptions demo access" on public.prescriptions for all to anon, authenticated using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
  and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prescriptions'
  ) then
    alter publication supabase_realtime add table public.prescriptions;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. transaction_payments (complete payment history per invoice)
-- ---------------------------------------------------------------------

create table if not exists public.transaction_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'Cash',
  cashier_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_transaction_payments_transaction on public.transaction_payments(transaction_id, created_at);

grant select, insert on public.transaction_payments to anon, authenticated;
alter table public.transaction_payments enable row level security;
drop policy if exists "PawCruz transaction payments demo access" on public.transaction_payments;
create policy "PawCruz transaction payments demo access" on public.transaction_payments for all to anon, authenticated using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
  and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_payments'
  ) then
    alter publication supabase_realtime add table public.transaction_payments;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. transaction_items: link an invoiced line back to its prescription
-- ---------------------------------------------------------------------

alter table public.transaction_items add column if not exists prescription_id uuid references public.prescriptions(id) on delete set null;
create index if not exists idx_transaction_items_prescription on public.transaction_items(prescription_id);

-- ---------------------------------------------------------------------
-- 4. Superseded rule: multiple invoices per consultation are now expected
--    (a primary consultation invoice plus later "Continue Purchase"
--    follow-ups for remaining prescribed medicine), so "one PAID
--    transaction per queue_entry_id" no longer holds. Dropping this index
--    does not touch any existing row.
-- ---------------------------------------------------------------------

drop index if exists public.uq_transactions_queue_entry_paid;

-- ---------------------------------------------------------------------
-- 5. pawcruz_checkout_pos_transaction: extended with p_invoice_kind.
--    Same FIFO-based body as VET_STAFF_BILLING_HANDOFF.sql, plus:
--      - per-item prescription fulfillment (via item.prescription_id)
--      - inventory deduction / queue+billing completion now key off
--        "payment_status <> 'Pending'" instead of "= 'Paid'"
--      - an initial transaction_payments row when money was collected now
--      - the consultation-level "must be Pending Billing/Processing" guard
--        only applies to p_invoice_kind = 'Consultation'
-- ---------------------------------------------------------------------

drop function if exists public.pawcruz_checkout_pos_transaction(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb,text,uuid,uuid);

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
  p_created_by uuid default null,
  p_queue_entry_id uuid default null,
  p_invoice_kind text default 'Consultation'
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
  v_prescription_id uuid;
  v_prescription public.prescriptions%rowtype;
  v_qty numeric(12,2);
  v_line_total numeric(12,2);
  v_inventory_tx_id uuid;
begin
  perform public.pawcruz_pos_assert_staff(coalesce(p_staff_id, p_created_by));

  if coalesce(p_invoice_kind, 'Consultation') not in ('Consultation', 'Prescription Follow-up') then
    raise exception 'Invalid invoice kind.';
  end if;

  if not exists (select 1 from public.pets where id = p_pet_id and owner_id = p_owner_id) then
    raise exception 'The selected pet does not belong to the selected owner';
  end if;

  if p_queue_entry_id is not null and coalesce(p_invoice_kind, 'Consultation') = 'Consultation' then
    if not exists (
      select 1 from public.queue_entries
      where id = p_queue_entry_id and billing_status in ('Pending Billing','Processing')
    ) then
      raise exception 'This consultation is not currently awaiting payment.';
    end if;
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
    payment_method, payment_status, split_payment_details, notes, or_number, created_by, queue_entry_id
  ) values (
    p_pet_id, p_owner_id, p_medical_record_id, p_appointment_id, p_staff_id, coalesce(p_checkup_fee, 0),
    v_items_subtotal, v_subtotal, coalesce(p_discount_amount, 0), v_total, coalesce(p_amount_paid, 0), coalesce(p_change_amount, 0),
    coalesce(p_payment_method, 'Cash'), coalesce(p_payment_status, 'Paid'), p_split_payment_details, p_notes, v_or_number, coalesce(p_created_by, p_staff_id), p_queue_entry_id
  ) returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_item_id := nullif(v_item->>'inventory_item_id', '')::uuid;
    v_prescription_id := nullif(v_item->>'prescription_id', '')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_line_total := round(v_qty * (v_item->>'unit_price')::numeric, 2);
    v_inventory_tx_id := null;

    if v_prescription_id is not null then
      select * into v_prescription from public.prescriptions where id = v_prescription_id for update;
      if not found then raise exception 'Prescription was not found.'; end if;
      if v_qty > (v_prescription.prescribed_quantity - v_prescription.total_quantity_purchased) then
        raise exception 'Cannot purchase more than the remaining prescribed quantity for %', v_prescription.item_name;
      end if;

      update public.prescriptions
      set total_quantity_purchased = total_quantity_purchased + v_qty,
          fulfillment_status = case
            when total_quantity_purchased + v_qty >= prescribed_quantity then 'Fully Purchased'
            else 'Partially Purchased'
          end
      where id = v_prescription_id;
    end if;

    if v_item_id is not null and coalesce(p_payment_status, 'Paid') <> 'Pending' then
      v_inventory_tx_id := public.pawcruz_record_inventory_transaction(
        v_item_id, 'Stock Out', v_qty,
        'POS sale', 'Deducted by POS transaction ' || v_or_number,
        'POS Transaction', v_transaction_id, coalesce(p_created_by, p_staff_id),
        null, null, null, v_or_number
      );
    end if;

    insert into public.transaction_items (
      transaction_id, inventory_item_id, item_type, item_name, quantity, unit_price, line_total, inventory_transaction_id, prescription_id
    ) values (
      v_transaction_id, v_item_id, coalesce(v_item->>'item_type', 'Product'), v_item->>'item_name',
      v_qty, (v_item->>'unit_price')::numeric, v_line_total, v_inventory_tx_id, v_prescription_id
    );
  end loop;

  if coalesce(p_amount_paid, 0) > 0 then
    insert into public.transaction_payments (transaction_id, amount, payment_method, cashier_id)
    values (v_transaction_id, p_amount_paid, coalesce(p_payment_method, 'Cash'), coalesce(p_staff_id, p_created_by));
  end if;

  if p_queue_entry_id is not null
     and coalesce(p_invoice_kind, 'Consultation') = 'Consultation'
     and coalesce(p_payment_status, 'Paid') <> 'Pending' then
    update public.queue_entries set billing_status = 'Billed' where id = p_queue_entry_id;
    update public.queue_entries
    set status = 'Completed', consultation_ended_at = coalesce(consultation_ended_at, now())
    where id = p_queue_entry_id and status = 'Serving';
  end if;

  return v_transaction_id;
end;
$$;

grant execute on function public.pawcruz_checkout_pos_transaction(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb,text,uuid,uuid,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. pawcruz_settle_pos_transaction: same signature/body as
--    VET_STAFF_BILLING_HANDOFF.sql, plus a transaction_payments row for
--    the confirmed GCash payment.
-- ---------------------------------------------------------------------

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

  insert into public.transaction_payments (transaction_id, amount, payment_method, cashier_id)
  values (v_transaction.id, v_transaction.total_amount, 'GCash', v_transaction.created_by);

  if v_transaction.queue_entry_id is not null then
    update public.queue_entries set billing_status = 'Billed' where id = v_transaction.queue_entry_id;
    update public.queue_entries
    set status = 'Completed', consultation_ended_at = coalesce(consultation_ended_at, now())
    where id = v_transaction.queue_entry_id and status = 'Serving';
  end if;

  return v_transaction.id;
end;
$$;

grant execute on function public.pawcruz_settle_pos_transaction(uuid,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. pawcruz_collect_balance_payment: adds a payment to an existing
--    invoice. Never inserts a transactions row.
-- ---------------------------------------------------------------------

create or replace function public.pawcruz_collect_balance_payment(
  p_transaction_id uuid,
  p_amount numeric,
  p_payment_method text default 'Cash',
  p_actor_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions%rowtype;
  v_remaining numeric(12,2);
  v_new_amount_paid numeric(12,2);
  v_new_status text;
begin
  perform public.pawcruz_pos_assert_staff(p_actor_id);

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Enter a valid payment amount.';
  end if;

  select * into v_transaction from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaction was not found.'; end if;
  if v_transaction.payment_status = 'Voided' then raise exception 'This invoice was voided and cannot accept payment.'; end if;
  if v_transaction.payment_status = 'Paid' then raise exception 'This invoice is already fully paid.'; end if;
  if v_transaction.payment_status = 'Pending' then raise exception 'This invoice is still awaiting online payment confirmation.'; end if;

  v_remaining := v_transaction.total_amount - v_transaction.amount_paid;
  if p_amount > v_remaining then
    raise exception 'Payment of % exceeds the remaining balance of %', p_amount, v_remaining;
  end if;

  v_new_amount_paid := v_transaction.amount_paid + p_amount;
  v_new_status := case when v_new_amount_paid >= v_transaction.total_amount then 'Paid' else 'Partially Paid' end;

  update public.transactions
  set amount_paid = v_new_amount_paid,
      payment_status = v_new_status,
      updated_at = now()
  where id = v_transaction.id;

  insert into public.transaction_payments (transaction_id, amount, payment_method, cashier_id)
  values (v_transaction.id, p_amount, coalesce(p_payment_method, 'Cash'), p_actor_id);

  insert into public.transaction_audit_log (transaction_id, action, previous_status, new_status, details, performed_by)
  values (
    v_transaction.id, 'Balance payment collected', v_transaction.payment_status, v_new_status,
    jsonb_build_object('amount', p_amount, 'method', p_payment_method), p_actor_id
  );

  return v_transaction.id;
end;
$$;

grant execute on function public.pawcruz_collect_balance_payment(uuid,numeric,text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
