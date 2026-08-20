import React, { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import AppShell from "../../components/AppShell";
import PasswordInput from "../../components/PasswordInput";
import PasswordChecklist from "../../components/PasswordChecklist";
import { validatePassword, validatePasswordsMatch, validateRequiredName } from "../../utils/validators";
import { createManagedUser, fetchUsers, updateUserAccount } from "../../services/userManagementService";
import { getVerificationStatusesBulk } from "../../services/veterinarianVerificationService";
import VeterinarianProfileDetail from "../../components/VeterinarianProfileDetail";
import { VerificationStatusBadge } from "../../components/VeterinarianVerificationPanel";

const emptyForm = { firstName:"", middleName:"", lastName:"", username:"", email:"", password:"", confirmPassword:"", phone:"", address:"", role:"staff" };
export default function UserManagement({ profile }) {
  const [users,setUsers]=useState([]), [loading,setLoading]=useState(true), [error,setError]=useState(""), [success,setSuccess]=useState("");
  const [search,setSearch]=useState(""), [role,setRole]=useState(""), [status,setStatus]=useState(""), [showForm,setShowForm]=useState(false), [form,setForm]=useState(emptyForm), [saving,setSaving]=useState(false);
  const [verificationStatuses,setVerificationStatuses]=useState({});
  const [selectedVetId,setSelectedVetId]=useState(null);
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
  async function changeUser(user,updates){setError("");setSuccess("");try{await updateUserAccount(user.id,updates,profile);setSuccess("Account updated successfully.");await load();}catch(e){setError(e.message);}}
  useEffect(()=>{
    if(!showForm && !selectedVetId)return;
    const original=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{document.body.style.overflow=original;};
  },[showForm,selectedVetId]);
  async function submit(e){
    e.preventDefault();
    if(saving)return;
    setError("");setSuccess("");
    try{
      validateRequiredName(form.firstName,form.lastName);
      validatePassword(form.password);
      validatePasswordsMatch(form.password,form.confirmPassword);
    }catch(validationError){setError(validationError.message);return;}
    setSaving(true);
    try{
      const full_name=[form.firstName,form.middleName,form.lastName].map(part=>String(part||"").trim()).filter(Boolean).join(" ");
      await createManagedUser({...form,full_name},profile);
      setForm(emptyForm);setShowForm(false);setSuccess("Account created successfully.");await load();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  return <AppShell profile={profile} title="User Management"><div className="um">
    <div className="toolbar"><div><h2>Accounts and Roles</h2><p>Create staff and veterinarian accounts, assign roles, and manage account access.</p></div><div className="actions"><button className="secondary" onClick={load}><RefreshCw size={16}/> Refresh</button><button onClick={()=>setShowForm(true)}><Plus size={16}/> New Account</button></div></div>
    {error&&<div className="alert error">{error}</div>}{success&&<div className="alert success">{success}</div>}
    <div className="stats"><article><b>{counts.all}</b><span>Total users</span></article><article><b>{counts.active}</b><span>Active</span></article><article><b>{counts.staff}</b><span>Staff</span></article><article><b>{counts.vets}</b><span>Veterinarians</span></article></div>
    <div className="filters"><label><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, username, email..."/></label><select value={role} onChange={e=>setRole(e.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="veterinarian">Veterinarian</option><option value="pet_owner">Pet Owner</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button onClick={load}>Apply Filters</button></div>
    <div className="tableWrap">{loading?<p>Loading users...</p>:users.length===0?<p>No user accounts found.</p>:<table><thead><tr><th>User</th><th>Contact</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td>{u.role==="veterinarian"?<button type="button" className="vet-name-link" onClick={()=>setSelectedVetId(u.id)}><strong>{u.full_name}</strong></button>:<strong>{u.full_name}</strong>}<small>@{u.username}</small>{u.role==="veterinarian"&&<div className="vet-row-badge"><VerificationStatusBadge status={verificationStatuses[u.id]||"Unverified"}/></div>}</td><td>{u.email}<small>{u.phone||"No phone"}</small></td><td><select value={u.role} disabled={u.id===profile.id} onChange={e=>changeUser(u,{role:e.target.value})}><option value="admin">Admin</option><option value="staff">Staff</option><option value="veterinarian">Veterinarian</option><option value="pet_owner">Pet Owner</option></select></td><td><span className={`badge ${u.account_status}`}>{u.account_status}</span></td><td>{u.created_at?new Date(u.created_at).toLocaleDateString():"—"}</td><td>{u.id===profile.id?<span className="muted">Current account</span>:<button className={u.account_status==="active"?"danger":"successBtn"} onClick={()=>changeUser(u,{account_status:u.account_status==="active"?"inactive":"active"})}>{u.account_status==="active"?<><UserX size={15}/> Deactivate</>:<><UserCheck size={15}/> Activate</>}</button>}</td></tr>)}</tbody></table>}</div>
    {showForm&&<div className="overlay"><form className="modal" onSubmit={submit}><button type="button" className="close" onClick={()=>setShowForm(false)}><X/></button><ShieldCheck size={34}/><h3>Create Staff or Veterinarian</h3><div className="grid">
      <label>First name<input required value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></label>
      <label>Last name<input required value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label>
      <label>Middle name <small>(Optional)</small><input value={form.middleName} onChange={e=>setForm({...form,middleName:e.target.value})}/></label>
      <label>Username<input required value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label>
      <label>Email<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
      <label>Password<PasswordInput value={form.password} onChange={e=>setForm({...form,password:e.target.value})} minLength={8} required /><PasswordChecklist password={form.password}/></label>
      <label>Confirm Password<PasswordInput value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} minLength={8} required /></label>
      <label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
      <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="staff">Staff</option><option value="veterinarian">Veterinarian</option><option value="admin">Admin</option></select></label>
      <label className="full">Address<textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label>
    </div><button disabled={saving}>{saving?"Creating...":"Create Account"}</button></form></div>}
    {selectedVetId&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedVetId(null);}}><div className="modal vet-modal"><div className="vet-modal-head"><h3>Veterinarian Profile</h3><button type="button" onClick={()=>setSelectedVetId(null)}><X size={18}/></button></div><div className="vet-modal-body"><VeterinarianProfileDetail vetId={selectedVetId} viewerProfile={profile}/></div></div></div>}
    <style>{`.um{display:grid;gap:18px}.toolbar{display:flex;justify-content:space-between;gap:20px;align-items:center}.toolbar h2{margin:0}.toolbar p,.muted,small{color:#6F7F88}.actions{display:flex;gap:9px}button{border:0;background:#4DA8DA;color:white;border-radius:10px;padding:10px 14px;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.secondary{background:#eaf7fb;color:#2688b7}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.stats article,.filters,.tableWrap{background:white;border-radius:16px;padding:18px;box-shadow:0 7px 22px rgba(47,117,150,.08)}.stats b{font-size:27px;display:block;color:#318fbe}.stats span{color:#6F7F88}.filters{display:flex;gap:10px}.filters label{display:flex;align-items:center;gap:8px;flex:1;border:1px solid #d9e9ef;border-radius:10px;padding:0 10px}.filters label:focus-within{border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(67,143,181,.12)}.filters input{border:0!important;outline:0;flex:1;background:transparent!important;box-shadow:none!important}.filters select,.grid input,.grid select,.grid textarea,td select{border:1px solid #d9e9ef;border-radius:9px;padding:10px;background:white}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:13px;border-bottom:1px solid #edf4f7}td small{display:block;margin-top:4px}.badge{padding:5px 9px;border-radius:999px;font-size:12px}.badge.active{background:#e7f7ee;color:#278454}.badge.inactive{background:#fff0f0;color:#bd4f4f}.danger{background:#E76F6F}.successBtn{background:#4CAF78}.alert{padding:12px;border-radius:10px}.alert.error{background:#fff0f0;color:#a94444}.alert.success{background:#e9f8ef;color:#27794b}.overlay{position:fixed;inset:0;background:#17303b88;display:grid;place-items:center;z-index:100;padding:20px}.modal{background:white;border-radius:18px;padding:25px;width:min(680px,100%);max-height:90vh;overflow-y:auto;box-sizing:border-box;position:relative}.close{position:absolute;right:15px;top:15px;background:#eef7fa;color:#456}.grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin:18px 0}.grid label{display:grid;gap:6px;font-weight:600}.grid .full{grid-column:1/-1}.grid textarea{min-height:80px}.vet-name-link{background:none!important;color:#213944;padding:0!important;border-radius:0;font:inherit;text-align:left;cursor:pointer}.vet-name-link strong{text-decoration:underline;text-decoration-color:#cfe4ed}.vet-row-badge{margin-top:4px}.vet-modal{width:min(920px,100%);padding:0;display:flex;flex-direction:column;overflow:hidden}.vet-modal-head{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #edf4f7}.vet-modal-head h3{margin:0;color:#20313b}.vet-modal-head button{background:#eef7fa!important;color:#456!important;padding:7px!important;border-radius:9px}.vet-modal-body{overflow-y:auto;min-height:0;padding:20px 22px}@media(max-width:800px){.toolbar,.filters{align-items:stretch;flex-direction:column}.stats{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}.grid .full{grid-column:auto}}`}</style>
  </div></AppShell>;
}
