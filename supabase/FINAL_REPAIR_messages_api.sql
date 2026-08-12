-- PawCruz FINAL Messaging Repair
-- Safe to run more than once. This script does not modify medical records.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  subject text,
  created_by uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations add column if not exists subject text;
alter table public.conversations add column if not exists created_by uuid;
alter table public.conversations add column if not exists last_message_at timestamptz not null default now();
alter table public.conversations add column if not exists created_at timestamptz not null default now();
alter table public.conversations add column if not exists updated_at timestamptz not null default now();

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

alter table public.conversation_participants add column if not exists conversation_id uuid;
alter table public.conversation_participants add column if not exists profile_id uuid;
alter table public.conversation_participants add column if not exists last_read_at timestamptz;
alter table public.conversation_participants add column if not exists joined_at timestamptz not null default now();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  attachment_url text,
  attachment_name text,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists conversation_id uuid;
alter table public.messages add column if not exists sender_id uuid;
alter table public.messages add column if not exists body text;
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists created_at timestamptz not null default now();

create unique index if not exists uq_conversation_participant
  on public.conversation_participants(conversation_id, profile_id);
create index if not exists idx_conversation_participant_profile
  on public.conversation_participants(profile_id, conversation_id);
create index if not exists idx_messages_conversation
  on public.messages(conversation_id, created_at);
create index if not exists idx_conversations_last_message
  on public.conversations(last_message_at desc);

create or replace function public.pawcruz_touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists pawcruz_touch_conversation_message on public.messages;
create trigger pawcruz_touch_conversation_message
after insert on public.messages
for each row execute function public.pawcruz_touch_conversation_after_message();

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists "pawcruz conversations read" on public.conversations;
create policy "pawcruz conversations read"
on public.conversations for select to anon, authenticated using (true);

drop policy if exists "pawcruz conversations insert" on public.conversations;
create policy "pawcruz conversations insert"
on public.conversations for insert to anon, authenticated with check (true);

drop policy if exists "pawcruz conversations update" on public.conversations;
create policy "pawcruz conversations update"
on public.conversations for update to anon, authenticated using (true) with check (true);

drop policy if exists "pawcruz participants all" on public.conversation_participants;
create policy "pawcruz participants all"
on public.conversation_participants for all to anon, authenticated using (true) with check (true);

drop policy if exists "pawcruz messages all" on public.messages;
create policy "pawcruz messages all"
on public.messages for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.conversations to anon, authenticated;
grant select, insert, update, delete on public.conversation_participants to anon, authenticated;
grant select, insert, update, delete on public.messages to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "pawcruz message attachments read" on storage.objects;
create policy "pawcruz message attachments read"
on storage.objects for select to public
using (bucket_id = 'message-attachments');

drop policy if exists "pawcruz message attachments insert" on storage.objects;
create policy "pawcruz message attachments insert"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'message-attachments');

-- Contacts RPC
create or replace function public.pawcruz_get_message_contacts(p_profile_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.full_name), '[]'::jsonb)
  from (
    select id, full_name, username, email, role::text as role, account_status::text as account_status
    from public.profiles
    where id <> p_profile_id
      and lower(account_status::text) = 'active'
  ) x;
$$;

-- Conversation list RPC. It intentionally returns fully assembled JSON to avoid
-- PostgREST relationship-name and schema-cache issues in the frontend.
create or replace function public.pawcruz_get_conversations(p_profile_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_data order by sort_time desc), '[]'::jsonb)
  from (
    select
      coalesce(c.last_message_at, c.created_at) as sort_time,
      jsonb_build_object(
        'id', c.id,
        'subject', c.subject,
        'created_by', c.created_by,
        'last_message_at', c.last_message_at,
        'created_at', c.created_at,
        'participants', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'username', p.username,
            'email', p.email,
            'role', p.role::text
          ) order by p.full_name)
          from public.conversation_participants cp2
          join public.profiles p on p.id = cp2.profile_id
          where cp2.conversation_id = c.id
        ), '[]'::jsonb),
        'latest', (
          select jsonb_build_object(
            'id', m.id,
            'conversation_id', m.conversation_id,
            'sender_id', m.sender_id,
            'body', m.body,
            'attachment_url', m.attachment_url,
            'attachment_name', m.attachment_name,
            'created_at', m.created_at
          )
          from public.messages m
          where m.conversation_id = c.id
          order by m.created_at desc
          limit 1
        ),
        'unread', (
          select count(*)::int
          from public.messages m
          where m.conversation_id = c.id
            and m.sender_id <> p_profile_id
            and (cp.last_read_at is null or m.created_at > cp.last_read_at)
        )
      ) as row_data
    from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
    where cp.profile_id = p_profile_id
  ) q;
