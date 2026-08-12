# Dashboard Track Activities Sync

The Pet Owner mobile dashboard now uses the shared Supabase data for all Track Activities:
- Pet Profiles: active rows in `pets`
- Appointment Requests: all owner appointment records
- Health Records: finalized `medical_records`
- Visit Notes: completed appointments
- Latest Activity: the owner's latest `activity_logs` record

Pet profile create/edit actions made from mobile also write an `activity_logs` entry,
so the same activity can be seen by the web backend.

Run `SUPABASE_DASHBOARD_ACTIVITY_REALTIME_SYNC.sql` once in Supabase SQL Editor.
