import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import {
  formatAge,
  formatBirthday,
  getPetById,
  getPetPhotoSource,
} from './PetOwnerMyPetsInfo';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerMyPetsView = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const petId = route?.params?.petId;
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Pet Owner';
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const isHeaderMenuAnimating = useRef(false);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [pet, setPet] = useState(() => getPetById(petId));

  useFocusEffect(
    useCallback(() => {
      setPet(getPetById(petId));
    }, [petId]),
  );

  const activePhoto = useMemo(() => getPetPhotoSource(pet), [pet]);

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

    openHeaderMenu();
  };

  const handleHeaderMenuPress = (routeName) => {
    closeHeaderMenu();
    navigation.navigate(routeName, { user: loggedInUser });
  };

  if (!pet) {
    return (
      <LinearGradient colors={['#022c42', '#0c212b', '#15394e']} style={styles.background}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.emptyModeCard, { margin: 18 }]}>
            <Text style={styles.emptyModeTitle}>Pet profile not found</Text>
            <TouchableOpacity
              style={[styles.primaryActionButton, { alignSelf: 'flex-start', marginTop: 12 }]}
              onPress={() => navigation.navigate('PetOwnerMyPets', { user: loggedInUser })}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryActionText}>Back to My Pets</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#022c42', '#0c212b', '#15394e']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#123554', '#1b4d74', '#245f8e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBar}
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
                <Text style={styles.headerSubtitle}>Pet Profile View</Text>
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

          <View style={styles.headerBottomRow}>
            <TouchableOpacity style={styles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>

            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Manage your pets</Text>
              <Text style={styles.ownerName}>{headerDisplayName}</Text>
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
                    <Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" />
                  </View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Pet Profile View</Text>
            <Text style={styles.sectionSubtitle}>View profile details, medical records, and visit history</Text>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => navigation.navigate('PetOwnerMyPets', { user: loggedInUser, selectedPetId: pet.id })}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryActionText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={() => navigation.navigate('PetOwnerMyPetsEdit', { user: loggedInUser, petId: pet.id })}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryActionText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.viewProfileHeader}>
              <View style={[styles.largePetAvatar, { backgroundColor: pet.profileColor }]}>
                {activePhoto.source ? (
                  <Image
                    source={activePhoto.source}
                    style={[styles.largePetAvatarImage, activePhoto.isCustom && styles.largePetAvatarImageCustom]}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.largePetAvatarText}>{pet.name.charAt(0)}</Text>
                )}
              </View>

              <View style={styles.viewProfileInfo}>
                <Text style={styles.profileName}>{pet.name || 'Unnamed Pet'}</Text>
                <Text style={styles.profileBreed}>{pet.breed || 'No breed yet'}</Text>
                <Text style={styles.referenceCodeText}>Pet Reference Code: {pet.referenceCode}</Text>
              </View>
            </View>

            <View style={styles.profileGrid}>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Species</Text>
                <Text style={styles.profileInfoValue}>{pet.species || '-'}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Breed</Text>
                <Text style={styles.profileInfoValue}>{pet.breed || '-'}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Age</Text>
                <Text style={styles.profileInfoValue}>{formatAge(pet)}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Birthday</Text>
                <Text style={styles.profileInfoValue}>{formatBirthday(pet)}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Weight</Text>
                <Text style={styles.profileInfoValue}>{pet.weight ? `${pet.weight} kg` : '-'}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Sex</Text>
                <Text style={styles.profileInfoValue}>{pet.sex || '-'}</Text>
              </View>
            </View>

            <View style={styles.innerSectionCard}>
              <Text style={styles.recordCardTitle}>Medical History</Text>
              {pet.medicalHistory.length ? pet.medicalHistory.map((item) => (
                <View key={item} style={styles.recordListItem}>
                  <View style={styles.recordBullet} />
                  <Text style={styles.recordItemText}>{item}</Text>
                </View>
              )) : <Text style={styles.emptyRecordText}>No medical history recorded yet.</Text>}

              <Text style={[styles.recordCardTitle, styles.recordCardSectionSpacing]}>Vaccination Records</Text>
              {pet.vaccinations.length ? pet.vaccinations.map((item) => (
                <View key={item} style={styles.recordListItem}>
                  <View style={styles.recordBullet} />
                  <Text style={styles.recordItemText}>{item}</Text>
                </View>
              )) : <Text style={styles.emptyRecordText}>No vaccination records recorded yet.</Text>}
            </View>

            <View style={styles.innerSectionCard}>
              <Text style={styles.recordCardTitle}>Visit History</Text>
              {pet.visits.length ? pet.visits.map((visit) => (
                <View key={visit} style={styles.visitTimelineItem}>
                  <View style={styles.visitTimelineDot} />
                  <View style={styles.visitTimelineContent}>
                    <Text style={styles.visitTimelineText}>{visit}</Text>
                  </View>
                </View>
              )) : <Text style={styles.emptyRecordText}>No visit history recorded yet.</Text>}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMyPetsView;
