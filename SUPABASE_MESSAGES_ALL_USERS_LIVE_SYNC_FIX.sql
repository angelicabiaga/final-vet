-- PawCruz Messaging: Web <-> Mobile, all roles
-- Run once in Supabase SQL Editor.

do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversation_participants;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
end $$;

alter table public.conversations replica identity full;
alter table public.conversation_participants replica identity full;
alter table public.messages replica identity full;

create or replace function public.pawcruz_touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_pawcruz_touch_conversation_on_message on public.messages;
create trigger trg_pawcruz_touch_conversation_on_message
after insert on public.messages
for each row execute function public.pawcruz_touch_conversation_on_message();

-- This project uses its own `profiles` login/session rather than Supabase Auth.
-- Messaging reads/writes therefore need to be available through the project API.
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists pawcruz_conversations_all_api on public.conversations;
create policy pawcruz_conversations_all_api on public.conversations
for all to anon, authenticated using (true) with check (true);

drop policy if exists pawcruz_conversation_participants_all_api on public.conversation_participants;
create policy pawcruz_conversation_participants_all_api on public.conversation_participants
for all to anon, authenticated using (true) with check (true);

drop policy if exists pawcruz_messages_all_api on public.messages;
create policy pawcruz_messages_all_api on public.messages
for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.conversations to anon, authenticated;
grant select, insert, update, delete on public.conversation_participants to anon, authenticated;
grant select, insert, update, delete on public.messages to anon, authenticated;
