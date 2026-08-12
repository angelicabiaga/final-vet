# Notifications and User Profile Setup

Run `supabase/REPAIR_notifications_profiles.sql` once in Supabase SQL Editor.

This script creates one welcome notification for every existing profile, enables notification Realtime, adds profile fields, and creates the `profile-avatars` bucket.

After running it, restart every React localhost. Use **Test Notification** in the Notification Center to verify inserts and Realtime. Open **My Profile** from the sidebar or click the user name in the header.
