import React,{useCallback,useEffect,useMemo,useState}from"react";
import {useNavigate}from"react-router-dom";
import {BrainCircuit,FileText,MapPin,PawPrint,Pill,Play,Printer,RotateCcw,Search,TriangleAlert,UserCog,X}from"lucide-react";
import AppShell from"./AppShell";
import ConsultationHealthInsight from"./ConsultationHealthInsight";
import {getQueue,getTodayCheckinAppointments,checkInAppointment,updateQueueStatus,requeueToNextAvailable,subscribeToQueue,getBillingStatusesByEntryIds,QUEUE_STATUSES}from"../services/queueService";
import {getVeterinarians,formatTime,todayLocal}from"../services/appointmentService";
import {getPendingDoctorOffers,getQueueDoctorAlerts,respondDoctorOffer,withdrawDoctorOffer}from"../services/doctorChangeService";
import DoctorChangeModal from"./DoctorChangeModal";
import {drName}from"./VetLeaveImpact";
import {withDrTitle}from"../utils/vetName";
import {formatClockTime,formatDateLong}from"../utils/timeFormat";
import {generateConsultationHealthInsight,getMedicalRecords}from"../services/medicalRecordService";
import {parseConsultationInsight}from"../utils/predictiveHealthParsing";
import {printMedicalRecordDocument,downloadPrescriptionPadPdf}from"../utils/invoicePdf";
import {getPrescriptionsByQueueEntryIds}from"../services/billingService";
import {getMedicalRecordTemplate}from"../constants/medicalRecordTemplates";
import PrintPreviewModal from"./PrintPreviewModal";
import usePrintPreview from"../hooks/usePrintPreview";

// The physical spot a patient is at right now, derived straight from their
// existing queue status rather than a separate field to keep in sync --
// Waiting patients are out front with staff, Serving patients are with
// the vet, Completed ones have already checked out.
function stationLabel(status){
  if(status==="Serving")return"Veterinary Station";
  if(status==="Completed")return"Checked Out";
  return"Staff Station";
}

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

function nowHHMM(){
 const now=new Date();
 return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
}

// A pending doctor change whose offered time has already passed.
function offerExpired(offer){
 const today=todayLocal();
 return offer.offer_date<today||(offer.offer_date===today&&String(offer.proposed_time).slice(0,5)<=nowHHMM());
}

const petNamesOf=item=>item.pets?.length?item.pets.map(p=>p.pet_name).join(", "):(item.pet?.pet_name||"Pet");

// The red note on a card or ticket whose doctor can't see the visit, e.g.
// "Dr. Neil ... is not available today (on leave)." `problem` comes from the
// database (get_queue_doctor_alerts).
function unavailableNote(name,problem,date,time){
 const dr=drName(name),today=date===todayLocal(),day=today?"today":`on ${formatApptDate(date)}`;
 if(/^on leave/i.test(problem))return `${dr} is not available ${day} (on leave).`;
 if(/^not on duty/i.test(problem))return `${dr} is not available ${day}.`;
 const late=!time||(today&&String(time).slice(0,5)<nowHHMM());
 const hours=problem.replace(/^only on duty\s*/i,"").replace(/\s*\(leave\)\s*$/i,"");
 return `${dr} is not available ${late?"right now":`at ${formatTime(time)} ${day}`}${/\(leave\)/i.test(problem)?" (on leave)":""}. On duty ${hours} only.`;
}

