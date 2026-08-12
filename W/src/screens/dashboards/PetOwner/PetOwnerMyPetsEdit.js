import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { REGISTERED_PET_OWNER_ACCOUNTS } from '../../../data/registeredPetOwners';
import { linkCreatedPetToOwner } from '../Staff/StaffPetsProfile';
import {
  MONTHS,
  OTHER_OPTION_VALUE,
  PET_SPECIES_OPTIONS,
  YEARS,
  createPetDraftFromPet,
  formatAge,
  getPetById,
  getBreedOptionsForSpecies,
  getFormattedAgeFromBirthday,
  getPetPhotoSource,
  savePet,
} from './PetOwnerMyPetsInfo';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const CALENDAR_ICON = require('../../assets/calendar.png');
const CALENDAR_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TODAY = new Date();
const CURRENT_MONTH_INDEX = TODAY.getMonth();
const CURRENT_YEAR = TODAY.getFullYear();
const CURRENT_DAY = TODAY.getDate();

const getBirthdayDateFromPet = (pet) => {
  const monthIndex = Math.max(MONTHS.indexOf(pet?.birthMonth), 0);
  const day = Math.max(Number(pet?.birthDay) || 1, 1);
  const year = Number(pet?.birthYear) || Number(YEARS[0]);
  return new Date(year, monthIndex, day);
};

