# Fix: Unable to load date schedules

Run this file in Supabase SQL Editor:

```text
supabase/REPAIR_veterinarian_schedules.sql
```

It safely recreates:

- `veterinarian_schedules`
- `veterinarian_schedule_overrides`
- indexes, triggers, RLS policies, and appointment validation
- default schedules for existing veterinarian profiles
- automatic default schedule creation for future veterinarian profiles

Default weekly schedules, Sunday through Saturday:

- Dr. Redmond Lopez: 9:00 AM–5:00 PM
- Dr. Neil Norman A. Cruz: 11:00 AM–7:00 PM

Defaults only fill days that have no schedule yet; they never overwrite hours set by staff.

The veterinarian profiles must have `role = 'veterinarian'`, `account_status = 'active'`, and names containing `Redmond` or `Neil`.
