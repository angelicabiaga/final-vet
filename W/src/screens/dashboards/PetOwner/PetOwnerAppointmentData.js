const OTHER_OPTION_VALUE = '__other__';

const cloneAppointment = (appointment) => {
  if (!appointment) {
    return null;
  }

  return {
    ...appointment,
    pet: appointment.pet
      ? {
          ...appointment.pet,
          medicalHistory: [...(appointment.pet.medicalHistory || [])],
          vaccinations: [...(appointment.pet.vaccinations || [])],
          visits: [...(appointment.pet.visits || [])],
        }
      : null,
  };
};

const VISIT_REASONS = [
  {
    value: 'consultation',
    label: 'Consultation',
    description: 'General consultations and follow-up check-ups.',
  },
  {
    value: 'vaccination',
    label: 'Vaccination',
    description: 'Uses the available 2026 vaccine inventory list.',
  },
  {
    value: 'deworming',
    label: 'Deworming',
    description: 'Available for both dogs and cats.',
  },
  {
    value: 'minor_surgery',
    label: 'Minor Surgery',
    description: 'Basic wound repair and C-section support.',
  },
  {
    value: 'medical_testing',
    label: 'Medical Consult and Testing',
    description: 'CBC, blood chemistry, and available test kits.',
  },
];

const CONSULTATION_OPTIONS = [
  { label: 'General Consultation', value: 'General Consultation' },
  { label: 'Follow-up Check-up', value: 'Follow-up Check-up' },
  { label: 'Others', value: OTHER_OPTION_VALUE },
];

const VACCINE_OPTIONS = [
  'Vanguard 5 in 1',
  'Vanguard 6 in 1',
  'Vanguard L4',
  'Purevac',
  'Anti Rabies 10DS',
  'Single Rabies for Cat',
  'Kennel Kupp KC (Bronchicine)',
  'Hipra DP',
  'Hipra DHLP',
  'Proheart Inj.',
  'Felocill 4 in 1',
  'Bondetella',
].map((item) => ({ label: item, value: item }));

const DEWORMING_OPTIONS = [
  { label: 'Dog Deworming', value: 'Dog Deworming' },
  { label: 'Cat Deworming', value: 'Cat Deworming' },
];

const MINOR_SURGERY_OPTIONS = [
  { label: 'Basic Wound Repair', value: 'Basic Wound Repair' },
  { label: 'C-Section', value: 'C-Section' },
];

const MEDICAL_TESTING_OPTIONS = [
  { label: 'CBC', value: 'CBC' },
  { label: 'Blood Chemistry', value: 'Blood Chemistry' },
  { label: 'Dog Parvo / Distemper Test', value: 'Dog Parvo / Distemper Test' },
  { label: 'Canine Coronavirus Test', value: 'Canine Coronavirus Test' },
  { label: 'Blood Parasite Test', value: 'Blood Parasite Test' },
  { label: 'Feline Leukemia Test', value: 'Feline Leukemia Test' },
  { label: 'Feline Rhinotracheitis Test', value: 'Feline Rhinotracheitis Test' },
  { label: 'Giardia Test', value: 'Giardia Test' },
];

const TODAY = new Date();
const CURRENT_YEAR = TODAY.getFullYear();
const CURRENT_MONTH_INDEX = TODAY.getMonth();
const CURRENT_DAY = TODAY.getDate();

const YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1];
const MONTHS = [
  { label: 'Jan', value: 'January', index: 0 },
  { label: 'Feb', value: 'February', index: 1 },
  { label: 'Mar', value: 'March', index: 2 },
  { label: 'Apr', value: 'April', index: 3 },
  { label: 'May', value: 'May', index: 4 },
  { label: 'Jun', value: 'June', index: 5 },
  { label: 'Jul', value: 'July', index: 6 },
  { label: 'Aug', value: 'August', index: 7 },
  { label: 'Sep', value: 'September', index: 8 },
  { label: 'Oct', value: 'October', index: 9 },
  { label: 'Nov', value: 'November', index: 10 },
  { label: 'Dec', value: 'December', index: 11 },
];

