# Profile Web ↔ Mobile Sync

Web profile pages now subscribe to realtime updates from `public.profiles` so edits saved by the mobile app are reflected without a manual page refresh.

Synced fields: `full_name`, `username`, `email`, `phone`, `address`, `avatar_url`, `updated_at`.

Notifications continue using the shared `public.notifications` realtime flow for web/mobile INSERT, UPDATE and DELETE changes.
