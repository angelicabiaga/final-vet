# All Users Messaging Sync Fix

Web and mobile now use the same Supabase messaging records for Admin, Staff,
Veterinarian and Pet Owner conversations.

Important changes:
- message INSERT/UPDATE/DELETE events refresh conversations;
- mobile polls the conversation list every 5 seconds and an open chat every 3 seconds
  as a fallback if Realtime reconnects slowly;
- Veterinarian mobile can receive/reply to Staff/Admin/Pet Owner conversations;
- `last_message_at` is updated automatically by a database trigger;
- conversation/message tables are enabled for Realtime.

Run `SUPABASE_MESSAGES_ALL_USERS_LIVE_SYNC_FIX.sql` once in Supabase SQL Editor.
