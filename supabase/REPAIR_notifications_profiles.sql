-- PawCruz notifications population and profile-module repair.
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

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

grant select, insert, update, delete on public.notifications to anon, authenticated, service_role;
grant select, update on public.profiles to anon, authenticated, service_role;
alter table public.notifications enable row level security;
drop policy if exists "pawcruz notifications select" on public.notifications;
drop policy if exists "pawcruz notifications insert" on public.notifications;
drop policy if exists "pawcruz notifications update" on public.notifications;
create policy "pawcruz notifications select" on public.notifications for select using (true);
create policy "pawcruz notifications insert" on public.notifications for insert with check (true);
create policy "pawcruz notifications update" on public.notifications for update using (true) with check (true);

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

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "pawcruz profile avatars select" on storage.objects;
drop policy if exists "pawcruz profile avatars insert" on storage.objects;
drop policy if exists "pawcruz profile avatars update" on storage.objects;
create policy "pawcruz profile avatars select" on storage.objects for select using (bucket_id = 'profile-avatars');
create policy "pawcruz profile avatars insert" on storage.objects for insert with check (bucket_id = 'profile-avatars');
create policy "pawcruz profile avatars update" on storage.objects for update using (bucket_id = 'profile-avatars') with check (bucket_id = 'profile-avatars');

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
