-- PawCruz POS transaction history, audit, inventory, and sales foundation.
-- Run after phase1_setup.sql and inventory_module.sql in the Supabase SQL editor.
create extension if not exists pgcrypto;

create sequence if not exists public.pawcruz_or_number_seq start 1000;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  or_number text not null unique,
  pet_id uuid not null references public.pets(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  medical_record_id uuid references public.medical_records(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  staff_id uuid references public.profiles(id) on delete set null,
  checkup_fee numeric(12,2) not null default 0 check (checkup_fee >= 0),
  items_subtotal numeric(12,2) not null default 0 check (items_subtotal >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  change_amount numeric(12,2) not null default 0 check (change_amount >= 0),
  payment_method text not null default 'Cash' check (payment_method in ('Cash','GCash','Maya','Credit Card','Debit Card','Split Payment')),
  payment_status text not null default 'Paid' check (payment_status in ('Pending','Paid','Voided','Refunded','Cancelled')),
  notes text,
  status_reason text,
  status_changed_by uuid references public.profiles(id) on delete set null,
  status_changed_at timestamptz,
  paymongo_source_id text,
  paymongo_payment_id text,
  paymongo_checkout_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions add column if not exists or_number text;
alter table public.transactions add column if not exists subtotal numeric(12,2) not null default 0;
alter table public.transactions add column if not exists discount_amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists amount_paid numeric(12,2) not null default 0;
alter table public.transactions add column if not exists change_amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists status_reason text;
alter table public.transactions add column if not exists status_changed_by uuid references public.profiles(id) on delete set null;
alter table public.transactions add column if not exists status_changed_at timestamptz;
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.transactions'::regclass and contype='c' and (pg_get_constraintdef(oid) ilike '%payment_method%' or pg_get_constraintdef(oid) ilike '%payment_status%') loop
    execute format('alter table public.transactions drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.transactions add constraint transactions_payment_method_check check (payment_method in ('Cash','GCash','Maya','Credit Card','Debit Card','Split Payment'));
alter table public.transactions add constraint transactions_payment_status_check check (payment_status in ('Pending','Paid','Voided','Refunded','Cancelled'));
update public.transactions set or_number = 'OR-' || to_char(created_at, 'YYYYMMDD') || '-' || lpad(nextval('public.pawcruz_or_number_seq')::text, 6, '0') where or_number is null;
create unique index if not exists uq_transactions_or_number on public.transactions(or_number);
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
create index if not exists idx_transactions_status_method on public.transactions(payment_status, payment_method);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  item_type text not null check (item_type in ('Product','Medicine','Test','Service')),
  item_name text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.transaction_items add column if not exists discount_amount numeric(12,2) not null default 0;
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.transaction_items'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%item_type%' loop
    execute format('alter table public.transaction_items drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.transaction_items add constraint transaction_items_item_type_check check (item_type in ('Product','Medicine','Test','Service'));
create index if not exists idx_transaction_items_transaction on public.transaction_items(transaction_id);

create table if not exists public.transaction_pets (
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (transaction_id, pet_id)
);
create index if not exists idx_transaction_pets_pet on public.transaction_pets(pet_id);

create table if not exists public.transaction_audit_log (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  action text not null,
  previous_status text,
  new_status text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_transaction_audit_transaction on public.transaction_audit_log(transaction_id, created_at desc);

create or replace function public.pawcruz_checkout_transaction(
  p_pet_id uuid, p_owner_id uuid, p_checkup_fee numeric, p_items jsonb,
  p_medical_record_id uuid default null, p_appointment_id uuid default null,
  p_staff_id uuid default null, p_payment_method text default 'Cash',
  p_payment_status text default 'Paid', p_notes text default null,
  p_created_by uuid default null, p_discount_amount numeric default 0,
  p_amount_paid numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_or text; v_item jsonb; v_inventory_tx uuid;
  v_items_subtotal numeric(12,2) := 0; v_subtotal numeric(12,2); v_total numeric(12,2);
  v_qty numeric(12,2); v_price numeric(12,2); v_type text; v_paid numeric(12,2);
begin
  if p_pet_id is null or p_owner_id is null then raise exception 'Pet and owner are required'; end if;
  if coalesce(p_checkup_fee,0) < 0 or coalesce(p_discount_amount,0) < 0 then raise exception 'Amounts cannot be negative'; end if;
  if p_payment_method not in ('Cash','GCash','Maya','Credit Card','Debit Card','Split Payment') then raise exception 'Unsupported payment method'; end if;
  if p_payment_status not in ('Pending','Paid') then raise exception 'Invalid checkout status'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_qty := (v_item->>'quantity')::numeric; v_price := (v_item->>'unit_price')::numeric;
    if v_qty <= 0 or v_price < 0 then raise exception 'Invalid transaction item amount'; end if;
    v_items_subtotal := v_items_subtotal + round(v_qty * v_price, 2);
  end loop;
  v_subtotal := round(coalesce(p_checkup_fee,0) + v_items_subtotal, 2);
  v_total := greatest(0, round(v_subtotal - coalesce(p_discount_amount,0), 2));
  v_paid := coalesce(p_amount_paid, v_total);
  if p_payment_status = 'Paid' and v_paid < v_total then raise exception 'Amount paid is less than total'; end if;
  v_or := 'OR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.pawcruz_or_number_seq')::text, 6, '0');

  insert into public.transactions(id,or_number,pet_id,owner_id,medical_record_id,appointment_id,staff_id,checkup_fee,items_subtotal,subtotal,discount_amount,total_amount,amount_paid,change_amount,payment_method,payment_status,notes,created_by)
  values(v_id,v_or,p_pet_id,p_owner_id,p_medical_record_id,p_appointment_id,p_staff_id,coalesce(p_checkup_fee,0),v_items_subtotal,v_subtotal,coalesce(p_discount_amount,0),v_total,v_paid,greatest(0,v_paid-v_total),p_payment_method,p_payment_status,p_notes,p_created_by);

  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_qty := (v_item->>'quantity')::numeric; v_price := (v_item->>'unit_price')::numeric; v_type := coalesce(v_item->>'item_type','Product');
    v_inventory_tx := null;
    if v_item->>'inventory_item_id' is not null and v_type <> 'Service' and p_payment_status = 'Paid' then
      v_inventory_tx := public.pawcruz_record_inventory_transaction((v_item->>'inventory_item_id')::uuid,'Stock Out',v_qty,'POS sale','Sold through '||v_or,'transaction',v_id,p_created_by);
    end if;
    insert into public.transaction_items(transaction_id,inventory_item_id,item_type,item_name,quantity,unit_price,line_total,inventory_transaction_id)
    values(v_id,nullif(v_item->>'inventory_item_id','')::uuid,v_type,coalesce(v_item->>'item_name','Item'),v_qty,v_price,round(v_qty*v_price,2),v_inventory_tx);
  end loop;
  insert into public.transaction_audit_log(transaction_id,action,new_status,details,performed_by) values(v_id,'CREATED',p_payment_status,jsonb_build_object('or_number',v_or,'total',v_total,'payment_method',p_payment_method),p_created_by);
  return v_id;
end; $$;

create or replace function public.pawcruz_change_transaction_status(p_transaction_id uuid,p_new_status text,p_reason text,p_staff_id uuid)
returns public.transactions language plpgsql security definer set search_path=public as $$
declare v_tx public.transactions; v_item record;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'A reason is required'; end if;
  if p_new_status not in ('Voided','Refunded') then raise exception 'Invalid status change'; end if;
  select * into v_tx from public.transactions where id=p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_tx.payment_status <> 'Paid' then raise exception 'Only paid transactions can be voided or refunded'; end if;
  for v_item in select * from public.transaction_items where transaction_id=p_transaction_id and inventory_item_id is not null and item_type <> 'Service' loop
    perform public.pawcruz_record_inventory_transaction(v_item.inventory_item_id,'Stock In',v_item.quantity,p_new_status||' reversal','Restored from '||v_tx.or_number,'transaction',v_tx.id,p_staff_id);
  end loop;
  update public.transactions set payment_status=p_new_status,status_reason=trim(p_reason),status_changed_by=p_staff_id,status_changed_at=now(),updated_at=now() where id=p_transaction_id returning * into v_tx;
  insert into public.transaction_audit_log(transaction_id,action,previous_status,new_status,reason,performed_by) values(p_transaction_id,upper(p_new_status),'Paid',p_new_status,trim(p_reason),p_staff_id);
  return v_tx;
end; $$;

create or replace function public.pawcruz_finalize_pending_transaction(p_transaction_id uuid,p_payment_id text default null)
returns public.transactions language plpgsql security definer set search_path=public as $$
declare v_tx public.transactions; v_item record; v_inventory_tx uuid;
begin
  select * into v_tx from public.transactions where id=p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_tx.payment_status = 'Paid' then return v_tx; end if;
  if v_tx.payment_status <> 'Pending' then raise exception 'Transaction is not pending'; end if;
  for v_item in select * from public.transaction_items where transaction_id=p_transaction_id and inventory_item_id is not null and item_type <> 'Service' loop
    v_inventory_tx := public.pawcruz_record_inventory_transaction(v_item.inventory_item_id,'Stock Out',v_item.quantity,'POS sale','Sold through '||v_tx.or_number,'transaction',v_tx.id,v_tx.created_by);
    update public.transaction_items set inventory_transaction_id=v_inventory_tx where id=v_item.id;
  end loop;
  update public.transactions set payment_status='Paid',amount_paid=total_amount,change_amount=0,paymongo_payment_id=coalesce(p_payment_id,paymongo_payment_id),updated_at=now() where id=p_transaction_id returning * into v_tx;
  insert into public.transaction_audit_log(transaction_id,action,previous_status,new_status,details,performed_by) values(p_transaction_id,'PAYMENT_CONFIRMED','Pending','Paid',jsonb_build_object('payment_id',p_payment_id),v_tx.created_by);
  return v_tx;
end; $$;

-- Completed transactions are immutable except through the audited RPC above.
create or replace function public.pawcruz_prevent_transaction_delete() returns trigger language plpgsql as $$ begin raise exception 'Completed transactions cannot be deleted'; end; $$;
drop trigger if exists trg_prevent_transaction_delete on public.transactions;
create trigger trg_prevent_transaction_delete before delete on public.transactions for each row execute function public.pawcruz_prevent_transaction_delete();

alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.transaction_audit_log enable row level security;
alter table public.transaction_pets enable row level security;
drop policy if exists "PawCruz transaction read" on public.transactions;
create policy "PawCruz transaction read" on public.transactions for select to authenticated using (true);
drop policy if exists "PawCruz transaction items read" on public.transaction_items;
create policy "PawCruz transaction items read" on public.transaction_items for select to authenticated using (true);
drop policy if exists "PawCruz transaction audit read" on public.transaction_audit_log;
create policy "PawCruz transaction audit read" on public.transaction_audit_log for select to authenticated using (true);
drop policy if exists "PawCruz transaction pets access" on public.transaction_pets;
create policy "PawCruz transaction pets access" on public.transaction_pets for all to authenticated using (true) with check (true);
grant select on public.transactions,public.transaction_items,public.transaction_audit_log to authenticated;
grant select,insert on public.transaction_pets to authenticated;
grant execute on function public.pawcruz_checkout_transaction(uuid,uuid,numeric,jsonb,uuid,uuid,uuid,text,text,text,uuid,numeric,numeric) to authenticated;
grant execute on function public.pawcruz_change_transaction_status(uuid,text,text,uuid) to authenticated;
grant execute on function public.pawcruz_finalize_pending_transaction(uuid,text) to authenticated;
