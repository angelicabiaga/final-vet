import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { REGISTERED_PET_OWNER_ACCOUNTS } from '../../../data/registeredPetOwners';
import { styles as dashboardStyles } from '../../styles/StaffDashboardDesign';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'staff-screen' },
  { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'StaffAppointment' },
  { key: 'mypets', label: 'Pets Profile', icon: require('../../assets/Pets_Icon.png'), route: 'StaffPetsProfile' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'StaffMessages' },
  { key: 'inventory', label: 'Inventory', icon: require('../../assets/Inventory_Icon.png'), route: 'StaffInventory' },
  { key: 'user-management', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'StaffUserManagement' },
  { key: 'payment-history', label: 'Payment History', icon: require('../../assets/payment_icon.png'), route: 'StaffPayHis' },
  { key: 'activity-logs', label: 'Activity Logs', icon: require('../../assets/Log_Icon.png'), route: 'StaffLogs' },
];

const splitFullName = (value) => {
  const trimmedValue = (value || '').trim();

  if (!trimmedValue) {
    return { firstName: '', lastName: '' };
  }

  const parts = trimmedValue.split(/\s+/);

  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
};

const buildAccountForm = (account) => {
  const { firstName, lastName } = splitFullName(account?.name || account?.fullName || '');

  return {
    firstName: account?.firstName || firstName,
    lastName: account?.lastName || lastName,
    username: account?.username || '',
    email: account?.email || '',
    contact: account?.contact || '',
    emergencyContact: account?.emergencyContact || '',
    address: account?.address || '',
  };
};

const hasEmptyRequiredField = (accountForm) =>
  !accountForm?.firstName?.trim() ||
  !accountForm?.lastName?.trim() ||
  !accountForm?.username?.trim() ||
  !accountForm?.email?.trim() ||
  !accountForm?.contact?.trim() ||
  !accountForm?.emergencyContact?.trim() ||
  !accountForm?.address?.trim();

const isAccountProfileComplete = (account) => !hasEmptyRequiredField(buildAccountForm(account));

const STATUS_META = {
  Active: { bg: '#e8f7ef', border: '#c8ead7', text: '#1d7a4d' },
  Inactive: { bg: '#fff1ef', border: '#f1cdc8', text: '#b54234' },
};

