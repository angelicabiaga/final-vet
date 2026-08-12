import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/StaffDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'staff-screen' },
  { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'StaffAppointment' },
  { key: 'mypets', label: 'Pets Profile', icon: require('../../assets/Pets_Icon.png'), route: 'StaffPetsProfile' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'StaffMessages' },
  { key: 'inventory', label: 'Inventory', icon: require('../../assets/Inventory_Icon.png'), route: 'StaffInventory' },
  { key: 'user-management', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'StaffUserManagement' },
  { key: 'payment-history', label: 'Payment History', icon: require('../../assets/payment_icon.png'), route: 'StaffPayHis' },
  { key: 'activity-logs', label: 'Activity Logs', icon: require('../../assets/Log_Icon.png'), route: 'StaffActivityLogs' },
];

const FILTERS = ['All', 'Appointments', 'Payments', 'Inventory', 'Accounts', 'Security'];

const LOGS = [
  { id: 'log-001', type: 'Inventory', action: 'Updated Inventory: Bravecto', user: 'Staff: Aldwin', time: 'Feb 08, 2026 | 09:30 AM', status: 'Completed', detail: 'Stock count adjusted after morning audit.' },
  { id: 'log-002', type: 'Appointments', action: 'Approved Appointment: Buddy', user: 'Staff: Maria', time: 'Feb 08, 2026 | 08:45 AM', status: 'Completed', detail: 'Confirmed vaccination appointment with pet owner.' },
  { id: 'log-003', type: 'Accounts', action: 'Added New Pet: Luna', user: 'Staff: Aldwin', time: 'Feb 07, 2026 | 04:20 PM', status: 'Completed', detail: 'Created pet profile and linked owner account.' },
  { id: 'log-004', type: 'Payments', action: 'Processed Payment: P1000', user: 'Staff: Maria', time: 'Feb 07, 2026 | 02:15 PM', status: 'Posted', detail: 'Cash payment recorded for clinical service.' },
  { id: 'log-005', type: 'Security', action: 'System Login', user: 'Staff: Aldwin', time: 'Feb 07, 2026 | 08:00 AM', status: 'Verified', detail: 'Staff account signed in successfully.' },
  { id: 'log-006', type: 'Appointments', action: 'Modified Schedule', user: 'Admin', time: 'Feb 06, 2026 | 05:00 PM', status: 'Updated', detail: 'Clinic schedule adjusted for afternoon consultations.' },
];

