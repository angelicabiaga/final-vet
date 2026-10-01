import React from "react";
import { UserCog } from "lucide-react";
import { formatTime12h } from "../utils/timeFormat";
import { drName, formatDayLabel } from "./VetLeaveImpact";

// Booked appointments a vet can no longer see, grouped into visits (one
// owner's pets on the same day move together, like a multi-pet booking).
export function groupVisits(appointments) {
  const when = item => `${item.appointment_date} ${item.start_time}`;
  const visits = new Map();
  [...(appointments || [])].sort((a, b) => when(a).localeCompare(when(b))).forEach(item => {
    const key = `${item.owner_id || item.id}|${item.appointment_date}|${item.veterinarian_id || ""}`;
    const visit = visits.get(key) || { ...item, key, appointmentIds: [], petNames: [] };
    visit.appointmentIds.push(item.id);
    if (item.pet_name) visit.petNames.push(item.pet_name);
    visits.set(key, visit);
  });
  return [...visits.values()];
}

// The pending doctor change already sent for a visit, if any.
export function offerForVisit(offers, visit) {
  return (offers || []).find(offer => offer.status === "Pending" && (offer.appointment_ids || []).some(id => visit.appointmentIds.includes(id)));
}

// One visit its vet can no longer see (leave, emergency or a shift change).
// Staff offer another doctor and a free time; the owner confirms,
// reschedules or cancels in My Queue (see QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql).
export default function ScheduleConflictRow({ visit, offer, today, note, disabled, onChangeDoctor }) {
  const pets = visit.petNames.length ? visit.petNames.join(", ") : "Pet";
  return (
    <div className="scr">
      <div className="scr-info">
        <span>{visit.appointment_date === today ? "Today" : formatDayLabel(visit.appointment_date)} · {formatTime12h(visit.start_time)}</span>
        <b>{pets}</b>
        <small>{visit.owner_name || "Owner"}{visit.visit_reason ? ` · ${visit.visit_reason}` : ""}</small>
        {note && <em>{note}</em>}
      </div>
      <div className="scr-actions">
        {offer ? (
          <small className="scr-pending">Waiting for the owner to confirm {drName(offer.proposed_veterinarian?.full_name)} at {formatTime12h(offer.proposed_time)}{offer.offer_date !== visit.appointment_date ? ` on ${formatDayLabel(offer.offer_date)}` : ""}.</small>
        ) : (
          <button type="button" className="scr-btn" disabled={disabled}
            onClick={() => onChangeDoctor({ appointmentIds: visit.appointmentIds, label: pets, petNames: pets })}>
            <UserCog size={14} /> Change doctor
          </button>
        )}
      </div>

      <style>{`
        .scr{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #e3eff4;border-radius:11px;padding:9px 12px}
        .scr-info{display:grid;grid-template-columns:150px auto;column-gap:10px;align-items:center;font-size:13px}
        .scr-info span{color:#52707d;font-weight:700;grid-row:span 3}
        .scr-info b{color:#20313b}.scr-info small{color:#6f8591}.scr-info em{font-style:normal;font-size:12px;font-weight:700;color:#b34848}
        .scr-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
        .scr-btn{display:inline-flex;gap:6px;align-items:center;border:0;background:#c0392b;color:#fff;border-radius:9px;padding:8px 12px;font-weight:800;cursor:pointer;font-size:13px}
        .scr-btn:disabled{opacity:.5;cursor:not-allowed}
        .scr-pending{max-width:320px;color:#9d6817;background:#fff7e8;border:1px solid #f1dfb0;border-radius:9px;padding:7px 10px;font-weight:700;font-size:12.5px}
        @media(max-width:640px){.scr-info{grid-template-columns:1fr}.scr-info span{grid-row:auto}}
      `}</style>
    </div>
  );
}
