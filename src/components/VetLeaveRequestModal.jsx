import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Siren, X } from "lucide-react";
import { EMERGENCY_TYPES, LEAVE_TYPES, getLeaveImpact, getScheduleOverview, staffFileLeave, submitLeaveRequest } from "../services/vetLeaveService";
import { formatTime12h } from "../utils/timeFormat";
import VetLeaveImpact, { drName, formatHours } from "./VetLeaveImpact";

const REASON_LIMIT = 500;
const pad = value => String(value).padStart(2, "0");

function addDays(date, count) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + count);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

const toMinutes = time => {
  const [h, m] = String(time).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function timeOptions(from, to, step) {
  const options = [];
  for (let minutes = toMinutes(from); minutes <= toMinutes(to); minutes += step) options.push(fromMinutes(minutes));
  return options;
}

// The vet's hours on a date: the 14-day overview when it covers the date,
// otherwise the weekly roster for that weekday. Null when unknown.
function shiftForDate(schedule, date) {
  if (!schedule || !date) return null;
  const day = (schedule.days || []).find(item => item.date === date);
  if (day?.working) return { start: String(day.start_time).slice(0, 5), end: String(day.end_time).slice(0, 5), leave: day.source === "leave" };
  if (day) return { off: true, leave: day.source === "leave" };
  const [y, m, d] = date.split("-").map(Number);
  const weekly = (schedule.weekly || []).find(item => item.day_of_week === new Date(y, m - 1, d).getDay());
  if (!weekly) return null;
  return weekly.is_available ? { start: String(weekly.start_time).slice(0, 5), end: String(weekly.end_time).slice(0, 5) } : { off: true };
}

// Emergency default: the current time rounded down to the 10-minute grid,
// kept inside today's shift.
function defaultEmergencyTime(shiftStart, shiftEnd) {
  const now = new Date();
  const rounded = Math.floor((now.getHours() * 60 + now.getMinutes()) / 10) * 10;
  const min = toMinutes(shiftStart || "09:00");
  const max = toMinutes(shiftEnd || "19:00") - 10;
  return fromMinutes(Math.min(Math.max(rounded, min), max));
}

// Vet mode: the signed-in vet files for themselves (planned leave goes to
// staff for approval; an emergency applies at once).
// Staff mode (`staffMode`): staff/admin record leave or an emergency for
// any vet; it applies at once since they are the approvers.
export default function VetLeaveRequestModal({ profile, mode = "Leave", today, initialDate, schedule, staffMode = false, veterinarians = [], onClose, onSubmitted }) {
  const [requestType, setRequestType] = useState(mode);
  const isEmergency = requestType === "Emergency";
  const [vetId, setVetId] = useState(staffMode ? "" : profile.id);
  const [vetSchedule, setVetSchedule] = useState(staffMode ? null : schedule);
  const tomorrow = addDays(today, 1);
  const earliestLeaveDate = staffMode ? today : tomorrow;
  const firstDate = initialDate && initialDate >= earliestLeaveDate ? initialDate : earliestLeaveDate;

  const [leaveType, setLeaveType] = useState(isEmergency ? EMERGENCY_TYPES[0] : LEAVE_TYPES[0]);
  const [startDate, setStartDate] = useState(firstDate);
  const [endDate, setEndDate] = useState(firstDate);
  const [duration, setDuration] = useState("full");
  const [partialTime, setPartialTime] = useState("");
  const [emergencyMode, setEmergencyMode] = useState("from");
  const [fromTime, setFromTime] = useState("");
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [reasonMissing, setReasonMissing] = useState(false);
  const sequence = useRef(0);
  const reasonRef = useRef(null);

  // Staff mode: load the chosen vet's hours so time choices fit their shift.
  useEffect(() => {
    if (!staffMode) return undefined;
    setVetSchedule(null);
    if (!vetId) return undefined;
    let active = true;
    getScheduleOverview(vetId, 14).then(result => { if (active) setVetSchedule(result); }).catch(() => {});
    return () => { active = false; };
  }, [staffMode, vetId]);

  const singleDay = startDate && startDate === endDate;
  useEffect(() => {
    if (!singleDay && duration !== "full") setDuration("full");
  }, [singleDay, duration]);

  // Part-day choices stay inside that day's shift (e.g. 9:30 AM–4:30 PM for
  // a 9–5 shift); clinic hours when the shift isn't known.
  const dayShift = shiftForDate(vetSchedule, startDate);
  const todayShift = shiftForDate(vetSchedule, today);
  const partialFrom = dayShift?.start ? fromMinutes(toMinutes(dayShift.start) + 30) : "09:30";
  const partialTo = dayShift?.end ? fromMinutes(toMinutes(dayShift.end) - 30) : "18:30";
  const emergencyStart = todayShift?.start && todayShift.start > "09:00" ? todayShift.start : "09:00";
  const emergencyEnd = todayShift?.end || "19:00";
  const partialOptions = useMemo(() => timeOptions(partialFrom, partialTo, 30), [partialFrom, partialTo]);
  const emergencyOptions = useMemo(() => timeOptions(emergencyStart, fromMinutes(toMinutes(emergencyEnd) - 10), 10), [emergencyStart, emergencyEnd]);

  useEffect(() => {
    if (partialOptions.length && !partialOptions.includes(partialTime)) {
      setPartialTime(partialOptions[Math.floor(partialOptions.length / 2)]);
    }
  }, [partialOptions, partialTime]);
  useEffect(() => {
    if (emergencyOptions.length && !emergencyOptions.includes(fromTime)) {
      setFromTime(defaultEmergencyTime(emergencyStart, emergencyEnd));
    }
  }, [emergencyOptions, fromTime, emergencyStart, emergencyEnd]);

  function switchType(next) {
    setRequestType(next);
    setLeaveType(next === "Emergency" ? EMERGENCY_TYPES[0] : LEAVE_TYPES[0]);
  }

  const payload = useMemo(() => {
    if (isEmergency) {
      const whole = emergencyMode === "whole";
      return { requestType: "Emergency", startDate: today, endDate: today, isFullDay: whole, startTime: whole ? null : fromTime, endTime: null };
    }
    const partial = singleDay && duration !== "full";
    return {
      requestType: "Leave",
      startDate,
      endDate,
      isFullDay: !partial,
      startTime: partial ? (duration === "late" ? "09:00" : partialTime) : null,
      endTime: partial ? (duration === "late" ? partialTime : "19:00") : null
    };
  }, [isEmergency, emergencyMode, fromTime, today, singleDay, duration, partialTime, startDate, endDate]);

  // Live conflict check, debounced so typing dates doesn't flood Supabase.
  useEffect(() => {
    const current = ++sequence.current;
    if (!vetId) {
      setImpact(null);
      setChecking(false);
      return undefined;
    }
    setChecking(true);
    setCheckError("");
    const timer = setTimeout(async () => {
      try {
        const result = await getLeaveImpact({ veterinarianId: vetId, filedByStaff: staffMode, ...payload });
        if (current === sequence.current) setImpact(result);
      } catch (error) {
        if (current === sequence.current) {
          setImpact(null);
          setCheckError(error.message);
        }
      } finally {
        if (current === sequence.current) setChecking(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [payload, vetId, staffMode]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  // The chosen type is the reason; only "Other" asks for one in words. The
  // button stays clickable and points to the box when it's still empty.
  const needsReason = leaveType === "Other";
  const hasReason = !needsReason || reason.trim().length > 0;
  const canSubmit = !saving && !checking && Boolean(vetId) && impact?.ok;

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    if (!hasReason) {
      setReasonMissing(true);
      reasonRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      reasonRef.current?.focus({ preventScroll: true });
      return;
    }
    try {
      setSaving(true);
      setSubmitError("");
      const values = { veterinarianId: vetId, leaveType, reason: needsReason ? reason.trim() : leaveType, ...payload };
      const result = staffMode
        ? await staffFileLeave({ staffId: profile.id, ...values })
        : await submitLeaveRequest(values);
      onSubmitted?.(result);
    } catch (error) {
      setSubmitError(error.message);
      setSaving(false);
    }
  }

  const selectedVet = veterinarians.find(vet => vet.id === vetId);
  const title = staffMode
    ? (isEmergency ? "Record an Emergency (Today)" : "Record Leave for a Veterinarian")
    : (isEmergency ? "Emergency Leave (Today)" : "Request Leave");
  const intro = staffMode
    ? "For when a vet calls the clinic. It applies right away (you're the approver), the vet is notified, and booked patients are flagged below."
    : isEmergency
      ? "Takes effect as soon as you submit. New bookings stop right away, and staff offer your booked patients another doctor (each owner confirms)."
      : "File at least one day ahead. Staff or an administrator reviews it, and your schedule changes only once it's approved.";
  const own = staffMode ? "their" : "my";

  return (
    <div className="vlm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className={`vlm-card${isEmergency ? " vlm-emergency" : ""}`} onSubmit={submit} noValidate>
        <header className="vlm-head">
          <span className="vlm-icon">{isEmergency ? <Siren size={20} /> : <CalendarPlus size={20} />}</span>
          <div>
            <h2>{title}</h2>
            <p>{intro}</p>
          </div>
          <button type="button" className="vlm-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="vlm-body">
          {staffMode && (
            <>
              <div className="vlm-two">
                <label className="vlm-field">Veterinarian
                  <select value={vetId} onChange={event => setVetId(event.target.value)}>
                    <option value="">Select veterinarian</option>
                    {veterinarians.map(vet => <option key={vet.id} value={vet.id}>{drName(vet.full_name)}</option>)}
                  </select>
                </label>
                <fieldset className="vlm-choices vlm-inline">
                  <legend>Type</legend>
                  <label className={!isEmergency ? "active" : ""}>
                    <input type="radio" name="request-type" checked={!isEmergency} onChange={() => switchType("Leave")} />
                    <span>Planned leave</span>
                  </label>
                  <label className={isEmergency ? "active" : ""}>
                    <input type="radio" name="request-type" checked={isEmergency} onChange={() => switchType("Emergency")} />
                    <span>Emergency today</span>
                  </label>
                </fieldset>
              </div>
              {selectedVet && todayShift && (
                <small className="vlm-hint">{drName(selectedVet.full_name)} today: {todayShift.leave && !todayShift.start ? "already on leave" : todayShift.start ? formatHours(todayShift.start, todayShift.end) : "not scheduled"}</small>
              )}
            </>
          )}

          <label className="vlm-field">{isEmergency ? "What happened?" : "Leave type"}
            <select value={leaveType} onChange={event => { setLeaveType(event.target.value); setReasonMissing(false); }}>
              {(isEmergency ? EMERGENCY_TYPES : LEAVE_TYPES).map(type => <option key={type}>{type}</option>)}
            </select>
          </label>

          {needsReason && (
            <label className="vlm-field">Please describe <span className="vlm-required">(required)</span>
              <textarea ref={reasonRef} rows={3} maxLength={REASON_LIMIT} value={reason} onChange={event => setReason(event.target.value)}
                className={reasonMissing && !hasReason ? "vlm-invalid" : undefined}
                placeholder={staffMode ? "e.g. Called in at 8:30 AM, car accident on the way." : isEmergency ? "A short note for staff, e.g. my child was brought to the hospital." : "e.g. Wedding, moving house."} />
              {reasonMissing && !hasReason && <small className="vlm-missing">Describe what happened{staffMode ? " for the record" : " so staff can plan coverage"}.</small>}
              <small className="vlm-counter">{reason.length}/{REASON_LIMIT}</small>
            </label>
          )}

          {isEmergency ? (
            <fieldset className="vlm-choices">
              <legend>{staffMode ? "When is the vet unavailable?" : "When are you unavailable?"}</legend>
              <label className={emergencyMode === "from" ? "active" : ""}>
                <input type="radio" name="emergency-mode" checked={emergencyMode === "from"} onChange={() => setEmergencyMode("from")} />
                <span>Leaving from
                  <select value={fromTime} onChange={event => { setFromTime(event.target.value); setEmergencyMode("from"); }}>
                    {emergencyOptions.map(time => <option key={time} value={time}>{formatTime12h(time)}</option>)}
                  </select>
                  until the end of {own} shift ({formatTime12h(emergencyEnd)})
                </span>
              </label>
              <label className={emergencyMode === "whole" ? "active" : ""}>
                <input type="radio" name="emergency-mode" checked={emergencyMode === "whole"} onChange={() => setEmergencyMode("whole")} />
                <span>{staffMode ? "Can't work at all today" : "I can't work at all today"}</span>
              </label>
            </fieldset>
          ) : (
            <>
              <div className="vlm-two">
                <label className="vlm-field">First day
                  <input type="date" min={earliestLeaveDate} value={startDate} onChange={event => {
                    const value = event.target.value;
                    setStartDate(value);
                    if (!endDate || endDate < value || endDate > addDays(value, 30)) setEndDate(value);
                  }} />
                </label>
                <label className="vlm-field">Last day
                  <input type="date" min={startDate || earliestLeaveDate} max={startDate ? addDays(startDate, 30) : undefined} value={endDate} onChange={event => setEndDate(event.target.value)} />
                </label>
              </div>
              <fieldset className="vlm-choices">
                <legend>Duration</legend>
                <label className={duration === "full" ? "active" : ""}>
                  <input type="radio" name="duration" checked={duration === "full"} onChange={() => setDuration("full")} />
                  <span>{singleDay ? "Whole day" : "Whole days"}</span>
                </label>
                <label className={`${duration === "late" ? "active" : ""}${singleDay ? "" : " disabled"}`}>
                  <input type="radio" name="duration" disabled={!singleDay} checked={duration === "late"} onChange={() => setDuration("late")} />
                  <span>Arrive late, starting at
                    <select disabled={!singleDay || duration !== "late"} value={partialTime} onChange={event => setPartialTime(event.target.value)}>
                      {partialOptions.map(time => <option key={time} value={time}>{formatTime12h(time)}</option>)}
                    </select>
                  </span>
                </label>
                <label className={`${duration === "early" ? "active" : ""}${singleDay ? "" : " disabled"}`}>
                  <input type="radio" name="duration" disabled={!singleDay} checked={duration === "early"} onChange={() => setDuration("early")} />
                  <span>Leave early, from
                    <select disabled={!singleDay || duration !== "early"} value={partialTime} onChange={event => setPartialTime(event.target.value)}>
                      {partialOptions.map(time => <option key={time} value={time}>{formatTime12h(time)}</option>)}
                    </select>
                  </span>
                </label>
                {!singleDay && <small className="vlm-hint">Part-day leave is only for a single date.</small>}
                {singleDay && dayShift?.start && <small className="vlm-hint">Shift that day: {formatHours(dayShift.start, dayShift.end)}</small>}
                {singleDay && dayShift?.off && <small className="vlm-hint">{dayShift.leave ? "Already on leave that day." : "Not scheduled that day."}</small>}
              </fieldset>
            </>
          )}

          <section className="vlm-impact">
            <h3>{staffMode ? "Impact on the schedule" : "Impact on your schedule"}</h3>
            {!vetId ? <p className="vlm-hint">Select a veterinarian first.</p>
              : checkError ? <div className="vlm-check-error">{checkError}</div>
              : <VetLeaveImpact impact={impact} loading={checking} audience={staffMode ? "staff" : "vet"} />}
          </section>
        </div>

        <footer className="vlm-foot">
          {submitError && <div className="err">{submitError}</div>}
          {canSubmit && !hasReason && <span className="vlm-foot-hint">Describe what happened above to continue.</span>}
          <button type="button" className="vlm-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="vlm-primary" disabled={!canSubmit}>
            {saving ? "Saving…" : staffMode ? (isEmergency ? "Record emergency" : "Record leave") : isEmergency ? "Apply emergency leave now" : "Send for approval"}
          </button>
        </footer>
      </form>

      <style>{`
        .vlm-backdrop{position:fixed;inset:0;z-index:300;background:rgba(18,45,60,.55);backdrop-filter:blur(3px);display:grid;place-items:center;padding:18px}
        .vlm-card{width:min(640px,100%);max-height:calc(100dvh - 36px);display:flex;flex-direction:column;background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(14,48,66,.28);overflow:hidden}
        .vlm-head{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:20px 22px 14px;border-bottom:1px solid #edf3f6}
        .vlm-head h2{margin:0;font-size:19px;color:#1d3a4a}.vlm-head p{margin:5px 0 0;font-size:13px;color:#61798a;line-height:1.5}
        .vlm-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#e6f4fb;color:#2c6ba3}
        .vlm-emergency .vlm-icon{background:#fdecec;color:#c0392b}
        .vlm-close{border:0;background:#edf5f8;color:#456472;border-radius:10px;padding:7px;cursor:pointer}
        .vlm-body{padding:16px 22px;overflow-y:auto;display:grid;gap:14px}
        .vlm-field{display:grid;gap:6px;font-size:13px;font-weight:700;color:#334e5a;position:relative}
        .vlm-field input,.vlm-field select,.vlm-field textarea{font:inherit;font-weight:500;border:1px solid #cfe4ed;border-radius:10px;padding:10px 12px;background:#fbfeff;color:#20313B}
        .vlm-field textarea{resize:vertical;min-height:74px}
        .vlm-counter{justify-self:end;color:#8aa0ab;font-weight:600}
        .vlm-required{color:#8aa0ab;font-weight:600}
        .vlm-field textarea.vlm-invalid{border-color:#e08a80;box-shadow:0 0 0 3px #fdecea}
        .vlm-missing{color:#c0392b;font-weight:700}
        .vlm-foot-hint{margin-right:auto;color:#9d6817;font-size:13px;font-weight:700}
        .vlm-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .vlm-choices{border:0;margin:0;padding:0;display:grid;gap:8px}
        .vlm-choices legend{font-size:13px;font-weight:700;color:#334e5a;margin-bottom:6px;padding:0}
        .vlm-choices label{display:flex;gap:10px;align-items:center;border:1px solid #d9e9ef;border-radius:12px;padding:10px 12px;font-size:13.5px;color:#2b4655;cursor:pointer;background:#fff}
        .vlm-choices label.active{border-color:#4DA8DA;background:#f1f9fd}
        .vlm-emergency .vlm-choices label.active{border-color:#e08a80;background:#fff6f5}
        .vlm-choices label.disabled{opacity:.55;cursor:not-allowed}
        .vlm-choices label span{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
        .vlm-choices select{font:inherit;border:1px solid #cfe4ed;border-radius:9px;padding:5px 8px;background:#fff}
        .vlm-hint{color:#7b909b}
        .vlm-inline{align-content:start}.vlm-inline label{padding:8px 10px}
        .vlm-impact{border-top:1px dashed #d8e8ef;padding-top:12px}
        .vlm-impact h3{margin:0 0 9px;font-size:14px;color:#1d3a4a}
        .vlm-check-error{background:#fff1f1;color:#a33f3f;border-radius:10px;padding:10px 12px;font-size:13px}
        .vlm-foot{display:flex;justify-content:flex-end;gap:10px;align-items:center;padding:14px 22px;border-top:1px solid #edf3f6;background:#fbfdfe}
        .vlm-secondary{border:1px solid #cfe4ed;background:#fff;color:#2f6f8f;border-radius:11px;padding:10px 16px;font-weight:700;cursor:pointer}
        .vlm-primary{border:0;background:#2c6ba3;color:#fff;border-radius:11px;padding:10px 18px;font-weight:800;cursor:pointer}
        .vlm-emergency .vlm-primary{background:#c0392b}
        .vlm-primary:disabled,.vlm-secondary:disabled{opacity:.55;cursor:not-allowed}
        @media(max-width:560px){.vlm-two{grid-template-columns:1fr}.vlm-head,.vlm-body,.vlm-foot{padding-left:16px;padding-right:16px}}
      `}</style>
    </div>
  );
}
