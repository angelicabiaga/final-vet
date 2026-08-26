import { supabase } from "../config/supabaseClient";
import { todayLocal, getAvailableSlots, addTenMinutes } from "./appointmentService";

export const QUEUE_STATUSES=["Waiting","Serving","Completed"];
const active=["Waiting","Serving"];
const uniq=a=>[...new Set(a.filter(Boolean))];
const QUEUE_NUMBER_UNIQUE_CONSTRAINT="queue_entries_queue_date_queue_number_key";
const QUEUE_NUMBER_RETRY_DELAY_MS=200;

function rpcErrorText(error){
  return [error?.message,error?.details,error?.hint].filter(Boolean).join(" ");
}

function isQueueNumberConflict(error){
  return error?.code==="23505"&&rpcErrorText(error).includes(QUEUE_NUMBER_UNIQUE_CONSTRAINT);
}

function isAlreadyCheckedInError(error){
  return /already checked in/i.test(rpcErrorText(error));
}

function queueCreationError(message,shouldRefreshQueue=false){
  const error=new Error(message);
  error.shouldRefreshQueue=shouldRefreshQueue;
  return error;
}

function queueRpcError(error,fallbackMessage){
  if(isAlreadyCheckedInError(error)){
    return queueCreationError("This visit is already checked in. The queue was refreshed.",true);
  }
  return queueCreationError(error?.message||fallbackMessage);
}

function waitForQueueNumberRetry(){
  return new Promise(resolve=>setTimeout(resolve,QUEUE_NUMBER_RETRY_DELAY_MS));
}

// A Postgres unique-constraint error aborts the RPC statement, so retrying
// exactly this queue-number collision cannot create a second queue visit.
// No other RPC failure is retried or rewritten.
async function createGroupQueueEntry(params,fallbackMessage){
  let result=await supabase.rpc("create_group_queue_entry",params);
  if(!result.error)return result.data;
  if(!isQueueNumberConflict(result.error))throw queueRpcError(result.error,fallbackMessage);

  await waitForQueueNumberRetry();
  result=await supabase.rpc("create_group_queue_entry",params);
  if(!result.error)return result.data;

  if(isQueueNumberConflict(result.error)){
    throw queueCreationError("That queue number is already in use today. No duplicate visit was created; refresh the queue and try again.",true);
  }
  throw queueRpcError(result.error,fallbackMessage);
}

function timeOfDayMinutes(value){
  if(!value) return null;
  if(/^\d{2}:\d{2}/.test(value)){
    const [h,m]=value.split(":").map(Number);
    return h*60+m;
  }
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime())) return null;
  return parsed.getHours()*60+parsed.getMinutes();
}

// Online/checked-in appointments keep their reserved time as priority; walk-ins
// (no original appointment) are ordered by when they actually checked in.
function priorityKey(row){
  const key=row.original_appointment_time?timeOfDayMinutes(row.original_appointment_time):timeOfDayMinutes(row.arrived_at);
  return key===null?Infinity:key;
}

async function enrich(rows){
  if(!rows.length)return [];
  const entryIds=uniq(rows.map(r=>r.id));
  const [pets,profiles,appointments,entryPets]=await Promise.all([
    supabase.from("pets").select("id,pet_name,species,breed,photo_url").in("id",uniq(rows.map(r=>r.pet_id))),
    supabase.from("profiles").select("id,full_name,username,email,role,avatar_url").in("id",uniq(rows.flatMap(r=>[r.owner_id,r.veterinarian_id]))),
    supabase.from("appointments").select("id,appointment_date,start_time,visit_reason,status").in("id",uniq(rows.map(r=>r.appointment_id))),
    entryIds.length?supabase.from("queue_entry_pets").select("queue_entry_id,appointment_id,pet:pets(id,pet_name,species,breed,photo_url)").in("queue_entry_id",entryIds):Promise.resolve({data:[]})
  ]);
  const pm=new Map((pets.data||[]).map(x=>[x.id,x]));
  const pr=new Map((profiles.data||[]).map(x=>[x.id,x]));
  const am=new Map((appointments.data||[]).map(x=>[x.id,x]));
  const petsByEntry=new Map();
  (entryPets.data||[]).forEach(row=>{
    if(!row.pet)return;
    const list=petsByEntry.get(row.queue_entry_id)||[];
    list.push({...row.pet,appointmentId:row.appointment_id||null});
    petsByEntry.set(row.queue_entry_id,list);
  });
  return rows.map(r=>{
    const appointment=am.get(r.appointment_id)||null;
    const appointmentClosed=appointment&&["Completed","Cancelled"].includes(appointment.status);
    const groupedPets=petsByEntry.get(r.id);
    const pets=groupedPets&&groupedPets.length?groupedPets:(pm.get(r.pet_id)?[{...pm.get(r.pet_id),appointmentId:r.appointment_id||null}]:[]);
    return {
      ...r,
      status:appointmentClosed?"Completed":r.status,
      pet:pm.get(r.pet_id)||pets[0]||null,
      pets,
      visitDurationMinutes:Math.max(pets.length,1)*10,
      owner:pr.get(r.owner_id)||null,
      veterinarian:pr.get(r.veterinarian_id)||null,
      appointment
    };
  });
}