const StaffUserManagement = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const displayName = loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.username || 'Staff';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const scrollViewRef = useRef(null);
  const accountsSectionOffset = useRef(0);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const handledCreateTokenRef = useRef(null);
  const handledUpdateTokenRef = useRef(null);
  const handledDeleteTokenRef = useRef(null);
  const [accounts, setAccounts] = useState(() => REGISTERED_PET_OWNER_ACCOUNTS.map((a) => ({ ...a })));
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const navigateWithUser = (screenName) => {
    navigation.navigate(screenName, { user: loggedInUser });
  };

  const openHeaderMenu = () => {
    if (isHeaderMenuVisible || isHeaderMenuAnimating.current) {
      return;
    }

    isHeaderMenuAnimating.current = true;
    setIsHeaderMenuVisible(true);
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isHeaderMenuAnimating.current = false;
    });
  };

  const closeHeaderMenu = (onClosed) => {
    if (isHeaderMenuAnimating.current) {
      return;
    }

    if (!isHeaderMenuVisible) {
      onClosed?.();
      return;
    }

    isHeaderMenuAnimating.current = true;
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, {
      toValue: 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isHeaderMenuAnimating.current = false;
      setIsHeaderMenuVisible(false);
      onClosed?.();
    });
  };

  const toggleHeaderMenu = () => {
    if (isHeaderMenuVisible) {
      closeHeaderMenu();
      return;
    }

    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    openHeaderMenu();
  };

  const handleHeaderMenuPress = (screenName) => {
    closeHeaderMenu(() => navigateWithUser(screenName));
  };

  useEffect(() => {
    const createToken = route?.params?.createToken;
    const createdAccount = route?.params?.createdAccount;

    if (!createToken || handledCreateTokenRef.current === createToken || !createdAccount) {
      return;
    }

    handledCreateTokenRef.current = createToken;
    setAccounts((current) => (
      current.some((account) => account.id === createdAccount.id)
        ? current
        : [createdAccount, ...current]
    ));

    navigation.setParams({
      createdAccount: undefined,
      createToken: undefined,
    });
  }, [navigation, route?.params?.createToken, route?.params?.createdAccount]);

  useEffect(() => {
    const updateToken = route?.params?.updateToken;
    const updatedAccount = route?.params?.updatedAccount;

    if (!updateToken || handledUpdateTokenRef.current === updateToken || !updatedAccount) {
      return;
    }

    handledUpdateTokenRef.current = updateToken;
    setAccounts((current) => current.map((account) => (
      account.id === updatedAccount.id ? updatedAccount : account
    )));

    navigation.setParams({
      updatedAccount: undefined,
      updateToken: undefined,
    });
  }, [navigation, route?.params?.updateToken, route?.params?.updatedAccount]);

  useEffect(() => {
    const deleteToken = route?.params?.deleteToken;
    const deletedAccountId = route?.params?.deletedAccountId;

    if (!deleteToken || handledDeleteTokenRef.current === deleteToken || !deletedAccountId) {
      return;
    }

    handledDeleteTokenRef.current = deleteToken;
    setAccounts((current) => current.filter((account) => account.id !== deletedAccountId));

    navigation.setParams({
      deletedAccountId: undefined,
      deleteToken: undefined,
    });
  }, [navigation, route?.params?.deleteToken, route?.params?.deletedAccountId]);

  const openCreateAccount = () => {
    navigation.navigate('StaffCreateAccount', {
      user: loggedInUser,
      existingAccounts: accounts,
    });
  };

  const openManageAccount = (account) => {
    navigation.navigate('StaffManageAccount', {
      user: loggedInUser,
      account,
    });
  };

  const handleAccountsSectionLayout = (event) => {
    accountsSectionOffset.current = event.nativeEvent.layout.y;
  };

  const scrollToAccountsSection = () => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(accountsSectionOffset.current - 12, 0),
      animated: true,
    });
  };

  const handleQuickOverviewPress = (filterKey) => {
    setActiveQuickFilter((current) => {
      if (filterKey === 'all') {
        return 'all';
      }

      return current === filterKey ? 'all' : filterKey;
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToAccountsSection();
      });
    });
  };

  const animateLowerHeader = (toValue) => {
    const shouldBeVisible = toValue === 1;

    if (isLowerHeaderVisible.current === shouldBeVisible) {
      return;
    }

    isLowerHeaderVisible.current = shouldBeVisible;
    lowerHeaderAnimation.stopAnimation();
    Animated.timing(lowerHeaderAnimation, {
      toValue,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const handleScroll = (event) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;

    if (currentScrollY > lastScrollY.current + 4 && currentScrollY > 8) {
      if (isHeaderMenuVisible) {
        closeHeaderMenu(() => animateLowerHeader(0));
        lastScrollY.current = currentScrollY;
        return;
      }
      animateLowerHeader(0);
    } else if (currentScrollY < lastScrollY.current - 4 || currentScrollY <= 0) {
      animateLowerHeader(1);
    }

    lastScrollY.current = currentScrollY;
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return accounts.filter((user) => {
      const matchesQuickFilter =
        activeQuickFilter === 'all'
        || (activeQuickFilter === 'active' && user.status === 'Active')
        || (activeQuickFilter === 'inactive' && user.status === 'Inactive')
        || (activeQuickFilter === 'review' && !isAccountProfileComplete(user));

      if (!matchesQuickFilter) {
        return false;
      }

      if (!normalizedQuery) return true;
      return [user.name, user.username, user.email, user.contact, user.address, user.role, user.status]
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [accounts, activeQuickFilter, searchQuery]);

  const summaryCards = useMemo(() => ([
    { key: 'all', label: 'Total Profiles', value: accounts.length, color: '#2d7fb3' },
    { key: 'active', label: 'Active', value: accounts.filter((user) => user.status === 'Active').length, color: '#1d7a4d' },
    { key: 'inactive', label: 'Inactive', value: accounts.filter((user) => user.status === 'Inactive').length, color: '#b54234' },
    { key: 'review', label: 'Needs Review', value: accounts.filter((user) => !isAccountProfileComplete(user)).length, color: '#d28b1e' },
  ]), [accounts]);

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={localStyles.background}>
      <SafeAreaView style={localStyles.container}>
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
            <TouchableOpacity
              style={dashboardStyles.brandSection}
              onPress={() => navigateWithUser('staff-screen')}
              activeOpacity={0.85}
            >
              <View style={dashboardStyles.logoWrap}>
                <Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" />
              </View>
              <View style={dashboardStyles.brandBlock}>
                <Text style={dashboardStyles.headerTitle}>PawCruz</Text>
                <Text style={dashboardStyles.headerSubtitle}>User Management</Text>
              </View>
            </TouchableOpacity>

            <View style={dashboardStyles.headerActions}>
              <TouchableOpacity
                style={dashboardStyles.notifButton}
                onPress={() => navigateWithUser('StaffNotif')}
                activeOpacity={0.85}
              >
                <View style={dashboardStyles.notifBadge} />
                <Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" />
              </TouchableOpacity>

              <TouchableOpacity
                style={dashboardStyles.profileButton}
                onPress={() => navigateWithUser('StaffProfile')}
                activeOpacity={0.85}
              >
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={localStyles.profileButtonImage} resizeMode="cover" />
                ) : (
                  <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          </LinearGradient>

          <Animated.View
            style={[
              dashboardStyles.headerBottomRowWrap,
              {
                maxHeight: lowerHeaderAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 96],
                }),
                opacity: lowerHeaderAnimation,
                transform: [
                  {
                    translateY: lowerHeaderAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={dashboardStyles.headerBottomRow}>
              <TouchableOpacity
                style={dashboardStyles.menuTriggerButton}
                onPress={toggleHeaderMenu}
                activeOpacity={0.85}
              >
                <Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
              </TouchableOpacity>

              <View style={dashboardStyles.ownerSummary}>
                <Text style={dashboardStyles.headerCaption}>Account oversight</Text>
                <Text style={dashboardStyles.ownerName}>{displayName}</Text>
              </View>
            </View>
          </Animated.View>

          {isHeaderMenuVisible ? (
            <Animated.View
              style={[
                dashboardStyles.headerMenuPanel,
                {
                  opacity: headerMenuAnimation,
                  transform: [
                    {
                      translateY: headerMenuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-18, 0],
                      }),
                    },
                    {
                      scale: headerMenuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              {HEADER_MENU_ITEMS.map((item, index) => {
                const itemEnterStart = index * 0.08;
                const itemEnterMid = Math.min(itemEnterStart + 0.45, 0.99);
                const itemOpacity = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, itemEnterMid, 1],
                  outputRange: [0, 1, 1],
                  extrapolate: 'clamp',
                });
                const itemTranslateY = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, 1],
                  outputRange: [14, 0],
                  extrapolate: 'clamp',
                });
                const itemScale = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, 1],
                  outputRange: [0.97, 1],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View
                    key={item.key}
                    style={{
                      opacity: itemOpacity,
                      transform: [{ translateY: itemTranslateY }, { scale: itemScale }],
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        dashboardStyles.headerMenuItem,
                        index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast,
                      ]}
                      onPress={() => handleHeaderMenuPress(item.route)}
                      activeOpacity={0.88}
                    >
                      <View style={dashboardStyles.headerMenuItemIconWrap}>
                        <Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" />
                      </View>
                      <Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={localStyles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <View style={localStyles.sectionHeaderWrap}>
            <Text style={localStyles.sectionTitle}>Quick Overview</Text>
          </View>

          <View style={localStyles.overviewCard}>
            <View style={localStyles.summaryGrid}>
              {summaryCards.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    localStyles.summaryCard,
                    activeQuickFilter === item.key && localStyles.summaryCardActive,
                  ]}
                  onPress={() => handleQuickOverviewPress(item.key)}
                  activeOpacity={0.9}
                >
                  <View style={[localStyles.summaryAccent, { backgroundColor: item.color }]} />
                  <Text style={localStyles.summaryValue}>{item.value}</Text>
                  <Text style={localStyles.summaryLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={localStyles.controlsCard}>
            <View style={localStyles.controlsHeaderRow}>
              <View style={localStyles.controlsTitleWrap}>
                <Text style={[localStyles.panelTitle, localStyles.controlsTitle]}>Find Pet Owners</Text>
              </View>
            </View>
            <View style={localStyles.searchBarWrap}>
              <Image source={require('../../assets/Search.png')} style={localStyles.searchIcon} resizeMode="contain" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={localStyles.searchInput}
                placeholder="Search username, full name, contact, or status"
                placeholderTextColor="#8aa2b4"
              />
            </View>
            <TouchableOpacity
              style={localStyles.createAccountButtonTouchArea}
              onPress={openCreateAccount}
              activeOpacity={0.92}
            >
              <LinearGradient
                colors={['#174c78', '#1d6fa5', '#2d8fcb']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={localStyles.createAccountButton}
              >
                <View style={localStyles.createAccountIconWrap}>
                  <Text style={localStyles.createAccountPlus}>+</Text>
                </View>
                <Text style={localStyles.createAccountButtonText}>Create Account</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {filteredUsers.length ? (
            <View style={localStyles.listWrap} onLayout={handleAccountsSectionLayout}>
              <Text style={localStyles.listWrapTitle}>Pet Owner Accounts</Text>

              {filteredUsers.map((user) => {
                const statusMeta = STATUS_META[user.status] || STATUS_META.Active;

                return (
                  <View key={user.id} style={localStyles.userCard}>
                    <View style={localStyles.userHeaderRow}>
                      <View style={localStyles.userIdentity}>
                        <View style={localStyles.avatarWrap}>
                          <View style={localStyles.avatarCircle}>
                            <Image source={DEFAULT_PROFILE_IMAGE} style={localStyles.avatarImage} resizeMode="contain" />
                          </View>
                        </View>
                        <View style={localStyles.userTextWrap}>
                          <Text style={localStyles.userUsername} numberOfLines={1}>@{user.username}</Text>
                          <Text style={localStyles.userName} numberOfLines={1}>{user.name}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={localStyles.userMetaRow}>
                      <View style={localStyles.userMetaCard}>
                        <Text style={localStyles.userMetaLabel}>Full Name</Text>
                        <Text style={localStyles.userMetaValue}>{user.name}</Text>
                      </View>

                      <View style={localStyles.userMetaCard}>
                        <Text style={localStyles.userMetaLabel}>Contact</Text>
                        <Text style={localStyles.userMetaValue}>{user.contact}</Text>
                      </View>
                    </View>

                    <View style={localStyles.userFooterRow}>
                      <View style={localStyles.userStatusWrap}>
                        <Text style={localStyles.userMetaLabel}>Status Activity</Text>
                        <View style={[localStyles.statusBadge, { backgroundColor: statusMeta.bg, borderColor: statusMeta.border }]}>
                          <Text style={[localStyles.statusBadgeText, { color: statusMeta.text }]}>{user.status}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={localStyles.actionButton}
                        onPress={() => openManageAccount(user)}
                        activeOpacity={0.9}
                      >
                        <Text style={localStyles.actionButtonText}>Manage</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={localStyles.emptyCard} onLayout={handleAccountsSectionLayout}>
              <Text style={localStyles.emptyTitle}>No pet owner accounts found</Text>
              <Text style={localStyles.emptyText}>Try another username, contact number, or status filter.</Text>
            </View>
          )}
        </ScrollView>

        </SafeAreaView>
    </LinearGradient>
  );
};

const localStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  profileButtonImage: { width: '100%', height: '100%' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 130 },
  sectionHeaderWrap: { marginBottom: 12, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#7fd3ff' },
  overviewCard: { paddingVertical: 2, marginBottom: 14 },
  controlsCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 14 },
  controlsHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  controlsTitleWrap: { flex: 1, marginRight: 12 },
  panelTitle: { fontSize: 16, fontWeight: '900', color: '#173f5c', marginBottom: 12 },
  controlsTitle: { marginBottom: 0 },
  createAccountButtonTouchArea: {
    marginTop: 14,
    width: '100%',
    borderRadius: 999,
    shadowColor: '#0d3e5c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  createAccountButton: {
    minHeight: 56,
    width: '100%',
    borderRadius: 999,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  createAccountIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  createAccountPlus: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    color: '#ffffff',
  },
  createAccountButtonText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  summaryCard: { width: '48%', backgroundColor: '#f7fcff', borderRadius: 20, borderWidth: 1, borderColor: '#e3f1f8', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, marginBottom: 12 },
  summaryCardActive: { borderColor: '#173f5c', backgroundColor: '#eef8ff' },
  summaryAccent: { width: 30, height: 5, borderRadius: 999, marginBottom: 10 },
  summaryValue: { fontSize: 24, fontWeight: '900', color: '#173f5c' },
  summaryLabel: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#638095' },
  searchBarWrap: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  searchIcon: { width: 19, height: 19, tintColor: '#5f7f94', marginRight: 10 },
  searchInput: { flex: 1, minHeight: 48, fontSize: 14, fontWeight: '700', color: '#173f5c' },
  listWrap: { marginBottom: 18 },
  listWrapTitle: { fontSize: 18, fontWeight: '900', color: '#7fd3ff', marginBottom: 12 },
  userCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  userHeaderRow: { marginBottom: 14 },
  userIdentity: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { marginRight: 12 },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eef6fb', borderWidth: 1, borderColor: '#d5e7f2', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 24, height: 24, tintColor: '#173f5c' },
  userTextWrap: { flex: 1 },
  userUsername: { fontSize: 12, fontWeight: '900', color: '#2d7fb3' },
  userName: { marginTop: 4, fontSize: 16, fontWeight: '900', color: '#173f5c' },
  userMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  userMetaCard: { width: '48.5%', backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#e4f1f8', padding: 12 },
  userMetaLabel: { fontSize: 11, fontWeight: '800', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 6 },
  userMetaValue: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: '#173f5c' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 11, fontWeight: '900' },
  userFooterRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  userStatusWrap: { flex: 1, marginRight: 12 },
  actionButton: { minWidth: 90, minHeight: 38, borderRadius: 14, backgroundColor: '#173f5c', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  actionButtonText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
  emptyCard: { backgroundColor: '#f4fbff', borderRadius: 24, borderWidth: 1, borderColor: '#d9ecf7', padding: 18, marginBottom: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#173f5c', marginBottom: 6 },
  emptyText: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#648398' },
});

export default StaffUserManagement;
