const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_TIME_SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];

const SLOT_STATUS = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  FULLY_BOOKED: 'fullyBooked',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  RESCHEDULED: 'rescheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

const SLOT_STATUS_META = {
  [SLOT_STATUS.AVAILABLE]: {
    label: 'Available',
    color: '#2fa866',
    background: '#e9f8ef',
    border: '#bfe8cf',
  },
  [SLOT_STATUS.PENDING]: {
    label: 'Pending',
    color: '#2fa866',
    background: '#e9f8ef',
    border: '#bfe8cf',
  },
  [SLOT_STATUS.CONFIRMED]: {
    label: 'Confirmed',
    color: '#2f80ed',
    background: '#ebf3ff',
    border: '#c6dbff',
  },
  [SLOT_STATUS.RESCHEDULED]: {
    label: 'Rescheduled',
    color: '#c27b16',
    background: '#fff6e8',
    border: '#f1d49d',
  },
  [SLOT_STATUS.CANCELLED]: {
    label: 'Cancelled',
    color: '#d9534f',
    background: '#ffeceb',
    border: '#f4c2bf',
  },
  [SLOT_STATUS.UNAVAILABLE]: {
    label: 'Unavailable',
    color: '#768390',
    background: '#eef2f5',
    border: '#d6dde4',
  },
  [SLOT_STATUS.FULLY_BOOKED]: {
    label: 'Fully Booked',
    color: '#4b5d72',
    background: '#ebf0f5',
    border: '#ccd6df',
  },
  [SLOT_STATUS.COMPLETED]: {
    label: 'Completed',
    color: '#179c97',
    background: '#e7f8f7',
    border: '#bce8e6',
  },
};

const LEGEND_ITEMS = [
  { key: SLOT_STATUS.AVAILABLE, label: 'Available', color: '#2fa866' },
  { key: SLOT_STATUS.PENDING, label: 'Pending', color: '#2fa866' },
  { key: SLOT_STATUS.CONFIRMED, label: 'Confirmed', color: '#2f80ed' },
  { key: SLOT_STATUS.RESCHEDULED, label: 'Rescheduled', color: '#c27b16' },
  { key: SLOT_STATUS.CANCELLED, label: 'Cancelled', color: '#d9534f' },
  { key: SLOT_STATUS.UNAVAILABLE, label: 'Unavailable', color: '#768390' },
  { key: SLOT_STATUS.FULLY_BOOKED, label: 'Fully Booked', color: '#4b5d72' },
];

const AVAILABLE_VETERINARIANS = [
  'Dr. Gomez',
  'Dr. Santos',
  'Dr. Torres',
  'Dr. Villanueva',
];

const HEADER_MENU_ITEMS = [
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

const createDateKey = (year, monthIndex, day) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const toDateKey = (date) =>
  createDateKey(date.getFullYear(), date.getMonth(), date.getDate());

const fromDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date, offset) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);

const formatFullDate = (dateKey) => {
  const date = fromDateKey(dateKey);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

const parseTimeLabel = (value) => {
  const cleaned = value.trim().replace(/\./g, '').toUpperCase();
  const match = cleaned.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)$/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] || '0');

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return Number.MAX_SAFE_INTEGER;
  }

  let normalizedHour = hour % 12;

  if (match[3] === 'PM') {
    normalizedHour += 12;
  }

  return normalizedHour * 60 + minute;
};

const normalizeTimeInput = (value) => {
  const cleaned = value.trim().replace(/\./g, '').toUpperCase();
  const match = cleaned.match(/^(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)$/);

  if (!match) {
    return '';
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] || '0');

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return '';
  }

  return `${hour}:${String(minute).padStart(2, '0')} ${match[3]}`;
};

const sortTimeLabels = (times) =>
  [...times].sort((left, right) => {
    const leftMinutes = parseTimeLabel(left);
    const rightMinutes = parseTimeLabel(right);

    if (leftMinutes !== rightMinutes) {
      return leftMinutes - rightMinutes;
    }

    return left.localeCompare(right);
  });

const createDefaultSlotMap = () =>
  DEFAULT_TIME_SLOTS.reduce((current, time) => {
    current[time] = {
      status: SLOT_STATUS.AVAILABLE,
      custom: false,
    };
    return current;
  }, {});

const TODAY = new Date();
const TODAY_DATE_KEY = toDateKey(TODAY);
const INITIAL_MONTH = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
const getRelativeDateKey = (offset) => toDateKey(addDays(TODAY, offset));

