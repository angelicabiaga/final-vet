import { supabase } from '../config/supabaseClient';
import { formatTime12h } from '../utils/timeFormat';

export const APPOINTMENT_STATUSES = ['Confirmed', 'Completed', 'Cancelled'];
const ACTIVE_STATUSES = ['Confirmed'];
const pad = (value) => String(value).padStart(2, '0');
const normalizeTime = (value) => String(value || '').slice(0, 5);

export const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const addTenMinutes = (value) => {
  const [hour, minute] = normalizeTime(value).split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute + 10);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatTime = (value) => {
  return formatTime12h(normalizeTime(value));
};

export async function getPetsByOwner(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from('pets')
    .select('id, pet_name, species, breed, owner_id')
    .eq('owner_id', ownerId)
    .eq('is_archived', false)
    .order('pet_name');
  if (error) throw new Error('Unable to load your registered pets.');
  return data || [];
}

export async function getVeterinarians() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, account_status')
    .order('full_name');
  if (error) throw new Error('Unable to load veterinarians.');
  return (data || []).filter((item) =>
    String(item.role || '').toLowerCase() === 'veterinarian' &&
    String(item.account_status || '').toLowerCase() === 'active'
  );
}

export async function getAvailableSlots(veterinarianId, appointmentDate, excludeAppointmentId = null) {
  if (!veterinarianId || !appointmentDate || appointmentDate < todayLocal()) return [];
  const dayOfWeek = new Date(`${appointmentDate}T12:00:00`).getDay();

  const { data: override, error: overrideError } = await supabase
    .from('veterinarian_schedule_overrides')
    .select('start_time, end_time, is_available')
    .eq('veterinarian_id', veterinarianId)
    .eq('schedule_date', appointmentDate)
    .maybeSingle();

  const overrideMissing = ['42P01', 'PGRST205'].includes(overrideError?.code) ||
    String(overrideError?.message || '').toLowerCase().includes('veterinarian_schedule_overrides');
  if (overrideError && !overrideMissing) throw new Error('Unable to load the selected date schedule.');

  let schedule = overrideMissing ? null : override;
  if (!schedule) {
    const { data: weekly, error: scheduleError } = await supabase
      .from('veterinarian_schedules')
      .select('start_time, end_time, is_available')
      .eq('veterinarian_id', veterinarianId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle();
    if (scheduleError) throw new Error('Unable to load the veterinarian schedule.');
    schedule = weekly;
  }

  if (!schedule?.is_available || !schedule.start_time || !schedule.end_time) return [];

  let bookedQuery = supabase
    .from('appointments')
    .select('id, start_time')
    .eq('veterinarian_id', veterinarianId)
    .eq('appointment_date', appointmentDate)
    .in('status', ACTIVE_STATUSES);
  if (excludeAppointmentId) bookedQuery = bookedQuery.neq('id', excludeAppointmentId);

  const { data: booked, error: bookedError } = await bookedQuery;
  if (bookedError) throw new Error('Unable to load booked appointment times.');

  const bookedTimes = new Set((booked || []).map((item) => normalizeTime(item.start_time)));
  const slots = [];
  let current = normalizeTime(schedule.start_time);
  const end = normalizeTime(schedule.end_time);
  while (current < end) {
    if (!bookedTimes.has(current)) slots.push(current);
    current = addTenMinutes(current);
  }
  return slots;
}

function validatePayload(payload) {
  if (!payload.petId) throw new Error('Select a pet.');
  if (!payload.ownerId) throw new Error('Pet owner is missing.');
  if (!payload.veterinarianId) throw new Error('Select a veterinarian.');
  if (!payload.appointmentDate || payload.appointmentDate < todayLocal()) throw new Error('Select today or a future date.');
  if (!payload.startTime) throw new Error('Select an available time.');
}

export async function createAppointment(payload) {
  validatePayload(payload);
  const row = {
    pet_id: payload.petId,
    owner_id: payload.ownerId,
    veterinarian_id: payload.veterinarianId,
    appointment_date: payload.appointmentDate,
    start_time: normalizeTime(payload.startTime),
    end_time: addTenMinutes(payload.startTime),
    appointment_source: 'Online',
    consultation_type: 'General Consultation',
    visit_reason: payload.visitReason?.trim() || null,
    notes: payload.notes?.trim() || null,
    status: 'Confirmed',
    created_by: payload.createdBy || payload.ownerId,
  };

  const { data, error } = await supabase.from('appointments').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error('That appointment time was just booked. Please select another available time.');
    throw new Error(error.message || 'Unable to book the appointment.');
  }
  return data;
}