$$;

create or replace function public.pawcruz_get_messages(p_conversation_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
  from (
    select
      m.id,
      m.conversation_id,
      m.sender_id,
      m.body,
      m.attachment_url,
      m.attachment_name,
      m.created_at,
      jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'role', p.role::text
      ) as sender
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    where m.conversation_id = p_conversation_id
  ) x;
$$;

create or replace function public.pawcruz_create_conversation(
  p_created_by uuid,
  p_participant_ids uuid[],
  p_subject text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.conversations;
  v_profile_id uuid;
begin
  if p_created_by is null then
    raise exception 'Creator profile is required.';
  end if;

  insert into public.conversations(subject, created_by)
  values (coalesce(nullif(trim(p_subject), ''), 'New conversation'), p_created_by)
  returning * into v_conversation;

  insert into public.conversation_participants(conversation_id, profile_id, last_read_at)
  values (v_conversation.id, p_created_by, now())
  on conflict (conversation_id, profile_id) do nothing;

  foreach v_profile_id in array coalesce(p_participant_ids, array[]::uuid[])
  loop
    if v_profile_id is not null and v_profile_id <> p_created_by then
      insert into public.conversation_participants(conversation_id, profile_id)
      values (v_conversation.id, v_profile_id)
      on conflict (conversation_id, profile_id) do nothing;
    end if;
  end loop;

  if (select count(*) from public.conversation_participants where conversation_id = v_conversation.id) < 2 then
    delete from public.conversations where id = v_conversation.id;
    raise exception 'Choose at least one recipient.';
  end if;

  return to_jsonb(v_conversation);
end;
$$;

create or replace function public.pawcruz_mark_conversation_read(
  p_conversation_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and profile_id = p_profile_id;
  return found;
end;
$$;

create or replace function public.pawcruz_send_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text default null,
  p_attachment_url text default null,
  p_attachment_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
begin
  if not exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and profile_id = p_sender_id
  ) then
    raise exception 'Sender is not a conversation participant.';
  end if;

  if coalesce(length(trim(p_body)), 0) = 0 and p_attachment_url is null then
    raise exception 'A message or attachment is required.';
  end if;

  insert into public.messages(
    conversation_id, sender_id, body, attachment_url, attachment_name
  ) values (
    p_conversation_id,
    p_sender_id,
    nullif(trim(p_body), ''),
    p_attachment_url,
    p_attachment_name
  ) returning * into v_message;

  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and profile_id = p_sender_id;

  return to_jsonb(v_message);
end;
$$;

revoke all on function public.pawcruz_get_message_contacts(uuid) from public;
revoke all on function public.pawcruz_get_conversations(uuid) from public;
revoke all on function public.pawcruz_get_messages(uuid) from public;
revoke all on function public.pawcruz_create_conversation(uuid, uuid[], text) from public;
revoke all on function public.pawcruz_mark_conversation_read(uuid, uuid) from public;
revoke all on function public.pawcruz_send_message(uuid, uuid, text, text, text) from public;

grant execute on function public.pawcruz_get_message_contacts(uuid) to anon, authenticated;
grant execute on function public.pawcruz_get_conversations(uuid) to anon, authenticated;
grant execute on function public.pawcruz_get_messages(uuid) to anon, authenticated;
grant execute on function public.pawcruz_create_conversation(uuid, uuid[], text) to anon, authenticated;
grant execute on function public.pawcruz_mark_conversation_read(uuid, uuid) to anon, authenticated;
grant execute on function public.pawcruz_send_message(uuid, uuid, text, text, text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