async function enrichCheckinGroups(cards){
  if(!cards.length)return [];
  const [pets,profiles]=await Promise.all([
    supabase.from("pets").select("id,pet_name,species,breed,photo_url").in("id",uniq(cards.flatMap(c=>c.petIds))),
    supabase.from("profiles").select("id,full_name,username,email,role,avatar_url").in("id",uniq(cards.flatMap(c=>[c.owner_id,c.veterinarian_id])))
  ]);
  const pm=new Map((pets.data||[]).map(x=>[x.id,x]));
  const pr=new Map((profiles.data||[]).map(x=>[x.id,x]));
  return cards.map(card=>{
    const cardPets=card.petIds.map(id=>pm.get(id)).filter(Boolean);
    return {
      ...card,
      pet:pm.get(card.pet_id)||cardPets[0]||null,
      pets:cardPets,
      visitDurationMinutes:Math.max(cardPets.length,1)*10,
      owner:pr.get(card.owner_id)||null,
      veterinarian:pr.get(card.veterinarian_id)||null
    };
  });
}

export async function getQueue(filters={}){
  let q=supabase.from("queue_entries").select("*").eq("queue_date",filters.date||todayLocal())
    .order("arrived_at",{ascending:true});
  if(filters.veterinarianId)q=q.eq("veterinarian_id",filters.veterinarianId);
  if(filters.ownerId)q=q.eq("owner_id",filters.ownerId);
  if(filters.status)q=q.eq("status",filters.status);
  if(filters.source)q=q.eq("source",filters.source);
  const {data,error}=await q;
  if(error)throw new Error(`Unable to load queue: ${error.message}`);
  const enriched=await enrich(data||[]);

  // Manual staff override always wins; otherwise sort by scheduled/arrival
  // priority so an appointment's reserved time survives a late check-in.
  const sorted=[...enriched].sort((a,b)=>{
    const manualA=a.manual_order??null, manualB=b.manual_order??null;
    if(manualA!==null||manualB!==null){
      if(manualA===null)return 1;
      if(manualB===null)return -1;
      if(manualA!==manualB)return manualA-manualB;
    }
    const keyA=priorityKey(a), keyB=priorityKey(b);
    if(keyA!==keyB)return keyA-keyB;
    return new Date(a.arrived_at)-new Date(b.arrived_at);
  });

  return sorted.map((r,i)=>{
    const ahead=sorted.slice(0,i).filter(x=>x.veterinarian_id===r.veterinarian_id&&x.owner_id!==r.owner_id&&active.includes(x.status));
    const waitMinutes=ahead.reduce((sum,x)=>sum+(x.visitDurationMinutes||10),0);
    return {...r,clientsAhead:ahead.length,estimatedWaitMinutes:waitMinutes};
  });
}