export async function getOwnerAppointments(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, pet_id, owner_id, veterinarian_id, appointment_date, start_time, end_time,
      appointment_source, consultation_type, visit_reason, notes, status, created_by,
      created_at, updated_at,
      pet:pets(id, pet_name, species, breed),
      owner:profiles!appointments_owner_id_fkey(id, full_name, email, username),
      veterinarian:profiles!appointments_veterinarian_id_fkey(id, full_name)
    `)
    .eq('owner_id', ownerId)
    .order('appointment_date', { ascending: false })
    .order('start_time', { ascending: true });
  if (error) throw new Error('Unable to load your appointments.');

  const rows = data || [];
  const creatorIds = [...new Set(rows.map((item) => item.created_by).filter(Boolean))];
  let creators = {};
  if (creatorIds.length) {
    const { data: creatorRows } = await supabase.from('profiles').select('id, full_name, username').in('id', creatorIds);
    creators = Object.fromEntries((creatorRows || []).map((item) => [String(item.id), item]));
  }
  return rows.map((item) => ({ ...item, creator: creators[String(item.created_by)] || null }));
}

export async function cancelAppointment(id, ownerId) {
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'Cancelled' })
    .eq('id', id)
    .eq('owner_id', ownerId)
    .eq('status', 'Confirmed');
  if (error) throw new Error('Unable to cancel the appointment.');
}

export async function rescheduleAppointment(id, values, ownerId, changedBy) {
  validatePayload({ ...values, ownerId });
  const { error } = await supabase
    .from('appointments')
    .update({
      veterinarian_id: values.veterinarianId,
      appointment_date: values.appointmentDate,
      start_time: normalizeTime(values.startTime),
      end_time: addTenMinutes(values.startTime),
      status: 'Confirmed',
      created_by: changedBy || ownerId,
    })
    .eq('id', id)
    .eq('owner_id', ownerId)
    .eq('status', 'Confirmed');
  if (error) {
    if (error.code === '23505') throw new Error('That time is already booked. Please select another slot.');
    throw new Error('Unable to reschedule the appointment.');
  }
}

export async function getVeterinarianAppointments(veterinarianId) {
  if (!veterinarianId) return [];
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, pet_id, owner_id, veterinarian_id, appointment_date, start_time, end_time,
      appointment_source, consultation_type, visit_reason, notes, status, created_by,
      created_at, updated_at,
      pet:pets(id, pet_name, species, breed),
      owner:profiles!appointments_owner_id_fkey(id, full_name, email, username),
      veterinarian:profiles!appointments_veterinarian_id_fkey(id, full_name)
    `)
    .eq('veterinarian_id', veterinarianId)
    .order('appointment_date', { ascending: false })
    .order('start_time', { ascending: true });
  if (error) throw new Error('Unable to load assigned appointments.');

  const rows = data || [];
  const creatorIds = [...new Set(rows.map((item) => item.created_by).filter(Boolean))];
  let creators = {};
  if (creatorIds.length) {
    const { data: creatorRows } = await supabase.from('profiles').select('id, full_name, username').in('id', creatorIds);
    creators = Object.fromEntries((creatorRows || []).map((item) => [String(item.id), item]));
  }
  return rows.map((item) => ({ ...item, creator: creators[String(item.created_by)] || null }));
}
