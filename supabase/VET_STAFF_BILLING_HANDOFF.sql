-- PawCruz Veterinarian -> Staff Billing Handoff
-- Run this after appointment_module.sql, queue_management.sql,
-- queue_visit_grouping_and_walkin.sql, status_simplification_upgrade.sql,
-- FINAL_REPAIR_medical_records_api.sql (or REPAIR_medical_records_veterinarians.sql),
-- and FIFO_INVENTORY_BATCHES.sql. Safe to re-run.
--
-- What this adds:
--   * queue_entries.billing_status: tracks a consultation from
--     'Not Applicable' (default / not yet finalized) -> 'Pending Billing'
--     (vet clicked Complete) -> 'Processing' (staff opened POS checkout)
--     -> 'Billed' (payment succeeded). The queue's own status column keeps
--     working exactly as before (Waiting -> Serving -> Completed) -- a
--     consultation now reaches 'Billed' while the ticket is still 'Serving',
--     and the ticket only flips to 'Completed' once payment succeeds.
--   * medical_records.consultation_fee: the veterinarian's consultation fee
--     for that record, defaulting to 500 (previously staff typed this
--     number from scratch at checkout).
--   * medical_records.queue_entry_id keeps using the column that already
--     existed but was never written by the app -- it is now the reliable
--     link between a finalized consultation and its billing entry (visits
--     with multiple templates, e.g. Health Record + Vaccination Record,
--     share the same queue_entry_id).
--   * transactions.queue_entry_id: the authoritative link from a POS
--     transaction back to the exact consultation it bills, plus a unique
--     index guaranteeing only one PAID transaction can ever exist per
--     consultation. Abandoned/expired GCash attempts stay Pending and do
--     not block a retry -- only a second successful payment would collide.
--   * pawcruz_checkout_pos_transaction / pawcruz_settle_pos_transaction are
--     extended (not rewritten) to accept the new p_queue_entry_id and, on
--     success, flip billing_status to 'Billed' and complete the queue
--     ticket (Serving -> Completed), which cascades to the linked
--     appointment(s) via the existing sync_queue_appointment_status
--     trigger. FIFO inventory deduction logic is untouched.

-- ---------------------------------------------------------------------
-- 1. queue_entries: billing_status + finalization audit columns
-- ---------------------------------------------------------------------

alter table public.queue_entries add column if not exists billing_status text not null default 'Not Applicable';
alter table public.queue_entries drop constraint if exists queue_entries_billing_status_check;
alter table public.queue_entries add constraint queue_entries_billing_status_check
  check (billing_status in ('Not Applicable','Pending Billing','Processing','Billed'));

alter table public.queue_entries add column if not exists consultation_finalized_at timestamptz;
alter table public.queue_entries add column if not exists consultation_finalized_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_queue_entries_billing_status on public.queue_entries(billing_status, consultation_finalized_at);

-- ---------------------------------------------------------------------
-- 2. medical_records: consultation fee (queue_entry_id column already
--    exists from FINAL_REPAIR_medical_records_api.sql / REPAIR_medical_
--    records_veterinarians.sql -- just start using it).
-- ---------------------------------------------------------------------

alter table public.medical_records add column if not exists consultation_fee numeric(12,2) not null default 500;
alter table public.medical_records drop constraint if exists medical_records_consultation_fee_check;
alter table public.medical_records add constraint medical_records_consultation_fee_check check (consultation_fee >= 0);
alter table public.medical_records add column if not exists queue_entry_id uuid;

create index if not exists idx_medical_records_queue_entry on public.medical_records(queue_entry_id);

-- ---------------------------------------------------------------------
-- 3. transactions: link to the exact consultation being billed
-- ---------------------------------------------------------------------

alter table public.transactions add column if not exists queue_entry_id uuid references public.queue_entries(id) on delete set null;
create index if not exists idx_transactions_queue_entry on public.transactions(queue_entry_id);

-- One consultation can only ever be billed once. Abandoned/expired GCash
-- attempts remain Pending and are intentionally excluded from this index,
-- so staff can retry a payment without being blocked by a stale attempt.
create unique index if not exists uq_transactions_queue_entry_paid
  on public.transactions(queue_entry_id)
  where queue_entry_id is not null and payment_status = 'Paid';

-- ---------------------------------------------------------------------
-- 4. pawcruz_checkout_pos_transaction: same FIFO-based body from
--    FIFO_INVENTORY_BATCHES.sql, extended with p_queue_entry_id.
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
  p_created_by uuid default null,
  p_queue_entry_id uuid default null
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

  if p_queue_entry_id is not null then
    if not exists (
      select 1 from public.queue_entries
      where id = p_queue_entry_id and billing_status in ('Pending Billing','Processing')
    ) then
      raise exception 'This consultation is not currently awaiting payment.';
    end if;

    if exists (
      select 1 from public.transactions
      where queue_entry_id = p_queue_entry_id and payment_status = 'Paid'
    ) then
      raise exception 'This consultation has already been billed.';
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

  if p_queue_entry_id is not null and coalesce(p_payment_status, 'Paid') = 'Paid' then
    update public.queue_entries set billing_status = 'Billed' where id = p_queue_entry_id;
    update public.queue_entries
    set status = 'Completed', consultation_ended_at = coalesce(consultation_ended_at, now())
    where id = p_queue_entry_id and status = 'Serving';
  end if;

  return v_transaction_id;
end;
$$;

grant execute on function public.pawcruz_checkout_pos_transaction(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,text,text,numeric,numeric,numeric,jsonb,text,uuid,uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. pawcruz_settle_pos_transaction: same FIFO-based body, extended to
--    complete billing when a Pending (GCash) transaction settles Paid.
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
-- 6. Realtime: transactions was never published before, so Staff's
--    Payment Transaction History could only ever refresh on a manual
--    click. queue_entries is already published (queue_management.sql /
--    SUPABASE_QUEUE_REALTIME_SYNC.sql), so billing_status changes there
--    already reach subscribers live -- nothing to add for that table.
-- ---------------------------------------------------------------------

alter table if exists public.transactions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
  and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

notify pgrst, 'reload schema';
