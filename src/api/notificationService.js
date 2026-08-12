import { supabase } from '../config/supabaseClient';

export async function getNotifications(profileId) {
  if (!profileId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .or(`recipient_id.eq.${profileId},recipient_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Unable to load notifications: ${error.message}`);
  return data || [];
}

export async function markNotificationRead(id) {
  if (!id) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Unable to mark notification as read: ${error.message}`);
}

export async function markAllNotificationsRead(profileId) {
  if (!profileId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .or(`recipient_id.eq.${profileId},recipient_id.is.null`);

  if (error) throw new Error(`Unable to mark notifications as read: ${error.message}`);
}

function uniqueChannelName(profileId) {
  return `mobile-notifications-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function subscribeNotifications(profileId, handlers = {}) {
  if (!profileId) return () => {};

  const channel = supabase
    .channel(uniqueChannelName(profileId))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      (payload) => {
        const item = payload.new || payload.old;
        if (!item) return;

        const appliesToUser = !item.recipient_id || item.recipient_id === profileId;
        if (!appliesToUser) return;

        if (payload.eventType === 'INSERT') handlers.onInsert?.(payload.new);
        if (payload.eventType === 'UPDATE') handlers.onUpdate?.(payload.new);
        if (payload.eventType === 'DELETE') handlers.onDelete?.(payload.old);
        handlers.onChange?.(payload);
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`Notification realtime channel status: ${status}`);
      }
    });

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    void supabase.removeChannel(channel);
  };
}

export function formatNotificationTime(value) {
  if (!value) return 'Just now';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Just now';
  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString();
}

export function notificationAccent(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('queue')) return '#39b36b';
  if (value.includes('message')) return '#5f9eb4';
  if (value.includes('appointment')) return '#2f9af0';
  if (value.includes('stock') || value.includes('inventory')) return '#f2a65a';
  if (value.includes('alert') || value.includes('security')) return '#f47c6b';
  if (value.includes('broadcast') || value.includes('announcement')) return '#7b8fc7';
  return '#447C99';
}
