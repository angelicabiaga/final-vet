import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, RotateCcw, TriangleAlert, XCircle } from "lucide-react";
import AppShell from "../../components/AppShell";
import ConfirmDialog from "../../components/ConfirmDialog";
import DoctorOfferNotice from "../../components/DoctorOfferNotice";
import DoctorTimeFields from "../../components/DoctorTimeFields";
import { drName, formatDayLabel } from "../../components/VetLeaveImpact";
import { getQueue, subscribeToQueue } from "../../services/queueService";
import { getMyDoctorOffers, getQueueDoctorAlerts, getQueueVisitRescheduleOptions, ownerChangeQueueVisit, ownerErrorMessage } from "../../services/doctorChangeService";
import { subscribeToLeaveChanges } from "../../services/vetLeaveService";
import { formatTime, todayLocal } from "../../services/appointmentService";
import { formatClockTime, formatTime12h } from "../../utils/timeFormat";

// A booked-ahead appointment keeps its reserved time as `original_appointment_time`;
// a walk-in never had one, so it falls back to when Staff actually checked them in.
function bookingInfo(row) {
  if (row.original_appointment_time) return { label: "Appointment Time", value: formatTime(row.original_appointment_time) };
  return { label: "Checked In At", value: row.arrived_at ? formatClockTime(row.arrived_at) : "—" };
}

// The doctor on a checked-in ticket went on sudden leave / emergency (the same
// check Queue Management uses for its red notes).
const isLeaveProblem = problem => /leave/i.test(String(problem || ""));

