# Web + Mobile Appointment Slot Sync

Both PawCruz Web and Mobile now use the same rules:

- Clinic booking window: 9:00 AM–7:00 PM.
- Appointment duration: 10 minutes.
- Final slot: 6:50 PM–7:00 PM.
- Confirmed appointments are removed from the available-time list for the same veterinarian/date.
- Both apps recheck the selected slot immediately before booking or rescheduling.
- Supabase prevents simultaneous Web/Mobile bookings for the same veterinarian/date/start time.
- A booking made in Mobile is stored in the same `appointments` table and therefore becomes unavailable on Web, and vice versa.

Run `SUPABASE_WEB_MOBILE_APPOINTMENT_SLOT_SYNC.sql` ONCE in the Supabase project used by both applications.