export default function StaffActivityLogs({ navigation, route }) {
  const loggedInUser = route?.params?.user;
  const displayName = loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.username || 'Staff';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const navigateWithUser = (screen) => navigation.navigate(screen, { user: loggedInUser });

  const toggleHeaderMenu = () => {
    const nextVisible = !isHeaderMenuVisible;
    setIsHeaderMenuVisible(nextVisible);
    Animated.timing(headerMenuAnimation, {
      toValue: nextVisible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const handleHeaderMenuPress = (screen) => {
    setIsHeaderMenuVisible(false);
    headerMenuAnimation.setValue(0);
    navigateWithUser(screen);
  };

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return LOGS.filter((log) => {
      const matchesFilter = activeFilter === 'All' || log.type === activeFilter;
      const matchesQuery = !query || [log.type, log.action, log.user, log.time, log.status, log.detail]
        .some((value) => value.toLowerCase().includes(query));
      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, searchQuery]);

  const summaryCards = useMemo(() => [
    { key: 'total', label: 'Total Logs', value: LOGS.length, color: '#3d8fbd' },
    { key: 'today', label: 'Today', value: 2, color: '#55bd7a' },
    { key: 'security', label: 'Security', value: LOGS.filter((log) => log.type === 'Security').length, color: '#e7bf49' },
    { key: 'payments', label: 'Payments', value: LOGS.filter((log) => log.type === 'Payments').length, color: '#63B6C5' },
  ], []);

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={localStyles.background}>
      <SafeAreaView style={localStyles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerTopBand}>
            <View style={dashboardStyles.headerTopRow}>
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateWithUser('staff-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" />
                </View>
                <View style={dashboardStyles.brandBlock}>
                  <Text style={dashboardStyles.headerTitle}>PawCruz</Text>
                  <Text style={dashboardStyles.headerSubtitle}>Activity Logs</Text>
                </View>
              </TouchableOpacity>

              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateWithUser('StaffNotif')} activeOpacity={0.85}>
                  <View style={dashboardStyles.notifBadge} />
                  <Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateWithUser('StaffProfile')} activeOpacity={0.85}>
                  {profileImageUri ? <Image source={{ uri: profileImageUri }} style={localStyles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
              <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
                <Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
              </TouchableOpacity>
              <View style={dashboardStyles.ownerSummary}>
                <Text style={dashboardStyles.headerCaption}>System logs</Text>
                <Text style={dashboardStyles.ownerName}>{displayName}</Text>
              </View>
            </View>
          </Animated.View>

          {isHeaderMenuVisible ? (
            <Animated.View style={[dashboardStyles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }, { scale: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
              {HEADER_MENU_ITEMS.map((item, index) => (
                <TouchableOpacity key={item.key} style={[dashboardStyles.headerMenuItem, index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast]} onPress={() => handleHeaderMenuPress(item.route)} activeOpacity={0.88}>
                  <View style={dashboardStyles.headerMenuItemIconWrap}>
                    <Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" />
                  </View>
                  <Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView ref={scrollViewRef} onScroll={handleScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={localStyles.scrollContent}>
          <View style={localStyles.sectionHeaderWrap}>
            <Text style={localStyles.sectionTitle}>Activity Overview</Text>
            <Text style={localStyles.sectionSubtitle}>Monitor staff actions, records, and account activity.</Text>
          </View>

          <View style={localStyles.summaryGrid}>
            {summaryCards.map((item) => (
              <View key={item.key} style={localStyles.summaryCard}>
                <View style={[localStyles.summaryAccent, { backgroundColor: item.color }]} />
                <Text style={localStyles.summaryValue}>{item.value}</Text>
                <Text style={localStyles.summaryLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          <View style={localStyles.controlsCard}>
            <Text style={localStyles.controlsTitle}>Find Activity</Text>
            <View style={localStyles.searchBarWrap}>
              <Image source={require('../../assets/Search.png')} style={localStyles.searchIcon} resizeMode="contain" />
              <TextInput value={searchQuery} onChangeText={setSearchQuery} style={localStyles.searchInput} placeholder="Search action, staff, type, or status" placeholderTextColor="#8aa2b4" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={localStyles.filterRow}>
              {FILTERS.map((filter) => (
                <TouchableOpacity key={filter} style={[localStyles.filterChip, activeFilter === filter && localStyles.filterChipActive]} onPress={() => setActiveFilter(filter)} activeOpacity={0.88}>
                  <Text style={[localStyles.filterChipText, activeFilter === filter && localStyles.filterChipTextActive]}>{filter}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={localStyles.listWrap}>
            <Text style={localStyles.listWrapTitle}>Recent Logs</Text>
            {filteredLogs.map((log) => (
              <View key={log.id} style={localStyles.logCard}>
                <View style={localStyles.logTopRow}>
                  <View style={localStyles.logTitleWrap}>
                    <Text style={localStyles.logType}>{log.type}</Text>
                    <Text style={localStyles.logAction}>{log.action}</Text>
                  </View>
                  <View style={localStyles.statusBadge}>
                    <Text style={localStyles.statusBadgeText}>{log.status}</Text>
                  </View>
                </View>
                <Text style={localStyles.logDetail}>{log.detail}</Text>
                <View style={localStyles.logMetaRow}>
                  <Text style={localStyles.logUser}>{log.user}</Text>
                  <Text style={localStyles.logTime}>{log.time}</Text>
                </View>
              </View>
            ))}
            {!filteredLogs.length ? (
              <View style={localStyles.emptyCard}>
                <Text style={localStyles.emptyTitle}>No matching logs</Text>
                <Text style={localStyles.emptyText}>Try a different keyword or activity filter.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const localStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  profileButtonImage: { width: '100%', height: '100%' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 110 },
  sectionHeaderWrap: { marginBottom: 12, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#24566d' },
  sectionSubtitle: { fontSize: 12, color: '#5f7f8a', marginTop: 3, fontWeight: '600' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 2 },
  summaryCard: { width: '48%', minHeight: 126, backgroundColor: '#f8fcff', borderRadius: 18, borderWidth: 1, borderColor: '#dceef8', paddingHorizontal: 12, paddingTop: 26, paddingBottom: 14, marginBottom: 12 },
  summaryAccent: { width: 30, height: 5, borderRadius: 999, marginBottom: 10 },
  summaryValue: { fontSize: 34, lineHeight: 42, fontWeight: '900', color: '#24566d' },
  summaryLabel: { marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#68869c' },
  controlsCard: { backgroundColor: '#fcfeff', borderRadius: 28, borderWidth: 1, borderColor: '#edf7fd', padding: 16, marginBottom: 16 },
  controlsTitle: { fontSize: 16, fontWeight: '900', color: '#24566d', marginBottom: 12 },
  searchBarWrap: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#dceef8', backgroundColor: '#f8fcff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  searchIcon: { width: 19, height: 19, tintColor: '#5f7f8a', marginRight: 10 },
  searchInput: { flex: 1, minHeight: 48, fontSize: 14, fontWeight: '700', color: '#24566d' },
  filterRow: { paddingTop: 14, paddingRight: 6 },
  filterChip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#dceef8', backgroundColor: '#f8fcff', justifyContent: 'center', marginRight: 8 },
  filterChipActive: { backgroundColor: '#447C99', borderColor: '#447C99' },
  filterChipText: { fontSize: 12, fontWeight: '800', color: '#587286' },
  filterChipTextActive: { color: '#ffffff' },
  listWrap: { marginTop: 2, marginBottom: 18 },
  listWrapTitle: { fontSize: 18, fontWeight: '900', color: '#24566d', marginBottom: 12 },
  logCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#e3f3fb', padding: 15, marginBottom: 12 },
  logTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  logTitleWrap: { flex: 1, marginRight: 12 },
  logType: { fontSize: 11, fontWeight: '800', color: '#587286', textTransform: 'uppercase', marginBottom: 4 },
  logAction: { fontSize: 15, lineHeight: 20, fontWeight: '900', color: '#24566d' },
  logDetail: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#5d7b91', marginBottom: 12 },
  logMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  logUser: { flex: 1, fontSize: 12, fontWeight: '800', color: '#447C99', marginRight: 10 },
  logTime: { fontSize: 11, color: '#68869c', fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#e8f7ff', borderWidth: 1, borderColor: '#d4ebf8' },
  statusBadgeText: { fontSize: 11, fontWeight: '900', color: '#24566d' },
  emptyCard: { backgroundColor: '#f8fcff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d', marginBottom: 6 },
  emptyText: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#68869c' },
});