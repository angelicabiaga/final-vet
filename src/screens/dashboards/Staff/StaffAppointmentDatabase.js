import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
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
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/StaffAppointmentDesign';
import { appointmentStyles } from './StaffAppointmentStyles';
import {
  DetailNotificationCard,
  DetailRow,
  StatusPill,
  SummaryMetricCard,
} from './StaffAppointmentParts';
import {
  HEADER_MENU_ITEMS,
  INITIAL_APPOINTMENTS,
  SLOT_STATUS,
  SLOT_STATUS_META,
  TODAY_DATE_KEY,
  formatFullDate,
  fromDateKey,
  getReadableStatus,
  getSlotStatusKeyForAppointment,
  parseTimeLabel,
} from './StaffAppointmentData';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const BUCKET_FILTERS = [
  { key: 'all', label: 'All Records' },
  { key: 'new', label: 'New Bookings' },
  { key: 'old', label: 'Old Bookings' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All Status' },
  { key: 'Pending', label: 'Pending Request' },
  { key: 'Confirmed', label: 'Confirmed' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Cancelled', label: 'Cancelled' },
];

const getBucketMeta = (bucketKey) => {
  if (bucketKey === 'old') {
    return {
      label: 'Old Booking',
      color: '#6d7f90',
      background: '#eef3f6',
      border: '#d7e1e7',
    };
  }

  return {
    label: 'New Booking',
    color: '#2f8d59',
    background: '#e9f8ef',
    border: '#bfe8cf',
  };
};

const getDisplayStatus = (status) =>
  status === 'Pending' ? 'Pending Request' : getReadableStatus(status || '');

const getAppointmentMoment = (appointment) =>
  fromDateKey(appointment.dateKey).getTime() + parseTimeLabel(appointment.time) * 60000;

const getRecordBucket = (appointment) => {
  const appointmentDate = fromDateKey(appointment.dateKey);
  const todayDate = fromDateKey(TODAY_DATE_KEY);
  const normalizedAppointmentDate = new Date(
    appointmentDate.getFullYear(),
    appointmentDate.getMonth(),
    appointmentDate.getDate(),
  );
  const normalizedTodayDate = new Date(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate(),
  );

  if (
    appointment.status === 'Cancelled' ||
    appointment.status === 'Completed' ||
    normalizedAppointmentDate < normalizedTodayDate
  ) {
    return 'old';
  }

  return 'new';
};

const matchesSearch = (appointment, searchValue) => {
  const query = searchValue.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const searchableFields = [
    appointment.referenceCode,
    appointment.ownerName,
    appointment.petName,
    appointment.petBreed,
    appointment.reason,
    appointment.veterinarian,
    appointment.status,
    getDisplayStatus(appointment.status),
    formatFullDate(appointment.dateKey),
    appointment.time,
    appointment.lastUpdate,
    appointment.cancellationReason,
  ];

  return searchableFields.some((field) => String(field || '').toLowerCase().includes(query));
};

const compareAppointments = (left, right, activeBucket) => {
  const leftBucket = getRecordBucket(left);
  const rightBucket = getRecordBucket(right);

  if (activeBucket === 'all' && leftBucket !== rightBucket) {
    return leftBucket === 'new' ? -1 : 1;
  }

  const leftMoment = getAppointmentMoment(left);
  const rightMoment = getAppointmentMoment(right);
  const shouldShowLatestFirst =
    activeBucket === 'old' ||
    (activeBucket === 'all' && leftBucket === 'old' && rightBucket === 'old');

  if (shouldShowLatestFirst) {
    return rightMoment - leftMoment;
  }

  return leftMoment - rightMoment;
};

const StaffAppointmentDatabase = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const appointmentRecords = route?.params?.appointments || INITIAL_APPOINTMENTS;
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Staff';

  const scrollViewRef = useRef(null);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);

  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [activeBucket, setActiveBucket] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showRecordModal, setShowRecordModal] = useState(false);

  const navigateWithUser = (screenName) => {
    navigation.navigate(screenName, { user: loggedInUser });
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

    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    openHeaderMenu();
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

  const summaryCards = useMemo(
    () => [
      {
        key: 'all',
        title: 'All Records',
        value: appointmentRecords.length,
        statusKey: SLOT_STATUS.CONFIRMED,
      },
      {
        key: 'new',
        title: 'New Bookings',
        value: appointmentRecords.filter((item) => getRecordBucket(item) === 'new').length,
        statusKey: SLOT_STATUS.PENDING,
      },
      {
        key: 'old',
        title: 'Old Bookings',
        value: appointmentRecords.filter((item) => getRecordBucket(item) === 'old').length,
        statusKey: SLOT_STATUS.CANCELLED,
      },
      {
        key: 'pending',
        title: 'Pending Requests',
        value: appointmentRecords.filter((item) => item.status === 'Pending').length,
        statusKey: SLOT_STATUS.PENDING,
      },
    ],
    [appointmentRecords],
  );

  const filteredAppointments = useMemo(
    () =>
      [...appointmentRecords]
        .filter((item) => activeBucket === 'all' || getRecordBucket(item) === activeBucket)
        .filter((item) => activeStatus === 'all' || item.status === activeStatus)
        .filter((item) => matchesSearch(item, searchValue))
        .sort((left, right) => compareAppointments(left, right, activeBucket)),
    [activeBucket, activeStatus, appointmentRecords, searchValue],
  );

  const filteredLabel =
    filteredAppointments.length === appointmentRecords.length
      ? `Showing all ${appointmentRecords.length} booking records`
      : `Showing ${filteredAppointments.length} of ${appointmentRecords.length} booking records`;

  const selectedRecordStatusMeta = selectedRecord
    ? SLOT_STATUS_META[getSlotStatusKeyForAppointment(selectedRecord.status)]
    : SLOT_STATUS_META[SLOT_STATUS.CONFIRMED];
  const selectedRecordBucketMeta = selectedRecord
    ? getBucketMeta(getRecordBucket(selectedRecord))
    : getBucketMeta('new');

  const openRecordModal = (appointment) => {
    setSelectedRecord(appointment);
    setShowRecordModal(true);
  };

  const closeRecordModal = () => {
    setShowRecordModal(false);
    setSelectedRecord(null);
  };

  const renderFilterChip = (item, currentValue, onPress) => {
    const isActive = item.key === currentValue;

    return (
      <TouchableOpacity
        key={item.key}
        style={[
          databaseStyles.filterChip,
          isActive && databaseStyles.filterChipActive,
        ]}
        onPress={() => onPress(item.key)}
        activeOpacity={0.9}
      >
        <Text
          style={[
            databaseStyles.filterChipText,
            isActive && databaseStyles.filterChipTextActive,
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={['#022c42', '#0c212b', '#15394e']}
      style={styles.background}
    >
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
                <Text style={styles.headerSubtitle}>Appointment Database</Text>
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
                <Text style={styles.headerCaption}>Searchable booking records</Text>
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
              {HEADER_MENU_ITEMS.map((item, index) => {
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
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.sectionSubtitle}>
              Search new and old bookings in one staff-friendly appointment database
            </Text>
          </View>

          <View style={appointmentStyles.summaryGrid}>
            {summaryCards.map((item) => (
              <SummaryMetricCard
                key={item.key}
                title={item.title}
                value={item.value}
                statusMeta={SLOT_STATUS_META[item.statusKey]}
                style={appointmentStyles.summaryCard}
              />
            ))}
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Database Controls</Text>
            <Text style={styles.sectionSubtitle}>
              Use search and filters to find pending requests, completed visits, and older records
            </Text>
          </View>

          <View style={styles.managementCard}>
            <View style={databaseStyles.searchCard}>
              <Text style={databaseStyles.searchLabel}>Search Booking Records</Text>
              <TextInput
                value={searchValue}
                onChangeText={setSearchValue}
                placeholder="Search by owner, pet, animal code, veterinarian, or reason"
                placeholderTextColor="#8aa1b4"
                style={databaseStyles.searchInput}
              />
            </View>

            <View style={databaseStyles.toolbarRow}>
              <TouchableOpacity
                style={databaseStyles.calendarButton}
                onPress={() => navigateWithUser('StaffAppointment')}
                activeOpacity={0.9}
              >
                <Text style={databaseStyles.calendarButtonText}>Open Calendar View</Text>
              </TouchableOpacity>

              {searchValue ? (
                <TouchableOpacity
                  style={databaseStyles.clearButton}
                  onPress={() => setSearchValue('')}
                  activeOpacity={0.9}
                >
                  <Text style={databaseStyles.clearButtonText}>Clear Search</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={databaseStyles.filterTitle}>Record Type</Text>
            <View style={databaseStyles.filterRow}>
              {BUCKET_FILTERS.map((item) =>
                renderFilterChip(item, activeBucket, setActiveBucket),
              )}
            </View>

            <Text style={databaseStyles.filterTitle}>Status</Text>
            <View style={databaseStyles.filterRow}>
              {STATUS_FILTERS.map((item) =>
                renderFilterChip(item, activeStatus, setActiveStatus),
              )}
            </View>

            <View style={databaseStyles.resultSummaryCard}>
              <Text style={databaseStyles.resultSummaryTitle}>Current Result Set</Text>
              <Text style={databaseStyles.resultSummaryText}>{filteredLabel}</Text>
            </View>
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Booking Records</Text>
            <Text style={styles.sectionSubtitle}>
              Compact list view for new and old appointments
            </Text>
          </View>

          {filteredAppointments.length ? (
            filteredAppointments.map((appointment) => {
              const appointmentMeta =
                SLOT_STATUS_META[getSlotStatusKeyForAppointment(appointment.status)];
              const bucketMeta = getBucketMeta(getRecordBucket(appointment));

              return (
                <View key={appointment.id} style={styles.managementCard}>
                  <View style={databaseStyles.recordHeader}>
                    <View style={databaseStyles.recordHeaderCopy}>
                      <Text style={databaseStyles.recordCode}>
                        {appointment.referenceCode || appointment.id}
                      </Text>
                      <Text style={styles.managementTitle}>{appointment.petName}</Text>
                      <Text style={styles.managementMeta}>
                        {appointment.ownerName} | {appointment.petBreed}
                      </Text>
                    </View>

                    <View style={databaseStyles.recordHeaderPills}>
                      <View
                        style={[
                          databaseStyles.bucketPill,
                          {
                            backgroundColor: bucketMeta.background,
                            borderColor: bucketMeta.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            databaseStyles.bucketPillText,
                            { color: bucketMeta.color },
                          ]}
                        >
                          {bucketMeta.label}
                        </Text>
                      </View>

                      <StatusPill
                        label={getDisplayStatus(appointment.status)}
                        backgroundColor={appointmentMeta.background}
                        borderColor={appointmentMeta.border}
                        color={appointmentMeta.color}
                      />
                    </View>
                  </View>

                  <View style={databaseStyles.recordGrid}>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Date</Text>
                      <Text style={databaseStyles.recordGridValue}>
                        {formatFullDate(appointment.dateKey)}
                      </Text>
                    </View>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Time</Text>
                      <Text style={databaseStyles.recordGridValue}>{appointment.time}</Text>
                    </View>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Veterinarian</Text>
                      <Text style={databaseStyles.recordGridValue}>
                        {appointment.veterinarian || 'Not assigned yet'}
                      </Text>
                    </View>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Reason</Text>
                      <Text style={databaseStyles.recordGridValue}>{appointment.reason}</Text>
                    </View>
                  </View>

                  <View style={databaseStyles.recordUpdateCard}>
                    <Text style={databaseStyles.recordUpdateLabel}>Latest Update</Text>
                    <Text style={databaseStyles.recordUpdateText}>{appointment.lastUpdate}</Text>
                  </View>

                  {appointment.status === 'Cancelled' && appointment.cancellationReason ? (
                    <View style={appointmentStyles.cancellationNote}>
                      <Text style={appointmentStyles.cancellationNoteTitle}>
                        Cancellation Reason
                      </Text>
                      <Text style={appointmentStyles.cancellationNoteText}>
                        {appointment.cancellationReason}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={databaseStyles.recordActionButton}
                    onPress={() => openRecordModal(appointment)}
                    activeOpacity={0.9}
                  >
                    <Text style={databaseStyles.recordActionButtonText}>View Record</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <View style={styles.managementCard}>
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateTitle}>No matching booking records</Text>
                <Text style={styles.emptyStateText}>
                  Try a different search term or switch the record filters to see more results.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <Modal
          transparent
          animationType="fade"
          visible={showRecordModal}
          onRequestClose={closeRecordModal}
        >
          <View style={styles.modalOverlay}>
            <View style={databaseStyles.modalCard}>
              <ScrollView
                style={databaseStyles.modalScroll}
                contentContainerStyle={databaseStyles.modalContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>
                  {selectedRecord ? `${selectedRecord.petName} Record` : 'Booking Record'}
                </Text>
                <Text style={styles.modalMessage}>
                  Full staff view for this appointment record.
                </Text>

                {selectedRecord ? (
                  <>
                    <View style={databaseStyles.modalPillRow}>
                      <View
                        style={[
                          databaseStyles.bucketPill,
                          {
                            backgroundColor: selectedRecordBucketMeta.background,
                            borderColor: selectedRecordBucketMeta.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            databaseStyles.bucketPillText,
                            { color: selectedRecordBucketMeta.color },
                          ]}
                        >
                          {selectedRecordBucketMeta.label}
                        </Text>
                      </View>

                      <StatusPill
                        label={getDisplayStatus(selectedRecord.status)}
                        backgroundColor={selectedRecordStatusMeta.background}
                        borderColor={selectedRecordStatusMeta.border}
                        color={selectedRecordStatusMeta.color}
                      />
                    </View>

                    <View style={appointmentStyles.detailInfoCard}>
                      <DetailRow label="Owner name" value={selectedRecord.ownerName} />
                      <DetailRow
                        label="Pet"
                        value={`${selectedRecord.petName} - ${selectedRecord.petBreed}`}
                      />
                      <DetailRow
                        label="Animal code reference"
                        value={selectedRecord.referenceCode || 'Not provided'}
                      />
                      <DetailRow
                        label="Veterinarian"
                        value={selectedRecord.veterinarian || 'Not assigned yet'}
                      />
                      <DetailRow
                        label="Appointment date"
                        value={formatFullDate(selectedRecord.dateKey)}
                      />
                      <DetailRow label="Time" value={selectedRecord.time} />
                      <DetailRow label="Reason" value={selectedRecord.reason} />
                      <DetailRow
                        label="Status"
                        value={getDisplayStatus(selectedRecord.status)}
                      />
                    </View>

                    <View style={appointmentStyles.detailNotificationRow}>
                      <DetailNotificationCard
                        title="Pet Owner"
                        text={
                          selectedRecord.ownerNotified
                            ? 'Notification sent'
                            : 'Notification pending'
                        }
                        active={selectedRecord.ownerNotified}
                      />
                      <DetailNotificationCard
                        title="Veterinarian"
                        text={
                          selectedRecord.vetSynced
                            ? 'Schedule synced'
                            : 'Sync still pending'
                        }
                        active={selectedRecord.vetSynced}
                      />
                    </View>

                    <View style={databaseStyles.recordUpdateCard}>
                      <Text style={databaseStyles.recordUpdateLabel}>Latest Update</Text>
                      <Text style={databaseStyles.recordUpdateText}>
                        {selectedRecord.lastUpdate}
                      </Text>
                    </View>

                    {selectedRecord.status === 'Cancelled' &&
                    selectedRecord.cancellationReason ? (
                      <View style={appointmentStyles.cancellationNote}>
                        <Text style={appointmentStyles.cancellationNoteTitle}>
                          Cancellation Reason
                        </Text>
                        <Text style={appointmentStyles.cancellationNoteText}>
                          {selectedRecord.cancellationReason}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </ScrollView>

              <View style={databaseStyles.modalButtonRow}>
                <TouchableOpacity
                  style={databaseStyles.modalSecondaryButton}
                  onPress={closeRecordModal}
                  activeOpacity={0.9}
                >
                  <Text style={databaseStyles.modalSecondaryButtonText}>Close</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={databaseStyles.modalPrimaryButton}
                  onPress={() => {
                    closeRecordModal();
                    navigateWithUser('StaffAppointment');
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={databaseStyles.modalPrimaryButtonText}>Open Calendar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const databaseStyles = StyleSheet.create({
  searchCard: {
    borderRadius: 20,
    backgroundColor: '#f4fbff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    padding: 14,
    marginBottom: 14,
  },

  searchLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  searchInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#173f5c',
  },

  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  calendarButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#173f5c',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
    flexGrow: 1,
    marginRight: 10,
  },

  calendarButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },

  clearButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#eef5fb',
    borderWidth: 1,
    borderColor: '#d7e4ef',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  clearButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4e6a7b',
  },

  filterTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },

  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d7e4ef',
    backgroundColor: '#f5f9fc',
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
  },

  filterChipActive: {
    backgroundColor: '#173f5c',
    borderColor: '#173f5c',
  },

  filterChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#547285',
  },

  filterChipTextActive: {
    color: '#ffffff',
  },

  resultSummaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#eef8ff',
    padding: 14,
  },

  resultSummaryTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 4,
    textTransform: 'uppercase',
  },

  resultSummaryText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#59788e',
  },

  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  recordHeaderCopy: {
    flex: 1,
    marginRight: 12,
  },

  recordHeaderPills: {
    alignItems: 'flex-end',
  },

  recordCode: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  bucketPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },

  bucketPillText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  recordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  recordGridItem: {
    width: '48.5%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f4fbff',
    padding: 12,
    marginBottom: 10,
  },

  recordGridLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    marginBottom: 5,
  },

  recordGridValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#173f5c',
  },

  recordUpdateCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f4fbff',
    padding: 14,
    marginBottom: 14,
  },

  recordUpdateLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  recordUpdateText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#5a788e',
  },

  recordActionButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#eef8ff',
    borderWidth: 1,
    borderColor: '#d7edf9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  recordActionButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#173f5c',
  },

  modalCard: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#f8fcff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#dceef8',
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },

  modalScroll: {
    flexGrow: 0,
  },

  modalContent: {
    paddingBottom: 16,
  },

  modalPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 16,
  },

  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  modalSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#eaf1f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },

  modalSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4f6a7b',
  },

  modalPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: '#173f5c',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalPrimaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
  },
});

export default StaffAppointmentDatabase;
