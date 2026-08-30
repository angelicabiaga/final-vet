import { supabase } from "../config/supabaseClient";
import { validateImageFile } from "../utils/validators";
import { describeDbError } from "../utils/supabaseErrors";
const PET_FIELDS="id,owner_id,pet_name,species,breed,sex,date_of_birth,weight,color,microchip_number,allergies,existing_conditions,notes,photo_url,is_archived,created_at,updated_at,owner:profiles!pets_owner_id_fkey(id,full_name,email,phone,address,avatar_url)";
export async function getPets({ownerId,includeArchived=false,search=""}={}){let q=supabase.from("pets").select(PET_FIELDS).order("pet_name");if(ownerId)q=q.eq("owner_id",ownerId);if(!includeArchived)q=q.eq("is_archived",false);if(search)q=q.or(`pet_name.ilike.%${search}%,species.ilike.%${search}%,breed.ilike.%${search}%,microchip_number.ilike.%${search}%`);const{data,error}=await q;if(error)throw new Error("Unable to load animal patients.");return data||[]}
export async function getPet(id){const{data,error}=await supabase.from("pets").select(PET_FIELDS).eq("id",id).single();if(error)throw new Error("Unable to load pet profile.");return data}
export async function getPetOptions(ownerId){
  if(!ownerId)return[];
  const{data,error}=await supabase
    .from("pets")
    .select("id,pet_name,species,breed")
    .eq("owner_id",ownerId)
    .eq("is_archived",false)
    .order("pet_name");
  if(error)throw new Error("Unable to load your pets for the assistant.");
  return data||[];
}
export async function savePet(values,ownerId){const row={owner_id:ownerId,pet_name:values.petName?.trim(),species:values.species?.trim(),breed:values.breed?.trim()||null,sex:values.sex||"Unknown",date_of_birth:values.dateOfBirth||null,weight:values.weight?Number(values.weight):null,color:values.color?.trim()||null,microchip_number:values.microchipNumber?.trim()||null,allergies:values.allergies?.trim()||null,existing_conditions:values.existingConditions?.trim()||null,notes:values.notes?.trim()||null,photo_url:values.photoUrl||null};if(!row.pet_name||!row.species||!ownerId)throw new Error("Pet name, species, and owner are required.");let result;if(values.id)result=await supabase.from("pets").update(row).eq("id",values.id).select(PET_FIELDS).single();else result=await supabase.from("pets").insert(row).select(PET_FIELDS).single();if(result.error)throw new Error(result.error.code==="23505"?"That microchip number is already registered.":describeDbError(result.error,"Unable to save pet record. Please try again.","savePet"));return result.data}
export async function archivePet(id,archived=true){const{error}=await supabase.from("pets").update({is_archived:archived,archived_at:archived?new Date().toISOString():null}).eq("id",id);if(error)throw new Error("Unable to update archive status.")}
export async function uploadPetPhoto(file,ownerId){if(!file)return null;validateImageFile(file);const ext=file.name.split('.').pop();const path=`${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const{error}=await supabase.storage.from("pet-photos").upload(path,file,{upsert:false});if(error)throw new Error("Unable to upload pet photo. Check the pet-photos storage bucket.");return supabase.storage.from("pet-photos").getPublicUrl(path).data.publicUrl}
export async function getPetAppointments(petId){const{data,error}=await supabase.from("appointments").select("id,appointment_date,start_time,status,visit_reason,veterinarian:profiles!appointments_veterinarian_id_fkey(full_name)").eq("pet_id",petId).order("appointment_date",{ascending:false});if(error)throw new Error("Unable to load appointment history.");return data||[]}

// Pet Owner directory for the Animal Patients module: every active
// pet_owner profile (including ones with no pets registered yet). Pet
// counts are derived by the caller from the pet list it already has
// loaded, so this stays a single read-only query -- no new table.
export async function getPetOwnersDirectory(){
  const{data,error}=await supabase.from("profiles").select("id,full_name,username,email,phone,address,avatar_url").eq("role","pet_owner").eq("account_status","active").order("full_name");
  if(error)throw new Error("Unable to load pet owners.");
  return data||[];
}

// Full pet-owner profile for the Pet Owners module's profile view, looked
// up fresh by the owner's own unique id (never by name/email). Selects
// only the display fields that view actually needs -- never password,
// which this table's custom auth otherwise stores in plaintext on the
// same row (see custom_auth_patch.sql) -- so nothing security-sensitive
// is fetched into the client for this view at all.
export async function getPetOwnerProfile(ownerId){
  const{data,error}=await supabase.from("profiles").select("id,full_name,username,email,phone,address,avatar_url,account_status,created_at").eq("id",ownerId).eq("role","pet_owner").single();
  if(error)throw new Error("Unable to load this pet owner's profile.");
  return data;
}

// Most recent consultation date per pet, scoped to just the pet ids asked
// for (an owner's pets) -- used only for display in the Animal Patients
// list, reusing the existing medical_records table.
export async function getLatestConsultationDates(petIds){
  const ids=[...new Set((petIds||[]).filter(Boolean))];
  if(!ids.length)return{};
  const{data,error}=await supabase.from("medical_records").select("pet_id,consultation_date").in("pet_id",ids).order("consultation_date",{ascending:false});
  if(error)return{};
  const latest={};
  (data||[]).forEach(row=>{if(row.consultation_date&&!latest[row.pet_id])latest[row.pet_id]=row.consultation_date;});
  return latest;
}