const INITIAL_DAY_SCHEDULES = {
  [getRelativeDateKey(0)]: {
    slots: {
      '1:00 PM': { status: SLOT_STATUS.UNAVAILABLE, custom: false },
      '4:30 PM': { status: SLOT_STATUS.AVAILABLE, custom: true },
    },
  },
  [getRelativeDateKey(1)]: {
    slots: {
      '3:00 PM': { status: SLOT_STATUS.FULLY_BOOKED, custom: false },
      '5:00 PM': { status: SLOT_STATUS.AVAILABLE, custom: true },
    },
  },
  [getRelativeDateKey(2)]: {
    slots: {
      '9:00 AM': { status: SLOT_STATUS.UNAVAILABLE, custom: false },
      '2:30 PM': { status: SLOT_STATUS.AVAILABLE, custom: true },
    },
  },
  [getRelativeDateKey(4)]: {
    slots: {
      '11:00 AM': { status: SLOT_STATUS.FULLY_BOOKED, custom: false },
      '4:00 PM': { status: SLOT_STATUS.AVAILABLE, custom: true },
    },
  },
};

const INITIAL_APPOINTMENTS = [
  {
    id: 'staff-appt-1',
    ownerName: 'Yuri Cruz',
    petName: 'Bella',
    petBreed: 'Golden Retriever',
    referenceCode: 'PET-0001',
    veterinarian: 'Dr. Santos',
    bookingType: 'Online',
    dateKey: getRelativeDateKey(0),
    time: '9:00 AM',
    reason: 'Anti-rabies vaccination',
    status: 'Pending',
    ownerNotified: false,
    vetSynced: false,
    cancellationReason: '',
    lastUpdate: 'Waiting for front desk confirmation.',
  },
  {
    id: 'staff-appt-2',
    ownerName: 'Keanu Ribs',
    petName: 'Milo',
    petBreed: 'Persian',
    referenceCode: 'PET-0002',
    veterinarian: 'Dr. Torres',
    bookingType: 'Walk-in',
    dateKey: getRelativeDateKey(0),
    time: '11:00 AM',
    reason: 'Routine wellness check',
    status: 'Confirmed',
    ownerNotified: true,
    vetSynced: true,
    cancellationReason: '',
    lastUpdate: 'Confirmed and visible in the veterinarian schedule.',
  },
  {
    id: 'staff-appt-3',
    ownerName: 'Maria Santos',
    petName: 'Luna',
    petBreed: 'Siamese',
    referenceCode: 'PET-0003',
    veterinarian: 'Dr. Villanueva',
    bookingType: 'Online',
    dateKey: getRelativeDateKey(1),
    time: '1:00 PM',
    reason: 'Skin allergy consultation',
    status: 'Pending',
    ownerNotified: false,
    vetSynced: false,
    cancellationReason: '',
    lastUpdate: 'Pending request submitted by pet owner.',
  },
  {
    id: 'staff-appt-4',
    ownerName: 'Anna Lim',
    petName: 'Rocky',
    petBreed: 'Beagle',
    referenceCode: 'PET-0004',
    veterinarian: 'Dr. Santos',
    bookingType: 'Walk-in',
    dateKey: getRelativeDateKey(2),
    time: '3:00 PM',
    reason: 'Deworming follow-up',
    status: 'Cancelled',
    ownerNotified: true,
    vetSynced: true,
    cancellationReason: 'Owner requested a later schedule.',
    lastUpdate: 'Cancelled and released back to the clinic queue.',
  },
  {
    id: 'staff-appt-5',
    ownerName: 'John Reyes',
    petName: 'Pepper',
    petBreed: 'Pomeranian',
    referenceCode: 'PET-0005',
    veterinarian: 'Dr. Gomez',
    bookingType: 'Online',
    dateKey: getRelativeDateKey(3),
    time: '9:00 AM',
    reason: 'Dental cleaning',
    status: 'Confirmed',
    ownerNotified: true,
    vetSynced: true,
    cancellationReason: '',
    lastUpdate: 'Confirmed appointment for tomorrow morning.',
  },
  {
    id: 'staff-appt-6',
    ownerName: 'Grace Tan',
    petName: 'Coco',
    petBreed: 'Shih Tzu',
    referenceCode: 'PET-0006',
    veterinarian: 'Dr. Torres',
    bookingType: 'Walk-in',
    dateKey: getRelativeDateKey(4),
    time: '1:00 PM',
    reason: 'Post-surgery checkup',
    status: 'Completed',
    ownerNotified: true,
    vetSynced: true,
    cancellationReason: '',
    lastUpdate: 'Visit completed and archived in the clinic record.',
  },
];

