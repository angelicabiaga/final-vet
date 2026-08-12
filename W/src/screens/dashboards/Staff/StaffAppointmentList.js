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
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Dropdown } from 'react-native-element-dropdown';
import { styles } from '../../styles/StaffAppointmentDesign';
import { appointmentStyles } from './StaffAppointmentStyles';
import {
  DetailNotificationCard,
  DetailRow,
  StatusPill,
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
const BACK_ICON = require('../../assets/back.png');
const RESCHEDULE_TIME_OPTIONS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '4:30 PM'];
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Confirmed', label: 'Confirmed' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'Rescheduled', label: 'Rescheduled' },
];
const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((item) => ({
  label: item.label,
  value: item.key,
}));

const createDateKey = (year, monthIndex, day) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const addDaysToDateKey = (dateKey, offset) => {
  const baseDate = fromDateKey(dateKey);
  const nextDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + offset,
  );

  return createDateKey(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
};

const getDisplayStatus = (status) =>
  status === 'Pending' ? 'Pending Request' : getReadableStatus(status || '');

const getSearchableFields = (appointment) => [
  appointment.ownerName,
  appointment.petName,
  appointment.petBreed,
  appointment.veterinarian,
  appointment.referenceCode,
  appointment.reason,
  appointment.time,
  appointment.bookingType,
  appointment.status,
  getDisplayStatus(appointment.status),
  formatFullDate(appointment.dateKey),
];

const matchesSearch = (appointment, searchValue) => {
  const query = searchValue.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return getSearchableFields(appointment).some((field) =>
    String(field || '').toLowerCase().includes(query),
  );
};

const sortAppointments = (appointments) =>
  [...appointments].sort((left, right) => {
    const dateDifference = fromDateKey(left.dateKey) - fromDateKey(right.dateKey);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return parseTimeLabel(left.time) - parseTimeLabel(right.time);
  });