export async function getTodayCheckinAppointments(){
  const today=todayLocal();
  const [{data:appointments,error:appointmentError},{data:queued,error:queueError}]=await Promise.all([
    // Every Confirmed appointment not yet in today's queue is eligible for
    // check-in here, not just ones dated exactly today -- a late arrival
    // from an earlier date, or an early walk-in for a future date, should
    // still be reachable from this list.
    supabase.from("appointments")
      .select("id,pet_id,owner_id,veterinarian_id,appointment_date,start_time,status,appointment_source,visit_reason,visit_group_id")
      .eq("status","Confirmed")
      .order("appointment_date",{ascending:true})
      .order("start_time",{ascending:true}),
    supabase.from("queue_entries")
      .select("id,appointment_id")
      .eq("queue_date",today)
  ]);
  if(appointmentError)throw new Error("Unable to load today's appointments.");
  if(queueError)throw new Error("Unable to verify checked-in appointments.");

  const queueIds=uniq((queued||[]).map(row=>row.id));
  const {data:queuedPetLinks,error:queuedPetLinksError}=queueIds.length
    ?await supabase.from("queue_entry_pets").select("appointment_id").in("queue_entry_id",queueIds)
    :{data:[],error:null};
  if(queuedPetLinksError)throw new Error("Unable to verify checked-in appointments.");

  const queuedAppointmentIds=new Set([
    ...(queued||[]).map(row=>row.appointment_id).filter(Boolean),
    ...(queuedPetLinks||[]).map(row=>row.appointment_id).filter(Boolean)
  ]);

  const pending=(appointments||[]).filter(appointment=>!queuedAppointmentIds.has(appointment.id));

  const groups=new Map();
  pending.forEach(appointment=>{
    const key=appointment.visit_group_id||`single-${appointment.id}`;
    const group=groups.get(key)||{appointments:[]};
    group.appointments.push(appointment);
    groups.set(key,group);
  });

  const cards=Array.from(groups.entries()).map(([key,group])=>{
    const ordered=group.appointments.slice().sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));
    const primary=ordered[0];
    return {
      ...primary,
      id:`visit-${key}`,
      appointmentIds:ordered.map(a=>a.id),
      petIds:ordered.map(a=>a.pet_id)
    };
  }).sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));

  return enrichCheckinGroups(cards);
}

export async function checkInAppointment(card,profile,priorityLevel=3,reason=null){
  const appointmentIds=card.appointmentIds?.length?card.appointmentIds:[card.appointment_id||card.id];
  const petIds=card.petIds?.length?card.petIds:[card.pet_id];
  return createGroupQueueEntry({
    p_appointment_ids:appointmentIds,
    p_pet_ids:petIds,
    p_owner_id:card.owner_id,
    p_veterinarian_id:card.veterinarian_id,
    p_source:"Appointment",
    p_created_by:profile.id,
    p_priority_level:priorityLevel,
    p_priority_reason:reason
  },"Unable to check in the visit.");
}

export async function createWalkInQueue({petIds,ownerId,veterinarianId,priorityLevel=3,priorityReason=null},profile){
  const ids=(petIds||[]).filter(Boolean);
  if(!ids.length)throw new Error("Select at least one pet.");
  return createGroupQueueEntry({
    p_appointment_ids:[],
    p_pet_ids:ids,
    p_owner_id:ownerId,
    p_veterinarian_id:veterinarianId,
    p_source:"Walk-In",
    p_created_by:profile.id,
    p_priority_level:priorityLevel,
    p_priority_reason:priorityReason
  },"Unable to add the walk-in to the queue.");
}

export async function updateQueueStatus(id,status,profile,reason=null){
  if(!QUEUE_STATUSES.includes(status)) throw new Error("Invalid queue status.");
  const {data:current,error:loadError}=await supabase.from("queue_entries").select("status").eq("id",id).single();
  if(loadError) throw new Error(`Unable to load the queue entry: ${loadError.message}`);
  const nextStatus={Waiting:"Serving",Serving:"Completed"}[current.status];
  if(!nextStatus || status!==nextStatus) throw new Error(`Queue status must follow ${current.status} → ${nextStatus||"no further status"}.`);
  const patch={status,created_by:profile.id,reorder_reason:reason||null};
  if(status==="Serving")patch.consultation_started_at=new Date().toISOString();
  if(status==="Completed")patch.consultation_ended_at=new Date().toISOString();
  const {error}=await supabase.from("queue_entries").update(patch).eq("id",id);
  if(error)throw new Error(`Unable to update queue status: ${error.message}`);
}

function completionStatusPatch(status,profile){
  const patch={status,created_by:profile.id,reorder_reason:null};
  if(status==="Serving")patch.consultation_started_at=new Date().toISOString();
  if(status==="Completed")patch.consultation_ended_at=new Date().toISOString();
  return patch;
}

