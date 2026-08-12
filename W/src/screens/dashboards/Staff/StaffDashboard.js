import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/StaffDashboardDesign';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const quickAccessItems = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: require('../../assets/Dashboard_Icon.png'),
    route: 'staff-screen',
  },
  {
    key: 'appointment',
    label: 'Appointment',
    icon: require('../../assets/Appointment_Icon.png'),
    route: 'StaffAppointment',
  },
  {
    key: 'mypets',
    label: 'Pets Profile',
    icon: require('../../assets/Pets_Icon.png'),
    route: 'StaffPetsProfile',
  },
  {
    key: 'messages',
    label: 'Messages',
    icon: require('../../assets/Message_Icon.png'),
    route: 'StaffMessages',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: require('../../assets/Inventory_Icon.png'),
    route: 'StaffInventory',
  },
  {
    key: 'user-management',
    label: 'User Management',
    icon: require('../../assets/UserManagement_Icon.png'),
    route: 'StaffUserManagement',
  },
  {
    key: 'payment-history',
    label: 'Payment History',
    icon: require('../../assets/payment_icon.png'),
    route: 'StaffPayHis',
  },
  {
    key: 'activity-logs',
    label: 'Activity Logs',
    icon: require('../../assets/Log_Icon.png'),
    route: 'StaffActivityLogs',
  },
];

const heroSlides = [
  {
    key: 'front-desk',
    label: 'Front desk',
    title: 'Keep appointments, owners, and pet records moving smoothly.',
    description: 'Review daily bookings, prepare pet profiles, and help the clinic team stay ready for each visit.',
  },
  {
    key: 'clinic-ops',
    label: 'Clinic operations',
    title: 'Track inventory, payments, and staff activity from one dashboard.',
    description: 'Open the tools you need for stock checks, account support, payments, messages, and activity logs.',
  },
];

const activityTracks = [
  {
    key: 'appointments',
    label: 'Appointments',
    value: '12',
    detail: 'Booked today',
    accent: styles.activityTrackAccentBlue,
    route: 'StaffAppointment',
  },
  {
    key: 'pet-owners',
    label: 'Pet Owners',
    value: '18',
    detail: 'Assisted today',
    accent: styles.activityTrackAccentGreen,
    route: 'StaffUserManagement',
  },
  {
    key: 'inventory',
    label: 'Inventory Alerts',
    value: '4',
    detail: 'Low stock items',
    accent: styles.activityTrackAccentGold,
    route: 'StaffInventory',
  },
  {
    key: 'payments',
    label: 'Payments',
    value: 'P7k',
    detail: 'Processed today',
    accent: styles.activityTrackAccentTeal,
    route: 'StaffPayHis',
  },
];

const staffServices = [
  {
    key: 'appointment',
    label: ['Manage', 'Appointments'],
    icon: require('../../assets/Appointment_Icon.png'),
    route: 'StaffAppointment',
  },
  {
    key: 'pets',
    label: ['Pets', 'Profile'],
    icon: require('../../assets/Pets_Icon.png'),
    route: 'StaffPetsProfile',
  },
  {
    key: 'messages',
    label: ['Messages'],
    icon: require('../../assets/Message_Icon.png'),
    route: 'StaffMessages',
  },
  {
    key: 'inventory',
    label: ['Track', 'Inventory'],
    icon: require('../../assets/Inventory_Icon.png'),
    route: 'StaffInventory',
  },
  {
    key: 'user-management',
    label: ['User', 'Management'],
    icon: require('../../assets/UserManagement_Icon.png'),
    route: 'StaffUserManagement',
  },
  {
    key: 'payments',
    label: ['Payment', 'History'],
    icon: require('../../assets/payment_icon.png'),
    route: 'StaffPayHis',
  },
  {
    key: 'logs',
    label: ['Activity', 'Logs'],
    icon: require('../../assets/Log_Icon.png'),
    route: 'StaffActivityLogs',
  },
];

