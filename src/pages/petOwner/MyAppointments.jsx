import React, { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, XCircle } from "lucide-react";
import AppShell from "../../components/AppShell";
import { cancelAppointment, formatTime, getAppointments, todayLocal } from "../../services/appointmentService";

export default function MyAppointments({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  async function load() {
    try { setLoading(true); setRows(await getAppointments({ ownerId: profile.id })); }
    catch (e) { setMessage(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function cancel(row) {
    if (!window.confirm(`Cancel ${row.pet?.pet_name}'s appointment?`)) return;
    try { await cancelAppointment(row.id, profile.id); setMessage("Appointment cancelled."); await load(); }
    catch (e) { setMessage(e.message); }
  }
  return <AppShell profile={profile} title="My Appointments">
    <div className="appt-page">
      <div className="toolbar"><div><h2>Appointment History</h2><p>View and cancel eligible appointments.</p></div><button onClick={load}><RefreshCw size={17}/> Refresh</button></div>
      {message && <div className="msg">{message}</div>}
      {loading ? <div className="card">Loading appointments…</div> : rows.length === 0 ? <div className="card empty"><CalendarDays/>No appointments yet.</div> : <div className="cards">{rows.map(row => <article className="appointment" key={row.id}>
        <div><span className={`status ${row.status.replaceAll(" ","-").toLowerCase()}`}>{row.status}</span><h3>{row.pet?.pet_name}</h3><p>{row.pet?.species} · General Consultation</p></div>
        <div className="details"><span><b>Date:</b> {row.appointment_date}</span><span><b>Time:</b> {formatTime(row.start_time)} – {formatTime(row.end_time)}</span><span><b>Veterinarian:</b> {row.veterinarian?.full_name}</span><span><b>Source:</b> {row.appointment_source}</span>{row.visit_reason && <span><b>Reason:</b> {row.visit_reason}</span>}</div>
        {row.appointment_date >= todayLocal() && row.status === "Confirmed" && <button className="cancel" onClick={() => cancel(row)}><XCircle size={16}/> Cancel</button>}
      </article>)}</div>}
    </div><style>{css}</style>
  </AppShell>;
}
const css=`.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.toolbar h2{margin:0}.toolbar p{margin:5px 0;color:#6F7F88}.toolbar button,.cancel{border:0;border-radius:11px;padding:10px 13px;display:flex;align-items:center;gap:7px;cursor:pointer}.toolbar button{background:#e8f7fc;color:#257fa9}.msg{background:#fff8df;color:#916b12;padding:12px;border-radius:11px;margin-bottom:15px}.cards{display:grid;gap:15px}.appointment{background:white;border-radius:18px;padding:20px;box-shadow:0 8px 24px rgba(47,117,150,.09);display:grid;grid-template-columns:1fr 1.5fr auto;gap:20px;align-items:center}.appointment h3{margin:9px 0 3px}.appointment p{margin:0;color:#6F7F88}.details{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px}.status{display:inline-block;padding:5px 9px;border-radius:99px;background:#eaf7fc;color:#2884ad;font-size:12px;font-weight:800}.status.cancelled{background:#fff0f0;color:#bd5050}.status.completed{background:#eaf8ef;color:#348359}.cancel{background:#fff0f0;color:#b84e4e}.empty{display:grid;place-items:center;gap:10px;color:#6F7F88;min-height:180px}@media(max-width:800px){.appointment{grid-template-columns:1fr}.details{grid-template-columns:1fr}}`;
