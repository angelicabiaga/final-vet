# Web Notification Bell — All Roles / All Modules

The shared `src/components/NotificationBell.jsx` was updated, so the same readable
notification panel is used anywhere `AppShell` is used for Admin, Staff,
Veterinarian, and Pet Owner.

Changes:
- larger desktop panel with viewport-safe fixed placement;
- only notification list scrolls; header, actions and footer remain visible;
- larger titles/messages/timestamps;
- actual `notification_type` is displayed;
- clearer unread pill and card borders;
- improved whitespace and long-message wrapping;
- responsive mobile/tablet sizing;
- notification database and realtime behavior unchanged.
