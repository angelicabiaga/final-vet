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
  const username = values.username.trim();
  const email = values.email.trim().toLowerCase();

  // Same pre-check registerPetOwner() uses -- surfaces a friendly message
  // instead of the raw "duplicate key value violates unique constraint
  // profiles_email_key" error from the insert below.
  const { data: existing, error: checkError } = await supabase.from("profiles").select("id, username, email").or(`username.eq.${username},email.eq.${email}`).limit(1);
  if (checkError) throw new Error("Unable to check the account details. Please try again.");
  if (existing?.length) throw new Error("That username or email is already registered.");

  const payload = {
    auth_user_id: null,
    full_name: fullName,
    username,
    email,
    password: values.password,
    phone: values.phone?.trim() || null,
    address: values.address?.trim() || null,
    role: values.role,
    account_status: "active"
  };
  const { data, error } = await supabase.from("profiles").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505") throw new Error("That username or email is already registered.");
    throw new Error(`Unable to create account: ${error.message}`);
  }
  await supabase.from("activity_logs").insert({ user_id: actor?.id || null, role: actor?.role || "admin", action: "Account Creation", module: "User Management", related_record: data.id, description: `Created ${values.role} account for ${values.full_name}` }).then(() => {}).catch(() => {});
  return data;
}

// Admin "Edit User": name, username, email, phone, address and role. Same
// uniqueness rules as account creation, checked against every *other* user.
export async function editUserDetails(user, values, actor) {
  const fullName = String(values.full_name || "").trim();
  if (fullName.split(/\s+/).filter(Boolean).length < 2) throw new Error("First name and last name are both required.");
  const username = String(values.username || "").trim();
  if (!/^[a-z0-9_.-]{3,30}$/i.test(username)) throw new Error("Username must be 3-30 characters (letters, numbers, . _ - only).");
  const email = String(values.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  const phone = String(values.phone || "").trim();
  if (phone && !isValidPhMobile(phone)) throw new Error(INVALID_PH_MOBILE_MESSAGE);

  const { data: existing, error: checkError } = await supabase.from("profiles").select("id").or(`username.eq.${username},email.eq.${email}`).neq("id", user.id).limit(1);
  if (checkError) throw new Error("Unable to check the account details. Please try again.");
  if (existing?.length) throw new Error("That username or email is already used by another account.");

  const updates = { full_name: fullName, username, email, phone: phone || null, address: String(values.address || "").trim() || null };
  // An admin can never change their own role from here.
  if (values.role && user.id !== actor?.id) updates.role = values.role;

  try {
    return await updateUserAccount(user.id, updates, actor);
  } catch (error) {
    if (/23505|duplicate/i.test(error.message)) throw new Error("That username or email is already used by another account.");
    throw error;
  }
}

// "Send new credentials": replaces the user's password with a new temporary
// one, emails it, and makes them set their own password at next login. If the
// email can't be sent the old password is put back, so nobody is locked out
// by a password they never received.
export async function sendNewCredentials(user, actor, generateTempPassword) {
  if (!user?.email) throw new Error("This account has no email address to send credentials to.");

  const { data: current, error: loadError } = await supabase.from("profiles").select("password, must_change_password").eq("id", user.id).single();
  if (loadError) throw new Error("Unable to load the account. Please try again.");

  const tempPassword = generateTempPassword();
  const { error: updateError } = await supabase.from("profiles").update({ password: tempPassword, must_change_password: true, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (updateError) throw new Error(`Unable to reset the password: ${updateError.message}`);

  const { data, error } = await supabase.functions.invoke("send-account-credentials-email", {
    body: { email: user.email, fullName: user.full_name, username: user.username, role: user.role, tempPassword },
  });
  let sendError = data?.error || "";
  if (error) {
    sendError = error.message || "Unable to send the credentials email.";
    try {
      const body = await error.context?.json();
      sendError = body?.error || body?.message || sendError;
    } catch {}
  }
  if (sendError) {
    await supabase.from("profiles").update({ password: current.password, must_change_password: current.must_change_password, updated_at: new Date().toISOString() }).eq("id", user.id);
    throw new Error(`${sendError} The password was not changed.`);
  }

  await supabase.from("activity_logs").insert({ user_id: actor?.id || null, role: actor?.role || "admin", action: "Credentials Reset", module: "User Management", related_record: user.id, description: `Sent new temporary credentials to ${user.email}` }).then(() => {}).catch(() => {});
}
