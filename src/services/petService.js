import { supabase } from "../config/supabaseClient";
import { validateImageFile } from "../utils/validators";
const PET_FIELDS="id,owner_id,pet_name,species,breed,sex,date_of_birth,weight,color,microchip_number,allergies,existing_conditions,notes,photo_url,is_archived,created_at,updated_at,owner:profiles!pets_owner_id_fkey(id,full_name,email,phone)";
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
export async function savePet(values,ownerId){const row={owner_id:ownerId,pet_name:values.petName?.trim(),species:values.species?.trim(),breed:values.breed?.trim()||null,sex:values.sex||"Unknown",date_of_birth:values.dateOfBirth||null,weight:values.weight?Number(values.weight):null,color:values.color?.trim()||null,microchip_number:values.microchipNumber?.trim()||null,allergies:values.allergies?.trim()||null,existing_conditions:values.existingConditions?.trim()||null,notes:values.notes?.trim()||null,photo_url:values.photoUrl||null};if(!row.pet_name||!row.species||!ownerId)throw new Error("Pet name, species, and owner are required.");let result;if(values.id)result=await supabase.from("pets").update(row).eq("id",values.id).select(PET_FIELDS).single();else result=await supabase.from("pets").insert(row).select(PET_FIELDS).single();if(result.error)throw new Error(result.error.code==="23505"?"That microchip number is already registered.":"Unable to save pet record.");return result.data}
export async function archivePet(id,archived=true){const{error}=await supabase.from("pets").update({is_archived:archived,archived_at:archived?new Date().toISOString():null}).eq("id",id);if(error)throw new Error("Unable to update archive status.")}
export async function uploadPetPhoto(file,ownerId){if(!file)return null;validateImageFile(file);const ext=file.name.split('.').pop();const path=`${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const{error}=await supabase.storage.from("pet-photos").upload(path,file,{upsert:false});if(error)throw new Error("Unable to upload pet photo. Check the pet-photos storage bucket.");return supabase.storage.from("pet-photos").getPublicUrl(path).data.publicUrl}
export async function getPetAppointments(petId){const{data,error}=await supabase.from("appointments").select("id,appointment_date,start_time,status,visit_reason,veterinarian:profiles!appointments_veterinarian_id_fkey(full_name)").eq("pet_id",petId).order("appointment_date",{ascending:false});if(error)throw new Error("Unable to load appointment history.");return data||[]}
