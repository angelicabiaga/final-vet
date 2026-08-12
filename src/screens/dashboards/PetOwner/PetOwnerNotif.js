import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerNotifDesign';
import {
  formatNotificationTime,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationAccent,
  subscribeNotifications,
} from '../../../api/notificationService';
import { getStoredSession } from '../../../api/authService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerNotif = ({ navigation, route }) => {
  const routeUser = route?.params?.user || null;
  const [user, setUser] = useState(routeUser);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const scrollViewRef = useRef(null);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;

  const profileId = user?.id || null;
  const profileImageUri = user?.profileImageUri || user?.avatar || '';
  const headerDisplayName = user?.username || user?.name || user?.fullName || 'Pet Owner';

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'queue', label: 'My Queue', icon: require('../../assets/List.png'), route: 'PetOwnerQueue' },
    { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
    { key: 'notifications', label: 'Notifications', icon: require('../../assets/Bell_Icon.png'), route: 'PetOwnerNotif' },
    { key: 'profile', label: 'Profile', icon: require('../../assets/Profile.png'), route: 'PetOwnerProfile' },
  ];

  useEffect(() => {
    if (routeUser?.id) return;
    let active = true;
    getStoredSession().then((session) => {
      if (active) setUser(session?.profile || session?.user || null);
    });
    return () => { active = false; };
  }, [routeUser?.id]);

  const loadNotifications = useCallback(async (showLoader = true) => {
    if (!profileId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      if (showLoader) setLoading(true);
      else setRefreshing(true);
      setError('');
      const rows = await getNotifications(profileId);
      setNotifications(rows);
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
    loadNotifications(true);

    const unsubscribe = subscribeNotifications(profileId, {
      onInsert: (item) => {
        if (!active || !item?.id) return;
        setNotifications((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
      },
      onUpdate: (item) => {
        if (!active || !item?.id) return;
        setNotifications((current) => current.map((row) => row.id === item.id ? item : row));
      },
      onDelete: (item) => {
        if (!active || !item?.id) return;
        setNotifications((current) => current.filter((row) => row.id !== item.id));
      },
    });

    const fallback = setInterval(() => loadNotifications(false), 30000);
    return () => {
      active = false;
      clearInterval(fallback);
      unsubscribe?.();
    };
  }, [profileId, loadNotifications]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const handleRead = async (item) => {
    if (!item?.id || item.is_read) return;
    try {
      await markNotificationRead(item.id);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, is_read: true, read_at: readAt } : row));
    } catch (e) {
      setError(e?.message || 'Unable to mark notification as read.');
    }
  };

  const handleReadAll = async () => {
    if (!profileId || unreadCount === 0) return;
    try {
      await markAllNotificationsRead(profileId);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((row) => ({ ...row, is_read: true, read_at: row.read_at || readAt })));
    } catch (e) {
      setError(e?.message || 'Unable to mark all notifications as read.');
    }
  };

  const toggleHeaderMenu = () => {
    const next = !isHeaderMenuVisible;
    setIsHeaderMenuVisible(next);
    Animated.timing(headerMenuAnimation, {
      toValue: next ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const navigate = (routeName) => {
    setIsHeaderMenuVisible(false);
    headerMenuAnimation.setValue(0);
    navigation.navigate(routeName, user ? { user } : undefined);
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} style={styles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigate('petowner-screen')} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}><Text style={styles.headerTitle}>PawCruz</Text><Text style={styles.headerSubtitle}>Notifications Center</Text></View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })} activeOpacity={0.85}>
                  {unreadCount > 0 ? <View style={styles.notifBadge} /> : null}
                  <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigate('PetOwnerProfile')} activeOpacity={0.85}>
                  {profileImageUri ? <Image source={{ uri: profileImageUri }} style={styles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <Animated.View style={[styles.headerBottomRowWrap, { opacity: lowerHeaderAnimation }]}>
            <View style={styles.headerBottomRow}>
              <TouchableOpacity style={styles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
                <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
              </TouchableOpacity>
              <View style={styles.ownerSummary}><Text style={styles.headerCaption}>{unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}</Text><Text style={styles.ownerName}>{headerDisplayName}</Text></View>
            </View>
          </Animated.View>

          {isHeaderMenuVisible ? (
            <Animated.View style={[styles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }] }>
              {headerMenuItems.map((item) => (
                <TouchableOpacity key={item.key} style={styles.headerMenuItem} onPress={() => navigate(item.route)} activeOpacity={0.88}>
                  <View style={styles.headerMenuItemIconWrap}><Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadNotifications(false)} />}
        >
          <View style={styles.sectionHeaderWrap}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.sectionTitle}>Latest Notifications</Text>
                <Text style={styles.sectionSubtitle}>Synced with PawCruz web in real time</Text>
              </View>
              <TouchableOpacity
                disabled={unreadCount === 0}
                onPress={handleReadAll}
                style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: unreadCount ? '#447C99' : '#dce8ed' }}
              >
                <Text style={{ color: unreadCount ? '#fff' : '#8ca0aa', fontWeight: '800', fontSize: 11 }}>Mark all read</Text>
              </TouchableOpacity>
            </View>
          </View>

          {error ? <View style={{ marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: '#fff0ee' }}><Text style={{ color: '#b44b3d', fontWeight: '700' }}>{error}</Text></View> : null}

          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator size="large" color="#447C99" /><Text style={{ marginTop: 12, color: '#5d7b91', fontWeight: '700' }}>Loading notifications...</Text></View>
          ) : notifications.length ? (
            notifications.map((item) => {
              const accent = notificationAccent(item.notification_type);
              const unread = !item.is_read;
              return (
                <TouchableOpacity key={item.id} onPress={() => handleRead(item)} activeOpacity={0.9} style={[styles.notifItem, { marginBottom: 12, opacity: unread ? 1 : 0.72, borderWidth: unread ? 1 : 0, borderColor: unread ? '#b8dce7' : 'transparent' }]}>
                  <View style={[styles.notifAccent, { backgroundColor: accent }]} />
                  <View style={styles.notifContent}>
                    <View style={styles.notifMetaRow}>
                      <Text style={styles.notifCategory}>{item.notification_type || 'Notification'}</Text>
                      {unread ? <View style={[styles.priorityPill, { borderColor: accent }]}><Text style={[styles.priorityPillText, { color: accent }]}>Unread</Text></View> : null}
                    </View>
                    <Text style={styles.notifTitle}>{item.title || 'PawCruz Notification'}</Text>
                    <Text style={styles.notifBody}>{item.message || ''}</Text>
                    <Text style={styles.notifTime}>{formatNotificationTime(item.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No notifications yet</Text><Text style={styles.emptyText}>Appointment, queue, medical record, message, and clinic updates will appear here automatically.</Text></View>
          )}
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.navItem, styles.activeNavItem]} onPress={() => navigate('PetOwnerQuickAssist')} activeOpacity={0.9}>
            <View style={[styles.navIconWrap, styles.activeNavIconWrap]}><Image source={require('../../assets/support.png')} style={[styles.navIcon, styles.activeNavIcon]} resizeMode="contain" /></View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerNotif;
