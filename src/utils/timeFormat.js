export const MANILA_TIME_ZONE = "Asia/Manila";

// Formats a "HH:MM" or "HH:MM:SS" time-of-day string (a plain wall-clock
// value with no date/timezone component, e.g. an appointment or schedule
// time) as 12-hour text with AM/PM. Pure string/number math on purpose —
// these values carry no timezone, so no Date/Intl conversion is involved.
export function formatTime12h(time) {
  if (!time) return "—";
  const [hourStr, minuteStr] = String(time).slice(0, 5).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "—";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// Formats the time portion of a Date/ISO timestamp in Asia/Manila, 12-hour
// with AM/PM. Use for real timestamps (created_at, "now" clocks, etc).
export function formatClockTime(value, options) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MANILA_TIME_ZONE,
    ...options,
  });
}

// Formats a Date/ISO timestamp as date + 12-hour time in Asia/Manila.
export function formatDateTime12h(value, options) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MANILA_TIME_ZONE,
    ...options,
  });
}

function manilaYmd(date) {
  // en-CA locale reliably gives "YYYY-MM-DD" regardless of the runtime's
  // own default locale, which is all that's needed to pull the Manila-local
  // calendar date back out of a real timestamp.
  return date.toLocaleDateString("en-CA", { timeZone: MANILA_TIME_ZONE }).split("-").map(Number);
}

// Formats a date as "August 27, 2026" -- accepts either a plain "YYYY-MM-DD"
// date-only string (an appointment/expiry/birth date with no time
// component, parsed from its own y/m/d digits so it never shifts a day off
// from timezone conversion) or a real Date/ISO timestamp (converted to its
// Asia/Manila calendar date first). Use this instead of ever rendering a
// raw ISO date string to a user.
export function formatDateLong(value) {
  if (!value) return "—";
  const str = String(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}/.test(str);
  const [y, m, d] = isDateOnly
    ? str.slice(0, 10).split("-").map(Number)
    : manilaYmd(value instanceof Date ? value : new Date(value));
  if (!y || !m || !d || Number.isNaN(y)) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Formats a date as "8-27-26" -- same input handling as formatDateLong, for
// dense table cells where the long form doesn't fit.
export function formatDateShort(value) {
  if (!value) return "—";
  const str = String(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}/.test(str);
  const [y, m, d] = isDateOnly
    ? str.slice(0, 10).split("-").map(Number)
    : manilaYmd(value instanceof Date ? value : new Date(value));
  if (!y || !m || !d || Number.isNaN(y)) return "—";
  return `${m}-${d}-${String(y).slice(-2)}`;
}

// Splits a 24h "HH:MM"/"HH:MM:SS" string into 12-hour picker parts, for
// building custom hour/minute/AM-PM select inputs.
export function to12HourParts(time) {
  const [hourStr, minuteStr] = String(time || "").slice(0, 5).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return { hour12: 12, minute: 0, period: "AM" };
  }
  const period = hour >= 12 ? "PM" : "AM";
  return { hour12: hour % 12 || 12, minute, period };
}

// Combines 12-hour picker parts back into a 24h "HH:MM" string for storage.
export function from12HourParts(hour12, minute, period) {
  const pad = (n) => String(n).padStart(2, "0");
  let hour = Number(hour12) % 12;
  if (String(period).toUpperCase() === "PM") hour += 12;
  return `${pad(hour)}:${pad(Number(minute))}`;
}
