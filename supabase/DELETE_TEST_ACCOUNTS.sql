-- One-off cleanup: deletes exactly these 4 test pet-owner accounts (and
-- everything that references them), by email:
--   marilou.n.jamis@gmail.com, adhga@gmail.com, aldwin@gmail.com, hvvd@gmail.com
--
-- The Table Editor's bulk-delete failed with a foreign-key error because
-- appointments (and likely medical_records, queue_entries, pets, and
-- others) still reference these profiles. Rather than hand-listing every
-- table by name (and risking missing one), this walks every REAL foreign
-- key constraint in the public schema that points at public.pets(id) or
-- public.profiles(id) and deletes matching rows first -- deepest
-- dependents, then pets, then the profiles themselves. Nothing outside
-- these 4 accounts' own data is touched.
--
-- Everything runs inside one transaction -- if anything fails partway,
-- nothing is left half-deleted. RAISE NOTICE lines show exactly what got
-- deleted from where when you run this in the Supabase SQL editor.

begin;

create temporary table _target_profiles on commit drop as
select id from public.profiles
where email in ('marilou.n.jamis@gmail.com','adhga@gmail.com','aldwin@gmail.com','hvvd@gmail.com');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from _target_profiles;
  raise notice 'Matched % of 4 target profiles by email.', v_count;
end $$;

create temporary table _target_pets on commit drop as
select id from public.pets where owner_id in (select id from _target_profiles);

-- Delete every row in any table with a real FK pointing at
-- public.pets(id), for just these pets.
do $$
declare
  rec record;
  affected int;
begin
  for rec in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public' and ccu.table_name = 'pets' and ccu.column_name = 'id'
  loop
    execute format(
      'delete from %I.%I where %I in (select id from _target_pets)',
      rec.table_schema, rec.table_name, rec.column_name
    );
    get diagnostics affected = row_count;
    if affected > 0 then
      raise notice 'Deleted % row(s) from %.% (%)', affected, rec.table_schema, rec.table_name, rec.column_name;
    end if;
  end loop;
end $$;

delete from public.pets where id in (select id from _target_pets);

-- Delete every row in any table with a real FK pointing at
-- public.profiles(id), for just these 4 profiles.
do $$
declare
  rec record;
  affected int;
begin
  for rec in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public' and ccu.table_name = 'profiles' and ccu.column_name = 'id'
      and tc.table_name <> 'profiles'
  loop
    execute format(
      'delete from %I.%I where %I in (select id from _target_profiles)',
      rec.table_schema, rec.table_name, rec.column_name
    );
    get diagnostics affected = row_count;
    if affected > 0 then
      raise notice 'Deleted % row(s) from %.% (%)', affected, rec.table_schema, rec.table_name, rec.column_name;
    end if;
  end loop;
end $$;

delete from public.profiles where id in (select id from _target_profiles);

commit;

-- Verify: should return 0 rows.
select id, email, full_name from public.profiles
where email in ('marilou.n.jamis@gmail.com','adhga@gmail.com','aldwin@gmail.com','hvvd@gmail.com');
