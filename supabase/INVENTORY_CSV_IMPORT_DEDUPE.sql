-- PawCruz: prevent duplicate inventory items/batches created through CSV
-- import (and, for the two structural constraints below, through any other
-- path too), and clean up the duplicate rows that already exist today
-- (e.g. the "2 WAY TEST" / "3 WAY TEST" rows the CSV importer created a
-- second time under a different SKU).
--
-- Apply this once in the Supabase SQL editor, after inventory_module.sql,
-- FIFO_INVENTORY_BATCHES.sql, INVENTORY_FEFO_DEDUCTION.sql,
-- INVENTORY_UNIT_TRACKING.sql, INVENTORY_BATCH_ACTIVE_TOGGLE.sql, and
-- INVENTORY_MERGE_DUPLICATES.sql (this file calls the
-- pawcruz_merge_inventory_items function that last one defines, and
-- redefines pawcruz_record_inventory_transaction's exact current signature
-- from the batch-toggle file to call it from the new import function below).

-- ---------------------------------------------------------------------
-- 1. Normalization helper. Same rule everywhere a "same item?" comparison
-- happens: trim, collapse repeated whitespace to one space, lowercase.
-- Marked immutable so it can be used inside the unique indexes in step 3.

create or replace function public.pawcruz_normalize_text(p_text text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')));
$$;

-- ---------------------------------------------------------------------
-- 2. One-time cleanup of duplicate items that already exist (same
-- normalized item_name under different SKUs). For each group, the oldest
-- row is kept and every other member is merged into it via the existing
-- pawcruz_merge_inventory_items RPC, which moves batches, units,
-- transactions, sales, and prescriptions over before deleting the
-- duplicate -- nothing is lost, nothing is double-counted. This covers the
-- "2 WAY TEST" / "3 WAY TEST" rows from the screenshot generically (by
-- name, not by hardcoded SKU), plus any other existing duplicates.
--
-- Safe to re-run: once merged, a name has only one row left, so the
-- "having count(*) > 1" group disappears and nothing happens on the next
-- run.

do $$
declare
  v_actor uuid;
  v_name text;
  v_keep uuid;
  v_dupe uuid;
begin
  select id into v_actor
  from public.profiles
  where role in ('staff', 'admin')
  order by created_at asc
  limit 1;

  if v_actor is null then
    raise notice 'pawcruz: no staff/admin profile found -- skipped automatic duplicate-item merge. Resolve existing duplicate item names by hand (see INVENTORY_MERGE_DUPLICATES.sql) before re-running this file, or the unique index in step 3 below will fail.';
  else
    for v_name in
      select public.pawcruz_normalize_text(item_name)
      from public.inventory_items
      group by public.pawcruz_normalize_text(item_name)
      having count(*) > 1
    loop
      select id into v_keep
      from public.inventory_items
      where public.pawcruz_normalize_text(item_name) = v_name
      order by created_at asc
      limit 1;

      for v_dupe in
        select id
        from public.inventory_items
        where public.pawcruz_normalize_text(item_name) = v_name
          and id <> v_keep
        order by created_at asc
      loop
        perform public.pawcruz_merge_inventory_items(v_dupe, v_keep, v_actor);
      end loop;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Database-level uniqueness. SKU was already unique (case-insensitively)
-- -- upgraded here to the same whitespace-collapsing normalization as
-- everything else. Item Name is now unique the same way (this is the rule
-- that was missing and let "2 WAY TEST" get re-created under TST-003).
-- Batch Number is unique per item, but only among rows that actually have
-- one -- multiple batches with no recorded batch number are still allowed
-- for the same item, same as today.

drop index if exists public.uq_inventory_items_sku_ci;

create unique index if not exists uq_inventory_items_sku_norm
  on public.inventory_items (public.pawcruz_normalize_text(sku));

create unique index if not exists uq_inventory_items_name_norm
  on public.inventory_items (public.pawcruz_normalize_text(item_name));

create unique index if not exists uq_inventory_batches_item_batch_norm
  on public.inventory_batches (item_id, public.pawcruz_normalize_text(batch_number))
  where batch_number is not null and btrim(batch_number) <> '';

-- ---------------------------------------------------------------------
-- 4. Transactional CSV import. One call = one Postgres transaction (a
-- plpgsql function body always runs inside the single transaction of its
-- RPC call), so a genuinely unexpected failure never leaves partial data.
-- Each row is additionally wrapped in its own begin/exception block, which
-- PL/pgSQL runs as a savepoint -- a single bad row (a malformed date, a
-- race against another import) rolls back only that row's own attempted
-- writes and is reported as "Invalid Row"; every other row already
-- processed in this same call stays committed. That is deliberate: the
-- required status vocabulary treats "Invalid Row" as a normal per-row
-- outcome, not a reason to discard an otherwise-good 200-row file.
--
-- Duplicate detection, per row:
--   * SKU matches one existing item AND Item Name matches a *different*
--     existing item -> "Duplicate SKU – Conflict" (skipped; ambiguous,
--     needs a human to resolve).
--   * SKU or Item Name (normalized) matches an existing item -> that item
--     is the target. Its name/SKU/category/unit/price are never touched --
--     only a new batch (and its stock) may be added.
--       - Batch Number given and it already exists under that item (or
--         both this row and the matching batch have no batch number, and
--         the same quantity + expiry date, so a blank-batch delivery isn't
--         silently re-added on a repeat import) -> "Duplicate Batch –
--         Skipped".
--       - Otherwise, if the row has a quantity, it's recorded as a new
--         Stock In batch via the existing pawcruz_record_inventory_transaction
--         RPC (so FEFO, unit generation, and the item's cached quantity all
--         update exactly as they do for a manual Add Stock) ->
--         "Existing Item – Stock Updated".
--   * No existing item matches either -> a new inventory_items row is
--     created once, its opening quantity (if any) recorded the same way ->
--     "New Item – Imported".
--   * Missing required fields, an unparsable expiry date, or a match onto
--     an archived item -> "Invalid Row".

create or replace function public.pawcruz_import_inventory_csv(p_rows jsonb, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_row_number int;
  v_item_name text;
  v_sku text;
  v_category text;
  v_unit text;
  v_description text;
  v_supplier text;
  v_batch_number text;
  v_expiry_text text;
  v_expiry_date date;
  v_unit_price numeric;
  v_reorder_level numeric;
  v_quantity numeric;
  v_norm_name text;
  v_norm_sku text;
  v_sku_match_id uuid;
  v_sku_match_archived boolean;
  v_sku_match_sku text;
  v_name_match_id uuid;
  v_name_match_archived boolean;
  v_name_match_sku text;
  v_target_id uuid;
  v_target_archived boolean;
  v_target_sku text;
  v_auto_batch_pattern text;
  v_new_item_id uuid;
  v_status text;
  v_message text;
  v_results jsonb := '[]'::jsonb;
  v_new_items int := 0;
  v_updated_items int := 0;
  v_skipped int := 0;
  v_invalid int := 0;
begin
  perform public.pawcruz_pos_assert_staff(p_actor_id);

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'No import rows were provided.';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_item_name := '';
    v_sku := '';
    v_row_number := 0;

    begin
      v_row_number := coalesce((v_row->>'_row')::int, 0);
      v_item_name := btrim(coalesce(v_row->>'item_name', ''));
      v_sku := btrim(coalesce(v_row->>'sku', ''));
      v_category := btrim(coalesce(v_row->>'category', ''));
      v_unit := btrim(coalesce(v_row->>'unit', ''));
      v_description := nullif(btrim(coalesce(v_row->>'description', '')), '');
      v_supplier := nullif(btrim(coalesce(v_row->>'supplier_name', '')), '');
      v_batch_number := nullif(btrim(coalesce(v_row->>'batch_number', '')), '');
      v_expiry_text := nullif(btrim(coalesce(v_row->>'expiry_date', '')), '');
      v_expiry_date := v_expiry_text::date;
      v_unit_price := coalesce(nullif(btrim(coalesce(v_row->>'unit_price', '')), '')::numeric, 0);
      v_reorder_level := coalesce(nullif(btrim(coalesce(v_row->>'reorder_level', '')), '')::numeric, 0);
      v_quantity := coalesce(nullif(btrim(coalesce(v_row->>'quantity', '')), '')::numeric, 0);

      if v_item_name = '' or v_sku = '' or v_category = '' or v_unit = ''
         or v_expiry_date is null or v_quantity < 0 or v_unit_price < 0 or v_reorder_level < 0 then
        v_invalid := v_invalid + 1;
        v_results := v_results || jsonb_build_object(
          'row', v_row_number, 'item_name', v_item_name, 'sku', v_sku,
          'status', 'Invalid Row',
          'message', 'Missing or invalid required field (item name, SKU, category, unit, or expiry date).'
        );
        continue;
      end if;

      v_norm_name := public.pawcruz_normalize_text(v_item_name);
      v_norm_sku := public.pawcruz_normalize_text(v_sku);

      select id, is_archived, sku into v_sku_match_id, v_sku_match_archived, v_sku_match_sku
      from public.inventory_items
      where public.pawcruz_normalize_text(sku) = v_norm_sku
      limit 1;

      select id, is_archived, sku into v_name_match_id, v_name_match_archived, v_name_match_sku
      from public.inventory_items
      where public.pawcruz_normalize_text(item_name) = v_norm_name
      limit 1;

      if v_sku_match_id is not null and v_name_match_id is not null and v_sku_match_id <> v_name_match_id then
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object(
          'row', v_row_number, 'item_name', v_item_name, 'sku', v_sku,
          'status', 'Duplicate SKU – Conflict',
          'message', format('SKU "%s" belongs to a different existing item than the one already named "%s".', v_sku, v_item_name)
        );
        continue;
      end if;

      v_target_id := coalesce(v_sku_match_id, v_name_match_id);
      v_target_archived := coalesce(v_sku_match_archived, v_name_match_archived);
      v_target_sku := coalesce(v_sku_match_sku, v_name_match_sku);

      if v_target_id is not null then
        if v_target_archived then
          v_invalid := v_invalid + 1;
          v_results := v_results || jsonb_build_object(
            'row', v_row_number, 'item_name', v_item_name, 'sku', v_sku,
            'status', 'Invalid Row',
            'message', 'A matching item already exists but is archived/deactivated; reactivate it before importing more stock for it.'
          );
          continue;
        end if;

        -- pawcruz_record_inventory_transaction (see
        -- INVENTORY_UNIT_AUTO_GENERATE.sql) never leaves batch_number blank
        -- any more -- a row with no batch number gets a 'B' + year + SKU
        -- reference auto-assigned, optionally with a "-N" collision suffix.
        -- So a blank-batch row here can no longer be matched against an
        -- existing "batch_number is null" row (there won't be one); instead
        -- it's treated as a duplicate only when an existing batch already
        -- has that auto-generated shape for this SKU (any year, any
        -- suffix) *and* the same quantity and expiry date -- i.e. it looks
        -- like the exact same delivery already recorded, not a genuinely
        -- new one.
        v_auto_batch_pattern := '^B[0-9]{4}' || regexp_replace(upper(coalesce(v_target_sku, v_sku)), '[^A-Z0-9]', '', 'g') || '(-[0-9]+)?$';

        if exists (
          select 1 from public.inventory_batches
          where item_id = v_target_id
            and (
              (v_batch_number is not null and public.pawcruz_normalize_text(batch_number) = public.pawcruz_normalize_text(v_batch_number))
              or (
                v_batch_number is null
                and batch_number is not null
                and upper(batch_number) ~ v_auto_batch_pattern
                and quantity_received = v_quantity
                and expiry_date = v_expiry_date
              )
            )
        ) then
          v_skipped := v_skipped + 1;
          v_results := v_results || jsonb_build_object(
            'row', v_row_number, 'item_name', v_item_name, 'sku', v_sku,
            'status', 'Duplicate Batch – Skipped',
            'message', case
              when v_batch_number is not null then format('Duplicate item detected. No new item was created. Batch "%s" already exists for this item; stock was not added again.', v_batch_number)
              else 'Duplicate item detected. No new item was created. A batch with this exact quantity and expiry date already exists for this item; stock was not added again.'
            end
          );
          continue;
        end if;

        if v_quantity > 0 then
          perform public.pawcruz_record_inventory_transaction(
            p_item_id := v_target_id,
            p_transaction_type := 'Stock In',
            p_quantity := v_quantity,
            p_reason := 'CSV Import',
            p_notes := 'Imported via CSV',
            p_reference_type := 'CSV Import',
            p_created_by := p_actor_id,
            p_batch_number := v_batch_number,
            p_date_received := current_date,
            p_expiry_date := v_expiry_date
          );
          v_message := format('Duplicate item detected. No new item was created. Added a new batch of %s unit(s) to the existing item.', v_quantity);
        else
          v_message := 'Duplicate item detected. No new item was created. This row had no stock quantity to add.';
        end if;

        v_updated_items := v_updated_items + 1;
        v_results := v_results || jsonb_build_object(
          'row', v_row_number, 'item_name', v_item_name, 'sku', v_sku,
          'status', 'Existing Item – Stock Updated', 'message', v_message
        );
      else
        insert into public.inventory_items (
          item_name, category, sku, description, unit, unit_price, reorder_level,
          expiry_date, supplier_name, batch_number, created_by
        ) values (
          v_item_name, v_category, upper(v_sku), v_description, v_unit, v_unit_price, v_reorder_level,
          v_expiry_date, v_supplier, v_batch_number, p_actor_id
        )
        returning id into v_new_item_id;

        if v_quantity > 0 then
          perform public.pawcruz_record_inventory_transaction(
            p_item_id := v_new_item_id,
            p_transaction_type := 'Stock In',
            p_quantity := v_quantity,
            p_reason := 'CSV Import',
            p_notes := 'Initial stock via CSV import',
            p_reference_type := 'CSV Import',
            p_created_by := p_actor_id,
            p_batch_number := v_batch_number,
            p_date_received := current_date,
            p_expiry_date := v_expiry_date
          );
        end if;

        v_new_items := v_new_items + 1;
        v_results := v_results || jsonb_build_object(
          'row', v_row_number, 'item_name', v_item_name, 'sku', v_sku,
          'status', 'New Item – Imported', 'message', 'Created as a new inventory item.'
        );
      end if;
    exception when others then
      v_invalid := v_invalid + 1;
      v_results := v_results || jsonb_build_object(
        'row', v_row_number, 'item_name', coalesce(v_item_name, ''), 'sku', coalesce(v_sku, ''),
        'status', 'Invalid Row', 'message', sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object(
    'results', v_results,
    'summary', jsonb_build_object(
      'new_items', v_new_items,
      'updated_items', v_updated_items,
      'skipped', v_skipped,
      'invalid', v_invalid
    )
  );
end;
$$;

grant execute on function public.pawcruz_import_inventory_csv(jsonb, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
