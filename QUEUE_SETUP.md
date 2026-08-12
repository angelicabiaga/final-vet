# PawCruz Queue Management Setup

Run `supabase/queue_management.sql` after the appointment and schedule SQL scripts.

Role pages:
- Admin: `/admin/queue`
- Staff: `/staff/queue`
- Veterinarian: `/veterinarian/queue`
- Pet owner: `/pet-owner/queue`
- Public display: `/queue-display`

Queue numbers reset by clinic date and use `A-001` for appointments and `W-001` for walk-ins. Scheduled clients arriving more than 15 minutes late are marked Late Arrival but are still checked in and do not automatically jump ahead.
