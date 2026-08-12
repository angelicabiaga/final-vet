# Messaging Web ↔ Mobile Sync

Messages now use the same Supabase conversation records on web and mobile.

- Conversation lists identify the actual other participant instead of generic "New conversation" titles.
- The participant role is shown under the name.
- The latest-message preview identifies who sent it ("You:" or the sender's name).
- Message bubbles show the sender's name.
- New messages and new conversation membership refresh conversation lists in realtime.
- Read/unread counts remain backed by conversation_participants.last_read_at.

Run `SUPABASE_MESSAGES_WEB_MOBILE_REALTIME_SYNC.sql` once in Supabase SQL Editor.
