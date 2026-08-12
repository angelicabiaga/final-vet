# PawCruz Notification Sync

Mobile Pet Owner and Veterinarian notifications now use the same `public.notifications` table as the web system.

Synced behavior:
- recipient-specific notifications
- broadcast notifications (`recipient_id IS NULL`)
- unread/read state (`is_read`, `read_at`)
- mark one notification read
- mark all notifications read
- realtime INSERT / UPDATE / DELETE events
- 30-second fallback refresh when Realtime temporarily disconnects

Run `SUPABASE_NOTIFICATIONS_REALTIME_SYNC.sql` once in Supabase SQL Editor.
