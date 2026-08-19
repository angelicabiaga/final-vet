-- Run this in the Supabase SQL Editor and share the results (all 4 queries).
-- This checks whether "appointments" is really broken, or just hidden from
-- PostgREST's API layer while being perfectly fine at the database level.

-- 1. Does the table exist and have rows? (bypasses the API entirely)
select count(*) as row_count from public.appointments;

-- 2. Is it actually exposed to PostgREST in the "public" schema/api?
select table_schema, table_name
from information_schema.tables
where table_name = 'appointments';

-- 3. Is Row Level Security on, and if so, does a policy actually allow
--    inserts? (An RLS-enabled table with no INSERT policy returns exactly
--    this kind of failure to anon/authenticated callers.)
select relrowsecurity, relforcerowsecurity
from pg_class
where relname = 'appointments';

select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'appointments';

-- 4. Confirm the anon/authenticated roles actually have grants on it.
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'appointments';
