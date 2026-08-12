import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { REGISTERED_PET_OWNER_ACCOUNTS } from '../../../data/registeredPetOwners';
import { styles as dashboardStyles } from '../../styles/AdminDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'admin-screen' },
  { key: 'users', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
];
const ROLE_OPTIONS = ['All', 'Admin', 'Staff', 'Veterinarian', 'Pet Owner'];
const STATUS_OPTIONS = ['All', 'Active', 'Inactive'];
const SUMMARY_META = [
  { key: 'total', label: 'Total Users', accent: '#2d7fb3' },
  { key: 'active', label: 'Active Users', accent: '#1d7a4d' },
  { key: 'inactive', label: 'Inactive Users', accent: '#b54234' },
  { key: 'vet', label: 'Veterinarians', accent: '#6d4db7' },
  { key: 'staff', label: 'Staff', accent: '#3b9468' },
  { key: 'owner', label: 'Pet Owners', accent: '#2872a3' },
  { key: 'admin', label: 'Admins', accent: '#cc8b22' },
];

const mapPetOwner = (item, index) => ({
  id: `pet-owner-${item.id || index}`,
  userId: item.uid || `USR-${String(index + 1).padStart(4, '0')}`,
  fullName: item.name || '',
  username: item.username || `petowner${index + 1}`,
  email: item.email || '',
  contactNumber: item.contact || '',
  role: item.role || 'Pet Owner',
  accountStatus: item.status || 'Active',
  dateRegistered: `2026-04-${String(4 + index).padStart(2, '0')}`,
});

const BASE_USERS = [
  { id: 'admin-1', userId: 'USR-0001', fullName: 'Angelie Grace Panilag', username: 'angeliegrace', email: 'angelie@email.com', contactNumber: '09123456789', role: 'Admin', accountStatus: 'Active', dateRegistered: '2026-04-14' },
  { id: 'admin-2', userId: 'USR-0002', fullName: 'Karen Lopez', username: 'karenlopez', email: 'karen.lopez@pawcruz.com', contactNumber: '09221234567', role: 'Admin', accountStatus: 'Active', dateRegistered: '2026-04-11' },
  { id: 'staff-1', userId: 'USR-0003', fullName: 'Angela Cruz', username: 'angelacruz', email: 'angela.cruz@pawcruz.com', contactNumber: '09211239876', role: 'Staff', accountStatus: 'Active', dateRegistered: '2026-04-09' },
  { id: 'staff-2', userId: 'USR-0004', fullName: 'Paul Mendoza', username: 'paulmendoza', email: 'paul.mendoza@pawcruz.com', contactNumber: '09234567891', role: 'Staff', accountStatus: 'Inactive', dateRegistered: '2026-04-07' },
  { id: 'vet-1', userId: 'USR-0005', fullName: 'Dr. Julia Reyes', username: 'drjuliareyes', email: 'julia.reyes@pawcruz.com', contactNumber: '09195671234', role: 'Veterinarian', accountStatus: 'Active', dateRegistered: '2026-04-10' },
  { id: 'vet-2', userId: 'USR-0006', fullName: 'Dr. Sarah Dela Cruz', username: 'drsarahdelacruz', email: 'sarah.delacruz@pawcruz.com', contactNumber: '09182345678', role: 'Veterinarian', accountStatus: 'Active', dateRegistered: '2026-04-06' },
  ...REGISTERED_PET_OWNER_ACCOUNTS.map(mapPetOwner),
];

const getAdminName = (user) => user?.username || user?.fullName || user?.name || (user?.email ? String(user.email).split('@')[0] : 'Admin');
const getRoleColors = (role) => role === 'Admin' ? { bg: '#fff7e8', text: '#a06a17' } : role === 'Staff' ? { bg: '#eefaf2', text: '#28724b' } : role === 'Veterinarian' ? { bg: '#f4f0ff', text: '#6d4db7' } : { bg: '#eef7ff', text: '#256495' };
const getStatusColors = (status) => status === 'Inactive' ? { bg: '#fff1ef', border: '#f1cdc8', text: '#b54234' } : { bg: '#e8f7ef', border: '#c8ead7', text: '#1d7a4d' };

