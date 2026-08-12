-- PawCruz Inventory Web <-> Mobile Realtime Sync
-- Run once in Supabase SQL Editor.

begin;

grant select on table public.inventory_items to authenticated;

alter table public.inventory_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table public.inventory_items;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
