import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { REGISTERED_PET_OWNER_ACCOUNTS } from '../../../data/registeredPetOwners';
import { styles as sharedStyles } from '../../styles/StaffDashboardDesign';
import {
  createPetDraftFromPet,
  formatAge,
  formatBirthday,
  getAllPets,
  savePet,
} from '../PetOwner/PetOwnerMyPetsInfo';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const TABS = ['Overview', 'Medical', 'Notes'];

const PET_STATUS_META = {
  Active: { bg: '#e8f7ef', border: '#c8ead7', text: '#1d7a4d' },
  'For Follow-up': { bg: '#fff8e6', border: '#f2e0b8', text: '#b26a17' },
  'Under Treatment': { bg: '#eef4ff', border: '#cfdcf5', text: '#2d5a9e' },
  'Vaccination Due': { bg: '#fff1ef', border: '#f1cdc8', text: '#b54234' },
  Inactive: { bg: '#fff1ef', border: '#f1cdc8', text: '#b54234' },
};

const DEFAULT_PET_STATUS_META = { bg: '#f0f4f8', border: '#dce4ed', text: '#4f6f83' };

const WINDOW_WIDTH = Dimensions.get('window').width;
const WINDOW_HEIGHT = Dimensions.get('window').height;
const ESTIMATED_MODAL_PAGER_WIDTH = Math.max(WINDOW_WIDTH - 80, 280);
const MODAL_CARD_MAX_HEIGHT = Math.round(WINDOW_HEIGHT * 0.88);

const STAFF_PET_METADATA = {
  'pet-1': {
    ownerName: 'Maria Santos',
    status: 'For Follow-up',
    veterinarianAssigned: 'Dr. Sarah Dela Cruz',
    appointmentHistory: {
      lastAppointmentDate: 'March 18, 2026',
      nextAppointmentDate: 'April 22, 2026',
      appointmentStatus: 'Confirmed follow-up',
    },
    additionalMedicalHistory: [
      'Previous treatment: antihistamine support for seasonal allergy',
      'Maintenance care note: monthly tick and flea prevention',
    ],
    veterinarianNotes: [
      'Monitor mild skin irritation after outdoor activity.',
      'Continue hypoallergenic diet and weekly brushing routine.',
      'Appetite and energy level remain stable after the last visit.',
    ],
  },
  'pet-2': {
    ownerName: 'Aldwin123',
    status: 'Under Treatment',
    veterinarianAssigned: 'Dr. Michael Cruz',
    appointmentHistory: {
      lastAppointmentDate: 'February 14, 2026',
      nextAppointmentDate: 'April 18, 2026',
      appointmentStatus: 'Treatment review scheduled',
    },
    additionalMedicalHistory: [
      'Previous illness: skin sensitivity around ears',
      'Previous treatment: medicated ear cleaning support',
    ],
    veterinarianNotes: [
      'Keep ears dry after grooming sessions.',
      'Continue the skin-care routine twice every week.',
      'Coat condition is improving with no recent scratching spike.',
    ],
  },
};

const dedupe = (items) => [...new Set((items || []).filter(Boolean))];
const splitLines = (value) => String(value || '')
  .split(/\r?\n/)
  .map((item) => item.trim())
  .filter(Boolean);
const hasPendingVaccination = (pet) =>
  (pet?.vaccinations || []).some((item) => item?.toLowerCase().includes('pending'));

const buildDefaultStaffMetadata = (pet) => ({
  ownerName: 'Not assigned',
  status: hasPendingVaccination(pet) ? 'Vaccination Due' : 'Active',
  veterinarianAssigned: 'Not yet assigned',
  appointmentHistory: {
    lastAppointmentDate: pet?.visits?.[0]?.split(' - ')[0] || 'No previous appointment',
    nextAppointmentDate: 'Not yet scheduled',
    appointmentStatus: pet?.visits?.length ? 'Profile available for review' : 'No appointment record yet',
  },
  additionalMedicalHistory: [],
  veterinarianNotes: [
    'No staff note has been added yet.',
    'Update care instructions after the next consultation.',
  ],
});

const cloneStaffMetadata = (metadata) => ({
  ownerName: metadata.ownerName,
  status: metadata.status,
  veterinarianAssigned: metadata.veterinarianAssigned,
  appointmentHistory: {
    ...metadata.appointmentHistory,
  },
  additionalMedicalHistory: [...(metadata.additionalMedicalHistory || [])],
  veterinarianNotes: [...(metadata.veterinarianNotes || [])],
});

let staffPetMetadataStore = Object.fromEntries(
  Object.entries(STAFF_PET_METADATA).map(([petId, metadata]) => [petId, cloneStaffMetadata(metadata)]),
);

const getStaffMetadata = (pet) => {
  const storedMetadata = staffPetMetadataStore[pet.id];
  if (storedMetadata) {
    return cloneStaffMetadata(storedMetadata);
  }

  return cloneStaffMetadata(buildDefaultStaffMetadata(pet));
};

