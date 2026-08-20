import React from "react";
import { to12HourParts, from12HourParts } from "../utils/timeFormat";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

// A 12-hour hour/minute/AM-PM picker that reads and writes the same 24h
// "HH:MM" string a native <input type="time"> would, so callers can swap
// it in without changing how the value is stored or validated.
export default function TimeInput12h({ value, onChange, disabled, required, name, id }) {
  const { hour12, minute, period } = to12HourParts(value);

  function update(nextHour12, nextMinute, nextPeriod) {
    onChange(from12HourParts(nextHour12, nextMinute, nextPeriod));
  }

  return (
    <div className="time12h">
      <select
        aria-label="Hour"
        name={name ? `${name}-hour` : undefined}
        id={id ? `${id}-hour` : undefined}
        disabled={disabled}
        required={required}
        value={hour12}
        onChange={(e) => update(Number(e.target.value), minute, period)}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="time12h-sep">:</span>
      <select
        aria-label="Minute"
        name={name ? `${name}-minute` : undefined}
        id={id ? `${id}-minute` : undefined}
        disabled={disabled}
        required={required}
        value={minute}
        onChange={(e) => update(hour12, Number(e.target.value), period)}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
      <select
        aria-label="AM or PM"
        name={name ? `${name}-period` : undefined}
        id={id ? `${id}-period` : undefined}
        disabled={disabled}
        required={required}
        value={period}
        onChange={(e) => update(hour12, minute, e.target.value)}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      <style>{`.time12h{display:flex;align-items:center;gap:5px}.time12h select{padding:11px 6px;border:1px solid #cfe4ed;border-radius:10px;background:white;flex:1;min-width:0}.time12h-sep{font-weight:700;color:#6F7F88}`}</style>
    </div>
  );
}
