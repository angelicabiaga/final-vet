import React from 'react';
import { Animated, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as dashboardStyles } from '../../styles/AdminDashboardDesign';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const HEADER_MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'admin-screen' },
  { key: 'users', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'create', label: 'Create Account', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminCreateAccount' },
  { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
  { key: 'notifications', label: 'Notifications', icon: require('../../assets/Bell_Icon.png'), route: 'AdminNotif' },
];

const HERO_SLIDES = [
  {
    key: 'users',
    eyebrow: 'Admin Control',
    title: 'Manage clinic accounts',
    body: 'Review active users, create accounts, and keep roles organized across the clinic team.',
    route: 'AdminUserManagement',
    action: 'Open Users',
  },
  ];

const SERVICE_CARDS = [
  { key: 'users', title: 'User Management', subtitle: 'View and filter accounts', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminUserManagement' },
  { key: 'create', title: 'Create Account', subtitle: 'Add new clinic users', icon: require('../../assets/UserManagement_Icon.png'), route: 'AdminCreateAccount' },
  { key: 'messages', title: 'Messages', subtitle: 'Review conversations', icon: require('../../assets/Message_Icon.png'), route: 'AdminMessages' },
  { key: 'notif', title: 'Notifications', subtitle: 'Check admin alerts', icon: require('../../assets/Bell_Icon.png'), route: 'AdminNotif' },
];

const getAdminName = (user) => user?.username || user?.fullName || user?.name || (user?.email ? String(user.email).split('@')[0] : 'Admin');

const AdminDashboard = ({ navigation, route }) => {
  const currentUser = route?.params?.user || route?.params || null;
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const menuAnim = React.useRef(new Animated.Value(0)).current;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();

  const navigateAdmin = (screen) => {
    navigation.navigate(screen, currentUser ? { user: currentUser } : undefined);
  };

  const toggleMenu = () => {
    const nextOpen = !menuOpen;
    setMenuOpen(nextOpen);
    Animated.timing(menuAnim, {
      toValue: nextOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

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
              <TouchableOpacity style={dashboardStyles.brandSection} onPress={() => navigateAdmin('admin-screen')} activeOpacity={0.85}>
                <View style={dashboardStyles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={dashboardStyles.headerLogo} resizeMode="contain" />
                </View>
                <View style={dashboardStyles.brandBlock}>
                  <Text style={dashboardStyles.headerTitle}>PawCruz</Text>
                  <Text style={dashboardStyles.headerSubtitle}>Admin Dashboard</Text>
                </View>
              </TouchableOpacity>

              <View style={dashboardStyles.headerActions}>
                <TouchableOpacity style={dashboardStyles.notifButton} onPress={() => navigateAdmin('AdminNotif')} activeOpacity={0.85}>
                  <View style={dashboardStyles.notifBadge} />
                  <Image source={require('../../assets/Bell_Icon.png')} style={dashboardStyles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={dashboardStyles.profileButton} onPress={() => navigateAdmin('AdminProfile')} activeOpacity={0.85}>
                  {profileImageUri ? (
                    <Image source={{ uri: profileImageUri }} style={dashboardStyles.profileButtonImage} resizeMode="cover" />
                  ) : (
                    <Image source={DEFAULT_PROFILE_IMAGE} style={dashboardStyles.profileIcon} resizeMode="contain" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <Animated.View style={[dashboardStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={dashboardStyles.headerBottomRow}>
            <TouchableOpacity style={dashboardStyles.menuTriggerButton} onPress={toggleMenu} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={dashboardStyles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={dashboardStyles.ownerSummary}>
              <Text style={dashboardStyles.headerCaption}>System Administration</Text>
              <Text style={dashboardStyles.ownerName}>{getAdminName(currentUser)}</Text>
            </View>
          </View>
          </Animated.View>

          {menuOpen ? (
            <Animated.View
              style={[
                dashboardStyles.headerMenuPanel,
                {
                  opacity: menuAnim,
                  transform: [{ translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
                },
              ]}
            >
              {HEADER_MENU_ITEMS.map((item, index) => (
                <TouchableOpacity
                  key={item.key}
                  style={[dashboardStyles.headerMenuItem, index === HEADER_MENU_ITEMS.length - 1 && dashboardStyles.headerMenuItemLast]}
                  onPress={() => {
                    setMenuOpen(false);
                    menuAnim.setValue(0);
                    navigateAdmin(item.route);
                  }}
                  activeOpacity={0.88}
                >
                  <View style={dashboardStyles.headerMenuItemIconWrap}>
                    <Image source={item.icon} style={dashboardStyles.headerMenuItemIcon} resizeMode="contain" />
                  </View>
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
          <LinearGradient
            colors={['#63B6C5', '#63B6C5', '#63B6C5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={dashboardStyles.welcomeCard}
          >
            <View style={dashboardStyles.heroSlideCard}>
              <Image
                source={require('../../assets/dashboard.jpg')}
                style={dashboardStyles.heroSlideBackground}
                resizeMode="cover"
              />
              <View style={dashboardStyles.heroSlideOverlay} />
              <View style={dashboardStyles.heroSlideContent}>
                <View style={dashboardStyles.heroSlideTopRow}>
                  <Text style={dashboardStyles.heroSlideLabel}>{HERO_SLIDES[activeSlide].eyebrow}</Text>
                  <View style={dashboardStyles.heroDotsRow}>
                    {HERO_SLIDES.map((slide, index) => (
                      <TouchableOpacity
                        key={slide.key}
                        style={[dashboardStyles.heroDot, activeSlide === index && dashboardStyles.heroDotActive]}
                        onPress={() => setActiveSlide(index)}
                        activeOpacity={0.85}
                      />
                    ))}
                  </View>
                </View>

                <Text style={dashboardStyles.heroQuoteMark}>"</Text>
                <Text style={dashboardStyles.heroSlideTitle}>{HERO_SLIDES[activeSlide].title}</Text>
                <Text style={dashboardStyles.welcomeDesc}>{HERO_SLIDES[activeSlide].body}</Text>
                <TouchableOpacity style={localStyles.heroImageButton} onPress={() => navigateAdmin(HERO_SLIDES[activeSlide].route)} activeOpacity={0.9}>
                  <Text style={localStyles.heroImageButtonText}>{HERO_SLIDES[activeSlide].action}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={dashboardStyles.sectionHeaderWrap}>
            <Text style={dashboardStyles.sectionTitle}>Admin Services</Text>
            <Text style={dashboardStyles.sectionSubtitle}>Core tools for managing PawCruz users, communication, and account access.</Text>
          </View>

          <View style={localStyles.serviceGrid}>
            {SERVICE_CARDS.map((item) => (
              <TouchableOpacity key={item.key} style={localStyles.serviceCard} onPress={() => navigateAdmin(item.route)} activeOpacity={0.9}>
                <View style={localStyles.serviceIconWrap}>
                  <Image source={item.icon} style={localStyles.serviceIcon} resizeMode="contain" />
                </View>
                <Text style={localStyles.serviceTitle}>{item.title}</Text>
                <Text style={localStyles.serviceSubtitle}>{item.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        </SafeAreaView>
    </LinearGradient>
  );
};

const localStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  heroImageButton: { alignSelf: 'flex-start', minHeight: 42, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', justifyContent: 'center', paddingHorizontal: 16, marginTop: 16 },
  heroImageButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  serviceCard: { width: '48%', backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12, minHeight: 150 },
  serviceIconWrap: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  serviceIcon: { width: 24, height: 24, tintColor: '#24566d' },
  serviceTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900', color: '#24566d' },
  serviceSubtitle: { marginTop: 5, fontSize: 12, lineHeight: 17, fontWeight: '600', color: '#5d7b91' },
});

export default AdminDashboard;
