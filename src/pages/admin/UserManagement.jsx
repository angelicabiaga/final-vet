import React, { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Mail, Pencil, Plus, Search, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";
import AppShell from "../../components/AppShell";
import PasswordInput from "../../components/PasswordInput";
import PasswordChecklist from "../../components/PasswordChecklist";
import { validatePassword, validatePasswordsMatch, isValidPhMobile, INVALID_PH_MOBILE_MESSAGE, sanitizePhoneInput } from "../../utils/validators";
import { focusFirstInvalidField, invalidClass } from "../../utils/formValidation";
import { createManagedUser, editUserDetails, fetchUsers, sendNewCredentials, updateUserAccount } from "../../services/userManagementService";
import { generateTempPassword } from "../../services/appointmentService";
import { getVerificationStatusesBulk } from "../../services/veterinarianVerificationService";
import VeterinarianProfileDetail from "../../components/VeterinarianProfileDetail";
import { VerificationStatusBadge } from "../../components/VeterinarianVerificationPanel";

const emptyForm = { firstName:"", middleName:"", lastName:"", username:"", email:"", password:"", confirmPassword:"", phone:"", address:"", role:"staff" };

function validateCreateUserField(name, value, form) {
  switch (name) {
    case "firstName": return String(value||"").trim() ? "" : "First name is required.";
    case "lastName": return String(value||"").trim() ? "" : "Last name is required.";
    case "username": {
      const trimmed = String(value||"").trim();
      if (!trimmed) return "Username is required.";
      return /^[a-z0-9_.-]{3,30}$/i.test(trimmed) ? "" : "Username must be 3-30 characters (letters, numbers, . _ - only).";
    }
    case "email": {
      const trimmed = String(value||"").trim();
      if (!trimmed) return "Email is required.";
      return /^\S+@\S+\.\S+$/.test(trimmed) ? "" : "Please enter a valid email address.";
    }
    case "password":
      try { validatePassword(value); return ""; } catch (e) { return e.message; }
    case "confirmPassword":
      try { validatePasswordsMatch(form.password, value); return ""; } catch (e) { return e.message; }
    case "phone": {
      if (!String(value||"").trim()) return "Phone number is required.";
      return isValidPhMobile(value) ? "" : INVALID_PH_MOBILE_MESSAGE;
    }
    default: return "";
  }
}
// profiles only stores full_name, so the Edit User form splits it back into
// first / middle / last: first word, last word, everything in between.
// A trailing Jr./Sr./II/III/IV/V is pulled out as the suffix first.
const NAME_SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const suffix = parts.length > 2 && NAME_SUFFIX.test(parts[parts.length - 1]) ? parts.pop() : "";
  if (parts.length <= 1) return { firstName: parts[0] || "", middleName: "", lastName: "", suffix };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1], suffix };
}

// The database requires an address on every Pet Owner account
// (pet_owner_address_required), so the form checks it first.
function validateEditUserField(name, value, form = {}) {
  if (name === "address") {
    return form.role === "pet_owner" && !String(value || "").trim() ? "Address is required for Pet Owner accounts." : "";
  }
  if (name === "phone") {
    if (!String(value || "").trim()) return "";
    return isValidPhMobile(value) ? "" : INVALID_PH_MOBILE_MESSAGE;
  }
  return validateCreateUserField(name, value, {});
}

// The table only displays the role; it's changed from the Edit User form.
const ROLE_LABELS = { admin: "Admin", staff: "Staff", veterinarian: "Veterinarian", pet_owner: "Pet Owner" };

const EDIT_REQUIRED_FIELDS = ["firstName", "lastName", "username", "email", "phone", "address"];

