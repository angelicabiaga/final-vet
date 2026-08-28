import React from 'react';
import { Animated, Easing, Image, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/VetDashboardDesign';
import { getVeterinarianAppointments, todayLocal } from '../../../api/mobileAppointmentService';
import { getQueue, subscribeToQueue } from '../../../api/queueService';
import { getConversations, subscribeToMessagingOverview } from '../../../api/messageService';
import { supabase } from '../../../config/supabaseClient';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'vet-screen' },
  { key: 'patients', label: 'Patients', icon: require('../../assets/Pets_Icon.png'), route: 'VetPatients' },
  { key: 'appointments', label: 'My Appointments', icon: require('../../assets/Appointment_Icon.png'), route: 'VetAppointment' },
  { key: 'queue', label: 'Live Queue', icon: require('../../assets/List.png'), route: 'VetLiveQueue' },
  { key: 'medical-records', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'VetMedRec' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'VetMessages' },

];

export const getVetName = (user) => user?.fullName || user?.name || user?.username || 'Veterinarian';
export const getVetUser = (route) => route?.params?.user || route?.params || null;

const VetShell = ({ navigation, route, subtitle, caption, children, showBack = false, lowerHeaderScrollY, lowerHeaderAnimation }) => {
  const currentUser = getVetUser(route);
  const veterinarianId = currentUser?.id || currentUser?.user_id || currentUser?.profile_id || '';
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const isMenuAnimating = React.useRef(false);

  // Header-menu badges -- Appointments counts today's still-Confirmed
  // consultations assigned to this vet, My Queue (Live Queue) counts this
  // vet's Waiting/Serving queue entries, Messages counts unread
  // conversations. Deliberately not routed through the Notifications
  // module -- that stays reserved for clinic-wide announcements.
  const [badgeCounts, setBadgeCounts] = React.useState({ appointments: 0, queue: 0, messages: 0 });

  const loadBadgeCounts = React.useCallback(async () => {
    if (!veterinarianId) return;
    try {
      const [appointments, queueEntries, conversations] = await Promise.all([
        getVeterinarianAppointments(veterinarianId),
        getQueue({ veterinarianId }),
        getConversations({ id: veterinarianId }).catch(() => []),
      ]);
      const today = todayLocal();
      const todaysConfirmed = appointments.filter((item) => item.status === 'Confirmed' && item.appointment_date === today).length;
      const activeQueue = queueEntries.filter((entry) => ['Waiting', 'Serving'].includes(entry.status)).length;
      const unreadConversations = conversations.filter((item) => item.unread > 0).length;
      setBadgeCounts({ appointments: todaysConfirmed, queue: activeQueue, messages: unreadConversations });
    } catch {
      // Badge counts are a convenience overlay on the header menu -- a
      // failed refresh should never surface as an app-wide error.
    }
  }, [veterinarianId]);

  React.useEffect(() => {
    if (!veterinarianId) return undefined;
    loadBadgeCounts();
    const unsubscribeQueue = subscribeToQueue(loadBadgeCounts, { veterinarianId });
    // The mobile queue subscription only listens to queue_entries -- the
    // appointments table needs its own channel, following the same
    // pattern already used for realtime appointment updates elsewhere in
    // the mobile app (see PetOwnerAppointment.js). Named distinctly (with
    // a "badges" suffix) because VetAppointment.js opens its own channel
    // for this exact same table+filter while VetShell wraps it -- two
    // channels with the same name make supabase-js reuse one channel
    // object, and the second caller's .on() then lands after the first
    // caller's .subscribe(), which throws.
    const appointmentsChannel = supabase
      .channel(`mobile-vet-appointments-badges-${veterinarianId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `veterinarian_id=eq.${veterinarianId}` }, loadBadgeCounts)
      .subscribe();
    const unsubscribeMessages = subscribeToMessagingOverview(veterinarianId, loadBadgeCounts);
    return () => {
      unsubscribeQueue?.();
      supabase.removeChannel(appointmentsChannel);
      unsubscribeMessages?.();
    };
  }, [veterinarianId, loadBadgeCounts]);

  const badgeLabel = (count) => (count > 9 ? '9+' : String(count));
  const lowerHeaderTranslateY = lowerHeaderScrollY
    ? lowerHeaderScrollY.interpolate({ inputRange: [0, 72], outputRange: [0, -72], extrapolate: 'clamp' })
    : 0;
  const lowerHeaderAnimatedStyle = lowerHeaderAnimation
    ? {
        maxHeight: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }),
        opacity: lowerHeaderAnimation,
        transform: [
          {
            translateY: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }),
          },
        ],
      }
    : lowerHeaderScrollY
      ? { transform: [{ translateY: lowerHeaderTranslateY }] }
      : null;

  const navigateVet = (screen, extraParams) => {
    navigation.navigate(screen, currentUser ? { user: currentUser, ...extraParams } : extraParams);
  };

  const openMenu = () => {
    if (menuOpen || isMenuAnimating.current) {
      return;
    }

    isMenuAnimating.current = true;
    setMenuOpen(true);
    menuAnim.stopAnimation();
    Animated.timing(menuAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isMenuAnimating.current = false;
    });
  };

  const closeMenu = () => {
    if (isMenuAnimating.current || !menuOpen) {
      return;
    }

    isMenuAnimating.current = true;
    menuAnim.stopAnimation();
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isMenuAnimating.current = false;
      setMenuOpen(false);
    });
  };

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
      return;
    }

    openMenu();
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={dashboardStyles.background}>
      <SafeAreaView style={dashboardStyles.container}>
        <LinearGradient
          colors={['#63B6C5', '#63B6C5', '#63B6C5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={dashboardStyles.headerBar}
        >
          <LinearGradient
            colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={dashboardStyles.headerTopBand}
          >
            <View style={dashboardStyles.headerTopRow}>
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateVet('vet-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" />
                </View>
                <View style={dashboardStyles.brandBlock}>
                  <Text style={dashboardStyles.headerTitle}>PawCruz</Text>
                  <Text style={dashboardStyles.headerSubtitle}>{subtitle}</Text>
                </View>
              </TouchableOpacity>

              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateVet('VetNotif')} activeOpacity={0.85}>
                  <View style={dashboardStyles.notifBadge} />
                  <Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateVet('VetProfile')} activeOpacity={0.85}>
                  {profileImageUri ? (
                    <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" />
                  ) : (
                    <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleMenu} activeOpacity={0.85}>
                  <Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
                </TouchableOpacity>
                {showBack ? (
                  <TouchableOpacity style={[dashboardStyles.menuTriggerButton, { marginLeft: 14 }]} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                    <Image source={require('../../assets/Back_Icon.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={dashboardStyles.ownerSummary}>
                <Text style={dashboardStyles.headerCaption}>{caption}</Text>
                <Text style={dashboardStyles.ownerName}>{getVetName(currentUser)}</Text>
              </View>
            </View>
          </Animated.View>

          {menuOpen ? (
            <Animated.View
              style={[
                dashboardStyles.headerMenuPanel,
                {
                  opacity: menuAnim,
                  transform: [{ translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
                },
              ]}
            >
              {HEADER_MENU_ITEMS.map((item, index) => {
                const badgeCount = badgeCounts[item.key] || 0;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[dashboardStyles.headerMenuItem, index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast]}
                    onPress={() => {
                      setMenuOpen(false);
                      menuAnim.setValue(0);
                      navigateVet(item.route, item.key === 'appointments' ? { focusToday: true } : undefined);
                    }}
                    activeOpacity={0.88}
                  >
                    <View style={dashboardStyles.headerMenuItemIconWrap}>
                      <Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" />
                      {badgeCount > 0 ? (
                        <View style={dashboardStyles.menuBadge}>
                          <Text style={dashboardStyles.menuBadgeText}>{badgeLabel(badgeCount)}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          ) : null}
        </LinearGradient>

        {children}

        </SafeAreaView>
    </LinearGradient>
  );
};

export default VetShell;