const saveStaffMetadata = (pet, metadataPatch) => {
  const existingMetadata = getStaffMetadata(pet);
  const nextMetadata = cloneStaffMetadata({
    ...existingMetadata,
    ...metadataPatch,
    appointmentHistory: {
      ...existingMetadata.appointmentHistory,
      ...(metadataPatch.appointmentHistory || {}),
    },
  });

  staffPetMetadataStore = {
    ...staffPetMetadataStore,
    [pet.id]: nextMetadata,
  };

  return cloneStaffMetadata(nextMetadata);
};

/** After staff creates a pet: set staff metadata owner + optional ownerUserId / ownerEmail on pet record. */
const linkCreatedPetToOwner = (savedPet, { selectedOwnerId, ownerEmailRaw }) => {
  const emailTrim = (ownerEmailRaw || '').trim();
  const selected = selectedOwnerId
    ? REGISTERED_PET_OWNER_ACCOUNTS.find((o) => String(o.id) === String(selectedOwnerId))
    : null;

  let ownerName = 'Not assigned';
  let extra = {};

  if (selected) {
    ownerName = selected.name;
    extra = { ownerUserId: selected.id, ownerEmail: selected.email || '' };
  } else if (emailTrim) {
    const lower = emailTrim.toLowerCase();
    const matched = REGISTERED_PET_OWNER_ACCOUNTS.find(
      (o) => (o.email || '').toLowerCase() === lower,
    );
    if (matched) {
      ownerName = matched.name;
      extra = { ownerUserId: matched.id, ownerEmail: matched.email };
    } else {
      ownerName = emailTrim;
      extra = { ownerUserId: '', ownerEmail: emailTrim };
    }
  }

  saveStaffMetadata(savedPet, { ownerName });
  savePet({ ...savedPet, ...extra });
};

const createStaffEditDraft = (pet) => {
  const baseDraft = createPetDraftFromPet(pet);

  return {
    ...baseDraft,
    medicalHistoryText: (pet?.medicalHistory || []).join('\n'),
    vaccinationRecordsText: (pet?.vaccinationRecords || []).join('\n'),
    visitsText: (pet?.visits || []).join('\n'),
    veterinarianNotesText: (pet?.veterinarianNotes || []).join('\n'),
  };
};

const hasIncompletePetDraft = (petDraft) =>
  !petDraft?.name?.trim() ||
  !petDraft?.species?.trim() ||
  !petDraft?.breed?.trim() ||
  !petDraft?.birthMonth?.trim() ||
  !petDraft?.birthDay?.trim() ||
  !petDraft?.birthYear?.trim();

const buildStaffPetRecord = (pet) => {
  const metadata = getStaffMetadata(pet);

  return {
    ...pet,
    ownerName: metadata.ownerName,
    status: metadata.status,
    veterinarianAssigned: metadata.veterinarianAssigned,
    appointmentHistory: metadata.appointmentHistory,
    medicalHistory: dedupe([...(pet.medicalHistory || []), ...(metadata.additionalMedicalHistory || [])]),
    vaccinationRecords: dedupe(pet.vaccinations || []),
    veterinarianNotes: dedupe(metadata.veterinarianNotes || []),
  };
};

const getStaffPets = () => getAllPets().map(buildStaffPetRecord);

const saveStaffPetFromDraft = (editDraft) => {
  if (!editDraft?.id) {
    return { error: 'Missing pet profile.' };
  }

  const selectedPet = getStaffPets().find((pet) => pet.id === editDraft.id);

  if (!selectedPet) {
    return { error: 'Pet not found.' };
  }

  if (hasIncompletePetDraft(editDraft)) {
    return { error: 'Complete the pet name, species, breed, and birthday fields before saving.' };
  }

  const savedPet = savePet({
    id: selectedPet.id,
    referenceCode: selectedPet.referenceCode,
    profileColor: editDraft.profileColor || selectedPet.profileColor,
    profileImageKey: editDraft.profileImageKey || selectedPet.profileImageKey,
    profileImageUri: editDraft.profileImageUri || selectedPet.profileImageUri,
    customBreed: editDraft.customBreed || '',
    name: editDraft.name,
    breed: editDraft.breed,
    species: editDraft.species,
    age: editDraft.age,
    birthMonth: editDraft.birthMonth,
    birthDay: editDraft.birthDay,
    birthYear: editDraft.birthYear,
    weight: editDraft.weight,
    sex: editDraft.sex,
    color: editDraft.color,
    specialMarkings: editDraft.specialMarkings,
    medicalHistory: splitLines(editDraft.medicalHistoryText),
    vaccinations: splitLines(editDraft.vaccinationRecordsText),
    visits: splitLines(editDraft.visitsText),
  });

  saveStaffMetadata(savedPet, {
    ownerName: selectedPet.ownerName?.trim() || 'Not assigned',
    status: selectedPet.status?.trim() || (hasPendingVaccination(savedPet) ? 'Vaccination Due' : 'Active'),
    veterinarianAssigned: selectedPet.veterinarianAssigned?.trim() || 'Not yet assigned',
    appointmentHistory: {
      lastAppointmentDate: selectedPet.appointmentHistory?.lastAppointmentDate || 'No previous appointment',
      nextAppointmentDate: selectedPet.appointmentHistory?.nextAppointmentDate || 'Not yet scheduled',
      appointmentStatus: selectedPet.appointmentHistory?.appointmentStatus || 'Profile available for review',
    },
    additionalMedicalHistory: [],
    veterinarianNotes: splitLines(editDraft.veterinarianNotesText),
  });

  return { savedPet };
};

