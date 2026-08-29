import { supabase } from "../config/supabaseClient";
import { validatePassword, isValidPhMobile, INVALID_PH_MOBILE_MESSAGE } from "../utils/validators";

export async function fetchUsers({ search = "", role = "", status = "" } = {}) {
  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (role) query = query.eq("role", role);
  if (status) query = query.eq("account_status", status);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load users: ${error.message}`);
  const term = search.trim().toLowerCase();
  return term ? (data || []).filter(u => [u.full_name,u.username,u.email,u.phone].some(v => String(v||"").toLowerCase().includes(term))) : (data || []);
}

export async function updateUserAccount(id, updates, actor) {
  const { data, error } = await supabase.from("profiles").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw new Error(`Unable to update account: ${error.message}`);
  await supabase.from("activity_logs").insert({ user_id: actor?.id || null, role: actor?.role || "admin", action: "Account Update", module: "User Management", related_record: id, description: `Updated account fields: ${Object.keys(updates).join(", ")}`, created_at: new Date().toISOString() }).then(() => {}).catch(() => {});
  return data;
}

export async function createManagedUser(values, actor) {
  const fullName = String(values.full_name || "").trim();
  if (fullName.split(/\s+/).filter(Boolean).length < 2) throw new Error("First name and last name are both required.");
  validatePassword(values.password);
  if (values.phone?.trim() && !isValidPhMobile(values.phone)) throw new Error(INVALID_PH_MOBILE_MESSAGE);
  const payload = {
    auth_user_id: null,
    full_name: fullName,
    username: values.username.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    phone: values.phone?.trim() || null,
    address: values.address?.trim() || null,
    role: values.role,
    account_status: "active"
  };
  const { data, error } = await supabase.from("profiles").insert(payload).select("*").single();
  if (error) throw new Error(`Unable to create account: ${error.message}`);
  await supabase.from("activity_logs").insert({ user_id: actor?.id || null, role: actor?.role || "admin", action: "Account Creation", module: "User Management", related_record: data.id, description: `Created ${values.role} account for ${values.full_name}` }).then(() => {}).catch(() => {});
  return data;
}
