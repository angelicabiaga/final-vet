-- PawCruz: background push notifications (web browsers + mobile app).
-- Run ONCE in the Supabase SQL Editor, AFTER deploying the send-push Edge
-- Function. Safe to re-run.
--
-- What it does:
--   1. push_subscriptions: one row per browser (web push) or phone (Expo
--      push token) that a signed-in user has allowed notifications on.
--   2. notifications.push_sent_at: lets send-push deliver each notification
--      exactly once, no matter how many times it's called.
--   3. A trigger that, for every new notification (appointments, queue,
--      inventory, messages, broadcasts -- everything), asks the send-push
--      Edge Function to deliver it. If that call fails, the notification
--      itself is still saved -- push is best-effort.

begin;

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('web', 'expo')),
  -- web: the browser's push endpoint URL; expo: the ExponentPushToken[...]
  token text not null unique,
  -- web only: { p256dh, auth } encryption keys from the browser
  keys jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

-- Same access model as the rest of PawCruz (custom login over the anon key).
alter table public.push_subscriptions enable row level security;
drop policy if exists "PawCruz push subscriptions access" on public.push_subscriptions;
create policy "PawCruz push subscriptions access" on public.push_subscriptions
  for all to anon, authenticated using (true) with check (true);

alter table public.notifications add column if not exists push_sent_at timestamptz;

create or replace function public.pawcruz_queue_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://ucozpjeeawbycefxkasn.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
exception when others then
  -- Never block saving the notification because push couldn't be queued.
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_queue_push on public.notifications;
create trigger trg_pawcruz_queue_push
after insert on public.notifications
for each row execute function public.pawcruz_queue_push();

notify pgrst, 'reload schema';
commit;
