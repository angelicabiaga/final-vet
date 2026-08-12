# Inventory Form + Appointment Slot Fix

Inventory
- No inventory products were automatically added.
- SKU is renamed in the UI to `Item Code (SKU)` and explained as a unique internal code.
- Category is now a dropdown based on the supplied clinic spreadsheet:
  Vaccines, Test Kits, Antibiotics, Supplements, Food Supplements,
  Anti Parasite, Anti Inflammatory, Eye Drops, Ear Drops, Others.
- Technical labels were rewritten with clear descriptions.

Appointments
- Booking hours now extend to 7:00 PM.
- The final available 10-minute slot is 6:50 PM–7:00 PM.
- A fresh slot availability check runs immediately before booking/rescheduling.
- The Supabase trigger prevents two Confirmed appointments from taking the same veterinarian/date/time,
  including simultaneous booking attempts.

Run `SUPABASE_APPOINTMENT_HOURS_SLOT_FIX.sql` once in Supabase SQL Editor.
