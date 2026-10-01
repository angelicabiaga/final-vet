import React, { useEffect, useRef, useState } from "react";
import { AtSign, Camera, Eye, EyeOff, KeyRound, Lock, LockKeyhole, Mail, MapPin, PencilLine, Phone, Save, UserCircle, UserRound, X } from "lucide-react";
import AppShell from "./AppShell";
import OtpModal from "./OtpModal";
import { confirmPasswordChange, confirmProfileEmailChange, getProfile, requestPasswordChange, requestProfileUpdate, updateProfile, uploadProfileAvatar } from "../services/profileService";
import PasswordChecklist from "./PasswordChecklist";
import {
  isValidPhMobile, INVALID_PH_MOBILE_MESSAGE, validateImageFile, validatePassword, validatePasswordsMatch,
  FIRST_NAME_REQUIRED_MESSAGE, LAST_NAME_REQUIRED_MESSAGE, sanitizePhoneInput,
} from "../utils/validators";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";

const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

function validateProfileField(name, value, isOwner) {
  switch (name) {
    case "firstName":
      return String(value || "").trim() ? "" : FIRST_NAME_REQUIRED_MESSAGE;
    case "lastName":
      return String(value || "").trim() ? "" : LAST_NAME_REQUIRED_MESSAGE;
    case "username":
      return String(value || "").trim() ? "" : "Username is required.";
    case "email": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Email is required.";
      if (!/^\S+@\S+\.\S+$/.test(trimmed)) return "Please enter a valid email address.";
      return "";
    }
    case "phone": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return isOwner ? "Contact number is required." : "";
      return isValidPhMobile(trimmed) ? "" : INVALID_PH_MOBILE_MESSAGE;
    }
    default:
      return "";
  }
}

function validatePasswordField(name, passwords) {
  switch (name) {
    case "current":
      return String(passwords.current || "") ? "" : "Current password is required.";
    case "next": {
      if (!String(passwords.next || "")) return "New password is required.";
      try { validatePassword(passwords.next); return ""; } catch (error) { return error.message; }
    }
    case "confirm": {
      if (!String(passwords.confirm || "")) return "Please confirm your new password.";
      try { validatePasswordsMatch(passwords.next, passwords.confirm); return ""; } catch (error) { return error.message; }
    }
    default:
      return "";
  }
}

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

// The saved profile (what the page shows) merged with a server update.
function applyUpdate(current, updated) {
  return { ...current, ...updated, ...splitFullName(updated?.full_name ?? joinFullName(current)) };
}

// A password input with its own show/hide toggle. Defined at module level:
// a component declared inside the page would be recreated on every
// keystroke, remounting the input and losing focus after each letter.
function PasswordInput({ label, value, visible, error, inputRef, autoComplete, onChange, onToggle }) {
  return (
    <label>
      <span>{label}<span className="required-mark"> *</span></span>
      <div className={`pfPassword${error ? " field-invalid" : ""}`}>
        <input ref={inputRef} type={visible ? "text" : "password"} value={value} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} required />
        <button type="button" onClick={onToggle} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
      {error && <span className="field-error-text">{error}</span>}
    </label>
  );
}

