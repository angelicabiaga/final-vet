-- PawCruz: picture attachments on broadcast notifications.
-- Run ONCE in the Supabase SQL Editor. Safe to re-run.
--
-- 1. notifications.image_url -- public URL of the attached picture (optional).
-- 2. broadcast-images storage bucket (public, like profile-avatars) that the
--    admin's Broadcast Notification form uploads pictures into.

begin;

alter table public.notifications add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('broadcast-images', 'broadcast-images', true)
on conflict (id) do update set public = true;

drop policy if exists "pawcruz broadcast images select" on storage.objects;
drop policy if exists "pawcruz broadcast images insert" on storage.objects;
create policy "pawcruz broadcast images select" on storage.objects
  for select using (bucket_id = 'broadcast-images');
create policy "pawcruz broadcast images insert" on storage.objects
  for insert with check (bucket_id = 'broadcast-images');

notify pgrst, 'reload schema';
commit;
