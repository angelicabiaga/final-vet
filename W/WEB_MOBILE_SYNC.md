# PawCruz Web + Mobile Appointment Sync

Both apps use the same Supabase project and the same `appointments`, `pets`, `profiles`, `veterinarian_schedules`, and `notifications` tables.

Run `SUPABASE_APPOINTMENT_REALTIME_SYNC.sql` once in the Supabase SQL Editor. It publishes appointment changes to Realtime, creates Staff/Admin notifications for new Online appointments, and creates Pet Owner notifications for appointment status changes.

After that:
- Pet Owner mobile booking inserts directly into `public.appointments`.
- Staff web Appointment Management receives the new row through Supabase Realtime and refreshes automatically.
- Veterinarian mobile receives assigned appointment changes automatically.
- Pet Owner mobile receives appointment status/reschedule/cancellation changes automatically.
- The existing database constraints remain the source of truth for 10-minute slots, doctor schedules, pet ownership, and duplicate-slot prevention.
