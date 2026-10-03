import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, TriangleAlert } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import { getRescheduleOptions, ownerErrorMessage, respondDoctorOffer } from "../services/doctorChangeService";
import { drName, formatDayLabel } from "./VetLeaveImpact";
import { todayLocal } from "../services/appointmentService";
import { formatTime12h } from "../utils/timeFormat";

const pad = value => String(value).padStart(2, "0");
function nowHHMM() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// What a pet owner sees in My Queue when their doctor can't see them: the
// clinic's reason, the doctor and time offered, and Confirm / Reschedule /
// Cancel. Their visit joins the clinic's live queue only after Confirm.
export default function DoctorOfferNotice({ offer, profile, onDone }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(offer.offer_date);
  const [slots, setSlots] = useState(null);
  const [choice, setChoice] = useState("");

  const today = todayLocal();
  const petNames = offer.pets?.length ? offer.pets.map(pet => pet.pet_name).join(", ") : "your pet";
  const when = (day, time) => `${formatTime12h(time)}${day === today ? " today" : ` on ${formatDayLabel(day)}`}`;
  const expired = offer.offer_date < today || (offer.offer_date === today && String(offer.proposed_time).slice(0, 5) <= nowHHMM());
  const walkIn = !(offer.appointment_ids || []).length;

  useEffect(() => {
    if (!rescheduling || !date) return undefined;
    let active = true;
    setSlots(null);
    setChoice("");
    getRescheduleOptions(offer.id, date)
      .then(result => active && setSlots(result.vets || []))
      .catch(err => active && setError(ownerErrorMessage(err)));
    return () => { active = false; };
  }, [rescheduling, date, offer.id]);

  const choices = useMemo(() => (slots || []).flatMap(vet => (vet.starts || []).map(time => ({
    key: `${vet.veterinarian_id}|${String(time).slice(0, 5)}`,
    label: `${formatTime12h(time)} · ${drName(vet.full_name)}`,
    time: String(time).slice(0, 5)
  }))).sort((a, b) => a.time.localeCompare(b.time)), [slots]);

  async function answer(action, extra, success) {
    try {
      setBusy(action);
      setError("");
      await respondDoctorOffer(offer.id, profile.id, action, extra);
      onDone?.(success);
    } catch (err) {
      setError(ownerErrorMessage(err));
      setBusy("");
    }
  }

  return (
    <section className="don">
      <div className="don-head">
        <span className="don-icon"><TriangleAlert size={20} /></span>
        <div>
          <p>Please confirm your visit</p>
          <h2>{petNames}</h2>
        </div>
      </div>

      <p className="don-message">
        <b>{drName(offer.original_veterinarian?.full_name)}</b> can't see {petNames} as planned
        {offer.original_time ? ` (${formatTime12h(offer.original_time)})` : ""} due to <b>{offer.reason}</b>.
        {offer.notes ? ` ${offer.notes}` : ""}
      </p>

      <div className="don-offer">
        <CalendarClock size={20} />
        <div>
          <small>The clinic can offer</small>
          <b>{drName(offer.proposed_veterinarian?.full_name)} · {when(offer.offer_date, offer.proposed_time)}</b>
        </div>
      </div>

      {expired && <p className="don-expired">This time has already passed. Choose Reschedule, or contact the clinic for another time.</p>}
      {error && <div className="err">{error}</div>}

      {!rescheduling ? (
        <div className="don-actions">
          <button type="button" className="don-confirm" disabled={Boolean(busy) || expired}
            onClick={() => answer("confirm", {}, `Confirmed. ${petNames} will be seen by ${drName(offer.proposed_veterinarian?.full_name)} at ${when(offer.offer_date, offer.proposed_time)}.`)}>
            {busy === "confirm" ? "Confirming…" : "Confirm"}
          </button>
          {!walkIn && <button type="button" className="don-secondary" disabled={Boolean(busy)} onClick={() => setRescheduling(true)}>Reschedule</button>}
          <button type="button" className="don-cancel" disabled={Boolean(busy)} onClick={() => setConfirmCancel(true)}>Cancel visit</button>
        </div>
      ) : (
        <div className="don-reschedule">
          <label>Date
            <input type="date" min={today} value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <label>Time and doctor
            <select value={choice} onChange={event => setChoice(event.target.value)} disabled={!slots || !choices.length}>
              <option value="">{!slots ? "Loading free times…" : choices.length ? "Choose a time" : "No free times that day"}</option>
              {choices.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <div className="don-actions">
            <button type="button" className="don-confirm" disabled={!choice || Boolean(busy)} onClick={() => {
              const [veterinarianId, time] = choice.split("|");
              const picked = (slots || []).find(vet => vet.veterinarian_id === veterinarianId);
              answer("reschedule", { date, veterinarianId, startTime: time }, `Rescheduled: ${petNames} with ${drName(picked?.full_name)} at ${when(date, time)}.`);
            }}>{busy === "reschedule" ? "Saving…" : "Save new time"}</button>
            <button type="button" className="don-secondary" disabled={Boolean(busy)} onClick={() => setRescheduling(false)}>Back</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        tone="danger"
        title="Cancel this visit?"
        description={`${petNames}'s visit will be cancelled and removed from the clinic queue.`}
        confirmLabel={busy === "cancel" ? "Cancelling…" : "Yes, cancel visit"}
        cancelLabel="Keep it"
        busy={busy === "cancel"}
        onConfirm={() => answer("cancel", {}, "Your visit was cancelled.")}
        onCancel={() => setConfirmCancel(false)}
      />

      <style>{`
        .don{max-width:650px;margin:0 auto 18px;background:#fff;border:1px solid #f1dfb0;border-left:6px solid #e0982f;border-radius:20px;padding:22px;box-shadow:0 10px 30px #d4eaf3;display:grid;gap:12px}
        .don-head{display:flex;gap:12px;align-items:center}
        .don-head p{margin:0;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#b0701c}
        .don-head h2{margin:2px 0 0;font-size:20px;color:#1d3a4a}
        .don-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#fff4e2;color:#c27b16}
        .don-message{margin:0;color:#3e5968;line-height:1.55}
        .don-offer{display:flex;gap:12px;align-items:center;background:#effaf3;border:1px solid #cdebd8;border-radius:14px;padding:12px 14px;color:#26754a}
        .don-offer small{display:block;color:#4f7b62;font-weight:700}.don-offer b{font-size:16px;color:#1d4d33}
        .don-expired{margin:0;color:#b34848;font-weight:700;font-size:13px}
        .don-actions{display:flex;gap:8px;flex-wrap:wrap}
        .don-actions button{border-radius:11px;padding:10px 16px;font-weight:800;cursor:pointer;border:1px solid transparent}
        .don-actions button:disabled{opacity:.55;cursor:not-allowed}
        .don-confirm{background:#2d9d63;color:#fff}
        .don-secondary{background:#fff;color:#2f6f8f;border-color:#cfe4ed!important}
        .don-cancel{background:#fff;color:#b34848;border-color:#efc2c2!important}
        .don-reschedule{display:grid;gap:10px}
        .don-reschedule label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#334e5a}
        .don-reschedule input,.don-reschedule select{font:inherit;border:1px solid #cfe4ed;border-radius:10px;padding:9px 11px;background:#fbfeff}
      `}</style>
    </section>
  );
}
