import React from 'react';
import { Animated, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/AdminDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'admin-screen' },
  { key: 'users', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
  { key: 'notifications', label: 'Notifications', icon: require('../../assets/Bell_Icon.png'), route: 'AdminNotif' },
];

const NOTIFICATIONS = [
  { id: '1', title: 'New User Registered', description: 'A staff account was added and is ready for review.', time: '2 mins ago', unread: true },
  { id: '2', title: 'System Update', description: 'Server maintenance completed successfully.', time: '5 hours ago', unread: false },
  { id: '3', title: 'Account Status Changed', description: 'One pet owner account was marked active.', time: 'Yesterday', unread: false },
];

const getAdminName = (user) => user?.username || user?.fullName || user?.name || (user?.email ? String(user.email).split('@')[0] : 'Admin');

const AdminNotif = ({ navigation, route }) => {
  const currentUser = route?.params?.user || route?.params || null;
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();

  const navigateAdmin = (screen) => navigation.navigate(screen, currentUser ? { user: currentUser } : undefined);
  const toggleMenu = () => {
    const nextOpen = !menuOpen;
    setMenuOpen(nextOpen);
    Animated.timing(menuAnim, { toValue: nextOpen ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={localStyles.background}>
      <SafeAreaView style={localStyles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerTopBand}>
            <View style={dashboardStyles.headerTopRow}>
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateAdmin('admin-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}><Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" /></View>
                <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>Notifications</Text></View>
              </TouchableOpacity>
              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.notifButton} activeOpacity={0.85}><View style={dashboardStyles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" /></TouchableOpacity>
                <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateAdmin('AdminProfile')} activeOpacity={0.85}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}</TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
            <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleMenu} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
            <View style={dashboardStyles.ownerSummary}><Text style={dashboardStyles.headerCaption}>Admin Alerts</Text><Text style={dashboardStyles.ownerName}>{getAdminName(currentUser)}</Text></View>
            </View>
          </Animated.View>
          {menuOpen ? <Animated.View style={[dashboardStyles.headerMenuPanel, { opacity: menuAnim, transform: [{ translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>{HEADER_MENU_ITEMS.map((item, index) => <TouchableOpacity key={item.key} style={[dashboardStyles.headerMenuItem, index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast]} onPress={() => { setMenuOpen(false); menuAnim.setValue(0); navigateAdmin(item.route); }} activeOpacity={0.88}><View style={dashboardStyles.headerMenuItemIconWrap}><Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" /></View><Text style={dashboardStyles.headerMenuItemLabel}>{item.label}</Text></TouchableOpacity>)}</Animated.View> : null}
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={localStyles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <View style={dashboardStyles.sectionHeaderWrap}>
            <Text style={dashboardStyles.sectionTitle}>Notifications</Text>
            <Text style={dashboardStyles.sectionSubtitle}>Review account, system, and clinic operations alerts.</Text>
          </View>

          {NOTIFICATIONS.map((item) => (
            <View key={item.id} style={[localStyles.notifCard, item.unread && localStyles.notifCardUnread]}>
              <View style={localStyles.notifIconWrap}><Image source={require('../../assets/Bell_Icon.png')} style={localStyles.notifIcon} resizeMode="contain" /></View>
              <View style={localStyles.notifTextWrap}>
                <View style={localStyles.notifTopRow}><Text style={localStyles.notifTitle}>{item.title}</Text><Text style={localStyles.notifTime}>{item.time}</Text></View>
                <Text style={localStyles.notifDescription}>{item.description}</Text>
              </View>
              {item.unread ? <View style={localStyles.unreadDot} /> : null}
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
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  notifCard: { flexDirection: 'row', backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12, position: 'relative' },
  notifCardUnread: { borderColor: '#9bd4e0', backgroundColor: '#f4fbfd' },
  notifIconWrap: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  notifIcon: { width: 22, height: 22, tintColor: '#447C99' },
  notifTextWrap: { flex: 1 },
  notifTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  notifTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '900', color: '#24566d', marginRight: 10 },
  notifTime: { fontSize: 11, fontWeight: '800', color: '#7a94a6' },
  notifDescription: { marginTop: 6, fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#5d7b91' },
  unreadDot: { position: 'absolute', top: 13, right: 13, width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#f47c6b' },
});

export default AdminNotif;
