import React, { useEffect, useMemo, useState } from "react";
import { TriangleAlert, UserCog, X } from "lucide-react";
import { CHANGE_REASONS, getDoctorChangeOptions, proposeDoctorChange } from "../services/doctorChangeService";
import { drName, formatDayLabel, formatHours } from "./VetLeaveImpact";
import { formatTime12h } from "../utils/timeFormat";

// Staff pick another doctor and a time that doctor is really free (the
// database lists only valid start times: inside their shift, not booked,
// not held by another offer, not already past). The owner then confirms in
// My Queue; the visit joins the Live Queue only after that.
// target: { queueEntryId } for a waiting ticket, or { appointmentIds } for
// a check-in card; `label` is shown in the header.
export default function DoctorChangeModal({ profile, target, onClose, onSent }) {
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [vetId, setVetId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [reason, setReason] = useState(CHANGE_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getDoctorChangeOptions({ queueEntryId: target.queueEntryId || null, appointmentIds: target.appointmentIds || null })
      .then(result => {
        if (!active) return;
        setOptions(result);
        // Doctor is available (a Live Queue reassignment): most likely busy.
        if (!result.problem) setReason("Doctor Overbooked / At Capacity");
        const withTimes = (result.vets || []).find(vet => vet.starts?.length);
        if (withTimes) setVetId(withTimes.veterinarian_id);
      })
      .catch(err => active && setLoadError(err.message));
    return () => { active = false; };
  }, [target.queueEntryId, target.appointmentIds]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  const vet = useMemo(() => (options?.vets || []).find(item => item.veterinarian_id === vetId), [options, vetId]);
  const starts = useMemo(() => (vet?.starts || []).map(time => String(time).slice(0, 5)), [vet]);
  const originalTime = String(options?.original_time || "").slice(0, 5);

  // Default: the first free time at or after the booked time, else the first.
  useEffect(() => {
    if (!starts.length) { setStartTime(""); return; }
    setStartTime(current => (starts.includes(current) ? current : (starts.find(time => time >= originalTime) || starts[0])));
  }, [starts, originalTime]);

  const isToday = options && options.date === options.today;
  const when = time => `${formatTime12h(time)}${isToday ? " today" : ` on ${formatDayLabel(options?.date)}`}`;

  async function submit() {
    if (!vetId || !startTime || saving) return;
    try {
      setSaving(true);
      setError("");
      const offer = await proposeDoctorChange({
        staffId: profile.id,
        queueEntryId: target.queueEntryId || null,
        appointmentIds: target.queueEntryId ? null : target.appointmentIds,
        veterinarianId: vetId,
        startTime,
        reason,
        notes: notes.trim()
      });
      onSent?.(offer, { vetName: vet?.full_name, time: startTime });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="dcm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="dcm-card" role="dialog" aria-modal="true" aria-labelledby="dcm-title">
        <header className="dcm-head">
          <span className="dcm-icon"><UserCog size={22} /></span>
          <div>
            <p>Change doctor · owner confirms</p>
            <h2 id="dcm-title">{target.label || "Visit"}</h2>
          </div>
          <button type="button" className="dcm-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="dcm-body">
          {loadError ? <div className="dcm-error">{loadError}</div> : !options ? <p className="dcm-muted">Checking the doctors' schedules…</p> : !options.problem && !target.queueEntryId ? (
            <p className="dcm-ok-note">{drName(options.current_veterinarian_name)} is available for this visit, so there's no need to change the doctor. Check the patient in as booked.</p>
          ) : (
            <>
              <div className="dcm-current">
                <span>Currently with <b>{drName(options.current_veterinarian_name)}</b>{originalTime ? ` · booked ${formatTime12h(originalTime)}` : ""}{options.pet_count > 1 ? ` · ${options.pet_count} pets (${options.pet_count * 10} min)` : ""}</span>
                {options.problem && <strong><TriangleAlert size={15} /> {options.problem}</strong>}
              </div>

              <fieldset className="dcm-vets">
                <legend>Available doctor</legend>
                {(options.vets || []).length === 0 && <p className="dcm-muted">There's no other doctor.</p>}
                {(options.vets || []).map(item => {
                  const free = (item.starts || []).map(time => String(time).slice(0, 5));
                  return (
                    <label key={item.veterinarian_id} className={`${vetId === item.veterinarian_id ? "active" : ""}${free.length ? "" : " disabled"}`}>
                      <input type="radio" name="dcm-vet" disabled={!free.length} checked={vetId === item.veterinarian_id} onChange={() => setVetId(item.veterinarian_id)} />
                      <span>
                        <b>{drName(item.full_name)}</b>
                        <small>{item.working ? `On duty ${formatHours(item.shift_start, item.shift_end)}` : "Not on duty that day"}
                          {" · "}{free.length ? `first free ${formatTime12h(free[0])}` : "no free time left"}</small>
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {vet && starts.length > 0 && (
                <label className="dcm-field">Time with {drName(vet.full_name)}
                  <select value={startTime} onChange={event => setStartTime(event.target.value)}>
                    {starts.map(time => <option key={time} value={time}>{formatTime12h(time)}{time < originalTime ? " (earlier than booked)" : ""}</option>)}
                  </select>
                  <small>Only times {drName(vet.full_name)} is free are listed. The slot is held for the owner until they answer.</small>
                </label>
              )}

              <label className="dcm-field">Reason
                <select value={reason} onChange={event => setReason(event.target.value)}>
                  {CHANGE_REASONS.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="dcm-field">Message to the owner <span className="dcm-optional">(optional)</span>
                <textarea rows={2} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} placeholder="e.g. Dr. Redmond had a family emergency and left the clinic." />
              </label>

              {vet && startTime && (
                <p className="dcm-preview">The owner will see: <i>“{drName(options.current_veterinarian_name)} can't see {target.petNames || "your pet"} as planned ({reason}). {drName(vet.full_name)} can see them at {when(startTime)}.”</i> They can confirm, reschedule, or cancel in My Queue. The visit joins the Live Queue once they confirm. If they're at the counter, send it and use <b>Confirm for owner</b>.</p>
              )}
            </>
          )}
        </div>

        <footer className="dcm-foot">
          {error && <div className="err">{error}</div>}
          <button type="button" className="dcm-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="dcm-primary" onClick={submit} disabled={(!options?.problem && !target.queueEntryId) || !vetId || !startTime || saving}>{saving ? "Sending…" : "Send to owner to confirm"}</button>
        </footer>
      </section>

      <style>{`
        .dcm-backdrop{position:fixed;inset:0;z-index:300;background:rgba(18,45,60,.55);backdrop-filter:blur(3px);display:grid;place-items:center;padding:18px}
        .dcm-card{width:min(560px,100%);max-height:calc(100dvh - 36px);display:flex;flex-direction:column;background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(14,48,66,.28);overflow:hidden}
        .dcm-head{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:18px 20px;border-bottom:1px solid #edf3f6}
        .dcm-head p{margin:0;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#4DA8DA}
        .dcm-head h2{margin:2px 0 0;font-size:18px;color:#1d3a4a}
        .dcm-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#e6f4fb;color:#2c6ba3}
        .dcm-close{border:0;background:#edf5f8;color:#456472;border-radius:10px;padding:7px;cursor:pointer}
        .dcm-body{padding:16px 20px;overflow-y:auto;display:grid;gap:13px}
        .dcm-muted{margin:0;color:#6f8591}
        .dcm-error{background:#fff1f1;color:#a33f3f;border-radius:10px;padding:10px 12px;font-size:13px}
        .dcm-ok-note{margin:0;background:#effaf3;border:1px solid #cdebd8;color:#26754a;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600}
        .dcm-current{display:grid;gap:6px;background:#f7fbfd;border:1px solid #e5f0f5;border-radius:12px;padding:10px 12px;font-size:13px;color:#3e5968}
        .dcm-current strong{display:flex;gap:6px;align-items:center;color:#b34848;font-size:12.5px}
        .dcm-vets{border:0;margin:0;padding:0;display:grid;gap:7px}
        .dcm-vets legend,.dcm-field{font-size:13px;font-weight:700;color:#334e5a}
        .dcm-vets legend{margin-bottom:6px;padding:0}
        .dcm-vets label{display:flex;gap:10px;align-items:center;border:1px solid #d9e9ef;border-radius:12px;padding:10px 12px;cursor:pointer}
        .dcm-vets label.active{border-color:#4DA8DA;background:#f1f9fd}
        .dcm-vets label.disabled{opacity:.55;cursor:not-allowed}
        .dcm-vets span{display:grid;gap:2px}.dcm-vets b{color:#1d3a4a;font-size:14px}.dcm-vets small{color:#5f7884;font-weight:600}
        .dcm-field{display:grid;gap:6px}
        .dcm-field select,.dcm-field textarea{font:inherit;font-weight:500;border:1px solid #cfe4ed;border-radius:10px;padding:9px 11px;background:#fbfeff}
        .dcm-field small{color:#7b909b;font-weight:600}
        .dcm-optional{color:#8aa0ab;font-weight:600}
        .dcm-preview{margin:0;font-size:12.5px;line-height:1.5;color:#4b6571;background:#fffaf0;border:1px solid #f1e3c0;border-radius:11px;padding:10px 12px}
        .dcm-foot{display:flex;justify-content:flex-end;gap:10px;align-items:center;padding:13px 20px;border-top:1px solid #edf3f6;background:#fbfdfe}
        .dcm-secondary{border:1px solid #cfe4ed;background:#fff;color:#2f6f8f;border-radius:11px;padding:10px 16px;font-weight:700;cursor:pointer}
        .dcm-primary{border:0;background:#2c6ba3;color:#fff;border-radius:11px;padding:10px 18px;font-weight:800;cursor:pointer}
        .dcm-primary:disabled,.dcm-secondary:disabled{opacity:.55;cursor:not-allowed}
      `}</style>
    </div>
  );
}
