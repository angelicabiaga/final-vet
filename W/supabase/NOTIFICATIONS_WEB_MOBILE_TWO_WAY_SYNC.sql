-- PawCruz Notifications: Web <-> Mobile two-way realtime sync
-- Run once in Supabase SQL Editor.
-- Safe to run more than once.

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Both the React web app and React Native mobile app must point to this same
-- Supabase project and public.notifications table.
-- INSERT  -> new notification appears on both platforms.
-- UPDATE  -> read/unread changes are reflected on both platforms.
-- DELETE  -> removed notifications disappear on both platforms.
