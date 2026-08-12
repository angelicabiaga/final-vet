import React, { useRef, useState } from 'react';
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
    username: account?.username || '',
    firstName: account?.firstName || firstName,
    lastName: account?.lastName || lastName,
    email: account?.email || '',
    contact: account?.contact || '',
    emergencyContact: account?.emergencyContact || '',
    address: account?.address || '',
    status: account?.status || 'Active',
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
const ACCOUNT_STATUS_OPTIONS = [
  {
    key: 'Active',
    title: 'Active',
    accent: '#1d7a4d',
    tint: '#e8f7ef',
  },
  {
    key: 'Inactive',
    title: 'Inactive',
    accent: '#b54234',
    tint: '#fff1ef',
  },
];

const StaffManageAccount = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const account = route?.params?.account;
  const displayName = loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.username || 'Staff';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const scrollViewRef = useRef(null);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [accountForm, setAccountForm] = useState(() => buildAccountForm(account));
  const [formError, setFormError] = useState('');

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

  const updateAccountForm = (field, value) => {
    if (formError) {
      setFormError('');
    }
    setAccountForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveAccount = () => {
    if (hasEmptyRequiredField(accountForm)) {
      setFormError('Please fill in all required fields before saving this account.');
      return;
    }

    const trimmedForm = {
      username: accountForm.username.trim(),
      firstName: accountForm.firstName.trim(),
      lastName: accountForm.lastName.trim(),
      email: accountForm.email.trim(),
      contact: accountForm.contact.trim(),
      emergencyContact: accountForm.emergencyContact.trim(),
      address: accountForm.address.trim(),
    };
    const updatedAccount = {
      ...account,
      name: `${trimmedForm.firstName} ${trimmedForm.lastName}`.trim(),
      firstName: trimmedForm.firstName,
      lastName: trimmedForm.lastName,
      username: trimmedForm.username,
      email: trimmedForm.email,
      contact: trimmedForm.contact,
      emergencyContact: trimmedForm.emergencyContact,
      address: trimmedForm.address,
      role: 'Pet Owner',
      status: accountForm.status || 'Active',
    };

    navigation.navigate({
      name: 'StaffUserManagement',
      params: {
        user: loggedInUser,
        updatedAccount,
        updateToken: Date.now(),
      },
      merge: true,
    });
  };

  const handleDeleteAccount = () => {
    navigation.navigate({
      name: 'StaffUserManagement',
      params: {
        user: loggedInUser,
        deletedAccountId: account?.id,
        deleteToken: Date.now(),
      },
      merge: true,
    });
  };

  return (
    <LinearGradient colors={['#022c42', '#0c212b', '#15394e']} style={localStyles.background}>
      <SafeAreaView style={localStyles.container}>
        <LinearGradient
          colors={['#123554', '#1b4d74', '#245f8e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={dashboardStyles.headerBar}
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
              <View style={localStyles.headerControls}>
                <TouchableOpacity
                  style={dashboardStyles.menuTriggerButton}
                  onPress={toggleHeaderMenu}
                  activeOpacity={0.85}
                >
                  <Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={localStyles.backTriggerButton}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.85}
                >
                  <Image source={require('../../assets/Back_Icon.png')} style={localStyles.backTriggerIcon} resizeMode="contain" />
                </TouchableOpacity>
              </View>

              <View style={dashboardStyles.ownerSummary}>
                <Text style={dashboardStyles.headerCaption}>Selected pet owner</Text>
                <Text style={dashboardStyles.ownerName}>{account?.name || displayName}</Text>
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
            <Text style={localStyles.sectionTitle}>Manage Pet Owner Account</Text>
            <Text style={localStyles.sectionSubtitle}>Review the selected profile, update the contact details, and change the activity status when needed.</Text>
          </View>

          <View style={localStyles.formCard}>
            {formError ? (
              <View style={localStyles.formErrorBanner}>
                <Text style={localStyles.formErrorText}>{formError}</Text>
              </View>
            ) : null}

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>Username<Text style={localStyles.requiredMark}> *</Text></Text>
              <TextInput
                value={accountForm.username}
                onChangeText={(value) => updateAccountForm('username', value)}
                style={localStyles.fieldInput}
                placeholder="Enter username"
                placeholderTextColor="#8aa2b4"
                autoCapitalize="none"
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>First Name<Text style={localStyles.requiredMark}> *</Text></Text>
              <TextInput
                value={accountForm.firstName}
                onChangeText={(value) => updateAccountForm('firstName', value)}
                style={localStyles.fieldInput}
                placeholder="Enter first name"
                placeholderTextColor="#8aa2b4"
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>Last Name<Text style={localStyles.requiredMark}> *</Text></Text>
              <TextInput
                value={accountForm.lastName}
                onChangeText={(value) => updateAccountForm('lastName', value)}
                style={localStyles.fieldInput}
                placeholder="Enter last name"
                placeholderTextColor="#8aa2b4"
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>Email<Text style={localStyles.requiredMark}> *</Text></Text>
              <TextInput
                value={accountForm.email}
                onChangeText={(value) => updateAccountForm('email', value)}
                style={localStyles.fieldInput}
                placeholder="Enter email address"
                placeholderTextColor="#8aa2b4"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>Contact<Text style={localStyles.requiredMark}> *</Text></Text>
              <TextInput
                value={accountForm.contact}
                onChangeText={(value) => updateAccountForm('contact', value)}
                style={localStyles.fieldInput}
                placeholder="Enter contact number"
                placeholderTextColor="#8aa2b4"
                keyboardType="phone-pad"
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>Emergency Contact<Text style={localStyles.requiredMark}> *</Text></Text>
              <TextInput
                value={accountForm.emergencyContact}
                onChangeText={(value) => updateAccountForm('emergencyContact', value)}
                style={localStyles.fieldInput}
                placeholder="Enter emergency contact"
                placeholderTextColor="#8aa2b4"
                keyboardType="phone-pad"
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>Address<Text style={localStyles.requiredMark}> *</Text></Text>
              <TextInput
                value={accountForm.address}
                onChangeText={(value) => updateAccountForm('address', value)}
                style={[localStyles.fieldInput, localStyles.fieldInputMultiline]}
                placeholder="Enter address"
                placeholderTextColor="#8aa2b4"
                multiline
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={localStyles.fieldLabel}>Account Status</Text>
              <Text style={localStyles.fieldHelperText}>Set the account based on recent owner usage.</Text>
              <View style={localStyles.statusOptionRow}>
                {ACCOUNT_STATUS_OPTIONS.map((statusOption) => {
                  const isSelected = accountForm.status === statusOption.key;

                  return (
                    <TouchableOpacity
                      key={statusOption.key}
                      style={[
                        localStyles.statusOptionButton,
                        {
                          backgroundColor: isSelected ? statusOption.tint : '#ffffff',
                          borderColor: isSelected ? statusOption.accent : '#d5e7f2',
                        },
                      ]}
                      onPress={() => updateAccountForm('status', statusOption.key)}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          localStyles.statusOptionText,
                          { color: isSelected ? statusOption.accent : '#173f5c' },
                        ]}
                      >
                        {statusOption.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={localStyles.statusMeaningText}>
                {accountForm.status === 'Inactive'
                  ? 'Inactive means the pet owner has not been using the account for almost 1 year.'
                  : 'Active means the pet owner is still using the account.'}
              </Text>
            </View>

            <View style={localStyles.actionRow}>
              <TouchableOpacity
                style={localStyles.deleteButton}
                onPress={handleDeleteAccount}
                activeOpacity={0.9}
              >
                <Text style={localStyles.deleteButtonText}>Delete Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={localStyles.saveButton}
                onPress={handleSaveAccount}
                activeOpacity={0.9}
              >
                <Text style={localStyles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        </SafeAreaView>
    </LinearGradient>
  );
};

const localStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  profileButtonImage: { width: '100%', height: '100%' },
  headerControls: { flexDirection: 'row', alignItems: 'center' },
  backTriggerButton: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', marginLeft: 14 },
  backTriggerIcon: { width: 24, height: 24, tintColor: '#ffffff' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 130 },
  sectionHeaderWrap: { marginBottom: 12, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#7fd3ff' },
  sectionSubtitle: { marginTop: 3, fontSize: 12, color: '#d5ecf8', fontWeight: '600' },
  formCard: { backgroundColor: '#f8fcff', borderRadius: 22, borderWidth: 1, borderColor: '#e3f2fb', padding: 16, marginBottom: 18 },
  formErrorBanner: { backgroundColor: '#ffe8e5', borderRadius: 16, borderWidth: 1, borderColor: '#f5c3bc', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 },
  formErrorText: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#b54234' },
  fieldGroup: { marginBottom: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: '#6a8aa0', marginBottom: 8, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldHelperText: { marginTop: -2, marginBottom: 10, fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#648398' },
  requiredMark: { color: '#d14b4b' },
  fieldInput: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#ffffff', paddingHorizontal: 14, fontSize: 14, fontWeight: '700', color: '#173f5c' },
  fieldInputMultiline: { minHeight: 88, paddingTop: 14, textAlignVertical: 'top' },
  statusOptionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusOptionButton: { width: '48.5%', minHeight: 46, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  statusOptionText: { fontSize: 12, fontWeight: '900' },
  statusMeaningText: { marginTop: 8, fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#648398' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  deleteButton: { minHeight: 52, borderRadius: 18, backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#ffd7d7', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginRight: 10 },
  deleteButtonText: { fontSize: 14, fontWeight: '900', color: '#b54234' },
  saveButton: { flex: 1, minHeight: 52, borderRadius: 18, backgroundColor: '#173f5c', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  saveButtonText: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
});

export default StaffManageAccount;
