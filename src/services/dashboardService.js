import { supabase } from "../config/supabaseClient";
import { getQueue } from "./queueService";

const today = () => new Date().toISOString().slice(0, 10);

async function safeQuery(query, fallback = []) {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn("Dashboard query skipped:", error.code, error.message);
      return fallback;
    }
    return data ?? fallback;
  } catch (error) {
    console.warn("Dashboard query failed:", error);
    return fallback;
  }
}

// Reuses Queue Management's own getQueue() -- same table, same queue_date
// (clinic-local, defaults inside getQueue), same status values, same join
// data, and the same manual-order/priority sort. A failure here is kept
// separate from the rest of the dashboard so one bad query doesn't blank
// out appointments/pets/inventory too, but it is surfaced as a real error
// instead of being swallowed into an empty list.
async function loadQueue(role, profileId) {
  const filters = {};
  if (role === "veterinarian") filters.veterinarianId = profileId;
  if (role === "pet_owner") filters.ownerId = profileId;
  try {
    return { queues: await getQueue(filters), queueError: null };
  } catch (error) {
    console.error("Dashboard queue load failed:", error);
    return { queues: [], queueError: error.message || "Unable to load the live queue." };
  }
}

export async function loadDashboardData(profile) {
  const role = profile?.role;
  const profileId = profile?.id;
  const currentDate = today();

  const petQuery = role === "pet_owner"
    ? supabase.from("pets").select("id, pet_name, species, breed, photo_url, is_archived, created_at").eq("owner_id", profileId).order("created_at", { ascending: false })
    : supabase.from("pets").select("id, pet_name, species, breed, owner_id, is_archived, created_at").order("created_at", { ascending: false }).limit(100);

  let appointmentQuery = supabase.from("appointments").select("id, pet_id, owner_id, veterinarian_id, appointment_date, start_time, status, appointment_source, visit_reason, created_at").order("appointment_date", { ascending: false }).limit(100);
  if (role === "pet_owner") appointmentQuery = appointmentQuery.eq("owner_id", profileId);
  if (role === "veterinarian") appointmentQuery = appointmentQuery.eq("veterinarian_id", profileId);

  let medicalQuery = supabase.from("medical_records").select("id, pet_id, owner_id, veterinarian_id, consultation_date, diagnosis, record_status, created_at").order("consultation_date", { ascending: false }).limit(50);
  if (role === "pet_owner") medicalQuery = medicalQuery.eq("owner_id", profileId).eq("record_status", "Finalized");
  if (role === "veterinarian") medicalQuery = medicalQuery.eq("veterinarian_id", profileId);

  const [profiles, pets, appointments, queueResult, inventory, medicalRecords, logs, participants] = await Promise.all([
    safeQuery(supabase.from("profiles").select("id, full_name, role, account_status, created_at").order("created_at", { ascending: false }).limit(100)),
    safeQuery(petQuery),
    safeQuery(appointmentQuery),
    loadQueue(role, profileId),
    safeQuery(supabase.from("inventory_items").select("id, item_name, quantity, reorder_level, status, expiry_date, updated_at").order("updated_at", { ascending: false }).limit(100)),
    safeQuery(medicalQuery),
    safeQuery(
      role === "pet_owner" && profileId
        ? supabase.from("activity_logs").select("id, user_id, action, module, description, created_at").eq("user_id", profileId).order("created_at", { ascending: false }).limit(8)
        : supabase.from("activity_logs").select("id, user_id, action, module, description, created_at").order("created_at", { ascending: false }).limit(8)
    ),
    profileId ? safeQuery(supabase.from("conversation_participants").select("conversation_id, last_read_at").eq("profile_id", profileId)) : Promise.resolve([])
  ]);

  const conversationIds = participants.map((item) => item.conversation_id).filter(Boolean);
  const messages = conversationIds.length
    ? await safeQuery(supabase.from("messages").select("id, conversation_id, sender_id, message_text, created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(100))
    : [];

  return {
    currentDate, profiles, pets, appointments,
    queues: queueResult.queues, queueError: queueResult.queueError,
    inventory, medicalRecords, logs, participants, messages
  };
}
