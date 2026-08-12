import API from './api';

const unwrap = (response) => response?.data?.data ?? response?.data ?? [];
const asArray = (value) => Array.isArray(value) ? value : (value?.items || value?.appointments || value?.queue || []);

export const getMyAppointments = async (user) => {
  const veterinarianId = user?.id || user?.user_id || user?.profile_id;
  if (!veterinarianId) return [];
  const response = await API.get('/appointments', { params: { veterinarian_id: veterinarianId } });
  return asArray(unwrap(response)).filter((item) => {
    const assigned = item.veterinarian_id || item.veterinarian?.id || item.assigned_veterinarian_id;
    return !assigned || String(assigned) === String(veterinarianId);
  });
};

export const getOwnerAppointments = async (user) => {
  const ownerId = user?.id || user?.user_id || user?.profile_id;
  if (!ownerId) return [];
  const response = await API.get('/appointments', { params: { owner_id: ownerId } });
  return asArray(unwrap(response));
};

export const getLiveQueue = async ({ publicOnly = false } = {}) => {
  const response = await API.get(publicOnly ? '/queue/public' : '/queue', { params: { date: new Date().toISOString().slice(0, 10) } });
  return asArray(unwrap(response)).filter((item) => ['Waiting', 'Serving', 'Completed'].includes(item.status));
};

export const getOwnerQueue = async (user) => {
  const ownerId = user?.id || user?.user_id || user?.profile_id;
  if (!ownerId) return [];
  const response = await API.get('/queue', { params: { owner_id: ownerId, date: new Date().toISOString().slice(0, 10) } });
  return asArray(unwrap(response)).filter((item) => ['Waiting', 'Serving', 'Completed'].includes(item.status));
};
