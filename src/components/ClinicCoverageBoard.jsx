import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import ScheduleConflictRow, { groupVisits, offerForVisit } from "./ScheduleConflictRow";
import DoctorChangeModal from "./DoctorChangeModal";
import ConfirmDialog from "./ConfirmDialog";
import WeekPager, { shortDate, useWeekPager, weekdayShort } from "./WeekPager";
import { drName, formatDayLabel, leaveReasonText } from "./VetLeaveImpact";
import { getClinicCoverage, getScheduleConflicts, subscribeToLeaveChanges } from "../services/vetLeaveService";
import { deleteScheduleOverride, getScheduleOverrides } from "../services/scheduleService";
import { getPendingDoctorOffers } from "../services/doctorChangeService";
import { subscribeToQueue } from "../services/queueService";
import { todayLocal } from "../services/appointmentService";
import { formatTime12h } from "../utils/timeFormat";

// How far the week pager goes: back for history, forward for planning.
const PAST_WEEKS = 26;
const WEEKS_AHEAD = 26;

// "9 AM", "1:30 PM" -- compact enough for the grid.
function shortTime(time) {
  const [h, m] = String(time || "").slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h)) return "—";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}
const shortRange = (start, end) => `${shortTime(start)}–${shortTime(end)}`;

// One vet's day in the grid. Leave shows its type and the reason given, so
// past weeks read as history.
function cellFor(day) {
  const pending = day.request?.status === "Pending";
  const leaveReason = day.request?.status === "Approved" ? leaveReasonText(day.request) : "";
  if (day.source === "leave" && !day.working) return { kind: "leave", text: "On leave", tag: day.request?.leave_type || "Leave", reason: leaveReason };
  if (day.source === "leave") return { kind: "short", text: shortRange(day.start_time, day.end_time), tag: `Part-day leave${day.request?.leave_type ? ` · ${day.request.leave_type}` : ""}`, reason: leaveReason };
  if (day.source === "none") return { kind: "none", text: "No schedule", tag: day.is_past ? "" : "Not created yet" };
  if (!day.working) return { kind: "off", text: "Day off", tag: pending ? "Leave pending" : "" };
  return { kind: day.source === "adjusted" ? "adjusted" : "work", text: shortRange(day.start_time, day.end_time), tag: pending ? "Leave pending" : day.source === "adjusted" ? "Adjusted" : "" };
}

