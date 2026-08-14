-- PawCruz Inventory Stock Notifications
-- Safe to run more than once on the current PawCruz Supabase project.
--
-- What this adds on top of supabase/inventory_module.sql:
--   1. Keeps automatic status computation (In Stock / Low Stock / Out of
--      Stock / Near Expiry / Expired) driven by quantity + reorder level +
--      expiry date, on every insert/update of an inventory item.
--   2. Whenever that computed status actually changes (or a brand-new item
--      is created already in an alert state), sends one notification row to
--      every Admin and Staff profile only -- never Veterinarian or Pet
--      Owner. No write happens, no notification fires -- that is the
--      dedupe: an unrelated edit that leaves the status unchanged never
--      re-notifies.
--   3. Adds pawcruz_reconcile_inventory_status(), a callable RPC that
--      re-checks every item against today's date and refreshes any status
--      that drifted purely from time passing (e.g. an item silently
--      crossing into "Near Expiry" or "Expired" without anyone touching
--      it). The app calls this periodically for Admin/Staff sessions.
--
-- Every write path already goes through public.inventory_items (POS
-- checkout, manual stock in/out, manual item edits, CSV import), so this
-- single trigger covers all of them -- including "after every POS sale" --
-- without changing any of those call sites.

create extension if not exists pgcrypto;

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

create or replace function public.pawcruz_update_inventory_item()
returns trigger
language plpgsql
as $$
declare
  v_new_status text;
begin
  new.updated_at := now();
  v_new_status := public.pawcruz_inventory_status(new.quantity, new.reorder_level, new.expiry_date);
  new.status := v_new_status;

  if coalesce(new.is_archived, false) = false
     and v_new_status in ('Low Stock', 'Out of Stock', 'Near Expiry', 'Expired')
     and (tg_op = 'INSERT' or old.status is distinct from v_new_status) then
    perform public.pawcruz_notify_inventory_alert(
      new.id, new.item_name, v_new_status, new.quantity, new.reorder_level, new.unit, new.expiry_date
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pawcruz_inventory_item_update on public.inventory_items;
create trigger trg_pawcruz_inventory_item_update
before insert or update on public.inventory_items
for each row execute function public.pawcruz_update_inventory_item();

-- Re-checks every active item against today's date/quantity and nudges any
-- row whose stored status has drifted from the freshly computed one. The
-- no-op "quantity = quantity" assignment is enough to re-fire the trigger
-- above (Postgres fires row triggers for every matched row regardless of
-- whether a column's new value differs from its old value), so status
-- recomputation and notification dedupe stay defined in exactly one place.
create or replace function public.pawcruz_reconcile_inventory_status()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.inventory_items
  set quantity = quantity
  where coalesce(is_archived, false) = false
    and status is distinct from public.pawcruz_inventory_status(quantity, reorder_level, expiry_date);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.pawcruz_inventory_status(numeric, numeric, date) to anon, authenticated;
grant execute on function public.pawcruz_notify_inventory_alert(uuid, text, text, numeric, numeric, text, date) to anon, authenticated;
grant execute on function public.pawcruz_reconcile_inventory_status() to anon, authenticated;

-- Bring every item's stored status up to date immediately (covers items
-- that drifted before this script was ever run) and send alerts for any
-- that are currently in an alert state.
select public.pawcruz_reconcile_inventory_status();

notify pgrst, 'reload schema';
