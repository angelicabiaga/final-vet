import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Check, Clock3, PawPrint, RotateCcw, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";
import {
  createAppointment, getAvailableSlots, getOwners, getPetsByOwner,
  getVeterinarians, formatTime, todayLocal
} from "../services/appointmentService";

export default function AppointmentForm({ profile, mode = "owner", onCreated }) {
  const isStaff = mode === "staff";
  const [owners, setOwners] = useState([]);
  const [pets, setPets] = useState([]);
  const [vets, setVets] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [walkInSuccess, setWalkInSuccess] = useState(null);
  const [form, setForm] = useState({
    ownerId: isStaff ? "" : profile?.id || "",
    petId: "", veterinarianId: "", appointmentDate: todayLocal(), startTime: "",
    source: isStaff ? "Online" : "Online", visitReason: "", notes: ""
  });

  useEffect(() => {
    async function loadBase() {
      try {
        setLoading(true);
        const [vetRows, ownerRows] = await Promise.all([
          getVeterinarians(), isStaff ? getOwners() : Promise.resolve([])
        ]);
        setVets(vetRows);
        setOwners(ownerRows);
        if (!isStaff && profile?.id) setPets(await getPetsByOwner(profile.id));
      } catch (error) { setMessage({ type: "error", text: error.message }); }
      finally { setLoading(false); }
    }
    loadBase();
  }, [isStaff, profile?.id]);

  useEffect(() => {
    async function loadPets() {
      setForm(value => ({ ...value, petId: "" }));
      setPets(form.ownerId ? await getPetsByOwner(form.ownerId) : []);
    }
    if (isStaff) loadPets().catch(error => setMessage({ type: "error", text: error.message }));
  }, [form.ownerId, isStaff]);

  useEffect(() => {
    async function loadSlots() {
      setForm(value => ({ ...value, startTime: "" }));
      if (!form.veterinarianId || !form.appointmentDate) return setSlots([]);
      try {
        setSlotLoading(true);
        setSlots(await getAvailableSlots(form.veterinarianId, form.appointmentDate));
      } catch (error) { setMessage({ type: "error", text: error.message }); }
      finally { setSlotLoading(false); }
    }
    loadSlots();
  }, [form.veterinarianId, form.appointmentDate]);

  const selectedPet = useMemo(() => pets.find(item => item.id === form.petId), [pets, form.petId]);
  const selectedVet = useMemo(() => vets.find(item => item.id === form.veterinarianId), [vets, form.veterinarianId]);
  const selectedOwner = useMemo(() => owners.find(item => item.id === form.ownerId), [owners, form.ownerId]);

  function change(event) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
    setMessage({ type: "", text: "" });
  }

  async function submit(event) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const isWalkIn = isStaff && form.source === "Walk-In";
      const successDetails = isWalkIn
        ? {
            pet: selectedPet?.pet_name || "Registered pet",
            owner: selectedOwner?.full_name || "Pet owner",
            veterinarian: selectedVet?.full_name || "Selected veterinarian",
            date: form.appointmentDate,
            time: `${formatTime(form.startTime)} to ${formatTime(nextTime(form.startTime))}`
          }
        : null;
      await createAppointment({
        ...form,
        ownerId: isStaff ? form.ownerId : profile.id,
        source: isStaff ? form.source : "Online",
        status: "Confirmed",
        createdBy: profile.id
      });
      if (!isWalkIn) {
        setMessage({ type: "success", text: "Appointment booked successfully." });
      }
      setForm(current => ({ ...current, petId: "", startTime: "", visitReason: "", notes: "" }));
      setSlots(await getAvailableSlots(form.veterinarianId, form.appointmentDate));
      if (isWalkIn) {
        setMessage({ type: "", text: "" });
        setWalkInSuccess(successDetails);
      }
      onCreated?.();
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="appointment-card">Loading appointment form…</div>;

  if (walkInSuccess) {
    return (
      <div className="walkin-success-view">
        <section
          className="walkin-success-card"
          aria-labelledby="walkin-success-title"
        >
          <div className="walkin-success-icon" aria-hidden="true">
            <Check size={52} strokeWidth={2.6} />
          </div>

          <span className="walkin-success-label">Walk-In Registration</span>
          <div role="status" aria-live="polite">
            <h2 id="walkin-success-title">Walk-In Registered!</h2>
            <p className="walkin-success-copy">
              The consultation was successfully added to the clinic schedule.
            </p>
          </div>

          <dl className="walkin-success-details" aria-label="Registered consultation details">
            <div>
              <dt>Pet</dt>
              <dd>{walkInSuccess.pet}</dd>
            </div>
            <div>
              <dt>Pet Owner</dt>
              <dd>{walkInSuccess.owner}</dd>
            </div>
            <div>
              <dt>Veterinarian</dt>
              <dd>{walkInSuccess.veterinarian}</dd>
            </div>
            <div>
              <dt>Schedule</dt>
              <dd>{formatAppointmentDate(walkInSuccess.date)}<br />{walkInSuccess.time}</dd>
            </div>
          </dl>

          <div className="walkin-success-actions">
            <button type="button" onClick={() => setWalkInSuccess(null)}>
              <RotateCcw size={17} aria-hidden="true" />
              Register Another Walk-In
            </button>
            <Link to="/staff/appointments">
              View Appointments
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="appointment-grid">
      <form className="appointment-card" onSubmit={submit}>
        <div className="form-title"><CalendarDays /> <div><h2>{isStaff ? "Create Appointment / Walk-In" : "Book an Appointment"}</h2><p>General Consultation · 10-minute time slots</p></div></div>
        {message.text && <div className={`notice ${message.type}`}>{message.text}</div>}

        {isStaff && <label>Pet Owner<select name="ownerId" value={form.ownerId} onChange={change} required><option value="">Select pet owner</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name} ({owner.username})</option>)}</select></label>}

        <label>Pet Selection<select name="petId" value={form.petId} onChange={change} required disabled={!form.ownerId}><option value="">{pets.length ? "Select registered pet" : "No registered pets found"}</option>{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.pet_name} — {pet.species}{pet.breed ? ` / ${pet.breed}` : ""}</option>)}</select></label>

        <label>Veterinarian<select name="veterinarianId" value={form.veterinarianId} onChange={change} required><option value="">Select veterinarian</option>{vets.map(vet => <option key={vet.id} value={vet.id}>{vet.full_name}</option>)}</select></label>

        {isStaff && <label>Appointment Source<select name="source" value={form.source} onChange={change}><option value="Online">Online / Scheduled</option><option value="Walk-In">Walk-In</option></select></label>}

        <div className="two-cols">
          <label>Appointment Date<input type="date" name="appointmentDate" min={todayLocal()} value={form.appointmentDate} onChange={change} required /></label>
          <label>Available Time<select name="startTime" value={form.startTime} onChange={change} required disabled={slotLoading || !form.veterinarianId}><option value="">{slotLoading ? "Loading…" : slots.length ? "Select time" : "No available slots"}</option>{slots.map(slot => <option key={slot} value={slot}>{formatTime(slot)}</option>)}</select></label>
        </div>

        <label>Reason for Visit <span>(optional)</span><input name="visitReason" value={form.visitReason} onChange={change} maxLength="200" placeholder="Example: Routine checkup" /></label>
        <label>Notes <span>(optional)</span><textarea name="notes" value={form.notes} onChange={change} maxLength="500" rows="4" placeholder="Additional information for the clinic" /></label>
        <button className="book-button" disabled={submitting}>{submitting ? "Saving…" : isStaff && form.source === "Walk-In" ? "Register Walk-In" : "Book Appointment"}</button>
      </form>

      <aside className="appointment-card summary">
        <h3>Appointment Summary</h3>
        <Summary icon={<PawPrint />} label="Pet" value={selectedPet ? `${selectedPet.pet_name} (${selectedPet.species})` : "Not selected"} />
        {isStaff && <Summary icon={<PawPrint />} label="Owner" value={selectedOwner?.full_name || "Not selected"} />}
        <Summary icon={<Stethoscope />} label="Veterinarian" value={selectedVet?.full_name || "Not selected"} />
        <Summary icon={<CalendarDays />} label="Date" value={form.appointmentDate || "Not selected"} />
        <Summary icon={<Clock3 />} label="Time" value={form.startTime ? `${formatTime(form.startTime)} – ${formatTime(nextTime(form.startTime))}` : "Not selected"} />
        <div className="summary-type"><strong>Consultation Type</strong><span>General Consultation</span></div>
        <p className="help">Clinic hours: Monday–Sunday, 9:00 AM–7:00 PM. Available times automatically follow the selected veterinarian’s schedule.</p>
      </aside>
      <style>{styles}</style>
    </div>
  );
}