const StaffDashboard = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const currentUser = loggedInUser || {};
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Staff';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const scrollViewRef = useRef(null);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHeroSlide((current) => (current + 1) % heroSlides.length);
    }, 2400);

    return () => clearInterval(interval);
  }, []);

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

  const navigateWithUser = (screenName) => {
    navigation.navigate(screenName, { user: currentUser });
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

  return (
    <LinearGradient
      colors={['#f7fbfc', '#eef7f8', '#ffffff']}
      style={styles.background}
    >
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#63B6C5', '#63B6C5', '#63B6C5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBar}
        >
          <LinearGradient
            colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerTopBand}
          >
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                style={styles.brandSection}
                onPress={() => navigateWithUser('staff-screen')}
                activeOpacity={0.85}
              >
                <View style={styles.logoWrap}>
                  <Image
                    source={require('../../assets/paw1.png')}
                    style={styles.headerLogo}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.brandBlock}>
                  <Text style={styles.headerTitle}>PawCruz</Text>
                  <Text style={styles.headerSubtitle}>Staff Dashboard</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.notifButton}
                  onPress={() => navigateWithUser('StaffNotif')}
                  activeOpacity={0.85}
                >
                  <View style={styles.notifBadge} />
                  <Image
                    source={require('../../assets/Bell_Icon.png')}
                    style={styles.notifIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.profileButton}
                  onPress={() => navigateWithUser('StaffProfile')}
                  activeOpacity={0.85}
                >
                  {profileImageUri ? (
                    <Image
                      source={{ uri: profileImageUri }}
                      style={styles.profileButtonImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Image
                      source={DEFAULT_PROFILE_IMAGE}
                      style={styles.profileIcon}
                      resizeMode="contain"
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <Animated.View
            style={[
              styles.headerBottomRowWrap,
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
            <View style={styles.headerBottomRow}>
              <TouchableOpacity
                style={styles.menuTriggerButton}
                onPress={toggleHeaderMenu}
                activeOpacity={0.85}
              >
                <Image
                  source={require('../../assets/List.png')}
                  style={styles.menuTriggerIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              <View style={styles.ownerSummary}>
                <Text style={styles.headerCaption}>Welcome</Text>
                <Text style={styles.ownerName}>{headerDisplayName}</Text>
              </View>
            </View>
          </Animated.View>

          {isHeaderMenuVisible ? (
            <Animated.View
              style={[
                styles.headerMenuPanel,
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
              {quickAccessItems.map((item, index) => {
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
                        styles.headerMenuItem,
                        index === quickAccessItems.length - 1 && styles.headerMenuItemLast,
                      ]}
                      onPress={() => handleHeaderMenuPress(item.route)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.headerMenuItemIconWrap}>
                        <Image
                          source={item.icon}
                          style={styles.headerMenuItemIcon}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <LinearGradient
            colors={['#63B6C5', '#63B6C5', '#63B6C5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeCard}
          >
            <View style={styles.heroSlideCard}>
              <Image
                source={require('../../assets/dashboard.jpg')}
                style={styles.heroSlideBackground}
                resizeMode="cover"
              />
              <View style={styles.heroSlideOverlay} />
              <View style={styles.heroSlideContent}>
                <View style={styles.heroSlideTopRow}>
                  <Text style={styles.heroSlideLabel}>{heroSlides[activeHeroSlide].label}</Text>
                  <View style={styles.heroDotsRow}>
                    {heroSlides.map((slide, index) => (
                      <View
                        key={slide.key}
                        style={[
                          styles.heroDot,
                          index === activeHeroSlide && styles.heroDotActive,
                        ]}
                      />
                    ))}
                  </View>
                </View>

                <Text style={styles.heroQuoteMark}>"</Text>
                <Text style={styles.heroSlideTitle}>{heroSlides[activeHeroSlide].title}</Text>
                <Text style={styles.welcomeDesc}>{heroSlides[activeHeroSlide].description}</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Track Activities</Text>
            <Text style={styles.sectionSubtitle}>Appointments, owners, inventory, and payments at a glance.</Text>
          </View>

          <View style={styles.activityPanel}>
            <View style={styles.activityStatsGrid}>
              {activityTracks.map((track) => (
                <TouchableOpacity
                  key={track.key}
                  style={styles.activityStatCard}
                  onPress={() => navigateWithUser(track.route)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.activityStatAccent, track.accent]} />
                  <Text style={styles.activityStatLabel}>{track.label}</Text>
                  <Text style={styles.activityStatValue}>{track.value}</Text>
                  <Text style={styles.activityStatDetail}>{track.detail}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.activityTrackNote}>
              Use this box as your front desk snapshot before opening appointments, inventory, payments, or user records.
            </Text>
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Services</Text>
            <Text style={styles.sectionSubtitle}>Quick access to staff tools and tasks</Text>
          </View>

          <View style={styles.menuGrid}>
            {staffServices.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuCard}
                onPress={() => navigateWithUser(item.route)}
                activeOpacity={0.9}
              >
                <View style={styles.iconCircle}>
                  <Image
                    source={item.icon}
                    style={styles.iconImage}
                    resizeMode="contain"
                  />
                </View>
                {item.label.map((line) => (
                  <Text key={line} style={styles.menuLabel}>
                    {line}
                  </Text>
                ))}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        </SafeAreaView>
    </LinearGradient>
  );
};

export default StaffDashboard;
