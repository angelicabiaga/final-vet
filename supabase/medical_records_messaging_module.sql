-- PawCruz Medical Records + Messaging Module
create extension if not exists pgcrypto;

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  veterinarian_id uuid not null references public.profiles(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  queue_entry_id uuid,
  consultation_date date not null default current_date,
  chief_complaint text,
  symptoms text,
  vital_signs text,
  weight numeric(8,2),
  temperature numeric(5,2),
  diagnosis text,
  treatment text,
  treatment_plan text,
  medication text,
  dosage text,
  frequency text,
  duration text,
  laboratory_request text,
  laboratory_result text,
  vaccination text,
  follow_up_date date,
  veterinarian_notes text,
  attachment_url text,
  record_status text not null default 'Draft' check (record_status in ('Draft','Finalized')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_medical_records_pet on public.medical_records(pet_id, consultation_date desc);
create index if not exists idx_medical_records_owner on public.medical_records(owner_id);
create index if not exists idx_medical_records_vet on public.medical_records(veterinarian_id);
create index if not exists idx_medical_records_status on public.medical_records(record_status);

drop trigger if exists set_medical_records_updated_at on public.medical_records;
create trigger set_medical_records_updated_at before update on public.medical_records
for each row execute function public.set_updated_at();

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  subject text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  attachment_url text,
  attachment_name text,
  created_at timestamptz not null default now(),
  check (coalesce(length(trim(body)),0) > 0 or attachment_url is not null)
);
create index if not exists idx_conversation_participant_profile on public.conversation_participants(profile_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_conversations_last_message on public.conversations(last_message_at desc);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

create or replace function public.touch_conversation_after_message()
returns trigger language plpgsql as $$ begin
  update public.conversations set last_message_at = new.created_at, updated_at = now() where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists touch_conversation_message on public.messages;
create trigger touch_conversation_message after insert on public.messages
for each row execute function public.touch_conversation_after_message();

alter table public.medical_records enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

-- Custom-login school-project policies. Frontend applies role-aware filtering.
drop policy if exists "custom app medical read" on public.medical_records;
create policy "custom app medical read" on public.medical_records for select to anon, authenticated using (true);
drop policy if exists "custom app medical insert" on public.medical_records;
create policy "custom app medical insert" on public.medical_records for insert to anon, authenticated with check (true);
drop policy if exists "custom app medical update" on public.medical_records;
create policy "custom app medical update" on public.medical_records for update to anon, authenticated using (true) with check (true);

drop policy if exists "custom app conversation read" on public.conversations;
create policy "custom app conversation read" on public.conversations for select to anon, authenticated using (true);
drop policy if exists "custom app conversation insert" on public.conversations;
create policy "custom app conversation insert" on public.conversations for insert to anon, authenticated with check (true);
drop policy if exists "custom app conversation update" on public.conversations;
create policy "custom app conversation update" on public.conversations for update to anon, authenticated using (true) with check (true);
drop policy if exists "custom app participant access" on public.conversation_participants;
create policy "custom app participant access" on public.conversation_participants for all to anon, authenticated using (true) with check (true);
drop policy if exists "custom app message access" on public.messages;
create policy "custom app message access" on public.messages for all to anon, authenticated using (true) with check (true);

insert into storage.buckets (id,name,public) values ('medical-attachments','medical-attachments',true) on conflict(id) do update set public=true;
insert into storage.buckets (id,name,public) values ('message-attachments','message-attachments',true) on conflict(id) do update set public=true;
drop policy if exists "medical attachments public read" on storage.objects;
create policy "medical attachments public read" on storage.objects for select to public using (bucket_id='medical-attachments');
drop policy if exists "medical attachments upload" on storage.objects;
create policy "medical attachments upload" on storage.objects for insert to anon,authenticated with check (bucket_id='medical-attachments');
drop policy if exists "message attachments public read" on storage.objects;
create policy "message attachments public read" on storage.objects for select to public using (bucket_id='message-attachments');
drop policy if exists "message attachments upload" on storage.objects;
create policy "message attachments upload" on storage.objects for insert to anon,authenticated with check (bucket_id='message-attachments');

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
