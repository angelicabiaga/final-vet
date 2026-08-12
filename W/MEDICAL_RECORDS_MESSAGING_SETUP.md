# Medical Records and Messaging Setup

Run this SQL after the existing PawCruz SQL files:

`supabase/medical_records_messaging_module.sql`

## Medical records
- Admin and Staff can view, create, update, finalize, print, and attach files.
- Veterinarians see records assigned to them and can create/update/finalize them.
- Pet Owners only see finalized records belonging to their own pets.
- Records connect to pets, owners, veterinarians, and optional appointments.

## Messaging
- All roles can create conversations with one or multiple active users.
- Messages update in real time through Supabase Realtime.
- Supports unread counts, timestamps, and file attachments.

## Storage buckets
The SQL creates public school-project buckets:
- `medical-attachments`
- `message-attachments`

Because this project uses custom localStorage authentication instead of Supabase Auth, the SQL uses permissive demo RLS policies. Use test data only.