const buildCalendarDays = (visibleMonthDate) => {
  const year = visibleMonthDate.getFullYear();
  const month = visibleMonthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const isSameCalendarDate = (leftDate, rightDate) => (
  leftDate?.getFullYear() === rightDate?.getFullYear() &&
  leftDate?.getMonth() === rightDate?.getMonth() &&
  leftDate?.getDate() === rightDate?.getDate()
);

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PetOwnerMyPetsEdit = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const petId = route?.params?.petId;
  const isStaffCreate = Boolean(route?.params?.isStaffCreate);
  const returnToRoute = route?.params?.returnToRoute || '';
  const returnToParams = route?.params?.returnToParams || {};
  const isCreatingPet = !petId;
  const initialPet = createPetDraftFromPet(petId ? getPetById(petId) : null);
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Pet Owner';
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const isHeaderMenuAnimating = useRef(false);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [draftPet, setDraftPet] = useState(initialPet);
  const [isCustomBreedMode, setIsCustomBreedMode] = useState(() => (
    Boolean(initialPet.breed) && !getBreedOptionsForSpecies(initialPet.species).some((item) => item.value === initialPet.breed)
  ));
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);
  const [showRequiredFieldsModal, setShowRequiredFieldsModal] = useState(false);
  const [showPhotoOptionsModal, setShowPhotoOptionsModal] = useState(false);
  const [showBirthdayCalendar, setShowBirthdayCalendar] = useState(false);
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => getBirthdayDateFromPet(initialPet));
  const [pendingBirthdayDate, setPendingBirthdayDate] = useState(null);
  const [staffSelectedOwnerId, setStaffSelectedOwnerId] = useState('');
  const [staffOwnerEmail, setStaffOwnerEmail] = useState('');

  const activePhoto = getPetPhotoSource(draftPet);
  const breedOptions = useMemo(() => getBreedOptionsForSpecies(draftPet.species), [draftPet.species]);
  const birthdayLabel = `${draftPet.birthMonth} ${draftPet.birthDay}, ${draftPet.birthYear}`;
  const birthdayDate = useMemo(() => getBirthdayDateFromPet(draftPet), [draftPet.birthMonth, draftPet.birthDay, draftPet.birthYear]);
  const ageLabel = useMemo(() => formatAge(draftPet), [draftPet]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonthDate), [calendarMonthDate]);
  const activeCalendarDate = pendingBirthdayDate || birthdayDate;
  const yearOptions = useMemo(() => (
    YEARS.map((year) => ({
      label: year,
      value: year,
    }))
  ), []);
  const selectedBreedValue = isCustomBreedMode ? OTHER_OPTION_VALUE : (draftPet.breed || null);

  const staffOwnerDropdownData = useMemo(() => [
    { label: '— None — use owner email below', value: '' },
    ...REGISTERED_PET_OWNER_ACCOUNTS.map((o) => ({
      label: `${o.name} · ${o.email}`,
      value: o.id,
    })),
  ], []);

  const headerMenuItems = isStaffCreate
    ? [
        { key: 'staff-pets', label: 'Pets Profile', icon: require('../../assets/Pets_Icon.png'), route: 'StaffPetsProfile' },
        { key: 'staff-dash', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'staff-screen' },
        { key: 'staff-messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'StaffMessages' },
      ]
    : [
        { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
        { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
        { key: 'mypets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
        { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
        { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },
      ];

  const updateDraftPetField = (field, value) => {
    setDraftPet((current) => ({ ...current, [field]: value }));
  };

  const renderFormLabel = (label, showRequiredMark = false) => (
    <Text style={styles.formLabel}>
      {label}
      {showRequiredMark ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );

  const hasEmptyRequiredField = (pet) =>
    !pet?.name?.trim() ||
    !pet?.species?.trim() ||
    !pet?.breed?.trim() ||
    !pet?.birthMonth ||
    !pet?.birthDay ||
    !pet?.birthYear;

  const hasStaffOwnerAssignment = () => {
    if (!isStaffCreate || !isCreatingPet) {
      return true;
    }
    if (staffSelectedOwnerId) {
      return true;
    }
    const emailTrim = staffOwnerEmail.trim();
    if (!emailTrim) {
      return false;
    }
    return EMAIL_LIKE.test(emailTrim);
  };

  const handleSpeciesChange = (item) => {
    setIsCustomBreedMode(false);
    setDraftPet((current) => ({
      ...current,
      species: item.value,
      breed: '',
      customBreed: '',
    }));
  };

  const handleBreedChange = (item) => {
    if (item.value === OTHER_OPTION_VALUE) {
      setIsCustomBreedMode(true);
      setDraftPet((current) => ({
        ...current,
        breed: current.customBreed || '',
      }));
      return;
    }

    setIsCustomBreedMode(false);
    setDraftPet((current) => ({
      ...current,
      breed: item.value,
      customBreed: '',
    }));
  };

  const handleCustomBreedChange = (value) => {
    setDraftPet((current) => ({
      ...current,
      customBreed: value,
      breed: value,
    }));
  };

  const openBirthdayCalendar = () => {
    setCalendarMonthDate(getBirthdayDateFromPet(draftPet));
    setPendingBirthdayDate(null);
    setShowBirthdayCalendar(true);
  };

  const handleBirthdaySelect = (day) => {
    const nextDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), day);
    setPendingBirthdayDate(nextDate);
  };

  const handleBirthdayDone = () => {
    if (!pendingBirthdayDate) {
      return;
    }

    setDraftPet((current) => ({
      ...current,
      birthMonth: MONTHS[pendingBirthdayDate.getMonth()],
      birthDay: String(pendingBirthdayDate.getDate()),
      birthYear: String(pendingBirthdayDate.getFullYear()),
      age: getFormattedAgeFromBirthday({
        birthMonth: MONTHS[pendingBirthdayDate.getMonth()],
        birthDay: String(pendingBirthdayDate.getDate()),
        birthYear: String(pendingBirthdayDate.getFullYear()),
      }),
    }));
    setPendingBirthdayDate(null);
    setShowBirthdayCalendar(false);
  };

  const shiftCalendarMonth = (direction) => {
    setCalendarMonthDate((current) => {
      const candidateDate = new Date(current.getFullYear(), current.getMonth() + direction, 1);
      const latestAllowedDate = new Date(CURRENT_YEAR, CURRENT_MONTH_INDEX, 1);

      if (candidateDate > latestAllowedDate) {
        return current;
      }

      return candidateDate;
    });
  };

  const handleCalendarYearChange = (item) => {
    const year = Number(item.value);
    const limitedMonthIndex = year === CURRENT_YEAR
      ? Math.min(calendarMonthDate.getMonth(), CURRENT_MONTH_INDEX)
      : calendarMonthDate.getMonth();

    setCalendarMonthDate(new Date(year, limitedMonthIndex, 1));
    setPendingBirthdayDate(null);
  };

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

  const takePhoto = async () => {
    setShowPhotoOptionsModal(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    updateDraftPetField('profileImageUri', result.assets[0].uri);
  };

  const pickPhotoFromAlbum = async () => {
    setShowPhotoOptionsModal(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    updateDraftPetField('profileImageUri', result.assets[0].uri);
  };

  const pickPhotoFromFiles = async () => {
    setShowPhotoOptionsModal(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    updateDraftPetField('profileImageUri', result.assets[0].uri);
  };

  const handleDonePress = () => {
    if (hasEmptyRequiredField(draftPet)) {
      setShowRequiredFieldsModal(true);
      return;
    }

    if (!hasStaffOwnerAssignment()) {
      Alert.alert(
        'Assign pet owner',
        'Choose a registered pet owner from the list, or enter a valid owner email if they are not listed yet.',
      );
      return;
    }

    setShowDoneConfirm(true);
  };

  const handleCancelPress = () => {
    if (isStaffCreate) {
      navigation.navigate('StaffPetsProfile', { user: loggedInUser });
      return;
    }

    if (returnToRoute) {
      navigation.navigate({
        name: returnToRoute,
        params: {
          ...returnToParams,
          user: loggedInUser,
        },
        merge: true,
      });
      return;
    }

    if (petId) {
      navigation.replace('PetOwnerMyPetsView', { user: loggedInUser, petId });
      return;
    }

    navigation.navigate('PetOwnerMyPets', { user: loggedInUser });
  };

  const handleSavePet = () => {
    const savedPet = savePet(draftPet);
    setShowDoneConfirm(false);

    if (isStaffCreate) {
      linkCreatedPetToOwner(savedPet, {
        selectedOwnerId: staffSelectedOwnerId,
        ownerEmailRaw: staffOwnerEmail,
      });
      navigation.navigate('StaffPetsProfile', {
        user: loggedInUser,
        preselectedPetId: savedPet.id,
      });
      return;
    }

    if (returnToRoute) {
      navigation.navigate({
        name: returnToRoute,
        params: {
          ...returnToParams,
          user: loggedInUser,
          preselectedPetId: savedPet.id,
        },
        merge: true,
      });
      return;
    }

    navigation.replace('PetOwnerMyPetsView', { user: loggedInUser, petId: savedPet.id });
  };

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
              onPress={() => {
                if (isStaffCreate) {
                  navigation.navigate('StaffPetsProfile', { user: loggedInUser });
                  return;
                }
                navigation.navigate('petowner-screen', { user: loggedInUser });
              }}
              activeOpacity={0.85}
            >
              <View style={styles.logoWrap}>
                <Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" />
              </View>

              <View style={styles.brandBlock}>
                <Text style={styles.headerTitle}>PawCruz</Text>
                <Text style={styles.headerSubtitle}>
                  {isStaffCreate && isCreatingPet
                    ? 'Create Pet for Owner'
                    : (isCreatingPet ? 'Add Pet Profile' : 'Edit Pet Profile')}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.notifButton}
                onPress={() => navigation.navigate(
                  isStaffCreate ? 'StaffNotif' : 'PetOwnerNotif',
                  { user: loggedInUser },
                )}
                activeOpacity={0.85}
              >
                <View style={styles.notifBadge} />
                <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => navigation.navigate(
                  isStaffCreate ? 'StaffProfile' : 'PetOwnerProfile',
                  { user: loggedInUser },
                )}
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
              <Text style={styles.headerCaption}>
                {isStaffCreate ? 'Staff · pet intake' : 'Manage your pets'}
              </Text>
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
            <Text style={styles.sectionTitle}>
              {isStaffCreate && isCreatingPet ? 'Create pet for owner' : (isCreatingPet ? 'Add Pet Profile' : 'Edit Pet Profile')}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {isStaffCreate && isCreatingPet
                ? 'Choose a registered owner or enter their email, then complete the pet details below.'
                : 'Update pet photo, basic details, and profile information'}
            </Text>
          </View>

          {isStaffCreate && isCreatingPet ? (
            <View style={styles.detailCard}>
              <Text style={styles.formLabel}>Registered pet owner</Text>
              <View style={styles.enhancedFieldCard}>
                <View style={styles.dropdownShell}>
                  <Dropdown
                    style={styles.searchableDropdown}
                    containerStyle={styles.searchableDropdownContainer}
                    placeholderStyle={styles.dropdownPlaceholder}
                    selectedTextStyle={styles.dropdownSelectedText}
                    itemTextStyle={styles.dropdownItemText}
                    iconStyle={styles.dropdownIcon}
                    activeColor="#edf7fd"
                    data={staffOwnerDropdownData}
                    search
                    maxHeight={280}
                    labelField="label"
                    valueField="value"
                    placeholder="Select from registered owners"
                    searchPlaceholder="Search name or email..."
                    value={staffSelectedOwnerId}
                    onChange={(item) => {
                      setStaffSelectedOwnerId(item.value);
                      if (item.value) {
                        setStaffOwnerEmail('');
                      }
                    }}
                  />
                </View>
                <Text style={styles.inlineFieldHint}>
                  Or leave this empty and use the email field if the owner is not listed yet.
                </Text>
              </View>

              <Text style={styles.formLabel}>Owner email</Text>
              <TextInput
                value={staffOwnerEmail}
                onChangeText={(value) => {
                  setStaffOwnerEmail(value);
                  if (value.trim()) {
                    setStaffSelectedOwnerId('');
                  }
                }}
                style={[
                  styles.inputField,
                  staffSelectedOwnerId ? { opacity: 0.5 } : null,
                ]}
                placeholder="owner@example.com"
                placeholderTextColor="#87a0b1"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!staffSelectedOwnerId}
              />
              <Text style={styles.inlineFieldHint}>
                If the email matches a registered owner, we attach their name automatically. Otherwise we store the email as the owner link until they sign up.
              </Text>
            </View>
          ) : null}

          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <TouchableOpacity
                style={styles.secondaryActionButtonWide}
                onPress={handleCancelPress}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryActionText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryActionButtonWide} onPress={handleDonePress} activeOpacity={0.9}>
                <Text style={styles.primaryActionText}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.editPhotoSection}>
              <View style={styles.editAvatarWrap}>
                <View style={[styles.largePetAvatar, { backgroundColor: draftPet.profileColor }]}>
                  {activePhoto.source ? (
                    <Image
                      source={activePhoto.source}
                      style={[styles.largePetAvatarImage, activePhoto.isCustom && styles.largePetAvatarImageCustom]}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.largePetAvatarText}>{draftPet.name.charAt(0) || 'P'}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.avatarAddButton}
                  onPress={() => setShowPhotoOptionsModal(true)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.avatarAddButtonText}>+</Text>
                </TouchableOpacity>
              </View>

            </View>

            <View style={styles.formCard}>
              <Text style={styles.formLabel}>Pet Reference Code</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyFieldText}>{draftPet.referenceCode}</Text>
              </View>

              {renderFormLabel('Name', !draftPet.name?.trim())}
              <TextInput
                value={draftPet.name}
                onChangeText={(value) => updateDraftPetField('name', value)}
                style={styles.inputField}
                placeholder="Enter pet name"
                placeholderTextColor="#87a0b1"
              />

              {renderFormLabel('Species', !draftPet.species?.trim())}
              <View style={styles.enhancedFieldCard}>
                <View style={styles.dropdownShell}>
                  <Dropdown
                    style={styles.searchableDropdown}
                    containerStyle={styles.searchableDropdownContainer}
                    placeholderStyle={styles.dropdownPlaceholder}
                    selectedTextStyle={styles.dropdownSelectedText}
                    itemTextStyle={styles.dropdownItemText}
                    iconStyle={styles.dropdownIcon}
                    activeColor="#edf7fd"
                    data={PET_SPECIES_OPTIONS.map((species) => ({ label: species, value: species }))}
                    search
                    maxHeight={280}
                    labelField="label"
                    valueField="value"
                    placeholder="Select species"
                    searchPlaceholder="Search species..."
                    value={draftPet.species}
                    onChange={handleSpeciesChange}
                  />
                </View>
                <Text style={styles.inlineFieldHint}>Breed options update based on the species you pick.</Text>
              </View>

              {renderFormLabel('Breed', !draftPet.breed?.trim())}
              <View style={styles.enhancedFieldCard}>
                <View style={styles.dropdownShell}>
                  <Dropdown
                    style={styles.searchableDropdown}
                    containerStyle={styles.searchableDropdownContainer}
                    placeholderStyle={styles.dropdownPlaceholder}
                    selectedTextStyle={styles.dropdownSelectedText}
                    itemTextStyle={styles.dropdownItemText}
                    iconStyle={styles.dropdownIcon}
                    activeColor="#edf7fd"
                    data={breedOptions}
                    search
                    maxHeight={300}
                    labelField="label"
                    valueField="value"
                    placeholder={`Select ${draftPet.species === 'Feline (Cat)' ? 'cat' : 'pet'} breed`}
                    searchPlaceholder="Search breed..."
                    value={selectedBreedValue}
                    onChange={handleBreedChange}
                  />
                </View>
                {isCustomBreedMode ? (
                  <TextInput
                    value={draftPet.customBreed}
                    onChangeText={handleCustomBreedChange}
                    style={[styles.inputField, styles.stackedInputField]}
                    placeholder="Type breed"
                    placeholderTextColor="#87a0b1"
                  />
                ) : null}
              </View>

              <Text style={styles.formLabel}>Sex</Text>
              <View style={styles.pickerFieldWrap}>
                <Dropdown
                  style={styles.searchableDropdown}
                  containerStyle={styles.searchableDropdownContainer}
                  placeholderStyle={styles.dropdownPlaceholder}
                  selectedTextStyle={styles.dropdownSelectedText}
                  itemTextStyle={styles.dropdownItemText}
                  iconStyle={styles.dropdownIcon}
                  activeColor="#edf7fd"
                  data={[
                    { label: 'Male', value: 'Male' },
                    { label: 'Female', value: 'Female' },
                  ]}
                  labelField="label"
                  valueField="value"
                  placeholder="Select sex"
                  value={draftPet.sex}
                  onChange={(item) => updateDraftPetField('sex', item.value)}
                />
              </View>

              {renderFormLabel('Birthday', !draftPet.birthMonth || !draftPet.birthDay || !draftPet.birthYear)}
              <View style={styles.birthdayFieldCard}>
                <Text style={styles.birthdayInfoText}>Select the birthday to identify the pet&apos;s age.</Text>
                <TouchableOpacity style={styles.calendarTriggerButton} onPress={openBirthdayCalendar} activeOpacity={0.88}>
                  <View>
                    <Text style={styles.calendarTriggerLabel}>Selected Date</Text>
                    <Text style={styles.calendarTriggerValue}>{birthdayLabel}</Text>
                  </View>
                  <Image source={CALENDAR_ICON} style={styles.calendarTriggerIconImage} resizeMode="contain" />
                </TouchableOpacity>
                <View style={styles.birthdayAgeSummary}>
                  <Text style={styles.birthdayAgeLabel}>Age</Text>
                  <Text style={styles.birthdayAgeValue}>{ageLabel}</Text>
                </View>
              </View>

              <Text style={styles.formLabel}>Weight (kg)</Text>
              <TextInput
                value={draftPet.weight}
                onChangeText={(value) => updateDraftPetField('weight', value.replace(/[^0-9.]/g, ''))}
                style={styles.inputField}
                placeholder="Enter pet weight in kg"
                placeholderTextColor="#87a0b1"
                keyboardType="decimal-pad"
                maxLength={6}
              />

              <Text style={styles.formLabel}>Color</Text>
              <TextInput
                value={draftPet.color}
                onChangeText={(value) => updateDraftPetField('color', value)}
                style={styles.inputField}
                placeholder="Enter pet color"
                placeholderTextColor="#87a0b1"
              />

              <Text style={styles.formLabel}>Special Markings</Text>
              <TextInput
                value={draftPet.specialMarkings}
                onChangeText={(value) => updateDraftPetField('specialMarkings', value)}
                style={styles.textAreaField}
                placeholder="Enter spots, scars, patterns, or unique markings"
                placeholderTextColor="#87a0b1"
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>
        </ScrollView>

        <Modal transparent animationType="fade" visible={showPhotoOptionsModal} onRequestClose={() => setShowPhotoOptionsModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Update Pet Photo</Text>
              <Text style={styles.modalMessage}>Choose how you want to add the pet profile picture.</Text>
              <TouchableOpacity style={styles.photoOptionButton} onPress={takePhoto} activeOpacity={0.9}>
                <Text style={styles.photoOptionButtonText}>Take a Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoOptionButton} onPress={pickPhotoFromAlbum} activeOpacity={0.9}>
                <Text style={styles.photoOptionButtonText}>Choose from Album</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoOptionButton} onPress={pickPhotoFromFiles} activeOpacity={0.9}>
                <Text style={styles.photoOptionButtonText}>Choose from Files</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setShowPhotoOptionsModal(false)} activeOpacity={0.9}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal transparent animationType="fade" visible={showBirthdayCalendar} onRequestClose={() => setShowBirthdayCalendar(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.calendarModalCard}>
              <Text style={styles.modalTitle}>Select Birthday</Text>
              <Text style={styles.modalMessage}>Pick the exact birth date from the calendar below.</Text>

              <View style={styles.calendarHeaderRow}>
                <TouchableOpacity style={styles.calendarNavButton} onPress={() => shiftCalendarMonth(-1)} activeOpacity={0.88}>
                  <Text style={styles.calendarNavButtonText}>Previous</Text>
                </TouchableOpacity>
                <View style={styles.calendarTitleWrap}>
                  <Text style={styles.calendarActiveMonth}>{MONTHS[calendarMonthDate.getMonth()]}</Text>
                  <View style={styles.calendarPickerWrapYear}>
                    <Dropdown
                      style={styles.calendarPickerDropdown}
                      containerStyle={styles.searchableDropdownContainer}
                      placeholderStyle={styles.dropdownPlaceholder}
                      selectedTextStyle={styles.dropdownSelectedText}
                      itemTextStyle={styles.dropdownItemText}
                      iconStyle={styles.dropdownIcon}
                      activeColor="#edf7fd"
                      data={yearOptions}
                      labelField="label"
                      valueField="value"
                      placeholder="Year"
                      value={String(calendarMonthDate.getFullYear())}
                      onChange={handleCalendarYearChange}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.calendarNavButton,
                    calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                    calendarMonthDate.getMonth() === CURRENT_MONTH_INDEX &&
                    styles.calendarNavButtonDisabled,
                  ]}
                  onPress={() => shiftCalendarMonth(1)}
                  activeOpacity={0.88}
                  disabled={
                    calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                    calendarMonthDate.getMonth() === CURRENT_MONTH_INDEX
                  }
                >
                  <Text style={styles.calendarNavButtonText}>Next</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calendarWeekHeader}>
                {CALENDAR_DAY_LABELS.map((label) => (
                  <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) => {
                  const isFutureDate = day
                    ? (
                      calendarMonthDate.getFullYear() > CURRENT_YEAR ||
                      (
                        calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                        calendarMonthDate.getMonth() > CURRENT_MONTH_INDEX
                      ) ||
                      (
                        calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                        calendarMonthDate.getMonth() === CURRENT_MONTH_INDEX &&
                        day > CURRENT_DAY
                      )
                    )
                    : false;
                  const isSelected =
                    day &&
                    isSameCalendarDate(activeCalendarDate, new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), day));

                  return (
                    <TouchableOpacity
                      key={`${calendarMonthDate.getMonth()}-${calendarMonthDate.getFullYear()}-${index}`}
                      style={[
                        styles.calendarDayCell,
                        !day && styles.calendarDayCellEmpty,
                        isFutureDate && styles.calendarDayCellDisabled,
                        isSelected && styles.calendarDayCellSelected,
                      ]}
                      onPress={() => day && !isFutureDate && handleBirthdaySelect(day)}
                      disabled={!day || isFutureDate}
                      activeOpacity={0.88}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          !day && styles.calendarDayTextEmpty,
                          isFutureDate && styles.calendarDayTextDisabled,
                          isSelected && styles.calendarDayTextSelected,
                        ]}
                      >
                        {day || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => {
                    setPendingBirthdayDate(null);
                    setShowBirthdayCalendar(false);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                {pendingBirthdayDate ? (
                  <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleBirthdayDone} activeOpacity={0.9}>
                    <Text style={styles.modalPrimaryText}>Done</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.calendarDonePlaceholder} />
                )}
              </View>
            </View>
          </View>
        </Modal>

        <Modal transparent animationType="fade" visible={showRequiredFieldsModal} onRequestClose={() => setShowRequiredFieldsModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Required Fields</Text>
              <Text style={styles.modalMessage}>Please complete all required pet fields first.</Text>
              <TouchableOpacity style={styles.modalSingleButton} onPress={() => setShowRequiredFieldsModal(false)} activeOpacity={0.9}>
                <Text style={styles.modalSingleButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal transparent animationType="fade" visible={showDoneConfirm} onRequestClose={() => setShowDoneConfirm(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Save Changes</Text>
              <Text style={styles.modalMessage}>Are you sure you want to apply these pet profile updates?</Text>
              <View style={styles.modalButtonRow}>
                <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setShowDoneConfirm(false)} activeOpacity={0.9}>
                  <Text style={styles.modalSecondaryText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleSavePet} activeOpacity={0.9}>
                  <Text style={styles.modalPrimaryText}>Yes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMyPetsEdit;
