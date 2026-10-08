import React, { useEffect, useRef, useState } from "react";
import { AtSign, Camera, Eye, EyeOff, KeyRound, Lock, LockKeyhole, Mail, Save, UserCircle, UserRound } from "lucide-react";
import AppShell from "./AppShell";
import OtpModal from "./OtpModal";
import { confirmPasswordChange, confirmProfileEmailChange, getProfile, requestPasswordChange, requestProfileUpdate, updateProfile, uploadProfileAvatar } from "../services/profileService";
import PasswordChecklist from "./PasswordChecklist";
import {
  isValidPhMobile, INVALID_PH_MOBILE_MESSAGE, validateImageFile, validatePassword, validatePasswordsMatch,
  FIRST_NAME_REQUIRED_MESSAGE, LAST_NAME_REQUIRED_MESSAGE, sanitizePhoneInput,
} from "../utils/validators";
import { focusFirstInvalidField, invalidClass } from "../utils/formValidation";
import { stripDrTitle, withDrTitle } from "../utils/vetName";

const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

function validateProfileField(name, value, isOwner) {
  switch (name) {
    case "firstName":
      return String(value || "").trim() ? "" : FIRST_NAME_REQUIRED_MESSAGE;
    case "lastName":
      return String(value || "").trim() ? "" : LAST_NAME_REQUIRED_MESSAGE;
    case "username": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Username is required.";
      return /^[a-z0-9_.-]{3,30}$/i.test(trimmed) ? "" : "Username must be 3–30 characters: letters, numbers, dots, dashes, or underscores.";
    }
    case "email": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return "Email is required.";
      if (!/^\S+@\S+\.\S+$/.test(trimmed)) return "Please enter a valid email address.";
      return "";
    }
    case "address":
      return String(value || "").trim() ? "" : "Address is required.";
    case "phone": {
      const trimmed = String(value || "").trim();
      if (!trimmed) return isOwner ? "Contact number is required." : "Phone number is required.";
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
      if (passwords.current && passwords.next === passwords.current) return "Your new password must be different from your current password.";
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

// "aldwin@gmail.com" -> "al****@gmail.com"
function maskEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}****@${domain}`;
}

// "Dr." is a title, not a first name: keep it out of the name fields and put
// it back on save only when the profile already stored it.
const titleOf = (fullName) => (stripDrTitle(fullName) !== String(fullName || "").trim() ? "Dr." : "");

function splitFullName(fullName) {
  const parts = stripDrTitle(fullName).split(/\s+/).filter(Boolean);
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

// `children` (e.g. the vet's Professional Information) render under the two
// panels, in the same page and styles.
export default function UserProfileModule({ profile, title = "My Profile", children }) {
  const forcePasswordChange = !!profile?.must_change_password;
  const isOwner = profile?.role === "pet_owner";
  const isVet = profile?.role === "veterinarian";
  const [nameTitle, setNameTitle] = useState("");
  const withTitle = (name) => (nameTitle && name ? `${nameTitle} ${name}` : name);

  // `saved` is what the page shows; `form` is only the draft while editing.
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [accountMeta, setAccountMeta] = useState({ status: "", createdAt: "" });
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
        if (active) {
          setNameTitle(titleOf(data.full_name));
          setSaved(values);
          setForm(values);
          setAccountMeta({ status: data.account_status || "", createdAt: data.created_at || "" });
        }
      } catch (error) {
        if (active) setMessage({ type: "error", text: error.message });
      } finally { if (active) setLoading(false); }
    }
    if (profile?.id) load();
    return () => { active = false; };
  }, [profile?.id]);

  function field(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((current) => ({ ...current, [name]: validateProfileField(name, value, isOwner) }));
    }
  }

  async function saveDetails(event) {
    event.preventDefault(); setMessage({ type: "", text: "" });

    const errors = {};
    ["firstName", "lastName", "username", "email", "phone", "address"].forEach((name) => {
      const errorMessage = validateProfileField(name, form[name], isOwner);
      if (errorMessage) errors[name] = errorMessage;
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setMessage({ type: "error", text: "Please fix the highlighted field(s) before continuing." });
      focusFirstInvalidField(detailFieldRefs, errors);
      return;
    }

    // Nothing edited: say so instead of saving (or emailing a code) for no reason.
    // Username and email compare case-insensitively, as they're stored lowercase.
    const sameText = (a, b, ignoreCase = false) => {
      const left = String(a || "").trim();
      const right = String(b || "").trim();
      return ignoreCase ? left.toLowerCase() === right.toLowerCase() : left === right;
    };
    const unchanged =
      ["firstName", "middleName", "lastName", "phone", "address"].every((name) => sameText(form[name], saved[name])) &&
      sameText(form.username, saved.username, true) &&
      sameText(form.email, saved.email, true);
    if (unchanged) {
      setMessage({ type: "warn", title: "No changes to save", text: "You haven't changed any of your personal information yet.", key: Date.now() });
      return;
    }

    setSaving(true);
    try {
      // A different email is only saved after the OTP sent to it is verified
      // (see requestProfileUpdate / confirmProfileEmailChange).
      const result = await requestProfileUpdate(profile.id, { ...form, username: form.username.trim(), email: form.email.trim(), full_name: withTitle(joinFullName(form)) }, profile.role);
      if (result.requiresOtp) {
        setOtpModal({ open: true, email: maskEmail(result.email), purpose: "change_email", title: "Verify Email Change" });
        setMessage({ type: "success", text: `We sent a 6-digit verification code to ${maskEmail(result.email)} to confirm this email change.` });
      } else {
        setSaved(applyUpdate(form, result.updated));
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
      const updated = await updateProfile(profile.id, { ...saved, full_name: withTitle(joinFullName(saved)), avatar_url }, profile.role);
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
      setMessage({ type: "success", text: "Email address updated successfully." });
    } else if (otpModal.purpose === "change_password") {
      await confirmPasswordChange(code);
      setPasswords(EMPTY_PASSWORDS);
      setPasswordFieldErrors({});
      setShow({ current: false, next: false, confirm: false });
      setMessage({ type: "success", title: "Password updated", text: "Your password was changed successfully. Use your new password the next time you log in.", key: Date.now() });
    }
    setOtpModal({ open: false, email: "", purpose: "", title: "" });
  }

  function passwordField(name, value) {
    const next = { ...passwords, [name]: value };
    setPasswords(next);
    if (passwordFieldErrors[name] || (name === "next" && passwordFieldErrors.confirm) || (name === "current" && passwordFieldErrors.next)) {
      setPasswordFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors, [name]: validatePasswordField(name, next) };
        if (name === "next" && currentErrors.confirm) nextErrors.confirm = validatePasswordField("confirm", next);
        if (name === "current" && currentErrors.next) nextErrors.next = validatePasswordField("next", next);
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

  const baseName = (saved && joinFullName(saved)) || stripDrTitle(profile?.full_name);
  const displayName = isVet ? withDrTitle(baseName) : withTitle(baseName);
  const role = String(profile?.role || "").replaceAll("_", " ");

  return <AppShell profile={profile} title={title}><div className="pf">
    {forcePasswordChange && <div className="warn">You're using a temporary password. Please set a new password to continue.</div>}
    {message.text && <div key={message.key || message.text} className={message.type} data-toast-title={message.title || undefined}>{message.text}</div>}

    {/* Account Overview: photo, name, email, role + account facts */}
    <section className="pfOverview">
      <header className="pfPanelHead">Account Overview</header>
      <div className="pfOverviewBody">
        <div className="pfAvatar">
          <div className="pfAvatarImg">{saved?.avatar_url ? <img src={saved.avatar_url} alt="Profile" /> : <UserCircle size={52} />}</div>
          <label className="pfCamera" title="Change photo">
            <Camera size={14} />
            <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={chooseAvatar} disabled={uploading || !saved} />
          </label>
        </div>
        <div className="pfIdentityText">
          <h2>{displayName || "—"}</h2>
          {(saved?.email || profile?.email) && <p className="pfEmailLine"><Mail size={15} /> {saved?.email || profile?.email}</p>}
          <div className="pfChips">
            <span className="pfRole">{role}</span>
            {(saved?.username || profile?.username) && <span className="pfChip">@{saved?.username || profile?.username}</span>}
          </div>
          {uploading && <small className="pfUploading">Uploading photo…</small>}
        </div>
        <div className="pfFacts">
          {accountMeta.status && (
            <div className="pfFact">
              <span>Account status</span>
              <strong className={accountMeta.status === "active" ? "pfActive" : "pfInactive"}>
                <i aria-hidden="true" />{accountMeta.status === "active" ? "Active" : "Inactive"}
              </strong>
            </div>
          )}
          {accountMeta.createdAt && (
            <div className="pfFact">
              <span>Member since</span>
              <strong>{new Date(accountMeta.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong>
            </div>
          )}
        </div>
      </div>
    </section>

    {loading || !form ? <p className="pfMuted">Loading profile…</p> : (
      <div className="pfGrid">
        {/* Personal Information */}
        <section className="pfPanel">
          <header className="pfPanelHead"><UserRound size={18} /> Personal Information</header>
          <form className="pfForm" onSubmit={saveDetails} noValidate>
            <div className="pfPair">
              <label><span>First name<span className="required-mark"> *</span></span><input ref={registerDetailFieldRef("firstName")} className={invalidClass(fieldErrors, "firstName")} value={form.firstName} onChange={(e) => field("firstName", e.target.value)} required />{fieldErrors.firstName && <span className="field-error-text">{fieldErrors.firstName}</span>}</label>
              <label><span>Last name<span className="required-mark"> *</span></span><input ref={registerDetailFieldRef("lastName")} className={invalidClass(fieldErrors, "lastName")} value={form.lastName} onChange={(e) => field("lastName", e.target.value)} required />{fieldErrors.lastName && <span className="field-error-text">{fieldErrors.lastName}</span>}</label>
            </div>
            <label><span>Middle name <em>(Optional)</em></span><input value={form.middleName} onChange={(e) => field("middleName", e.target.value)} /></label>
            <label><span>Email address<span className="required-mark"> *</span></span><div className={`pfInputIcon${fieldErrors.email ? " field-invalid" : ""}`}><Mail size={16} /><input ref={registerDetailFieldRef("email")} type="email" value={form.email} onChange={(e) => field("email", e.target.value.replace(/\s/g, ""))} autoComplete="email" required /></div>{fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}{form.email.trim().toLowerCase() !== String(saved.email || "").toLowerCase() && !fieldErrors.email && <small className="pfFieldNote">A verification code will be sent to your current email address to confirm this change.</small>}</label>
            <label><span>Username<span className="required-mark"> *</span></span><div className={`pfInputIcon${fieldErrors.username ? " field-invalid" : ""}`}><AtSign size={16} /><input ref={registerDetailFieldRef("username")} value={form.username} onChange={(e) => field("username", e.target.value.replace(/\s/g, ""))} maxLength={30} autoComplete="username" required /></div>{fieldErrors.username && <span className="field-error-text">{fieldErrors.username}</span>}</label>
            <label><span>{isOwner ? "Contact number" : "Phone number"}<span className="required-mark"> *</span></span><input ref={registerDetailFieldRef("phone")} className={invalidClass(fieldErrors, "phone")} type="tel" inputMode="numeric" maxLength={11} value={form.phone} onChange={(e) => field("phone", sanitizePhoneInput(e.target.value))} placeholder="09XXXXXXXXX" required />{fieldErrors.phone && <span className="field-error-text">{fieldErrors.phone}</span>}</label>
            <label><span>Address<span className="required-mark"> *</span></span><input ref={registerDetailFieldRef("address")} className={invalidClass(fieldErrors, "address")} value={form.address} onChange={(e) => field("address", e.target.value)} placeholder="House no., street, city" autoComplete="street-address" required />{fieldErrors.address && <span className="field-error-text">{fieldErrors.address}</span>}</label>
            <label><span>Role</span><div className="pfLocked pfRoleField"><span>{role || "—"}</span><Lock size={15} /></div></label>
            <button className="pfSubmit" disabled={saving}><Save size={17} /> {saving ? "Saving…" : "Save Changes"}</button>
          </form>
        </section>

        {/* Change Password */}
        <section className={`pfPanel${forcePasswordChange ? " pfHighlight" : ""}`}>
          <header className="pfPanelHead"><LockKeyhole size={18} /> Change Password</header>
          <form className="pfForm" onSubmit={savePassword} noValidate>
            <div className="pfNote"><KeyRound size={16} /> An OTP will be sent to your email for verification.</div>
            {passwordInput("current", "Current password", "current-password")}
            {passwordInput("next", "New password", "new-password")}
            <PasswordChecklist password={passwords.next} />
            {passwordInput("confirm", "Confirm new password", "new-password")}
            <button className="pfSubmit" disabled={saving}><LockKeyhole size={17} /> {saving ? "Sending code…" : "Update Password"}</button>
          </form>
        </section>
      </div>
    )}

    {!loading && form && children}

    <style>{`
      .pf{width:100%;display:grid;gap:18px}

      /* Identity card */
      /* Account Overview card: blue header bar, white body. */
      .pfOverview{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 28px rgba(47,117,150,.09);border:1px solid #e6f0f4}
      .pfOverviewBody{display:flex;align-items:center;gap:22px;padding:22px 26px}
      .pfAvatar{position:relative;width:84px;height:84px;flex-shrink:0}
      .pfAvatarImg{width:100%;height:100%;border-radius:50%;overflow:hidden;background:#e6f6fc;color:#4DA8DA;display:grid;place-items:center;border:3px solid #d6ebf5;box-shadow:0 6px 16px rgba(20,73,94,.14)}
      .pfAvatarImg img{width:100%;height:100%;object-fit:cover;display:block}
      .pfCamera{position:absolute;right:-2px;bottom:0;width:30px;height:30px;border-radius:50%;background:#2c6ba3;color:#fff;display:grid;place-items:center;cursor:pointer;border:3px solid #fff;box-shadow:0 3px 8px rgba(20,73,94,.25);transition:transform .15s ease}
      .pfCamera:hover{transform:scale(1.08)}
      .pfCamera input{display:none}
      .pfIdentityText{flex:1;display:grid;gap:6px;justify-items:start;min-width:0}
      .pfIdentityText h2{margin:0;font-size:22px;color:#1d3a4a;overflow-wrap:anywhere}
      .pfEmailLine{display:flex;align-items:center;gap:7px;margin:0;color:#5f7884;font-size:14px;overflow-wrap:anywhere}
      .pfEmailLine svg{flex-shrink:0;color:#8197a2}
      .pfChips{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
      .pfRole{background:#e7f6fc;color:#267fa9;padding:5px 12px;border-radius:999px;text-transform:capitalize;font-size:12px;font-weight:800}
      .pfChip{background:#fff;color:#2f4a56;border:1px solid #d6e7ee;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:700}
      .pfUploading{color:#2c6ba3;font-weight:700}
      .pfFacts{display:grid;gap:10px;flex-shrink:0}
      .pfFact{display:grid;gap:3px;justify-items:end;min-width:170px;padding:11px 16px;border-radius:14px;background:#f4fafd;border:1px solid #d6ebf5;text-align:right}
      .pfFact span{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5f7884}
      .pfFact strong{display:flex;align-items:center;gap:7px;color:#1d3a4a;font-size:15px}
      .pfFact strong i{width:8px;height:8px;border-radius:50%;background:currentColor}
      .pfFact .pfActive{color:#2c7fb8}
      .pfFact .pfInactive{color:#9aa9b0}
      .pfMuted{margin:0;color:#6F7F88;text-align:center}

      /* Two cards */
      .pfGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:start}
      .pfPanel{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 28px rgba(47,117,150,.09);border:1px solid #e6f0f4}
      .pfPanelHead{display:flex;align-items:center;gap:9px;padding:18px 26px;background:linear-gradient(115deg,#2c7fb8,#1f5f8f);color:#fff;font-size:17px;font-weight:800}
      /* Only the Account Overview header uses the profile banner colors. */
      .pfOverview .pfPanelHead{position:relative;overflow:hidden;background:radial-gradient(circle at 12% 20%,rgba(255,255,255,.18) 0 46px,transparent 47px),radial-gradient(circle at 92% 115%,rgba(255,255,255,.16) 0 78px,transparent 79px),linear-gradient(120deg,#1e5a8c 0%,#2c6ba3 35%,#4DA8DA 75%,#78c4ca 100%)}
      .pfForm{display:grid;gap:15px;padding:24px 26px 26px}
      .pfForm label{display:grid;gap:7px}
      .pfForm label>span:first-child{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#2c6b8a}
      .pfForm label>span:first-child em{font-style:normal;font-weight:600;letter-spacing:0;text-transform:none;color:#8197a2}
      .pfForm input,.pfForm textarea{width:100%;box-sizing:border-box;border:1px solid #d6e7ee;border-radius:12px;padding:12px 14px;font:inherit;font-size:15px;color:#1d3a4a;background:#fbfeff}
      .pfForm input:focus,.pfForm textarea:focus{outline:none;border-color:#4DA8DA;background:#fff;box-shadow:0 0 0 3px rgba(77,168,218,.16)}
      .pfForm textarea{min-height:84px;resize:vertical}
      .pfPair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .pfLocked{display:flex;align-items:center;gap:9px;min-height:46px;box-sizing:border-box;border:1px solid #e3ecf0;border-radius:12px;padding:10px 14px;background:#f2f5f7;color:#5f7380;font-weight:600;cursor:not-allowed}
      .pfLocked span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pfLocked svg{flex-shrink:0;color:#9aa9b0}
      .pfRoleField span{text-transform:capitalize}
      .pfFieldNote{color:#2c7fb8;font-size:12.5px;font-weight:600}
      .pfInputIcon{display:flex;align-items:center;gap:8px;padding-left:14px;border:1px solid #d6e7ee;border-radius:12px;background:#fbfeff;color:#8197a2}
      .pfInputIcon:focus-within{border-color:#4DA8DA;background:#fff;box-shadow:0 0 0 3px rgba(77,168,218,.16)}
      .pfInputIcon.field-invalid{border-color:#e05b5b}
      .pfForm .pfInputIcon input{border:0!important;box-shadow:none!important;background:transparent!important;padding-left:0}
      .pfPassword{display:flex;border:1px solid #d6e7ee;border-radius:12px;overflow:hidden;background:#fbfeff}
      .pfPassword:focus-within{border-color:#4DA8DA;background:#fff;box-shadow:0 0 0 3px rgba(77,168,218,.16)}
      .pfPassword input{border:0!important;box-shadow:none!important;background:transparent}
      .pfPassword button{border:0;background:transparent;color:#54707d;padding:0 14px;cursor:pointer}
      .pfNote{display:flex;align-items:center;gap:9px;padding:13px 16px;border-radius:12px;background:#eef8fc;border:1px solid #d6ebf5;color:#2c6b8a;font-size:13.5px;font-weight:600}
      .pfHint{margin:-4px 0 0;font-size:12.5px;color:#6F7F88}
      .pfSubmit{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:4px;padding:14px 18px;border:0;border-radius:999px;background:linear-gradient(115deg,#2c7fb8,#1f5f8f);color:#fff;font:inherit;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 8px 18px rgba(44,127,184,.25);transition:transform .15s ease,box-shadow .15s ease}
      .pfSubmit:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 12px 24px rgba(44,127,184,.32)}
      .pfSubmit:disabled{opacity:.6;cursor:not-allowed}
      .pfHighlight{outline:3px solid #f0c869;outline-offset:3px}

      .error,.success,.warn{padding:12px 14px;border-radius:11px}
      .error{background:#fff0f0;color:#a94444}.success{background:#eaf8ef;color:#28794c}.warn{background:#fff5d9;color:#9a7015;font-weight:700}
      @media(max-width:900px){.pfGrid{grid-template-columns:1fr}}
      @media(max-width:700px){.pfOverviewBody{flex-wrap:wrap}.pfFacts{width:100%;grid-template-columns:1fr 1fr}.pfFact{min-width:0;justify-items:start;text-align:left}}
      @media(max-width:560px){.pfOverviewBody{flex-direction:column;text-align:center}.pfIdentityText{justify-items:center}.pfChips{justify-content:center}.pfForm{padding:20px 18px 22px}.pfPanelHead{padding:16px 18px}.pfPair{grid-template-columns:1fr}}
    `}</style>
    <OtpModal open={otpModal.open} email={otpModal.email} purpose={otpModal.purpose} title={otpModal.title} onVerify={verifyProfileOtp} onClose={() => {
      // Cancelled: nothing was saved, so show the current email again.
      if (otpModal.purpose === "change_email" && saved) {
        setForm((current) => ({ ...current, email: saved.email }));
        setMessage({ type: "", text: "" });
      }
      setOtpModal({ open: false, email: "", purpose: "", title: "" });
    }} />
  </div></AppShell>;
}
