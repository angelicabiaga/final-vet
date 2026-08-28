-- PawCruz: Data Privacy Consent for brand-new Pet Owner accounts only.
--
-- Applies at the single moment a new Pet Owner account is created --
-- Pet Owner self-registration (web + mobile) and Staff walk-in
-- registration when the Pet Owner has no existing account. It is never
-- shown again after that: not on OTP verification, not on profile
-- editing, not when booking an appointment or selecting an existing
-- walk-in owner, not on Animal Patient registration/editing, and not on
-- any form that only retrieves or selects an existing Pet Owner.
--
-- consent_records is append-only (see the trigger below) -- a consent
-- decision is a point-in-time record, never edited after the fact. A
-- withdrawal or a changed mind would be a NEW row, not a mutation of an
-- old one.
--
-- pawcruz_create_pet_owner_with_consent creates the profile row and the
-- consent row(s) in one transaction, so a completed registration can
-- never end up without its required consent record, and a consent record
-- can never be created against a profile id that doesn't end up existing
-- (no temporary/fake id).
--
-- Apply this once in the Supabase SQL editor, after custom_auth_patch.sql
-- and guest_temp_password.sql (this reuses profiles.must_change_password).

-- create-if-missing, then explicitly heal any pre-existing table (e.g.
-- from an earlier draft of this file run against this same database) so
-- this migration converges to the schema below no matter what was here
-- before -- "if not exists" alone does NOT update an already-existing
-- table's columns or constraints, which is exactly what caused
-- consent_records_status_check to reject 'granted' after a stale copy
-- of this table (with different allowed status values) was left behind.
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Additive column healing -- a no-op on a table that already has these
-- (the normal case), but fills in anything missing from a stale/partial
-- prior version of this table without touching existing data.
alter table public.consent_records add column if not exists pet_owner_id uuid;
alter table public.consent_records add column if not exists consent_type text;
alter table public.consent_records add column if not exists status text;
alter table public.consent_records add column if not exists privacy_notice_version text;
alter table public.consent_records add column if not exists source_context text;
alter table public.consent_records add column if not exists method text;
alter table public.consent_records add column if not exists recorded_by uuid;

do $$ begin
  alter table public.consent_records add constraint consent_records_pet_owner_id_fkey foreign key (pet_owner_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.consent_records add constraint consent_records_recorded_by_fkey foreign key (recorded_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Force these two CHECK constraints to exactly the values this file's
-- own RPC below actually inserts, regardless of what a stale prior
-- version of this table had them set to -- this is the fix for
-- consent_records_status_check rejecting 'granted'.
alter table public.consent_records drop constraint if exists consent_records_consent_type_check;
alter table public.consent_records add constraint consent_records_consent_type_check check (consent_type in ('service', 'marketing'));

alter table public.consent_records drop constraint if exists consent_records_status_check;
alter table public.consent_records add constraint consent_records_status_check check (status in ('granted', 'withdrawn'));

comment on table public.consent_records is
  'Append-only Data Privacy consent log. One row per consent decision (service/marketing), written only at new Pet Owner account creation -- never edited afterward.';
comment on column public.consent_records.consent_type is
  '''service'' is the required Data Privacy Consent for account registration and clinic services. ''marketing'' is the separate, optional promotions/announcements consent.';
comment on column public.consent_records.recorded_by is
  'The staff member who recorded consent on the Pet Owner''s behalf during walk-in registration, or null for self-registration (web/mobile).';

create index if not exists idx_consent_records_pet_owner on public.consent_records(pet_owner_id, created_at desc);

alter table public.consent_records enable row level security;

-- Matches this app's custom-auth model (no real auth.uid() session --
-- see custom_auth_patch.sql), same wide-open "demo access" policy pattern
-- already used on every other client-facing table in this schema.
do $$ begin
  create policy "demo consent_records access" on public.consent_records for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Append-only enforcement at the database level -- independent of RLS,
-- independent of whatever any client does or doesn't allow.
create or replace function public.pawcruz_block_consent_record_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'consent_records is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists trg_pawcruz_block_consent_record_update on public.consent_records;
create trigger trg_pawcruz_block_consent_record_update
before update on public.consent_records
for each row execute function public.pawcruz_block_consent_record_mutation();

drop trigger if exists trg_pawcruz_block_consent_record_delete on public.consent_records;
create trigger trg_pawcruz_block_consent_record_delete
before delete on public.consent_records
for each row execute function public.pawcruz_block_consent_record_mutation();

-- ---------------------------------------------------------------------
-- Atomic account + consent creation. Used by every real new-Pet-Owner
-- creation path: web self-registration, mobile self-registration, and
-- staff walk-in registration for a guest with no existing account.
-- security definer so it can insert into both profiles and
-- consent_records regardless of the (RLS-restricted) caller -- the
-- function body is the only thing deciding what gets written.
-- ---------------------------------------------------------------------
create or replace function public.pawcruz_create_pet_owner_with_consent(
  p_full_name text,
  p_username text,
  p_email text,
  p_password text,
  p_marketing_consent boolean,
  p_privacy_notice_version text,
  p_source_context text,
  p_method text,
  p_phone text default null,
  p_address text default null,
  p_must_change_password boolean default false,
  p_recorded_by uuid default null
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  insert into public.profiles (full_name, username, email, password, phone, address, role, account_status, must_change_password)
  values (p_full_name, p_username, p_email, p_password, p_phone, p_address, 'pet_owner', 'active', p_must_change_password)
  returning * into v_profile;

  insert into public.consent_records (pet_owner_id, consent_type, status, privacy_notice_version, source_context, method, recorded_by)
  values (v_profile.id, 'service', 'granted', p_privacy_notice_version, p_source_context, p_method, p_recorded_by);

  if p_marketing_consent then
    insert into public.consent_records (pet_owner_id, consent_type, status, privacy_notice_version, source_context, method, recorded_by)
    values (v_profile.id, 'marketing', 'granted', p_privacy_notice_version, p_source_context, p_method, p_recorded_by);
  end if;

  return v_profile;
end;
$$;

notify pgrst, 'reload schema';
