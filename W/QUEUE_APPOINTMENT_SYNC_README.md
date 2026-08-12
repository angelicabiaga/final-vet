# Queue and Appointment Sync Fix

Run `QUEUE_APPOINTMENT_TWO_WAY_STATUS_SYNC_FIX.sql` once in Supabase SQL Editor.

After the repair:
- Pet Owner mobile only shows an active queue number for `Waiting` or `Serving`.
- A linked `Completed` or `Cancelled` appointment never shows an old queue number.
- Queue `Completed` updates the linked appointment to `Completed` (unless it was Cancelled).
- Appointment `Completed` or `Cancelled` closes its linked active queue entry.
- Existing stale active queue rows for already closed appointments are repaired immediately.
- Mobile listens to both `queue_entries` and `appointments` Realtime changes.
