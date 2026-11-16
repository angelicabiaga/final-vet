-- Store each name part exactly as the user typed it at registration, so the
-- Edit User form no longer has to guess where a two-word first name ends
-- (e.g. "Theodore Jhon Fer" + "Licuanan"). full_name stays the display name.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists middle_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists name_suffix text;

notify pgrst, 'reload schema';
