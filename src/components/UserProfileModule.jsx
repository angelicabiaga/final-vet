import React, { useEffect, useRef, useState } from "react";
import { Camera, Eye, EyeOff, LockKeyhole, Save, UserCircle } from "lucide-react";
import AppShell from "./AppShell";
import OtpModal from "./OtpModal";
import { confirmPasswordChange, confirmProfileEmailChange, getProfile, requestPasswordChange, requestProfileUpdate, updateProfile, uploadProfileAvatar } from "../services/profileService";
import PasswordChecklist from "./PasswordChecklist";
import { isValidPhMobile, INVALID_PH_MOBILE_MESSAGE, validateImageFile, validateRequiredName, validatePassword, validatePasswordsMatch } from "../utils/validators";

function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
}

function joinFullName({ firstName, middleName, lastName }) {
  return [firstName, middleName, lastName].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

export default function UserProfileModule({ profile, title = "My Profile" }) {
  const [form, setForm] = useState({ firstName: "", middleName: "", lastName: "", username: "", email: "", phone: "", address: "", avatar_url: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [otpModal, setOtpModal] = useState({ open: false, email: "", purpose: "", title: "" });
  const passwordSectionRef = useRef(null);
  const forcePasswordChange = !!profile?.must_change_password;
  const isOwner = profile?.role === "pet_owner";

  useEffect(() => {
    if (forcePasswordChange) passwordSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [forcePasswordChange]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await getProfile(profile.id);
        if (active) setForm({
          ...splitFullName(data.full_name), username: data.username || "", email: data.email || "",
          phone: data.phone || "", address: data.address || "", avatar_url: data.avatar_url || ""
        });
      } catch (error) {
        if (active) setMessage({ type: "error", text: error.message });
      } finally { if (active) setLoading(false); }
    }
    if (profile?.id) load();
    return () => { active = false; };
  }, [profile?.id]);

  function field(name, value) { setForm((current) => ({ ...current, [name]: value })); }

  async function saveDetails(event) {
    event.preventDefault(); setMessage({ type: "", text: "" });
    try {
      validateRequiredName(form.firstName, form.lastName);
    } catch (validationError) {
      return setMessage({ type: "error", text: validationError.message });
    }
    if (isOwner) {
      const trimmedPhone = form.phone.trim();
      if (!trimmedPhone) return setMessage({ type: "error", text: "Contact number is required." });
      if (!isValidPhMobile(trimmedPhone)) return setMessage({ type: "error", text: INVALID_PH_MOBILE_MESSAGE });
    }
    setSaving(true);
    try {
      const result = await requestProfileUpdate(profile.id, { ...form, full_name: joinFullName(form) }, profile.role);
      if (result.requiresOtp) {
        setOtpModal({ open: true, email: result.email, purpose: "change_email", title: "Verify Email Change" });
        setMessage({ type: "success", text: "OTP sent to your new email address." });
      } else {
        setForm((current) => ({ ...current, ...result.updated, ...splitFullName(result.updated.full_name) }));
        setMessage({ type: "success", text: "Profile updated successfully." });
      }
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setSaving(false); }
  }

  async function chooseAvatar(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setMessage({ type: "", text: "" });
    try {
      validateImageFile(file);
    } catch (error) {
      event.target.value = "";
      return setMessage({ type: "error", text: error.message });
    }
    setUploading(true);
    try {
      const avatar_url = await uploadProfileAvatar(profile.id, file);
      const updated = await updateProfile(profile.id, { ...form, full_name: joinFullName(form), avatar_url }, profile.role);
      setForm((current) => ({ ...current, avatar_url: updated.avatar_url }));
      setMessage({ type: "success", text: "Profile photo updated." });
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function savePassword(event) {
    event.preventDefault(); setMessage({ type: "", text: "" });
    try {
      validatePassword(passwords.next);
      validatePasswordsMatch(passwords.next, passwords.confirm);
    } catch (validationError) {
      return setMessage({ type: "error", text: validationError.message });
    }
    setSaving(true);
    try {
      const result = await requestPasswordChange(profile.id, passwords.current, passwords.next);
      setOtpModal({ open: true, email: result.email, purpose: "change_password", title: "Verify Password Change" });
      setMessage({ type: "success", text: "OTP sent to your registered email." });
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setSaving(false); }
  }


  async function verifyProfileOtp(code) {
    if (otpModal.purpose === "change_email") {
      const updated = await confirmProfileEmailChange(code);
      setForm((current) => ({ ...current, ...updated, ...splitFullName(updated.full_name) }));
      setMessage({ type: "success", text: "Email and profile updated successfully." });
    } else if (otpModal.purpose === "change_password") {
      await confirmPasswordChange(code);
      setPasswords({ current: "", next: "", confirm: "" });
      setMessage({ type: "success", text: "Password changed successfully." });
    }
    setOtpModal({ open: false, email: "", purpose: "", title: "" });
  }

  const PasswordField = ({ name, label }) => <label>{label}<div className="passwordBox"><input type={show[name] ? "text" : "password"} value={passwords[name]} onChange={(e)=>setPasswords((p)=>({...p,[name]:e.target.value}))} required/><button type="button" onClick={()=>setShow((s)=>({...s,[name]:!s[name]}))}>{show[name]?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>;

  return <AppShell profile={profile} title={title}><div className="profilePage">
    {forcePasswordChange && <div className="warn">You're using a temporary password. Please set a new password below to continue.</div>}
    {message.text && <div className={message.type}>{message.text}</div>}
    <section className="profileHero card">
      <div className="avatar">{form.avatar_url ? <img src={form.avatar_url} alt="Profile"/> : <UserCircle size={88}/>}<label className="camera"><Camera size={17}/><input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={chooseAvatar}/></label></div>
      <div><h2>{joinFullName(form) || profile.full_name}</h2><p>@{form.username || profile.username}</p><span>{String(profile.role || "").replaceAll("_", " ")}</span>{uploading && <small> Uploading photo...</small>}</div>
    </section>
    {loading ? <div className="card">Loading profile...</div> : <div className="columns">
      <form className="card form" onSubmit={saveDetails}><h3><UserCircle size={20}/> Personal Information</h3>
        <div className="pair"><label><span>First name<span className="required">*</span></span><input value={form.firstName} onChange={(e)=>field("firstName",e.target.value)} required/></label><label><span>Last name<span className="required">*</span></span><input value={form.lastName} onChange={(e)=>field("lastName",e.target.value)} required/></label></div>
        <label><span>Middle name <small>(Optional)</small></span><input value={form.middleName} onChange={(e)=>field("middleName",e.target.value)}/></label>
        <div className="pair"><label><span>Username<span className="required">*</span></span><input value={form.username} onChange={(e)=>field("username",e.target.value)} required/></label><label><span>Email<span className="required">*</span></span><input type="email" value={form.email} onChange={(e)=>field("email",e.target.value)} required/></label></div>
        {isOwner
          ? <label><span>Contact number<span className="required">*</span></span><input value={form.phone} onChange={(e)=>field("phone",e.target.value)} placeholder="09XXXXXXXXX or +639XXXXXXXXX" required/></label>
          : <label>Phone number<input value={form.phone} onChange={(e)=>field("phone",e.target.value)} placeholder="Optional"/></label>}
        <label>Address<textarea value={form.address} onChange={(e)=>field("address",e.target.value)} placeholder="Optional"/></label>
        <button disabled={saving}><Save size={17}/>{saving?"Saving...":"Save Profile"}</button>
      </form>
      <form className={`card form${forcePasswordChange ? " highlight" : ""}`} onSubmit={savePassword} ref={passwordSectionRef}><h3><LockKeyhole size={20}/> Change Password</h3>
        <PasswordField name="current" label="Current password"/>
        <PasswordField name="next" label="New password"/>
        <PasswordChecklist password={passwords.next}/>
        <PasswordField name="confirm" label="Confirm new password"/>
        <button disabled={saving}><LockKeyhole size={17}/>{saving?"Saving...":"Change Password"}</button>
        <p className="note">Each password field has its own show/hide button.</p>
      </form>
    </div>}
    <style>{`.profilePage{display:grid;gap:18px}.profileHero{display:flex;align-items:center;gap:20px}.avatar{width:112px;height:112px;border-radius:50%;background:#e6f6fc;color:#4DA8DA;display:grid;place-items:center;position:relative;overflow:visible}.avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover}.camera{position:absolute;right:0;bottom:3px;background:#4DA8DA;color:#fff;width:34px;height:34px;border-radius:50%;display:grid!important;place-items:center;cursor:pointer}.camera input{display:none}.profileHero h2{margin:0 0 5px}.profileHero p{margin:0 0 9px;color:#6F7F88}.profileHero span{background:#e7f6fc;color:#267fa9;padding:6px 10px;border-radius:999px;text-transform:capitalize;font-size:12px}.columns{display:grid;grid-template-columns:1.25fr .85fr;gap:18px}.form{display:grid;gap:13px}.form h3{display:flex;align-items:center;gap:8px;margin:0 0 6px}.form label{display:grid;gap:6px;font-size:13px;font-weight:700}.required{color:#d14b4b;margin-left:3px;font-weight:800}.form input,.form textarea{width:100%;border:1px solid #d8e8ef;border-radius:10px;padding:11px;font:inherit}.form textarea{min-height:100px;resize:vertical}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.form>button{justify-self:start;border:0;border-radius:10px;padding:11px 15px;background:#4DA8DA;color:#fff;display:flex;align-items:center;gap:7px;cursor:pointer}.passwordBox{display:flex;border:1px solid #d8e8ef;border-radius:10px;overflow:hidden}.passwordBox input{border:0}.passwordBox button{border:0;background:#fff;color:#54707d;padding:0 12px;cursor:pointer}.note{font-size:12px;color:#6F7F88}.error,.success,.warn{padding:12px 14px;border-radius:11px}.error{background:#fff0f0;color:#a94444}.success{background:#eaf8ef;color:#28794c}.warn{background:#fff5d9;color:#9a7015;font-weight:700}.form.highlight{outline:2px solid #f0c869;outline-offset:2px}@media(max-width:850px){.columns{grid-template-columns:1fr}.pair{grid-template-columns:1fr}.profileHero{align-items:flex-start}.avatar{width:90px;height:90px}}`}</style>
    <OtpModal open={otpModal.open} email={otpModal.email} purpose={otpModal.purpose} title={otpModal.title} onVerify={verifyProfileOtp} onClose={()=>setOtpModal({ open:false,email:"",purpose:"",title:"" })}/>
  </div></AppShell>;
}