async function getQueueEntryStatus(id){
  const {data,error}=await supabase
    .from("queue_entries")
    .select("id,status")
    .eq("id",id)
    .single();
  if(error)throw new Error(`Unable to load the queue entry: ${error.message}`);
  return data;
}

// This is intentionally separate from updateQueueStatus. Normal staff actions
// remain limited to one explicit transition, while the veterinarian's visit
// completion workflow may safely advance Waiting -> Serving -> Completed.
async function compareAndSetQueueStatus(id,fromStatus,toStatus,profile){
  const {data,error}=await supabase
    .from("queue_entries")
    .update(completionStatusPatch(toStatus,profile))
    .eq("id",id)
    .eq("status",fromStatus)
    .select("id,status");
  if(error)throw new Error(`Unable to update queue status: ${error.message}`);
  return data?.[0]||null;
}

/**
 * Completes an active queue ticket for the veterinarian's medical-record flow.
 * It never writes Waiting -> Completed directly: Waiting tickets are first
 * started, then completed. Conditional updates make concurrent completion
 * attempts safe; an already-completed ticket is treated as a successful no-op.
 */
export async function completeQueueEntry(id,profile){
  if(!id)throw new Error("A queue entry is required to complete the visit.");
  if(!profile?.id)throw new Error("A signed-in user is required to complete the visit.");

  // A retry covers the two meaningful races: another user starts the ticket,
  // or another completion request finishes it between this call's transitions.
  for(let attempt=0;attempt<3;attempt++){
    const current=await getQueueEntryStatus(id);

    if(current.status==="Completed"){
      return {id:current.id,status:"Completed",alreadyCompleted:true};
    }

    if(current.status==="Waiting"){
      const started=await compareAndSetQueueStatus(id,"Waiting","Serving",profile);
      if(!started)continue;
    }else if(current.status!=="Serving"){
      throw new Error(`Queue entry cannot be completed from ${current.status}.`);
    }

    const completed=await compareAndSetQueueStatus(id,"Serving","Completed",profile);
    if(completed){
      return {id:completed.id,status:"Completed",alreadyCompleted:false};
    }
  }

  // One final read converts a concurrent successful completion into an
  // idempotent success instead of reporting a misleading retry error.
  const latest=await getQueueEntryStatus(id);
  if(latest.status==="Completed"){
    return {id:latest.id,status:"Completed",alreadyCompleted:true};
  }
  throw new Error("The queue ticket changed before it could be completed. Please try again.");
}

/**
 * Sends a just-finalized consultation to Staff POS for billing. This never
 * touches queue_entries.status (the ticket stays Serving until staff
 * finishes payment) -- it only flips the separate billing_status lane.
 * Compare-and-set + an idempotent "already done" return mirrors
 * completeQueueEntry so a flaky retry can never send the same consultation
 * to billing twice.
 *
 * A visit already billed ('Billed') is also allowed to reopen -- a vet can
 * complete a second template for the same visit (e.g. via the Drafts flow)
 * after the first was already paid, and that second template's own new
 * items still need to reach staff. getConsultationForBilling handles never
 * re-charging the checkup fee or re-selling an already-paid item when this
 * happens; this function only decides whether the ticket is eligible to
 * reopen at all.
 */
export async function markConsultationReadyForBilling(id,profile){
  if(!id)throw new Error("A queue entry is required to send this consultation to billing.");
  if(!profile?.id)throw new Error("A signed-in user is required to complete this consultation.");
  const {data,error}=await supabase
    .from("queue_entries")
    .update({billing_status:"Pending Billing",consultation_finalized_at:new Date().toISOString(),consultation_finalized_by:profile.id})
    .eq("id",id)
    .in("billing_status",["Not Applicable","Billed"])
    .select("id,billing_status");
  if(error)throw new Error(`Unable to send this consultation to billing: ${error.message}`);
  if(data?.[0])return {id:data[0].id,billing_status:data[0].billing_status,alreadyDone:false};

  const {data:current,error:loadError}=await supabase.from("queue_entries").select("id,billing_status").eq("id",id).single();
  if(loadError)throw new Error(`Unable to verify billing status: ${loadError.message}`);
  if(current.billing_status==="Pending Billing"||current.billing_status==="Processing"){
    return {id:current.id,billing_status:current.billing_status,alreadyDone:true};
  }
  throw new Error("The queue ticket changed before it could be sent to billing. Please try again.");
}