const CALENDAR_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMES = ['08:00 AM', '10:30 AM', '01:00 PM', '03:30 PM'];

const AI_RECOMMENDATIONS = [
  {
    title: 'Best Slot',
    value: 'Apr 13, 10:30 AM',
    note: 'Lower queue and ideal for routine wellness visits.',
  },
  {
    title: 'Alternative',
    value: 'Apr 14, 01:00 PM',
    note: 'Balanced availability with faster confirmation chances.',
  },
  {
    title: 'Reminder',
    value: 'Morning Visit',
    note: 'Recommended if your pet is calmer earlier in the day.',
  },
];

let bookedAppointmentStore = null;

const getReasonDetailOptions = (reason) => {
  switch (reason) {
    case 'consultation':
      return CONSULTATION_OPTIONS;
    case 'vaccination':
      return VACCINE_OPTIONS;
    case 'deworming':
      return DEWORMING_OPTIONS;
    case 'minor_surgery':
      return MINOR_SURGERY_OPTIONS;
    case 'medical_testing':
      return MEDICAL_TESTING_OPTIONS;
    default:
      return [];
  }
};

const getReasonLabel = (reason) => VISIT_REASONS.find((item) => item.value === reason)?.label || 'Reason';

const getReasonDetailLabel = (reason) => {
  switch (reason) {
    case 'consultation':
      return 'Consultation Type';
    case 'vaccination':
      return 'Available Vaccine';
    case 'deworming':
      return 'Deworming Type';
    case 'minor_surgery':
      return 'Surgery Type';
    case 'medical_testing':
      return 'Consult or Test';
    default:
      return 'Details';
  }
};

const getReasonHelperText = (reason) => {
  switch (reason) {
    case 'consultation':
      return 'Start with the visit type. Choose Others if the concern needs a custom note.';
    case 'vaccination':
      return 'Vaccine options are based on the available items listed in INVENTORY-2026.xlsx.';
    case 'deworming':
      return 'Deworming services are available for dogs and cats.';
    case 'minor_surgery':
      return 'Minor surgery currently includes basic wound repair and C-section support.';
    case 'medical_testing':
      return 'Testing includes CBC, blood chemistry, and dog/cat test kit options.';
    default:
      return 'Choose a visit reason first.';
  }
};

const buildReasonSummary = (reason, detailValue) => {
  const label = getReasonLabel(reason);
  return detailValue ? `${label} - ${detailValue}` : label;
};

const buildCalendarDates = (year, monthIndex) => {
  const firstDayOfMonth = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const previousMonthDays = new Date(year, monthIndex, 0).getDate();
  const dates = [];

  for (let i = firstDayOfMonth - 1; i >= 0; i -= 1) {
    dates.push({
      key: `prev-${i}`,
      day: String(previousMonthDays - i),
      muted: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isPastCurrentMonth =
      year === CURRENT_YEAR &&
      monthIndex === CURRENT_MONTH_INDEX &&
      day < CURRENT_DAY;

    dates.push({
      key: `current-${day}`,
      day: String(day),
      muted: isPastCurrentMonth,
    });
  }

  while (dates.length % 7 !== 0) {
    dates.push({
      key: `next-${dates.length}`,
      day: String(dates.length % 7 === 0 ? 1 : (dates.length % 7) + 1),
      muted: true,
    });
  }

  return dates;
};

const getBookedAppointment = () => cloneAppointment(bookedAppointmentStore);

const setBookedAppointment = (appointment) => {
  bookedAppointmentStore = cloneAppointment(appointment);
  return getBookedAppointment();
};

export {
  AI_RECOMMENDATIONS,
  CALENDAR_DAYS,
  CURRENT_DAY,
  CURRENT_MONTH_INDEX,
  CURRENT_YEAR,
  MONTHS,
  OTHER_OPTION_VALUE,
  TIMES,
  VISIT_REASONS,
  YEARS,
  buildCalendarDates,
  buildReasonSummary,
  getBookedAppointment,
  getReasonDetailLabel,
  getReasonDetailOptions,
  getReasonHelperText,
  getReasonLabel,
  setBookedAppointment,
};
