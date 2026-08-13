import { supabase } from "../config/supabaseClient";
import { todayLocal } from "./appointmentService";

export const QUEUE_STATUSES=["Waiting","Serving","Completed"];
const active=["Waiting","Serving"];
const uniq=a=>[...new Set(a.filter(Boolean))];

async function enrich(rows){
  if(!rows.length)return [];
  const [pets,profiles,appointments]=await Promise.all([
    supabase.from("pets").select("id,pet_name,species,breed").in("id",uniq(rows.map(r=>r.pet_id))),
    supabase.from("profiles").select("id,full_name,username,email,role").in("id",uniq(rows.flatMap(r=>[r.owner_id,r.veterinarian_id]))),
    supabase.from("appointments").select("id,appointment_date,start_time,visit_reason,status").in("id",uniq(rows.map(r=>r.appointment_id)))
  ]);
  const pm=new Map((pets.data||[]).map(x=>[x.id,x]));
  const pr=new Map((profiles.data||[]).map(x=>[x.id,x]));
  const am=new Map((appointments.data||[]).map(x=>[x.id,x]));
  return rows.map(r=>{
    const appointment=am.get(r.appointment_id)||null;
    const appointmentClosed=appointment&&["Completed","Cancelled"].includes(appointment.status);
    return {...r,status:appointmentClosed?"Completed":r.status,pet:pm.get(r.pet_id)||null,owner:pr.get(r.owner_id)||null,veterinarian:pr.get(r.veterinarian_id)||null,appointment};
  });
}

export async function getQueue(filters={}){
  let q=supabase.from("queue_entries").select("*").eq("queue_date",filters.date||todayLocal())
    .order("manual_order",{ascending:true,nullsFirst:false}).order("arrived_at",{ascending:true});
  if(filters.veterinarianId)q=q.eq("veterinarian_id",filters.veterinarianId);
  if(filters.ownerId)q=q.eq("owner_id",filters.ownerId);
  if(filters.status)q=q.eq("status",filters.status);
  if(filters.source)q=q.eq("source",filters.source);
  const {data,error}=await q;
  if(error)throw new Error(`Unable to load queue: ${error.message}`);
  const rows=await enrich(data||[]);
  const avg=10;
  return rows.map((r,i)=>({...r,clientsAhead:rows.slice(0,i).filter(x=>x.veterinarian_id===r.veterinarian_id&&active.includes(x.status)).length,estimatedWaitMinutes:rows.slice(0,i).filter(x=>x.veterinarian_id===r.veterinarian_id&&active.includes(x.status)).length*avg}));
}

export async function getTodayCheckinAppointments(){
  const today=todayLocal();
  const [{data:appointments,error:appointmentError},{data:queued,error:queueError}]=await Promise.all([
    supabase.from("appointments")
      .select("id,pet_id,owner_id,veterinarian_id,appointment_date,start_time,status,appointment_source,visit_reason")
      .eq("appointment_date",today)
      .eq("status","Confirmed")
      .order("start_time",{ascending:true}),
    supabase.from("queue_entries")
      .select("appointment_id")
      .eq("queue_date",today)
      .not("appointment_id","is",null)
  ]);
  if(appointmentError)throw new Error("Unable to load today's appointments.");
  if(queueError)throw new Error("Unable to verify checked-in appointments.");
  const queuedAppointmentIds=new Set((queued||[]).map(row=>row.appointment_id));
  const ready=(appointments||[])
    .filter(appointment=>!queuedAppointmentIds.has(appointment.id))
    .map(appointment=>({...appointment,appointment_id:appointment.id,id:`appt-${appointment.id}`}));
  return enrich(ready);
}

export async function checkInAppointment(appointment,profile,priorityLevel=3,reason=null){
  const {data:existing,error:existingError}=await supabase.from("queue_entries")
    .select("id,queue_number,status")
    .eq("appointment_id",appointment.id)
    .eq("queue_date",todayLocal())
    .maybeSingle();
  if(existingError)throw new Error("Unable to verify the appointment check-in status.");
  if(existing)throw new Error(`This appointment is already checked in as ${existing.queue_number}.`);
  const {data,error}=await supabase.rpc("create_queue_entry",{p_appointment_id:appointment.id,p_pet_id:appointment.pet_id,p_owner_id:appointment.owner_id,p_veterinarian_id:appointment.veterinarian_id,p_source:"Appointment",p_created_by:profile.id,p_priority_level:priorityLevel,p_priority_reason:reason});
  if(error)throw new Error(error.message||"Unable to check in appointment.");
  return data;
}

export async function createWalkInQueue({petId,ownerId,veterinarianId,priorityLevel=3,priorityReason=null},profile){
  const {data,error}=await supabase.rpc("create_queue_entry",{p_appointment_id:null,p_pet_id:petId,p_owner_id:ownerId,p_veterinarian_id:veterinarianId,p_source:"Walk-In",p_created_by:profile.id,p_priority_level:priorityLevel,p_priority_reason:priorityReason});
  if(error)throw new Error(error.message||"Unable to create walk-in queue.");
  return data;
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
export async function reorderQueue(id,manualOrder,reason,profile){
  if(!reason?.trim())throw new Error("A reason is required when changing queue order.");
  const {error}=await supabase.from("queue_entries").update({manual_order:Number(manualOrder),reorder_reason:reason.trim(),created_by:profile.id}).eq("id",id);
  if(error)throw new Error("Unable to reorder queue.");
}

export function subscribeToQueue(callback){
  const channel=supabase.channel(`queue-${Date.now()}`).on("postgres_changes",{event:"*",schema:"public",table:"queue_entries"},callback).subscribe();
  return ()=>{supabase.removeChannel(channel);};
}
