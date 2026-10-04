-- PawCruz: send Low stock / Out of stock / Expiring / Expired notifications.
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- Why: the trigger that notifies Admin and Staff when an inventory item's
-- status changes (defined in FIFO_INVENTORY_BATCHES.sql) is not active on
-- the live database -- items have moved to "Low Stock" / "Near Expiry"
-- without any notification being sent. This re-installs it (same logic,
-- same message text) and then sends one alert for every item that is
-- ALREADY in an alert state, skipping any item that already has an alert
-- for that same status, so nobody gets duplicates.
--
-- Recipients stay the same as before: Admin and Staff accounts only.

begin;

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
  -- related_record is a uuid column, so the item id goes in as-is.
  select id, v_title, v_message, 'Inventory Alert', 'Inventory', p_item_id, null
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

-- Only one notification trigger should ever exist.
drop trigger if exists trg_notify_low_inventory on public.inventory_items;
drop trigger if exists trg_pawcruz_notify_inventory_status on public.inventory_items;
create trigger trg_pawcruz_notify_inventory_status
after insert or update on public.inventory_items
for each row execute function public.pawcruz_notify_inventory_status_change();

grant execute on function public.pawcruz_notify_inventory_alert(uuid,text,text,numeric,numeric,text,date) to anon, authenticated;

-- Catch up: alert once for every item already Low Stock / Out of Stock /
-- Near Expiry / Expired that has no alert yet for its current status.
do $$
declare
  r record;
  v_prefix text;
begin
  for r in
    select id, item_name, status, quantity, reorder_level, unit, expiry_date
    from public.inventory_items
    where coalesce(is_archived, false) = false
      and status in ('Low Stock', 'Out of Stock', 'Near Expiry', 'Expired')
  loop
    v_prefix := case r.status
      when 'Low Stock' then 'Low stock: '
      when 'Out of Stock' then 'Out of stock: '
      when 'Near Expiry' then 'Expiring soon: '
      else 'Expired: '
    end;

    if not exists (
      select 1 from public.notifications n
      where n.notification_type = 'Inventory Alert'
        and n.related_record::text = r.id::text
        and n.title = v_prefix || r.item_name
    ) then
      perform public.pawcruz_notify_inventory_alert(
        r.id, r.item_name, r.status, r.quantity, r.reorder_level, r.unit, r.expiry_date
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