const StaffPetsProfile = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const currentUser = loggedInUser || {};
  const explicitSelectedPetIdFromRoute = route?.params?.selectedPetId;
  const preselectedPetIdFromRoute = route?.params?.preselectedPetId;
  const selectedPetIdFromRoute = explicitSelectedPetIdFromRoute || preselectedPetIdFromRoute;
  const initialPets = getStaffPets();
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Staff';
  const { scrollViewRef, lowerHeaderAnimatedStyle, handleScroll } = useLowerHeaderMotion();
  const petCardsOffset = useRef(0);
  const tabPagerRef = useRef(null);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const [tabPagerWidth, setTabPagerWidth] = useState(ESTIMATED_MODAL_PAGER_WIDTH);
  const [tabPagerHostHeight, setTabPagerHostHeight] = useState(0);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [pets, setPets] = useState(initialPets);
  const [activeQuickFilter, setActiveQuickFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPetId, setSelectedPetId] = useState(
    selectedPetIdFromRoute || initialPets[0]?.id || null,
  );
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [isProfileVisible, setIsProfileVisible] = useState(Boolean(explicitSelectedPetIdFromRoute));

  useFocusEffect(
    useCallback(() => {
      const refreshedPets = getStaffPets();
      setPets(refreshedPets);
      setSelectedPetId((currentSelectedPetId) => {
        if (
          explicitSelectedPetIdFromRoute &&
          refreshedPets.some((pet) => pet.id === explicitSelectedPetIdFromRoute)
        ) {
          setIsProfileVisible(true);
          return explicitSelectedPetIdFromRoute;
        }

        if (
          preselectedPetIdFromRoute &&
          refreshedPets.some((pet) => pet.id === preselectedPetIdFromRoute)
        ) {
          setIsProfileVisible(false);
          return preselectedPetIdFromRoute;
        }

        if (currentSelectedPetId && refreshedPets.some((pet) => pet.id === currentSelectedPetId)) {
          return currentSelectedPetId;
        }
        return refreshedPets[0]?.id || null;
      });
    }, [explicitSelectedPetIdFromRoute, preselectedPetIdFromRoute]),
  );

  const filteredPets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return pets.filter((pet) => {
      const matchesQuickFilter =
        activeQuickFilter === 'all'
        || (activeQuickFilter === 'active' && pet.status === 'Active')
        || (activeQuickFilter === 'follow-up' && pet.status === 'For Follow-up')
        || (
          activeQuickFilter === 'attention'
          && (pet.status === 'Under Treatment' || pet.status === 'Vaccination Due')
        );

      if (!matchesQuickFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        pet.name,
        pet.breed,
        pet.species,
        pet.referenceCode,
        pet.ownerName,
        pet.veterinarianAssigned,
        pet.status,
        ...(pet.medicalHistory || []),
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [activeQuickFilter, pets, searchQuery]);

  useEffect(() => {
    if (!pets.length) {
      setSelectedPetId(null);
      setIsProfileVisible(false);
      return;
    }

    if (!pets.some((pet) => pet.id === selectedPetId)) {
      setSelectedPetId(pets[0].id);
    }
  }, [pets, selectedPetId]);

  const selectedPet = pets.find((pet) => pet.id === selectedPetId) || null;
  const totalPets = pets.length;
  const activePetsCount = pets.filter((pet) => pet.status === 'Active').length;
  const followUpCount = pets.filter((pet) => pet.status === 'For Follow-up').length;
  const needsAttentionCount = pets.filter((pet) =>
    pet.status === 'Under Treatment' || pet.status === 'Vaccination Due'
  ).length;
  const summaryCards = useMemo(() => ([
    { key: 'all', label: 'Total Profiles', value: totalPets, color: '#2d7fb3' },
    { key: 'active', label: 'Active', value: activePetsCount, color: '#1d7a4d' },
    { key: 'follow-up', label: 'Follow-up', value: followUpCount, color: '#b26a17' },
    { key: 'attention', label: 'Needs Attention', value: needsAttentionCount, color: '#b54234' },
  ]), [activePetsCount, followUpCount, needsAttentionCount, totalPets]);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'staff-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'StaffAppointment' },
    { key: 'pets-profile', label: 'Pets Profile', icon: require('../../assets/Pets_Icon.png'), route: 'StaffPetsProfile' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'StaffMessages' },
    { key: 'inventory', label: 'Inventory', icon: require('../../assets/Inventory_Icon.png'), route: 'StaffInventory' },
    { key: 'user-management', label: 'User Management', icon: require('../../assets/UserManagement_Icon.png'), route: 'StaffUserManagement' },
    { key: 'payment-history', label: 'Payment History', icon: require('../../assets/payment_icon.png'), route: 'StaffPayHis' },
    { key: 'activity-logs', label: 'Activity Logs', icon: require('../../assets/Log_Icon.png'), route: 'StaffActivityLogs' },
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

  const handleSelectPet = (petId) => {
    if (petId !== selectedPetId) {
      setIsProfileVisible(false);
    }
    setSelectedPetId(petId);
    setActiveTab(TABS[0]);
  };

  const handleViewProfile = (petId) => {
    handleSelectPet(petId);
    setIsProfileVisible(true);
  };

  const handleHideProfile = () => {
    setIsProfileVisible(false);

    if (route?.params?.selectedPetId || route?.params?.preselectedPetId) {
      navigation.setParams({
        selectedPetId: undefined,
        preselectedPetId: undefined,
      });
    }
  };

  const handleEditPet = () => {
    if (!selectedPet?.id) {
      return;
    }

    setIsProfileVisible(false);
    navigation.setParams({
      selectedPetId: undefined,
      preselectedPetId: undefined,
    });

    navigation.navigate('StaffPetsProfileEdit', {
      user: currentUser,
      petId: selectedPet.id,
    });
  };

  const handlePetCardsLayout = (event) => {
    petCardsOffset.current = event.nativeEvent.layout.y;
  };

  const scrollToPetCards = () => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(petCardsOffset.current - 12, 0),
      animated: true,
    });
  };

  const handleQuickFilterPress = (filterKey) => {
    setActiveQuickFilter((current) => {
      if (filterKey === 'all') {
        return 'all';
      }

      return current === filterKey ? 'all' : filterKey;
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToPetCards();
      });
    });
  };

  const renderBullets = (items, emptyText) => (
    items.length ? items.map((item) => (
      <View key={item} style={styles.listRow}>
        <View style={styles.listDot} />
        <Text style={styles.listText}>{item}</Text>
      </View>
    )) : <Text style={styles.listEmptyPlaceholder}>{emptyText}</Text>
  );

  const renderInfoGrid = (items) => (
    <View style={styles.infoGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.infoCard}>
          <Text style={styles.infoLabel}>{item.label}</Text>
          <Text style={styles.infoValue}>{item.value || '-'}</Text>
        </View>
      ))}
    </View>
  );

  const renderModalBullets = (items, emptyText) => (
    items.length
      ? items.map((item, idx) => (
          <View key={`${idx}-${String(item).slice(0, 48)}`} style={styles.modalListRow}>
            <View style={styles.modalListDot} />
            <Text style={styles.modalListText}>{item}</Text>
          </View>
        ))
      : <Text style={styles.modalListEmpty}>{emptyText}</Text>
  );

  const renderModalInfoGrid = (items) => (
    <View style={styles.modalInfoGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.modalInfoCard}>
          <Text style={styles.modalInfoLabel}>{item.label}</Text>
          <Text style={styles.modalInfoValue}>{item.value || '-'}</Text>
        </View>
      ))}
    </View>
  );

  const renderTabContentFor = (pet, tabKey) => {
    if (!pet) {
      return (
        <View style={styles.modalBlockCard}>
          <Text style={styles.modalBlockTitle}>No pet selected</Text>
          <Text style={styles.modalBlockCopy}>Choose a pet card above to open its profile.</Text>
        </View>
      );
    }

    if (tabKey === 'Overview') {
      const appointmentInfo = [
        { label: 'Last appointment', value: pet.appointmentHistory?.lastAppointmentDate },
        { label: 'Next appointment', value: pet.appointmentHistory?.nextAppointmentDate },
        { label: 'Status', value: pet.appointmentHistory?.appointmentStatus },
      ];
      const vaccinationList = pet.vaccinationRecords || [];
      const visitList = pet.visits || [];

      return (
        <View>
          {renderModalInfoGrid([
            { label: 'Species', value: pet.species },
            { label: 'Breed', value: pet.breed },
            { label: 'Age', value: formatAge(pet) },
            { label: 'Birthday', value: formatBirthday(pet) },
            { label: 'Weight', value: pet.weight ? `${pet.weight} kg` : '-' },
            { label: 'Sex', value: pet.sex },
          ])}

          <View style={styles.modalInfoCardFull}>
            <Text style={styles.modalInfoLabel}>Special markings</Text>
            <Text style={styles.modalInfoValueFull}>
              {pet.specialMarkings || 'No special markings recorded yet.'}
            </Text>
          </View>

          <View style={styles.modalBlockCard}>
            <Text style={styles.modalBlockTitle}>Vaccination records</Text>
            {renderModalBullets(vaccinationList, 'No vaccination records recorded yet.')}
          </View>

          <View style={styles.modalBlockCard}>
            <Text style={styles.modalBlockTitle}>Visits and appointments</Text>
            <Text style={styles.modalBlockSectionLabel}>Appointment summary</Text>
            {renderModalInfoGrid(appointmentInfo)}
            <Text style={[styles.modalBlockSectionLabel, styles.modalBlockSectionLabelSpaced]}>
              Recent visit timeline
            </Text>
            {renderModalBullets(visitList, 'No visit history recorded yet.')}
          </View>
        </View>
      );
    }

    if (tabKey === 'Medical') {
      return (
        <View style={styles.modalBlockCard}>
          <Text style={styles.modalBlockTitle}>Medical history</Text>
          {renderModalBullets(pet.medicalHistory, 'No medical history recorded yet.')}
        </View>
      );
    }

    if (tabKey === 'Notes') {
      return (
        <View style={styles.modalBlockCard}>
          <Text style={styles.modalBlockTitle}>Veterinarian notes</Text>
          {renderModalBullets(pet.veterinarianNotes || [], 'No veterinarian notes recorded yet.')}
        </View>
      );
    }

    return (
      <View style={styles.modalBlockCard}>
        <Text style={styles.modalBlockTitle}>Profile</Text>
        <Text style={styles.modalBlockCopy}>Select Overview, Medical, or Notes above.</Text>
      </View>
    );
  };

  const settleActiveTabFromPagerOffset = (nativeEvent) => {
    const { contentOffset, layoutMeasurement } = nativeEvent;
    const pageWidth = layoutMeasurement?.width ?? tabPagerWidth;

    if (!pageWidth || pageWidth <= 0) {
      return;
    }

    const index = Math.round(contentOffset.x / pageWidth);
    const safeIndex = Math.min(Math.max(0, index), TABS.length - 1);
    setActiveTab((prev) => (TABS[safeIndex] === prev ? prev : TABS[safeIndex]));
  };

  const handleProfileTabPress = (tab) => {
    const index = TABS.indexOf(tab);
    if (index < 0 || !tabPagerWidth) {
      setActiveTab(tab);
      return;
    }

    setActiveTab(tab);
    requestAnimationFrame(() => {
      tabPagerRef.current?.scrollTo({
        x: index * tabPagerWidth,
        animated: true,
      });
    });
  };

  const handleTabPagerScroll = (event) => {
    settleActiveTabFromPagerOffset(event.nativeEvent);
  };

  const handleTabPagerScrollSettled = (event) => {
    settleActiveTabFromPagerOffset(event.nativeEvent);
  };

  const handleModalPagerHostLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);

    if (nextWidth > 0 && nextWidth !== tabPagerWidth) {
      setTabPagerWidth(nextWidth);
    }
    if (nextHeight > 0 && nextHeight !== tabPagerHostHeight) {
      setTabPagerHostHeight(nextHeight);
    }
  };

  useEffect(() => {
    if (!isProfileVisible || !tabPagerWidth) {
      return;
    }

    const index = Math.max(0, TABS.indexOf(activeTab));

    requestAnimationFrame(() => {
      tabPagerRef.current?.scrollTo({
        x: index * tabPagerWidth,
        animated: false,
      });
    });
  }, [isProfileVisible, selectedPetId, tabPagerWidth]);

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={sharedStyles.background}>
      <SafeAreaView style={sharedStyles.container}>
        <LinearGradient
          colors={['#63B6C5', '#63B6C5', '#63B6C5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={sharedStyles.headerBar}
        >
          <LinearGradient
            colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={sharedStyles.headerTopBand}
          >
            <View style={sharedStyles.headerTopRow}>
            <TouchableOpacity
              style={sharedStyles.brandSection}
              onPress={() => navigation.navigate('staff-screen', { user: currentUser })}
              activeOpacity={0.85}
            >
              <View style={sharedStyles.logoWrap}>
                <Image source={require('../../assets/paw1.png')} style={sharedStyles.headerLogo} resizeMode="contain" />
              </View>
              <View style={sharedStyles.brandBlock}>
                <Text style={sharedStyles.headerTitle}>PawCruz</Text>
                <Text style={sharedStyles.headerSubtitle}>Staff Pets Profile</Text>
              </View>
            </TouchableOpacity>

            <View style={sharedStyles.headerActions}>
              <TouchableOpacity
                style={sharedStyles.notifButton}
                onPress={() => navigation.navigate('StaffNotif', { user: currentUser })}
                activeOpacity={0.85}
              >
                <View style={sharedStyles.notifBadge} />
                <Image source={require('../../assets/Bell_Icon.png')} style={sharedStyles.notifIcon} resizeMode="contain" />
              </TouchableOpacity>

              <TouchableOpacity
                style={sharedStyles.profileButton}
                onPress={() => navigation.navigate('StaffProfile', { user: currentUser })}
                activeOpacity={0.85}
              >
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={sharedStyles.profileButtonImage} resizeMode="cover" />
                ) : (
                  <Image source={DEFAULT_PROFILE_IMAGE} style={sharedStyles.profileIcon} resizeMode="contain" />
                )}
              </TouchableOpacity>
            </View>
            </View>
          </LinearGradient>

          <Animated.View style={[sharedStyles.headerBottomRowWrap, lowerHeaderAnimatedStyle]}>
            <View style={sharedStyles.headerBottomRow}>
            <TouchableOpacity style={sharedStyles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={sharedStyles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={sharedStyles.ownerSummary}>
              <Text style={sharedStyles.headerCaption}>Patient records</Text>
              <Text style={sharedStyles.ownerName}>{headerDisplayName}</Text>
            </View>
          </View>
          </Animated.View>

          {isHeaderMenuVisible ? (
            <Animated.View
              style={[
                sharedStyles.headerMenuPanel,
                {
                  opacity: headerMenuAnimation,
                  transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
                },
              ]}
            >
              {headerMenuItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={sharedStyles.headerMenuItem}
                  onPress={() => handleHeaderMenuPress(item.route)}
                  activeOpacity={0.88}
                >
                  <View style={sharedStyles.headerMenuItemIconWrap}>
                    <Image source={item.icon} style={sharedStyles.headerMenuItemIcon} resizeMode="contain" />
                  </View>
                  <Text style={sharedStyles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={sharedStyles.scrollContent}

          onScroll={handleScroll}
          scrollEventThrottle={16}>
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Quick Overview</Text>
          </View>

          <View style={styles.overviewCard}>
            <View style={styles.summaryGrid}>
              {summaryCards.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.summaryCard,
                    activeQuickFilter === item.key && styles.summaryCardActive,
                  ]}
                  onPress={() => handleQuickFilterPress(item.key)}
                  activeOpacity={0.9}
                >
                  <View style={[styles.summaryAccent, { backgroundColor: item.color }]} />
                  <Text style={styles.summaryValue}>{item.value}</Text>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.controlsCard}>
            <Text style={styles.controlsTitle}>Find Pets</Text>
            <View style={styles.searchBarWrap}>
              <Image source={require('../../assets/Search.png')} style={styles.searchIcon} resizeMode="contain" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                placeholder="Search for a pet, owner, breed, or reference..."
                placeholderTextColor="#8aa2b4"
              />
            </View>
            <TouchableOpacity
              style={styles.createPetButtonTouchArea}
              activeOpacity={0.92}
              onPress={() => navigation.navigate('PetOwnerMyPetsEdit', {
                user: currentUser,
                isStaffCreate: true,
              })}
            >
              <LinearGradient
                colors={['#447C99', '#63B6C5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.createPetButton}
              >
                <View style={styles.createPetIconWrap}>
                  <Text style={styles.createPetPlus}>+</Text>
                </View>
                <Text style={styles.createPetText}>Create pet for owner</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {filteredPets.length ? (
            <View style={styles.listWrap} onLayout={handlePetCardsLayout}>
              <Text style={styles.listWrapTitle}>Pet Owner&apos;s Pets</Text>

              {filteredPets.map((pet) => {
                const isActive = pet.id === selectedPet?.id;
                const statusMeta = PET_STATUS_META[pet.status] || DEFAULT_PET_STATUS_META;

                return (
                  <View
                    key={pet.id}
                    style={[styles.petListCard, isActive && styles.petListCardActive]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={() => handleSelectPet(pet.id)}
                    >
                      <View style={styles.petHeaderRow}>
                        <View style={styles.petIdentity}>
                          <View style={styles.avatarWrap}>
                            <View
                              style={[
                                styles.avatarCircle,
                                { backgroundColor: pet.profileColor || '#eef6fb' },
                              ]}
                            >
                              <Text style={styles.avatarLetter}>
                                {(pet.name || 'P').trim().charAt(0).toUpperCase() || 'P'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.petTextWrap}>
                            <Text style={styles.petReferenceLine} numberOfLines={1}>
                              {pet.referenceCode || 'No reference'}
                            </Text>
                            <Text style={styles.petCardTitle} numberOfLines={1}>
                              {pet.name || 'Unnamed Pet'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.petMetaRow}>
                        <View style={styles.petMetaCard}>
                          <Text style={styles.petMetaLabel}>Species</Text>
                          <Text style={styles.petMetaValue} numberOfLines={2}>
                            {pet.species || '-'}
                          </Text>
                        </View>
                        <View style={styles.petMetaCard}>
                          <Text style={styles.petMetaLabel}>Breed</Text>
                          <Text style={styles.petMetaValue} numberOfLines={2}>
                            {pet.breed || '-'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.petMetaRow}>
                        <View style={styles.petMetaCard}>
                          <Text style={styles.petMetaLabel}>Owner</Text>
                          <Text style={styles.petMetaValue} numberOfLines={2}>
                            {pet.ownerName || 'Not assigned'}
                          </Text>
                        </View>
                        <View style={styles.petMetaCard}>
                          <Text style={styles.petMetaLabel}>Veterinarian</Text>
                          <Text style={styles.petMetaValue} numberOfLines={2}>
                            {pet.veterinarianAssigned || 'Not yet assigned'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.petFooterRow}>
                      <View style={styles.petStatusWrap}>
                        <Text style={styles.petMetaLabel}>Profile status</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: statusMeta.bg, borderColor: statusMeta.border },
                          ]}
                        >
                          <Text style={[styles.statusBadgeText, { color: statusMeta.text }]}>
                            {pet.status || 'Active'}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleViewProfile(pet.id)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.actionButtonText}>View</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyCard} onLayout={handlePetCardsLayout}>
              <Text style={styles.emptyTitle}>No pet profile found</Text>
              <Text style={styles.emptyText}>Try another pet name, owner, breed, or reference code.</Text>
            </View>
          )}

        </ScrollView>

        <Modal
          transparent
          animationType="fade"
          visible={Boolean(selectedPet && isProfileVisible)}
          onRequestClose={handleHideProfile}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalColumn}>
              <View style={styles.modalCard}>
                <View style={styles.modalProfileHeader}>
                  <View style={styles.modalProfileTopRow}>
                    <View style={styles.modalAvatar}>
                      <Text style={styles.modalAvatarLetter}>
                        {(selectedPet?.name || '?').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.modalProfileRight}>
                      <Text style={styles.modalProfileName}>{selectedPet?.name || 'Unnamed Pet'}</Text>
                      <Text style={styles.modalProfileBreed}>{selectedPet?.breed || 'No breed yet'}</Text>
                      <View style={styles.modalMetaRow}>
                        <Text style={styles.modalMetaLabel}>Ref: </Text>
                        <Text style={styles.modalMetaValue}>{selectedPet?.referenceCode || '-'}</Text>
                      </View>
                      <View style={styles.modalMetaRow}>
                        <Text style={styles.modalMetaLabel}>Owner: </Text>
                        <Text style={styles.modalMetaValue}>{selectedPet?.ownerName || '-'}</Text>
                      </View>
                      <View style={styles.modalMetaRow}>
                        <Text style={styles.modalMetaLabel}>Vet: </Text>
                        <Text style={styles.modalMetaValue}>{selectedPet?.veterinarianAssigned || '-'}</Text>
                      </View>
                      {selectedPet?.status ? (
                        <View
                          style={[
                            styles.modalStatusPill,
                            {
                              backgroundColor: (PET_STATUS_META[selectedPet.status] || DEFAULT_PET_STATUS_META).bg,
                              borderColor: (PET_STATUS_META[selectedPet.status] || DEFAULT_PET_STATUS_META).border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.modalStatusPillText,
                              { color: (PET_STATUS_META[selectedPet.status] || DEFAULT_PET_STATUS_META).text },
                            ]}
                            numberOfLines={1}
                          >
                            {selectedPet.status}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={styles.modalBody}>
                  <View style={styles.modalTabsRow}>
                    {TABS.map((tab) => (
                      <TouchableOpacity
                        key={tab}
                        style={[styles.modalTab, activeTab === tab && styles.modalTabActive]}
                        onPress={() => handleProfileTabPress(tab)}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.modalTabText, activeTab === tab && styles.modalTabTextActive]}>
                          {tab}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.modalTabDivider} />

                  <View style={styles.modalPagerHost} onLayout={handleModalPagerHostLayout}>
                    <ScrollView
                      ref={tabPagerRef}
                      horizontal
                      pagingEnabled
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      onScroll={handleTabPagerScroll}
                      onMomentumScrollEnd={handleTabPagerScrollSettled}
                      onScrollEndDrag={handleTabPagerScrollSettled}
                      scrollEventThrottle={16}
                      decelerationRate="fast"
                      alwaysBounceHorizontal={false}
                      style={[
                        styles.modalTabPager,
                        tabPagerHostHeight > 0 ? { height: tabPagerHostHeight } : null,
                      ]}
                    >
                      {TABS.map((tab) => (
                        <ScrollView
                          key={tab}
                          style={[
                            styles.modalTabPage,
                            { width: tabPagerWidth },
                            tabPagerHostHeight > 0 ? { height: tabPagerHostHeight } : { flex: 1 },
                          ]}
                          contentContainerStyle={styles.modalTabPageContent}
                          showsVerticalScrollIndicator
                          nestedScrollEnabled
                          directionalLockEnabled
                          bounces
                        >
                          {renderTabContentFor(selectedPet, tab)}
                        </ScrollView>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.modalFooterRow}>
                  <TouchableOpacity
                    style={styles.modalFooterBtnPrimary}
                    onPress={handleEditPet}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalFooterBtnPrimaryText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalFooterBtnSecondary}
                    onPress={handleHideProfile}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalFooterBtnSecondaryText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  sectionHeaderWrap: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#24566d',
  },
  overviewCard: {
    paddingVertical: 2,
    marginBottom: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#f7fcff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e3f1f8',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 12,
  },
  summaryCardActive: {
    borderColor: '#447C99',
    backgroundColor: '#eef8ff',
  },
  summaryAccent: {
    width: 30,
    height: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#24566d',
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#638095',
  },
  controlsCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 16,
    marginBottom: 14,
  },
  controlsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 12,
  },
  createPetButtonTouchArea: {
    marginTop: 14,
    borderRadius: 20,
    shadowColor: '#447C99',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  createPetButton: {
    minHeight: 60,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  createPetIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  createPetPlus: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
    color: '#ffffff',
  },
  createPetText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  searchBarWrap: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f6fbff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    width: 19,
    height: 19,
    tintColor: '#5f7f94',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
  },
  listWrap: {
    marginBottom: 18,
  },
  listWrapTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 12,
  },
  petListCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 20,
    marginBottom: 16,
  },
  petListCardActive: {
    borderColor: '#447C99',
    backgroundColor: '#eef8ff',
  },
  petHeaderRow: {
    marginBottom: 18,
  },
  petIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    marginRight: 12,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#d5e7f2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '900',
    color: '#24566d',
  },
  petTextWrap: {
    flex: 1,
  },
  petReferenceLine: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2d7fb3',
  },
  petCardTitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
  },
  petMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  petMetaCard: {
    width: '48.5%',
    backgroundColor: '#f8fcff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4f1f8',
    padding: 15,
  },
  petMetaLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  petMetaValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#24566d',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  petFooterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
  },
  petStatusWrap: {
    flex: 1,
    marginRight: 12,
  },
  actionButton: {
    minWidth: 90,
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  emptyCard: {
    backgroundColor: '#f4fbff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#d9ecf7',
    padding: 18,
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#648398',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 18, 28, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalColumn: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#dfedf7',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    width: '100%',
    maxWidth: 520,
    maxHeight: MODAL_CARD_MAX_HEIGHT,
    height: MODAL_CARD_MAX_HEIGHT,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalProfileHeader: {
    marginBottom: 12,
    flexShrink: 0,
  },
  modalProfileTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  modalAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e8f4fc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#d5e7f2',
  },
  modalAvatarLetter: {
    fontSize: 22,
    fontWeight: '900',
    color: '#24566d',
  },
  modalProfileRight: {
    flex: 1,
    minWidth: 0,
  },
  modalProfileName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#24566d',
    lineHeight: 28,
  },
  modalProfileBreed: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#648398',
  },
  modalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    alignItems: 'center',
  },
  modalMetaLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5d7b91',
  },
  modalMetaValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#24566d',
    flexShrink: 1,
  },
  modalStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  modalStatusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
    marginTop: 2,
    flexDirection: 'column',
  },
  modalTabsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    paddingBottom: 10,
  },
  modalTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#eef6fb',
    borderWidth: 1,
    borderColor: '#d5e7f2',
    paddingHorizontal: 6,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTabActive: {
    borderColor: '#447C99',
    backgroundColor: '#447C99',
    borderWidth: 1,
  },
  modalTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#24566d',
  },
  modalTabTextActive: {
    color: '#ffffff',
  },
  modalTabDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e1edf6',
    marginBottom: 8,
    flexShrink: 0,
  },
  modalPagerHost: {
    flex: 1,
    minHeight: 0,
  },
  modalTabPager: {
    flex: 1,
  },
  modalTabPage: {
    flex: 1,
  },
  modalTabPageContent: {
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 0,
    flexGrow: 1,
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8f0f6',
    flexShrink: 0,
  },
  modalFooterBtnPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#447C99',
    borderWidth: 1,
    borderColor: '#447C99',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFooterBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalFooterBtnSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#fff5f4',
    borderWidth: 1.5,
    borderColor: '#e8a598',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFooterBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#b63d32',
  },
  modalInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  modalInfoCard: {
    width: '48%',
    backgroundColor: '#f7fbfe',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e0edf6',
    padding: 14,
    marginBottom: 10,
  },
  modalInfoCardFull: {
    width: '100%',
    backgroundColor: '#f7fbfe',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e0edf6',
    padding: 14,
    marginBottom: 10,
  },
  modalInfoLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  modalInfoValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#24566d',
    lineHeight: 21,
  },
  modalInfoValueFull: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#5d7b91',
  },
  modalBlockCard: {
    backgroundColor: '#f9fcff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e1edf6',
    padding: 16,
    marginBottom: 12,
  },
  modalBlockTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 10,
  },
  modalBlockCopy: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#5d7b91',
  },
  modalBlockSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalBlockSectionLabelSpaced: {
    marginTop: 14,
  },
  modalListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalListDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2c7fb8',
    marginTop: 6,
    marginRight: 10,
  },
  modalListText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#5d7b91',
  },
  modalListEmpty: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#7793a5',
  },
  blockSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  blockSectionLabelSpaced: {
    marginTop: 18,
  },
  blockCard: {
    backgroundColor: '#f9fcff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e1edf6',
    padding: 18,
    marginBottom: 16,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
    marginBottom: 12,
  },
  blockCopy: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#5d7b91',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoCard: {
    width: '48%',
    backgroundColor: '#f7fbfe',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e0edf6',
    padding: 16,
    marginBottom: 14,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6a8aa0',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#24566d',
    lineHeight: 21,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  listDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2c7fb8',
    marginTop: 5,
    marginRight: 10,
  },
  listText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#5d7b91',
  },
  listEmptyPlaceholder: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#7793a5',
  },
});

export {
  createStaffEditDraft,
  getStaffPets,
  hasIncompletePetDraft,
  linkCreatedPetToOwner,
  saveStaffPetFromDraft,
};

export default StaffPetsProfile;

