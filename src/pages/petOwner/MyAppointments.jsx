import React, { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, XCircle } from "lucide-react";
import AppShell from "../../components/AppShell";
import ConfirmDialog from "../../components/ConfirmDialog";
import { cancelAppointment, formatTime, getAppointments, todayLocal } from "../../services/appointmentService";

export default function MyAppointments({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  async function load() {
    try { setLoading(true); setRows(await getAppointments({ ownerId: profile.id })); }
    catch (e) { setNotice({ type: "error", text: e.message }); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function confirmCancel() {
    if (!pendingCancel) return;
    setCancelling(true);
    try {
      await cancelAppointment(pendingCancel.id, profile.id);
      setNotice({ type: "success", text: "Appointment cancelled." });
      setPendingCancel(null);
      await load();
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setCancelling(false);
    }
  }
  return <AppShell profile={profile} title="My Appointments">
    <div className="appt-page">
      <div className="toolbar"><div><h2>Appointment History</h2><p>View and cancel eligible appointments.</p></div><button onClick={load}><RefreshCw size={17}/> Refresh</button></div>
      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
      {loading ? <div className="card">Loading appointments…</div> : rows.length === 0 ? <div className="card empty"><CalendarDays/>No appointments yet.</div> : <div className="cards">{rows.map(row => <article className="appointment" key={row.id}>
        <div><span className={`status ${row.status.replaceAll(" ","-").toLowerCase()}`}>{row.status}</span><h3>{row.pet?.pet_name}</h3><p>{row.pet?.species} · General Consultation</p></div>
        <div className="details"><span><b>Date:</b> {row.appointment_date}</span><span><b>Time:</b> {formatTime(row.start_time)} – {formatTime(row.end_time)}</span><span><b>Veterinarian:</b> {row.veterinarian?.full_name}</span><span><b>Source:</b> {row.appointment_source}</span>{row.visit_reason && <span><b>Reason:</b> {row.visit_reason}</span>}</div>
        {row.appointment_date >= todayLocal() && row.status === "Confirmed" && <button className="cancel" onClick={() => setPendingCancel(row)}><XCircle size={16}/> Cancel</button>}
      </article>)}</div>}
    </div>

    <ConfirmDialog
      open={!!pendingCancel}
      tone="danger"
      title="Cancel Appointment?"
      description={pendingCancel ? `Cancel ${pendingCancel.pet?.pet_name || "this pet"}'s appointment on ${pendingCancel.appointment_date} at ${formatTime(pendingCancel.start_time)}? This cannot be undone.` : ""}
      confirmLabel="Yes, Cancel Appointment"
      cancelLabel="Keep Appointment"
      busy={cancelling}
      onConfirm={confirmCancel}
      onCancel={() => setPendingCancel(null)}
    />

    <style>{css}</style>
  </AppShell>;
}
const css=`.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.toolbar h2{margin:0}.toolbar p{margin:5px 0;color:#6F7F88}.toolbar button,.cancel{border:0;border-radius:11px;padding:10px 13px;display:flex;align-items:center;gap:7px;cursor:pointer}.toolbar button{background:#e8f7fc;color:#257fa9}.notice{padding:12px;border-radius:11px;margin-bottom:15px}.notice.success{background:#eafaf0;color:#227a52}.notice.error{background:#fff0f0;color:#b94b4b}.cards{display:grid;gap:15px}.appointment{background:white;border-radius:18px;padding:20px;box-shadow:0 8px 24px rgba(47,117,150,.09);display:grid;grid-template-columns:1fr 1.5fr auto;gap:20px;align-items:center}.appointment h3{margin:9px 0 3px}.appointment p{margin:0;color:#6F7F88}.details{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:14px}.status{display:inline-block;padding:5px 9px;border-radius:99px;background:#eaf7fc;color:#2884ad;font-size:12px;font-weight:800}.status.cancelled{background:#fff0f0;color:#bd5050}.status.completed{background:#eaf8ef;color:#348359}.cancel{background:#fff0f0;color:#b84e4e}.empty{display:grid;place-items:center;gap:10px;color:#6F7F88;min-height:180px}@media(max-width:800px){.appointment{grid-template-columns:1fr}.details{grid-template-columns:1fr}}`;
