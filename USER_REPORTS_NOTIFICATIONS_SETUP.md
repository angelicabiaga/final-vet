# User Management, Reports & Notifications Setup

1. Run `supabase/user_reports_notifications.sql` in the same Supabase project used by `.env`.
2. Restart every React localhost instance.
3. Log in as Admin and open:
   - `/admin/users`
   - `/admin/reports`
   - `/admin/notifications`
4. The bell in the header opens recent notifications. Select **Enable browser push** to request browser permission.

Notes:
- Browser push in this version uses the browser Notification API while the site is open. It is not background Web Push through a service worker.
- Broadcast announcements are stored in `notifications` with a null recipient, making them visible to all roles.
- The project uses custom profile/password authentication, so the SQL includes permissive development policies consistent with the existing project.
