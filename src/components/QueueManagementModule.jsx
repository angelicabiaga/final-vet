import React,{useCallback,useEffect,useMemo,useState}from"react";
import {useNavigate}from"react-router-dom";
import {PawPrint}from"lucide-react";
import AppShell from"./AppShell";
import {getQueue,getTodayCheckinAppointments,checkInAppointment,updateQueueStatus,requeueToNextAvailable,subscribeToQueue,QUEUE_STATUSES}from"../services/queueService";
import {getVeterinarians,formatTime,todayLocal}from"../services/appointmentService";
import {formatClockTime}from"../utils/timeFormat";
import {MEDICAL_RECORD_TEMPLATES}from"../constants/medicalRecordTemplates";

// One representative photo per row -- multi-pet visits already collapse
// their names into a single comma-joined summary, so this mirrors that
// same "one compact line" treatment instead of one photo per pet.
function PetThumb({pet}){
 return pet?.photo_url?<img className="petThumb" src={pet.photo_url} alt={pet.pet_name||"Pet"}/>:<div className="petThumb petThumbFallback"><PawPrint size={14}/></div>;
}

function bookingTime(r){
 if(r.original_appointment_time)return formatTime(r.original_appointment_time);
 if(r.arrived_at)return formatClockTime(r.arrived_at);
 return "—";
}

// Built from the y/m/d components (not parsed from the string) so this
// never shifts a day off from timezone-parsing a plain "YYYY-MM-DD" value.
function formatApptDate(dateStr){
 if(!dateStr)return "";
 const [y,m,d]=dateStr.split("-").map(Number);
 if(!y)return "";
 return new Date(y,m-1,d).toLocaleDateString([],{month:"short",day:"numeric"});
}