const AdminUserManagement = ({ navigation, route }) => {
  const currentUser = route?.params?.user || route?.params || null;
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = useState(() => new Animated.Value(0))[0];
  const [users, setUsers] = useState(BASE_USERS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRole, setActiveRole] = useState('All');
  const [activeStatus, setActiveStatus] = useState('All');
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();
  const [pickerType, setPickerType] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = setTimeout(() => setNotice(''), 2800);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const createdAccount = route?.params?.createdAccount;
    const createToken = route?.params?.createToken;

    if (!createdAccount || !createToken) {
      return;
    }

    setUsers((current) => (
      current.some((user) => user.id === createdAccount.id || user.userId === createdAccount.userId)
        ? current
        : [createdAccount, ...current]
    ));
    setNotice(`User ${createdAccount.fullName} was added.`);
    navigation.setParams({
      createdAccount: undefined,
      createToken: undefined,
    });
  }, [navigation, route?.params?.createdAccount, route?.params?.createToken]);

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

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      const matchesRole = activeRole === 'All' || user.role === activeRole;
      const matchesStatus = activeStatus === 'All' || user.accountStatus === activeStatus;
      const matchesQuery =
        !query ||
        [user.fullName, user.username, user.email].some((value) =>
          String(value || '').toLowerCase().includes(query),
        );

      return matchesRole && matchesStatus && matchesQuery;
    });
  }, [users, searchQuery, activeRole, activeStatus]);

  const summaryCards = useMemo(() => {
    const count = (predicate) => filteredUsers.filter(predicate).length;

    return SUMMARY_META.map((item) => ({
      ...item,
      value:
        item.key === 'total' ? filteredUsers.length
          : item.key === 'active' ? count((user) => user.accountStatus === 'Active')
            : item.key === 'inactive' ? count((user) => user.accountStatus === 'Inactive')
              : item.key === 'vet' ? count((user) => user.role === 'Veterinarian')
                : item.key === 'staff' ? count((user) => user.role === 'Staff')
                  : item.key === 'owner' ? count((user) => user.role === 'Pet Owner')
                    : count((user) => user.role === 'Admin'),
    }));
  }, [filteredUsers]);

  const openAddUser = () => {
    navigation.navigate('AdminCreateAccount', {
      user: currentUser,
      existingUsers: users,
    });
  };
  const pickerOptions = pickerType === 'role' ? ROLE_OPTIONS : STATUS_OPTIONS;
  const pickerLabel = pickerType === 'role' ? 'Role Filter' : 'Account Status Filter';

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
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
              <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>User Management</Text></View>
            </TouchableOpacity>
            <View style={dashboardStyles.headerActions}>
              <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateAdmin('AdminNotif')} activeOpacity={0.85}><View style={dashboardStyles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" /></TouchableOpacity>
              <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateAdmin('AdminProfile')} activeOpacity={0.85}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}</TouchableOpacity>
            </View>
            </View>
          </LinearGradient>
          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
            <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleMenu} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
            <View style={dashboardStyles.ownerSummary}><Text style={dashboardStyles.headerCaption}>Admin controls</Text><Text style={dashboardStyles.ownerName}>{getAdminName(currentUser)}</Text></View>
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
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {notice ? <View style={styles.noticeCard}><Text style={styles.noticeText}>{notice}</Text></View> : null}
          <View style={dashboardStyles.sectionHeaderWrap}>
            <Text style={dashboardStyles.sectionTitle}>User Management</Text>
            <Text style={dashboardStyles.sectionSubtitle}>Manage all PawCruz accounts from one admin-only page. Search, filter, update roles, and control account access using static frontend data for now.</Text>
          </View>

          <View style={styles.summaryGrid}>
            {summaryCards.map((item, index) => (
              <View key={item.key} style={[styles.summaryCard, index === summaryCards.length - 1 && styles.summaryCardWide]}>
                <View style={[styles.summaryAccent, { backgroundColor: item.accent }]} />
                <Text style={styles.summaryValue}>{item.value}</Text>
                <Text style={styles.summaryLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.controlsCard}>
            <View style={styles.controlsTopRow}>
              <View style={styles.controlsTextWrap}>
                <Text style={styles.panelTitle}>Registered Users</Text>
                <Text style={styles.panelSubtitle}>Search by name, username, or email and narrow results by role and account status.</Text>
              </View>
              <TouchableOpacity style={styles.addButtonTouchArea} onPress={openAddUser} activeOpacity={0.92}>
                <LinearGradient colors={['#1f4e66', '#447C99', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addButton}><View style={styles.addButtonIconWrap}><Text style={styles.addButtonPlus}>+</Text></View><Text style={styles.addButtonText}>Create Account</Text></LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.searchBarWrap}>
              <Image source={require('../../assets/Search.png')} style={styles.searchIcon} resizeMode="contain" />
              <TextInput value={searchQuery} onChangeText={setSearchQuery} style={styles.searchInput} placeholder="Search name, username, or email" placeholderTextColor="#8aa2b4" />
            </View>

            <View style={styles.dropdownFilterRow}>
              <TouchableOpacity style={[styles.dropdownFilterField, styles.dropdownFilterHalf]} onPress={() => setPickerType('role')} activeOpacity={0.88}>
                <Text style={styles.dropdownFilterLabel}>Role</Text>
                <View style={styles.dropdownFilterValueRow}><Text style={styles.dropdownFilterValue}>{activeRole}</Text><Text style={styles.dropdownFilterArrow}>v</Text></View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.dropdownFilterField, styles.dropdownFilterHalf]} onPress={() => setPickerType('status')} activeOpacity={0.88}>
                <Text style={styles.dropdownFilterLabel}>Account Status</Text>
                <View style={styles.dropdownFilterValueRow}><Text style={styles.dropdownFilterValue}>{activeStatus}</Text><Text style={styles.dropdownFilterArrow}>v</Text></View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.listHeaderRow}>
            <View><Text style={styles.listTitle}>User Accounts</Text><Text style={styles.listSubtitle}>{filteredUsers.length} result{filteredUsers.length === 1 ? '' : 's'} currently shown</Text></View>
          </View>

          {filteredUsers.length ? filteredUsers.map((user) => {
            const roleColors = getRoleColors(user.role);
            const statusColors = getStatusColors(user.accountStatus);
            return (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userTopRow}>
                  <View style={styles.userIdentityWrap}>
                    <View style={styles.avatarCircle}><Image source={DEFAULT_PROFILE_IMAGE} style={styles.avatarImage} resizeMode="contain" /></View>
                    <View style={styles.userTextWrap}>
                      <Text style={styles.userName} numberOfLines={1}>{user.fullName}</Text>
                      <Text style={styles.userSubline} numberOfLines={1}>{user.userId}  |  @{user.username}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.metaGrid}>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Email</Text><Text style={styles.metaValue} numberOfLines={2}>{user.email}</Text></View>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Contact Number</Text><Text style={styles.metaValue}>{user.contactNumber}</Text></View>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Role</Text><View style={[styles.roleBadge, { backgroundColor: roleColors.bg }]}><Text style={[styles.roleBadgeText, { color: roleColors.text }]}>{user.role}</Text></View></View>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Account Status</Text><View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}><Text style={[styles.statusBadgeText, { color: statusColors.text }]}>{user.accountStatus}</Text></View></View>
                  <View style={styles.metaItem}><Text style={styles.metaLabel}>Date Registered</Text><Text style={styles.metaValue}>{user.dateRegistered}</Text></View>
                </View>
              </View>
            );
          }) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No users found</Text><Text style={styles.emptyText}>Try adjusting the search term, role, or account status filters.</Text></View>}
        </ScrollView>

        <Modal transparent animationType="fade" visible={Boolean(pickerType)} onRequestClose={() => setPickerType(null)}>
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setPickerType(null)} />
            <View style={styles.sheetCard}>
              <Text style={styles.sheetTitle}>{pickerLabel}</Text>
              {pickerOptions.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.sheetAction}
                  onPress={() => {
                    if (pickerType === 'role') {
                      setActiveRole(item);
                    } else {
                      setActiveStatus(item);
                    }
                    setPickerType(null);
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={styles.sheetActionText}>{item}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.sheetCloseButton} onPress={() => setPickerType(null)} activeOpacity={0.88}><Text style={styles.sheetCloseButtonText}>Close</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: { flex: 1 }, container: { flex: 1, backgroundColor: 'transparent' }, scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 132 },
  noticeCard: { backgroundColor: '#eaf6ff', borderRadius: 18, borderWidth: 1, borderColor: '#cfe7f8', padding: 14, marginBottom: 14 }, noticeText: { fontSize: 13, fontWeight: '800', color: '#24566d' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 14 }, summaryCard: { width: '48%', backgroundColor: '#f7fcff', borderRadius: 22, borderWidth: 1, borderColor: '#deeff8', padding: 14, marginBottom: 12 }, summaryCardWide: { width: '100%' }, summaryAccent: { width: 30, height: 5, borderRadius: 999, marginBottom: 10 }, summaryValue: { fontSize: 24, fontWeight: '900', color: '#24566d' }, summaryLabel: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#638095' },
  controlsCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 14 }, controlsTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }, controlsTextWrap: { flex: 1, marginRight: 12 }, panelTitle: { fontSize: 17, fontWeight: '900', color: '#24566d' }, panelSubtitle: { marginTop: 6, fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#68879b' },
  addButtonTouchArea: { width: 116, borderRadius: 999 }, addButton: { minHeight: 46, borderRadius: 999, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }, addButtonIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 8 }, addButtonPlus: { fontSize: 15, lineHeight: 16, fontWeight: '900', color: '#ffffff' }, addButtonText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
  searchBarWrap: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }, searchIcon: { width: 19, height: 19, tintColor: '#5f7f94', marginRight: 10 }, searchInput: { flex: 1, minHeight: 48, fontSize: 14, fontWeight: '700', color: '#24566d' },
  dropdownFilterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }, dropdownFilterField: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', paddingHorizontal: 14, paddingVertical: 12 }, dropdownFilterHalf: { width: '48.5%' }, dropdownFilterLabel: { fontSize: 11, fontWeight: '800', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 8 }, dropdownFilterValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dropdownFilterValue: { flex: 1, fontSize: 13, fontWeight: '800', color: '#24566d', marginRight: 8 }, dropdownFilterArrow: { fontSize: 14, fontWeight: '900', color: '#5f7f94' },
  listHeaderRow: { marginBottom: 12, paddingHorizontal: 2 }, listTitle: { fontSize: 18, fontWeight: '900', color: '#24566d' }, listSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#5d7b91' },
  userCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 }, userTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }, userIdentityWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }, avatarCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#eef6fb', borderWidth: 1, borderColor: '#d5e7f2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, avatarImage: { width: 26, height: 26, tintColor: '#24566d' }, userTextWrap: { flex: 1 }, userName: { fontSize: 17, fontWeight: '900', color: '#24566d' }, userSubline: { marginTop: 5, fontSize: 12, lineHeight: 18, fontWeight: '800', color: '#5f7f94' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, metaItem: { width: '48.5%', backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#e4f1f8', padding: 12, marginBottom: 12 }, metaLabel: { fontSize: 11, fontWeight: '800', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 6 }, metaValue: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: '#24566d' }, roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999 }, roleBadgeText: { fontSize: 11, fontWeight: '900' }, statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1 }, statusBadgeText: { fontSize: 11, fontWeight: '900' },
  emptyCard: { backgroundColor: '#f4fbff', borderRadius: 24, borderWidth: 1, borderColor: '#d9ecf7', padding: 18, marginBottom: 18 }, emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d', marginBottom: 6 }, emptyText: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#648398' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4, 17, 28, 0.45)' }, sheetCard: { backgroundColor: '#fafdff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, borderTopWidth: 1, borderColor: '#d8eaf5' }, sheetTitle: { fontSize: 18, fontWeight: '900', color: '#24566d' }, sheetSubtitle: { marginTop: 4, marginBottom: 12, fontSize: 12, fontWeight: '700', color: '#6c899d' }, sheetAction: { minHeight: 52, borderRadius: 16, backgroundColor: '#f7fbfe', borderWidth: 1, borderColor: '#e1eef7', paddingHorizontal: 14, justifyContent: 'center', marginBottom: 10 }, sheetActionText: { fontSize: 13, fontWeight: '800', color: '#24566d' }, sheetActionDanger: { backgroundColor: '#fff4f1', borderColor: '#f2d6cf' }, sheetActionDangerText: { color: '#b54234' }, sheetCloseButton: { minHeight: 46, borderRadius: 16, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginTop: 2 }, sheetCloseButtonText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
});

export default AdminUserManagement;