function nextTime(time) {
  const [h, m] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, h, m + 10);
  return `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
}
function Summary({ icon, label, value }) { return <div className="summary-row"><span className="summary-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }

function formatAppointmentDate(value) {
  if (!value) return "Not selected";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

const styles = `
.appointment-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.75fr);gap:22px;align-items:start}.appointment-card{background:#fff;border-radius:20px;padding:24px;box-shadow:0 10px 30px rgba(55,126,158,.1)}.form-title{display:flex;gap:12px;align-items:center;margin-bottom:20px;color:#318fbe}.form-title h2{margin:0;color:#20313B}.form-title p{margin:3px 0;color:#6F7F88}.appointment-card label{display:grid;gap:7px;font-weight:700;margin-bottom:16px}.appointment-card label span{font-weight:400;color:#7c8c94}.appointment-card input,.appointment-card select,.appointment-card textarea{width:100%;border:1px solid #cfe4ed;border-radius:12px;padding:12px 13px;font:inherit;color:#20313B;background:#fbfeff}.appointment-card input:focus,.appointment-card select:focus,.appointment-card textarea:focus{outline:2px solid #a9dff0;border-color:#4DA8DA}.two-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}.book-button{width:100%;border:0;border-radius:13px;padding:14px;background:#4DA8DA;color:white;font-weight:800;font-size:15px;cursor:pointer}.book-button:disabled{opacity:.65;cursor:not-allowed}.notice{padding:12px 14px;border-radius:12px;margin-bottom:16px}.notice.success{background:#eaf8ef;color:#28774b}.notice.error{background:#fff0f0;color:#b34848}.summary{position:sticky;top:105px}.summary h3{margin-top:0}.summary-row{display:flex;gap:11px;padding:13px 0;border-bottom:1px solid #edf4f7}.summary-icon{width:36px;height:36px;background:#eaf8fd;color:#3998c5;border-radius:10px;display:grid;place-items:center}.summary-icon svg{width:18px}.summary-row small,.summary-row strong{display:block}.summary-row small{color:#758891;margin-bottom:3px}.summary-type{margin-top:18px;padding:14px;background:#f2fafd;border-radius:12px;display:grid;gap:5px}.summary-type span{color:#318fbe}.help{font-size:12px;line-height:1.55;color:#6F7F88}

.walkin-success-view{min-height:calc(100vh - 150px);display:grid;place-items:center;padding:32px 18px;background:radial-gradient(circle at top left,rgba(77,168,218,.13),transparent 38%),linear-gradient(145deg,#f8fcfe 0%,#edf8fc 100%);border-radius:24px}.walkin-success-card{position:relative;width:min(100%,680px);overflow:hidden;background:rgba(255,255,255,.96);border:1px solid rgba(119,189,218,.35);border-radius:28px;padding:42px;box-shadow:0 24px 65px rgba(34,99,128,.16);text-align:center}.walkin-success-card:before{content:"";position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#3f9fca,#72c6dc)}.walkin-success-icon{width:88px;height:88px;margin:0 auto 20px;display:grid;place-items:center;border-radius:50%;color:#fff;background:linear-gradient(145deg,#42a6cc,#69c4d9);box-shadow:0 14px 30px rgba(57,157,196,.28)}.walkin-success-label{display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;padding:7px 13px;border-radius:999px;background:#eaf7fc;color:#267da3;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.walkin-success-card h2{margin:0;color:#183c50;font-size:clamp(27px,4vw,38px);line-height:1.15;letter-spacing:-.025em}.walkin-success-copy{max-width:510px;margin:13px auto 28px;color:#607985;font-size:16px;line-height:1.65}.walkin-success-details{margin:0;padding:8px 22px;background:#f6fbfd;border:1px solid #dceff6;border-radius:18px;text-align:left}.walkin-success-details>div{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:center;padding:15px 4px;border-bottom:1px solid #e1eef3}.walkin-success-details>div:last-child{border-bottom:0}.walkin-success-details dt{color:#6b818b;font-size:13px;font-weight:700}.walkin-success-details dd{margin:0;color:#183c50;font-size:15px;font-weight:800;line-height:1.55}.walkin-success-actions{display:flex;justify-content:center;gap:12px;margin-top:28px}.walkin-success-actions button,.walkin-success-actions a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:13px;padding:12px 18px;font:inherit;font-size:14px;font-weight:800;text-decoration:none;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}.walkin-success-actions button{border:1px solid #bcdce9;background:#fff;color:#267da3}.walkin-success-actions a{border:1px solid #318fbe;background:#318fbe;color:#fff;box-shadow:0 9px 18px rgba(49,143,190,.22)}.walkin-success-actions button:hover,.walkin-success-actions a:hover{transform:translateY(-2px)}.walkin-success-actions button:hover{background:#f1f9fc}.walkin-success-actions a:hover{background:#287fa9;box-shadow:0 12px 24px rgba(49,143,190,.28)}.walkin-success-actions button:focus-visible,.walkin-success-actions a:focus-visible{outline:3px solid rgba(77,168,218,.32);outline-offset:3px}

@media(max-width:900px){.appointment-grid{grid-template-columns:1fr}.summary{position:static}}@media(max-width:560px){.two-cols{grid-template-columns:1fr}.appointment-card{padding:17px}.walkin-success-view{min-height:auto;padding:14px 0;background:transparent}.walkin-success-card{border-radius:20px;padding:31px 18px 22px}.walkin-success-icon{width:72px;height:72px}.walkin-success-icon svg{width:39px;height:39px}.walkin-success-copy{font-size:14px;margin-bottom:21px}.walkin-success-details{padding:5px 14px}.walkin-success-details>div{grid-template-columns:1fr;gap:4px;padding:12px 2px}.walkin-success-details dt{font-size:12px}.walkin-success-actions{flex-direction:column}.walkin-success-actions button,.walkin-success-actions a{width:100%}}
`;