export default function QueueManagementModule({profile,mode="staff"}){
 const [rows,setRows]=useState([]),[appointments,setAppointments]=useState([]),[vets,setVets]=useState([]),[vet,setVet]=useState(""),[status,setStatus]=useState(""),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[error,setError]=useState(""),[checkingIn,setCheckingIn]=useState(null),[updatingId,setUpdatingId]=useState(null),[checkinDate,setCheckinDate]=useState(todayLocal());
 const canManage=["admin","staff"].includes(profile?.role);
 const isVet=profile?.role==="veterinarian";
 const navigate=useNavigate();
 function openRecordTemplate(r,template){
  if(!template)return;
  const petIds=(r.pets?.length?r.pets:[{id:r.pet_id,appointmentId:r.appointment_id}]).map(p=>p.id).join(",");
  const appointmentIds=(r.pets?.length?r.pets:[{id:r.pet_id,appointmentId:r.appointment_id}]).map(p=>p.appointmentId||"").join(",");
  const params=new URLSearchParams({queueEntryId:r.id,ownerId:r.owner_id||"",veterinarianId:r.veterinarian_id||"",petIds,appointmentIds,template});
  navigate(`/veterinarian/medical-records?${params.toString()}`);
 }
 const load=useCallback(async()=>{try{setLoading(true);setError("");const vid=profile?.role==="veterinarian"?profile.id:vet;const [q,v,a]=await Promise.all([getQueue({veterinarianId:vid,status}),getVeterinarians(),profile?.role==="veterinarian"?Promise.resolve([]):getTodayCheckinAppointments()]);setRows(q);setVets(v);setAppointments(a);}catch(e){setError(e.message)}finally{setLoading(false)}},[profile,vet,status]);
 useEffect(()=>{load();const off=subscribeToQueue(load);return()=>off();},[load]);
 // Appointments become due for check-in purely because time has passed, with
 // no database write to trigger the realtime subscription above, so poll too.
 useEffect(()=>{
  if(profile?.role==="veterinarian")return;
  const timer=setInterval(load,60000);
  return ()=>clearInterval(timer);
 },[load,profile?.role]);
 const stats=useMemo(()=>({waiting:rows.filter(r=>r.status==="Waiting").length,serving:rows.filter(r=>r.status==="Serving").length,completed:rows.filter(r=>r.status==="Completed").length,late:rows.filter(r=>r.late_arrival).length}),[rows]);
 // Every Confirmed appointment not yet queued is fetched; staff pick which
 // date's batch they actually want to see and check in from.
 const checkinAppointments=useMemo(()=>appointments.filter(a=>a.appointment_date===checkinDate),[appointments,checkinDate]);
 // Once the vet marks a ticket Completed it drops off the live queue - it's
 // tracked from the Appointment Management page from there. Selecting
 // "Completed" from the status filter still shows it on request.
 const tableRows=useMemo(()=>{
  const base=status==="Completed"?rows:rows.filter(r=>r.status!=="Completed");
  // A ticket only reaches the veterinarian's queue once staff clicks Serving.
  return isVet?base.filter(r=>r.status==="Serving"):base;
 },[rows,status,isVet]);
 async function act(id,fn,ok){
  if(updatingId)return;
  try{
   setUpdatingId(id);setError("");
   const result=await fn();
   setMessage(typeof ok==="function"?ok(result):ok);
   await load();
  }catch(e){setError(e.message)}
  finally{setUpdatingId(null)}
 }
 async function handleCheckIn(card){
  if(checkingIn)return;
  try{
   setCheckingIn(card.id);
   setError("");
   await checkInAppointment(card,profile);
   setAppointments(current=>current.filter(item=>item.id!==card.id));
   setMessage(card.pets?.length>1?"Visit checked in and added to the queue.":"Appointment checked in and added to the queue.");
   await load();
  }catch(e){
   if(e.shouldRefreshQueue)await load();
   setError(e.message);
  }finally{setCheckingIn(null)}
 }
 return <AppShell profile={profile} title={profile?.role==="veterinarian"?"My Queue":"Queue Management"}>
  {message&&<div className="ok">{message}</div>}{error&&<div className="err">{error}</div>}
  <div className="stats">{Object.entries(stats).map(([k,v])=><div className="stat" key={k}><strong>{v}</strong><span>{k}</span></div>)}</div>
  {profile?.role!=="veterinarian"&&<div className="card filters"><select value={vet} onChange={e=>setVet(e.target.value)}><option value="">All veterinarians</option>{vets.map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{QUEUE_STATUSES.map(s=><option key={s}>{s}</option>)}</select><button onClick={load}>Refresh</button></div>}
  {profile?.role!=="veterinarian"&&<div className="card"><div className="apptHead"><h3>Appointments ready for check-in</h3><label className="apptDatePick">Date<input type="date" value={checkinDate} onChange={e=>setCheckinDate(e.target.value)}/></label></div>{checkinAppointments.length===0?<p className="apptEmpty">No appointments to check in for {formatApptDate(checkinDate)}.</p>:<div className="apptgrid">{checkinAppointments.map(a=><div className="appt" key={a.id}><div className="apptTop"><PetThumb pet={a.pet}/><div className="apptInfo"><b>{a.pets?.length?a.pets.map(p=>p.pet_name).join(", "):(a.pet?.pet_name||"Pet")}</b><span>{formatApptDate(a.appointment_date)}, {formatTime(a.start_time)} · {a.veterinarian?.full_name||"Veterinarian"}{a.pets?.length>1&&` · ${a.pets.length} pets · ${a.visitDurationMinutes} min`}</span></div></div><button disabled={checkingIn===a.id} onClick={()=>handleCheckIn(a)}>{checkingIn===a.id?"Checking In...":"Check In"}</button></div>)}</div>}</div>}
  <div className="card"><h3>Live queue</h3>{loading?<p>Loading queue…</p>:tableRows.length===0?<p>No queue entries today.</p>:<div className="table"><table><thead><tr><th>No.</th><th>Pet</th><th>Veterinarian</th><th>Time</th><th>Status</th><th>Ahead / ETA</th><th>Actions</th></tr></thead><tbody>{tableRows.map(r=><tr key={r.id}><td><b>{r.queue_number}</b>{r.late_arrival&&<small className="late">Late Arrival</small>}</td><td><div className="queuePetCell"><PetThumb pet={r.pet}/><div>{r.pets?.length?r.pets.map(p=>p.pet_name).join(", "):(r.pet?.pet_name||"—")}{r.pets?.length>1&&<small className="petcount">{r.pets.length} pets · {r.visitDurationMinutes} min</small>}<small>{r.owner?.full_name||""}</small></div></div></td><td>{r.veterinarian?.full_name||"—"}</td><td>{bookingTime(r)}</td><td><span className={`pill ${r.status.replaceAll(" ","").toLowerCase()}`}>{r.status}</span></td><td>{r.clientsAhead??0} ahead<br/><small>~{r.estimatedWaitMinutes??0} min</small></td><td>
   {canManage&&<div className="actions">
    <button className="serve-btn" disabled={r.status!=="Waiting"||updatingId===r.id} onClick={()=>act(r.id,()=>updateQueueStatus(r.id,"Serving",profile),"Marked as serving.")}>{updatingId===r.id?"Updating…":"Serving"}</button>
    <button className="link" disabled={r.status!=="Waiting"||updatingId===r.id} onClick={()=>act(r.id,()=>requeueToNextAvailable(r.id,profile),time=>`Re-queued to ${formatTime(time)}.`)}>Re-queue</button>
   </div>}
   {isVet&&<div className="actions">
    {r.billing_status&&r.billing_status!=="Not Applicable"?
     <button className="serve-btn completed-btn" disabled>Completed</button>:
     <select className="template-select" aria-label="Choose medical record template" defaultValue="" disabled={r.status!=="Serving"} onChange={e=>openRecordTemplate(r,e.target.value)}>
      <option value="">Choose template</option>
      {MEDICAL_RECORD_TEMPLATES.map(template=><option key={template.value} value={template.value}>{template.label}</option>)}
     </select>}
   </div>}
  </td></tr>)}</tbody></table></div>}</div>
  <style>{`.ok,.err{padding:12px 15px;border-radius:12px;margin-bottom:14px}.ok{background:#e9f8ef;color:#26754a}.err{background:#fff0f0;color:#b34b4b}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.stat{background:#fff;border-radius:16px;padding:18px;box-shadow:0 7px 20px #d9edf5}.stat strong{display:block;font-size:27px;color:#318fbe;text-transform:capitalize}.stat span{text-transform:capitalize;color:#6f7f88}.filters{display:flex;gap:10px;margin-bottom:16px}.filters select,.filters button,.actions button,.actions select{padding:10px;border:1px solid #d4e9f1;border-radius:10px;background:#fff}.filters button,.appt button{background:#4DA8DA;color:#fff;border:0}.appt button:disabled,.template-select:disabled{opacity:.65;cursor:not-allowed}.apptHead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:10px}.apptHead h3{margin:0}.apptDatePick{display:flex;align-items:center;gap:8px;font-size:13px;color:#6f7f88;font-weight:700}.apptDatePick input{padding:8px 10px;border:1px solid #d4e9f1;border-radius:10px;background:#fff}.apptEmpty{color:#72838c;margin:0}.apptgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.appt{border:1px solid #e2f0f5;border-radius:12px;padding:12px;display:grid;gap:8px}.apptTop{display:flex;align-items:center;gap:10px;min-width:0}.apptInfo{display:grid;gap:2px;min-width:0}.petThumb{flex-shrink:0;width:32px;height:32px;border-radius:9px;object-fit:cover;background:#eaf8fd;color:#4da8da}.petThumbFallback{display:grid;place-items:center}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #e6f1f5;text-align:left;white-space:nowrap}td small{display:block;color:#72838c}.queuePetCell{display:flex;align-items:center;gap:10px}.late{color:#d88416!important}.petcount{color:#318fbe!important;font-weight:700}.pill{padding:5px 9px;border-radius:999px;background:#eaf7fb;font-size:12px}.serving{background:#e7f7ed;color:#26754a}.waiting{background:#fff5d9;color:#9a7015}.actions{display:flex;gap:6px}.serve-btn{background:#4DA8DA!important;color:#fff!important;border:0!important;font-weight:700;cursor:pointer}.serve-btn:disabled{opacity:.55;cursor:not-allowed}.template-select{max-width:215px;color:#247ba5;font-weight:700;cursor:pointer}.link{color:#318fbe;cursor:pointer}.link:disabled{opacity:.5;cursor:not-allowed;color:#8fa3ab}@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.filters{display:grid}}`}</style>
 </AppShell>
}