export default function UserProfileModule({ profile, title = "My Profile" }) {
  const forcePasswordChange = !!profile?.must_change_password;
  const isOwner = profile?.role === "pet_owner";

  // `saved` is what the page shows; `form` is only the draft while editing.
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [mode, setMode] = useState(forcePasswordChange ? "password" : "view");
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [otpModal, setOtpModal] = useState({ open: false, email: "", purpose: "", title: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});
  const detailFieldRefs = useRef({}).current;
  const passwordFieldRefs = useRef({}).current;
  const registerDetailFieldRef = (name) => (el) => { detailFieldRefs[name] = el; };

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await getProfile(profile.id);
        const values = {
          ...splitFullName(data.full_name), username: data.username || "", email: data.email || "",
          phone: data.phone || "", address: data.address || "", avatar_url: data.avatar_url || ""
        };
        if (active) { setSaved(values); setForm(values); }
      } catch (error) {
        if (active) setMessage({ type: "error", text: error.message });
      } finally { if (active) setLoading(false); }
    }
    if (profile?.id) load();
    return () => { active = false; };
  }, [profile?.id]);

  function openMode(next) {
    setMessage({ type: "", text: "" });
    setFieldErrors({});
    setPasswordFieldErrors({});
    setForm(saved);
    setPasswords(EMPTY_PASSWORDS);
    setShow({ current: false, next: false, confirm: false });
    setMode(next);
  }

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((current) => ({ ...current, [name]: validateProfileField(name, value, isOwner) }));
    }
  }

  async function saveDetails(event) {
    event.preventDefault(); setMessage({ type: "", text: "" });

    const errors = {};
    ["firstName", "lastName", "phone"].forEach((name) => {
      const errorMessage = validateProfileField(name, form[name], isOwner);
      if (errorMessage) errors[name] = errorMessage;
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage({ type: "error", text: "Please fix the highlighted field(s) before continuing." });
      focusFirstInvalidField(detailFieldRefs, errors);
      return;
    }

    setSaving(true);
    try {
      // Username and email can't be changed here; always send the saved ones.
      const result = await requestProfileUpdate(profile.id, { ...form, username: saved.username, email: saved.email, full_name: joinFullName(form) }, profile.role);
      if (result.requiresOtp) {
        setOtpModal({ open: true, email: result.email, purpose: "change_email", title: "Verify Email Change" });
        setMessage({ type: "success", text: "OTP sent to your new email address." });
      } else {
        setSaved(applyUpdate(form, result.updated));
        setMode("view");
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
      // Only the photo changes; unsaved edits in the form stay unsaved.
      const updated = await updateProfile(profile.id, { ...saved, full_name: joinFullName(saved), avatar_url }, profile.role);
      setSaved((current) => ({ ...current, avatar_url: updated.avatar_url }));
      setForm((current) => ({ ...current, avatar_url: updated.avatar_url }));
      setMessage({ type: "success", text: "Profile photo updated." });
    } catch (error) { setMessage({ type: "error", text: error.message }); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function savePassword(event) {
    event.preventDefault(); setMessage({ type: "", text: "" });

    const errors = {};
    ["current", "next", "confirm"].forEach((name) => {
      const errorMessage = validatePasswordField(name, passwords);
      if (errorMessage) errors[name] = errorMessage;
    });
    setPasswordFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage({ type: "error", text: "Please fix the highlighted field(s) before continuing." });
      focusFirstInvalidField(passwordFieldRefs, errors);
      return;
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
      setSaved(applyUpdate(form, updated));
      setMode("view");
      setMessage({ type: "success", text: "Email and profile updated successfully." });
    } else if (otpModal.purpose === "change_password") {
      await confirmPasswordChange(code);
      setPasswords(EMPTY_PASSWORDS);
      setPasswordFieldErrors({});
      setMode("view");
      setMessage({ type: "success", text: "Password changed successfully." });
    }
    setOtpModal({ open: false, email: "", purpose: "", title: "" });
  }

  function passwordField(name, value) {
    const next = { ...passwords, [name]: value };
    setPasswords(next);
    if (passwordFieldErrors[name] || (name === "next" && passwordFieldErrors.confirm)) {
      setPasswordFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors, [name]: validatePasswordField(name, next) };
        if (name === "next" && currentErrors.confirm) nextErrors.confirm = validatePasswordField("confirm", next);
        return nextErrors;
      });
    }
  }

  const passwordInput = (name, label, autoComplete) => (
    <PasswordInput
      label={label}
      value={passwords[name]}
      visible={show[name]}
      error={passwordFieldErrors[name]}
      inputRef={(el) => { passwordFieldRefs[name] = el; }}
      autoComplete={autoComplete}
      onChange={(value) => passwordField(name, value)}
      onToggle={() => setShow((current) => ({ ...current, [name]: !current[name] }))}
    />
  );

  const displayName = (saved && joinFullName(saved)) || profile?.full_name || "";
  const role = String(profile?.role || "").replaceAll("_", " ");
  const details = saved ? [
    { icon: UserRound, label: "Full name", value: joinFullName(saved) },
    { icon: AtSign, label: "Username", value: saved.username ? `@${saved.username}` : "" },
    { icon: Mail, label: "Email", value: saved.email },
    { icon: Phone, label: isOwner ? "Contact number" : "Phone number", value: saved.phone },
    { icon: MapPin, label: "Address", value: saved.address }
  ] : [];

  return <AppShell profile={profile} title={title}><div className="pf">
    {forcePasswordChange && <div className="warn">You're using a temporary password. Please set a new password to continue.</div>}
    {message.text && <div className={message.type}>{message.text}</div>}

    <section className="pfCard">
      <div className="pfBanner" aria-hidden="true" />
      <div className="pfIdentity">
        <div className="pfAvatar">
          <div className="pfAvatarImg">{saved?.avatar_url ? <img src={saved.avatar_url} alt="Profile" /> : <UserCircle size={64} />}</div>
          <label className="pfCamera" title="Change photo">
            <Camera size={15} />
            <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={chooseAvatar} disabled={uploading || !saved} />
          </label>
        </div>
        <h2>{displayName || "—"}</h2>
        {(saved?.username || profile?.username) && <p className="pfHandle">@{saved?.username || profile?.username}</p>}
        <span className="pfRole">{role}</span>
        {uploading && <small className="pfUploading">Uploading photo…</small>}
        {mode === "view" && !loading && (
          <div className="pfActions">
            <button type="button" className="pfBtn pfPrimary" onClick={() => openMode("edit")} disabled={!saved}><PencilLine size={17} /> Edit profile</button>
            <button type="button" className="pfBtn pfGhost" onClick={() => openMode("password")}><KeyRound size={17} /> Change password</button>
          </div>
        )}
      </div>

      <div className="pfBody">
        {loading ? <p className="pfMuted">Loading profile…</p> : mode === "view" ? (
          <dl className="pfDetails">
            {details.map(({ icon: Icon, label, value }) => (
              <div key={label} className="pfRow">
                <dt><Icon size={17} /> {label}</dt>
                <dd className={value ? "" : "pfEmpty"}>{value || "Not set"}</dd>
              </div>
            ))}
          </dl>
        ) : mode === "edit" ? (
          <form className="pfForm" onSubmit={saveDetails} noValidate>
            <h3><PencilLine size={19} /> Edit profile</h3>
            <div className="pfPair">
              <label><span>First name<span className="required-mark"> *</span></span><input ref={registerDetailFieldRef("firstName")} className={invalidClass(fieldErrors, "firstName")} value={form.firstName} onChange={(e) => field("firstName", e.target.value)} required />{fieldErrors.firstName && <span className="field-error-text">{fieldErrors.firstName}</span>}</label>
              <label><span>Last name<span className="required-mark"> *</span></span><input ref={registerDetailFieldRef("lastName")} className={invalidClass(fieldErrors, "lastName")} value={form.lastName} onChange={(e) => field("lastName", e.target.value)} required />{fieldErrors.lastName && <span className="field-error-text">{fieldErrors.lastName}</span>}</label>
            </div>
            <label><span>Middle name<span className="optional-mark"> (Optional)</span></span><input value={form.middleName} onChange={(e) => field("middleName", e.target.value)} /></label>
            <div className="pfPair">
              <label><span>Username</span><div className="pfLocked" title="Username can't be changed"><AtSign size={16} /><span>{saved.username || "—"}</span><Lock size={15} /></div></label>
              <label><span>Email</span><div className="pfLocked" title="Email can't be changed"><Mail size={16} /><span>{saved.email || "—"}</span><Lock size={15} /></div></label>
            </div>
            <label><span>{isOwner ? "Contact number" : "Phone number"}{isOwner ? <span className="required-mark"> *</span> : <span className="optional-mark"> (Optional)</span>}</span><input ref={registerDetailFieldRef("phone")} className={invalidClass(fieldErrors, "phone")} type="tel" inputMode="numeric" maxLength={11} value={form.phone} onChange={(e) => field("phone", sanitizePhoneInput(e.target.value))} placeholder="09XXXXXXXXX" required={isOwner} />{fieldErrors.phone && <span className="field-error-text">{fieldErrors.phone}</span>}</label>
            <label><span>Address<span className="optional-mark"> (Optional)</span></span><textarea value={form.address} onChange={(e) => field("address", e.target.value)} /></label>
            <p className="pfHint">Username and email can't be changed. Contact the clinic if they need updating.</p>
            <div className="pfFormActions">
              <button type="button" className="pfBtn pfGhost" onClick={() => openMode("view")} disabled={saving}><X size={17} /> Cancel</button>
              <button className="pfBtn pfPrimary" disabled={saving}><Save size={17} /> {saving ? "Saving…" : "Save changes"}</button>
            </div>
          </form>
        ) : (
          <form className={`pfForm${forcePasswordChange ? " pfHighlight" : ""}`} onSubmit={savePassword} noValidate>
            <h3><LockKeyhole size={19} /> Change password</h3>
            {passwordInput("current", "Current password", "current-password")}
            {passwordInput("next", "New password", "new-password")}
            <PasswordChecklist password={passwords.next} />
            {passwordInput("confirm", "Confirm new password", "new-password")}
            <p className="pfHint">We'll email you a code to confirm the change.</p>
            <div className="pfFormActions">
              {!forcePasswordChange && <button type="button" className="pfBtn pfGhost" onClick={() => openMode("view")} disabled={saving}><X size={17} /> Cancel</button>}
              <button className="pfBtn pfPrimary" disabled={saving}><LockKeyhole size={17} /> {saving ? "Sending code…" : "Update password"}</button>
            </div>
          </form>
        )}
      </div>
    </section>

    <style>{`
      .pf{max-width:760px;margin:0 auto;display:grid;gap:14px}
      .pfCard{background:#fff;border-radius:22px;box-shadow:0 12px 32px rgba(47,117,150,.1);overflow:hidden}
      .pfBanner{height:120px;background:linear-gradient(120deg,#1e5a8c 0%,#2c6ba3 35%,#4DA8DA 75%,#78c4ca 100%);position:relative}
      .pfBanner::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 18% 30%,rgba(255,255,255,.18) 0 60px,transparent 61px),radial-gradient(circle at 85% 70%,rgba(255,255,255,.12) 0 90px,transparent 91px)}
      .pfIdentity{display:grid;justify-items:center;text-align:center;padding:0 24px 22px;margin-top:-58px;position:relative}
      .pfAvatar{position:relative;width:116px;height:116px;margin-bottom:12px}
      .pfAvatarImg{width:100%;height:100%;border-radius:50%;overflow:hidden;background:#e6f6fc;color:#4DA8DA;display:grid;place-items:center;border:5px solid #fff;box-shadow:0 8px 22px rgba(20,73,94,.2)}
      .pfAvatarImg img{width:100%;height:100%;object-fit:cover;display:block}
      .pfCamera{position:absolute;right:4px;bottom:6px;width:34px;height:34px;border-radius:50%;background:#2c6ba3;color:#fff;display:grid;place-items:center;cursor:pointer;border:3px solid #fff;box-shadow:0 3px 8px rgba(20,73,94,.25);transition:transform .15s ease}
      .pfCamera:hover{transform:scale(1.08)}
      .pfCamera input{display:none}
      .pfIdentity h2{margin:0;font-size:24px;color:#1d3a4a;overflow-wrap:anywhere}
      .pfHandle{margin:4px 0 0;color:#6F7F88;font-weight:600}
      .pfRole{margin-top:10px;background:#e7f6fc;color:#267fa9;padding:6px 12px;border-radius:999px;text-transform:capitalize;font-size:12px;font-weight:800}
      .pfUploading{margin-top:8px;color:#2c6ba3;font-weight:700}
      .pfActions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:18px}
      .pfBtn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:11px 18px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;border:1px solid transparent;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}
      .pfBtn:disabled{opacity:.6;cursor:not-allowed}
      .pfPrimary{background:#2c6ba3;color:#fff;box-shadow:0 6px 16px rgba(44,107,163,.25)}
      .pfPrimary:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 10px 20px rgba(44,107,163,.32)}
      .pfGhost{background:#fff;color:#2c6ba3;border-color:#cfe4ed}
      .pfGhost:not(:disabled):hover{background:#f1f9fd}
      .pfBody{border-top:1px solid #edf3f6;padding:22px 28px 26px}
      .pfMuted{margin:0;color:#6F7F88;text-align:center}
      .pfDetails{margin:0;display:grid;gap:2px}
      .pfRow{display:grid;grid-template-columns:190px 1fr;gap:14px;align-items:center;padding:13px 4px;border-bottom:1px solid #f0f5f7}
      .pfRow:last-child{border-bottom:0}
      .pfRow dt{display:flex;align-items:center;gap:9px;color:#6F7F88;font-size:13px;font-weight:700}
      .pfRow dt svg{color:#4DA8DA}
      .pfRow dd{margin:0;color:#1d3a4a;font-weight:600;overflow-wrap:anywhere}
      .pfRow dd.pfEmpty{color:#a3b3ba;font-weight:500;font-style:italic}
      .pfForm{display:grid;gap:13px}
      .pfForm h3{display:flex;align-items:center;gap:8px;margin:0 0 4px;color:#1d3a4a}
      .pfForm label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#334e5a}
      .pfForm input,.pfForm textarea{width:100%;border:1px solid #d8e8ef;border-radius:11px;padding:11px 12px;font:inherit;background:#fbfeff}
      .pfForm input:focus,.pfForm textarea:focus{outline:none;border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(77,168,218,.18)}
      .pfForm textarea{min-height:90px;resize:vertical}
      .pfPair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .pfLocked{display:flex;align-items:center;gap:8px;min-height:44px;border:1px dashed #d3e2e8;border-radius:11px;padding:10px 12px;background:#f4f7f8;color:#5f7380;font-weight:600;cursor:not-allowed}
      .pfLocked span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pfLocked svg{flex-shrink:0;color:#9aa9b0}
      .pfPassword{display:flex;border:1px solid #d8e8ef;border-radius:11px;overflow:hidden;background:#fbfeff}
      .pfPassword:focus-within{border-color:#4DA8DA;box-shadow:0 0 0 3px rgba(77,168,218,.18)}
      .pfPassword input{border:0!important;box-shadow:none!important;background:transparent}
      .pfPassword button{border:0;background:transparent;color:#54707d;padding:0 13px;cursor:pointer}
      .pfHint{margin:0;font-size:12.5px;color:#6F7F88}
      .pfFormActions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:4px}
      .pfHighlight{outline:2px solid #f0c869;outline-offset:8px;border-radius:12px}
      .error,.success,.warn{padding:12px 14px;border-radius:11px}
      .error{background:#fff0f0;color:#a94444}.success{background:#eaf8ef;color:#28794c}.warn{background:#fff5d9;color:#9a7015;font-weight:700}
      @media(max-width:640px){.pfBody{padding:18px 16px 20px}.pfRow{grid-template-columns:1fr;gap:4px}.pfPair{grid-template-columns:1fr}.pfFormActions{justify-content:stretch}.pfFormActions .pfBtn{flex:1;justify-content:center}}
    `}</style>
    <OtpModal open={otpModal.open} email={otpModal.email} purpose={otpModal.purpose} title={otpModal.title} onVerify={verifyProfileOtp} onClose={() => setOtpModal({ open: false, email: "", purpose: "", title: "" })} />
  </div></AppShell>;
}
