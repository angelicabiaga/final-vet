import React, { useEffect, useState } from "react";
import { Camera, Eye, EyeOff, LockKeyhole, Save, UserCircle } from "lucide-react";
import AppShell from "./AppShell";
import { changeOwnPassword, getProfile, subscribeProfile, updateProfile, uploadProfileAvatar } from "../services/profileService";

export default function UserProfileModule({ profile, title = "My Profile" }) {
  const [form, setForm] = useState({ full_name: "", username: "", email: "", phone: "", address: "", avatar_url: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await getProfile(profile.id);
        if (active) setForm({
          full_name: data.full_name || "", username: data.username || "", email: data.email || "",
          phone: data.phone || "", address: data.address || "", avatar_url: data.avatar_url || ""
        });
      } catch (error) {
        if (active) setMessage({ type: "error", text: error.message });
      } finally { if (active) setLoading(false); }
    }
    let unsubscribe = () => {};
    if (profile?.id) {
      load();
      unsubscribe = subscribeProfile(profile.id, (data) => {
        if (!active) return;
        setForm({
          full_name: data.full_name || "", username: data.username || "", email: data.email || "",
          phone: data.phone || "", address: data.address || "", avatar_url: data.avatar_url || ""
        });
      });
    }
    return () => { active = false; unsubscribe?.(); };
  }, [profile?.id]);

  function field(name, value) { setForm((current) => ({ ...current, [name]: value })); }

  async function saveDetails(event) {
    event.preventDefault(); setSaving(true); setMessage({ type: "", text: "" });
    try {
      const updated = await updateProfile(profile.id, form);
      setForm((current) => ({ ...current, ...updated }));
      setMessage({ type: "success", text: "Profile updated successfully." });
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setSaving(false); }
  }

  async function chooseAvatar(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true); setMessage({ type: "", text: "" });
    try {
      const avatar_url = await uploadProfileAvatar(profile.id, file);
      const updated = await updateProfile(profile.id, { ...form, avatar_url });
      setForm((current) => ({ ...current, avatar_url: updated.avatar_url }));
      setMessage({ type: "success", text: "Profile photo updated." });
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function savePassword(event) {
    event.preventDefault(); setMessage({ type: "", text: "" });
    if (passwords.next !== passwords.confirm) return setMessage({ type: "error", text: "New passwords do not match." });
    setSaving(true);
    try {
      await changeOwnPassword(profile.id, passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      setMessage({ type: "success", text: "Password changed successfully." });
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setSaving(false); }
  }

  const PasswordField = ({ name, label }) => <label>{label}<div className="passwordBox"><input type={show[name] ? "text" : "password"} value={passwords[name]} onChange={(e)=>setPasswords((p)=>({...p,[name]:e.target.value}))} required/><button type="button" onClick={()=>setShow((s)=>({...s,[name]:!s[name]}))}>{show[name]?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>;

  return <AppShell profile={profile} title={title}><div className="profilePage">
    {message.text && <div className={message.type}>{message.text}</div>}
    <section className="profileHero card">
      <div className="avatar">{form.avatar_url ? <img src={form.avatar_url} alt="Profile"/> : <UserCircle size={88}/>}<label className="camera"><Camera size={17}/><input type="file" accept="image/*" onChange={chooseAvatar}/></label></div>
      <div><h2>{form.full_name || profile.full_name}</h2><p>@{form.username || profile.username}</p><span>{String(profile.role || "").replaceAll("_", " ")}</span>{uploading && <small> Uploading photo...</small>}</div>
    </section>
    {loading ? <div className="card">Loading profile...</div> : <div className="columns">
      <form className="card form" onSubmit={saveDetails}><h3><UserCircle size={20}/> Personal Information</h3>
        <label>Full name<input value={form.full_name} onChange={(e)=>field("full_name",e.target.value)} required/></label>
        <div className="pair"><label>Username<input value={form.username} onChange={(e)=>field("username",e.target.value)} required/></label><label>Email<input type="email" value={form.email} onChange={(e)=>field("email",e.target.value)} required/></label></div>
        <label>Phone number<input value={form.phone} onChange={(e)=>field("phone",e.target.value)} placeholder="Optional"/></label>
        <label>Address<textarea value={form.address} onChange={(e)=>field("address",e.target.value)} placeholder="Optional"/></label>
        <button disabled={saving}><Save size={17}/>{saving?"Saving...":"Save Profile"}</button>
      </form>
      <form className="card form" onSubmit={savePassword}><h3><LockKeyhole size={20}/> Change Password</h3>
        <PasswordField name="current" label="Current password"/><PasswordField name="next" label="New password"/><PasswordField name="confirm" label="Confirm new password"/>
        <button disabled={saving}><LockKeyhole size={17}/>{saving?"Saving...":"Change Password"}</button>
        <p className="note">Use at least six characters. All password fields include eye masking.</p>
      </form>
    </div>}
    <style>{`.profilePage{display:grid;gap:18px}.profileHero{display:flex;align-items:center;gap:20px}.avatar{width:112px;height:112px;border-radius:50%;background:#e6f6fc;color:#4DA8DA;display:grid;place-items:center;position:relative;overflow:visible}.avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover}.camera{position:absolute;right:0;bottom:3px;background:#4DA8DA;color:#fff;width:34px;height:34px;border-radius:50%;display:grid!important;place-items:center;cursor:pointer}.camera input{display:none}.profileHero h2{margin:0 0 5px}.profileHero p{margin:0 0 9px;color:#6F7F88}.profileHero span{background:#e7f6fc;color:#267fa9;padding:6px 10px;border-radius:999px;text-transform:capitalize;font-size:12px}.columns{display:grid;grid-template-columns:1.25fr .85fr;gap:18px}.form{display:grid;gap:13px}.form h3{display:flex;align-items:center;gap:8px;margin:0 0 6px}.form label{display:grid;gap:6px;font-size:13px;font-weight:700}.form input,.form textarea{width:100%;border:1px solid #d8e8ef;border-radius:10px;padding:11px;font:inherit}.form textarea{min-height:100px;resize:vertical}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.form>button{justify-self:start;border:0;border-radius:10px;padding:11px 15px;background:#4DA8DA;color:#fff;display:flex;align-items:center;gap:7px;cursor:pointer}.passwordBox{display:flex;border:1px solid #d8e8ef;border-radius:10px;overflow:hidden}.passwordBox input{border:0}.passwordBox button{border:0;background:#fff;color:#54707d;padding:0 12px;cursor:pointer}.note{font-size:12px;color:#6F7F88}.error,.success{padding:12px 14px;border-radius:11px}.error{background:#fff0f0;color:#a94444}.success{background:#eaf8ef;color:#28794c}@media(max-width:850px){.columns{grid-template-columns:1fr}.pair{grid-template-columns:1fr}.profileHero{align-items:flex-start}.avatar{width:90px;height:90px}}`}</style>
  </div></AppShell>;
}
