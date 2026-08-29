import React,{useCallback,useEffect,useMemo,useState}from"react";
import {useNavigate}from"react-router-dom";
import {BrainCircuit,FileText,PawPrint,Pill,Printer,Search,X}from"lucide-react";
import AppShell from"./AppShell";
import ConsultationHealthInsight from"./ConsultationHealthInsight";
import {getQueue,getTodayCheckinAppointments,checkInAppointment,updateQueueStatus,requeueToNextAvailable,subscribeToQueue,getBillingStatusesByEntryIds,QUEUE_STATUSES}from"../services/queueService";
import {getVeterinarians,formatTime,todayLocal}from"../services/appointmentService";
import {formatClockTime,formatDateLong}from"../utils/timeFormat";
import {generateConsultationHealthInsight,getMedicalRecords}from"../services/medicalRecordService";
import {parseConsultationInsight}from"../utils/predictiveHealthParsing";
import {printMedicalRecordDocument,downloadPrescriptionPadPdf}from"../utils/invoicePdf";
import {getPrescriptionsByQueueEntryIds}from"../services/billingService";
import {getMedicalRecordTemplate}from"../constants/medicalRecordTemplates";

function formatPetAge(dateOfBirth){
 if(!dateOfBirth)return "";
 const dob=new Date(`${dateOfBirth}T00:00:00`);
 if(Number.isNaN(dob.getTime()))return "";
 const now=new Date();
 if(dob>now)return "";
 let years=now.getFullYear()-dob.getFullYear();
 let months=now.getMonth()-dob.getMonth();
 if(now.getDate()<dob.getDate())months-=1;
 if(months<0){years-=1;months+=12;}
 const totalMonths=years*12+months;
 if(totalMonths<1)return "Less than a month old";
 const parts=[];
 if(years>0)parts.push(`${years} year${years===1?"":"s"}`);
 if(months>0)parts.push(`${months} month${months===1?"":"s"}`);
 return `${parts.join(", ")} old`;
}

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

// Reflects what Staff has actually done in POS for this consultation's
// visit -- billing_status lives on queue_entries, not medical_records, so
// the History tab looks it up separately (see getBillingStatusesByEntryIds).
const HISTORY_PAGE_SIZE=10;

