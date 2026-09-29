import React, { useEffect, useMemo, useState, useCallback } from "react";
import { CalendarDays, PawPrint, Search, X } from "lucide-react";
import AppShell from "../../components/AppShell";
import ConfirmDialog from "../../components/ConfirmDialog";
import { APPOINTMENT_STATUSES, cancelAppointment, formatTime, getAppointments, todayLocal } from "../../services/appointmentService";
import { formatDateLong } from "../../utils/timeFormat";

export default function MyAppointments({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await getAppointments({ ownerId: profile.id, status, date }));
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, [profile?.id, status, date]);

  useEffect(() => { load(); }, [load]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setDate("");
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => [
      row.pet?.pet_name, row.veterinarian?.full_name, row.visit_reason, row.notes, row.appointment_source
    ].some(value => String(value || "").toLowerCase().includes(query)));
  }, [rows, search]);

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
  return <AppShell profile={profile} title="Appointments">
    <div className="appt-page">
      <div className="filters">
        <div className="search-box"><Search size={16}/><input type="text" placeholder="Search pet, veterinarian, or notes" value={search} onChange={e => setSearch(e.target.value)}/></div>
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{APPOINTMENT_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}/>
        <button onClick={clearFilters}><X size={16}/>Clear</button>
      </div>
      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}
      {loading ? <div className="card">Loading appointments…</div> : filteredRows.length === 0 ? <div className="card empty"><CalendarDays/>No appointments found.</div> : <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>Pet</th><th>Veterinarian</th><th>Source</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id}>
        <td>{formatDateLong(row.appointment_date)}<br/><small>{formatTime(row.start_time)} – {formatTime(row.end_time)}</small></td>
        <td><div className="appt-pet-cell">{row.pet?.photo_url ? <img className="appt-pet-photo" src={row.pet.photo_url} alt={row.pet?.pet_name || "Pet"}/> : <div className="appt-pet-photo appt-pet-photo-fallback"><PawPrint size={15}/></div>}<div><b>{row.pet?.pet_name}</b><br/><small>{row.pet?.species} · General Consultation</small></div></div></td>
        <td>{row.veterinarian?.full_name}</td>
        <td>{row.appointment_source}</td>
        <td>{row.visit_reason || "N/A"}</td>
        <td><span className={`action-badge badge-${row.status.replaceAll(" ","-").toLowerCase()}`}>{row.status}</span></td>
        <td>{row.appointment_date >= todayLocal() && row.status === "Confirmed" ? <button type="button" className="action-btn cancel" onClick={() => setPendingCancel(row)}>Cancel</button> : "—"}</td>
      </tr>)}</tbody></table></div>}
    </div>

    <ConfirmDialog
      open={!!pendingCancel}
      tone="danger"
      title="Cancel Appointment?"
      description={pendingCancel ? `Cancel ${pendingCancel.pet?.pet_name || "this pet"}'s appointment on ${formatDateLong(pendingCancel.appointment_date)} at ${formatTime(pendingCancel.start_time)}? This cannot be undone.` : ""}
      confirmLabel="Yes, Cancel Appointment"
      cancelLabel="Keep Appointment"
      busy={cancelling}
      onConfirm={confirmCancel}
      onCancel={() => setPendingCancel(null)}
    />

    <style>{css}</style>
  </AppShell>;
}
const css=`.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px;align-items:center}.filters select,.filters input,.filters button{border:1px solid #cfe4ed;border-radius:10px;padding:9px;background:white}.filters button{display:flex;gap:6px;align-items:center;cursor:pointer;color:#257fa9}.search-box{display:flex;align-items:center;gap:7px;min-width:260px;flex:1;border:1px solid #cfe4ed;border-radius:10px;padding:0 11px;background:white;color:#4da8da}.search-box input{flex:1;border:0;padding:9px 0;background:transparent}.notice{padding:12px;border-radius:11px;margin-bottom:15px}.notice.success{background:#eafaf0;color:#227a52}.notice.error{background:#fff0f0;color:#b94b4b}.card{background:white;border-radius:18px;padding:20px;box-shadow:0 8px 24px rgba(47,117,150,.09)}.empty{display:grid;place-items:center;gap:10px;color:#6F7F88;min-height:180px}.table-wrap{overflow:auto;background:white;border-radius:18px;box-shadow:0 8px 24px rgba(47,117,150,.09)}table{width:100%;border-collapse:collapse;min-width:860px}th,td{text-align:left;padding:13px;border-bottom:1px solid #edf3f6}th{background:#f2fafd;color:#52707d}small{color:#72848d}.appt-pet-cell{display:flex;align-items:center;gap:10px}.appt-pet-photo{flex-shrink:0;width:34px;height:34px;border-radius:9px;object-fit:cover;background:#eaf8fd;color:#4da8da}.appt-pet-photo-fallback{display:grid;place-items:center}.action-badge{display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800}.action-badge.badge-confirmed{background:#eaf7fc;color:#2884ad}.action-badge.badge-completed{background:#eaf8ef;color:#26754a}.action-badge.badge-cancelled{background:#fdeceb;color:#b34848}.action-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:76px;height:34px;text-align:center;border:0;border-radius:9px;padding:8px 14px;font-weight:700;cursor:pointer;color:#fff;white-space:nowrap}.action-btn.cancel{background:#e35b5b}`;
