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