export async function reorderQueue(id,manualOrder,reason,profile){
  if(!reason?.trim())throw new Error("A reason is required when changing queue order.");
  const {error}=await supabase.from("queue_entries").update({manual_order:Number(manualOrder),reorder_reason:reason.trim(),created_by:profile.id}).eq("id",id);
  if(error)throw new Error("Unable to reorder queue.");
}

function findConsecutiveRun(sortedSlots,count){
  for(let i=0;i<=sortedSlots.length-count;i++){
    let ok=true;
    for(let j=1;j<count;j++){
      if(addTenMinutes(sortedSlots[i+j-1])!==sortedSlots[i+j]){ok=false;break;}
    }
    if(ok)return sortedSlots.slice(i,i+count);
  }
  return null;
}

export async function requeueToNextAvailable(id,profile){
  const {data:entry,error:loadError}=await supabase.from("queue_entries").select("id,status,veterinarian_id").eq("id",id).single();
  if(loadError)throw new Error(`Unable to load the queue entry: ${loadError.message}`);
  if(entry.status!=="Waiting")throw new Error("Only a Waiting ticket can be re-queued.");

  const {data:links,error:linksError}=await supabase.from("queue_entry_pets").select("appointment_id").eq("queue_entry_id",id);
  if(linksError)throw new Error("Unable to load this ticket's appointments.");
  const appointmentIds=uniq((links||[]).map(l=>l.appointment_id));
  if(!appointmentIds.length)throw new Error("This ticket has no scheduled slot to move.");

  const {data:appts,error:apptsError}=await supabase.from("appointments").select("id,start_time").in("id",appointmentIds).order("start_time",{ascending:true});
  if(apptsError)throw new Error("Unable to load appointment details.");

  const today=todayLocal();
  const slots=await getAvailableSlots(entry.veterinarian_id,today);
  const run=findConsecutiveRun(slots,appts.length);
  if(!run)throw new Error("No available slot large enough for this visit today.");

  for(let i=0;i<appts.length;i++){
    const startTime=run[i];
    const {error}=await supabase.from("appointments").update({
      start_time:startTime,end_time:addTenMinutes(startTime),updated_at:new Date().toISOString()
    }).eq("id",appts[i].id);
    if(error){
      if(error.code==="23505")throw new Error("That time was just booked by someone else. Try again.");
      throw new Error("Unable to move the appointment to the new time.");
    }
  }

  const {error:entryError}=await supabase.from("queue_entries").update({
    original_appointment_time:run[0],
    manual_order:null,
    reorder_reason:"Re-queued to next available slot",
    created_by:profile.id
  }).eq("id",id);
  if(entryError)throw new Error("Unable to update the queue entry.");

  return run[0];
}

export async function getQueueStatusForAppointments(appointmentIds){
  const ids=uniq(appointmentIds||[]);
  if(!ids.length)return {};
  const [{data:direct,error:directError},{data:viaPets,error:viaPetsError}]=await Promise.all([
    supabase.from("queue_entries").select("appointment_id,status").in("appointment_id",ids),
    supabase.from("queue_entry_pets").select("appointment_id,queue_entry:queue_entries(status)").in("appointment_id",ids)
  ]);
  if(directError||viaPetsError)throw new Error("Unable to load queue status for appointments.");
  const map={};
  (direct||[]).forEach(row=>{if(row.appointment_id)map[row.appointment_id]=row.status;});
  (viaPets||[]).forEach(row=>{if(row.appointment_id&&row.queue_entry?.status)map[row.appointment_id]=row.queue_entry.status;});
  return map;
}

export function subscribeToQueue(callback){
  const channel=supabase.channel(`queue-${Date.now()}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"queue_entries"},callback)
    .on("postgres_changes",{event:"*",schema:"public",table:"queue_entry_pets"},callback)
    .on("postgres_changes",{event:"*",schema:"public",table:"appointments"},callback)
    .subscribe();
  return ()=>{supabase.removeChannel(channel);};
}
