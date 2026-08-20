import React from 'react';
import {
  Animated,
  Image,
  Keyboard,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { styles } from '../../styles/StaffMessagesDesign';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const SIDE_ICON = require('../../assets/send.png');

const MESSAGE_OPTIONS = [
  {
    id: 'pet-owner',
    title: 'Chat with Pet Owner',
  },
  {
    id: 'veterinarian',
    title: 'Chat with Veterinarian',
  },
  {
    id: 'admin',
    title: 'Chat with Admin',
  },
  ];

const CHAT_DIRECTORY = {
  'pet-owner': {
    caption: 'Chat with Pet Owner',
    chooserTitle: 'Choose Pet Owner',
    searchPlaceholder: 'Search pet owner',
    emptyLabel: 'pet owner',
    quickActions: [
      'Confirm appointment concern',
      'Send booking reminder',
      'Check follow-up request',
    ],
    recipients: [
      {
        id: 'owner-1',
        title: 'Aldwin Almadrones',
        subtitle: 'Max - Follow-up Check-up',
      },
      {
        id: 'owner-2',
        title: 'Maria Santos',
        subtitle: 'Buddy - Vaccination Inquiry',
      },
      {
        id: 'owner-3',
        title: 'Rose Cruz',
        subtitle: 'Luna - Reschedule Request',
      },
    ],
  },
  veterinarian: {
    caption: 'Chat with Veterinarian',
    chooserTitle: 'Choose Veterinarian',
    searchPlaceholder: 'Search veterinarian',
    emptyLabel: 'veterinarian',
    quickActions: [
      'Discuss patient follow-up',
      'Confirm treatment notes',
      'Send lab result update',
    ],
    recipients: [
      {
        id: 'vet-1',
        title: 'Dr. Sarah Dela Cruz',
        subtitle: 'Follow-up Care',
      },
      {
        id: 'vet-2',
        title: 'Dr. Michael Cruz',
        subtitle: 'Nutrition Advice',
      },
      {
        id: 'vet-3',
        title: 'Dr. Santos',
        subtitle: 'Appointment Review',
      },
    ],
  },
  admin: {
    caption: 'Chat with Admin',
    chooserTitle: 'Choose Admin',
    searchPlaceholder: 'Search admin',
    emptyLabel: 'admin',
    quickActions: [
      'Request schedule approval',
      'Check billing concern',
      'Review clinic report',
    ],
    recipients: [
      {
        id: 'admin-1',
        title: 'Admin Karen Lopez',
        subtitle: 'Operations Supervisor',
      },
      {
        id: 'admin-2',
        title: 'Admin Miguel Cruz',
        subtitle: 'Billing and Reports',
      },
      {
        id: 'admin-3',
        title: 'Admin Julia Reyes',
        subtitle: 'Staff Coordination',
      },
    ],
  },
};

const formatCurrentTime = (date) =>
  date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  }).toLowerCase();

