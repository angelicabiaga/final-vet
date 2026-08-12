import React from 'react';
import { Animated, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CustomModal from '../../../components/CustomModal';
import { styles as dashboardStyles } from '../../styles/AdminDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'admin-screen' },
  { key: 'users', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
  { key: 'profile', label: 'Profile', icon: require('../../assets/Profile.png'), route: 'AdminProfile' },
];

const getAdminName = (user) => user?.fullName || user?.name || user?.username || 'Admin User';
const getAdminEmail = (user) => user?.email || 'admin@pawcruz.com';

const AdminProfile = ({ navigation, route }) => {
  const currentUser = route?.params?.user || route?.params || null;
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);
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
                <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>Admin Profile</Text></View>
              </TouchableOpacity>
              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateAdmin('AdminNotif')} activeOpacity={0.85}><View style={dashboardStyles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" /></TouchableOpacity>
                <TouchableOpacity style={dashboardStyles.profileButton} activeOpacity={0.85}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />}</TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
            <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleMenu} activeOpacity={0.85}><Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" /></TouchableOpacity>
            <View style={dashboardStyles.ownerSummary}><Text style={dashboardStyles.headerCaption}>Account Settings</Text><Text style={dashboardStyles.ownerName}>{getAdminName(currentUser)}</Text></View>
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
          <View style={localStyles.profileCard}>
            <View style={localStyles.avatarLargeWrap}>{profileImageUri ? <Image source={{ uri: profileImageUri }} style={localStyles.avatarLargeImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={localStyles.avatarLargeIcon} resizeMode="contain" />}</View>
            <Text style={localStyles.profileName}>{getAdminName(currentUser)}</Text>
            <Text style={localStyles.profileRole}>System Administrator</Text>
            <Text style={localStyles.profileLocation}>Taguig, Metro Manila</Text>
          </View>

          <View style={localStyles.detailCard}>
            <Text style={localStyles.cardTitle}>Account Details</Text>
            <View style={localStyles.detailRow}><Text style={localStyles.detailLabel}>Email</Text><Text style={localStyles.detailValue}>{getAdminEmail(currentUser)}</Text></View>
            <View style={localStyles.detailRow}><Text style={localStyles.detailLabel}>Contact</Text><Text style={localStyles.detailValue}>{currentUser?.contactNumber || currentUser?.contact || '+63 912 345 6789'}</Text></View>
            <View style={localStyles.detailRow}><Text style={localStyles.detailLabel}>Access Level</Text><Text style={localStyles.detailValue}>Full Super Admin</Text></View>
            <View style={localStyles.actionRow}>
              <TouchableOpacity style={localStyles.secondaryButton} activeOpacity={0.9}><Text style={localStyles.secondaryButtonText}>Edit Profile</Text></TouchableOpacity>
              <TouchableOpacity style={localStyles.primaryButton} onPress={() => setShowLogoutModal(true)} activeOpacity={0.9}><Text style={localStyles.primaryButtonText}>Logout</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <CustomModal
          show={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          extraAction={
            <View style={localStyles.modalActions}>
              <TouchableOpacity style={localStyles.modalPrimaryButton} onPress={() => { setShowLogoutModal(false); navigation.replace('login'); }} activeOpacity={0.9}><Text style={localStyles.modalPrimaryText}>Logout</Text></TouchableOpacity>
              <TouchableOpacity style={localStyles.modalSecondaryButton} onPress={() => setShowLogoutModal(false)} activeOpacity={0.9}><Text style={localStyles.modalSecondaryText}>Cancel</Text></TouchableOpacity>
            </View>
          }
        >
          Are you sure you want to logout?
        </CustomModal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const localStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  profileCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center', marginBottom: 14 },
  avatarLargeWrap: { width: 94, height: 94, borderRadius: 34, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14 },
  avatarLargeImage: { width: '100%', height: '100%' },
  avatarLargeIcon: { width: 42, height: 42, tintColor: '#24566d' },
  profileName: { fontSize: 22, fontWeight: '900', color: '#24566d', textAlign: 'center' },
  profileRole: { marginTop: 5, fontSize: 12, fontWeight: '900', color: '#447C99', textTransform: 'uppercase' },
  profileLocation: { marginTop: 4, fontSize: 13, fontWeight: '600', color: '#5d7b91' },
  detailCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: '#24566d', marginBottom: 12 },
  detailRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#edf4f8' },
  detailLabel: { fontSize: 11, fontWeight: '900', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 5 },
  detailValue: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: '#24566d' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  secondaryButton: { width: '48%', minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: '#c8dce9', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 13, fontWeight: '900', color: '#24566d' },
  primaryButton: { width: '48%', minHeight: 48, borderRadius: 16, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  modalPrimaryButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  modalPrimaryText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  modalSecondaryButton: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: '#edf4f8', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  modalSecondaryText: { fontSize: 13, fontWeight: '900', color: '#24566d' },
});

export default AdminProfile;
