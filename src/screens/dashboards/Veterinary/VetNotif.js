import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import {
  formatNotificationTime,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from '../../../api/notificationService';
import { getStoredSession } from '../../../api/authService';

const VetNotif = ({ navigation, route }) => {
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const routeUser = getVetUser(route);
  const [user, setUser] = useState(routeUser);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const profileId = user?.id || null;

  useEffect(() => {
    if (routeUser?.id) return;
    let active = true;
    getStoredSession().then((session) => { if (active) setUser(session?.profile || session?.user || null); });
    return () => { active = false; };
  }, [routeUser?.id]);

  const load = useCallback(async (main = true) => {
    if (!profileId) { setItems([]); setLoading(false); return; }
    try {
      if (main) setLoading(true); else setRefreshing(true);
      setError('');
      setItems(await getNotifications(profileId));
    } catch (e) {
      setError(e?.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    load(true);
    const unsubscribe = subscribeNotifications(profileId, {
      onInsert: (item) => active && setItems((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]),
      onUpdate: (item) => active && setItems((current) => current.map((row) => row.id === item.id ? item : row)),
      onDelete: (item) => active && setItems((current) => current.filter((row) => row.id !== item.id)),
    });
    const fallback = setInterval(() => load(false), 30000);
    return () => { active = false; clearInterval(fallback); unsubscribe?.(); };
  }, [profileId, load]);

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const markRead = async (item) => {
    if (!item?.id || item.is_read) return;
    try {
      await markNotificationRead(item.id);
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, is_read: true, read_at: new Date().toISOString() } : row));
    } catch (e) { setError(e?.message || 'Unable to mark notification as read.'); }
  };

  const markAll = async () => {
    if (!profileId || unreadCount === 0) return;
    try {
      await markAllNotificationsRead(profileId);
      const readAt = new Date().toISOString();
      setItems((current) => current.map((row) => ({ ...row, is_read: true, read_at: row.read_at || readAt })));
    } catch (e) { setError(e?.message || 'Unable to mark all notifications as read.'); }
  };

  return (
    <VetShell navigation={navigation} route={{ ...route, params: { ...(route?.params || {}), user: user || routeUser } }} subtitle="Notifications" caption={unreadCount ? `${unreadCount} unread` : 'Clinical Alerts'} lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        <View style={styles.toolbar}>
          <View><Text style={styles.timeDivider}>Notifications</Text><Text style={styles.syncText}>Synced with PawCruz web in real time</Text></View>
          <TouchableOpacity disabled={unreadCount === 0} onPress={markAll} style={[styles.readAllButton, unreadCount === 0 && styles.readAllDisabled]}>
            <Text style={[styles.readAllText, unreadCount === 0 && styles.readAllTextDisabled]}>Mark all read</Text>
          </TouchableOpacity>
        </View>

        {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#447C99" /><Text style={styles.loadingText}>Loading notifications...</Text></View>
        ) : items.length ? items.map((notif) => {
          const unread = !notif.is_read;
          const type = String(notif.notification_type || '').toLowerCase();
          return (
            <TouchableOpacity key={notif.id} onPress={() => markRead(notif)} style={[styles.notifCard, unread && styles.unreadCard]} activeOpacity={0.9}>
              <View style={styles.iconCircle}>
                <Image source={type.includes('message') ? require('../../assets/Message_Icon.png') : require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
              </View>
              <View style={styles.notifContent}>
                <View style={styles.notifHeaderRow}><Text style={styles.notifTitle}>{notif.title || 'PawCruz Notification'}</Text><Text style={styles.notifTime}>{formatNotificationTime(notif.created_at)}</Text></View>
                <Text style={styles.notifType}>{notif.notification_type || 'Notification'}</Text>
                <Text style={styles.notifDescription}>{notif.message || ''}</Text>
              </View>
              {unread ? <View style={styles.unreadDot} /> : null}
            </TouchableOpacity>
          );
        }) : (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No notifications yet</Text><Text style={styles.emptyText}>Appointments, messages, queue updates, and other clinic alerts will appear here automatically.</Text></View>
        )}
      </ScrollView>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  timeDivider: { fontSize: 16, fontWeight: '900', color: '#447C99' },
  syncText: { fontSize: 11, fontWeight: '700', color: '#7a94a6', marginTop: 3 },
  readAllButton: { backgroundColor: '#447C99', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 13 },
  readAllDisabled: { backgroundColor: '#dce8ed' },
  readAllText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  readAllTextDisabled: { color: '#8ca0aa' },
  notifCard: { flexDirection: 'row', backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12, position: 'relative' },
  unreadCard: { borderColor: '#9bd4e0', backgroundColor: '#f4fbfd' },
  iconCircle: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  notifIcon: { width: 21, height: 21, tintColor: '#447C99' },
  notifContent: { flex: 1 },
  notifHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  notifTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '900', color: '#24566d', marginRight: 10 },
  notifTime: { fontSize: 11, fontWeight: '800', color: '#7a94a6' },
  notifType: { marginTop: 4, fontSize: 10, fontWeight: '900', color: '#5f9eb4', textTransform: 'uppercase' },
  notifDescription: { marginTop: 6, fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#5d7b91' },
  unreadDot: { position: 'absolute', top: 13, right: 13, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#f47c6b' },
  errorCard: { backgroundColor: '#fff0ee', borderRadius: 14, padding: 12, marginBottom: 12 },
  errorText: { color: '#b44b3d', fontWeight: '700' },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#5d7b91', fontWeight: '700' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#dceef8', alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d' },
  emptyText: { marginTop: 7, fontSize: 13, lineHeight: 19, textAlign: 'center', color: '#6e8998', fontWeight: '600' },
});

export default VetNotif;