const StaffMessages = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const currentUser = loggedInUser || {};
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const displayName =
    loggedInUser?.fullName ||
    loggedInUser?.name ||
    loggedInUser?.username ||
    'Staff';
  const headerMenuAnimation = React.useRef(new Animated.Value(0)).current;
  const { lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = React.useState(false);
  const [activeChatType, setActiveChatType] = React.useState(null);
  const [selectedRecipient, setSelectedRecipient] = React.useState(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(formatCurrentTime(new Date()));

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(formatCurrentTime(new Date()));
    }, 1000 * 30);

    return () => clearInterval(intervalId);
  }, []);

  const activeChatConfig = activeChatType ? CHAT_DIRECTORY[activeChatType] : null;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRecipients = activeChatConfig
    ? activeChatConfig.recipients.filter((item) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.subtitle.toLowerCase().includes(normalizedQuery)
        );
      })
    : [];
  const suggestionOptions = normalizedQuery ? filteredRecipients.slice(0, 6) : [];
  const showSuggestions = isSearchFocused && suggestionOptions.length > 0;

  const headerMenuItems = [
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
    navigation.navigate(routeName, { user: currentUser });
  };

  const resetChatPickerState = () => {
    setActiveChatType(null);
    setSelectedRecipient(null);
    setSearchQuery('');
    setIsSearchFocused(false);
    Keyboard.dismiss();
  };

  const handleBackPress = () => {
    if (selectedRecipient) {
      setSelectedRecipient(null);
      setSearchQuery('');
      setIsSearchFocused(false);
      Keyboard.dismiss();
      return;
    }

    if (activeChatType) {
      resetChatPickerState();
      return;
    }

    navigation.goBack();
  };

  const handleOptionPress = (item) => {
    if (item.route) {
      navigation.navigate(item.route, { user: currentUser });
      return;
    }

    setActiveChatType(item.id);
    setSelectedRecipient(null);
    setSearchQuery('');
    setIsSearchFocused(false);
    Keyboard.dismiss();
  };

  const handleSelectRecipient = (item) => {
    setSelectedRecipient(item);
    setSearchQuery(item.title);
    setIsSearchFocused(false);
    Keyboard.dismiss();
  };

  const handleSearchSubmit = () => {
    if (!normalizedQuery || !filteredRecipients.length) {
      return;
    }

    handleSelectRecipient(filteredRecipients[0]);
  };

  const renderChatOptions = () => (
    <ScrollView
      style={styles.chatArea}
      contentContainerStyle={styles.chatContent}
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.messagesHeaderCard}>
        <Text style={styles.messagesHeaderTitle}>Choose Chat Option</Text>
      </View>

      <View style={styles.optionsCard}>
        {MESSAGE_OPTIONS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.optionRow, localStyles.optionRow]}
            onPress={() => handleOptionPress(item)}
            activeOpacity={0.9}
          >
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>{item.title}</Text>
            </View>

            <View style={[styles.optionIconWrap, localStyles.optionRightIconWrap]}>
              <Image
                source={SIDE_ICON}
                style={localStyles.optionRightIcon}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderRecipientPicker = () => (
    <ScrollView
      style={styles.chatArea}
      contentContainerStyle={styles.chatContent}
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <View style={styles.messagesHeaderCard}>
        <Text style={styles.messagesHeaderTitle}>{activeChatConfig.chooserTitle}</Text>
      </View>

      <View style={styles.searchCard}>
        <View style={styles.searchInputWrap}>
          <TextInput
            placeholder={activeChatConfig.searchPlaceholder}
            placeholderTextColor="#6e8a9d"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 120)}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.searchIconButton}
            onPress={handleSearchSubmit}
            activeOpacity={0.85}
          >
            <Image
              source={require('../../assets/Search.png')}
              style={styles.searchIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {showSuggestions ? (
          <View style={styles.searchDropdown}>
            {suggestionOptions.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.searchDropdownItem}
                onPress={() => handleSelectRecipient(item)}
                activeOpacity={0.88}
              >
                <View style={styles.searchDropdownTextWrap}>
                  <Text style={styles.searchDropdownTitle}>{item.title}</Text>
                  <Text style={styles.searchDropdownSubtitle}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.optionsCard}>
        {filteredRecipients.length ? (
          filteredRecipients.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.optionRow, localStyles.optionRow]}
              onPress={() => handleSelectRecipient(item)}
              activeOpacity={0.9}
            >
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{item.title}</Text>
                <Text style={styles.optionSubtitle}>{item.subtitle}</Text>
              </View>

              <View style={[styles.optionIconWrap, localStyles.optionRightIconWrap]}>
                <Image
                  source={SIDE_ICON}
                  style={localStyles.optionRightIcon}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.inboxOnlyHintText}>
            No {activeChatConfig.emptyLabel} found for "{searchQuery.trim()}".
          </Text>
        )}
      </View>
    </ScrollView>
  );

  const renderSelectedRecipientChat = () => (
    <>
      <ScrollView
        style={styles.chatArea}
        contentContainerStyle={[styles.chatContent, localStyles.selectedChatContent]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.quickAssistMessageRow}>
          <View style={styles.quickAssistMessageCard}>
            <Text style={styles.quickAssistMessageText}>
              Quick chat with {selectedRecipient.title}
            </Text>

            {activeChatConfig.quickActions.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.quickAssistActionButton}
                activeOpacity={0.9}
              >
                <Text style={styles.quickAssistActionButtonText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.quickAssistMessageTime}>{currentTime}</Text>
        </View>
      </ScrollView>

      <View style={styles.inputBar}>
        <View style={styles.inlineInputWrap}>
          <TextInput
            editable={false}
            placeholder={`Message ${selectedRecipient.title}...`}
            placeholderTextColor="#8aa2b4"
            style={styles.inlineInput}
          />
          <Image
            source={require('../../assets/send.png')}
            style={styles.inlineSendImage}
            resizeMode="contain"
          />
        </View>
      </View>
    </>
  );

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
              onPress={() => navigation.navigate('staff-screen', { user: currentUser })}
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
                onPress={() => navigation.navigate('StaffNotif', { user: currentUser })}
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
                onPress={() => navigation.navigate('StaffProfile', { user: currentUser })}
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

          <Animated.View style={[styles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
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

              {activeChatConfig ? (
                <TouchableOpacity
                  style={styles.backTriggerButton}
                  onPress={handleBackPress}
                  activeOpacity={0.85}
                >
                  <Image
                    source={require('../../assets/Back_Icon.png')}
                    style={styles.backTriggerIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>
                {activeChatConfig ? activeChatConfig.caption : 'Choose Chat'}
              </Text>
              <Text style={styles.ownerName}>{displayName}</Text>
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

        {!activeChatConfig
          ? renderChatOptions()
          : selectedRecipient
            ? renderSelectedRecipientChat()
            : renderRecipientPicker()}
      </SafeAreaView>
    </LinearGradient>
  );
};

const localStyles = StyleSheet.create({
  optionRow: {
    paddingHorizontal: 14,
  },

  optionRightIconWrap: {
    marginRight: 0,
    marginLeft: 12,
  },

  optionRightIcon: {
    width: 20,
    height: 20,
    tintColor: '#24566d',
  },

  selectedChatContent: {
    justifyContent: 'flex-end',
    minHeight: '100%',
  },
});

export default StaffMessages;

