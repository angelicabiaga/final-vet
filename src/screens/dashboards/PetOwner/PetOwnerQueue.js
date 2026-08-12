import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerAppointmentDesign';
import { getQueue, subscribeToQueue } from '../../../api/queueService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

export default function PetOwnerQueue({ navigation, route }) {
  const user = route?.params?.user;
  const profileImageUri = user?.profileImageUri || user?.avatar || '';
  const headerDisplayName = user?.username || user?.name || user?.fullName || 'Pet Owner';
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const isHeaderMenuAnimating = useRef(false);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'queue', label: 'My Queue', icon: require('../../assets/List.png'), route: 'PetOwnerQueue' },
    { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
    { key: 'profile', label: 'Profile', icon: require('../../assets/Profile.png'), route: 'PetOwnerProfile' },
  ];

  const load = useCallback(async () => {
    try {
      const ownerId = user?.id || user?.user_id || user?.profile_id;
      const data = ownerId ? await getQueue({ ownerId }) : [];
      // Pet owners never receive the clinic's live queue list. They only see
      // their own Staff-assigned queue number, if they have checked in.
      setEntry((data || []).find((item) => item.status !== 'Completed') || data?.[0] || null);
      setError('');
    } catch (e) {
      setEntry(null);
      setError(e?.message || e?.response?.data?.message || 'Unable to load your queue number.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    const ownerId = user?.id || user?.user_id || user?.profile_id;
    const unsubscribe = subscribeToQueue(load, { ownerId });
    const fallbackTimer = setInterval(load, 30000);
    return () => {
      unsubscribe?.();
      clearInterval(fallbackTimer);
    };
  }, [load, user]);

  const openHeaderMenu = () => {
    if (isHeaderMenuVisible || isHeaderMenuAnimating.current) return;
    isHeaderMenuAnimating.current = true;
    setIsHeaderMenuVisible(true);
    Animated.timing(headerMenuAnimation, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => { isHeaderMenuAnimating.current = false; });
  };

  const closeHeaderMenu = (after) => {
    if (isHeaderMenuAnimating.current) return;
    if (!isHeaderMenuVisible) { after?.(); return; }
    isHeaderMenuAnimating.current = true;
    Animated.timing(headerMenuAnimation, {
      toValue: 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isHeaderMenuAnimating.current = false;
      setIsHeaderMenuVisible(false);
      after?.();
    });
  };

  const toggleHeaderMenu = () => isHeaderMenuVisible ? closeHeaderMenu() : openHeaderMenu();
  const goTo = (screen) => closeHeaderMenu(() => navigation.navigate(screen, { user }));
  const queueNumber = entry?.queue_number || entry?.queueNumber || null;

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} style={styles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user })} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}><Text style={styles.headerTitle}>PawCruz</Text><Text style={styles.headerSubtitle}>My Queue</Text></View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('PetOwnerNotif', { user })} activeOpacity={0.85}>
                  <View style={styles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('PetOwnerProfile', { user })} activeOpacity={0.85}>
                  <Image source={profileImageUri ? { uri: profileImageUri } : DEFAULT_PROFILE_IMAGE} style={profileImageUri ? styles.profileButtonImage : styles.profileIcon} resizeMode={profileImageUri ? 'cover' : 'contain'} />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.headerBottomRow}>
            <TouchableOpacity style={styles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.ownerSummary}><Text style={styles.headerCaption}>Your assigned queue number</Text><Text style={styles.ownerName}>{headerDisplayName}</Text></View>
          </View>

          {isHeaderMenuVisible ? (
            <Animated.View style={[styles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }] }>
              {headerMenuItems.map((item) => (
                <TouchableOpacity key={item.key} style={styles.headerMenuItem} onPress={() => goTo(item.route)} activeOpacity={0.88}>
                  <View style={styles.headerMenuItemIconWrap}><Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.queueScrollContent}>
          <View style={styles.queueHeroCard}>
            <View style={styles.queueHeroIconWrap}>
              <Image source={require('../../assets/List.png')} style={styles.queueHeroIcon} resizeMode="contain" />
            </View>
            <View style={styles.queueHeroTextWrap}>
              <Text style={styles.queueHeroEyebrow}>MY QUEUE NUMBER</Text>
              <Text style={styles.queueHeroTitle}>Clinic Check-In</Text>
              <Text style={styles.queueHeroText}>Booking an appointment does not automatically assign a queue number. Staff will assign your number when you arrive and check in at the clinic.</Text>
            </View>
          </View>

          <View style={personalStyles.numberCard}>
            {loading ? (
              <>
                <Text style={personalStyles.smallLabel}>QUEUE NUMBER</Text>
                <Text style={personalStyles.loadingText}>Checking your queue number...</Text>
              </>
            ) : error ? (
              <>
                <Text style={personalStyles.smallLabel}>QUEUE NUMBER</Text>
                <Text style={personalStyles.errorText}>{error}</Text>
              </>
            ) : queueNumber ? (
              <>
                <Text style={personalStyles.smallLabel}>YOUR QUEUE NUMBER</Text>
                <Text style={personalStyles.number}>{queueNumber}</Text>
                <Text style={personalStyles.helper}>Keep this number ready while you wait at the clinic.</Text>
              </>
            ) : (
              <>
                <Text style={personalStyles.smallLabel}>QUEUE NUMBER</Text>
                <Text style={personalStyles.unassigned}>Not assigned yet</Text>
                <Text style={personalStyles.helper}>Your appointment can already be booked online. Your queue number will appear here only after Staff checks you in.</Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.queueRefreshButton} onPress={load} activeOpacity={0.9}>
            <Text style={styles.queueRefreshButtonText}>Refresh Queue Number</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.navItem, styles.activeNavItem]} onPress={() => navigation.navigate('PetOwnerQuickAssist', { user })} activeOpacity={0.9}>
            <View style={[styles.navIconWrap, styles.activeNavIconWrap]}>
              <Image source={require('../../assets/support.png')} style={[styles.navIcon, styles.activeNavIcon]} resizeMode="contain" />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const personalStyles = StyleSheet.create({
  numberCard: {
    marginTop: 18,
    marginHorizontal: 2,
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9edf2',
    shadowColor: '#173f52',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  smallLabel: {
    color: '#7594a0',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  number: {
    color: '#245f78',
    fontSize: 54,
    lineHeight: 64,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  unassigned: {
    color: '#245f78',
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingText: {
    color: '#557883',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorText: {
    color: '#a94646',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  helper: {
    marginTop: 12,
    color: '#78929b',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 330,
  },
});