// Short form of unavailableNote for the queue table: a headline plus the
// on-duty hours, e.g. "Off duty now" / "On duty 9:00 AM – 5:00 PM".
function unavailableTag(problem,date,time){
 const today=date===todayLocal(),day=today?"today":formatApptDate(date);
 if(/^on leave/i.test(problem))return {headline:`On leave ${day}`,detail:""};
 if(/^not on duty/i.test(problem))return {headline:`Not on duty ${day}`,detail:""};
 const late=!time||(today&&String(time).slice(0,5)<nowHHMM());
 const hours=problem.replace(/^only on duty\s*/i,"").replace(/\s*\(leave\)\s*$/i,"");
 const leave=/\(leave\)/i.test(problem)?" (on leave)":"";
 return {headline:`${late?"Off duty now":`Off duty at ${formatTime(time)}`}${leave}`,detail:`On duty ${hours}`};
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
 const printPreview=usePrintPreview();
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
 // Doctor changes wait for the owner's confirmation (DoctorChangeModal,
 // QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql): the pending offers, and which
 // check-in cards / tickets have a doctor who can't see them as booked.
 const [changeTarget,setChangeTarget]=useState(null);
 const [offers,setOffers]=useState([]);
 const [petInfoCard,setPetInfoCard]=useState(null);
 const [doctorAlerts,setDoctorAlerts]=useState({appointments:[],queue:[]});
 const canManage=["admin","staff"].includes(profile?.role);
 const isVet=profile?.role==="veterinarian";
 const navigate=useNavigate();
 function openRecordTemplate(r,resumeRecordId){
  const petIds=(r.pets?.length?r.pets:[{id:r.pet_id,appointmentId:r.appointment_id}]).map(p=>p.id).join(",");
  const appointmentIds=(r.pets?.length?r.pets:[{id:r.pet_id,appointmentId:r.appointment_id}]).map(p=>p.appointmentId||"").join(",");
  const params=new URLSearchParams({queueEntryId:r.id,ownerId:r.owner_id||"",veterinarianId:r.veterinarian_id||"",originalVeterinarianId:r.original_veterinarian_id||"",petIds,appointmentIds});
  if(resumeRecordId)params.set("resumeRecordId",resumeRecordId);
  navigate(`/veterinarian/medical-records?${params.toString()}`);
 }
 // Built straight from the draft record's own columns (queue_entry_id,
 // pet_id, owner_id, veterinarian_id, appointment_id) instead of looking the
 // row up in `rows` -- that's what makes this work even once the visit is no
 // longer in Live Queue. While the visit is still live, though, its row is
 // used so a multi-pet visit keeps every pet -- otherwise Complete on the
 // draft's pet would finalize and bill the visit before the others are charted.
 function resumeDraft(draft){
  const liveRow=rows.find(r=>r.id===draft.queue_entry_id);
  if(liveRow){openRecordTemplate(liveRow,draft.id);return;}
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
   const url=await printMedicalRecordDocument(record,{...record.pet,owner:record.owner},{
    veterinarianName:record.veterinarian?.full_name||"",
    veterinarianPhone:record.veterinarian?.phone||"",
    visitDateTime:record.consultation_date?formatDateLong(record.consultation_date):"",
   });
   printPreview.showPdf(url,"Print Medical Record");
  }catch(e){setError(e.message||"Unable to generate this record's PDF.")}
 }
 function downloadHistoryRx(record){
  const rx=historyPrescriptions[record.id]||historyPrescriptions[record.queue_entry_id]||[];
  if(!rx.length)return;
  try{
   const {url,download}=downloadPrescriptionPadPdf(rx,{
    veterinarianName:withDrTitle(record.veterinarian?.full_name),
    veterinarianPhone:record.veterinarian?.phone||"",
    ownerName:record.owner?.full_name,
    ownerAddress:record.owner?.address,
    petName:record.pet?.pet_name,
    petSpecies:record.pet?.species,
    petBreed:record.pet?.breed,
    petAge:formatPetAge(record.pet?.date_of_birth),
    date:record.consultation_date?formatDateLong(record.consultation_date):"",
   });
   printPreview.showPdf(url,"Prescription",{onDownload:download,showPrint:false});
  }catch(e){setError(e.message||"Unable to generate the prescription PDF.")}
 }
 const load=useCallback(async()=>{try{setLoading(true);setError("");const vid=profile?.role==="veterinarian"?profile.id:vet;const isVetRole=profile?.role==="veterinarian";const [q,v,a,d,h]=await Promise.all([getQueue({veterinarianId:vid,status}),getVeterinarians(),isVetRole?Promise.resolve([]):getTodayCheckinAppointments(),isVetRole?getMedicalRecords(profile,{status:"Draft"}).catch(()=>[]):Promise.resolve([]),isVetRole?getMedicalRecords(profile,{status:"Finalized"}).catch(()=>[]):Promise.resolve([])]);setRows(q);setVets(v);setAppointments(a);setDrafts(d);setHistory(h);if(!isVetRole){const [o,al]=await Promise.all([getPendingDoctorOffers().catch(()=>[]),getQueueDoctorAlerts(checkinDate).catch(()=>({appointments:[],queue:[]}))]);setOffers(o);setDoctorAlerts(al);}if(isVetRole&&h.length){getBillingStatusesByEntryIds(h.map(r=>r.queue_entry_id)).then(setHistoryBillingStatuses).catch(()=>{});getPrescriptionsByQueueEntryIds(h.map(r=>r.queue_entry_id)).then(setHistoryPrescriptions).catch(()=>{});}else{setHistoryBillingStatuses({});setHistoryPrescriptions({});}}catch(e){setError(e.message)}finally{setLoading(false)}},[profile,vet,status,checkinDate]);
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
 const stats=useMemo(()=>({waiting:rows.filter(r=>r.status==="Waiting"&&!r.doctor_offer_id).length,serving:rows.filter(r=>r.status==="Serving").length,completed:rows.filter(r=>r.status==="Completed").length,late:rows.filter(r=>r.late_arrival).length,...(isVet?{drafts:drafts.length}:{"awaiting owner":offers.length})}),[rows,isVet,drafts,offers]);
 // Every Confirmed appointment not yet queued is fetched; staff pick which
 // date's batch they actually want to see and check in from.
 const checkinAppointments=useMemo(()=>appointments.filter(a=>a.appointment_date===checkinDate),[appointments,checkinDate]);
 // Once the vet marks a ticket Completed it drops off the live queue - it's
 // tracked from the List of Appointments page from there. Selecting
 // "Completed" from the status filter still shows it on request.
 const tableRows=useMemo(()=>{
  const base=status==="Completed"?rows:rows.filter(r=>r.status!=="Completed");
  // A ticket only reaches the veterinarian's queue once staff clicks Serving.
  // A ticket waiting for the owner to confirm a new doctor is on hold and
  // only returns once they confirm.
  return isVet?base.filter(r=>r.status==="Serving"):base.filter(r=>!r.doctor_offer_id);
 },[rows,status,isVet]);
 // Only the earliest "Serving" ticket gets the ongoing highlight -- if more
 // than one row happens to carry that status at once, the rest still show
 // the plain "Serving" label without the extra emphasis.
 const firstServingId=useMemo(()=>tableRows.find(r=>r.status==="Serving")?.id,[tableRows]);
 // A vet only ever has one active patient -- once staff marks one ticket
 // Serving, every other Waiting ticket for that same vet stays Waiting
 // (its own "Serving" button is disabled) until that one is Completed.
 const vetsCurrentlyServing=useMemo(()=>new Set(rows.filter(r=>r.status==="Serving").map(r=>r.veterinarian_id)),[rows]);
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
 function cardOffer(card){
  const ids=card.appointmentIds||[card.id];
  return offers.find(o=>!o.queue_entry_id&&(o.appointment_ids||[]).some(id=>ids.includes(id)));
 }
 function cardProblem(card){
  const ids=card.appointmentIds||[card.id];
  return (doctorAlerts.appointments||[]).find(item=>ids.includes(item.appointment_id))?.problem||"";
 }
 function confirmForOwner(offer){
  const checksIn=offer.queue_entry_id||offer.offer_date===todayLocal();
  act(offer.id,()=>respondDoctorOffer(offer.id,profile.id,"confirm"),checksIn?"Confirmed for the owner. The visit is in the Live Queue with the new doctor.":"Confirmed for the owner.");
 }
 function withdrawOffer(offer){
  act(offer.id,()=>withdrawDoctorOffer(offer.id,profile.id),"Doctor change withdrawn. The owner was notified.");
 }
 function queueProblem(r){
  return (doctorAlerts.queue||[]).find(item=>item.queue_entry_id===r.id)?.problem||"";
 }
 // Waiting tickets in the Live Queue can always be reassigned; a check-in
 // card is checked in as usual. Only when its doctor can't see the visit
 // (leave, emergency, outside their hours) does it show the red note and
 // Change doctor instead; while the owner decides, it waits for them.
 function renderCheckinActions(a){
  const offer=cardOffer(a),problem=cardProblem(a);
  if(offer)return <div className="checkin-actions">
   <p className="doc-pending">Waiting for the owner to confirm {drName(offer.proposed_veterinarian?.full_name)} at {formatTime(offer.proposed_time)}{offerExpired(offer)?" (time passed)":""}.</p>
   <div className="checkin-buttons">
    <button type="button" className="doc-btn" disabled={updatingId===offer.id||offerExpired(offer)} onClick={()=>confirmForOwner(offer)}>Confirm for owner</button>
    <button type="button" className="doc-btn doc-btn-ghost" disabled={updatingId===offer.id} onClick={()=>withdrawOffer(offer)}>Withdraw</button>
   </div>
  </div>;
  return <div className="checkin-actions">
   {problem&&<p className="doc-unavailable"><TriangleAlert size={14}/> {unavailableNote(a.veterinarian?.full_name,problem,a.appointment_date,a.start_time)}</p>}
   <div className="checkin-buttons">
    {problem
     ?<button type="button" className="doc-btn doc-btn-change" onClick={()=>setChangeTarget({appointmentIds:a.appointmentIds||[a.id],label:petNamesOf(a),petNames:petNamesOf(a)})}><UserCog size={14}/> Change doctor</button>
     :<button type="button" className="doc-btn" disabled={checkingIn===a.id} onClick={()=>handleCheckIn(a)}>{checkingIn===a.id?"Checking In...":"Check In"}</button>}
   </div>
  </div>;
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
 return <AppShell profile={profile} title={profile?.role==="veterinarian"?"Queue":"Queue Management"}>
  {message&&<div className="ok">{message}</div>}{error&&<div className="err">{error}</div>}
  <div className="stats">{Object.entries(stats).map(([k,v])=><div className="stat" key={k}><strong>{v}</strong><span>{k}</span></div>)}</div>
  {profile?.role!=="veterinarian"&&<div className="card filters"><select value={vet} onChange={e=>setVet(e.target.value)}><option value="">All veterinarians</option>{vets.map(v=><option key={v.id} value={v.id}>{v.full_name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{QUEUE_STATUSES.map(s=><option key={s}>{s}</option>)}</select><button onClick={load}>Refresh</button></div>}
  {profile?.role!=="veterinarian"&&<div className="card"><div className="apptHead"><h3>Appointments ready for check-in</h3><label className="apptDatePick">Date<input type="date" value={checkinDate} onChange={e=>setCheckinDate(e.target.value)}/></label></div>{checkinAppointments.length===0?<p className="apptEmpty">No appointments to check in for {formatApptDate(checkinDate)}.</p>:<div className="apptgrid">{checkinAppointments.map(a=>{const onHold=Boolean(cardOffer(a)),flagged=!onHold&&Boolean(cardProblem(a));return <div className={`appt${flagged?" appt-flagged":""}${onHold?" appt-onhold":""}`} key={a.id}><button type="button" className="apptTop apptTopBtn" title="View pet details" onClick={()=>setPetInfoCard(a)}><PetThumb pet={a.pet}/><div className="apptInfo"><b>{petNamesOf(a)}</b><span>{formatApptDate(a.appointment_date)} · {a.veterinarian?.full_name?drName(a.veterinarian.full_name):"Veterinarian"}</span>{a.pets?.length>1&&<small>{a.pets.length} pets · {a.visitDurationMinutes} min</small>}</div><span className="apptTime">{formatTime(a.start_time)}</span></button>{renderCheckinActions(a)}</div>})}</div>}</div>}
  {canManage&&offers.length>0&&<div className="card offers-card"><h3>Waiting for owner confirmation</h3><p className="offers-sub">These visits stay out of the Live Queue until the owner confirms the new doctor in My Queue (web or app). If the owner is here, confirm for them.</p>{offers.map(o=><div className="offer-row" key={o.id}><div className="offer-info"><b>{petNamesOf(o)}</b><small>{o.owner?.full_name||""}{o.queue_entry_id?" · checked in, on hold":" · not checked in yet"}</small><span>{drName(o.original_veterinarian?.full_name)} → <b>{drName(o.proposed_veterinarian?.full_name)}</b> · {formatTime(o.proposed_time)}{o.offer_date!==todayLocal()?` · ${formatApptDate(o.offer_date)}`:""} · {o.reason}</span>{offerExpired(o)&&<em>The offered time has passed. Withdraw it and offer a new time.</em>}</div><div className="checkin-buttons"><button type="button" className="doc-btn" disabled={updatingId===o.id||offerExpired(o)} onClick={()=>confirmForOwner(o)}>Confirm for owner</button><button type="button" className="doc-btn doc-btn-ghost" disabled={updatingId===o.id} onClick={()=>withdrawOffer(o)}>Withdraw</button></div></div>)}</div>}
  <div className="card">
   {isVet?<div className="queue-tabs queue-tabs-3" role="tablist" aria-label="Queue view">
     <div className="queue-tabs-slider" style={{left:queueTab==="Live Queue"?"0%":queueTab==="Drafts"?"33.3333%":"66.6667%"}}/>
     <button type="button" role="tab" aria-selected={queueTab==="Live Queue"} className={`queue-tab${queueTab==="Live Queue"?" active":""}`} onClick={()=>setQueueTab("Live Queue")}>Live Queue</button>
     <button type="button" role="tab" aria-selected={queueTab==="Drafts"} className={`queue-tab${queueTab==="Drafts"?" active":""}`} onClick={()=>setQueueTab("Drafts")}>Drafts{drafts.length>0&&<span className="drafts-badge">{drafts.length}</span>}</button>
     <button type="button" role="tab" aria-selected={queueTab==="History"} className={`queue-tab${queueTab==="History"?" active":""}`} onClick={()=>setQueueTab("History")}>History</button>
    </div>:<h3>Live queue</h3>}

   {(!isVet||queueTab==="Live Queue")&&(loading?<p>Loading queue…</p>:tableRows.length===0?<p>No queue entries today.</p>:<div className="table"><table><thead><tr><th>No.</th><th>Pet</th>{!isVet&&<th>Veterinarian</th>}<th>Time</th><th>Status</th><th>Location / Station</th><th>Actions</th></tr></thead><tbody>{tableRows.map(r=>{const isActiveServing=r.status==="Serving"&&r.id===firstServingId;return <tr key={r.id} className={isActiveServing?"serving-row":""}><td>{/leave/i.test(queueProblem(r))?<><b title={`On hold: the doctor went on sudden leave (was ${r.queue_number})`}>—</b><small className="onhold">On hold</small></>:<b>{r.queue_number}</b>}{r.late_arrival&&<small className="late">Late Arrival</small>}</td><td><div className="queuePetCell"><PetThumb pet={r.pet}/><div>{r.pets?.length?r.pets.map(p=>p.pet_name).join(", "):(r.pet?.pet_name||"—")}{r.pets?.length>1&&<small className="petcount">{r.pets.length} pets · {r.visitDurationMinutes} min</small>}<small>{r.owner?.full_name||""}</small></div></div></td>{!isVet&&<td>{r.veterinarian?.full_name||"—"}{queueProblem(r)&&(()=>{const tag=unavailableTag(queueProblem(r),r.queue_date,r.original_appointment_time);return <span className="doc-alert" title={unavailableNote(r.veterinarian?.full_name,queueProblem(r),r.queue_date,r.original_appointment_time)}><TriangleAlert size={13}/><span className="doc-alert-text"><b>{tag.headline}</b>{tag.detail&&<em>{tag.detail}</em>}</span></span>;})()}</td>}<td>{bookingTime(r)}</td><td><span className={`pill ${isActiveServing?"serving":r.status==="Serving"?"servingplain":r.status.replaceAll(" ","").toLowerCase()}`}>{isActiveServing&&<span className="live-dot"/>}{r.status}</span></td><td><span className="station-cell"><MapPin size={13}/> {stationLabel(r.status)}</span></td><td>
    {canManage&&<div className="actions">
     <button className="icon-btn serve-btn" disabled={r.status!=="Waiting"||updatingId===r.id||vetsCurrentlyServing.has(r.veterinarian_id)} title={r.status==="Waiting"&&vetsCurrentlyServing.has(r.veterinarian_id)?`${r.veterinarian?.full_name||"This veterinarian"} is already serving another patient`:"Mark as Serving"} aria-label="Mark as Serving" onClick={()=>act(r.id,()=>updateQueueStatus(r.id,"Serving",profile),"Marked as serving.")}><Play size={15}/></button>
     <button className="icon-btn link-btn" disabled={r.status!=="Waiting"||updatingId===r.id} title="Re-queue to next available slot" aria-label="Re-queue" onClick={()=>act(r.id,()=>requeueToNextAvailable(r.id,profile),time=>`Re-queued to ${formatTime(time)}.`)}><RotateCcw size={15}/></button>
     {r.status==="Waiting"&&<button type="button" className="icon-btn reassign-btn" disabled={updatingId===r.id} title={queueProblem(r)?"Change doctor: this doctor can't see the patient (the owner confirms first)":"Reassign to another doctor (the owner confirms first)"} aria-label="Change doctor" onClick={()=>setChangeTarget({queueEntryId:r.id,label:`#${r.queue_number} · ${petNamesOf(r)}`,petNames:petNamesOf(r)})}><UserCog size={15}/></button>}
    </div>}
    {isVet&&<div className="actions">
     {r.billing_status&&r.billing_status!=="Not Applicable"?
      <button className="serve-btn completed-btn" disabled>Completed</button>:
      <button className="create-record-btn" disabled={r.status!=="Serving"} onClick={()=>openRecordTemplate(r)}><FileText size={15}/>Create Medical Record</button>}
    </div>}
   </td></tr>})}</tbody></table></div>)}

   {isVet&&queueTab==="Drafts"&&(drafts.length===0?<p className="drafts-empty">No drafts saved yet. A template you switch away from before finishing gets saved here automatically.</p>:
    <div className="table"><table><thead><tr><th>No.</th><th>Pet</th><th>Template</th><th>Last Saved</th><th>Actions</th></tr></thead><tbody>
     {drafts.map(draft=><tr key={draft.id}>
      <td><b>{queueNumberByEntryId[draft.queue_entry_id]||"—"}</b></td>
      <td><div className="queuePetCell"><PetThumb pet={draft.pet}/><div>{draft.pet?.pet_name||"Pet"}<small>{draft.owner?.full_name||""}</small></div></div></td>
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

  {petInfoCard&&<div className="insight-modal-backdrop" onClick={()=>setPetInfoCard(null)}>
   <div className="insight-modal petinfo-modal" role="dialog" aria-modal="true" aria-labelledby="petinfo-title" onClick={e=>e.stopPropagation()}>
    <button type="button" className="insight-modal-close" aria-label="Close" onClick={()=>setPetInfoCard(null)}><X size={18}/></button>
    <div className="insight-modal-head">
     <PawPrint size={26}/>
     <div>
      <p className="insight-modal-eyebrow">{formatApptDate(petInfoCard.appointment_date)} · {formatTime(petInfoCard.start_time)}{petInfoCard.pets?.length>1?` · ${petInfoCard.visitDurationMinutes} min`:""}</p>
      <h3 id="petinfo-title">{(petInfoCard.pets?.length||1)>1?`${petInfoCard.pets.length} pets in this visit`:"Pet details"}</h3>
     </div>
    </div>
    <div className="petinfo-meta">
     <span><b>Owner</b>{petInfoCard.owner?.full_name||"—"}</span>
     <span><b>Veterinarian</b>{petInfoCard.veterinarian?.full_name?drName(petInfoCard.veterinarian.full_name):"—"}</span>
     {petInfoCard.visit_reason&&<span className="petinfo-reason"><b>Reason for visit</b>{petInfoCard.visit_reason}</span>}
    </div>
    <div className="petinfo-list">
     {(petInfoCard.pets?.length?petInfoCard.pets:[petInfoCard.pet].filter(Boolean)).map(p=>{
      const details=[
       ["Species",[p.species,p.breed].filter(Boolean).join(" · ")],
       ["Sex",p.sex],
       ["Age",formatPetAge(p.date_of_birth)],
       ["Weight",p.weight!=null&&p.weight!==""?`${p.weight} kg`:""],
       ["Color",p.color]
      ].filter(([,v])=>v);
      return <div className="petinfo-pet" key={p.id}>
       <PetThumb pet={p}/>
       <div className="petinfo-body">
        <b>{p.pet_name||"Pet"}</b>
        {details.length?<dl>{details.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>:<p className="petinfo-empty">No other details on file.</p>}
        {p.notes&&<p className="petinfo-notes">{p.notes}</p>}
       </div>
      </div>;
     })}
    </div>
   </div>
  </div>}
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

  {changeTarget&&<DoctorChangeModal profile={profile} target={changeTarget} onClose={()=>setChangeTarget(null)} onSent={(offer,picked)=>{setChangeTarget(null);setMessage(`Sent to the owner: ${drName(picked?.vetName)} at ${formatTime(picked?.time)}. The visit joins the Live Queue once they confirm.`);load();}}/>}

  <PrintPreviewModal open={!!printPreview.preview} title={printPreview.preview?.title} src={printPreview.preview?.src} html={printPreview.preview?.html} onDownload={printPreview.preview?.onDownload} showPrint={printPreview.preview?.showPrint} onClose={printPreview.close}/>

  <style>{`.checkin-actions{display:grid;gap:10px}.checkin-buttons{display:flex;gap:6px;flex-wrap:wrap}.doc-btn{border:0!important;background:#4DA8DA!important;color:#fff!important;border-radius:10px;padding:8px 12px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:13px}.doc-btn-ghost{background:#fff!important;color:#2f6f8f!important;border:1px solid #cfe4ed!important}.doc-btn-change{background:#c0392b!important}
.checkin-buttons .doc-btn{flex:1;justify-content:center;min-height:38px}.doc-btn:disabled{opacity:.55;cursor:not-allowed}.doc-alert{display:flex;width:fit-content;gap:7px;align-items:flex-start;margin-top:6px;padding:6px 10px;border:1px solid #f5c6c0;border-radius:10px;background:#fdf1ef;color:#c0392b;white-space:normal;line-height:1.3;cursor:help}.doc-alert-text{display:grid;gap:1px}.doc-alert-text b{font-size:12px;font-weight:800}.doc-alert-text em{font-style:normal;font-size:11.5px;font-weight:600;color:#a5544b;white-space:nowrap}.doc-alert svg,.doc-unavailable svg{flex-shrink:0;margin-top:1px}.doc-unavailable{margin:0;display:flex;gap:7px;align-items:flex-start;color:#c0392b;background:#fdecea;border:1px solid #f5c6c0;border-radius:10px;padding:9px 11px;font-size:12.5px;font-weight:700;line-height:1.4}.doc-pending{margin:0;color:#9d6817;background:#fff7e8;border:1px solid #f1dfb0;border-radius:10px;padding:9px 11px;font-weight:700;font-size:12.5px;line-height:1.4}.offers-card{margin-bottom:14px;border-left:5px solid #e0982f}.offers-card h3{margin:0}.offers-sub{margin:4px 0 12px;color:#6f7f88;font-size:13px}.offer-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid #f1e3c0;background:#fffcf5;border-radius:12px;padding:10px 12px;margin-top:8px}.offer-info{display:grid;gap:2px;font-size:13px}.offer-info small{color:#6f8591}.offer-info span{color:#3e5968}.offer-info em{color:#b34848;font-style:normal;font-weight:700;font-size:12px}.ok,.err{padding:12px 15px;border-radius:12px;margin-bottom:14px}.ok{background:#e9f8ef;color:#26754a}.err{background:#fff0f0;color:#b34b4b}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:16px}.stat{background:#fff;border-radius:16px;padding:18px;box-shadow:0 7px 20px #d9edf5}.stat strong{display:block;font-size:27px;color:#318fbe;text-transform:capitalize}.stat span{text-transform:capitalize;color:#6f7f88}.filters{display:flex;gap:10px;margin-bottom:16px}.filters select,.filters button{padding:10px;border:1px solid #d4e9f1;border-radius:10px;background:#fff}.actions select{padding:7px 9px;border:1px solid #d4e9f1;border-radius:8px;background:#fff;font-size:12.5px}.icon-btn{width:30px;height:30px;padding:0!important;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d4e9f1;border-radius:8px;background:#fff;flex-shrink:0}.link-btn{background:#fff!important;color:#318fbe!important;border:1px solid #d4e9f1!important}.link-btn:disabled{opacity:.5;cursor:not-allowed;color:#8fa3ab!important}.filters button,.appt button{background:#4DA8DA;color:#fff;border:0}.appt button:disabled,.create-record-btn:disabled{opacity:.65;cursor:not-allowed}.apptHead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:10px}.apptHead h3{margin:0}.apptDatePick{display:flex;align-items:center;gap:8px;font-size:13px;color:#6f7f88;font-weight:700}.apptDatePick input{padding:8px 10px;border:1px solid #d4e9f1;border-radius:10px;background:#fff}.apptEmpty{color:#72838c;margin:0}.apptgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:12px}.appt{border:1px solid #e2f0f5;border-radius:14px;padding:14px;display:grid;gap:12px;align-content:space-between;background:#fbfeff;box-shadow:0 4px 14px rgba(33,92,125,.06)}.appt-flagged{border-color:#f5c6c0;border-left:4px solid #c0392b;background:#fffafa}.appt-onhold{border-color:#f1dfb0;border-left:4px solid #e0982f;background:#fffdf7}.apptTop{display:flex;align-items:center;gap:10px;min-width:0}.appt .apptTopBtn{width:100%;margin:-6px;padding:6px;box-sizing:content-box;border:0;border-radius:10px;background:#fff;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .15s}.appt .apptTopBtn:hover,.appt .apptTopBtn:focus-visible{background:#f1f8fb}.appt .apptTopBtn .apptTime{background:#4DA8DA;color:#fff}.apptTopBtn:focus-visible{outline:2px solid #4da8da;outline-offset:1px}.petinfo-modal{width:min(560px,100%)}.petinfo-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 18px;margin-bottom:16px;padding:12px 14px;border-radius:12px;background:#f4fafc;color:#1d3a4a;font-size:14px}.petinfo-meta span{display:grid;gap:2px}.petinfo-meta b{color:#6f8792;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.petinfo-reason{grid-column:1/-1}.petinfo-list{display:grid;gap:12px}.petinfo-pet{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid #e2f0f5;border-radius:14px}.petinfo-pet .petThumb{width:48px;height:48px;flex-shrink:0}.petinfo-body{display:grid;gap:8px;min-width:0;flex:1}.petinfo-body>b{color:#1d3a4a;font-size:16px}.petinfo-body dl{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px 14px}.petinfo-body dt{color:#7b909b;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.petinfo-body dd{margin:0;color:#1d3a4a;font-size:14px;font-weight:600}.petinfo-notes,.petinfo-empty{margin:0;color:#5f7884;font-size:13px}.apptInfo{display:grid;gap:2px;min-width:0;flex:1}.apptInfo b{color:#1d3a4a;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apptInfo span{color:#5f7884;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apptInfo small{color:#7b909b;font-size:12px;font-weight:600}.apptTime{align-self:flex-start;flex-shrink:0;background:#e6f4fb;color:#2c6ba3;font-weight:800;font-size:12.5px;border-radius:999px;padding:4px 10px;white-space:nowrap}.petThumb{flex-shrink:0;width:32px;height:32px;border-radius:9px;object-fit:cover;background:#eaf8fd;color:#4da8da}.petThumbFallback{display:grid;place-items:center}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #e6f1f5;text-align:left;white-space:nowrap}td small{display:block;color:#72838c}.queuePetCell{display:flex;align-items:center;gap:10px}.late{color:#d88416!important}.onhold{display:block;color:#b34848!important;font-weight:800}.station-cell{display:inline-flex;align-items:center;gap:5px;color:#48717f;font-weight:600}.petcount{color:#318fbe!important;font-weight:700}.pill{padding:5px 9px;border-radius:999px;background:#eaf7fb;font-size:12px}.billingstatus-billed{background:#e7f7ed;color:#26754a;font-weight:700}.billingstatus-processing{background:#e7f0ff;color:#2c5ab5;font-weight:700}.billingstatus-pendingbilling{background:#fff6e0;color:#9a7000;font-weight:700}.billingstatus-none{background:#eef1f4;color:#5b6b76;font-weight:700}.serving{background:#fdecea;color:#c0392b;display:inline-flex;align-items:center;gap:5px}.servingplain{background:#eaf7fb;color:#267da3}.serving-row{background:#fef7f6}.serving-row:hover{background:#fdeeec}.live-dot{width:6px;height:6px;border-radius:50%;background:#e2413a;animation:livePulse 1.4s ease-in-out infinite}@keyframes livePulse{0%,100%{opacity:1}50%{opacity:.35}}.waiting{background:#fff5d9;color:#9a7015}.actions{display:flex;gap:5px;flex-wrap:wrap}.serve-btn{background:#4DA8DA!important;color:#fff!important;border:0!important;font-weight:700;cursor:pointer}.serve-btn:disabled{opacity:.55;cursor:not-allowed}.create-record-btn{display:inline-flex;align-items:center;gap:6px;background:#4DA8DA!important;color:#fff!important;border:0!important;padding:10px 14px!important;font-weight:700;cursor:pointer;white-space:nowrap}.reassign-btn{background:#fff!important;color:#c0392b!important;border:1px solid #f0c4bd!important;cursor:pointer}.reassign-btn:hover:not(:disabled){background:#fdf1ef!important}.reassign-btn:disabled{opacity:.5;cursor:not-allowed}.link{color:#318fbe;cursor:pointer}.link:disabled{opacity:.5;cursor:not-allowed;color:#8fa3ab}.queue-tabs{position:relative;display:flex;margin-bottom:16px;padding:4px;border-radius:12px;background:#eaf3f7}.queue-tabs-slider{position:absolute;top:4px;bottom:4px;width:calc(50% - 4px);border-radius:9px;background:#fff;box-shadow:0 2px 6px rgba(33,105,127,.18);transition:left .22s ease}.queue-tabs-3 .queue-tabs-slider{width:calc(33.3333% - 4px)}.queue-tab{position:relative;z-index:1;flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:none;padding:11px 10px;font-weight:700;font-size:13.5px;color:#6f8792;cursor:pointer}.queue-tab.active{color:#17445a}.drafts-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#9a7000;color:#fff;font-size:10px}.drafts-empty{color:#72838c;margin:0}.history-pdf-btn,.history-insight-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid #cfe2ea;background:#fff;border-radius:9px;padding:8px 10px;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap}.history-pdf-btn{color:#257fa9}.history-insight-btn{color:#17445a}.history-pdf-btn:hover,.history-insight-btn:hover{background:#f2f9fc}.history-no-rx{display:inline-flex;align-items:center;gap:5px;border:1px solid #f2dfa0;background:#fff6e0;color:#8a6d00;border-radius:9px;padding:8px 10px;font-weight:800;font-size:12px;white-space:nowrap}.pagination{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:14px;padding-top:14px;border-top:1px solid #e6f1f5}.pagination button{padding:8px 16px;border:1px solid #d4e9f1;border-radius:9px;background:#fff;color:#267da3;font-weight:700;font-size:13px;cursor:pointer}.pagination button:disabled{opacity:.5;cursor:not-allowed}.pagination span{color:#6f7f88;font-size:13px;font-weight:600}.history-search{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:0 13px;border:1px solid #d4e9f1;border-radius:10px;background:#f8fcfe;color:#7c8c94}.history-search input{flex:1;height:42px;border:0;background:transparent;outline:none;font:inherit;color:#20313b}.insight-risk-badge{margin-left:6px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap}.insight-risk-badge.risk-low{background:#e5f4ea;color:#2f8f5b}.insight-risk-badge.risk-moderate{background:#fdf1dc;color:#a5680b}.insight-risk-badge.risk-high{background:#fbe6e4;color:#c0392b}.insight-modal-backdrop{position:fixed;inset:0;background:rgba(24,47,59,.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}.insight-modal{position:relative;width:min(780px,100%);max-height:85vh;overflow-y:auto;background:#fff;border-radius:16px;padding:26px;box-shadow:0 20px 48px rgba(17,48,63,.28)}.insight-modal-close{position:absolute;top:14px;right:14px;border:0;background:#eef7fa;color:#183642;border-radius:50%;width:32px;height:32px;display:grid;place-items:center;cursor:pointer}.insight-modal-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-right:30px;color:#4da8da}.insight-modal-eyebrow{margin:0 0 2px;color:#6f8792;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.insight-modal-head h3{margin:0;color:#17445a;font-size:19px}@media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}.filters{display:grid}}`}</style>
 </AppShell>
}
