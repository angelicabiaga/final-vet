# Medical Records and Veterinarian Repair

Run `supabase/REPAIR_medical_records_veterinarians.sql` in the Supabase SQL Editor.

The script:

- recreates/completes `medical_records`
- restores its RLS policies and attachment bucket
- removes the frontend dependency on exact foreign-key relationship names
- creates or activates Dr. Redmond Lopez and Dr. Neil Norman A. Cruz
- assigns their default weekly schedules
- refreshes the Supabase/PostgREST schema cache

Default test accounts created only when the doctors do not already exist:

- `dr.redmond` / `redmond123`
- `dr.neil` / `neil123`

Restart React after running the SQL.
