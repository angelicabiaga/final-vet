-- PawCruz: replace the E-###/#H## queue numbering scheme with a simpler
-- two-prefix version, KEEPING the hour-block numbering:
--   Q-H## -> made by staff (any Walk-In sourced booking, any date) OR
--            an appointment scheduled for today, regardless of source.
--   A-H## -> an advance appointment: booked online by the pet owner (source
--            'Online') for a future date (not today).
-- H is the 12-hour clock hour of the appointment's start_time, ## is a
-- sequential 2-digit counter within that hour block for that prefix and
-- date (e.g. a 3:xx PM booking -> Q-301, Q-302 ...; a 4:xx PM booking ->
-- Q-401 ...). Run this ONCE in the Supabase SQL Editor, after
-- appointment_queue_numbering.sql. Purely additive: only replaces the
-- next_queue_number() function body; existing queue_number values already
-- assigned under an older scheme are left as-is.

begin;

create or replace function public.next_queue_number(p_source text, p_date date, p_start_time time)
returns text language plpgsql security definer set search_path=public as $$
declare
  prefix text;
  hour24 integer;
  hour12 integer;
  seq integer;
begin
  if p_source = 'Walk-In' or p_date = current_date then
    prefix := 'Q';
  else
    prefix := 'A';
  end if;

  hour24 := extract(hour from coalesce(p_start_time, localtime))::integer;
  hour12 := hour24 % 12;
  if hour12 = 0 then hour12 := 12; end if;

  perform pg_advisory_xact_lock(hashtext('queuenum-' || prefix || '-' || p_date::text || '-' || hour24::text));
  select count(*) + 1 into seq
  from public.appointments
  where appointment_date = p_date
    and queue_number is not null
    and queue_number like (prefix || '-%')
    and extract(hour from start_time)::integer = hour24;

  return prefix || '-' || hour12::text || lpad(seq::text, 2, '0');
end $$;

notify pgrst, 'reload schema';
commit;
