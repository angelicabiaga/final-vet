import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { APPOINTMENT_STATUSES, formatTime, getAppointments, updateAppointmentStatus } from "../services/appointmentService";
import { supabase } from "../config/supabaseClient";

export default function AppointmentManagementTable({ profile, veterinarianOnly = false }) {
  const [rows,setRows]=useState([]), [loading,setLoading]=useState(true), [status,setStatus]=useState(""), [date,setDate]=useState("");
  const [message,setMessage]=useState("");
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await getAppointments({ veterinarianId: veterinarianOnly ? profile.id : null, status, date }));
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }, [date, profile?.id, status, veterinarianOnly]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`web-appointment-management-${profile?.id || "staff"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load, profile?.id]);
  async function changeStatus(id,value){try{await updateAppointmentStatus(id,value,profile.id);setMessage("Appointment status updated.");await load();}catch(e){setMessage(e.message);}}
  return <div className="manage-wrap">
    <div className="filters"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{APPOINTMENT_STATUSES.map(s=><option key={s}>{s}</option>)}</select><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={load}><RefreshCw size={16}/>Refresh</button></div>
    {message&&<div className="manage-message">{message}</div>}
    <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>Pet / Owner</th><th>Veterinarian</th><th>Source</th><th>Reason</th><th>Status</th></tr></thead><tbody>{loading?<tr><td colSpan="6">Loading…</td></tr>:rows.length===0?<tr><td colSpan="6">No appointments found.</td></tr>:rows.map(row=><tr key={row.id}><td>{row.appointment_date}<br/><small>{formatTime(row.start_time)}</small></td><td><b>{row.pet?.pet_name}</b><br/><small>{row.owner?.full_name}</small></td><td>{row.veterinarian?.full_name}</td><td>{row.appointment_source}</td><td>{row.visit_reason||"—"}</td><td><select value={row.status} onChange={e=>changeStatus(row.id,e.target.value)}>{APPOINTMENT_STATUSES.map(s=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div>
    <style>{`.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px}.filters select,.filters input,.filters button,td select{border:1px solid #cfe4ed;border-radius:10px;padding:9px;background:white}.filters button{display:flex;gap:6px;align-items:center;cursor:pointer;color:#257fa9}.manage-message{padding:11px;background:#eef9fd;border-radius:10px;margin-bottom:12px}.table-wrap{overflow:auto;background:white;border-radius:18px;box-shadow:0 8px 24px rgba(47,117,150,.09)}table{width:100%;border-collapse:collapse;min-width:820px}th,td{text-align:left;padding:13px;border-bottom:1px solid #edf3f6}th{background:#f2fafd;color:#52707d}small{color:#72848d}`}</style>
  </div>;
}
