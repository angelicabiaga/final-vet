import { supabase } from '../config/supabaseClient';

const ACTIVE_STATUSES = ['Waiting', 'Serving', 'Completed'];
const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const uniq = (values) => [...new Set(values.filter(Boolean))];

async function enrich(rows) {
  if (!rows.length) return [];
  const petIds = uniq(rows.map((row) => row.pet_id));
  const profileIds = uniq(rows.flatMap((row) => [row.owner_id, row.veterinarian_id]));
  const appointmentIds = uniq(rows.map((row) => row.appointment_id));

  const [petsResult, profilesResult, appointmentsResult] = await Promise.all([
    petIds.length
      ? supabase.from('pets').select('id,pet_name,species,breed').in('id', petIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from('profiles').select('id,full_name,username,email,role').in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
    appointmentIds.length
      ? supabase.from('appointments').select('id,appointment_date,start_time,visit_reason,status').in('id', appointmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (petsResult.error) throw petsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;

  const petMap = new Map((petsResult.data || []).map((item) => [item.id, item]));
  const profileMap = new Map((profilesResult.data || []).map((item) => [item.id, item]));
  const appointmentMap = new Map((appointmentsResult.data || []).map((item) => [item.id, item]));

  return rows.map((row) => ({
    ...row,
    pet: petMap.get(row.pet_id) || null,
    owner: profileMap.get(row.owner_id) || null,
    veterinarian: profileMap.get(row.veterinarian_id) || null,
    appointment: appointmentMap.get(row.appointment_id) || null,
  }));
}

export async function getQueue({ ownerId, veterinarianId, date = todayLocal() } = {}) {
  let query = supabase
    .from('queue_entries')
    .select('*')
    .eq('queue_date', date)
    .in('status', ACTIVE_STATUSES)
    .order('manual_order', { ascending: true, nullsFirst: false })
    .order('arrived_at', { ascending: true });

  if (ownerId) query = query.eq('owner_id', ownerId);
  if (veterinarianId) query = query.eq('veterinarian_id', veterinarianId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Unable to load queue.');

  const rows = await enrich(data || []);
  return rows.map((row, index) => {
    const clientsAhead = rows
      .slice(0, index)
      .filter((item) => item.veterinarian_id === row.veterinarian_id && ['Waiting', 'Serving'].includes(item.status))
      .length;
    return {
      ...row,
      clientsAhead,
      estimatedWaitMinutes: clientsAhead * 10,
    };
  });
}

let mobileQueueChannelSeq = 0;
export function subscribeToQueue(callback, { ownerId, veterinarianId } = {}) {
  const filter = ownerId
    ? `owner_id=eq.${ownerId}`
    : veterinarianId
      ? `veterinarian_id=eq.${veterinarianId}`
      : undefined;

  const config = { event: '*', schema: 'public', table: 'queue_entries' };
  if (filter) config.filter = filter;

  // The counter guarantees a unique channel name even when two callers for
  // the same owner/veterinarian mount in the same tick (e.g. VetShell's
  // header badges and a screen's own subscribeToQueue call both mounting
  // together) -- Date.now() alone is only millisecond-precision, and
  // supabase-js reuses a channel by name, which throws if a second .on()
  // lands on a channel the first caller already .subscribe()'d.
  const channel = supabase
    .channel(`mobile-queue-${ownerId || veterinarianId || 'live'}-${Date.now()}-${++mobileQueueChannelSeq}`)
    .on('postgres_changes', config, () => callback?.())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export { todayLocal };
