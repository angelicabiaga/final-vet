import React from "react";
import { CalendarX2, Clock3, Info, ShieldAlert, Users } from "lucide-react";
import { formatTime12h } from "../utils/timeFormat";
import { withDrTitle } from "../utils/vetName";

// Shared formatting for the leave workflow (vet's My Schedule and the
// Staff/Admin leave board).

// Some profiles already store "Dr." in full_name; never print "Dr. Dr.".
export function drName(name) {
  return withDrTitle(name, "the veterinarian");
}

// The reason in words, or "" when it just repeats the leave type (only
// "Other" asks for a written reason).
export function leaveReasonText(request) {
  const reason = String(request?.reason || "").trim();
  return reason && reason.toLowerCase() !== String(request?.leave_type || "").trim().toLowerCase() ? reason : "";
}

export function formatDayLabel(date) {
  if (!date) return "—";
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatHours(start, end) {
  if (!start || !end) return "—";
  return `${formatTime12h(start)} – ${formatTime12h(end)}`;
}

// A request's period in plain words, e.g. "Sep 29 – Sep 30",
// "Oct 6 · leaving at 2:00 PM", "Today from 2:00 PM".
export function formatLeavePeriod(request, today) {
  if (!request) return "—";
  const sameDay = request.start_date === request.end_date;
  const dateText = sameDay
    ? (request.start_date === today ? "Today" : formatDayLabel(request.start_date))
    : `${formatDayLabel(request.start_date)} – ${formatDayLabel(request.end_date)}`;
  if (request.is_full_day) return sameDay ? `${dateText} · whole day` : dateText;
  const start = String(request.start_time || "").slice(0, 5);
  const end = String(request.end_time || "").slice(0, 5);
  if (request.request_type === "Emergency") return `${dateText} from ${formatTime12h(start)}`;
  if (start <= "09:00") return `${dateText} · arriving at ${formatTime12h(end)}`;
  if (end >= "19:00") return `${dateText} · leaving at ${formatTime12h(start)}`;
  return `${dateText} · ${formatHours(start, end)}`;
}

export function leaveStatusMeta(request, today) {
  if (!request) return { label: "—", tone: "muted" };
  if (request.status === "Pending") return { label: "Pending review", tone: "amber" };
  if (request.status === "Rejected") return { label: "Declined", tone: "red" };
  if (request.status === "Cancelled") {
    return request.cancelled_by && request.cancelled_by !== request.veterinarian_id
      ? { label: "Revoked", tone: "muted" }
      : { label: "Withdrawn", tone: "muted" };
  }
  if (request.end_date < today) return { label: "Completed", tone: "muted" };
  if (request.request_type === "Emergency" && !request.acknowledged_at) return { label: "Active · awaiting staff", tone: "red" };
  if (request.start_date <= today) return { label: "On leave now", tone: "blue" };
  return { label: "Approved", tone: "green" };
}

function dayEffectText(day) {
  if (day.effect === "off") return "Whole shift off";
  if (day.effect === "partial") return `Available ${formatHours(day.available_start, day.available_end)} only`;
  return day.working ? "Not affected" : "Not a working day";
}

// Renders the result of get_vet_leave_impact: blocking errors, the
// per-day effect (with coverage gaps) and booked patients (info, never
// blocking). `audience` only changes wording.
export default function VetLeaveImpact({ impact, loading = false, audience = "vet", showConflicts = true, showPatientNote = true }) {
  if (loading && !impact) {
    return <div className="vli-box vli-loading"><Clock3 size={16} /> Checking your schedule…</div>;
  }
  if (!impact) return null;

  const errors = impact.errors || [];
  const days = (impact.days || []).filter(day => day.effect !== "none" || day.working);
  const appointments = impact.appointments || [];
  const queue = impact.queue || [];
  const today = impact.today;
  const booked = (impact.appointment_count || 0) + (impact.queue_count || 0);
  const patients = `${booked} booked patient${booked === 1 ? "" : "s"}`;

  return (
    <div className={`vli${loading ? " vli-refreshing" : ""}`}>
      {errors.length > 0 && (
        <div className="vli-box vli-blocked">
          <strong><ShieldAlert size={16} /> {audience === "vet" ? "This can't be filed yet" : "This can't be approved"}</strong>
          <ul>{errors.map(message => <li key={message}>{message}</li>)}</ul>
        </div>
      )}

      {errors.length === 0 && (
        <div className="vli-summary">
          <span><CalendarX2 size={15} /> {impact.working_days} working day{impact.working_days === 1 ? "" : "s"} affected</span>
          <span>{impact.appointment_count} booked appointment{impact.appointment_count === 1 ? "" : "s"}</span>
          {impact.queue_count > 0 && <span>{impact.queue_count} in today's queue</span>}
          {(impact.coverage_gaps || []).length > 0 && <span className="vli-hot"><Users size={14} /> coverage gap</span>}
        </div>
      )}

      {days.length > 0 && errors.length === 0 && (
        <div className="vli-days">
          {days.map(day => (
            <div key={day.date} className={`vli-day vli-day-${day.effect}`}>
              <div>
                <b>{day.date === today ? "Today" : formatDayLabel(day.date)}</b>
                <small>{day.working ? `Shift ${formatHours(day.shift_start, day.shift_end)}` : "Day off"}{day.shift_source === "adjusted" ? " (adjusted hours)" : ""}</small>
              </div>
              <div className="vli-day-right">
                <span>{dayEffectText(day)}</span>
                {day.appointments > 0 && <small className="vli-count">{day.appointments} booked</small>}
                {(day.coverage_gaps || []).length > 0 && <small className="vli-gap">No vet {day.coverage_gaps.map(gap => formatHours(gap.start, gap.end)).join(", ")}</small>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showPatientNote && errors.length === 0 && booked > 0 && (
        <div className="vli-box vli-info">
          <strong><Info size={16} /> {audience === "vet" ? `You can still ${impact.normalized?.request_type === "Emergency" ? "apply" : "send"} this` : "This doesn't block the leave"}</strong>
          {audience === "vet"
            ? `${patients} fall inside this leave. Staff will offer them another doctor, and each owner confirms the new doctor and time, reschedules, or cancels. Nothing changes for them until they answer.`
            : `${patients} fall inside it. Once it applies, offer each one another doctor (in Leave & Emergency Requests or Queue Management); the owner confirms the new doctor and time, reschedules, or cancels.`}
        </div>
      )}

      {showConflicts && (appointments.length > 0 || queue.length > 0) && (
        <div className="vli-conflicts">
          {appointments.length > 0 && <p className="vli-conflicts-title">Booked appointments inside this leave</p>}
          {appointments.map(item => (
            <div key={item.id} className="vli-conflict">
              <span>{formatDayLabel(item.appointment_date)} · {formatTime12h(item.start_time)}</span>
              <b>{item.pet_name || "Pet"}</b>
              <small>{item.owner_name || "Owner"}</small>
            </div>
          ))}
          {queue.length > 0 && <p className="vli-conflicts-title">In today's queue</p>}
          {queue.map(item => (
            <div key={item.id} className="vli-conflict">
              <span>#{item.queue_number} · {item.status}</span>
              <b>{item.pet_name || "Pet"}</b>
              <small>{item.owner_name || "Owner"}</small>
            </div>
          ))}
          {audience === "vet" && <p className="vli-note">Staff offer these patients another doctor; each owner confirms first.</p>}
        </div>
      )}

      <style>{`
        .vli{display:grid;gap:10px;transition:opacity .15s ease}.vli-refreshing{opacity:.6}
        .vli-box{border-radius:12px;padding:11px 13px;font-size:13px;line-height:1.5}
        .vli-box strong{display:flex;align-items:center;gap:7px;margin-bottom:4px}
        .vli-box ul{margin:0;padding-left:20px;display:grid;gap:3px}
        .vli-loading{display:flex;align-items:center;gap:8px;background:#f4fbfd;color:#4b6571}
        .vli-blocked{background:#fff1f1;color:#a33f3f;border:1px solid #f4cccc}
        .vli-info{background:#eef8fc;color:#2c5f78;border:1px solid #cfe7f2}
        .vli-summary{display:flex;flex-wrap:wrap;gap:7px}
        .vli-summary span{display:inline-flex;align-items:center;gap:5px;background:#eef8fc;color:#2d6f8f;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700}
        .vli-summary span.vli-hot{background:#fff1e6;color:#a4561b}
        .vli-days{display:grid;gap:6px;max-height:210px;overflow:auto;padding-right:2px}
        .vli-day{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#f7fbfd;border:1px solid #e5f0f5;border-radius:11px;padding:9px 12px;font-size:13px}
        .vli-day b{display:block;color:#20313B}.vli-day small{display:block;color:#6f8591;font-size:11.5px;margin-top:2px}
        .vli-day-right{text-align:right}.vli-day-right span{font-weight:700;color:#2d6f8f}
        .vli-day-off .vli-day-right span{color:#b34848}.vli-day-partial .vli-day-right span{color:#9d6817}
        .vli-count{color:#a4561b!important;font-weight:700}.vli-gap{color:#b34848!important;font-weight:700}
        .vli-conflicts{display:grid;gap:6px}
        .vli-conflicts-title{margin:4px 0 0;font-size:12px;font-weight:800;color:#52707d;text-transform:uppercase;letter-spacing:.04em}
        .vli-conflict{display:grid;grid-template-columns:150px 1fr auto;gap:10px;align-items:center;font-size:13px;padding:8px 11px;border-radius:10px;background:#fbfdfe;border:1px solid #e8f1f5}
        .vli-conflict span{color:#52707d;font-weight:700}.vli-conflict small{color:#6f8591}
        .vli-note{margin:2px 0 0;font-size:12px;color:#6f8591}
        @media(max-width:560px){.vli-conflict{grid-template-columns:1fr}.vli-day{flex-direction:column;align-items:flex-start}.vli-day-right{text-align:left}}
      `}</style>
    </div>
  );
}
