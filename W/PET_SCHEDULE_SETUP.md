# Pet Management and Veterinarian Schedule Setup

Run the SQL scripts in this order in Supabase SQL Editor:

1. `supabase/phase1_setup.sql`
2. `supabase/custom_auth_patch.sql`
3. `supabase/appointment_module.sql`
4. `supabase/pet_schedule_module.sql`

The fourth script adds complete pet fields, pet photo storage, archive support, date-specific veterinarian schedules, and appointment validation that respects schedule overrides.

## New navigation

Admin: Pet Management, Veterinarian Schedules
Staff: Animal Patients, Veterinarian Schedules
Veterinarian: Animal Patients
Pet Owner: My Pets

## Schedule priority

When a booking date is selected, the system checks `veterinarian_schedule_overrides` first. If no row exists for that date, it uses `veterinarian_schedules` for the matching weekday.

A date override can mark the veterinarian unavailable or give adjusted start/end hours. Time slots remain in 10-minute intervals.
