# Medical Records final fix

Run this file in Supabase SQL Editor:

`supabase/FINAL_REPAIR_medical_records_api.sql`

Then restart the React dev server. The frontend now tries the normal table endpoint first and automatically falls back to the `pawcruz_get_medical_records` / `pawcruz_save_medical_record` RPC functions when the table route is temporarily missing from the REST schema cache.

The SQL also ensures these active default veterinarians and schedules:

- Dr. Redmond Lopez — 9:00 AM to 5:00 PM, Sunday through Saturday
- Dr. Neil Norman A. Cruz — 11:00 AM to 7:00 PM, Sunday through Saturday
