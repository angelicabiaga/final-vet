# PawCruz Live Queue Sync

The mobile Pet Owner My Queue and Veterinarian Live Queue screens now read directly from the same Supabase `public.queue_entries` table used by the web Queue Management module.

## Live behavior
- Staff checks in an appointment/walk-in on web -> mobile queue appears automatically.
- Staff changes Waiting -> Serving -> Completed -> mobile status updates automatically.
- Queue reorder changes are reflected in mobile.
- Pet Owner mobile is filtered by `owner_id`.
- Veterinarian mobile is filtered by `veterinarian_id`, matching the web veterinarian queue behavior.
- A 30-second fallback refresh remains in case a Realtime connection temporarily reconnects.

## Required Supabase step
Run `SUPABASE_QUEUE_REALTIME_SYNC.sql` once in Supabase SQL Editor.
