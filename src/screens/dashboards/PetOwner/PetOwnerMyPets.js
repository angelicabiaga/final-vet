import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { getAllPets, getPetPhotoSource } from './PetOwnerMyPetsInfo';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerMyPets = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const scrollViewRef = useRef(null);
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Pet Owner';
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [pets, setPets] = useState(() => getAllPets());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPetId, setSelectedPetId] = useState(route?.params?.selectedPetId || getAllPets()[0]?.id);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredPets = pets.filter((pet) => {
    if (!normalizedSearchQuery) {
      return true;
    }

    return [
      pet.name,
      pet.breed,
      pet.species,
      pet.referenceCode,
    ].some((value) => value?.toLowerCase().includes(normalizedSearchQuery));
  });

  useFocusEffect(
    useCallback(() => {
      const refreshedPets = getAllPets();
      setPets(refreshedPets);
      setSelectedPetId(route?.params?.selectedPetId || refreshedPets[0]?.id);
    }, [route?.params?.selectedPetId]),
  );

  useEffect(() => {
    if (!pets.length) {
      setSelectedPetId(null);
    }
  }, [pets]);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'queue', label: 'My Queue', icon: require('../../assets/List.png'), route: 'PetOwnerQueue' },
    { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
    { key: 'profile', label: 'Profile', icon: require('../../assets/Profile.png'), route: 'PetOwnerProfile' },
  ];

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

  const handleHeaderMenuPress = (routeName) => {
    closeHeaderMenu();
    navigation.navigate(routeName, { user: loggedInUser });
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
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
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
                <Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" />
              </View>

              <View style={styles.brandBlock}>
                <Text style={styles.headerTitle}>PawCruz</Text>
                <Text style={styles.headerSubtitle}>Pet Profile Management</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.notifButton}
                onPress={() => navigation.navigate('PetOwnerNotif', { user: loggedInUser })}
                activeOpacity={0.85}
              >
                <View style={styles.notifBadge} />
                <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => navigation.navigate('PetOwnerProfile', { user: loggedInUser })}
                activeOpacity={0.85}
              >
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.profileButtonImage} resizeMode="cover" />
                ) : (
                  <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />
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
              <TouchableOpacity style={styles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
                <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
              </TouchableOpacity>

              <View style={styles.ownerSummary}>
                <Text style={styles.headerCaption}>Manage your pets</Text>
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
                    <Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" />
                  </View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
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
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>My Pets</Text>
            <Text style={styles.sectionSubtitle}>Select a pet profile to open a separate view page</Text>
          </View>

          <View style={styles.petListCard}>
            <View style={styles.searchBarWrap}>
              <Image source={require('../../assets/Search.png')} style={styles.searchBarIcon} resizeMode="contain" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchBarInput}
                placeholder="Search your pet..."
                placeholderTextColor="#87a0b1"
              />
            </View>

            {filteredPets.length ? filteredPets.map((pet) => {
              const isActive = pet.id === selectedPetId;
              const petPhoto = getPetPhotoSource(pet);

              return (
                <View key={pet.id} style={[styles.petRow, isActive && styles.petRowActive]}>
                  <View style={[styles.petAvatar, { backgroundColor: pet.profileColor }]}>
                    {petPhoto.source ? (
                      <Image
                        source={petPhoto.source}
                        style={[styles.petAvatarImage, petPhoto.isCustom && styles.petAvatarImageCustom]}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.petAvatarText}>{pet.name.charAt(0)}</Text>
                    )}
                  </View>

                  <View style={styles.petRowContent}>
                    <Text style={[styles.petRowName, isActive && styles.petRowNameActive]}>{pet.name || 'Unnamed Pet'}</Text>
                    <Text style={[styles.petRowBreed, isActive && styles.petRowBreedActive]}>{pet.breed || 'No breed yet'}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.petStatusPill, isActive && styles.petStatusPillActive]}
                    onPress={() => {
                      setSelectedPetId(pet.id);
                      navigation.navigate('PetOwnerMyPetsView', { user: loggedInUser, petId: pet.id });
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.petStatusText, isActive && styles.petStatusTextActive]}>View</Text>
                  </TouchableOpacity>
                </View>
              );
            }) : (
              <View style={styles.searchEmptyState}>
                <Text style={styles.searchEmptyTitle}>No pets found</Text>
                <Text style={styles.searchEmptyText}>Try another name, breed, species, or reference code.</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.addPetButton}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('PetOwnerMyPetsEdit', { user: loggedInUser })}
            >
              <Text style={styles.addPetPlus}>+</Text>
              <Text style={styles.addPetText}>Add Pet Profile</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.emptyModeCard}>
            <Text style={styles.emptyModeTitle}>Choose an action</Text>
            <Text style={styles.emptyModeText}>
              Tap `View` to open a pet profile on a new page, or tap `Add Pet Profile` to open the pet form on a separate page.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navItem, styles.activeNavItem]}
            onPress={() => navigation.navigate('PetOwnerQuickAssist', { user: loggedInUser })}
            activeOpacity={0.9}
          >
            <View style={[styles.navIconWrap, styles.activeNavIconWrap]}>
              <Image
                source={require('../../assets/support.png')}
                style={[styles.navIcon, styles.activeNavIcon]}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMyPets;
