import React, { useState } from 'react';
import { Animated, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/AdminDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { isValidPhMobile, sanitizePhoneInput } from '../../../utils/validators';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'admin-screen' },
  { key: 'users', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
];
const ROLE_OPTIONS = ['Admin', 'Staff', 'Veterinarian', 'Pet Owner'];
const STATUS_OPTIONS = ['Active', 'Inactive'];

const buildAccountForm = () => ({
  fullName: '',
  username: '',
  email: '',
  contactNumber: '',
  role: 'Pet Owner',
  accountStatus: 'Active',
  dateRegistered: '2026-04-14',
});

const getAdminName = (user) => user?.username || user?.fullName || user?.name || (user?.email ? String(user.email).split('@')[0] : 'Admin');
const hasEmptyRequiredField = (form) => !form.fullName.trim() || !form.username.trim() || !form.email.trim() || !form.contactNumber.trim() || !isValidPhMobile(form.contactNumber);
const getNextUserId = (accounts) => {
  const nextNumber = accounts.reduce((largest, account) => Math.max(largest, Number(String(account.userId || '').replace(/\D/g, '')) || 0), 0) + 1;
  return `USR-${String(nextNumber).padStart(4, '0')}`;
};

const AdminCreateAccount = ({ navigation, route }) => {
  const currentUser = route?.params?.user || route?.params || null;
  const existingUsers = route?.params?.existingUsers || [];
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = useState(() => new Animated.Value(0))[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState(buildAccountForm());
  const [formError, setFormError] = useState('');
  const [pickerType, setPickerType] = useState(null);
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();

  const navigateAdmin = (screen) => {
    if (currentUser) {
      navigation.navigate(screen, { user: currentUser });
      return;
    }

    navigation.navigate(screen);
  };

  const toggleMenu = () => {
    if (menuOpen) {
      Animated.timing(menuAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMenuOpen(false));
      return;
    }

    setMenuOpen(true);
    Animated.timing(menuAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  };

  const updateForm = (field, value) => {
    if (formError) {
      setFormError('');
    }

    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCreateAccount = () => {
    if (hasEmptyRequiredField(form)) {
      setFormError('Please complete the required fields before creating this account.');
      return;
    }

    const nextAccount = {
      id: `admin-user-${Date.now()}`,
      userId: getNextUserId(existingUsers),
      fullName: form.fullName.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      contactNumber: form.contactNumber.trim(),
      role: form.role,
      accountStatus: form.accountStatus,
      dateRegistered: form.dateRegistered.trim() || '2026-04-14',
    };

    navigation.navigate({
      name: 'AdminUserManagement',
      params: {
        user: currentUser,
        createdAccount: nextAccount,
        createToken: Date.now(),
      },
      merge: true,
    });
  };

  const pickerOptions = pickerType === 'role' ? ROLE_OPTIONS : STATUS_OPTIONS;
  const pickerLabel = pickerType === 'role' ? 'Select Role' : 'Select Account Status';

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={localStyles.background}>
      <SafeAreaView style={localStyles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerBar}>
          <LinearGradient
            colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={dashboardStyles.headerTopBand}
          >
            <View style={dashboardStyles.headerTopRow}>
            <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateAdmin('admin-screen')} activeOpacity={0.85}>
              <View style={dashboardStyles.logoWrap}><Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" /></View>
              <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>Create Account</Text></View>
            </TouchableOpacity>
            <View style={dashboardStyles.headerActions}>
              <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateAdmin('AdminNotif')} activeOpacity={0.85}><View style={dashboardStyles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" /></TouchableOpacity>
              <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateAdmin('AdminProfile')} activeOpacity={0.85}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}</TouchableOpacity>
            </View>
            </View>
          </LinearGradient>

          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
            <View style={localStyles.headerControls}>
              <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleMenu} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
              <TouchableOpacity style={localStyles.backTriggerButton} onPress={() => navigation.goBack()} activeOpacity={0.85}><Image source={require('../../assets/Back_Icon.png')} style={localStyles.backTriggerIcon} resizeMode="contain" /></TouchableOpacity>
            </View>
            <View style={dashboardStyles.ownerSummary}><Text style={dashboardStyles.headerCaption}>New account setup</Text><Text style={dashboardStyles.ownerName}>{getAdminName(currentUser)}</Text></View>
          </View>
          </Animated.View>

          {menuOpen ? (
            <Animated.View style={[dashboardStyles.headerMenuPanel, { opacity: menuAnim, transform: [{ translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>
              {HEADER_MENU_ITEMS.map((item, index) => (
                <TouchableOpacity key={item.key} style={[dashboardStyles.headerMenuItem, index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast]} onPress={() => { setMenuOpen(false); menuAnim.setValue(0); navigateAdmin(item.route); }} activeOpacity={0.88}>
                  <View style={dashboardStyles.headerMenuItemIconWrap}><Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
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
            <Text style={localStyles.sectionTitle}>Create Account</Text>
            <Text style={localStyles.sectionSubtitle}>Add a new PawCruz account for admin, staff, veterinarian, or pet owner using frontend-only data.</Text>
          </View>

          <View style={localStyles.formCard}>
            {formError ? <View style={localStyles.errorBanner}><Text style={localStyles.errorText}>{formError}</Text></View> : null}

            <Text style={localStyles.fieldLabel}>Full Name<Text style={localStyles.requiredMark}> *</Text></Text>
            <TextInput value={form.fullName} onChangeText={(value) => updateForm('fullName', value)} style={localStyles.fieldInput} placeholder="Enter full name" placeholderTextColor="#8aa2b4" />

            <Text style={localStyles.fieldLabel}>Username<Text style={localStyles.requiredMark}> *</Text></Text>
            <TextInput value={form.username} onChangeText={(value) => updateForm('username', value)} style={localStyles.fieldInput} placeholder="Enter username" placeholderTextColor="#8aa2b4" autoCapitalize="none" />

            <Text style={localStyles.fieldLabel}>Email<Text style={localStyles.requiredMark}> *</Text></Text>
            <TextInput value={form.email} onChangeText={(value) => updateForm('email', value)} style={localStyles.fieldInput} placeholder="Enter email address" placeholderTextColor="#8aa2b4" autoCapitalize="none" keyboardType="email-address" />

            <Text style={localStyles.fieldLabel}>Contact Number<Text style={localStyles.requiredMark}> *</Text></Text>
            <TextInput value={form.contactNumber} onChangeText={(value) => updateForm('contactNumber', sanitizePhoneInput(value))} style={localStyles.fieldInput} placeholder="09XXXXXXXXX" placeholderTextColor="#8aa2b4" keyboardType="number-pad" maxLength={11} />

            <Text style={localStyles.fieldLabel}>Registration Date</Text>
            <TextInput value={form.dateRegistered} onChangeText={(value) => updateForm('dateRegistered', value)} style={localStyles.fieldInput} placeholder="YYYY-MM-DD" placeholderTextColor="#8aa2b4" />

            <View style={localStyles.dropdownRow}>
              <TouchableOpacity style={[localStyles.dropdownField, localStyles.dropdownFieldHalf]} onPress={() => setPickerType('role')} activeOpacity={0.88}>
                <Text style={localStyles.dropdownFieldLabel}>Role</Text>
                <View style={localStyles.dropdownValueRow}><Text style={localStyles.dropdownValueText}>{form.role}</Text><Text style={localStyles.dropdownArrow}>v</Text></View>
              </TouchableOpacity>

              <TouchableOpacity style={[localStyles.dropdownField, localStyles.dropdownFieldHalf]} onPress={() => setPickerType('status')} activeOpacity={0.88}>
                <Text style={localStyles.dropdownFieldLabel}>Account Status</Text>
                <View style={localStyles.dropdownValueRow}><Text style={localStyles.dropdownValueText}>{form.accountStatus}</Text><Text style={localStyles.dropdownArrow}>v</Text></View>
              </TouchableOpacity>
            </View>

            <View style={localStyles.actionRow}>
              <TouchableOpacity style={localStyles.cancelButton} onPress={() => navigation.goBack()} activeOpacity={0.9}><Text style={localStyles.cancelButtonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={localStyles.createButton} onPress={handleCreateAccount} activeOpacity={0.9}><Text style={localStyles.createButtonText}>Create Account</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <Modal transparent animationType="fade" visible={Boolean(pickerType)} onRequestClose={() => setPickerType(null)}>
          <View style={localStyles.sheetOverlay}>
            <Pressable style={localStyles.sheetBackdrop} onPress={() => setPickerType(null)} />
            <View style={localStyles.sheetCard}>
              <Text style={localStyles.sheetTitle}>{pickerLabel}</Text>
              {pickerOptions.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={localStyles.sheetOption}
                  onPress={() => {
                    updateForm(pickerType === 'role' ? 'role' : 'accountStatus', item);
                    setPickerType(null);
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={localStyles.sheetOptionText}>{item}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={localStyles.sheetCloseButton} onPress={() => setPickerType(null)} activeOpacity={0.88}><Text style={localStyles.sheetCloseButtonText}>Close</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const localStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  headerControls: { flexDirection: 'row', alignItems: 'center' },
  backTriggerButton: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', marginLeft: 14 },
  backTriggerIcon: { width: 24, height: 24, tintColor: '#ffffff' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 132 },
  sectionHeaderWrap: { marginBottom: 12, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#24566d' },
  sectionSubtitle: { marginTop: 4, fontSize: 12, lineHeight: 18, color: '#5d7b91', fontWeight: '600' },
  formCard: { backgroundColor: '#f8fcff', borderRadius: 22, borderWidth: 1, borderColor: '#e3f2fb', padding: 16, marginBottom: 18 },
  errorBanner: { backgroundColor: '#ffe8e5', borderRadius: 16, borderWidth: 1, borderColor: '#f5c3bc', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 },
  errorText: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#b54234' },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: '#6a8aa0', marginBottom: 8, marginTop: 10, textTransform: 'uppercase' },
  requiredMark: { color: '#d14b4b' },
  fieldInput: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#ffffff', paddingHorizontal: 14, fontSize: 14, fontWeight: '700', color: '#24566d' },
  dropdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  dropdownField: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', paddingHorizontal: 14, paddingVertical: 12 },
  dropdownFieldHalf: { width: '48.5%' },
  dropdownFieldLabel: { fontSize: 11, fontWeight: '800', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 8 },
  dropdownValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownValueText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#24566d', marginRight: 8 },
  dropdownArrow: { fontSize: 14, fontWeight: '900', color: '#5f7f94' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  cancelButton: { minHeight: 52, borderRadius: 18, backgroundColor: '#e7edf2', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, marginRight: 10 },
  cancelButtonText: { fontSize: 14, fontWeight: '900', color: '#4f6a7b' },
  createButton: { flex: 1, minHeight: 52, borderRadius: 18, backgroundColor: '#447C99', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  createButtonText: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4, 17, 28, 0.45)' },
  sheetCard: { backgroundColor: '#fafdff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, borderTopWidth: 1, borderColor: '#d8eaf5' },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#24566d', marginBottom: 10 },
  sheetOption: { minHeight: 50, borderRadius: 16, backgroundColor: '#f7fbfe', borderWidth: 1, borderColor: '#e1eef7', paddingHorizontal: 14, justifyContent: 'center', marginBottom: 10 },
  sheetOptionText: { fontSize: 13, fontWeight: '800', color: '#24566d' },
  sheetCloseButton: { minHeight: 46, borderRadius: 16, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  sheetCloseButtonText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
});

export default AdminCreateAccount;


