# PawCruz Messaging Final Fix

This update leaves the Medical Records module unchanged and repairs only Messaging.

## Required Supabase step

Run this file once in the same Supabase project used by your `.env`:

```text
supabase/FINAL_REPAIR_messages_api.sql
```

The script is safe to rerun. It creates or repairs:

- `conversations`
- `conversation_participants`
- `messages`
- `message-attachments` storage bucket
- messaging RLS and grants
- messaging Realtime publication
- RPC fallback functions for contacts, conversations, messages, sending, and read status

## Restart

After running the SQL, stop every localhost terminal and restart the ports you use:

```cmd
npm start
npm run start:admin
npm run start:staff
npm run start:vet
npm run start:owner
```

Only run the commands you need, each in a separate terminal.
