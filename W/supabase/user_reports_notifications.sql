-- PawCruz User Management, Reports support, and Notifications
create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'General',
  related_module text,
  related_record uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists recipient_id uuid;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists notification_type text default 'General';
alter table public.notifications add column if not exists related_module text;
alter table public.notifications add column if not exists related_record uuid;
alter table public.notifications add column if not exists is_read boolean default false;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists created_by uuid;
alter table public.notifications add column if not exists created_at timestamptz default now();

create index if not exists idx_notifications_recipient_created on public.notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(recipient_id, is_read) where is_read = false;

grant select, insert, update, delete on public.notifications to anon, authenticated, service_role;
alter table public.notifications enable row level security;
drop policy if exists "pawcruz notifications select" on public.notifications;
drop policy if exists "pawcruz notifications insert" on public.notifications;
drop policy if exists "pawcruz notifications update" on public.notifications;
create policy "pawcruz notifications select" on public.notifications for select using (true);
create policy "pawcruz notifications insert" on public.notifications for insert with check (true);
create policy "pawcruz notifications update" on public.notifications for update using (true) with check (true);

-- Custom frontend authentication requires public API policies for school-project operation.
grant select, insert, update, delete on public.profiles to anon, authenticated, service_role;
grant select, insert on public.activity_logs to anon, authenticated, service_role;

-- Add notification table to Realtime without failing when already added.
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

create or replace function public.notify_low_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('Low Stock','Out of Stock','Near Expiry','Expired') and (old.status is distinct from new.status) then
    insert into public.notifications(recipient_id,title,message,notification_type,related_module,related_record)
    values(null,'Inventory Alert',new.item_name || ' is now ' || new.status,'Low-stock Alert','Inventory',new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_low_inventory on public.inventory_items;
create trigger trg_notify_low_inventory after update of status on public.inventory_items for each row execute function public.notify_low_inventory();

notify pgrst, 'reload schema';

-- Populate the center for existing accounts, so it is not empty after installation.
insert into public.notifications (recipient_id, title, message, notification_type, related_module)
select p.id,
       'Welcome to PawCruz',
       'Your notification center is ready. Appointment, queue, inventory, message, and account updates will appear here.',
       'Account Security Alert',
       'Account'
from public.profiles p
where not exists (
  select 1 from public.notifications n
  where n.recipient_id = p.id and n.title = 'Welcome to PawCruz'
);

-- Profile images used by all role profile pages.
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "pawcruz profile avatars select" on storage.objects;
drop policy if exists "pawcruz profile avatars insert" on storage.objects;
drop policy if exists "pawcruz profile avatars update" on storage.objects;
create policy "pawcruz profile avatars select" on storage.objects for select using (bucket_id = 'profile-avatars');
create policy "pawcruz profile avatars insert" on storage.objects for insert with check (bucket_id = 'profile-avatars');
create policy "pawcruz profile avatars update" on storage.objects for update using (bucket_id = 'profile-avatars') with check (bucket_id = 'profile-avatars');

notify pgrst, 'reload schema';
