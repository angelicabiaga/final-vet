import React, { useRef, useState } from 'react';
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
  { key: 'activity-logs', label: 'Activity Logs', icon: require('../../assets/Log_Icon.png'), route: 'StaffLogs' },
];
const LOGS = [
  { id: '1', action: 'Updated Inventory: Bravecto', user: 'Staff: Aldwin', time: 'Feb 08, 2026 | 09:30 AM' },
  { id: '2', action: 'Approved Appointment: Buddy', user: 'Staff: Maria', time: 'Feb 08, 2026 | 08:45 AM' },
  { id: '3', action: 'Added New Pet: Luna', user: 'Staff: Aldwin', time: 'Feb 07, 2026 | 04:20 PM' },
  { id: '4', action: 'Processed Payment: P1000', user: 'Staff: Maria', time: 'Feb 07, 2026 | 02:15 PM' },
  { id: '5', action: 'System Login', user: 'Staff: Aldwin', time: 'Feb 07, 2026 | 08:00 AM' },
  { id: '6', action: 'Modified Schedule', user: 'Admin', time: 'Feb 06, 2026 | 05:00 PM' },
];

const StaffLogs = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const displayName = loggedInUser?.fullName || loggedInUser?.name || loggedInUser?.username || 'Staff';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navigateWithUser = (screen) => navigation.navigate(screen, { user: loggedInUser });
  const toggleHeaderMenu = () => {
    const nextVisible = !isHeaderMenuVisible;
    setIsHeaderMenuVisible(nextVisible);
    Animated.timing(headerMenuAnimation, { toValue: nextVisible ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const handleHeaderMenuPress = (screen) => {
    setIsHeaderMenuVisible(false);
    headerMenuAnimation.setValue(0);
    navigateWithUser(screen);
  };
  const filteredLogs = LOGS.filter((log) => [log.action, log.user, log.time].some((value) => value.toLowerCase().includes(searchQuery.trim().toLowerCase())));

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={localStyles.background}>
      <SafeAreaView style={localStyles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerTopBand}>
            <View style={dashboardStyles.headerTopRow}>
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateWithUser('staff-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}><Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" /></View>
                <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>Activity Logs</Text></View>
              </TouchableOpacity>
              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateWithUser('StaffNotif')} activeOpacity={0.85}><View style={dashboardStyles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" /></TouchableOpacity>
                <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateWithUser('StaffProfile')} activeOpacity={0.85}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={localStyles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}</TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
              <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
              <View style={dashboardStyles.ownerSummary}><Text style={dashboardStyles.headerCaption}>System logs</Text><Text style={dashboardStyles.ownerName}>{displayName}</Text></View>
            </View>
          </Animated.View>
          {isHeaderMenuVisible ? (
            <Animated.View style={[dashboardStyles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }]}>
              {HEADER_MENU_ITEMS.map((item, index) => (
                <TouchableOpacity key={item.key} style={[dashboardStyles.headerMenuItem, index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast]} onPress={() => handleHeaderMenuPress(item.route)} activeOpacity={0.88}>
                  <View style={dashboardStyles.headerMenuItemIconWrap}><Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>
        <ScrollView ref={scrollViewRef} onScroll={handleScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={localStyles.scrollContent}>
          <View style={localStyles.searchCard}><TextInput value={searchQuery} onChangeText={setSearchQuery} style={localStyles.searchInput} placeholder="Search activity logs..." placeholderTextColor="#8aa2b4" /></View>
          {filteredLogs.map((log) => (
            <View key={log.id} style={localStyles.logCard}>
              <View style={localStyles.logIndicator} />
              <View style={localStyles.logContent}><Text style={localStyles.logAction}>{log.action}</Text><Text style={localStyles.logUser}>{log.user}</Text><Text style={localStyles.logTime}>{log.time}</Text></View>
            </View>
          ))}
        </ScrollView>
        </SafeAreaView>
    </LinearGradient>
  );
};

const localStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  profileButtonImage: { width: '100%', height: '100%' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  searchCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 12, marginBottom: 14 },
  searchInput: { minHeight: 44, fontSize: 14, fontWeight: '700', color: '#173f5c' },
  logCard: { backgroundColor: '#fcfeff', marginBottom: 12, borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 15, flexDirection: 'row', alignItems: 'center' },
  logIndicator: { width: 5, height: 52, backgroundColor: '#63B6C5', borderRadius: 999, marginRight: 12 },
  logContent: { flex: 1 },
  logAction: { fontSize: 15, fontWeight: '900', color: '#24566d' },
  logUser: { fontSize: 12, color: '#447C99', fontWeight: '800', marginTop: 3 },
  logTime: { fontSize: 11, color: '#7a94a6', fontWeight: '700', marginTop: 4 },
});

export default StaffLogs;