const StaffAppointmentList = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const initialAppointments = route?.params?.appointments || INITIAL_APPOINTMENTS;
  const initialDateFilter = route?.params?.selectedDateKey || 'all';
  const { width: screenWidth } = useWindowDimensions();
  const isCompactScreen = screenWidth <= 390;
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

  const [appointments, setAppointments] = useState(sortAppointments(initialAppointments));
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [activeStatus, setActiveStatus] = useState('all');
  const [activeDateKey, setActiveDateKey] = useState(initialDateFilter);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState('');
  const [rescheduleDateKey, setRescheduleDateKey] = useState(TODAY_DATE_KEY);
  const [rescheduleTime, setRescheduleTime] = useState(RESCHEDULE_TIME_OPTIONS[0]);

  const navigateWithUser = (screenName) => {
    if (screenName === 'StaffAppointment') {
      navigation.navigate(screenName, {
        user: loggedInUser,
        appointments,
        selectedDateKey: activeDateKey === 'all' ? TODAY_DATE_KEY : activeDateKey,
      });
      return;
    }

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

  const pendingCount = useMemo(
    () => appointments.filter((item) => item.status === 'Pending').length,
    [appointments],
  );

  const dateFilterOptions = useMemo(() => {
    const uniqueDateKeys = new Set(appointments.map((item) => item.dateKey));

    if (initialDateFilter !== 'all') {
      uniqueDateKeys.add(initialDateFilter);
    }

    return [
      { key: 'all', label: 'All Dates' },
      ...sortAppointments(
        [...uniqueDateKeys].map((dateKey) => ({
          dateKey,
          time: '12:00 AM',
        })),
      ).map((item) => ({
        key: item.dateKey,
        label: formatFullDate(item.dateKey),
      })),
    ];
  }, [appointments, initialDateFilter]);

  const dateDropdownOptions = useMemo(
    () =>
      dateFilterOptions.map((item) => ({
        label: item.label,
        value: item.key,
      })),
    [dateFilterOptions],
  );

  const filteredAppointments = useMemo(
    () =>
      appointments.filter((item) => {
        const matchesStatus = activeStatus === 'all' || item.status === activeStatus;
        const matchesDate = activeDateKey === 'all' || item.dateKey === activeDateKey;
        return matchesStatus && matchesDate && matchesSearch(item, searchValue);
      }),
    [activeDateKey, activeStatus, appointments, searchValue],
  );

  const rescheduleDateOptions = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const dateKey = addDaysToDateKey(TODAY_DATE_KEY, index);

        return {
          key: dateKey,
          label: formatFullDate(dateKey),
        };
      }),
    [],
  );

  const applyAppointmentUpdate = (appointmentId, updater) => {
    setAppointments((current) => {
      const nextAppointments = sortAppointments(
        current.map((item) =>
          item.id === appointmentId ? updater(item) : item,
        ),
      );

      if (selectedAppointment?.id === appointmentId) {
        const refreshedAppointment =
          nextAppointments.find((item) => item.id === appointmentId) || null;
        setSelectedAppointment(refreshedAppointment);
      }

      return nextAppointments;
    });
  };

  const openDetailModal = (appointment) => {
    setSelectedAppointment(appointment);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setSelectedAppointment(null);
    setShowDetailModal(false);
  };

  const handleConfirmBooking = (appointmentId) => {
    applyAppointmentUpdate(appointmentId, (item) => ({
      ...item,
      status: 'Confirmed',
      ownerNotified: true,
      vetSynced: true,
      lastUpdate: 'Confirmed by staff and ready for clinic processing.',
    }));
  };

  const handleCancelBooking = (appointmentId) => {
    applyAppointmentUpdate(appointmentId, (item) => ({
      ...item,
      status: 'Cancelled',
      ownerNotified: true,
      vetSynced: true,
      cancellationReason: item.cancellationReason || 'Cancelled by staff from the booking list.',
      lastUpdate: 'Cancelled by staff from the booking list.',
    }));
  };

  const handleMarkCompleted = (appointmentId) => {
    applyAppointmentUpdate(appointmentId, (item) => ({
      ...item,
      status: 'Completed',
      ownerNotified: true,
      vetSynced: true,
      lastUpdate: 'Marked as completed by staff from the booking list.',
    }));
  };

  const openRescheduleModal = (appointment) => {
    setRescheduleAppointmentId(appointment.id);
    setRescheduleDateKey(appointment.dateKey);
    setRescheduleTime(appointment.time);
    setShowRescheduleModal(true);
  };

  const handleSaveReschedule = () => {
    if (!rescheduleAppointmentId) {
      return;
    }

    applyAppointmentUpdate(rescheduleAppointmentId, (item) => ({
      ...item,
      dateKey: rescheduleDateKey,
      time: rescheduleTime,
      status: 'Rescheduled',
      ownerNotified: true,
      vetSynced: true,
      lastUpdate: `Rescheduled by staff to ${formatFullDate(rescheduleDateKey)} at ${rescheduleTime}.`,
    }));
    setShowRescheduleModal(false);
  };

  const selectedStatusMeta = selectedAppointment
    ? SLOT_STATUS_META[getSlotStatusKeyForAppointment(selectedAppointment.status)]
    : SLOT_STATUS_META[SLOT_STATUS.CONFIRMED];

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
              <View style={listStyles.headerNavButtonsRow}>
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
                  style={listStyles.headerBackButton}
                  onPress={() => navigateWithUser('StaffAppointment')}
                  activeOpacity={0.85}
                >
                  <Image
                    source={BACK_ICON}
                    style={listStyles.headerBackIcon}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.ownerSummary}>
                <Text style={styles.headerCaption}>Search and manage bookings</Text>
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
            <Text style={styles.sectionTitle}>Appointment Database</Text>
            <Text style={styles.sectionSubtitle}>
              Search, filter, and manage both new bookings and older appointment records
            </Text>
          </View>

          <View style={listStyles.topToolsBlock}>
            <TextInput
              value={searchValue}
              onChangeText={setSearchValue}
              placeholder="Search by owner, pet, veterinarian, animal code, or service"
              placeholderTextColor="#8aa1b4"
              style={listStyles.searchInput}
            />

            <View style={listStyles.dropdownFiltersWrap}>
              <View style={listStyles.dropdownFieldCard}>
                <Text style={listStyles.dropdownFieldLabel}>Status Filter</Text>
                <Dropdown
                  style={listStyles.dropdown}
                  containerStyle={listStyles.dropdownContainer}
                  placeholderStyle={listStyles.dropdownPlaceholder}
                  selectedTextStyle={listStyles.dropdownSelectedText}
                  itemTextStyle={listStyles.dropdownItemText}
                  iconStyle={listStyles.dropdownIcon}
                  activeColor="#edf7fd"
                  data={STATUS_FILTER_OPTIONS}
                  labelField="label"
                  valueField="value"
                  value={activeStatus}
                  placeholder="Select status"
                  onChange={(item) => setActiveStatus(item.value)}
                />
              </View>

              <View style={listStyles.dropdownFieldCard}>
                <Text style={listStyles.dropdownFieldLabel}>Date Filter</Text>
                <Dropdown
                  style={listStyles.dropdown}
                  containerStyle={listStyles.dropdownContainer}
                  placeholderStyle={listStyles.dropdownPlaceholder}
                  selectedTextStyle={listStyles.dropdownSelectedText}
                  itemTextStyle={listStyles.dropdownItemText}
                  iconStyle={listStyles.dropdownIcon}
                  activeColor="#edf7fd"
                  data={dateDropdownOptions}
                  labelField="label"
                  valueField="value"
                  value={activeDateKey}
                  placeholder="Select date"
                  onChange={(item) => setActiveDateKey(item.value)}
                />
              </View>
            </View>

            <View style={[listStyles.summaryRow, isCompactScreen && listStyles.summaryRowCompact]}>
              <View style={listStyles.pendingSummary}>
                <Text style={listStyles.pendingSummaryLabel}>Total Pending Appointments</Text>
                <Text style={listStyles.pendingSummaryValue}>{pendingCount}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Database Records</Text>
            <Text style={styles.sectionSubtitle}>
              Database view for staff appointments with quick actions
            </Text>
          </View>

          <View style={listStyles.listShell}>
            <View style={listStyles.tableHeader}>
              <Text style={listStyles.tableHeaderText}>Owner / Pet</Text>
              <Text style={listStyles.tableHeaderText}>Status / Actions</Text>
            </View>

            {filteredAppointments.length ? (
              filteredAppointments.map((appointment, index) => {
                const statusMeta =
                  SLOT_STATUS_META[getSlotStatusKeyForAppointment(appointment.status)];
                const canConfirm =
                  appointment.status === 'Pending' || appointment.status === 'Rescheduled';
                const canCancel =
                  appointment.status !== 'Cancelled' && appointment.status !== 'Completed';
                const canComplete =
                  appointment.status === 'Confirmed' || appointment.status === 'Rescheduled';
                const canReschedule =
                  appointment.status !== 'Cancelled' && appointment.status !== 'Completed';

                return (
                  <View
                    key={appointment.id}
                    style={[
                      listStyles.listRow,
                      index === filteredAppointments.length - 1 && listStyles.listRowLast,
                    ]}
                  >
                    <View style={[listStyles.rowTop, isCompactScreen && listStyles.rowTopCompact]}>
                      <View
                        style={[
                          listStyles.rowIdentity,
                          isCompactScreen && listStyles.rowIdentityCompact,
                        ]}
                      >
                        <Text style={listStyles.rowPrimary}>{appointment.ownerName}</Text>
                        <Text style={listStyles.rowSecondary}>
                          {appointment.petName} - {appointment.petBreed}
                        </Text>
                        <Text style={listStyles.rowReference}>
                          {appointment.referenceCode || 'No animal code reference'}
                        </Text>
                      </View>

                      <View style={isCompactScreen ? listStyles.rowStatusWrapCompact : null}>
                        <StatusPill
                          label={getDisplayStatus(appointment.status)}
                          backgroundColor={statusMeta.background}
                          borderColor={statusMeta.border}
                          color={statusMeta.color}
                        />
                      </View>
                    </View>

                    <Text style={listStyles.rowHint}>
                      Tap View Details to see veterinarian, service type, date, time, and booking
                      type.
                    </Text>

                    <View style={[listStyles.actionRow, isCompactScreen && listStyles.actionRowCompact]}>
                      <TouchableOpacity
                        style={[
                          listStyles.actionButton,
                          listStyles.actionButtonNeutral,
                          isCompactScreen && listStyles.actionButtonCompact,
                        ]}
                        onPress={() => openDetailModal(appointment)}
                        activeOpacity={0.9}
                      >
                        <Text style={[listStyles.actionButtonText, listStyles.actionButtonTextDark]}>
                          View Details
                        </Text>
                      </TouchableOpacity>

                      {canConfirm ? (
                        <TouchableOpacity
                          style={[
                            listStyles.actionButton,
                            listStyles.actionButtonPrimary,
                            isCompactScreen && listStyles.actionButtonCompact,
                          ]}
                          onPress={() => handleConfirmBooking(appointment.id)}
                          activeOpacity={0.9}
                        >
                          <Text style={listStyles.actionButtonText}>Confirm</Text>
                        </TouchableOpacity>
                      ) : null}

                      {canComplete ? (
                        <TouchableOpacity
                          style={[
                            listStyles.actionButton,
                            listStyles.actionButtonSuccess,
                            isCompactScreen && listStyles.actionButtonCompact,
                          ]}
                          onPress={() => handleMarkCompleted(appointment.id)}
                          activeOpacity={0.9}
                        >
                          <Text style={listStyles.actionButtonText}>Complete</Text>
                        </TouchableOpacity>
                      ) : null}

                      {canReschedule ? (
                        <TouchableOpacity
                          style={[
                            listStyles.actionButton,
                            listStyles.actionButtonWarning,
                            isCompactScreen && listStyles.actionButtonCompact,
                          ]}
                          onPress={() => openRescheduleModal(appointment)}
                          activeOpacity={0.9}
                        >
                          <Text style={listStyles.actionButtonText}>Reschedule</Text>
                        </TouchableOpacity>
                      ) : null}

                      {canCancel ? (
                        <TouchableOpacity
                          style={[
                            listStyles.actionButton,
                            listStyles.actionButtonDanger,
                            isCompactScreen && listStyles.actionButtonCompact,
                          ]}
                          onPress={() => handleCancelBooking(appointment.id)}
                          activeOpacity={0.9}
                        >
                          <Text style={listStyles.actionButtonText}>Cancel</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={listStyles.emptyRow}>
                <Text style={styles.emptyStateTitle}>No appointments found</Text>
                <Text style={styles.emptyStateText}>
                  Try changing the search, status filter, or date filter.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <Modal
          transparent
          animationType="fade"
          visible={showDetailModal}
          onRequestClose={closeDetailModal}
        >
          <View style={styles.modalOverlay}>
            <View style={appointmentStyles.detailModalCard}>
              <ScrollView
                style={appointmentStyles.detailModalScroll}
                contentContainerStyle={appointmentStyles.detailModalContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>
                  {selectedAppointment ? `${selectedAppointment.petName} Details` : 'Details'}
                </Text>
                <Text style={styles.modalMessage}>
                  Review the full appointment information for this booking record.
                </Text>

                {selectedAppointment ? (
                  <>
                    <View
                      style={[
                        appointmentStyles.modalStatusBanner,
                        {
                          backgroundColor: selectedStatusMeta.background,
                          borderColor: selectedStatusMeta.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          appointmentStyles.modalStatusText,
                          { color: selectedStatusMeta.color },
                        ]}
                      >
                        {getDisplayStatus(selectedAppointment.status)}
                      </Text>
                    </View>

                    <View style={appointmentStyles.detailInfoCard}>
                      <DetailRow label="Pet owner name" value={selectedAppointment.ownerName} />
                      <DetailRow
                        label="Pet name"
                        value={`${selectedAppointment.petName} - ${selectedAppointment.petBreed}`}
                      />
                      <DetailRow
                        label="Veterinarian assigned"
                        value={selectedAppointment.veterinarian || 'Not assigned'}
                      />
                      <DetailRow
                        label="Appointment date"
                        value={formatFullDate(selectedAppointment.dateKey)}
                      />
                      <DetailRow label="Appointment time" value={selectedAppointment.time} />
                      <DetailRow label="Service type" value={selectedAppointment.reason} />
                      <DetailRow
                        label="Booking type"
                        value={selectedAppointment.bookingType || 'Online'}
                      />
                      <DetailRow
                        label="Animal code reference"
                        value={selectedAppointment.referenceCode || 'Not provided'}
                      />
                    </View>

                    <View style={appointmentStyles.detailNotificationRow}>
                      <DetailNotificationCard
                        title="Pet Owner"
                        text={
                          selectedAppointment.ownerNotified
                            ? 'Notification sent'
                            : 'Notification pending'
                        }
                        active={selectedAppointment.ownerNotified}
                      />
                      <DetailNotificationCard
                        title="Veterinarian"
                        text={
                          selectedAppointment.vetSynced
                            ? 'Schedule synced'
                            : 'Sync pending'
                        }
                        active={selectedAppointment.vetSynced}
                      />
                    </View>

                    <View style={listStyles.modalUpdateBox}>
                      <Text style={listStyles.modalUpdateLabel}>Latest Update</Text>
                      <Text style={listStyles.modalUpdateText}>
                        {selectedAppointment.lastUpdate}
                      </Text>
                    </View>

                    {selectedAppointment.status === 'Cancelled' &&
                    selectedAppointment.cancellationReason ? (
                      <View style={appointmentStyles.cancellationNote}>
                        <Text style={appointmentStyles.cancellationNoteTitle}>
                          Cancellation Reason
                        </Text>
                        <Text style={appointmentStyles.cancellationNoteText}>
                          {selectedAppointment.cancellationReason}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </ScrollView>

              <TouchableOpacity
                style={appointmentStyles.closeModalButton}
                onPress={closeDetailModal}
                activeOpacity={0.9}
              >
                <Text style={appointmentStyles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          transparent
          animationType="fade"
          visible={showRescheduleModal}
          onRequestClose={() => setShowRescheduleModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={listStyles.rescheduleModalCard}>
              <Text style={styles.modalTitle}>Reschedule Appointment</Text>
              <Text style={styles.modalMessage}>
                Choose a new appointment date and time for this booking.
              </Text>

              <Text style={listStyles.rescheduleLabel}>New Date</Text>
              <View style={listStyles.optionWrap}>
                {rescheduleDateOptions.map((item) => {
                  const isActive = item.key === rescheduleDateKey;

                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        listStyles.optionChip,
                        isActive && listStyles.optionChipActive,
                      ]}
                      onPress={() => setRescheduleDateKey(item.key)}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          listStyles.optionChipText,
                          isActive && listStyles.optionChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={listStyles.rescheduleLabel}>New Time</Text>
              <View style={listStyles.optionWrap}>
                {RESCHEDULE_TIME_OPTIONS.map((time) => {
                  const isActive = time === rescheduleTime;

                  return (
                    <TouchableOpacity
                      key={time}
                      style={[
                        listStyles.optionChip,
                        isActive && listStyles.optionChipActive,
                      ]}
                      onPress={() => setRescheduleTime(time)}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          listStyles.optionChipText,
                          isActive && listStyles.optionChipTextActive,
                        ]}
                      >
                        {time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => setShowRescheduleModal(false)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalPrimaryButton}
                  onPress={handleSaveReschedule}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalPrimaryText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const listStyles = StyleSheet.create({
  headerNavButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerBackButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },

  headerBackIcon: {
    width: 30,
    height: 30,
    tintColor: '#ffffff',
  },

  topToolsBlock: {
    marginBottom: 18,
  },

  searchInput: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f8fcff',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#173f5c',
    marginBottom: 12,
  },

  dropdownFiltersWrap: {
    marginBottom: 4,
  },

  dropdownFieldCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f8fcff',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    marginBottom: 10,
  },

  dropdownFieldLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  dropdown: {
    minHeight: 48,
  },

  dropdownContainer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },

  dropdownPlaceholder: {
    fontSize: 14,
    fontWeight: '700',
    color: '#87a0b1',
  },

  dropdownSelectedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#173f5c',
  },

  dropdownItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#173f5c',
  },

  dropdownIcon: {
    width: 18,
    height: 18,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 4,
  },

  summaryRowCompact: {
    alignItems: 'stretch',
  },

  pendingSummary: {
    paddingVertical: 8,
    marginBottom: 8,
  },

  pendingSummaryLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    marginBottom: 4,
  },

  pendingSummaryValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#2f8d59',
  },

  listShell: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d7e4ef',
    backgroundColor: '#f8fcff',
  },

  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#eef5fb',
    borderBottomWidth: 1,
    borderBottomColor: '#d7e4ef',
  },

  tableHeaderText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  listRow: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2edf5',
    backgroundColor: '#ffffff',
  },

  listRowLast: {
    borderBottomWidth: 0,
  },

  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },

  rowTopCompact: {
    flexDirection: 'column',
  },

  rowIdentity: {
    flex: 1,
    marginRight: 12,
  },

  rowIdentityCompact: {
    width: '100%',
    marginRight: 0,
  },

  rowStatusWrapCompact: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },

  rowPrimary: {
    fontSize: 15,
    fontWeight: '900',
    color: '#173f5c',
    marginBottom: 4,
  },

  rowSecondary: {
    fontSize: 13,
    fontWeight: '800',
    color: '#385973',
    marginBottom: 4,
  },

  rowReference: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6d8ca1',
  },

  rowHint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#5c7b90',
    marginBottom: 12,
  },

  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  actionRowCompact: {
    justifyContent: 'space-between',
  },

  actionButton: {
    minHeight: 38,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },

  actionButtonCompact: {
    width: '48.5%',
    marginRight: 0,
    paddingHorizontal: 10,
  },

  actionButtonNeutral: {
    backgroundColor: '#eef5fb',
    borderWidth: 1,
    borderColor: '#d7e4ef',
  },

  actionButtonPrimary: {
    backgroundColor: '#2f80ed',
  },

  actionButtonSuccess: {
    backgroundColor: '#2fa866',
  },

  actionButtonWarning: {
    backgroundColor: '#c27b16',
  },

  actionButtonDanger: {
    backgroundColor: '#d9534f',
  },

  actionButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },

  actionButtonTextDark: {
    color: '#173f5c',
  },

  emptyRow: {
    paddingHorizontal: 14,
    paddingVertical: 24,
    backgroundColor: '#ffffff',
  },

  modalUpdateBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#f4fbff',
    padding: 14,
    marginBottom: 14,
  },

  modalUpdateLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6d8ca1',
    textTransform: 'uppercase',
    marginBottom: 6,
  },

  modalUpdateText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#5a788e',
  },

  rescheduleModalCard: {
    width: '100%',
    backgroundColor: '#f8fcff',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 22,
  },

  rescheduleLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#173f5c',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },

  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2,
  },

  optionChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7e4ef',
    backgroundColor: '#f2f7fb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },

  optionChipActive: {
    backgroundColor: '#173f5c',
    borderColor: '#173f5c',
  },

  optionChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#58758a',
  },

  optionChipTextActive: {
    color: '#ffffff',
  },
});

export default StaffAppointmentList;
