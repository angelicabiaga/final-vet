import React,{useCallback,useEffect,useMemo,useState}from"react";
import AppShell from"./AppShell";
import {getQueue,getTodayCheckinAppointments,checkInAppointment,updateQueueStatus,reorderQueue,subscribeToQueue,QUEUE_STATUSES}from"../services/queueService";
import {getVeterinarians,formatTime}from"../services/appointmentService";

export default function QueueManagementModule({profile,mode="staff"}){
 const [rows,setRows]=useState([]),[appointments,setAppointments]=useState([]),[vets,setVets]=useState([]),[vet,setVet]=useState(""),[status,setStatus]=useState(""),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[error,setError]=useState(""),[checkingIn,setCheckingIn]=useState(null);
 const canManage=["admin","staff"].includes(profile?.role);
 const nextStatus=current=>current==="Waiting"?"Serving":current==="Serving"?"Completed":null;
 const load=useCallback(async()=>{try{setLoading(true);setError("");const vid=profile?.role==="veterinarian"?profile.id:vet;const [q,v,a]=await Promise.all([getQueue({veterinarianId:vid,status}),getVeterinarians(),profile?.role==="veterinarian"?Promise.resolve([]):getTodayCheckinAppointments()]);setRows(q);setVets(v);setAppointments(a);}catch(e){setError(e.message)}finally{setLoading(false)}},[profile,vet,status]);
 useEffect(()=>{load();const off=subscribeToQueue(load);return()=>off();},[load]);
 const stats=useMemo(()=>({waiting:rows.filter(r=>r.status==="Waiting").length,serving:rows.filter(r=>r.status==="Serving").length,completed:rows.filter(r=>r.status==="Completed").length,late:rows.filter(r=>r.late_arrival).length}),[rows]);
 async function act(fn,ok){try{setError("");await fn();setMessage(ok);await load()}catch(e){setError(e.message)}}
 async function handleCheckIn(appointment){
  if(checkingIn)return;
  try{
   setCheckingIn(appointment.appointment_id);
   setError("");
   await checkInAppointment({...appointment,id:appointment.appointment_id},profile);
   setAppointments(current=>current.filter(item=>item.appointment_id!==appointment.appointment_id));
   setMessage("Appointment checked in and added to the queue.");
   await load();
  }catch(e){setError(e.message)}finally{setCheckingIn(null)}
 }
 return <AppShell profile={profile} title={profile?.role==="veterinarian"?"My Queue":"Queue Management"}>
  {message&&<div className="ok">{message}</div>}{error&&<div className="err">{error}</div>}
  <div className="stats">{Object.entries(stats).map(([k,v])=><div className="stat" key={k}><strong>{v}</strong><span>{k}</span></div>)}</div>
  {profile?.role!=="veterinarian"&&<div className="card filters"><select value={vet} onChange={e=>setVet(e.target.value)}><option value="">All veterinarians</option>{vets.map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{QUEUE_STATUSES.map(s=><option key={s}>{s}</option>)}</select><button onClick={load}>Refresh</button></div>}
  {profile?.role!=="veterinarian"&&appointments.length>0&&<div className="card"><h3>Today's appointments ready for check-in</h3><div className="apptgrid">{appointments.map(a=><div className="appt" key={a.appointment_id}><b>{a.pet?.pet_name||"Pet"}</b><span>{formatTime(a.start_time)} · {a.veterinarian?.full_name||"Veterinarian"}</span><button disabled={checkingIn===a.appointment_id} onClick={()=>handleCheckIn(a)}>{checkingIn===a.appointment_id?"Checking In...":"Check In"}</button></div>)}</div></div>}
  <div className="card"><h3>Live queue</h3>{loading?<p>Loading queue…</p>:rows.length===0?<p>No queue entries today.</p>:<div className="table"><table><thead><tr><th>No.</th><th>Pet</th><th>Veterinarian</th><th>Source</th><th>Status</th><th>Ahead / ETA</th><th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.queue_number}</b>{r.late_arrival&&<small className="late">Late Arrival</small>}</td><td>{r.pet?.pet_name||"—"}<small>{r.owner?.full_name||""}</small></td><td>{r.veterinarian?.full_name||"—"}</td><td>{r.source}</td><td><span className={`pill ${r.status.replaceAll(" ","").toLowerCase()}`}>{r.status}</span></td><td>{r.clientsAhead??0} ahead<br/><small>~{r.estimatedWaitMinutes??0} min</small></td><td>{canManage&&<div className="actions"><select value="" disabled={!nextStatus(r.status)} onChange={e=>e.target.value&&act(()=>updateQueueStatus(r.id,e.target.value,profile),"Queue updated.")}><option value="">{nextStatus(r.status)?`Mark as ${nextStatus(r.status)}`:"Completed"}</option>{nextStatus(r.status)&&<option value={nextStatus(r.status)}>{nextStatus(r.status)}</option>}</select>{profile?.role!=="veterinarian"&&<button className="link" onClick={()=>{const order=prompt("Manual order number:",r.manual_order||1);if(!order)return;const reason=prompt("Required reason:");if(!reason)return;act(()=>reorderQueue(r.id,order,reason,profile),"Queue reordered.")}}>Reorder</button>}</div>}</td></tr>)}</tbody></table></div>}</div>
  <style>{`.ok,.err{padding:12px 15px;border-radius:12px;margin-bottom:14px}.ok{background:#e9f8ef;color:#26754a}.err{background:#fff0f0;color:#b34b4b}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.stat{background:#fff;border-radius:16px;padding:18px;box-shadow:0 7px 20px #d9edf5}.stat strong{display:block;font-size:27px;color:#318fbe;text-transform:capitalize}.stat span{text-transform:capitalize;color:#6f7f88}.filters{display:flex;gap:10px;margin-bottom:16px}.filters select,.filters button,.actions select,.actions button{padding:10px;border:1px solid #d4e9f1;border-radius:10px;background:#fff}.filters button,.appt button{background:#4DA8DA;color:#fff;border:0}.appt button:disabled{opacity:.65;cursor:not-allowed}.apptgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.appt{border:1px solid #e2f0f5;border-radius:12px;padding:12px;display:grid;gap:8px}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #e6f1f5;text-align:left;white-space:nowrap}td small{display:block;color:#72838c}.late{color:#d88416!important}.pill{padding:5px 9px;border-radius:999px;background:#eaf7fb;font-size:12px}.serving{background:#e7f7ed;color:#26754a}.waiting{background:#fff5d9;color:#9a7015}.actions{display:flex;gap:6px}.link{color:#318fbe}@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.filters{display:grid}}`}</style>
 </AppShell>
}
