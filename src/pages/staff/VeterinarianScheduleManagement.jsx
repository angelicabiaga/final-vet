import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CalendarPlus, Save } from "lucide-react";
import AppShell from "../../components/AppShell";
import { getVeterinarians, todayLocal } from "../../services/appointmentService";
import { createVetSchedule, getAllSchedules, getScheduledUntil, saveScheduleOverride } from "../../services/scheduleService";
import TimeInput12h from "../../components/TimeInput12h";
import { formatTime12h } from "../../utils/timeFormat";
import { focusFirstInvalidField, invalidClass } from "../../utils/formValidation";
import VetLeaveRequestsPanel from "../../components/VetLeaveRequestsPanel";
import ClinicCoverageBoard from "../../components/ClinicCoverageBoard";
import { drName, formatDayLabel } from "../../components/VetLeaveImpact";
import { addDays, daysBetween, shortDate, weekStartOf } from "../../components/WeekPager";
import { subscribeToLeaveChanges } from "../../services/vetLeaveService";

// The vet works every day of the created period; days off are leave.
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MONTHS_AHEAD = 6;
const WEEKS_AHEAD = 12;
// period: "month" (whole month), "week" (whole week) or "range" (From/To).
const blankSchedule = { veterinarianId: "", period: "month", month: "", week: "", startDate: "", endDate: "", startTime: "09:00", endTime: "17:00" };
const blankAdjusted = { veterinarianId: "", scheduleDate: "", startTime: "09:00", endTime: "17:00" };

