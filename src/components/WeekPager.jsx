import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDayLabel } from "./VetLeaveImpact";

// Week-at-a-time browsing for schedules (the vet's My Schedule and the
// staff Clinic Coverage). Weeks run Sunday to Saturday, from this week up
// to the last week the loaded data fully covers.

const pad = value => String(value).padStart(2, "0");
const parseDate = date => {
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const formatISO = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const utcDay = date => {
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(date, count) {
  const next = parseDate(date);
  next.setDate(next.getDate() + count);
  return formatISO(next);
}

// Sunday of the week a date falls in.
export function weekStartOf(date) {
  const day = parseDate(date);
  day.setDate(day.getDate() - day.getDay());
  return formatISO(day);
}

export const daysBetween = (from, to) => Math.round((utcDay(to) - utcDay(from)) / 86400000);

// "Sep 27"
export const shortDate = date => formatDayLabel(date).split(", ")[1];
// "Sun"
export const weekdayShort = date => formatDayLabel(date).split(",")[0];

// today: the clinic's today; lastDate: the last date the data covers.
// Options: pastWeeks lets the pager go back that many weeks (history);
// weeksAhead fixes how far forward it goes when data is loaded per week.
export function useWeekPager(today, lastDate, { pastWeeks = 0, weeksAhead = null } = {}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const firstWeek = weekStartOf(today);
  const maxOffset = weeksAhead ?? Math.max(0, Math.floor((daysBetween(firstWeek, lastDate || today) - 6) / 7));
  const minOffset = -Math.abs(pastWeeks);
  const offset = Math.max(minOffset, Math.min(weekOffset, maxOffset));
  const weekStart = addDays(firstWeek, offset * 7);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  return {
    offset,
    minOffset,
    maxOffset,
    setOffset: setWeekOffset,
    weekStart,
    weekDates,
    label: offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `Week of ${shortDate(weekStart)}`,
    caption: offset === 0 ? "this week" : offset === 1 ? "next week" : offset === -1 ? "last week" : `week of ${shortDate(weekStart)}`
  };
}

// ‹ This week · Sep 27 – Oct 3 ›, plus a "This week" jump back.
export default function WeekPager({ pager }) {
  const { offset, minOffset = 0, maxOffset, setOffset, weekStart, label } = pager;
  return (
    <div className="wkp">
      {offset !== 0 && <button type="button" className="wkp-now" onClick={() => setOffset(0)}>This week</button>}
      <button type="button" className="wkp-arrow" aria-label="Previous week" disabled={offset <= minOffset} onClick={() => setOffset(offset - 1)}><ChevronLeft size={18} /></button>
      <div className="wkp-label"><b>{label}</b><small>{shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}</small></div>
      <button type="button" className="wkp-arrow" aria-label="Next week" disabled={offset >= maxOffset} onClick={() => setOffset(offset + 1)}><ChevronRight size={18} /></button>
      <style>{`
        .wkp{display:flex;align-items:center;gap:8px}
        .wkp-arrow{width:36px;height:36px;display:grid;place-items:center;border:1px solid #d9e9ef;background:#fff;color:#2c6ba3;border-radius:10px;cursor:pointer;padding:0}
        .wkp-arrow:disabled{opacity:.4;cursor:not-allowed}
        .wkp-arrow:not(:disabled):hover{background:#f1f9fd;border-color:#9fd3ea}
        .wkp-label{display:grid;text-align:center;min-width:130px}
        .wkp-label b{color:#1d3a4a;font-size:14px}.wkp-label small{color:#6f8591;font-size:12px;font-weight:600}
        .wkp-now{border:1px solid #cfe4ed;background:#f1f9fd;color:#2c6ba3;border-radius:10px;padding:8px 12px;font-weight:800;cursor:pointer}
      `}</style>
    </div>
  );
}
