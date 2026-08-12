import React from 'react';
import {
  Animated,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles as messageStyles } from '../../styles/PetOwnerMessagesDesign';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerQuickAssist = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const displayName =
    loggedInUser?.fullName ||
    loggedInUser?.name ||
    loggedInUser?.username ||
    'Pet Owner';
  const headerMenuAnimation = React.useRef(new Animated.Value(0)).current;
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(() =>
    new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    }).toLowerCase(),
  );

  React.useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        }).toLowerCase(),
      );
    }, 1000 * 30);

    return () => clearInterval(timerId);
  }, []);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'queue', label: 'My Queue', icon: require('../../assets/List.png'), route: 'PetOwnerQueue' },
    { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
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
                  <Text style={styles.headerSubtitle}>Quick Assist</Text>
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
              <View style={messageStyles.headerControls}>
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

                <TouchableOpacity
                  style={messageStyles.backTriggerButton}
                  onPress={() => navigation.goBack()}
                  activeOpacity={0.85}
                >
                  <Image
                    source={require('../../assets/Back_Icon.png')}
                    style={messageStyles.backTriggerIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.ownerSummary}>
                <Text style={styles.headerCaption}>AI Cruz Chatbot</Text>
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
                {headerMenuItems.map((item) => (
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
                    </View>
                    <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            ) : null}
          </LinearGradient>

          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerText}>
              Disclaimer: Quick Assist responses are AI-generated and designed to provide
              general information and guidance. Please verify important health concerns
              with a veterinarian for proper care.
            </Text>
          </View>

          <ScrollView
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.messageRow}>
              <View style={styles.messageCard}>
                <Text style={styles.messageText}>
                  Hi {displayName}, welcome to PawCruz Quick Assist! For which pet is this
                  consultation for?
                </Text>

                <TouchableOpacity style={styles.addPetButton} activeOpacity={0.9}>
                  <Text style={styles.addPetButtonText}>+ Add Pet</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.messageTime}>{currentTime}</Text>
            </View>
          </ScrollView>

          <View style={messageStyles.inputBar}>
            <View style={messageStyles.inlineInputWrap}>
              <TextInput
                editable={false}
                placeholder="Enter your inquiries here..."
                placeholderTextColor="#8aa2b4"
                style={messageStyles.inlineInput}
              />
              <Image
                source={require('../../assets/send.png')}
                style={messageStyles.inlineSendImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  headerBar: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#447C99',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },


  headerTopBand: {
    marginHorizontal: -22,
    marginTop: -18,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230, 246, 250, 0.24)',
  },  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },

  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  headerLogo: {
    width: 34,
    height: 34,
  },

  brandBlock: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#c3ddee',
  },

  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  notifButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  notifBadge: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#f47c6b',
    borderWidth: 2,
    borderColor: '#447C99',
  },

  notifIcon: {
    width: 21,
    height: 21,
    tintColor: '#ffffff',
  },

  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    overflow: 'hidden',
  },

  profileButtonImage: {
    width: '100%',
    height: '100%',
  },

  profileIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  headerBottomRow: {
    marginTop: 14,
    paddingTop: 0,
    borderTopWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  menuTriggerButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(68, 124, 153, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(222, 242, 247, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  menuTriggerIcon: {
    width: 30,
    height: 30,
    tintColor: '#ffffff',
  },

  ownerSummary: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 12,
  },

  headerCaption: {
    fontSize: 12,
    color: '#b8d4e5',
    fontWeight: '700',
    textAlign: 'right',
  },

  ownerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 4,
    textAlign: 'right',
  },

  headerMenuPanel: {
    marginTop: 14,
    width: '100%',
    padding: 14,
    borderRadius: 28,
    backgroundColor: 'rgba(68, 124, 153, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'stretch',
  },

  headerMenuItem: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  headerMenuItemIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },

  headerMenuItemIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },

  headerMenuItemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },

  disclaimerCard: {
    marginHorizontal: 18,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d5ebf8',
  },

  disclaimerText: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 21,
    color: '#587286',
    fontWeight: '600',
  },

  chatArea: {
    flex: 1,
  },

  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 26,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  messageCard: {
    flex: 1,
    maxWidth: '84%',
    backgroundColor: '#fcfeff',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: '#dceef8',
    shadowColor: '#88bddf',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },

  messageText: {
    fontSize: 17,
    lineHeight: 29,
    color: '#173f5c',
    fontWeight: '600',
  },

  addPetButton: {
    marginTop: 20,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
  },

  addPetButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
  },

  messageTime: {
    marginLeft: 10,
    marginBottom: 14,
    fontSize: 12,
    color: '#5f7f8a',
    fontWeight: '700',
  },

});

export default PetOwnerQuickAssist;
