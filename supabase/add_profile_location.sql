-- Adds a "location" column to profiles: a best-effort city/region/country
-- label auto-detected from the browser's public IP at login time (see
-- detectLoginLocation() in src/services/authService.js). Never entered by
-- the user -- it is written by the app on every successful login,
-- alongside the existing last_login_at update, and is null when the
-- lookup fails or is blocked (the Admin User Management page displays
-- "Unknown" in that case).
-- Run this once in the Supabase SQL Editor, same as the other files in
-- this folder.
alter table public.profiles
  add column if not exists location text;
