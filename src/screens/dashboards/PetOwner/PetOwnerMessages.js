import React from 'react';
import {
  Animated,
  Image,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMessagesDesign';
import { usePetOwnerBadgeCounts, badgeLabel } from '../../shared/usePetOwnerBadgeCounts';

const getOwnerId = (user) => user?.id || user?.user_id || user?.profile_id || '';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const MESSAGE_OPTIONS = [
  {
    id: 'staff',
    title: 'Chat with Staff',
    route: 'PetOwnerStaffMessages',
    icon: require('../../assets/send.png'),
  },
  {
    id: 'vet',
    title: 'Chat with Vet',
    route: 'PetOwnerVetMessages',
    icon: require('../../assets/send.png'),
  },
  {
    id: 'assist',
    title: 'Open Quick Assist',
    route: 'PetOwnerQuickAssist',
    icon: require('../../assets/send.png'),
  },
];

const PetOwnerMessages = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const ownerId = getOwnerId(loggedInUser);
  const navBadgeCounts = usePetOwnerBadgeCounts(ownerId);
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const displayName =
    loggedInUser?.fullName ||
    loggedInUser?.name ||
    loggedInUser?.username ||
    'Pet Owner';
  const headerMenuAnimation = React.useRef(new Animated.Value(0)).current;
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = React.useState(false);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'queue', label: 'My Queue', icon: require('../../assets/List.png'), route: 'PetOwnerQueue' },
    { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
    { key: 'notifications', label: 'Notifications', icon: require('../../assets/Bell_Icon.png'), route: 'PetOwnerNotif' },
    { key: 'profile', label: 'Profile', icon: require('../../assets/Profile.png'), route: 'PetOwnerProfile' },
  ];

  const toggleHeaderMenu = () => {
    const nextVisible = !isHeaderMenuVisible;
    setIsHeaderMenuVisible(nextVisible);
    Animated.timing(headerMenuAnimation, {
      toValue: nextVisible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const handleHeaderMenuPress = (routeName) => {
    setIsHeaderMenuVisible(false);
    headerMenuAnimation.setValue(0);
    navigation.navigate(routeName, { user: loggedInUser });
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
              onPress={() => navigation.navigate('petowner-screen', { user: loggedInUser })}
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
                <Text style={styles.headerSubtitle}>Message Center</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.notifButton}
                onPress={() => navigation.navigate('PetOwnerNotif', { user: loggedInUser })}
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
                onPress={() => navigation.navigate('PetOwnerProfile', { user: loggedInUser })}
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

          <View style={styles.headerBottomRow}>
            <View style={styles.headerControls}>
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
            </View>

            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Choose Chat</Text>
              <Text style={styles.ownerName}>{displayName}</Text>
            </View>
          </View>

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
                  ],
                },
              ]}
            >
              {headerMenuItems.map((item) => {
                const badgeKey = item.key === 'appointment' ? 'appointments' : item.key === 'queue' ? 'queue' : item.key === 'messages' ? 'messages' : null;
                const badgeCount = badgeKey ? (navBadgeCounts[badgeKey] || 0) : 0;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.headerMenuItem}
                    onPress={() => handleHeaderMenuPress(item.route)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.headerMenuItemIconWrap}>
                      <Image
                        source={item.icon}
                        style={styles.headerMenuItemIcon}
                        resizeMode="contain"
                      />
                      {badgeCount > 0 ? (
                        <View style={styles.menuBadge}>
                          <Text style={styles.menuBadgeText}>{badgeLabel(badgeCount)}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.messagesHeaderCard}>
            <Text style={styles.messagesHeaderTitle}>Choose Chat Option</Text>
          </View>

          <View style={styles.optionsCard}>
            {MESSAGE_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.optionRow}
                onPress={() => navigation.navigate(item.route, { user: loggedInUser })}
                activeOpacity={0.9}
              >
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{item.title}</Text>
                </View>

                <View style={styles.optionIconWrap}>
                  <Image
                    source={item.icon}
                    style={styles.optionIcon}
                    resizeMode="contain"
                  />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMessages;