function billingStatusInfo(status){
 if(status==="Billed")return {label:"Paid",className:"billed"};
 if(status==="Processing")return {label:"Processing Payment",className:"processing"};
 if(status==="Pending Billing")return {label:"Awaiting Payment",className:"pendingbilling"};
 return {label:"—",className:"none"};
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
 // Kept separate from the Live Queue table on purpose -- a queue entry drops
 // off Live Queue as soon as its visit is completed, but a draft saved
 // against it must stay reachable afterward too, so this never depends on
 // which rows are currently visible in `rows`.
 const [drafts,setDrafts]=useState([]);
 const [history,setHistory]=useState([]);
 const [historyBillingStatuses,setHistoryBillingStatuses]=useState({});
 const [historyPrescriptions,setHistoryPrescriptions]=useState({});
 const [historyPage,setHistoryPage]=useState(1);
 const [historySearch,setHistorySearch]=useState("");
 const [queueTab,setQueueTab]=useState("Live Queue");
 const [openInsightId,setOpenInsightId]=useState(null);
 const [insights,setInsights]=useState({});
 const canManage=["admin","staff"].includes(profile?.role);
 const isVet=profile?.role==="veterinarian";
 const navigate=useNavigate();
 function openRecordTemplate(r,resumeRecordId){
  const petIds=(r.pets?.length?r.pets:[{id:r.pet_id,appointmentId:r.appointment_id}]).map(p=>p.id).join(",");
  const appointmentIds=(r.pets?.length?r.pets:[{id:r.pet_id,appointmentId:r.appointment_id}]).map(p=>p.appointmentId||"").join(",");
  const params=new URLSearchParams({queueEntryId:r.id,ownerId:r.owner_id||"",veterinarianId:r.veterinarian_id||"",petIds,appointmentIds});
  if(resumeRecordId)params.set("resumeRecordId",resumeRecordId);
  navigate(`/veterinarian/medical-records?${params.toString()}`);
 }
 // Built straight from the draft record's own columns (queue_entry_id,
 // pet_id, owner_id, veterinarian_id, appointment_id) instead of looking the
 // row up in `rows` -- that's what makes this work even once the visit is no
 // longer in Live Queue.
 function resumeDraft(draft){
  const params=new URLSearchParams({queueEntryId:draft.queue_entry_id||"",ownerId:draft.owner_id||"",veterinarianId:draft.veterinarian_id||"",petIds:draft.pet_id||"",appointmentIds:draft.appointment_id||"",resumeRecordId:draft.id});
  navigate(`/veterinarian/medical-records?${params.toString()}`);
 }
 // Completing a consultation already generates and persists this insight in
 // the background (see MedicalRecordsModule's triggerInsightPersistence), so
 // the common case here is just reading template_data.aiHealthInsight back
 // out -- only calls the AI live as a fallback if that never ran.
 async function loadInsight(record){
  const cached=record.template_data?.aiHealthInsight;
  if(cached){setInsights(current=>({...current,[record.id]:{text:cached,loading:false,error:"",riskLevel:parseConsultationInsight(cached).riskLevel}}));return;}
  setInsights(current=>({...current,[record.id]:{...current[record.id],loading:true,error:""}}));
  try{
   const previousRecords=history.filter(item=>item.id!==record.id&&new Date(item.consultation_date||0)<new Date(record.consultation_date||0));
   const text=await generateConsultationHealthInsight({...record,pet:record.pet},previousRecords);
   const {riskLevel}=parseConsultationInsight(text);
   setInsights(current=>({...current,[record.id]:{text,loading:false,error:"",riskLevel}}));
  }catch(e){
   setInsights(current=>({...current,[record.id]:{text:"",loading:false,error:e.message||"Unable to generate the AI health insight.",riskLevel:null}}));
  }
 }
 function openInsight(record){
  setOpenInsightId(record.id);
  if(insights[record.id])return;
  loadInsight(record);
 }
 async function downloadHistoryPdf(record){
  try{
   await printMedicalRecordDocument(record,{...record.pet,owner:record.owner},{
    veterinarianName:record.veterinarian?.full_name||"",
    veterinarianPhone:record.veterinarian?.phone||"",
    visitDateTime:record.consultation_date?formatDateLong(record.consultation_date):"",
   });
  }catch(e){setError(e.message||"Unable to generate this record's PDF.")}
 }
 function downloadHistoryRx(record){
  const rx=historyPrescriptions[record.id]||historyPrescriptions[record.queue_entry_id]||[];
  if(!rx.length)return;
  try{
   downloadPrescriptionPadPdf(rx,{
    veterinarianName:record.veterinarian?.full_name?`Dr. ${record.veterinarian.full_name}`:"",
    veterinarianPhone:record.veterinarian?.phone||"",
    ownerName:record.owner?.full_name,
    ownerAddress:record.owner?.address,
    petName:record.pet?.pet_name,
    petSpecies:record.pet?.species,
    petBreed:record.pet?.breed,
    petAge:formatPetAge(record.pet?.date_of_birth),
    date:record.consultation_date?formatDateLong(record.consultation_date):"",
   });
  }catch(e){setError(e.message||"Unable to generate the prescription PDF.")}
 }
 const load=useCallback(async()=>{try{setLoading(true);setError("");const vid=profile?.role==="veterinarian"?profile.id:vet;const isVetRole=profile?.role==="veterinarian";const [q,v,a,d,h]=await Promise.all([getQueue({veterinarianId:vid,status}),getVeterinarians(),isVetRole?Promise.resolve([]):getTodayCheckinAppointments(),isVetRole?getMedicalRecords(profile,{status:"Draft"}).catch(()=>[]):Promise.resolve([]),isVetRole?getMedicalRecords(profile,{status:"Finalized"}).catch(()=>[]):Promise.resolve([])]);setRows(q);setVets(v);setAppointments(a);setDrafts(d);setHistory(h);if(isVetRole&&h.length){getBillingStatusesByEntryIds(h.map(r=>r.queue_entry_id)).then(setHistoryBillingStatuses).catch(()=>{});getPrescriptionsByQueueEntryIds(h.map(r=>r.queue_entry_id)).then(setHistoryPrescriptions).catch(()=>{});}else{setHistoryBillingStatuses({});setHistoryPrescriptions({});}}catch(e){setError(e.message)}finally{setLoading(false)}},[profile,vet,status]);
 useEffect(()=>{load();const off=subscribeToQueue(load);return()=>off();},[load]);
 const filteredHistory=useMemo(()=>{
  const keyword=historySearch.trim().toLowerCase();
  if(!keyword)return history;
  return history.filter(record=>[record.pet?.pet_name,record.owner?.full_name,getMedicalRecordTemplate(record.record_template).label].filter(Boolean).some(value=>value.toLowerCase().includes(keyword)));
 },[history,historySearch]);
 // A fresh load, a filter/vet change, or a new search keyword can leave
 // historyPage pointing past the new, shorter result set -- reset to page 1
 // instead of showing a blank page.
 useEffect(()=>{setHistoryPage(1);},[history,historySearch]);
 const historyPageCount=Math.max(1,Math.ceil(filteredHistory.length/HISTORY_PAGE_SIZE));
 const pagedHistory=useMemo(()=>filteredHistory.slice((historyPage-1)*HISTORY_PAGE_SIZE,historyPage*HISTORY_PAGE_SIZE),[filteredHistory,historyPage]);
 // Appointments become due for check-in purely because time has passed, with
 // no database write to trigger the realtime subscription above, so poll too.
 useEffect(()=>{
  if(profile?.role==="veterinarian")return;
  const timer=setInterval(load,60000);
  return ()=>clearInterval(timer);
 },[load,profile?.role]);
 const stats=useMemo(()=>({waiting:rows.filter(r=>r.status==="Waiting").length,serving:rows.filter(r=>r.status==="Serving").length,completed:rows.filter(r=>r.status==="Completed").length,late:rows.filter(r=>r.late_arrival).length,...(isVet?{drafts:drafts.length}:{})}),[rows,isVet,drafts]);
 // Every Confirmed appointment not yet queued is fetched; staff pick which
 // date's batch they actually want to see and check in from.
 const checkinAppointments=useMemo(()=>appointments.filter(a=>a.appointment_date===checkinDate),[appointments,checkinDate]);
 // Once the vet marks a ticket Completed it drops off the live queue - it's
 // tracked from the List of Appointments page from there. Selecting
 // "Completed" from the status filter still shows it on request.
 const tableRows=useMemo(()=>{
  const base=status==="Completed"?rows:rows.filter(r=>r.status!=="Completed");
  // A ticket only reaches the veterinarian's queue once staff clicks Serving.
  return isVet?base.filter(r=>r.status==="Serving"):base;
 },[rows,status,isVet]);
 // Best-effort only -- a draft's visit may have already dropped out of
 // `rows` (Completed, or simply not today's date range), in which case this
 // just comes back empty and the Drafts table shows "—" for that row.
 const queueNumberByEntryId=useMemo(()=>Object.fromEntries(rows.map(r=>[r.id,r.queue_number])),[rows]);
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
  <div className="card">
   {isVet?<div className="queue-tabs queue-tabs-3" role="tablist" aria-label="Queue view">
     <div className="queue-tabs-slider" style={{left:queueTab==="Live Queue"?"0%":queueTab==="Drafts"?"33.3333%":"66.6667%"}}/>
     <button type="button" role="tab" aria-selected={queueTab==="Live Queue"} className={`queue-tab${queueTab==="Live Queue"?" active":""}`} onClick={()=>setQueueTab("Live Queue")}>Live Queue</button>
     <button type="button" role="tab" aria-selected={queueTab==="Drafts"} className={`queue-tab${queueTab==="Drafts"?" active":""}`} onClick={()=>setQueueTab("Drafts")}>Drafts{drafts.length>0&&<span className="drafts-badge">{drafts.length}</span>}</button>
     <button type="button" role="tab" aria-selected={queueTab==="History"} className={`queue-tab${queueTab==="History"?" active":""}`} onClick={()=>setQueueTab("History")}>History</button>
    </div>:<h3>Live queue</h3>}

   {(!isVet||queueTab==="Live Queue")&&(loading?<p>Loading queue…</p>:tableRows.length===0?<p>No queue entries today.</p>:<div className="table"><table><thead><tr><th>No.</th><th>Pet</th><th>Veterinarian</th><th>Time</th><th>Status</th><th>Ahead / ETA</th><th>Actions</th></tr></thead><tbody>{tableRows.map(r=><tr key={r.id}><td><b>{r.queue_number}</b>{r.late_arrival&&<small className="late">Late Arrival</small>}</td><td><div className="queuePetCell"><PetThumb pet={r.pet}/><div>{r.pets?.length?r.pets.map(p=>p.pet_name).join(", "):(r.pet?.pet_name||"—")}{r.pets?.length>1&&<small className="petcount">{r.pets.length} pets · {r.visitDurationMinutes} min</small>}<small>{r.owner?.full_name||""}</small></div></div></td><td>{r.veterinarian?.full_name||"—"}</td><td>{bookingTime(r)}</td><td><span className={`pill ${r.status.replaceAll(" ","").toLowerCase()}`}>{r.status}</span></td><td>{r.clientsAhead??0} ahead<br/><small>~{r.estimatedWaitMinutes??0} min</small></td><td>
    {canManage&&<div className="actions">
     <button className="serve-btn" disabled={r.status!=="Waiting"||updatingId===r.id} onClick={()=>act(r.id,()=>updateQueueStatus(r.id,"Serving",profile),"Marked as serving.")}>{updatingId===r.id?"Updating…":"Serving"}</button>
     <button className="link" disabled={r.status!=="Waiting"||updatingId===r.id} onClick={()=>act(r.id,()=>requeueToNextAvailable(r.id,profile),time=>`Re-queued to ${formatTime(time)}.`)}>Re-queue</button>
    </div>}
    {isVet&&<div className="actions">
     {r.billing_status&&r.billing_status!=="Not Applicable"?
      <button className="serve-btn completed-btn" disabled>Completed</button>:
      <button className="create-record-btn" disabled={r.status!=="Serving"} onClick={()=>openRecordTemplate(r)}><FileText size={15}/>Create Medical Record</button>}
    </div>}
   </td></tr>)}</tbody></table></div>)}

   {isVet&&queueTab==="Drafts"&&(drafts.length===0?<p className="drafts-empty">No drafts saved yet. A template you switch away from before finishing gets saved here automatically.</p>:
    <div className="table"><table><thead><tr><th>No.</th><th>Pet</th><th>Veterinarian</th><th>Template</th><th>Last Saved</th><th>Actions</th></tr></thead><tbody>
     {drafts.map(draft=><tr key={draft.id}>
      <td><b>{queueNumberByEntryId[draft.queue_entry_id]||"—"}</b></td>
      <td><div className="queuePetCell"><PetThumb pet={draft.pet}/><div>{draft.pet?.pet_name||"Pet"}<small>{draft.owner?.full_name||""}</small></div></div></td>
      <td>{draft.veterinarian?.full_name?`Dr. ${draft.veterinarian.full_name}`:"—"}</td>
      <td>{getMedicalRecordTemplate(draft.record_template).label}</td>
      <td>{formatClockTime(draft.updated_at||draft.created_at)}</td>
      <td><div className="actions"><button type="button" className="create-record-btn" onClick={()=>resumeDraft(draft)}><FileText size={15}/>Continue</button></div></td>
     </tr>)}
    </tbody></table></div>)}

   {isVet&&queueTab==="History"&&(history.length===0?<p className="drafts-empty">No finalized medical records yet.</p>:
    <>
    <div className="history-search"><Search size={15}/><input type="text" placeholder="Search by pet, owner, or template…" value={historySearch} onChange={e=>setHistorySearch(e.target.value)}/></div>
    {filteredHistory.length===0?<p className="drafts-empty">No records match your search.</p>:<>
    <div className="table"><table><thead><tr><th>Status</th><th>Pet</th><th>Date</th><th>Template</th><th>Actions</th></tr></thead><tbody>
     {pagedHistory.map(record=>{const billing=billingStatusInfo(historyBillingStatuses[record.queue_entry_id]);const rx=historyPrescriptions[record.id]||historyPrescriptions[record.queue_entry_id]||[];return <tr key={record.id}>
      <td><span className={`pill billingstatus-${billing.className}`}>{billing.label}</span></td>
      <td><div className="queuePetCell"><PetThumb pet={record.pet}/><div>{record.pet?.pet_name||"Pet"}<small>{record.owner?.full_name||""}</small></div></div></td>
      <td>{formatDateLong(record.consultation_date)}</td>
      <td>{getMedicalRecordTemplate(record.record_template).label}</td>
      <td><div className="actions">
       <button type="button" className="history-pdf-btn" title="Download PDF" onClick={()=>downloadHistoryPdf(record)}><Printer size={14}/>PDF</button>
       <button type="button" className="history-insight-btn" title="View AI Insight" onClick={()=>openInsight(record)}><BrainCircuit size={14}/>AI Insight{insights[record.id]?.riskLevel&&<span className={`insight-risk-badge risk-${insights[record.id].riskLevel.toLowerCase()}`}>{insights[record.id].riskLevel}</span>}</button>
       {rx.length>0?
        <button type="button" className="history-pdf-btn" title="Download Prescription PDF" onClick={()=>downloadHistoryRx(record)}><Pill size={14}/>Rx PDF</button>:
        <span className="history-no-rx"><Pill size={13}/>No Prescription Given</span>}
      </div></td>
     </tr>;})}
    </tbody></table></div>
    {historyPageCount>1&&<div className="pagination">
     <button type="button" disabled={historyPage===1} onClick={()=>setHistoryPage(p=>p-1)}>Previous</button>
     <span>Page {historyPage} of {historyPageCount}</span>
     <button type="button" disabled={historyPage===historyPageCount} onClick={()=>setHistoryPage(p=>p+1)}>Next</button>
    </div>}
    </>}
    </>)}
  </div>

  {openInsightId&&(()=>{
   const record=history.find(item=>item.id===openInsightId);
   if(!record)return null;
   return <div className="insight-modal-backdrop" onClick={()=>setOpenInsightId(null)}>
    <div className="insight-modal" onClick={e=>e.stopPropagation()}>
     <button type="button" className="insight-modal-close" aria-label="Close" onClick={()=>setOpenInsightId(null)}><X size={18}/></button>
     <div className="insight-modal-head">
      <BrainCircuit size={28}/>
      <div>
       <p className="insight-modal-eyebrow">AI Health Insight — {getMedicalRecordTemplate(record.record_template).label}</p>
       <h3>{record.pet?.pet_name||"Pet"} · {formatDateLong(record.consultation_date)}</h3>
      </div>
     </div>
     <ConsultationHealthInsight
      isFinalized={record.record_status==="Finalized"}
      insightText={insights[record.id]?.text}
      loading={insights[record.id]?.loading}
      error={insights[record.id]?.error}
      onRetry={()=>loadInsight(record)}
     />
    </div>
   </div>;
  })()}

  <style>{`.ok,.err{padding:12px 15px;border-radius:12px;margin-bottom:14px}.ok{background:#e9f8ef;color:#26754a}.err{background:#fff0f0;color:#b34b4b}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:16px}.stat{background:#fff;border-radius:16px;padding:18px;box-shadow:0 7px 20px #d9edf5}.stat strong{display:block;font-size:27px;color:#318fbe;text-transform:capitalize}.stat span{text-transform:capitalize;color:#6f7f88}.filters{display:flex;gap:10px;margin-bottom:16px}.filters select,.filters button,.actions button,.actions select{padding:10px;border:1px solid #d4e9f1;border-radius:10px;background:#fff}.filters button,.appt button{background:#4DA8DA;color:#fff;border:0}.appt button:disabled,.create-record-btn:disabled{opacity:.65;cursor:not-allowed}.apptHead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:10px}.apptHead h3{margin:0}.apptDatePick{display:flex;align-items:center;gap:8px;font-size:13px;color:#6f7f88;font-weight:700}.apptDatePick input{padding:8px 10px;border:1px solid #d4e9f1;border-radius:10px;background:#fff}.apptEmpty{color:#72838c;margin:0}.apptgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.appt{border:1px solid #e2f0f5;border-radius:12px;padding:12px;display:grid;gap:8px}.apptTop{display:flex;align-items:center;gap:10px;min-width:0}.apptInfo{display:grid;gap:2px;min-width:0}.petThumb{flex-shrink:0;width:32px;height:32px;border-radius:9px;object-fit:cover;background:#eaf8fd;color:#4da8da}.petThumbFallback{display:grid;place-items:center}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #e6f1f5;text-align:left;white-space:nowrap}td small{display:block;color:#72838c}.queuePetCell{display:flex;align-items:center;gap:10px}.late{color:#d88416!important}.petcount{color:#318fbe!important;font-weight:700}.pill{padding:5px 9px;border-radius:999px;background:#eaf7fb;font-size:12px}.billingstatus-billed{background:#e7f7ed;color:#26754a;font-weight:700}.billingstatus-processing{background:#e7f0ff;color:#2c5ab5;font-weight:700}.billingstatus-pendingbilling{background:#fff6e0;color:#9a7000;font-weight:700}.billingstatus-none{background:#eef1f4;color:#5b6b76;font-weight:700}.serving{background:#e7f7ed;color:#26754a}.waiting{background:#fff5d9;color:#9a7015}.actions{display:flex;gap:6px}.serve-btn{background:#4DA8DA!important;color:#fff!important;border:0!important;font-weight:700;cursor:pointer}.serve-btn:disabled{opacity:.55;cursor:not-allowed}.create-record-btn{display:inline-flex;align-items:center;gap:6px;background:#4DA8DA!important;color:#fff!important;border:0!important;padding:10px 14px!important;font-weight:700;cursor:pointer;white-space:nowrap}.link{color:#318fbe;cursor:pointer}.link:disabled{opacity:.5;cursor:not-allowed;color:#8fa3ab}.queue-tabs{position:relative;display:flex;margin-bottom:16px;padding:4px;border-radius:12px;background:#eaf3f7}.queue-tabs-slider{position:absolute;top:4px;bottom:4px;width:calc(50% - 4px);border-radius:9px;background:#fff;box-shadow:0 2px 6px rgba(33,105,127,.18);transition:left .22s ease}.queue-tabs-3 .queue-tabs-slider{width:calc(33.3333% - 4px)}.queue-tab{position:relative;z-index:1;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:none;padding:11px 10px;font-weight:700;font-size:13.5px;color:#6f8792;cursor:pointer}.queue-tab.active{color:#17445a}.drafts-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#9a7000;color:#fff;font-size:10px}.drafts-empty{color:#72838c;margin:0}.history-pdf-btn,.history-insight-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid #cfe2ea;background:#fff;border-radius:9px;padding:8px 10px;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap}.history-pdf-btn{color:#257fa9}.history-insight-btn{color:#17445a}.history-pdf-btn:hover,.history-insight-btn:hover{background:#f2f9fc}.history-no-rx{display:inline-flex;align-items:center;gap:5px;border:1px solid #f2dfa0;background:#fff6e0;color:#8a6d00;border-radius:9px;padding:8px 10px;font-weight:800;font-size:12px;white-space:nowrap}.pagination{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:14px;padding-top:14px;border-top:1px solid #e6f1f5}.pagination button{padding:8px 16px;border:1px solid #d4e9f1;border-radius:9px;background:#fff;color:#267da3;font-weight:700;font-size:13px;cursor:pointer}.pagination button:disabled{opacity:.5;cursor:not-allowed}.pagination span{color:#6f7f88;font-size:13px;font-weight:600}.history-search{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:0 13px;border:1px solid #d4e9f1;border-radius:10px;background:#f8fcfe;color:#7c8c94}.history-search input{flex:1;height:42px;border:0;background:transparent;outline:none;font:inherit;color:#20313b}.insight-risk-badge{margin-left:6px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap}.insight-risk-badge.risk-low{background:#e5f4ea;color:#2f8f5b}.insight-risk-badge.risk-moderate{background:#fdf1dc;color:#a5680b}.insight-risk-badge.risk-high{background:#fbe6e4;color:#c0392b}.insight-modal-backdrop{position:fixed;inset:0;background:rgba(24,47,59,.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}.insight-modal{position:relative;width:min(780px,100%);max-height:85vh;overflow-y:auto;background:#fff;border-radius:16px;padding:26px;box-shadow:0 20px 48px rgba(17,48,63,.28)}.insight-modal-close{position:absolute;top:14px;right:14px;border:0;background:#eef7fa;color:#183642;border-radius:50%;width:32px;height:32px;display:grid;place-items:center;cursor:pointer}.insight-modal-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-right:30px;color:#4da8da}.insight-modal-eyebrow{margin:0 0 2px;color:#6f8792;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.insight-modal-head h3{margin:0;color:#17445a;font-size:19px}@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.filters{display:grid}}`}</style>
 </AppShell>
}