export default function UserManagement({ profile }) {
  const [users,setUsers]=useState([]), [loading,setLoading]=useState(true), [error,setError]=useState(""), [success,setSuccess]=useState("");
  const [search,setSearch]=useState(""), [role,setRole]=useState(""), [status,setStatus]=useState(""), [showForm,setShowForm]=useState(false), [form,setForm]=useState(emptyForm), [saving,setSaving]=useState(false);
  const [fieldErrors,setFieldErrors]=useState({});
  // Success toasts get a bold title; a new key per notice so repeating the
  // same message still shows a fresh toast.
  const [successTitle,setSuccessTitle]=useState(""), [successKey,setSuccessKey]=useState(0);
  function notify(title,message){setSuccessTitle(title);setSuccess(message);setSuccessKey(key=>key+1);}
  const fieldRefs=useRef({}).current;
  const registerFieldRef=(name)=>(el)=>{fieldRefs[name]=el;};
  const [verificationStatuses,setVerificationStatuses]=useState({});
  const [selectedVetId,setSelectedVetId]=useState(null);
  const [editUser,setEditUser]=useState(null), [editForm,setEditForm]=useState(null), [editErrors,setEditErrors]=useState({}), [editSaving,setEditSaving]=useState(false), [editError,setEditError]=useState("");
  const editFieldRefs=useRef({}).current;
  const registerEditRef=(name)=>(el)=>{editFieldRefs[name]=el;};
  const [credentialsUser,setCredentialsUser]=useState(null), [sendingCredentials,setSendingCredentials]=useState(false);
  function openEdit(user){
    setEditUser(user);
    setEditForm({ ...splitFullName(user.full_name), username:user.username||"", email:user.email||"", phone:user.phone||"", address:user.address||"", role:user.role });
    setEditErrors({});setEditError("");
  }
  function updateEditField(name,value){
    setEditForm(current=>({...current,[name]:value}));
    setEditErrors(current=>{
      const nextForm={...editForm,[name]:value};
      const next={...current};
      if(current[name]) next[name]=validateEditUserField(name,value,nextForm);
      if(name==="role"&&current.address) next.address=validateEditUserField("address",nextForm.address,nextForm);
      return next;
    });
  }
  async function submitEdit(e){
    e.preventDefault();
    if(editSaving)return;
    const errors={};
    EDIT_REQUIRED_FIELDS.forEach(name=>{const msg=validateEditUserField(name,editForm[name],editForm);if(msg)errors[name]=msg;});
    setEditErrors(errors);
    if(Object.keys(errors).length>0){setEditError("Please fix the highlighted field(s) before continuing.");focusFirstInvalidField(editFieldRefs,errors);return;}
    setEditSaving(true);setEditError("");
    try{
      const full_name=[editForm.firstName,editForm.middleName,editForm.lastName,editForm.suffix].map(part=>String(part||"").trim()).filter(Boolean).join(" ");
      await editUserDetails(editUser,{...editForm,full_name},profile);
      setEditUser(null);notify("User updated",`"${full_name}" was saved.`);setError("");await load();
    }catch(err){setEditError(err.message);}finally{setEditSaving(false);}
  }
  async function confirmSendCredentials(){
    if(!credentialsUser||sendingCredentials)return;
    setSendingCredentials(true);setError("");setSuccess("");
    try{
      await sendNewCredentials(credentialsUser,profile,generateTempPassword);
      notify("Credentials sent",`New login credentials were sent to ${credentialsUser.email}.`);
      setCredentialsUser(null);
    }catch(err){setError(err.message);setCredentialsUser(null);}finally{setSendingCredentials(false);}
  }
  function updateField(name,value){
    const nextForm={...form,[name]:value};
    setForm(nextForm);
    setFieldErrors(current=>{
      if(!current[name] && !(name==="password" && current.confirmPassword)) return current;
      const next={...current};
      if(current[name]) next[name]=validateCreateUserField(name,value,nextForm);
      if(name==="password" && current.confirmPassword) next.confirmPassword=validateCreateUserField("confirmPassword",form.confirmPassword,nextForm);
      return next;
    });
  }
  async function load(){
    setLoading(true);setError("");
    try{
      const rows=await fetchUsers({search,role,status});
      setUsers(rows);
      const vetIds=rows.filter(u=>u.role==="veterinarian").map(u=>u.id);
      setVerificationStatuses(await getVerificationStatusesBulk(vetIds));
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);
  const counts=useMemo(()=>({all:users.length,active:users.filter(x=>x.account_status==="active").length,staff:users.filter(x=>x.role==="staff").length,vets:users.filter(x=>x.role==="veterinarian").length}),[users]);
  async function changeUser(user,updates){setError("");setSuccess("");try{await updateUserAccount(user.id,updates,profile);notify(updates.account_status==="active"?"Account activated":updates.account_status==="inactive"?"Account deactivated":"User updated",`"${user.full_name}" was saved.`);await load();}catch(e){setError(e.message);}}
  useEffect(()=>{
    if(!showForm && !selectedVetId && !editUser)return;
    const original=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{document.body.style.overflow=original;};
  },[showForm,selectedVetId,editUser]);
  async function submit(e){
    e.preventDefault();
    if(saving)return;
    setError("");setSuccess("");
    const errors={};
    const allFieldRefs={};
    ["firstName","lastName","username","email","password","confirmPassword","phone"].forEach(name=>{
      const msg=validateCreateUserField(name,form[name],form);
      if(msg){errors[name]=msg;if(fieldRefs[name])allFieldRefs[name]=fieldRefs[name];}
    });
    setFieldErrors(errors);
    if(Object.keys(errors).length>0){
      setError("Please fix the highlighted field(s) before continuing.");
      focusFirstInvalidField(allFieldRefs,errors);
      return;
    }
    setSaving(true);
    try{
      const full_name=[form.firstName,form.middleName,form.lastName].map(part=>String(part||"").trim()).filter(Boolean).join(" ");
      await createManagedUser({...form,full_name},profile);
      setForm(emptyForm);setFieldErrors({});setShowForm(false);notify("Account created",`"${full_name}" was added.`);await load();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  return <AppShell profile={profile} title="User Management"><div className="um">
    
    {!showForm&&error&&<div className="alert error">{error}</div>}{!showForm&&success&&<div key={successKey} className="alert success" data-toast-title={successTitle||undefined}>{success}</div>}
    <div className="stats"><article><b>{counts.all}</b><span>Total users</span></article><article><b>{counts.active}</b><span>Active</span></article><article><b>{counts.staff}</b><span>Staff</span></article><article><b>{counts.vets}</b><span>Veterinarians</span></article></div>
    <div className="filters"><label><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, username, email..."/></label><select value={role} onChange={e=>setRole(e.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="veterinarian">Veterinarian</option><option value="pet_owner">Pet Owner</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button onClick={load}>Apply Filters</button></div>
    <div className="tableCard"><div className="tableHead"><h3>User Accounts</h3><div className="actions"><button onClick={()=>{setForm(emptyForm);setFieldErrors({});setShowForm(true);}}><Plus size={16}/> New Account</button></div></div><div className="tableWrap">{loading?<p>Loading users...</p>:users.length===0?<p>No user accounts found.</p>:<table><thead><tr><th>User</th><th>Contact</th><th>Role</th><th>Status</th><th>Created</th><th>Location</th><th>Actions</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.role==="veterinarian"?<button type="button" className="vet-name-link" onClick={()=>setSelectedVetId(u.id)}><strong>{u.full_name}</strong></button>:<strong>{u.full_name}</strong>}<small>@{u.username}</small>{u.role==="veterinarian"&&<div className="vet-row-badge"><VerificationStatusBadge status={verificationStatuses[u.id]||"Unverified"}/></div>}</td><td>{u.email}<small>{u.phone||"No phone"}</small></td><td><span className={`role-pill role-${u.role}`}>{ROLE_LABELS[u.role]||u.role||"—"}</span></td><td><span className={`badge ${u.account_status}`}>{u.account_status}</span></td><td>{u.created_at?new Date(u.created_at).toLocaleDateString():"—"}</td><td>{u.location||"Unknown"}</td><td><div className="row-actions"><button type="button" className="icon-btn edit-btn" title="Edit user" aria-label={`Edit ${u.full_name}`} onClick={()=>openEdit(u)}><Pencil size={15}/></button><button type="button" className="icon-btn mail-btn" title="Send new credentials" aria-label={`Send new credentials to ${u.full_name}`} onClick={()=>setCredentialsUser(u)}><Mail size={15}/></button>{u.role==="veterinarian"&&<button type="button" className="icon-btn review-btn" title="Review Profile & Verification" aria-label="Review Profile & Verification" onClick={()=>setSelectedVetId(u.id)}><Eye size={15}/></button>}{u.id===profile.id?<span className="muted">Current account</span>:<button type="button" className={`icon-btn ${u.account_status==="active"?"danger":"successBtn"}`} title={u.account_status==="active"?"Deactivate":"Activate"} aria-label={u.account_status==="active"?"Deactivate":"Activate"} onClick={()=>changeUser(u,{account_status:u.account_status==="active"?"inactive":"active"})}>{u.account_status==="active"?<UserX size={15}/>:<UserCheck size={15}/>}</button>}</div></td></tr>)}</tbody></table>}</div></div>
    {showForm&&<div className="overlay"><form className="modal" onSubmit={submit} noValidate><button type="button" className="close" onClick={()=>setShowForm(false)}><X/></button><h3><ShieldCheck size={22}/> Create Staff or Veterinarian</h3>{error&&<div className="alert error">{error}</div>}{success&&<div className="alert success">{success}</div>}<div className="grid">
      <label><span>First name<span className="required-mark"> *</span></span><input ref={registerFieldRef("firstName")} className={invalidClass(fieldErrors,"firstName")} required value={form.firstName} onChange={e=>updateField("firstName",e.target.value)}/>{fieldErrors.firstName && <span className="field-error-text">{fieldErrors.firstName}</span>}</label>
      <label><span>Last name<span className="required-mark"> *</span></span><input ref={registerFieldRef("lastName")} className={invalidClass(fieldErrors,"lastName")} required value={form.lastName} onChange={e=>updateField("lastName",e.target.value)}/>{fieldErrors.lastName && <span className="field-error-text">{fieldErrors.lastName}</span>}</label>
      <label><span>Middle name<span className="optional-mark"> (Optional)</span></span><input value={form.middleName} onChange={e=>updateField("middleName",e.target.value)}/></label>
      <label><span>Username<span className="required-mark"> *</span></span><input ref={registerFieldRef("username")} className={invalidClass(fieldErrors,"username")} required value={form.username} onChange={e=>updateField("username",e.target.value)}/>{fieldErrors.username && <span className="field-error-text">{fieldErrors.username}</span>}</label>
      <label><span>Email<span className="required-mark"> *</span></span><input ref={registerFieldRef("email")} className={invalidClass(fieldErrors,"email")} required type="email" value={form.email} onChange={e=>updateField("email",e.target.value)}/>{fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}</label>
      <label><span>Password<span className="required-mark"> *</span></span><PasswordInput ref={registerFieldRef("password")} className={invalidClass(fieldErrors,"password")} value={form.password} onChange={e=>updateField("password",e.target.value)} minLength={8} required />{fieldErrors.password && <span className="field-error-text">{fieldErrors.password}</span>}<PasswordChecklist password={form.password}/></label>
      <label><span>Confirm Password<span className="required-mark"> *</span></span><PasswordInput ref={registerFieldRef("confirmPassword")} className={invalidClass(fieldErrors,"confirmPassword")} value={form.confirmPassword} onChange={e=>updateField("confirmPassword",e.target.value)} minLength={8} required />{fieldErrors.confirmPassword && <span className="field-error-text">{fieldErrors.confirmPassword}</span>}</label>
      <label><span>Phone<span className="required-mark"> *</span></span><input ref={registerFieldRef("phone")} className={invalidClass(fieldErrors,"phone")} type="tel" inputMode="numeric" maxLength={11} required value={form.phone} onChange={e=>updateField("phone",sanitizePhoneInput(e.target.value))}/>{fieldErrors.phone && <span className="field-error-text">{fieldErrors.phone}</span>}</label>
      <label>Role<select value={form.role} onChange={e=>updateField("role",e.target.value)}><option value="staff">Staff</option><option value="veterinarian">Veterinarian</option></select></label>
      <label className="full"><span>Address<span className="optional-mark"> (Optional)</span></span><textarea value={form.address} onChange={e=>updateField("address",e.target.value)}/></label>
    </div><button disabled={saving}>{saving?"Creating...":"Create Account"}</button></form></div>}
    {editUser&&editForm&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!editSaving)setEditUser(null);}}><form className="modal edit-modal" onSubmit={submitEdit} noValidate><div className="edit-head"><h3>Edit User</h3><button type="button" className="edit-close" aria-label="Close" onClick={()=>setEditUser(null)} disabled={editSaving}><X size={18}/></button></div>{editError&&<div className="alert error">{editError}</div>}
      <div className="edit-name-row">
        <label><span>Last name</span><input ref={registerEditRef("lastName")} className={invalidClass(editErrors,"lastName")} value={editForm.lastName} onChange={e=>updateEditField("lastName",e.target.value)}/>{editErrors.lastName&&<span className="field-error-text">{editErrors.lastName}</span>}</label>
        <label><span>First name</span><input ref={registerEditRef("firstName")} className={invalidClass(editErrors,"firstName")} value={editForm.firstName} onChange={e=>updateEditField("firstName",e.target.value)}/>{editErrors.firstName&&<span className="field-error-text">{editErrors.firstName}</span>}</label>
        <label><span>M.I.</span><input value={editForm.middleName} onChange={e=>updateEditField("middleName",e.target.value)}/></label>
        <label><span>Suffix</span><input value={editForm.suffix} placeholder="Jr." onChange={e=>updateEditField("suffix",e.target.value)}/></label>
      </div>
      <label className="edit-field"><span>Email address</span><input ref={registerEditRef("email")} className={invalidClass(editErrors,"email")} type="email" value={editForm.email} onChange={e=>updateEditField("email",e.target.value)}/>{editErrors.email&&<span className="field-error-text">{editErrors.email}</span>}</label>
      <label className="edit-field"><span>Username</span><input ref={registerEditRef("username")} className={invalidClass(editErrors,"username")} value={editForm.username} onChange={e=>updateEditField("username",e.target.value)}/>{editErrors.username&&<span className="field-error-text">{editErrors.username}</span>}</label>
      <label className="edit-field"><span>Phone <em>(Optional)</em></span><input ref={registerEditRef("phone")} className={invalidClass(editErrors,"phone")} type="tel" inputMode="numeric" maxLength={11} value={editForm.phone} onChange={e=>updateEditField("phone",sanitizePhoneInput(e.target.value))}/>{editErrors.phone&&<span className="field-error-text">{editErrors.phone}</span>}</label>
      <label className="edit-field"><span>Role</span><select value={editForm.role} disabled={editUser.id===profile.id} onChange={e=>updateEditField("role",e.target.value)}><option value="admin">Admin</option><option value="staff">Staff</option><option value="veterinarian">Veterinarian</option><option value="pet_owner">Pet Owner</option></select>{editUser.id===profile.id&&<small>You can&apos;t change your own role.</small>}</label>
      <label className="edit-field"><span>Address {editForm.role==="pet_owner"?<span className="required-mark">*</span>:<em>(Optional)</em>}</span><textarea ref={registerEditRef("address")} className={invalidClass(editErrors,"address")} value={editForm.address} onChange={e=>updateEditField("address",e.target.value)}/>{editErrors.address&&<span className="field-error-text">{editErrors.address}</span>}</label>
      <div className="edit-actions"><button type="button" className="edit-cancel" onClick={()=>setEditUser(null)} disabled={editSaving}>Cancel</button><button className="edit-save" disabled={editSaving}>{editSaving?"Saving...":"Save Changes"}</button></div></form></div>}
    <ConfirmDialog
      open={!!credentialsUser}
      title="Send new credentials?"
      description={credentialsUser?<>A new temporary password will be generated for <b>"{credentialsUser.full_name}"</b> and sent to <b>{credentialsUser.email}</b>. Their current password will stop working immediately.</>:""}
      confirmLabel={sendingCredentials?"Sending...":"Send Credentials"}
      cancelLabel="Cancel"
      tone="primary"
      icon={Mail}
      busy={sendingCredentials}
      onConfirm={confirmSendCredentials}
      onCancel={()=>setCredentialsUser(null)}
    />
    {selectedVetId&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedVetId(null);}}><div className="modal vet-modal"><div className="vet-modal-head"><h3>Veterinarian Profile</h3><button type="button" onClick={()=>setSelectedVetId(null)}><X size={18}/></button></div><div className="vet-modal-body"><VeterinarianProfileDetail vetId={selectedVetId} viewerProfile={profile}/></div></div></div>}
    <style>{`.um{display:grid;gap:14px}.toolbar{display:flex;justify-content:flex-end;gap:14px;align-items:center}.toolbar h2{margin:0}.toolbar p,.muted,small{color:#6F7F88}.actions{display:flex;gap:9px}button{border:0;background:#4DA8DA;color:white;border-radius:10px;padding:10px 14px;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.secondary{background:#eaf7fb;color:#2688b7}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.stats article,.filters,.tableCard{background:white;border-radius:14px;padding:14px;box-shadow:0 7px 22px rgba(47,117,150,.08)}.stats b{font-size:27px;display:block;color:#318fbe}.stats span{color:#6F7F88}.filters{display:flex;gap:10px}.filters label{display:flex;align-items:center;gap:8px;flex:1;border:1px solid #d9e9ef;border-radius:10px;padding:0 10px}.filters label:focus-within{border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(67,143,181,.12)}.filters input{border:0!important;outline:0;flex:1;background:transparent!important;box-shadow:none!important}.filters select,.grid input,.grid select,.grid textarea,td select{border:1px solid #d9e9ef;border-radius:9px;padding:10px;background:white}.tableCard{padding:0!important;overflow:hidden}.tableWrap{overflow-x:auto;padding:4px 14px 14px}.tableHead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 22px;background:linear-gradient(115deg,#2c7fb8,#1f5f8f);color:#fff}.tableHead h3{margin:0;font-size:18px;color:#fff}.tableHead .actions button{border-radius:999px;padding:9px 18px;font-weight:700;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.45)}.tableHead .actions button:hover{background:rgba(255,255,255,.24)}table{width:100%;min-width:940px;border-collapse:collapse}th,td{text-align:left;padding:11px 12px;border-bottom:1px solid #edf4f7}td small{display:block;margin-top:4px}.row-actions{display:flex;align-items:center;gap:6px}.icon-btn{width:32px;height:32px;padding:0!important;flex-shrink:0;justify-content:center}.review-btn{background:#eaf7fb!important;color:#2688b7!important}.edit-btn{background:#e6f4fb!important;color:#2c7fb8!important}.mail-btn{background:#e7effd!important;color:#2f6fd6!important}.edit-modal{width:min(560px,100%);padding:28px 32px;border-radius:22px;display:grid;gap:16px}.edit-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.edit-head h3{margin:0;padding:0;font-size:22px;color:#1d3a4a}.edit-close{width:40px;height:40px;padding:0!important;justify-content:center;border-radius:50%!important;background:#eef7fa!important;color:#2c6b8a!important}.edit-modal label{display:grid;gap:7px;font-weight:600}.edit-modal label>span{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#2c6b8a}.edit-modal label>span em{font-style:normal;font-weight:600;text-transform:none;letter-spacing:0;color:#7b909b}.edit-name-row{display:grid;grid-template-columns:1.4fr 1.4fr .8fr .8fr;gap:12px;align-items:start}.edit-modal input,.edit-modal select,.edit-modal textarea{width:100%;box-sizing:border-box;border:1px solid #d6e9f1;border-radius:12px;padding:12px 14px;background:#f4fafd;font:inherit;font-size:15px;color:#1d3a4a}.edit-modal input:focus,.edit-modal select:focus,.edit-modal textarea:focus{outline:0;border-color:#4DA8DA;background:#fff;box-shadow:0 0 0 3px rgba(77,168,218,.15)}.edit-modal select:disabled{opacity:.7;cursor:not-allowed}.edit-modal textarea{min-height:80px;resize:vertical}.edit-modal small{color:#7b909b;font-weight:500}.edit-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:6px}.edit-cancel,.edit-save{border-radius:999px!important;padding:12px 26px!important;font-weight:700;font-size:15px}.edit-cancel{background:#f1f6f8!important;color:#456572!important;border:1px solid #dbe8ee!important}.edit-save{background:#2c7fb8!important;color:#fff!important}.edit-save:disabled,.edit-cancel:disabled{opacity:.6;cursor:not-allowed}@media(max-width:560px){.edit-name-row{grid-template-columns:1fr 1fr}.edit-modal{padding:22px 18px}}.role-pill{display:inline-block;padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap;background:#eef4f7;color:#456572}.role-admin{background:#fdeee6;color:#b5541c}.role-staff{background:#e6f4fb;color:#2c7fb8}.role-veterinarian{background:#e9f7ef;color:#25814f}.role-pet_owner{background:#f3effb;color:#6a4fb0}.badge{padding:5px 9px;border-radius:999px;font-size:12px}.badge.active{background:#e7f7ee;color:#278454}.badge.inactive{background:#fff0f0;color:#bd4f4f}.danger{background:#E76F6F}.successBtn{background:#4CAF78}.alert{padding:12px;border-radius:10px;margin-top:14px}.alert.error{background:#fff0f0;color:#a94444}.alert.success{background:#e9f8ef;color:#27794b}.overlay{position:fixed;inset:0;background:#17303b88;display:grid;place-items:center;z-index:100;padding:20px}.modal{background:white;border-radius:16px;padding:22px;width:min(680px,100%);max-height:90vh;overflow-y:auto;box-sizing:border-box;position:relative}.modal h3{display:flex;align-items:center;gap:9px;margin:0;padding-right:36px;color:#20313b}.close{position:absolute;right:15px;top:15px;background:#eef7fa;color:#456}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0;align-items:start}.grid label{display:grid;gap:6px;font-weight:600}.grid .full{grid-column:1/-1}.grid textarea{min-height:80px}.vet-name-link{background:none!important;color:#213944;padding:0!important;border-radius:0;font:inherit;text-align:left;cursor:pointer}.vet-name-link strong{text-decoration:underline;text-decoration-color:#cfe4ed}.vet-row-badge{margin-top:4px}.vet-modal{width:min(920px,100%);padding:0;display:flex;flex-direction:column;overflow:hidden}.vet-modal-head{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #edf4f7}.vet-modal-head h3{margin:0;color:#20313b}.vet-modal-head button{background:#eef7fa!important;color:#456!important;padding:7px!important;border-radius:9px}.vet-modal-body{overflow-y:auto;min-height:0;padding:20px 22px}@media(max-width:800px){.toolbar,.filters{align-items:stretch;flex-direction:column}.stats{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}.grid .full{grid-column:auto}}`}</style>
  </div></AppShell>;
}