const pad = value => String(value).padStart(2, "0");
const monthKey = date => String(date).slice(0, 7);
function lastOfMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return `${key}-${pad(new Date(y, m, 0).getDate())}`;
}
function nextMonthKey(key) {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
// A whole month, starting today when it's the current month.
function monthRange(key, today) {
  const first = `${key}-01`;
  return { start: first < today ? today : first, end: lastOfMonth(key) };
}
// A whole Sunday-Saturday week, starting today when it's the current week.
function weekRange(start, today) {
  return { start: start < today ? today : start, end: addDays(start, 6) };
}

export default function VeterinarianScheduleManagement({ profile }) {
  const today = todayLocal();
  const [vets, setVets] = useState([]);
  const [roster, setRoster] = useState([]);
  const [scheduledUntil, setScheduledUntil] = useState({});
  const [sf, setSf] = useState(blankSchedule);
  const [sfErrors, setSfErrors] = useState({});
  const sfRefs = useRef({}).current;
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState(null);
  const [af, setAf] = useState(blankAdjusted);
  const [afErrors, setAfErrors] = useState({});
  const afRefs = useRef({}).current;
  const [adjustedNotice, setAdjustedNotice] = useState(null);

  const loadRosters = useCallback(async () => {
    const [nextRoster, until] = await Promise.all([getAllSchedules().catch(() => []), getScheduledUntil()]);
    setRoster(nextRoster);
    setScheduledUntil(until);
  }, []);

  useEffect(() => {
    getVeterinarians().then(setVets).catch(error => setScheduleNotice({ type: "error", text: error.message }));
    loadRosters();
    return subscribeToLeaveChanges(() => loadRosters());
  }, [loadRosters]);

  const monthOptions = useMemo(() => {
    const keys = [monthKey(today)];
    while (keys.length <= MONTHS_AHEAD) keys.push(nextMonthKey(keys[keys.length - 1]));
    return keys;
  }, [today]);

  const weekOptions = useMemo(() => {
    const first = weekStartOf(today);
    return Array.from({ length: WEEKS_AHEAD + 1 }, (_, index) => addDays(first, index * 7));
  }, [today]);
  const weekLabel = (start, index) => `${shortDate(start)} – ${shortDate(addDays(start, 6))}${index === 0 ? " (this week, from today)" : index === 1 ? " (next week)" : ""}`;

  // Picking a vet prefills their usual hours and the first month / week
  // that still needs a schedule (right after their created one ends).
  function chooseVet(veterinarianId) {
    const usual = roster.find(row => row.veterinarian_id === veterinarianId && row.is_available);
    const until = scheduledUntil[veterinarianId];
    const created = until && until >= today;
    const nextMonth = created ? (until === lastOfMonth(monthKey(until)) ? nextMonthKey(monthKey(until)) : monthKey(until)) : monthKey(today);
    const nextWeek = created ? weekStartOf(addDays(until, 1)) : weekStartOf(today);
    setSf(current => ({
      ...current,
      veterinarianId,
      month: monthOptions.includes(nextMonth) ? nextMonth : monthOptions[1],
      week: weekOptions.includes(nextWeek) ? nextWeek : weekOptions[weekOptions.length - 1],
      startTime: usual ? String(usual.start_time).slice(0, 5) : current.startTime,
      endTime: usual ? String(usual.end_time).slice(0, 5) : current.endTime
    }));
    if (sfErrors.veterinarianId) setSfErrors(current => ({ ...current, veterinarianId: "" }));
  }

  const range = sf.period === "month"
    ? (sf.month ? monthRange(sf.month, today) : null)
    : sf.period === "week"
      ? (sf.week ? weekRange(sf.week, today) : null)
      : (sf.startDate && sf.endDate ? { start: sf.startDate, end: sf.endDate } : null);
  const validRange = range && range.start >= today && range.end >= range.start && daysBetween(range.start, range.end) <= 92;
  const dayCount = validRange ? daysBetween(range.start, range.end) + 1 : 0;
  const selectedVet = vets.find(vet => vet.id === sf.veterinarianId);
  const vetUntil = scheduledUntil[sf.veterinarianId];

  // "Whole month" and "whole week" are exclusive; with neither ticked the
  // From/To dates are used.
  function setPeriod(period, checked) {
    setSf(current => ({ ...current, period: checked ? period : "range" }));
    setSfErrors({});
  }

  async function submitSchedule(event) {
    event.preventDefault();
    const errors = {};
    if (!sf.veterinarianId) errors.veterinarianId = "Please select a veterinarian.";
    if (sf.period === "month" && !sf.month) errors.month = "Please choose a month.";
    if (sf.period === "week" && !sf.week) errors.week = "Please choose a week.";
    if (sf.period === "range") {
      if (!sf.startDate) errors.startDate = "Please choose the first day.";
      else if (sf.startDate < today) errors.startDate = "The first day can't be in the past.";
      if (!sf.endDate) errors.endDate = "Please choose the last day.";
      else if (sf.startDate && sf.endDate < sf.startDate) errors.endDate = "The last day must be on or after the first day.";
      else if (sf.startDate && daysBetween(sf.startDate, sf.endDate) > 92) errors.endDate = "Create at most 3 months at a time.";
    }
    if (!sf.startTime || !sf.endTime || sf.endTime <= sf.startTime) errors.endTime = "The end time must be after the start time.";
    setSfErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(sfRefs, errors);
      return;
    }
    try {
      setSavingSchedule(true);
      setScheduleNotice(null);
      const result = await createVetSchedule({
        staffId: profile.id, veterinarianId: sf.veterinarianId, startDate: range.start, endDate: range.end,
        weekdays: ALL_DAYS, startTime: sf.startTime, endTime: sf.endTime
      });
      const conflictText = result?.conflicts
        ? ` ${result.conflicts} booked appointment${result.conflicts === 1 ? " no longer fits" : "s no longer fit"}; see Booked outside current hours above.`
        : "";
      setScheduleNotice({ type: "success", text: `Schedule created for ${drName(selectedVet?.full_name)}: ${formatDayLabel(range.start)} – ${formatDayLabel(range.end)} (${result?.working_days ?? dayCount} day${(result?.working_days ?? dayCount) === 1 ? "" : "s"}). Pet owners can now book these dates.${conflictText}` });
      setSf(current => ({ ...blankSchedule, veterinarianId: current.veterinarianId, startTime: current.startTime, endTime: current.endTime }));
      await loadRosters();
    } catch (error) {
      setScheduleNotice({ type: "error", text: error.message });
    } finally {
      setSavingSchedule(false);
    }
  }

  async function submitAdjusted(event) {
    event.preventDefault();
    const errors = {};
    if (!af.veterinarianId) errors.veterinarianId = "Please select a veterinarian.";
    if (!af.scheduleDate) errors.scheduleDate = "Please select a date.";
    if (!af.startTime || !af.endTime || af.endTime <= af.startTime) errors.endTime = "The end time must be after the start time.";
    // Same rule the database enforces: clinic hours are 9:00 AM – 7:00 PM.
    else if (af.startTime.slice(0, 5) < "09:00" || af.endTime.slice(0, 5) > "19:00") errors.endTime = "Adjusted hours must be within clinic hours (9:00 AM – 7:00 PM).";
    setAfErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      focusFirstInvalidField(afRefs, errors);
      return;
    }
    try {
      setAdjustedNotice(null);
      await saveScheduleOverride({ ...af, isAvailable: true, reason: null, createdBy: profile.id });
      setAdjustedNotice({ type: "success", text: `Adjusted hours saved for ${drName(vets.find(vet => vet.id === af.veterinarianId)?.full_name)} on ${formatDayLabel(af.scheduleDate)}: ${formatTime12h(af.startTime)} – ${formatTime12h(af.endTime)}. They show in the Clinic Schedule as Adjusted.` });
      setAf(blankAdjusted);
      setAfErrors({});
    } catch (error) {
      setAdjustedNotice({ type: "error", text: error.message });
    }
  }

  return (
    <AppShell profile={profile} title="Veterinarian Schedule Management">
      <VetLeaveRequestsPanel profile={profile} />
      <ClinicCoverageBoard profile={profile} />

      <div className="schedule-grid">
        <form className="card" onSubmit={submitSchedule} noValidate>
          <h2><CalendarPlus /> Create Schedule</h2>
          <p className="form-hint">Publish a vet's hours ahead of time, for every day of the month, week or dates you choose. Pet owners can only book dates that have a created schedule. For days off, use Record leave.</p>

          <label>Veterinarian<span className="required-mark"> *</span>
            <select ref={el => { sfRefs.veterinarianId = el; }} className={invalidClass(sfErrors, "veterinarianId")} value={sf.veterinarianId} onChange={event => chooseVet(event.target.value)}>
              <option value="">Select veterinarian</option>
              {vets.map(vet => <option key={vet.id} value={vet.id}>{drName(vet.full_name)}</option>)}
            </select>
            {sfErrors.veterinarianId && <span className="field-error-text">{sfErrors.veterinarianId}</span>}
            {sf.veterinarianId && (
              <small className="sched-until">{vetUntil && vetUntil >= today ? `Schedule created until ${formatDayLabel(vetUntil)}.` : "No upcoming schedule yet."}</small>
            )}
          </label>

          <div className="sched-periods">
            <label className="check">
              <input type="checkbox" checked={sf.period === "month"} onChange={event => setPeriod("month", event.target.checked)} /> Apply for a whole month
            </label>
            <label className="check">
              <input type="checkbox" checked={sf.period === "week"} onChange={event => setPeriod("week", event.target.checked)} /> Apply for a whole week
            </label>
          </div>

          {sf.period === "month" && (
            <label>Month<span className="required-mark"> *</span>
              <select ref={el => { sfRefs.month = el; }} className={invalidClass(sfErrors, "month")} value={sf.month} onChange={event => { setSf({ ...sf, month: event.target.value }); if (sfErrors.month) setSfErrors({ ...sfErrors, month: "" }); }}>
                <option value="">Select month</option>
                {monthOptions.map(key => <option key={key} value={key}>{monthLabel(key)}{key === monthKey(today) ? " (from today)" : ""}</option>)}
              </select>
              {sfErrors.month && <span className="field-error-text">{sfErrors.month}</span>}
            </label>
          )}
          {sf.period === "week" && (
            <label>Week<span className="required-mark"> *</span>
              <select ref={el => { sfRefs.week = el; }} className={invalidClass(sfErrors, "week")} value={sf.week} onChange={event => { setSf({ ...sf, week: event.target.value }); if (sfErrors.week) setSfErrors({ ...sfErrors, week: "" }); }}>
                <option value="">Select week</option>
                {weekOptions.map((start, index) => <option key={start} value={start}>{weekLabel(start, index)}</option>)}
              </select>
              {sfErrors.week && <span className="field-error-text">{sfErrors.week}</span>}
            </label>
          )}
          {sf.period === "range" && (
            <div className="two">
              <label>From<span className="required-mark"> *</span>
                <input ref={el => { sfRefs.startDate = el; }} className={invalidClass(sfErrors, "startDate")} type="date" min={today} value={sf.startDate}
                  onChange={event => { const value = event.target.value; setSf({ ...sf, startDate: value, endDate: sf.endDate && sf.endDate >= value ? sf.endDate : value }); if (sfErrors.startDate) setSfErrors({ ...sfErrors, startDate: "" }); }} />
                {sfErrors.startDate && <span className="field-error-text">{sfErrors.startDate}</span>}
              </label>
              <label>To<span className="required-mark"> *</span>
                <input ref={el => { sfRefs.endDate = el; }} className={invalidClass(sfErrors, "endDate")} type="date" min={sf.startDate || today} max={sf.startDate ? addDays(sf.startDate, 92) : undefined} value={sf.endDate}
                  onChange={event => { setSf({ ...sf, endDate: event.target.value }); if (sfErrors.endDate) setSfErrors({ ...sfErrors, endDate: "" }); }} />
                {sfErrors.endDate && <span className="field-error-text">{sfErrors.endDate}</span>}
              </label>
            </div>
          )}

          <div className="two">
            <label>Start Time<span className="required-mark"> *</span><TimeInput12h value={sf.startTime} onChange={value => setSf({ ...sf, startTime: value })} /></label>
            <label>End Time<span className="required-mark"> *</span>
              <TimeInput12h ref={el => { sfRefs.endTime = el; }} className={invalidClass(sfErrors, "endTime")} value={sf.endTime} onChange={value => { setSf({ ...sf, endTime: value }); if (sfErrors.endTime) setSfErrors({ ...sfErrors, endTime: "" }); }} />
              {sfErrors.endTime && <span className="field-error-text">{sfErrors.endTime}</span>}
            </label>
          </div>

          {validRange && sf.endTime > sf.startTime && (
            <p className="sched-summary">
              Creates <b>{formatDayLabel(range.start)} – {formatDayLabel(range.end)}</b>: {dayCount} day{dayCount === 1 ? "" : "s"}, every day {formatTime12h(sf.startTime)} – {formatTime12h(sf.endTime)}.
              {vetUntil && vetUntil >= range.start ? " Days already created in this range are replaced;" : ""} Leave and adjusted hours stay as they are.
            </p>
          )}
          {scheduleNotice && <div className={`notice${scheduleNotice.type === "error" ? " notice-bad" : ""}`}>{scheduleNotice.text}</div>}
          <button disabled={savingSchedule}><Save size={17} /> {savingSchedule ? "Creating…" : "Create Schedule"}</button>
        </form>

        <form className="card" onSubmit={submitAdjusted} noValidate>
          <h2><CalendarDays /> Adjusted Hours (Specific Date)</h2>
          <p className="form-hint">Different hours for one date. It shows in the Clinic Schedule as Adjusted, where you can remove it. For leave or an emergency, use Record leave above so booked patients are flagged and the vet is notified.</p>
          <label>Veterinarian<span className="required-mark"> *</span>
            <select ref={el => { afRefs.veterinarianId = el; }} className={invalidClass(afErrors, "veterinarianId")} value={af.veterinarianId} onChange={event => { setAf({ ...af, veterinarianId: event.target.value }); if (afErrors.veterinarianId) setAfErrors({ ...afErrors, veterinarianId: "" }); }}>
              <option value="">Select veterinarian</option>
              {vets.map(vet => <option key={vet.id} value={vet.id}>{drName(vet.full_name)}</option>)}
            </select>
            {afErrors.veterinarianId && <span className="field-error-text">{afErrors.veterinarianId}</span>}
          </label>
          <label>Schedule Date<span className="required-mark"> *</span>
            <input ref={el => { afRefs.scheduleDate = el; }} className={invalidClass(afErrors, "scheduleDate")} min={today} type="date" value={af.scheduleDate} onChange={event => { setAf({ ...af, scheduleDate: event.target.value }); if (afErrors.scheduleDate) setAfErrors({ ...afErrors, scheduleDate: "" }); }} />
            {afErrors.scheduleDate && <span className="field-error-text">{afErrors.scheduleDate}</span>}
          </label>
          <div className="two">
            <label>Start Time<span className="required-mark"> *</span><TimeInput12h value={af.startTime} onChange={value => setAf({ ...af, startTime: value })} /></label>
            <label>End Time<span className="required-mark"> *</span>
              <TimeInput12h ref={el => { afRefs.endTime = el; }} className={invalidClass(afErrors, "endTime")} value={af.endTime} onChange={value => { setAf({ ...af, endTime: value }); if (afErrors.endTime) setAfErrors({ ...afErrors, endTime: "" }); }} />
              {afErrors.endTime && <span className="field-error-text">{afErrors.endTime}</span>}
            </label>
          </div>
          {adjustedNotice && <div className={`notice${adjustedNotice.type === "error" ? " notice-bad" : ""}`}>{adjustedNotice.text}</div>}
          <button><Save size={17} /> Save Adjusted Hours</button>
        </form>
      </div>

      <style>{`
        .schedule-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;align-items:stretch}
        .schedule-grid>.card{display:flex;flex-direction:column;margin:0}
        .schedule-grid>.card>button{margin-top:auto;align-self:flex-start}
        .schedule-grid>.card>.notice{margin-top:auto}
        .schedule-grid>.card>.notice+button{margin-top:0}
        .card h2{display:flex;align-items:center;gap:8px;margin-top:0;margin-bottom:14px}
        .card label{display:grid;gap:5px;font-weight:700;font-size:13px;margin-bottom:10px}
        .card input,.card select{padding:11px;border:1px solid #cfe4ed;border-radius:10px}
        .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;font-weight:600!important}
        .check input{width:auto}
        .card>button{border:0;background:#4DA8DA;color:white;padding:12px 15px;border-radius:11px;font-weight:800;display:flex;gap:7px;align-items:center;cursor:pointer}
        .card>button:disabled{opacity:.6;cursor:not-allowed}
        .notice{padding:10px 14px;background:#eaf8ef;color:#28774b;border-radius:12px;margin-bottom:12px;font-size:13px;font-weight:600;line-height:1.45}
        .notice-bad{background:#fff1f1;color:#a33f3f}
        .form-hint{margin:-6px 0 12px;color:#6f7f88;font-size:12.5px}
        .sched-until{color:#2c6ba3;font-weight:600}
        .sched-periods{display:flex;flex-wrap:wrap;gap:4px 22px}
        .sched-summary{margin:0 0 12px;font-size:12.5px;line-height:1.5;color:#2c5f78;background:#eef8fc;border:1px solid #cfe7f2;border-radius:11px;padding:10px 12px}
        @media(max-width:900px){.schedule-grid{grid-template-columns:1fr}}
      `}</style>
    </AppShell>
  );
}
