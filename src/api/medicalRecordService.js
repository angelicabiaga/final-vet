import { supabase } from '../config/supabaseClient';

const normalizeRole = (value) => String(value || '').trim().toLowerCase();
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const byId = (rows = []) => Object.fromEntries(rows.map((row) => [String(row.id), row]));

async function loadRelations(records = []) {
  if (!records.length) return [];
  const petIds = unique(records.map((r) => r.pet_id));
  const profileIds = unique(records.flatMap((r) => [r.owner_id, r.veterinarian_id, r.created_by, r.updated_by]));
  const appointmentIds = unique(records.map((r) => r.appointment_id));

  const [petsRes, profilesRes, appointmentsRes] = await Promise.all([
    petIds.length ? supabase.from('pets').select('*').in('id', petIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? supabase.from('profiles').select('id, full_name, username, email, role, account_status').in('id', profileIds) : Promise.resolve({ data: [], error: null }),
    appointmentIds.length ? supabase.from('appointments').select('*').in('id', appointmentIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (petsRes.error) console.warn('Medical records pets relation:', petsRes.error);
  if (profilesRes.error) console.warn('Medical records profiles relation:', profilesRes.error);
  if (appointmentsRes.error) console.warn('Medical records appointments relation:', appointmentsRes.error);

  const pets = byId(petsRes.data || []);
  const profiles = byId(profilesRes.data || []);
  const appointments = byId(appointmentsRes.data || []);

  return records.map((record) => ({
    ...record,
    pet: pets[String(record.pet_id)] || null,
    owner: profiles[String(record.owner_id)] || null,
    veterinarian: profiles[String(record.veterinarian_id)] || null,
    creator: profiles[String(record.created_by)] || null,
    updater: profiles[String(record.updated_by)] || null,
    appointment: appointments[String(record.appointment_id)] || null,
  }));
}

export async function getMobileMedicalRecords(profile, { petId = '', status = '', search = '' } = {}) {
  const profileId = profile?.id || profile?.user_id || profile?.profile_id;
  const role = normalizeRole(profile?.role || profile?.user_role || profile?.type);
  if (!profileId) throw new Error('Your login session is incomplete. Please log in again.');

  let query = supabase
    .from('medical_records')
    .select('*')
    .order('consultation_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (role === 'pet_owner' || role === 'pet owner' || role === 'owner') {
    query = query.eq('owner_id', profileId).eq('record_status', 'Finalized');
  } else if (role === 'veterinarian' || role === 'vet') {
    query = query.eq('veterinarian_id', profileId);
  }
  if (petId) query = query.eq('pet_id', petId);
  if (status && role !== 'pet_owner' && role !== 'pet owner' && role !== 'owner') query = query.eq('record_status', status);

  let { data, error } = await query;

  if (error && ['PGRST205', '42P01'].includes(error.code)) {
    const rpc = await supabase.rpc('pawcruz_get_medical_records');
    if (rpc.error) throw new Error('Medical Records API is not installed. Run the medical-record repair SQL used by the web project.');
    data = rpc.data || [];
    error = null;
  }
  if (error) throw new Error(error.message || 'Unable to load medical records.');

  let rows = data || [];
  if (role === 'pet_owner' || role === 'pet owner' || role === 'owner') {
    rows = rows.filter((r) => String(r.owner_id) === String(profileId) && r.record_status === 'Finalized');
  } else if (role === 'veterinarian' || role === 'vet') {
    rows = rows.filter((r) => String(r.veterinarian_id) === String(profileId));
  }
  if (petId) rows = rows.filter((r) => String(r.pet_id) === String(petId));

  const related = await loadRelations(rows);
  if (!search.trim()) return related;
  const term = search.trim().toLowerCase();
  return related.filter((r) => [
    r.pet?.pet_name, r.pet?.species, r.pet?.breed, r.owner?.full_name, r.owner?.username,
    r.veterinarian?.full_name, r.chief_complaint, r.symptoms, r.diagnosis, r.treatment,
    r.medication, r.vaccination,
  ].some((value) => String(value || '').toLowerCase().includes(term)));
}

export function subscribeToMedicalRecords(profile, onChange) {
  const profileId = profile?.id || profile?.user_id || profile?.profile_id;
  const role = normalizeRole(profile?.role || profile?.user_role || profile?.type);
  if (!profileId || typeof onChange !== 'function') return () => {};

  const filter = (role === 'veterinarian' || role === 'vet')
    ? `veterinarian_id=eq.${profileId}`
    : `owner_id=eq.${profileId}`;

  const channel = supabase
    .channel(`mobile-medical-records-${profileId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records', filter }, () => onChange())
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function formatMedicalDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' });
}
