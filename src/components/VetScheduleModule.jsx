import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, CalendarRange, ClipboardList, Hourglass, RefreshCw, Siren, Undo2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import VetLeaveRequestModal from "./VetLeaveRequestModal";
import WeekPager, { shortDate, useWeekPager, weekdayShort } from "./WeekPager";
import { formatDayLabel, formatHours, formatLeavePeriod, leaveReasonText, leaveStatusMeta } from "./VetLeaveImpact";
import { cancelLeaveRequest, getLeaveRequests, getScheduleOverview, subscribeToLeaveChanges } from "../services/vetLeaveService";
import { subscribeToQueue } from "../services/queueService";
import { todayLocal } from "../services/appointmentService";
import { formatDateLong, formatDateTime12h } from "../utils/timeFormat";

const minutesBetween = (start, end) => {
  const toMin = value => {
    const [h, m] = String(value).slice(0, 5).split(":").map(Number);
    return h * 60 + m;
  };
  return Math.max(toMin(end) - toMin(start), 0);
};

// Days loaded from today for the Today card and the leave form's shift
// lookups (get_vet_schedule_overview's limit).
const OVERVIEW_DAYS = 60;
// The week grid is loaded one week at a time: back for history (past
// shifts and leave), forward for planning.
const PAST_WEEKS = 26;
const WEEKS_AHEAD = 26;

// How one day of the selected week reads on its tile.
function describeDay(day) {
  const pendingRequest = day.request?.status === "Pending";
  const reason = day.request?.status === "Approved" ? leaveReasonText(day.request) : "";
  if (day.source === "leave" && !day.working) return { kind: "leave", hours: "On leave", tag: day.request?.leave_type || "Approved leave", reason };
  if (day.source === "leave") return { kind: "short", hours: formatHours(day.start_time, day.end_time), tag: `Short day · ${day.request?.leave_type || "leave"}`, reason };
  if (day.source === "none") return { kind: "none", hours: day.is_past ? "No schedule" : "No schedule yet", tag: day.is_past ? "" : "Not open for booking" };
  if (!day.working) return { kind: "off", hours: "Day off", tag: pendingRequest ? "Leave pending" : "" };
  if (pendingRequest) return { kind: "pending", hours: formatHours(day.start_time, day.end_time), tag: "Leave pending" };
  if (day.source === "adjusted") return { kind: "adjusted", hours: formatHours(day.start_time, day.end_time), tag: "Adjusted hours" };
  return { kind: "work", hours: formatHours(day.start_time, day.end_time), tag: "" };
}