// Rebook / Cancel for the owner's own waiting ticket (e.g. after their doctor
// had a sudden leave). Rebook is for booked visits; a walk-in can only cancel.
function QueueSelfService({ entry, profile, petNames, onDone }) {
  const [rebooking, setRebooking] = useState(false);
  const [date, setDate] = useState(todayLocal());
  const [slots, setSlots] = useState(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const booked = Boolean(entry.appointment_id || entry.pets?.some(pet => pet.appointmentId));

  useEffect(() => {
    if (!rebooking || !date) return undefined;
    let active = true;
    setSlots(null);
    setChoice("");
    getQueueVisitRescheduleOptions(entry.id, date)
      .then(result => { if (active) setSlots(result?.vets || []); })
      .catch(err => { if (active) { setSlots([]); setError(ownerErrorMessage(err)); } });
    return () => { active = false; };
  }, [rebooking, date, entry.id]);

  async function run(action, extra, success) {
    try {
      setBusy(action);
      setError("");
      await ownerChangeQueueVisit({ ownerId: profile.id, queueEntryId: entry.id, action, ...extra });
      // A rebook to today keeps this ticket on the page: back to the buttons.
      setConfirmCancel(false);
      setRebooking(false);
      setBusy("");
      onDone(success);
    } catch (err) {
      setError(ownerErrorMessage(err));
      setBusy("");
    }
  }

  const when = (day, time) => `${formatTime12h(time)}${day === todayLocal() ? " today" : ` on ${formatDayLabel(day)}`}`;

  return (
    <div className="mq-self">
      {error && <div className="mq-error">{error}</div>}
      {!rebooking ? (
        <div className="mq-self-actions">
          {booked && <button type="button" className="mq-btn mq-btn-primary" disabled={Boolean(busy)} onClick={() => setRebooking(true)}><RotateCcw size={16} /> Rebook</button>}
          <button type="button" className="mq-btn mq-btn-danger" disabled={Boolean(busy)} onClick={() => setConfirmCancel(true)}><XCircle size={16} /> Cancel visit</button>
        </div>
      ) : (
        <div className="mq-rebook">
          <h4><CalendarClock size={17} /> Rebook {petNames || "your visit"}</h4>
          <label>Date
            <input type="date" min={todayLocal()} value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <DoctorTimeFields key={date} slots={slots} value={choice} onChange={setChoice} />
          <div className="mq-self-actions">
            <button type="button" className="mq-btn mq-btn-ghost" disabled={Boolean(busy)} onClick={() => setRebooking(false)}>Back</button>
            <button type="button" className="mq-btn mq-btn-primary" disabled={!choice || Boolean(busy)} onClick={() => {
              const [veterinarianId, time] = choice.split("|");
              const picked = (slots || []).find(vet => vet.veterinarian_id === veterinarianId);
              run("reschedule", { date, veterinarianId, startTime: time },
                `Rebooked: ${petNames || "your visit"} with ${drName(picked?.full_name)} at ${when(date, time)}.${date === todayLocal() ? "" : " Your queue number for today was released."}`);
            }}>{busy === "reschedule" ? "Saving…" : "Confirm rebook"}</button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmCancel}
        tone="danger"
        title="Cancel this visit?"
        description={`${petNames || "Your pet"}'s visit will be cancelled and removed from the clinic queue.`}
        confirmLabel={busy === "cancel" ? "Cancelling…" : "Yes, cancel visit"}
        cancelLabel="Keep it"
        busy={busy === "cancel"}
        onConfirm={() => run("cancel", {}, "Your visit was cancelled.")}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}

// Doctor-change offers come first: a ticket on hold (doctor_offer_id) isn't
// in the clinic's live queue until the owner confirms, so it stays hidden.
export default function MyQueue({ profile }) {
  const [rows, setRows] = useState([]);
  const [offers, setOffers] = useState([]);
  const [doctorAway, setDoctorAway] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [queue, pending, alerts] = await Promise.all([
        getQueue({ ownerId: profile.id }),
        getMyDoctorOffers(profile.id).catch(() => []),
        getQueueDoctorAlerts(null).catch(() => ({ queue: [] }))
      ]);
      setRows(queue);
      setOffers(pending);
      setDoctorAway(Object.fromEntries((alerts?.queue || [])
        .filter(alert => isLeaveProblem(alert.problem))
        .map(alert => [alert.queue_entry_id, alert.problem])));
    } catch (e) { setError(e.message); }
  }, [profile.id]);

  // Queue moves, doctor-change offers and a vet's sudden leave all update
  // this page right away; the timer is only a fallback.
  useEffect(() => {
    load();
    const offQueue = subscribeToQueue(load);
    const offLeave = subscribeToLeaveChanges(load);
    const timer = setInterval(load, 30000);
    return () => { offQueue(); offLeave(); clearInterval(timer); };
  }, [load]);

  const active = rows.find(r => r.status !== "Completed" && !r.doctor_offer_id);
  const booking = active ? bookingInfo(active) : null;
  const away = Boolean(active && active.status === "Waiting" && doctorAway[active.id]);
  const petNames = active ? (active.pets?.length ? active.pets.map(p => p.pet_name).join(", ") : active.pet?.pet_name) : "";

  return <AppShell profile={profile} title="Queue">
    {error && <div className="err">{error}</div>}
    {notice && <div className="ok">{notice}</div>}
    {offers.map(offer => <DoctorOfferNotice key={offer.id} offer={offer} profile={profile} onDone={message => { setNotice(message); load(); }} />)}
    {!active ? (offers.length ? null : <div className="card"><h2>No active queue</h2><p>Check in at the clinic reception when you arrive.</p></div>) : (
      <div className={`queuecard${away ? " queuecard-away" : ""}`}>
        <p>Your queue number</p>
        <strong aria-label={away ? "Queue number on hold" : undefined}>{away ? "—" : active.queue_number}</strong>
        <h3>{petNames}</h3>
        {active.pets?.length > 1 && <p className="petcount">{active.pets.length} pets · {active.visitDurationMinutes} min visit</p>}
        <p className={away ? "mq-vet-away" : undefined}>{away ? `${drName(active.veterinarian?.full_name)} · unavailable` : active.veterinarian?.full_name}</p>
        {away && (
          <div className="mq-away" role="status">
            <TriangleAlert size={20} />
            <div>
              <b>{drName(active.veterinarian?.full_name)} had a sudden leave and can't see {petNames || "your pet"} as planned.</b>
              <span>Your queue number is on hold. The clinic will offer you another doctor here shortly, or you can rebook or cancel below yourself.</span>
            </div>
          </div>
        )}
        <div className="grid">
          <span><b>{away ? "Waiting for a new doctor" : active.status}</b>Status</span>
          <span><b>{booking.value}</b>{booking.label}</span>
        </div>
        {/* Only when the doctor had a sudden leave after check-in. */}
        {away && (
          <QueueSelfService key={active.id} entry={active} profile={profile} petNames={petNames} onDone={message => { setNotice(message); load(); }} />
        )}
        {active.late_arrival && <div className="warn">Late arrival recorded. Your place follows the active queue order.</div>}
      </div>
    )}
    <style>{`.err,.warn{padding:13px;border-radius:12px;background:#fff0f0;color:#b34b4b}.queuecard{max-width:650px;margin:auto;text-align:center;background:#fff;padding:35px;border-radius:22px;box-shadow:0 10px 30px #d4eaf3}.queuecard>strong{font-size:60px;color:#318fbe}.queuecard-away>strong{color:#9aa6ac}.petcount{margin:2px 0 0;color:#318fbe;font-weight:700;font-size:13px}.mq-vet-away{color:#b34848;font-weight:700}.mq-away{display:flex;gap:12px;align-items:flex-start;text-align:left;margin:18px 0 0;padding:14px 16px;border-radius:14px;background:#fff4e2;border:1px solid #f1dfb0;color:#865e12}.mq-away svg{flex-shrink:0;margin-top:2px;color:#c27b16}.mq-away div{display:grid;gap:4px}.mq-away b{color:#7a4f0d}.mq-away span{font-size:13.5px;line-height:1.45}.mq-self{display:grid;gap:12px;margin-top:4px}.mq-self-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.mq-btn{display:inline-flex;align-items:center;gap:7px;border-radius:12px;padding:10px 18px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;border:1px solid transparent}.mq-btn:disabled{opacity:.55;cursor:not-allowed}.mq-btn-primary{background:#2c6ba3;color:#fff}.mq-btn-danger{background:#fff;color:#b34848;border-color:#efc2c2}.mq-btn-ghost{background:#fff;color:#2f6f8f;border-color:#cfe4ed}.mq-rebook{display:grid;gap:10px;text-align:left;background:#f7fbfd;border:1px solid #e1eef4;border-radius:14px;padding:14px 16px}.mq-rebook h4{margin:0;display:flex;align-items:center;gap:7px;color:#1d3a4a}.mq-rebook label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#334e5a}.mq-rebook input,.mq-rebook select{font:inherit;border:1px solid #cfe4ed;border-radius:10px;padding:9px 11px;background:#fff}.mq-error{background:#fff1f1;color:#a33f3f;border-radius:10px;padding:10px 12px;font-size:13px;text-align:left}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:24px 0}.grid span{background:#eff9fc;padding:14px;border-radius:14px}.grid b{display:block;color:#318fbe;margin-bottom:5px}@media(max-width:600px){.grid{grid-template-columns:1fr}}`}</style>
  </AppShell>;
}
