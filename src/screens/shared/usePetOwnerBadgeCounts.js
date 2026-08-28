import { useCallback, useEffect, useState } from 'react';
import { getOwnerAppointments, todayLocal } from '../../api/mobileAppointmentService';
import { getQueue, subscribeToQueue } from '../../api/queueService';
import { getConversations, subscribeToMessagingOverview } from '../../api/messageService';
import { supabase } from '../../config/supabaseClient';

/**
 * Shared badge-count logic for the Pet Owner mobile nav menus (each screen
 * duplicates its own header menu array rather than sharing one wrapper
 * component the way Veterinarian screens do via VetShell, so this hook is
 * what stays DRY instead). Returns { appointments, queue, messages } counts
 * scoped to this owner only:
 *   - appointments: this owner's upcoming (today or later) Confirmed
 *     appointments -- cancelled/completed/past/other-owner excluded.
 *   - queue: this owner's active (Waiting/Serving) queue entries.
 *   - messages: conversations with at least one unread message.
 * Deliberately not routed through the Notifications module, which stays
 * reserved for clinic-wide announcements.
 */
export function usePetOwnerBadgeCounts(ownerId) {
  const [badgeCounts, setBadgeCounts] = useState({ appointments: 0, queue: 0, messages: 0 });

  const loadBadgeCounts = useCallback(async () => {
    if (!ownerId) return;
    try {
      const today = todayLocal();
      const [appointments, queueEntries, conversations] = await Promise.all([
        getOwnerAppointments(ownerId).catch(() => []),
        getQueue({ ownerId }).catch(() => []),
        getConversations({ id: ownerId }).catch(() => []),
      ]);
      const upcoming = appointments.filter((item) => item.status === 'Confirmed' && item.appointment_date >= today).length;
      const activeQueue = queueEntries.filter((entry) => ['Waiting', 'Serving'].includes(entry.status)).length;
      const unreadConversations = conversations.filter((item) => item.unread > 0).length;
      setBadgeCounts({ appointments: upcoming, queue: activeQueue, messages: unreadConversations });
    } catch {
      // Badge counts are a convenience overlay on the nav menu -- a failed
      // refresh should never surface as an app-wide error.
    }
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return undefined;
    loadBadgeCounts();
    const unsubscribeQueue = subscribeToQueue(loadBadgeCounts, { ownerId });
    // Named distinctly (with a "badges" suffix) because PetOwnerAppointment.js
    // opens its own "mobile-owner-appointments-${ownerId}" channel for this
    // same table+filter -- reusing that exact name here would make
    // supabase-js hand back the already-subscribed channel, and the second
    // .on() call would throw ("cannot add postgres_changes callbacks ...
    // after subscribe()").
    const appointmentsChannel = supabase
      .channel(`mobile-owner-appointments-badges-${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `owner_id=eq.${ownerId}` }, loadBadgeCounts)
      .subscribe();
    const unsubscribeMessages = subscribeToMessagingOverview(ownerId, loadBadgeCounts);
    return () => {
      unsubscribeQueue?.();
      supabase.removeChannel(appointmentsChannel);
      unsubscribeMessages?.();
    };
  }, [ownerId, loadBadgeCounts]);

  return badgeCounts;
}

export function badgeLabel(count) {
  return count > 9 ? '9+' : String(count);
}