export default function VetScheduleModule({ profile }) {
  const [overview, setOverview] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState("active");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // The week shown in the grid: { start, days }.
  const [weekView, setWeekView] = useState(null);
  // Bumped on user actions so a repeated message still toasts.
  const [noticeKey, setNoticeKey] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!profile?.id) return;
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [nextOverview, nextRequests] = await Promise.all([
        getScheduleOverview(profile.id, OVERVIEW_DAYS),
        getLeaveRequests({ veterinarianId: profile.id, limit: 60 })
      ]);
      setOverview(nextOverview);
      setRequests(nextRequests);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const today = overview?.today || todayLocal();
  const days = useMemo(() => overview?.days || [], [overview]);
  const todayInfo = days[0] || null;
  const nowTime = String(overview?.now || "").slice(0, 5);

  const activeTodayRequest = useMemo(() => requests.find(request =>
    ["Pending", "Approved"].includes(request.status) && request.start_date <= today && request.end_date >= today
  ), [requests, today]);
  const activeEmergency = activeTodayRequest?.request_type === "Emergency" && activeTodayRequest.status === "Approved" ? activeTodayRequest : null;

  const todayStatus = useMemo(() => {
    if (!todayInfo) return { headline: "—", detail: "" };
    if (todayInfo.source === "leave" && !todayInfo.working) {
      return { headline: activeEmergency ? "Emergency leave" : "On leave today", detail: activeTodayRequest?.leave_type || "Approved leave", tone: "leave" };
    }
    if (todayInfo.source === "leave") {
      return { headline: activeEmergency ? "Emergency leave" : "Short day", detail: `Available ${formatHours(todayInfo.start_time, todayInfo.end_time)} only`, tone: "short" };
    }
    if (!todayInfo.working) return { headline: "Off today", detail: "You're not scheduled today.", tone: "off" };
    const ended = nowTime && nowTime >= String(todayInfo.end_time).slice(0, 5);
    return { headline: ended ? "Shift finished" : "On duty", detail: formatHours(todayInfo.start_time, todayInfo.end_time), tone: "duty" };
  }, [todayInfo, activeEmergency, activeTodayRequest, nowTime]);

  const emergencyBlockedReason = useMemo(() => {
    if (!todayInfo) return "Your schedule is still loading.";
    if (activeTodayRequest) return "You already have a leave request covering today.";
    if (!todayInfo.working) return "You're not scheduled to work today.";
    if (nowTime && nowTime >= String(todayInfo.end_time).slice(0, 5)) return "Your shift today has already ended.";
    return "";
  }, [todayInfo, activeTodayRequest, nowTime]);

  const pager = useWeekPager(today, null, { pastWeeks: PAST_WEEKS, weeksAhead: WEEKS_AHEAD });
  const { weekStart, weekDates, caption: weekCaption } = pager;

  const loadWeek = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const result = await getScheduleOverview(profile.id, 7, weekStart);
      setWeekView({ start: weekStart, days: result?.days || [] });
    } catch {
      // Older database without week browsing: fall back to the days from today.
      setWeekView(null);
    }
  }, [profile?.id, weekStart]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  const weekDays = weekView?.start === weekStart ? weekView.days : days;
  const dayByDate = useMemo(() => new Map(weekDays.map(day => [day.date, day])), [weekDays]);

  // Staff decisions, schedule edits, bookings and queue moves all change
  // what this page shows, so any of them refreshes it.
  useEffect(() => {
    let pending;
    const reload = () => {
      clearTimeout(pending);
      pending = setTimeout(() => { load(true); loadWeek(); }, 400);
    };
    const offLeave = subscribeToLeaveChanges(reload);
    const offQueue = subscribeToQueue(reload);
    window.addEventListener("focus", reload);
    const timer = setInterval(() => load(true), 60000);
    return () => {
      clearTimeout(pending);
      offLeave();
      offQueue();
      window.removeEventListener("focus", reload);
      clearInterval(timer);
    };
  }, [load, loadWeek]);

  const stats = useMemo(() => {
    const week = weekDates.map(date => dayByDate.get(date)).filter(Boolean);
    const working = week.filter(day => day.working);
    const minutes = working.reduce((sum, day) => sum + minutesBetween(day.start_time, day.end_time), 0);
    return {
      workingDays: working.length,
      hours: Math.round(minutes / 6) / 10,
      leaveDays: week.filter(day => day.source === "leave").length,
      pending: requests.filter(request => request.status === "Pending").length,
      booked: week.reduce((sum, day) => sum + (day.appointments || 0), 0)
    };
  }, [weekDates, dayByDate, requests]);

  const visibleRequests = useMemo(() => requests.filter(request => {
    const active = request.status === "Pending" || (request.status === "Approved" && request.end_date >= today);
    return tab === "active" ? active : !active;
  }), [requests, tab, today]);

  function handleSubmitted(result) {
    const request = result?.request;
    setModal(null);
    setMessage(request?.request_type === "Emergency"
      ? "Emergency leave applied. New bookings are blocked, and staff were alerted to offer your booked patients another doctor."
      : "Leave request sent. You'll be notified when staff approve or decline it.");
    setNoticeKey(value => value + 1);
    load(true);
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    try {
      setCancelling(true);
      await cancelLeaveRequest(cancelTarget.id, profile.id);
      setMessage(cancelTarget.status === "Pending"
        ? "Leave request withdrawn."
        : "Leave cancelled. Your regular hours are back and staff were notified.");
      setNoticeKey(value => value + 1);
      setCancelTarget(null);
      await load(true);
    } catch (cancelError) {
      setError(cancelError.message);
      setNoticeKey(value => value + 1);
    } finally {
      setCancelling(false);
    }
  }

  const cancelCopy = cancelTarget?.request_type === "Emergency" && cancelTarget.status === "Approved"
    ? { title: "Are you available again?", description: "Your remaining hours today reopen for bookings and staff are notified. Patients already moved to another doctor stay where they are.", confirm: "Yes, I'm available" }
    : cancelTarget?.status === "Approved"
      ? { title: "Cancel this approved leave?", description: "Your regular hours come back and pet owners can book you again for these dates. Staff will be notified.", confirm: "Cancel leave" }
      : { title: "Withdraw this request?", description: "Staff will no longer see it for review.", confirm: "Withdraw" };

  if (!overview) {
    return (
      <div className="vsm-loading">
        {loading ? <><RefreshCw className="vsm-spin" size={18} /> Loading your schedule…</> : <>
          <span>{error || "Your schedule could not be loaded."}</span>
          <button type="button" onClick={() => load()}>Try again</button>
        </>}
        <style>{`.vsm-loading{display:flex;flex-wrap:wrap;gap:12px;align-items:center;background:#fff;border-radius:14px;padding:16px 18px;color:#4b6571;box-shadow:0 8px 24px rgba(47,117,150,.07)}.vsm-loading button{border:1px solid #cfe4ed;background:#fff;color:#257fa9;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer}.vsm-spin{animation:vsmSpin 1s linear infinite}@keyframes vsmSpin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div className="vsm">
      {message && <div className="ok" key={`ok-${noticeKey}`}>{message}</div>}
      {error && <div className="err" key={`err-${noticeKey}`}>{error}</div>}

      <section className={`vsm-today vsm-today-${todayStatus.tone || "duty"}`}>
        <div className="vsm-today-main">
          <span className="vsm-eyebrow">TODAY · {formatDateLong(today).toUpperCase()}</span>
          <h2>{todayStatus.headline}</h2>
          <p>{todayStatus.detail}</p>
        </div>
        <div className="vsm-today-actions">
          <button type="button" className="vsm-btn vsm-btn-primary" onClick={() => setModal({ mode: "Leave" })}><CalendarPlus size={17} /> Request leave</button>
          {activeEmergency ? (
            <button type="button" className="vsm-btn vsm-btn-ghost" onClick={() => setCancelTarget(activeEmergency)}><Undo2 size={17} /> I'm available again</button>
          ) : (
            <button type="button" className="vsm-btn vsm-btn-danger" disabled={Boolean(emergencyBlockedReason)} title={emergencyBlockedReason || "Leave today because of an emergency"} onClick={() => setModal({ mode: "Emergency" })}><Siren size={17} /> Emergency leave</button>
          )}
          {emergencyBlockedReason && !activeEmergency && <small>{emergencyBlockedReason}</small>}
          <button type="button" className="vsm-refresh" onClick={() => { load(true); loadWeek(); }} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "vsm-spin" : ""} /> {refreshing ? "Refreshing" : "Refresh"}</button>
        </div>
      </section>

      <div className="vsm-stats">
        <article><CalendarRange size={20} /><div><p>Working days</p><strong>{stats.workingDays} day{stats.workingDays === 1 ? "" : "s"}</strong><small>{stats.hours} hours · {weekCaption}</small></div></article>
        <article><Hourglass size={20} /><div><p>Leave days</p><strong>{stats.leaveDays}</strong><small>{weekCaption}</small></div></article>
        <article><ClipboardList size={20} /><div><p>Pending requests</p><strong>{stats.pending}</strong><small>waiting for staff review</small></div></article>
        <article><CalendarClock size={20} /><div><p>Booked appointments</p><strong>{stats.booked}</strong><small>{weekCaption}</small></div></article>
      </div>

      <section className="vsm-panel">
        <header>
          <div><h3>My weekly schedule</h3><p>Your hours as patients see them when booking. Click a future working day to request leave for it. Go back to past weeks to see your shifts and leave.</p></div>
          <WeekPager pager={pager} />
        </header>
        <div className="vsm-days">
          {weekDates.map(date => {
            const day = dayByDate.get(date);
            if (!day || day.is_past) {
              // Past days: greyed out, still showing the shift and any leave.
              const info = day ? describeDay(day) : null;
              return (
                <div key={date} className="vsm-day vsm-day-was">
                  <span className="vsm-day-name">{weekdayShort(date)}</span>
                  <span className="vsm-day-date">{shortDate(date)}</span>
                  <span className="vsm-day-hours">{info ? info.hours : date < today ? "Past" : "—"}</span>
                  {info?.tag && <span className="vsm-day-tag">{info.tag}</span>}
                  {info?.reason && <span className="vsm-day-reason" title={info.reason}>“{info.reason}”</span>}
                </div>
              );
            }
            const info = describeDay(day);
            const canRequest = day.date > today && day.working && !day.request;
            return (
              <button type="button" key={day.date} className={`vsm-day vsm-day-${info.kind}${day.is_today ? " vsm-day-today" : ""}`}
                disabled={!canRequest} title={canRequest ? `Request leave for ${formatDayLabel(day.date)}` : undefined}
                onClick={() => setModal({ mode: "Leave", date: day.date })}>
                <span className="vsm-day-name">{day.is_today ? "Today" : weekdayShort(day.date)}</span>
                <span className="vsm-day-date">{shortDate(day.date)}</span>
                <span className="vsm-day-hours">{info.hours}</span>
                {info.tag && <span className="vsm-day-tag">{info.tag}</span>}
                {info.reason && <span className="vsm-day-reason" title={info.reason}>“{info.reason}”</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="vsm-panel">
        <header>
          <div><h3>My leave requests</h3><p>Status updates also arrive as notifications.</p></div>
          <div className="vsm-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "active"} className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>Active</button>
            <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
          </div>
        </header>
        {visibleRequests.length === 0 ? (
          <p className="vsm-empty">{tab === "active" ? "No pending or upcoming leave." : "No past requests yet."}</p>
        ) : (
          <div className="vsm-requests">
            {visibleRequests.map(request => {
              const status = leaveStatusMeta(request, today);
              const cancellable = request.status === "Pending" || (request.status === "Approved" && request.end_date >= today);
              return (
                <article key={request.id} className="vsm-request">
                  <div className="vsm-request-top">
                    <span className={`vsm-type ${request.request_type === "Emergency" ? "vsm-type-emergency" : ""}`}>{request.request_type}</span>
                    <b>{request.leave_type}</b>
                    <span className={`vsm-pill vsm-pill-${status.tone}`}>{status.label}</span>
                  </div>
                  <p className="vsm-request-period">{formatLeavePeriod(request, today)}</p>
                  {leaveReasonText(request) && <p className="vsm-request-reason">“{leaveReasonText(request)}”</p>}
                  {request.review_note && request.status !== "Pending" && <p className="vsm-request-note"><b>Staff note:</b> {request.review_note}</p>}
                  {request.cancel_note && <p className="vsm-request-note"><b>{request.cancelled_by === request.veterinarian_id ? "Your note" : "Revoke note"}:</b> {request.cancel_note}</p>}
                  <div className="vsm-request-foot">
                    <small>Filed {formatDateTime12h(request.created_at)}{request.reviewer?.full_name ? ` · Reviewed by ${request.reviewer.full_name}` : ""}{request.canceller?.full_name && request.cancelled_by !== request.veterinarian_id ? ` · Revoked by ${request.canceller.full_name}` : ""}</small>
                    {cancellable && (
                      <button type="button" className="vsm-link" onClick={() => setCancelTarget(request)}>
                        {request.status === "Pending" ? "Withdraw" : request.request_type === "Emergency" ? "I'm available again" : "Cancel leave"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {modal && (
        <VetLeaveRequestModal
          profile={profile}
          mode={modal.mode}
          today={today}
          initialDate={modal.date}
          schedule={overview}
          onClose={() => setModal(null)}
          onSubmitted={handleSubmitted}
        />
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={cancelCopy.title}
        description={cancelCopy.description}
        confirmLabel={cancelling ? "Saving…" : cancelCopy.confirm}
        cancelLabel="Keep it"
        tone="danger"
        busy={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => !cancelling && setCancelTarget(null)}
      />

      <style>{`
        .vsm{display:grid;gap:14px}
        .vsm-spin{animation:vsmSpin 1s linear infinite}@keyframes vsmSpin{to{transform:rotate(360deg)}}
        .vsm-today{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;background:linear-gradient(120deg,#ffffff 0%,#f1f9fd 100%);border:1px solid #dcebf2;border-left:6px solid #2d9d63;border-radius:18px;padding:18px 20px;box-shadow:0 8px 24px rgba(47,117,150,.07)}
        .vsm-today-leave{border-left-color:#c0392b}.vsm-today-short{border-left-color:#d68a1c}.vsm-today-off{border-left-color:#9aabb4}
        .vsm-eyebrow{font-size:11px;font-weight:800;letter-spacing:1.3px;color:#4DA8DA}
        .vsm-today h2{margin:6px 0 4px;font-size:26px;color:#1d3a4a}
        .vsm-today-main>p{margin:0;color:#56707e;font-weight:600}
        .vsm-today-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
        .vsm-today-meta span{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #e1eef4;border-radius:999px;padding:6px 11px;font-size:12.5px;color:#3e6273;font-weight:600}
        .vsm-today-actions{display:grid;gap:8px;align-content:start;min-width:220px}
        .vsm-today-actions small{color:#7b909b;font-size:12px;max-width:240px}
        .vsm-btn{display:inline-flex;justify-content:center;align-items:center;gap:8px;border-radius:12px;padding:11px 16px;font-weight:800;cursor:pointer;font-size:14px;border:1px solid transparent}
        .vsm-btn:disabled{opacity:.5;cursor:not-allowed}
        .vsm-btn-primary{background:#2c6ba3;color:#fff}
        .vsm-btn-danger{background:#fff;color:#c0392b;border-color:#efb7b0}
        .vsm-btn-danger:not(:disabled):hover{background:#fff4f2}
        .vsm-btn-ghost{background:#eef8f2;color:#26754a;border-color:#bfe3cc}
        .vsm-refresh{justify-self:start;border:0;background:none;color:#318fbe;font-weight:700;display:inline-flex;gap:6px;align-items:center;cursor:pointer;padding:2px 0}
        .vsm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
        .vsm-stats article{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e6f2f7;border-radius:16px;padding:15px;box-shadow:0 8px 24px rgba(47,117,150,.07);color:#318fbe}
        .vsm-stats p{margin:0 0 3px;color:#6F7F88;font-size:13px}.vsm-stats strong{display:block;font-size:22px;color:#20313B}.vsm-stats small{color:#7a8d96}
        .vsm-panel{background:#fff;border-radius:16px;padding:16px 18px;box-shadow:0 8px 24px rgba(47,117,150,.07)}
        .vsm-panel>header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
        .vsm-panel h3{margin:0;color:#20313B}.vsm-panel header p{margin:4px 0 0;color:#78909b;font-size:12.5px}
        .vsm-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
        .vsm-day{display:grid;gap:3px;text-align:left;font:inherit;border:1px solid #dcebf2;background:#f5fbfe;border-radius:12px;padding:10px;min-height:104px;align-content:start;cursor:pointer;transition:transform .15s ease,border-color .15s ease}
        .vsm-day:not(:disabled):hover{transform:translateY(-2px);border-color:#9fd3ea}
        .vsm-day:disabled{cursor:default}
        .vsm-day-name{font-size:11px;font-weight:800;text-transform:uppercase;color:#4f7384;letter-spacing:.04em}
        .vsm-day-date{font-size:15px;font-weight:800;color:#1d3a4a}
        .vsm-day-hours{font-size:12px;color:#3e6273;font-weight:600}
        .vsm-day-tag{font-size:11px;font-weight:800;color:#9d6817}
        .vsm-day-appts{font-size:11px;font-weight:800;color:#2c6ba3}
        .vsm-day-today{box-shadow:0 0 0 2px #4DA8DA inset}
        .vsm-day-off{background:#f4f6f7;border-color:#e5eaec}.vsm-day-off .vsm-day-hours{color:#8a9aa2}
        .vsm-day-leave{background:#fdf0ee;border-color:#f3cdc7}.vsm-day-leave .vsm-day-hours{color:#b0392b;font-weight:800}.vsm-day-leave .vsm-day-tag{color:#b0392b}
        .vsm-day-short{background:#fff8ea;border-color:#f1dfb0}
        .vsm-day-pending{background:#fffbef;border-style:dashed;border-color:#e8c878}
        .vsm-day-adjusted .vsm-day-tag{color:#2c6ba3}
        .vsm-day-none{background:#fbfbfb;border-style:dashed;border-color:#dde5e8}.vsm-day-none .vsm-day-hours{color:#8a9aa2}.vsm-day-none .vsm-day-tag{color:#9aa7ae}
        .vsm-day-was{background:#f1f3f4;border-color:#e3e7e9;cursor:default}
        .vsm-day-was span{color:#9aa6ac!important}
        .vsm-day-reason{font-size:11px;font-style:italic;color:#8a4a40;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vsm-day-past{background:#f7f9fa;border-color:#e8edef;opacity:.6;cursor:default}.vsm-day-past .vsm-day-hours{color:#8a9aa2}
        .vsm-tabs{display:flex;background:#eef6fa;border-radius:10px;padding:3px}
        .vsm-tabs button{border:0;background:none;border-radius:8px;padding:7px 14px;font-weight:700;color:#4f7384;cursor:pointer}
        .vsm-tabs button.active{background:#fff;color:#1d3a4a;box-shadow:0 1px 4px rgba(20,60,80,.12)}
        .vsm-empty{margin:0;color:#80949d}
        .vsm-requests{display:grid;gap:10px}
        .vsm-request{border:1px solid #e3eff4;border-radius:14px;padding:13px 15px;display:grid;gap:5px}
        .vsm-request-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
        .vsm-request-top b{color:#1d3a4a}
        .vsm-type{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:#e6f4fb;color:#2c6ba3;border-radius:6px;padding:3px 8px}
        .vsm-type-emergency{background:#fdecec;color:#c0392b}
        .vsm-pill{margin-left:auto;font-size:12px;font-weight:800;border-radius:999px;padding:4px 10px}
        .vsm-pill-amber{background:#fff4e2;color:#9d6817}.vsm-pill-green{background:#e7f7ed;color:#26754a}.vsm-pill-blue{background:#eaf8fd;color:#2c6ba3}.vsm-pill-red{background:#fdecec;color:#b34848}.vsm-pill-muted{background:#eef2f4;color:#6a7c85}
        .vsm-request-period{margin:0;font-weight:700;color:#2f5566}
        .vsm-request-reason{margin:0;color:#56707e;font-style:italic}
        .vsm-request-note{margin:0;font-size:13px;color:#4b6571;background:#f7fbfd;border-radius:9px;padding:7px 10px}
        .vsm-request-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .vsm-request-foot small{color:#80949d}
        .vsm-link{border:0;background:none;color:#c0392b;font-weight:800;cursor:pointer;padding:0}
        @media(max-width:1100px){.vsm-days{grid-template-columns:repeat(4,minmax(0,1fr))}}
        @media(max-width:800px){.vsm-today-actions{min-width:0;width:100%}}
        @media(max-width:520px){.vsm-days{grid-template-columns:repeat(2,minmax(0,1fr))}.vsm-today h2{font-size:22px}}
      `}</style>
    </div>
  );
}