// Staff/Admin "Clinic Schedule": every vet's hours one week at a time
// (created schedule, adjusted hours, leave with its reason), the clinic
// hours nobody covers, and dates with no created schedule yet. Past weeks
// stay browsable as history. Below it, bookings that no longer fit their
// vet's hours (offered another doctor; the owner confirms).
export default function ClinicCoverageBoard({ profile }) {
  const [coverage, setCoverage] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [changeTarget, setChangeTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [noticeKey, setNoticeKey] = useState(0);
  // Adjusted hours (not leave) by "vetId|date", so a cell can remove them.
  const [adjusted, setAdjusted] = useState({});
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const today = coverage?.today || todayLocal();
  const pager = useWeekPager(today, null, { pastWeeks: PAST_WEEKS, weeksAhead: WEEKS_AHEAD });
  const { weekStart } = pager;

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [nextCoverage, nextConflicts, nextOffers, overrides] = await Promise.all([
        getClinicCoverage(7, weekStart), getScheduleConflicts(60), getPendingDoctorOffers().catch(() => []),
        getScheduleOverrides().catch(() => [])
      ]);
      setCoverage(nextCoverage);
      setConflicts(nextConflicts?.appointments || []);
      setOffers(nextOffers);
      setAdjusted(Object.fromEntries((overrides || []).filter(row => !row.leave_request_id)
        .map(row => [`${row.veterinarian_id}|${row.schedule_date}`, row])));
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let timer;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(true), 400);
    };
    const offLeave = subscribeToLeaveChanges(reload);
    const offQueue = subscribeToQueue(reload);
    return () => { clearTimeout(timer); offLeave(); offQueue(); };
  }, [load]);

  const days = useMemo(() => coverage?.days || [], [coverage]);
  const vets = useMemo(() => (coverage?.vets || []).map(vet => ({ ...vet, byDate: new Map((vet.days || []).map(day => [day.date, day])) })), [coverage]);
  const dayByDate = useMemo(() => new Map(days.map(day => [day.date, day])), [days]);
  const weekDays = pager.weekDates.map(date => dayByDate.get(date)).filter(Boolean);
  const upcoming = weekDays.filter(day => !day.is_past);
  const gapDays = upcoming.filter(day => day.scheduled && day.gaps.length > 0).length;
  const unscheduledDays = upcoming.filter(day => !day.scheduled).length;
  const pastWeek = weekDays.length > 0 && weekDays.every(day => day.is_past);

  async function removeAdjusted() {
    if (!removeTarget) return;
    try {
      setRemoving(true);
      setActionError("");
      await deleteScheduleOverride(removeTarget.override.id);
      setMessage(`Adjusted hours removed. ${drName(removeTarget.vetName)} is back to the created schedule on ${formatDayLabel(removeTarget.override.schedule_date)}.`);
      setRemoveTarget(null);
      await load(true);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setRemoving(false);
      setNoticeKey(value => value + 1);
    }
  }

  return (
    <section className="ccb">
      {message && <div className="ok" key={`ok-${noticeKey}`}>{message}</div>}
      {actionError && <div className="err" key={`err-${noticeKey}`}>{actionError}</div>}

      <header className="ccb-head">
        <h2><CalendarRange size={22} /> Clinic Schedule</h2>
        <div className="ccb-head-right">
          {coverage && !pastWeek && (unscheduledDays
            ? <span className="ccb-badge ccb-badge-none"><TriangleAlert size={14} /> {unscheduledDays} day{unscheduledDays === 1 ? "" : "s"} not scheduled yet</span>
            : gapDays
              ? <span className="ccb-badge ccb-badge-gap"><TriangleAlert size={14} /> {gapDays} day{gapDays === 1 ? "" : "s"} with uncovered hours</span>
              : <span className="ccb-badge ccb-badge-ok"><CheckCircle2 size={14} /> Fully covered {pager.caption}</span>)}
          <WeekPager pager={pager} />
          <button type="button" className="ccb-refresh" onClick={() => load(true)} disabled={refreshing} aria-label="Refresh"><RefreshCw size={15} className={refreshing ? "ccb-spin" : ""} /></button>
        </div>
      </header>

      {loadError ? <div className="ccb-setup">{loadError}</div> : loading && !coverage ? <p className="ccb-empty">Loading the schedule…</p> : (
        <>
          <div className={`ccb-scroll${loading || refreshing ? " ccb-refreshing" : ""}`}>
            <table className="ccb-grid">
              <thead>
                <tr>
                  <th className="ccb-sticky">Veterinarian</th>
                  {pager.weekDates.map(date => (
                    <th key={date} className={date === today ? "ccb-today" : date < today ? "ccb-was" : ""}>
                      <span>{date === today ? "Today" : weekdayShort(date)}</span>
                      <small>{shortDate(date)}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vets.map(vet => (
                  <tr key={vet.id}>
                    <th className="ccb-sticky ccb-vet">
                      <b>{drName(vet.full_name)}</b>
                      <small className={vet.scheduled_until && vet.scheduled_until >= today ? "ccb-until" : "ccb-until ccb-until-none"}>
                        {vet.scheduled_until && vet.scheduled_until >= today ? `Scheduled until ${formatDayLabel(vet.scheduled_until)}` : "No upcoming schedule"}
                      </small>
                    </th>
                    {pager.weekDates.map(date => {
                      const day = vet.byDate.get(date);
                      if (!day) return <td key={date} className="ccb-cell ccb-none"><span>—</span></td>;
                      const cell = cellFor(day);
                      const override = cell.kind === "adjusted" && !day.is_past ? adjusted[`${vet.id}|${date}`] : null;
                      return (
                        <td key={date} className={`ccb-cell ccb-${cell.kind}${day.is_today ? " ccb-today" : ""}${day.is_past ? " ccb-was" : ""}`} title={cell.reason || day.note || undefined}>
                          <span>{cell.text}</span>
                          {cell.tag && <small>{cell.tag}</small>}
                          {cell.reason && <em className="ccb-reason">“{cell.reason}”</em>}
                          {override && <button type="button" className="ccb-remove" onClick={() => setRemoveTarget({ override, vetName: vet.full_name })}>Remove</button>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="ccb-coverage">
                  <th className="ccb-sticky">Clinic coverage</th>
                  {pager.weekDates.map(date => {
                    const day = dayByDate.get(date);
                    if (!day) return <td key={date} className="ccb-none"><span>—</span></td>;
                    if (!day.scheduled) return <td key={date} className={`ccb-none${day.is_today ? " ccb-today" : ""}${day.is_past ? " ccb-was" : ""}`}><span>{day.is_past ? "No schedule" : "Not scheduled yet"}</span></td>;
                    return (
                      <td key={date} className={`${day.gaps.length ? "ccb-gap" : "ccb-covered"}${day.is_today ? " ccb-today" : ""}${day.is_past ? " ccb-was" : ""}`}>
                        {day.gaps.length
                          ? day.gaps.map(gap => <span key={gap.start}>No vet {shortRange(gap.start, gap.end)}</span>)
                          : <span>Covered</span>}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="ccb-conflicts">
            <h3>Booked outside current hours{conflicts.length ? ` (${conflicts.length})` : ""}</h3>
            {conflicts.length === 0 ? (
              <p className="ccb-clear"><CheckCircle2 size={16} /> Every upcoming booking fits its vet's hours.</p>
            ) : (
              <>
                <p className="ccb-hint">These bookings don't match their vet's current hours (for example after a schedule change). Offer each visit another doctor; the owner confirms, reschedules, or cancels in My Queue. Leave-related ones are handled in Leave &amp; Emergency Requests above.</p>
                {groupVisits(conflicts).map(visit => (
                  <ScheduleConflictRow
                    key={visit.key}
                    visit={visit}
                    offer={offerForVisit(offers, visit)}
                    today={today}
                    onChangeDoctor={setChangeTarget}
                    note={`${drName(visit.veterinarian_name)} · ${visit.problem}`}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        tone="danger"
        title="Remove these adjusted hours?"
        description={removeTarget ? `${drName(removeTarget.vetName)} goes back to the created schedule on ${formatDayLabel(removeTarget.override.schedule_date)}.` : ""}
        confirmLabel={removing ? "Removing…" : "Remove"}
        cancelLabel="Keep"
        busy={removing}
        onConfirm={removeAdjusted}
        onCancel={() => !removing && setRemoveTarget(null)}
      />

      {changeTarget && (
        <DoctorChangeModal
          profile={profile}
          target={changeTarget}
          onClose={() => setChangeTarget(null)}
          onSent={(offer, picked) => {
            setChangeTarget(null);
            setMessage(`Sent to the owner: ${drName(picked?.vetName)} at ${formatTime12h(picked?.time)}. Nothing changes until they confirm, reschedule, or cancel in My Queue.`);
            setNoticeKey(value => value + 1);
            load(true);
          }}
        />
      )}

      <style>{`
        .ccb{background:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 4px 10px rgba(0,0,0,.04);margin-bottom:14px;display:grid;gap:14px;min-width:0}
        .ccb-spin{animation:ccbSpin 1s linear infinite}@keyframes ccbSpin{to{transform:rotate(360deg)}}
        .ccb-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
        .ccb-head h2{display:flex;align-items:center;gap:8px;margin:0;color:#20313b;font-size:20px}
        .ccb-head p{margin:5px 0 0;color:#6f7f88;font-size:13px;max-width:560px}
        .ccb-head-right{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .ccb-badge{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:800}
        .ccb-badge-ok{background:#e7f7ed;color:#26754a}.ccb-badge-gap{background:#fdecec;color:#b34848}
        .ccb-badge-none{background:#fff4e2;color:#9d6817}
        .ccb-refresh{border:1px solid #d9e9ef;background:#fff;color:#318fbe;border-radius:10px;padding:8px;cursor:pointer;display:grid;place-items:center}
        .ccb-setup{background:#fff8e8;color:#865e12;border:1px solid #f1dfb0;border-radius:12px;padding:12px 14px;font-size:13.5px}
        .ccb-empty{margin:0;color:#80949d}
        .ccb-scroll{overflow-x:auto;border:1px solid #e6f0f4;border-radius:12px;transition:opacity .15s ease}
        .ccb-refreshing{opacity:.6}
        .ccb-grid{border-collapse:separate;border-spacing:0;min-width:100%;font-size:12px}
        .ccb-grid th,.ccb-grid td{padding:8px 7px;border-bottom:1px solid #edf3f6;text-align:center;vertical-align:top;min-width:96px}
        .ccb-grid thead th{background:#f2fafd;color:#52707d;font-weight:800}
        .ccb-grid thead th span{display:block;text-transform:uppercase;font-size:11px;letter-spacing:.03em}
        .ccb-grid thead th small{display:block;color:#1d3a4a;font-size:12.5px}
        .ccb-sticky{position:sticky;left:0;z-index:1;background:#fbfdfe;text-align:left!important;min-width:180px!important;box-shadow:1px 0 0 #e6f0f4}
        thead .ccb-sticky{background:#f2fafd}
        .ccb-vet b{display:block;color:#1d3a4a;font-size:13px}.ccb-vet small{display:block;color:#6f8591;font-weight:600}
        .ccb-until{color:#2c6ba3!important;font-size:11px}.ccb-until-none{color:#b0701c!important}
        .ccb-cell span{display:block;font-weight:800;color:#2f6f4d}
        .ccb-cell small{display:block;margin-top:2px;font-size:10.5px;font-weight:700;color:#9d6817}

        .ccb-reason{display:block;margin-top:2px;font-size:10.5px;color:#8a4a40;font-style:italic;max-width:130px;margin-left:auto;margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ccb-work{background:#f3fbf6}
        .ccb-adjusted{background:#eef6fc}.ccb-adjusted span{color:#1e5a8c}
        .ccb-off{background:#f6f7f8}.ccb-off span{color:#8a9aa2;font-weight:700}
        .ccb-none{background:#fbfbfb}.ccb-none span{color:#9aa7ae!important;font-weight:700}.ccb-none small{color:#b0701c!important}
        .ccb-leave{background:#fdf0ee}.ccb-leave span{color:#b0392b}.ccb-leave small{color:#b0392b}
        .ccb-short{background:#fff8ea}.ccb-short span{color:#9d6817}
        .ccb-today{box-shadow:inset 0 3px 0 #4DA8DA}
        .ccb-grid thead th.ccb-was{background:#eef1f3;color:#9aa6ac}.ccb-grid thead th.ccb-was small{color:#9aa6ac}
        .ccb-grid td.ccb-was{background:#f1f3f4!important;box-shadow:none}
        .ccb-grid td.ccb-was span,.ccb-grid td.ccb-was small,.ccb-grid td.ccb-was .ccb-reason{color:#9aa6ac!important}
        .ccb-coverage th{font-weight:800;color:#1d3a4a}
        .ccb-coverage td span{display:block;font-weight:800}
        .ccb-covered{background:#effaf3;color:#26754a}
        .ccb-gap{background:#fdecec;color:#b34848}
        .ccb-remove{margin-top:4px;border:0;background:none;padding:0;color:#b34848;font-size:11px;font-weight:800;cursor:pointer;text-decoration:underline}
        .ccb-conflicts{display:grid;gap:8px}
        .ccb-conflicts h3{margin:0;font-size:15px;color:#1d3a4a}
        .ccb-hint{margin:0;font-size:12.5px;color:#6f8591}
        .ccb-clear{display:flex;gap:7px;align-items:center;margin:0;color:#26754a;font-weight:700;font-size:13px}
        @media(max-width:640px){.ccb{padding:14px}}
      `}</style>
    </section>
  );
}
