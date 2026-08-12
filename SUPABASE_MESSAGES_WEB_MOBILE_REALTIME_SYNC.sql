-- PawCruz Messaging Web <-> Mobile Realtime Sync
-- Run once in Supabase SQL Editor.

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.conversation_participants;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
end $$;

-- The web and mobile apps must point to the same Supabase project.
-- They already use the same conversations, conversation_participants, messages and profiles tables.
