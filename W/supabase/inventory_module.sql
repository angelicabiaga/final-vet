-- PawCruz Inventory Management Module
-- Safe to run more than once on the current PawCruz Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  category text not null,
  sku text not null,
  description text,
  quantity numeric(12,2) not null default 0,
  unit text not null default 'pcs',
  unit_price numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  expiry_date date,
  supplier_name text,
  batch_number text,
  status text not null default 'In Stock',
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_quantity_nonnegative check (quantity >= 0),
  constraint inventory_price_nonnegative check (unit_price >= 0),
  constraint inventory_reorder_nonnegative check (reorder_level >= 0)
);

alter table public.inventory_items add column if not exists item_name text;
alter table public.inventory_items add column if not exists category text;
alter table public.inventory_items add column if not exists sku text;
alter table public.inventory_items add column if not exists description text;
alter table public.inventory_items add column if not exists quantity numeric(12,2) default 0;
alter table public.inventory_items add column if not exists unit text default 'pcs';
alter table public.inventory_items add column if not exists unit_price numeric(12,2) default 0;
alter table public.inventory_items add column if not exists reorder_level numeric(12,2) default 0;
alter table public.inventory_items add column if not exists expiry_date date;
alter table public.inventory_items add column if not exists supplier_name text;
alter table public.inventory_items add column if not exists batch_number text;
alter table public.inventory_items add column if not exists status text default 'In Stock';
alter table public.inventory_items add column if not exists is_archived boolean default false;
alter table public.inventory_items add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.inventory_items add column if not exists created_at timestamptz default now();
alter table public.inventory_items add column if not exists updated_at timestamptz default now();

update public.inventory_items set quantity = 0 where quantity is null;
update public.inventory_items set unit_price = 0 where unit_price is null;
update public.inventory_items set reorder_level = 0 where reorder_level is null;
update public.inventory_items set unit = 'pcs' where unit is null or btrim(unit) = '';
update public.inventory_items set category = 'Clinic Supply' where category is null or btrim(category) = '';
update public.inventory_items set item_name = coalesce(nullif(btrim(item_name), ''), 'Unnamed Item') where item_name is null or btrim(item_name) = '';
update public.inventory_items set sku = 'ITEM-' || left(replace(id::text, '-', ''), 10) where sku is null or btrim(sku) = '';
update public.inventory_items set is_archived = false where is_archived is null;

create unique index if not exists uq_inventory_items_sku_ci on public.inventory_items (lower(sku));
create index if not exists idx_inventory_items_name on public.inventory_items (item_name);
create index if not exists idx_inventory_items_category on public.inventory_items (category);
create index if not exists idx_inventory_items_status on public.inventory_items (status);
create index if not exists idx_inventory_items_expiry on public.inventory_items (expiry_date);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  transaction_type text not null,
  quantity numeric(12,2) not null,
  quantity_before numeric(12,2) not null,
  quantity_after numeric(12,2) not null,
  reason text,
  notes text,
  reference_type text,
  reference_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_transaction_quantity_positive check (quantity > 0)
);

create index if not exists idx_inventory_transactions_item on public.inventory_transactions(item_id);
create index if not exists idx_inventory_transactions_created_at on public.inventory_transactions(created_at desc);
create index if not exists idx_inventory_transactions_type on public.inventory_transactions(transaction_type);

create table if not exists public.inventory_forecasts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  forecast_period_start date not null,
  forecast_period_end date not null,
  estimated_demand numeric(12,2) not null default 0,
  basis text,
  generated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique(item_id, forecast_period_start, forecast_period_end)
);

create or replace function public.pawcruz_inventory_status(
  p_quantity numeric,
  p_reorder_level numeric,
  p_expiry_date date
) returns text
language plpgsql
stable
as $$
begin
  if p_expiry_date is not null and p_expiry_date < current_date then return 'Expired'; end if;
  if p_expiry_date is not null and p_expiry_date <= current_date + 30 then return 'Near Expiry'; end if;
  if coalesce(p_quantity, 0) <= 0 then return 'Out of Stock'; end if;
  if coalesce(p_quantity, 0) <= coalesce(p_reorder_level, 0) then return 'Low Stock'; end if;
  return 'In Stock';
end;
$$;

update public.inventory_items
set status = public.pawcruz_inventory_status(quantity, reorder_level, expiry_date);

create or replace function public.pawcruz_update_inventory_item()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.status := public.pawcruz_inventory_status(new.quantity, new.reorder_level, new.expiry_date);
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_inventory_item_update on public.inventory_items;
create trigger trg_pawcruz_inventory_item_update
before insert or update on public.inventory_items
for each row execute function public.pawcruz_update_inventory_item();

create or replace function public.pawcruz_record_inventory_transaction(
  p_item_id uuid,
  p_transaction_type text,
  p_quantity numeric,
  p_reason text default null,
  p_notes text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before numeric(12,2);
  v_after numeric(12,2);
  v_transaction_id uuid;
  v_deduct boolean;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select quantity into v_before
  from public.inventory_items
  where id = p_item_id and is_archived = false
  for update;

  if not found then raise exception 'Inventory item was not found or is archived'; end if;

  v_deduct := p_transaction_type in ('Stock Out', 'Medicine Usage', 'Expired', 'Damaged', 'Adjustment Deduct');
  if v_deduct then v_after := v_before - p_quantity; else v_after := v_before + p_quantity; end if;
  if v_after < 0 then raise exception 'Insufficient stock. Available quantity: %', v_before; end if;

  update public.inventory_items set quantity = v_after where id = p_item_id;

  insert into public.inventory_transactions (
    item_id, transaction_type, quantity, quantity_before, quantity_after,
    reason, notes, reference_type, reference_id, created_by
  ) values (
    p_item_id, p_transaction_type, p_quantity, v_before, v_after,
    p_reason, p_notes, p_reference_type, p_reference_id, p_created_by
  ) returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.inventory_items to anon, authenticated;
grant select, insert on public.inventory_transactions to anon, authenticated;
grant select, insert, update, delete on public.inventory_forecasts to anon, authenticated;
grant execute on function public.pawcruz_record_inventory_transaction(uuid,text,numeric,text,text,text,uuid,uuid) to anon, authenticated;

alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_forecasts enable row level security;

drop policy if exists "PawCruz inventory items demo access" on public.inventory_items;
create policy "PawCruz inventory items demo access" on public.inventory_items for all to anon, authenticated using (true) with check (true);
drop policy if exists "PawCruz inventory transactions demo access" on public.inventory_transactions;
create policy "PawCruz inventory transactions demo access" on public.inventory_transactions for all to anon, authenticated using (true) with check (true);
drop policy if exists "PawCruz inventory forecasts demo access" on public.inventory_forecasts;
create policy "PawCruz inventory forecasts demo access" on public.inventory_forecasts for all to anon, authenticated using (true) with check (true);

-- Optional starter categories/items can be added from the application.
notify pgrst, 'reload schema';
