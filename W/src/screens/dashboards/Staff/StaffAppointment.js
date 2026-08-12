import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Dropdown } from 'react-native-element-dropdown';
import { styles } from '../../styles/StaffAppointmentDesign';
import { appointmentStyles } from './StaffAppointmentStyles';
import {
  DetailNotificationCard,
  DetailRow,
  NotificationChip,
  StatusPill,
  SummaryMetricCard,
} from './StaffAppointmentParts';
import {
  AVAILABLE_VETERINARIANS,
  HEADER_MENU_ITEMS,
  INITIAL_MONTH,
  MONTH_NAMES,
  SLOT_STATUS,
  SLOT_STATUS_META,
  TODAY_DATE_KEY,
  WEEK_LABELS,
  buildCalendarCells,
  buildDaySlots,
  ensureDateSchedule,
  formatFullDate,
  fromDateKey,
  getDaySummary,
  getReadableStatus,
  getSharedAppointmentCalendarState,
  getSlotStatusKeyForAppointment,
  normalizeTimeInput,
  parseTimeLabel,
  setSharedAppointmentCalendarState,
  updateSlotState,
} from './StaffAppointmentData';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const StaffAppointment = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const currentUser = loggedInUser || {};
  const routeAppointments = route?.params?.appointments || null;
  const routeSelectedDateKey = route?.params?.selectedDateKey || null;
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Staff';
  const initialCalendarState = getSharedAppointmentCalendarState();

  const scrollViewRef = useRef(null);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);

  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [appointments, setAppointments] = useState(
    () => routeAppointments || initialCalendarState.appointments,
  );
  const [daySchedules, setDaySchedules] = useState(
    () => initialCalendarState.daySchedules,
  );
  const [selectedDateKey, setSelectedDateKey] = useState(TODAY_DATE_KEY);
  const [visibleMonthDate, setVisibleMonthDate] = useState(INITIAL_MONTH);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [showDateActionModal, setShowDateActionModal] = useState(false);
  const [customTimeValue, setCustomTimeValue] = useState('');
  const [customTimeError, setCustomTimeError] = useState('');
  const [cancellationReasonDraft, setCancellationReasonDraft] = useState('');
  const [detailError, setDetailError] = useState('');
  const [pendingVeterinarianDraft, setPendingVeterinarianDraft] = useState('');
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleTargetTime, setRescheduleTargetTime] = useState('');

  const calendarYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, index) => {
      const year = currentYear - 1 + index;
      return {
        label: String(year),
        value: String(year),
      };
    });
  }, []);

  const navigateWithUser = (screenName) => {
    navigation.navigate(screenName, { user: currentUser });
  };

  const handleOpenAppointmentList = () => {
    navigation.navigate('StaffAppointmentList', {
      user: currentUser,
      appointments,
      selectedDateKey,
    });
  };

  const syncVisibleMonthToDate = (dateKey) => {
    const date = fromDateKey(dateKey);
    setVisibleMonthDate(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  useEffect(() => {
    if (routeAppointments) {
      setAppointments(routeAppointments);
    }
  }, [routeAppointments]);

  useEffect(() => {
    setSharedAppointmentCalendarState({
      appointments,
      daySchedules,
    });
  }, [appointments, daySchedules]);

  useEffect(() => {
    if (!routeSelectedDateKey || routeSelectedDateKey === selectedDateKey) {
      return;
    }

    setSelectedDateKey(routeSelectedDateKey);
    syncVisibleMonthToDate(routeSelectedDateKey);
  }, [routeSelectedDateKey, selectedDateKey]);

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

  const calendarCells = useMemo(
    () => buildCalendarCells(visibleMonthDate, daySchedules, appointments),
    [visibleMonthDate, daySchedules, appointments],
  );

  const selectedDateLabel = useMemo(
    () => formatFullDate(selectedDateKey),
    [selectedDateKey],
  );

  const selectedDaySummary = useMemo(
    () => getDaySummary(selectedDateKey, daySchedules, appointments),
    [selectedDateKey, daySchedules, appointments],
  );
  const selectedDateEnabled = selectedDaySummary.enabled;

  const selectedDaySlots = useMemo(
    () => buildDaySlots(selectedDateKey, daySchedules, appointments),
    [selectedDateKey, daySchedules, appointments],
  );

  const selectedDayAppointments = useMemo(
    () =>
      [...appointments]
        .filter((item) => item.dateKey === selectedDateKey)
        .sort(
          (left, right) =>
            parseTimeLabel(left.time) - parseTimeLabel(right.time) ||
            left.petName.localeCompare(right.petName),
        ),
    [appointments, selectedDateKey],
  );

  const pendingAppointmentsForSelectedDate = useMemo(
    () => selectedDayAppointments.filter((item) => item.status === 'Pending'),
    [selectedDayAppointments],
  );
  const firstPendingAppointment = pendingAppointmentsForSelectedDate[0] || null;
  const veterinarianOptions = useMemo(
    () =>
      AVAILABLE_VETERINARIANS.map((name) => ({
        label: name,
        value: name,
      })),
    [],
  );
  const selectedDateActionLabel = firstPendingAppointment
    ? 'Open Pending Actions'
    : selectedDateEnabled
      ? 'Review Date Status'
      : 'Open Date Options';

  const summaryCards = useMemo(
    () => [
      {
        key: 'pending',
        title: 'Pending Appointments',
        value: appointments.filter((item) => item.status === 'Pending').length,
        statusKey: SLOT_STATUS.PENDING,
      },
      {
        key: 'confirmed',
        title: 'Confirmed Appointments',
        value: appointments.filter((item) => item.status === 'Confirmed').length,
        statusKey: SLOT_STATUS.CONFIRMED,
      },
      {
        key: 'cancelled',
        title: 'Cancelled Appointments',
        value: appointments.filter((item) => item.status === 'Cancelled').length,
        statusKey: SLOT_STATUS.CANCELLED,
      },
      {
        key: 'today',
        title: "Today's Appointments",
        value: appointments.filter(
          (item) =>
            item.dateKey === TODAY_DATE_KEY &&
            item.status !== 'Cancelled',
        ).length,
        statusKey: SLOT_STATUS.AVAILABLE,
      },
    ],
    [appointments],
  );

  const detailContext = useMemo(() => {
    if (!selectedDetail) {
      return null;
    }

    if (selectedDetail.kind === 'appointment') {
      const appointment = appointments.find(
        (item) => item.id === selectedDetail.appointmentId,
      );

      if (!appointment) {
        return null;
      }

      return {
        appointment,
        slot:
          buildDaySlots(appointment.dateKey, daySchedules, appointments).find(
            (item) => item.time === appointment.time,
          ) || null,
        dateKey: appointment.dateKey,
        time: appointment.time,
      };
    }

    const slot =
      buildDaySlots(selectedDetail.dateKey, daySchedules, appointments).find(
        (item) => item.time === selectedDetail.time,
      ) || null;

    return {
      appointment: slot?.appointment || slot?.cancelledAppointment || null,
      slot,
      dateKey: selectedDetail.dateKey,
      time: selectedDetail.time,
    };
  }, [selectedDetail, appointments, daySchedules]);

  const detailAppointment = detailContext?.appointment || null;
  const detailSlot = detailContext?.slot || null;
  const detailStatusKey = detailAppointment
    ? getSlotStatusKeyForAppointment(detailAppointment.status)
    : detailSlot?.statusKey || SLOT_STATUS.AVAILABLE;
  const detailStatusMeta = SLOT_STATUS_META[detailStatusKey];
  const allowSlotEditing =
    detailSlot && (!detailAppointment || detailAppointment.status === 'Cancelled');

  const rescheduleOptions = useMemo(() => {
    if (!detailAppointment) {
      return [];
    }

    return buildDaySlots(selectedDateKey, daySchedules, appointments).filter(
      (slot) =>
        slot.isBookable &&
        !(
          detailAppointment.dateKey === selectedDateKey &&
          detailAppointment.time === slot.time
        ),
    );
  }, [appointments, daySchedules, detailAppointment, selectedDateKey]);

  const resetDetailWorkflow = () => {
    setCancellationReasonDraft('');
    setDetailError('');
    setPendingVeterinarianDraft('');
    setRescheduleMode(false);
    setRescheduleTargetTime('');
  };

  const openAppointmentDetail = (appointmentId) => {
    const appointment = appointments.find((item) => item.id === appointmentId);

    if (!appointment) {
      return;
    }

    setSelectedDateKey(appointment.dateKey);
    syncVisibleMonthToDate(appointment.dateKey);
    resetDetailWorkflow();
    setPendingVeterinarianDraft(appointment.veterinarian || '');
    setSelectedDetail({ kind: 'appointment', appointmentId });
    setShowDetailModal(true);
  };

  const openSlotDetail = (dateKey, time) => {
    setSelectedDateKey(dateKey);
    syncVisibleMonthToDate(dateKey);
    resetDetailWorkflow();
    setSelectedDetail({ kind: 'slot', dateKey, time });
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedDetail(null);
    resetDetailWorkflow();
  };

  const handleDatePress = (dateKey) => {
    setSelectedDateKey(dateKey);
  };

  const shiftCalendarMonth = (direction) => {
    setVisibleMonthDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
  };

  const handleCalendarYearChange = (item) => {
    const nextYear = Number(item.value);
    setVisibleMonthDate(
      (current) => new Date(nextYear, current.getMonth(), 1),
    );
  };

  const setSelectedDateAvailability = (enabled) => {
    setDaySchedules((current) => ({
      ...current,
      [selectedDateKey]: {
        ...(current[selectedDateKey] || {}),
        enabled,
        slots: {
          ...(current[selectedDateKey]?.slots || {}),
        },
      },
    }));
  };

  const handleOpenSelectedDateActions = () => {
    setPendingVeterinarianDraft(firstPendingAppointment?.veterinarian || '');
    setDetailError('');
    setShowDateActionModal(true);
  };

  const handleMakeSelectedDateAvailable = () => {
    if (selectedDateEnabled) {
      setDetailError('');
      setShowDateActionModal(false);
      return;
    }

    setSelectedDateAvailability(true);
    setDetailError('');
    setShowDateActionModal(false);
  };

  const handleCancelPendingForClient = () => {
    if (!firstPendingAppointment) {
      return;
    }

    setCancellationReasonDraft('Cancelled by staff for the client.');
    setAppointments((current) =>
      current.map((item) =>
        item.id === firstPendingAppointment.id
          ? {
              ...item,
              status: 'Cancelled',
              cancellationReason: 'Cancelled by staff for the client.',
              ownerNotified: true,
              vetSynced: true,
              lastUpdate: 'Cancelled by staff for the client.',
            }
          : item,
      ),
    );
    setDetailError('');
    setPendingVeterinarianDraft('');
    setShowDateActionModal(false);
  };

  const openCustomTimeModal = () => {
    setCustomTimeValue('');
    setCustomTimeError('');
    setShowCustomTimeModal(true);
  };

  const handleAddCustomTime = () => {
    const normalizedTime = normalizeTimeInput(customTimeValue);
    const selectedDateSlots = ensureDateSchedule(selectedDateKey, daySchedules);

    if (!normalizedTime) {
      setCustomTimeError('Enter a valid time like 5:30 PM.');
      return;
    }

    if (selectedDateSlots[normalizedTime]) {
      setCustomTimeError('This time slot already exists for the selected day.');
      return;
    }

    setDaySchedules((current) =>
      updateSlotState(current, selectedDateKey, normalizedTime, {
        status: SLOT_STATUS.AVAILABLE,
        custom: true,
      }),
    );
    setShowCustomTimeModal(false);
    setCustomTimeValue('');
    setCustomTimeError('');
    openSlotDetail(selectedDateKey, normalizedTime);
  };

  const handleSetSlotStatus = (dateKey, time, nextStatus) => {
    setDaySchedules((current) =>
      updateSlotState(current, dateKey, time, {
        status: nextStatus,
      }),
    );
  };

  const handleConfirmBooking = (appointmentId, veterinarianOverride = '') => {
    const targetAppointment = appointments.find((item) => item.id === appointmentId);

    if (!targetAppointment) {
      return;
    }

    const assignedVeterinarian = (
      veterinarianOverride ||
      pendingVeterinarianDraft ||
      targetAppointment.veterinarian ||
      ''
    ).trim();
    const slotConfig =
      ensureDateSchedule(targetAppointment.dateKey, daySchedules)[targetAppointment.time];

    if (targetAppointment.status === 'Pending' && !assignedVeterinarian) {
      setDetailError('Assign a veterinarian before confirming this booking.');
      return;
    }

    if (
      targetAppointment.status === 'Pending' &&
      slotConfig?.status !== SLOT_STATUS.AVAILABLE
    ) {
      setDetailError('Only green available slots can move from pending to confirmed.');
      return;
    }

    setAppointments((current) =>
      current.map((item) =>
        item.id === appointmentId
          ? {
              ...item,
              status: 'Confirmed',
              veterinarian: assignedVeterinarian,
              ownerNotified: true,
              vetSynced: true,
              lastUpdate:
                `Confirmed by staff and assigned to ${assignedVeterinarian}. Pet owner notified and veterinarian schedule updated.`,
            }
          : item,
      ),
    );
    setDaySchedules((current) =>
      updateSlotState(
        {
          ...current,
          [targetAppointment.dateKey]: {
            ...(current[targetAppointment.dateKey] || {}),
            enabled: true,
            slots: {
              ...(current[targetAppointment.dateKey]?.slots || {}),
            },
          },
        },
        targetAppointment.dateKey,
        targetAppointment.time,
        {
          status: SLOT_STATUS.AVAILABLE,
        },
      ),
    );
    setDetailError('');
    setPendingVeterinarianDraft(assignedVeterinarian);
    setShowDateActionModal(false);
  };

  const handleCancelBooking = (appointmentId) => {
    const targetAppointment = appointments.find((item) => item.id === appointmentId);

    if (!targetAppointment) {
      return;
    }

    const reason = cancellationReasonDraft.trim();

    if (!reason) {
      setDetailError('Please add a cancellation reason before cancelling this booking.');
      return;
    }

    const existingSlot =
      ensureDateSchedule(targetAppointment.dateKey, daySchedules)[targetAppointment.time];
    const nextManualStatus =
      existingSlot?.status === SLOT_STATUS.UNAVAILABLE ||
      existingSlot?.status === SLOT_STATUS.FULLY_BOOKED
        ? existingSlot.status
        : SLOT_STATUS.AVAILABLE;

    setAppointments((current) =>
      current.map((item) =>
        item.id === appointmentId
          ? {
              ...item,
              status: 'Cancelled',
              cancellationReason: reason,
              ownerNotified: true,
              vetSynced: true,
              lastUpdate: `Cancelled by staff. Reason: ${reason}`,
            }
          : item,
      ),
    );
    setDaySchedules((current) =>
      updateSlotState(current, targetAppointment.dateKey, targetAppointment.time, {
        status: nextManualStatus,
      }),
    );
    setDetailError('');
    setCancellationReasonDraft(reason);
    setRescheduleMode(false);
    setRescheduleTargetTime('');
  };

  const handleCompleteBooking = (appointmentId) => {
    const targetAppointment = appointments.find((item) => item.id === appointmentId);

    if (!targetAppointment) {
      return;
    }

    setAppointments((current) =>
      current.map((item) =>
        item.id === appointmentId
          ? {
              ...item,
              status: 'Completed',
              ownerNotified: true,
              vetSynced: true,
              lastUpdate: 'Marked as completed by staff and preserved in clinic history.',
            }
          : item,
      ),
    );
    setDetailError('');
  };

  const handleSaveReschedule = (appointmentId) => {
    const targetAppointment = appointments.find((item) => item.id === appointmentId);

    if (!targetAppointment) {
      return;
    }

    if (!rescheduleTargetTime) {
      setDetailError('Choose an available time slot on the selected calendar date.');
      return;
    }

    if (
      targetAppointment.dateKey === selectedDateKey &&
      targetAppointment.time === rescheduleTargetTime
    ) {
      setDetailError('Pick a different date or time to reschedule this appointment.');
      return;
    }

    setAppointments((current) =>
      current.map((item) =>
        item.id === appointmentId
          ? {
              ...item,
              dateKey: selectedDateKey,
              time: rescheduleTargetTime,
              ownerNotified: true,
              vetSynced: true,
              lastUpdate: `Rescheduled to ${formatFullDate(selectedDateKey)} at ${rescheduleTargetTime}. Pet owner and veterinarian notified.`,
            }
          : item,
      ),
    );
    setDaySchedules((current) =>
      updateSlotState(
        {
          ...current,
          [selectedDateKey]: {
            ...(current[selectedDateKey] || {}),
            enabled: true,
            slots: {
              ...(current[selectedDateKey]?.slots || {}),
            },
          },
        },
        selectedDateKey,
        rescheduleTargetTime,
        {
          status: SLOT_STATUS.AVAILABLE,
        },
      ),
    );
    setDetailError('');
    setRescheduleMode(false);
    setRescheduleTargetTime('');
  };

  const renderVeterinarianAssignmentCard = (appointment, helperText) => {
    if (!appointment || appointment.status !== 'Pending') {
      return null;
    }

    return (
      <View style={appointmentStyles.textAreaCard}>
        <Text style={appointmentStyles.textAreaLabel}>Assign Veterinarian</Text>
        <Text style={appointmentStyles.rescheduleText}>{helperText}</Text>
        <View style={appointmentStyles.calendarYearPickerWrap}>
          <Dropdown
            style={appointmentStyles.calendarYearDropdown}
            containerStyle={appointmentStyles.calendarYearDropdownContainer}
            placeholderStyle={appointmentStyles.calendarYearDropdownPlaceholder}
            selectedTextStyle={appointmentStyles.calendarYearDropdownSelectedText}
            itemTextStyle={appointmentStyles.calendarYearDropdownItemText}
            activeColor="#edf7fd"
            data={veterinarianOptions}
            labelField="label"
            valueField="value"
            value={pendingVeterinarianDraft || null}
            placeholder="Select veterinarian"
            onChange={(item) => {
              setPendingVeterinarianDraft(item.value);
              setDetailError('');
            }}
          />
        </View>
      </View>
    );
  };

  const getPendingRequestStatusLabel = (appointment) =>
    appointment?.status === 'Pending'
      ? 'Pending Request'
      : getReadableStatus(appointment?.status || '');

  const getPendingRequestPetLabel = (appointment) => {
    if (!appointment) {
      return 'No pet assigned';
    }

    return appointment.petBreed
      ? `${appointment.petName} - ${appointment.petBreed}`
      : appointment.petName;
  };

  const getPendingRequestSummaryRows = (appointment) => {
    if (!appointment) {
      return [];
    }

    return [
      {
        key: 'status',
        label: 'Status',
        value: getPendingRequestStatusLabel(appointment),
      },
      {
        key: 'reason',
        label: 'Reason',
        value: appointment.reason || 'No visit reason attached',
      },
      {
        key: 'pet',
        label: 'Pet',
        value: getPendingRequestPetLabel(appointment),
      },
      {
        key: 'reference',
        label: 'Animal Code Reference',
        value: appointment.referenceCode || 'Not provided',
      },
      {
        key: 'owner',
        label: 'Owner Name',
        value: appointment.ownerName || 'Not provided',
      },
      {
        key: 'date',
        label: 'Date',
        value: formatFullDate(appointment.dateKey),
      },
      {
        key: 'time',
        label: 'Time',
        value: appointment.time || 'Not scheduled',
      },
    ];
  };

  const renderPendingRequestSummaryCard = (appointment, title = 'Pending Request Summary') => {
    if (!appointment || appointment.status !== 'Pending') {
      return null;
    }

    return (
      <View style={appointmentStyles.pendingRequestSummaryCard}>
        <Text style={appointmentStyles.pendingRequestSummaryTitle}>{title}</Text>
        {getPendingRequestSummaryRows(appointment).map((item) => (
          <View key={item.key} style={appointmentStyles.pendingRequestSummaryRow}>
            <Text style={appointmentStyles.pendingRequestSummaryLabel}>{item.label}:</Text>
            <Text style={appointmentStyles.pendingRequestSummaryValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderCalendarDay = (cell, index) => {
    if (!cell) {
      return (
        <View
          key={`empty-${visibleMonthDate.getMonth()}-${index}`}
          style={appointmentStyles.calendarDayEmpty}
        />
      );
    }

    const isSelected = cell.dateKey === selectedDateKey;
    const isEnabled = cell.summary.enabled;

    return (
      <TouchableOpacity
        key={cell.key}
        style={[
          appointmentStyles.calendarDayCard,
          isSelected && appointmentStyles.calendarDayCardSelected,
          isEnabled && appointmentStyles.calendarDayCardAvailable,
          isSelected &&
            isEnabled &&
            appointmentStyles.calendarDayCardAvailableSelected,
        ]}
        onPress={() => handleDatePress(cell.dateKey)}
        activeOpacity={0.9}
      >
        <Text
          style={[
            appointmentStyles.calendarDayNumber,
            isSelected && appointmentStyles.calendarDayNumberSelected,
            isEnabled && appointmentStyles.calendarDayNumberAvailable,
            isSelected &&
              isEnabled &&
              appointmentStyles.calendarDayNumberAvailableSelected,
          ]}
        >
          {cell.dayNumber}
        </Text>

        {cell.summary.pending ? (
          <View style={appointmentStyles.pendingBadge}>
            <Text style={appointmentStyles.pendingBadgeText}>
              {cell.summary.pending}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderSlotCard = (slot) => {
    const slotMeta = SLOT_STATUS_META[slot.statusKey];

    return (
      <TouchableOpacity
        key={slot.time}
        style={[
          appointmentStyles.slotCard,
          {
            backgroundColor: slotMeta.background,
            borderColor: slotMeta.border,
          },
        ]}
        onPress={() => openSlotDetail(slot.dateKey, slot.time)}
        activeOpacity={0.9}
      >
        <View style={appointmentStyles.slotCardHeader}>
          <Text style={appointmentStyles.slotTime}>{slot.time}</Text>
          <StatusPill
            label={slotMeta.label}
            backgroundColor={slotMeta.background}
            borderColor={slotMeta.border}
            color={slotMeta.color}
          />
        </View>

        <Text style={appointmentStyles.slotPrimaryText}>
          {slot.appointment
            ? `${slot.appointment.petName} with ${slot.appointment.veterinarian}`
            : slot.cancelledAppointment
              ? 'Last booking was cancelled'
              : slot.manualStatus === SLOT_STATUS.UNAVAILABLE
                ? 'Hidden from booking forms'
                : slot.manualStatus === SLOT_STATUS.FULLY_BOOKED
                  ? 'Locked from further booking'
                  : 'Open for new appointment requests'}
        </Text>

        <Text style={appointmentStyles.slotSecondaryText}>
          {slot.appointment
            ? `${slot.appointment.ownerName} • ${slot.appointment.reason}`
            : slot.custom
              ? 'Custom clinic time'
              : 'Standard clinic block'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderAppointmentCard = (item) => {
    const appointmentMeta = SLOT_STATUS_META[getSlotStatusKeyForAppointment(item.status)];
    const isPendingAppointment = item.status === 'Pending';
    const bookingHeaderMeta = isPendingAppointment
      ? `Pending request • ${item.referenceCode || 'No reference'}`
      : `${item.ownerName} • ${item.time} • ${item.veterinarian}`;

    return (
      <View key={item.id} style={styles.managementCard}>
        <View style={appointmentStyles.bookingHeaderRow}>
          <View style={appointmentStyles.bookingHeaderContent}>
            <Text style={styles.managementTitle}>{item.petName}</Text>
            <Text style={[styles.managementMeta, appointmentStyles.bookingHeaderMeta]}>
              {bookingHeaderMeta}
            </Text>
          </View>

          <StatusPill
            label={getPendingRequestStatusLabel(item)}
            backgroundColor={appointmentMeta.background}
            borderColor={appointmentMeta.border}
            color={appointmentMeta.color}
          />
        </View>

        {isPendingAppointment ? (
          renderPendingRequestSummaryCard(item)
        ) : (
          <View style={styles.managementInfoGrid}>
            <View style={styles.managementInfoItem}>
              <Text style={styles.managementInfoLabel}>Reason for Visit</Text>
              <Text style={styles.managementInfoValue}>{item.reason}</Text>
            </View>
            <View style={styles.managementInfoItem}>
              <Text style={styles.managementInfoLabel}>Date / Time</Text>
              <Text style={styles.managementInfoValue}>
                {formatFullDate(item.dateKey)} • {item.time}
              </Text>
            </View>
            <View style={styles.managementInfoItem}>
              <Text style={styles.managementInfoLabel}>Pet Owner</Text>
              <Text style={styles.managementInfoValue}>{item.ownerName}</Text>
            </View>
            <View style={styles.managementInfoItem}>
              <Text style={styles.managementInfoLabel}>Clinic Update</Text>
              <Text style={styles.managementInfoValue}>{item.lastUpdate}</Text>
            </View>
          </View>
        )}

        {item.status === 'Cancelled' && item.cancellationReason ? (
          <View style={appointmentStyles.cancellationNote}>
            <Text style={appointmentStyles.cancellationNoteTitle}>
              Cancellation Reason
            </Text>
            <Text style={appointmentStyles.cancellationNoteText}>
              {item.cancellationReason}
            </Text>
          </View>
        ) : null}

        <View style={appointmentStyles.bookingNotificationRow}>
          <NotificationChip
            active={item.ownerNotified}
            activeLabel="Pet owner notified"
            inactiveLabel="Owner update pending"
          />
          <NotificationChip
            active={item.vetSynced}
            activeLabel="Vet schedule synced"
            inactiveLabel="Vet sync pending"
          />
        </View>

        {isPendingAppointment ? (
          <TouchableOpacity
            style={appointmentStyles.reviewButton}
            onPress={() => openAppointmentDetail(item.id)}
            activeOpacity={0.9}
          >
            <Text style={appointmentStyles.reviewButtonText}>View Details</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={appointmentStyles.reviewButton}
            onPress={() => openAppointmentDetail(item.id)}
            activeOpacity={0.9}
          >
            <Text style={appointmentStyles.reviewButtonText}>View Details</Text>
          </TouchableOpacity>
        )}
      </View>
    );
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
                <Text style={styles.headerSubtitle}>Staff Appointment Overview</Text>
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
                <Text style={styles.headerCaption}>Main scheduling panel</Text>
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
            <Text style={styles.sectionTitle}>Quick Summary</Text>
            <Text style={styles.sectionSubtitle}>
              Live counts for the clinic queue and today&apos;s workload
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
            <Text style={styles.sectionTitle}>Calendar Booking</Text>
            <Text style={styles.sectionSubtitle}>
              Review the clinic booking calendar first, then open the full booking list when needed
            </Text>
          </View>

          <View style={styles.bookingCard}>
            <View style={styles.flowStepBadge}>
              <Text style={styles.flowStepBadgeText}>Calendar</Text>
            </View>

            <View style={appointmentStyles.calendarHeaderRow}>
              <TouchableOpacity
                style={appointmentStyles.calendarNavButton}
                onPress={() => shiftCalendarMonth(-1)}
                activeOpacity={0.88}
              >
                <Text style={appointmentStyles.calendarNavButtonText}>Previous</Text>
              </TouchableOpacity>

              <View style={appointmentStyles.calendarTitleWrap}>
                <Text style={appointmentStyles.calendarMonthTitle}>
                  {MONTH_NAMES[visibleMonthDate.getMonth()]}
                </Text>
                <View style={appointmentStyles.calendarYearPickerWrap}>
                  <Dropdown
                    style={appointmentStyles.calendarYearDropdown}
                    containerStyle={appointmentStyles.calendarYearDropdownContainer}
                    placeholderStyle={appointmentStyles.calendarYearDropdownPlaceholder}
                    selectedTextStyle={appointmentStyles.calendarYearDropdownSelectedText}
                    itemTextStyle={appointmentStyles.calendarYearDropdownItemText}
                    iconStyle={appointmentStyles.calendarYearDropdownIcon}
                    activeColor="#edf7fd"
                    data={calendarYearOptions}
                    labelField="label"
                    valueField="value"
                    value={String(visibleMonthDate.getFullYear())}
                    onChange={handleCalendarYearChange}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={appointmentStyles.calendarNavButton}
                onPress={() => shiftCalendarMonth(1)}
                activeOpacity={0.88}
              >
                <Text style={appointmentStyles.calendarNavButtonText}>Next</Text>
              </TouchableOpacity>
            </View>

            <View style={appointmentStyles.calendarWeekRow}>
              {WEEK_LABELS.map((label) => (
                <Text key={label} style={appointmentStyles.calendarWeekText}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={appointmentStyles.calendarGrid}>
              {calendarCells.map(renderCalendarDay)}
            </View>

            <View style={appointmentStyles.selectedDateBanner}>
              <Text style={appointmentStyles.selectedDateLabel}>Selected Date</Text>
              <Text style={appointmentStyles.selectedDateValue}>{selectedDateLabel}</Text>
              <Text style={appointmentStyles.selectedDateMeta}>
                {selectedDateEnabled
                  ? 'This date is currently open for clinic booking review.'
                  : 'This date currently has no open clinic slots in the calendar.'}
              </Text>
              {selectedDaySummary.pending ? (
                <Text style={appointmentStyles.selectedDatePendingText}>
                  {selectedDaySummary.pending} pending request
                  {selectedDaySummary.pending === 1 ? '' : 's'} waiting on this date
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={appointmentStyles.manageDateButton}
              onPress={handleOpenSelectedDateActions}
              activeOpacity={0.9}
            >
              <Text style={appointmentStyles.manageDateButtonText}>
                {selectedDateActionLabel}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Booking List</Text>
            <Text style={styles.sectionSubtitle}>
              Open the separate appointment database to search new bookings and old records
            </Text>
          </View>

          <View style={styles.managementCard}>
            <View style={styles.managementInfoGrid}>
              <View style={styles.managementInfoItem}>
                <Text style={styles.managementInfoLabel}>All Booking Records</Text>
                <Text style={styles.managementInfoValue}>{appointments.length}</Text>
              </View>
              <View style={styles.managementInfoItem}>
                <Text style={styles.managementInfoLabel}>Selected Date Records</Text>
                <Text style={styles.managementInfoValue}>{selectedDayAppointments.length}</Text>
              </View>
              <View style={styles.managementInfoItem}>
                <Text style={styles.managementInfoLabel}>Pending Requests</Text>
                <Text style={styles.managementInfoValue}>
                  {appointments.filter((item) => item.status === 'Pending').length}
                </Text>
              </View>
              <View style={styles.managementInfoItem}>
                <Text style={styles.managementInfoLabel}>Completed or Cancelled</Text>
                <Text style={styles.managementInfoValue}>
                  {
                    appointments.filter(
                      (item) => item.status === 'Completed' || item.status === 'Cancelled',
                    ).length
                  }
                </Text>
              </View>
            </View>

            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>Searchable booking database</Text>
              <Text style={styles.emptyStateText}>
                Open the separate list screen to search by owner, pet, animal code, date, or
                status and review both new and old bookings.
              </Text>
            </View>

            <TouchableOpacity
              style={appointmentStyles.manageDateButton}
              onPress={handleOpenAppointmentList}
              activeOpacity={0.9}
            >
              <Text style={appointmentStyles.manageDateButtonText}>Go to List</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Modal
          transparent
          animationType="fade"
          visible={showDateActionModal}
          onRequestClose={() => setShowDateActionModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={appointmentStyles.dateActionModalCard}>
              <ScrollView
                style={appointmentStyles.dateActionModalScroll}
                contentContainerStyle={appointmentStyles.dateActionModalContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>Selected Date Actions</Text>
                <Text style={styles.modalMessage}>
                  Review the chosen calendar date and update its booking status.
                </Text>

                <View style={appointmentStyles.dateActionSummaryCard}>
                  <Text style={appointmentStyles.dateActionSummaryTitle}>
                    {selectedDateLabel}
                  </Text>
                  <Text style={appointmentStyles.dateActionSummaryText}>
                    {selectedDateEnabled
                      ? 'This date is already visible in the booking calendar.'
                      : 'This date is currently hidden from booking until staff opens it.'}
                  </Text>
                  <Text style={appointmentStyles.dateActionSummaryText}>
                    {selectedDayAppointments.length} booking record
                    {selectedDayAppointments.length === 1 ? '' : 's'} on this date.
                  </Text>
                </View>

                {firstPendingAppointment ? (
                  <View style={appointmentStyles.dateActionPendingCard}>
                    <Text style={appointmentStyles.dateActionPendingTitle}>
                      Pending Booking
                    </Text>

                    {getPendingRequestSummaryRows(firstPendingAppointment).map((item) => (
                      <View key={item.key} style={appointmentStyles.dateActionPendingRow}>
                        <Text style={appointmentStyles.dateActionPendingLabel}>
                          {item.label}
                        </Text>
                        <Text style={appointmentStyles.dateActionPendingText}>
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {renderVeterinarianAssignmentCard(
                  firstPendingAppointment,
                  'Choose the veterinarian before confirming the pending request.',
                )}

                {detailError ? (
                  <Text style={appointmentStyles.detailErrorText}>{detailError}</Text>
                ) : null}

                {!selectedDateEnabled ? (
                  <TouchableOpacity
                    style={appointmentStyles.makeDateAvailableButton}
                    onPress={handleMakeSelectedDateAvailable}
                    activeOpacity={0.9}
                  >
                    <Text style={appointmentStyles.makeDateAvailableButtonText}>
                      Make Date Available
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={appointmentStyles.dateActionHelperText}>
                    This date is already open for clinic booking review.
                  </Text>
                )}

                {firstPendingAppointment ? (
                  <View style={appointmentStyles.actionRow}>
                    <TouchableOpacity
                      style={appointmentStyles.confirmButton}
                      onPress={() => handleConfirmBooking(firstPendingAppointment.id)}
                      activeOpacity={0.9}
                    >
                      <Text style={appointmentStyles.confirmButtonText}>
                        Confirm Booking
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={appointmentStyles.cancelButton}
                      onPress={handleCancelPendingForClient}
                      activeOpacity={0.9}
                    >
                      <Text style={appointmentStyles.cancelButtonText}>
                        Cancel Booking
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </ScrollView>

              <TouchableOpacity
                style={appointmentStyles.dateActionCloseButton}
                onPress={() => setShowDateActionModal(false)}
                activeOpacity={0.9}
              >
                <Text style={appointmentStyles.dateActionCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

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
                  {detailAppointment ? detailAppointment.petName : 'Slot Details'}
                </Text>
                <Text style={styles.modalMessage}>
                  {detailAppointment
                    ? 'Review the appointment information for this booking.'
                    : 'Review the clinic slot details for this schedule.'}
                </Text>

                <View
                  style={[
                    appointmentStyles.modalStatusBanner,
                    {
                      backgroundColor: detailStatusMeta.background,
                      borderColor: detailStatusMeta.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      appointmentStyles.modalStatusText,
                      { color: detailStatusMeta.color },
                    ]}
                  >
                    {detailStatusMeta.label}
                  </Text>
                </View>

                <View style={appointmentStyles.detailInfoCard}>
                  <DetailRow
                    label="Pet owner name"
                    value={detailAppointment?.ownerName || 'No booking assigned'}
                  />
                  <DetailRow
                    label="Pet name"
                    value={
                      detailAppointment
                        ? getPendingRequestPetLabel(detailAppointment)
                        : 'Open clinic slot'
                    }
                  />
                  <DetailRow
                    label="Animal code reference"
                    value={detailAppointment?.referenceCode || 'Not provided'}
                  />
                  <DetailRow
                    label="Veterinarian"
                    value={
                      detailAppointment?.veterinarian || 'Not assigned yet'
                    }
                  />
                  <DetailRow
                    label="Appointment date/time"
                    value={`${formatFullDate(detailContext?.dateKey || selectedDateKey)} • ${
                      detailContext?.time || ''
                    }`}
                  />
                  <DetailRow
                    label="Reason for visit"
                    value={detailAppointment?.reason || 'No visit reason attached to this slot'}
                  />
                  <DetailRow
                    label="Status"
                    value={
                      detailAppointment
                        ? getPendingRequestStatusLabel(detailAppointment)
                        : detailSlot
                          ? SLOT_STATUS_META[detailSlot.statusKey].label
                          : 'Available'
                    }
                  />
                </View>

                {detailAppointment ? (
                  <>
                    <View style={appointmentStyles.detailNotificationRow}>
                      <DetailNotificationCard
                        title="Pet Owner"
                        text={
                          detailAppointment.ownerNotified
                            ? 'Notification sent'
                            : 'Notification queued'
                        }
                        active={detailAppointment.ownerNotified}
                      />
                      <DetailNotificationCard
                        title="Veterinarian"
                        text={
                          detailAppointment.vetSynced
                            ? 'Calendar updated'
                            : 'Waiting for sync'
                        }
                        active={detailAppointment.vetSynced}
                      />
                    </View>

                    <View style={appointmentStyles.lastUpdateCard}>
                      <Text style={appointmentStyles.lastUpdateTitle}>Latest Booking Update</Text>
                      <Text style={appointmentStyles.lastUpdateText}>
                        {detailAppointment.lastUpdate}
                      </Text>
                    </View>

                    {detailAppointment.status === 'Cancelled' &&
                    detailAppointment.cancellationReason ? (
                      <View style={appointmentStyles.cancellationDetailCard}>
                        <Text style={appointmentStyles.cancellationDetailTitle}>
                          Cancellation Reason
                        </Text>
                        <Text style={appointmentStyles.cancellationDetailText}>
                          {detailAppointment.cancellationReason}
                        </Text>
                      </View>
                    ) : null}

                    {null}
                  </>
                ) : null}

                {null}
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

      </SafeAreaView>
    </LinearGradient>
  );
};

export default StaffAppointment;