const cloneDaySchedules = (schedules = {}) =>
  Object.entries(schedules).reduce((current, [dateKey, config]) => {
    current[dateKey] = {
      ...config,
      slots: Object.entries(config?.slots || {}).reduce((slotMap, [time, slotConfig]) => {
        slotMap[time] = { ...slotConfig };
        return slotMap;
      }, {}),
    };
    return current;
  }, {});

const cloneAppointments = (appointments = []) =>
  appointments.map((appointment) => ({
    ...appointment,
  }));

let sharedAppointmentCalendarState = {
  daySchedules: cloneDaySchedules(INITIAL_DAY_SCHEDULES),
  appointments: cloneAppointments(INITIAL_APPOINTMENTS),
};

const getSharedAppointmentCalendarState = () => ({
  daySchedules: cloneDaySchedules(sharedAppointmentCalendarState.daySchedules),
  appointments: cloneAppointments(sharedAppointmentCalendarState.appointments),
});

const setSharedAppointmentCalendarState = ({ daySchedules, appointments } = {}) => {
  sharedAppointmentCalendarState = {
    daySchedules:
      daySchedules === undefined
        ? cloneDaySchedules(sharedAppointmentCalendarState.daySchedules)
        : cloneDaySchedules(daySchedules),
    appointments:
      appointments === undefined
        ? cloneAppointments(sharedAppointmentCalendarState.appointments)
        : cloneAppointments(appointments),
  };

  return getSharedAppointmentCalendarState();
};

const APPOINTMENT_STATUS_TO_SLOT_STATUS = {
  Pending: SLOT_STATUS.PENDING,
  Confirmed: SLOT_STATUS.CONFIRMED,
  Rescheduled: SLOT_STATUS.RESCHEDULED,
  Cancelled: SLOT_STATUS.CANCELLED,
  Completed: SLOT_STATUS.COMPLETED,
};

const ACTIVE_APPOINTMENT_STATUSES = new Set(['Pending', 'Confirmed', 'Rescheduled', 'Completed']);

const getSlotStatusKeyForAppointment = (status) =>
  APPOINTMENT_STATUS_TO_SLOT_STATUS[status] || SLOT_STATUS.AVAILABLE;

const getReadableStatus = (status) => {
  const slotStatus = APPOINTMENT_STATUS_TO_SLOT_STATUS[status];

  if (slotStatus && SLOT_STATUS_META[slotStatus]) {
    return SLOT_STATUS_META[slotStatus].label;
  }

  return status;
};

const ensureDateSchedule = (dateKey, schedules) => ({
  ...createDefaultSlotMap(),
  ...(schedules[dateKey]?.slots || {}),
});

const isDateEnabledForBookings = (dateKey, schedules, appointments) =>
  Boolean(schedules[dateKey]?.enabled) ||
  appointments.some(
    (item) =>
      item.dateKey === dateKey && ACTIVE_APPOINTMENT_STATUSES.has(item.status),
  );

const buildDaySlots = (dateKey, schedules, appointments) => {
  const slotMap = ensureDateSchedule(dateKey, schedules);
  const isDateEnabled = isDateEnabledForBookings(dateKey, schedules, appointments);
  const appointmentsForDay = appointments.filter((item) => item.dateKey === dateKey);

  return sortTimeLabels(Object.keys(slotMap)).map((time) => {
    const slotConfig = slotMap[time];
    const pendingAppointment =
      appointmentsForDay.find((item) => item.time === time && item.status === 'Pending') || null;
    const confirmedAppointment =
      appointmentsForDay.find((item) => item.time === time && item.status === 'Confirmed') || null;
    const rescheduledAppointment =
      appointmentsForDay.find((item) => item.time === time && item.status === 'Rescheduled') || null;
    const completedAppointment =
      appointmentsForDay.find((item) => item.time === time && item.status === 'Completed') || null;
    const cancelledAppointment =
      appointmentsForDay.find((item) => item.time === time && item.status === 'Cancelled') || null;

    let statusKey = slotConfig.status;
    let activeAppointment = null;

    if (pendingAppointment) {
      statusKey = SLOT_STATUS.PENDING;
      activeAppointment = pendingAppointment;
    } else if (confirmedAppointment) {
      statusKey = SLOT_STATUS.CONFIRMED;
      activeAppointment = confirmedAppointment;
    } else if (rescheduledAppointment) {
      statusKey = SLOT_STATUS.RESCHEDULED;
      activeAppointment = rescheduledAppointment;
    } else if (completedAppointment) {
      statusKey = SLOT_STATUS.COMPLETED;
      activeAppointment = completedAppointment;
    }

    const displayStatusKey =
      !activeAppointment &&
      slotConfig.status === SLOT_STATUS.AVAILABLE &&
      !isDateEnabled
        ? SLOT_STATUS.UNAVAILABLE
        : statusKey;

    return {
      dateKey,
      time,
      custom: slotConfig.custom,
      manualStatus: slotConfig.status,
      statusKey: displayStatusKey,
      appointment: activeAppointment,
      cancelledAppointment,
      isBookable:
        isDateEnabled &&
        slotConfig.status === SLOT_STATUS.AVAILABLE &&
        !activeAppointment,
    };
  });
};

