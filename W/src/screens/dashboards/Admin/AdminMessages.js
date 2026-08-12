import React from 'react';
import { Animated, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/AdminDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'admin-screen' },
  { key: 'users', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'create', label: 'Create Account', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminCreateAccount' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
];

const MESSAGES = [
  { id: '1', name: 'Angela Cruz', role: 'Staff', lastMsg: 'Inventory report is ready for review.', time: '10:42 AM' },
  { id: '2', name: 'Dr. Sarah Dela Cruz', role: 'Veterinarian', lastMsg: 'Please confirm the new account access.', time: '9:18 AM' },
  { id: '3', name: 'Karen Lopez', role: 'Admin', lastMsg: 'User status updates were completed.', time: 'Yesterday' },
];

const getAdminName = (user) => user?.username || user?.fullName || user?.name || (user?.email ? String(user.email).split('@')[0] : 'Admin');

const AdminMessages = ({ navigation, route }) => {
  const currentUser = route?.params?.user || route?.params || null;
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();

  const navigateAdmin = (screen) => navigation.navigate(screen, currentUser ? { user: currentUser } : undefined);
  const toggleMenu = () => {
    const nextOpen = !menuOpen;
    setMenuOpen(nextOpen);
    Animated.timing(menuAnim, { toValue: nextOpen ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  };

  const filteredMessages = MESSAGES.filter((item) => {
    const query = search.trim().toLowerCase();
    return !query || [item.name, item.role, item.lastMsg].some((value) => value.toLowerCase().includes(query));
  });

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={localStyles.background}>
      <SafeAreaView style={localStyles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={dashboardStyles.headerTopBand}>
            <View style={dashboardStyles.headerTopRow}>
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateAdmin('admin-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}><Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" /></View>
                <View style={dashboardStyles.brandBlock}><Text style={dashboardStyles.headerTitle}>PawCruz</Text><Text style={dashboardStyles.headerSubtitle}>Admin Messages</Text></View>
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
            <View style={dashboardStyles.ownerSummary}><Text style={dashboardStyles.headerCaption}>Communication Center</Text><Text style={dashboardStyles.ownerName}>{getAdminName(currentUser)}</Text></View>
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
            <Text style={dashboardStyles.sectionTitle}>Messages</Text>
            <Text style={dashboardStyles.sectionSubtitle}>Monitor admin conversations and clinic coordination updates.</Text>
          </View>
          <View style={localStyles.searchCard}>
            <Image source={require('../../assets/Search.png')} style={localStyles.searchIcon} resizeMode="contain" />
            <TextInput placeholder="Search messages" placeholderTextColor="#8aa2b4" style={localStyles.searchInput} value={search} onChangeText={setSearch} />
          </View>
          {filteredMessages.map((item) => (
            <TouchableOpacity key={item.id} style={localStyles.messageCard} activeOpacity={0.9}>
              <View style={localStyles.avatarWrap}><Image source={DEFAULT_PROFILE_IMAGE} style={localStyles.avatarIcon} resizeMode="contain" /></View>
              <View style={localStyles.messageTextWrap}>
                <View style={localStyles.messageTopRow}><Text style={localStyles.messageName}>{item.name}</Text><Text style={localStyles.messageTime}>{item.time}</Text></View>
                <Text style={localStyles.messageRole}>{item.role}</Text>
                <Text style={localStyles.messagePreview} numberOfLines={2}>{item.lastMsg}</Text>
              </View>
            </TouchableOpacity>
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
  searchCard: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#fcfeff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  searchIcon: { width: 18, height: 18, tintColor: '#447C99', marginRight: 10 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '700', color: '#24566d' },
  messageCard: { flexDirection: 'row', backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12 },
  avatarWrap: { width: 52, height: 52, borderRadius: 20, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarIcon: { width: 24, height: 24, tintColor: '#24566d' },
  messageTextWrap: { flex: 1 },
  messageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  messageName: { flex: 1, fontSize: 15, fontWeight: '900', color: '#24566d', marginRight: 10 },
  messageTime: { fontSize: 11, fontWeight: '800', color: '#7a94a6' },
  messageRole: { marginTop: 3, fontSize: 11, fontWeight: '900', color: '#447C99' },
  messagePreview: { marginTop: 6, fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#5d7b91' },
});

export default AdminMessages;
