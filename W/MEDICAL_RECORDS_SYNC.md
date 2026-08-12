# PawCruz Medical Records Sync

The mobile Medical Records module now reads the same Supabase `public.medical_records` table used by the PawCruz web system.

- Pet Owner mobile: only the logged-in owner's **Finalized** records are shown.
- Veterinarian mobile: only records assigned to the logged-in veterinarian are shown.
- Related pet, owner, veterinarian, appointment and creator information comes from the same web tables.
- Supabase Realtime refreshes mobile when web records are inserted, updated, finalized, or deleted.
- A 30-second refresh fallback is retained for temporary realtime disconnects.
- The old hard-coded sample medical records were removed.

Run `SUPABASE_MEDICAL_RECORDS_REALTIME_SYNC.sql` once in the same Supabase project used by web and mobile.
