import React, { useEffect, useState, useCallback, useMemo } from "react";
import { PawPrint, RefreshCw, Search, X } from "lucide-react";
import { APPOINTMENT_STATUSES, formatTime, getAppointments, updateAppointmentStatus, getVeterinarianAvailability, rescheduleAppointment, todayLocal } from "../services/appointmentService";
import { supabase } from "../config/supabaseClient";

const PAGE_SIZE = 10;
const STATUS_FILTER_OPTIONS = APPOINTMENT_STATUSES.filter(s => s !== "Confirmed");

// Once an appointment's date is today (or has passed), it's handed off to
// Queue Management for check-in, so it no longer needs to show in this table.
function isHandedOffToQueue(row) {
  if (row.status !== "Confirmed") return false;
  return row.appointment_date <= todayLocal();
}

export default function AppointmentManagementTable({ profile, veterinarianOnly = false, focusToday = false }) {
  const [rows,setRows]=useState([]), [loading,setLoading]=useState(true), [status,setStatus]=useState(""), [date,setDate]=useState(() => focusToday ? todayLocal() : "");
  const [search,setSearch]=useState(""), [page,setPage]=useState(1);
  const [message,setMessage]=useState("");
  const [notesModal,setNotesModal]=useState(null);
  const [actingId,setActingId]=useState(null);
  const [rebookModal,setRebookModal]=useState(null);
  const [rebookDate,setRebookDate]=useState("");
  const [rebookTime,setRebookTime]=useState("");
  const [rebookVetId,setRebookVetId]=useState("");
  const [rebookVets,setRebookVets]=useState([]);
  const [rebookSlotMap,setRebookSlotMap]=useState({});
  const [rebookTimes,setRebookTimes]=useState([]);
  const [rebookLoading,setRebookLoading]=useState(false);
  const [rebookSaving,setRebookSaving]=useState(false);
  const [rebookMessage,setRebookMessage]=useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAppointments({ veterinarianId: veterinarianOnly ? profile.id : null, status, date });
      setRows(data);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }, [date, profile?.id, status, veterinarianOnly]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notesModal && !rebookModal) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [notesModal, rebookModal]);

  useEffect(() => {
    const channel = supabase
      .channel(`web-appointment-management-${profile?.id || "staff"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load, profile?.id]);

  useEffect(() => { setPage(1); }, [status, date, search]);

  useEffect(() => {
    if (!rebookModal || !rebookDate) return;
    let active = true;
    (async () => {
      try {
        setRebookLoading(true);
        const result = await getVeterinarianAvailability(rebookDate, rebookModal.id);
        if (active) {
          setRebookVets(result.vets);
          setRebookSlotMap(result.slotMap);
          setRebookTimes(result.times);
          setRebookTime("");
          setRebookVetId("");
        }
      } catch (e) { if (active) setRebookMessage(e.message); }
      finally { if (active) setRebookLoading(false); }
    })();
    return () => { active = false; };
  }, [rebookModal, rebookDate]);

  useEffect(() => {
    setRebookVetId(current => {
      if (!current) return current;
      const eligible = (rebookSlotMap[current] || []).includes(rebookTime);
      return eligible ? current : "";
    });
  }, [rebookTime, rebookSlotMap]);

  const rebookEligibleVets = useMemo(
    () => rebookVets.filter(vet => (rebookSlotMap[vet.id] || []).includes(rebookTime)),
    [rebookVets, rebookSlotMap, rebookTime]
  );

  async function doAction(id, newStatus, verb) {
    if (actingId) return;
    try {
      setActingId(id);
      await updateAppointmentStatus(id, newStatus, profile.id);
      setMessage(`Appointment ${verb}.`);
      await load();
    } catch (e) { setMessage(e.message); }
    finally { setActingId(null); }
  }

  function openRebook(row) {
    setRebookModal(row);
    setRebookDate(row.appointment_date >= todayLocal() ? row.appointment_date : todayLocal());
    setRebookTime("");
    setRebookVetId("");
    setRebookVets([]);
    setRebookSlotMap({});
    setRebookTimes([]);
    setRebookMessage("");
  }

  async function confirmRebook(event) {
    event.preventDefault();
    if (!rebookTime) { setRebookMessage("Select an available time."); return; }
    if (!rebookVetId) { setRebookMessage("Select a veterinarian."); return; }
    try {
      setRebookSaving(true);
      setRebookMessage("");
      await rescheduleAppointment(rebookModal.id, {
        veterinarianId: rebookVetId,
        appointmentDate: rebookDate,
        startTime: rebookTime
      }, rebookModal.owner?.id, profile.id);
      setRebookModal(null);
      setMessage("Appointment rebooked successfully.");
      await load();
    } catch (e) { setRebookMessage(e.message); }
    finally { setRebookSaving(false); }
  }

  function rowAction(row) {
    if (row.status === "Completed") return { kind: "badge", label: "Completed", className: "badge-completed" };
    if (row.status === "Cancelled") return { kind: "badge", label: "Cancelled", className: "badge-cancelled" };
    return { kind: "pending" };
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    // focusToday (arrived here via the Veterinarian sidebar's My
    // Appointments badge/link) means today's Confirmed consultations
    // should be prioritized, not hidden -- so the normal hand-off-to-queue
    // filtering is skipped in that case. Every other entry point into
    // this table (direct visit, Staff/Admin) keeps the original behavior.
    const visible = focusToday ? rows : rows.filter(row => !isHandedOffToQueue(row));
    const base = !query ? visible : visible.filter(row => [
      row.pet?.pet_name, row.owner?.full_name, row.owner?.username, row.owner?.email,
      row.veterinarian?.full_name, row.notes, row.appointment_source
    ].some(value => String(value || "").toLowerCase().includes(query)));
    return [...base].sort((a, b) => {
      if (focusToday) {
        // Today's consultations first, then the usual recency ordering.
        const todayA = a.appointment_date === todayLocal();
        const todayB = b.appointment_date === todayLocal();
        if (todayA !== todayB) return todayA ? -1 : 1;
      }
      // Most recently created/updated row first, so whatever was just
      // booked, rebooked, or changed shows at the very top.
      const touchedA = new Date(a.updated_at || a.created_at || 0).getTime();
      const touchedB = new Date(b.updated_at || b.created_at || 0).getTime();
      if (touchedA !== touchedB) return touchedB - touchedA;
      if (a.appointment_date !== b.appointment_date) return a.appointment_date < b.appointment_date ? 1 : -1;
      const startA = String(a.start_time || ""), startB = String(b.start_time || "");
      return startA < startB ? 1 : startA > startB ? -1 : 0;
    });
  }, [rows, search, focusToday]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <div className="manage-wrap">
    <div className="filters">
      <div className="search-box"><Search size={16}/><input type="text" placeholder="Search pet, owner, veterinarian, or notes" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{STATUS_FILTER_OPTIONS.map(s=><option key={s}>{s}</option>)}</select>
      <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      <button onClick={load}><RefreshCw size={16}/>Refresh</button>
    </div>
    {message&&<div className="manage-message">{message}</div>}
    <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>Pet / Owner</th><th>Veterinarian</th><th>Source</th><th>Notes</th><th>Action</th></tr></thead><tbody>{loading?<tr><td colSpan="6">Loading…</td></tr>:pageRows.length===0?<tr><td colSpan="6">No appointments found.</td></tr>:pageRows.map(row=>{
      const action=rowAction(row);
      return <tr key={row.id}>
        <td>{row.appointment_date}<br/><small>{formatTime(row.start_time)}</small></td>
        <td><div className="appt-pet-cell">{row.pet?.photo_url?<img className="appt-pet-photo" src={row.pet.photo_url} alt={row.pet?.pet_name||"Pet"}/>:<div className="appt-pet-photo appt-pet-photo-fallback"><PawPrint size={15}/></div>}<div><b>{row.pet?.pet_name}</b>{row.visit_group_id&&<small className="visit-badge">Part of a multi-pet visit</small>}<br/><small>{row.owner?.full_name}</small></div></div></td>
        <td>{row.veterinarian?.full_name}</td>
        <td>{row.appointment_source}</td>
        <td>{row.notes?<button type="button" className="view-notes" onClick={()=>setNotesModal(row)}>View Notes</button>:"N/A"}</td>
        <td>
          {action.kind==="badge"&&<span className={`action-badge ${action.className}`}>{action.label}</span>}
          {action.kind==="pending"&&<div className="action-group">
            <button type="button" className="action-btn cancel" disabled={actingId===row.id} onClick={()=>doAction(row.id,"Cancelled","cancelled")}>Cancel</button>
            <button type="button" className="action-btn rebook" disabled={actingId===row.id} onClick={()=>openRebook(row)}>Rebook</button>
          </div>}
        </td>
      </tr>;
    })}</tbody></table></div>
    {!loading && filteredRows.length > 0 && <div className="pagination">
      <span>{filteredRows.length} appointment{filteredRows.length===1?"":"s"} · Page {currentPage} of {totalPages}</span>
      <div className="pagination-buttons">
        <button disabled={currentPage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button>
        <button disabled={currentPage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button>
      </div>
    </div>}
    {notesModal && <div className="notes-backdrop" onClick={()=>setNotesModal(null)}>
      <div className="notes-modal" onClick={e=>e.stopPropagation()}>
        <button type="button" className="notes-close" aria-label="Close" onClick={()=>setNotesModal(null)}><X size={16}/></button>
        <h3>Notes</h3>
        <p className="notes-context">{notesModal.pet?.pet_name} · {notesModal.owner?.full_name} · {notesModal.appointment_date}</p>
        <div className="notes-body">{notesModal.notes}</div>
        <button type="button" className="notes-back" onClick={()=>setNotesModal(null)}>Back</button>
      </div>
    </div>}
    {rebookModal && <div className="notes-backdrop" onClick={()=>!rebookSaving&&setRebookModal(null)}>
      <div className="notes-modal" onClick={e=>e.stopPropagation()}>
        <button type="button" className="notes-close" aria-label="Close" onClick={()=>setRebookModal(null)}><X size={16}/></button>
        <h3>Rebook Appointment</h3>
        <p className="notes-context">{rebookModal.pet?.pet_name} · {rebookModal.owner?.full_name} · {rebookModal.veterinarian?.full_name}</p>
        <form onSubmit={confirmRebook} className="rebook-form">
          {rebookMessage&&<div className="rebook-error">{rebookMessage}</div>}
          <label>New Date<span className="required-mark"> *</span><input type="date" min={todayLocal()} value={rebookDate} onChange={e=>setRebookDate(e.target.value)} required/></label>
          <label>Available Time<span className="required-mark"> *</span><select value={rebookTime} onChange={e=>setRebookTime(e.target.value)} required disabled={rebookLoading||!rebookTimes.length}>
            <option value="">{rebookLoading?"Loading…":rebookTimes.length?"Select time":"No available slots"}</option>
            {rebookTimes.map(slot=><option key={slot} value={slot}>{formatTime(slot)}</option>)}
          </select></label>
          <label>Veterinarian<span className="required-mark"> *</span><select value={rebookVetId} onChange={e=>setRebookVetId(e.target.value)} required disabled={!rebookTime}>
            <option value="">{!rebookTime?"Select a time first":rebookEligibleVets.length?"Select veterinarian":"No veterinarian available at this time"}</option>
            {rebookEligibleVets.map(vet=><option key={vet.id} value={vet.id}>{vet.full_name}</option>)}
          </select></label>
          <button type="submit" className="notes-back rebook-confirm" disabled={rebookSaving}>{rebookSaving?"Rebooking…":"Confirm Rebook"}</button>
        </form>
      </div>
    </div>}
    <style>{`.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px;align-items:center}.filters select,.filters input,.filters button,td select{border:1px solid #cfe4ed;border-radius:10px;padding:9px;background:white}.filters button{display:flex;gap:6px;align-items:center;cursor:pointer;color:#257fa9}.search-box{display:flex;align-items:center;gap:7px;min-width:260px;flex:1;border:1px solid #cfe4ed;border-radius:10px;padding:0 11px;background:white;color:#4da8da}.search-box input{flex:1;border:0;padding:9px 0;background:transparent}.manage-message{padding:11px;background:#eef9fd;border-radius:10px;margin-bottom:12px}.table-wrap{overflow:auto;background:white;border-radius:18px;box-shadow:0 8px 24px rgba(47,117,150,.09)}table{width:100%;border-collapse:collapse;min-width:860px}th,td{text-align:left;padding:13px;border-bottom:1px solid #edf3f6}th{background:#f2fafd;color:#52707d}small{color:#72848d}.visit-badge{display:block;color:#318fbe!important;font-weight:700}.appt-pet-cell{display:flex;align-items:center;gap:10px}.appt-pet-photo{flex-shrink:0;width:34px;height:34px;border-radius:9px;object-fit:cover;background:#eaf8fd;color:#4da8da}.appt-pet-photo-fallback{display:grid;place-items:center}.pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;flex-wrap:wrap;color:#52707d;font-size:13px}.pagination-buttons{display:flex;gap:8px}.pagination-buttons button{border:1px solid #cfe4ed;border-radius:10px;padding:8px 16px;background:white;color:#257fa9;cursor:pointer;font-weight:700}.pagination-buttons button:disabled{opacity:.5;cursor:not-allowed}.view-notes{border:0;background:none;color:#318fbe;font-weight:700;cursor:pointer;text-decoration:underline;padding:0}.action-group{display:flex;gap:6px;flex-wrap:wrap}.action-btn{border:0;border-radius:9px;padding:8px 14px;font-weight:700;cursor:pointer;color:#fff;white-space:nowrap}.action-btn:disabled{opacity:.6;cursor:not-allowed}.action-btn.cancel{background:#e35b5b}.action-btn.rebook{background:#e0982f}.action-btn.complete{background:#2d9d63}.action-badge{display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800}.action-badge.badge-completed{background:#eaf8ef;color:#26754a}.action-badge.badge-cancelled{background:#fdeceb;color:#b34848}.notes-backdrop{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:20px;background:rgba(24,50,63,.55);backdrop-filter:blur(3px)}.notes-modal{position:relative;box-sizing:border-box;width:min(480px,100%);max-height:80vh;display:flex;flex-direction:column;border-radius:18px;padding:26px;background:#fff;box-shadow:0 22px 55px rgba(22,56,72,.24);overflow-y:auto}.notes-modal h3{margin:0 0 6px;padding-right:28px;color:#20313b}.notes-close{position:absolute;top:16px;right:16px;display:grid;place-items:center;border:0;border-radius:9px;padding:6px;background:#edf5f8;color:#456472;cursor:pointer}.notes-context{margin:0 0 14px;color:#7c8c94;font-size:13px}.notes-body{box-sizing:border-box;margin:0 0 20px;padding:14px 16px;background:#f7fbfd;border:1px solid #edf3f6;border-radius:12px;color:#20313b;line-height:1.6;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-height:40vh;overflow-y:auto}.notes-back{align-self:flex-start;border:1px solid #cfe4ed;border-radius:10px;padding:10px 18px;background:#fff;color:#257fa9;font-weight:700;cursor:pointer}.rebook-form{display:grid;gap:14px}.rebook-form label{display:grid;gap:6px;font-weight:700;font-size:13px;color:#334e5a}.rebook-form input,.rebook-form select{border:1px solid #cfe4ed;border-radius:10px;padding:10px 12px;font:inherit;background:#fbfeff}.rebook-error{padding:10px 13px;border-radius:10px;background:#fff0f0;color:#a94444;font-size:13px}.rebook-confirm{background:#4DA8DA!important;color:#fff!important;border:0!important}.rebook-confirm:disabled{opacity:.65;cursor:not-allowed}`}</style>
  </div>;
}
