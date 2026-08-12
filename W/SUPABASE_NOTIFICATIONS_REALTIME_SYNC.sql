-- PawCruz Web <-> Mobile Notifications realtime sync
-- Run once in Supabase SQL Editor.

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- This project uses the same public.notifications table for web and mobile.
-- Mobile reads recipient-specific notifications plus broadcasts where recipient_id IS NULL.
-- Existing project RLS/policies remain untouched so this script does not change your security model.