const getDaySummary = (dateKey, schedules, appointments) => {
  const isDateEnabled = isDateEnabledForBookings(dateKey, schedules, appointments);
  const slots = buildDaySlots(dateKey, schedules, appointments);
  const dayAppointments = appointments.filter((item) => item.dateKey === dateKey);
  const pending = dayAppointments.filter((item) => item.status === 'Pending').length;
  const confirmed = dayAppointments.filter((item) => item.status === 'Confirmed').length;
  const rescheduled = dayAppointments.filter((item) => item.status === 'Rescheduled').length;
  const cancelled = dayAppointments.filter((item) => item.status === 'Cancelled').length;
  const completed = dayAppointments.filter((item) => item.status === 'Completed').length;
  const available = slots.filter((item) => item.statusKey === SLOT_STATUS.AVAILABLE).length;
  const unavailable = slots.filter((item) => item.manualStatus === SLOT_STATUS.UNAVAILABLE).length;
  const fullyBooked = slots.filter((item) => item.manualStatus === SLOT_STATUS.FULLY_BOOKED).length;

  let tone = SLOT_STATUS.AVAILABLE;

  if (pending) {
    tone = SLOT_STATUS.PENDING;
  } else if (confirmed || rescheduled || completed) {
    tone = SLOT_STATUS.CONFIRMED;
  } else if (cancelled) {
    tone = SLOT_STATUS.CANCELLED;
  } else if (!available && unavailable === slots.length) {
    tone = SLOT_STATUS.UNAVAILABLE;
  } else if (!available && fullyBooked) {
    tone = SLOT_STATUS.FULLY_BOOKED;
  }

  return {
    enabled: isDateEnabled,
    pending,
    confirmed,
    rescheduled,
    cancelled,
    completed,
    available,
    unavailable,
    fullyBooked,
    totalSlots: slots.length,
    tone,
  };
};

const buildCalendarCells = (visibleMonthDate, schedules, appointments) => {
  const year = visibleMonthDate.getFullYear();
  const monthIndex = visibleMonthDate.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = createDateKey(year, monthIndex, day);

    cells.push({
      key: dateKey,
      dateKey,
      dayNumber: day,
      summary: getDaySummary(dateKey, schedules, appointments),
      isToday: dateKey === TODAY_DATE_KEY,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const updateSlotState = (current, dateKey, time, changes) => {
  const currentDay = current[dateKey] || {};
  const currentSlots = current[dateKey]?.slots || {};
  const existingSlot = currentSlots[time] || {
    status: SLOT_STATUS.AVAILABLE,
    custom: !DEFAULT_TIME_SLOTS.includes(time),
  };

  return {
    ...current,
    [dateKey]: {
      ...currentDay,
      slots: {
        ...currentSlots,
        [time]: {
          ...existingSlot,
          ...changes,
        },
      },
    },
  };
};

export {
  MONTH_NAMES,
  WEEK_LABELS,
  SLOT_STATUS,
  SLOT_STATUS_META,
  LEGEND_ITEMS,
  HEADER_MENU_ITEMS,
  AVAILABLE_VETERINARIANS,
  TODAY_DATE_KEY,
  INITIAL_MONTH,
  INITIAL_DAY_SCHEDULES,
  INITIAL_APPOINTMENTS,
  createDateKey,
  fromDateKey,
  formatFullDate,
  parseTimeLabel,
  normalizeTimeInput,
  ensureDateSchedule,
  isDateEnabledForBookings,
  getSlotStatusKeyForAppointment,
  getReadableStatus,
  buildDaySlots,
  getDaySummary,
  buildCalendarCells,
  getSharedAppointmentCalendarState,
  setSharedAppointmentCalendarState,
  updateSlotState,
};

